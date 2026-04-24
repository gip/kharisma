import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { SessionScreen } from "./session-screen";
import { useSession, type Session } from "@/components/session-provider";
import { I18nProvider } from "@/i18n/i18n-provider";

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
globalThis.URL.revokeObjectURL = vi.fn();

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  usePathname: () => "/groups",
}));

vi.mock("@/components/session-provider", () => ({
  useSession: vi.fn(),
}));

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
    createKharismaGroup: vi.fn().mockResolvedValue(true),
    joinKharismaGroup: vi.fn().mockResolvedValue(true),
    getInvestmentConfig: vi.fn().mockResolvedValue({
      destinationAddress: null,
      chains: [],
    }),
    submitInvestment: vi.fn(),
    listKharismaGroupMessages: vi.fn().mockResolvedValue([]),
    sendKharismaGroupMessage: vi.fn(),
    sendKharismaGroupVideo: vi.fn(),
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

describe("SessionScreen", () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  it("renders Circles header when session exists", () => {
    vi.mocked(useSession).mockReturnValue(createState());

    renderWithI18n(<SessionScreen />);

    expect(screen.getByRole("heading", { name: "Circles" })).toBeVisible();
  });

  it("does not render XMTP status or chat summaries when connected", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 1,
          dmCount: 1,
          groupCount: 0,
        },
        xmtpChats: [
          {
            id: "chat-123",
            kind: "dm",
            title: "DM with inbox-peer",
            peerInboxId: "inbox-peer",
            memberCount: null,
            lastActivityAt: new Date("2026-04-08T10:00:00.000Z"),
            createdAt: new Date("2026-04-07T10:00:00.000Z"),
          },
        ],
      }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.queryByText(/DM with inbox-peer/)).toBeNull();
    expect(screen.queryByText(/chat-123/)).toBeNull();
    expect(screen.queryByText(/inbox-123/)).toBeNull();
  });

  it("renders XMTP errors", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "error",
        xmtpError: "Failed to connect XMTP",
      }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.getByText(/Failed to connect XMTP/)).toBeVisible();
  });

  it("shows loading state while XMTP is connecting", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({ xmtpStatus: "connecting" }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.getByText(/Loading circles/)).toBeVisible();
  });

  it("renders group cards and handles join action", async () => {
    const joinKharismaGroup = vi.fn().mockResolvedValue(true);
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        kharismaStatus: "ready",
        kharismaGroups: [
          {
            groupId: "group-1",
            title: "Example",
            description: "This is a test group for testing",
            mediaUrl: null,
            thumbnailUrl: null,
            languages: ["en", "ko"],
            syncInboxId: "sync-1",
            memberCount: 1,
            maxMembers: 10,
            availableSeats: 9,
            joinPolicy: "H_HA_AND_A",
            isMember: false,
            conversationId: null,
            senders: [],
          },
        ],
        joinKharismaGroup,
      }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.getByText("Example")).toBeVisible();
    expect(screen.getByText("This is a test group for testing")).toBeVisible();
    expect(screen.getByText("en")).toBeVisible();
    expect(screen.getByText("ko")).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText("Your name"), {
      target: { value: "alice_1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));

    await waitFor(() => {
      expect(joinKharismaGroup).toHaveBeenCalledWith({
        groupId: "group-1",
        syncInboxId: "sync-1",
        name: "alice_1",
      });
    });
  });

  it("filters room cards by any selected language", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        kharismaStatus: "ready",
        kharismaGroups: [
          {
            groupId: "group-1",
            title: "English Korean",
            description: "This is a test group for testing",
            mediaUrl: null,
            thumbnailUrl: null,
            languages: ["en", "ko"],
            syncInboxId: "sync-1",
            memberCount: 1,
            maxMembers: 10,
            availableSeats: 9,
            joinPolicy: "H_HA_AND_A",
            isMember: false,
            conversationId: null,
            senders: [],
          },
          {
            groupId: "group-2",
            title: "French",
            description: "This is another test group for testing",
            mediaUrl: null,
            thumbnailUrl: null,
            languages: ["fr"],
            syncInboxId: "sync-2",
            memberCount: 1,
            maxMembers: 10,
            availableSeats: 9,
            joinPolicy: "H_HA_AND_A",
            isMember: false,
            conversationId: null,
            senders: [],
          },
        ],
      }),
    );

    renderWithI18n(<SessionScreen />);

    fireEvent.click(screen.getByRole("button", { name: "KO" }));

    expect(screen.getByText("English Korean")).toBeVisible();
    expect(screen.queryByText("French")).toBeNull();
  });

  it("opens non-member room videos in a playback modal", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        kharismaStatus: "ready",
        kharismaGroups: [
          {
            groupId: "group-1",
            title: "Example",
            description: "This is a test group for testing",
            mediaUrl: "https://example.com/media/test.mp4",
            thumbnailUrl: "https://example.com/media/thumb.jpg",
            languages: ["en"],
            syncInboxId: "sync-1",
            memberCount: 1,
            maxMembers: 10,
            availableSeats: 9,
            joinPolicy: "H_HA_AND_A",
            isMember: false,
            conversationId: null,
            senders: [],
          },
        ],
      }),
    );

    renderWithI18n(<SessionScreen />);

    fireEvent.click(screen.getByRole("button", { name: /play example video/i }));

    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "https://example.com/media/test.mp4",
    );
    expect(screen.queryByRole("button", { name: /^send$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^redo$/i })).toBeNull();
  });

  it("links joined groups without rendering a join button", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        kharismaStatus: "ready",
        kharismaGroups: [
          {
            groupId: "group-1",
            title: "Example",
            description: "This is a test group for testing",
            mediaUrl: null,
            thumbnailUrl: null,
            languages: ["en"],
            syncInboxId: "sync-1",
            memberCount: 1,
            maxMembers: 10,
            availableSeats: 9,
            joinPolicy: "H_ONLY",
            isMember: true,
            conversationId: "xmtp-group-1",
            senders: [],
          },
        ],
      }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.getByRole("link", { name: /example/i })).toHaveAttribute(
      "href",
      "/groups/group-1",
    );
    expect(screen.queryByRole("button", { name: /^join$/i })).toBeNull();
  });

  it("opens joined group videos without removing the group link", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        kharismaStatus: "ready",
        kharismaGroups: [
          {
            groupId: "group-1",
            title: "Example",
            description: "This is a test group for testing",
            mediaUrl: "https://example.com/media/test.mp4",
            thumbnailUrl: "https://example.com/media/thumb.jpg",
            languages: ["en"],
            syncInboxId: "sync-1",
            memberCount: 1,
            maxMembers: 10,
            availableSeats: 9,
            joinPolicy: "H_ONLY",
            isMember: true,
            conversationId: "xmtp-group-1",
            senders: [],
          },
        ],
      }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.getByRole("link", { name: /example/i })).toHaveAttribute(
      "href",
      "/groups/group-1",
    );

    fireEvent.click(screen.getByRole("button", { name: /play example video/i }));

    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "https://example.com/media/test.mp4",
    );
    expect(screen.getByRole("link", { name: /example/i })).toHaveAttribute(
      "href",
      "/groups/group-1",
    );
  });

  it("redirects back to login when no recoverable session exists", async () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        session: null,
        isRecovering: false,
      }),
    );

    renderWithI18n(<SessionScreen />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("shows protected-route loading while session recovery is unresolved", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        session: null,
        isRecovering: true,
      }),
    );

    renderWithI18n(<SessionScreen />);

    expect(screen.getByText("Loading with kharisma...")).toBeVisible();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("opens create room modal when + button is clicked", async () => {
    const createKharismaGroup = vi.fn().mockResolvedValue(true);
    vi.mocked(useSession).mockReturnValue(
      createState({
        xmtpStatus: "connected",
        xmtpInfo: {
          network: "production",
          inboxId: "inbox-123",
          identity: "0x1111111111111111111111111111111111111111",
          installationId: "install-123",
          identityCount: 1,
          installationCount: 1,
          conversationCount: 0,
          dmCount: 0,
          groupCount: 0,
        },
        kharismaStatus: "ready",
        createKharismaGroup,
      }),
    );

    renderWithI18n(<SessionScreen />);

    fireEvent.click(screen.getByLabelText("Create circle"));

    expect(await screen.findByText("Create a circle")).toBeVisible();
    expect(screen.getByPlaceholderText("Circle name")).toBeVisible();
    expect(
      screen.getByPlaceholderText("Description (at least 20 characters)"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^create$/i }),
    ).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "EN" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Select at least one language.")).toBeVisible();
  });
});
