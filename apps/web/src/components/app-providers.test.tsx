import { render, screen } from "@testing-library/react";
import { AppProviders } from "./app-providers";

const wagmiProviderMock = vi.fn(
  ({
    children,
  }: {
    children: React.ReactNode;
    reconnectOnMount?: boolean;
  }) => <>{children}</>,
);

vi.mock("wagmi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wagmi")>();
  return {
    ...actual,
    WagmiProvider: (props: {
      children: React.ReactNode;
      config: unknown;
      reconnectOnMount?: boolean;
    }) => wagmiProviderMock(props),
  };
});

vi.mock("@/components/session-provider", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/privy-provider", () => ({
  KharismaPrivyProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("AppProviders", () => {
  beforeEach(() => {
    wagmiProviderMock.mockClear();
  });

  it("enables wallet auto-reconnect on mount", () => {
    render(
      <AppProviders>
        <div>home</div>
      </AppProviders>,
    );

    expect(screen.getByText("home")).toBeVisible();
    expect(wagmiProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reconnectOnMount: true,
      }),
    );
  });
});
