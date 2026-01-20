import { createPublicClient, http, type PublicClient } from 'viem';
import { tempoModerato } from 'viem/chains';

const splitUrls = (value: string) =>
  value
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

export const getTempoRpcUrls = () => {
  const conduit = process.env.CONDUIT_TEMPO_RPC_URL || process.env.NEXT_PUBLIC_CONDUIT_TEMPO_RPC_URL;
  const explicit = process.env.TEMPO_RPC_URLS || process.env.TEMPO_RPC_URL || process.env.NEXT_PUBLIC_TEMPO_RPC_URL;
  if (conduit) return splitUrls(conduit);
  if (explicit) return splitUrls(explicit);
  return tempoModerato.rpcUrls.default.http;
};

export const getBaseSepoliaRpcUrls = () => {
  const explicit = process.env.BASE_SEPOLIA_RPC_URLS || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  if (explicit) return splitUrls(explicit);
  return [];
};

let tempoClients: PublicClient[] | null = null;

export const getTempoPublicClients = () => {
  if (tempoClients) return tempoClients;
  const urls = getTempoRpcUrls();
  tempoClients = urls.map((url) =>
    createPublicClient({
      chain: tempoModerato,
      transport: http(url, { timeout: 8000 }),
    })
  );
  return tempoClients;
};

export const readContractWithFallback = async <T>(
  primary: PublicClient | null | undefined,
  params: Parameters<PublicClient['readContract']>[0]
): Promise<T> => {
  const clients = primary ? [primary, ...getTempoPublicClients()] : getTempoPublicClients();
  let lastError: unknown;
  for (const client of clients) {
    try {
      return (await client.readContract(params)) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('RPC read failed');
};
