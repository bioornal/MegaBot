const store = new Map<string, { value: string; expiresAt: number }>();

export function get(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key: string, value: string, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}