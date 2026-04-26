import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  ThreadScreen,
  isVisibleMessageFromSenders,
  visibleMessageText,
  visibleMessageTextWithSenders,
} from "./thread-screen";
import { useSession, type Session } from "@/components/session-provider";
import { DEMO_GROUP, DEMO_GROUP_SLUG } from "@/demo/mock-circle";
import { I18nProvider } from "@/i18n/i18n-provider";
import type { XmtpMessage } from "@/xmtp/types";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: vi.fn(),
}));

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function createSession(): Session {
  return {
    method: "coinbase",
    address: "0x1111111111111111111111111111111111111111",
    signerKind: "eip1193",
    signer: {
      kind: "eip1193",
      getAddress: vi.fn(),
      signMessage: vi.fn(),
    },
    providerLabel: "Coinbase Wallet",
  };
}

function createState(
  overrides?: Partial<ReturnType<typeof useSession>>,
): ReturnType<typeof useSession> {
  return {
    environment: "web" as const,
    session: createSession(),
    preferred: null,
    signature: null,
    message: "",
    error: null,
    xmtpStatus: "idle",
    xmtpError: null,
    xmtpInfo: null,
    xmtpChats: [],
    latestXmtpMessageEvent: null,
    messageVisibility: "all",
    setMessageVisibility: vi.fn(),
    kharismaStatus: "idle",
    kharismaError: null,
    kharismaProfile: null,
    kharismaGroups: [],
    isBusy: false,
    isRecovering: false,
    privyAvailability: { enabled: true },
    worldAppAvailability: {
      enabled: false,
      reason: "World App login appears only inside World App.",
    },
    connectWithMetaMask: vi.fn().mockResolvedValue(true),
    connectWithCoinbase: vi.fn().mockResolvedValue(true),
    connectWithWorldApp: vi.fn().mockResolvedValue(true),
    startGoogleLogin: vi.fn(),
    startEmailLogin: vi.fn(),
    startPhoneLogin: vi.fn(),
    startWalletLogin: vi.fn(),
    signCurrentMessage: vi.fn().mockResolvedValue(true),
    refreshKharismaGroups: vi.fn().mockResolvedValue(true),
    completeKharismaHumanSetup: vi.fn().mockResolvedValue(true),
    createKharismaGroup: vi.fn().mockResolvedValue(true),
    joinKharismaGroup: vi.fn().mockResolvedValue(true),
    approveKharismaJoin: vi.fn().mockResolvedValue(true),
    getInvestmentConfig: vi.fn().mockResolvedValue({
      destinationAddress: null,
      chains: [],
    }),
    submitInvestment: vi.fn(),
    listKharismaGroupMessages: vi.fn().mockResolvedValue([]),
    sendKharismaGroupMessage: vi.fn(),
    sendKharismaGroupVideo: vi.fn(),
    refreshThreadCatalog: vi.fn().mockResolvedValue(true),
    listGroupThreads: vi.fn().mockResolvedValue([]),
    listThreadMessages: vi.fn().mockResolvedValue([]),
    createGroupThread: vi.fn(),
    sendThreadMessage: vi.fn(),
    sendThreadVideo: vi.fn(),
    listLatestThreads: vi.fn().mockResolvedValue([]),
    logout: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function message(overrides: Partial<XmtpMessage>): XmtpMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    senderInboxId: "inbox-1",
    sentAt: new Date("2026-04-23T10:00:00.000Z"),
    content: null,
    fallback: null,
    deliveryStatus: "delivered",
    attachment: null,
    replyTo: null,
    threadCreate: null,
    ...overrides,
  };
}

