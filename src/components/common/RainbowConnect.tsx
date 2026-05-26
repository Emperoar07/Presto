'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function RainbowConnect() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal }) => {
        const connected = mounted && account && chain;
        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-[#1e293b] px-3 py-1.5 text-[11.5px] font-semibold text-slate-300 transition-colors hover:bg-[#263347] hover:text-white"
            >
              <span className="material-symbols-outlined text-[15px]">person</span>
              Connect Wallet
            </button>
          );
        }

        return (
          <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-[#1e293b] px-3 py-1.5 text-[11.5px] font-semibold text-slate-300">
            <span className="material-symbols-outlined text-[15px]">account_circle</span>
            <span className="max-w-[130px] truncate">{account?.displayName ?? 'Wallet'}</span>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
