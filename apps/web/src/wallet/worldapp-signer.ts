import { MiniKit } from "@worldcoin/minikit-js";
import type { Hex, UniversalSigner } from "./universal-signer";

export class WorldAppSigner implements UniversalSigner {
  kind = "worldapp" as const;

  constructor(private readonly address: Hex) {}

  async getAddress(): Promise<Hex> {
    return this.address;
  }

  async signMessage(message: string): Promise<Hex> {
    const result = (await MiniKit.signMessage({ message })) as {
      data:
        | { status: "success"; signature: string }
        | { status: "error"; error_code: string };
    };

    if (result.data.status === "error") {
      throw new Error(
        `World App message signing failed: ${result.data.error_code}`,
      );
    }

    return result.data.signature as Hex;
  }

  async signTypedData<TTypedData extends Record<string, unknown>>(
    typedData: TTypedData,
  ): Promise<Hex> {
    const result = (await MiniKit.signTypedData(
      typedData as unknown as Parameters<typeof MiniKit.signTypedData>[0],
    )) as {
      data:
        | { error_code: string }
        | {
            signature: string;
          };
    };

    if ("error_code" in result.data) {
      throw new Error(`World App typed-data signing failed: ${result.data.error_code}`);
    }

    return result.data.signature as Hex;
  }
}
