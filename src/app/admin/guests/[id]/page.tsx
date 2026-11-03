'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import {
  Building2,
  CalendarPlus,
  ExternalLink,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  ShieldAlert,
  Star,
  StickyNote,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader, useShell } from '@/components/admin/shell';
import { Alert, Avatar, DataTable, EmptyState, Panel, Skeleton, StatusChip } from '@/components/ui';
import { TextArea } from '@/components/ui/forms';
import { GuestEditor, GUEST_SOURCE_LABELS, maskId } from '@/components/admin/guest-editor';
import { formatKwacha, formatKwachaCompact, percent } from '@/lib/domain/money';
import { formatDateWithWeekday, formatMediumDate, dayDiff } from '@/lib/domain/dates';
import { BOOKING_STATUS_META, PAYMENT_STATUS_META, SOURCE_META } from '@/lib/domain/status';

export default function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { snapshot, request, toast, can } = useApp();
  const shell = useShell();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const guest = snapshot?.guests?.find((g) => g.id === id) ?? null;

  const stays = useMemo(
    () =>
      snapshot && guest
        ? (snapshot.reservations ?? []).filter((r) => r.guestId === guest.id).sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1))
        : [],
    [snapshot, guest],
  );

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!snapshot.guests || !guest)
    return (
      <div className="space-y-4">
        <PageHeader title="Guest" crumbs={[{ label: 'Guests', href: '/admin/guests' }]} />
        <EmptyState
          icon={can('guests.view') ? undefined : ShieldAlert}
          title={can('guests.view') ? 'Guest not found' : 'Not permitted'}
          body={
            can('guests.view')
              ? 'No record on the register matches this link. The dataset may have been reset.'
              : 'Your role does not include access to the guest register. Ask a manager if you need a guest’s details.'
          }
          action={
            <Link href="/admin/guests" className="btn-secondary h-9 px-3.5 text-[0.82rem]">
              Back to the register
            </Link>
          }
        />
      </div>
    );

  const totals = snapshot.guestTotals?.[guest.id] ?? { stays: 0, totalSpent: 0, outstanding: 0, nights: 0 };
  const payments = (snapshot.payments ?? []).filter((p) => stays.some((r) => r.id === p.reservationId));
  const nextArrival = stays.find((r) => r.status !== 'cancelled' && r.checkIn >= snapshot.today) ?? null;
  const cancelled = stays.filter((r) => r.status === 'cancelled').length;
  const averageNight = totals.nights ? Math.round(totals.totalSpent / totals.nights) : 0;
  const repeatRate = percent(totals.stays - 1, Math.max(1, totals.stays));
  const shownNotes = notes ?? guest.internalNotes;

  async function saveNotes() {
    if (notes === null) return;
    setSavingNotes(true);
    try {
      await request(`/api/guests/${guest!.id}`, { method: 'PATCH', data: { internalNotes: notes } });
      toast({ tone: 'success', title: 'Note saved', body: 'Visible to reception and management only.' });
      setNotes(null);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', body: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: 'Guests', href: '/admin/guests' }, { label: guest.fullName }]}
        title={guest.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {guest.company ? `${guest.company} · ` : ''}
            {guest.city || 'Lusaka'} · {guest.nationality || 'Zambia'}
            {guest.vip ? (
              <span className="chip bg-gold-50 text-gold-700">
                <Star size={10} className="fill-gold-400 text-gold-500" /> VIP
              </span>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {can('reservations.create') ? (
              <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={() => shell.openBooking({ guestId: guest.id, source: 'phone' })}>
                <CalendarPlus size={15} /> New booking
              </button>
            ) : null}
            {can('guests.manage') ? (
              <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit record
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title="Contact" bodyClass="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ContactLine icon={Phone} label="Phone / WhatsApp" value={guest.phone} href={`tel:${guest.phone.replace(/\s/g, '')}`} />
              <ContactLine icon={Mail} label="Email" value={guest.email || 'Not provided'} href={guest.email ? `mailto:${guest.email}` : undefined} />
              <ContactLine icon={Building2} label="Company" value={guest.company || '—'} />
              <ContactLine icon={ShieldAlert} label={guest.idType === 'passport' ? 'Passport' : 'NRC'} value={guest.nationalId ? maskId(guest.nationalId) : can('guests.viewPii') ? 'Not on file' : 'Hidden for your role'} hint={guest.nationalId ? 'Last four digits shown; the full number is only readable by roles with PII rights.' : 'Collect at check-in.'} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3">
              <a href={whatsAppLink(guest.phone)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                <MessageSquare size={12} /> Open WhatsApp
              </a>
              <span className="text-[0.74rem] text-navy-400">
                First seen {formatMediumDate(guest.createdAt.slice(0, 10))} · via {GUEST_SOURCE_LABELS[guest.source] ?? SOURCE_META[guest.source as keyof typeof SOURCE_META] ?? 'the desk'}
              </span>
            </div>
          </Panel>

          <Panel
            title="Staying and past bookings"
            subtitle={`${stays.length} record${stays.length === 1 ? '' : 's'} · ${cancelled} cancelled`}
            bodyClass="divide-y divide-sand-100"
          >
            {stays.length ? (
              <DataTable
                head={['Dates', 'Apartment', 'Status', 'Total', 'Payment', '']}
                className="border-0"
              >
                {stays.map((r) => (
                  <tr key={r.id} className="row-hover border-b border-sand-100 last:border-b-0">
                    <td className="td">
                      <span className="block text-[0.84rem] font-medium text-navy-800">
                        {formatMediumDate(r.checkIn)} → {formatMediumDate(r.checkOut)}
                      </span>
                      <span className="block text-[0.72rem] text-navy-400">
                        {r.nights} night{r.nights === 1 ? '' : 's'} · booked {formatMediumDate(r.createdAt.slice(0, 10))}
                      </span>
                    </td>
                    <td className="td text-[0.82rem] text-navy-600">
                      Apt {r.apartment?.number} · {r.apartment?.name}
                    </td>
                    <td className="td">
                      <StatusChip className={BOOKING_STATUS_META[r.status].chip}>{BOOKING_STATUS_META[r.status].label}</StatusChip>
                    </td>
                    <td className="td text-right text-[0.84rem] font-semibold text-navy-800 tnum">{formatKwacha(r.totalAmount)}</td>
                    <td className="td">
                      <span className={`block text-[0.8rem] font-semibold tnum ${r.balanceDue ? 'text-st-cancelled' : 'text-st-available'}`}>
                        {r.balanceDue ? `${formatKwacha(r.balanceDue)} due` : 'Settled'}
                      </span>
                      <span className="block text-[0.7rem] text-navy-400">{PAYMENT_STATUS_META[r.paymentStatus].label}</span>
                    </td>
                    <td className="td text-right">
                      <Link href={`/admin/reservations/${r.id}`} className="btn-ghost btn-sm">
                        Folio <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <div className="p-4">
                <EmptyState title="No bookings yet" body="This record was created without a stay attached. Use New booking to start one." />
              </div>
            )}
          </Panel>

          {can('payments.view') ? (
            <Panel title="Money trail" subtitle={`${payments.length} receipt${payments.length === 1 ? '' : 's'} recorded against this guest's folios`} bodyClass="divide-y divide-sand-100">
              {payments.length ? (
                payments.slice(0, 8).map((p) => {
                  const stay = stays.find((r) => r.id === p.reservationId);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="w-[8.5rem] shrink-0 text-[0.78rem] text-navy-500">{formatDateWithWeekday(p.paidAt.slice(0, 10))}</span>
                      <span className="w-24 shrink-0 text-[0.85rem] font-semibold text-navy-800 tnum">{formatKwacha(p.amount)}</span>
                      <span className="min-w-0 flex-1 truncate text-[0.78rem] text-navy-500">
                        {p.kind.replace(/_/g, ' ')} · {p.reference || 'no reference'} · {stay?.reference ?? '—'}
                      </span>
                      <StatusChip
                        className={
                          p.verificationStatus === 'verified'
                            ? 'bg-st-availableBg text-st-available'
                            : p.verificationStatus === 'rejected'
                              ? 'bg-st-cancelledBg text-st-cancelled'
                              : 'bg-gold-50 text-gold-700'
                        }
                      >
                        {p.verificationStatus === 'pending' ? 'awaiting check' : p.verificationStatus}
                      </StatusChip>
                    </div>
                  );
                })
              ) : (
                <div className="p-4">
                  <EmptyState title="Nothing received yet" body="No payment has been recorded against this guest’s folios." />
                </div>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          <Panel title="Value" bodyClass="p-4">
            <dl className="space-y-2.5">
              <Figure label="Lifetime spend" value={formatKwacha(totals.totalSpent)} big />
              <Figure label="Outstanding balance" value={totals.outstanding ? formatKwacha(totals.outstanding) : 'Nothing owing'} tone={totals.outstanding ? 'bad' : 'good'} />
              <Figure label="Stays booked" value={`${totals.stays} · ${totals.nights} nights`} />
              <Figure label="Average nightly yield" value={averageNight ? formatKwacha(averageNight) : '—'} />
              <Figure label="Repeat rate" value={`${repeatRate}%`} />
              <Figure label="Payments banked" value={formatKwachaCompact(payments.filter((p) => p.verificationStatus === 'verified').reduce((s, p) => s + p.amount, 0))} />
            </dl>
          </Panel>

          {nextArrival ? (
            <Panel title="Next stay" bodyClass="p-4 space-y-2">
              <p className="text-[0.9rem] font-semibold text-navy-800">
                {formatDateWithWeekday(nextArrival.checkIn)} · in {dayDiff(snapshot.today, nextArrival.checkIn)} day{dayDiff(snapshot.today, nextArrival.checkIn) === 1 ? '' : 's'}
              </p>
              <p className="text-[0.8rem] text-navy-500">
                Apt {nextArrival.apartment?.number} · {nextArrival.nights} nights · {nextArrival.guestCount} guest{nextArrival.guestCount === 1 ? '' : 's'}
              </p>
              <p className={`text-[0.8rem] font-medium ${nextArrival.balanceDue ? 'text-st-cancelled' : 'text-st-available'}`}>
                {nextArrival.balanceDue ? `${formatKwacha(nextArrival.balanceDue)} still due — deposit due ${formatKwacha(nextArrival.depositDue)}` : 'Folio is settled'}
              </p>
              <Link href={`/admin/reservations/${nextArrival.id}`} className="btn-secondary btn-sm w-full justify-center">
                Open folio
              </Link>
            </Panel>
          ) : null}

          <Panel title="Preferences & notes" subtitle="Standing requests are copied onto new bookings for this guest" icon={StickyNote} bodyClass="p-4 space-y-3">
            <div>
              <p className="label mb-1">Standing preferences</p>
              <p className="rounded-lg bg-sand-100/60 p-2.5 text-[0.82rem] leading-relaxed text-navy-600">
                {guest.specialRequests || 'Nothing recorded — ask the guest at booking so the desk can prepare the unit.'}
              </p>
            </div>
            <div>
              <p className="label mb-1">Internal notes {can('guests.viewPii') || can('guests.manage') ? '' : '(restricted)'}</p>
              {can('guests.manage') ? (
                <>
                  <TextArea value={shownNotes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={1200} counter />
                  {notes !== null ? (
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" className="btn-primary btn-sm" onClick={saveNotes} disabled={savingNotes}>
                        {savingNotes ? 'Saving…' : 'Save note'}
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setNotes(null)}>
                        Discard
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-[0.74rem] text-navy-400">Click into the box to edit. Notes never appear on a receipt or a folio.</p>
                  )}
                </>
              ) : (
                <p className="rounded-lg bg-sand-100/60 p-2.5 text-[0.82rem] leading-relaxed text-navy-600">
                  {guest.internalNotes || 'No internal notes.'}
                </p>
              )}
            </div>
            {guest.internalNotes && guest.internalNotes.includes('deposit') ? (
              <Alert tone="info" title="Read alongside the payment rules">
                Anything financial still needs a verified receipt — a note is not a payment.
              </Alert>
            ) : null}
          </Panel>
        </div>
      </div>

      {can('guests.manage') ? <GuestEditor open={editing} guest={guest} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function ContactLine({
  icon: Icon,
  label,
  value,
  href,
  hint,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-sand-200 px-3 py-2.5">
      <p className="label flex items-center gap-1.5">
        <Icon size={11} className="text-navy-400" /> {label}
      </p>
      {href ? (
        <a href={href} className="mt-0.5 block text-[0.86rem] font-medium text-teal-700 hover:underline">
          {value}
        </a>
      ) : (
        <p className="mt-0.5 text-[0.86rem] font-medium text-navy-800">{value}</p>
      )}
      {hint ? <p className="mt-1 text-[0.72rem] leading-snug text-navy-400">{hint}</p> : null}
    </div>
  );
}

function Figure({ label, value, tone, big }: { label: string; value: string; tone?: 'bad' | 'good'; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[0.8rem] text-navy-500">{label}</dt>
      <dd className={`tnum font-semibold ${big ? 'text-[1.05rem]' : 'text-[0.86rem]'} ${tone === 'bad' ? 'text-st-cancelled' : tone === 'good' ? 'text-st-available' : 'text-navy-800'}`}>{value}</dd>
    </div>
  );
}

function whatsAppLink(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const normalized = digits.startsWith('0') ? `260${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}
