'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { PhotoFrame } from '@/components/ui/photo';

interface Account {
  name: string;
  username: string;
  role: 'admin' | 'receptionist' | 'cleaner';
  jobTitle: string;
}

export function LoginPage({ accounts, propertyName }: { accounts: Account[]; propertyName: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('lemma2026');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
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
      router.push(payload.data.role === 'cleaner' ? '/portal/cleaning' : '/admin');
      router.refresh();
    } catch {
      setError('The server could not be reached. Nothing was saved.');
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-navy-900 px-10 py-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/brand/logo.jpg" alt="" className="h-11 w-11 rounded-lg bg-white object-contain p-1" />
          <div>
            <p className="font-display text-[1.05rem] leading-none tracking-[0.16em]">LEMMA HEIGHTS</p>
            <p className="mt-1 text-[0.68rem] uppercase tracking-[0.24em] text-navy-200">Apartments · Lusaka</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="font-display text-[2.1rem] leading-[1.15]">
            The front desk, the ledger and the cleaning rota in one place.
          </h1>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-navy-100/85">
            Sign in as the owner to see revenue and occupancy, as reception to work arrivals and payments, or as a cleaner to
            see only your rooms. Availability is enforced at the server, so two guests can never be sold the same night.
          </p>
          <div className="mt-8 overflow-hidden rounded-xl ring-1 ring-white/15">
            <PhotoFrame src="/images/lobby.jpg" alt="Lemma Heights lobby" ratio="16 / 7" caption="Property photograph — to be supplied" />
          </div>
        </div>

        <p className="text-[0.72rem] leading-relaxed text-navy-200">
          Demonstration environment. Guest records, payments and messages are simulated sample data held in this project — no live
          payment provider or messaging account is connected.
        </p>
      </div>

      <div className="flex flex-col justify-center bg-sand-50 px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <img src="/brand/logo.jpg" alt={`${propertyName} logo`} className="h-10 w-10 rounded-lg bg-white object-contain p-1 ring-1 ring-sand-200" />
            <p className="font-display text-[1rem] tracking-[0.14em] text-navy-800">LEMMA HEIGHTS</p>
          </div>

          <h2 className="font-display text-[1.5rem] text-navy-800">Staff sign in</h2>
          <p className="mt-1 text-[0.85rem] text-navy-500">Use one of the demonstration accounts below.</p>

          <form onSubmit={submit} className="card mt-6 p-5">
            <label className="label mb-1 block" htmlFor="username">
              Login handle
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field"
              placeholder="alice"
              required
            />

            <label className="label mb-1 mt-4 block" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pr-10"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-navy-400 hover:bg-sand-100 hover:text-navy-700"
                aria-label={reveal ? 'Hide password' : 'Show password'}
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-st-cancelled/30 bg-st-cancelledBg px-2.5 py-2 text-[0.78rem] font-medium text-st-cancelled">
                <AlertCircle size={14} className="mt-px shrink-0" /> {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary btn-md mt-4 w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
              {!busy ? <ArrowRight size={15} /> : null}
            </button>

            <p className="mt-3 flex items-start gap-1.5 text-[0.72rem] leading-snug text-navy-400">
              <ShieldCheck size={13} className="mt-px shrink-0 text-teal-500" />
              Demo password for every account: <span className="font-semibold text-navy-600">lemma2026</span>. Sessions last one shift and are stored in an
              httpOnly cookie.
            </p>
          </form>

          <div className="mt-5">
            <p className="label mb-2">Accounts to try</p>
            <ul className="space-y-1.5">
              {accounts.map((account) => (
                <li key={account.username}>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername(account.username);
                      setPassword('lemma2026');
                      setError(null);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      username === account.username ? 'border-gold-300 bg-gold-50' : 'border-sand-200 bg-white hover:border-sand-300'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.84rem] font-semibold text-navy-800">{account.name}</span>
                      <span className="block truncate text-[0.74rem] text-navy-400">{account.jobTitle}</span>
                    </span>
                    <span className="chip shrink-0 bg-navy-50 text-navy-600">{account.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 text-[0.74rem] leading-relaxed text-navy-400">
            Looking for the guest-facing site?{' '}
            <Link href="/" className="link">
              Search availability and request a stay
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
