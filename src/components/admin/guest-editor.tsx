'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { CheckboxRow, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { Modal } from '@/components/ui/overlays';
import { Alert, Spinner } from '@/components/ui';
import type { Guest } from '@/lib/domain/types';

const SOURCES = [
  { value: 'website', label: 'Website enquiry' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone call' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'corporate', label: 'Corporate account' },
  { value: 'email', label: 'Email' },
  { value: 'travel_agent', label: 'Travel agent' },
];

export const GUEST_SOURCE_LABELS: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]));

interface Draft {
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  idType: 'nrc' | 'passport';
  nationality: string;
  city: string;
  company: string;
  vip: boolean;
  specialRequests: string;
  internalNotes: string;
  source: string;
}

const BLANK: Draft = {
  fullName: '',
  phone: '',
  email: '',
  nationalId: '',
  idType: 'nrc',
  nationality: 'Zambia',
  city: 'Lusaka',
  company: '',
  vip: false,
  specialRequests: '',
  internalNotes: '',
  source: 'phone',
};

/**
 * Create or amend a guest record. Bookings are never made from here — this dialog
 * only maintains the register, so a receptionist can save a caller before quoting
 * availability.
 */
export function GuestEditor({
  open,
  onClose,
  guest,
}: {
  open: boolean;
  onClose: () => void;
  guest?: Guest | null;
}) {
  const { request, toast } = useApp();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      guest
        ? {
            ...BLANK,
            ...guest,
            nationalId: '',
            source: guest.source ?? 'phone',
          }
        : BLANK,
    );
  }, [open, guest]);

  const valid = draft.fullName.trim().length > 1 && draft.phone.trim().length >= 6;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = {
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        ...(draft.nationalId.trim() ? { nationalId: draft.nationalId.trim(), idType: draft.idType } : {}),
        nationality: draft.nationality.trim(),
        city: draft.city.trim(),
        company: draft.company.trim(),
        vip: draft.vip,
        specialRequests: draft.specialRequests.trim(),
        internalNotes: draft.internalNotes.trim(),
        source: draft.source,
      };
      if (guest?.id) await request(`/api/guests/${guest.id}`, { method: 'PATCH', data });
      else await request('/api/guests', { method: 'POST', data });
      toast({
        tone: 'success',
        title: guest ? 'Guest updated' : 'Guest added',
        body: guest ? `${draft.fullName}'s record is saved.` : `${draft.fullName} can now be attached to a booking.`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The guest could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={guest ? `Edit ${guest.fullName}` : 'Add a guest'}
      subtitle={
        guest
          ? 'Changes apply to this record only — folios already issued keep the details they were printed with.'
          : 'Create the record first, then attach it when you take the booking.'
      }
      footer={
        <>
          <button type="button" className="btn-ghost h-10 px-3.5" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary h-10 px-4" onClick={save} disabled={!valid || busy}>
            {busy ? <Spinner size={14} /> : null} {guest ? 'Save changes' : 'Create record'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error" title="Not saved">{error}</Alert> : null}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextInput label="Full name" required value={draft.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="John Banda" />
          <TextInput label="Phone" required value={draft.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+260 977 123 4567" hint="Mobile number used for WhatsApp" />
          <TextInput label="Email" type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} placeholder="john@example.com" error={draft.email && !/^\S+@\S+\.\S+$/.test(draft.email) ? 'That address looks incomplete.' : null} />
          <SelectInput label="How did they reach us?" value={draft.source} onChange={(e) => set({ source: e.target.value })} options={SOURCES} />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-4">
          <SelectInput label="ID type" value={draft.idType} onChange={(e) => set({ idType: e.target.value as Draft['idType'] })} options={[{ value: 'nrc', label: 'NRC' }, { value: 'passport', label: 'Passport' }]} />
          <div className="sm:col-span-2">
            <TextInput
              label={guest ? 'ID number (unchanged)' : 'NRC / passport number'}
              value={draft.nationalId}
              onChange={(e) => set({ nationalId: e.target.value })}
              placeholder={guest?.idType === 'passport' ? 'A1234567' : '123456/51/1'}
              hint={guest ? (guest.nationalId ? `On file: ${maskId(guest.nationalId)}` : 'Nothing on file yet.') : 'Required at check-in under the Hospitality Act.'}
            />
          </div>
          <TextInput label="Nationality" value={draft.nationality} onChange={(e) => set({ nationality: e.target.value })} />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextInput label="City / town" value={draft.city} onChange={(e) => set({ city: e.target.value })} />
          <TextInput label="Company (corporate accounts)" value={draft.company} onChange={(e) => set({ company: e.target.value })} placeholder="Baraka Farms Ltd" />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextArea label="Standing preferences" value={draft.specialRequests} onChange={(e) => set({ specialRequests: e.target.value })} rows={3} maxLength={600} counter hint="Carried onto every new booking, e.g. high floor, early check-in." />
          <TextArea label="Internal notes" value={draft.internalNotes} onChange={(e) => set({ internalNotes: e.target.value })} rows={3} maxLength={1200} counter hint="Staff only. Never shown to the guest or printed on a receipt." />
        </div>

        <CheckboxRow label="Treat as VIP" checked={draft.vip} onChange={(on) => set({ vip: on })} hint="Flags the record in the register and on the folio so the desk prepares the unit." />
      </div>
    </Modal>
  );
}

export function maskId(value: string): string {
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(3, value.length - 4))}${value.slice(-4)}`;
}
