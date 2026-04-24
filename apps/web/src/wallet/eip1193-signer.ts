import { bytesToHex, stringToBytes } from "viem";
import type { Hex, UniversalSigner } from "./universal-signer";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class Eip1193Signer implements UniversalSigner {
  kind = "eip1193" as const;

  constructor(
    private readonly provider: Eip1193Provider,
    private readonly address: Hex,
  ) {}

  async getAddress(): Promise<Hex> {
    return this.address;
  }

  getProvider(): Eip1193Provider {
    return this.provider;
  }

  async signMessage(message: string): Promise<Hex> {
    const signature = await this.provider.request({
      method: "personal_sign",
      params: [bytesToHex(stringToBytes(message)), this.address],
    });

    return signature as Hex;
  }

  async signTypedData<TTypedData extends Record<string, unknown>>(
    typedData: TTypedData,
  ): Promise<Hex> {
    const signature = await this.provider.request({
      method: "eth_signTypedData_v4",
      params: [this.address, JSON.stringify(typedData)],
    });

    return signature as Hex;
  }
}
