import { NextResponse } from 'next/server';
import { sessionToken } from '@/lib/auth/session';
import { runAtomicTransaction } from '@/lib/db/store';
import { HttpError, readBody, sessionCookie } from '@/lib/api/http';
import { loginSchema } from '@/lib/api/schemas';
import { authenticateAccount, OperationError } from '@/lib/domain/operations';
import { getAdminAuth } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await readBody(req, loginSchema);

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
        const found = (db.users ?? []).find(
          (u) => u.uid === firebaseUid || (firebaseEmail && u.email.toLowerCase() === firebaseEmail.toLowerCase()),
        );
        if (!found) {
          throw new OperationError('User profile not found for this Firebase account.', 404, 'not_found');
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
      },
    });
    response.cookies.set(sessionCookie(sessionToken(user.uid, user.sessionVersion ?? 1)));
    return response;
  } catch (error) {
    if (error instanceof HttpError || error instanceof OperationError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'Sign in could not be completed. Try again.', code: 'server_error' },
      { status: 500 },
    );
  }
}
