'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock,
  ExternalLink,
  Link2,
  Mail,
  MessageSquare,
  PhoneCall,
  Send,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, EmptyState, Pagination, Panel, Skeleton, StatusChip, Tabs } from '@/components/ui';
import { SearchInput, SelectInput } from '@/components/ui/forms';
import { MessageComposer } from '@/components/admin/payments-ui';
import { formatDateTime, formatMediumDate, relativeDayLabel } from '@/lib/domain/dates';
import { formatKwacha } from '@/lib/domain/money';
import { DELIVERY_META } from '@/lib/domain/status';
import type { NotificationChannel, NotificationRecord, ReservationView } from '@/lib/domain/types';

type Filter = 'all' | 'unread' | 'awaiting' | 'sent' | 'failed';

const PAGE_SIZE = 12;

const CHANNEL_ICON: Record<NotificationChannel, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  sms: MessageCircle,
  email: Mail,
  in_app: Bell,
};

const EVENT_LABELS: Record<string, string> = {
  booking_confirmation: 'Booking confirmation',
  booking_request: 'Website request',
  payment_received: 'Payment received',
  checkin_reminder: 'Check-in reminder',
  checkout_reminder: 'Check-out reminder',
  balance_reminder: 'Balance reminder',
  cancellation: 'Cancellation notice',
  cleaning_assigned: 'Cleaning assigned',
  cleaning_completed: 'Cleaning completed',
  maintenance_reported: 'Maintenance alert',
  reservation_modified: 'Booking amended',
};

