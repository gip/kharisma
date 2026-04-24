import { buildChallengeMessage } from "./challenge.js";

describe("buildChallengeMessage", () => {
  it("renders a stable challenge payload", () => {
    expect(
      buildChallengeMessage({
        appOrigin: "http://localhost:3000",
        walletAddress: "0x1111111111111111111111111111111111111111",
        chainId: 8453,
        loginMethod: "metamask",
        nonce: "nonce-1",
        challengeId: "challenge-1",
        issuedAt: "2026-04-09T12:00:00.000Z",
        expiresAt: "2026-04-09T12:05:00.000Z",
      }),
    ).toContain("Nonce: nonce-1");
  });
});
