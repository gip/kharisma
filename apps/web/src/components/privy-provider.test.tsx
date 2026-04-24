import { fireEvent, render, screen } from "@testing-library/react";
import {
  KharismaPrivyProvider,
  useKharismaPrivy,
} from "@/components/privy-provider";

const privyState = vi.hoisted(() => ({
  authenticated: false,
  wallets: [],
}));

const loginMock = vi.hoisted(() => vi.fn());
const linkEmailMock = vi.hoisted(() => vi.fn());
const linkPhoneMock = vi.hoisted(() => vi.fn());
const linkWalletMock = vi.hoisted(() => vi.fn());
const createWalletMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/wallet/runtime", () => ({
  getPublicEnv: () => ({
    privyAppId: "privy-app-id",
  }),
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getEmbeddedConnectedWallet: vi.fn((wallets: unknown[]) =>
    wallets.find(
      (wallet) =>
        typeof wallet === "object" &&
        wallet !== null &&
        "walletClientType" in wallet &&
        wallet.walletClientType === "privy",
    ) ?? null,
  ),
  usePrivy: () => ({
    ready: true,
    authenticated: privyState.authenticated,
    logout: logoutMock,
  }),
  useWallets: () => ({
    wallets: privyState.wallets,
    ready: true,
  }),
  useCreateWallet: () => ({
    createWallet: createWalletMock,
  }),
  useLogin: () => ({
    login: loginMock,
  }),
  useLinkAccount: () => ({
    linkEmail: linkEmailMock,
    linkPhone: linkPhoneMock,
    linkWallet: linkWalletMock,
  }),
}));

function Harness() {
  const privy = useKharismaPrivy();

  return (
    <>
      <button type="button" onClick={privy.startWalletLogin}>
        connect wallet
      </button>
      <button type="button" onClick={privy.startPhoneLogin}>
        phone login
      </button>
    </>
  );
}

describe("KharismaPrivyProvider", () => {
  beforeEach(() => {
    privyState.authenticated = false;
    privyState.wallets = [];
    loginMock.mockReset();
    linkEmailMock.mockReset();
    linkPhoneMock.mockReset();
    linkWalletMock.mockReset();
    createWalletMock.mockClear();
  });

  it("starts wallet login when the user is not authenticated", () => {
    render(
      <KharismaPrivyProvider>
        <Harness />
      </KharismaPrivyProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(loginMock).toHaveBeenCalledWith({ loginMethods: ["wallet"] });
    expect(linkWalletMock).not.toHaveBeenCalled();
  });

  it("links a wallet when the user is already authenticated", () => {
    privyState.authenticated = true;

    render(
      <KharismaPrivyProvider>
        <Harness />
      </KharismaPrivyProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(linkWalletMock).toHaveBeenCalledTimes(1);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("starts phone login directly even when Privy still has stale auth", () => {
    privyState.authenticated = true;

    render(
      <KharismaPrivyProvider>
        <Harness />
      </KharismaPrivyProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /phone login/i }));

    expect(loginMock).toHaveBeenCalledWith({ loginMethods: ["sms"] });
    expect(linkPhoneMock).not.toHaveBeenCalled();
  });
});
