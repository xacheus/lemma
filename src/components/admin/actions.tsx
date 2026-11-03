'use client';

import { useState } from 'react';
import { useApp } from '@/components/providers/app';
import { ConfirmDialog } from '@/components/ui/overlays';
import { formatKwacha } from '@/lib/domain/money';

export interface ConfirmRequest {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'gold';
  run: () => Promise<unknown>;
}

/**
 * Shared arrival/departure/schedule actions with a confirmation step, so a button in
 * the dashboard, the calendar or the folio page all behave identically.
 */
export function useReservationActions() {
  const { request, toast } = useApp();
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [running, setRunning] = useState(false);

  async function run(request_: string, data: unknown, successMessage: string) {
    setRunning(true);
    try {
      await request(request_, { method: 'POST', data });
      toast({ tone: 'success', title: 'Done', body: successMessage });
      return true;
    } catch {
      return false;
    } finally {
      setRunning(false);
    }
  }

  const value = {
    busy: running,
    confirm: (next: ConfirmRequest) => setPending(next),
    checkIn: (id: string, name: string) =>
      run(`/api/reservations/${id}/actions`, { kind: 'action', action: 'check_in' }, `${name} is checked in — keys and folio are live.`),
    checkOut: (id: string, name: string) =>
      run(`/api/reservations/${id}/actions`, { kind: 'action', action: 'check_out' }, `${name} checked out. Housekeeping has the turnover and the apartment releases for resale.`),
    reopen: (id: string, reference: string) =>
      run(`/api/reservations/${id}/actions`, { kind: 'status', status: 'checked_in', note: 'Folio re-opened by reception' }, `${reference} is open again.`),
    acceptInquiry: (id: string, reference: string) =>
      run(`/api/reservations/${id}/actions`, { kind: 'status', status: 'reserved', note: 'Accepted from the website request queue' }, `${reference} now holds these dates.`),
    actions: (
      <ConfirmDialog
        open={!!pending}
        busy={running}
        onClose={() => setPending(null)}
        title={pending?.title ?? ''}
        body={pending?.body}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        tone={pending?.tone ?? 'primary'}
        onConfirm={async () => {
          if (!pending) return;
          await pending.run();
          setPending(null);
        }}
      />
    ),
  };
  return value;
}

export function balanceNote(balance: number) {
  return balance > 0
    ? `The folio still shows ${formatKwacha(balance)} outstanding. Closing the stay moves it to the debtors list rather than writing it off.`
    : 'The folio is settled — closing the stay will free the apartment for cleaning.';
}
