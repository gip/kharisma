export function buildChallengeMessage(input: {
  appOrigin: string;
  walletAddress: `0x${string}`;
  chainId: number | null;
  loginMethod: string;
  nonce: string;
  challengeId: string;
  issuedAt: string;
  expiresAt: string;
}) {
  return [
    "Kharisma wants you to sign in with your Ethereum account:",
    input.walletAddress,
    "",
    "Authorize the backend to act on your behalf for XMTP messaging.",
    "",
    `URI: ${input.appOrigin}`,
    "Version: 1",
    `Chain ID: ${input.chainId ?? 1}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
    `Request ID: ${input.challengeId}`,
    `Login Method: ${input.loginMethod}`,
  ].join("\n");
}
