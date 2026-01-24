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
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
            <a
              href="https://x.com/emperoar007"
              target="_blank"
              rel="noreferrer"
              title="Send Feedback"
              className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-black/40 text-zinc-400 shadow-lg backdrop-blur hover:text-[#00F3FF] hover:border-[#00F3FF]/30 transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
              </svg>
            </a>
            <a
              href="https://x.com/emperoar007"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-semibold text-zinc-300 shadow-lg backdrop-blur hover:text-white"
            >
              Built with love by @emperoar007
            </a>
          </div>
        </Providers>
      </body>
    </html>
  );
}
