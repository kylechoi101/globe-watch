type Entry<T> = { value: T; expires_at: number };

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expires_at) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttl_seconds: number): void {
  store.set(key, { value, expires_at: Date.now() + ttl_seconds * 1000 });
}

export function cacheAge(key: string): number {
  const entry = store.get(key);
  if (!entry) return Infinity;
  const ttl_ms = entry.expires_at - Date.now();
  return Math.max(0, (5_000 - ttl_ms) / 1000);
}
