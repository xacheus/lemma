import React from 'react';

/**
 * Original Lemma Heights Apartments artwork supplied by the property
 * (public/brand/logo.jpg — the "LEMMA / HEIGHTS APARTMENTS" mark).
 *
 * Rendered inside a white tile so the slate-blue emblem stays crisp on both the
 * navy public chrome and the light auth/print surfaces. Use this everywhere the
 * brand appears instead of a redrawn monogram.
 */
export function BrandLogo({
  size = 'md',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const dims =
    size === 'xs'
      ? 'h-7 w-7 rounded-[6px]'
      : size === 'sm'
        ? 'h-9 w-9 rounded-[8px]'
        : size === 'lg'
          ? 'h-12 w-12 rounded-[10px]'
          : size === 'xl'
            ? 'h-20 w-20 rounded-2xl sm:h-24 sm:w-24'
            : 'h-11 w-11 rounded-[10px]';

  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-black/10 ${dims} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- original supplied artwork, intentionally unmodified */}
      <img
        src="/brand/logo.jpg"
        alt="Lemma Heights Apartments"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
