export function normalizeImageSource(source?: string | null): string {
  const value = source?.trim();
  if (!value) return '';
  if (value.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${value.slice('ipfs://'.length)}`;
  }
  return value;
}
