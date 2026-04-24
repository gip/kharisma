import { coinbaseWallet, injected } from "@wagmi/connectors";
import { createConfig, http } from "wagmi";
import { base, mainnet, optimism } from "wagmi/chains";

const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC_URL;
const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL;
const optimismRpc = process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL;

export const supportedChains = [mainnet, base, optimism] as const;

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    injected({ target: "metaMask" }),
    coinbaseWallet({
      appName: "Kharisma",
      preference: {
        options: "smartWalletOnly",
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(mainnetRpc || undefined),
    [base.id]: http(baseRpc || undefined),
    [optimism.id]: http(optimismRpc || undefined),
  },
});
