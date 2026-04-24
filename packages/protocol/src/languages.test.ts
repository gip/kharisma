import { describe, expect, it } from "vitest";
import {
  ISO_639_1_LANGUAGE_CODES,
  hasGroupLanguageOverlap,
  isGroupLanguageCode,
  normalizeGroupLanguageCode,
  normalizeGroupLanguages,
} from "./languages.js";

describe("ISO 639-1 group languages", () => {
  it("accepts current ISO 639-1 codes beyond the initial frontend subset", () => {
    expect(isGroupLanguageCode("zu")).toBe(true);
    expect(isGroupLanguageCode("ar")).toBe(true);
    expect(ISO_639_1_LANGUAGE_CODES).toContain("en");
  });

  it("normalizes uppercase input to lowercase", () => {
    expect(normalizeGroupLanguageCode("EN")).toBe("en");
    expect(normalizeGroupLanguageCode(" Ko ")).toBe("ko");
    expect(normalizeGroupLanguages(["FR", "en", "fr"])).toEqual([
      "en",
      "fr",
    ]);
  });

  it("rejects empty, unknown, regional, and script tags", () => {
    expect(normalizeGroupLanguageCode("")).toBeNull();
    expect(normalizeGroupLanguageCode("xx")).toBeNull();
    expect(normalizeGroupLanguageCode("pt-BR")).toBeNull();
    expect(normalizeGroupLanguageCode("zh-Hans")).toBeNull();
    expect(normalizeGroupLanguages(["en", "pt-BR"])).toBeNull();
  });

  it("checks language overlap with empty filters matching all groups", () => {
    expect(hasGroupLanguageOverlap(["en"], [])).toBe(true);
    expect(hasGroupLanguageOverlap(["en", "fr"], ["ko", "fr"])).toBe(true);
    expect(hasGroupLanguageOverlap(["en"], ["ko", "fr"])).toBe(false);
  });
});
