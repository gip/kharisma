import { en, type Messages, type MessageKey } from "./en";
import { es } from "./es";
import { pt } from "./pt";
import { ko } from "./ko";

export const SUPPORTED_LOCALES = ["en", "es", "pt", "ko"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const MESSAGES: Record<Locale, Messages> = {
  en,
  es,
  pt,
  ko,
};

export const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  ko: "한국어",
};

export type { Messages, MessageKey };
