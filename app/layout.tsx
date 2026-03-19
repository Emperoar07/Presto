import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "react-hot-toast";
import '@rainbow-me/rainbowkit/styles.css';

const inter = Inter({ subsets: ["latin"] });

import { LayoutContent } from "./LayoutContent";

export const metadata: Metadata = {
  title: "PrestoDEX | Tempo Testnet",
  description: "Instant swaps on Tempo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
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
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
