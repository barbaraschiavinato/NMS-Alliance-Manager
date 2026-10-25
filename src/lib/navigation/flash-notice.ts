import { useCallback, useSyncExternalStore } from "react";

const storageKey = "nms-flash-notice";
const maxAgeMs = 15_000;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readFlashNotice(): string {
  try {
    const [timestamp, ...message] = (window.sessionStorage.getItem(storageKey) ?? "").split("|");
    return Date.now() - Number(timestamp) < maxAgeMs ? message.join("|") : "";
  } catch {
    return "";
  }
}

// A short-lived message that survives a client-side navigation to another page, e.g. "Mission created".
export function setFlashNotice(message: string) {
  try {
    window.sessionStorage.setItem(storageKey, `${Date.now()}|${message}`);
  } catch {
    // Without session storage the message is simply not shown.
  }
  notify();
}

export function useFlashNotice(): readonly [string, () => void] {
  const message = useSyncExternalStore(subscribe, readFlashNotice, () => "");
  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Nothing stored, nothing to dismiss.
    }
    notify();
  }, []);
  return [message, dismiss];
}
