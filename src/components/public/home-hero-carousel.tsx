'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bath, BedDouble, ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react';
import { formatKwacha } from '@/lib/domain/money';
import { optimizeImageUrl } from '@/lib/cloudinary/urls';

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
  photo?: string;
  available: boolean;
  availabilityNote: string;
}

/* Reference timings: a 1.2s cross-fade while the photo zooms out over 6s. */
const INTERVAL_MS = 7000;
const FADE_MS = 1200;
const ZOOM_MS = 6000;

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
      className="relative isolate overflow-hidden bg-swdl-navyDeep text-white"
      aria-roledescription="carousel"
      aria-label="Featured apartments"
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
      <div className="relative min-h-[30rem] w-full sm:h-[72svh] lg:h-[78svh]">
        {slides.map((slide, i) => {
          const isActive = i === index;
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className="absolute inset-0 will-change-[opacity]"
              style={{
                opacity: isActive ? 1 : 0,
                transition: `opacity ${reducedMotion ? 0 : FADE_MS}ms ease`,
              }}
            >
              {slide.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={optimizeImageUrl(slide.photo, 'hero')}
                  alt={slide.name}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'auto'}
                  decoding="async"
                  className="h-full w-full object-cover"
                  style={{
                    // Reference ken-burns: the incoming frame starts at 1.06 and
                    // settles to 1 over the slide's whole lifetime.
                    transform: isActive && !reducedMotion ? 'scale(1.06)' : 'scale(1)',
                    transition: `transform ${reducedMotion ? 0 : ZOOM_MS}ms ease`,
                  }}
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_75%_25%,rgba(201,161,90,0.22),transparent_48%),linear-gradient(135deg,#0A1E33_0%,#16436B_55%,#0A192A_100%)]" />
              )}
            </div>
          );
        })}

        {/* Navy scrims: the reference washes left→right so the copy side reads first */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(10,25,42,0.82)_0%,rgba(10,25,42,0.42)_58%,rgba(10,25,42,0.18)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,25,42,0.88)_0%,rgba(10,25,42,0.34)_38%,transparent_72%)]" />

        {/* Glass arrows on the frame edges, like the reference slider */}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous apartment"
              className="absolute left-5 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-white/15 text-white backdrop-blur-[4px] transition-all duration-250 ease-smooth hover:border-swdl-gold hover:bg-swdl-gold hover:text-swdl-navy md:grid"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next apartment"
              className="absolute right-5 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-white/15 text-white backdrop-blur-[4px] transition-all duration-250 ease-smooth hover:border-swdl-gold hover:bg-swdl-gold hover:text-swdl-navy md:grid"
            >
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}

        <div className="relative z-10 mx-auto flex h-full min-h-[30rem] max-w-7xl flex-col justify-center px-4 pb-24 pt-16 sm:px-6 lg:px-8">
          <div className="swdl-rise max-w-2xl">
            <p className="inline-flex items-center gap-1.5">
              <span className="swdl-pill inline-flex items-center gap-2">
                <MapPin size={13} aria-hidden="true" />
                {propertyName} · {locationLabel}
              </span>
            </p>

            <h1 className="mt-5 font-heading text-[1.8rem] font-extrabold leading-[1.18] tracking-[-0.01em] text-white sm:text-[2.45rem] lg:text-[2.85rem]">
              Furnished apartments in Lusaka,{' '}
              <span className="text-swdl-gold">set up for a night or a month.</span>
            </h1>

            <p className="mt-4 max-w-xl text-[1.02rem] leading-relaxed text-[#E3E9F0]">
              Private self-catering stays with backup power, reliable Wi-Fi and secure compound
              parking—priced clearly in Zambian Kwacha and managed directly at our front desk.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <Link
                href={`/apartments?${stayQuery}#availability`}
                className="btn btn-gold px-7 py-3 text-[0.92rem]"
              >
                Check availability <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href={`/apartments/${active.slug}?${stayQuery}#book`}
                className="btn btn-outline-light px-6 py-3 text-[0.92rem]"
              >
                View {active.name}
              </Link>
            </div>
          </div>

          {/* Structured bottom bar for the currently shown apartment */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-[0.79rem] text-white/80">
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
              <span className="font-semibold tabular-nums text-white">
                {formatKwacha(active.nightlyRate)}
                <span className="font-normal text-white/65"> / night</span>
              </span>
            </div>

            {count > 1 ? (
              <div className="flex items-center gap-1.5 text-[0.72rem] text-white/65">
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  aria-label="Previous apartment"
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-swdl-navyDeep/50 text-white transition-all duration-250 ease-smooth hover:border-swdl-gold hover:bg-swdl-gold hover:text-swdl-navy md:hidden"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="px-1 font-heading font-semibold tabular-nums tracking-[0.08em] text-white/80">
                  {index + 1} / {count}
                </span>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  aria-label="Next apartment"
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-swdl-navyDeep/50 text-white transition-all duration-250 ease-smooth hover:border-swdl-gold hover:bg-swdl-gold hover:text-swdl-navy md:hidden"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Slide selector: short glass pills; the active one widens and turns gold */}
        {count > 1 ? (
          <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show ${slide.name}`}
                aria-current={i === index}
                className="group relative h-[5px] overflow-hidden rounded-full transition-all duration-300 ease-smooth"
                style={{
                  width: i === index ? 48 : 34,
                  background: i === index ? 'transparent' : 'rgba(255,255,255,0.4)',
                }}
              >
                {i === index ? (
                  <>
                    <span className="absolute inset-0 rounded-full bg-white/25" />
                    <span
                      key={`${slide.id}-${index}`}
                      className="absolute inset-0 origin-left rounded-full bg-swdl-gold"
                      style={
                        reducedMotion || paused
                          ? { transform: 'scaleX(1)' }
                          : { animation: `hero-progress ${INTERVAL_MS}ms linear forwards` }
                      }
                    />
                  </>
                ) : (
                  <span className="absolute inset-0 rounded-full bg-white/0 transition-colors duration-300 group-hover:bg-white/30" />
                )}
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
