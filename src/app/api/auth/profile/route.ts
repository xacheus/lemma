import { NextResponse } from 'next/server';
import { apiRoute, readBody, sessionCookie } from '@/lib/api/http';
import { profileUpdateSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { updateUserProfile } from '@/lib/domain/operations';
import { buildSnapshot, stripUser } from '@/lib/api/snapshot';
import { sessionToken } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const GET = apiRoute({
  handler: ({ session }) => stripUser(session.userRecord),
});

export const PATCH = apiRoute({
  handler: async ({ req, session }) => {
    const patch = await readBody(req, profileUpdateSchema);
    const { updated, snapshot } = await runAtomicTransaction((db) => {
      const u = updateUserProfile(db, session.uid, patch);
      return { updated: stripUser(u), sessionVersion: u.sessionVersion ?? 1, snapshot: buildSnapshot(db, session) };
    });
    const res = NextResponse.json({ ok: true, data: { account: updated, snapshot } });
    if (patch.newPassword) {
      res.cookies.set(sessionCookie(sessionToken(session.uid, (updated.sessionVersion ?? 1))));
    }
    return res;
  },
});
