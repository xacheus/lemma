'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, UserPlus } from 'lucide-react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import type { Role } from '@/lib/domain/types';
import { getFirebaseClientAuth, isFirebaseClientConfigured } from '@/lib/firebase/client';

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

    /**
     * One sign-in form, two authorities.
     *
     * When this build is wired to Firebase (the owner's accounts live in Firebase
     * Auth) the credentials are proved by Firebase itself and the resulting ID token
     * is exchanged for a session cookie server-side. Accounts that exist only in this
     * database — guests who registered through the site, staff created in the admin
     * screen — fall back to the password path on the same form.
     */
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
            // An email shared with an older local account must not inherit its role.
            // Clear the Firebase sign-in and allow the local password check below.
            await signOut(auth).catch(() => undefined);
          } catch (err) {
            // Do not stop at the first refusal. `auth/invalid-credential` is returned
            // for both a wrong password and an address that has no Firebase Auth
            // account at all, and this app also holds accounts that only exist in its
            // own database. Treating that code as final locked out every guest who
            // registered at /register. Fall through to the password path and let it
            // have the last word: it is the only authority that knows about both kinds
            // of account, and it still rejects a genuinely wrong password.
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

  return (
    <main className="grid grid-cols-1 min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <div className="relative hidden flex-col justify-between bg-navy-900 px-10 py-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.jpg"
            alt={propertyName}
            className="h-11 w-11 rounded-md object-cover ring-1 ring-white/20"
          />
          <div>
            <p className="font-display text-[1rem] font-semibold leading-none tracking-[0.14em]">
              LEMMA APARTMENTS
            </p>
            <p className="mt-1 text-[0.68rem] uppercase tracking-[0.2em] text-navy-200">
              Serviced Apartments · Lusaka
            </p>
          </div>
        </Link>

        <div className="max-w-lg">
          <h1 className="text-[2rem] font-semibold leading-[1.18] tracking-tight text-white">
            Guest reservations, verified payments, quotations, and property operations.
          </h1>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-navy-200">
            Sign in with your guest account to manage bookings and download official ZMW receipts,
            or sign in with an authorised staff account to operate reservations, housekeeping, and
            property administration.
          </p>
          <div className="relative mt-8 overflow-hidden rounded-lg ring-1 ring-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/apartments/apt-02/01.jpg"
              alt=""
              aria-hidden="true"
              className="h-44 w-full object-cover object-[60%_center] opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/30 to-transparent" />
            <p className="absolute bottom-3 left-4 right-4 text-[0.76rem] text-white/80">
              Representative stock photography · Not of the property
            </p>
          </div>
        </div>

        <p className="text-[0.74rem] leading-relaxed text-navy-300">
          {propertyName} · Lusaka, Zambia
        </p>
      </div>

      <div className="flex flex-col justify-center bg-sand-50 px-5 py-10 sm:px-10">
        <div className="animate-fade-up mx-auto w-full max-w-[27rem]">
          <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.jpg"
              alt={`${propertyName} logo`}
              className="h-10 w-10 rounded-md object-cover ring-1 ring-sand-300"
            />
            <div>
              <p className="text-[0.95rem] font-semibold tracking-[0.12em] text-navy-900">
                LEMMA APARTMENTS
              </p>
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-navy-500">
                Apartments · Lusaka
              </p>
            </div>
          </Link>

          <h2 className="text-[1.45rem] font-semibold tracking-tight text-navy-900">
            Sign in to your account
          </h2>
          <p className="mt-1 text-[0.85rem] text-navy-500">
            Enter your email address or staff handle to continue.
          </p>

          <form onSubmit={submit} className="card mt-6 p-6">
            <label className="label mb-1.5 block" htmlFor="username">
              Email address or staff handle
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field"
              placeholder="name@company.co.zm"
              required
            />

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
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-navy-400 hover:bg-sand-100 hover:text-navy-700"
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
              {busy ? 'Signing in...' : 'Sign in'} <ArrowRight size={15} />
            </button>

            <div className="mt-5 flex items-center justify-between border-t border-sand-200 pt-4 text-[0.8rem] text-navy-600">
              <span>New guest booking with us?</span>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 font-semibold text-navy-900 hover:text-lemma-dark"
              >
                <UserPlus size={14} /> Create account
              </Link>
            </div>
          </form>


          <div className="mt-5 flex items-center justify-between text-[0.76rem] text-navy-500">
            <Link href="/" className="hover:text-navy-900">
              Return to public website
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
