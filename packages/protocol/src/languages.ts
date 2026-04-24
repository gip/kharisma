export const ISO_639_1_LANGUAGE_CODES = [
  "aa",
  "ab",
  "ae",
  "af",
  "ak",
  "am",
  "an",
  "ar",
  "as",
  "av",
  "ay",
  "az",
  "ba",
  "be",
  "bg",
  "bi",
  "bm",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "ce",
  "ch",
  "co",
  "cr",
  "cs",
  "cu",
  "cv",
  "cy",
  "da",
  "de",
  "dv",
  "dz",
  "ee",
  "el",
  "en",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "ff",
  "fi",
  "fj",
  "fo",
  "fr",
  "fy",
  "ga",
  "gd",
  "gl",
  "gn",
  "gu",
  "gv",
  "ha",
  "he",
  "hi",
  "ho",
  "hr",
  "ht",
  "hu",
  "hy",
  "hz",
  "ia",
  "id",
  "ie",
  "ig",
  "ii",
  "ik",
  "io",
  "is",
  "it",
  "iu",
  "ja",
  "jv",
  "ka",
  "kg",
  "ki",
  "kj",
  "kk",
  "kl",
  "km",
  "kn",
  "ko",
  "kr",
  "ks",
  "ku",
  "kv",
  "kw",
  "ky",
  "la",
  "lb",
  "lg",
  "li",
  "ln",
  "lo",
  "lt",
  "lu",
  "lv",
  "mg",
  "mh",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "na",
  "nb",
  "nd",
  "ne",
  "ng",
  "nl",
  "nn",
  "no",
  "nr",
  "nv",
  "ny",
  "oc",
  "oj",
  "om",
  "or",
  "os",
  "pa",
  "pi",
  "pl",
  "ps",
  "pt",
  "qu",
  "rm",
  "rn",
  "ro",
  "ru",
  "rw",
  "sa",
  "sc",
  "sd",
  "se",
  "sg",
  "si",
  "sk",
  "sl",
  "sm",
  "sn",
  "so",
  "sq",
  "sr",
  "ss",
  "st",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "ti",
  "tk",
  "tl",
  "tn",
  "to",
  "tr",
  "ts",
  "tt",
  "tw",
  "ty",
  "ug",
  "uk",
  "ur",
  "uz",
  "ve",
  "vi",
  "vo",
  "wa",
  "wo",
  "xh",
  "yi",
  "yo",
  "za",
  "zh",
  "zu",
] as const;

export type GroupLanguageCode = (typeof ISO_639_1_LANGUAGE_CODES)[number];

const ISO_639_1_LANGUAGE_CODE_SET = new Set<string>(
  ISO_639_1_LANGUAGE_CODES,
);

export function isGroupLanguageCode(
  value: unknown,
): value is GroupLanguageCode {
  return (
    typeof value === "string" && ISO_639_1_LANGUAGE_CODE_SET.has(value)
  );
}

export function normalizeGroupLanguageCode(
  value: unknown,
): GroupLanguageCode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    return null;
  }

  return isGroupLanguageCode(normalized) ? normalized : null;
}

export function normalizeGroupLanguages(
  value: unknown,
): GroupLanguageCode[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const selected = new Set<GroupLanguageCode>();
  for (const item of value) {
    const normalized = normalizeGroupLanguageCode(item);
    if (!normalized) {
      return null;
    }
    selected.add(normalized);
  }

  return ISO_639_1_LANGUAGE_CODES.filter((code) => selected.has(code));
}

export function hasGroupLanguageOverlap(
  groupLanguages: readonly GroupLanguageCode[],
  requestedLanguages: readonly GroupLanguageCode[],
): boolean {
  if (requestedLanguages.length === 0) {
    return true;
  }

  const groupLanguageSet = new Set(groupLanguages);
  return requestedLanguages.some((language) => groupLanguageSet.has(language));
}
