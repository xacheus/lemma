'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bath, BedDouble, Building2, CheckCircle2, Maximize2, Phone, Search, Users, XCircle } from 'lucide-react';
import type { Apartment } from '@/lib/domain/types';
import { addISO } from '@/lib/domain/dates';
import { isSampleListing } from '@/lib/domain/sample-listings';
import { APARTMENT_TIER_LABELS } from '@/lib/domain/status';
import { PhotoFrame } from '@/components/ui/photo';
import { isRepresentativeImage } from '@/lib/cloudinary/urls';

interface CatalogueUnit {
  apartment: Apartment;
  isAvailable: boolean;
  fitsGuests: boolean;
  nights: number;
  stayTotal: number;
  effectiveRate: number;
  depositRequired: number;
}

export function ApartmentsCatalogueClient({
  units,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  initialTier,
  today,
  publishedTotal,
  phone,
}: {
  units: CatalogueUnit[];
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  initialTier: string;
  today: string;
  publishedTotal: number;
  phone: string;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState(initialGuests);
  const [tier, setTier] = useState(initialTier);
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({
      checkIn,
      checkOut,
      guests: String(guests),
    });
    if (tier !== 'all') params.set('tier', tier);
    router.push(`/apartments?${params.toString()}`);
  }

  const filtered = units.filter((u) => {
    if (tier !== 'all' && u.apartment.tier !== tier) return false;
    if (onlyAvailable && !u.isAvailable) return false;
    return true;
  });

  const availableCount = filtered.filter((u) => u.isAvailable).length;

  return (
    <div className="space-y-8">
      {/* Anchor for the menu's "Check availability" entry (`/apartments#availability`):
          jumping here puts the date pickers under the reader instead of the page title. */}
      <div id="availability" className="animate-fade-up scroll-mt-24">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
          Apartments &amp; rates
        </p>
        <h1 className="mt-1 text-[1.85rem] font-bold tracking-tight text-navy-900">
          Serviced Apartments &amp; Availability
        </h1>
        {publishedTotal > 0 ? (
          <p className="mt-1.5 text-[0.9rem] text-navy-600">
            For {initialCheckIn} to {initialCheckOut}, {availableCount} of {filtered.length}{' '}
            {filtered.length === 1 ? 'apartment is' : 'apartments are'} available to enquire about.
            Reception confirms your dates and final quote.
          </p>
        ) : (
          <p className="mt-1.5 text-[0.9rem] text-navy-600">
            The residence list has not been published yet. Reception can confirm what is free for
            your dates and hold it for you.
          </p>
        )}
        {units.some((u) => isSampleListing(u.apartment)) ? (
          <p className="mt-2 text-[0.8rem] text-navy-600">
            Example listings need confirmation from reception before you book or pay. Photos marked
            representative are stock images, not photographs of these apartments.
          </p>
        ) : null}
      </div>

      {/* Filter & Availability Bar */}
      <form
        onSubmit={applySearch}
        className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div>
          <label className="label mb-1 block" htmlFor="cat-in">
            Check-in
          </label>
          <input
            id="cat-in"
            type="date"
            min={today}
            value={checkIn}
            onChange={(e) => {
              const next = e.target.value;
              setCheckIn(next);
              if (checkOut <= next) setCheckOut(addISO(next, 1));
            }}
            className="field"
            required
          />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="cat-out">
            Check-out
          </label>
          <input
            id="cat-out"
            type="date"
            min={checkIn}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="field"
            required
          />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="cat-guests">
            Guests
          </label>
          <select
            id="cat-guests"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="field"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'Guest' : 'Guests'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="cat-tier">
            Suite Category
          </label>
          <select
            id="cat-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="field"
          >
            <option value="all">All Categories</option>
            {Object.entries(APARTMENT_TIER_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex h-[38px] w-full cursor-pointer items-center gap-2 rounded-md border border-sand-300 bg-sand-50 px-3 text-[0.8rem] font-medium text-navy-700">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="rounded border-sand-400"
            />
            Available only
          </label>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full justify-center">
            <Search size={14} /> Update Dates
          </button>
        </div>
      </form>

      {/* Apartment Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sand-300 bg-white px-6 py-14 text-center">
          <Building2 size={24} className="mx-auto text-lemma" />
          <h2 className="mt-3 text-[1.1rem] font-semibold text-navy-900">
            {publishedTotal === 0
              ? 'No apartments are listed for online booking yet'
              : 'No apartment matches these dates'}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[0.88rem] leading-relaxed text-navy-600">
            {publishedTotal === 0
              ? 'Our residence list is being finalised. Call reception and we will confirm availability for your dates and quote you directly.'
              : 'Every unit is either booked or too small for this party. Try a different date range or speak to reception about a cancellation.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <a href={`tel:${phone}`} className="btn btn-primary">
              <Phone size={14} /> Call reception ({phone})
            </a>
            {publishedTotal > 0 ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setOnlyAvailable(false);
                  setTier('all');
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="stagger grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const { apartment: apt } = item;
          const detailHref = `/apartments/${apt.slug}?checkIn=${encodeURIComponent(initialCheckIn)}&checkOut=${encodeURIComponent(initialCheckOut)}&guests=${initialGuests}`;
          return (
            <article
              key={apt.id}
              className="card hover-lift group flex flex-col overflow-hidden hover:border-brand-300 hover:shadow-pop"
            >
              <Link href={detailHref} className="img-zoom relative block overflow-hidden">
                <PhotoFrame
                  src={apt.coverPhoto || apt.photos[0]}
                  alt={apt.name}
                  ratio="16 / 10"
                  variant="card"
                />
                {isRepresentativeImage(apt.coverPhoto || apt.photos[0]) ? (
                  <span className="absolute bottom-3 left-3 rounded bg-charcoal-950/75 px-2 py-1 text-[0.65rem] text-white">
                    Representative photo
                  </span>
                ) : null}
                <span
                  className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[0.7rem] font-semibold ${
                    item.isAvailable
                      ? 'bg-st-availableBg text-st-available ring-1 ring-st-available/30'
                      : 'bg-white/95 text-navy-700 ring-1 ring-sand-300'
                  }`}
                >
                  {item.isAvailable ? (
                    <>
                      <CheckCircle2 size={12} /> Available
                    </>
                  ) : !item.fitsGuests ? (
                    <>
                      <XCircle size={12} /> Max {apt.maxGuests} guests
                    </>
                  ) : (
                    <>
                      <XCircle size={12} /> Booked for dates
                    </>
                  )}
                </span>
              </Link>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-lemma-dark">
                  <span>{APARTMENT_TIER_LABELS[apt.tier] || apt.tier}{isSampleListing(apt) ? ' · Example listing' : ''}</span>
                  <span>
                    Floor {apt.floor === 0 ? 'Ground' : apt.floor} · {apt.code}
                  </span>
                </div>

                <Link href={detailHref}>
                  <h2 className="mt-1.5 text-[1.1rem] font-semibold text-navy-900 hover:text-lemma-dark">
                    {apt.name}
                  </h2>
                </Link>
                <p className="mt-1.5 line-clamp-2 text-[0.83rem] text-navy-600">
                  {apt.tagline || apt.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-3 border-t border-sand-200 pt-3.5 text-[0.77rem] text-navy-600">
                  <span className="inline-flex items-center gap-1">
                    <Users size={13} /> Max {apt.maxGuests}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BedDouble size={13} /> {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} Bed`}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bath size={13} /> {apt.bathrooms} Bath
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Maximize2 size={13} /> {apt.sizeSqm} m²
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-sand-200 pt-4">
                  <div>
                    <div className="text-[1.12rem] font-bold text-navy-900 tabular-nums">
                      K{item.effectiveRate.toLocaleString('en-US')}
                      <span className="text-[0.76rem] font-normal text-navy-500"> / night</span>
                    </div>
                    <p className="text-[0.75rem] text-navy-500 tabular-nums">
                      {item.nights} {item.nights === 1 ? 'night' : 'nights'}: K
                      {item.stayTotal.toLocaleString('en-US')} total
                    </p>
                  </div>

                  <Link
                    href={detailHref}
                    className={`btn py-1.5 text-[0.8rem] ${
                      item.isAvailable ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    {item.isAvailable ? 'Select & Book' : 'View Suite'}
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      )}
    </div>
  );
}
