'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Flag,
  ListTodo,
  Play,
  Plus,
  RotateCcw,
  SprayCan,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, Avatar, DataTable, EmptyState, Panel, Skeleton, StatusChip } from '@/components/ui';
import { DateInput, SelectInput, TextArea, TextInput, Segmented } from '@/components/ui/forms';
import { Modal } from '@/components/ui/overlays';
import { CLEANING_STATUS_META } from '@/lib/domain/status';
import { formatMediumDate, formatDateWithWeekday, dayDiff, addISO } from '@/lib/domain/dates';
import type { CleaningStatus } from '@/lib/domain/types';
import type { HousekeepingTaskView } from '@/lib/view-types';

type Scope = 'today' | 'week' | 'open' | 'done';

const COLUMNS: { status: CleaningStatus; label: string; icon: typeof SprayCan; hint: string }[] = [
  { status: 'needs_cleaning', label: 'Needs cleaning', icon: CircleDashed, hint: 'Nobody has picked these up yet' },
  { status: 'in_progress', label: 'In progress', icon: Play, hint: 'Cleaner on the unit' },
  { status: 'maintenance', label: 'Maintenance', icon: Wrench, hint: 'Blocked until the fault is fixed' },
  { status: 'clean', label: 'Ready to sell', icon: CheckCircle2, hint: 'Signed off — reception can release the unit' },
];

