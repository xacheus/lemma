'use client';

import { AlertTriangle, BadgeCheck, Banknote, FileText, Loader2, Printer, ShieldAlert, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/overlays';
import { Alert, StatusChip } from '@/components/ui';
import { CheckboxRow, DateInput, Field, MoneyInput, ProofUploader, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { useApp } from '@/components/providers/app';
import { formatKwacha } from '@/lib/domain/money';
import { PAYMENT_METHOD_META, PAYMENT_STATUS_META, VERIFICATION_META } from '@/lib/domain/status';
import type { Payment, PaymentMethod, ReservationView } from '@/lib/domain/types';

/* ------------------------------------------------------------------ record a payment */

export function PaymentDialog({
  open,
  onClose,
  reservation,
}: {
  open: boolean;
  onClose: () => void;
  reservation: ReservationView | null;
}) {
  const { snapshot, request, busy, toast } = useApp();
  const methods = (snapshot?.settings.payments.methods ?? []).filter((m) => m.enabled);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('airtel_money');
  const [kind, setKind] = useState<Payment['kind']>('deposit');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(snapshot?.today ?? '');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<{ fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !reservation) return;
    const deposit = reservation.depositDue || Math.round(reservation.totalAmount / 2);
    const suggested = reservation.balanceDue > 0 ? Math.min(reservation.balanceDue, reservation.pendingVerification > 0 ? reservation.pendingVerification : deposit || reservation.balanceDue) : deposit;
    setAmount(String(Math.max(0, Math.round(suggested))));
    setMethod(methods[0]?.id ?? 'cash');
    setKind(reservation.verifiedPaid === 0 ? 'deposit' : reservation.balanceDue - Number(amount) <= 1 ? 'final_settlement' : 'part_payment');
    setReference('');
    setPaidAt(snapshot?.today ?? '');
    setNote('');
    setProof(null);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservation?.id]);

  if (!reservation) return null;
  const numeric = Number(amount || 0);
  const projectedBalance = Math.max(0, reservation.balanceDue - numeric);
  const exceeds = numeric > reservation.balanceDue + reservation.pendingVerification;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!(numeric > 0)) nextErrors.amount = 'Enter the amount actually received.';
    if (!paidAt) nextErrors.paidAt = 'Pick the date the money came in.';
    if (method !== 'cash' && reference.trim().length < 4) nextErrors.reference = 'Capture the provider reference so the verifier can trace it.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    try {
      await request('/api/payments', {
        method: 'POST',
        data: {
          reservationId: reservation!.id,
          amount: numeric,
          method,
          kind,
          reference: reference.trim(),
          paidAt,
          note,
          proof,
        },
      });
      toast({
        tone: 'success',
        title: 'Receipt recorded',
        body: `${formatKwacha(numeric)} against ${reservation!.reference}. ${
          snapshot?.user.role === 'admin' ? 'Verified on entry by the manager on duty.' : 'Awaiting verification by an authorised user — the balance has not moved.'
        }
      `,
      });
      onClose();
    } catch (error) {
      const err = error as { message?: string };
      setErrors((e) => ({ ...e, submit: err.message ?? 'The payment could not be recorded.' }));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Record a payment · ${reservation.reference}`}
      subtitle={`${reservation.guest?.fullName ?? 'Guest'} · Apt ${reservation.apartment?.number} · ${reservation.nights} night${reservation.nights === 1 ? '' : 's'}`}
      footer={
        <>
          <button type="button" className="btn-secondary h-10 px-4" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="payment-form" className="btn-primary h-10 px-5" disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />} Record receipt
          </button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-2 rounded-xl border border-sand-200 bg-sand-50/60 p-3 sm:grid-cols-4">
          <Figure label="Folio total" value={formatKwacha(reservation.totalAmount)} />
          <Figure label="Verified banked" value={formatKwacha(reservation.verifiedPaid)} tone="good" />
          <Figure label="Awaiting verification" value={formatKwacha(reservation.pendingVerification)} tone={reservation.pendingVerification ? 'warn' : undefined} />
          <Figure label="Balance due" value={formatKwacha(reservation.balanceDue)} tone={reservation.balanceDue ? 'bad' : 'good'} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyInput label="Amount received" required value={amount} onValueChange={(n) => setAmount(String(n))} error={errors.amount} hint={reservation.depositDue ? `Policy deposit is ${formatKwacha(reservation.depositDue)}` : undefined} />
          <SelectInput
            label="Payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            options={methods.map((m) => ({ value: m.id, label: m.label }))}
            hint={PAYMENT_METHOD_META[method]?.hint}
          />
          <SelectInput
            label="What is this money?"
            value={kind}
            onChange={(e) => setKind(e.target.value as Payment['kind'])}
            options={[
              { value: 'deposit', label: `Deposit (${snapshot?.settings.booking.depositPercent ?? 50}%)` },
              { value: 'part_payment', label: 'Part payment' },
              { value: 'final_settlement', label: 'Balance / final settlement' },
            ]}
          />
          <DateInput label="Date received" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} max={snapshot?.today} error={errors.paidAt} />
        </div>

        {method === 'cash' ? (
          <Alert tone="info" title="Cash receipt">
            Counted at the desk against a pre-numbered receipt. As {snapshot?.user.role === 'admin' ? 'the manager on duty' : 'reception'} this entry will
            {snapshot?.user.role === 'admin' ? ' be verified on entry against the drawer count' : ' still need an authorised sign-off before it moves the folio'}.
          </Alert>
        ) : (
          <TextInput label="Provider reference / transaction ID" required value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MP144729031847" error={errors.reference} />
        )}

        {snapshot?.settings.payments.proofUploadEnabled ? <ProofUploader value={proof} onChange={setProof} /> : null}

        <div className="rounded-lg border border-sand-200 p-3">
          <CheckboxRow
            checked={false}
            disabled
            onChange={() => {}}
            label={
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-gold-600" />
                This receipt is not being marked as received by ticking anything
              </span>
            }
            hint={`A verification decision from an authorised user moves the folio. After this entry the balance will be ${formatKwacha(projectedBalance)} once verified.`}
          />
        </div>

        <TextArea label="Note for the ledger" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder="Paid by the guest's brother at the desk; invoice to be addressed to the company." />

        {exceeds ? (
          <Alert tone="warn" title="Above the outstanding balance">
            {formatKwacha(numeric)} exceeds the remaining {formatKwacha(reservation.balanceDue)}. The server will refuse it — record the surplus against another folio or an incidentals invoice.
          </Alert>
        ) : null}
        {errors.submit ? (
          <Alert tone="error" title="Payment not recorded">
            {errors.submit}
          </Alert>
        ) : null}
      </form>
    </Modal>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-st-available' : tone === 'bad' ? 'text-st-cancelled' : tone === 'warn' ? 'text-gold-700' : 'text-navy-800';
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`mt-1 text-[0.95rem] font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- verify / reject */

export function VerificationDialog({
  payment,
  onClose,
  context,
}: {
  payment: Payment | null;
  onClose: () => void;
  context?: { onVerify?: (note: string) => Promise<void>; busy?: boolean };
}) {
  const { request, busy: providerBusy, toast } = useApp();
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const reservation = useApp().snapshot?.reservations?.find((r) => r.id === payment?.reservationId) ?? null;
  const busy = context?.busy || providerBusy || working;

  useEffect(() => {
    if (payment) setNote('');
  }, [payment?.id]);

  if (!payment) return null;

  async function decide(status: 'verified' | 'rejected') {
    setWorking(true);
    try {
      if (context?.onVerify) await context.onVerify(note);
      else {
        await request(`/api/payments/${payment!.id}`, { method: 'PATCH', data: { status, note } });
        toast({
          tone: status === 'verified' ? 'success' : 'info',
          title: status === 'verified' ? 'Payment verified' : 'Payment rejected',
          body:
            status === 'verified'
              ? `${formatKwacha(payment!.amount)} now counts against ${reservation?.reference ?? 'the folio'}.`
              : `The guest has been told the receipt did not match a transaction. Balance unchanged.`,
        });
      }
      onClose();
    } catch {
      /* the provider already surfaced the toast */
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={!!payment}
      onClose={onClose}
      size="md"
      title="Verify this receipt"
      subtitle={`${reservation?.guest?.fullName ?? 'Guest'} · ${reservation?.reference ?? ''} · entered by ${payment.recordedByName}`}
      footer={
        <>
          <button type="button" className="btn-danger h-10 px-4" onClick={() => decide('rejected')} disabled={busy}>
            <XCircle size={15} /> Reject
          </button>
          <button type="button" className="btn-primary h-10 px-5" onClick={() => decide('verified')} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />} Confirm as received
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Row label="Amount claimed" value={<span className="text-[1.15rem] font-bold tabular-nums text-navy-800">{formatKwacha(payment.amount)}</span>} />
            <Row label="Method" value={PAYMENT_METHOD_META[payment.method].label} />
            <Row label="Reference" value={<span className="font-mono text-[0.8rem]">{payment.reference || 'not supplied'}</span>} />
            <Row label="Date received" value={payment.paidAt} />
            <Row label="Folio balance" value={`${formatKwacha(reservation?.balanceDue ?? 0)} outstanding of ${formatKwacha(reservation?.totalAmount ?? 0)}`} />
          </div>
          <div className="w-full sm:w-44">
            <p className="label mb-1">Evidence</p>
            {payment.proof?.dataUrl ? (
              <img src={payment.proof.dataUrl} alt={payment.proof.fileName} className="w-full rounded-lg border border-sand-300 object-cover" />
            ) : (
              <div className="photo-frame photo-grid-lines grid h-32 place-items-center rounded-lg text-center text-[0.72rem] leading-snug text-navy-500">
                <span className="px-2">
                  <FileText size={16} className="mx-auto mb-1 text-lemma" />
                  {payment.proof ? payment.proof.fileName : 'No screenshot attached'}
                </span>
              </div>
            )}
          </div>
        </div>

        {payment.note ? (
          <p className="rounded-lg bg-sand-100/70 px-3 py-2 text-[0.8rem] italic text-navy-600">“{payment.note}”</p>
        ) : null}

        <Alert tone="warn" title="Only confirm what you have actually traced">
          Sign this off after locating {payment.method === 'cash' ? 'the notes in the drawer and the receipt counterfoil' : `the reference ${payment.reference || '(none)'} in the ${PAYMENT_METHOD_META[payment.method].label} statement`}. A
          screenshot on its own is not proof, and this demo is not connected to any provider that could check for you.
        </Alert>

        <TextArea label="Verifier note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="e.g. Located MP144729031847 on the Airtel merchant report at 14:05." />
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-sand-100 pb-1.5">
      <span className="label">{label}</span>
      <span className="text-right text-[0.85rem] font-medium text-navy-800">{value}</span>
    </div>
  );
}

/* --------------------------------------------------------------------- composer */

export function MessageComposer({
  open,
  onClose,
  reservation,
  initialRecipient,
  initialContact,
  initialBody,
}: {
  open: boolean;
  onClose: () => void;
  reservation?: ReservationView | null;
  initialRecipient?: string;
  initialContact?: string;
  initialBody?: string;
}) {
  const { snapshot, request, busy, toast } = useApp();
  const recipient = reservation?.guest?.fullName ?? initialRecipient ?? '';
  const contact = reservation?.guest?.phone ?? initialContact ?? '';
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | 'email' | 'in_app'>('whatsapp');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState(reservation ? `Message to ${recipient.split(' ')[0] || 'guest'}` : 'New message');
  const [markSent, setMarkSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody(
      initialBody ??
        (reservation
          ? `Hello ${recipient.split(' ')[0]}, your stay at ${snapshot?.settings.property.name} on ${reservation.checkIn} (${reservation.nights} night${
              reservation.nights === 1 ? '' : 's'
            }, Apt ${reservation.apartment?.number}) is confirmed. ${
              reservation.balanceDue > 0
                ? `The balance of ${formatKwacha(reservation.balanceDue)} can be settled on arrival by Airtel Money, MTN MoMo or cash.`
                : 'Your folio is settled — nothing further is due.'
            } ${snapshot?.settings.property.receptionHours ?? ''}`
          : ''),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservation?.id, initialBody]);

  const providerConnected =
    channel === 'whatsapp'
      ? snapshot?.settings.notifications.whatsapp.connected
      : channel === 'sms'
        ? snapshot?.settings.notifications.sms.connected
        : channel === 'email'
          ? snapshot?.settings.notifications.email.connected
          : true;

  const waLink = `https://wa.me/${contact.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(body)}`;

  async function save() {
    try {
      await request('/api/notifications', {
        method: 'POST',
        data: {
          reservationId: reservation?.id,
          channel,
          title,
          body,
          recipientName: recipient,
          recipientContact: contact,
          markSent,
        },
      });
      toast({
        tone: 'success',
        title: markSent ? 'Draft saved and marked sent' : 'Draft saved',
        body: markSent
          ? 'Your confirmation is recorded as a staff claim — no provider receipt backs it.'
          : 'The message is queued in Notifications for whoever is at the desk.',
      });
      onClose();
    } catch {
      /* toast shown by the provider */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Compose a guest message"
      subtitle={
        providerConnected
          ? 'Delivery is confirmed by staff after they send it, because no provider is wired up.'
          : 'Nothing is dispatched automatically: this demo has no WhatsApp, SMS or email provider connected.'
      }
      footer={
        <>
          {channel === 'whatsapp' && contact ? (
            <a href={waLink} target="_blank" rel="noreferrer" className="btn-secondary mr-auto h-10 px-3.5">
              <Printer size={0} className="hidden" />
              Open in WhatsApp
            </a>
          ) : null}
          <button type="button" className="btn-secondary h-10 px-4" onClick={onClose}>
            Discard
          </button>
          <button type="button" className="btn-primary h-10 px-5" onClick={save} disabled={busy || body.trim().length < 10}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Banknote size={15} className="hidden" />} Save draft
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Recipient" value={recipient} onChange={(e) => setTitle(`Message to ${e.target.value.split(' ')[0] || 'guest'}`)} disabled />
          <TextInput label="Contact number" value={contact} onChange={() => {}} disabled hint={channel === 'email' ? 'Email address shown here is the guest’s mobile — switch channel to correct it' : undefined} />
        </div>
        <SelectInput
          label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
          options={[
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'sms', label: 'SMS' },
            { value: 'email', label: 'Email' },
            { value: 'in_app', label: 'Internal note only' },
          ]}
        />
        <TextInput label="Subject" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextArea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={480} counter className="[&_textarea]:min-h-[10rem]" />
        <div className="rounded-lg border border-sand-200 bg-sand-50/70 p-3">
          <CheckboxRow
            checked={!!markSent}
            onChange={setMarkSent}
            label="I have sent this from my handset — record it as sent"
            hint="Use this only after you have actually sent it. The log will name you as the sender and note that no provider receipt exists."
          />
        </div>
        {!providerConnected ? (
          <Alert tone="warn" title="No provider connected">
            The draft is stored and can be copied or opened in WhatsApp. Until an aggregator account is configured in Settings, this system will never claim a message was delivered.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

export function PaymentStatusInline({ status }: { status: Payment['verificationStatus'] }) {
  return (
    <StatusChip className={VERIFICATION_META[status].chip} dot={VERIFICATION_META[status].dot}>
      {VERIFICATION_META[status].label}
    </StatusChip>
  );
}

export function ReceiptLink({ paymentId, amount }: { paymentId: string; amount: number }) {
  return (
    <Link href={`/print/receipt/${paymentId}`} target="_blank" className="btn-secondary btn-sm" title={`Print or save ${formatKwacha(amount)} receipt as PDF`}>
      <Printer size={13} /> Receipt
    </Link>
  );
}

export function FolioPrintLink({ reservationId }: { reservationId: string }) {
  return (
    <Link href={`/print/folio/${reservationId}`} target="_blank" className="btn-secondary btn-sm">
      <Printer size={13} /> Print folio
    </Link>
  );
}

export function folioStatusTone(status: ReservationView['paymentStatus']) {
  return PAYMENT_STATUS_META[status].chip;
}

export function BalanceWarning({ balance }: { balance: number }) {
  if (balance <= 0) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[0.76rem] font-semibold text-st-cancelled">
      <AlertTriangle size={12} /> {formatKwacha(balance)} still outstanding
    </p>
  );
}
