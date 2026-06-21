import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "react-hot-toast";
import '@rainbow-me/rainbowkit/styles.css';

const inter = Inter({ subsets: ["latin"] });

import { LayoutContent } from "./LayoutContent";

export const metadata: Metadata = {
  title: "Presto | Arc Testnet",
  description: "Instant swaps, stable liquidity pools, and cross-chain USDC transfers on Arc Testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen font-display`}>
        <Providers>
          <LayoutContent>
            {children}
          </LayoutContent>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#0c121d',
                color: '#f1f5f9',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: '500',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(12px)',
                maxWidth: '380px',
              },
              success: {
                duration: 5000,
                iconTheme: {
                  primary: '#2ff0a2', // Presto Mint
                  secondary: '#0c121d',
                },
              },
              error: {
                duration: 6000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#0c121d',
                },
              },
              loading: {
                iconTheme: {
                  primary: '#25c0f4', // Presto Cyan
                  secondary: '#0c121d',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
