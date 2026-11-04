'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Filter, Inbox, Plus, RotateCcw, X } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { PageHeader, useShell } from '@/components/admin/shell';
import { Alert, DataTable, EmptyState, Pagination, Panel, Skeleton, StatusChip } from '@/components/ui';
import { SelectInput, SearchInput, DateInput, CheckboxRow } from '@/components/ui/forms';
import { ReservationTable, sortReservations, type SortKey } from '@/components/admin/reservation-table';
import { useReservationActions } from '@/components/admin/actions';
import { BOOKING_STATUS_META, PAYMENT_STATUS_META } from '@/lib/domain/status';
import { formatKwacha } from '@/lib/domain/money';
import { formatMediumDate } from '@/lib/domain/dates';
import { downloadCsv } from '@/lib/browser/csv';
import type { BookingStatus, PaymentStatus } from '@/lib/domain/types';

const PER_PAGE = 12;

function ReservationsView() {
  const { snapshot, status } = useApp();
  const shell = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const actions = useReservationActions();

  const [query, setQuery] = useState('');
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | 'all'>((params.get('status') as BookingStatus) ?? 'all');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | 'all'>('all');
  const [apartmentId, setApartmentId] = useState('all');
  const [from, setFrom] = useState(params.get('arrivals') === 'today' ? (snapshot?.today ?? '') : '');
  const [to, setTo] = useState(params.get('arrivals') === 'today' ? (snapshot?.today ?? '') : '');
  const [dateBasis, setDateBasis] = useState<'arrival' | 'stay'>(params.get('departures') === 'today' ? 'stay' : 'arrival');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'checkIn', dir: 'desc' });

  const rows = useMemo(() => {
    const all = snapshot?.reservations ?? [];
    const q = query.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (bookingStatus !== 'all' && r.status !== bookingStatus) return false;
      if (paymentStatus !== 'all' && r.paymentStatus !== paymentStatus) return false;
      if (apartmentId !== 'all' && r.apartmentId !== apartmentId) return false;
      if (onlyOpen && (r.status === 'cancelled' || r.status === 'checked_out')) return false;
      if (from && to) {
        if (dateBasis === 'arrival') {
          if (r.checkIn < from || r.checkIn > to) return false;
        } else if (!(r.checkIn <= to && r.checkOut >= from)) return false;
      } else if (from) {
        if (dateBasis === 'arrival' ? r.checkIn !== from : !(r.checkIn <= from && r.checkOut > from)) return false;
      }
      if (!q) return true;
      return (
        r.reference.toLowerCase().includes(q) ||
        (r.guest?.fullName ?? '').toLowerCase().includes(q) ||
        (r.guest?.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        (r.guest?.email ?? '').toLowerCase().includes(q) ||
        (r.apartment?.name ?? '').toLowerCase().includes(q) ||
        `apt ${r.apartment?.number}`.includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      );
    });
    return sortReservations(filtered, sort);
  }, [snapshot, query, bookingStatus, paymentStatus, apartmentId, from, to, dateBasis, onlyOpen, sort]);

  if (status === 'loading' || !snapshot) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[28rem]" />
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const visible = rows.slice((Math.min(page, pages) - 1) * PER_PAGE, Math.min(page, pages) * PER_PAGE);
  const filtersActive =
    query.trim() !== '' || bookingStatus !== 'all' || paymentStatus !== 'all' || apartmentId !== 'all' || !!from || !!to || onlyOpen;

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.totalAmount;
      acc.balance += r.balanceDue;
      acc.paid += r.verifiedPaid;
      return acc;
    },
    { total: 0, balance: 0, paid: 0 },
  );

  function resetFilters() {
    setQuery('');
    setBookingStatus('all');
    setPaymentStatus('all');
    setApartmentId('all');
    setFrom('');
    setTo('');
    setOnlyOpen(false);
    setPage(1);
    router.replace('/admin/reservations');
  }

  function exportCsv() {
    downloadCsv(
      `lemma-reservations-${snapshot!.today}.csv`,
      ['Reference', 'Guest', 'Phone', 'Apartment', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Rate', 'Total', 'Verified paid', 'Balance', 'Booking status', 'Payment status', 'Source'],
      rows.map((r) => [
        r.reference,
        r.guest?.fullName ?? '',
        r.guest?.phone ?? '',
        `Apt ${r.apartment?.number} ${r.apartment?.name ?? ''}`,
        r.checkIn,
        r.checkOut,
        r.nights,
        r.guestCount,
        r.nightlyRate,
        r.totalAmount,
        r.verifiedPaid,
        r.balanceDue,
        r.status.replace(/_/g, ' '),
        r.paymentStatus.replace(/_/g, ' '),
        r.source.replace(/_/g, ' '),
      ]),
    );
  }

  const inquiries = rows.filter((r) => r.status === 'inquiry');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reservations"
        description="Everything the desk can act on: requests from the website, confirmed stays, in-house folios and closed accounts. Availability is enforced on save, so two guests cannot be sold the same night."
        actions={
          <>
            <button onClick={exportCsv} className="btn-secondary h-10 px-3.5" disabled={!rows.length}>
              <Download size={15} /> Export CSV
            </button>
            <button onClick={() => shell.openBooking()} className="btn-primary h-10 px-4">
              <Plus size={15} /> New booking
            </button>
          </>
        }
      />

      {inquiries.length ? (
        <Alert tone="info" title={`${inquiries.length} website request${inquiries.length === 1 ? '' : 's'} awaiting a decision`}>
          Requests hold no inventory until accepted — other guests can still be sold those dates. Accepting re-checks availability first.
        </Alert>
      ) : null}

      <Panel bodyClass="">
        <div className="flex flex-wrap items-end gap-2.5 border-b border-sand-200 p-3.5">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Reference, guest, phone, notes…" className="min-w-0 w-full flex-1 sm:min-w-[15rem]" />
          <SelectInput
            label="Booking"
            value={bookingStatus}
            onChange={(e) => { setBookingStatus(e.target.value as BookingStatus | 'all'); setPage(1); }}
            className="w-[10.5rem]"
            options={[
              { value: 'all', label: 'Any status' },
              ...(Object.keys(BOOKING_STATUS_META) as BookingStatus[]).map((key) => ({ value: key, label: BOOKING_STATUS_META[key].label })),
            ]}
          />
          <SelectInput
            label="Payment"
            value={paymentStatus}
            onChange={(e) => { setPaymentStatus(e.target.value as PaymentStatus | 'all'); setPage(1); }}
            className="w-[9.5rem]"
            options={[
              { value: 'all', label: 'Any' },
              ...(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map((key) => ({ value: key, label: PAYMENT_STATUS_META[key].label })),
            ]}
          />
          <SelectInput
            label="Apartment"
            value={apartmentId}
            onChange={(e) => { setApartmentId(e.target.value); setPage(1); }}
            className="w-[12rem]"
            options={[
              { value: 'all', label: 'All apartments' },
              ...(snapshot.apartments ?? []).map((a) => ({ value: a.id, label: `Apt ${a.number} — ${a.name}` })),
            ]}
          />
          <DateInput label={dateBasis === 'arrival' ? 'Arriving from' : 'Occupying from'} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-[9.5rem]" />
          <DateInput label="to" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-[9rem]" />
          <label className="flex h-[2.4rem] items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-2.5">
            <span className="label">Dates mean</span>
            <select value={dateBasis} onChange={(e) => setDateBasis(e.target.value as 'arrival' | 'stay')} className="bg-transparent text-[0.8rem] font-semibold text-navy-700 outline-none">
              <option value="arrival">arrival</option>
              <option value="stay">any night</option>
            </select>
          </label>
          <CheckboxRow checked={onlyOpen} onChange={(v) => { setOnlyOpen(v); setPage(1); }} label="Open only" />
          {filtersActive ? (
            <button onClick={resetFilters} className="btn-ghost h-9 gap-1.5 px-2.5 text-[0.78rem]">
              <RotateCcw size={13} /> Reset
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 bg-sand-50/60 px-3.5 py-2 text-[0.76rem] text-navy-500">
          <span className="flex items-center gap-1.5">
            <Filter size={12} className="text-navy-400" />
            {rows.length} reservation{rows.length === 1 ? '' : 's'} match
            {from ? ` · from ${formatMediumDate(from)}` : ''}
            {to && to !== from ? ` → ${formatMediumDate(to)}` : ''}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
            <span>Booked value <strong className="text-navy-800">{formatKwacha(totals.total)}</strong></span>
            <span>Banked <strong className="text-st-available">{formatKwacha(totals.paid)}</strong></span>
            <span>Outstanding <strong className={totals.balance > 0 ? 'text-st-cancelled' : 'text-navy-800'}>{formatKwacha(totals.balance)}</strong></span>
          </span>
        </div>

        <ReservationTable
          rows={visible}
          today={snapshot.today}
          sort={sort}
          onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
          empty={
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title="No reservations match these filters"
                body={
                  filtersActive
                    ? 'Widen the date window or clear a filter — the ledger holds every booking since the property opened, so the one you want is usually there.'
                    : 'Nothing has been booked yet. Create the first reservation and it will appear here and on the calendar immediately.'
                }
                action={
                  filtersActive ? (
                    <button onClick={resetFilters} className="btn-secondary btn-sm">
                      <X size={13} /> Clear filters
                    </button>
                  ) : (
                    <button onClick={() => shell.openBooking()} className="btn-primary btn-sm">
                      <Plus size={13} /> New booking
                    </button>
                  )
                }
              />
            </div>
          }
        />

        {rows.length > PER_PAGE ? <Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} perPage={PER_PAGE} onPage={setPage} /> : null}
      </Panel>

      {snapshot.metrics && snapshot.metrics.outstandingCount > 0 ? (
        <p className="px-1 text-[0.75rem] text-navy-400">
          {snapshot.metrics.outstandingCount} folios are carrying {formatKwacha(snapshot.metrics.outstandingTotal)} in outstanding balances. Chase them from Payments → Outstanding.
        </p>
      ) : null}

      {actions.actions}
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-[28rem]" />
        </div>
      }
    >
      <ReservationsView />
    </Suspense>
  );
}

export function ReservationStatusChip({ value }: { value: BookingStatus }) {
  return <StatusChip className={BOOKING_STATUS_META[value].chip}>{BOOKING_STATUS_META[value].label}</StatusChip>;
}
