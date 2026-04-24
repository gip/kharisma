import { IdentifierKind, type Signer } from "@xmtp/node-sdk";
import type { UserRecord } from "../storage/database.js";
import type { SignatureRequestBroker } from "./signature-broker.js";

export class RemoteWalletSigner {
  constructor(
    private readonly user: UserRecord,
    private readonly signatureBroker: SignatureRequestBroker,
  ) {}

  async createSigner(): Promise<Signer> {
    const getIdentifier = () => ({
      identifier: this.user.walletAddress.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    });

    const signMessage = async (message: string) => {
      const result = await this.signatureBroker.requestSignature({
        user: this.user,
        purpose: "xmtp-client",
        message,
      });

      return result.signatureBytes;
    };

    if (this.user.walletAccountType === "SCW" && typeof this.user.walletChainId === "number") {
      return {
        type: "SCW",
        getIdentifier,
        signMessage,
        getChainId: () => BigInt(this.user.walletChainId ?? 1),
      };
    }

    return {
      type: "EOA",
      getIdentifier,
      signMessage,
    };
  }
}
