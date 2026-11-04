'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, Download, Paperclip, ShieldCheck, Wallet } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { GuestClaimQueue } from '@/components/admin/guest-claim-queue';
import { StatementImport } from '@/components/admin/statement-import';
import { PageHeader } from '@/components/admin/shell';
import { Alert, DataTable, EmptyState, Pagination, Panel, Skeleton, StatusChip, Tabs } from '@/components/ui';
import { DateInput, SearchInput, Segmented, SelectInput } from '@/components/ui/forms';
import { PaymentDialog, ReceiptLink, MessageComposer, VerificationDialog, folioStatusTone } from '@/components/admin/payments-ui';
import { formatKwacha } from '@/lib/domain/money';
import { dayDiff, formatDateWithWeekday, formatDateTime, formatMediumDate, monthRange } from '@/lib/domain/dates';
import { PAYMENT_METHOD_META, BOOKING_STATUS_META, PAYMENT_STATUS_META, SOURCE_META, VERIFICATION_META } from '@/lib/domain/status';
import { downloadCsv } from '@/lib/browser/csv';
import type { Payment, PaymentMethod, ReservationView } from '@/lib/domain/types';

type Tab = 'claims' | 'queue' | 'ledger' | 'balances' | 'import' | 'instructions';
type SortKey = 'paidAt' | 'amount' | 'guest';

const PAGE_SIZE = 14;

