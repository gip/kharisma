import { privateKeyToAccount } from "viem/accounts";
import { Eip1193Signer } from "./eip1193-signer";
import { LocalAccountSigner } from "./local-account-signer";

export async function signerFromPrivy(wallet: {
  address: string;
  getEthereumProvider(): Promise<{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  }>;
}) {
  const provider = await wallet.getEthereumProvider();
  return new Eip1193Signer(provider, wallet.address as `0x${string}`);
}

export function signerFromPrivateKey(privateKey: `0x${string}`) {
  return new LocalAccountSigner(privateKeyToAccount(privateKey));
}
