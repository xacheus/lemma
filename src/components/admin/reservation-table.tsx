'use client';

import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { StatusChip } from '@/components/ui';
import { BOOKING_STATUS_META, PAYMENT_STATUS_META, SOURCE_META } from '@/lib/domain/status';
import { formatKwacha } from '@/lib/domain/money';
import { formatMediumDate, relativeDayLabel } from '@/lib/domain/dates';
import type { ReservationView } from '@/lib/domain/types';

export type SortKey = 'checkIn' | 'guest' | 'apartment' | 'total' | 'balance' | 'status';

export function ReservationTable({
  rows,
  today,
  sort,
  onSort,
  onOpen,
  compact = false,
  linkToDetail = true,
  empty,
}: {
  rows: ReservationView[];
  today: string;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  onOpen?: (row: ReservationView) => void;
  compact?: boolean;
  linkToDetail?: boolean;
  empty?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!rows.length) return <>{empty}</>;

  const Header = ({ label, field, align = 'left' }: { label: string; field?: SortKey; align?: 'left' | 'right' }) => (
    <th className={`th ${align === 'right' ? 'text-right' : ''}`}>
      {field ? (
        <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-navy-700">
          {label}
          {sort.key === field ? (
            sort.dir === 'asc' ? (
              <ChevronUp size={11} />
            ) : (
              <ChevronDown size={11} />
            )
          ) : null}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="w-full min-w-[62rem] border-collapse">
        <thead className="bg-sand-50/80">
          <tr className="border-b border-sand-200">
            <Header label="Reference" />
            <Header label="Guest" field="guest" />
            <Header label="Apartment" field="apartment" />
            <Header label="Stay" field="checkIn" />
            <Header label="Source" />
            <Header label="Booking" field="status" />
            <Header label="Payment" />
            <Header label="Total" field="total" align="right" />
            <Header label="Balance" field="balance" align="right" />
            <th className="th" />
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map((r) => {
            const stay = `${formatMediumDate(r.checkIn)} → ${formatMediumDate(r.checkOut)}`;
            const isToday = r.checkIn === today || r.checkOut === today;
            return (
              <tr
                key={r.id}
                onMouseEnter={() => setHovered(r.id)}
                onMouseLeave={() => setHovered((h) => (h === r.id ? null : h))}
                className={`row-hover ${isToday ? 'bg-gold-50/40' : ''} ${hovered === r.id && onOpen ? 'cursor-pointer' : ''}`}
                onClick={() => onOpen?.(r)}
              >
                <td className="td whitespace-nowrap">
                  <span className="font-mono text-[0.76rem] font-semibold text-navy-700">{r.reference}</span>
                  {r.isTodayCheckIn ? <span className="ml-1.5 chip bg-teal-50 text-teal-700">in today</span> : null}
                  {r.isTodayCheckOut ? <span className="ml-1.5 chip bg-sand-200 text-navy-600">out today</span> : null}
                </td>
                <td className="td">
                  <span className="block max-w-[14rem] truncate font-semibold text-navy-800">{r.guest?.fullName ?? '—'}</span>
                  {!compact && r.guest?.company ? <span className="block max-w-[14rem] truncate text-[0.72rem] text-navy-400">{r.guest.company}</span> : null}
                  {!compact && r.guest?.phone ? <span className="block text-[0.72rem] tabular-nums text-navy-400">{r.guest.phone}</span> : null}
                </td>
                <td className="td">
                  <span className="block font-medium text-navy-700">Apt {r.apartment?.number}</span>
                  <span className="block max-w-[11rem] truncate text-[0.74rem] text-navy-400">{r.apartment?.name}</span>
                </td>
                <td className="td whitespace-nowrap">
                  <span className="block text-[0.8rem] text-navy-700">{stay}</span>
                  <span className="block text-[0.72rem] text-navy-400">
                    {r.nights} night{r.nights === 1 ? '' : 's'} · {r.guestCount} guest{r.guestCount > 1 ? 's' : ''} ·{' '}
                    {r.checkIn < today ? 'in progress' : relativeDayLabel(r.checkIn, today)}
                  </span>
                </td>
                <td className="td text-[0.78rem] text-navy-500">{SOURCE_META[r.source]}</td>
                <td className="td">
                  <StatusChip className={BOOKING_STATUS_META[r.status].chip}>{BOOKING_STATUS_META[r.status].label}</StatusChip>
                </td>
                <td className="td">
                  <StatusChip className={PAYMENT_STATUS_META[r.paymentStatus].chip}>{PAYMENT_STATUS_META[r.paymentStatus].label}</StatusChip>
                  {r.pendingVerification > 0 ? <span className="mt-0.5 block text-[0.68rem] font-medium text-gold-700">{formatKwacha(r.pendingVerification)} unverified</span> : null}
                </td>
                <td className="td text-right tabular-nums">
                  <span className="font-semibold text-navy-800">{formatKwacha(r.totalAmount)}</span>
                  {!compact ? <span className="block text-[0.7rem] text-navy-400">{formatKwacha(r.nightlyRate)}/night</span> : null}
                </td>
                <td className="td text-right tabular-nums">
                  {r.balanceDue > 0 ? <span className="font-semibold text-st-cancelled">{formatKwacha(r.balanceDue)}</span> : <span className="text-st-available">settled</span>}
                </td>
                <td className="td text-right">
                  {linkToDetail ? (
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-[0.75rem] font-semibold text-teal-600 hover:underline"
                    >
                      Open folio
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function sortReservations(rows: ReservationView[], sort: { key: SortKey; dir: 'asc' | 'desc' }): ReservationView[] {
  const factor = sort.dir === 'asc' ? 1 : -1;
  const value = (r: ReservationView) => {
    switch (sort.key) {
      case 'guest':
        return r.guest?.fullName ?? '';
      case 'apartment':
        return r.apartment?.number ?? 0;
      case 'total':
        return r.totalAmount;
      case 'balance':
        return r.balanceDue;
      case 'status':
        return r.status;
      default:
        return r.checkIn;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
    return String(va).localeCompare(String(vb)) * factor;
  });
}
