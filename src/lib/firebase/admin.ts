import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AccountStatus, Role } from '../domain/types';

/**
 * Trusted Server-Side Firebase Admin SDK
 *
 * Used for:
 *   - Verifying Firebase ID tokens & session cookies (`adminAuth`)
 *   - Setting custom role claims (`setCustomUserClaims`)
 *   - Disabling / revoking staff or user sessions (`updateUser`, `revokeRefreshTokens`)
 *   - Atomic server-side Firestore transactions & cursor pagination (`adminDb`)
 *
 * Security invariant: Service account credentials must NEVER be prefixed with `NEXT_PUBLIC_`.
 */

/**
 * Turns the stored key into a real PEM.
 *
 * Operators paste this value from a service-account JSON file, so it arrives in one of
 * two shapes: with real newlines, or as a single line of literal `\n` sequences. Both
 * are accepted. A value wrapped in quotes is not — it parses as a string that merely
 * starts with `"-----BEGIN`, which the crypto layer rejects with an unhelpful
 * `DECODER routines::unsupported` on first use rather than at startup.
 */
function normalisePrivateKey(raw: string): string | null {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    // Quotes are a paste artefact, never part of a PEM. Strip them rather than fail.
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\n/g, '\n');
  if (!key.includes('BEGIN PRIVATE KEY') || !key.includes('END PRIVATE KEY')) return null;
  return key;
}

/**
 * True only when all three credentials are present *and* the key is usable. Checking
 * the shape here means a malformed paste is reported as "not configured" — which every
 * caller already handles by degrading gracefully — instead of passing every startup
 * check and then throwing on the first request that touches Firestore.
 */
export function isFirebaseAdminConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY) {
    throw new Error('SECURITY VIOLATION: FIREBASE_PRIVATE_KEY must never use NEXT_PUBLIC_.');
  }
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !raw) {
    return false;
  }
  return normalisePrivateKey(raw) !== null;
}

let adminApp: App | null = null;

export function getFirebaseAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null;
  if (adminApp) return adminApp;

  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      // Same normalisation the check above used, so the two can never disagree.
      privateKey: normalisePrivateKey(process.env.FIREBASE_PRIVATE_KEY!)!,
    }),
  });
  return adminApp;
}

export function getAdminAuth(): Auth | null {
  const app = getFirebaseAdminApp();
  return app ? getAuth(app) : null;
}

export function getAdminFirestore(): Firestore | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getFirestore(app);
}

/**
 * Synchronizes authorized custom claims on Firebase Authentication and optionally
 * revokes refresh tokens when a user is deactivated or demoted.
 */
export async function syncFirebaseRoleClaims(
  uidOrOpts:
    | string
    | {
        uid: string;
        role: Role;
        accountStatus: AccountStatus;
        revokeTokens?: boolean;
      },
  roleArg?: Role,
  statusArg?: AccountStatus,
): Promise<{ synced: boolean; syncedToFirebaseAuth: boolean }> {
  const opts =
    typeof uidOrOpts === 'string'
      ? {
          uid: uidOrOpts,
          role: roleArg ?? 'guest',
          accountStatus: statusArg ?? 'active',
          revokeTokens: statusArg !== undefined && statusArg !== 'active',
        }
      : uidOrOpts;

  const auth = getAdminAuth();
  if (!auth) return { synced: false, syncedToFirebaseAuth: false };

  try {
    await auth.setCustomUserClaims(opts.uid, {
      role: opts.role,
      accountStatus: opts.accountStatus,
    });
    await auth.updateUser(opts.uid, {
      disabled: opts.accountStatus !== 'active',
    });
    if (opts.revokeTokens) {
      await auth.revokeRefreshTokens(opts.uid);
    }
    return { synced: true, syncedToFirebaseAuth: true };
  } catch (err) {
    console.warn('[firebase-admin] syncFirebaseRoleClaims skipped for non-cloud UID:', err);
    return { synced: false, syncedToFirebaseAuth: false };
  }
}
