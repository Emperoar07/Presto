export async function readPoolPathReserves<T>(
  tokens: readonly T[],
  readReserve: (token: T) => Promise<bigint>
): Promise<bigint[]> {
  const results = await Promise.allSettled(tokens.map((token) => readReserve(token)));
  const fulfilled = results.filter((result) => result.status === 'fulfilled');

  if (fulfilled.length !== tokens.length) {
    throw new Error(fulfilled.length === 0
      ? 'All pool reserve reads failed'
      : 'Some pool reserve reads failed');
  }

  return results.map((result) => (result as PromiseFulfilledResult<bigint>).value);
}
