/**
 * Price Impact Calculation Utilities
 *
 * These functions help calculate and warn users about the price impact
 * of their trades, protecting them from excessive slippage.
 */

/**
 * Calculate the price impact of a swap as a percentage
 * @param amountIn Amount of input token
 * @param reserveIn Reserve of input token in the pool
 * @param reserveOut Reserve of output token in the pool
 * @returns Price impact as a percentage (e.g., 1.5 for 1.5%)
 */
export function calculatePriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) {
    return 0;
  }

  // Calculate spot price before trade
  // Price = reserveOut / reserveIn
  const priceBeforeNum = reserveOut * 10000n;
  const priceBeforeDenom = reserveIn;
  const priceBefore = Number(priceBeforeNum) / Number(priceBeforeDenom);

  // Calculate spot price after trade
  // Using Uniswap V2 formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * 1000n) + amountInWithFee;
  const amountOut = numerator / denominator;

  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;

  const priceAfterNum = newReserveOut * 10000n;
  const priceAfterDenom = newReserveIn;
  const priceAfter = Number(priceAfterNum) / Number(priceAfterDenom);

  // Price impact = (priceBefore - priceAfter) / priceBefore * 100
  const impact = ((priceBefore - priceAfter) / priceBefore) * 100;

  return Math.abs(impact);
}

/**
 * Get the severity level of price impact
 * @param priceImpact Price impact percentage
 * @returns Severity level: 'low', 'medium', 'high', or 'critical'
 */
export function getPriceImpactSeverity(priceImpact: number): 'low' | 'medium' | 'high' | 'critical' {
  if (priceImpact < 1) return 'low';
  if (priceImpact < 3) return 'medium';
  if (priceImpact < 5) return 'high';
  return 'critical';
}

/**
 * Get color class for price impact display
 * @param priceImpact Price impact percentage
 * @returns Tailwind color class
 */
export function getPriceImpactColor(priceImpact: number): string {
  const severity = getPriceImpactSeverity(priceImpact);

  switch (severity) {
    case 'low':
      return 'text-green-400';
    case 'medium':
      return 'text-yellow-400';
    case 'high':
      return 'text-orange-400';
    case 'critical':
      return 'text-red-400';
  }
}

/**
 * Get warning message for price impact
 * @param priceImpact Price impact percentage
 * @returns Warning message or null if no warning needed
 */
export function getPriceImpactWarning(priceImpact: number): string | null {
  const severity = getPriceImpactSeverity(priceImpact);

  switch (severity) {
    case 'low':
      return null;
    case 'medium':
      return 'Moderate price impact. Consider reducing trade size.';
    case 'high':
      return 'High price impact! You may receive significantly less than expected.';
    case 'critical':
      return 'CRITICAL: Extremely high price impact! This trade is not recommended.';
  }
}

/**
 * Check if price impact requires explicit confirmation
 * @param priceImpact Price impact percentage
 * @returns True if user should explicitly confirm the trade
 */
export function requiresPriceImpactConfirmation(priceImpact: number): boolean {
  return priceImpact >= 5; // 5% or higher requires confirmation
}

/**
 * Format price impact for display
 * @param priceImpact Price impact percentage
 * @returns Formatted string (e.g., "1.23%")
 */
export function formatPriceImpact(priceImpact: number): string {
  if (priceImpact < 0.01) return '<0.01%';
  return `${priceImpact.toFixed(2)}%`;
}

/**
 * Calculate minimum amount out with slippage tolerance
 * @param expectedOut Expected output amount
 * @param slippageTolerance Slippage tolerance as percentage (e.g., 0.5 for 0.5%)
 * @returns Minimum amount out after applying slippage
 */
export function calculateMinAmountOut(
  expectedOut: bigint,
  slippageTolerance: number
): bigint {
  if (slippageTolerance < 0 || slippageTolerance > 100) {
    throw new Error('Slippage tolerance must be between 0 and 100');
  }

  // Convert percentage to basis points (e.g., 0.5% = 50 basis points)
  const slippageBps = BigInt(Math.floor(slippageTolerance * 100));

  // minOut = expectedOut * (10000 - slippageBps) / 10000
  return (expectedOut * (10000n - slippageBps)) / 10000n;
}

/**
 * Validate slippage tolerance
 * @param slippage Slippage tolerance percentage
 * @returns Error message if invalid, null otherwise
 */
export function validateSlippage(slippage: number): string | null {
  if (isNaN(slippage)) return 'Slippage must be a number';
  if (slippage < 0) return 'Slippage cannot be negative';
  if (slippage > 50) return 'Slippage cannot exceed 50%';
  if (slippage > 5) return 'Warning: Slippage above 5% may result in unfavorable trades';
  return null;
}
