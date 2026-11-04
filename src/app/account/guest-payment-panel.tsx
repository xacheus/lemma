'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  ImagePlus,
  Landmark,
  Loader2,
  Smartphone,
  X,
} from 'lucide-react';
import { formatKwacha } from '@/lib/domain/money';
import { PaymentDetails, CopyDetail } from '@/components/payments/payment-details';
import type { PublicPaymentMethod } from '@/lib/domain/payment-details';
import type { GuestSubmittedPayment, PaymentMethod } from '@/lib/domain/types';

type QuoteMethod = PublicPaymentMethod;

export interface PaymentQuoteView {
  reservationId: string;
  reference: string;
  totalAmount: number;
  verifiedPaid: number;
  pendingAmount: number;
  balanceDue: number;
  depositPercent: number;
  suggestedAmount: number;
  allowPartial: boolean;
  guestChoosesMethod: boolean;
  defaultMethod: PaymentMethod;
  methods: QuoteMethod[];
  openClaim: GuestSubmittedPayment | null;
  claims: GuestSubmittedPayment[];
  proofUploadEnabled: boolean;
}

const METHOD_ICONS: Record<string, typeof Smartphone> = {
  airtel_money: Smartphone,
  mtn_money: Smartphone,
  bank_transfer: Landmark,
  cash: Banknote,
};

/**
 * "Pay for this stay" — the guest's side of a manual payment.
 *
 * The business decides which channels exist and what each one requires (Settings →
 * Payments). Where the guest chooses, they pick from those channels here. What they
 * submit is a claim: it is shown to them as "awaiting verification", it never
 * changes the balance, and reception confirms it against the statement.
 */
