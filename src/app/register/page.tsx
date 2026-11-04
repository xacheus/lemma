'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Shield } from 'lucide-react';
import { BrandMark } from '@/components/public/brand-mark';

type FieldKey = 'fullName' | 'email' | 'phoneNumber' | 'password';

const FIELD_ORDER: FieldKey[] = ['fullName', 'email', 'phoneNumber', 'password'];

function fieldFromError(details: unknown): FieldKey | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const first = details[0] as { path?: unknown };
  const path = typeof first?.path === 'string' ? first.path : '';
  const key = path.split('.')[0] as FieldKey;
  return FIELD_ORDER.includes(key) ? key : null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+260 ');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<FieldKey, string>>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phoneNumber.trim();
    const nextFieldErrors: Partial<Record<FieldKey, string>> = {};
    if (trimmedName.length < 2) nextFieldErrors.fullName = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextFieldErrors.email = 'That email address does not look right. Please check it.';
    }
    if (trimmedPhone.replace(/\D/g, '').length < 9) {
      nextFieldErrors.phoneNumber = 'Please enter the rest of your phone number.';
    }
    if (password.length < 6) nextFieldErrors.password = 'Please use at least 6 characters.';
    setFieldError(nextFieldErrors);
    setError(null);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: trimmedName,
          email: trimmedEmail,
          phoneNumber: trimmedPhone,
          password,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        const message: string = json.error ?? 'Could not create your account. Please try again.';
        setError(message);
        if (json.code !== 'email_taken' && json.code !== 'phone_taken') {
          const key = fieldFromError(json.details);
          if (key) setFieldError({ [key]: message });
        }
        setBusy(false);
        return;
      }

      router.replace('/account?welcome=1');
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const taken = error?.includes('already exists') ?? false;

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative hidden flex-col justify-between bg-charcoal-950 px-10 py-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark tone="dark" size="lg" />
          <div>
            <p className="font-display text-[1.12rem] font-semibold leading-none text-white">
              Lemma Apartments
            </p>
            <p className="mt-1 text-[0.74rem] text-sand-300">
              Barlaston Park · Lusaka, Zambia
            </p>
          </div>
        </Link>

        <div className="max-w-md space-y-6">
          <div>
            <h1 className="font-display text-[2.1rem] font-medium leading-[1.15] tracking-[-0.015em] text-white">
              Keep your Lusaka stays &amp; receipts organised.
            </h1>
            <p className="mt-3 text-[0.92rem] leading-relaxed text-sand-300">
              Creating a guest account takes under a minute and prefills your contact details
              whenever you book with us.
            </p>
          </div>

          <ul className="space-y-3 border-t border-white/10 pt-5 text-[0.88rem] text-sand-200">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Track booking confirmation &amp; deposit verification
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Download PDF quotations, invoices and verified ZMW receipts
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Request date changes directly with reception
            </li>
          </ul>
        </div>

        <p className="flex items-center gap-2 text-[0.75rem] text-sand-400">
          <Shield size={13} /> Private guest record — visible only to you and authorised staff.
        </p>
      </div>

      <div className="flex flex-col justify-center bg-sand-50 px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[27rem]">
          <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
            <BrandMark tone="light" size="md" />
            <div>
              <span className="block font-display text-[1.05rem] font-semibold text-navy-900">
                Lemma Apartments
              </span>
              <span className="block text-[0.7rem] text-sand-600">Lusaka, Zambia</span>
            </div>
          </Link>

          <h2 className="font-display text-[1.65rem] font-medium tracking-[-0.015em] text-navy-900">
            Create guest account
          </h2>
          <p className="mt-1 text-[0.85rem] text-sand-700">
            Already registered?{' '}
            <Link href="/login" className="font-semibold text-navy-900 hover:underline">
              Sign in here
            </Link>
          </p>

          <form onSubmit={submit} noValidate className="card mt-6 space-y-4 p-6">
            <div>
              <label className="label mb-1 block" htmlFor="fullName">
                Full name
              </label>
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setFieldError((f) => ({ ...f, fullName: undefined }));
                }}
                autoComplete="name"
                className={`field ${fieldError.fullName ? 'field-invalid' : ''}`}
                placeholder="e.g. Chanda Mwale"
                aria-invalid={fieldError.fullName ? true : undefined}
                aria-describedby={fieldError.fullName ? 'fullName-error' : undefined}
                required
              />
              {fieldError.fullName ? (
                <p id="fullName-error" className="mt-1 text-[0.76rem] font-medium text-st-cancelled">
                  {fieldError.fullName}
                </p>
              ) : null}
            </div>

            <div>
              <label className="label mb-1 block" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldError((f) => ({ ...f, email: undefined }));
                }}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className={`field ${fieldError.email ? 'field-invalid' : ''}`}
                placeholder="name@example.com"
                aria-invalid={fieldError.email ? true : undefined}
                aria-describedby={fieldError.email ? 'email-error' : undefined}
                required
              />
              {fieldError.email ? (
                <p id="email-error" className="mt-1 text-[0.76rem] font-medium text-st-cancelled">
                  {fieldError.email}
                </p>
              ) : null}
            </div>

            <div>
              <label className="label mb-1 block" htmlFor="phone">
                Phone / WhatsApp number
              </label>
              <input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setFieldError((f) => ({ ...f, phoneNumber: undefined }));
                }}
                autoComplete="tel"
                inputMode="tel"
                className={`field ${fieldError.phoneNumber ? 'field-invalid' : ''}`}
                placeholder="+260 97 700 0000"
                aria-invalid={fieldError.phoneNumber ? true : undefined}
                aria-describedby={fieldError.phoneNumber ? 'phone-error' : undefined}
                required
              />
              {fieldError.phoneNumber ? (
                <p id="phone-error" className="mt-1 text-[0.76rem] font-medium text-st-cancelled">
                  {fieldError.phoneNumber}
                </p>
              ) : null}
            </div>

            <div>
              <label className="label mb-1 block" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={reveal ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldError((f) => ({ ...f, password: undefined }));
                  }}
                  autoComplete="new-password"
                  className={`field pr-10 ${fieldError.password ? 'field-invalid' : ''}`}
                  aria-invalid={fieldError.password ? true : undefined}
                  aria-describedby={fieldError.password ? 'password-error' : 'password-hint'}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-sand-500 hover:bg-sand-100"
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {fieldError.password ? (
                <p id="password-error" className="mt-1 text-[0.76rem] font-medium text-st-cancelled">
                  {fieldError.password}
                </p>
              ) : (
                <p id="password-hint" className="mt-1 text-[0.75rem] text-sand-600">
                  At least 6 characters.
                </p>
              )}
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] font-medium text-st-cancelled">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>
                  {error}
                  {taken ? (
                    <>
                      {' '}
                      <Link href="/login" className="underline underline-offset-2">
                        Sign in
                      </Link>
                      .
                    </>
                  ) : null}
                </span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full justify-center py-2.5"
            >
              {busy ? 'Creating your account…' : 'Create guest account'}{' '}
              {busy ? null : <ArrowRight size={15} />}
            </button>

            <p className="text-center text-[0.74rem] leading-relaxed text-sand-600">
              By creating an account you agree to our{' '}
              <Link href="/policies" className="underline underline-offset-2 hover:text-navy-800">
                booking terms
              </Link>
              .
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
