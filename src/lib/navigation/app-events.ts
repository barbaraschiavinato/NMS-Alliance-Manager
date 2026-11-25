// Window events the client dispatches when data shown elsewhere (mostly sidebar counters) changes.

export const appEvents = [
  "farms-changed",
  "pets-changed",
  "taxi-requests-changed",
  "help-requests-changed",
  "messages-unread-changed",
  "planet-count-changed",
] as const;

export type AppEvent = (typeof appEvents)[number];

/** The change event of a broadcast board ("help" or "taxi"). */
export function broadcastRequestsEvent(kind: "help" | "taxi"): AppEvent {
  return kind === "taxi" ? "taxi-requests-changed" : "help-requests-changed";
}

export function dispatchAppEvent(name: AppEvent): void {
  window.dispatchEvent(new Event(name));
}

/** Listens to one or more app events; returns the function that removes the listeners. */
export function onAppEvent(names: AppEvent | readonly AppEvent[], handler: () => void): () => void {
  const list: readonly AppEvent[] = typeof names === "string" ? [names] : names;
  for (const name of list) window.addEventListener(name, handler);
  return () => {
    for (const name of list) window.removeEventListener(name, handler);
  };
}
