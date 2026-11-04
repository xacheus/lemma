'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Paperclip,
  ShieldCheck,
  Smartphone,
  Landmark,
  Banknote,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { Alert, EmptyState, Panel } from '@/components/ui';
import { Modal } from '@/components/ui/overlays';
import { formatKwacha } from '@/lib/domain/money';
import { formatDateTime, formatMediumDate } from '@/lib/domain/dates';
import { PAYMENT_METHOD_META } from '@/lib/domain/status';
import { buildGuestWhatsAppUrl } from '@/lib/domain/whatsapp';
import type { GuestSubmittedPayment, PaymentMethod } from '@/lib/domain/types';

const METHOD_ICONS: Record<string, typeof Smartphone> = {
  airtel_money: Smartphone,
  mtn_money: Smartphone,
  bank_transfer: Landmark,
  cash: Banknote,
};

/**
 * Guest submissions — the place a claim becomes money, or does not.
 *
 * A guest picks the channel, pays outside the app and tells us the reference. That
 * claim sits here untouched. Reception checks the reference against the statement
 * and confirms it, which records a normal payment (same rules as the desk: it is
 * `pending` unless the verifier is allowed to bank it) and links the claim to the
 * receipt. Rejecting leaves the balance alone and tells the guest why.
 */
export function GuestClaimQueue() {
  const { snapshot, request, toast, refresh, can } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  /** The claim whose proof is open full-size; opening it also records the review. */
  const [viewing, setViewing] = useState<GuestSubmittedPayment | null>(null);

  if (!snapshot) return null;
  const claims = snapshot.paymentClaims ?? [];
  const open = claims
    .filter((c) => c.status === 'awaiting_verification')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const settled = claims.filter((c) => c.status === 'linked').slice(0, 12);
  const canRecord = can('payments.record');
  const canVerify = can('payments.verify');

  const reservationFor = (claim: GuestSubmittedPayment) =>
    (snapshot.reservations ?? []).find((r) => r.id === claim.reservationId) ?? null;

  async function bank(claim: GuestSubmittedPayment) {
    if (!canRecord) {
      setError('Your role cannot record payments.');
      return;
    }
    const reservation = reservationFor(claim);
    if (!reservation) {
      setError('That booking is no longer visible to you.');
      return;
    }
    if (claim.amount > reservation.balanceDue + 0.01) {
      setError(
        `${claim.amount.toLocaleString('en-US')} exceeds the ${reservation.balanceDue.toLocaleString('en-US')} outstanding on ${reservation.reference}. Record a smaller amount instead.`,
      );
      return;
    }
    setBusy(claim.id);
    setError(null);
    try {
      const result = await request<{ payment: { id: string; verificationStatus: string } }>('/api/payments', {
        method: 'POST',
        data: {
          reservationId: claim.reservationId,
          amount: claim.amount,
          method: claim.method,
          kind: reservation.verifiedPaid > 0 ? 'final_settlement' : 'deposit',
          reference: claim.reference,
          paidAt: claim.paidAt,
          note: [claim.note, `Guest claim ${claim.id}`].filter(Boolean).join(' · '),
          claimId: claim.id,
          proof: claim.proof
            ? {
                fileName: claim.proof.fileName,
                mimeType: claim.proof.mimeType,
                dataUrl: claim.proof.dataUrl,
                sizeBytes: claim.proof.sizeBytes,
              }
            : null,
        },
      });
      toast({
        tone: 'success',
        title:
          result.payment.verificationStatus === 'verified'
            ? 'Claim confirmed and receipt issued'
            : 'Claim recorded — waiting for a second signature',
        body:
          result.payment.verificationStatus === 'verified'
            ? `${formatKwacha(claim.amount)} is now on ${reservation.reference}. The guest has been notified.`
            : 'It is in the verification queue above; the balance moves when a verifier signs it.',
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That claim could not be recorded.');
    } finally {
      setBusy(null);
    }
  }

  async function reject(claim: GuestSubmittedPayment) {
    setBusy(claim.id);
    setError(null);
    try {
      const reason = note.trim() || 'No matching payment found on the statement.';
      await request(`/api/payments/claims/${claim.id}`, {
        method: 'PATCH',
        data: { status: 'rejected', note: reason },
      });
      toast({
        tone: 'info',
        title: 'Claim rejected',
        body: 'The balance is unchanged and the guest has been told why.',
      });
      setNote('');
      setNoteFor(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That claim could not be rejected.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Opens the proof. The GET also stamps `reviewedAt`, which is what tells the guest
   * their upload has actually been looked at rather than just sitting in a queue.
   */
  async function openProof(claim: GuestSubmittedPayment) {
    setViewing(claim);
    try {
      const result = await request<{ claim: GuestSubmittedPayment }>(`/api/payments/claims/${claim.id}`);
      if (result.claim) setViewing(result.claim);
      await refresh();
    } catch {
      // Viewing must never be blocked by the bookkeeping call.
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error" title="Nothing was changed">{error}</Alert> : null}

      <Panel
        title={`Guest payments to check (${open.length})`}
        subtitle="Guests pay by mobile money, transfer or cash, then submit the reference from their account. Nothing here has touched a balance yet."
        bodyClass="divide-y divide-sand-100"
      >
        <Alert tone="warn" title="Check before you confirm">
          Open the statement or mobile-money record and find the reference. Confirming records a
          real receipt and moves the balance; if the money is not there, reject it with a reason.
        </Alert>

        {open.length === 0 ? (
          <div className="px-4 py-8 text-center text-[0.86rem] text-navy-500">
            Nothing waiting. Guest submissions appear here the moment they are sent.
          </div>
        ) : (
          <ul className="divide-y divide-sand-100">
            {open.map((claim) => {
              const reservation = reservationFor(claim);
              const Icon = METHOD_ICONS[claim.method] ?? Smartphone;
              const ageHours = Math.max(
                0,
                Math.round((Date.now() - new Date(claim.createdAt).getTime()) / 36e5),
              );
              const overdue = ageHours >= (snapshot.settings.payments.claimReviewHours ?? 24);
              return (
                <li key={claim.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <button
                      type="button"
                      onClick={() => void openProof(claim)}
                      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-sand-300"
                      aria-label="Open the payment proof"
                    >
                      {claim.proof?.dataUrl && claim.proof.mimeType.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={claim.proof.dataUrl}
                          alt={`Proof: ${claim.proof.fileName}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-navy-300">
                          {claim.proof ? <FileText size={16} /> : <Paperclip size={16} />}
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-charcoal-950/70 py-0.5 text-center text-[0.58rem] font-medium uppercase tracking-wider text-white">
                        {claim.proof ? 'View' : 'No proof'}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-[0.9rem] font-semibold text-navy-900">
                        {formatKwacha(claim.amount)} · {reservation?.guest?.fullName ?? 'Unknown guest'}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.78rem] text-navy-600">
                        <span className="inline-flex items-center gap-1">
                          <Icon size={12} /> {PAYMENT_METHOD_META[claim.method as PaymentMethod]?.label ?? claim.method}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          ref <strong className="font-semibold text-navy-800">{claim.reference}</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>paid {formatMediumDate(claim.paidAt)}</span>
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-navy-500">
                        {reservation ? (
                          <>
                            <Link href={`/admin/reservations/${reservation.id}`} className="font-medium text-lemma-dark hover:underline">
                              {reservation.reference}
                            </Link>
                            {` · Apt ${reservation.apartment?.number ?? '—'} · outstanding ${formatKwacha(reservation.balanceDue)}`}
                          </>
                        ) : (
                          'Booking not in view'
                        )}
                      </p>
                      {claim.note ? (
                        <p className="mt-1 text-[0.75rem] italic text-navy-500">“{claim.note}”</p>
                      ) : null}
                      <p className={`mt-1 inline-flex items-center gap-1 text-[0.73rem] ${overdue ? 'text-st-cancelled' : 'text-navy-400'}`}>
                        <Clock size={11} /> submitted {formatDateTime(claim.createdAt)} · {ageHours}h waiting
                        {overdue ? ' — past the review window' : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {reservation?.guest?.phone ? (
                        <a
                          href={
                            buildGuestWhatsAppUrl(
                              reservation.guest.phone,
                              `Hello ${reservation.guest.fullName.split(' ')[0]}, this is reception at ${snapshot.settings.property.name} checking your ${formatKwacha(claim.amount)} payment reference (${claim.reference}) for booking ${reservation.reference}.`,
                            ) ?? '#'
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost btn-sm"
                          title="Follow up with guest on WhatsApp"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                      ) : null}
                      {reservation ? (
                        <Link href={`/admin/reservations/${reservation.id}`} className="btn-ghost btn-sm">
                          Folio
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={busy !== null}
                        onClick={() => {
                          setNoteFor(noteFor === claim.id ? null : claim.id);
                          setNote('');
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={busy !== null || !canRecord}
                        onClick={() => void bank(claim)}
                        title={canVerify ? 'Records the receipt and issues it' : 'Records it for a verifier to confirm'}
                      >
                        {busy === claim.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                        {canVerify ? 'Confirm payment' : 'Record payment'}
                      </button>
                    </div>
                  </div>

                  {noteFor === claim.id ? (
                    <div className="mt-2 rounded-lg border border-sand-200 bg-sand-50 p-2.5">
                      <label className="label mb-1 block" htmlFor={`reject-${claim.id}`}>
                        Why is this being rejected? The guest sees this.
                      </label>
                      <textarea
                        id={`reject-${claim.id}`}
                        className="field min-h-[56px]"
                        value={note}
                        maxLength={400}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="No payment with this reference on the Airtel statement for this date."
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setNoteFor(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={busy !== null}
                          onClick={() => void reject(claim)}
                        >
                          Reject claim
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {settled.length ? (
        <Panel title="Recently confirmed" subtitle="Claims already banked against a receipt.">
          <ul className="divide-y divide-sand-100">
            {settled.map((claim) => {
              const reservation = reservationFor(claim);
              return (
                <li key={claim.id} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-[0.8rem]">
                  <span className="flex items-center gap-2 text-navy-700">
                    <CheckCircle2 size={13} className="text-st-available" />
                    {formatKwacha(claim.amount)} · {reservation?.guest?.fullName ?? 'Guest'} ·{' '}
                    {PAYMENT_METHOD_META[claim.method as PaymentMethod]?.label ?? claim.method} · ref{' '}
                    {claim.reference}
                  </span>
                  <span className="text-navy-400">
                    banked {claim.linkedAt ? formatDateTime(claim.linkedAt) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={`Payment proof · ${viewing?.reference ?? ''}`}
        subtitle="Compare this with the bank or mobile-money record before approving."
        size="lg"
      >
        {viewing ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[0.82rem] sm:grid-cols-2">
              {[
                ['Guest', reservationFor(viewing)?.guest?.fullName ?? 'Unknown guest'],
                ['Booking', reservationFor(viewing)?.reference ?? '—'],
                [
                  'Apartment',
                  reservationFor(viewing)?.apartment
                    ? `${reservationFor(viewing)?.apartment?.number} · ${reservationFor(viewing)?.apartment?.name}`
                    : '—',
                ],
                ['Method', PAYMENT_METHOD_META[viewing.method]?.label ?? viewing.method],
                ['Amount submitted', formatKwacha(viewing.amount)],
                ['Transaction reference', viewing.reference],
                ['Date submitted', formatDateTime(viewing.createdAt)],
                ['Guest says paid on', formatMediumDate(viewing.paidAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2 border-b border-sand-100 py-1">
                  <dt className="text-navy-500">{label}</dt>
                  <dd className="text-right font-medium text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>

            {viewing.note ? (
              <p className="rounded-md bg-sand-50 p-2.5 text-[0.8rem] italic text-navy-600">
                “{viewing.note}”
              </p>
            ) : null}

            {viewing.proof ? (
              viewing.proof.mimeType.startsWith('image/') ? (
                <div className="overflow-hidden rounded-md border border-sand-200 bg-sand-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewing.proof.dataUrl}
                    alt={`Payment proof uploaded by the guest: ${viewing.proof.fileName}`}
                    className="mx-auto max-h-[60vh] w-auto object-contain"
                  />
                </div>
              ) : (
                <a
                  href={viewing.proof.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary w-full justify-center"
                >
                  <FileText size={14} /> Open {viewing.proof.fileName}
                </a>
              )
            ) : (
              <p className="rounded-md border border-dashed border-sand-300 p-3 text-center text-[0.82rem] text-navy-500">
                No screenshot was attached. Check the reference against the statement instead.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-sand-200 pt-3">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setNoteFor(viewing.id);
                  setNote('');
                  setViewing(null);
                }}
              >
                Reject…
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy !== null || !canRecord}
                onClick={() => {
                  const claim = viewing;
                  setViewing(null);
                  void bank(claim);
                }}
              >
                <ShieldCheck size={12} /> {canVerify ? 'Approve payment' : 'Record for verification'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {!canRecord ? (
        <EmptyState
          icon={AlertTriangle}
          title="You can see claims but not bank them"
          body="Recording a payment needs the payments.record permission. Ask an administrator if this is part of your desk."
        />
      ) : null}
    </div>
  );
}
