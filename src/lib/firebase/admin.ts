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

export function isFirebaseAdminConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY) {
    throw new Error('SECURITY VIOLATION: FIREBASE_PRIVATE_KEY must never use NEXT_PUBLIC_.');
  }
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
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
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
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
