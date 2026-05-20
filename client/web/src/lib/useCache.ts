// Simple sessionStorage cache with TTL. Prevents re-fetching on tab switch.
const CACHE_PREFIX = "dtb_";

export function getCached(key: string, ttlMs = 5000): any | null {
  try {
    const entry = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!entry) return null;
    const { data, ts } = JSON.parse(entry);
    if (Date.now() - ts < ttlMs) return data;
    sessionStorage.removeItem(CACHE_PREFIX + key);
  } catch {}
  return null;
}

export function setCached(key: string, data: any): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function useCached<T>(key: string, _fetcher: () => Promise<T>, ttlMs = 5000): [T | null, () => void] {
  // Returns [data, refresh]. Caller handles loading state.
  // This is a sync check — caller should use it before fetch.
  return [getCached(key, ttlMs), () => {}];
}
