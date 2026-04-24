import { IdentifierKind, type Signer } from "@xmtp/node-sdk";
import { type Hex, hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Build an XMTP `Signer` backed by a local viem EOA loaded from a hex
 * private key. Suitable for headless, server-owned identities where no
 * external wallet/signing broker exists.
 */
export function localSignerFromHex(privateKeyHex: Hex): {
  signer: Signer;
  address: `0x${string}`;
} {
  const account = privateKeyToAccount(privateKeyHex);

  const signer: Signer = {
    type: "EOA",
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signatureHex = await account.signMessage({ message });
      return hexToBytes(signatureHex);
    },
  };

  return { signer, address: account.address };
}
