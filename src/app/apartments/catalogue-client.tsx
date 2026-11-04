'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Bath,
  BedDouble,
  Building2,
  CheckCircle2,
  Maximize2,
  Phone,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import type { Apartment } from '@/lib/domain/types';
import { addISO, formatMediumDate } from '@/lib/domain/dates';
import { formatKwacha } from '@/lib/domain/money';
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
  const hasSamples = units.some((u) => isSampleListing(u.apartment));

  return (
    <div className="space-y-7">
      <div id="availability" className="animate-fade-up scroll-mt-24">
        <h1 className="font-display text-[2rem] font-medium tracking-[-0.015em] text-navy-900 sm:text-[2.3rem]">
          Apartments &amp; availability
        </h1>
        {publishedTotal > 0 ? (
          <p className="mt-1.5 text-[0.92rem] text-sand-700">
            Showing {formatMediumDate(initialCheckIn)} to {formatMediumDate(initialCheckOut)} ·{' '}
            <strong className="font-semibold text-navy-900">
              {availableCount} of {filtered.length}
            </strong>{' '}
            {filtered.length === 1 ? 'apartment' : 'apartments'} open for {initialGuests}{' '}
            {initialGuests === 1 ? 'guest' : 'guests'}.
          </p>
        ) : (
          <p className="mt-1.5 text-[0.92rem] text-sand-700">
            Online apartment listings are being finalised. Call reception to check availability and
            get a direct ZMW quote for your dates.
          </p>
        )}
      </div>

      {/* Filter & Availability Bar */}
      <form
        onSubmit={applySearch}
        className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div>
          <label className="label mb-1 block" htmlFor="cat-in">
            Arrival
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
            Departure
          </label>
          <input
            id="cat-out"
            type="date"
            min={addISO(checkIn, 1)}
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
                {n} {n === 1 ? 'guest' : 'guests'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="cat-tier">
            Apartment type
          </label>
          <select
            id="cat-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="field"
          >
            <option value="all">All types</option>
            {Object.entries(APARTMENT_TIER_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex h-[38px] w-full cursor-pointer items-center gap-2 rounded-md border border-sand-300 bg-sand-50 px-3 text-[0.8rem] font-medium text-navy-800">
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
          <button type="submit" className="btn btn-primary h-[38px] w-full justify-center">
            <Search size={14} /> Update search
          </button>
        </div>
      </form>

      {hasSamples ? (
        <div className="rounded-lg border border-sand-300/80 bg-white px-4 py-3 text-[0.81rem] leading-relaxed text-sand-700">
          <strong className="font-semibold text-navy-900">Sample catalogue notice:</strong>{' '}
          Units labelled <em>Example</em> use representative stock interiors. Reception confirms the
          specific apartment and final ZMW rate before you send any deposit.
        </div>
      ) : null}

      {/* Apartment Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sand-300 bg-white px-6 py-14 text-center">
          <Building2 size={24} className="mx-auto text-lemma-dark" />
          <h2 className="mt-3 font-display text-[1.25rem] font-medium text-navy-900">
            {publishedTotal === 0
              ? 'No apartments are listed for online booking yet'
              : 'No apartment matches your selected dates or filters'}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[0.88rem] leading-relaxed text-sand-700">
            {publishedTotal === 0
              ? 'Call reception and we will confirm availability for your dates and send a quotation directly.'
              : 'Try adjusting your arrival dates or party size, or call reception to check upcoming departures.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="btn btn-primary">
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
                Reset filters
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const { apartment: apt } = item;
            const sample = isSampleListing(apt);
            const cover = apt.coverPhoto || apt.photos[0];
            const detailHref = `/apartments/${apt.slug}?checkIn=${encodeURIComponent(initialCheckIn)}&checkOut=${encodeURIComponent(initialCheckOut)}&guests=${initialGuests}`;
            return (
              <article
                key={apt.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-sand-200 bg-white shadow-card transition-all duration-300 hover:border-sand-300 hover:shadow-pop"
              >
                <Link href={detailHref} className="img-zoom relative block overflow-hidden">
                  <PhotoFrame
                    src={cover}
                    alt={apt.name}
                    ratio="16 / 10"
                    variant="card"
                  />
                  {isRepresentativeImage(cover) ? (
                    <span className="absolute bottom-2.5 right-2.5 rounded bg-charcoal-950/70 px-2 py-0.5 text-[0.64rem] font-medium text-white/85 backdrop-blur-sm">
                      Representative photo
                    </span>
                  ) : null}
                  <span
                    className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                      item.isAvailable
                        ? 'bg-[#124230]/90 text-[#b4f0cf]'
                        : 'bg-charcoal-950/80 text-white/85'
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
                  <div className="flex items-center justify-between gap-2 text-[0.74rem] text-sand-600">
                    <span className="font-medium text-lemma-dark">
                      {APARTMENT_TIER_LABELS[apt.tier] || apt.tier} · {apt.code}
                    </span>
                    <span className="text-sand-600">
                      {apt.floor === 0 ? 'Ground floor' : `Floor ${apt.floor}`}
                      {sample ? ' · Example' : ''}
                    </span>
                  </div>

                  <Link href={detailHref}>
                    <h2 className="mt-1.5 font-display text-[1.2rem] font-medium text-navy-900 group-hover:text-lemma-dark">
                      {apt.name}
                    </h2>
                  </Link>
                  <p className="mt-1.5 line-clamp-2 text-[0.84rem] leading-relaxed text-sand-700">
                    {apt.tagline || apt.description}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-sand-200/80 pt-3.5 text-[0.78rem] text-sand-700">
                    <span className="inline-flex items-center gap-1">
                      <Users size={13} className="text-lemma-dark" /> Up to {apt.maxGuests}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BedDouble size={13} className="text-lemma-dark" />{' '}
                      {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} bed`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bath size={13} className="text-lemma-dark" /> {apt.bathrooms} bath
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Maximize2 size={13} className="text-lemma-dark" /> {apt.sizeSqm} m²
                    </span>
                  </div>

                  <div className="mt-auto pt-4">
                    <div className="flex items-end justify-between gap-3 border-t border-sand-200/80 pt-3.5">
                      <div>
                        <div className="text-[1.15rem] font-bold tabular-nums text-navy-900">
                          {formatKwacha(item.effectiveRate)}
                          <span className="text-[0.76rem] font-normal text-sand-600"> / night</span>
                        </div>
                        <p className="text-[0.75rem] tabular-nums text-sand-600">
                          {item.nights} {item.nights === 1 ? 'night' : 'nights'}:{' '}
                          {formatKwacha(item.stayTotal)} total
                        </p>
                      </div>

                      <Link
                        href={item.isAvailable ? `${detailHref}#book` : detailHref}
                        className={`btn py-2 text-[0.8rem] ${
                          item.isAvailable ? 'btn-primary' : 'btn-secondary'
                        }`}
                      >
                        {item.isAvailable
                          ? sample
                            ? 'Send an enquiry'
                            : 'Request dates'
                          : 'View details'}
                      </Link>
                    </div>
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
