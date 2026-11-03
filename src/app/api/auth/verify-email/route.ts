import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/http';
import { runAtomicTransaction } from '@/lib/db/store';
import { verifyUserEmailToken } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const GET = publicRoute(async ({ req, search }) => {
  const token = search.get('token') ?? '';
  await runAtomicTransaction((db) => verifyUserEmailToken(db, token));
  return NextResponse.redirect(new URL('/account?verified=1', req.url));
});
