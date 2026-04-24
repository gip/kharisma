import { describe, expect, it } from "vitest";
import { pickLocale } from "./detect";

describe("pickLocale", () => {
  it("uses the stored locale when supported", () => {
    expect(
      pickLocale({
        storedLocale: "ko",
        navigatorLanguages: ["en-US"],
      }),
    ).toBe("ko");
  });

  it("ignores stored locales that aren't supported", () => {
    expect(
      pickLocale({
        storedLocale: "fr",
        navigatorLanguages: ["pt-BR"],
      }),
    ).toBe("pt");
  });

  it("matches the first supported navigator language by primary subtag", () => {
    expect(
      pickLocale({
        storedLocale: null,
        navigatorLanguages: ["fr-FR", "es-419", "en"],
      }),
    ).toBe("es");
  });

  it("falls back to en when nothing matches", () => {
    expect(
      pickLocale({
        storedLocale: null,
        navigatorLanguages: ["fr-FR", "de-DE"],
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
