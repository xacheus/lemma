'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import type { Role } from '@/lib/domain/types';
import { getFirebaseClientAuth, isFirebaseClientConfigured } from '@/lib/firebase/client';
import { BrandMark } from '@/components/public/brand-mark';

function destinationForRole(role: Role, nextPath: string | null): string {
  if (nextPath && nextPath.startsWith('/')) {
    if (role === 'guest' && nextPath.startsWith('/admin')) return '/account';
    if (role === 'cleaner' && nextPath.startsWith('/admin')) return '/portal/cleaning';
    return nextPath;
  }
  if (role === 'cleaner') return '/portal/cleaning';
  if (role === 'guest') return '/account';
  return '/admin';
}

export function LoginPage({
  propertyName,
  nextPath,
}: {
  propertyName: string;
  nextPath: string | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (isFirebaseClientConfigured() && username.includes('@')) {
        const auth = getFirebaseClientAuth();
        if (auth) {
          try {
            const credential = await signInWithEmailAndPassword(auth, username.trim(), password);
            const idToken = await credential.user.getIdToken();
            const exchange = await fetch('/api/auth/firebase-session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ firebaseIdToken: idToken }),
            });
            const payload = await exchange.json();
            if (exchange.ok && payload.ok) {
              router.push(destinationForRole(payload.data.role, nextPath));
              router.refresh();
              return;
            }
            if (payload.code !== 'firebase_not_configured' && payload.code !== 'account_conflict') {
              setError(payload.error ?? 'Sign in failed.');
              setBusy(false);
              await signOut(auth).catch(() => undefined);
              return;
            }
            await signOut(auth).catch(() => undefined);
          } catch (err) {
            void err;
          }
        }
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? 'Sign in failed.');
        setBusy(false);
        return;
      }
      router.push(destinationForRole(payload.data.role, nextPath));
      router.refresh();
    } catch {
      setError('The server could not be reached. Please try again.');
      setBusy(false);
    }
  }

  const brandTitle = propertyName || 'Lemma Apartments';

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative hidden flex-col justify-between bg-charcoal-950 px-10 py-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark tone="dark" size="lg" />
          <div>
            <p className="font-display text-[1.12rem] font-semibold leading-none text-white">
              {brandTitle}
            </p>
            <p className="mt-1 text-[0.74rem] text-sand-300">
              Barlaston Park · Lusaka, Zambia
            </p>
          </div>
        </Link>

        <div className="max-w-md space-y-6">
          <div>
            <h1 className="font-display text-[2.15rem] font-medium leading-[1.15] tracking-[-0.015em] text-white">
              Your bookings, payment references &amp; ZMW receipts in one place.
            </h1>
            <p className="mt-3.5 text-[0.92rem] leading-relaxed text-sand-300">
              Sign in to view upcoming stays, upload mobile-money or bank transfer references, and
              download verified quotations, invoices and official receipts.
            </p>
          </div>

          <ul className="space-y-3 border-t border-white/10 pt-5 text-[0.86rem] text-sand-200">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Live confirmation &amp; deposit verification status
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Downloadable PDF receipts for corporate expense claims
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Direct date-change or cancellation requests to reception
            </li>
          </ul>
        </div>

        <p className="text-[0.75rem] text-sand-400">
          {brandTitle} · Lusaka, Zambia · Staff accounts use this same sign-in screen.
        </p>
      </div>

      <div className="flex flex-col justify-center bg-sand-50 px-5 py-10 sm:px-10">
        <div className="animate-fade-up mx-auto w-full max-w-[27rem]">
          <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
            <BrandMark tone="light" size="md" />
            <div>
              <p className="font-display text-[1.05rem] font-semibold text-navy-900">
                {brandTitle}
              </p>
              <p className="text-[0.7rem] text-sand-600">Lusaka, Zambia</p>
            </div>
          </Link>

          <h2 className="font-display text-[1.65rem] font-medium tracking-[-0.015em] text-navy-900">
            Sign in
          </h2>
          <p className="mt-1 text-[0.86rem] text-sand-700">
            Access your guest bookings and receipts.
          </p>

          <form onSubmit={submit} className="card mt-6 p-6">
            <label className="label mb-1.5 block" htmlFor="username">
              Email address
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field"
              placeholder="name@example.com"
              required
            />
            <p className="mt-1 text-[0.72rem] text-sand-600">
              Staff members may also enter their desk username.
            </p>

            <div className="mt-4 flex items-center justify-between">
              <label className="label block" htmlFor="password">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[0.76rem] font-medium text-lemma-dark hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pr-10"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-sand-500 hover:bg-sand-100 hover:text-navy-800"
                aria-label={reveal ? 'Hide password' : 'Show password'}
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error ? (
              <p className="mt-3 flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] font-medium text-st-cancelled">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary mt-5 w-full justify-center py-2.5"
            >
              {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} />
            </button>

            <div className="mt-5 space-y-2.5 border-t border-sand-200 pt-4 text-[0.8rem] text-sand-700">
              <div className="flex items-center justify-between">
                <span>New guest?</span>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 font-semibold text-navy-900 hover:text-lemma-dark"
                >
                  <UserPlus size={14} /> Create guest account
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span>Booked without an account?</span>
                <Link
                  href="/booking/access"
                  className="inline-flex items-center gap-1.5 font-medium text-lemma-dark hover:underline"
                >
                  <KeyRound size={13} /> Find by reference
                </Link>
              </div>
            </div>
          </form>

          <div className="mt-5 flex items-center justify-between text-[0.78rem] text-sand-600">
            <Link href="/" className="hover:text-navy-900">
              ← Back to website
            </Link>
            <Link href="/policies" className="hover:text-navy-900">
              Booking terms
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
