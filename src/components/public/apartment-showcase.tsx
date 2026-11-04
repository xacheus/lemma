'use client';

import Link from 'next/link';
import { ArrowRight, Bath, BedDouble, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatKwacha } from '@/lib/domain/money';

export interface ShowcaseSlide {
  id: string;
  slug: string;
  name: string;
  code: string;
  tagline: string;
  nightlyRate: number;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  photos: string[];
  available: boolean;
  availabilityNote: string;
  illustrative: boolean;
}

const INTERVAL_MS = 6500;

/**
 * Homepage apartment showcase.
 *
 * One large interior photograph at a time with a slow cross-fade and a gentle
 * push-in, driven by a CSS transition on the active frame (no JS animation loop).
 * Auto-advance pauses on hover, on keyboard focus, while the tab is hidden and
 * when the visitor has asked for reduced motion. Arrows, dots, swipe and arrow
 * keys all move it, so nothing depends on the timer.
 */
export function ApartmentShowcase({
  slides,
  checkIn,
  checkOut,
  guests,
}: {
  slides: ShowcaseSlide[];
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
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
    if (paused || count < 2) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let timer = window.setTimeout(function tick() {}, 0);
    const start = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        start();
      }, INTERVAL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paused, count]);

  if (count === 0) return null;
  const active = slides[Math.min(index, count - 1)];
  const stayQuery = `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Apartments at Lemma Apartments"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        if (Math.abs(delta) > 45) go(index + (delta < 0 ? 1 : -1));
        touchX.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(index + 1);
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(index - 1);
        }
      }}
      tabIndex={0}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-charcoal-900 sm:aspect-[16/9] lg:aspect-[16/8]">
        {slides.map((slide, i) => {
          const photo = slide.photos[0];
          const isActive = i === index;
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-[1100ms] ease-smooth ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={`${slide.name} interior`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'auto'}
                  decoding="async"
                  className={`h-full w-full object-cover transition-transform duration-[7500ms] ease-out ${
                    isActive ? 'scale-[1.06]' : 'scale-100'
                  }`}
                />
              ) : (
                <div className="h-full w-full bg-charcoal-800" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950/90 via-charcoal-950/25 to-charcoal-950/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-charcoal-950/70 via-transparent to-transparent" />
            </div>
          );
        })}

        {/* Facts for the active unit */}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 lg:p-9">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white/70">
              <span>{active.code}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1.5 ${
                  active.available ? 'text-[#8fe3b6]' : 'text-white/60'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active.available ? 'bg-[#5ed69b]' : 'bg-white/50'
                  }`}
                />
                {active.availabilityNote}
              </span>
              {active.illustrative ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-white/50">Illustrative image</span>
                </>
              ) : null}
            </div>
            <h2 className="mt-2.5 text-[1.6rem] font-semibold leading-tight tracking-[-0.01em] text-white sm:text-[2.1rem]">
              {active.name}
            </h2>
            <p className="mt-1.5 max-w-xl text-[0.88rem] leading-relaxed text-white/75 sm:text-[0.95rem]">
              {active.tagline}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8rem] text-white/80">
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} aria-hidden="true" /> {active.maxGuests} guests
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BedDouble size={14} aria-hidden="true" />{' '}
                {active.bedrooms === 0 ? 'Studio' : `${active.bedrooms} bedroom${active.bedrooms === 1 ? '' : 's'}`}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Bath size={14} aria-hidden="true" /> {active.bathrooms} bathroom
                {active.bathrooms === 1 ? '' : 's'}
              </span>
              <span className="text-white">
                <span className="text-[1.05rem] font-semibold tabular-nums">
                  {formatKwacha(active.nightlyRate)}
                </span>
                <span className="text-white/60"> / night</span>
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href={`/apartments/${active.slug}?${stayQuery}`}
                className="btn bg-white px-5 py-2.5 text-[0.85rem] font-semibold text-charcoal-900 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90"
              >
                Book this apartment <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href={`/apartments/${active.slug}`}
                className="btn border border-white/30 px-4 py-2.5 text-[0.85rem] text-white transition-colors hover:border-white/60 hover:bg-white/10"
              >
                View details
              </Link>
            </div>
          </div>
        </div>

        {/* Controls */}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous apartment"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white backdrop-blur-sm transition hover:bg-charcoal-950/70 sm:grid"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next apartment"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white backdrop-blur-sm transition hover:bg-charcoal-950/70 sm:grid"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute right-5 top-5 flex items-center gap-1.5">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show ${slide.name}`}
                  aria-current={i === index}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i === index ? 'w-7 bg-white' : 'w-3 bg-white/45 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {active.name}, {active.availabilityNote}, {formatKwacha(active.nightlyRate)} per night.
      </p>
    </div>
  );
}
