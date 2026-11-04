'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CloudUpload,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { Alert } from '@/components/ui';
import type { ApartmentPhoto } from '@/lib/domain/types';

/**
 * Apartment photograph manager — the real thing.
 *
 * Uploads go through Cloudinary when the server has CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET configured (a signed ticket is minted server-side and the
 * API secret never reaches the browser). If Cloudinary is not configured the file
 * is posted to /api/media, which stores it on the server's media volume and
 * returns a URL from /api/media/file/... . Both paths end in the same media record,
 * so the public site behaves identically.
 *
 * Every operation below writes through the API and refreshes the app snapshot, so
 * a change made here is what the website serves on its next request.
 */

interface CloudinaryTicket {
  configured: boolean;
  cloudName: string;
  uploadPreset: string;
  apiKey: string | null;
  timestamp: number;
  signature: string | null;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

interface Props {
  apartmentId: string;
  photos: ApartmentPhoto[];
  onChanged?: () => void;
}

export function ApartmentPhotoManager({ apartmentId, photos, onChanged }: Props) {
  const { request, toast, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ordered = useMemo(
    () =>
      [...photos]
        .filter((p) => p.mediaType !== 'document')
        .sort((a, b) => (a.isCover === b.isCover ? a.order - b.order : a.isCover ? -1 : 1)),
    [photos],
  );

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(t);
  }, [error]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    const list = Array.from(files);
    if (list.length > 24) {
      setError('Choose up to 24 photographs at a time. You can add the rest in another upload.');
      return;
    }
    setBusy('upload');
    setError(null);
    let uploaded = 0;
    try {
      for (const file of list) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error(`${file.name}: please choose a JPEG, PNG or WebP photograph.`);
        }
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than 10 MB. Resize it before uploading.`);
        }
        setProgress(`Uploading ${uploaded + 1} of ${list.length}…`);

        // A signature covers its exact public_id. Each file needs its own ticket;
        // reusing one and appending an index makes Cloudinary reject every upload.
        const ticket = await request<CloudinaryTicket>('/api/media/signature', {
          method: 'POST',
          data: { category: 'apartment', apartmentId },
        });

        if (ticket.configured && ticket.signature && ticket.apiKey) {
          const form = new FormData();
          form.append('file', file);
          form.append('api_key', ticket.apiKey);
          form.append('timestamp', String(ticket.timestamp));
          form.append('signature', ticket.signature);
          form.append('upload_preset', ticket.uploadPreset);
          form.append('folder', ticket.folder);
          form.append('public_id', ticket.publicId);

          const response = await fetch(ticket.uploadUrl, { method: 'POST', body: form });
          const payload = (await response.json().catch(() => null)) as
            | { secure_url?: string; public_id?: string; width?: number; height?: number; error?: { message?: string } }
            | null;
          if (!response.ok || !payload?.secure_url || !payload.public_id) {
            throw new Error(payload?.error?.message || 'The photograph could not be uploaded.');
          }

          await request('/api/media', {
            method: 'POST',
            data: {
              url: payload.secure_url,
              thumbnailUrl: payload.secure_url,
              detailUrl: payload.secure_url,
              publicId: payload.public_id,
              category: 'apartment',
              title: file.name.replace(/\.[^.]+$/, ''),
              description: '',
              apartmentId,
              isCover: ordered.length === 0 && uploaded === 0,
              mimeType: file.type,
              sizeBytes: file.size,
              width: payload.width ?? null,
              height: payload.height ?? null,
            },
          });
        } else {
          // Local development can store photographs without Cloudinary credentials.
          const form = new FormData();
          form.append('file', file);
          form.append('category', 'apartment');
          form.append('apartmentId', apartmentId);
          form.append('title', file.name.replace(/\.[^.]+$/, ''));
          form.append('isCover', ordered.length === 0 && uploaded === 0 ? 'true' : 'false');

          const response = await fetch('/api/media', { method: 'POST', body: form });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.error || 'The photograph could not be saved.');
          }
        }
        uploaded += 1;
      }

      toast({
        tone: 'success',
        title: uploaded === 1 ? 'Photograph added' : `${uploaded} photographs added`,
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      if (uploaded) await refresh();
      setError(`${uploaded ? `${uploaded} of ${list.length} photographs were saved. ` : ''}${err instanceof Error ? err.message : 'The upload did not complete.'}`);
    } finally {
      setBusy(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function runAction(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change was not saved.');
    } finally {
      setBusy(null);
    }
  }

  const setCover = (id: string) =>
    runAction('cover', async () => {
      await request(`/api/media/${id}`, { method: 'PATCH', data: { isCover: true } });
      toast({ tone: 'success', title: 'Cover photograph set', body: 'It now leads on the website and in search results.' });
    });

  const move = (index: number, direction: -1 | 1) => {
    const next = [...ordered];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return runAction('order', async () => {
      await request('/api/media/reorder', {
        method: 'POST',
        data: { apartmentId, orderedIds: next.map((p) => p.id) },
      });
    });
  };

  const remove = (photo: ApartmentPhoto) => {
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(`Remove this photograph of ${photo.title || 'the apartment'}?\n\nIt is deleted from the gallery and from the media library.`);
    if (!confirmed) return;
    return runAction('delete', async () => {
      await request(`/api/media/${photo.id}`, { method: 'DELETE' });
      toast({ tone: 'success', title: 'Photograph removed', body: 'It no longer appears anywhere on the site.' });
    });
  };

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error" title="Photographs not changed">{error}</Alert> : null}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void uploadFiles(e.dataTransfer.files);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-sand-300 bg-sand-50/70 px-4 py-6 text-center"
      >
        <CloudUpload size={20} className="text-lemma-dark" />
        <p className="text-[0.86rem] font-medium text-navy-800">
          Drop photographs here, or choose files
        </p>
        <p className="max-w-sm text-[0.76rem] leading-relaxed text-navy-500">
          JPEG, PNG or WebP up to 10 MB each. Upload several at once — the first becomes the cover
          unless you pick another.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => void uploadFiles(e.target.files)}
        />
        <button
          type="button"
          className="btn btn-secondary mt-1 py-1.5 text-[0.8rem]"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          {busy === 'upload' ? progress ?? 'Uploading…' : 'Choose photographs'}
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-md border border-sand-200 bg-white px-3 py-4 text-center text-[0.82rem] text-navy-500">
          No photographs for this apartment yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ordered.map((photo, index) => (
            <li
              key={photo.id}
              className="group relative overflow-hidden rounded-md border border-sand-200 bg-white"
            >
              <div className="relative aspect-[4/3] w-full bg-sand-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.title || 'Apartment photograph'}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {photo.isCover || index === 0 ? (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-sm bg-charcoal-950/80 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-white">
                    <Star size={9} /> Cover
                  </span>
                ) : null}
                {busy && busy !== 'upload' ? (
                  <div className="absolute inset-0 grid place-items-center bg-white/60">
                    <Loader2 size={16} className="animate-spin text-navy-700" />
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-1 border-t border-sand-200 px-1.5 py-1.5">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Move earlier"
                    aria-label="Move earlier"
                    disabled={index === 0 || busy !== null}
                    onClick={() => void move(index, -1)}
                    className="rounded p-1 text-navy-500 hover:bg-sand-100 disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    title="Move later"
                    aria-label="Move later"
                    disabled={index === ordered.length - 1 || busy !== null}
                    onClick={() => void move(index, 1)}
                    className="rounded p-1 text-navy-500 hover:bg-sand-100 disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                  {photo.isCover || index === 0 ? (
                    <span className="ml-1 inline-flex items-center gap-1 text-[0.66rem] text-navy-400">
                      <CheckCircle2 size={11} /> Cover
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="Use as cover photograph"
                      disabled={busy !== null}
                      onClick={() => void setCover(photo.id)}
                      className="ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[0.66rem] text-navy-600 hover:bg-sand-100"
                    >
                      <Star size={11} /> Make cover
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  title="Delete photograph"
                  aria-label="Delete photograph"
                  disabled={busy !== null}
                  onClick={() => void remove(photo)}
                  className="rounded p-1 text-navy-500 hover:bg-st-cancelled/10 hover:text-st-cancelled disabled:opacity-30"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
