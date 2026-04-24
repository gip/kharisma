import { connect } from "@wagmi/core";
import { setLastLoginMethod } from "@/auth/login-method";
import { wagmiConfig } from "./wagmi";

function getConnectorOrThrow(id: string, label: string) {
  const connector = wagmiConfig.connectors.find((item) => item.id === id);

  if (!connector) {
    throw new Error(`${label} connector not configured`);
  }

  return connector;
}

export async function connectMetaMask() {
  const result = await connect(wagmiConfig, {
    connector: getConnectorOrThrow("metaMask", "MetaMask"),
  });

  setLastLoginMethod("metamask");
  return result;
}

export async function connectCoinbase() {
  const result = await connect(wagmiConfig, {
    connector: getConnectorOrThrow("coinbaseWalletSDK", "Coinbase Wallet"),
  });

  setLastLoginMethod("coinbase");
  return result;
}
