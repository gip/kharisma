import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileScreen } from "@/components/profile-screen";
import { ThemeProvider } from "@/components/theme-provider";
import { useSession, type Session } from "@/components/session-provider";
import { I18nProvider } from "@/i18n/i18n-provider";
import {
  ensureWorldAppMicrophonePermission,
  ensureWorldAppNotificationPermission,
  getWorldAppPermissionStatuses,
} from "@/media/world-app-permissions";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/components/bottom-nav", () => ({
  BottomNav: () => <nav>bottom nav</nav>,
}));

vi.mock("@/media/world-app-permissions", () => ({
  ensureWorldAppMicrophonePermission: vi.fn(),
  ensureWorldAppNotificationPermission: vi.fn(),
  getWorldAppPermissionStatuses: vi.fn(),
}));

const ensureWorldAppMicrophonePermissionMock = vi.mocked(
  ensureWorldAppMicrophonePermission,
);
const ensureWorldAppNotificationPermissionMock = vi.mocked(
  ensureWorldAppNotificationPermission,
);
const getWorldAppPermissionStatusesMock = vi.mocked(
  getWorldAppPermissionStatuses,
);

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
    environment: "web",
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

describe("ProfileScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
    replaceMock.mockReset();
    ensureWorldAppMicrophonePermissionMock.mockReset();
    ensureWorldAppNotificationPermissionMock.mockReset();
    getWorldAppPermissionStatusesMock.mockReset();
    getWorldAppPermissionStatusesMock.mockResolvedValue({
      notifications: {
        granted: false,
        messageKey: "notifications.notEnabled",
      },
      audio: {
        granted: false,
        messageKey: "recorder.microphoneDisabled",
      },
    });
    vi.mocked(useSession).mockReturnValue(createState());
  });

  it("changes the document theme from the appearance row", async () => {
    render(
      <I18nProvider>
        <ThemeProvider>
          <ProfileScreen />
        </ThemeProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("kharisma:theme")).toBe("light");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /switch to dark mode/i }),
      ).toBeVisible();
    });
  });

  it("does not render notification opt-in outside World App", () => {
    render(
      <I18nProvider>
        <ThemeProvider>
          <ProfileScreen />
        </ThemeProvider>
      </I18nProvider>,
    );

    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    expect(getWorldAppPermissionStatusesMock).not.toHaveBeenCalled();
  });

  it("shows and enables World App permissions from profile", async () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        environment: "world-app",
        session: {
          ...createSession(),
          method: "world-miniapp",
          signerKind: "worldapp",
          providerLabel: "World App",
        },
      }),
    );
    ensureWorldAppNotificationPermissionMock.mockResolvedValue({
      granted: true,
    });
    ensureWorldAppMicrophonePermissionMock.mockResolvedValue({
      granted: true,
    });

    render(
      <I18nProvider>
        <ThemeProvider>
          <ProfileScreen />
        </ThemeProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Notifications are not enabled.")).toBeVisible();
      expect(
        screen.getByText("Enable microphone access for World App in settings."),
      ).toBeVisible();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Enable notifications" }),
    );

    await waitFor(() => {
      expect(ensureWorldAppNotificationPermissionMock).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText("Notifications are enabled.").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Enable audio" }));

    await waitFor(() => {
      expect(ensureWorldAppMicrophonePermissionMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Microphone is ready.")).toBeVisible();
    });
  });

  it("shows rejected World App notification state", async () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        environment: "world-app",
        session: {
          ...createSession(),
          method: "world-miniapp",
          signerKind: "worldapp",
          providerLabel: "World App",
        },
      }),
    );
    ensureWorldAppNotificationPermissionMock.mockResolvedValue({
      granted: false,
      messageKey: "notifications.rejected",
    });

    render(
      <I18nProvider>
        <ThemeProvider>
          <ProfileScreen />
        </ThemeProvider>
      </I18nProvider>,
    );

    const enable = await screen.findByRole("button", {
      name: "Enable notifications",
    });
    await waitFor(() => expect(enable).not.toBeDisabled());
    fireEvent.click(enable);

    expect(
      await screen.findByText(
        "Notifications were declined. Re-enable them from World App settings.",
      ),
    ).toBeVisible();
  });
});
