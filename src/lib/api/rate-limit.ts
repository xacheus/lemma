import { randomBytes } from 'node:crypto';

/**
 * Very small in-memory throttle for the unauthenticated booking endpoint. A real
 * deployment would put this at the edge; here it just stops a public form from being
 * spammed into a wall of phantom requests.
 */
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

/** Separate caps so a burst of availability look-ups cannot use up booking attempts. */
const PROFILES: Record<string, { capacity: number; perMinute: number }> = {
  booking: { capacity: 8, perMinute: 8 },
  // Sign-up is cheap to send and expensive to undo, so it is tighter than the default:
  // five accounts an hour from one address is ample for a person and useless to a script.
  register: { capacity: 3, perMinute: 3 },
  default: { capacity: 30, perMinute: 60 },
};

function profileFor(key: string) {
  const name = key.split(':')[0] ?? '';
  return PROFILES[name] ?? PROFILES.default;
}

export function take(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const { capacity, perMinute } = profileFor(key);
  return takeFrom(key, capacity, perMinute / 60_000);
}

function takeFrom(key: string, capacity: number, refillPerMs: number): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const REFILL_PER_MS = refillPerMs;
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * REFILL_PER_MS);
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
