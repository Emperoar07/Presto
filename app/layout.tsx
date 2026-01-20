import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/common/Header";
import { Toaster } from "react-hot-toast";
import '@rainbow-me/rainbowkit/styles.css';

const inter = Inter({ subsets: ["latin"] });

import { Background } from "@/components/common/Background";

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
    <html lang="en">
      <body className={inter.className}>
        <Background />
        <Providers>
          <Header />
          <div className="pt-16">
            {children}
          </div>
          <Toaster position="bottom-right" />
          <a
            href="https://x.com/emperoar007"
            target="_blank"
            rel="noreferrer"
            className="fixed bottom-4 right-4 z-40 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-semibold text-zinc-300 shadow-lg backdrop-blur hover:text-white"
          >
            Built with love by @emperoar007
          </a>
        </Providers>
      </body>
    </html>
  );
}
