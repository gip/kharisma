"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  IDKitRequestWidget,
  IDKitErrorCodes,
  orbLegacy,
  type IDKitResult,
} from "@worldcoin/idkit";
import { MiniKit } from "@worldcoin/minikit-js";
import { disconnect, getAccount } from "@wagmi/core";
import { useAccount } from "wagmi";
import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type Address,
  type Hex as ViemHex,
} from "viem";
import {
  clearSessionButKeepLoginHint,
  getLastLoginMethod,
  setLastLoginMethod,
  type LoginMethod,
} from "@/auth/login-method";
import {
  BackendApiClient,
  clearBackendSession,
  loadBackendSession,
  saveBackendSession,
} from "@/backend/client";
import { BackendSocket } from "@/backend/socket";
import type {
  KharismaProfile,
  KharismaGroupSummary,
  KharismaWorldIdRequest,
  GroupJoinPolicy,
  GroupLanguageCode,
  InvestmentConfig,
  InvestmentSubmitResult,
  InvestmentToken,
  ServerEvent,
  ThreadSummary,
  XmtpMessage as BackendXmtpMessage,
} from "@/backend/types";
import {
  HandlePromptModal,
  MEMBER_NAME_PATTERN,
} from "@/components/handle-prompt-modal";
import { useKharismaPrivy } from "@/components/privy-provider";
import { useT } from "@/i18n/i18n-provider";
import type { MessageKey } from "@/i18n/messages";
import { extractVideoThumbnail } from "@/media/portrait-video";
import { buildSigningMessage } from "@/wallet/signing-message";
import { connectCoinbase, connectMetaMask } from "@/wallet/connect-web-wallet";
import { Eip1193Signer, type Eip1193Provider } from "@/wallet/eip1193-signer";
import { detectEnvironment, type AppEnvironment } from "@/wallet/environment";
import {
  connectWithMetaMaskMobileSdk,
  disconnectMetaMaskMobileSdk,
  getConnectedMetaMaskMobileAccount,
  isLikelyMobileBrowser,
  waitForMetaMaskProvider,
} from "@/wallet/metamask-mobile";
import { authenticateWithWorldApp, initializeMiniKit } from "@/wallet/minikit";
import { getPublicEnv } from "@/wallet/runtime";
import { signerFromPrivy } from "@/wallet/signer-factory";
import type { Hex, UniversalSigner } from "@/wallet/universal-signer";
import { wagmiConfig } from "@/wallet/wagmi";
import { WorldAppSigner } from "@/wallet/worldapp-signer";
import type {
  XmtpChatSummary,
  XmtpClientInfo,
  XmtpMessage,
  XmtpStatus,
} from "@/xmtp/types";

export type Session = {
  method: LoginMethod;
  address: `0x${string}`;
  signerKind: UniversalSigner["kind"];
  signer: UniversalSigner;
  providerLabel: string;
};

export type RouteAvailability = {
  enabled: boolean;
  reason?: string;
};

export type LatestXmtpMessageEvent = {
  sequence: number;
  type: "message:new" | "message:sent";
  conversationId: string;
  message: XmtpMessage;
};

type SessionContextValue = {
  environment: AppEnvironment;
  session: Session | null;
  preferred: LoginMethod | null;
  signature: Hex | null;
  message: string;
  error: string | null;
  xmtpStatus: XmtpStatus;
  xmtpError: string | null;
  xmtpInfo: XmtpClientInfo | null;
  xmtpChats: XmtpChatSummary[];
  latestXmtpMessageEvent: LatestXmtpMessageEvent | null;
  kharismaStatus:
    | "idle"
    | "listing"
    | "verifying"
    | "ready"
    | "creating"
    | "joining"
    | "error";
  kharismaError: string | null;
  kharismaProfile: KharismaProfile | null;
  kharismaGroups: KharismaGroupSummary[];
  isBusy: boolean;
  isRecovering: boolean;
  privyAvailability: RouteAvailability;
  worldAppAvailability: RouteAvailability;
  connectWithMetaMask: () => Promise<boolean>;
  connectWithCoinbase: () => Promise<boolean>;
  connectWithWorldApp: () => Promise<boolean>;
  startGoogleLogin: () => void;
  startEmailLogin: () => void;
  startPhoneLogin: () => void;
  startWalletLogin: () => void;
  signCurrentMessage: () => Promise<boolean>;
  refreshKharismaGroups: () => Promise<boolean>;
  createKharismaGroup: (input: {
    title: string;
    description: string;
    mediaFile: File;
    thumbnailFile: File;
    languages: GroupLanguageCode[];
    joinPolicy: GroupJoinPolicy;
    maxMembers: number;
  }) => Promise<boolean>;
  joinKharismaGroup: (input: {
    groupId: string;
    syncInboxId: string;
    name?: string;
  }) => Promise<boolean>;
  getInvestmentConfig: (input: {
    groupId: string;
    syncInboxId: string;
  }) => Promise<InvestmentConfig>;
  submitInvestment: (input: {
    groupId: string;
    syncInboxId: string;
    token: InvestmentToken;
    amount: string;
  }) => Promise<InvestmentSubmitResult>;
  listKharismaGroupMessages: (groupId: string) => Promise<XmtpMessage[]>;
  sendKharismaGroupMessage: (
    groupId: string,
    text: string,
  ) => Promise<XmtpMessage>;
  sendKharismaGroupVideo: (
    groupId: string,
    file: File,
  ) => Promise<XmtpMessage>;
  listGroupThreads: (groupId: string) => Promise<ThreadSummary[]>;
  listThreadMessages: (
    groupId: string,
    threadId: string,
  ) => Promise<XmtpMessage[]>;
  createGroupThread: (input: {
    groupId: string;
    title: string;
    firstMessage?: string;
  }) => Promise<{
    thread: ThreadSummary;
    rootMessage: XmtpMessage;
    firstMessage: XmtpMessage | null;
  }>;
  sendThreadMessage: (
    groupId: string,
    threadId: string,
    text: string,
  ) => Promise<XmtpMessage>;
  sendThreadVideo: (
    groupId: string,
    threadId: string,
    file: File,
  ) => Promise<XmtpMessage>;
  listLatestThreads: (limit?: number) => Promise<ThreadSummary[]>;
  logout: () => Promise<boolean>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const EMBEDDED_PRIVY_METHODS = new Set<LoginMethod>([
  "privy-google",
  "privy-email",
  "privy-phone",
]);

function isEmbeddedPrivyMethod(method: LoginMethod) {
  return EMBEDDED_PRIVY_METHODS.has(method);
}

function isEmbeddedPrivyWallet(wallet: { walletClientType?: string }) {
  return wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2";
}

async function ensureBaseChain(provider: Eip1193Provider) {
  const baseChainId = "0x2105";
  const current = await provider.request({ method: "eth_chainId" });
  if (typeof current === "string" && current.toLowerCase() === baseChainId) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseChainId }],
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? Number((error as { code: unknown }).code)
        : null;
    if (code !== 4902) {
      throw error;
    }
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: baseChainId,
          chainName: "Base",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseChainId }],
    });
  }

  const next = await provider.request({ method: "eth_chainId" });
  if (typeof next !== "string" || next.toLowerCase() !== baseChainId) {
    throw new Error("Switch your wallet network to Base before investing.");
  }
}

function worldAppReasonKey(worldAppId: string): MessageKey {
  return worldAppId
    ? "provider.worldAppOnlyInside"
    : "provider.worldAppNotConfigured";
}

