import { NextResponse } from 'next/server';
import { publicRoute, readBody, sessionCookie } from '@/lib/api/http';
import { bootstrapAdminSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { bootstrapFirstSuperAdmin } from '@/lib/domain/operations';
import { sessionToken } from '@/lib/auth/session';
import { syncFirebaseRoleClaims } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export const GET = publicRoute(async () => {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const hasSuperAdmin = (db.users ?? []).some(
    (u) => u.role === 'super_admin' && u.accountStatus === 'active',
  );
  return {
    bootstrapped: hasSuperAdmin,
    tokenConfigured: Boolean(process.env.FIRST_ADMIN_SETUP_TOKEN),
  };
});

export const POST = publicRoute(async ({ req }) => {
  const input = await readBody(req, bootstrapAdminSchema);
  const user = await runAtomicTransaction((db) => bootstrapFirstSuperAdmin(db, input));
  await syncFirebaseRoleClaims(user.uid, 'super_admin', 'active');

  const response = NextResponse.json({
    ok: true,
    data: {
      uid: user.uid,
      email: user.email,
      role: user.role,
    },
  });
  response.cookies.set(sessionCookie(sessionToken(user.uid, user.sessionVersion ?? 1)));
  return response;
});
