'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarDays, Pencil, Plus, SprayCan, Wrench } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, EmptyState, Progress, Skeleton, StatusChip } from '@/components/ui';
import { PhotoFrame } from '@/components/ui/photo';
import { ConfirmDialog } from '@/components/ui/overlays';
import { Segmented } from '@/components/ui/forms';
import { ApartmentEditor } from '@/components/admin/apartment-editor';
import { formatKwacha, formatKwachaCompact, percent } from '@/lib/domain/money';
import { formatDateWithWeekday } from '@/lib/domain/dates';
import { APARTMENT_TIER_LABELS, DAY_STATUS_META } from '@/lib/domain/status';
import type { ApartmentView } from '@/lib/view-types';

type Filter = 'all' | 'tonight' | 'cleaning' | 'unlisted';

export default function ApartmentsPage() {
  const { snapshot, request, toast, can } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<ApartmentView | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ apartment: ApartmentView; activate: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );

  const all = [...snapshot.apartments].sort((a, b) => a.number - b.number);
  const rows = all.filter((a) => {
    if (filter === 'tonight') return a.tonightStatus === 'occupied' || a.nextArrival === snapshot?.today;
    if (filter === 'cleaning') return a.cleaningStatus !== 'clean' || a.openTasks > 0;
    if (filter === 'unlisted') return !a.active || a.outOfService;
    return true;
  });

  const counts = {
    total: all.length,
    onSale: all.filter((a) => a.active && !a.outOfService).length,
    occupied: all.filter((a) => a.tonightStatus === 'occupied').length,
    cleaning: all.filter((a) => a.cleaningStatus !== 'clean').length,
    avgRate: Math.round(all.reduce((s, a) => s + a.nightlyRate, 0) / Math.max(1, all.length)),
  };

  async function toggleActive() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/apartments/${confirm.apartment.id}`, {
        method: 'PATCH',
        data: { active: confirm.activate, outOfService: confirm.apartment.outOfService },
      });
      toast({
        tone: 'success',
        title: confirm.activate ? 'Unit re-listed' : 'Unit deactivated',
        body: confirm.activate
          ? `Apt ${confirm.apartment.number} is on sale again.`
          : `Apt ${confirm.apartment.number} no longer appears on the website or in availability searches.`,
      });
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The apartment could not be updated.');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Apartments"
        description="Manage apartment details, nightly rates and availability."
        actions={
          can('apartments.manage') ? (
            <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={() => setCreating(true)}>
              <Plus size={15} /> Add apartment
            </button>
          ) : (
            <span className="chip">Read-only for your role</span>
          )
        }
      />

      {error ? (
        <Alert tone="error" title="Change refused">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip">{counts.total} units</span>
          <span className="chip bg-st-availableBg text-st-available">{counts.onSale} on sale</span>
          <span className="chip bg-st-occupiedBg text-st-occupied">{counts.occupied} occupied tonight</span>
          {counts.cleaning ? <span className="chip bg-st-cleaningBg text-st-cleaning">{counts.cleaning} need cleaning</span> : null}
          <span className="chip">Average rate {formatKwachaCompact(counts.avgRate)}</span>
        </div>
        <Segmented
          ariaLabel="Filter apartments"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'tonight', label: 'In use tonight' },
            { value: 'cleaning', label: 'Housekeeping' },
            { value: 'unlisted', label: 'Unlisted / off-market' },
          ]}
        />
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No apartments yet"
          body="The booking engine sells whatever is in this list, so start here: add each unit with its rate, capacity and photos. Until then the public site shows a contact card instead of a catalogue."
          action={
            can('apartments.manage') ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
                <Plus size={14} /> Add your first apartment
              </button>
            ) : null
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing in this view" body="No apartment matches the filter you picked. Switch back to All to see the full building." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((apartment) => {
            const meta = DAY_STATUS_META[apartment.tonightStatus];
            const task = snapshot.housekeeping.find((t) => t.apartmentId === apartment.id && t.status !== 'clean');
            const occupancy = percent(apartment.nightsLast30, 30);
            return (
              <article key={apartment.id} className="card overflow-hidden flex flex-col">
                <Link href={`/admin/apartments/${apartment.id}`} className="block" aria-label={`Open apartment ${apartment.number}`}>
                  <PhotoFrame src={apartment.photos[0]} alt={`Apartment ${apartment.number} — ${apartment.name}`} ratio="16 / 10" />
                </Link>
                <div className="flex-0 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/apartments/${apartment.id}`}>
                        <h3 className="truncate font-display text-[1.05rem] leading-snug text-navy-800 hover:text-teal-700">
                          Apt {apartment.number} · {apartment.name}
                        </h3>
                      </Link>
                      <p className="mt-0.5 text-[0.76rem] text-navy-400">
                        {APARTMENT_TIER_LABELS[apartment.tier]} · {apartment.sizeSqm} m² · {apartment.bedrooms === 0 ? 'studio' : `${apartment.bedrooms} bed`} · sleeps {apartment.maxGuests}
                      </p>
                    </div>
                    <StatusChip className={`${meta.bg} ${meta.text}`} dot="bg-current">{meta.label}</StatusChip>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-sand-100 pt-3">
                    <div>
                      <dt className="label">Per night</dt>
                      <dd className="text-[0.88rem] font-semibold text-navy-800 tnum">{formatKwacha(apartment.nightlyRate)}</dd>
                    </div>
                    <div>
                      <dt className="label">30-day occupancy</dt>
                      <dd className="text-[0.88rem] font-semibold text-navy-800 tnum">{occupancy}%</dd>
                      <div className="mt-1">
                        <Progress value={occupancy} tone="teal" />
                      </div>
                    </div>
                    <div>
                      <dt className="label">30-day revenue</dt>
                      <dd className="text-[0.88rem] font-semibold text-navy-800 tnum">{apartment.revenueLast30 ? formatKwachaCompact(apartment.revenueLast30) : '—'}</dd>
                    </div>
                  </dl>

                  {task || apartment.guestInHouse || apartment.nextFreeFrom ? (
                    <ul className="mt-3 space-y-1 border-t border-sand-100 pt-2.5 text-[0.76rem]">
                      {apartment.guestInHouse ? (
                        <li className="flex items-center gap-1.5 text-st-occupied">
                          <CalendarDays size={12} /> {apartment.guestInHouse} in residence · departs {formatDateWithWeekday(apartment.nextDeparture ?? undefined)}
                        </li>
                      ) : null}
                      {task ? (
                        <li className={task.status === 'maintenance' ? 'flex items-center gap-1.5 text-st-cancelled' : 'flex items-center gap-1.5 text-st-cleaning'}>
                          {task.status === 'maintenance' ? <Wrench size={12} /> : <SprayCan size={12} />}
                          {task.status === 'maintenance' ? 'Open maintenance job' : `Cleaning ${task.status === 'in_progress' ? 'in progress' : 'due'} ${task.dueTime}`} · {task.assignedToName ?? 'unassigned'}
                        </li>
                      ) : null}
                      {apartment.nextFreeFrom && apartment.nextFreeFrom > snapshot.today ? (
                        <li className="flex items-center gap-1.5 text-navy-500">
                          <CalendarDays size={12} /> Next free night {formatDateWithWeekday(apartment.nextFreeFrom)}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}

                  {!apartment.active || apartment.outOfService ? (
                    <p className="mt-3 rounded-lg bg-sand-100 px-2.5 py-1.5 text-[0.76rem] text-navy-500">
                      {apartment.outOfService
                        ? `Out of service — not sold until the hold is lifted.${apartment.houseNotes ? ` Note: ${apartment.houseNotes}` : ''}`
                        : 'Hidden from the website and from availability searches while unlisted.'}
                    </p>
                  ) : null}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-sand-100 bg-sand-50/60 px-4 py-2.5">
                  <Link href={`/admin/apartments/${apartment.id}`} className="btn-ghost btn-sm">
                    Details
                  </Link>
                  {can('apartments.manage') ? (
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(apartment)}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirm({ apartment, activate: !apartment.active })}>
                        {apartment.active ? 'Unlist' : 'List'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {can('apartments.manage') ? (
        <>
          <ApartmentEditor open={creating} onClose={() => setCreating(false)} />
          <ApartmentEditor open={!!editing} apartment={editing} onClose={() => setEditing(null)} />
        </>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        onClose={() => !busy && setConfirm(null)}
        title={confirm?.activate ? `List apartment ${confirm?.apartment.number}?` : `Unlist apartment ${confirm?.apartment.number}?`}
        confirmLabel={confirm?.activate ? 'List it' : 'Unlist it'}
        tone={confirm?.activate ? 'gold' : 'danger'}
        body={
          confirm?.apartment.active ? (
            <p>
              The unit disappears from the public site and from availability searches. Stays already booked —{' '}
              {snapshot.reservations?.filter((r) => r.apartmentId === confirm.apartment.id && r.checkOut >= snapshot.today && r.status !== 'cancelled').length ?? 0} of them — remain on the
              register and must be moved or cancelled by hand.
            </p>
          ) : (
            <p>The unit returns to the website and can be sold from tonight onwards.</p>
          )
        }
        onConfirm={toggleActive}
      />
    </div>
  );
}
