import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/api/http';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true, data: { signedOut: true } });
  response.cookies.set(clearSessionCookie());
  return response;
}
