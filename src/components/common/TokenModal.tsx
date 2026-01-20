'use client';

import { Dialog } from '@headlessui/react';
import { useState } from 'react';
import { Token, getTokens } from '@/config/tokens';
import { useChainId } from 'wagmi';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  selectedToken?: Token;
}

export function TokenModal({ isOpen, onClose, onSelect, selectedToken }: TokenModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const chainId = useChainId();
  const tokens = getTokens(chainId);

  const filteredTokens = tokens.filter((token) =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-sm w-full rounded-2xl bg-black/80 backdrop-blur-xl p-6 shadow-2xl border border-white/10">
            <Dialog.Title className="text-lg font-bold leading-6 mb-4 text-white">Select a token</Dialog.Title>
            
            <input
              type="text"
              placeholder="Search name or paste address"
              className="w-full p-3 rounded-xl bg-black/40 outline-none border border-white/5 focus:border-[#00F3FF]/50 mb-4 text-white placeholder-zinc-500 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="h-64 overflow-y-auto space-y-2 -mr-2 pr-2 custom-scrollbar">
              {filteredTokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    onSelect(token);
                    onClose();
                  }}
                  disabled={selectedToken?.address === token.address}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    selectedToken?.address === token.address
                      ? 'opacity-50 cursor-not-allowed bg-[#00F3FF]/10 border border-[#00F3FF]/20'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00F3FF] to-[#BC13FE] flex items-center justify-center text-black font-bold text-xs shadow-[0_0_10px_rgba(0,243,255,0.3)]">
                      {token.symbol[0]}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-white">{token.symbol}</div>
                      <div className="text-xs text-zinc-400">{token.name}</div>
                    </div>
                  </div>
                  {selectedToken?.address === token.address && (
                    <div className="text-[#00F3FF]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Dialog.Panel>
      </div>
    </Dialog>
  );
}
