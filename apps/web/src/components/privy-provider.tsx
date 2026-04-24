"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import {
  PrivyProvider as PrivyAuthProvider,
  getEmbeddedConnectedWallet,
  useCreateWallet,
  useLinkAccount,
  useLogin,
  usePrivy,
  useWallets,
  type ConnectedWallet,
} from "@privy-io/react-auth";
import { setLastLoginMethod, type LoginMethod } from "@/auth/login-method";
import { getPublicEnv } from "@/wallet/runtime";

type KharismaPrivyContextValue = {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  embeddedWallet: ConnectedWallet | null;
  primaryWallet: ConnectedWallet | null;
  startGoogleLogin: () => void;
  startEmailLogin: () => void;
  startPhoneLogin: () => void;
  startWalletLogin: () => void;
  logout: () => Promise<void>;
};

const EMBEDDED_LOGIN_METHODS = new Set<LoginMethod>([
  "privy-google",
  "privy-email",
  "privy-phone",
]);

const noopAsync = async () => {};

const KharismaPrivyContext = createContext<KharismaPrivyContextValue>({
  enabled: false,
  ready: false,
  authenticated: false,
  embeddedWallet: null,
  primaryWallet: null,
  startGoogleLogin: () => {},
  startEmailLogin: () => {},
  startPhoneLogin: () => {},
  startWalletLogin: () => {},
  logout: noopAsync,
});

export function KharismaPrivyProvider({ children }: { children: React.ReactNode }) {
  const { privyAppId } = getPublicEnv();

  if (!privyAppId) {
    return children;
  }

  // Inside World App we authenticate via MiniKit, so Privy is not used.
  // Mounting PrivyAuthProvider here pulls in `@walletconnect/*` which tries
  // to open its relayer in the World App webview and fails, emitting a noisy
  // empty `{}` console error. `window.WorldApp` is injected before any JS
  // runs, so this synchronous check is reliable on the first client render.
  if (
    typeof window !== "undefined" &&
    Boolean((window as unknown as Record<string, unknown>).WorldApp)
  ) {
    return children;
  }

  return (
    <PrivyAuthProvider
      appId={privyAppId}
      config={{
        loginMethods: ["google", "email", "sms"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          theme: "light",
          accentColor: "#111827",
        },
      }}
    >
      <KharismaPrivyBridge>{children}</KharismaPrivyBridge>
    </PrivyAuthProvider>
  );
}

function KharismaPrivyBridge({ children }: { children: React.ReactNode }) {
  const pendingMethodRef = useRef<LoginMethod>("privy-wallet");
  const walletCreationInFlightRef = useRef(false);
  const { ready, authenticated, logout } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { wallets, ready: walletsReady } = useWallets();
  const embeddedWallet = getEmbeddedConnectedWallet(wallets);
  const { linkWallet } = useLinkAccount({
    onSuccess: () => {
      setLastLoginMethod(pendingMethodRef.current);
    },
  });
  const { login } = useLogin({
    onComplete: () => {
      setLastLoginMethod(pendingMethodRef.current);
    },
  });

  useEffect(() => {
    if (!authenticated || !walletsReady || embeddedWallet) {
      return;
    }

    if (!EMBEDDED_LOGIN_METHODS.has(pendingMethodRef.current)) {
      return;
    }

    if (walletCreationInFlightRef.current) {
      return;
    }

    walletCreationInFlightRef.current = true;
    void createWallet()
      .catch((cause: unknown) => {
        console.error(cause);
      })
      .finally(() => {
        walletCreationInFlightRef.current = false;
      });
  }, [authenticated, createWallet, embeddedWallet, walletsReady]);

  return (
    <KharismaPrivyContext.Provider
      value={{
        enabled: true,
        ready,
        authenticated,
        embeddedWallet,
        primaryWallet: wallets[0] ?? null,
        startGoogleLogin: () => {
          pendingMethodRef.current = "privy-google";
          login({ loginMethods: ["google"] });
        },
        startEmailLogin: () => {
          pendingMethodRef.current = "privy-email";
          login({ loginMethods: ["email"] });
        },
        startPhoneLogin: () => {
          pendingMethodRef.current = "privy-phone";
          login({ loginMethods: ["sms"] });
        },
        startWalletLogin: () => {
          pendingMethodRef.current = "privy-wallet";
          if (authenticated) {
            linkWallet();
          } else {
            login({ loginMethods: ["wallet"] });
          }
        },
        logout,
      }}
    >
      {children}
    </KharismaPrivyContext.Provider>
  );
}

export function useKharismaPrivy() {
  return useContext(KharismaPrivyContext);
}
