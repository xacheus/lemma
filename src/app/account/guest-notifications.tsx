'use client';

import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { NotificationRecord } from '@/lib/domain/types';

/**
 * The guest's own notification list. Records are restricted server-side to the
 * bookings and guest profile that belong to this account; the unread count and
 * read state are held by the API, not by this component.
 */
export function GuestNotifications({
  notifications,
  onChanged,
}: {
  notifications: NotificationRecord[];
  onChanged?: (updated: NotificationRecord[]) => void;
}) {
  const [rows, setRows] = useState<NotificationRecord[]>(notifications);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => setRows(notifications), [notifications]);

  const unread = useMemo(() => rows.filter((n) => !n.readAt).length, [rows]);

  async function setRead(ids: string[], read: boolean) {
    const targets = rows.filter((n) => ids.includes(n.id) && Boolean(n.readAt) !== read);
    if (!targets.length) return;
    setBusy('read');
    setError('');
    let updated = rows;
    try {
      for (const n of targets) {
        const response = await fetch(`/api/notifications/${n.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ read }),
        });
        if (!response.ok) throw new Error('Unable to update notification');
        const data = await response.json();
        updated = updated.map((item) => item.id === n.id ? { ...item, readAt: data.data.notification.readAt } : item);
        setRows(updated);
        onChanged?.(updated);
      }
    } catch {
      setError('Could not update the notification. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Bell size={20} className="mx-auto text-navy-400" />
        <p className="mt-2 text-[0.92rem] font-medium text-navy-800">No notifications yet.</p>
        <p className="mt-1 text-[0.83rem] leading-relaxed text-navy-500">
          Confirmations, payment updates and arrival reminders for your bookings will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.84rem] text-navy-600">
          {unread > 0 ? (
            <>
              <span className="font-semibold text-navy-900">{unread}</span> unread
            </>
          ) : (
            'All caught up'
          )}
        </p>
        {unread > 0 ? (
          <button
            type="button"
            className="btn btn-secondary py-1.5 text-[0.78rem]"
            disabled={busy !== null}
            onClick={() => void setRead(rows.map((n) => n.id), true)}
          >
            <CheckCheck size={13} /> Mark all as read
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-sm text-st-cancelled">{error}</p> : null}
      <ul className="divide-y divide-sand-200 overflow-hidden rounded-lg border border-sand-200 bg-white">
        {rows
          .slice()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? '' : 'bg-brand-50/40'}`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-sand-300' : 'bg-lemma-dark'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[0.87rem] font-semibold text-navy-900">{n.title}</p>
                  <time className="text-[0.72rem] text-navy-400" dateTime={n.createdAt}>
                    {new Date(n.createdAt).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p className="mt-0.5 whitespace-pre-line text-[0.83rem] leading-relaxed text-navy-600">
                  {n.body}
                </p>
                <div className="mt-1 flex flex-wrap gap-4">
                  <button type="button" disabled={busy !== null} onClick={() => void setRead([n.id], !n.readAt)} className="text-[0.75rem] font-medium text-lemma-dark hover:underline">
                    {n.readAt ? 'Mark as unread' : 'Mark as read'}
                  </button>
                  {n.href?.startsWith('/') && !n.href.startsWith('//') ? <Link className="text-[0.75rem] font-medium text-lemma-dark hover:underline" href={n.href}>View details</Link> : null}
                </div>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
