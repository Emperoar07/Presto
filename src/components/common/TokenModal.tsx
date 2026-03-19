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
  filterTokens?: (token: Token) => boolean;
}

export function TokenModal({ isOpen, onClose, onSelect, selectedToken, filterTokens }: TokenModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const chainId = useChainId();
  const tokens = getTokens(chainId);

  const nextTokens = filterTokens ? tokens.filter(filterTokens) : tokens;
  const filteredTokens = nextTokens.filter((token) =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-sm w-full rounded-2xl bg-white dark:bg-slate-900 backdrop-blur-xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <Dialog.Title className="text-lg font-bold leading-6 mb-4 text-slate-900 dark:text-white">Select a token</Dialog.Title>
            
            <input
              type="text"
              placeholder="Search name or paste address"
              className="w-full p-3 rounded-xl token-input-bg outline-none border border-slate-200 dark:border-slate-700 focus:border-primary/50 mb-4 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
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
                      ? 'opacity-50 cursor-not-allowed bg-primary/10 border border-primary/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs shadow-md">
                      {token.symbol[0]}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900 dark:text-white">{token.symbol}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{token.name}</div>
                    </div>
                  </div>
                  {selectedToken?.address === token.address && (
                    <div className="text-primary">
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
