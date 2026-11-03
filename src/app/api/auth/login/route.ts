import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth/passwords';
import { sessionToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/store';
import { HttpError, readBody, sessionCookie } from '@/lib/api/http';
import { loginSchema } from '@/lib/api/schemas';

export const runtime = 'nodejs';

/**
 * Demo sign-in. Any active staff account from Staff & Permissions can sign in with
 * the shared demo password; roles drive what the rest of the app will show.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody(req, loginSchema);
    const db = getDb();
    const user = db.staff.find((s) => s.username.toLowerCase() === body.username.trim().toLowerCase());
    if (!user || !user.active) {
      throw new HttpError('No active account matches that login handle.', 401, 'bad_credentials');
    }
    const expected = user.passwordHash ?? null;
    const okPassword = expected ? verifyPassword(body.password, expected) : false;
    if (!okPassword) {
      throw new HttpError('That password is not correct for this account.', 401, 'bad_credentials');
    }
    db.staff.find((s) => s.id === user.id)!.lastSeenAt = new Date().toISOString();
    const response = NextResponse.json({
      ok: true,
      data: { id: user.id, name: user.name, role: user.role, jobTitle: user.jobTitle },
    });
    response.cookies.set(sessionCookie(sessionToken(user.id)));
    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: 'Sign in could not be completed. Try again.', code: 'server_error' }, { status: 500 });
  }
}