export default function PaymentsPage() {
  const { snapshot, can, toast } = useApp();
  const [tab, setTab] = useState<Tab>('claims');
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<'all' | PaymentMethod>('all');
  const [verification, setVerification] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'paidAt', dir: 'desc' });
  const [paying, setPaying] = useState<ReservationView | null>(null);
  const [verifying, setVerifying] = useState<Payment | null>(null);
  const [messaging, setMessaging] = useState<ReservationView | null>(null);

  const reservations = useMemo(() => snapshot?.reservations ?? [], [snapshot]);

  const ledger = useMemo(() => {
    if (!snapshot?.payments) return [];
    const needle = query.trim().toLowerCase();
    let rows = snapshot.payments.map((p) => ({
      payment: p,
      reservation: reservations.find((r) => r.id === p.reservationId) ?? null,
    }));
    if (method !== 'all') rows = rows.filter((r) => r.payment.method === method);
    if (verification !== 'all') rows = rows.filter((r) => r.payment.verificationStatus === verification);
    if (from) rows = rows.filter((r) => r.payment.paidAt.slice(0, 10) >= from);
    if (to) rows = rows.filter((r) => r.payment.paidAt.slice(0, 10) <= to);
    if (needle)
      rows = rows.filter((r) =>
        [r.payment.reference, r.payment.recordedByName, r.reservation?.guest?.fullName, r.reservation?.reference, r.payment.note]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle)),
      );
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'amount') return (a.payment.amount - b.payment.amount) * factor;
      if (sort.key === 'guest') return (a.reservation?.guest?.fullName ?? '').localeCompare(b.reservation?.guest?.fullName ?? '') * factor;
      return a.payment.paidAt.localeCompare(b.payment.paidAt) * factor;
    });
  }, [snapshot, reservations, query, method, verification, from, to, sort]);

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!snapshot.payments)
    return (
      <div className="space-y-4">
        <PageHeader title="Payments" description="Money in and money owed." />
        <EmptyState
          icon={ShieldCheck}
          title="Payments are not visible to your role"
          body="Cleaners see housekeeping work only — folios, receipts and balances stay with reception and management."
        />
      </div>
    );

  const payments = snapshot.payments;
  const month = monthRange(snapshot.today);
  const monthStart = `${month.year}-${month.month}-01`;
  const verified = payments.filter((p) => p.verificationStatus === 'verified');
  const bankedThisMonth = verified.filter((p) => p.paidAt.slice(0, 7) === monthStart.slice(0, 7)).reduce((s, p) => s + p.amount, 0);
  const pendingRows = payments.filter((p) => p.verificationStatus === 'pending');
  const pendingAmount = pendingRows.reduce((s, p) => s + p.amount, 0);
  const refunds = payments.filter((p) => p.kind === 'refund');
  const outstandingRows = reservations
    .filter((r) => r.status !== 'cancelled' && r.balanceDue > 0)
    .sort((a, b) => b.balanceDue - a.balanceDue);
  const outstanding = outstandingRows.reduce((s, r) => s + r.balanceDue, 0);
  const byMethod = (Object.keys(PAYMENT_METHOD_META) as PaymentMethod[]).map((m) => ({
    method: m,
    total: verified.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0),
    count: verified.filter((p) => p.method === m).length,
  }));
  const grand = Math.max(1, byMethod.reduce((s, m) => s + m.total, 0));

  const pages = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const shown = ledger.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportLedger() {
    downloadCsv(
      `receipts-${snapshot!.today}`,
      ['Paid at', 'Reference', 'Guest', 'Reservation', 'Apartment', 'Method', 'Kind', 'Amount (K)', 'Verification', 'Verified by', 'Recorded by', 'Note'],
      ledger.map(({ payment: p, reservation: r }) => [
        p.paidAt,
        p.reference,
        r?.guest?.fullName ?? '—',
        r?.reference ?? '—',
        r ? `Apt ${r.apartment?.number}` : '—',
        PAYMENT_METHOD_META[p.method].label,
        p.kind.replace(/_/g, ' '),
        String(p.amount),
        p.verificationStatus,
        p.verifiedBy ?? '',
        p.recordedByName,
        p.note,
      ]),
    );
    toast({ tone: 'success', title: 'Export started', body: `${ledger.length} receipt rows written to CSV.` });
  }

  const openClaims = (snapshot.paymentClaims ?? []).filter((c) => c.status === 'awaiting_verification');

  const tabs = [
    {
      value: 'claims' as const,
      label: 'Guest submissions',
      count: openClaims.length,
    },
    { value: 'queue' as const, label: 'Verification queue', count: pendingRows.length },
    { value: 'ledger' as const, label: 'Receipt ledger', count: payments.length },
    { value: 'balances' as const, label: 'Open balances', count: outstandingRows.length },
    { value: 'import' as const, label: 'Statement import' },
    { value: 'instructions' as const, label: 'Payment instructions' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments"
        description="Every Kwacha in and every Kwacha owed, with the verification step that separates a claimed payment from money the property actually holds."
        actions={
          tab === 'ledger' ? (
            <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={exportLedger} disabled={!ledger.length}>
              <Download size={14} /> Export CSV
            </button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Banked in ${month.label}`}
          value={formatKwacha(bankedThisMonth)}
          hint={`${verified.filter((p) => p.paidAt.slice(0, 7) === monthStart.slice(0, 7)).length} verified receipt${
            verified.filter((p) => p.paidAt.slice(0, 7) === monthStart.slice(0, 7)).length === 1 ? '' : 's'
          }`}
          icon={CheckCircle2}
          tone="good"
        />
        <Stat
          label="Awaiting verification"
          value={pendingRows.length ? formatKwacha(pendingAmount) : 'Clear'}
          hint={pendingRows.length ? `${pendingRows.length} receipt${pendingRows.length === 1 ? '' : 's'} entered but not yet confirmed` : 'Nothing is waiting on a supervisor'}
          icon={AlertTriangle}
          tone={pendingRows.length ? 'warn' : 'muted'}
        />
        <Stat
          label="Outstanding balances"
          value={outstanding ? formatKwacha(outstanding) : 'Nothing owed'}
          hint={`${outstandingRows.length} folio${outstandingRows.length === 1 ? '' : 's'} still open`}
          icon={Wallet}
          tone={outstanding ? 'bad' : 'good'}
        />
        <Stat
          label="Refunds issued"
          value={refunds.length ? formatKwacha(refunds.reduce((s, p) => s + p.amount, 0)) : '—'}
          hint={refunds.length ? `${refunds.length} refund${refunds.length === 1 ? '' : 's'} in the ledger` : 'No cancellations have triggered a refund'}
          icon={Banknote}
          tone="muted"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-2">
          {(['airtel_money', 'mtn_money', 'bank_transfer', 'cash'] as PaymentMethod[]).map((m) => (
            <span key={m} className="chip" title={`${byMethod.find((x) => x.method === m)!.count} verified receipt(s)`}>
              {PAYMENT_METHOD_META[m].short} {Math.round((byMethod.find((x) => x.method === m)!.total / grand) * 100)}%
            </span>
          ))}
        </div>
      </div>

      {tab === 'claims' ? <GuestClaimQueue /> : null}
      {tab === 'import' ? <StatementImport /> : null}

      {tab === 'queue' ? (
        <Panel
          title="What reception entered, waiting for a signature"
          subtitle="A screenshot proves nothing until someone with payments.verify has matched it against the merchant code or bank statement."
          bodyClass="divide-y divide-sand-100"
        >
          <Alert tone="warn" title="Proof is not payment">
            Uploading a confirmation message or a slip never changes a guest's balance. Only <span className="font-semibold">Confirm</span> below moves money onto a folio, and the action is
            stamped with your name and the time.
          </Alert>
          {pendingRows.length ? (
            <ul className="divide-y divide-sand-100">
              {pendingRows
                .slice()
                .reverse()
                .map((p) => {
                  const r = reservations.find((x) => x.id === p.reservationId) ?? null;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      {p.proof?.dataUrl ? (
                        <img src={p.proof.dataUrl} alt={`Proof of payment: ${p.proof.fileName}`} className="h-14 w-14 shrink-0 rounded-lg border border-sand-300 object-cover" />
                      ) : (
                        <span
                          className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-sand-300 text-navy-300"
                          title={p.proof ? `${p.proof.fileName} — attached as evidence of this receipt` : 'No proof attached'}
                        >
                          <Paperclip size={16} />
                        </span>
                      )}
                      <div className="min-w-[10rem] flex-1">
                        <p className="text-[0.88rem] font-semibold text-navy-800">
                          {formatKwacha(p.amount)} · {r?.guest?.fullName ?? 'Unknown guest'}
                        </p>
                        <p className="mt-0.5 text-[0.76rem] text-navy-500">
                          {PAYMENT_METHOD_META[p.method].label} · {p.reference || 'no reference given'} · {p.kind.replace(/_/g, ' ')}
                        </p>
                        <p className="mt-0.5 text-[0.74rem] text-navy-400">
                          Entered by {p.recordedByName} on {formatDateTime(p.createdAt)}
                          {p.note ? ` — “${p.note}”` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {r ? (
                          <Link href={`/admin/reservations/${r.id}`} className="btn-ghost btn-sm">
                            Folio
                          </Link>
                        ) : null}
                        {can('payments.verify') ? (
                          <button type="button" className="btn-primary btn-sm" onClick={() => setVerifying(p)}>
                            <ShieldCheck size={12} /> Review
                          </button>
                        ) : (
                          <span className="chip">Needs a manager</span>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <div className="p-4">
              <EmptyState icon={CheckCircle2} title="Queue is clear" body="Every entered receipt has been reviewed. New proof lands here the moment reception records it." />
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'ledger' ? (
        <>
          <div className="card flex flex-wrap items-end gap-3 p-3.5">
            <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Reference, guest or receipt number" className="min-w-[14rem] flex-1" />
            <SelectInput
              label="Method"
              className="w-44"
              value={method}
              onChange={(e) => { setMethod(e.target.value as typeof method); setPage(1); }}
              options={[
                { value: 'all', label: 'All methods' },
                { value: 'airtel_money', label: 'Airtel Money' },
                { value: 'mtn_money', label: 'MTN MoMo' },
                { value: 'bank_transfer', label: 'Bank transfer' },
                { value: 'cash', label: 'Cash' },
              ]}
            />
            <Segmented
              ariaLabel="Verification filter"
              value={verification}
              onChange={(v) => { setVerification(v); setPage(1); }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'verified', label: 'Verified' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
            <DateInput label="From" className="w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <DateInput label="To" className="w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            {(from || to || query || method !== 'all' || verification !== 'all') ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setQuery('');
                  setMethod('all');
                  setVerification('all');
                }}
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="card overflow-hidden">
            <DataTable
              head={[
                <button key="paidAt" type="button" onClick={() => setSort((s) => ({ key: 'paidAt', dir: s.key === 'paidAt' && s.dir === 'desc' ? 'asc' : 'desc' }))} className={sort.key === 'paidAt' ? 'text-navy-800' : ''}>
                  Received {sort.key === 'paidAt' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>,
                'Guest / folio',
                'Method',
                'Reference',
                <button key="amount" type="button" onClick={() => setSort((s) => ({ key: 'amount', dir: s.key === 'amount' && s.dir === 'desc' ? 'asc' : 'desc' }))} className={sort.key === 'amount' ? 'text-navy-800' : ''}>
                  Amount {sort.key === 'amount' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </button>,
                'Status',
                '',
              ]}
            >
              {shown.length ? (
                shown.map(({ payment: p, reservation: r }) => (
                  <tr key={p.id} className="row-hover border-b border-sand-100 last:border-b-0">
                    <td className="td">
                      <span className="block text-[0.82rem] font-medium text-navy-700">{formatDateWithWeekday(p.paidAt.slice(0, 10))}</span>
                      <span className="block text-[0.7rem] text-navy-400">{p.paidAt.slice(11, 16) || 'valued'} · {p.kind.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="td">
                      {r ? (
                        <Link href={`/admin/reservations/${r.id}`} className="block">
                          <span className="block text-[0.84rem] font-semibold text-navy-800 hover:text-teal-700">{r.guest?.fullName}</span>
                          <span className="block font-mono text-[0.7rem] text-navy-400">
                            {r.reference} · Apt {r.apartment?.number}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-[0.8rem] text-navy-400">Orphaned entry</span>
                      )}
                    </td>
                    <td className="td text-[0.8rem] text-navy-600">{PAYMENT_METHOD_META[p.method].label}</td>
                    <td className="td">
                      <span className="block font-mono text-[0.76rem] text-navy-600">{p.reference || '—'}</span>
                      {p.proof ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[0.7rem] text-navy-400">
                          <Paperclip size={10} /> {p.proof.fileName}
                        </span>
                      ) : null}
                    </td>
                    <td className="td text-right text-[0.86rem] font-semibold text-navy-800 tnum">{p.kind === 'refund' ? `−${formatKwacha(p.amount)}` : formatKwacha(p.amount)}</td>
                    <td className="td">
                      <StatusChip className={VERIFICATION_META[p.verificationStatus].chip} dot="bg-current">
                        {VERIFICATION_META[p.verificationStatus].label}
                      </StatusChip>
                      {p.verifiedBy ? <span className="mt-0.5 block text-[0.68rem] text-navy-400">by {p.verifiedBy}</span> : null}
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.verificationStatus === 'pending' && can('payments.verify') ? (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setVerifying(p)}>
                            Review
                          </button>
                        ) : null}
                        {p.verificationStatus === 'verified' ? <ReceiptLink paymentId={p.id} amount={p.amount} /> : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8">
                    <EmptyState
                      title="No receipt matches these filters"
                      body="Loosen the date window or clear the method filter. Recorded payments never disappear — they are only hidden by a filter here."
                    />
                  </td>
                </tr>
              )}
            </DataTable>
            <Pagination page={page} pages={pages} total={ledger.length} perPage={PAGE_SIZE} onPage={setPage} />
          </div>
        </>
      ) : null}

      {tab === 'balances' ? (
        <Panel
          title="Folios still owing"
          subtitle="Deposit due is the share of the total the booking terms ask for before arrival; balance due is everything still outstanding."
          bodyClass="divide-y divide-sand-100"
        >
          {outstandingRows.length ? (
            outstandingRows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="text-[0.86rem] font-semibold text-navy-800">
                    {r.guest?.fullName} · <span className="font-normal text-navy-500">Apt {r.apartment?.number}</span>
                  </p>
                  <p className="mt-0.5 text-[0.76rem] text-navy-500">
                    {formatMediumDate(r.checkIn)} → {formatMediumDate(r.checkOut)} · {r.nights}N · {formatKwacha(r.totalAmount)} total
                  </p>
                  <p className="mt-0.5 text-[0.74rem] text-navy-400">
                    {formatKwacha(r.verifiedPaid)} banked
                    {r.pendingVerification ? ` · ${formatKwacha(r.pendingVerification)} awaiting verification` : ''} · booked via {SOURCE_LABELS[r.source] ?? r.source.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-[0.95rem] font-bold tnum ${r.balanceDue > r.depositDue ? 'text-st-cancelled' : 'text-gold-700'}`}>{formatKwacha(r.balanceDue)}</p>
                  <p className="text-[0.72rem] text-navy-400">deposit {formatKwacha(r.depositDue)}</p>
                </div>
                <StatusChip className={folioStatusTone(r.paymentStatus)}>{PAYMENT_STATUS_META[r.paymentStatus].label}</StatusChip>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link href={`/admin/reservations/${r.id}`} className="btn-ghost btn-sm">
                    Folio
                  </Link>
                  {can('payments.record') ? (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setPaying(r)}>
                      Record payment
                    </button>
                  ) : null}
                  {can('notifications.send') ? (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setMessaging(r)}>
                      Remind
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4">
              <EmptyState icon={CheckCircle2} title="Every folio is settled" body="No confirmed booking currently owes the property money." />
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'instructions' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.settings.payments.methods.map((m) => (
            <Panel
              key={m.id}
              title={m.label}
              subtitle={m.enabled ? 'Offered on the website and in payment prompts' : 'Disabled — staff cannot select it on a new receipt'}
              action={
                can('settings.manage') ? (
                  <Link href="/admin/settings" className="btn-ghost btn-sm">
                    Configure
                  </Link>
                ) : null
              }
              bodyClass="p-4 space-y-2.5"
            >
              <div className="rounded-lg bg-sand-50 px-3 py-2.5 ring-1 ring-sand-200">
                <p className="label">{m.accountLabel}</p>
                <p className="font-mono text-[1.05rem] font-bold tracking-wide text-navy-800">{m.accountNumber}</p>
              </div>
              <p className="text-[0.82rem] leading-relaxed text-navy-600">{m.instructions}</p>
              <p className="text-[0.76rem] text-navy-400">
                Account name: <span className="font-medium text-navy-600">{snapshot.settings.property.legalName}</span>
                {m.id === 'bank_transfer' ? ' · Quote the reservation reference in the payment description.' : ''}
              </p>
            </Panel>
          ))}
          <Panel title="House rules on money" bodyClass="p-4" className="lg:col-span-2">
            <ul className="space-y-1.5 text-[0.84rem] leading-relaxed text-navy-600">
              <li>· {snapshot.settings.booking.depositPercent}% of the stay total is due to confirm a reservation; the remainder is due by {snapshot.settings.booking.checkInTime} on arrival day.</li>
              <li>· Cancellations inside {snapshot.settings.booking.cancellationPolicyHours} hours of arrival forfeit the deposit unless a manager approves a refund.</li>
              <li>· Refunds are only ever issued from the cancellation screen, so the ledger keeps the reason next to the money.</li>
              <li>· Cash at the desk is counted against the drawer at {snapshot.settings.housekeeping.turnaroundMinutes > 0 ? 'shift change' : 'shift change'}; a receipt is issued for every note taken.</li>
            </ul>
          </Panel>
        </div>
      ) : null}

      {paying ? <PaymentDialog open={!!paying} reservation={paying} onClose={() => setPaying(null)} /> : null}
      {verifying ? (
        <VerificationDialog payment={verifying} onClose={() => setVerifying(null)} />
      ) : null}
      {messaging ? (
        <MessageComposer
          open={!!messaging}
          reservation={messaging}
          onClose={() => setMessaging(null)}
          initialRecipient={messaging.guest?.fullName ?? ''}
          initialContact={messaging.guest?.phone ?? ''}
          initialBody={balanceReminderBody(messaging, snapshot.today, snapshot.settings)}
        />
      ) : null}
    </div>
  );
}

