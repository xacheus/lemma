'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { BrandMark } from '@/components/public/brand-mark';
import { OFFICIAL_BRAND_NAME } from '@/lib/brand';

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Could not process reset request.');
      } else {
        setInfo(json.data.message);
      }
    } catch {
      setError('Network error while contacting server.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Reset token is invalid or expired.');
        setBusy(false);
        return;
      }
      router.push('/login');
    } catch {
      setError('Network error while updating password.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sand-50 px-5 py-12">
      <div className="w-full max-w-[26rem]">
        <Link href="/" className="mb-6 flex items-center gap-3">
          <BrandMark tone="light" size="md" />
          <div>
            <p className="font-display text-[1.05rem] font-semibold text-navy-900">
              {OFFICIAL_BRAND_NAME}
            </p>
            <p className="text-[0.7rem] text-sand-600">
              Account Security
            </p>
          </div>
        </Link>

        <div className="card p-6">
          <div className="flex items-center gap-2 text-navy-900">
            <KeyRound size={18} className="text-lemma-dark" />
            <h1 className="text-[1.2rem] font-semibold">
              {token ? 'Choose a new password' : 'Reset your password'}
            </h1>
          </div>

          {token ? (
            <form onSubmit={submitNewPassword} className="mt-4 space-y-4">
              <div>
                <label className="label mb-1 block" htmlFor="newPassword">
                  New password (min 6 characters)
                </label>
                <input
                  id="newPassword"
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="field"
                  required
                />
              </div>
              {error ? (
                <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">
                {busy ? 'Updating...' : 'Save new password'}
              </button>
            </form>
          ) : (
            <form onSubmit={requestReset} className="mt-4 space-y-4">
              <p className="text-[0.83rem] text-navy-600">
                Enter the email address registered on your account to initiate a password reset.
              </p>
              <div>
                <label className="label mb-1 block" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                  placeholder="name@company.co.zm"
                  required
                />
              </div>

              {error ? (
                <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
                </p>
              ) : null}
              {info ? (
                <p className="flex items-start gap-2 rounded-md border border-st-available/30 bg-st-availableBg px-3 py-2 text-[0.8rem] text-st-available">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {info}
                </p>
              ) : null}

              <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">
                {busy ? 'Sending...' : 'Request password reset'}
              </button>
            </form>
          )}

          <div className="mt-5 border-t border-sand-200 pt-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-navy-600 hover:text-navy-900"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sand-50" />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
