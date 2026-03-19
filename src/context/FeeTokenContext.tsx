'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { getTokens, Token } from '@/config/tokens';
import { isArcChain } from '@/config/contracts';

interface FeeTokenContextType {
  feeToken: Token | undefined;
  setFeeToken: (token: Token) => void;
  /** Whether the current chain has a single gas token (no fee token choice) */
  isSingleGasToken: boolean;
}

const FeeTokenContext = createContext<FeeTokenContextType | undefined>(undefined);

export function FeeTokenProvider({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const [feeToken, setFeeToken] = useState<Token | undefined>(undefined);
  // Arc uses USDC as native gas — no fee token selector needed
  const isSingleGasToken = isArcChain(chainId);

  // Initialize or update default if chain changes
  useEffect(() => {
    if (isArcChain(chainId)) {
      // Arc: default to USDC (always first / only hub token)
      const usdcToken = tokens.find(t => t.symbol === 'USDC') || tokens[0];
      setFeeToken(usdcToken);
    } else {
      const defaultToken = tokens.find(t => t.symbol === 'pathUSD') || tokens[0];
      setFeeToken(defaultToken);
    }
  }, [chainId, tokens]);

  return (
    <FeeTokenContext.Provider value={{ feeToken, setFeeToken, isSingleGasToken }}>
      {children}
    </FeeTokenContext.Provider>
  );
}

export function useFeeToken() {
  const context = useContext(FeeTokenContext);
  if (context === undefined) {
    throw new Error('useFeeToken must be used within a FeeTokenProvider');
  }
  return context;
}
