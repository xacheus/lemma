'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BedDouble,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  DoorOpen,
  LogIn,
  LogOut,
  Percent,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, EmptyState, Panel, Skeleton, StatusChip } from '@/components/ui';
import { AreaChart, BarChart } from '@/components/ui/charts';
import { useShell } from '@/components/admin/shell';
import { balanceNote, useReservationActions } from '@/components/admin/actions';
import { formatKwacha, percent as pct } from '@/lib/domain/money';
import { BOOKING_STATUS_META, CLEANING_STATUS_META, PAYMENT_METHOD_META, PAYMENT_STATUS_META } from '@/lib/domain/status';
import { formatMediumDate, relativeDayLabel } from '@/lib/domain/dates';

export default function DashboardPage() {
  const { snapshot, status } = useApp();
  const shell = useShell();
  const actions = useReservationActions();
  const metrics = snapshot?.metrics ?? null;
  const [clock, setClock] = useState<string>('');

  // Reception looks at this screen first thing, so show the property's own clock.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lusaka', hour: '2-digit', minute: '2-digit' }).format(new Date()),
      );
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const revenueDelta = useMemo(() => {
    if (!metrics) return null;
    if (!metrics.priorMonthToDate) return null;
    return Math.round(((metrics.monthRevenue - metrics.priorMonthToDate) / metrics.priorMonthToDate) * 100);
  }, [metrics]);

  if (status === 'loading' || !snapshot || !metrics) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[6.5rem]" />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const snap = metrics.snapshot;
  const cleaningRows = metrics.needsCleaning;
  const occupancyTrend = metrics.occupancySeries.map((p) => ({ label: p.label.split(' ')[0], value: p.rate, detail: `${p.occupied}/${p.sellable} nights` }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Good day, ${snapshot.user.name.split(' ')[0]}`}
        description={
          <>
            {snapshot.today === metrics.today ? 'Today at the property' : `Position as at ${formatMediumDate(metrics.today)}`} · reception time {clock || '—'} ·{' '}
            {metrics.arrivalsThisMonth} arrivals booked this month, {metrics.cancellationsThisMonth} cancelled.
          </>
        }
        actions={
          <>
            <Link href="/admin/calendar" className="btn-secondary h-10 px-4">
              <CalendarDays size={15} /> Booking calendar
            </Link>
            <button onClick={() => shell.openBooking()} className="btn-primary h-10 px-4">
              New booking
            </button>
          </>
        }
      />

      {metrics.pendingVerification > 0 || metrics.openMaintenance > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {metrics.pendingVerification > 0 ? (
            <Link href="/admin/payments?filter=pending">
              <Alert tone="warn" title={`${formatKwacha(metrics.pendingVerification)} recorded but not verified`}>
                {snapshot.payments?.filter((p) => p.verificationStatus === 'pending').length ?? 0} receipt(s) are waiting on an authorised sign-off. Guests are not treated as paid until then.
              </Alert>
            </Link>
          ) : null}
          {metrics.openMaintenance > 0 ? (
            <Link href="/admin/housekeeping?filter=maintenance">
              <Alert tone="error" title={`${metrics.openMaintenance} maintenance hold open`}>
                Affected apartments are blocked to new bookings until housekeeping signs them off.
              </Alert>
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BedDouble} label="Total apartments" value={String(snap.total)} foot={
            <span>
              <Link href="/admin/apartments" className="font-semibold text-teal-600 hover:underline">
                Manage inventory
              </Link>{' '}
              · {snapshot.apartments.filter((a) => !a.active).length} inactive
            </span>
          } href="/admin/apartments" />
        <StatCard icon={DoorOpen} label="Occupied tonight" value={String(snap.occupied)} tone="occupied" foot={`${pct(snap.occupied, snap.sellable)}% of ${snap.sellable} sellable units`} href="/admin/reservations?status=checked_in" />
        <StatCard icon={BadgeCheck} label="Available tonight" value={String(snap.available)} tone="available" foot={snap.available ? 'Ready to sell — all cleaned and inspected' : 'Nothing to sell for tonight'} href="/admin/calendar" />
        <StatCard icon={Sparkles} label="Awaiting cleaning" value={String(snap.cleaning)} tone="cleaning" foot={cleaningRows.length ? cleaningRows.map((c) => `Apt ${c.apartmentNumber}`).join(', ') : 'Every unit is signed off'} href="/admin/housekeeping" />

        <StatCard icon={LogIn} label="Today's check-ins" value={String(metrics.checkInsToday.length)} foot={metrics.checkInsToday.filter((r) => r.status === 'checked_in').length + ' already arrived'} href="/admin/reservations?arrivals=today" accent={<CalendarClock size={14} className="text-navy-300" />} />
        <StatCard icon={LogOut} label="Today's check-outs" value={String(metrics.checkOutsToday.length)} foot={metrics.checkOutsToday.filter((r) => r.status === 'checked_in').length + ' still in house'} href="/admin/reservations?departures=today" />
        <StatCard
          icon={CircleDollarSign}
          label={`Revenue banked · ${new Date(metrics.today).toLocaleDateString('en-GB', { month: 'long' })}`}
          value={formatKwacha(metrics.monthRevenue)}
          tone="money"
          foot={
            revenueDelta === null ? (
              `Day ${metrics.daysElapsedInMonth} of ${metrics.daysInMonth}`
            ) : (
              <span className={revenueDelta >= 0 ? 'text-st-available' : 'text-st-cancelled'}>
                {revenueDelta >= 0 ? <TrendingUp size={12} className="mr-1 inline" /> : <TrendingDown size={12} className="mr-1 inline" />}
                {revenueDelta >= 0 ? '+' : ''}
                {revenueDelta}% vs the same days last month ({formatKwacha(metrics.priorMonthToDate)})
              </span>
            )
          }
          href="/admin/reports"
        />
        <StatCard
          icon={Percent}
          label={`Occupancy · ${new Date(metrics.today).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}
          value={`${metrics.monthOccupancyRate}%`}
          tone="teal"
          foot={`${metrics.nightsSoldMonth} of ${metrics.roomNightsAvailableMonth} room-nights on the books`}
          href="/admin/reports"
          progress={metrics.monthOccupancyRate}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Revenue banked — last 14 days"
          subtitle="Verified receipts only: mobile money, EFT and cash counted at the desk, net of refunds."
          action={
            <Link href="/admin/reports" className="btn-secondary btn-sm">
              Full reports <ArrowRight size={13} />
            </Link>
          }
        >
          <AreaChart data={metrics.revenueDaily.map((d) => ({ label: d.label, value: d.value, sub: `${d.weekday} ${d.label}` }))} format={(n) => formatKwacha(n)} />
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-sand-200 pt-3 text-[0.78rem]">
            <Metric label="This month" value={formatKwacha(metrics.monthRevenue)} />
            <Metric label="Awaiting verification" value={formatKwacha(metrics.pendingVerification)} tone={metrics.pendingVerification ? 'warn' : undefined} />
            <Metric label="Outstanding balances" value={`${formatKwacha(metrics.outstandingTotal)} · ${metrics.outstandingCount} folios`} tone={metrics.outstandingCount ? 'warn' : undefined} />
          </div>
        </Panel>

        <Panel title="Occupancy by month" subtitle="Room-nights on the books divided by room-nights available.">
          <BarChart data={occupancyTrend} />
          <p className="mt-3 border-t border-sand-200 pt-3 text-[0.78rem] text-navy-500">
            The property holds {snap.sellable} sellable apartments. A month at 100% would be {formatKwacha(snapshot.apartments.reduce((s, a) => s + a.nightlyRate, 0) * metrics.daysInMonth)} of accommodation
            revenue at today's rack rates.
          </p>
        </Panel>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Panel
          title="Arrivals today"
          subtitle={`${metrics.checkInsToday.length} guest${metrics.checkInsToday.length === 1 ? '' : 's'} expected`}
          icon={LogIn}
          action={
            <Link href="/admin/reservations?arrivals=today" className="text-[0.75rem] font-semibold text-teal-600 hover:underline">
              All
            </Link>
          }
        >
          {metrics.checkInsToday.length ? (
            <ul className="divide-y divide-sand-100">
              {metrics.checkInsToday.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/reservations/${r.id}`} className="text-[0.85rem] font-semibold text-navy-800 hover:text-teal-600">
                      {r.guest?.fullName}
                    </Link>
                    <p className="mt-0.5 text-[0.75rem] text-navy-400">
                      Apt {r.apartment?.number} · {r.nights}N · arrives {r.arrivalTime} · {r.guestCount} guest{r.guestCount > 1 ? 's' : ''}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusChip className={PAYMENT_STATUS_META[r.paymentStatus].chip}>{PAYMENT_STATUS_META[r.paymentStatus].label}</StatusChip>
                      {r.balanceDue > 0 ? <span className="text-[0.72rem] font-semibold text-st-cancelled">{formatKwacha(r.balanceDue)} due</span> : null}
                      {r.pendingVerification > 0 ? <span className="text-[0.72rem] text-gold-700">{formatKwacha(r.pendingVerification)} unverified</span> : null}
                    </p>
                  </div>
                  {r.canCheckIn ? (
                    <button
                      className="btn-secondary btn-sm shrink-0"
                      onClick={() =>
                        actions.confirm({
                          title: `Check in ${r.guest?.fullName}?`,
                          body: (
                            <>
                              <p>
                                This opens the folio for Apt {r.apartment?.number} and records arrival at {r.arrivalTime}.
                              </p>
                              <p className="mt-2">{balanceNote(r.balanceDue)}</p>
                            </>
                          ),
                          confirmLabel: 'Check guest in',
                          run: () => actions.checkIn(r.id, r.guest?.fullName ?? 'Guest'),
                        })
                      }
                    >
                      Check in
                    </button>
                  ) : (
                    <StatusChip className={BOOKING_STATUS_META[r.status].chip}>{BOOKING_STATUS_META[r.status].label}</StatusChip>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={LogIn} title="No arrivals today" body="Nothing is scheduled to arrive. New website requests appear here as soon as they are submitted." />
          )}
        </Panel>

        <Panel
          title="Departures today"
          subtitle={`${metrics.checkOutsToday.length} to close`}
          icon={LogOut}
          action={
            <Link href="/admin/reservations?departures=today" className="text-[0.75rem] font-semibold text-teal-600 hover:underline">
              All
            </Link>
          }
        >
          {metrics.checkOutsToday.length ? (
            <ul className="divide-y divide-sand-100">
              {metrics.checkOutsToday.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/reservations/${r.id}`} className="text-[0.85rem] font-semibold text-navy-800 hover:text-teal-600">
                      {r.guest?.fullName}
                    </Link>
                    <p className="mt-0.5 text-[0.75rem] text-navy-400">
                      Apt {r.apartment?.number} · {r.nights}N · check-out by {snapshot.settings.booking.checkOutTime}
                    </p>
                    {r.balanceDue > 0 ? <p className="mt-1 text-[0.72rem] font-semibold text-st-cancelled">{formatKwacha(r.balanceDue)} still owing</p> : null}
                  </div>
                  {r.status === 'checked_in' ? <StatusChip className={BOOKING_STATUS_META.checked_in.chip}>In house</StatusChip> : <StatusChip className={BOOKING_STATUS_META.checked_out.chip}>Closed</StatusChip>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={LogOut} title="No departures today" body="Nobody is due to check out, so nothing needs a turnover this morning." />
          )}
        </Panel>

        <Panel
          title="Housekeeping queue"
          subtitle="Apartments not yet ready to sell"
          icon={Sparkles}
          action={
            <Link href="/admin/housekeeping" className="text-[0.75rem] font-semibold text-teal-600 hover:underline">
              Rota
            </Link>
          }
        >
          {cleaningRows.length ? (
            <ul className="space-y-2.5">
              {cleaningRows.map((row) => (
                <li key={row.apartmentId} className="rounded-lg border border-sand-200 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/apartments/${row.apartmentId}`} className="text-[0.84rem] font-semibold text-navy-800 hover:text-teal-600">
                      Apt {row.apartmentNumber} · {row.apartmentName}
                    </Link>
                    <StatusChip className={CLEANING_STATUS_META[(row.status as keyof typeof CLEANING_STATUS_META) ?? 'needs_cleaning'].chip}>
                      {CLEANING_STATUS_META[(row.status as keyof typeof CLEANING_STATUS_META) ?? 'needs_cleaning'].label}
                    </StatusChip>
                  </div>
                  <p className="mt-1 text-[0.74rem] leading-snug text-navy-500">
                    {row.status === 'maintenance' ? (
                      <>
                        <Wrench size={11} className="mr-1 inline text-st-cancelled" /> Maintenance hold — blocked to new bookings
                      </>
                    ) : row.assignedToName ? (
                      <>Assigned to {row.assignedToName} · due {row.dueTime}</>
                    ) : (
                      <>Not yet assigned · due {row.dueTime}</>
                    )}
                    {row.guestName ? <span className="text-navy-400"> · {row.guestName} departed</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BadgeCheck} title="Every apartment is clean" body="Housekeeping has signed off all units, so the whole building can be sold." />
          )}
        </Panel>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <Panel
          title="Next seven days"
          subtitle="Confirmed arrivals only — enquiries and cancellations are excluded"
          icon={CalendarDays}
          action={
            <Link href="/admin/calendar" className="btn-secondary btn-sm">
              Calendar
            </Link>
          }
        >
          {metrics.upcoming.length ? (
            <table className="w-full text-[0.82rem]">
              <thead>
                <tr className="border-b border-sand-200 text-left">
                  <th className="th pb-2">Arrival</th>
                  <th className="th pb-2">Guest</th>
                  <th className="th pb-2">Apartment</th>
                  <th className="th pb-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {metrics.upcoming.map((r) => (
                  <tr key={r.id} className="row-hover">
                    <td className="td">
                      <Link href={`/admin/reservations/${r.id}`} className="font-semibold text-navy-800 hover:text-teal-600">
                        {relativeDayLabel(r.checkIn, snapshot.today)}
                      </Link>
                      <span className="block text-[0.72rem] text-navy-400">{formatMediumDate(r.checkIn)} · {r.nights}N</span>
                    </td>
                    <td className="td">{r.guest?.fullName}</td>
                    <td className="td text-navy-500">Apt {r.apartment?.number}</td>
                    <td className="td text-right tabular-nums">
                      {r.balanceDue > 0 ? <span className="font-semibold text-navy-800">{formatKwacha(r.balanceDue)}</span> : <span className="text-st-available">settled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={CalendarDays} title="Nothing arriving in the next week" body="The forward calendar is quiet — a good moment for the corporate rate push." />
          )}
        </Panel>

        <Panel
          title="Recent payments"
          subtitle="Newest receipts first, whether or not they are verified"
          icon={CircleDollarSign}
          action={
            <Link href="/admin/payments" className="text-[0.75rem] font-semibold text-teal-600 hover:underline">
              Ledger
            </Link>
          }
        >
          {metrics.recentPayments.length ? (
            <ul className="divide-y divide-sand-100">
              {metrics.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className={`h-8 w-1 shrink-0 rounded-full ${p.verificationStatus === 'verified' ? 'bg-st-available' : p.verificationStatus === 'rejected' ? 'bg-st-cancelled' : 'bg-gold-400'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.82rem] font-semibold text-navy-800">{p.guestName}</span>
                    <span className="block truncate text-[0.72rem] text-navy-400">
                      {PAYMENT_METHOD_META[p.method].label} · {p.reference} · {relativeDayLabel(p.paidAt, snapshot.today)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-[0.85rem] font-bold tabular-nums ${p.kind === 'refund' ? 'text-st-cancelled' : 'text-navy-800'}`}>
                      {p.kind === 'refund' ? '−' : ''}
                      {formatKwacha(p.amount)}
                    </span>
                    <span className="block text-[0.68rem] uppercase tracking-wide text-navy-400">{p.verificationStatus === 'verified' ? 'verified' : p.verificationStatus}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CircleDollarSign} title="No receipts recorded yet" body="Payments entered at the desk land here the moment they are saved." />
          )}
        </Panel>
      </section>

      {actions.actions}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  foot,
  href,
  tone = 'navy',
  accent,
  progress,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  foot?: React.ReactNode;
  href?: string;
  tone?: 'navy' | 'available' | 'occupied' | 'cleaning' | 'money' | 'teal';
  accent?: React.ReactNode;
  progress?: number;
}) {
  const accentBar = {
    navy: 'bg-navy-200',
    available: 'bg-st-available',
    occupied: 'bg-st-occupied',
    cleaning: 'bg-st-cleaning',
    money: 'bg-gold-400',
    teal: 'bg-teal-500',
  }[tone];
  const inner = (
    <div className="card relative flex h-full flex-col overflow-hidden p-4 text-left transition hover:border-sand-400 hover:shadow-pop">
      <span className={`absolute inset-x-0 top-0 h-[3px] ${accentBar}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="label leading-tight">{label}</p>
        <Icon size={15} className="mt-px shrink-0 text-navy-300" />
      </div>
      <p className="mt-1.5 font-display text-[1.7rem] leading-none tracking-tight text-navy-800 tnum">{value}</p>
      {typeof progress === 'number' ? (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-sand-200">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      ) : null}
      <div className="mt-auto pt-2 text-[0.74rem] leading-snug text-navy-400">
        {foot}
        {accent}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`mt-1 text-[0.9rem] font-semibold tabular-nums ${tone === 'warn' ? 'text-gold-700' : 'text-navy-800'}`}>{value}</p>
    </div>
  );
}
