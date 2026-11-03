'use client';

import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  Eye,
  FileText,
  Pencil,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PhotoFrame } from '@/components/ui/photo';
import type { MediaCategory, MediaRecord } from '@/lib/domain/types';

export default function AdminMediaPage() {
  const { snapshot, request, refresh, toast, can } = useApp();
  const [aptFilter, setAptFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  // Upload form
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<MediaCategory>('apartment');
  const [apartmentId, setApartmentId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCover, setIsCover] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Preview & edit modals
  const [previewItem, setPreviewItem] = useState<MediaRecord | null>(null);
  const [editItem, setEditItem] = useState<MediaRecord | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  if (!snapshot) return null;
  const canManage = can('media.manage');
  const { integrations } = snapshot;

  const mediaItems = (snapshot.media ?? []).filter((m) => {
    if (aptFilter !== 'all' && m.apartmentId !== aptFilter) return false;
    if (catFilter !== 'all' && m.category !== catFilter) return false;
    return true;
  });

  const selectedApartmentForReorder =
    aptFilter !== 'all' ? snapshot.apartments.find((a) => a.id === aptFilter) ?? null : null;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('category', category);
      if (apartmentId) form.append('apartmentId', apartmentId);
      if (title) form.append('title', title);
      if (description) form.append('description', description);
      form.append('isCover', String(isCover));
      for (const f of files) {
        form.append('files', f);
      }

      const res = await fetch('/api/media', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ tone: 'error', title: 'Upload failed', body: json.error || 'Could not upload media.' });
      } else {
        await refresh();
        setFiles([]);
        setTitle('');
        setDescription('');
        setIsCover(false);
        toast({
          tone: 'success',
          title: 'Media uploaded',
          body: `Uploaded ${json.data.created.length} file(s) and updated gallery records.`,
        });
      }
    } catch {
      toast({ tone: 'error', title: 'Network error', body: 'Upload could not be completed.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleSetCover(item: MediaRecord) {
    await request(`/api/media/${item.id}`, {
      method: 'PATCH',
      data: { isCover: true },
    });
    toast({ tone: 'success', title: 'Cover updated', body: `"${item.title}" is now the cover photograph.` });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    await request(`/api/media/${editItem.id}`, {
      method: 'PATCH',
      data: { title: editTitle, description: editDesc },
    });
    toast({ tone: 'success', title: 'Metadata saved' });
    setEditItem(null);
  }

  async function handleDelete(item: MediaRecord) {
    if (!window.confirm(`Delete "${item.title}" from storage and remove all gallery references?`)) {
      return;
    }
    const res = await request<{ detail: string }>(`/api/media/${item.id}`, { method: 'DELETE' });
    toast({ tone: 'success', title: 'Media deleted', body: res.detail });
  }

  async function moveGalleryPhoto(aptId: string, index: number, direction: -1 | 1) {
    const apt = snapshot?.apartments.find((a) => a.id === aptId);
    if (!apt?.gallery) return;
    const list = [...apt.gallery];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(targetIdx, 0, moved);
    await request('/api/media/reorder', {
      method: 'POST',
      data: {
        apartmentId: aptId,
        orderedIds: list.map((g) => g.id),
      },
    });
    toast({ tone: 'success', title: 'Gallery order updated' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
            Cloudinary &amp; Property Assets
          </p>
          <h1 className="text-[1.45rem] font-bold text-navy-900">Media Library</h1>
          <p className="text-[0.83rem] text-navy-500">
            Manage apartment galleries, cover photographs, maintenance evidence, and property PDFs.
          </p>
        </div>

        <div className="rounded-md border border-sand-200 bg-white px-3.5 py-2 text-[0.76rem] text-navy-700">
          <div className="flex items-center gap-1.5 font-semibold text-navy-900">
            <Cloud size={14} className="text-lemma-dark" />
            Cloud: <code>{integrations.cloudinaryCloudName}</code> · Preset:{' '}
            <code>{integrations.cloudinaryUploadPreset}</code>
          </div>
          <p className="mt-0.5 text-navy-500">
            {integrations.cloudinarySignedReady
              ? 'Signed server-side Cloudinary upload & destroy active.'
              : 'Server keys pending in env — using local workspace storage fallback.'}
          </p>
        </div>
      </div>

      {/* Upload Panel */}
      {canManage ? (
        <form onSubmit={handleUpload} className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-navy-900">
            <Upload size={16} className="text-lemma-dark" /> Upload Photographs or PDF Documents
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="label mb-1 block">Select Image(s) or PDF (Max 10MB / 15MB)</label>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="field py-1.5"
                required
              />
            </div>
            <div>
              <label className="label mb-1 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MediaCategory)}
                className="field"
              >
                <option value="apartment">Apartment Gallery</option>
                <option value="property_document">Property Document (PDF)</option>
                <option value="maintenance">Maintenance Photo</option>
                <option value="brand">Brand / Property</option>
              </select>
            </div>
            <div>
              <label className="label mb-1 block">Assign to Apartment</label>
              <select
                value={apartmentId}
                onChange={(e) => setApartmentId(e.target.value)}
                className="field"
              >
                <option value="">General Property Asset</option>
                {snapshot.apartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    Apt {a.number} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label mb-1 block">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Executive Suite Lounge"
                className="field"
              />
            </div>
            <div>
              <label className="label mb-1 block">Caption / Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional room detail..."
                className="field"
              />
            </div>
            <div className="flex items-end justify-between gap-3">
              <label className="flex items-center gap-2 text-[0.8rem] text-navy-700">
                <input
                  type="checkbox"
                  checked={isCover}
                  onChange={(e) => setIsCover(e.target.checked)}
                />
                Set as Cover Image
              </label>
              <button type="submit" disabled={uploading || !files.length} className="btn btn-primary">
                <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div>
          <label className="label mb-1 block">Filter by Apartment</label>
          <select
            value={aptFilter}
            onChange={(e) => setAptFilter(e.target.value)}
            className="field w-auto"
          >
            <option value="all">All Apartments &amp; Property</option>
            {snapshot.apartments.map((a) => (
              <option key={a.id} value={a.id}>
                Apt {a.number} · {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block">Filter by Category</label>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="field w-auto"
          >
            <option value="all">All Categories</option>
            <option value="apartment">Apartment Gallery</option>
            <option value="property_document">Property Documents</option>
            <option value="maintenance">Maintenance</option>
            <option value="brand">Brand</option>
          </select>
        </div>
      </div>

      {/* Selected Apartment Gallery Order Panel */}
      {selectedApartmentForReorder && selectedApartmentForReorder.gallery?.length ? (
        <div className="card p-5 space-y-3">
          <h3 className="text-[0.95rem] font-semibold text-navy-900">
            Gallery Sequence — Apt {selectedApartmentForReorder.number} ({selectedApartmentForReorder.name})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selectedApartmentForReorder.gallery.map((g, idx) => (
              <div key={g.id} className="rounded-md border border-sand-200 p-2.5 space-y-2">
                <PhotoFrame src={g.url} alt={g.title} ratio="16 / 10" variant="thumbnail" />
                <div className="flex items-center justify-between text-[0.76rem]">
                  <span className="truncate font-medium text-navy-800">
                    #{idx + 1} {g.title}
                  </span>
                  {g.isCover ? (
                    <span className="rounded bg-navy-900 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
                      COVER
                    </span>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void moveGalleryPhoto(selectedApartmentForReorder.id, idx, -1)}
                      className="btn btn-secondary py-1 px-2 text-[0.72rem]"
                    >
                      <ArrowUp size={12} /> Earlier
                    </button>
                    <button
                      type="button"
                      disabled={idx === selectedApartmentForReorder.gallery!.length - 1}
                      onClick={() => void moveGalleryPhoto(selectedApartmentForReorder.id, idx, 1)}
                      className="btn btn-secondary py-1 px-2 text-[0.72rem]"
                    >
                      <ArrowDown size={12} /> Later
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Central Media Grid */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {mediaItems.map((item) => (
          <div key={item.id} className="card flex flex-col overflow-hidden">
            {item.mediaType === 'document' ? (
              <div className="flex aspect-[16/10] flex-col items-center justify-center bg-sand-100 text-navy-700">
                <FileText size={28} className="text-lemma-dark" />
                <span className="mt-2 text-[0.75rem] font-semibold uppercase">PDF Document</span>
              </div>
            ) : (
              <PhotoFrame
                src={item.thumbnailUrl || item.url}
                alt={item.title}
                ratio="16 / 10"
                variant="thumbnail"
              />
            )}

            <div className="flex flex-1 flex-col justify-between p-3.5 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-1 text-[0.68rem] uppercase tracking-[0.1em] text-navy-500">
                  <span>{item.category.replace(/_/g, ' ')}</span>
                  {item.isCover ? (
                    <span className="font-bold text-lemma-dark">Cover</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[0.86rem] font-semibold text-navy-900">
                  {item.title}
                </p>
                {item.apartmentName ? (
                  <p className="text-[0.74rem] text-navy-500">{item.apartmentName}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-sand-200 pt-2.5">
                <button
                  type="button"
                  onClick={() => setPreviewItem(item)}
                  className="btn btn-secondary px-2 py-1 text-[0.72rem]"
                  title="Preview"
                >
                  <Eye size={12} />
                </button>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditItem(item);
                        setEditTitle(item.title);
                        setEditDesc(item.description);
                      }}
                      className="btn btn-secondary px-2 py-1 text-[0.72rem]"
                      title="Edit title & description"
                    >
                      <Pencil size={12} />
                    </button>
                    {item.apartmentId && !item.isCover && item.mediaType === 'image' ? (
                      <button
                        type="button"
                        onClick={() => void handleSetCover(item)}
                        className="btn btn-secondary px-2 py-1 text-[0.72rem]"
                        title="Set as apartment cover"
                      >
                        <Star size={12} /> Cover
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      className="btn btn-secondary ml-auto px-2 py-1 text-[0.72rem] text-st-cancelled"
                      title="Delete from Cloudinary & database"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Lightbox */}
      {previewItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/75 p-4">
          <div className="card w-full max-w-3xl overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[1rem] font-semibold text-navy-900">{previewItem.title}</h3>
                <p className="text-[0.76rem] text-navy-500">
                  Public ID: <code>{previewItem.publicId}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="rounded p-1.5 text-navy-500 hover:bg-sand-100"
              >
                <X size={18} />
              </button>
            </div>
            {previewItem.mediaType === 'document' ? (
              <a
                href={previewItem.url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary inline-flex"
              >
                Open PDF Document
              </a>
            ) : (
              <PhotoFrame
                src={previewItem.detailUrl || previewItem.url}
                alt={previewItem.title}
                ratio="16 / 10"
                variant="detail"
              />
            )}
            {previewItem.description ? (
              <p className="text-[0.84rem] text-navy-600">{previewItem.description}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Edit Metadata Modal */}
      {editItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
          <form onSubmit={handleSaveEdit} className="card w-full max-w-md space-y-4 p-6">
            <h3 className="text-[1.05rem] font-semibold text-navy-900">Edit Media Details</h3>
            <div>
              <label className="label mb-1 block">Title</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="field"
                required
              />
            </div>
            <div>
              <label className="label mb-1 block">Description</label>
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="field"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditItem(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
