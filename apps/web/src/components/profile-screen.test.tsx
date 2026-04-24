import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileScreen } from "@/components/profile-screen";
import { ThemeProvider } from "@/components/theme-provider";
import { useSession, type Session } from "@/components/session-provider";
import { I18nProvider } from "@/i18n/i18n-provider";

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
});
