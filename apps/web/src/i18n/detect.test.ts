import { describe, expect, it } from "vitest";
import { pickLocale } from "./detect";

describe("pickLocale", () => {
  it("uses the stored locale when supported", () => {
    expect(
      pickLocale({
        storedLocale: "ja",
        navigatorLanguages: ["en-US"],
      }),
    ).toBe("ja");
  });

  it("ignores stored locales that aren't supported", () => {
    expect(
      pickLocale({
        storedLocale: "de",
        navigatorLanguages: ["pt-BR"],
      }),
    ).toBe("pt");
  });

  it("matches the first supported navigator language by primary subtag", () => {
    expect(
      pickLocale({
        storedLocale: null,
        navigatorLanguages: ["de-DE", "ja-JP", "es-419", "en"],
      }),
    ).toBe("ja");
  });

  it("falls back to en when nothing matches", () => {
    expect(
      pickLocale({
        storedLocale: null,
        navigatorLanguages: ["de-DE", "it-IT"],
      }),
    ).toBe("en");
  });

  it("falls back to en when nothing is provided", () => {
    expect(
      pickLocale({
        storedLocale: null,
        navigatorLanguages: [],
      }),
    ).toBe("en");
  });
});
