'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, ClipboardList, Clock, LogOut, Play, ShieldAlert, SprayCan, Wrench } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { Alert, EmptyState, Skeleton, StatusChip } from '@/components/ui';
import { Modal } from '@/components/ui/overlays';
import { TextArea } from '@/components/ui/forms';
import { CLEANING_STATUS_META } from '@/lib/domain/status';
import { dayDiff, formatDateWithWeekday, formatMediumDate } from '@/lib/domain/dates';
import type { HousekeepingTaskView } from '@/lib/view-types';

/**
 * The cleaner's whole application: the jobs assigned to them, three buttons per job,
 * nothing else. Folios, guest records and staff lists are not in this bundle at all —
 * the server strips them from the snapshot for this role.
 */
export default function CleaningPortalPage() {
  const { snapshot, request, toast, signOut, can } = useApp();
  const [finishing, setFinishing] = useState<HousekeepingTaskView | null>(null);
  const [fault, setFault] = useState<HousekeepingTaskView | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>('');

  const isCleaner = snapshot?.user.role === 'cleaner';
  const cleaners = useMemo(() => (snapshot ? snapshot.staff.filter((s) => s.role === 'cleaner' && s.active) : []), [snapshot]);
  const previewId = !isCleaner ? preview || cleaners.find((c) => snapshot?.housekeeping.some((t) => t.assignedTo === c.id))?.id || cleaners[0]?.id || '' : snapshot?.user.id || '';

  const mine = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.housekeeping.filter((t) => t.assignedTo === previewId).sort((a, b) => (a.date === b.date ? a.dueTime.localeCompare(b.dueTime) : a.date < b.date ? -1 : 1));
  }, [snapshot, previewId]);

  if (!snapshot)
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );

  const today = snapshot.today;
  const open = mine.filter((t) => t.status !== 'clean');
  const doneToday = mine.filter((t) => t.status === 'clean' && t.date === today);
  const groups = [
    { label: 'Overdue', tone: 'bad' as const, items: open.filter((t) => t.date < today) },
    { label: 'Today', tone: 'now' as const, items: open.filter((t) => t.date === today) },
    { label: 'Tomorrow', tone: 'next' as const, items: open.filter((t) => t.date > today && dayDiff(today, t.date) <= 1) },
    { label: 'Later this week', tone: 'later' as const, items: open.filter((t) => dayDiff(today, t.date) > 1) },
  ].filter((g) => g.items.length);

  async function patch(task: HousekeepingTaskView, data: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await request(`/api/housekeeping/${task.id}`, { method: 'PATCH', data });
      toast({ tone: 'success', title: 'Saved', body: message });
    } catch (err) {
      toast({ tone: 'error', title: 'Not saved', body: err instanceof Error ? err.message : 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!finishing) return;
    const task = finishing;
    await patch(task, { status: 'clean', note: note.trim() || 'Completed.' }, `Apt ${task.apartmentNumber} signed off${task.durationMinutes ? '' : ''}. Reception can sell it.`);
    setFinishing(null);
    setNote('');
  }

  async function logFault() {
    if (!fault) return;
    const task = fault;
    await patch(task, { status: 'maintenance', note: note.trim() || 'Fault reported from the cleaner app.' }, `Apt ${task.apartmentNumber} is on hold for maintenance.`);
    setFault(null);
    setNote('');
  }

  return (
    <div className="mx-auto max-w-lg pb-16">
      <header className="sticky top-0 z-20 border-b border-sand-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <img src="/brand/logo.jpg" alt="Lemma Apartments" className="h-9 w-9 rounded-lg object-cover ring-1 ring-sand-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.92rem] font-semibold text-navy-800">Cleaning list</p>
            <p className="truncate text-[0.74rem] text-navy-400">
              {isCleaner ? snapshot.user.name : `Preview · ${cleaners.find((c) => c.id === previewId)?.name ?? 'nobody'}`} · {formatDateWithWeekday(today)}
            </p>
          </div>
          <button type="button" onClick={() => void signOut()} className="btn-secondary h-9 px-2.5 text-[0.78rem]" aria-label="Sign out">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <main className="space-y-4 p-4">
        {!isCleaner ? (
          <Alert tone="info" title="Supervisor preview">
            <div className="space-y-2">
              <p>You are signed in as {snapshot.user.name} ({snapshot.user.role}), so you can look at any cleaner&apos;s list. A cleaner signing in themselves sees only their own jobs — no money, no guest details.</p>
              <select
                aria-label="Preview whose list"
                className="field"
                value={previewId}
                onChange={(e) => setPreview(e.target.value)}
              >
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.shift ?? 'no shift'}
                  </option>
                ))}
              </select>
              {can('housekeeping.assign') ? (
                <Link href="/admin/housekeeping" className="btn-ghost btn-sm">
                  Open the full board
                </Link>
              ) : null}
            </div>
          </Alert>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Tile label="Still to do" value={String(open.length)} icon={ClipboardList} tone={open.length ? 'warn' : 'ok'} />
          <Tile label="Due today" value={String(open.filter((t) => t.date === today).length)} icon={Clock} tone="navy" />
          <Tile label="Signed off today" value={String(doneToday.length)} icon={CheckCircle2} tone="ok" />
        </div>

        {!groups.length ? (
          <EmptyState
            icon={CheckCircle2}
            title={mine.length ? 'Nothing waiting on you' : 'No jobs assigned yet'}
            body={
              mine.length
                ? 'Everything on your list has been signed off. Reception can sell these units tonight.'
                : 'When a guest departs, the turnover lands here automatically. Ask a supervisor to assign work if you expected something.'
            }
          />
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 flex items-center justify-between text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
                {group.label}
                <span className={`chip ${group.tone === 'bad' ? 'bg-st-cancelledBg text-st-cancelled' : 'bg-sand-200/70 text-navy-500'}`}>{group.items.length}</span>
              </h2>
              <ul className="space-y-2.5">
                {group.items.map((task) => (
                  <li key={task.id} className="card overflow-hidden">
                    <div className="p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-display text-[1.05rem] text-navy-800">
                            <Building2 size={15} className="text-navy-400" /> Apt {task.apartmentNumber}
                          </p>
                          <p className="mt-0.5 text-[0.8rem] text-navy-500">{task.apartmentName}</p>
                        </div>
                        <StatusChip className={CLEANING_STATUS_META[task.status].chip} dot="bg-current">
                          {CLEANING_STATUS_META[task.status].label}
                        </StatusChip>
                      </div>

                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-navy-500">
                        <span className="chip">{task.type.replace(/_/g, ' ')}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="text-navy-400" /> by {task.dueTime}
                        </span>
                        <span>{formatMediumDate(task.date)}</span>
                        {task.priority === 'high' ? <span className="chip bg-gold-50 text-gold-700">priority</span> : null}
                      </p>

                      {task.instructions ? (
                        <p className="mt-2 rounded-lg bg-sand-100/70 px-2.5 py-2 text-[0.82rem] leading-snug text-navy-600">{task.instructions}</p>
                      ) : null}
                      {task.notes.length ? (
                        <p className="mt-2 text-[0.76rem] italic leading-snug text-navy-400">Last note: “{task.notes[task.notes.length - 1].text}”</p>
                      ) : null}
                    </div>

                    <div className="flex items-stretch gap-px border-t border-sand-200 bg-sand-100">
                      {task.status === 'needs_cleaning' ? (
                        <button type="button" onClick={() => patch(task, { status: 'in_progress' }, `Apt ${task.apartmentNumber} started.`)} disabled={busy} className="btn-ghost flex-1 justify-center rounded-none py-3 text-[0.85rem] font-semibold">
                          <Play size={14} /> Start
                        </button>
                      ) : null}
                      {task.status !== 'clean' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setFinishing(task);
                            setNote(task.instructions ? '' : 'Linens and towels swapped, unit checked.');
                          }}
                          disabled={busy}
                          className="btn-primary flex-1 justify-center rounded-none py-3 text-[0.85rem] font-semibold"
                        >
                          <SprayCan size={14} /> Done
                        </button>
                      ) : (
                        <span className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[0.82rem] font-semibold text-st-available">
                          <CheckCircle2 size={14} /> Signed off {task.completedAt ? task.completedAt.slice(11, 16) : ''}
                        </span>
                      )}
                      {task.status !== 'maintenance' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setFault(task);
                            setNote('');
                          }}
                          disabled={busy}
                          className="btn-ghost flex-1 justify-center rounded-none py-3 text-[0.82rem] font-semibold text-st-cancelled"
                        >
                          <Wrench size={14} /> Fault
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {doneToday.length ? (
          <section>
            <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-navy-400">Completed today</h2>
            <ul className="space-y-1.5">
              {doneToday.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2 text-[0.8rem]">
                  <CheckCircle2 size={13} className="shrink-0 text-st-available" />
                  <span className="min-w-0 flex-1 truncate text-navy-600">
                    Apt {task.apartmentNumber} · {task.type.replace(/_/g, ' ')}
                    {task.notes.length ? ` — ${task.notes[task.notes.length - 1].text}` : ''}
                  </span>
                  <span className="shrink-0 text-navy-400 tnum">{task.completedAt ? task.completedAt.slice(11, 16) : formatMediumDate(task.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="flex items-start gap-1.5 pt-1 text-[0.74rem] leading-relaxed text-navy-400">
          <ShieldAlert size={13} className="mt-px shrink-0" />
          Everything here saves straight to the property database — no simulated app, no offline queue. Guest contact details and money never appear on this screen by design.
        </p>
      </main>

      <Modal
        open={!!finishing}
        onClose={() => !busy && setFinishing(null)}
        size="sm"
        title={finishing ? `Apt ${finishing.apartmentNumber} — what was done?` : 'Complete job'}
        subtitle="The note tells the next shift and reception that the unit is genuinely ready."
        footer={
          <>
            <button type="button" className="btn-ghost h-11 px-3.5" onClick={() => setFinishing(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary h-11 flex-1 justify-center px-4" onClick={complete} disabled={busy}>
              {busy ? 'Saving…' : 'Mark clean'}
            </button>
          </>
        }
      >
        <TextArea label="Completion note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} counter />
      </Modal>

      <Modal
        open={!!fault}
        onClose={() => !busy && setFault(null)}
        size="sm"
        title={fault ? `Fault in Apt ${fault.apartmentNumber}` : 'Report a fault'}
        subtitle="The unit is held out of service until a supervisor clears it."
        footer={
          <>
            <button type="button" className="btn-ghost h-11 px-3.5" onClick={() => setFault(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-danger h-11 flex-1 justify-center px-4" onClick={logFault} disabled={busy || note.trim().length < 5}>
              {busy ? 'Saving…' : 'Log it'}
            </button>
          </>
        }
      >
        <TextArea label="What is wrong?" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} counter placeholder="No hot water in the shower; basin tap drips." />
      </Modal>
    </div>
  );
}

function Tile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Clock; tone: 'warn' | 'ok' | 'navy' }) {
  const cls = tone === 'warn' ? 'bg-gold-50 text-gold-700' : tone === 'ok' ? 'bg-st-availableBg text-st-available' : 'bg-navy-50 text-navy-600';
  return (
    <div className="card p-3">
      <span className={`grid h-7 w-7 place-items-center rounded-lg ${cls}`}>
        <Icon size={14} />
      </span>
      <p className="mt-1.5 font-display text-[1.35rem] leading-none text-navy-800 tnum">{value}</p>
      <p className="mt-1 text-[0.7rem] leading-tight text-navy-400">{label}</p>
    </div>
  );
}
