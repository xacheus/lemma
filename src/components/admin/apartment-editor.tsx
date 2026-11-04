'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { CheckboxRow, DateInput, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { Modal } from '@/components/ui/overlays';
import { Alert, Spinner } from '@/components/ui';
import type { ApartmentView } from '@/lib/view-types';
import { ApartmentPhotoManager } from './apartment-photos';
import { AMENITY_LIBRARY, normaliseAmenities } from '@/lib/domain/amenities';


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

        <AmenityPicker
          selected={draft.amenities}
          onChange={(next) => set({ amenities: next })}
        />

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

/**
 * Amenities manager.
 *
 * Everything is opt-in. Nothing starts ticked (except what the operator already
 * saved), so a unit is never credited with a fitting nobody confirmed. The library
 * covers the usual fittings; anything else can be typed in, because a Lusaka
 * apartment might have something this list has never heard of.
 */
function AmenityPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = useState('');
  const chosen = new Set(selected.map((a) => a.toLowerCase()));
  const groups = Array.from(new Set(AMENITY_LIBRARY.map((a) => a.group)));
  const customSelected = selected.filter(
    (label) => !AMENITY_LIBRARY.some((a) => a.label.toLowerCase() === label.trim().toLowerCase()),
  );

  const toggle = (label: string, on: boolean) =>
    onChange(normaliseAmenities(on ? [...selected, label] : selected.filter((x) => x !== label)));

  return (
    <fieldset className="rounded-xl border border-sand-200 bg-sand-50/60 p-3">
      <legend className="px-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
        Amenities
      </legend>
      <p className="mb-2 px-1 text-[0.75rem] leading-relaxed text-navy-500">
        Tick only what this apartment actually has. Anything left unticked is never shown to
        guests — that is deliberate, so a missing Wi-Fi is simply absent rather than assumed.
      </p>

      {groups.map((group) => (
        <div key={group} className="mb-2.5">
          <p className="mb-1 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-navy-400">
            {group}
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
            {AMENITY_LIBRARY.filter((a) => a.group === group).map((amenity) => {
              const Icon = amenity.icon;
              const checked = chosen.has(amenity.label.toLowerCase());
              return (
                <label
                  key={amenity.key}
                  className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-1 text-[0.79rem] hover:bg-white"
                  title={amenity.hint}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(e) => toggle(amenity.label, e.target.checked)}
                  />
                  <span className="flex items-center gap-1.5 text-navy-700">
                    <Icon size={13} className="shrink-0 text-navy-400" aria-hidden="true" />
                    {amenity.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-2 border-t border-sand-200 pt-2">
        <p className="mb-1 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-navy-400">
          Added by you
        </p>
        {customSelected.length ? (
          <ul className="mb-1.5 flex flex-wrap gap-1.5">
            {customSelected.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => toggle(label, false)}
                  className="inline-flex items-center gap-1 rounded-full border border-sand-300 bg-white px-2 py-0.5 text-[0.75rem] text-navy-700 hover:border-st-cancelled hover:text-st-cancelled"
                >
                  {label} ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-1.5 px-1 text-[0.75rem] text-navy-400">Nothing added by hand.</p>
        )}
        <div className="flex gap-1.5">
          <input
            className="field h-8 flex-1 py-1 text-[0.8rem]"
            value={custom}
            maxLength={40}
            placeholder="e.g. Solar geyser, Private courtyard"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const value = custom.trim();
              if (!value) return;
              onChange(normaliseAmenities([...selected, value]));
              setCustom('');
            }}
          />
          <button
            type="button"
            className="btn-secondary h-8 px-2.5 text-[0.78rem]"
            onClick={() => {
              const value = custom.trim();
              if (!value) return;
              onChange(normaliseAmenities([...selected, value]));
              setCustom('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    </fieldset>
  );
}
