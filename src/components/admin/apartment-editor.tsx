'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { CheckboxRow, DateInput, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { Modal } from '@/components/ui/overlays';
import { Alert, Spinner } from '@/components/ui';
import type { ApartmentView } from '@/lib/view-types';
import { ApartmentPhotoManager } from './apartment-photos';

const AMENITY_LIBRARY = [
  'Wi-Fi',
  'Air conditioning',
  'Backup power',
  'Borehole water',
  'Flat-screen TV',
  'DSTV Explora',
  'Fully fitted kitchen',
  'Microwave',
  'Fridge / freezer',
  'Washer',
  'In-room safe',
  'Work desk',
  'Balcony',
  'Private parking',
  'Step-free access',
  'Daily housekeeping',
  '24/7 security',
  'Kitchenette',
];

const TIERS = [
  { value: 'standard', label: 'Standard Suite' },
  { value: 'deluxe', label: 'Deluxe Suite' },
  { value: 'executive', label: 'Executive Suite' },
  { value: 'family', label: 'Family Apartment' },
  { value: 'premium', label: 'Premium Apartment' },
  { value: 'studio', label: 'Studio Apartment' },
  { value: 'suite', label: 'One-Bedroom Suite' },
];

interface Draft {
  id?: string;
  name: string;
  tier: string;
  tagline: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  floor: number;
  bedConfiguration: string;
  nightlyRate: number;
  amenities: string[];
  photos: string[];
  active: boolean;
  outOfService: boolean;
  houseNotes: string;
}

const BLANK: Draft = {
  name: '',
  tier: 'deluxe',
  tagline: '',
  description: '',
  maxGuests: 2,
  bedrooms: 1,
  bathrooms: 1,
  sizeSqm: 48,
  floor: 1,
  bedConfiguration: '1 queen bed',
  nightlyRate: 1200,
  amenities: ['Wi-Fi', 'Backup power', '24/7 security'],
  photos: [],
  active: true,
  outOfService: false,
  houseNotes: '',
};

