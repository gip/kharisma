"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { SessionProvider } from "@/components/session-provider";
import { KharismaPrivyProvider } from "@/components/privy-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/i18n-provider";
import { wagmiConfig } from "@/wallet/wagmi";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig} reconnectOnMount>
        <KharismaPrivyProvider>
          <I18nProvider>
            <ThemeProvider>
              <SessionProvider>{children}</SessionProvider>
            </ThemeProvider>
          </I18nProvider>
        </KharismaPrivyProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
