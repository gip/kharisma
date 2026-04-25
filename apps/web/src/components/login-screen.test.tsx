import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { LoginScreen } from "./login-screen";
import { useSession, type Session } from "@/components/session-provider";
import { I18nProvider } from "@/i18n/i18n-provider";

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: vi.fn(),
}));

function createSession(method: Session["method"]): Session {
  return {
    method,
    address: "0x1111111111111111111111111111111111111111",
    signerKind: "eip1193",
    signer: {
      kind: "eip1193",
      getAddress: vi.fn(),
      signMessage: vi.fn(),
    },
    providerLabel: "MetaMask",
  };
}

function createState(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    environment: "web" as const,
    session: null,
    preferred: null,
    signature: null,
    message: "",
    error: null,
    xmtpStatus: "idle" as const,
    xmtpError: null,
    xmtpInfo: null,
    xmtpChats: [],
    latestXmtpMessageEvent: null,
    messageVisibility: "all" as const,
    setMessageVisibility: vi.fn(),
    kharismaStatus: "idle" as const,
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

describe("LoginScreen", () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  it("renders the web Kharisma login screen", () => {
    vi.mocked(useSession).mockReturnValue(createState());

    renderWithI18n(<LoginScreen />);

    expect(screen.getByRole("heading", { name: "Kharisma" })).toBeVisible();
    expect(
      screen.getByText(
        "Conviction from humans. Execution by agents. Capital that follows.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeVisible();
    expect(screen.queryByText(new RegExp("de" + "mo", "i"))).toBeNull();
  });

  it("shows World App UI when environment is world-app", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        environment: "world-app",
        worldAppAvailability: { enabled: true },
      }),
    );

    renderWithI18n(<LoginScreen />);

    expect(screen.getByRole("button", { name: /continue with world app/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /connect wallet/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /continue with email/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /continue with phone/i })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.queryByText(/sms/i)).toBeNull();
  });

  it("disables email and phone login when Privy is unavailable", () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        privyAvailability: { enabled: false, reason: "Privy is not configured." },
      }),
    );

    renderWithI18n(<LoginScreen />);

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue with phone/i })).toBeDisabled();
    expect(screen.getByText("Privy is not configured.")).toBeVisible();
  });

  it("starts the Privy wallet flow from the primary web action", () => {
    const startWalletLogin = vi.fn();
    vi.mocked(useSession).mockReturnValue(createState({ startWalletLogin }));

    renderWithI18n(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(startWalletLogin).toHaveBeenCalledTimes(1);
  });

  it("starts email and phone login from the secondary actions", () => {
    const startEmailLogin = vi.fn();
    const startPhoneLogin = vi.fn();
    vi.mocked(useSession).mockReturnValue(
      createState({
        startEmailLogin,
        startPhoneLogin,
      }),
    );

    renderWithI18n(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue with phone/i }));

    expect(startEmailLogin).toHaveBeenCalledTimes(1);
    expect(startPhoneLogin).toHaveBeenCalledTimes(1);
  });

  it("falls back to MetaMask when Privy is unavailable", async () => {
    const connectWithMetaMask = vi.fn().mockResolvedValue(true);
    vi.mocked(useSession).mockReturnValue(
      createState({
        privyAvailability: { enabled: false, reason: "Privy is not configured." },
        connectWithMetaMask,
      }),
    );

    renderWithI18n(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    await waitFor(() => {
      expect(connectWithMetaMask).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith("/groups");
    });
  });

  it("redirects immediately when an active session already exists", async () => {
    vi.mocked(useSession).mockReturnValue(
      createState({
        session: createSession("metamask"),
      }),
    );

    renderWithI18n(<LoginScreen />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/groups");
    });
  });
});
