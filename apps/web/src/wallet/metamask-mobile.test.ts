import {
  isLikelyMobileBrowser,
} from "./metamask-mobile";

describe("metamask mobile helpers", () => {
  it("marks iPhone and Android user agents as mobile", () => {
    expect(
      isLikelyMobileBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ),
    ).toBe(true);
    expect(
      isLikelyMobileBrowser("Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro)"),
    ).toBe(true);
    expect(
      isLikelyMobileBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"),
    ).toBe(false);
  });

});
