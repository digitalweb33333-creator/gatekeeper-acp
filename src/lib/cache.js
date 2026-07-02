// Tiny in-memory TTL cache. Keeps upstream sources safe from rate limits and cuts latency.
const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiry) { store.delete(key); return null; }
  return hit;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiry: Date.now() + ttlMs, storedAt: Date.now() });
  return value;
}

// Wrap an async producer with a TTL cache. Returns { value, ageMs, cached }.
export async function cached(key, ttlMs, producer) {
  const hit = cacheGet(key);
  if (hit) return { value: hit.value, ageMs: Date.now() - hit.storedAt, cached: true };
  const value = await producer();
  cacheSet(key, value, ttlMs);
  return { value, ageMs: 0, cached: false };
}

export function cacheStats() {
  return { size: store.size };
}
