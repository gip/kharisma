import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "./messages";

export const LOCALE_STORAGE_KEY = "kharisma.lang";

function isSupported(value: string | null | undefined): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

function primarySubtag(tag: string): string {
  const sep = tag.indexOf("-");
  const primary = sep === -1 ? tag : tag.slice(0, sep);
  return primary.toLowerCase();
}

export type DetectInputs = {
  storedLocale: string | null;
  navigatorLanguages: readonly string[];
};

export function pickLocale(inputs: DetectInputs): Locale {
  if (isSupported(inputs.storedLocale)) {
    return inputs.storedLocale;
  }

  for (const tag of inputs.navigatorLanguages) {
    if (!tag) continue;
    const candidate = primarySubtag(tag);
    if (isSupported(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_LOCALE;
}

export function detectLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  let storedLocale: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    storedLocale = null;
  }

  const nav = window.navigator;
  const languages: readonly string[] =
    Array.isArray(nav?.languages) && nav.languages.length > 0
      ? nav.languages
      : nav?.language
        ? [nav.language]
        : [];

  return pickLocale({ storedLocale, navigatorLanguages: languages });
}
