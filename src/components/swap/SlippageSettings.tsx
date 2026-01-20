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
const DEFAULT_DEADLINE = 20; // 20 minutes

export function SlippageSettings({
  isOpen,
  onClose,
  slippage,
  onSlippageChange,
  deadline,
  onDeadlineChange,
}: SlippageSettingsProps) {
  const [customSlippage, setCustomSlippage] = useState('');
  const [customDeadline, setCustomDeadline] = useState('');
  const [slippageError, setSlippageError] = useState<string | null>(null);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  // Initialize custom values when modal opens
  useEffect(() => {
    if (isOpen) {
      if (!PRESET_SLIPPAGES.includes(slippage)) {
        setCustomSlippage(slippage.toString());
      }
      if (deadline !== DEFAULT_DEADLINE) {
        setCustomDeadline(deadline.toString());
      }
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
      setDeadlineError('Deadline cannot exceed 180 minutes (3 hours)');
    } else {
      setDeadlineError(null);
      onDeadlineChange(parsed);
    }
  };

  const resetToDefaults = () => {
    setCustomSlippage('');
    setCustomDeadline('');
    setSlippageError(null);
    setDeadlineError(null);
    onSlippageChange(0.5);
    onDeadlineChange(DEFAULT_DEADLINE);
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
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-xl font-bold leading-6 text-white mb-1"
                >
                  Transaction Settings
                </Dialog.Title>
                <p className="text-sm text-zinc-400 mb-6">
                  Customize your trading preferences
                </p>

                {/* Slippage Tolerance Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-white">
                      Slippage Tolerance
                    </label>
                    <button
                      onClick={resetToDefaults}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {PRESET_SLIPPAGES.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => handlePresetSlippage(preset)}
                        className={`
                          px-4 py-2 rounded-lg font-medium text-sm transition-all
                          ${
                            slippage === preset && customSlippage === ''
                              ? 'bg-cyan-500 text-white'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }
                        `}
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
                        className={`
                          w-full px-3 py-2 rounded-lg bg-zinc-800 text-white text-sm
                          placeholder-zinc-500 outline-none transition-all
                          ${
                            customSlippage !== ''
                              ? 'ring-2 ring-cyan-500'
                              : 'focus:ring-2 focus:ring-cyan-500'
                          }
                          ${slippageError ? 'ring-red-500' : ''}
                        `}
                      />
                      {customSlippage !== '' && !slippageError && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                          %
                        </span>
                      )}
                    </div>
                  </div>

                  {slippageError && (
                    <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {slippageError}
                    </p>
                  )}

                  {!slippageError && slippage > 1 && (
                    <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Your transaction may be frontrun
                    </p>
                  )}
                </div>

                {/* Transaction Deadline Section */}
                <div className="mb-6">
                  <label className="text-sm font-medium text-white block mb-3">
                    Transaction Deadline
                  </label>

                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder={DEFAULT_DEADLINE.toString()}
                      value={customDeadline}
                      onChange={(e) => handleCustomDeadline(e.target.value)}
                      className={`
                        flex-1 px-4 py-2 rounded-lg bg-zinc-800 text-white
                        placeholder-zinc-500 outline-none transition-all
                        focus:ring-2 focus:ring-cyan-500
                        ${deadlineError ? 'ring-2 ring-red-500' : ''}
                      `}
                    />
                    <span className="text-sm text-zinc-400">minutes</span>
                  </div>

                  {deadlineError && (
                    <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {deadlineError}
                    </p>
                  )}

                  {!deadlineError && (
                    <p className="text-xs text-zinc-400 mt-2">
                      Your transaction will revert if it's pending for longer than this duration
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={!!slippageError || !!deadlineError}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Save Settings
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
