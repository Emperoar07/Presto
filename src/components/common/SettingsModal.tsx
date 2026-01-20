'use client';

import { Dialog } from '@headlessui/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  slippage: string;
  setSlippage: (value: string) => void;
  deadline: string;
  setDeadline: (value: string) => void;
}

export function SettingsModal({ isOpen, onClose, slippage, setSlippage, deadline, setDeadline }: SettingsModalProps) {
  
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-sm w-full rounded-2xl bg-black/80 backdrop-blur-xl p-6 shadow-2xl border border-white/10">
          <Dialog.Title className="text-lg font-bold leading-6 mb-4 text-white">Transaction Settings</Dialog.Title>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Slippage Tolerance</label>
              <div className="flex items-center space-x-2">
                {['0.1', '0.5', '1.0'].map((value) => (
                  <button
                    key={value}
                    onClick={() => setSlippage(value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      slippage === value
                        ? 'bg-[#00F3FF] text-black shadow-[0_0_10px_rgba(0,243,255,0.3)]'
                        : 'bg-black/40 border border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {value}%
                  </button>
                ))}
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 outline-none text-right pr-6 text-white focus:border-[#00F3FF]/50 transition-colors"
                    placeholder="Custom"
                  />
                  <span className="absolute right-3 top-1.5 text-zinc-500">%</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Transaction Deadline</label>
              <div className="flex items-center space-x-2">
                 <input
                    type="text"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-20 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 outline-none text-right text-white focus:border-[#00F3FF]/50 transition-colors"
                    placeholder="20"
                  />
                  <span className="text-sm text-zinc-500">minutes</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold rounded-xl transition-all"
          >
            Close
          </button>

        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