describe("ThreadScreen demo circle", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    vi.mocked(useSession).mockReset();
  });

  it("renders the static BTC strategy conversation", () => {
    const listThreadMessages = vi.fn().mockResolvedValue([]);
    vi.mocked(useSession).mockReturnValue(createState({ listThreadMessages }));

    renderWithI18n(
      <ThreadScreen groupId={DEMO_GROUP_SLUG} threadId="general" />,
    );

    expect(screen.getByText(`${DEMO_GROUP.title} · General`)).toBeVisible();
    expect(screen.getAllByText("Luke").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TheStrat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TheQuote").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maxxy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Luke's agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Max's agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Apr 26, 2:00 PM").length).toBeGreaterThan(0);
    expect(screen.queryByText("just now")).toBeNull();
    expect(screen.getByText(/BTC is at \$78,082 today/i)).toBeVisible();
    expect(screen.getByText(/Revised strategy:/i)).toBeVisible();
    expect(screen.getAllByText(/Vote: YES/i).length).toBeGreaterThan(0);
    expect(listThreadMessages).not.toHaveBeenCalled();
  });

  it("hides demo agents in human-only mode", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({ messageVisibility: "human" }),
    );

    renderWithI18n(
      <ThreadScreen groupId={DEMO_GROUP_SLUG} threadId="general" />,
    );

    expect(screen.getAllByText("Luke").length).toBeGreaterThan(0);
    expect(screen.queryByText("TheStrat")).toBeNull();
    expect(screen.queryByText("TheQuote")).toBeNull();
    expect(screen.queryByText("Maxxy")).toBeNull();
  });

  it("keeps the demo route behind the login gate", () => {
    vi.mocked(useSession).mockReturnValue(createState({ session: null }));

    const { container } = renderWithI18n(
      <ThreadScreen groupId={DEMO_GROUP_SLUG} threadId="general" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});

describe("visibleMessageText", () => {
  it("prefers decoded reply content over XMTP fallback copy", () => {
    expect(
      visibleMessageText(
        message({
          content: "A cool thread",
          fallback: 'Replied with "A cool thread" to an earlier message',
          replyTo: "thread-root",
        }),
      ),
    ).toBe("A cool thread");
  });

  it("does not render thread-create metadata as a chat message", () => {
    expect(
      visibleMessageText(
        message({
          fallback: "Thread: THREAD Z",
          threadCreate: {
            title: "THREAD Z",
            createdAt: "2026-04-23T10:00:00.000Z",
          },
        }),
      ),
    ).toBeNull();
  });

  it("renders investment-recorded messages with a sender handle when available", () => {
    expect(
      visibleMessageTextWithSenders(
        message({
          content:
            "0x1111111111111111111111111111111111111111 invested 0.1 WLD",
          investmentRecorded: {
            investorInboxId: "inbox-alice",
            investorWalletAddress: "0x1111111111111111111111111111111111111111",
            token: "WLD",
            amount: "100000000000000000",
            decimals: 18,
            displayAmount: "0.1",
          },
        }),
        [
          {
            inboxId: "inbox-alice",
            name: "alice",
            role: "H",
            walletAddress: "0x1111111111111111111111111111111111111111",
            humanId: null,
            agentId: null,
            verificationLevel: "human",
          },
        ],
      ),
    ).toBe("alice invested 0.1 WLD");
  });
});

describe("isVisibleMessageFromSenders", () => {
  const senders = [
    {
      inboxId: "inbox-human",
      name: "human",
      role: "H" as const,
      walletAddress: null,
      humanId: "human-1",
      agentId: null,
      verificationLevel: "human" as const,
    },
    {
      inboxId: "inbox-human-agent",
      name: "human-agent",
      role: "HA" as const,
      walletAddress: null,
      humanId: "human-1",
      agentId: "agent-1",
      verificationLevel: "human-agent" as const,
    },
    {
      inboxId: "inbox-agent",
      name: "agent",
      role: "A" as const,
      walletAddress: null,
      humanId: null,
      agentId: null,
      verificationLevel: "none" as const,
    },
  ];

  it("shows every sender in all mode", () => {
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-human-agent" }),
        senders,
        "all",
      ),
    ).toBe(true);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "unknown" }),
        senders,
        "all",
      ),
    ).toBe(true);
  });

  it("shows only role-H senders in human mode", () => {
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-human" }),
        senders,
        "human",
      ),
    ).toBe(true);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-human-agent" }),
        senders,
        "human",
      ),
    ).toBe(false);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-agent" }),
        senders,
        "human",
      ),
    ).toBe(false);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "unknown" }),
        senders,
        "human",
      ),
    ).toBe(false);
  });
});
