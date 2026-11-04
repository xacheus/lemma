'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarPlus,
  Check,
  Layers,
  Maximize,
  Pencil,
  Ruler,
  ShieldAlert,
  Image as ImageIcon,
  SprayCan,
  Users,
  Wrench,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader, useShell } from '@/components/admin/shell';
import { Alert, EmptyState, Panel, Progress, Skeleton, StatusChip } from '@/components/ui';
import { PhotoStrip } from '@/components/ui/photo';
import { ApartmentEditor } from '@/components/admin/apartment-editor';
import { formatKwacha, formatKwachaCompact, percent } from '@/lib/domain/money';
import { formatDateWithWeekday, formatDateTime, formatMediumDate, dayDiff, addISO } from '@/lib/domain/dates';
import { APARTMENT_TIER_LABELS, BOOKING_STATUS_META, CLEANING_STATUS_META, DAY_STATUS_META } from '@/lib/domain/status';
import type { PermissionKey } from '@/lib/domain/types';

export default function ApartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { snapshot, request, toast, can } = useApp();
  const shell = useShell();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const apartment = snapshot?.apartments.find((a) => a.id === id) ?? null;

  const stays = useMemo(() => {
    if (!snapshot || !apartment) return [];
    return (snapshot.reservations ?? [])
      .filter((r) => r.apartmentId === apartment.id)
      .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
  }, [snapshot, apartment]);

  const tasks = useMemo(
    () => (snapshot && apartment ? snapshot.housekeeping.filter((t) => t.apartmentId === apartment.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [snapshot, apartment],
  );

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!apartment)
    return (
      <div className="space-y-4">
        <PageHeader title="Apartment not found" crumbs={[{ label: 'Apartments', href: '/admin/apartments' }]} />
        <EmptyState
          title="No apartment with that identifier"
          body="It may have been removed from the inventory. Return to the apartment list to open a live unit."
          action={
            <Link href="/admin/apartments" className="btn-secondary h-9 px-3.5 text-[0.82rem]">
              Back to apartments
            </Link>
          }
        />
      </div>
    );

  const meta = DAY_STATUS_META[apartment.tonightStatus];
  const cleaning = snapshot.cleaningState[apartment.id];
  const openTask = tasks.find((t) => t.status !== 'clean');
  const lifetimeRevenue = stays
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.verifiedPaid, 0);
  const occupancy30 = percent(apartment.nightsLast30, 30);
  const futureStays = stays.filter((r) => r.status !== 'cancelled' && r.checkOut >= snapshot.today).length;

  async function toggleService() {
    if (!apartment) return;
    setBusy(true);
    try {
      await request(`/api/apartments/${apartment.id}`, { method: 'PATCH', data: { outOfService: !apartment.outOfService } });
      toast({
        tone: 'success',
        title: apartment.outOfService ? 'Hold lifted' : 'Unit out of service',
        body: apartment.outOfService
          ? `Apt ${apartment.number} is sellable again from tonight.`
          : `Apt ${apartment.number} no longer appears in availability searches until the hold is lifted.`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Change refused', body: err instanceof Error ? err.message : 'Try again after clearing future bookings.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: 'Apartments', href: '/admin/apartments' }, { label: `Apt ${apartment.number}` }]}
        title={`Apartment ${apartment.number} — ${apartment.name}`}
        description={apartment.tagline || `${APARTMENT_TIER_LABELS[apartment.tier]} · ${apartment.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/calendar" className="btn-secondary h-9 px-3 text-[0.82rem]">
              <ArrowLeft size={14} /> Calendar
            </Link>
            {can('apartments.manage') ? (
              <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
            ) : null}
            {can('reservations.create') ? (
              <button
                type="button"
                className="btn-gold h-9 px-3 text-[0.82rem]"
                onClick={() =>
                  shell.openBooking({
                    apartmentId: apartment.id,
                    checkIn: apartment.nextFreeFrom && apartment.nextFreeFrom > snapshot.today ? apartment.nextFreeFrom : snapshot.today,
                    checkOut: addISO(
                      apartment.nextFreeFrom && apartment.nextFreeFrom > snapshot.today ? apartment.nextFreeFrom : snapshot.today,
                      2,
                    ),
                  })
                }
              >
                <CalendarPlus size={14} /> Book this unit
              </button>
            ) : null}
          </div>
        }
      />

      {!apartment.active || apartment.outOfService ? (
        <Alert tone={apartment.outOfService ? 'error' : 'warn'} title={apartment.outOfService ? 'Out of service' : 'Not listed publicly'}>
          {apartment.outOfService
            ? `This unit is held back from the market: ${apartment.houseNotes || 'no reason recorded'}. It cannot be sold until housekeeping and maintenance clear it${
                futureStays ? `, and ${futureStays} future booking(s) must be moved or cancelled first` : ''
              }.`
            : 'The unit is bookable by staff but hidden from the public website.'}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Panel title="Photographs" subtitle="Add, reorder and choose a cover photo below." icon={ImageIcon}>
            <div className="p-4">
              <PhotoStrip photos={apartment.photos} alt={`Apartment ${apartment.number} — ${apartment.name}`} />
            </div>
          </Panel>

          <Panel title="About this unit">
            <div className="space-y-3 p-4">
              <p className="text-[0.9rem] leading-relaxed text-navy-600">{apartment.description || 'No description has been written yet.'}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Spec icon={Users} label="Sleeps" value={`${apartment.maxGuests} guests`} />
                <Spec icon={BedDouble} label="Bedrooms" value={apartment.bedrooms === 0 ? 'Studio' : String(apartment.bedrooms)} />
                <Spec icon={Bath} label="Bathrooms" value={String(apartment.bathrooms)} />
                <Spec icon={Maximize} label="Floor" value={apartment.floor === 0 ? 'Ground' : String(apartment.floor)} />
              </div>
              <div>
                <p className="label mb-1.5">Amenities</p>
                <ul className="flex flex-wrap gap-1.5">
                  {apartment.amenities.map((a) => (
                    <li key={a} className="chip">
                      <Check size={11} className="text-st-available" /> {a}
                    </li>
                  ))}
                  {!apartment.amenities.length ? <li className="text-[0.82rem] text-navy-400">Nothing recorded.</li> : null}
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-sand-100 pt-3 text-[0.78rem] text-navy-500">
                <span className="flex items-center gap-1.5">
                  <Ruler size={13} className="text-navy-400" /> {apartment.sizeSqm} m²
                </span>
                <span className="flex items-center gap-1.5">
                  <Layers size={13} className="text-navy-400" /> {apartment.bedConfiguration}
                </span>
                <span className="flex items-center gap-1.5">
                  <Wrench size={13} className="text-navy-400" /> {apartment.code}
                </span>
              </div>
            </div>
          </Panel>

          <Panel
            title="Booking history"
            subtitle={`${stays.length} stay${stays.length === 1 ? '' : 's'} on record · ${formatKwacha(lifetimeRevenue)} banked · ${formatKwachaCompact(
              stays.reduce((s, r) => s + r.nights, 0),
            )} Kwacha of nights sold`}
            bodyClass="divide-y divide-sand-100"
          >
            {stays.length ? (
              <ul className="divide-y divide-sand-100">
                {stays.slice(0, 12).map((r) => (
                  <li key={r.id} className="row-hover">
                    <Link href={`/admin/reservations/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="w-[9.5rem] shrink-0">
                        <span className="block text-[0.82rem] font-medium text-navy-700">
                          {formatMediumDate(r.checkIn)} → {formatMediumDate(r.checkOut)}
                        </span>
                        <span className="font-mono text-[0.7rem] text-navy-400">{r.reference}</span>
                      </span>
                      <span className="min-w-[8rem] flex-1 truncate text-[0.84rem] text-navy-700">{r.guest?.fullName ?? 'Guest'}</span>
                      <span className="w-16 shrink-0 text-right text-[0.8rem] text-navy-500 tnum">{r.nights}N</span>
                      <span className="w-24 shrink-0 text-right text-[0.84rem] font-semibold text-navy-800 tnum">{formatKwacha(r.totalAmount)}</span>
                      <span className={`w-24 shrink-0 text-right text-[0.8rem] tnum ${r.balanceDue ? 'text-st-cancelled' : 'text-st-available'}`}>
                        {r.balanceDue ? `${formatKwacha(r.balanceDue)} due` : 'Settled'}
                      </span>
                      <StatusChip className={`${BOOKING_STATUS_META[r.status].chip} shrink-0`}>{BOOKING_STATUS_META[r.status].label}</StatusChip>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4">
                <EmptyState title="No bookings yet" body="This unit has never been reserved, so there is no history to show." />
              </div>
            )}
            {stays.length > 12 ? (
              <div className="px-4 py-2.5 text-[0.78rem] text-navy-400">
                Showing the 12 most recent of {stays.length} stays.{' '}
                <Link href="/admin/reservations" className="link">
                  Open the register
                </Link>{' '}
                to search the rest.
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Tonight" bodyClass="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-[1.05rem] font-semibold ${meta.text}`}>{meta.label}</p>
                <p className="mt-0.5 text-[0.8rem] text-navy-500">
                  {apartment.tonightStatus === 'occupied'
                    ? `${apartment.guestInHouse ?? 'A guest'} is in residence, due out ${snapshot.settings.booking.checkOutTime}`
                    : apartment.tonightStatus === 'available'
                      ? 'Vacant and clean — ready to sell'
                      : apartment.tonightStatus === 'cleaning'
                        ? 'Housekeeping is between guests'
                        : apartment.tonightStatus === 'maintenance'
                          ? 'Blocked: maintenance'
                          : 'Not on the market'}
                </p>
              </div>
              <StatusChip className={`${meta.bg} ${meta.text}`} dot="bg-current">
                {formatDateWithWeekday(snapshot.today)}
              </StatusChip>
            </div>

            <div className="mt-3 space-y-2 border-t border-sand-100 pt-3 text-[0.8rem]">
              <Row label="Nightly rate" value={`${formatKwacha(apartment.nightlyRate)} / night`} />
              <Row label="Next arrival" value={apartment.nextArrival ? `${formatDateWithWeekday(apartment.nextArrival)} · in ${dayDiff(snapshot.today, apartment.nextArrival)}d` : '—'} />
              <Row label="Next departure" value={apartment.nextDeparture ? `${formatDateWithWeekday(apartment.nextDeparture)} · in ${dayDiff(snapshot.today, apartment.nextDeparture)}d` : '—'} />
              <Row label="Next free night" value={apartment.nextFreeFrom ? formatDateWithWeekday(apartment.nextFreeFrom) : 'Open from today'} />
              <Row label="Future bookings" value={`${futureStays} on the books`} />
            </div>
          </Panel>

          <Panel title="Housekeeping" subtitle="Cleaning state is derived from departures, not typed by hand" icon={SprayCan} bodyClass="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <StatusChip className={CLEANING_STATUS_META[apartment.cleaningStatus].chip} dot="bg-current">
                {CLEANING_STATUS_META[apartment.cleaningStatus].label}
              </StatusChip>
              {can('apartments.manage') ? (
                <button type="button" className="btn-secondary btn-sm" onClick={toggleService} disabled={busy}>
                  {apartment.outOfService ? 'Lift service hold' : 'Mark out of service'}
                </button>
              ) : null}
            </div>
            {cleaning ? <p className="text-[0.8rem] leading-relaxed text-navy-500">{cleaning.note || 'No note recorded.'} <span className="text-navy-400">· {formatDateTime(cleaning.updatedAt)}</span></p> : null}
            {openTask ? (
              <div className="rounded-lg border border-sand-200 bg-sand-50/60 p-2.5">
                <p className="text-[0.8rem] font-semibold text-navy-800">
                  {openTask.type === 'maintenance' ? 'Maintenance job' : 'Cleaning job'} · {formatMediumDate(openTask.date)}
                </p>
                <p className="mt-0.5 text-[0.78rem] text-navy-500">
                  {CLEANING_STATUS_META[openTask.status].label} · due {openTask.dueTime} · {openTask.assignedToName ?? 'unassigned'}
                  {openTask.instructions ? ` — ${openTask.instructions}` : ''}
                </p>
                {openTask.notes.length ? (
                  <p className="mt-1 text-[0.76rem] text-navy-400">“{openTask.notes[openTask.notes.length - 1].text}” — {openTask.notes[openTask.notes.length - 1].byName}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-[0.8rem] text-navy-400">No open job for this unit.</p>
            )}
            <Link href="/admin/housekeeping" className="btn-secondary btn-sm w-full justify-center">
              Housekeeping board
            </Link>
            {tasks.length ? (
              <div>
                <p className="label mb-1.5">Recent turns</p>
                <ul className="space-y-1 text-[0.78rem] text-navy-500">
                  {tasks.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span>{formatMediumDate(t.date)} · {t.type.replace(/_/g, ' ')}</span>
                      <span className="flex items-center gap-1.5">
                        {t.assignedToName}
                        <StatusChip className={CLEANING_STATUS_META[t.status].chip}>{CLEANING_STATUS_META[t.status].label}</StatusChip>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel title="Performance" subtitle="Rolling 30 days, counted from confirmed stays" bodyClass="p-4 space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-[0.8rem]">
                <span className="text-navy-500">Occupancy</span>
                <span className="font-semibold text-navy-800 tnum">
                  {occupancy30}% · {apartment.nightsLast30}/30 nights
                </span>
              </div>
              <div className="mt-1.5">
                <Progress value={occupancy30} tone="teal" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-[0.8rem]">
                <span className="text-navy-500">Verified revenue</span>
                <span className="font-semibold text-navy-800 tnum">{formatKwacha(apartment.revenueLast30)}</span>
              </div>
              <p className="mt-1 text-[0.76rem] text-navy-400">Only money a supervisor has confirmed counts here.</p>
            </div>
            <Link href="/admin/reports" className="btn-ghost btn-sm w-full justify-center">
              Full revenue report
            </Link>
          </Panel>

          {!can('guests.viewPii' as PermissionKey) ? (
            <p className="flex items-start gap-1.5 text-[0.76rem] text-navy-400">
              <ShieldAlert size={13} className="mt-px shrink-0" /> Guest identity details on linked bookings are hidden for your role.
            </p>
          ) : null}
        </div>
      </div>

      <ApartmentEditor open={editing} apartment={apartment} onClose={() => setEditing(false)} />
    </div>
  );

}

function Spec({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sand-200 px-2.5 py-2">
      <p className="label flex items-center gap-1">
        <Icon size={11} className="text-navy-400" /> {label}
      </p>
      <p className="mt-0.5 text-[0.85rem] font-semibold text-navy-800">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-navy-500">{label}</span>
      <span className="text-right font-medium text-navy-800 tnum">{value}</span>
    </div>
  );
}
