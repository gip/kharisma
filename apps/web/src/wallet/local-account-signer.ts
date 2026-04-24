import type { PrivateKeyAccount } from "viem/accounts";
import type { Hex, UniversalSigner } from "./universal-signer";

export class LocalAccountSigner implements UniversalSigner {
  kind = "local-account" as const;

  constructor(private readonly account: PrivateKeyAccount) {}

  async getAddress(): Promise<Hex> {
    return this.account.address;
  }

  async signMessage(message: string): Promise<Hex> {
    return this.account.signMessage({ message });
  }

  async signTypedData<TTypedData extends Record<string, unknown>>(
    typedData: TTypedData,
  ): Promise<Hex> {
    return this.account.signTypedData(typedData as never);
  }
}
