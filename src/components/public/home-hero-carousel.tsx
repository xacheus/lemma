'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bath, BedDouble, ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react';
import { formatKwacha } from '@/lib/domain/money';
import { optimizeImageUrl, representativePhotoUrl } from '@/lib/cloudinary/urls';

export interface HeroSlide {
  id: string;
  slug: string;
  name: string;
  code: string;
  tagline: string;
  nightlyRate: number;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  photo: string;
  representative: boolean;
  sample: boolean;
  available: boolean;
  availabilityNote: string;
}

const INTERVAL_MS = 7500;
const FADE_MS = 1200;

export function HomeHeroCarousel({
  slides,
  stayQuery,
  propertyName,
  addressLine,
  city,
}: {
  slides: HeroSlide[];
  stayQuery: string;
  propertyName: string;
  totalApartments?: number;
  addressLine?: string;
  city?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (paused || count < 2 || reducedMotion) return;
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        schedule();
      }, INTERVAL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paused, count, reducedMotion]);

  if (count === 0) return null;
  const active = slides[Math.min(index, count - 1)];
  const locationLabel = [addressLine, city || 'Lusaka'].filter(Boolean).join(', ');

  return (
    <section
      className="relative isolate overflow-hidden bg-charcoal-950 text-white"
      aria-roledescription="carousel"
      aria-label="Apartment photographs"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(index + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(index - 1);
        }
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        if (Math.abs(delta) > 45) go(index + (delta < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div className="relative min-h-[29rem] w-full sm:h-[68svh] lg:h-[74svh]">
        {slides.map((slide, i) => {
          const isActive = i === index;
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className="absolute inset-0 will-change-[opacity]"
              style={{
                opacity: isActive ? 1 : 0,
                transition: `opacity ${reducedMotion ? 0 : FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={representativePhotoUrl(slide.photo, 'hero') ?? optimizeImageUrl(slide.photo, 'hero')}
                onError={(event) => {
                  if (slide.representative && !event.currentTarget.src.endsWith(slide.photo)) {
                    event.currentTarget.src = slide.photo;
                  }
                }}
                alt={slide.representative ? `Representative furnished interior for ${slide.name}` : `Interior of ${slide.name}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                decoding="async"
                className="h-full w-full object-cover"
                style={{
                  transform: isActive && !reducedMotion ? 'scale(1.05)' : 'scale(1)',
                  transition: `transform ${reducedMotion ? 0 : INTERVAL_MS + FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                }}
              />
            </div>
          );
        })}

        {/* Warm dark scrims for natural contrast */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(14,18,22,0.92)_0%,rgba(14,18,22,0.52)_42%,rgba(14,18,22,0.16)_75%,rgba(14,18,22,0.32)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(14,18,22,0.74)_0%,rgba(14,18,22,0.28)_58%,transparent_100%)]" />

        <div className="relative z-10 mx-auto flex h-full min-h-[29rem] max-w-7xl flex-col justify-end px-4 pb-10 pt-20 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-white/80">
              <MapPin size={13} className="text-gold-300" aria-hidden="true" />
              <span>{propertyName} · {locationLabel}</span>
            </p>

            <h1 className="mt-3 font-display text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] text-white sm:text-[2.75rem] lg:text-[3.25rem]">
              Furnished apartments in Lusaka,{' '}
              <span className="text-white/80">set up for a night or a month.</span>
            </h1>

            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/80">
              Self-catering studios, one-bedroom and family units with backup power, reliable Wi-Fi
              and secure compound parking—priced clearly in Zambian Kwacha and managed directly at our front desk.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/apartments?${stayQuery}#availability`}
                className="btn bg-white px-5 py-2.5 text-[0.86rem] font-semibold text-charcoal-950 transition-colors hover:bg-sand-100"
              >
                Check availability <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href={`/apartments/${active.slug}?${stayQuery}#book`}
                className="btn border border-white/35 bg-charcoal-950/30 px-4 py-2.5 text-[0.86rem] text-white backdrop-blur-sm transition-colors hover:border-white/70 hover:bg-white/10"
              >
                View {active.name}
              </Link>
            </div>
          </div>

          {/* Structured bottom bar for the currently shown apartment */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-[0.79rem] text-white/80">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
              <span className="font-semibold text-white">{active.name}</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium ${
                  active.available ? 'bg-[#124230]/90 text-[#b4f0cf]' : 'bg-white/15 text-white/80'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${active.available ? 'bg-[#66dc9f]' : 'bg-white/55'}`}
                />
                {active.availabilityNote}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={13} aria-hidden="true" /> Sleeps {active.maxGuests}
              </span>
              <span className="inline-flex items-center gap-1">
                <BedDouble size={13} aria-hidden="true" />
                {active.bedrooms === 0 ? 'Studio' : `${active.bedrooms} bed`}
              </span>
              <span className="inline-flex items-center gap-1">
                <Bath size={13} aria-hidden="true" /> {active.bathrooms} bath
              </span>
              <span className="font-semibold text-white tabular-nums">
                {formatKwacha(active.nightlyRate)}
                <span className="font-normal text-white/65"> / night</span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-[0.72rem] text-white/65">
              {active.representative || active.sample ? (
                <span>
                  {active.representative ? 'Representative stock photo' : ''}
                  {active.representative && active.sample ? ' · ' : ''}
                  {active.sample ? 'Example unit (confirm with reception)' : ''}
                </span>
              ) : null}
              {count > 1 ? (
                <div className="hidden items-center gap-1.5 sm:flex">
                  <button
                    type="button"
                    onClick={() => go(index - 1)}
                    aria-label="Previous photo"
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white transition hover:bg-charcoal-950/80"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="px-1 tabular-nums text-white/75">
                    {index + 1} / {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(index + 1)}
                    aria-label="Next photo"
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white transition hover:bg-charcoal-950/80"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Slide progress / selector strip */}
        {count > 1 ? (
          <div className="absolute inset-x-0 bottom-0 z-10 flex gap-1.5 px-4 pb-2.5 sm:px-6 lg:px-8">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show ${slide.name}`}
                aria-current={i === index}
                className="group h-4 flex-1"
              >
                <span className="mt-2 block h-[2.5px] w-full overflow-hidden rounded-full bg-white/20 transition-colors group-hover:bg-white/40">
                  {i === index ? (
                    <span
                      key={`${slide.id}-${index}`}
                      className="block h-full origin-left rounded-full bg-white"
                      style={
                        reducedMotion
                          ? { transform: 'scaleX(1)' }
                          : { animation: `hero-progress ${INTERVAL_MS}ms linear forwards` }
                      }
                    />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {active.name}. {active.availabilityNote}. {formatKwacha(active.nightlyRate)} per night.
      </p>
    </section>
  );
}