function resolveConnectedWallet(
  connectorId: string | undefined,
  preferred: LoginMethod | null,
) {
  if (connectorId === "coinbaseWalletSDK") {
    return {
      method: "coinbase" as const,
      providerLabel: "Coinbase Wallet",
    };
  }

  if (connectorId === "metaMask" || connectorId === "injected") {
    return {
      method: "metamask" as const,
      providerLabel: "MetaMask",
    };
  }

  if (preferred === "coinbase" || preferred === "metamask") {
    return preferred === "coinbase"
      ? {
          method: "coinbase" as const,
          providerLabel: "Coinbase Wallet",
        }
      : {
          method: "metamask" as const,
          providerLabel: "MetaMask",
        };
  }

  return null;
}

type ConnectorWithProvider = {
  id?: string;
  getProvider?: (parameters?: { chainId?: number }) => Promise<unknown> | unknown;
};

type ConnectedWalletAccount = {
  address?: `0x${string}`;
  chainId?: number;
  connector?: ConnectorWithProvider;
};

type RestoreBackendSessionOptions = {
  allowAuthentication: boolean;
  allowSignatureRequests: boolean;
};

type RestoreInFlight = {
  identityKey: string;
  allowAuthentication: boolean;
  allowSignatureRequests: boolean;
  promise: Promise<boolean>;
};

type RealtimeInFlight = {
  token: string;
  promise: Promise<void>;
};

type XmtpBootstrapInFlight = {
  token: string;
  promise: Promise<void>;
};

function getRestoreIdentityKey(session: Session) {
  const address = session.address.toLowerCase();

  return session.method.startsWith("privy-")
    ? `privy:${address}`
    : `${session.method}:${address}`;
}

function hasProviderRequest(provider: unknown): provider is Eip1193Provider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "request" in provider &&
    typeof provider.request === "function"
  );
}

function hasConnectorProvider(
  connector: ConnectorWithProvider | undefined,
): connector is ConnectorWithProvider & Required<Pick<ConnectorWithProvider, "getProvider">> {
  return typeof connector?.getProvider === "function";
}

async function getConnectedWalletProvider(account: ConnectedWalletAccount) {
  const accountConnector = account.connector;
  const connector = hasConnectorProvider(accountConnector)
    ? accountConnector
    : wagmiConfig.connectors.find(
        (item) =>
          item.id === accountConnector?.id &&
          hasConnectorProvider(item as ConnectorWithProvider),
      );
  const provider = await connector?.getProvider(
    typeof account.chainId === "number" ? { chainId: account.chainId } : undefined,
  );

  return hasProviderRequest(provider) ? provider : null;
}

function toDate(value: string | null) {
  return value ? new Date(value) : null;
}

function mapConversationSummary(summary: {
  id: string;
  kind: "dm" | "group";
  title: string;
  peerInboxId: string | null;
  memberCount: number | null;
  lastActivityAt: string | null;
  createdAt: string | null;
}): XmtpChatSummary {
  return {
    id: summary.id,
    kind: summary.kind,
    title: summary.title,
    peerInboxId: summary.peerInboxId,
    memberCount: summary.memberCount,
    lastActivityAt: toDate(summary.lastActivityAt),
    createdAt: toDate(summary.createdAt),
  };
}

function mapMessage(message: BackendXmtpMessage): XmtpMessage {
  return {
    ...message,
    sentAt: new Date(message.sentAt),
  };
}

function upsertConversation(
  list: XmtpChatSummary[],
  nextConversation: XmtpChatSummary,
) {
  const filtered = list.filter((conversation) => conversation.id !== nextConversation.id);
  return [nextConversation, ...filtered];
}

function getBackendErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return null;
}

function kharismaRequestErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Kharisma request failed";
  }

  if (error.message.includes("this human has already joined the group")) {
    return "This World ID has already joined this room with another wallet. Sign in with that wallet to open it.";
  }

  const protocolError = /^Kharisma protocol error \([^)]+\): (.+)$/.exec(
    error.message,
  );
  return protocolError?.[1] ?? error.message;
}

function proofFromIdKitResult(result: IDKitResult, action: string): unknown {
  return {
    ...result,
    action:
      "action" in result && typeof result.action === "string"
        ? result.action
        : action,
  };
}

function worldIdErrorMessage(errorCode: IDKitErrorCodes) {
  if (
    errorCode === IDKitErrorCodes.Timeout ||
    errorCode === IDKitErrorCodes.ConnectionFailed ||
    errorCode === IDKitErrorCodes.GenericError
  ) {
    return "World ID verification expired or could not be completed. Try again to generate a fresh QR code.";
  }

  return `World ID verification failed: ${errorCode}`;
}

type PendingKharismaWorldIdFlow = {
  request: KharismaWorldIdRequest;
  action: "identity" | "human";
  token: string;
  handle?: string;
  resolve: (result: KharismaWorldIdFlowResult) => void;
};

type KharismaWorldIdFlowResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "already-in-progress"
        | "cancelled"
        | "error"
        | "not-connected"
        | "submit-error";
      message?: string;
    };

