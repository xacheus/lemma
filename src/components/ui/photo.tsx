'use client';

import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

/**
 * Photography slot.
 *
 * The property supplies its own images: drop them at the path in `src` and this
 * component picks them up automatically (see docs/PHOTOGRAPHY.md). Until a file
 * exists, it renders a correctly-proportioned placeholder carrying the unit name, so
 * layouts are final before the photographs arrive — never a broken image icon.
 */
export function PhotoFrame({
  src,
  alt,
  ratio = '16 / 10',
  caption,
  className = '',
  priority = false,
}: {
  src?: string;
  alt: string;
  ratio?: string;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  const [state, setState] = useState<'unknown' | 'loaded' | 'missing'>('unknown');
  const ready = state === 'loaded';

  return (
    <div className={`photo-frame w-full ${className}`} style={{ aspectRatio: ratio }}>
      {src && state !== 'missing' ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('missing')}
          className={`transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
      {!ready ? (
        <div className="photo-grid-lines absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-lemma ring-1 ring-white/80">
            <ImageIcon size={16} />
          </span>
          <p className="max-w-[22ch] font-display text-[0.9rem] leading-snug text-navy-600">{alt}</p>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-400">
            {caption ?? 'Photograph to be supplied'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function PhotoStrip({
  photos,
  alt,
  ratio = '4 / 3',
  captions,
}: {
  photos: string[];
  alt: string;
  ratio?: string;
  captions?: string[];
}) {
  const slots = photos.length >= 4 ? photos.slice(0, 5) : [...photos, ...fallbackSlots(photos.length)].slice(0, 4);
  return (
    <div className={`grid gap-2 ${slots.length >= 4 ? 'sm:grid-cols-4' : slots.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {slots.map((src, i) => (
        <PhotoFrame key={`${src}-${i}`} src={src} alt={`${alt} — view ${i + 1}`} ratio={ratio} caption={captions?.[i]} />
      ))}
    </div>
  );
}

function fallbackSlots(count: number) {
  return Array.from({ length: Math.max(0, 4 - count) }, (_, i) => `slot-${i}`);
}
