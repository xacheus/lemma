'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { BrandLogo } from '@/components/public/brand-logo';
import { Entrance, StaggerGroup } from '@/components/ui/motion';

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
  const [errorShake, setErrorShake] = useState(false);
  const [shakeFields, setShakeFields] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  // Shake the error banner once when a message appears, and shake any fields
  // the server rejected, so problems catch the eye without changing wording.
  useEffect(() => {
    if (!error) return;
    setErrorShake(true);
    const timer = setTimeout(() => setErrorShake(false), 550);
    return () => clearTimeout(timer);
  }, [error]);

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
    setError(null);
    setFieldError({});
    setShakeFields(new Set());
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
        const key = fieldFromError(json.details);
        if (json.code !== 'email_taken' && json.code !== 'phone_taken' && key) {
          setFieldError({ [key]: message });
          setShakeFields(new Set([key]));
          setTimeout(() => setShakeFields(new Set()), 550);
        }
        setBusy(false);
        return;
      }

      setBusy(false);
      setSubmitted(true);
      // Let the drawn checkmark play before the guest lands on their account.
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.replace('/account?welcome=1');
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const taken = error?.includes('already exists') ?? false;

  return (
    <main className="public-shell grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-swdl-navy px-10 py-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-swdl-gold/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-swdl-navySoft/60 blur-3xl"
        />
        <Link href="/" className="relative flex items-center gap-3">
          <BrandLogo size="md" />
          <div>
            <p className="font-heading text-[1.05rem] font-extrabold uppercase leading-none tracking-[0.14em] text-white">
              Lemma Heights Apartments
            </p>
            <p className="mt-1.5 font-heading text-[0.62rem] font-bold uppercase tracking-[0.18em] text-swdl-gold">
              Barlaston Park · Lusaka, Zambia
            </p>
          </div>
        </Link>

        <div className="max-w-md space-y-6">
          <div>
            <h1 className="font-heading text-[2.05rem] font-extrabold leading-[1.15] tracking-[-0.01em] text-white">
              Keep your Lusaka stays &amp; receipts organised.
            </h1>
            <p className="mt-3 text-[0.92rem] leading-relaxed text-[#B9C5D1]">
              Creating a guest account takes under a minute and prefills your contact details
              whenever you book with us.
            </p>
          </div>

          <ul className="check-gold space-y-1 text-[0.88rem] text-[#D7DEE6]">
            <li>
              <CheckCircle2 size={16} className="shrink-0 text-swdl-gold" aria-hidden="true" />
              <span>Track booking confirmation &amp; deposit verification</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="shrink-0 text-swdl-gold" aria-hidden="true" />
              <span>Download PDF quotations, invoices and verified ZMW receipts</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="shrink-0 text-swdl-gold" aria-hidden="true" />
              <span>Request date changes directly with reception</span>
            </li>
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-[0.75rem] text-[#8FA0B0]">
          <Shield size={13} /> Private guest record — visible only to you and authorised staff.
        </p>
      </div>

      <div className="flex flex-col justify-center bg-swdl-light px-5 py-10 sm:px-10">
        <Entrance variant="up" delay={40} className="mx-auto w-full max-w-[27rem]">
          <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
            <BrandLogo size="md" />
            <div>
              <span className="block font-heading text-[1rem] font-extrabold uppercase tracking-[0.13em] text-swdl-navy">
                Lemma Heights Apartments
              </span>
              <span className="block font-heading text-[0.6rem] font-bold uppercase tracking-[0.18em] text-swdl-goldDark">
                Lusaka, Zambia
              </span>
            </div>
          </Link>

          <h2 className="font-heading text-[1.7rem] font-extrabold tracking-[-0.01em]">
            Create guest account
          </h2>
          <p className="mt-1 text-[0.87rem] text-swdl-muted">
            Already registered?{' '}
            <Link href="/login" className="font-semibold text-swdl-navy underline decoration-swdl-gold underline-offset-2 hover:text-swdl-goldDark">
              Sign in here
            </Link>
          </p>

          <form onSubmit={submit} noValidate className="swdl-card mt-6 space-y-4 p-6 sm:p-7">
            <StaggerGroup spacing={0.09}>
              <div className={shakeFields.has('fullName') ? 'shake' : ''}>
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

            <div className={shakeFields.has('email') ? 'shake' : ''}>
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

            <div className={shakeFields.has('phoneNumber') ? 'shake' : ''}>
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

            <div className={shakeFields.has('password') ? 'shake' : ''}>
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
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-swdl-muted transition-colors hover:bg-swdl-light hover:text-swdl-navy"
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
                <p id="password-hint" className="mt-1 text-[0.76rem] text-swdl-muted">
                  At least 6 characters.
                </p>
              )}
            </div>
            </StaggerGroup>

            {error ? (
              <div
                className={`flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] font-medium text-st-cancelled slide-in-down ${errorShake ? 'shake' : ''}`}
                role="alert"
                aria-live="polite"
              >
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

            {submitted ? (
              <div className="pop-in flex items-center justify-center gap-2 py-2.5 font-heading text-[0.85rem] font-bold text-swdl-navy">
                <CheckCircle2 size={15} className="text-swdl-goldDark" /> Account created
              </div>
            ) : (
              <button
                type="submit"
                disabled={busy}
                className="btn btn-gold w-full justify-center py-2.5"
              >
                {busy ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Creating your account…
                  </>
                ) : (
                  <>
                    Create guest account <ArrowRight size={15} />
                  </>
                )}
              </button>
            )}

            <p className="text-center text-[0.75rem] leading-relaxed text-swdl-muted">
              By creating an account you agree to our{' '}
              <Link href="/policies" className="underline underline-offset-2 transition-colors hover:text-swdl-navy">
                booking terms
              </Link>
              .
            </p>
          </form>
        </Entrance>
      </div>
    </main>
  );
}
