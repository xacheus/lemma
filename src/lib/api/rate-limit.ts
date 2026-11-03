import { randomBytes } from 'node:crypto';

/**
 * Very small in-memory throttle for the unauthenticated booking endpoint. A real
 * deployment would put this at the edge; here it just stops a public form from being
 * spammed into a wall of phantom requests.
 */
const buckets = new Map<string, { tokens: number; updatedAt: number }>();
const CAPACITY = 8;
const REFILL_PER_MS = 8 / 60_000; // 8 requests per minute

export function take(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds: Math.ceil((1 - bucket.tokens) / REFILL_PER_MS / 1000) };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 5000) buckets.clear();
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Bot trap for the public form. */
export function newHoneypot() {
  return randomBytes(6).toString('hex');
}
