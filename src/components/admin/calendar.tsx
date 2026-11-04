'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, BedDouble, CheckCircle2, ChevronRight, LogIn, LogOut, Plus, SprayCan, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { Alert, EmptyState, StatusChip } from '@/components/ui';
import { LegendSwatches } from '@/components/ui/charts';
import { Drawer } from '@/components/ui/overlays';
import { Segmented } from '@/components/ui/forms';
import { calendarFor, dayStatus } from '@/lib/domain/availability';
import { addISO, formatLongDate, formatMediumDate, monthRange, weekRange, eachISO, dayDiff, shiftMonth } from '@/lib/domain/dates';
import { formatKwacha } from '@/lib/domain/money';
import { BOOKING_STATUS_META, CALENDAR_LEGEND, CLEANING_STATUS_META, DAY_STATUS_META } from '@/lib/domain/status';
import type { CalendarCell, ReservationView } from '@/lib/domain/types';
import { useShell } from '@/components/admin/shell';
import { useReservationActions } from '@/components/admin/actions';
import type { SnapshotView } from '@/lib/view-types';

interface CellLike {
  date: string;
  status: CalendarCell['status'];
  reservationId: string | null;
  reservationRef: string | null;
  guestName: string | null;
  taskId: string | null;
}

export function CalendarBoard() {
  const { snapshot, request, can } = useApp();
  const shell = useShell();
  const actions = useReservationActions();
  const [view, setView] = useState<'month' | 'week' | 'day'>('week');
  const [anchor, setAnchor] = useState(() => snapshot?.today ?? new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<ReservationView | null>(null);
  const [filterApartments, setFilterApartments] = useState<string[]>([]);

  const today = snapshot?.today ?? '';
  const month = useMemo(() => monthRange(anchor), [anchor]);
  const week = useMemo(() => weekRange(anchor), [anchor]);

  const pool = useMemo(() => {
    if (!snapshot) return [];
    const ids = filterApartments.length ? filterApartments : snapshot.apartments.map((a) => a.id);
    return snapshot.apartments.filter((a) => ids.includes(a.id));
  }, [snapshot, filterApartments]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const source = calendarSource(snapshot);
    const from = view === 'month' ? month.gridStart : week.start;
    const to = view === 'month' ? month.gridEnd : week.end;
    const data = calendarFor(source, from, to, today, pool.map((a) => a.id));
    return pool.map((apartment) => ({
      apartment,
      cells: (data.find((d) => d.apartmentId === apartment.id)?.cells ?? []) as CellLike[],
    }));
  }, [snapshot, view, month, week, today, pool]);

  if (!snapshot) return null;

  const step = (direction: -1 | 1) => {
    if (view === 'month') setAnchor(shiftMonth(anchor, direction));
    else if (view === 'week') setAnchor(addISO(anchor, direction * 7));
    else setAnchor(addISO(anchor, direction));
  };

  const jumpToday = () => setAnchor(today);

  const title = view === 'month' ? month.label : view === 'week' ? `Week of ${week.label}` : formatLongDate(anchor);

  function openReservation(id: string | null) {
    if (!id) return;
    const r = snapshot!.reservations?.find((x) => x.id === id) ?? null;
    if (r) setSelected(r);
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => step(-1)} className="btn-secondary h-9 w-9 p-0" aria-label="Previous period">
            <ArrowLeft size={16} />
          </button>
          <button onClick={() => step(1)} className="btn-secondary h-9 w-9 p-0" aria-label="Next period">
            <ArrowRight size={16} />
          </button>
          <button onClick={jumpToday} className="btn-secondary h-9 px-3 text-[0.8rem]">
            Today
          </button>
          <h2 className="ml-2 font-display text-[1.1rem] text-navy-800">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Calendar view"
            value={view}
            onChange={(v) => setView(v)}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]}
          />
          <Link href="/admin/reservations" className="btn-secondary h-9 px-3 text-[0.8rem]">
            Register
          </Link>
          {can('reservations.create') ? (
            <button onClick={() => shell.openBooking()} className="btn-gold h-9 px-3 text-[0.8rem]">
              <Plus size={14} /> New booking
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LegendSwatches items={CALENDAR_LEGEND.map((l) => ({ label: l.label, className: DAY_STATUS_META[l.key].bg.replace('bg-', 'bg-') }))} />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterApartments(filterApartments.length ? [] : snapshot.apartments.filter((a) => a.tonightStatus !== 'available').map((a) => a.id))}
            className="btn-ghost h-8 px-2.5 text-[0.75rem]"
          >
            {filterApartments.length ? 'Show all apartments' : 'Hide fully-booked'}
          </button>
          <span className="text-[0.75rem] text-navy-400">
            {rows.length} apartment{rows.length === 1 ? '' : 's'} shown
          </span>
        </div>
      </div>

      {view === 'month' ? (
        <MonthGrid
          anchor={anchor}
          source={calendarSource(snapshot)}
          today={today}
          onPickDay={(d) => {
            setAnchor(d);
            setView('day');
          }}
        />
      ) : view === 'week' ? (
        <div className="min-w-0">
          <div className="space-y-3 xl:hidden">
            {rows.map(({ apartment, cells }) => (
              <section key={apartment.id} className="card p-3">
                <Link href={`/admin/apartments/${apartment.id}`} className="block font-semibold text-navy-800 hover:text-teal-600">
                  Apt {apartment.number} · {apartment.name}
                </Link>
                <p className="mb-2 text-[0.72rem] text-navy-400">{formatKwacha(apartment.nightlyRate)} · sleeps {apartment.maxGuests}</p>
                <div className="divide-y divide-sand-100">
                  {week.days.map((date) => {
                    const cell = cells.find((c) => c.date === date);
                    if (!cell) return null;
                    const meta = DAY_STATUS_META[cell.status] ?? DAY_STATUS_META.available;
                    return (
                      <div key={date} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[0.8rem]">
                        <button className="font-semibold text-navy-700 hover:underline" onClick={() => { setAnchor(date); setView('day'); }}>
                          {formatMediumDate(date)}{date === today ? ' · Today' : ''}
                        </button>
                        <button className={`rounded px-2 py-1 text-left ${meta.bg} ${meta.text}`} onClick={() => {
                          if (cell.reservationId) openReservation(cell.reservationId);
                          else if (can('reservations.create') && cell.status === 'available' && date >= today) shell.openBooking({ apartmentId: apartment.id, checkIn: date, checkOut: addISO(date, 2) });
                          else { setAnchor(date); setView('day'); }
                        }}>
                          {cell.guestName ? `${cell.guestName} · ${meta.label}` : meta.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="card hidden overflow-hidden xl:block">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50/80">
                  <th className="th w-[13.5rem] border-r border-sand-200 align-bottom">Apartment</th>
                  {week.days.map((d) => {
                    const isToday = d === today;
                    const dayRows = rows.map((r) => r.cells.find((c) => c.date === d));
                    const available = dayRows.filter((c) => c && (c.status === 'available' || (c.status as string) === 'past')).length;
                    return (
                      <th key={d} className={`th border-r border-sand-100 pb-2 align-bottom text-center last:border-r-0 ${isToday ? 'bg-gold-50/70' : ''}`}>
                        <button onClick={() => { setAnchor(d); setView('day'); }} className="w-full hover:text-navy-800">
                          <span className="block text-[0.66rem] uppercase tracking-wider text-navy-400">{new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                          <span className={`mt-0.5 block text-[0.95rem] font-bold ${isToday ? 'text-gold-600' : 'text-navy-800'}`}>{Number(d.slice(-2))}</span>
                          <span className="mt-0.5 block text-[0.62rem] font-medium normal-case tracking-normal text-navy-400">{available} free</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {rows.map(({ apartment, cells }) => (
                  <tr key={apartment.id} className="align-top">
                    <th scope="row" className="border-r border-sand-200 px-3 py-2 text-left align-middle">
                      <Link href={`/admin/apartments/${apartment.id}`} className="block hover:text-teal-600">
                        <span className="block text-[0.84rem] font-semibold text-navy-800">
                          Apt {apartment.number} · {apartment.name}
                        </span>
                        <span className="mt-0.5 block text-[0.7rem] text-navy-400">
                          {formatKwacha(apartment.nightlyRate)} · sleeps {apartment.maxGuests} ·{' '}
                          <span className={apartment.tonightStatus === 'available' ? 'text-st-available' : 'text-navy-500'}>{apartment.tonightStatus.replace(/_/g, ' ')}</span>
                        </span>
                      </Link>
                    </th>
                    {week.days.map((date) => {
                      const cell = cells.find((c) => c.date === date)!;
                      return (
                        <td key={date} className="border-r border-sand-100 p-1 last:border-r-0">
                          <WeekCell
                            cell={cell}
                            isToday={date === today}
                            onClick={() => (cell.reservationId ? openReservation(cell.reservationId) : can('reservations.create') && cell.status === 'available' && date >= today ? shell.openBooking({ apartmentId: apartment.id, checkIn: date, checkOut: addISO(date, 2) }) : undefined)}
                            onCheckIn={cell.status === 'reserved' ? () => { const r = snapshot.reservations?.find((x) => x.id === cell.reservationId); if (r) actions.confirm({ title: `Check in ${r.guest?.fullName}?`, body: 'Opening the folio from the calendar records arrival for tonight.', confirmLabel: 'Check guest in', run: () => actions.checkIn(r.id, r.guest?.fullName ?? 'Guest') }); } : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      ) : (
        <DayColumn
          date={anchor}
          onDate={(d) => setAnchor(d)}
          onOpen={openReservation}
          apartments={pool}
          canBook={can('reservations.create')}
          book={(apartmentId, date) => shell.openBooking({ apartmentId, checkIn: date, checkOut: addISO(date, 2) })}
        />
      )}

      <p className="text-[0.74rem] text-navy-400">
        Weeks start on Monday. A cell is <span className="font-semibold text-st-reserved">blue</span> while a stay is confirmed but the guest has not arrived,{' '}
        <span className="font-semibold text-st-occupied">purple</span> once they are in residence, and <span className="font-semibold text-st-cleaning">orange</span> when housekeeping holds the unit.
        Enquiries and cancellations never block a cell.
      </p>

      <ReservationPeekDrawer reservation={selected} onClose={() => setSelected(null)} />
      {actions.actions}
    </div>
  );
}

function calendarSource(snapshot: SnapshotView) {
  return {
    apartments: snapshot.apartments,
    reservations: snapshot.reservations ?? [],
    housekeeping: snapshot.housekeeping,
    cleaningState: snapshot.cleaningState,
    guests: snapshot.guests ?? [],
    settings: snapshot.settings,
  };
}

/* ---------------------------------------------------------------------- month grid */

function MonthGrid({
  anchor,
  source,
  today,
  onPickDay,
}: {
  anchor: string;
  source: ReturnType<typeof calendarSource>;
  today: string;
  onPickDay: (date: string) => void;
}) {
  const range = monthRange(anchor);
  const dates = eachISO(range.gridStart, range.gridEnd);
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

  const dayInfo = (date: string) => {
    const apartments = source.apartments;
    let occupied = 0;
    let reserved = 0;
    let available = 0;
    let cleaning = 0;
    const arrivals: { id: string; name: string }[] = [];
    const departures: { id: string; name: string }[] = [];
    for (const apartment of apartments) {
      const cell = dayStatus(source, apartment, date, today);
      if (cell.status === 'occupied') occupied += 1;
      else if (cell.status === 'reserved') reserved += 1;
      else if (cell.status === 'cleaning') {
        cleaning += 1;
        available += 0;
      } else if (cell.status === 'available' && date >= today) available += 1;
    }
    for (const r of source.reservations) {
      if (r.status === 'cancelled' || r.status === 'inquiry') continue;
      const guest = source.guests.find((g) => g.id === r.guestId)?.fullName ?? 'Guest';
      if (r.checkIn === date) arrivals.push({ id: r.id, name: guest });
      if (r.checkOut === date) departures.push({ id: r.id, name: guest });
    }
    const sellable = apartments.filter((a) => a.active && !a.outOfService).length;
    return {
      occupied,
      reserved,
      available,
      cleaning,
      arrivals,
      departures,
      rate: sellable ? Math.round(((occupied + reserved) / sellable) * 100) : 0,
    };
  };

  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-sand-100 sm:hidden">
        {weeks.flat().map((date) => {
          const info = dayInfo(date);
          return (
            <button key={date} onClick={() => onPickDay(date)} className={`block w-full px-3 py-2 text-left ${date === today ? 'bg-gold-50' : ''}`}>
              <span className="font-semibold text-navy-800">{formatMediumDate(date)}{date === today ? ' · Today' : ''}</span>
              <span className="block text-[0.75rem] text-navy-500">{info.rate}% occupied · {info.occupied} in · {info.cleaning} cleaning · {info.available} free</span>
              {info.arrivals.map((a) => <span key={`in-${a.id}`} className="block text-[0.75rem] text-st-reserved">Arrival: {a.name}</span>)}
              {info.departures.map((a) => <span key={`out-${a.id}`} className="block text-[0.75rem] text-navy-500">Departure: {a.name}</span>)}
            </button>
          );
        })}
      </div>
      <div className="hidden grid-cols-7 border-b border-sand-200 bg-sand-50/80 sm:grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-navy-400">
            {d}
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-7 sm:grid">
        {weeks.flat().map((date) => {
          const info = dayInfo(date);
          const inMonth = date.slice(0, 7) === anchor.slice(0, 7);
          const isToday = date === today;
          return (
            <button
              key={date}
              onClick={() => onPickDay(date)}
              className={`min-h-[7.2rem] border-b border-r border-sand-100 p-1.5 text-left transition hover:bg-sand-50 ${
                inMonth ? 'bg-white' : 'bg-sand-50/60'
              } ${isToday ? 'ring-2 ring-inset ring-gold-300' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[0.8rem] font-bold ${isToday ? 'text-gold-600' : inMonth ? 'text-navy-800' : 'text-sand-400'}`}>{Number(date.slice(-2))}</span>
                <span className={`rounded px-1 py-px text-[0.62rem] font-bold tabular-nums ${info.rate >= 80 ? 'bg-st-occupied/10 text-st-occupied' : info.rate >= 50 ? 'bg-st-reserved/10 text-st-reserved' : 'bg-sand-100 text-navy-400'}`}>
                  {info.rate}%
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {info.arrivals.slice(0, 2).map((a) => (
                  <p key={`in-${a.id}`} className="flex items-center gap-1 truncate rounded bg-st-reservedBg px-1 py-px text-[0.66rem] font-medium text-st-reserved">
                    <LogIn size={9} className="shrink-0" /> {a.name}
                  </p>
                ))}
                {info.departures.slice(0, 2).map((a) => (
                  <p key={`out-${a.id}`} className="flex items-center gap-1 truncate rounded bg-sand-100 px-1 py-px text-[0.66rem] font-medium text-navy-500">
                    <LogOut size={9} className="shrink-0" /> {a.name}
                  </p>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold">
                {info.occupied ? <span className="rounded bg-st-occupiedBg px-1 py-px text-st-occupied">{info.occupied} in</span> : null}
                {info.cleaning ? <span className="flex items-center gap-0.5 rounded bg-st-cleaningBg px-1 py-px text-st-cleaning"><SprayCan size={8} />{info.cleaning}</span> : null}
                {info.available ? <span className="rounded bg-st-availableBg px-1 py-px text-st-available">{info.available} free</span> : <span className="rounded bg-sand-100 px-1 py-px text-navy-400">full</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ week cell */

function WeekCell({ cell, isToday, onClick, onCheckIn }: { cell: CellLike; isToday: boolean; onClick?: () => void; onCheckIn?: () => void }) {
  const meta = DAY_STATUS_META[cell.status] ?? DAY_STATUS_META.available;
  const hasBooking = !!cell.reservationId;
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`block h-11 w-full rounded-md px-1.5 py-1 text-left transition ${meta.bg} ${hasBooking ? 'cursor-pointer' : 'cursor-default'} ${
          isToday ? 'ring-1 ring-gold-300' : ''
        } ${cell.status === 'available' ? 'hover:bg-gold-50 hover:ring-1 hover:ring-gold-300' : ''}`}
        title={cell.guestName ? `${cell.guestName} · ${meta.label}` : meta.label}
      >
        <span className={`block truncate text-[0.72rem] font-semibold ${meta.text}`}>
          {cell.guestName ?? (cell.status === 'cleaning' ? 'Housekeeping' : cell.status === 'maintenance' ? 'Maintenance' : cell.status === 'out_of_service' ? 'Off market' : cell.status === 'past' ? '' : 'Available')}
        </span>
        <span className="mt-0.5 flex items-center gap-1">
          {cell.status === 'reserved' ? <span className="rounded bg-white/70 px-1 text-[0.6rem] font-bold uppercase text-st-reserved">arrives</span> : null}
          {cell.status === 'occupied' ? <span className="rounded bg-white/70 px-1 text-[0.6rem] font-bold uppercase text-st-occupied">in house</span> : null}
          {cell.status === 'cancelled' ? <span className="rounded bg-white/70 px-1 text-[0.6rem] font-bold uppercase text-st-cancelled">cancelled</span> : null}
        </span>
      </button>
      {onCheckIn ? (
        <button
          onClick={onCheckIn}
          className="absolute right-1 top-1 hidden rounded bg-white/90 px-1 py-0.5 text-[0.6rem] font-bold text-st-reserved shadow-sm ring-1 ring-st-reserved/20 group-hover:block"
        >
          Check in
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ day column */

function DayColumn({
  date,
  onDate,
  onOpen,
  apartments,
  canBook,
  book,
}: {
  date: string;
  onDate: (d: string) => void;
  onOpen: (id: string | null) => void;
  apartments: SnapshotView['apartments'];
  canBook: boolean;
  book: (apartmentId: string, date: string) => void;
}) {
  const { snapshot } = useApp();
  if (!snapshot) return null;
  const source = calendarSource(snapshot);
  const tasks = snapshot.housekeeping.filter((t) => t.date === date);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 bg-sand-50/70 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => onDate(addISO(date, -1))} className="btn-secondary h-8 w-8 p-0" aria-label="Previous day">
              <ArrowLeft size={14} />
            </button>
            <p className="px-1 text-[0.86rem] font-semibold text-navy-800">{formatLongDate(date)}</p>
            <button onClick={() => onDate(addISO(date, 1))} className="btn-secondary h-8 w-8 p-0" aria-label="Next day">
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem]">
            {(['available', 'reserved', 'occupied', 'cleaning', 'maintenance'] as const).map((k) => {
              const count = apartments.filter((a) => dayStatus(source, a, date, snapshot.today).status === k).length;
              return (
                <span key={k} className={`rounded px-1.5 py-0.5 font-semibold ${DAY_STATUS_META[k].bg} ${DAY_STATUS_META[k].text}`}>
                  {count} {k.replace('_', ' ')}
                </span>
              );
            })}
          </div>
        </div>
        <ul className="divide-y divide-sand-100">
          {apartments.map((apartment) => {
            const cell = dayStatus(source, apartment, date, snapshot.today);
            const meta = DAY_STATUS_META[cell.status];
            const reservation = cell.reservationId ? snapshot.reservations?.find((r) => r.id === cell.reservationId) : null;
            const task = cell.taskId ? snapshot.housekeeping.find((t) => t.id === cell.taskId) : null;
            return (
              <li key={apartment.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className={`h-9 w-1.5 shrink-0 rounded-full ${meta.bg}`} aria-hidden />
                <div className="w-full min-w-0 sm:w-[11rem] sm:shrink-0">
                  <p className="text-[0.84rem] font-semibold text-navy-800">
                    Apt {apartment.number} · {apartment.name}
                  </p>
                  <p className="text-[0.72rem] text-navy-400">
                    {formatKwacha(apartment.nightlyRate)} · sleeps {apartment.maxGuests} · {apartment.bedrooms || 'studio'} bed
                  </p>
                </div>
                <div className="min-w-0 w-full sm:flex-1">
                  {reservation ? (
                    <button onClick={() => onOpen(reservation.id)} className="group flex w-full flex-wrap items-center gap-2 text-left">
                      <span className="min-w-0">
                        <span className="block text-[0.83rem] font-medium text-navy-700 group-hover:text-teal-600">
                          {cell.guestName} · {reservation.nights}N · {formatKwacha(reservation.totalAmount)}
                        </span>
                        <span className="block text-[0.7rem] text-navy-400">
                          {formatMediumDate(reservation.checkIn)} → {formatMediumDate(reservation.checkOut)} ·{' '}
                          {dayDiff(date, reservation.checkOut) === 1 ? 'departs tomorrow' : dayDiff(date, reservation.checkOut) === 0 ? 'departs today' : `${dayDiff(date, reservation.checkOut)} nights remaining`}
                        </span>
                      </span>
                      <StatusChip className={`${meta.bg} ${meta.text} shrink-0`}>{meta.label}</StatusChip>
                      <ChevronRight size={14} className="shrink-0 text-navy-300 group-hover:text-teal-600" />
                    </button>
                  ) : task ? (
                    <p className="flex items-center gap-1.5 text-[0.8rem] text-navy-600">
                      {task.status === 'maintenance' ? <Wrench size={13} className="text-st-cancelled" /> : <SprayCan size={13} className="text-st-cleaning" />}
                      {CLEANING_STATUS_META[task.status].label}
                      {task.assignedTo ? ` · ${snapshot.staff.find((s) => s.id === task.assignedTo)?.name ?? 'unassigned'}` : ' · unassigned'}
                      {task.instructions ? <span className="truncate text-navy-400">— {task.instructions}</span> : null}
                    </p>
                  ) : cell.status === 'available' ? (
                    <p className="flex flex-wrap items-center gap-2 text-[0.8rem] text-st-available">
                      <CheckCircle2 size={13} /> Vacant{date < snapshot.today ? ' (past)' : ' and clean'}
                      {canBook && date >= snapshot.today ? (
                        <button onClick={() => book(apartment.id, date)} className="btn-secondary btn-sm">
                          <Plus size={12} /> Book this night
                        </button>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[0.8rem] text-navy-400">
                      <BedDouble size={13} className="mr-1 inline" /> {apartment.active ? 'Not held for this date' : 'Deactivated'}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="card p-4">
          <p className="label mb-2">Arrivals on {formatMediumDate(date)}</p>
          <MovementList rows={(snapshot.reservations ?? []).filter((r) => r.checkIn === date && r.status !== 'cancelled' && r.status !== 'inquiry')} onOpen={onOpen} kind="in" />
        </div>
        <div className="card p-4">
          <p className="label mb-2">Departures on {formatMediumDate(date)}</p>
          <MovementList rows={(snapshot.reservations ?? []).filter((r) => r.checkOut === date && r.status !== 'cancelled' && r.status !== 'inquiry')} onOpen={onOpen} kind="out" />
        </div>
        <div className="card p-4">
          <p className="label mb-2">Housekeeping on {formatMediumDate(date)}</p>
          {tasks.length ? (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-sand-200 px-2.5 py-2 text-[0.78rem]">
                  <p className="font-semibold text-navy-800">
                    Apt {t.apartmentNumber} · {t.apartmentName}
                  </p>
                  <p className="mt-0.5 text-navy-500">
                    {CLEANING_STATUS_META[t.status].label} · due {t.dueTime} · {t.assignedToName ?? 'unassigned'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={SprayCan} title="No jobs scheduled" body="Nothing is booked to be cleaned on this date." />
          )}
        </div>
        {!apartments.length ? <Alert tone="warn">No apartments selected — clear the filter to see the building.</Alert> : null}
      </div>
    </div>
  );
}

function MovementList({ rows, onOpen, kind }: { rows: ReservationView[]; onOpen: (id: string | null) => void; kind: 'in' | 'out' }) {
  const { snapshot } = useApp();
  if (!rows.length) return <p className="text-[0.78rem] text-navy-400">Nothing due.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id}>
          <button onClick={() => onOpen(r.id)} className="flex w-full items-center gap-2 rounded-lg border border-sand-200 px-2.5 py-1.5 text-left hover:border-sand-400">
            {kind === 'in' ? <LogIn size={13} className="shrink-0 text-st-reserved" /> : <LogOut size={13} className="shrink-0 text-navy-400" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8rem] font-semibold text-navy-800">{r.guest?.fullName}</span>
              <span className="block truncate text-[0.7rem] text-navy-400">
                Apt {r.apartment?.number} · {r.nights}N · {r.arrivalTime && kind === 'in' ? `arriving ${r.arrivalTime}` : `by ${snapshot?.settings.booking.checkOutTime}`}
              </span>
            </span>
            <StatusChip className={BOOKING_STATUS_META[r.status].chip}>{BOOKING_STATUS_META[r.status].label}</StatusChip>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------- peek drawer */

function ReservationPeekDrawer({ reservation, onClose }: { reservation: ReservationView | null; onClose: () => void }) {
  const { can } = useApp();
  const actions = useReservationActions();
  if (!reservation) return null;
  const r = reservation;
  return (
    <Drawer
      open={!!reservation}
      onClose={onClose}
      title={r.guest?.fullName ?? 'Reservation'}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.76rem]">{r.reference}</span>
          <StatusChip className={BOOKING_STATUS_META[r.status].chip}>{BOOKING_STATUS_META[r.status].label}</StatusChip>
        </span>
      }
      footer={
        <>
          {can('reservations.checkin') && r.canCheckIn ? (
            <button className="btn-gold h-10 px-4" onClick={() => actions.checkIn(r.id, r.guest?.fullName ?? 'Guest')}>
              Check in now
            </button>
          ) : null}
          <Link href={`/admin/reservations/${r.id}`} className="btn-primary h-10 px-4" onClick={onClose}>
            Open full folio
          </Link>
        </>
      }
    >
      <div className="space-y-4 text-[0.85rem]">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Apartment" value={`Apt ${r.apartment?.number} — ${r.apartment?.name}`} />
          <Field label="Stay" value={`${formatMediumDate(r.checkIn)} → ${formatMediumDate(r.checkOut)} · ${r.nights}N`} />
          <Field label="Rate" value={`${formatKwacha(r.nightlyRate)} per night`} />
          <Field label="Total" value={formatKwacha(r.totalAmount)} />
          <Field label="Verified banked" value={formatKwacha(r.verifiedPaid)} />
          <Field label="Balance" value={formatKwacha(r.balanceDue)} tone={r.balanceDue ? 'bad' : 'good'} />
        </div>
        {r.pendingVerification ? <Alert tone="warn" title="Receipt awaiting verification">{formatKwacha(r.pendingVerification)} has been entered with proof but not signed off; the balance above does not count it.</Alert> : null}
        {r.guest ? (
          <div className="rounded-lg border border-sand-200 p-3">
            <p className="label mb-1">Guest</p>
            <p className="font-semibold text-navy-800">{r.guest.fullName}</p>
            <p className="text-[0.8rem] text-navy-500">{r.guest.phone} · {r.guest.email || 'no email'}</p>
            {r.guest.specialRequests ? <p className="mt-1.5 text-[0.78rem] text-gold-700">Standing request: {r.guest.specialRequests}</p> : null}
          </div>
        ) : null}
        {r.notes ? (
          <div>
            <p className="label mb-1">Desk notes</p>
            <p className="whitespace-pre-line rounded-lg bg-sand-100/60 p-2.5 text-[0.82rem] leading-relaxed text-navy-600">{r.notes}</p>
          </div>
        ) : null}
        <div>
          <p className="label mb-1.5">Last activity</p>
          <ul className="space-y-1.5 text-[0.78rem] text-navy-500">
            {r.history.slice(0, 4).map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0"><span className="font-semibold text-navy-700">{h.label}</span>{h.detail ? ` · ${h.detail}` : ''}</span>
                <span className="shrink-0 text-navy-400">{new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="rounded-lg border border-sand-200 px-2.5 py-2">
      <p className="label">{label}</p>
      <p className={`mt-0.5 font-semibold ${tone === 'bad' ? 'text-st-cancelled' : tone === 'good' ? 'text-st-available' : 'text-navy-800'}`}>{value}</p>
    </div>
  );
}
