'use client';

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { validateSlippage } from '@/lib/priceImpact';

interface SlippageSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  slippage: number;
  onSlippageChange: (slippage: number) => void;
  deadline: number; // in minutes
  onDeadlineChange: (deadline: number) => void;
}

const PRESET_SLIPPAGES = [0.1, 0.5, 1.0];
const DEFAULT_DEADLINE = 20;

export function SlippageSettings({
  isOpen,
  onClose,
  slippage,
  onSlippageChange,
  deadline,
  onDeadlineChange,
}: SlippageSettingsProps) {
  const [customSlippage, setCustomSlippage] = useState('');
  const [customDeadline, setCustomDeadline] = useState(deadline.toString());
  const [slippageError, setSlippageError] = useState<string | null>(null);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [disableMultihops, setDisableMultihops] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!PRESET_SLIPPAGES.includes(slippage)) {
        setCustomSlippage(slippage.toString());
      } else {
        setCustomSlippage('');
      }
      setCustomDeadline(deadline.toString());
    }
  }, [isOpen, slippage, deadline]);

  const handlePresetSlippage = (value: number) => {
    setCustomSlippage('');
    setSlippageError(null);
    onSlippageChange(value);
  };

  const handleCustomSlippage = (value: string) => {
    setCustomSlippage(value);
    if (value === '') {
      setSlippageError(null);
      return;
    }
    const parsed = parseFloat(value);
    const error = validateSlippage(parsed);
    if (error) {
      setSlippageError(error);
    } else {
      setSlippageError(null);
      onSlippageChange(parsed);
    }
  };

  const handleCustomDeadline = (value: string) => {
    setCustomDeadline(value);
    if (value === '') {
      setDeadlineError(null);
      return;
    }
    const parsed = parseInt(value);
    if (isNaN(parsed)) {
      setDeadlineError('Deadline must be a number');
    } else if (parsed < 1) {
      setDeadlineError('Deadline must be at least 1 minute');
    } else if (parsed > 180) {
      setDeadlineError('Deadline cannot exceed 180 minutes');
    } else {
      setDeadlineError(null);
      onDeadlineChange(parsed);
    }
  };

  const handleSave = () => {
    if (!slippageError && !deadlineError) {
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-[480px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">settings</span>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="p-6 space-y-8">
                  {/* Slippage Tolerance */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Slippage Tolerance
                      </h3>
                      <span
                        className="material-symbols-outlined text-base cursor-help text-slate-400"
                        title="Your transaction will revert if the price changes unfavorably by more than this percentage."
                      >
                        help_outline
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_SLIPPAGES.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => handlePresetSlippage(preset)}
                          className={`flex h-10 items-center justify-center rounded-lg font-semibold text-sm transition-all ${
                            slippage === preset && customSlippage === ''
                              ? 'bg-primary/10 border border-primary/20 text-primary'
                              : 'bg-slate-100 dark:bg-slate-800 border border-transparent text-slate-700 dark:text-slate-300 hover:border-primary/50'
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Custom"
                          value={customSlippage}
                          onChange={(e) => handleCustomSlippage(e.target.value)}
                          className={`w-full h-10 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-primary text-sm text-right pr-6 placeholder:text-slate-500 text-slate-900 dark:text-white outline-none transition-all ${
                            slippageError ? 'ring-2 ring-red-400' : ''
                          }`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span>
                      </div>
                    </div>
                    {slippageError && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {slippageError}
                      </p>
                    )}
                    {!slippageError && slippage > 1 && (
                      <p className="text-xs text-amber-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        Your transaction may be frontrun
                      </p>
                    )}
                  </section>

                  {/* Transaction Deadline */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Transaction Deadline
                      </h3>
                      <span
                        className="material-symbols-outlined text-base cursor-help text-slate-400"
                        title="Your transaction will revert if it is not confirmed within this time."
                      >
                        help_outline
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative w-32">
                        <input
                          type="text"
                          value={customDeadline}
                          onChange={(e) => handleCustomDeadline(e.target.value)}
                          className={`w-full h-10 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-primary text-sm font-medium text-slate-900 dark:text-white outline-none transition-all ${
                            deadlineError ? 'ring-2 ring-red-400' : ''
                          }`}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">minutes</span>
                    </div>
                    {deadlineError && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {deadlineError}
                      </p>
                    )}
                  </section>

                  {/* Interface Settings */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                      Interface Settings
                    </h3>

                    {/* Expert Mode Toggle */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">Expert Mode</span>
                          <span className="material-symbols-outlined text-base cursor-help text-slate-400">help_outline</span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Allow high slippage trades &amp; skip confirmations</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={expertMode}
                          onChange={(e) => setExpertMode(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                      </label>
                    </div>

                    {/* Disable Multihops Toggle */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">Disable Multihops</span>
                          <span className="material-symbols-outlined text-base cursor-help text-slate-400">help_outline</span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Restricts swaps to direct pairs only</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={disableMultihops}
                          onChange={(e) => setDisableMultihops(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                      </label>
                    </div>
                  </section>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0">
                  <button
                    onClick={handleSave}
                    disabled={!!slippageError || !!deadlineError}
                    className="w-full bg-primary hover:bg-primary/90 text-white dark:text-background-dark font-bold py-4 rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Settings
                  </button>
                  <p className="text-[10px] text-center mt-4 text-slate-500 uppercase tracking-tighter">
                    Changes are saved to local storage
                  </p>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
