'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

export default function SetupAdminPage() {
  const router = useRouter();
  const [status, setStatus] = useState<{ bootstrapped: boolean; tokenConfigured: boolean } | null>(null);
  const [setupToken, setSetupToken] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+260 ');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/setup-admin')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setStatus(j.data);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken, fullName, email, phoneNumber, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Bootstrap failed.');
        setBusy(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Network error while bootstrapping administrator.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sand-50 px-5 py-12">
      <div className="w-full max-w-[29rem]">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.jpg"
            alt="Lemma Heights Apartments"
            className="h-10 w-10 rounded-md object-cover ring-1 ring-sand-300"
          />
          <div>
            <p className="text-[0.95rem] font-semibold tracking-[0.12em] text-navy-900">
              LEMMA HEIGHTS
            </p>
            <p className="text-[0.66rem] uppercase tracking-[0.16em] text-navy-500">
              Initial Super-Admin Provisioning
            </p>
          </div>
        </div>

        <div className="card p-6">
          {status?.bootstrapped ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-navy-900">
                <Lock size={18} className="text-st-available" />
                <h1 className="text-[1.15rem] font-semibold">Initial Bootstrap Locked</h1>
              </div>
              <p className="text-[0.84rem] leading-relaxed text-navy-600">
                An active <strong>Super Administrator</strong> already exists for this property.
                For security, public bootstrap is permanently disabled once an owner account is
                provisioned. Additional administrators, receptionists, and cleaners can be promoted
                from <strong>Admin → Staff &amp; Users</strong>.
              </p>
              <div className="pt-2">
                <Link href="/login" className="btn btn-primary">
                  Sign in as Administrator
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center gap-2 text-navy-900">
                <ShieldCheck size={18} className="text-lemma-dark" />
                <h1 className="text-[1.15rem] font-semibold">Provision First Super Administrator</h1>
              </div>
              <p className="text-[0.82rem] text-navy-600">
                Requires the server-side <code className="rounded bg-sand-100 px-1.5 py-0.5 text-[0.76rem]">FIRST_ADMIN_SETUP_TOKEN</code> environment variable.
                {status && !status.tokenConfigured ? (
                  <span className="mt-2 block rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-2.5 py-1.5 text-[0.78rem] font-medium text-st-cancelled">
                    FIRST_ADMIN_SETUP_TOKEN is not set on this server, so provisioning cannot run yet. Add it to the environment and reload this page.
                  </span>
                ) : null}
              </p>

              <div>
                <label className="label mb-1 block" htmlFor="setupToken">
                  Server Setup Token
                </label>
                <input
                  id="setupToken"
                  type="password"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="fullName">
                  Owner / Administrator Full Name
                </label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="phone">
                  Phone Number
                </label>
                <input
                  id="phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="password">
                  Password (minimum 8 characters)
                </label>
                <input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                {busy ? 'Provisioning...' : 'Provision Super Administrator'}
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
