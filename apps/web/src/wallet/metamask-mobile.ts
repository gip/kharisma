import type { Eip1193Provider } from "@/wallet/eip1193-signer";

type MetaMaskWindow = Window &
  typeof globalThis & {
    ethereum?: {
      isMetaMask?: boolean;
    };
  };

type MetaMaskSdkLike = {
  getProvider: () => Eip1193Provider | undefined;
  terminate?: () => void;
};

let sdkPromise: Promise<MetaMaskSdkLike | null> | null = null;

function getMetaMaskWindow() {
  if (typeof window === "undefined") {
    return null;
  }

  return window as MetaMaskWindow;
}

export function hasMetaMaskProvider() {
  return Boolean(getMetaMaskWindow()?.ethereum?.isMetaMask);
}

export function isLikelyMobileBrowser(userAgent = "") {
  if (!userAgent && typeof navigator !== "undefined") {
    userAgent = navigator.userAgent;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export async function waitForMetaMaskProvider(timeoutMs = 3000) {
  if (hasMetaMaskProvider()) {
    return true;
  }

  const hostWindow = getMetaMaskWindow();

  if (!hostWindow) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      hostWindow.removeEventListener("ethereum#initialized", onInitialized);
      resolve(hasMetaMaskProvider());
    };

    const onInitialized = () => {
      finish();
    };

    hostWindow.addEventListener("ethereum#initialized", onInitialized, {
      once: true,
    });

    hostWindow.setTimeout(finish, timeoutMs);
  });
}

async function getMetaMaskSdk() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!sdkPromise) {
    sdkPromise = import("@metamask/sdk").then(({ default: MetaMaskSDK }) => {
      return new MetaMaskSDK({
        injectProvider: false,
        preferDesktop: false,
        checkInstallationImmediately: false,
        dappMetadata: {
          name: "Kharisma",
          url: window.location.origin,
        },
      });
    });
  }

  return sdkPromise;
}

export async function connectWithMetaMaskMobileSdk() {
  const sdk = await getMetaMaskSdk();
  const provider = sdk?.getProvider();

  if (!provider) {
    throw new Error("MetaMask Mobile SDK provider unavailable");
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
    params: [],
  })) as string[];

  const address = accounts[0] as `0x${string}` | undefined;

  if (!address) {
    throw new Error("MetaMask did not return an account");
  }

  return {
    address,
    provider,
  };
}

export async function getConnectedMetaMaskMobileAccount() {
  const sdk = await getMetaMaskSdk();
  const provider = sdk?.getProvider();

  if (!provider) {
    return null;
  }

  const accounts = (await provider.request({
    method: "eth_accounts",
    params: [],
  })) as string[];

  const address = accounts[0] as `0x${string}` | undefined;

  if (!address) {
    return null;
  }

  return {
    address,
    provider,
  };
}

export async function disconnectMetaMaskMobileSdk() {
  if (!sdkPromise) {
    return;
  }

  const sdk = await sdkPromise;
  sdk?.terminate?.();
  sdkPromise = null;
}