type HandlePromptState = {
  open: true;
  suggested: string;
  busy: boolean;
  error: string | null;
  resolve: (handle: string | null) => void;
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const env = getPublicEnv();
  const t = useT();
  const privy = useKharismaPrivy();
  const walletAccount = useAccount();
  const [environment, setEnvironment] = useState<AppEnvironment>("web");
  const [session, setSession] = useState<Session | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [xmtpStatus, setXmtpStatus] = useState<XmtpStatus>("idle");
  const [xmtpError, setXmtpError] = useState<string | null>(null);
  const [xmtpInfo, setXmtpInfo] = useState<XmtpClientInfo | null>(null);
  const [xmtpChats, setXmtpChats] = useState<XmtpChatSummary[]>([]);
  const [latestXmtpMessageEvent, setLatestXmtpMessageEvent] =
    useState<LatestXmtpMessageEvent | null>(null);
  const [kharismaStatus, setKharismaStatus] =
    useState<SessionContextValue["kharismaStatus"]>("idle");
  const [kharismaError, setKharismaError] = useState<string | null>(null);
  const [kharismaProfile, setKharismaProfile] =
    useState<KharismaProfile | null>(null);
  const [kharismaGroups, setKharismaGroups] = useState<
    KharismaGroupSummary[]
  >([]);
  const [pendingWorldIdFlow, setPendingWorldIdFlow] =
    useState<PendingKharismaWorldIdFlow | null>(null);
  const [handlePromptState, setHandlePromptState] =
    useState<HandlePromptState | null>(null);
  const [preferred, setPreferred] = useState<LoginMethod | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [worldAppAvailability, setWorldAppAvailability] = useState<RouteAvailability>({
    enabled: environment === "world-app" && Boolean(env.worldAppId),
    reason: environment === "world-app" ? undefined : t(worldAppReasonKey(env.worldAppId)),
  });
  const hasLoadedPreferenceRef = useRef(false);
  const apiRef = useRef<BackendApiClient | null>(null);
  const socketRef = useRef<BackendSocket | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const latestMessageSequenceRef = useRef(0);
  const pendingWorldIdFlowRef = useRef<PendingKharismaWorldIdFlow | null>(
    null,
  );
  const handlePromptStateRef = useRef<HandlePromptState | null>(null);
  const recoveryAttemptRef = useRef<string | null>(null);
  const restoreInFlightRef = useRef<RestoreInFlight | null>(null);
  const realtimeInFlightRef = useRef<RealtimeInFlight | null>(null);
  const realtimeTokenRef = useRef<string | null>(null);
  const xmtpBootstrapInFlightRef = useRef<XmtpBootstrapInFlight | null>(null);
  const allowSignatureRequestsRef = useRef(false);
  const pendingInteractiveRecoveryRef = useRef(false);
  const pendingPrivyMethodRef = useRef<LoginMethod | null>(null);
  const worldIdSuccessHandlingRef = useRef(false);
  const lastWorldIdErrorMessageRef = useRef<string | null>(null);

  if (!apiRef.current) {
    apiRef.current = new BackendApiClient(env.backendHttpUrl);
  }

  useEffect(() => {
    currentSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    pendingWorldIdFlowRef.current = pendingWorldIdFlow;
  }, [pendingWorldIdFlow]);

  useEffect(() => {
    handlePromptStateRef.current = handlePromptState;
  }, [handlePromptState]);

  useEffect(() => {
    setEnvironment(detectEnvironment());
  }, []);

  useEffect(() => {
    setPreferred(getLastLoginMethod());
    hasLoadedPreferenceRef.current = true;
  }, []);

  useEffect(() => {
    if (!env.worldAppId) {
      setWorldAppAvailability({
        enabled: false,
        reason: t(worldAppReasonKey(env.worldAppId)),
      });
      return;
    }

    if (environment === "world-app") {
      setWorldAppAvailability(initializeMiniKit(env.worldAppId));
    } else {
      setWorldAppAvailability({
        enabled: false,
        reason: t("provider.worldAppWalletAuth"),
      });
    }
  }, [env.worldAppId, environment, t]);

  const privyAvailability: RouteAvailability =
    environment === "world-app"
      ? { enabled: false, reason: undefined }
      : !env.privyAppId
        ? { enabled: false, reason: t("provider.privyNotConfigured") }
        : !privy.enabled || !privy.ready
          ? { enabled: false, reason: t("provider.privyInitializing") }
          : { enabled: true };

  function applySession(nextSession: Session) {
    currentSessionRef.current = nextSession;
    pendingPrivyMethodRef.current = null;
    setSession(nextSession);
    setPreferred(nextSession.method);
    setSignature(null);
    setMessage("");
    setError(null);
    resetKharismaState();
  }

  async function closeSocket() {
    await socketRef.current?.close();
    socketRef.current = null;
    realtimeTokenRef.current = null;
    realtimeInFlightRef.current = null;
  }

  async function disconnectExternalWallets() {
    if (getAccount(wagmiConfig).isConnected) {
      await disconnect(wagmiConfig);
    }

    await disconnectMetaMaskMobileSdk();
  }

  async function resetForEmbeddedPrivyLogin() {
    await closeSocket();
    clearBackendSession();
    resetXmtpState();
    resetKharismaState();
    currentSessionRef.current = null;
    allowSignatureRequestsRef.current = false;
    recoveryAttemptRef.current = null;
    restoreInFlightRef.current = null;
    setSession(null);
    setSignature(null);
    setMessage("");
    await disconnectExternalWallets();
  }

  function resetXmtpState() {
    setXmtpStatus("idle");
    setXmtpError(null);
    setXmtpInfo(null);
    setXmtpChats([]);
    setLatestXmtpMessageEvent(null);
  }

  function resetKharismaState() {
    setKharismaStatus("idle");
    setKharismaError(null);
    setKharismaProfile(null);
    setKharismaGroups([]);
    setPendingWorldIdFlow(null);
  }

  function updateConversationFromMessage(conversationId: string) {
    setXmtpChats((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              lastActivityAt: new Date(),
            }
          : conversation,
      ),
    );
  }

  async function handleServerEvent(event: ServerEvent) {
    if (event.type === "xmtp.signature_requested") {
      const activeSession = currentSessionRef.current;

      if (!allowSignatureRequestsRef.current) {
        socketRef.current?.send({
          type: "xmtp.signature_rejected",
          requestId: event.requestId,
          error: "Wallet signature requires an explicit connect action",
        });
        setXmtpStatus("error");
        setXmtpError("Connect again to authorize wallet signatures.");
        return;
      }

      if (!activeSession) {
        socketRef.current?.send({
          type: "xmtp.signature_rejected",
          requestId: event.requestId,
          error: "Wallet session is unavailable",
        });
        return;
      }

      try {
        const nextSignature = await activeSession.signer.signMessage(event.message);
        socketRef.current?.send({
          type: "xmtp.signature_submit",
          requestId: event.requestId,
          signature: nextSignature,
        });
      } catch (cause) {
        socketRef.current?.send({
          type: "xmtp.signature_rejected",
          requestId: event.requestId,
          error:
            cause instanceof Error ? cause.message : "User rejected the signature request",
        });
      }

      return;
    }

    if (event.type === "conversation:new") {
      const conversation = mapConversationSummary(event.conversation);
      setXmtpChats((current) => upsertConversation(current, conversation));
      return;
    }

    if (event.type === "message:new" || event.type === "message:sent") {
      updateConversationFromMessage(event.conversationId);
      setLatestXmtpMessageEvent({
        sequence: ++latestMessageSequenceRef.current,
        type: event.type,
        conversationId: event.conversationId,
        message: mapMessage(event.message),
      });
      return;
    }

    if (event.type === "sync:required") {
      setXmtpError(event.reason);
      setXmtpStatus("error");
    }
  }

  async function connectRealtime(token: string) {
    if (socketRef.current && realtimeTokenRef.current === token) {
      return;
    }

    const inFlight = realtimeInFlightRef.current;
    if (inFlight?.token === token) {
      return inFlight.promise;
    }

    await closeSocket();

    const nextSocket = new BackendSocket(env.backendWsUrl);
    socketRef.current = nextSocket;

    const promise = nextSocket
      .connect({
        token,
        onEvent: (event) => {
          void handleServerEvent(event);
        },
      })
      .then(() => {
        realtimeTokenRef.current = token;
      })
      .finally(() => {
        if (realtimeInFlightRef.current?.promise === promise) {
          realtimeInFlightRef.current = null;
        }
      });

    realtimeInFlightRef.current = {
      token,
      promise,
    };

    return promise;
  }

  async function bootstrapXmtp(token: string) {
    const inFlight = xmtpBootstrapInFlightRef.current;
    if (inFlight?.token === token) {
      return inFlight.promise;
    }

    setXmtpStatus("connecting");
    setXmtpError(null);

    const promise = (async () => {
      const result = await apiRef.current!.bootstrapXmtp(token);

      setXmtpInfo(result.info);
      setXmtpChats(
        result.conversations.map((conversation) =>
          mapConversationSummary(conversation),
        ),
      );
      setXmtpStatus("connected");

      if (result.info.inboxId) {
        await refreshKharismaStatus(token).catch(() => {
          // Status queries are non-fatal; group listing below will surface errors if needed.
        });
        void loadKharismaGroups(token);
      }
    })().finally(() => {
      if (xmtpBootstrapInFlightRef.current?.promise === promise) {
        xmtpBootstrapInFlightRef.current = null;
      }
    });

    xmtpBootstrapInFlightRef.current = {
      token,
      promise,
    };

    return promise;
  }

  async function getSignerChainId(signer: UniversalSigner) {
    // World App wallets are smart contract wallets deployed on World Chain.
    // The backend needs this chainId to verify their signatures via ERC-1271.
    if (signer.kind === "worldapp") {
      return 480;
    }

    if (!(signer instanceof Eip1193Signer)) {
      return null;
    }

    const chainIdHex = await signer.getProvider().request({
      method: "eth_chainId",
    });

    return typeof chainIdHex === "string"
      ? Number.parseInt(chainIdHex, 16)
      : null;
  }

  async function authenticateWalletSession(nextSession: Session) {
    const chainId = await getSignerChainId(nextSession.signer);
    const challenge = await apiRef.current!.requestChallenge({
      walletAddress: nextSession.address,
      chainId,
      loginMethod: nextSession.method,
    });
    const signedChallenge = await nextSession.signer.signMessage(challenge.message);
    const verified = await apiRef.current!.verifyChallenge({
      challengeId: challenge.challengeId,
      signature: signedChallenge,
    });

    saveBackendSession(verified.token, verified.session);
    applySession(nextSession);
    await connectRealtime(verified.token);

    try {
      await bootstrapXmtp(verified.token);
    } catch (cause) {
      setXmtpStatus("error");
      setXmtpError(
        cause instanceof Error ? cause.message : "Failed to connect XMTP",
      );
      throw cause;
    }
  }

  async function performRestoreBackendSession(
    nextSession: Session,
    options: RestoreBackendSessionOptions,
  ) {
    const stored = loadBackendSession();

    if (
      !stored ||
      stored.session.walletAddress.toLowerCase() !== nextSession.address.toLowerCase()
    ) {
      if (!options.allowAuthentication) {
        return false;
      }

      await authenticateWalletSession(nextSession);
      return true;
    }

    if (new Date(stored.session.expiresAt).getTime() <= Date.now()) {
      clearBackendSession();

      if (!options.allowAuthentication) {
        return false;
      }

      await authenticateWalletSession(nextSession);
      return true;
    }

    applySession(nextSession);

    try {
      await connectRealtime(stored.token);
    } catch {
      clearBackendSession();
      await closeSocket();

      if (!options.allowAuthentication) {
        setSession(null);
        resetXmtpState();
        return false;
      }

      await authenticateWalletSession(nextSession);
      return true;
    }

    try {
      await bootstrapXmtp(stored.token);
    } catch (cause) {
      const errorStatus = getBackendErrorStatus(cause);

      if (errorStatus === 401 || errorStatus === 403) {
        clearBackendSession();
        await closeSocket();

        if (!options.allowAuthentication) {
          setSession(null);
          resetXmtpState();
          return false;
        }

        await authenticateWalletSession(nextSession);
        return true;
      }

      setXmtpStatus("error");
      setXmtpError(
        cause instanceof Error ? cause.message : "Failed to connect XMTP",
      );
    }

    return true;
  }

  async function restoreBackendSession(
    nextSession: Session,
    options: RestoreBackendSessionOptions,
  ) {
    const identityKey = getRestoreIdentityKey(nextSession);
    const inFlight = restoreInFlightRef.current;

    if (inFlight?.identityKey === identityKey) {
      const samePermissions =
        inFlight.allowAuthentication === options.allowAuthentication &&
        inFlight.allowSignatureRequests === options.allowSignatureRequests;

      if (
        samePermissions ||
        (inFlight.allowSignatureRequests && !options.allowSignatureRequests)
      ) {
        return inFlight.promise;
      }
    }

    if (options.allowSignatureRequests) {
      allowSignatureRequestsRef.current = true;
    }

    const promise = performRestoreBackendSession(nextSession, options).finally(() => {
      if (restoreInFlightRef.current?.promise === promise) {
        restoreInFlightRef.current = null;
      }
    });

    restoreInFlightRef.current = {
      identityKey,
      allowAuthentication: options.allowAuthentication,
      allowSignatureRequests: options.allowSignatureRequests,
      promise,
    };

    return promise;
  }

  async function attachConnectedWallet(method: LoginMethod, providerLabel: string) {
    const account = getAccount(wagmiConfig);
    const provider = await getConnectedWalletProvider(account);

    if (!provider || !account.address) {
      throw new Error("Wallet provider unavailable");
    }

    const signer = new Eip1193Signer(provider, account.address);

    await restoreBackendSession(
      {
        method,
        address: account.address,
        signerKind: signer.kind,
        signer,
        providerLabel,
      },
      { allowAuthentication: true, allowSignatureRequests: true },
    );
  }

  async function attachPrivyWallet(method: LoginMethod = "privy-wallet") {
    if (!privy.primaryWallet) {
      throw new Error("Privy wallet is unavailable");
    }

    const signer = await signerFromPrivy(privy.primaryWallet);
    const address = await signer.getAddress();

    setLastLoginMethod(method);
    await restoreBackendSession(
      {
        method,
        address,
        signerKind: signer.kind,
        signer,
        providerLabel: "Privy",
      },
      { allowAuthentication: true, allowSignatureRequests: true },
    );
  }

  async function run(action: () => Promise<void>) {
    setIsBusy(true);

    try {
      await action();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unexpected error");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function recoverSession() {
      const walletStatus = walletAccount.status ?? "disconnected";
      const isWalletHydrating =
        walletStatus === "connecting" || walletStatus === "reconnecting";

      if (
        !hasLoadedPreferenceRef.current ||
        (privy.enabled && !privy.ready) ||
        isWalletHydrating
      ) {
        setIsRecovering(true);
        return;
      }

      // World App sessions aren't derivable from wagmi/Privy state — the
      // recovery branches below can't produce one, so without this guard
      // the effect would re-run after `applySession(...)` for a World App
      // login, fall through to the `setSession(null)` path, and null
      // `currentSessionRef` while `bootstrapXmtp` is still in flight. The
      // in-flight XMTP signature request would then be rejected with
      // "Wallet session is unavailable".
      if (session?.method === "world-miniapp") {
        setIsRecovering(false);
        return;
      }

      setIsRecovering(true);

      try {
        let recovered: Session | null = null;
        const pendingPrivyMethod = pendingPrivyMethodRef.current;
        const isPendingEmbeddedPrivyLogin =
          pendingPrivyMethod !== null && isEmbeddedPrivyMethod(pendingPrivyMethod);

        if (isPendingEmbeddedPrivyLogin && !privy.authenticated) {
          setSession(null);
          resetXmtpState();
          return;
        }

        const latestPreferred =
          pendingPrivyMethod ?? getLastLoginMethod() ?? preferred;

        if (environment === "world-app" && latestPreferred === "world-miniapp") {
          const stored = loadBackendSession();

          if (
            stored &&
            new Date(stored.session.expiresAt).getTime() > Date.now()
          ) {
            recovered = {
              method: "world-miniapp",
              address: stored.session.walletAddress,
              signerKind: "worldapp",
              signer: new WorldAppSigner(stored.session.walletAddress),
              providerLabel: "World App",
            };
          }
        }

        const explicitPrivyMethod = latestPreferred?.startsWith("privy-")
          ? latestPreferred
          : null;

        if (!recovered && privy.authenticated && explicitPrivyMethod) {
          const method = explicitPrivyMethod;
          const requiresEmbeddedWallet = isEmbeddedPrivyMethod(method);
          const wallet = requiresEmbeddedWallet
            ? privy.embeddedWallet
            : (privy.primaryWallet ?? privy.embeddedWallet);

          if (!wallet) {
            if (!currentSessionRef.current) {
              setSession(null);
              resetXmtpState();
            }
            return;
          }

          if (requiresEmbeddedWallet && !isEmbeddedPrivyWallet(wallet)) {
            throw new Error("Privy embedded wallet is unavailable");
          }

          const signer = await signerFromPrivy(wallet);
          const address = await signer.getAddress();

          recovered = {
            method,
            address,
            signerKind: signer.kind,
            signer,
            providerLabel: "Privy",
          };
        } else if (!recovered && privy.authenticated) {
          // Privy is authenticated but we have no explicit Privy method —
          // typically a stale `privy.primaryWallet` (Privy auto-discovers
          // window.ethereum, e.g. MetaMask, after an embedded login). Don't
          // hijack auth to a wallet the user never picked.
          if (!currentSessionRef.current) {
            setSession(null);
            resetXmtpState();
          }
          return;
        } else if (
          !recovered &&
          preferred === "metamask" &&
          isLikelyMobileBrowser()
        ) {
          const mobileMetaMask = await getConnectedMetaMaskMobileAccount();

          if (mobileMetaMask) {
            const signer = new Eip1193Signer(
              mobileMetaMask.provider,
              mobileMetaMask.address,
            );

            recovered = {
              method: "metamask",
              address: mobileMetaMask.address,
              signerKind: signer.kind,
              signer,
              providerLabel: "MetaMask",
            };
          }
        } else if (!recovered) {
          const account = getAccount(wagmiConfig);

          if (account.isConnected && account.address) {
            const resolvedWallet = resolveConnectedWallet(account.connector?.id, preferred);
            const provider = await getConnectedWalletProvider(account);

            if (resolvedWallet && provider) {
              const signer = new Eip1193Signer(provider, account.address);

              recovered = {
                method: resolvedWallet.method,
                address: account.address,
                signerKind: signer.kind,
                signer,
                providerLabel: resolvedWallet.providerLabel,
              };
            }
          }
        }

        if (cancelled) {
          return;
        }

        if (!recovered) {
          setSession(null);
          resetXmtpState();
          return;
        }

        const recoveryKey = `${recovered.method}:${recovered.address}`;
        if (
          recoveryAttemptRef.current === recoveryKey &&
          session?.method === recovered.method &&
          session.address === recovered.address
        ) {
          return;
        }

        recoveryAttemptRef.current = recoveryKey;
        const allowInteractiveRecovery =
          pendingInteractiveRecoveryRef.current &&
          recovered.method.startsWith("privy-");
        const allowWorldAppRestore = recovered.method === "world-miniapp";
        // Consume the interactive flag synchronously, before awaiting. Otherwise
        // a concurrent effect run (e.g. triggered by Privy auto-discovering
        // window.ethereum and updating `primaryWallet`) reads it as still true
        // and kicks off a parallel SIWE auth against the wrong wallet.
        pendingInteractiveRecoveryRef.current = false;
        await restoreBackendSession(recovered, {
          allowAuthentication: allowInteractiveRecovery,
          allowSignatureRequests: allowInteractiveRecovery || allowWorldAppRestore,
        });
      } catch (cause) {
        if (!cancelled) {
          const message =
            cause instanceof Error ? cause.message : "Failed to recover session";
          setError(message);

          if (currentSessionRef.current) {
            setXmtpStatus("error");
            setXmtpError(message);
          } else {
            setSession(null);
            resetXmtpState();
          }
        }
      } finally {
        if (!cancelled) {
          setIsRecovering(false);
        }
      }
    }

    void recoverSession();

    return () => {
      cancelled = true;
    };
  }, [
    environment,
    preferred,
    privy.authenticated,
    privy.embeddedWallet,
    privy.enabled,
    privy.primaryWallet,
    privy.ready,
    session,
    walletAccount.address,
    walletAccount.isConnected,
    walletAccount.status,
  ]);

  useEffect(
    () => () => {
      void closeSocket();
    },
    [],
  );

  async function connectWithMetaMask() {
    setError(null);

    const providerReady = await waitForMetaMaskProvider(
      isLikelyMobileBrowser() ? 1500 : 0,
    );

    if (!providerReady) {
      if (isLikelyMobileBrowser()) {
        return run(async () => {
          const result = await connectWithMetaMaskMobileSdk();
          const signer = new Eip1193Signer(result.provider, result.address);

          await restoreBackendSession(
            {
              method: "metamask",
              address: result.address,
              signerKind: signer.kind,
              signer,
              providerLabel: "MetaMask",
            },
            { allowAuthentication: true, allowSignatureRequests: true },
          );
        });
      }

      setError(t("provider.metamaskOnlyInjected"));
      return false;
    }

    return run(async () => {
      await connectMetaMask();
      await attachConnectedWallet("metamask", "MetaMask");
    });
  }

  async function connectWithCoinbase() {
    setError(null);
    return run(async () => {
      await connectCoinbase();
      await attachConnectedWallet("coinbase", "Coinbase Wallet");
    });
  }

  async function connectWithWorldApp() {
    setError(null);
    return run(async () => {
      if (!env.worldAppId) {
        throw new Error("Missing NEXT_PUBLIC_WORLD_APP_ID");
      }

      // World App login is a single round-trip: MiniKit's `walletAuth`
      // returns a SIWE message + signature that the backend verifies via
      // ERC-1271. There's no separate challenge-signing step.
      const auth = await authenticateWithWorldApp(
        env.worldAppId,
        apiRef.current!,
      );

      allowSignatureRequestsRef.current = true;

      const nextSession: Session = {
        method: "world-miniapp",
        address: auth.address,
        signerKind: auth.signer.kind,
        signer: auth.signer,
        providerLabel: "World App",
      };

      saveBackendSession(auth.token, auth.session);
      applySession(nextSession);

      await connectRealtime(auth.token);

      try {
        await bootstrapXmtp(auth.token);
      } catch (cause) {
        setXmtpStatus("error");
        setXmtpError(
          cause instanceof Error ? cause.message : "Failed to connect XMTP",
        );
        throw cause;
      }
    });
  }

  async function clearStalePrivyAuth(force = false) {
    // After a failed Privy login (e.g. wallet-creation crash), the user can be
    // left authenticated on Privy with no app session. Retrying a link-based
    // flow then fails with "User already has an account of type X linked."
    // Reset Privy auth so the next login starts clean.
    if (privy.authenticated && (force || !session)) {
      await privy.logout();
    }
  }

  function startGoogleLogin() {
    setError(null);
    pendingInteractiveRecoveryRef.current = true;
    pendingPrivyMethodRef.current = "privy-google";
    recoveryAttemptRef.current = null;
    void run(async () => {
      await resetForEmbeddedPrivyLogin();
      await clearStalePrivyAuth(true);
      privy.startGoogleLogin();
    });
  }

  function startEmailLogin() {
    setError(null);
    pendingInteractiveRecoveryRef.current = true;
    pendingPrivyMethodRef.current = "privy-email";
    recoveryAttemptRef.current = null;
    void run(async () => {
      await resetForEmbeddedPrivyLogin();
      await clearStalePrivyAuth(true);
      privy.startEmailLogin();
    });
  }

  function startPhoneLogin() {
    setError(null);
    pendingInteractiveRecoveryRef.current = true;
    pendingPrivyMethodRef.current = "privy-phone";
    recoveryAttemptRef.current = null;
    void run(async () => {
      await resetForEmbeddedPrivyLogin();
      await clearStalePrivyAuth(true);
      privy.startPhoneLogin();
    });
  }

  function startWalletLogin() {
    setError(null);
    pendingInteractiveRecoveryRef.current = true;
    pendingPrivyMethodRef.current = "privy-wallet";

    if (privy.authenticated && privy.primaryWallet) {
      const method = preferred?.startsWith("privy-") ? preferred : "privy-wallet";
      void run(async () => {
        await attachPrivyWallet(method);
      });
      return;
    }

    void run(async () => {
      await clearStalePrivyAuth();
      privy.startWalletLogin();
    });
  }

  async function signCurrentMessage() {
    if (!session) {
      return false;
    }

    setError(null);
    return run(async () => {
      const nextMessage = buildSigningMessage({
        method: session.method,
        address: session.address,
      });
      const nextSignature = await session.signer.signMessage(nextMessage);
      setMessage(nextMessage);
      setSignature(nextSignature);
    });
  }

  function getActiveBackendToken() {
    const activeSession = currentSessionRef.current;
    const stored = loadBackendSession();

    if (!activeSession || !stored) {
      throw new Error("Backend session is unavailable");
    }

    if (
      stored.session.walletAddress.toLowerCase() !==
      activeSession.address.toLowerCase()
    ) {
      throw new Error("Backend session does not match the active wallet");
    }

    return stored.token;
  }

  function upsertKharismaGroup(
    list: KharismaGroupSummary[],
    nextGroup: KharismaGroupSummary,
  ) {
    const filtered = list.filter((group) => group.groupId !== nextGroup.groupId);
    return [nextGroup, ...filtered];
  }

  async function loadKharismaGroups(token: string) {
    setKharismaStatus("listing");
    setKharismaError(null);

    try {
      const result = await apiRef.current!.listKharismaGroups(token);
      setKharismaGroups(result.groups);
      setKharismaStatus("ready");
      return true;
    } catch (cause) {
      setKharismaStatus("error");
      setKharismaError(
        cause instanceof Error ? cause.message : "Failed to load groups",
      );
      return false;
    }
  }

  async function refreshKharismaStatus(token: string) {
    const result = await apiRef.current!.getKharismaStatus(token);
    setKharismaProfile(result.profile);
    return result.profile;
  }

  async function refreshKharismaGroups() {
    if (xmtpStatus !== "connected" || !xmtpInfo?.inboxId) {
      setKharismaError("Connect XMTP before loading Kharisma groups.");
      setKharismaStatus("error");
      return false;
    }

    try {
      const token = getActiveBackendToken();
      await refreshKharismaStatus(token);
      return await loadKharismaGroups(token);
    } catch (cause) {
      setKharismaStatus("error");
      setKharismaError(
        cause instanceof Error ? cause.message : "Failed to load groups",
      );
      return false;
    }
  }

  async function openKharismaWorldIdFlow(
    input: { token: string; action: "identity" | "human"; handle?: string },
  ): Promise<KharismaWorldIdFlowResult> {
    if (xmtpStatus !== "connected" || !xmtpInfo?.inboxId) {
      setKharismaError("Connect XMTP before verifying with World ID.");
      setKharismaStatus("error");
      return {
        ok: false,
        reason: "not-connected",
        message: "Connect XMTP before verifying with World ID.",
      };
    }

    if (pendingWorldIdFlowRef.current) {
      setKharismaError("A World ID verification is already in progress.");
      setKharismaStatus("error");
      return {
        ok: false,
        reason: "already-in-progress",
        message: "A World ID verification is already in progress.",
      };
    }

    setKharismaStatus("verifying");
    setKharismaError(null);
    lastWorldIdErrorMessageRef.current = null;

    try {
      const request = await apiRef.current!.createKharismaWorldIdRequest(
        input.token,
        input.action,
      );

      return await new Promise<KharismaWorldIdFlowResult>((resolve) => {
        const nextFlow: PendingKharismaWorldIdFlow = {
          request,
          action: input.action,
          token: input.token,
          handle: input.handle,
          resolve,
        };
        pendingWorldIdFlowRef.current = nextFlow;
        setPendingWorldIdFlow(nextFlow);
      });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Failed to start World ID verification";
      setKharismaStatus("error");
      setKharismaError(message);
      return { ok: false, reason: "error", message };
    }
  }

  async function handleKharismaWorldIdSuccess(result: IDKitResult) {
    const flow = pendingWorldIdFlowRef.current;

    if (!flow) {
      return;
    }

    worldIdSuccessHandlingRef.current = true;
    const proof = proofFromIdKitResult(result, flow.request.action);

    try {
      if (flow.action === "identity") {
        setKharismaStatus("verifying");
        const response = await apiRef.current!.submitKharismaIdentity({
          token: flow.token,
          proof,
        });
        setKharismaProfile(response.profile);
      } else {
        setKharismaStatus("verifying");
        const response = await apiRef.current!.submitKharismaHuman({
          token: flow.token,
          handle: flow.handle ?? "",
          proof,
        });
        setKharismaProfile(response.profile);
      }

      pendingWorldIdFlowRef.current = null;
      setKharismaStatus("ready");
      flow.resolve({ ok: true });
    } catch (cause) {
      const message = kharismaRequestErrorMessage(cause);
      pendingWorldIdFlowRef.current = null;
      if (flow.action === "human") {
        setKharismaStatus(kharismaGroups.length > 0 ? "ready" : "idle");
        flow.resolve({ ok: false, reason: "submit-error", message });
      } else {
        setKharismaStatus("error");
        setKharismaError(message);
        flow.resolve({ ok: false, reason: "error", message });
      }
    } finally {
      worldIdSuccessHandlingRef.current = false;
      setPendingWorldIdFlow(null);
    }
  }

  function handleKharismaWorldIdError(errorCode: IDKitErrorCodes) {
    const flow = pendingWorldIdFlowRef.current;
    const message = worldIdErrorMessage(errorCode);

    pendingWorldIdFlowRef.current = null;
    setKharismaStatus("error");
    setKharismaError(message);
    lastWorldIdErrorMessageRef.current = message;
    setPendingWorldIdFlow(null);
    if (flow?.action === "human") {
      handlePromptStateRef.current = null;
      setHandlePromptState(null);
    }
    flow?.resolve({
      ok: false,
      reason: "error",
      message,
    });
  }

  function handleKharismaWorldIdOpenChange(open: boolean) {
    if (open) {
      return;
    }

    // In World App, IDKit fires onOpenChange(false) immediately after onSuccess
    // in the same render cycle. Don't cancel the flow if the success handler is
    // already processing the result.
    if (worldIdSuccessHandlingRef.current) {
      return;
    }

    const flow = pendingWorldIdFlowRef.current;
    pendingWorldIdFlowRef.current = null;
    setPendingWorldIdFlow(null);

    if (flow) {
      setKharismaStatus(kharismaGroups.length > 0 ? "ready" : "idle");
      if (flow.action === "human") {
        handlePromptStateRef.current = null;
        setHandlePromptState(null);
      }
      flow.resolve({ ok: false, reason: "cancelled" });
    }
  }

  function requestHandle(suggested: string, error: string | null = null) {
    return new Promise<string | null>((resolve) => {
      const nextPrompt: HandlePromptState = {
        open: true,
        suggested,
        busy: false,
        error,
        resolve,
      };
      handlePromptStateRef.current = nextPrompt;
      setHandlePromptState(nextPrompt);
    });
  }

  function handleHandlePromptSubmit(handle: string) {
    const prompt = handlePromptStateRef.current;
    if (!prompt || prompt.busy) return;

    const nextPrompt = {
      ...prompt,
      busy: true,
      error: null,
    };
    handlePromptStateRef.current = nextPrompt;
    setHandlePromptState(nextPrompt);
    prompt.resolve(handle);
  }

  function handleHandlePromptCancel() {
    const prompt = handlePromptStateRef.current;
    if (!prompt || prompt.busy) return;

    handlePromptStateRef.current = null;
    setHandlePromptState(null);
    prompt.resolve(null);
  }

  async function ensureHumanVerification(token: string) {
    let profile = kharismaProfile;
    if (!profile) {
      profile = await refreshKharismaStatus(token);
    }

    if (profile.status === "H" && profile.verificationLevel === "human") {
      return profile;
    }

    if (profile.verificationLevel === "none") {
      const identityResult = await openKharismaWorldIdFlow({
        token,
        action: "identity",
      });
      if (!identityResult.ok) {
        return null;
      }
      profile = await refreshKharismaStatus(token);
    }

    if (!(profile.status === "H" && profile.verificationLevel === "human")) {
      let suggested =
        profile.handle ??
        session?.address.slice(2, 8)?.toLowerCase() ??
        "human";
      let handleError: string | null = null;

      while (!(profile.status === "H" && profile.verificationLevel === "human")) {
        const handle = await requestHandle(suggested, handleError);
        handleError = null;
        if (!handle) {
          return null;
        }

        const humanResult = await openKharismaWorldIdFlow({
          token,
          action: "human",
          handle,
        });
        if (humanResult.ok) {
          handlePromptStateRef.current = null;
          setHandlePromptState(null);
          profile = await refreshKharismaStatus(token);
          break;
        }
        if (humanResult.reason === "submit-error") {
          suggested = handle;
          handleError = humanResult.message ?? "Failed to verify handle.";
          continue;
        }
        handlePromptStateRef.current = null;
        setHandlePromptState(null);
        return null;
      }
    }

    return profile.status === "H" ? profile : null;
  }

  async function createKharismaGroup(input: {
    title: string;
    description: string;
    mediaFile: File;
    thumbnailFile: File;
    languages: GroupLanguageCode[];
    joinPolicy: GroupJoinPolicy;
    maxMembers: number;
  }) {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      setKharismaError("Group title is required.");
      setKharismaStatus("error");
      return false;
    }
    if (input.languages.length === 0) {
      setKharismaError("Select at least one group language.");
      setKharismaStatus("error");
      return false;
    }
    if (!Number.isInteger(input.maxMembers) || input.maxMembers < 2 || input.maxMembers > 200) {
      setKharismaError("Max members must be between 2 and 200.");
      setKharismaStatus("error");
      return false;
    }

    try {
      const token = getActiveBackendToken();
      const verified = await ensureHumanVerification(token);
      if (!verified) {
        setKharismaStatus("error");
        setKharismaError(
          lastWorldIdErrorMessageRef.current ??
            "Human verification is required to create a group.",
        );
        return false;
      }

      // Upload video and thumbnail
      setKharismaStatus("creating");
      const [upload, thumbUpload] = await Promise.all([
        apiRef.current!.uploadMedia(token, input.mediaFile),
        apiRef.current!.uploadMedia(token, input.thumbnailFile),
      ]);

      const response = await apiRef.current!.createKharismaGroup({
        token,
        title: trimmedTitle,
        description: input.description.trim(),
        mediaId: upload.id,
        thumbnailId: thumbUpload.id,
        languages: input.languages,
        joinPolicy: input.joinPolicy,
        maxMembers: input.maxMembers,
      });
      setKharismaGroups((current) =>
        upsertKharismaGroup(current, response.group),
      );
      setKharismaStatus("ready");
      return true;
    } catch (cause) {
      setKharismaStatus("error");
      setKharismaError(
        cause instanceof Error ? cause.message : "Failed to create group",
      );
      return false;
    }
  }

  async function joinKharismaGroup(input: {
    groupId: string;
    syncInboxId: string;
    name?: string;
  }) {
    try {
      const token = getActiveBackendToken();
      const group = kharismaGroups.find((candidate) => candidate.groupId === input.groupId);
      if (!group) {
        throw new Error("Group not found.");
      }

      let name: string | undefined;
      if (group.joinPolicy === "H_HA_AND_A") {
        const profile = kharismaProfile ?? (await refreshKharismaStatus(token));
        if (profile.status === "H" || profile.status === "HA") {
          name = undefined;
        } else {
          const trimmed = input.name?.trim() ?? "";
          if (!MEMBER_NAME_PATTERN.test(trimmed)) {
            setKharismaError(
              "Name must use 3-10 letters, numbers, underscores, or hyphens.",
            );
            setKharismaStatus("error");
            return false;
          }
          name = trimmed;
        }
      } else {
        const verified = await ensureHumanVerification(token);
        if (!verified) {
          setKharismaStatus("error");
          setKharismaError(
            lastWorldIdErrorMessageRef.current ??
              "Verification is required to join this group.",
          );
          return false;
        }
      }

      setKharismaStatus("joining");
      await apiRef.current!.joinKharismaGroup({
        token,
        groupId: input.groupId,
        syncInboxId: input.syncInboxId,
        ...(name ? { name } : {}),
      });
      await refreshKharismaStatus(token);
      await loadKharismaGroups(token);
      setKharismaStatus("ready");
      return true;
    } catch (cause) {
      setKharismaStatus("error");
      setKharismaError(kharismaRequestErrorMessage(cause));
      return false;
    }
  }

  async function getInvestmentConfig(input: {
    groupId: string;
    syncInboxId: string;
  }) {
    const token = getActiveBackendToken();
    return apiRef.current!.getInvestmentConfig({
      token,
      groupId: input.groupId,
      syncInboxId: input.syncInboxId,
    });
  }

  async function submitInvestment(input: {
    groupId: string;
    syncInboxId: string;
    token: InvestmentToken;
    amount: string;
  }) {
    const activeSession = currentSessionRef.current;
    if (!activeSession) {
      throw new Error("Connect a wallet before investing.");
    }

    const backendToken = getActiveBackendToken();
    const config = await apiRef.current!.getInvestmentConfig({
      token: backendToken,
      groupId: input.groupId,
      syncInboxId: input.syncInboxId,
    });
    if (!config.destinationAddress) {
      throw new Error("Investment destination is not configured.");
    }

    const chainId = environment === "world-app" ? 480 : 8453;
    const chain = config.chains.find((candidate) => candidate.chainId === chainId);
    if (!chain) {
      throw new Error(
        environment === "world-app"
          ? "World Chain investments are not configured."
          : "Base investments are not configured.",
      );
    }

    const tokenConfig = chain.tokens.find(
      (candidate) => candidate.token === input.token,
    );
    if (!tokenConfig) {
      throw new Error(`${input.token} is not configured on ${chain.name}.`);
    }

    let amount: bigint;
    try {
      amount = parseUnits(input.amount.trim(), tokenConfig.decimals);
    } catch {
      throw new Error("Enter a valid investment amount.");
    }
    if (amount <= 0n) {
      throw new Error("Investment amount must be greater than zero.");
    }

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [config.destinationAddress as Address, amount],
    });

    if (environment === "world-app") {
      const result = (await MiniKit.sendTransaction({
        chainId,
        transactions: [
          {
            to: tokenConfig.address,
            data,
          },
        ],
      })) as {
        data:
          | { status: "success"; userOpHash: string }
          | { status: "error"; error_code: string };
      };

      if (result.data.status === "error") {
        throw new Error(`World App transaction failed: ${result.data.error_code}`);
      }

      return apiRef.current!.verifyInvestment({
        token: backendToken,
        groupId: input.groupId,
        syncInboxId: input.syncInboxId,
        chainId,
        tokenSymbol: input.token,
        amount: amount.toString(),
        userOpHash: result.data.userOpHash,
      });
    }

    if (!(activeSession.signer instanceof Eip1193Signer)) {
      throw new Error("This wallet cannot submit Base transactions.");
    }

    const provider = activeSession.signer.getProvider();
    await ensureBaseChain(provider);
    const txHash = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: activeSession.address,
          to: tokenConfig.address,
          chainId: "0x2105",
          data,
          value: "0x0",
        },
      ],
    })) as ViemHex;

    return apiRef.current!.verifyInvestment({
      token: backendToken,
      groupId: input.groupId,
      syncInboxId: input.syncInboxId,
      chainId,
      tokenSymbol: input.token,
      amount: amount.toString(),
      txHash,
    });
  }

  function requireKharismaGroupConversation(groupId: string) {
    const group = kharismaGroups.find((candidate) => candidate.groupId === groupId);

    if (!group) {
      throw new Error("Group not found.");
    }

    if (!group.isMember) {
      throw new Error("Join this group before opening conversations.");
    }

    if (!group.conversationId) {
      throw new Error("Group conversation is unavailable.");
    }

    return group.conversationId;
  }

  async function listKharismaGroupMessages(groupId: string) {
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const result = await apiRef.current!.listMessages(token, conversationId);
      return result.messages.map(mapMessage);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load group messages";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function sendKharismaGroupMessage(groupId: string, text: string) {
    const trimmed = text.trim();

    if (!trimmed) {
      throw new Error("Message text is required.");
    }

    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const result = await apiRef.current!.sendMessage({
        token,
        conversationId,
        text: trimmed,
      });
      return mapMessage(result.message);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to send message";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function sendKharismaGroupVideo(groupId: string, file: File) {
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const upload = await apiRef.current!.uploadMedia(token, file);

      // Best-effort client-side thumbnail so recipients (and iOS Safari) have
      // a poster frame instead of a blank video element. A failure here must
      // not block the video send.
      let thumbnailMediaId: string | null = null;
      try {
        const thumbnailFile = await extractVideoThumbnail(file);
        const thumbnailUpload = await apiRef.current!.uploadMedia(
          token,
          thumbnailFile,
        );
        thumbnailMediaId = thumbnailUpload.id;
      } catch {
        // Ignore — we still deliver the video without a poster.
      }

      const result = await apiRef.current!.sendVideoMessage({
        token,
        conversationId,
        mediaId: upload.id,
        thumbnailMediaId,
      });
      return mapMessage(result.message);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to send video";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function listGroupThreads(groupId: string) {
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const result = await apiRef.current!.listThreads(token, conversationId);
      return result.threads;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load threads";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function listThreadMessages(groupId: string, threadId: string) {
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const result = await apiRef.current!.listThreadMessages(
        token,
        conversationId,
        threadId,
      );
      return result.messages.map(mapMessage);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load thread messages";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function createGroupThread(input: {
    groupId: string;
    title: string;
    firstMessage?: string;
  }) {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) throw new Error("Thread title is required.");
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(input.groupId);
      const result = await apiRef.current!.createThread({
        token,
        conversationId,
        title: trimmedTitle,
        firstMessage: input.firstMessage?.trim() || undefined,
      });
      return {
        thread: result.thread,
        rootMessage: mapMessage(result.rootMessage),
        firstMessage: result.firstMessage
          ? mapMessage(result.firstMessage)
          : null,
      };
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to create thread";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function sendThreadMessage(
    groupId: string,
    threadId: string,
    text: string,
  ) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message text is required.");
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const result = await apiRef.current!.sendThreadMessage({
        token,
        conversationId,
        threadId,
        text: trimmed,
      });
      return mapMessage(result.message);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to send message";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function sendThreadVideo(
    groupId: string,
    threadId: string,
    file: File,
  ) {
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const conversationId = requireKharismaGroupConversation(groupId);
      const upload = await apiRef.current!.uploadMedia(token, file);

      let thumbnailMediaId: string | null = null;
      try {
        const thumbnailFile = await extractVideoThumbnail(file);
        const thumbnailUpload = await apiRef.current!.uploadMedia(
          token,
          thumbnailFile,
        );
        thumbnailMediaId = thumbnailUpload.id;
      } catch {
        // Ignore — we still deliver the video without a poster.
      }

      const result = await apiRef.current!.sendThreadVideo({
        token,
        conversationId,
        threadId,
        mediaId: upload.id,
        thumbnailMediaId,
      });
      return mapMessage(result.message);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to send video";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function listLatestThreads(limit?: number) {
    setKharismaError(null);
    try {
      const token = getActiveBackendToken();
      const result = await apiRef.current!.listLatestThreads(token, limit);
      return result.threads;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load latest threads";
      setKharismaError(message);
      throw new Error(message);
    }
  }

  async function logout() {
    setError(null);
    return run(async () => {
      await closeSocket();
      clearBackendSession();
      resetXmtpState();
      resetKharismaState();

      if (getAccount(wagmiConfig).isConnected) {
        await disconnect(wagmiConfig);
      }

      if (privy.authenticated) {
        await privy.logout();
      }

      await disconnectMetaMaskMobileSdk();

      clearSessionButKeepLoginHint();
      recoveryAttemptRef.current = null;
      restoreInFlightRef.current = null;
      allowSignatureRequestsRef.current = false;
      pendingInteractiveRecoveryRef.current = false;
      currentSessionRef.current = null;
      setSession(null);
      setSignature(null);
      setMessage("");
      setPreferred(getLastLoginMethod());
    });
  }

  return (
    <SessionContext.Provider
      value={{
        environment,
        session,
        preferred,
        signature,
        message,
        error,
        xmtpStatus,
        xmtpError,
        xmtpInfo,
        xmtpChats,
        latestXmtpMessageEvent,
        kharismaStatus,
        kharismaError,
        kharismaProfile,
        kharismaGroups,
        isBusy,
        isRecovering,
        privyAvailability,
        worldAppAvailability,
        connectWithMetaMask,
        connectWithCoinbase,
        connectWithWorldApp,
        startGoogleLogin,
        startEmailLogin,
        startPhoneLogin,
        startWalletLogin,
        signCurrentMessage,
        refreshKharismaGroups,
        createKharismaGroup,
        joinKharismaGroup,
        getInvestmentConfig,
        submitInvestment,
        listKharismaGroupMessages,
        sendKharismaGroupMessage,
        sendKharismaGroupVideo,
        listGroupThreads,
        listThreadMessages,
        createGroupThread,
        sendThreadMessage,
        sendThreadVideo,
        listLatestThreads,
        logout,
      }}
    >
      {children}
      {pendingWorldIdFlow ? (
        <IDKitRequestWidget
          key={[
            pendingWorldIdFlow.request.action,
            pendingWorldIdFlow.request.rpContext.nonce,
          ].join(":")}
          open={true}
          onOpenChange={handleKharismaWorldIdOpenChange}
          app_id={pendingWorldIdFlow.request.appId}
          action={pendingWorldIdFlow.request.action}
          rp_context={pendingWorldIdFlow.request.rpContext}
          allow_legacy_proofs={true}
          environment={pendingWorldIdFlow.request.environment}
          preset={orbLegacy({ signal: pendingWorldIdFlow.request.signal })}
          polling={{ interval: 2_000, timeout: 120_000 }}
          onSuccess={handleKharismaWorldIdSuccess}
          onError={handleKharismaWorldIdError}
        />
      ) : null}
      <HandlePromptModal
        open={Boolean(handlePromptState)}
        suggested={handlePromptState?.suggested ?? "human"}
        busy={handlePromptState?.busy ?? false}
        error={handlePromptState?.error ?? null}
        onSubmit={handleHandlePromptSubmit}
        onCancel={handleHandlePromptCancel}
      />
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }

  return value;
}
