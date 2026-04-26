import { en, type Messages, type MessageKey } from "./en";
import { es } from "./es";
import { pt } from "./pt";
import { ko } from "./ko";
import { ja } from "./ja";

export const SUPPORTED_LOCALES = ["en", "es", "pt", "ko", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const MESSAGES: Record<Locale, Messages> = {
  en,
  es,
  pt,
  ko,
  ja,
};

export const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  ko: "한국어",
  ja: "日本語",
};

export type { Messages, MessageKey };
