import { createPublicClient, http, type Client } from "viem";
import { worldchain } from "viem/chains";
import { verifySiweMessage } from "@worldcoin/minikit-js/siwe";

/**
 * Statement shown to the user inside the World App SIWE consent screen.
 * Must match the `statement` passed to `MiniKit.walletAuth` on the client
 * exactly — the SDK's verifier rejects mismatched statements.
 */
export const WORLD_APP_SIWE_STATEMENT = "Sign in to Kharisma";

export type SiwePayload = {
  address: `0x${string}`;
  message: string;
  signature: `0x${string}`;
};

export type SiweVerificationResult = {
  address?: `0x${string}`;
  isValid: boolean;
  error?: string;
  chainId: number;
};

export interface SiweVerifierLike {
  verify(payload: SiwePayload, nonce: string, statement: string): Promise<SiweVerificationResult>;
}

export class WorldAppSiweVerifier implements SiweVerifierLike {

  constructor(rpcUrl: string | undefined) {
  }

  async verify(
    payload: SiwePayload,
    nonce: string,
    statement: string,
  ): Promise<SiweVerificationResult> {
    try {
      const verification = await verifySiweMessage(
        payload,
        nonce,
        // statement,
        // undefined,
        // this.client,
      );

      return {
        isValid: verification.isValid,
        address: verification.siweMessageData.address as "0x{string}",
        chainId: 480
      };
    } catch(error) {

      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Unknown error",
        chainId: 480
      };
    } 
  }
}
