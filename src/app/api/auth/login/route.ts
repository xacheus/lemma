import { NextResponse } from 'next/server';
import { sessionToken } from '@/lib/auth/session';
import { runAtomicTransaction, StoreUnavailableError } from '@/lib/db/store';
import { HttpError, readBody, sessionCookie } from '@/lib/api/http';
import { loginSchema } from '@/lib/api/schemas';
import { authenticateAccount, OperationError } from '@/lib/domain/operations';
import { getAdminAuth, syncFirebaseRoleClaims } from '@/lib/firebase/admin';
import {
  clearSignInFailures,
  recordSignInFailure,
  signInLockRemainingMs,
} from '@/lib/auth/throttle';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let identifier = '';
  try {
    const body = await readBody(req, loginSchema);
    identifier = body.username;

    const lockedMs = signInLockRemainingMs(identifier);
    if (lockedMs > 0) {
      const minutes = Math.ceil(lockedMs / 60000);
      return NextResponse.json(
        {
          ok: false,
          error: `Too many wrong attempts on this account. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use "Forgot password".`,
          code: 'too_many_attempts',
        },
        { status: 429 },
      );
    }

    // Optional Firebase Auth ID Token verification path when Firebase Client Auth is active
    let firebaseEmail: string | null = null;
    let firebaseUid: string | null = null;
    if (body.firebaseIdToken) {
      const adminAuth = getAdminAuth();
      if (adminAuth) {
        const decoded = await adminAuth.verifyIdToken(body.firebaseIdToken, true);
        firebaseEmail = decoded.email ?? null;
        firebaseUid = decoded.uid;
      }
    }

    const user = await runAtomicTransaction((db) => {
      if (firebaseUid) {
        const found = (db.users ?? []).find((u) => u.uid === firebaseUid);
        if (!found) {
          throw new OperationError('User profile not found for this Firebase account.', 404, 'not_found');
        }
        if (firebaseEmail && found.email.toLowerCase() !== firebaseEmail.toLowerCase()) {
          throw new OperationError('Account email does not match. Contact reception.', 403, 'account_conflict');
        }
        if (found.accountStatus !== 'active') {
          throw new OperationError(
            `This account is ${found.accountStatus}. Contact an administrator.`,
            403,
            'account_inactive',
          );
        }
        found.lastLoginAt = new Date().toISOString();
        found.updatedAt = found.lastLoginAt;
        return found;
      }
      return authenticateAccount(db, {
        identifier: body.username,
        password: body.password,
      });
    });

    clearSignInFailures(identifier);
    void syncFirebaseRoleClaims(user.uid, user.role, user.accountStatus);

    const response = NextResponse.json({
      ok: true,
      data: {
        id: user.uid,
        uid: user.uid,
        name: user.fullName,
        email: user.email,
        role: user.role,
        jobTitle:
          user.jobTitle ||
          (user.role === 'guest'
            ? 'Registered Guest'
            : user.role.replace(/_/g, ' ')),
        // Where this role belongs, decided on the server so the client cannot pick it.
        home: user.role === 'cleaner' ? '/portal/cleaning' : user.role === 'guest' ? '/account' : '/admin',
      },
    });
    response.cookies.set(sessionCookie(sessionToken(user.uid, user.sessionVersion ?? 1)));
    return response;
  } catch (error) {
    if (error instanceof OperationError && error.code === 'bad_credentials') {
      const state = recordSignInFailure(identifier);
      // Phrase a lock, and the attempts left, without ever hinting whether the
      // account exists: the message is identical for an address nobody has.
      const suffix =
        state.lockedMs > 0
          ? ` Too many wrong attempts — try again in ${Math.ceil(state.lockedMs / 60000)} minutes.`
          : state.attemptsLeft <= 2
            ? ` ${state.attemptsLeft} attempt${state.attemptsLeft === 1 ? '' : 's'} left before this account is paused.`
            : '';
      return NextResponse.json(
        { ok: false, error: `Invalid email or password.${suffix}`, code: 'bad_credentials' },
        { status: 401 },
      );
    }
    if (error instanceof HttpError || error instanceof OperationError || error instanceof StoreUnavailableError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error('[auth/login]', error);
    return NextResponse.json(
      { ok: false, error: 'Sign in could not be completed. Try again.', code: 'server_error' },
      { status: 500 },
    );
  }
}
