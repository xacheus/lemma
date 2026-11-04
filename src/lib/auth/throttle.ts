/**
 * Sign-in attempt throttling.
 *
 * Kept in process memory on purpose: it protects a single instance without a new
 * dependency or an external store, and it never blocks a correct password for long.
 * Five wrong attempts on one handle inside fifteen minutes locks that handle for
 * fifteen minutes; the window resets on success.
 *
 * Limitation stated plainly: a multi-instance deployment gets one bucket per
 * instance, so this slows a guessing attack rather than stopping a distributed one.
 * `npm run audit` covers the rest of the surface; a shared Redis bucket is the next
 * step if the property ever runs more than one server.
 */

interface Bucket {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    const stale = bucket.lockedUntil < now && now - bucket.firstFailureAt > WINDOW_MS;
    if (stale) buckets.delete(key);
  }
}

export function signInLockRemainingMs(identifier: string): number {
  const key = identifier.trim().toLowerCase();
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  const now = Date.now();
  return bucket.lockedUntil > now ? bucket.lockedUntil - now : 0;
}

export function recordSignInFailure(identifier: string): { lockedMs: number; attemptsLeft: number } {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key) ?? { failures: 0, firstFailureAt: now, lockedUntil: 0 };

  if (now - bucket.firstFailureAt > WINDOW_MS) {
    bucket.failures = 0;
    bucket.firstFailureAt = now;
    bucket.lockedUntil = 0;
  }
  bucket.failures += 1;
  if (bucket.failures >= MAX_FAILURES) {
    bucket.lockedUntil = now + LOCK_MS;
    bucket.failures = 0;
    bucket.firstFailureAt = now;
  }
  buckets.set(key, bucket);
  return {
    lockedMs: Math.max(0, bucket.lockedUntil - now),
    attemptsLeft: Math.max(0, MAX_FAILURES - bucket.failures),
  };
}

export function clearSignInFailures(identifier: string): void {
  buckets.delete(identifier.trim().toLowerCase());
}
