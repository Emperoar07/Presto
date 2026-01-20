/**
 * Error Handling Utilities
 *
 * Provides user-friendly error messages for common blockchain errors
 */

export interface ParsedError {
  title: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Parse contract error and return user-friendly message
 */
export function parseContractError(error: unknown): ParsedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // User rejected transaction
  if (lowerMessage.includes('user rejected') || lowerMessage.includes('user denied')) {
    return {
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction in your wallet.',
      severity: 'info',
    };
  }

  // Insufficient balance
  if (lowerMessage.includes('insufficient funds') || lowerMessage.includes('insufficient balance')) {
    return {
      title: 'Insufficient Balance',
      message: 'You don\'t have enough tokens to complete this transaction. Check your balance and try again.',
      severity: 'error',
    };
  }

  // Slippage tolerance exceeded
  if (lowerMessage.includes('slippage tolerance exceeded') || lowerMessage.includes('too little received')) {
    return {
      title: 'Slippage Exceeded',
      message: 'Price moved unfavorably. Try increasing your slippage tolerance or reducing trade size.',
      severity: 'error',
    };
  }

  // Insufficient liquidity
  if (lowerMessage.includes('insufficient liquidity') || lowerMessage.includes('insufficient output amount')) {
    return {
      title: 'Insufficient Liquidity',
      message: 'Not enough liquidity in the pool for this trade. Try a smaller amount.',
      severity: 'error',
    };
  }

  // Transaction deadline exceeded
  if (lowerMessage.includes('transaction expired') || lowerMessage.includes('deadline')) {
    return {
      title: 'Transaction Expired',
      message: 'Transaction took too long to process. Try again with a longer deadline.',
      severity: 'error',
    };
  }

  // Insufficient allowance
  if (lowerMessage.includes('insufficient allowance') || lowerMessage.includes('transfer amount exceeds allowance')) {
    return {
      title: 'Approval Required',
      message: 'Please approve token spending before swapping.',
      severity: 'warning',
    };
  }

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return {
      title: 'Network Error',
      message: 'Connection issue detected. Check your internet and try again.',
      severity: 'error',
    };
  }

  // Gas errors
  if (lowerMessage.includes('gas required exceeds') || lowerMessage.includes('out of gas')) {
    return {
      title: 'Insufficient Gas',
      message: 'Transaction requires more gas. Ensure you have enough ETH for gas fees.',
      severity: 'error',
    };
  }

  // Contract paused
  if (lowerMessage.includes('paused') || lowerMessage.includes('enforcedpause')) {
    return {
      title: 'Contract Paused',
      message: 'The DEX is temporarily paused for maintenance. You can still withdraw liquidity.',
      severity: 'warning',
    };
  }

  // Same token swap attempt
  if (lowerMessage.includes('same token') || lowerMessage.includes('identical')) {
    return {
      title: 'Invalid Swap',
      message: 'Cannot swap a token for itself. Please select different tokens.',
      severity: 'error',
    };
  }

  // Zero amount
  if (lowerMessage.includes('zero amount') || lowerMessage.includes('amount must be greater than 0')) {
    return {
      title: 'Invalid Amount',
      message: 'Amount must be greater than zero.',
      severity: 'error',
    };
  }

  // Nonce too low (transaction already processed)
  if (lowerMessage.includes('nonce too low')) {
    return {
      title: 'Transaction Already Processed',
      message: 'This transaction was already completed. Refresh the page.',
      severity: 'info',
    };
  }

  // Replacement transaction underpriced
  if (lowerMessage.includes('replacement transaction underpriced')) {
    return {
      title: 'Transaction Pending',
      message: 'A similar transaction is still pending. Wait for it to complete or increase gas price.',
      severity: 'warning',
    };
  }

  // Fee-on-transfer tokens
  if (lowerMessage.includes('fee-on-transfer')) {
    return {
      title: 'Unsupported Token',
      message: 'This token charges fees on transfers and is not supported by this DEX.',
      severity: 'error',
    };
  }

  // Insufficient shares (for liquidity removal)
  if (lowerMessage.includes('insufficient shares')) {
    return {
      title: 'Insufficient LP Shares',
      message: 'You don\'t have enough liquidity provider shares to remove this amount.',
      severity: 'error',
    };
  }

  // RPC errors
  if (lowerMessage.includes('rpc') || lowerMessage.includes('503') || lowerMessage.includes('502')) {
    return {
      title: 'RPC Error',
      message: 'Network RPC is temporarily unavailable. Please try again in a moment.',
      severity: 'error',
    };
  }

  // Wallet not connected
  if (lowerMessage.includes('no provider') || lowerMessage.includes('not connected')) {
    return {
      title: 'Wallet Not Connected',
      message: 'Please connect your wallet to continue.',
      severity: 'warning',
    };
  }

  // Wrong network
  if (lowerMessage.includes('wrong network') || lowerMessage.includes('unsupported chain')) {
    return {
      title: 'Wrong Network',
      message: 'Please switch to the Tempo network in your wallet.',
      severity: 'warning',
    };
  }

  // Generic fallback
  return {
    title: 'Transaction Failed',
    message: errorMessage.length > 100
      ? 'An unexpected error occurred. Please try again.'
      : errorMessage,
    severity: 'error',
  };
}

/**
 * Check if an error is a user cancellation (not a real error)
 */
export function isUserCancellation(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  return (
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('user cancelled')
  );
}

/**
 * Log error to console with formatted output
 */
export function logError(error: unknown, context?: string) {
  if (isUserCancellation(error)) {
    // Don't log user cancellations as errors
    console.log('[User Action]', context || 'Transaction cancelled by user');
    return;
  }

  const parsed = parseContractError(error);
  console.error(
    `[${parsed.severity.toUpperCase()}]`,
    context ? `${context}:` : '',
    parsed.title,
    '-',
    parsed.message
  );

  // Log full error details in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Full error:', error);
  }
}

/**
 * Format error for display in toast notifications
 */
export function formatErrorForToast(error: unknown): string {
  const parsed = parseContractError(error);
  return `${parsed.title}: ${parsed.message}`;
}

/**
 * Get icon for error severity
 */
export function getErrorIcon(severity: ParsedError['severity']): string {
  switch (severity) {
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
  }
}