export function GuestPaymentPanel({
  reservationId,
  reference,
  onClose,
  onSubmitted,
}: {
  reservationId: string;
  reference: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [quote, setQuote] = useState<PaymentQuoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<{ fileName: string; dataUrl: string; mimeType: string; sizeBytes: number } | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<GuestSubmittedPayment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/payments/claims?reservationId=${encodeURIComponent(reservationId)}`);
        const json = await res.json();
        if (cancelled) return;
        const q: PaymentQuoteView | undefined = json?.data?.quote;
        if (q) {
          setQuote(q);
          setMethod(q.guestChoosesMethod ? q.defaultMethod : (q.methods[0]?.id ?? null));
          setAmount(String(q.suggestedAmount || ''));
        } else {
          setError(json?.data?.detail ?? 'Could not load what is outstanding on this booking.');
        }
      } catch {
        if (!cancelled) setError('Could not reach the server. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  const chosen = useMemo(
    () => quote?.methods.find((m) => m.id === method) ?? null,
    [quote, method],
  );

  async function pickProof(file: File | null) {
    setProofError(null);
    if (!file) return;
    if (file.size > 500 * 1024) {
      setProofError('That image is over 500 KB. Use a smaller screenshot, or submit the transaction reference without an attachment.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setProofError('Use a JPEG, PNG, WebP image or a PDF.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    }).catch(() => '');
    if (!dataUrl) {
      setProofError('That file could not be read. Try another one.');
      return;
    }
    setProof({ fileName: file.name, dataUrl, mimeType: file.type, sizeBytes: file.size });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || !method) return;
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setError('Enter the amount you paid.');
      return;
    }
    if (value > quote.balanceDue + 0.01) {
      setError(`That is more than the ${formatKwacha(quote.balanceDue)} outstanding.`);
      return;
    }
    if (txnRef.trim().length < 3) {
      setError('Enter the transaction ID, SMS code or slip number.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/payments/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reservationId,
          amount: value,
          method,
          reference: txnRef.trim(),
          paidAt,
          note: note.trim() || undefined,
          proof: proof
            ? { fileName: proof.fileName, mimeType: proof.mimeType, dataUrl: proof.dataUrl, sizeBytes: proof.sizeBytes }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'That payment could not be submitted.');
        setBusy(false);
        return;
      }
      setDone(json.data.claim as GuestSubmittedPayment);
      onSubmitted();
    } catch {
      setError('The connection was interrupted. Refresh to check whether your proof was submitted before retrying.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-charcoal-950/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-5 shadow-pop sm:rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
              Pay for your stay
            </p>
            <h2 className="mt-0.5 text-[1.1rem] font-semibold text-navy-900">{reference}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-navy-500 hover:bg-sand-100">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[0.86rem] text-navy-600">
            <Loader2 size={16} className="animate-spin" /> Loading what is outstanding…
          </div>
        ) : done ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 text-st-available">
              <CheckCircle2 size={18} />
              <p className="text-[0.95rem] font-semibold text-navy-900">Payment submitted</p>
            </div>
            <div className="rounded-lg border border-sand-200 bg-sand-50 p-4 text-[0.85rem] leading-relaxed text-navy-700">
              <p>
                We have your {chosen?.label ?? 'payment'} reference{' '}
                <strong>{done.reference}</strong> for <strong>{formatKwacha(done.amount)}</strong>.
              </p>
              <p className="mt-2">
                Reception checks this against the provider statement or bank slip. Your balance
                stays as it is until that happens — you will get a notification and a receipt the
                moment it is confirmed.
              </p>
            </div>
            <button type="button" className="btn btn-primary w-full justify-center" onClick={onClose}>
              Done
            </button>
          </div>
        ) : !quote ? (
          <div className="mt-5">
            <p className="rounded-md border border-st-cancelled/30 bg-st-cancelled/5 p-3 text-[0.85rem] text-navy-700">
              {error ?? 'This booking could not be loaded.'}
            </p>
            <button type="button" className="btn btn-secondary mt-3 w-full justify-center" onClick={onClose}>
              Close
            </button>
          </div>
        ) : quote.openClaim ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-lg border border-st-cleaning/40 bg-st-cleaningBg/50 p-4">
              <p className="text-[0.88rem] font-semibold text-navy-900">Already submitted — in the queue</p>
              <p className="mt-1 text-[0.84rem] leading-relaxed text-navy-700">
                You told us about {formatKwacha(quote.openClaim.amount)} by{' '}
                {quote.methods.find((m) => m.id === quote.openClaim?.method)?.label ?? quote.openClaim.method},
                reference <strong>{quote.openClaim.reference}</strong>. Reception is checking it.
              </p>
            </div>
            <button type="button" className="btn btn-secondary w-full justify-center" onClick={onClose}>
              Close
            </button>
          </div>
        ) : quote.balanceDue <= 0 ? (
          <div className="mt-5 space-y-3">
            <p className="rounded-md border border-st-available/40 bg-st-availableBg/50 p-3 text-[0.86rem] text-navy-800">
              This stay is fully paid — nothing further is due. Your receipts are in the documents tab.
            </p>
            <button type="button" className="btn btn-secondary w-full justify-center" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-3 rounded-lg border border-sand-200 bg-sand-200 text-center">
              {[
                { label: 'Stay total', value: formatKwacha(quote.totalAmount) },
                { label: 'Verified', value: formatKwacha(quote.verifiedPaid) },
                { label: 'Outstanding', value: formatKwacha(quote.balanceDue) },
              ].map((cell) => (
                <div key={cell.label} className="bg-white px-2 py-2.5">
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-navy-400">{cell.label}</p>
                  <p className="mt-0.5 text-[0.88rem] font-semibold tabular-nums text-navy-900">{cell.value}</p>
                </div>
              ))}
            </div>

            {error ? (
              <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelled/5 p-2.5 text-[0.82rem] text-navy-800">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-st-cancelled" /> {error}
              </p>
            ) : null}

            {/* 1 — the guest chooses the channel (unless the business has locked it) */}
            <fieldset>
              <legend className="label mb-1.5 block">
                {quote.guestChoosesMethod ? 'How did you pay?' : 'Pay using'}
              </legend>
              <div className={`grid gap-2 ${quote.methods.length > 2 ? 'sm:grid-cols-2' : ''}`}>
                {quote.methods.map((m) => {
                  const Icon = METHOD_ICONS[m.id] ?? CreditCard;
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => quote.guestChoosesMethod && setMethod(m.id)}
                      aria-pressed={active}
                      className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition ${
                        active
                          ? 'border-navy-900 bg-sand-50 ring-1 ring-navy-900'
                          : 'border-sand-300 hover:border-brand-400'
                      } ${quote.guestChoosesMethod ? '' : 'cursor-default opacity-60 last:opacity-100'}`}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
                      <span>
                        <span className="block text-[0.86rem] font-semibold text-navy-900">{m.label}</span>
                        <span className="mt-0.5 block text-[0.74rem] leading-snug text-navy-500">
                          {m.accountLabel}
                          {m.accountNumber ? `: ${m.accountNumber}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {chosen ? (
                <div className="mt-2 rounded-md border border-sand-200 bg-sand-50 p-3 text-[0.8rem] leading-relaxed text-navy-700">
                  <PaymentDetails method={chosen} />
                  <CopyDetail label="booking reference" value={quote.reference} />
                  {quote.guestChoosesMethod ? (
                    <p className="mt-2 text-[0.75rem] text-navy-500">
                      Send the money first, then record it below. Nothing is charged on this page.
                    </p>
                  ) : (
                    <p className="mt-2 text-[0.75rem] text-navy-500">
                      Reception has set the payment channel for this booking.
                    </p>
                  )}
                </div>
              ) : null}
            </fieldset>

            {/* 2 — the amount */}
            <div>
              <label className="label mb-1 block" htmlFor="claim-amount">
                Amount you paid (ZMW)
              </label>
              <input
                id="claim-amount"
                type="number"
                inputMode="decimal"
                min={1}
                max={quote.balanceDue}
                step="0.01"
                className="field tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.74rem] text-navy-500">
                <span>
                  {quote.verifiedPaid === 0
                    ? `${quote.depositPercent}% deposit is ${formatKwacha(Math.round((quote.totalAmount * quote.depositPercent) / 100))}`
                    : 'The outstanding balance is the full amount.'}
                </span>
                {quote.allowPartial ? (
                  <span className="text-navy-400">Part payments are accepted.</span>
                ) : (
                  <span className="text-navy-400">This booking expects one payment.</span>
                )}
              </div>
            </div>

            {/* 3 — the reference the provider gave them */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label mb-1 block" htmlFor="claim-ref">
                  {method === 'bank_transfer' ? 'Bank slip / transfer reference' : 'Transaction ID or SMS code'}
                </label>
                <input
                  id="claim-ref"
                  className="field"
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                  placeholder={method === 'cash' ? 'Receipt number from reception' : 'e.g. MP260718.1234.C56789'}
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="claim-date">
                  Date paid
                </label>
                <input
                  id="claim-date"
                  type="date"
                  className="field"
                  value={paidAt}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label mb-1 block" htmlFor="claim-note">
                Note for reception (optional)
              </label>
              <textarea
                id="claim-note"
                className="field min-h-[64px]"
                maxLength={400}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything that helps us find the payment, e.g. the number you paid from."
              />
            </div>

            {quote.proofUploadEnabled ? (
              <div>
                <span className="label mb-1 block">Proof (optional)</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  onChange={(e) => void pickProof(e.target.files?.[0] ?? null)}
                />
                {proof ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-sand-200 bg-sand-50 px-3 py-2 text-[0.8rem]">
                    <span className="truncate text-navy-700">{proof.fileName}</span>
                    <button
                      type="button"
                      className="text-[0.76rem] font-medium text-navy-500 hover:underline"
                      onClick={() => setProof(null)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary w-full justify-center py-2 text-[0.8rem]"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus size={14} /> Attach a screenshot or slip
                  </button>
                )}
                {proofError ? <p className="mt-1 text-[0.76rem] text-st-cancelled">{proofError}</p> : null}
              </div>
            ) : null}

            <p className="rounded-md border border-sand-200 bg-sand-50 p-2.5 text-[0.76rem] leading-relaxed text-navy-600">
              Submitting this tells reception you have paid. It does not confirm the payment — a
              member of staff checks it and issues your receipt. Your balance only changes then.
            </p>

            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost flex-1 justify-center" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary flex-[2] justify-center" disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {busy ? 'Submitting…' : 'Submit payment for verification'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