export default function NotificationsPage() {
  const { snapshot, request, toast, can, busy } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [channel, setChannel] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<NotificationRecord | null>(null);
  const [composing, setComposing] = useState(false);

  const rows = useMemo(() => {
    if (!snapshot?.notifications) return [];
    const needle = query.trim().toLowerCase();
    return snapshot.notifications
      .filter((n) => {
        if (filter === 'unread' && n.readAt) return false;
        if (filter === 'awaiting' && n.deliveryStatus !== 'not_connected' && n.deliveryStatus !== 'queued_for_manual_send') return false;
        if (filter === 'sent' && n.deliveryStatus !== 'delivered_manually') return false;
        if (filter === 'failed' && n.deliveryStatus !== 'failed') return false;
        if (channel !== 'all' && n.channel !== channel) return false;
        if (needle && ![n.title, n.body, n.recipientName, n.recipientContact].join(' ').toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [snapshot, filter, channel, query]);

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!snapshot.notifications)
    return (
      <div className="space-y-4">
        <PageHeader title="Notifications" description="Messages the property sends to guests and staff." />
        <EmptyState icon={AlertTriangle} title="Not permitted" body="Your role can work bookings but not the message log. A manager can grant notifications.view." />
      </div>
    );

  const all = snapshot.notifications;
  const awaiting = all.filter((n) => n.deliveryStatus === 'not_connected' || n.deliveryStatus === 'queued_for_manual_send');
  const failed = all.filter((n) => n.deliveryStatus === 'failed');
  const unread = all.filter((n) => !n.readAt);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const composableReservations = (snapshot.reservations ?? []).filter((r) => r.status !== 'cancelled');

  async function mark(n: NotificationRecord, data: Record<string, unknown>, message: string) {
    try {
      await request(`/api/notifications/${n.id}`, { method: 'PATCH', data });
      toast({ tone: 'success', title: 'Log updated', body: message });
    } catch (err) {
      toast({ tone: 'error', title: 'Not saved', body: err instanceof Error ? err.message : 'Try again.' });
    }
  }

  async function sweep() {
    try {
      const result = await request<{ sweep: { created: number; skipped: number; details?: string[] } }>('/api/notifications', { method: 'PUT' });
      toast({
        tone: 'success',
        title: 'Reminder sweep complete',
        body: `${result.sweep.created} reminder${result.sweep.created === 1 ? '' : 's'} drafted from the current register${
          result.sweep.skipped ? `, ${result.sweep.skipped} skipped as already sent or out of window` : ''
        }.`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Sweep failed', body: err instanceof Error ? err.message : 'Try again.' });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Every message the property owes a guest or a colleague, with the honest state of each one."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {can('notifications.manage') ? (
              <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={sweep} disabled={busy}>
                <Sparkles size={14} /> Run reminder sweep
              </button>
            ) : null}
            {can('notifications.send') ? (
              <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={() => setComposing(true)}>
                <Send size={14} /> Compose message
              </button>
            ) : null}
          </div>
        }
      />

      <Alert tone="warn" title="No messaging provider is connected">
        <div className="space-y-2">
          <p>
            WhatsApp, SMS and email rows are drafts: the copy is written, addressed and ready, but nothing leaves the building by itself. A row only becomes{' '}
            <span className="font-semibold">sent</span> when a member of staff clicks <span className="font-semibold">Mark sent</span> after dispatching it from their own handset — and the log says so
            in those words, because a staff claim is not a carrier receipt.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['whatsapp', 'sms', 'email'] as NotificationChannel[]).map((c) => {
              const setting = snapshot.settings.notifications[c as 'whatsapp' | 'sms' | 'email'];
              return (
                <span key={c} className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-2.5 py-1.5 text-[0.76rem]">
                  {c === 'whatsapp' ? <MessageSquare size={12} /> : c === 'sms' ? <MessageCircle size={12} /> : <Mail size={12} />}
                  <span className="font-semibold capitalize text-navy-700">{c}</span>
                  <span className={setting.connected ? 'text-st-available' : 'text-navy-400'}>
                    {setting.connected ? 'connected' : setting.enabled ? `off · ${setting.provider ?? 'no provider'}` : 'disabled'}
                  </span>
                  {can('settings.manage') ? (
                    <Link href="/admin/settings" className="text-teal-700 hover:underline">
                      configure
                    </Link>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      </Alert>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip ${unread.length ? '' : 'bg-st-availableBg text-st-available'}`}>{unread.length} unread</span>
        <span className={`chip ${awaiting.length ? 'bg-gold-50 text-gold-700' : ''}`}>{awaiting.length} waiting to go out</span>
        <span className="chip">{all.filter((n) => n.deliveryStatus === 'delivered_manually').length} marked sent</span>
        {failed.length ? <span className="chip bg-st-cancelledBg text-st-cancelled">{failed.length} failed</span> : null}
        <span className="chip">{all.filter((n) => n.createdAutomatically).length} system-generated</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { value: 'all', label: 'Everything', count: all.length },
            { value: 'unread', label: 'Unread', count: unread.length },
            { value: 'awaiting', label: 'Awaiting send', count: awaiting.length },
            { value: 'sent', label: 'Marked sent', count: all.filter((n) => n.deliveryStatus === 'delivered_manually').length },
            { value: 'failed', label: 'Failed', count: failed.length },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          size="sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Recipient, subject or body" className="w-full sm:w-64" />
          <SelectInput
            aria-label="Channel"
            className="w-40"
            value={channel}
            onChange={(e) => { setChannel(e.target.value); setPage(1); }}
            options={[
              { value: 'all', label: 'All channels' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'sms', label: 'SMS' },
              { value: 'email', label: 'Email' },
              { value: 'in_app', label: 'Internal' },
            ]}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {shown.length ? (
          <ul className="divide-y divide-sand-100">
            {shown.map((n) => {
              const Icon = CHANNEL_ICON[n.channel];
              const meta = DELIVERY_META[n.deliveryStatus];
              const reservation = n.reservationId ? (snapshot.reservations ?? []).find((r) => r.id === n.reservationId) : null;
              return (
                <li key={n.id} className={`px-4 py-3 transition ${n.readAt ? '' : 'bg-gold-50/40'}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${n.channel === 'in_app' ? 'bg-navy-50 text-navy-600' : 'bg-sand-100 text-navy-500'}`}>
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[0.86rem] font-semibold text-navy-800">{n.title}</p>
                        <span className="chip">{EVENT_LABELS[n.event] ?? n.event}</span>
                        <StatusChip className={meta.chip} dot="bg-current">
                          {meta.label}
                        </StatusChip>
                        {!n.createdAutomatically ? <span className="chip">written by staff</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.8rem] leading-relaxed text-navy-500">{n.body}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.74rem] text-navy-400">
                        <span className="font-medium text-navy-600">{n.recipientName}</span>
                        <span className="font-mono">{n.recipientContact}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} /> drafted {relativeDayLabel(n.createdAt.slice(0, 10), snapshot.today)} · {formatDateTime(n.createdAt).split(',')[1]?.trim() ?? formatDateTime(n.createdAt)}
                        </span>
                        {n.scheduledFor ? <span>due {formatDateTime(n.scheduledFor)}</span> : null}
                        <span className="italic">{n.deliveryDetail}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(open?.id === n.id ? null : n)}>
                        {open?.id === n.id ? 'Close' : 'Read'}
                      </button>
                      {reservation ? (
                        <Link href={`/admin/reservations/${reservation.id}`} className="btn-ghost btn-sm">
                          Folio <ExternalLink size={11} />
                        </Link>
                      ) : null}
                      {can('notifications.send') && (n.deliveryStatus === 'not_connected' || n.deliveryStatus === 'queued_for_manual_send') ? (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => mark(n, { delivered: true }, `${n.recipientName} — logged as sent by ${snapshot.user.name}. The guest record still shows it as a staff confirmation.`)}
                          disabled={busy}
                        >
                          <CheckCheck size={12} /> Mark sent
                        </button>
                      ) : null}
                      {!n.readAt ? (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => mark(n, { read: true }, 'Marked as read.')} disabled={busy}>
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {open?.id === n.id ? (
                    <div className="mt-3 rounded-lg border border-sand-200 bg-sand-50/70 p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="label">Message as the guest would receive it</p>
                          <p className="mt-1 whitespace-pre-line text-[0.85rem] leading-relaxed text-navy-700">{n.body}</p>
                        </div>
                        <div className="shrink-0 space-y-1.5 text-right text-[0.74rem] text-navy-400">
                          <p>
                            Channel <span className="font-medium text-navy-600">{n.channel.replace('_', ' ')}</span>
                          </p>
                          <p>
                            Addressed <span className="font-mono text-navy-600">{n.recipientContact}</span>
                          </p>
                          <p>
                            Logged <span className="text-navy-600">{formatDateTime(n.createdAt)}</span>
                          </p>
                          {n.markedDeliveredAt ? (
                            <p>
                              Sent by <span className="text-navy-600">{n.markedDeliveredBy}</span> on {formatMediumDate(n.markedDeliveredAt.slice(0, 10))}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {n.channel !== 'in_app' ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-3">
                          <a href={handoffLink(n)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                            <Link2 size={12} /> Open in {n.channel === 'email' ? 'mail client' : n.channel === 'sms' ? 'messages' : 'WhatsApp'}
                          </a>
                          <span className="text-[0.74rem] text-navy-400">This opens your own device with the text ready — nothing is sent by the property system.</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={Bell}
              title={all.length ? 'Nothing in this view' : 'No messages logged yet'}
              body={
                all.length
                  ? 'Every row is on the unfiltered list — switch tabs or clear the search.'
                  : 'Booking confirmations, payment receipts and reminders appear here as soon as staff record the money or accept a stay. Run the sweep to draft the ones that are due.'
              }
            />
          </div>
        )}
        <Pagination page={page} pages={pages} total={rows.length} perPage={PAGE_SIZE} onPage={setPage} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What the property sends automatically" subtitle="Triggers wired into the register, and when they fire" bodyClass="p-4">
          <ul className="space-y-2 text-[0.82rem]">
            {[
              { label: 'Booking confirmation', when: 'the moment a stay is confirmed', on: snapshot.settings.notifications.sendBookingConfirmation },
              { label: 'Payment receipt', when: 'when a supervisor verifies money onto a folio', on: snapshot.settings.notifications.sendPaymentConfirmation },
              { label: 'Check-in reminder', when: `${snapshot.settings.notifications.checkInReminderDays} day before arrival`, on: true },
              { label: 'Check-out reminder', when: `${snapshot.settings.notifications.checkOutReminderDays} day before departure`, on: true },
              { label: 'Balance reminder', when: `${snapshot.settings.notifications.balanceReminderDays} days before arrival, if money is owed`, on: snapshot.settings.notifications.sendBalanceReminders },
              { label: 'Cancellation notice', when: 'a cancellation is confirmed by staff', on: snapshot.settings.notifications.sendCancellationNotice },
              { label: 'Cleaning reminder', when: 'a turnover is created or reassigned', on: snapshot.settings.notifications.sendCleaningReminders },
              { label: 'Maintenance alert', when: 'a cleaner logs a fault', on: true },
            ].map((r) => (
              <li key={r.label} className="flex items-start justify-between gap-3 border-b border-sand-100 pb-2 last:border-b-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block font-medium text-navy-800">{r.label}</span>
                  <span className="block text-[0.76rem] text-navy-400">{r.when}</span>
                </span>
                <span className={`chip shrink-0 ${r.on ? 'bg-st-availableBg text-st-available' : ''}`}>{r.on ? 'drafted' : 'off'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.74rem] leading-relaxed text-navy-400">
            “Drafted” means the system writes the message and files it against the folio. It does not mean delivery — see the warning above. Timing and copy are configurable in{' '}
            <Link href="/admin/settings" className="link">
              Settings
            </Link>
            .
          </p>
        </Panel>

        <Panel title="Sample copy" subtitle="The tone guests receive, taken from a real row in the log" bodyClass="p-4">
          {(() => {
            const sample = all.find((n) => n.event === 'booking_confirmation') ?? all[0];
            if (!sample) return <EmptyState title="No message to quote" body="Once a booking is confirmed, the copy shown to guests appears here." />;
            return (
              <div className="space-y-3">
                <div className="rounded-xl rounded-tl-sm border border-sand-200 bg-sand-50 p-3">
                  <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-navy-700">{sample.body}</p>
                  <p className="mt-2 text-[0.72rem] text-navy-400">
                    {sample.recipientName} · {sample.recipientContact} · {sample.channel.replace('_', ' ')}
                  </p>
                </div>
                <p className="text-[0.76rem] leading-relaxed text-navy-400">
                  Names, references, amounts and dates are filled from the reservation being acted on — this is not a fixed template string.
                </p>
              </div>
            );
          })()}
        </Panel>
      </div>

      {composing ? <ComposerChooser reservations={composableReservations} onClose={() => setComposing(false)} /> : null}
    </div>
  );
}

function ComposerChooser({ reservations, onClose }: { reservations: ReservationView[]; onClose: () => void }) {
  const [picked, setPicked] = useState<ReservationView | null>(null);
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = reservations.filter((r) => !needle || [r.reference, r.guest?.fullName, r.guest?.phone].join(' ').toLowerCase().includes(needle));
    return rows.sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)).slice(0, 40);
  }, [reservations, query]);

  return (
    <>
      {!picked ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Choose a folio to message">
          <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} tabIndex={-1} />
          <div className="relative mt-[6vh] w-full max-w-lg rounded-xl border border-sand-200 bg-white shadow-pop">
            <div className="border-b border-sand-200 px-4 py-3">
              <p className="text-[0.95rem] font-semibold text-navy-800">Message a guest</p>
              <p className="mt-0.5 text-[0.78rem] text-navy-400">Pick the folio the message belongs to, so the amounts quoted are the ones on their account.</p>
            </div>
            <div className="p-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Name, phone or reference" />
            </div>
            <ul className="max-h-[50vh] overflow-y-auto border-t border-sand-200">
              {list.length ? (
                list.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setPicked(r)} className="row-hover flex w-full items-center gap-3 border-b border-sand-100 px-4 py-2.5 text-left last:border-b-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.85rem] font-semibold text-navy-800">{r.guest?.fullName}</span>
                        <span className="block truncate text-[0.74rem] text-navy-400">
                          {r.reference} · Apt {r.apartment?.number} · {formatMediumDate(r.checkIn)} → {formatMediumDate(r.checkOut)}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[0.78rem] font-semibold tnum ${r.balanceDue ? 'text-st-cancelled' : 'text-st-available'}`}>{r.balanceDue ? `${formatKwacha(r.balanceDue)} due` : 'settled'}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-4 py-6">
                  <EmptyState icon={PhoneCall} title="No folio matches" body="Clear the search, or create the booking first — messages always hang off a reservation." />
                </li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
      <MessageComposer
        open={!!picked}
        reservation={picked}
        onClose={() => {
          setPicked(null);
          onClose();
        }}
        initialRecipient={picked?.guest?.fullName ?? ''}
        initialContact={picked?.guest?.phone ?? ''}
        initialBody={picked ? composerBody(picked) : ''}
      />
    </>
  );
}

function composerBody(r: ReservationView): string {
  const first = r.guest?.fullName?.split(' ')[0] ?? 'guest';
  return [
    `Hello ${first}, this is ${r.apartment ? `Apt ${r.apartment.number} at` : ''} Lemma Apartments.`,
    `Your booking ${r.reference} for ${formatMediumDate(r.checkIn)} to ${formatMediumDate(r.checkOut)} is on our register.`,
    r.balanceDue ? `A balance of ${formatKwacha(r.balanceDue)} is still outstanding — you can settle by Airtel Money, MTN Mobile Money, at the desk or by bank transfer.` : 'Your folio is fully settled, so nothing further is due.',
    'Reception is staffed from 06:30 to 22:00. Reply here and we will help.',
  ].join('\n');
}

function handoffLink(n: NotificationRecord): string {
  const digits = n.recipientContact.replace(/[^0-9+]/g, '');
  const body = encodeURIComponent(n.body);
  if (n.channel === 'email') return `mailto:${n.recipientContact}?subject=${encodeURIComponent(n.title)}&body=${body}`;
  if (n.channel === 'sms') return `sms:${digits}?body=${body}`;
  const normalised = digits.replace('+', '').startsWith('260') ? digits.replace('+', '') : `260${digits.replace(/^0/, '').replace('+', '')}`;
  return `https://wa.me/${normalised}?text=${body}`;
}
