import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getSession, SESSION_COOKIE, SESSION_MAX_AGE, type Session } from '../auth/session';
import { StoreUnavailableError } from '../db/store';
import { OperationError } from '../domain/operations';
import type { PermissionKey, Role } from '../domain/types';
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
  roles?: Role[];
  handler: (ctx: Ctx) => Promise<unknown> | unknown;
}

function errorResponse(error: unknown) {
  if (error instanceof OperationError || error instanceof HttpError || error instanceof StoreUnavailableError) {
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
  if (error instanceof ZodError) {
    return NextResponse.json({
      ok: false,
      error: error.issues[0]?.message ?? 'Please check the details and try again.',
      code: 'validation',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    }, { status: 422 });
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
      // Never expose stack traces or infrastructure details in public responses.
      details: undefined,
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
      if (options.roles && !options.roles.includes(session.user.role)) {
        throw new HttpError(
          `Your role (${session.user.role.replace(/_/g, ' ')}) is not authorised for this action.`,
          403,
          'forbidden',
        );
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
export function publicRoute(
  handler: (ctx: {
    req: NextRequest;
    search: URLSearchParams;
    params: Record<string, string>;
    session: Session | null;
  }) => Promise<unknown> | unknown,
) {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      const params = (await context?.params) ?? {};
      const result = await handler({ req, search: req.nextUrl.searchParams, params, session });
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
    // A guest reading "email: Enter a valid email address." on a sign-up form is reading a
    // schema path, not a sentence. The message is surfaced exactly as written, and when
    // the form has finished validating the duplicate issue for an empty field, only the
    // issues that carry no field path (or one issue) are described.
    const issues = parsed.error.issues;
    const first = issues[0];
    const distinct = issues.filter(
      (issue, index) => issues.findIndex((other) => other.message === issue.message) === index,
    );
    const message =
      distinct.length <= 1
        ? (first?.message ?? 'Please check the details you entered and try again.')
        : 'Please check the details you entered and try again.';
    throw new HttpError(
      message,
      422,
      'validation',
      issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
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
