'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  MessageSquare,
  PencilLine,
  Phone,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { PageHeader, useShell } from '@/components/admin/shell';
import { Alert, EmptyState, Panel, Skeleton, StatusChip } from '@/components/ui';
import { Modal } from '@/components/ui/overlays';
import { CheckboxRow, TextArea } from '@/components/ui/forms';
import { balanceNote, useReservationActions } from '@/components/admin/actions';
import { FolioPrintLink, MessageComposer, PaymentDialog, VerificationDialog } from '@/components/admin/payments-ui';
import { formatKwacha } from '@/lib/domain/money';
import { formatDateTime, formatLongDate, relativeDayLabel } from '@/lib/domain/dates';
import { BOOKING_STATUS_META, CLEANING_STATUS_META, PAYMENT_METHOD_META, PAYMENT_STATUS_META, SOURCE_META, VERIFICATION_META } from '@/lib/domain/status';
import type { Payment } from '@/lib/domain/types';

export default function ReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const { snapshot, can, request, busy } = useApp();
  const shell = useShell();
  const actions = useReservationActions();
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [verifying, setVerifying] = useState<Payment | null>(null);

  const reservation = useMemo(() => snapshot?.reservations?.find((r) => r.id === params.id) ?? null, [snapshot, params.id]);

  if (!snapshot) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reservation not found" crumbs={[{ label: 'Reservations', href: '/admin/reservations' }, { label: 'Missing' }]} />
        <EmptyState
          icon={CalendarClock}
          title="That folio is not in this dataset"
          body="It may have been created in another session, or the record has since been removed. Return to the register and open a live reservation."
          action={
            <Link href="/admin/reservations" className="btn-primary btn-sm">
              Back to reservations
            </Link>
          }
        />
      </div>
    );
  }

  const r = reservation;
  const apartment = snapshot.apartments.find((a) => a.id === r.apartmentId);
  const cleaning = snapshot.cleaningState[r.apartmentId];
  const payments = (snapshot.payments ?? []).filter((p) => p.reservationId === r.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const guest = r.guest;
  const canEdit = can('reservations.edit');
  const canCancel = can('reservations.cancel');
  const canRecord = can('payments.record');
  const canVerify = can('payments.verify');
  const canCheckInOut = can('reservations.checkin');

  async function submitCancellation() {
    try {
      await request(`/api/reservations/${r!.id}/actions`, {
        method: 'POST',
        data: { kind: 'cancel', reason: cancelReason, refund },
      });
      setCancelOpen(false);
    } catch {
      /* handled by the provider toast */
    }
  }

  const nightsLabel = `${r.nights} night${r.nights === 1 ? '' : 's'}`;

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: 'Reservations', href: '/admin/reservations' }, { label: r.reference }]}
        title={guest?.fullName ?? r.reference}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[0.78rem] text-navy-500">{r.reference}</span>
            <span aria-hidden>·</span>
            <span>
              Apt {apartment?.number} — {apartment?.name}
            </span>
            <span aria-hidden>·</span>
            <span>
              {formatLongDate(r.checkIn)} → {formatLongDate(r.checkOut)} ({nightsLabel})
            </span>
            <span aria-hidden>·</span>
            <span>{SOURCE_META[r.source]}</span>
          </span>
        }
        actions={
          <>
            <Link href="/admin/reservations" className="btn-ghost h-10 px-3">
              <ArrowLeft size={15} /> Register
            </Link>
            <FolioPrintLink reservationId={r.id} />
            {can('notifications.send') ? (
              <button onClick={() => setMessageOpen(true)} className="btn-secondary h-10 px-3.5">
                <MessageSquare size={15} /> Message guest
              </button>
            ) : null}
            {canEdit ? (
              <button onClick={() => setEditOpen(true)} className="btn-secondary h-10 px-3.5">
                <PencilLine size={15} /> Edit
              </button>
            ) : null}
            {r.status === 'inquiry' && canEdit ? (
              <button
                onClick={() =>
                  actions.confirm({
                    title: 'Accept this booking request?',
                    body: `Accepting holds ${nightsLabel} in Apt ${apartment?.number} for ${guest?.fullName}. Availability is re-checked first — if another guest has taken the dates in the meantime you will be told before anything changes.`,
                    confirmLabel: 'Accept and hold dates',
                    tone: 'gold',
                    run: () => actions.acceptInquiry(r.id, r.reference),
                  })
                }
                className="btn-gold h-10 px-4"
              >
                <BadgeCheck size={15} /> Accept request
              </button>
            ) : null}
            {canCheckInOut && r.canCheckIn ? (
              <button
                onClick={() =>
                  actions.confirm({
                    title: `Check in ${guest?.fullName}?`,
                    body: (
                      <>
                        <p>Records arrival at {r.arrivalTime} and opens the folio for incidentals.</p>
                        <p className="mt-2">{balanceNote(r.balanceDue)}</p>
                      </>
                    ),
                    confirmLabel: 'Check guest in',
                    run: () => actions.checkIn(r.id, guest?.fullName ?? 'Guest'),
                  })
                }
                className="btn-primary h-10 px-4"
              >
                <BadgeCheck size={15} /> Check in
              </button>
            ) : null}
            {canCheckInOut && r.status === 'checked_in' ? (
              <button
                onClick={() =>
                  actions.confirm({
                    title: `Check out ${guest?.fullName}?`,
                    body: (
                      <>
                        <p>Closes the folio, releases the apartment for the next guest and opens a turnover job for housekeeping.</p>
                        <p className="mt-2">{balanceNote(r.balanceDue)}</p>
                      </>
                    ),
                    confirmLabel: 'Close stay',
                    run: () => actions.checkOut(r.id, guest?.fullName ?? 'Guest'),
                  })
                }
                className="btn-primary h-10 px-4"
              >
                <RefreshCcw size={15} /> Check out
              </button>
            ) : null}
            {canCancel && r.status !== 'cancelled' && r.status !== 'checked_out' ? (
              <button onClick={() => setCancelOpen(true)} className="btn-danger h-10 px-3.5">
                <XCircle size={15} /> Cancel
              </button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusChip className={BOOKING_STATUS_META[r.status].chip} dot={BOOKING_STATUS_META[r.status].dot}>
          {BOOKING_STATUS_META[r.status].label}
        </StatusChip>
        <StatusChip className={PAYMENT_STATUS_META[r.paymentStatus].chip} dot={PAYMENT_STATUS_META[r.paymentStatus].dot}>
          {PAYMENT_STATUS_META[r.paymentStatus].label}
        </StatusChip>
        {r.pendingVerification > 0 ? (
          <StatusChip className={VERIFICATION_META.pending.chip} dot={VERIFICATION_META.pending.dot}>
            {formatKwacha(r.pendingVerification)} awaiting verification
          </StatusChip>
        ) : null}
        {r.isTodayCheckIn ? <StatusChip className="bg-teal-50 text-teal-700 ring-1 ring-teal-200">Arrival today</StatusChip> : null}
        {r.isTodayCheckOut ? <StatusChip className="bg-sand-200 text-navy-600">Departure today</StatusChip> : null}
        {r.status === 'checked_in' ? (
          <span className="text-[0.76rem] text-navy-400">In residence since {formatDateTime(r.checkedInAt)}</span>
        ) : null}
        {r.status === 'cancelled' ? <span className="text-[0.76rem] text-st-cancelled">Cancelled {formatDateTime(r.cancelledAt)}</span> : null}
      </div>

      {r.status === 'inquiry' ? (
        <Alert tone="info" title="This is a request, not a booking">
          The dates are still open to other guests. Accept the request to hold them; decline by cancelling with a note.
        </Alert>
      ) : null}
      {r.status === 'cancelled' ? (
        <Alert tone="error" title="Cancelled booking">
          {r.cancellationReason || 'No reason recorded.'} The apartment was released back to inventory on cancellation.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Panel title="Stay" icon={CalendarClock}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.84rem] sm:grid-cols-3">
              <Item label="Check-in" value={`${formatLongDate(r.checkIn)}`} sub={`from ${snapshot.settings.booking.checkInTime} · expected ${r.arrivalTime}`} />
              <Item label="Check-out" value={formatLongDate(r.checkOut)} sub={`by ${snapshot.settings.booking.checkOutTime}`} />
              <Item label="Nights" value={String(r.nights)} sub={relativeDayLabel(r.checkIn, snapshot.today)} />
              <Item label="Apartment" value={`Apt ${apartment?.number}`} sub={apartment?.name} href={apartment ? `/admin/apartments/${apartment.id}` : undefined} />
              <Item label="Guests" value={`${r.guestCount} of ${apartment?.maxGuests ?? 0}`} sub={apartment?.bedConfiguration} />
              <Item label="Rate" value={`${formatKwacha(r.nightlyRate)} / night`} sub={apartment && r.nightlyRate !== apartment.nightlyRate ? `rack rate ${formatKwacha(apartment.nightlyRate)}` : 'matches rack rate'} />
              {r.discount ? <Item label="Discount" value={`− ${formatKwacha(r.discount)}`} sub="concession recorded on the folio" /> : null}
            </dl>
            {r.notes ? (
              <div className="mt-4 rounded-lg border border-sand-200 bg-sand-50/70 p-3">
                <p className="label mb-1">Desk notes</p>
                <p className="whitespace-pre-line text-[0.82rem] leading-relaxed text-navy-600">{r.notes}</p>
              </div>
            ) : null}
          </Panel>

          {guest ? (
            <Panel
              title="Guest registration card"
              icon={Users}
              action={
                can('guests.view') ? (
                  <Link href={`/admin/guests/${guest.id}`} className="btn-secondary btn-sm">
                    Full profile
                  </Link>
                ) : null
              }
            >
              <div className="flex flex-wrap items-start gap-5">
                <div className="min-w-[12rem] flex-1 space-y-1.5 text-[0.84rem]">
                  <p className="font-display text-[1.05rem] text-navy-800">{guest.fullName}</p>
                  <p className="flex items-center gap-1.5 text-navy-600">
                    <Phone size={13} className="text-navy-400" /> {guest.phone}
                  </p>
                  <p className="text-navy-600">{guest.email || '—'}</p>
                  {guest.company ? <p className="text-navy-500">{guest.company}</p> : null}
                </div>
                <dl className="grid min-w-[13rem] flex-1 grid-cols-2 gap-x-4 gap-y-2 text-[0.82rem]">
                  <Item
                    label={guest.idType === 'passport' ? 'Passport' : 'NRC'}
                    value={can('guests.viewPii') ? guest.nationalId || 'not captured' : 'restricted'}
                    sub={can('guests.viewPii') ? guest.nationality : 'guests.viewPii permission required'}
                  />
                  <Item label="City" value={guest.city || '—'} />
                  <Item label="Lifetime banked" value={formatKwacha(snapshot.guestTotals?.[guest.id]?.totalSpent ?? 0)} sub={`${snapshot.guestTotals?.[guest.id]?.stays ?? 0} stays`} />
                  <Item
                    label="Outstanding"
                    value={formatKwacha(snapshot.guestTotals?.[guest.id]?.outstanding ?? 0)}
                    tone={(snapshot.guestTotals?.[guest.id]?.outstanding ?? 0) > 0 ? 'bad' : undefined}
                  />
                </dl>
              </div>
              {guest.specialRequests ? (
                <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-[0.8rem] text-gold-700 ring-1 ring-gold-200">
                  <span className="font-semibold">Standing requests:</span> {guest.specialRequests}
                </p>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Housekeeping" icon={Sparkles} subtitle="Turnover state of the apartment while this folio is open">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <StatusChip className={CLEANING_STATUS_META[cleaning?.status ?? 'clean'].chip} dot={CLEANING_STATUS_META[cleaning?.status ?? 'clean'].dot}>
                  {CLEANING_STATUS_META[cleaning?.status ?? 'clean'].label}
                </StatusChip>
                <p className="mt-1.5 text-[0.78rem] text-navy-500">{cleaning?.note || 'No notes from the cleaning team.'}</p>
              </div>
              {can('housekeeping.view') ? (
                <Link href="/admin/housekeeping" className="btn-secondary btn-sm">
                  Open rota
                </Link>
              ) : null}
            </div>
          </Panel>

          <Panel title="Booking history" icon={RefreshCcw} subtitle="Every action on this folio, newest first">
            <ol className="relative space-y-3 pl-4">
              <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-sand-200" aria-hidden />
              {r.history.map((event, i) => (
                <li key={`${event.at}-${i}`} className="relative">
                  <span className="absolute -left-4 top-1.5 h-1.5 w-1.5 rounded-full bg-navy-300 ring-2 ring-white" aria-hidden />
                  <p className="text-[0.83rem] font-semibold text-navy-800">{event.label}</p>
                  {event.detail ? <p className="text-[0.78rem] leading-snug text-navy-500">{event.detail}</p> : null}
                  <p className="mt-0.5 text-[0.7rem] text-navy-400">
                    {formatDateTime(event.at)} · {event.by}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel
            title="Folio"
            icon={CircleDollarSign}
            action={
              canRecord ? (
                <button onClick={() => setPayOpen(true)} className="btn-gold btn-sm" disabled={r.status === 'cancelled'}>
                  <Plus size={13} /> Record payment
                </button>
              ) : null
            }
          >
            <div className="space-y-2.5">
              <Line label={`${formatKwacha(r.nightlyRate)} × ${r.nights} night${r.nights === 1 ? '' : 's'}`} value={formatKwacha(r.nights * r.nightlyRate)} />
              {r.discount ? <Line label="Discount applied" value={`− ${formatKwacha(r.discount)}`} tone="good" /> : null}
              <Line label="Accommodation total" value={formatKwacha(r.totalAmount)} strong />
              <Line label="Payments verified" value={`− ${formatKwacha(r.verifiedPaid)}`} tone="good" />
              {r.pendingVerification ? <Line label="Recorded, awaiting verification" value={formatKwacha(r.pendingVerification)} tone="warn" /> : null}
              <div className="flex items-baseline justify-between border-t border-sand-200 pt-2.5">
                <span className="label">Balance due</span>
                <span className={`text-[1.35rem] font-bold tabular-nums ${r.balanceDue > 0 ? 'text-st-cancelled' : 'text-st-available'}`}>{formatKwacha(r.balanceDue)}</span>
              </div>
              <p className="text-[0.76rem] leading-snug text-navy-400">
                Policy deposit for this stay is {formatKwacha(r.depositDue)} ({snapshot.settings.booking.depositPercent}%).{' '}
                {snapshot.settings.booking.taxesIncluded ? 'Rates shown are inclusive of taxes.' : 'Taxes are added on invoice.'}
              </p>
            </div>
          </Panel>

          <Panel
            title={`Receipts (${payments.length})`}
            icon={Banknote}
            subtitle={snapshot.settings.payments.requireVerification ? 'Money only counts once an authorised user verifies it.' : undefined}
          >
            {payments.length ? (
              <ul className="divide-y divide-sand-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className={`h-9 w-1 shrink-0 rounded-full ${p.verificationStatus === 'verified' ? 'bg-st-available' : p.verificationStatus === 'rejected' ? 'bg-st-cancelled' : 'bg-gold-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.84rem] font-semibold text-navy-800">
                        {formatKwacha(p.amount)}
                        <span className="ml-1.5 text-[0.74rem] font-normal text-navy-400">{p.kind.replace(/_/g, ' ')}</span>
                      </p>
                      <p className="mt-0.5 text-[0.74rem] text-navy-500">
                        {PAYMENT_METHOD_META[p.method].label} · {p.reference || 'no reference'} · {p.paidAt}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-navy-400">
                        Entered by {p.recordedByName}
                        {p.verifiedBy ? ` · ${p.verificationStatus} by ${p.verifiedBy}` : ' · not yet verified'}
                      </p>
                      {p.verificationNote ? <p className="mt-0.5 text-[0.72rem] italic text-navy-400">“{p.verificationNote}”</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {p.proof ? (
                        <StatusChip className="bg-sand-100 text-navy-500">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                          </svg>
                          proof
                        </StatusChip>
                      ) : null}
                      <Link href={`/print/receipt/${p.id}`} target="_blank" className="btn-secondary btn-sm">
                        Receipt
                      </Link>
                      {p.verificationStatus === 'pending' && canVerify ? (
                        <button onClick={() => setVerifying(p)} className="btn-gold btn-sm">
                          <ShieldAlert size={13} /> Verify
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CircleDollarSign}
                title="No money recorded yet"
                body={
                  r.status === 'inquiry'
                    ? 'Take the deposit once the request is accepted — a request is never invoiced.'
                    : `A ${formatKwacha(r.depositDue)} deposit (${snapshot.settings.booking.depositPercent}%) is due under the booking policy.`
                }
                action={
                  canRecord && r.status !== 'inquiry' ? (
                    <button onClick={() => setPayOpen(true)} className="btn-gold btn-sm">
                      <Plus size={13} /> Record the first payment
                    </button>
                  ) : null
                }
              />
            )}
          </Panel>

          {canRecord ? (
            <Panel title="Payment instructions" icon={Banknote} subtitle="What the guest is sent with their confirmation">
              <ul className="space-y-2.5">
                {snapshot.settings.payments.methods
                  .filter((m) => m.enabled)
                  .map((m) => (
                    <li key={m.id} className="rounded-lg border border-sand-200 p-2.5">
                      <p className="text-[0.82rem] font-semibold text-navy-800">{PAYMENT_METHOD_META[m.id].label}</p>
                      <p className="text-[0.75rem] text-navy-500">
                        {m.accountLabel}: <span className="font-mono text-[0.75rem] text-navy-700">{m.accountNumber}</span>
                      </p>
                    </li>
                  ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} reservation={r} />
      <VerificationDialog payment={verifying} onClose={() => setVerifying(null)} />
      <MessageComposer open={messageOpen} onClose={() => setMessageOpen(false)} reservation={r} />
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        size="sm"
        title={`Cancel ${r.reference}?`}
        subtitle="Cancellation releases the apartment immediately and is recorded on the folio."
        footer={
          <>
            <button type="button" className="btn-secondary h-10 px-4" onClick={() => setCancelOpen(false)}>
              Keep booking
            </button>
            <button type="button" className="btn-danger h-10 px-4" onClick={submitCancellation} disabled={busy || cancelReason.trim().length < 4}>
              Cancel reservation
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <TextArea label="Reason (required)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={400} placeholder="Guest working overseas; rebooked for the following week." />
          <CheckboxRow
            checked={refund}
            onChange={setRefund}
            label={`Refund the ${formatKwacha(Math.min(r.verifiedPaid, r.totalAmount))} banked so far`}
            hint={snapshot.settings.booking.cancellationText}
            disabled={r.verifiedPaid <= 0}
          />
          {r.verifiedPaid <= 0 ? <Alert tone="info">Nothing has been verified against this folio, so there is no refund to authorise.</Alert> : null}
          {r.balanceDue > 0 && r.status !== 'inquiry' ? (
            <Alert tone="warn" title="Balance will be written off">
              {formatKwacha(r.balanceDue)} was still owing. Cancelling removes it from the debtors list — if this is a no-show rather than a cancellation, leave the booking active and let the no-show report handle it.
            </Alert>
          ) : null}
        </div>
      </Modal>
      {actions.actions}
    </div>
  );
}

function Item({ label, value, sub, href, tone }: { label: string; value?: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: 'bad' }) {
  const body = (
    <>
      <dt className="label">{label}</dt>
      <dd className={`mt-0.5 text-[0.88rem] font-semibold ${tone === 'bad' ? 'text-st-cancelled' : 'text-navy-800'}`}>{value}</dd>
      {sub ? <dd className="mt-0.5 text-[0.74rem] leading-snug text-navy-400">{sub}</dd> : null}
    </>
  );
  return (
    <div>
      {href ? (
        <Link href={href} className="block hover:text-teal-600">
          {body}
        </Link>
      ) : (
        <div>{body}</div>
      )}
    </div>
  );
}

function Line({ label, value, tone, strong }: { label: string; value: string; tone?: 'good' | 'warn'; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[0.82rem] text-navy-500">{label}</span>
      <span
        className={`tabular-nums ${strong ? 'text-[0.95rem] font-bold text-navy-900' : 'text-[0.86rem] font-semibold'} ${
          tone === 'good' ? 'text-st-available' : tone === 'warn' ? 'text-gold-700' : 'text-navy-700'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
