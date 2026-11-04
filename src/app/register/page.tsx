'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Shield } from 'lucide-react';
import { PhotoFrame } from '@/components/ui/photo';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+260 ');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName, email, phoneNumber, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Could not create your account.');
        setBusy(false);
        return;
      }
      router.push('/account');
      router.refresh();
    } catch {
      setError('Network error while creating your account.');
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-navy-900 px-10 py-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.jpg"
            alt="Lemma Apartments"
            className="h-11 w-11 rounded-md object-cover ring-1 ring-white/20"
          />
          <div>
            <p className="text-[1rem] font-semibold leading-none tracking-[0.14em]">LEMMA APARTMENTS</p>
            <p className="mt-1 text-[0.68rem] uppercase tracking-[0.2em] text-navy-200">
              Serviced Apartments · Lusaka
            </p>
          </div>
        </Link>

        <div className="max-w-lg">
          <h1 className="text-[1.95rem] font-semibold leading-[1.2] tracking-tight">
            Create your guest account for faster reservations and instant receipts.
          </h1>
          <ul className="mt-5 space-y-2.5 text-[0.88rem] text-navy-200">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              View live booking confirmations and ZMW payment verification status
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Download official PDF quotations, tax invoices, and verified receipts
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Manage your contact details and submit stay amendments directly to reception
            </li>
          </ul>
          <div className="mt-8 overflow-hidden rounded-md ring-1 ring-white/15">
            <PhotoFrame
              src="/images/rooms/luxury-bedroom.jpg"
              alt="Lemma Apartments interior"
              ratio="16 / 8"
              variant="detail"
            />
          </div>
        </div>

        <p className="flex items-center gap-2 text-[0.74rem] text-navy-300">
          <Shield size={13} /> All newly registered accounts are provisioned with standard guest permissions.
        </p>
      </div>

      <div className="flex flex-col justify-center bg-sand-50 px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[27rem]">
          <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.jpg"
              alt="Lemma Apartments"
              className="h-10 w-10 rounded-md object-cover ring-1 ring-sand-300"
            />
            <span className="text-[0.95rem] font-semibold tracking-[0.12em] text-navy-900">
              LEMMA APARTMENTS
            </span>
          </Link>

          <h2 className="text-[1.45rem] font-semibold tracking-tight text-navy-900">
            Register guest account
          </h2>
          <p className="mt-1 text-[0.85rem] text-navy-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-navy-900 hover:underline">
              Sign in here
            </Link>
          </p>

          <form onSubmit={submit} className="card mt-6 p-6 space-y-4">
            <div>
              <label className="label mb-1 block" htmlFor="fullName">
                Full name
              </label>
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="field"
                placeholder="e.g. Chanda Mwale"
                required
              />
            </div>

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

            <div>
              <label className="label mb-1 block" htmlFor="phone">
                Phone / WhatsApp number
              </label>
              <input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="field"
                placeholder="+260 97 700 0000"
                required
              />
            </div>

            <div>
              <label className="label mb-1 block" htmlFor="password">
                Password (minimum 6 characters)
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={reveal ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-10"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-navy-400 hover:bg-sand-100"
                  aria-label="Toggle password visibility"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] font-medium text-st-cancelled">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full justify-center py-2.5"
            >
              {busy ? 'Creating account...' : 'Create guest account'} <ArrowRight size={15} />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
