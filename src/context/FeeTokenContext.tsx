'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { getTokens, Token } from '@/config/tokens';

interface FeeTokenContextType {
  feeToken: Token | undefined;
  setFeeToken: (token: Token) => void;
}

const FeeTokenContext = createContext<FeeTokenContextType | undefined>(undefined);

export function FeeTokenProvider({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  // Default to pathUSD (usually first or specific symbol)
  const [feeToken, setFeeToken] = useState<Token | undefined>(undefined);

  // Initialize or update default if chain changes
  useEffect(() => {
    const defaultToken = tokens.find(t => t.symbol === 'pathUSD') || tokens[0];
    setFeeToken(defaultToken);
  }, [chainId, tokens]);

  return (
    <FeeTokenContext.Provider value={{ feeToken, setFeeToken }}>
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
