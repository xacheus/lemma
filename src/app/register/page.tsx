'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Shield } from 'lucide-react';
import { PhotoFrame } from '@/components/ui/photo';

/**
 * Guest sign-up.
 *
 * The form is built around what a first-time guest actually needs to know: what the
 * account gets them, what happens next, and what a failure means. Field-level errors are
 * shown under the field that caused them rather than as one opaque sentence above the
 * submit button, and the button reports progress while the request is in flight.
 */

type FieldKey = 'fullName' | 'email' | 'phoneNumber' | 'password';

const FIELD_ORDER: FieldKey[] = ['fullName', 'email', 'phoneNumber', 'password'];

/** The server reports the failing field in `details[].path`; map that back to the form. */
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

    // Cheap client-side checks first, so the guest is not made to wait on a round trip
    // for something the browser can already see.
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
        // An account that already exists is not a mistake in a field; it is a signpost.
        if (json.code !== 'email_taken' && json.code !== 'phone_taken') {
          const key = fieldFromError(json.details);
          if (key) setFieldError({ [key]: message });
        }
        setBusy(false);
        return;
      }

      // The route sets the session cookie as part of its response, so the guest is
      // already signed in: go straight to their account instead of a sign-in form.
      // `replace` keeps the back button from returning to a form that has been used.
      // The welcome flag lets the account page confirm the sign-up rather than
      // dropping the guest onto an empty dashboard with no acknowledgement.
      router.replace('/account?welcome=1');
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const taken = error?.includes('already exists') ?? false;

  return (
    <main className="grid grid-cols-1 min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
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
            Book faster with a guest account.
          </h1>
          <ul className="mt-5 space-y-2.5 text-[0.88rem] text-navy-200">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              See your bookings and payment status in one place
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Download quotations, invoices and receipts
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-lemma-light" />
              Send stay changes straight to reception
            </li>
          </ul>
          <div className="mt-8 overflow-hidden rounded-md ring-1 ring-white/15">
            <PhotoFrame
              src="/images/apartments/apt-01/01.jpg"
              alt="Representative apartment interior"
              ratio="16 / 8"
              variant="detail"
            />
          </div>
          <p className="mt-2 text-[0.72rem] text-navy-200">Representative stock photograph · Not of the property</p>
        </div>

        <p className="flex items-center gap-2 text-[0.74rem] text-navy-300">
          <Shield size={13} /> Your account is private. Only authorised staff can access booking records.
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
            Create your guest account
          </h2>
          <p className="mt-1 text-[0.85rem] text-navy-500">
            Already have an account?{' '}
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
                placeholder="name@company.co.zm"
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
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-navy-400 hover:bg-sand-100"
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
                <p id="password-hint" className="mt-1 text-[0.76rem] text-navy-400">
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

            <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center py-2.5">
              {busy ? 'Creating your account...' : 'Create guest account'}{' '}
              {busy ? null : <ArrowRight size={15} />}
            </button>

            <p className="text-center text-[0.74rem] leading-relaxed text-navy-400">
              By creating an account you agree to our{' '}
              <Link href="/policies" className="underline underline-offset-2 hover:text-navy-700">
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
