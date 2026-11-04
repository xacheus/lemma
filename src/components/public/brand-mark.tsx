import React from 'react';

/**
 * Vector architectural emblem from the Lemma Heights Apartments brand mark (skyline + twin gables),
 * rendered without the tiny embedded wordmark so it stays razor-sharp at 36–48px
 * on both warm-light and dark surfaces.
 */
export function BrandMark({
  tone = 'light',
  size = 'md',
  className = '',
}: {
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10';
  const surface =
    tone === 'dark'
      ? 'bg-white/[0.07] ring-1 ring-white/15 text-[#BCC7D6]'
      : 'bg-white ring-1 ring-sand-300 text-[#5D6C7F] shadow-[0_1px_2px_rgba(20,22,26,0.05)]';

  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-lg ${dims} ${surface} ${className}`}
    >
      <svg
        viewBox="0 12 128 84"
        fill="none"
        className="h-[74%] w-[74%]"
        focusable="false"
      >
        <path d="M18 82A48 48 0 0 1 52 36.5L48 44A40 40 0 0 0 22 82H18Z" fill="currentColor" />
        <path d="M110 82A48 48 0 0 0 76 36.5L80 44A40 40 0 0 1 106 82H110Z" fill="currentColor" />
        <path d="M48 68V42L64 20V60L48 68Z" fill="currentColor" />
        <rect x="66" y="23" width="4" height="36" fill="currentColor" />
        <rect x="72" y="28" width="4" height="33" fill="currentColor" />
        <rect x="78" y="34" width="4" height="30" fill="currentColor" />
        <path d="M31 76V55L35 52V73L31 76ZM37 72V51L41 48V70L37 72Z" fill="currentColor" />
        <path d="M85 65V51L101 60V74L85 65Z" fill="currentColor" />
        <path d="M20 88L51 69L81 88H70L51 76L31 88H20Z" fill="currentColor" />
        <path d="M56 71L72 61L112 88H100L72 69L63 75L56 71Z" fill="currentColor" />
        <rect x="47" y="80" width="3.5" height="3.5" fill="currentColor" />
        <rect x="52" y="80" width="3.5" height="3.5" fill="currentColor" />
        <rect x="47" y="85" width="3.5" height="3.5" fill="currentColor" />
        <rect x="52" y="85" width="3.5" height="3.5" fill="currentColor" />
        <rect x="69" y="74" width="3.5" height="3.5" fill="currentColor" />
        <rect x="74" y="74" width="3.5" height="3.5" fill="currentColor" />
        <rect x="69" y="79" width="3.5" height="3.5" fill="currentColor" />
        <rect x="74" y="79" width="3.5" height="3.5" fill="currentColor" />
      </svg>
    </span>
  );
}
