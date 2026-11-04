'use client';

import { Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { optimizeImageUrl, representativePhotoUrl, type ImageVariant } from '@/lib/cloudinary/urls';

export function PhotoFrame({
  src,
  alt,
  ratio = '16 / 10',
  caption,
  className = '',
  priority = false,
  variant = 'card',
}: {
  src?: string;
  alt: string;
  ratio?: string;
  caption?: string;
  className?: string;
  priority?: boolean;
  variant?: ImageVariant;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const localSrc = optimizeImageUrl(src, variant);
  const remoteSrc = representativePhotoUrl(src, variant);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [state, setState] = useState<'unknown' | 'loaded' | 'missing'>('unknown');

  useEffect(() => {
    setState('unknown');
    setRemoteFailed(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) setState('loaded');
  }, [localSrc]);

  const imageSrc = !remoteFailed && remoteSrc ? remoteSrc : localSrc;
  const ready = state === 'loaded';

  return (
    <div className={`photo-frame w-full ${className}`} style={{ aspectRatio: ratio }}>
      {imageSrc && state !== 'missing' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imageSrc}
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => {
            if (remoteSrc && !remoteFailed) {
              setRemoteFailed(true);
              setState('unknown');
            } else setState('missing');
          }}
          className={`transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
      {!ready ? (
        <div className="photo-grid-lines absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-white/80 text-lemma ring-1 ring-sand-300">
            <ImageIcon size={16} />
          </span>
          <p className="max-w-[24ch] text-[0.84rem] font-medium leading-snug text-navy-700">{alt}</p>
          {caption ? (
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-navy-400">
              {caption}
            </p>
          ) : null}
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
  const list = photos.length ? photos : [''];
  const [active, setActive] = useState(0);
  const idx = Math.min(active, list.length - 1);
  const current = list[idx];
  const representative = Boolean(representativePhotoUrl(current, 'thumbnail'));

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-md">
        <PhotoFrame
          src={current || undefined}
          alt={representative ? `Representative photo for ${alt}` : alt}
          ratio={ratio}
          variant="detail"
          caption={captions?.[idx]}
        />
        {list.length > 1 ? (
          <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
            {([-1, 1] as const).map((direction) => (
              <button
                type="button"
                key={direction}
                aria-label={direction === -1 ? 'Previous photograph' : 'Next photograph'}
                onClick={() => setActive((i) => (i + direction + list.length) % list.length)}
                className="grid h-9 w-9 place-items-center rounded-full bg-charcoal-950/70 text-white transition-colors hover:bg-charcoal-950"
              >
                {direction === -1 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {list.length > 1 ? (
        <div className="flex items-center justify-between gap-2 text-[0.75rem] text-navy-500">
          <span>{captions?.[idx] || `${alt} · photograph ${idx + 1}`}</span>
          <span className="shrink-0 tabular-nums">{idx + 1} / {list.length}</span>
        </div>
      ) : null}
      {list.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={`${alt} photographs`}>
          {list.map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photograph ${i + 1} of ${list.length}`}
              aria-current={i === idx ? 'true' : undefined}
              className={`w-[5.5rem] shrink-0 overflow-hidden rounded-md ring-2 transition sm:w-[6.5rem] ${
                i === idx ? 'ring-navy-800' : 'ring-transparent opacity-80 hover:opacity-100'
              }`}
            >
              <PhotoFrame src={p} alt={`${alt} ${i + 1}`} ratio="4 / 3" variant="thumbnail" />
            </button>
          ))}
        </div>
      ) : null}
      {photos.some((p) => Boolean(representativePhotoUrl(p, 'thumbnail'))) ? (
        <p className="text-[0.76rem] text-navy-500">
          Photos are representative, not taken at this property. Ask reception for current apartment photographs.
        </p>
      ) : null}
    </div>
  );
}
