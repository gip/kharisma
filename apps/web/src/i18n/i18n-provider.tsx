"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { detectLocale, LOCALE_STORAGE_KEY } from "./detect";
import {
  DEFAULT_LOCALE,
  MESSAGES,
  type Locale,
  type MessageKey,
} from "./messages";

type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

function makeTranslator(locale: Locale): Translator {
  const active = MESSAGES[locale];
  const fallback = MESSAGES[DEFAULT_LOCALE];
  return (key, vars) => {
    const template = active[key] ?? fallback[key] ?? key;
    return format(template, vars);
  };
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Detect on mount (client only) — keeps SSR output stable as English.
  useEffect(() => {
    const next = detectLocale();
    if (next !== locale) {
      setLocaleState(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect the active locale on <html lang="...">.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // ignore storage errors (private mode, etc.)
      }
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: makeTranslator(locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}

export function useT(): Translator {
  return useI18n().t;
}