const SOURCE_LABELS = SOURCE_META as Record<string, string>;

function balanceReminderBody(r: ReservationView, today: string, settings: { property: { name: string }; booking: { checkOutTime: string } }): string {
  const days = dayDiffLabel(today, r.checkIn);
  return [
    `Hello ${r.guest?.fullName?.split(' ')[0] ?? 'guest'}, this is ${settings.property.name}.`,
    `Your stay in Apt ${r.apartment?.number} ${r.apartment?.name} ${days}. Balance on the folio: ${formatKwacha(r.balanceDue)} of ${formatKwacha(r.totalAmount)}.`,
    `You can settle by Airtel Money or MTN Mobile Money using the merchant code on your confirmation, or in cash at reception. Reply here if the payment is already on its way and we will confirm on our side.`,
  ].join('\n');
}

function dayDiffLabel(today: string, date: string): string {
  const n = dayDiff(today, date);
  if (n === 0) return 'arrives today';
  if (n === 1) return 'arrives tomorrow';
  if (n > 1) return `starts in ${n} days`;
  if (n === -1) return 'departed yesterday';
  return `started ${Math.abs(n)} days ago`;
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Wallet;
  tone: 'good' | 'bad' | 'warn' | 'muted';
}) {
  const toneClass =
    tone === 'good'
      ? 'bg-st-availableBg text-st-available'
      : tone === 'bad'
        ? 'bg-st-cancelledBg text-st-cancelled'
        : tone === 'warn'
          ? 'bg-gold-50 text-gold-700'
          : 'bg-sand-100 text-navy-500';
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="label">{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneClass}`}>
          <Icon size={14} />
        </span>
      </div>
      <p className="mt-1 font-display text-[1.45rem] leading-none text-navy-800 tnum">{value}</p>
      <p className="mt-1.5 text-[0.76rem] leading-snug text-navy-400">{hint}</p>
    </div>
  );
}
