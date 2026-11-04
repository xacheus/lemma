'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PermissionKey } from '@/lib/domain/types';
import type { SnapshotView } from '@/lib/view-types';

/* ------------------------------------------------------------------------------ api */

export interface ApiFailure {
  error: string;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, code = 'bad_request', details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function call<T>(path: string, init?: RequestInit & { data?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: init?.data ? { 'content-type': 'application/json' } : undefined,
      body: init?.data ? JSON.stringify(init.data) : undefined,
      signal: init?.signal,
    });
  } catch (err) {
    // A failed connection does not establish whether a write reached the server.
    // Never retry mutations automatically or imply that they were not saved.
    if (!(err instanceof TypeError)) throw err;
    const isRead = ['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase());
    throw new ApiError(
      isRead
        ? 'Could not connect to the server. Check your connection and try again.'
        : 'The connection was interrupted. Check whether the change was saved before trying again.',
      0,
      'network_error',
    );
  }
  let payload: { ok: boolean; data?: T; error?: string; code?: string; details?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.ok) {
    throw new ApiError(
      payload?.error ?? `The server responded with ${response.status}. No changes were saved.`,
      response.status,
      payload?.code ?? 'network',
      payload?.details,
    );
  }
  return payload.data as T;
}

/* ----------------------------------------------------------------------------- toast */

export interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  body?: string;
}

interface ToastContext {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<ToastContext>({ toasts: [], push: () => {}, dismiss: () => {} });

export function ToastViewport() {
  const { toasts, dismiss } = useContext(ToastCtx);
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-[80] flex max-h-[50dvh] w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto no-print" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-pop ${
            toast.tone === 'error' ? 'border-st-cancelled/40' : toast.tone === 'success' ? 'border-st-available/40' : 'border-sand-300'
          }`}
        >
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${
              toast.tone === 'error' ? 'bg-st-cancelled' : toast.tone === 'success' ? 'bg-st-available' : 'bg-navy-600'
            }`}
          >
            {toast.tone === 'error' ? <AlertTriangle size={13} /> : <Check size={13} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.85rem] font-semibold text-navy-800">{toast.title}</p>
            {toast.body ? <p className="mt-0.5 text-[0.8rem] leading-snug text-navy-500">{toast.body}</p> : null}
          </div>
          <button onClick={() => dismiss(toast.id)} className="btn-ghost h-6 w-6 rounded-md p-0" aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- provider */

export interface AppUser {
  id: string;
  name: string;
  role: 'admin' | 'receptionist' | 'cleaner';
  jobTitle: string;
  username: string;
}

interface AppContextValue {
  snapshot: SnapshotView | null;
  status: 'loading' | 'ready' | 'anonymous' | 'error';
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  request: <R = unknown>(path: string, init?: { method?: string; data?: unknown; notifyOnError?: boolean }) => Promise<R>;
  can: (permission: PermissionKey) => boolean;
  toast: (t: Omit<Toast, 'id'>) => void;
  signOut: () => Promise<void>;
}

const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ bootstrap, children }: { bootstrap?: SnapshotView | null; children: React.ReactNode }) {
  const [snapshot, setSnapshotState] = useState<SnapshotView | null>(bootstrap ?? null);
  const [status, setStatus] = useState<AppContextValue['status']>(bootstrap ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [busyCount, setBusyCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => {
      if (list.some((item) => item.tone === toast.tone && (toast.body ? item.body === toast.body : item.title === toast.title && !item.body))) return list;
      return [...list, { ...toast, id }].slice(-3);
    });
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), toast.tone === 'error' ? 9000 : 4500);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const data = await call<SnapshotView>('/api/session');
      setSnapshotState(data);
      setStatus('ready');
      setError(null);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 401) setStatus('anonymous');
      else {
        setStatus('error');
        setError(apiErr.message);
      }
    }
  }, []);

  useEffect(() => {
    if (!bootstrap) void refresh();
  }, [bootstrap, refresh]);

  const request = useCallback(
    async <R,>(path: string, init?: { method?: string; data?: unknown; notifyOnError?: boolean }) => {
      setBusyCount((n) => n + 1);
      try {
        const result = await call<R>(path, init);
        const maybe = result as { snapshot?: SnapshotView };
        if (maybe && typeof maybe === 'object' && maybe.snapshot) {
          setSnapshotState(maybe.snapshot);
        }
        return result;
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 401) {
          setStatus('anonymous');
          push({ tone: 'error', title: 'Session expired', body: 'Sign in again to continue — nothing was saved.' });
        } else if (init?.notifyOnError !== false) {
          push({ tone: 'error', title: 'Action not completed', body: apiErr.message });
        }
        throw apiErr;
      } finally {
        setBusyCount((n) => Math.max(0, n - 1));
      }
    },
    [push],
  );

  const signOut = useCallback(async () => {
    await call('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }, []);

  // Consumers may use can in effects. Its identity must not change when a
  // request toggles busyCount or a toast is shown, or those effects can loop.
  const can = useCallback((permission: PermissionKey) => !!snapshot?.permissions?.includes(permission), [snapshot?.permissions]);

  const value = useMemo<AppContextValue>(
    () => ({
      snapshot,
      status,
      error,
      busy: busyCount > 0,
      refresh,
      request,
      can,
      toast: push,
      signOut,
    }),
    [snapshot, status, error, busyCount, refresh, request, can, push, signOut],
  );

  return (
    <AppCtx.Provider value={value}>
      <ToastCtx.Provider value={{ toasts, push, dismiss }}>
        {children}
        <ToastViewport />
      </ToastCtx.Provider>
    </AppCtx.Provider>
  );
}
