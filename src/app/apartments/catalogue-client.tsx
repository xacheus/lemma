'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bath, BedDouble, CheckCircle2, Maximize2, Search, Users, XCircle } from 'lucide-react';
import type { Apartment } from '@/lib/domain/types';
import { APARTMENT_TIER_LABELS } from '@/lib/domain/status';
import { PhotoFrame } from '@/components/ui/photo';

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
}: {
  units: CatalogueUnit[];
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  initialTier: string;
  today: string;
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
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
          Live Inventory &amp; ZMW Rates
        </p>
        <h1 className="mt-1 text-[1.85rem] font-bold tracking-tight text-navy-900">
          Serviced Apartments &amp; Availability
        </h1>
        <p className="mt-1.5 text-[0.9rem] text-navy-600">
          Showing real-time availability for {initialCheckIn} to {initialCheckOut} ({units[0]?.nights ?? 1}{' '}
          {(units[0]?.nights ?? 1) === 1 ? 'night' : 'nights'}) — {availableCount} of {filtered.length}{' '}
          apartments available for immediate booking.
        </p>
      </div>

      {/* Filter & Availability Bar */}
      <form
        onSubmit={applySearch}
        className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
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
            onChange={(e) => setCheckIn(e.target.value)}
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const { apartment: apt } = item;
          const detailHref = `/apartments/${apt.slug}?checkIn=${encodeURIComponent(initialCheckIn)}&checkOut=${encodeURIComponent(initialCheckOut)}&guests=${initialGuests}`;
          return (
            <article
              key={apt.id}
              className="card flex flex-col overflow-hidden transition hover:border-lemma"
            >
              <Link href={detailHref} className="relative block">
                <PhotoFrame
                  src={apt.coverPhoto || apt.photos[0]}
                  alt={apt.name}
                  ratio="16 / 10"
                  variant="card"
                />
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
                  <span>{APARTMENT_TIER_LABELS[apt.tier] || apt.tier}</span>
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
    </div>
  );
}