export function ApartmentEditor({
  open,
  onClose,
  apartment,
}: {
  open: boolean;
  onClose: () => void;
  apartment?: ApartmentView | null;
}) {
  const { request, toast, snapshot, refresh } = useApp();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (apartment) {
      setDraft({
        id: apartment.id,
        name: apartment.name,
        tier: apartment.tier,
        tagline: apartment.tagline,
        description: apartment.description,
        maxGuests: apartment.maxGuests,
        bedrooms: apartment.bedrooms,
        bathrooms: apartment.bathrooms,
        sizeSqm: apartment.sizeSqm,
        floor: apartment.floor,
        bedConfiguration: apartment.bedConfiguration,
        nightlyRate: apartment.nightlyRate,
        amenities: apartment.amenities,
        photos: apartment.photos,
        active: apartment.active,
        outOfService: apartment.outOfService,
        houseNotes: apartment.houseNotes,
      });
    } else {
      setDraft(BLANK);
    }
  }, [open, apartment]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim().length > 1 && draft.nightlyRate > 0 && draft.maxGuests > 0;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = {
        name: draft.name.trim(),
        tier: draft.tier,
        tagline: draft.tagline.trim(),
        description: draft.description.trim(),
        maxGuests: Number(draft.maxGuests),
        bedrooms: Number(draft.bedrooms),
        bathrooms: Number(draft.bathrooms),
        sizeSqm: Number(draft.sizeSqm),
        floor: Number(draft.floor),
        bedConfiguration: draft.bedConfiguration.trim(),
        nightlyRate: Number(draft.nightlyRate),
        amenities: draft.amenities,
        photos: draft.photos,
        active: draft.active,
        outOfService: draft.outOfService,
        houseNotes: draft.houseNotes.trim(),
      };
      if (draft.id) await request(`/api/apartments/${draft.id}`, { method: 'PATCH', data });
      else await request('/api/apartments', { method: 'POST', data });
      toast({
        tone: 'success',
        title: draft.id ? 'Apartment updated' : 'Apartment created',
        body: draft.id
          ? `${draft.name} saved. New bookings use the new rate; existing folios keep the rate they were booked at.`
          : `${draft.name} is on the books. Check the photograph folder before publishing it to the website.`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The apartment could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={draft.id ? `Edit ${draft.name}` : 'Add an apartment'}
      subtitle="Rate, capacity and out-of-service status feed directly into the availability engine and the public site."
      footer={
        <>
          <button type="button" className="btn-ghost h-10 px-3.5" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary h-10 px-4" onClick={save} disabled={!valid || busy}>
            {busy ? <Spinner size={14} /> : null} {draft.id ? 'Save changes' : 'Create apartment'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error" title="Not saved">{error}</Alert> : null}

        <div className="grid gap-3.5 sm:grid-cols-3">
          <TextInput label="Display name" required value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Deluxe Suite" />
          <SelectInput label="Tier" value={draft.tier} onChange={(e) => set({ tier: e.target.value })} options={TIERS} />
          <TextInput label="Unit code" value={apartment ? `${apartment.code} · Apt ${apartment.number}` : 'Assigned on save'} disabled onChange={() => undefined} hint={draft.id ? undefined : 'Numbers run in sequence.'} />
        </div>

        <TextInput label="Tagline" value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="One line shown under the name on the website." maxLength={120} />

        <TextArea
          label="Description"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={4}
          maxLength={2000}
          counter
          placeholder="Shown to guests on the public site."
        />

        <div className="grid gap-3.5 sm:grid-cols-5">
          <NumberField label="Sleeps" value={draft.maxGuests} min={1} max={12} onChange={(n) => set({ maxGuests: n })} />
          <NumberField label="Bedrooms" value={draft.bedrooms} min={0} max={8} onChange={(n) => set({ bedrooms: n })} />
          <NumberField label="Bathrooms" value={draft.bathrooms} min={1} max={6} onChange={(n) => set({ bathrooms: n })} />
          <NumberField label="Floor" value={draft.floor} min={-3} max={30} onChange={(n) => set({ floor: n })} />
          <MoneyInput label="Nightly rate" value={draft.nightlyRate} onValueChange={(n) => set({ nightlyRate: n })} hint="ZMW, per night" />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <NumberField label="Size (m²)" value={draft.sizeSqm} min={8} max={600} onChange={(n) => set({ sizeSqm: n })} />
          <TextInput label="Bed configuration" value={draft.bedConfiguration} onChange={(e) => set({ bedConfiguration: e.target.value })} placeholder="1 king + 2 singles" />
        </div>

        <fieldset className="rounded-xl border border-sand-200 bg-sand-50/60 p-3">
          <legend className="px-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-navy-400">Amenities</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {AMENITY_LIBRARY.map((amenity) => (
              <CheckboxRow
                key={amenity}
                label={amenity}
                checked={draft.amenities.includes(amenity)}
                onChange={(on) => set({ amenities: on ? [...draft.amenities, amenity] : draft.amenities.filter((a) => a !== amenity) })}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-sand-200 bg-white p-3">
          <legend className="px-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
            Photographs
          </legend>
          {draft.id ? (
            <ApartmentPhotoManager
              apartmentId={draft.id}
              photos={
                (snapshot?.apartments.find((a) => a.id === draft.id)?.gallery as
                  | import('@/lib/domain/types').ApartmentPhoto[]
                  | undefined) ?? []
              }
              onChanged={() => void refresh()}
            />
          ) : (
            <p className="rounded-md border border-dashed border-sand-300 bg-sand-50 px-3 py-4 text-[0.8rem] leading-relaxed text-navy-600">
              Save the apartment first, then upload its photographs here. Uploads are stored in the
              media library and served on the website immediately.
            </p>
          )}
        </fieldset>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextArea label="House notes" value={draft.houseNotes} onChange={(e) => set({ houseNotes: e.target.value })} rows={3} maxLength={600} hint="Internal only — meter codes, quirks, key safe. Never shown to guests." />
          <div className="space-y-2">
            <CheckboxRow
              label="Published on the website"
              checked={draft.active}
              onChange={(on) => set({ active: on })}
              hint="Unpublished units stay bookable by staff but are hidden from the public site."
            />
            <CheckboxRow
              label="Out of service"
              checked={draft.outOfService}
              onChange={(on) => set({ outOfService: on })}
              hint="Blocks new bookings on this unit. Refused while future stays exist — cancel or move them first."
            />
            {draft.photos.length > 0 ? (
              <p className="rounded-md border border-sand-200 bg-sand-50 px-2.5 py-2 text-[0.74rem] leading-relaxed text-navy-500">
                {draft.photos.length} photograph{draft.photos.length === 1 ? '' : 's'} attached. The
                cover is chosen in the gallery above, not by file order.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <TextInput
      label={label}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={String(value)}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}