export default function HousekeepingPage() {
  const { snapshot, request, toast, can, refresh } = useApp();
  const [scope, setScope] = useState<Scope>('today');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [cleanerFilter, setCleanerFilter] = useState('all');
  const [jobOpen, setJobOpen] = useState(false);
  const [finishing, setFinishing] = useState<HousekeepingTaskView | null>(null);
  const [breakdown, setBreakdown] = useState<HousekeepingTaskView | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const cleaners = useMemo(() => (snapshot ? snapshot.staff.filter((s) => s.role === 'cleaner') : []), [snapshot]);

  const tasks = useMemo(() => {
    if (!snapshot) return [];
    let rows = [...snapshot.housekeeping];
    if (cleanerFilter !== 'all') rows = rows.filter((t) => (cleanerFilter === 'unassigned' ? !t.assignedTo : t.assignedTo === cleanerFilter));
    const today = snapshot.today;
    if (scope === 'today') rows = rows.filter((t) => t.date === today && t.status !== 'clean');
    if (scope === 'week') rows = rows.filter((t) => t.date >= today && t.date <= addISO(today, 7) && t.status !== 'clean');
    if (scope === 'open') rows = rows.filter((t) => t.status !== 'clean');
    if (scope === 'done')
      rows = rows
        .filter((t) => t.status === 'clean')
        .sort((a, b) => (b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date))
        .slice(0, 20);
    return rows.sort((a, b) => (a.date === b.date ? a.dueTime.localeCompare(b.dueTime) : a.date < b.date ? -1 : 1));
  }, [snapshot, scope, cleanerFilter]);

  if (!snapshot) return <Skeleton className="h-96" />;

  const today = snapshot.today;
  const openAll = snapshot.housekeeping.filter((t) => t.status !== 'clean');
  const counts = {
    needs: openAll.filter((t) => t.status === 'needs_cleaning').length,
    progress: openAll.filter((t) => t.status === 'in_progress').length,
    maintenance: openAll.filter((t) => t.status === 'maintenance').length,
    unassigned: openAll.filter((t) => !t.assignedTo).length,
    overdue: openAll.filter((t) => t.date < today).length,
  };

  // Departures today that have produced no turnover job yet — the gap that makes guests wait.
  const missingTurnovers = (snapshot.reservations ?? []).filter(
    (r) =>
      r.status === 'checked_in' &&
      r.checkOut === today &&
      !snapshot.housekeeping.some((t) => t.reservationId === r.id),
  );

  async function patch(task: HousekeepingTaskView, data: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await request(`/api/housekeeping/${task.id}`, { method: 'PATCH', data });
      toast({ tone: 'success', title: 'Housekeeping updated', body: message });
    } catch (err) {
      toast({ tone: 'error', title: 'Not saved', body: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!finishing) return;
    const task = finishing;
    setBusy(true);
    try {
      await request(`/api/housekeeping/${task.id}`, { method: 'PATCH', data: { status: 'clean', note: note.trim() || 'Turnover completed.' } });
      await request(`/api/reservations/${task.reservationId}/actions`, { method: 'POST', data: { kind: 'action', action: 'check_out' } }).catch(() => undefined);
      toast({
        tone: 'success',
        title: 'Unit signed off',
        body: `Apt ${task.apartmentNumber} is clean${task.reservationId ? ' and the departure is closed off' : ''}. Reception can sell the night.`,
      });
      setFinishing(null);
      setNote('');
      await refresh();
    } catch (err) {
      toast({ tone: 'error', title: 'Not saved', body: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function reportFault() {
    if (!breakdown) return;
    const task = breakdown;
    setBusy(true);
    try {
      await request(`/api/housekeeping/${task.id}`, { method: 'PATCH', data: { status: 'maintenance', note: note.trim() || 'Fault reported by the cleaner.' } });
      toast({
        tone: 'info',
        title: 'Maintenance logged',
        body: `Apt ${task.apartmentNumber} is held out of service until a supervisor clears it. Reception has been notified in the app.`,
      });
      setBreakdown(null);
      setNote('');
      await refresh();
    } catch (err) {
      toast({ tone: 'error', title: 'Not saved', body: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Housekeeping"
        description="Turnovers arrive here the moment a guest departs. Status set by staff, never inferred from a clean calendar cell."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/portal/cleaning" className="btn-secondary h-9 px-3 text-[0.82rem]">
              <SprayCan size={14} /> Cleaner's view
            </Link>
            {can('housekeeping.assign') ? (
              <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={() => setJobOpen(true)}>
                <Plus size={15} /> Schedule a job
              </button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip ${counts.needs ? 'bg-st-cleaningBg text-st-cleaning' : ''}`}>{counts.needs} waiting</span>
        <span className={`chip ${counts.progress ? 'bg-st-reservedBg text-st-reserved' : ''}`}>{counts.progress} in progress</span>
        <span className={`chip ${counts.maintenance ? 'bg-st-cancelledBg text-st-cancelled' : ''}`}>{counts.maintenance} maintenance</span>
        {counts.unassigned ? <span className="chip bg-gold-50 text-gold-700">{counts.unassigned} unassigned</span> : null}
        {counts.overdue ? <span className="chip bg-st-cancelledBg text-st-cancelled">{counts.overdue} overdue</span> : null}
        <span className="chip">{snapshot.apartments.filter((a) => a.cleaningStatus === 'clean').length} units ready</span>
      </div>

      {missingTurnovers.length ? (
        <Alert tone="warn" title={`${missingTurnovers.length} departure${missingTurnovers.length === 1 ? '' : 's'} without a turnover job`}>
          <div className="space-y-1.5">
            {missingTurnovers.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  Apt {r.apartment?.number} · {r.guest?.fullName ?? 'guest'}
                </span>
                <span className="opacity-70">checked out {formatMediumDate(r.checkOut)}</span>
                {can('housekeeping.assign') ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      request('/api/housekeeping', {
                        method: 'POST',
                        data: {
                          apartmentId: r.apartmentId,
                          reservationId: r.id,
                          type: 'turnover',
                          date: today,
                          dueTime: '14:00',
                          priority: 'high',
                          status: 'needs_cleaning',
                          instructions: `Departure folio ${r.reference} — turn over for the ${formatDateWithWeekday(r.checkIn)} arrival.`,
                        },
                      }).then(() => toast({ tone: 'success', title: 'Job created', body: `Turnover for Apt ${r.apartment?.number} is on the board.` }))
                    }
                  >
                    <Plus size={12} /> Create job
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Date scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Next 7 days' },
            { value: 'open', label: 'All open' },
            { value: 'done', label: 'Recently signed off' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            aria-label="Filter by cleaner"
            className="w-52"
            value={cleanerFilter}
            onChange={(e) => setCleanerFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Every cleaner' },
              { value: 'unassigned', label: 'Unassigned work' },
              ...cleaners.map((c) => ({
                value: c.id,
                label: c.name,
                note: openAll.filter((t) => t.assignedTo === c.id).length ? `${openAll.filter((t) => t.assignedTo === c.id).length} open` : 'clear',
              })),
            ]}
          />
          <Segmented
            ariaLabel="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}
          />
        </div>
      </div>

      {view === 'board' ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const items = tasks.filter((t) => t.status === column.status);
            const Icon = column.icon;
            return (
              <div key={column.status} className="card flex min-h-[16rem] flex-col">
                <header className="flex items-center justify-between gap-2 border-b border-sand-200 px-3 py-2.5">
                  <h3 className="flex items-center gap-1.5 text-[0.84rem] font-semibold text-navy-800">
                    <Icon size={14} className={CLEANING_STATUS_META[column.status].chip.split(' ').pop()} />
                    {column.label}
                  </h3>
                  <span className="rounded bg-sand-100 px-1.5 text-[0.72rem] font-bold text-navy-500 tnum">{items.length}</span>
                </header>
                <div className="flex-1 space-y-2 p-2.5">
                  {items.length ? (
                    items.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        today={today}
                        canAssign={can('housekeeping.assign')}
                        canComplete={can('housekeeping.complete')}
                        cleaners={cleaners.map((c) => ({ id: c.id, name: c.name }))}
                        showGuest={can('guests.view')}
                        busy={busy}
                        onAssign={(assignedTo) => patch(task, { assignedTo }, `${task.assignedToName ?? 'Work'} moved on Apt ${task.apartmentNumber}.`)}
                        onStart={() => patch(task, { status: 'in_progress' }, `Apt ${task.apartmentNumber} is being cleaned now.`)}
                        onFinish={() => {
                          setFinishing(task);
                          setNote('');
                        }}
                        onReopen={() => patch(task, { status: 'needs_cleaning' }, `Apt ${task.apartmentNumber} is back in the queue.`)}
                        onFault={() => {
                          setBreakdown(task);
                          setNote('');
                        }}
                      />
                    ))
                  ) : (
                    <p className="px-1 py-6 text-center text-[0.76rem] leading-relaxed text-navy-400">{column.hint}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable head={['Job', 'Apartment', 'Cleaner', 'Due', 'Priority', 'Status', '']}>
            {tasks.length ? (
              tasks.map((task) => (
                <tr key={task.id} className="row-hover border-b border-sand-100 last:border-b-0">
                  <td className="td">
                    <span className="block text-[0.84rem] font-semibold text-navy-800">{task.type.replace(/_/g, ' ')}</span>
                    <span className="block text-[0.72rem] text-navy-400">{task.instructions ? truncate(task.instructions) : 'No instructions'}</span>
                  </td>
                  <td className="td">
                    <Link href={`/admin/apartments/${task.apartmentId}`} className="text-[0.82rem] font-medium text-navy-700 hover:text-teal-700">
                      Apt {task.apartmentNumber} · {task.apartmentName}
                    </Link>
                  </td>
                  <td className="td text-[0.8rem] text-navy-600">{task.assignedToName ?? <span className="text-gold-700">unassigned</span>}</td>
                  <td className="td text-[0.8rem] text-navy-600 tnum">
                    {formatMediumDate(task.date)} · {task.dueTime}
                    {task.date < today ? <span className="ml-1 text-st-cancelled">late</span> : null}
                  </td>
                  <td className="td">
                    {task.priority === 'high' ? (
                      <span className="chip bg-st-cancelledBg text-st-cancelled">
                        <Flag size={10} /> high
                      </span>
                    ) : (
                      <span className="text-[0.78rem] text-navy-400">{task.priority}</span>
                    )}
                  </td>
                  <td className="td">
                    <StatusChip className={CLEANING_STATUS_META[task.status].chip} dot="bg-current">
                      {CLEANING_STATUS_META[task.status].label}
                    </StatusChip>
                  </td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {task.status === 'needs_cleaning' && can('housekeeping.complete') ? (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => patch(task, { status: 'in_progress' }, 'Started.')} disabled={busy}>
                          Start
                        </button>
                      ) : null}
                      {task.status !== 'clean' && can('housekeeping.complete') ? (
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => {
                            setFinishing(task);
                            setNote('');
                          }}
                        >
                          Sign off
                        </button>
                      ) : null}
                      {task.reservationId ? (
                        <Link href={`/admin/reservations/${task.reservationId}`} className="btn-ghost btn-sm">
                          Folio
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8">
                  <EmptyState icon={ListTodo} title="Nothing in this view" body="Change the date scope, or schedule a job if a unit needs attention outside the normal turnovers." />
                </td>
              </tr>
            )}
          </DataTable>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Team workload" subtitle="Open jobs per cleaner today, counted from the board above" bodyClass="divide-y divide-sand-100">
          {cleaners.length ? (
            cleaners.map((c) => {
              const mine = openAll.filter((t) => t.assignedTo === c.id);
              const doneToday = snapshot.housekeeping.filter((t) => t.assignedTo === c.id && t.status === 'clean' && t.date === today).length;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Avatar name={c.name} tone={c.active ? 'teal' : 'navy'} />
                  <div className="min-w-[8rem] flex-1">
                    <p className="text-[0.84rem] font-semibold text-navy-800">{c.name}</p>
                    <p className="text-[0.74rem] text-navy-400">
                      {c.jobTitle} · {c.shift ?? 'no shift set'} · {c.active ? 'on duty' : 'off duty'}
                    </p>
                  </div>
                  <span className="chip">{mine.length} open</span>
                  <span className="chip bg-st-availableBg text-st-available">{doneToday} done today</span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setCleanerFilter(c.id);
                      setScope('open');
                    }}
                  >
                    Show jobs
                  </button>
                </div>
              );
            })
          ) : (
            <div className="p-4">
              <EmptyState title="No cleaner accounts" body="Create staff accounts with the Cleaner role and they appear here." action={<Link href="/admin/staff" className="btn-secondary btn-sm"><UserPlus size={12} /> Add staff</Link>} />
            </div>
          )}
        </Panel>

        <Panel title="Apartments by cleaning state" subtitle="From the live unit status, not from job rows" bodyClass="p-4">
          <ul className="space-y-2 text-[0.82rem]">
            {(['clean', 'needs_cleaning', 'in_progress', 'maintenance'] as CleaningStatus[]).map((status) => {
              const units = snapshot.apartments.filter((a) => a.cleaningStatus === status);
              return (
                <li key={status} className="flex flex-wrap items-center gap-2">
                  <StatusChip className={CLEANING_STATUS_META[status].chip} dot="bg-current">
                    {CLEANING_STATUS_META[status].label}
                  </StatusChip>
                  <span className="text-navy-400 tnum">{units.length}</span>
                  <span className="min-w-0 flex-1 text-navy-500">
                    {units.length ? units.map((a) => `Apt ${a.number}`).join(', ') : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-sand-100 pt-2.5 text-[0.74rem] leading-relaxed text-navy-400">
            A unit counts as ready only after a person with <span className="font-medium">housekeeping.complete</span> signs the job off. Maintenance holds block the unit in availability
            searches until a supervisor lifts them.
          </p>
        </Panel>
      </div>

      <ScheduleJobModal open={jobOpen} onClose={() => setJobOpen(false)} />

      <Modal
        open={!!finishing}
        onClose={() => !busy && setFinishing(null)}
        size="sm"
        title={finishing ? `Sign off Apt ${finishing.apartmentNumber}` : 'Sign off'}
        subtitle="Say what was done — the note is what the next shift reads."
        footer={
          <>
            <button type="button" className="btn-ghost h-10 px-3.5" onClick={() => setFinishing(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary h-10 px-4" onClick={finish} disabled={busy}>
              {busy ? 'Saving…' : 'Mark clean'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {finishing?.guestName ? (
            <p className="rounded-lg bg-sand-100/70 px-3 py-2 text-[0.8rem] text-navy-600">
              Departing: {finishing.guestName}
              {finishing.reference ? ` · folio ${finishing.reference}` : ''}
            </p>
          ) : null}
          <TextArea label="Completion note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} counter placeholder="Linens swapped, towels restocked, minibar checked, no faults." />
          <p className="text-[0.76rem] leading-relaxed text-navy-400">
            Marking the unit clean releases it for sale tonight. If the guest has not been checked out yet, this also closes their folio — do it only once they have actually left.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!breakdown}
        onClose={() => !busy && setBreakdown(null)}
        size="sm"
        title={breakdown ? `Report a fault in Apt ${breakdown.apartmentNumber}` : 'Report a fault'}
        subtitle="This holds the unit out of service until a supervisor clears it."
        footer={
          <>
            <button type="button" className="btn-ghost h-10 px-3.5" onClick={() => setBreakdown(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-danger h-10 px-4" onClick={reportFault} disabled={busy || note.trim().length < 5}>
              {busy ? 'Saving…' : 'Log the fault'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warn" title="What happens next">
            Reception sees the hold immediately and stops selling the unit. Nobody can book into it until the job returns to ‘clean’.
          </Alert>
          <TextArea label="What is wrong?" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} counter placeholder="Shower drain blocked; geyser not heating." required />
        </div>
      </Modal>
    </div>
  );
}

function TaskCard({
  task,
  today,
  canAssign,
  canComplete,
  cleaners,
  showGuest,
  busy,
  onAssign,
  onStart,
  onFinish,
  onReopen,
  onFault,
}: {
  task: HousekeepingTaskView;
  today: string;
  canAssign: boolean;
  canComplete: boolean;
  cleaners: { id: string; name: string }[];
  showGuest: boolean;
  busy: boolean;
  onAssign: (id: string) => void;
  onStart: () => void;
  onFinish: () => void;
  onReopen: () => void;
  onFault: () => void;
}) {
  const late = task.date < today && task.status !== 'clean';
  const days = dayDiff(today, task.date);
  return (
    <article className={`rounded-lg border bg-white p-2.5 shadow-card ${task.priority === 'high' ? 'border-st-cancelled/40' : 'border-sand-200'} ${task.status === 'clean' ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.84rem] font-semibold text-navy-800">
            Apt {task.apartmentNumber} · <span className="font-medium text-navy-600">{task.apartmentName}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-navy-400">
            <span className="capitalize">{task.type.replace(/_/g, ' ')}</span>
            <span className="inline-flex items-center gap-0.5">
              <Clock size={10} /> {task.dueTime}
            </span>
            <span>
              {late ? <span className="font-semibold text-st-cancelled">overdue</span> : days === 0 ? 'today' : days === 1 ? 'tomorrow' : formatMediumDate(task.date)}
            </span>
          </p>
        </div>
        {task.priority === 'high' ? (
          <span className="chip shrink-0 bg-st-cancelledBg text-st-cancelled">
            <AlertTriangle size={10} /> high
          </span>
        ) : null}
      </div>

      {showGuest && task.guestName ? <p className="mt-1.5 truncate text-[0.76rem] text-navy-500">Departing {task.guestName}{task.reference ? ` · ${task.reference}` : ''}</p> : null}
      {task.instructions ? <p className="mt-1.5 rounded bg-sand-100/70 px-2 py-1 text-[0.76rem] leading-snug text-navy-600">{task.instructions}</p> : null}
      {task.notes.length ? (
        <p className="mt-1.5 text-[0.72rem] leading-snug text-navy-400">
          “{task.notes[task.notes.length - 1].text}” — {task.notes[task.notes.length - 1].byName}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-sand-100 pt-2">
        {canAssign ? (
          <select
            aria-label={`Assign Apt ${task.apartmentNumber}`}
            className="min-w-0 flex-1 rounded-md border border-sand-300 bg-white px-1.5 py-1 text-[0.75rem] text-navy-700 focus:border-teal-500 focus:outline-none"
            value={task.assignedTo ?? ''}
            onChange={(e) => onAssign(e.target.value)}
            disabled={busy}
          >
            <option value="">Unassigned</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[0.76rem] text-navy-500">{task.assignedToName ?? 'Unassigned'}</span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {task.status === 'needs_cleaning' && canComplete ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onStart} disabled={busy} title="Start cleaning">
              <Play size={11} />
            </button>
          ) : null}
          {task.status !== 'clean' && canComplete ? (
            <button type="button" className="btn-primary btn-sm" onClick={onFinish} disabled={busy}>
              Done
            </button>
          ) : null}
          {task.status === 'clean' && canComplete ? (
            <button type="button" className="btn-ghost btn-sm" onClick={onReopen} disabled={busy} title="Put back in the queue">
              <RotateCcw size={11} />
            </button>
          ) : null}
          {task.status !== 'maintenance' && canComplete ? (
            <button type="button" className="btn-ghost btn-sm" onClick={onFault} disabled={busy} title="Report a fault">
              <Wrench size={12} className="text-navy-400" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ScheduleJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snapshot, request, toast } = useApp();
  const cleaners = (snapshot?.staff ?? []).filter((s) => s.role === 'cleaner' && s.active);
  const [draft, setDraft] = useState({ apartmentId: '', type: 'deep_clean', date: snapshot?.today ?? '', dueTime: '14:00', assignedTo: '', priority: 'normal', instructions: '' });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!draft.apartmentId) return;
    setBusy(true);
    try {
      await request('/api/housekeeping', {
        method: 'POST',
        data: {
          apartmentId: draft.apartmentId,
          type: draft.type,
          date: draft.date,
          dueTime: draft.dueTime,
          assignedTo: draft.assignedTo || null,
          priority: draft.priority,
          instructions: draft.instructions,
          status: draft.type === 'maintenance' ? 'maintenance' : 'needs_cleaning',
        },
      });
      toast({ tone: 'success', title: 'Job scheduled', body: `Apt ${snapshot?.apartments.find((a) => a.id === draft.apartmentId)?.number} is on the ${formatMediumDate(draft.date)} board.` });
      onClose();
      setDraft({ ...draft, apartmentId: '', instructions: '' });
    } catch (err) {
      toast({ tone: 'error', title: 'Not scheduled', body: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a job"
      subtitle="For anything outside the automatic departure turnovers — deep cleans, pre-arrival checks, ad-hoc repairs."
      footer={
        <>
          <button type="button" className="btn-ghost h-10 px-3.5" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary h-10 px-4" onClick={create} disabled={!draft.apartmentId || busy}>
            {busy ? 'Saving…' : 'Add to board'}
          </button>
        </>
      }
      size="md"
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <SelectInput
          label="Apartment"
          value={draft.apartmentId}
          onChange={(e) => setDraft({ ...draft, apartmentId: e.target.value })}
          options={(snapshot?.apartments ?? []).map((a) => ({ value: a.id, label: `Apt ${a.number} — ${a.name}`, note: CLEANING_STATUS_META[a.cleaningStatus].label }))}
        />
        <SelectInput
          label="Job type"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value })}
          options={[
            { value: 'turnover', label: 'Turnover' },
            { value: 'stayover', label: 'Stay-over tidy' },
            { value: 'pre_arrival', label: 'Pre-arrival check' },
            { value: 'deep_clean', label: 'Deep clean' },
            { value: 'maintenance', label: 'Maintenance' },
          ]}
        />
        <DateInput label="Date" value={draft.date} min={snapshot?.today} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <TextInput label="Target time" type="time" value={draft.dueTime} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} />
        <SelectInput
          label="Assign to"
          value={draft.assignedTo}
          onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })}
          options={[{ value: '', label: 'Leave unassigned' }, ...cleaners.map((c) => ({ value: c.id, label: c.name, note: c.shift ?? undefined }))]}
        />
        <SelectInput
          label="Priority"
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High — before next arrival' },
          ]}
        />
        <div className="sm:col-span-2">
          <TextArea label="Instructions" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} rows={2} maxLength={600} counter placeholder="e.g. Strip the second bed, check the balcony door seal." />
        </div>
      </div>
    </Modal>
  );
}

function truncate(value: string, max = 58): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}


