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
    <div className="space-y-7">
      <div id="availability" className="animate-fade-up scroll-mt-24 text-center">
        <span className="eyebrow">Properties in Lusaka</span>
        <h1 className="mt-1.5 font-heading text-[2rem] font-extrabold tracking-[-0.01em] sm:text-[2.5rem]">
          Apartments &amp; availability
        </h1>
        {publishedTotal > 0 ? (
          <p className="mx-auto mt-2 max-w-2xl text-[0.95rem] text-swdl-muted">
            Showing {formatMediumDate(initialCheckIn)} to {formatMediumDate(initialCheckOut)} ·{' '}
            <strong className="font-semibold text-swdl-navy">
              {availableCount} of {filtered.length}
            </strong>{' '}
            {filtered.length === 1 ? 'apartment' : 'apartments'} open for {initialGuests}{' '}
            {initialGuests === 1 ? 'guest' : 'guests'}.
          </p>
        ) : (
          <p className="mx-auto mt-2 max-w-2xl text-[0.95rem] text-swdl-muted">
            Online apartment listings are currently being updated. Call reception to check
            availability and receive a written ZMW quotation for your dates.
          </p>
        )}
      </div>

      {/* Filter & Availability Bar */}
      <form
        onSubmit={applySearch}
        className="swdl-card grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6"
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
          <label className="flex h-[42px] w-full cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-[#DFE3E8] bg-swdl-card px-3.5 font-heading text-[0.8rem] font-semibold text-swdl-navy transition-colors hover:border-swdl-gold">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="rounded border-[#DFE3E8] accent-[#A8823F]"
            />
            Available only
          </label>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-navy h-[42px] w-full justify-center">
            <Search size={14} /> Update search
          </button>
        </div>
      </form>

      {/* Apartment Cards */}
      {filtered.length === 0 ? (
        <div className="swdl-card px-6 py-14 text-center">
          <Building2 size={24} className="mx-auto text-swdl-goldDark" />
          <h2 className="mt-3 font-heading text-[1.3rem] font-bold">
            {publishedTotal === 0
              ? 'Online apartment listings are being updated'
              : 'No apartment matches your selected dates or filters'}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[0.9rem] leading-relaxed text-swdl-muted">
            {publishedTotal === 0
              ? 'Call reception directly and our front desk will confirm availability for your dates and send a quotation.'
              : 'Try adjusting your arrival dates or party size, or call reception to check upcoming departures.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="btn btn-gold px-6 py-2.5">
              <Phone size={14} /> Call reception ({phone})
            </a>
            {publishedTotal > 0 ? (
              <button
                type="button"
                className="btn btn-navy px-6 py-2.5"
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
            const cover = apt.coverPhoto || apt.photos[0];
            const detailHref = `/apartments/${apt.slug}?checkIn=${encodeURIComponent(initialCheckIn)}&checkOut=${encodeURIComponent(initialCheckOut)}&guests=${initialGuests}`;
            return (
              <article
                key={apt.id}
                className="swdl-card swdl-card-hover group flex flex-col overflow-hidden"
              >
                <Link href={detailHref} className="img-zoom relative block overflow-hidden">
                  <PhotoFrame
                    src={cover}
                    alt={apt.name}
                    ratio="16 / 10"
                    variant="card"
                  />
                  <span
                    className={`swdl-tag absolute left-3.5 top-3.5 inline-flex items-center gap-1 ${
                      item.isAvailable ? 'swdl-tag-open' : 'swdl-tag-dark'
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

                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-2 text-[0.74rem] text-swdl-muted">
                    <span className="font-heading font-bold uppercase tracking-[0.12em] text-swdl-goldDark">
                      {APARTMENT_TIER_LABELS[apt.tier] || apt.tier} · {apt.code}
                    </span>
                    <span>
                      {apt.floor === 0 ? 'Ground floor' : `Floor ${apt.floor}`}
                    </span>
                  </div>

                  <Link href={detailHref}>
                    <h2 className="mt-1.5 font-heading text-[1.18rem] font-bold transition-colors duration-200 group-hover:text-swdl-goldDark">
                      {apt.name}
                    </h2>
                  </Link>
                  <p className="mt-2 line-clamp-2 text-[0.88rem] leading-relaxed text-swdl-muted">
                    {apt.tagline || apt.description}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[#EEE] pt-3.5 text-[0.82rem] text-swdl-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users size={14} className="text-swdl-goldDark" /> Up to {apt.maxGuests}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BedDouble size={14} className="text-swdl-goldDark" />{' '}
                      {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} bed`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bath size={14} className="text-swdl-goldDark" /> {apt.bathrooms} bath
                    </span>
                    {apt.sizeSqm ? (
                      <span className="inline-flex items-center gap-1">
                        <Maximize2 size={14} className="text-swdl-goldDark" /> {apt.sizeSqm} m²
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto pt-4">
                    <div className="flex items-end justify-between gap-3 border-t border-[#EEE] pt-3.5">
                      <div>
                        <div className="font-heading text-[1.2rem] font-extrabold tabular-nums text-swdl-goldDark">
                          {formatKwacha(item.effectiveRate)}
                          <span className="font-body text-[0.78rem] font-normal text-swdl-muted"> / night</span>
                        </div>
                        <p className="text-[0.78rem] tabular-nums text-swdl-muted">
                          {item.nights} {item.nights === 1 ? 'night' : 'nights'}:{' '}
                          {formatKwacha(item.stayTotal)} total
                        </p>
                      </div>

                      <Link
                        href={item.isAvailable ? `${detailHref}#book` : detailHref}
                        className={`btn px-4 py-2 text-[0.8rem] ${
                          item.isAvailable ? 'btn-gold' : 'btn-navy'
                        }`}
                      >
                        {item.isAvailable ? 'Request dates' : 'View details'}
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
