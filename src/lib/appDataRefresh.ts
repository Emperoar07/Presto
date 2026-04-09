import type { QueryClient } from '@tanstack/react-query';

export const PRESTO_DATA_REFRESH_EVENT = 'presto:data-refresh';

type RefreshReason = 'swap' | 'bridge' | 'liquidity' | 'manual';

type RefreshDetail = {
  reason: RefreshReason;
  at: number;
};

export function emitPrestoDataRefresh(reason: RefreshReason) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<RefreshDetail>(PRESTO_DATA_REFRESH_EVENT, {
      detail: { reason, at: Date.now() },
    }),
  );
}

export function subscribePrestoDataRefresh(listener: () => void) {
  if (typeof window === 'undefined') return () => {};

  const handler = () => listener();
  window.addEventListener(PRESTO_DATA_REFRESH_EVENT, handler as EventListener);

  return () => {
    window.removeEventListener(PRESTO_DATA_REFRESH_EVENT, handler as EventListener);
  };
}

export async function refreshPrestoQueries(
  queryClient: QueryClient,
  options: {
    address?: string | null;
    chainId?: number | null;
  } = {},
) {
  const tasks: Promise<unknown>[] = [
    queryClient.invalidateQueries({ queryKey: ['dex-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['pool-stats'] }),
  ];

  if (options.address && options.chainId != null) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: ['balances', options.address, options.chainId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['transactions', options.address, options.chainId],
      }),
    );
  }

  await Promise.all(tasks);
}
