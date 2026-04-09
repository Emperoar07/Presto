export const LOCAL_ACTIVITY_STORAGE_KEY = 'prestodex-local-activity-history';

export type LocalActivityCategory = 'swaps' | 'liquidity' | 'send' | 'deploy';
export type LocalActivityStatus = 'pending' | 'success' | 'error';

export type LocalActivityRecord = {
  id: string;
  category: LocalActivityCategory;
  title: string;
  subtitle: string;
  status: LocalActivityStatus;
  createdAt: number;
  updatedAt: number;
  hash?: string | null;
  errorMessage?: string | null;
};

const MAX_LOCAL_ACTIVITY_ITEMS = 40;

function isValidLocalActivityRecord(value: unknown): value is LocalActivityRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;

  return (
    typeof item.id === 'string' &&
    (item.category === 'swaps' || item.category === 'liquidity' || item.category === 'send' || item.category === 'deploy') &&
    typeof item.title === 'string' &&
    typeof item.subtitle === 'string' &&
    (item.status === 'pending' || item.status === 'success' || item.status === 'error') &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'
  );
}

function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function readLocalActivityHistory(): LocalActivityRecord[] {
  const storage = safeLocalStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(LOCAL_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.filter(isValidLocalActivityRecord) : [];
  } catch {
    return [];
  }
}

export function writeLocalActivityHistory(items: LocalActivityRecord[]) {
  const storage = safeLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(
      LOCAL_ACTIVITY_STORAGE_KEY,
      JSON.stringify(
        items
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_LOCAL_ACTIVITY_ITEMS),
      ),
    );
  } catch {
    // Ignore storage errors.
  }
}

export function upsertLocalActivityHistoryItem(item: LocalActivityRecord) {
  const current = readLocalActivityHistory();
  const next = [item, ...current.filter((existing) => existing.id !== item.id)];
  writeLocalActivityHistory(next);
}

export function createLocalActivityItem(
  input: Omit<LocalActivityRecord, 'id' | 'createdAt' | 'updatedAt'>,
): LocalActivityRecord {
  const now = Date.now();
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${input.category}-${now}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function patchLocalActivityItem(
  id: string,
  patch: Partial<Omit<LocalActivityRecord, 'id' | 'createdAt'>>,
) {
  const current = readLocalActivityHistory();
  const existing = current.find((item) => item.id === id);
  if (!existing) return;

  upsertLocalActivityHistoryItem({
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  });
}
