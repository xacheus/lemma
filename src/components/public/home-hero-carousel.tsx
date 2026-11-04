'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bath, BedDouble, ChevronLeft, ChevronRight, Pause, Play, Users } from 'lucide-react';
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
  photo: string;
  /** True when the frame is one of the shipped illustrations, not a real photograph. */
  illustrative: boolean;
  available: boolean;
  availabilityNote: string;
}

const INTERVAL_MS = 7000;
const FADE_MS = 1400;

/**
 * Homepage hero.
 *
 * One large interior per apartment, cross-fading on a CSS opacity transition with a
 * very slow scale on the active frame — no animation loop, no layout thrash, and the
 * browser can composite it on the GPU. The first frame loads eagerly (it is the
 * largest contentful paint); the rest are lazy.
 *
 * Auto-advance pauses on hover, on focus, while the tab is hidden and whenever the
 * visitor prefers reduced motion. It can also be stopped by hand, which stays stopped
 * for the session. Arrows, dots, keyboard arrows and swipe all work, so nothing
 * depends on the timer.
 *
 * The copy stays deliberately short: one headline, one line of supporting text, and the
 * active apartment's facts. Anything longer fights the photograph it sits on.
 */
export function HomeHeroCarousel({
  slides,
  stayQuery,
  propertyName,
  totalApartments,
}: {
  slides: HeroSlide[];
  stayQuery: string;
  propertyName: string;
  totalApartments: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userStopped, setUserStopped] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  useEffect(() => {
    if (paused || userStopped || count < 2 || reducedMotion) return;
    let timer = window.setTimeout(() => undefined, 0);
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
  }, [paused, userStopped, count, reducedMotion]);

  if (count === 0) return null;
  const active = slides[Math.min(index, count - 1)];

  return (
    <section
      className="relative isolate overflow-hidden bg-charcoal-950 text-white"
      aria-roledescription="carousel"
      aria-label="Apartment interiors"
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
      {/* Frames. Height is set once here so a slow image never shifts the page. */}
      <div className="relative h-[74svh] min-h-[26rem] w-full sm:h-[68svh] lg:h-[76svh]">
        {slides.map((slide, i) => {
          const isActive = i === index;
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className="absolute inset-0 will-change-[opacity]"
              style={{
                opacity: isActive ? 1 : 0,
                transition: `opacity ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizeImageUrl(slide.photo, 'hero')}
                alt={`Interior of ${slide.name}${slide.illustrative ? ' (illustrative image)' : ''}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                decoding="async"
                className="h-full w-full object-cover"
                style={{
                  transform: isActive ? 'scale(1.07)' : 'scale(1)',
                  transition: `transform ${INTERVAL_MS + FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                }}
              />
            </div>
          );
        })}

        {/* Legibility scrims — bottom for the copy, left for the headline. */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,13,17,0.93)_0%,rgba(10,13,17,0.55)_38%,rgba(10,13,17,0.12)_70%,rgba(10,13,17,0.35)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(10,13,17,0.72)_0%,rgba(10,13,17,0.25)_55%,transparent_100%)]" />

        {/* Copy */}
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8 lg:pb-14">
            <div className="max-w-2xl">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/65">
                {propertyName} <span aria-hidden="true">/</span> Lusaka
              </p>

              <h1 className="mt-4 max-w-2xl text-[2rem] font-semibold leading-[1.06] tracking-[-0.025em] text-white sm:text-[2.6rem] lg:text-[3.1rem]">
                Serviced apartments
                <span className="block text-white/65">booked by the night.</span>
              </h1>

              <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-white/70">
                {totalApartments} private unit{totalApartments === 1 ? '' : 's'} in Barlaston Park.
                Live availability, clear Kwacha rates, no card needed to enquire.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/apartments?${stayQuery}#availability`}
                  className="btn bg-white px-5 py-2.5 text-[0.86rem] font-semibold text-charcoal-900 transition-transform duration-300 hover:-translate-y-0.5 hover:bg-white/90"
                >
                  Check availability <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link
                  href={`/apartments/${active.slug}?${stayQuery}#book`}
                  className="btn border border-white/35 px-4 py-2.5 text-[0.86rem] text-white transition-colors hover:border-white/70 hover:bg-white/10"
                >
                  View {active.name}
                </Link>
              </div>

              {/* The active apartment's facts, on one quiet line. */}
              <div className="mt-6 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.78rem] text-white/70">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${
                    active.available ? 'bg-[#0f3d2b]/85 text-[#a9ecc6]' : 'bg-white/12 text-white/70'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active.available ? 'bg-[#5ed69b]' : 'bg-white/50'}`}
                  />
                  {active.availabilityNote}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} aria-hidden="true" /> {active.maxGuests}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble size={13} aria-hidden="true" />
                  {active.bedrooms === 0 ? 'Studio' : `${active.bedrooms} bed`}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Bath size={13} aria-hidden="true" /> {active.bathrooms} bath
                </span>
                <span className="font-medium text-white">
                  {formatKwacha(active.nightlyRate)}
                  <span className="font-normal text-white/55"> / night</span>
                </span>
                {/* Honest labelling: until the owner supplies real photography, the frame
                    is a representative interior, and the page says so quietly. */}
                {active.illustrative ? (
                  <span className="text-[0.68rem] uppercase tracking-[0.1em] text-white/40">
                    Representative image
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Controls. The arrows sit low and to the edges, clear of the headline, and the
            apartment switcher is a labelled index rather than anonymous dots. */}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous apartment"
              className="absolute bottom-9 left-4 hidden h-9 w-9 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white backdrop-blur-sm transition hover:bg-charcoal-950/75 lg:grid xl:left-6"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next apartment"
              className="absolute bottom-9 right-4 hidden h-9 w-9 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white backdrop-blur-sm transition hover:bg-charcoal-950/75 lg:grid xl:right-6"
            >
              <ChevronRight size={18} />
            </button>

            <div className="absolute right-4 top-3 flex items-center gap-2 sm:right-5 sm:top-5">
              <span className="rounded-full bg-charcoal-950/45 px-2 py-1 text-[0.66rem] font-medium tabular-nums text-white/80 backdrop-blur-sm">
                {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => setUserStopped((v) => !v)}
                aria-label={userStopped ? 'Resume the slideshow' : 'Pause the slideshow'}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/25 bg-charcoal-950/40 text-white/80 backdrop-blur-sm transition hover:bg-charcoal-950/70"
              >
                {userStopped ? <Play size={13} /> : <Pause size={13} />}
              </button>
            </div>

            {/* Auto-advance indicator: a thin bar per frame that fills over the interval,
                so the motion reads as a clock rather than a surprise. It is keyed on the
                index so the animation restarts whenever the frame changes. Each bar is
                also the control for its frame, which is why this lives on the bottom
                edge of the whole hero rather than on the photograph. */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex gap-1.5 px-4 pb-3 sm:px-6 lg:px-8">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show ${slide.name}`}
                  aria-current={i === index}
                  className="group h-5 flex-1"
                >
                  <span className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-colors group-hover:bg-white/40">
                    {i === index ? (
                      <span
                        key={`${slide.id}-${index}-${userStopped ? 'p' : 'r'}`}
                        className="block h-full origin-left rounded-full bg-white"
                        style={
                          userStopped || reducedMotion
                            ? { transform: 'scaleX(1)' }
                            : { animation: `hero-progress ${INTERVAL_MS}ms linear forwards` }
                        }
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {active.name}. {active.availabilityNote}. {formatKwacha(active.nightlyRate)} per night.
      </p>
    </section>
  );
}
