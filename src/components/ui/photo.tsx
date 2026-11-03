'use client';

import { Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { optimizeImageUrl, type ImageVariant } from '@/lib/cloudinary/urls';

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
  const resolvedSrc = optimizeImageUrl(src, variant);
  const [state, setState] = useState<'unknown' | 'loaded' | 'missing'>('unknown');

  useEffect(() => {
    setState('unknown');
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setState('loaded');
    }
  }, [resolvedSrc]);

  const ready = state === 'loaded';

  return (
    <div className={`photo-frame w-full ${className}`} style={{ aspectRatio: ratio }}>
      {resolvedSrc && state !== 'missing' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('missing')}
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
  return (
    <div className="space-y-2">
      <PhotoFrame
        src={list[idx] || undefined}
        alt={alt}
        ratio={ratio}
        variant="detail"
        caption={captions?.[idx]}
      />
      {list.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {list.slice(0, 10).map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photograph ${i + 1}`}
              className={`overflow-hidden rounded-md ring-2 transition ${
                i === idx ? 'ring-navy-800' : 'ring-transparent opacity-80 hover:opacity-100'
              }`}
            >
              <PhotoFrame src={p} alt={`${alt} ${i + 1}`} ratio="4 / 3" variant="thumbnail" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
