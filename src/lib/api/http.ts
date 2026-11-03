import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { getSession, SESSION_COOKIE, SESSION_MAX_AGE, type Session } from '../auth/session';
import { OperationError } from '../domain/operations';
import type { PermissionKey } from '../domain/types';
import { describeMissing } from '../domain/permissions';

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'bad_request',
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface Ctx {
  req: NextRequest;
  session: Session;
  params: Record<string, string>;
  search: URLSearchParams;
}

interface RouteOptions {
  /** `none` opens the endpoint to the public booking site. */
  auth?: 'required' | 'none';
  permission?: PermissionKey;
  handler: (ctx: Ctx) => Promise<unknown> | unknown;
}

function errorResponse(error: unknown) {
  if (error instanceof OperationError || error instanceof HttpError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ ok: false, error: 'The request body was not valid JSON.', code: 'malformed' }, { status: 400 });
  }
  console.error('[api] unhandled error', error);
  return NextResponse.json(
    {
      ok: false,
      error: 'The server could not complete that action. Nothing was saved.',
      code: 'server_error',
      details: error instanceof Error ? error.message : undefined,
    },
    { status: 500 },
  );
}

/** Wraps a handler with session resolution, permission checks and error mapping. */
export function apiRoute(options: RouteOptions) {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      if (!session) {
        throw new HttpError('Your session has expired. Sign in again to continue.', 401, 'unauthenticated');
      }
      if (options.permission && !session.permissions.has(options.permission)) {
        throw new HttpError(describeMissing(options.permission), 403, 'forbidden');
      }
      const params = (await context?.params) ?? {};
      const result = await options.handler({ req, session, params, search: req.nextUrl.searchParams });
      if (result instanceof NextResponse) return result;
      return NextResponse.json({ ok: true, data: result });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Same as apiRoute for endpoints that must work without a signed-in user. */
export function publicRoute(handler: (ctx: { req: NextRequest; search: URLSearchParams }) => Promise<unknown> | unknown) {
  return async (req: NextRequest) => {
    try {
      const result = await handler({ req, search: req.nextUrl.searchParams });
      if (result instanceof NextResponse) return result;
      return NextResponse.json({ ok: true, data: result });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readBody<T>(req: { json(): Promise<unknown> }, schema: ZodType<T>): Promise<T> {
  const raw = await req.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(
      first ? `${first.path.join('.') || 'Request'}: ${first.message}` : 'The request was not acceptable.',
      422,
      'validation',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}

export const sessionCookie = (token: string) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === 'production',
});

export function clearSessionCookie() {
  return { name: SESSION_COOKIE, value: '', httpOnly: true, path: '/', maxAge: 0 };
}
