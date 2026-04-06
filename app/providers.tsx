'use client';

import * as React from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '@/config/wagmi';
import { FeeTokenProvider } from '@/context/FeeTokenContext';
import { ThemeProvider } from '@/context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,          // data fresh for 15s — no re-fetch on every mount
      gcTime: 5 * 60 * 1000,      // keep unused data in cache for 5 min
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false, // avoid surprise fetches on tab switch
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <ThemeProvider>
            <FeeTokenProvider>
              {children}
            </FeeTokenProvider>
          </ThemeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
