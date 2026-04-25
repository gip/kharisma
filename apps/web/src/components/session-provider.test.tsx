import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState, type ReactElement } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KharismaProfile } from "@/backend/types";
import {
  SessionProvider,
  useSession,
} from "@/components/session-provider";
import { en } from "@/i18n/en";
import { I18nProvider } from "@/i18n/i18n-provider";
import { wagmiConfig } from "@/wallet/wagmi";

function renderWithI18n(ui: ReactElement) {
  const result = render(<I18nProvider>{ui}</I18nProvider>);
  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(<I18nProvider>{next}</I18nProvider>),
  };
}

const SESSION_EXPIRES_AT = "2999-04-20T13:00:00.000Z";

const connectMetaMaskMock = vi.fn();
const connectCoinbaseMock = vi.fn();
const requestChallengeMock = vi.fn();
const verifyChallengeMock = vi.fn();
const bootstrapXmtpMock = vi.fn();
const createKharismaWorldIdRequestMock = vi.fn();
const getKharismaStatusMock = vi.fn();
const submitKharismaIdentityMock = vi.fn();
const submitKharismaHumanMock = vi.fn();
const listKharismaGroupsMock = vi.fn();
const createKharismaGroupMock = vi.fn();
const joinKharismaGroupMock = vi.fn();
const uploadMediaMock = vi.fn();
const listMessagesMock = vi.fn();
const sendMessageMock = vi.fn();
const idKitWidgetPropsMock = vi.fn();
const disconnectMock = vi.fn().mockResolvedValue(undefined);
const disconnectMetaMaskMobileSdkMock = vi.fn().mockResolvedValue(undefined);
const closeSocketMock = vi.fn().mockResolvedValue(undefined);
const connectSocketMock = vi.fn().mockResolvedValue(undefined);
const sendSocketMock = vi.fn();
const saveBackendSessionMock = vi.fn();
const clearBackendSessionMock = vi.fn();
const loadBackendSessionMock = vi.fn();
const miniKitMock = vi.hoisted(() => ({
  install: vi.fn(),
  isInWorldApp: vi.fn(),
  signMessage: vi.fn(),
  sendTransaction: vi.fn(),
}));
const privyContextState = vi.hoisted(() => ({
  enabled: false,
  ready: true,
  authenticated: false,
  embeddedWallet: null as unknown,
  primaryWallet: null as unknown,
  startGoogleLogin: vi.fn(),
  startEmailLogin: vi.fn(),
  startPhoneLogin: vi.fn(),
  startWalletLogin: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const providerMock = {
  request: vi.fn(),
};

const connectorMock = {
  id: "metaMask",
  getProvider: vi.fn().mockResolvedValue(providerMock),
};

type AccountConnectorMock = {
  id: string;
  getProvider?: typeof connectorMock.getProvider;
};

let accountState: {
  isConnected: boolean;
  status?: "connecting" | "reconnecting" | "connected" | "disconnected";
  address?: `0x${string}`;
  connector?: AccountConnectorMock;
} = {
  isConnected: false,
  status: "disconnected",
};

vi.mock("@wagmi/core", () => ({
  disconnect: (...args: unknown[]) => disconnectMock(...args),
  getAccount: () => accountState,
}));

vi.mock("wagmi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wagmi")>();
  return {
    ...actual,
    useAccount: () => accountState,
  };
});

const idKitResult = {
  protocol_version: "4.0",
  nonce: "nonce",
  action: "human",
  environment: "staging",
  responses: [
    {
      identifier: "proof_of_human",
      proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
      nullifier: "0xnull",
      issuer_schema_id: 1,
      expires_at_min: 1,
    },
  ],
};

vi.mock("@worldcoin/idkit", () => ({
  IDKitErrorCodes: {
    Timeout: "timeout",
    ConnectionFailed: "connection_failed",
    GenericError: "generic_error",
  },
  IDKitRequestWidget: (props: {
    open: boolean;
    onSuccess: (result: typeof idKitResult) => void;
    onError: (errorCode: "timeout") => void;
  }) => {
    idKitWidgetPropsMock(props);
    return props.open ? (
      <>
        <button type="button" onClick={() => props.onSuccess(idKitResult)}>
          complete world id
        </button>
        <button type="button" onClick={() => props.onError("timeout")}>
          expire world id
        </button>
      </>
    ) : null;
  },
  orbLegacy: vi.fn((input: unknown) => input),
}));

vi.mock("@worldcoin/minikit-js", () => ({
  MiniKit: {
    install: (...args: unknown[]) => miniKitMock.install(...args),
    isInWorldApp: (...args: unknown[]) => miniKitMock.isInWorldApp(...args),
    signMessage: (...args: unknown[]) => miniKitMock.signMessage(...args),
    sendTransaction: (...args: unknown[]) => miniKitMock.sendTransaction(...args),
  },
}));

vi.mock("@/components/privy-provider", () => ({
  useKharismaPrivy: () => privyContextState,
}));

vi.mock("@/wallet/connect-web-wallet", () => ({
  connectMetaMask: (...args: unknown[]) => connectMetaMaskMock(...args),
  connectCoinbase: (...args: unknown[]) => connectCoinbaseMock(...args),
}));

vi.mock("@/wallet/metamask-mobile", () => ({
  connectWithMetaMaskMobileSdk: vi.fn(),
  disconnectMetaMaskMobileSdk: (...args: unknown[]) =>
    disconnectMetaMaskMobileSdkMock(...args),
  getConnectedMetaMaskMobileAccount: vi.fn().mockResolvedValue(null),
  isLikelyMobileBrowser: vi.fn().mockReturnValue(false),
  waitForMetaMaskProvider: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/wallet/runtime", () => ({
  getPublicEnv: () => ({
    privyAppId: "",
    worldAppId: "",
    backendHttpUrl: "http://localhost:4000",
    backendWsUrl: "ws://localhost:4000/ws",
  }),
}));

vi.mock("@/backend/client", () => ({
  BackendApiClient: vi.fn().mockImplementation(() => ({
    requestChallenge: (...args: unknown[]) => requestChallengeMock(...args),
    verifyChallenge: (...args: unknown[]) => verifyChallengeMock(...args),
    bootstrapXmtp: (...args: unknown[]) => bootstrapXmtpMock(...args),
    createKharismaWorldIdRequest: (...args: unknown[]) =>
      createKharismaWorldIdRequestMock(...args),
    getKharismaStatus: (...args: unknown[]) => getKharismaStatusMock(...args),
    submitKharismaIdentity: (...args: unknown[]) =>
      submitKharismaIdentityMock(...args),
    submitKharismaHuman: (...args: unknown[]) =>
      submitKharismaHumanMock(...args),
    listKharismaGroups: (...args: unknown[]) =>
      listKharismaGroupsMock(...args),
    createKharismaGroup: (...args: unknown[]) =>
      createKharismaGroupMock(...args),
    joinKharismaGroup: (...args: unknown[]) =>
      joinKharismaGroupMock(...args),
    uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
    listConversations: vi.fn(),
    listMessages: (...args: unknown[]) => listMessagesMock(...args),
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
    markRead: vi.fn(),
  })),
  saveBackendSession: (...args: unknown[]) => saveBackendSessionMock(...args),
  loadBackendSession: (...args: unknown[]) => loadBackendSessionMock(...args),
  clearBackendSession: (...args: unknown[]) => clearBackendSessionMock(...args),
}));

vi.mock("@/backend/socket", () => ({
  BackendSocket: vi.fn().mockImplementation(() => ({
    connect: (...args: unknown[]) => connectSocketMock(...args),
    close: (...args: unknown[]) => closeSocketMock(...args),
    send: (...args: unknown[]) => sendSocketMock(...args),
  })),
}));

function Harness() {
  const session = useSession();
  const [groupMessageText, setGroupMessageText] = useState("");

  return (
    <div>
      <button type="button" onClick={() => void session.connectWithMetaMask()}>
        connect
      </button>
      <button type="button" onClick={session.startPhoneLogin}>
        phone login
      </button>
      <button type="button" onClick={() => void session.logout()}>
        logout
      </button>
      <div data-testid="session-address">
        {session.session?.address ?? "none"}
      </div>
      <div data-testid="is-recovering">{String(session.isRecovering)}</div>
      <div data-testid="xmtp-status">{session.xmtpStatus}</div>
      <div data-testid="xmtp-error">{session.xmtpError ?? ""}</div>
      <div data-testid="xmtp-chat-count">{session.xmtpChats.length}</div>
      <div data-testid="kharisma-status">{session.kharismaStatus}</div>
      <div data-testid="kharisma-error">{session.kharismaError ?? ""}</div>
      <div data-testid="kharisma-group-count">
        {session.kharismaGroups.length}
      </div>
      <button type="button" onClick={() => void session.refreshKharismaGroups()}>
        refresh groups
      </button>
      <button
        type="button"
        onClick={() =>
          void session.createKharismaGroup({
            title: "Example",
            description: "This is a test description for the group",
            mediaFile: new File(["test"], "test.jpg", { type: "image/jpeg" }),
            thumbnailFile: new File(["thumb"], "thumb.jpg", { type: "image/jpeg" }),
            languages: ["en", "ko"],
            joinPolicy: "H_HA_AND_A",
            maxMembers: 25,
          })
        }
      >
        create group
      </button>
      <button
        type="button"
        onClick={() =>
          void session.joinKharismaGroup({
            groupId: "group-1",
            syncInboxId: "sync-1",
            name: "alice",
          })
        }
      >
        join group
      </button>
      <button
        type="button"
        onClick={() =>
          void session.listKharismaGroupMessages("group-1").then((messages) => {
            setGroupMessageText(
              messages
                .map((message) => message.fallback ?? message.content)
                .filter(Boolean)
                .join("|"),
            );
          }).catch((error: unknown) => {
            setGroupMessageText(error instanceof Error ? error.message : "error");
          })
        }
      >
        load group messages
      </button>
      <button
        type="button"
        onClick={() =>
          void session
            .sendKharismaGroupMessage("group-1", " hello ")
            .then((message) => {
              setGroupMessageText(message.fallback ?? message.content ?? "");
            })
            .catch((error: unknown) => {
              setGroupMessageText(error instanceof Error ? error.message : "error");
            })
        }
      >
        send group message
      </button>
      <div data-testid="group-message-text">{groupMessageText}</div>
    </div>
  );
}

async function submitHandle(handle: string) {
  await screen.findByText(en["handle.title"]);
  fireEvent.change(screen.getByPlaceholderText(en["handle.placeholder"]), {
    target: { value: handle },
  });
  fireEvent.click(screen.getByRole("button", { name: en["handle.submit"] }));
}

async function completeWorldId() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /complete world id/i }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function expireWorldId() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /expire world id/i }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SessionProvider backend XMTP integration", () => {
  beforeEach(() => {
    accountState = { isConnected: false, status: "disconnected" };
    connectMetaMaskMock.mockReset();
    connectCoinbaseMock.mockReset();
    requestChallengeMock.mockReset();
    verifyChallengeMock.mockReset();
    bootstrapXmtpMock.mockReset();
    createKharismaWorldIdRequestMock.mockReset();
    getKharismaStatusMock.mockReset();
    submitKharismaIdentityMock.mockReset();
    submitKharismaHumanMock.mockReset();
    listKharismaGroupsMock.mockReset();
    createKharismaGroupMock.mockReset();
    uploadMediaMock.mockReset();
    uploadMediaMock.mockResolvedValue({
      id: "media-1",
      url: "https://example.com/media/test.jpg",
      mimeType: "image/jpeg",
      contentLength: 1024,
      contentDigest: "abc123",
    });
    joinKharismaGroupMock.mockReset();
    listMessagesMock.mockReset();
    sendMessageMock.mockReset();
    idKitWidgetPropsMock.mockReset();
    disconnectMock.mockClear();
    disconnectMetaMaskMobileSdkMock.mockClear();
    closeSocketMock.mockClear();
    connectSocketMock.mockClear();
    sendSocketMock.mockClear();
    saveBackendSessionMock.mockClear();
    clearBackendSessionMock.mockClear();
    loadBackendSessionMock.mockReset();
    miniKitMock.install.mockReset();
    miniKitMock.isInWorldApp.mockReset();
    miniKitMock.signMessage.mockReset();
    miniKitMock.sendTransaction.mockReset();
    miniKitMock.install.mockReturnValue({ success: true });
    miniKitMock.isInWorldApp.mockReturnValue(false);
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete (window as unknown as { WorldApp?: unknown }).WorldApp;
    privyContextState.enabled = false;
    privyContextState.ready = true;
    privyContextState.authenticated = false;
    privyContextState.embeddedWallet = null;
    privyContextState.primaryWallet = null;
    privyContextState.startGoogleLogin.mockClear();
    privyContextState.startEmailLogin.mockClear();
    privyContextState.startPhoneLogin.mockClear();
    privyContextState.startWalletLogin.mockClear();
    privyContextState.logout.mockClear();
    connectorMock.getProvider.mockClear();
    providerMock.request.mockReset();
    loadBackendSessionMock.mockReturnValue(null);

    connectMetaMaskMock.mockImplementation(async () => {
      accountState = {
        isConnected: true,
        address: "0x1111111111111111111111111111111111111111",
        connector: connectorMock,
      };
    });

    providerMock.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") {
        return "0x2105";
      }

      if (method === "personal_sign") {
        return "0xsigned";
      }

      throw new Error(`Unsupported provider request: ${method}`);
    });

    requestChallengeMock.mockResolvedValue({
      challengeId: "challenge-1",
      message: "please sign",
      expiresAt: SESSION_EXPIRES_AT,
    });

    verifyChallengeMock.mockResolvedValue({
      token: "token-1",
      session: {
        userId: 1,
        sessionId: "session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });
    getKharismaStatusMock.mockResolvedValue({
      profile: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        status: "UNKNOWN",
        verificationLevel: "none",
        humanId: null,
        agentId: null,
        handle: null,
      },
    });
    submitKharismaIdentityMock.mockResolvedValue({
      profile: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        status: "UNKNOWN",
        verificationLevel: "identity",
        humanId: null,
        agentId: null,
        handle: null,
      },
    });
    submitKharismaHumanMock.mockResolvedValue({
      profile: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        status: "H",
        verificationLevel: "human",
        humanId: "human-1",
        agentId: null,
        handle: "creator",
      },
    });
  });

  it("bootstraps backend XMTP after a wallet connects", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 1,
        dmCount: 1,
        groupCount: 0,
      },
      conversations: [
        {
          id: "chat-1",
          kind: "dm",
          title: "DM with peer",
          peerInboxId: "peer",
          memberCount: null,
          lastActivityAt: "2026-04-08T10:00:00.000Z",
          createdAt: "2026-04-08T09:00:00.000Z",
        },
      ],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(requestChallengeMock).toHaveBeenCalledTimes(1);
      expect(verifyChallengeMock).toHaveBeenCalledTimes(1);
      expect(connectSocketMock).toHaveBeenCalledTimes(1);
      expect(bootstrapXmtpMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
      expect(screen.getByTestId("xmtp-chat-count")).toHaveTextContent("1");
    });
  });

  it("uses the embedded Privy wallet for phone login when MetaMask is also linked", async () => {
    const externalProvider = {
      request: vi.fn().mockImplementation(async ({ method }: { method: string }) => {
        if (method === "eth_chainId") {
          return "0x2105";
        }

        if (method === "personal_sign") {
          return "0xexternal";
        }

        throw new Error(`Unsupported external provider request: ${method}`);
      }),
    };
    const embeddedProvider = {
      request: vi.fn().mockImplementation(async ({ method }: { method: string }) => {
        if (method === "eth_chainId") {
          return "0x2105";
        }

        if (method === "personal_sign") {
          return "0xembedded";
        }

        throw new Error(`Unsupported embedded provider request: ${method}`);
      }),
    };
    const externalWallet = {
      address: "0x2222222222222222222222222222222222222222",
      walletClientType: "metamask",
      getEthereumProvider: vi.fn().mockResolvedValue(externalProvider),
    };
    const embeddedWallet = {
      address: "0x3333333333333333333333333333333333333333",
      walletClientType: "privy",
      getEthereumProvider: vi.fn().mockResolvedValue(embeddedProvider),
    };

    privyContextState.enabled = true;
    privyContextState.primaryWallet = externalWallet;
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: null,
        identity: "0x3333333333333333333333333333333333333333",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    const view = renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    accountState = {
      isConnected: true,
      address: "0x2222222222222222222222222222222222222222",
      connector: connectorMock,
    };
    disconnectMock.mockImplementationOnce(async () => {
      accountState = { isConnected: false };
    });

    fireEvent.click(screen.getByRole("button", { name: /phone login/i }));
    await waitFor(() => {
      expect(privyContextState.startPhoneLogin).toHaveBeenCalledTimes(1);
    });

    privyContextState.authenticated = true;
    privyContextState.embeddedWallet = embeddedWallet;

    view.rerender(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(requestChallengeMock).toHaveBeenCalledWith({
        walletAddress: "0x3333333333333333333333333333333333333333",
        chainId: 8453,
        loginMethod: "privy-phone",
      });
      expect(verifyChallengeMock).toHaveBeenCalledWith({
        challengeId: "challenge-1",
        signature: "0xembedded",
      });
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "0x3333333333333333333333333333333333333333",
      );
    });
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(externalWallet.getEthereumProvider).not.toHaveBeenCalled();
    expect(externalProvider.request).not.toHaveBeenCalled();
    expect(providerMock.request).not.toHaveBeenCalled();
  });

  it("keeps Privy phone XMTP signature authorization during overlapping recovery", async () => {
    const embeddedProvider = {
      request: vi.fn().mockImplementation(
        async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_chainId") {
            return "0x2105";
          }

          if (method === "personal_sign") {
            return params?.[0] === "0x5369676e20584d5450"
              ? "0xembedded-xmtp"
              : "0xembedded-auth";
          }

          throw new Error(`Unsupported embedded provider request: ${method}`);
        },
      ),
    };
    const embeddedWallet = {
      address: "0x3333333333333333333333333333333333333333",
      walletClientType: "privy",
      getEthereumProvider: vi.fn().mockResolvedValue(embeddedProvider),
    };
    let onSocketEvent:
      | ((event: {
          type: "xmtp.signature_requested";
          requestId: string;
          message: string;
        }) => void)
      | null = null;
    let resolveChallenge:
      | ((value: {
          challengeId: string;
          message: string;
          expiresAt: string;
        }) => void)
      | null = null;
    let resolveBootstrap: ((value: {
      status: "ready";
      info: {
        network: "production";
        inboxId: string;
        identity: string;
        installationId: string;
        identityCount: number;
        installationCount: number;
        conversationCount: number;
        dmCount: number;
        groupCount: number;
      };
      conversations: [];
    }) => void) | null = null;

    privyContextState.enabled = true;
    requestChallengeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveChallenge = resolve;
        }),
    );
    connectSocketMock.mockImplementationOnce(async (input: unknown) => {
      onSocketEvent = (input as {
        onEvent: NonNullable<typeof onSocketEvent>;
      }).onEvent;
    });
    bootstrapXmtpMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        }),
    );

    const view = renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /phone login/i }));
    await waitFor(() => {
      expect(privyContextState.startPhoneLogin).toHaveBeenCalledTimes(1);
    });

    privyContextState.authenticated = true;
    privyContextState.embeddedWallet = embeddedWallet;

    view.rerender(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(requestChallengeMock).toHaveBeenCalledTimes(1);
    });

    privyContextState.primaryWallet = embeddedWallet;
    view.rerender(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      resolveChallenge!({
        challengeId: "challenge-1",
        message: "please sign",
        expiresAt: SESSION_EXPIRES_AT,
      });
    });

    await waitFor(() => {
      expect(bootstrapXmtpMock).toHaveBeenCalledTimes(1);
      expect(connectSocketMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "0x3333333333333333333333333333333333333333",
      );
    });

    await act(async () => {
      onSocketEvent?.({
        type: "xmtp.signature_requested",
        requestId: "request-1",
        message: "Sign XMTP",
      });
    });

    await waitFor(() => {
      expect(sendSocketMock).toHaveBeenCalledWith({
        type: "xmtp.signature_submit",
        requestId: "request-1",
        signature: "0xembedded-xmtp",
      });
    });
    expect(sendSocketMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "xmtp.signature_rejected",
        error: "Wallet signature requires an explicit connect action",
      }),
    );
    expect(bootstrapXmtpMock).toHaveBeenCalledTimes(1);
    expect(connectSocketMock).toHaveBeenCalledTimes(1);

    resolveBootstrap!({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x3333333333333333333333333333333333333333",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });
  });

  it("resolves the configured provider when the account connector only exposes an id", async () => {
    const configuredMetaMaskConnector = wagmiConfig.connectors.find(
      (connector) => connector.id === "metaMask",
    );
    const getProviderSpy = vi
      .spyOn(configuredMetaMaskConnector!, "getProvider")
      .mockResolvedValue(providerMock as never);

    connectMetaMaskMock.mockImplementation(async () => {
      accountState = {
        isConnected: true,
        address: "0x1111111111111111111111111111111111111111",
        connector: { id: "metaMask" },
      };
    });
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(getProviderSpy).toHaveBeenCalled();
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    getProviderSpy.mockRestore();
  });

  it("restores a stored backend session when wagmi reconnects after mount", async () => {
    loadBackendSessionMock.mockReturnValueOnce({
      token: "stored-token",
      session: {
        userId: 1,
        sessionId: "stored-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    }).mockReturnValue(null);
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    const view = renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    accountState = {
      isConnected: true,
      status: "connected",
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };

    view.rerender(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(connectSocketMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: "stored-token" }),
      );
      expect(bootstrapXmtpMock).toHaveBeenCalledWith("stored-token");
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "0x1111111111111111111111111111111111111111",
      );
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
  });

  it("restores a stored World App backend session inside World App", async () => {
    (window as unknown as { WorldApp?: unknown }).WorldApp = {};
    miniKitMock.isInWorldApp.mockReturnValue(true);
    window.localStorage.setItem("kharisma:last-login-method", "world-miniapp");
    loadBackendSessionMock.mockReturnValue({
      token: "stored-world-token",
      session: {
        userId: 1,
        sessionId: "stored-world-session-1",
        walletAddress: "0x2222222222222222222222222222222222222222",
        walletAccountType: "SCW",
        walletChainId: 480,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-world-1",
        identity: "0x2222222222222222222222222222222222222222",
        installationId: "install-world-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(connectSocketMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: "stored-world-token" }),
      );
      expect(bootstrapXmtpMock).toHaveBeenCalledWith("stored-world-token");
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "0x2222222222222222222222222222222222222222",
      );
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
  });

  it("allows XMTP signature requests while restoring a World App session", async () => {
    (window as unknown as { WorldApp?: unknown }).WorldApp = {};
    miniKitMock.isInWorldApp.mockReturnValue(true);
    miniKitMock.signMessage.mockResolvedValue({
      data: { status: "success", signature: "0xworldsigned" },
    });
    window.localStorage.setItem("kharisma:last-login-method", "world-miniapp");
    loadBackendSessionMock.mockReturnValue({
      token: "stored-world-token",
      session: {
        userId: 1,
        sessionId: "stored-world-session-1",
        walletAddress: "0x2222222222222222222222222222222222222222",
        walletAccountType: "SCW",
        walletChainId: 480,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });
    connectSocketMock.mockImplementationOnce(async (input: unknown) => {
      const { onEvent } = input as {
        onEvent: (event: {
          type: "xmtp.signature_requested";
          requestId: string;
          message: string;
        }) => void;
      };
      onEvent({
        type: "xmtp.signature_requested",
        requestId: "world-request-1",
        message: "Sign in World App",
      });
    });
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-world-1",
        identity: "0x2222222222222222222222222222222222222222",
        installationId: "install-world-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(miniKitMock.signMessage).toHaveBeenCalledWith({
        message: "Sign in World App",
      });
      expect(sendSocketMock).toHaveBeenCalledWith({
        type: "xmtp.signature_submit",
        requestId: "world-request-1",
        signature: "0xworldsigned",
      });
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
  });

  it("does not restore a World App backend session outside World App", async () => {
    window.localStorage.setItem("kharisma:last-login-method", "world-miniapp");
    loadBackendSessionMock.mockReturnValue({
      token: "stored-world-token",
      session: {
        userId: 1,
        sessionId: "stored-world-session-1",
        walletAddress: "0x2222222222222222222222222222222222222222",
        walletAccountType: "SCW",
        walletChainId: 480,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-recovering")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("session-address")).toHaveTextContent("none");
    expect(connectSocketMock).not.toHaveBeenCalled();
    expect(bootstrapXmtpMock).not.toHaveBeenCalled();
  });

  it("does not restore a World App backend session for another preferred login method", async () => {
    (window as unknown as { WorldApp?: unknown }).WorldApp = {};
    miniKitMock.isInWorldApp.mockReturnValue(true);
    window.localStorage.setItem("kharisma:last-login-method", "metamask");
    loadBackendSessionMock.mockReturnValue({
      token: "stored-world-token",
      session: {
        userId: 1,
        sessionId: "stored-world-session-1",
        walletAddress: "0x2222222222222222222222222222222222222222",
        walletAccountType: "SCW",
        walletChainId: 480,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-recovering")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("session-address")).toHaveTextContent("none");
    expect(connectSocketMock).not.toHaveBeenCalled();
    expect(bootstrapXmtpMock).not.toHaveBeenCalled();
  });

  it("keeps recovery pending while wagmi is reconnecting", async () => {
    accountState = {
      isConnected: false,
      status: "reconnecting",
    };

    const view = renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    expect(screen.getByTestId("is-recovering")).toHaveTextContent("true");

    accountState = {
      isConnected: false,
      status: "disconnected",
    };

    view.rerender(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-recovering")).toHaveTextContent("false");
    });
  });

  it("does not authenticate a background wallet recovery without a stored backend session", async () => {
    accountState = {
      isConnected: true,
      status: "connected",
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValue(null);

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(connectorMock.getProvider).toHaveBeenCalled();
    });

    expect(screen.getByTestId("session-address")).toHaveTextContent("none");
    expect(screen.getByTestId("is-recovering")).toHaveTextContent("false");
    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
    expect(providerMock.request).not.toHaveBeenCalled();
    expect(connectSocketMock).not.toHaveBeenCalled();
  });

  it("rejects background XMTP signature requests during automatic recovery", async () => {
    accountState = {
      isConnected: true,
      status: "connected",
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValueOnce({
      token: "stored-token",
      session: {
        userId: 1,
        sessionId: "stored-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    }).mockReturnValue(null);
    connectSocketMock.mockImplementationOnce(async (input: unknown) => {
      const { onEvent } = input as {
        onEvent: (event: {
          type: "xmtp.signature_requested";
          requestId: string;
          message: string;
        }) => void;
      };
      onEvent({
        type: "xmtp.signature_requested",
        requestId: "request-1",
        message: "Sign this",
      });
    });
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(sendSocketMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "xmtp.signature_rejected",
          requestId: "request-1",
        }),
      );
    });

    expect(providerMock.request).not.toHaveBeenCalled();
  });

  it("lists groups without World ID and uses IDKit for create and join", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });
    createKharismaWorldIdRequestMock
      .mockResolvedValueOnce({
        appId: "app_test",
        action: "identity",
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0xsig",
        },
      })
      .mockResolvedValueOnce({
        appId: "app_test",
        action: "human",
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0xsig",
        },
      });
    listKharismaGroupsMock.mockResolvedValue({
      groups: [
        {
          groupId: "group-1",
          title: "Example",
          description: "This is a test description for the group",
          mediaUrl: null,
          thumbnailUrl: null,
          languages: ["en"],
          syncInboxId: "sync-1",
          memberCount: 1,
          maxMembers: 25,
          availableSeats: 24,
          joinPolicy: "H_ONLY",
          isMember: false,
          conversationId: null,
          senders: [],
        },
      ],
    });
    let currentProfile: KharismaProfile = {
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN" as const,
      verificationLevel: "none" as const,
      humanId: null,
      agentId: null,
      handle: null,
    };
    getKharismaStatusMock.mockImplementation(async () => ({
      profile: currentProfile,
    }));
    submitKharismaIdentityMock.mockImplementation(async () => {
      currentProfile = {
        ...currentProfile,
        verificationLevel: "identity",
      };
      return { profile: currentProfile };
    });
    submitKharismaHumanMock.mockImplementation(async () => {
      currentProfile = {
        ...currentProfile,
        status: "H",
        verificationLevel: "human",
        humanId: "human-1",
        handle: "creator",
      };
      return { profile: currentProfile };
    });
    createKharismaGroupMock.mockResolvedValue({
      group: {
        groupId: "group-2",
        title: "Example",
        description: "This is a test description for the group",
        mediaUrl: "https://example.com/media/test.jpg",
        thumbnailUrl: "https://example.com/media/thumb.jpg",
        languages: ["en", "ko"],
        syncInboxId: "sync-2",
        memberCount: 1,
        maxMembers: 25,
        availableSeats: 24,
        joinPolicy: "H_HA_AND_A",
        isMember: true,
        conversationId: "xmtp-group-2",
        senders: [],
      },
    });
    joinKharismaGroupMock.mockResolvedValue({
      join: {
        groupId: "group-1",
        syncInboxId: "sync-1",
        name: "alice",
        conversationId: "xmtp-group-1",
      },
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    loadBackendSessionMock.mockReturnValue({
      token: "token-1",
      session: {
        userId: 1,
        sessionId: "session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh groups/i }));

    await waitFor(() => {
      expect(screen.getByTestId("kharisma-status")).toHaveTextContent("ready");
      expect(screen.getByTestId("kharisma-group-count")).toHaveTextContent("1");
    });

    expect(listKharismaGroupsMock).toHaveBeenCalledWith("token-1");
    expect(idKitWidgetPropsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /create group/i }));
    await waitFor(() => {
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          app_id: "app_test",
          action: "identity",
          environment: "staging",
        }),
      );
    });
    await completeWorldId();

    await submitHandle("creator");

    await waitFor(() => {
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          app_id: "app_test",
          action: "human",
          environment: "staging",
        }),
      );
    });
    await completeWorldId();

    await waitFor(() => {
      expect(uploadMediaMock).toHaveBeenCalled();
      expect(submitKharismaIdentityMock).toHaveBeenCalledWith({
        token: "token-1",
        proof: idKitResult,
      });
      expect(submitKharismaHumanMock).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "token-1",
          proof: idKitResult,
          handle: "creator",
        }),
      );
      expect(createKharismaGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "token-1",
          title: "Example",
          description: "This is a test description for the group",
          mediaId: "media-1",
          thumbnailId: "media-1",
          languages: ["en", "ko"],
          joinPolicy: "H_HA_AND_A",
          maxMembers: 25,
        }),
      );
      expect(screen.getByTestId("kharisma-group-count")).toHaveTextContent("2");
    });

    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => {
      expect(joinKharismaGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "token-1",
          groupId: "group-1",
          syncInboxId: "sync-1",
        }),
      );
    });
  });

  it("keeps the handle modal open when a handle is already taken", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });
    createKharismaWorldIdRequestMock.mockImplementation(
      async (_token: string, action: "identity" | "human") => ({
        appId: "app_test",
        action,
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0xsig",
        },
      }),
    );

    let currentProfile: KharismaProfile = {
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN" as const,
      verificationLevel: "none" as const,
      humanId: null,
      agentId: null,
      handle: null,
    };
    getKharismaStatusMock.mockImplementation(async () => ({
      profile: currentProfile,
    }));
    submitKharismaIdentityMock.mockImplementation(async () => {
      currentProfile = {
        ...currentProfile,
        verificationLevel: "identity",
      };
      return { profile: currentProfile };
    });
    submitKharismaHumanMock
      .mockRejectedValueOnce(
        new Error(
          'Kharisma protocol error (conflict): handle "creator" is already in use',
        ),
      )
      .mockImplementationOnce(async (input: { handle: string }) => {
        currentProfile = {
          ...currentProfile,
          status: "H",
          verificationLevel: "human",
          humanId: "human-1",
          handle: input.handle,
        };
        return { profile: currentProfile };
      });
    createKharismaGroupMock.mockResolvedValue({
      group: {
        groupId: "group-2",
        title: "Example",
        description: "This is a test description for the group",
        mediaUrl: "https://example.com/media/test.jpg",
        thumbnailUrl: "https://example.com/media/thumb.jpg",
        languages: ["en", "ko"],
        syncInboxId: "sync-2",
        memberCount: 1,
        maxMembers: 25,
        availableSeats: 24,
        joinPolicy: "H_HA_AND_A",
        isMember: true,
        conversationId: "xmtp-group-2",
        senders: [],
      },
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    loadBackendSessionMock.mockReturnValue({
      token: "token-1",
      session: {
        userId: 1,
        sessionId: "session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    fireEvent.click(screen.getByRole("button", { name: /create group/i }));
    await waitFor(() => {
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "identity" }),
      );
    });
    await completeWorldId();

    await submitHandle("creator");
    await waitFor(() => {
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "human" }),
      );
    });
    await completeWorldId();

    await waitFor(() => {
      expect(
        screen.getByText('handle "creator" is already in use'),
      ).toBeInTheDocument();
    });
    expect(submitKharismaHumanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "token-1",
        proof: idKitResult,
        handle: "creator",
      }),
    );

    await submitHandle("maker");
    await waitFor(() => {
      expect(createKharismaWorldIdRequestMock).toHaveBeenCalledTimes(3);
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "human" }),
      );
    });
    await completeWorldId();

    await waitFor(() => {
      expect(submitKharismaHumanMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          token: "token-1",
          proof: idKitResult,
          handle: "maker",
        }),
      );
      expect(createKharismaGroupMock).toHaveBeenCalled();
      expect(screen.queryByText(en["handle.title"])).not.toBeInTheDocument();
    });
  });

  it("requests a fresh World ID QR after an expired create verification", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });
    createKharismaWorldIdRequestMock
      .mockResolvedValueOnce({
        appId: "app_test",
        action: "identity",
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce-1",
          created_at: 1,
          expires_at: 2,
          signature: "0xsig1",
        },
      })
      .mockResolvedValueOnce({
        appId: "app_test",
        action: "identity",
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce-2",
          created_at: 3,
          expires_at: 4,
          signature: "0xsig2",
        },
      });
    getKharismaStatusMock.mockResolvedValue({
      profile: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        status: "UNKNOWN",
        verificationLevel: "none",
        humanId: null,
        agentId: null,
        handle: null,
      } satisfies KharismaProfile,
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    loadBackendSessionMock.mockReturnValue({
      token: "token-1",
      session: {
        userId: 1,
        sessionId: "session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    fireEvent.click(screen.getByRole("button", { name: /create group/i }));
    await waitFor(() => {
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "identity",
          rp_context: expect.objectContaining({ nonce: "nonce-1" }),
        }),
      );
    });

    await expireWorldId();

    await waitFor(() => {
      expect(screen.getByTestId("kharisma-error")).toHaveTextContent(
        "World ID verification expired or could not be completed. Try again to generate a fresh QR code.",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /create group/i }));

    await waitFor(() => {
      expect(createKharismaWorldIdRequestMock).toHaveBeenCalledTimes(2);
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "identity",
          rp_context: expect.objectContaining({ nonce: "nonce-2" }),
        }),
      );
    });
  });

  it("shows a human-readable message when World ID already joined with another wallet", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });
    createKharismaWorldIdRequestMock
      .mockResolvedValueOnce({
        appId: "app_test",
        action: "identity",
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0xsig",
        },
      })
      .mockResolvedValueOnce({
        appId: "app_test",
        action: "human",
        environment: "staging",
        signal: "inbox-1",
        rpContext: {
          rp_id: "rp_test",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0xsig",
        },
      });
    listKharismaGroupsMock.mockResolvedValue({
      groups: [
        {
          groupId: "group-1",
          title: "Example",
          description: "This is a test description for the group",
          mediaUrl: null,
          thumbnailUrl: null,
          languages: ["en"],
          syncInboxId: "sync-1",
          memberCount: 1,
          maxMembers: 25,
          availableSeats: 24,
          joinPolicy: "H_ONLY",
          isMember: false,
          conversationId: null,
          senders: [],
        },
      ],
    });
    let currentProfile: KharismaProfile = {
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN" as const,
      verificationLevel: "none" as const,
      humanId: null,
      agentId: null,
      handle: null,
    };
    getKharismaStatusMock.mockImplementation(async () => ({
      profile: currentProfile,
    }));
    submitKharismaIdentityMock.mockImplementation(async () => {
      currentProfile = {
        ...currentProfile,
        verificationLevel: "identity",
      };
      return { profile: currentProfile };
    });
    submitKharismaHumanMock.mockImplementation(async () => {
      currentProfile = {
        ...currentProfile,
        status: "H",
        verificationLevel: "human",
        humanId: "human-1",
        handle: "creator",
      };
      return { profile: currentProfile };
    });
    joinKharismaGroupMock.mockRejectedValue(
      new Error(
        "Kharisma protocol error (already-member): this human has already joined the group",
      ),
    );

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    loadBackendSessionMock.mockReturnValue({
      token: "token-1",
      session: {
        userId: 1,
        sessionId: "session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    fireEvent.click(screen.getByRole("button", { name: /join group/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /complete world id/i })).toBeVisible();
    });
    await completeWorldId();

    await submitHandle("creator");

    await waitFor(() => {
      expect(idKitWidgetPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "human",
        }),
      );
    });
    await completeWorldId();

    await waitFor(() => {
      expect(screen.getByTestId("kharisma-status")).toHaveTextContent("error");
      expect(screen.getByTestId("kharisma-error")).toHaveTextContent(
        "This World ID has already joined this room with another wallet. Sign in with that wallet to open it.",
      );
    });
  });

  it("lists and sends Kharisma group messages by conversation id", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });
    listKharismaGroupsMock.mockResolvedValue({
      groups: [
        {
          groupId: "group-1",
          title: "Example",
          description: "This is a test description for the group",
          mediaUrl: null,
          thumbnailUrl: null,
          languages: ["en"],
          syncInboxId: "sync-1",
          memberCount: 1,
          isMember: true,
          conversationId: "xmtp-group-1",
          senders: [
            {
              inboxId: "inbox-alice",
              name: "alice",
              role: "H",
              walletAddress: "0x1111111111111111111111111111111111111111",
            },
          ],
        },
      ],
    });
    listMessagesMock.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          conversationId: "xmtp-group-1",
          senderInboxId: "inbox-alice",
          sentAt: "2026-04-12T10:00:00.000Z",
          content: null,
          fallback: "alice joined the group",
          deliveryStatus: "published",
        },
      ],
      nextCursor: null,
    });
    sendMessageMock.mockResolvedValue({
      message: {
        id: "message-2",
        conversationId: "xmtp-group-1",
        senderInboxId: "inbox-1",
        sentAt: "2026-04-12T10:01:00.000Z",
        content: "hello",
        fallback: null,
        deliveryStatus: "published",
      },
    });
    loadBackendSessionMock.mockReturnValue({
      token: "token-1",
      session: {
        userId: 1,
        sessionId: "session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("kharisma-group-count")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByRole("button", { name: /load group messages/i }));

    await waitFor(() => {
      expect(listMessagesMock).toHaveBeenCalledWith(
        "token-1",
        "xmtp-group-1",
      );
      expect(screen.getByTestId("group-message-text")).toHaveTextContent(
        "alice joined the group",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /send group message/i }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith({
        token: "token-1",
        conversationId: "xmtp-group-1",
        text: "hello",
      });
      expect(screen.getByTestId("group-message-text")).toHaveTextContent("hello");
    });
  });

  it("resets backend session and closes the websocket on logout", async () => {
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => {
      expect(closeSocketMock).toHaveBeenCalledTimes(1);
      expect(clearBackendSessionMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("session-address")).toHaveTextContent("none");
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("idle");
    });
  });

  it("keeps the wallet session when backend XMTP bootstrap fails", async () => {
    bootstrapXmtpMock.mockRejectedValue(new Error("Failed to connect XMTP"));

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "0x1111111111111111111111111111111111111111",
      );
      expect(screen.getByTestId("xmtp-error")).toHaveTextContent(
        "Failed to connect XMTP",
      );
    });
  });

  it("does not reauthenticate when restored XMTP bootstrap fails with a conflict", async () => {
    accountState = {
      isConnected: true,
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValueOnce({
      token: "stored-token",
      session: {
        userId: 1,
        sessionId: "stored-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    }).mockReturnValue(null);
    bootstrapXmtpMock.mockRejectedValue(
      Object.assign(
        new Error(
          "Failed to reopen persisted XMTP client: [StorageError::Platform] PRAGMA key or salt has incorrect value",
        ),
        { status: 409 },
      ),
    );

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(connectSocketMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: "stored-token" }),
      );
      expect(bootstrapXmtpMock).toHaveBeenCalledWith("stored-token");
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "0x1111111111111111111111111111111111111111",
      );
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("error");
      expect(screen.getByTestId("xmtp-error")).toHaveTextContent(
        "Failed to reopen persisted XMTP client",
      );
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
    expect(providerMock.request).not.toHaveBeenCalled();
    expect(clearBackendSessionMock).not.toHaveBeenCalled();
  });

  it("clears a restored session without reauthenticating when XMTP bootstrap is unauthorized", async () => {
    accountState = {
      isConnected: true,
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValueOnce({
      token: "stored-token",
      session: {
        userId: 1,
        sessionId: "stored-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    }).mockReturnValue(null);
    bootstrapXmtpMock
      .mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }))
      .mockResolvedValueOnce({
        status: "ready",
        info: {
          network: "production",
          inboxId: "inbox-1",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-1",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        conversations: [],
      });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(clearBackendSessionMock).toHaveBeenCalledTimes(1);
      expect(closeSocketMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("session-address")).toHaveTextContent("none");
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("idle");
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
    expect(providerMock.request).not.toHaveBeenCalled();
  });

  it("clears a restored session without reauthenticating when websocket auth fails", async () => {
    accountState = {
      isConnected: true,
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValueOnce({
      token: "stale-token",
      session: {
        userId: 1,
        sessionId: "stale-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    }).mockReturnValue(null);
    connectSocketMock
      .mockRejectedValueOnce(new Error("Session not found"))
      .mockResolvedValueOnce(undefined);
    bootstrapXmtpMock.mockResolvedValue({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(clearBackendSessionMock).toHaveBeenCalledTimes(1);
      expect(closeSocketMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("session-address")).toHaveTextContent("none");
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("idle");
    });

    expect(connectSocketMock).toHaveBeenCalledTimes(1);
    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
    expect(providerMock.request).not.toHaveBeenCalled();
  });

  it("clears a restored session without reauthenticating when backend recovery cannot reload", async () => {
    accountState = {
      isConnected: true,
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValueOnce({
      token: "stale-token",
      session: {
        userId: 1,
        sessionId: "stale-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    }).mockReturnValue(null);
    connectSocketMock.mockRejectedValueOnce(new Error("Backend is down"));
    requestChallengeMock.mockRejectedValueOnce(
      new Error("Cannot reach clients-service at http://localhost:4000. Load failed"),
    );

    renderWithI18n(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("session-address")).toHaveTextContent(
        "none",
      );
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("idle");
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
    expect(providerMock.request).not.toHaveBeenCalled();
  });

  it("deduplicates restore bootstrap calls under strict mode", async () => {
    accountState = {
      isConnected: true,
      address: "0x1111111111111111111111111111111111111111",
      connector: connectorMock,
    };
    loadBackendSessionMock.mockReturnValue({
      token: "stored-token",
      session: {
        userId: 1,
        sessionId: "stored-session-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
        expiresAt: SESSION_EXPIRES_AT,
      },
    });

    let resolveBootstrap: ((value: {
      status: "ready";
      info: {
        network: "production";
        inboxId: string;
        identity: string;
        installationId: string;
        identityCount: number;
        installationCount: number;
        conversationCount: number;
        dmCount: number;
        groupCount: number;
      };
      conversations: [];
    }) => void) | null = null;
    bootstrapXmtpMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        }),
    );

    renderWithI18n(
      <StrictMode>
        <SessionProvider>
          <Harness />
        </SessionProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(bootstrapXmtpMock).toHaveBeenCalledTimes(1);
    });

    resolveBootstrap!({
      status: "ready",
      info: {
        network: "production",
        inboxId: "inbox-1",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "install-1",
        identityCount: 1,
        installationCount: 1,
        conversationCount: 0,
        dmCount: 0,
        groupCount: 0,
      },
      conversations: [],
    });

    await waitFor(() => {
      expect(screen.getByTestId("xmtp-status")).toHaveTextContent("connected");
    });

    expect(requestChallengeMock).not.toHaveBeenCalled();
    expect(verifyChallengeMock).not.toHaveBeenCalled();
  });
});
