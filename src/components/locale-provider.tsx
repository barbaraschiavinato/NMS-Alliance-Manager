"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { translate, translateAlmanacValue, type Locale } from "@/lib/translations";

type LocaleContextValue = Readonly<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (message: string, values?: Readonly<Record<string, string | number>>) => string;
  tv: (value: string) => string;
  systemLabel: (mission: { system: string; systemLabelFromAlmanac?: boolean }) => string;
}>;

const preferenceKey = "nms-alliance-locale";
const LocaleContext = createContext<LocaleContextValue | null>(null);
const localeListeners = new Set<() => void>();

function subscribeToLocale(listener: () => void) {
  localeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    localeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function currentBrowserLocale(): Locale {
  const savedLocale = window.localStorage.getItem(preferenceKey);
  return savedLocale === "en" || savedLocale === "it" ? savedLocale : browserLocale();
}

function serverLocale(): Locale {
  return "it";
}

function browserLocale(): Locale {
  return navigator.languages.some((language) => language.toLowerCase().startsWith("en")) ? "en" : "it";
}

export function LocaleProvider({ children }: Readonly<{ children: ReactNode }>) {
  const locale = useSyncExternalStore(subscribeToLocale, currentBrowserLocale, serverLocale);

  function setLocale(nextLocale: Locale) {
    window.localStorage.setItem(preferenceKey, nextLocale);
    document.documentElement.lang = nextLocale;
    for (const listener of localeListeners) listener();
  }

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (message, values) => translate(locale, message, values),
    tv: (value) => translateAlmanacValue(locale, value),
    systemLabel: ({ system, systemLabelFromAlmanac }) => systemLabelFromAlmanac
      ? system.split(" · ").map((part) => translateAlmanacValue(locale, part)).join(" · ")
      : system,
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
