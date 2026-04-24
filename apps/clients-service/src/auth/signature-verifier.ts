import {
  createPublicClient,
  getAddress,
  hashMessage,
  http,
  recoverMessageAddress,
  type Hex,
} from "viem";

export type VerificationResult = {
  accountType: "EOA" | "SCW";
  chainId: number | null;
};

// ERC-1271 magic return value for isValidSignature(bytes32,bytes).
const ERC1271_MAGIC_VALUE = "0x1626ba7e";

const ERC1271_ABI = [
  {
    type: "function",
    name: "isValidSignature",
    stateMutability: "view",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4" }],
  },
] as const;

export class WalletSignatureVerifier {
  private readonly publicClients = new Map<number, ReturnType<typeof createPublicClient>>();

  constructor(
    private readonly rpcUrls: Partial<Record<number, string>>,
  ) {}

  private getPublicClient(chainId: number) {
    const existing = this.publicClients.get(chainId);

    if (existing) {
      return existing;
    }

    const rpcUrl = this.rpcUrls[chainId];
    if (!rpcUrl) {
      return null;
    }

    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    this.publicClients.set(chainId, client);
    return client;
  }

  async verify(input: {
    address: `0x${string}`;
    message: string;
    signature: Hex;
    chainId: number | null;
  }): Promise<VerificationResult> {
    const normalizedAddress = getAddress(input.address);

    try {
      const recovered = await recoverMessageAddress({
        message: input.message,
        signature: input.signature,
      });

      if (getAddress(recovered) === normalizedAddress) {
        return {
          accountType: "EOA",
          chainId: input.chainId,
        };
      }
    } catch {
      // Fall through to ERC-1271 verification if possible.
    }

    if (typeof input.chainId !== "number") {
      throw new Error("Wallet signature does not match the requested address");
    }

    const publicClient = this.getPublicClient(input.chainId);
    if (!publicClient) {
      throw new Error(`Missing RPC configuration for chain ${input.chainId}`);
    }

    // Call `isValidSignature(bytes32,bytes)` directly on the wallet contract.
    // We intentionally avoid viem's `verifyMessage` + universalSignatureValidator
    // wrapper, which does not reliably resolve for World App's smart-contract
    // wallets on World Chain. This mirrors the reference path used by
    // @worldcoin/minikit-js' `verifySiweMessage`.
    let result: Hex;
    try {
      result = (await publicClient.readContract({
        address: normalizedAddress,
        abi: ERC1271_ABI,
        functionName: "isValidSignature",
        args: [hashMessage(input.message), input.signature],
      })) as Hex;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "unknown error";
      throw new Error(`ERC-1271 verification failed on chain ${input.chainId}: ${detail}`);
    }

    if (result.toLowerCase() !== ERC1271_MAGIC_VALUE) {
      throw new Error("Wallet signature does not match the requested address");
    }

    return {
      accountType: "SCW",
      chainId: input.chainId,
    };
  }
}
