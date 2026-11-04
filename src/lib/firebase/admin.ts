import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
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

export interface ResolvedFirebaseAdminCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function cleanEnvValue(raw: string | undefined): string {
  if (!raw) return '';
  let val = raw.trim();
  // Strip a trailing comma when copied directly from a JSON line (`"field": "...",`).
  if (val.endsWith(',')) val = val.slice(0, -1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

function hasPemMarkers(pem: string): boolean {
  return (
    (pem.includes('-----BEGIN PRIVATE KEY-----') && pem.includes('-----END PRIVATE KEY-----')) ||
    (pem.includes('-----BEGIN RSA PRIVATE KEY-----') && pem.includes('-----END RSA PRIVATE KEY-----'))
  );
}

/**
 * Turns a pasted private key (PEM with real newlines, escaped `\n`, quoted JSON line,
 * base64-encoded PEM, or full service-account JSON) into a usable PEM string.
 */
export function normalisePrivateKey(raw: string): string | null {
  let key = cleanEnvValue(raw);
  if (!key) return null;

  if (key.startsWith('{')) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown };
      if (typeof parsed.private_key === 'string') {
        key = parsed.private_key.trim();
      }
    } catch {
      return null;
    }
  }

  key = key.replace(/\\r\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim();
  if (hasPemMarkers(key)) return key;

  // Support base64-encoded PEM values often used in CI / Vercel env vars.
  if (/^[A-Za-z0-9+/=\s]+$/.test(key) && key.length > 64) {
    try {
      const decoded = Buffer.from(key.replace(/\s+/g, ''), 'base64')
        .toString('utf8')
        .replace(/\\n/g, '\n')
        .trim();
      if (hasPemMarkers(decoded)) return decoded;
    } catch {
      return null;
    }
  }

  return null;
}

function parseServiceAccountJson(raw: string | undefined): Partial<ResolvedFirebaseAdminCredentials> | null {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) return null;

  let jsonText = cleaned;
  if (!jsonText.startsWith('{') && /^[A-Za-z0-9+/=\s]+$/.test(jsonText) && jsonText.length > 64) {
    try {
      const decoded = Buffer.from(jsonText.replace(/\s+/g, ''), 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) jsonText = decoded;
    } catch {
      // Not base64 JSON
    }
  }
  if (!jsonText.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(jsonText) as {
      project_id?: unknown;
      projectId?: unknown;
      client_email?: unknown;
      clientEmail?: unknown;
      private_key?: unknown;
      privateKey?: unknown;
    };
    const privateKeyRaw =
      typeof parsed.private_key === 'string'
        ? parsed.private_key
        : typeof parsed.privateKey === 'string'
          ? parsed.privateKey
          : '';
    const privateKey = privateKeyRaw ? normalisePrivateKey(privateKeyRaw) ?? undefined : undefined;
    const clientEmail =
      typeof parsed.client_email === 'string'
        ? parsed.client_email.trim()
        : typeof parsed.clientEmail === 'string'
          ? parsed.clientEmail.trim()
          : undefined;
    const projectId =
      typeof parsed.project_id === 'string'
        ? parsed.project_id.trim()
        : typeof parsed.projectId === 'string'
          ? parsed.projectId.trim()
          : undefined;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

function inferProjectIdFromEmail(clientEmail: string): string {
  const match = clientEmail.match(/@([a-z0-9-]+)\.iam\.gserviceaccount\.com$/i);
  return match?.[1] ?? '';
}

export function resolveFirebaseAdminCredentials(): ResolvedFirebaseAdminCredentials | null {
  if (process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY) {
    throw new Error('SECURITY VIOLATION: FIREBASE_PRIVATE_KEY must never use NEXT_PUBLIC_.');
  }

  const fromJson =
    parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT) ??
    parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) ??
    parseServiceAccountJson(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ??
    parseServiceAccountJson(process.env.FIREBASE_PRIVATE_KEY);

  const privateKey =
    fromJson?.privateKey ??
    (process.env.FIREBASE_PRIVATE_KEY ? normalisePrivateKey(process.env.FIREBASE_PRIVATE_KEY) : null);
  if (!privateKey) return null;

  const clientEmail = (fromJson?.clientEmail || cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL)).trim();
  if (!clientEmail || !clientEmail.includes('@')) return null;

  const projectId = (
    fromJson?.projectId ||
    cleanEnvValue(process.env.FIREBASE_PROJECT_ID) ||
    cleanEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ||
    inferProjectIdFromEmail(clientEmail)
  ).trim();
  if (!projectId) return null;

  return { projectId, clientEmail, privateKey };
}

let adminApp: App | null = null;
let activeFingerprint: string | null = null;
let failedFingerprint: string | null = null;

function fingerprintFor(creds: ResolvedFirebaseAdminCredentials): string {
  return `${creds.projectId}|${creds.clientEmail}|${creds.privateKey.length}:${creds.privateKey.slice(-36)}`;
}

/**
 * True only when all three credentials resolve and the PEM key is rejected neither by
 * structural checks nor by OpenSSL `cert()` initialisation.
 */
export function isFirebaseAdminConfigured(): boolean {
  const creds = resolveFirebaseAdminCredentials();
  if (!creds) return false;
  if (failedFingerprint && failedFingerprint === fingerprintFor(creds)) return false;
  return true;
}

export function getFirebaseAdminApp(): App | null {
  const creds = resolveFirebaseAdminCredentials();
  if (!creds) return null;

  const fp = fingerprintFor(creds);
  if (failedFingerprint === fp) return null;
  if (adminApp && activeFingerprint === fp) return adminApp;

  const appName = `lemma-server-${Buffer.from(fp).toString('base64url').slice(0, 12)}`;
  if (getApps().some((app) => app.name === appName)) {
    adminApp = getApp(appName);
    activeFingerprint = fp;
    return adminApp;
  }

  try {
    adminApp = initializeApp(
      {
        credential: cert({
          projectId: creds.projectId,
          clientEmail: creds.clientEmail,
          privateKey: creds.privateKey,
        }),
      },
      appName,
    );
    activeFingerprint = fp;
    return adminApp;
  } catch (error) {
    failedFingerprint = fp;
    adminApp = null;
    console.warn('[firebase-admin] Service account credentials could not be initialised; falling back to local store:', error);
    return null;
  }
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
