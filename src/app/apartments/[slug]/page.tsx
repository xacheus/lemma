import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bath, BedDouble, CheckCircle2, Layers, Maximize2, Users } from 'lucide-react';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getSession } from '@/lib/auth/session';
import { addISO } from '@/lib/domain/dates';
import { isSampleListing } from '@/lib/domain/sample-listings';
import { isRepresentativeImage } from '@/lib/cloudinary/urls';
import { APARTMENT_TIER_LABELS } from '@/lib/domain/status';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoStrip } from '@/components/ui/photo';
import { ApartmentBookingWidget } from './booking-widget';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

export default async function ApartmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
  const { slug } = await params;
  const sp = await searchParams;

  const apartment = db.apartments.find(
    (a) => (a.slug === slug || a.id === slug) && a.active && !a.outOfService && a.publicationStatus !== 'draft',
  );
  if (!apartment) notFound();

  const checkIn =
    sp.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkIn) ? sp.checkIn : db.__today;
  const checkOut =
    sp.checkOut && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkOut) && sp.checkOut > checkIn
      ? sp.checkOut
      : addISO(checkIn, 3);
  const guests = Math.max(1, Math.min(apartment.maxGuests, Number(sp.guests || 2)));

  const galleryPhotos =
    apartment.gallery?.filter((g) => g.mediaType !== 'document').map((g) => g.url) ??
    apartment.photos;
  const galleryCaptions =
    apartment.gallery?.filter((g) => g.mediaType !== 'document').map((g) => g.title) ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader property={db.settings.property} session={session} activePath="/apartments" unreadCount={unreadForSession(db, session)} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={`/apartments?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`}
          className="inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-navy-600 hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to all apartments
        </Link>

        <div className="animate-fade-up mt-5 grid items-start gap-8 lg:grid-cols-[1.35fr_0.95fr]">
          {/* Left: Gallery & Specifications */}
          <div className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
                <span>{APARTMENT_TIER_LABELS[apartment.tier] || apartment.tier}</span>
                <span>·</span>
                <span>Unit {apartment.code}</span>
              </div>
              <h1 className="mt-1 text-[1.9rem] font-bold tracking-tight text-navy-900">
                {apartment.name}
              </h1>
              {apartment.tagline ? (
                <p className="mt-1 text-[0.95rem] text-navy-600">{apartment.tagline}</p>
              ) : null}
            </div>

            {isSampleListing(apartment) ? (
              <p className="rounded-md border border-sand-300 bg-sand-100 px-4 py-3 text-[0.84rem] text-navy-700">
                Example listing: please confirm the actual unit, features and rate with reception
                before paying. Your request does not confirm a stay.
              </p>
            ) : null}
            <div className="card img-zoom overflow-hidden p-3">
              <PhotoStrip
                photos={galleryPhotos}
                alt={apartment.name}
                ratio="16 / 10"
                captions={galleryCaptions}
              />
              {galleryPhotos.some(isRepresentativeImage) ? (
                <p className="mt-3 text-[0.78rem] text-navy-600">
                  Representative stock photography, not photos of this property. Ask reception
                  for current pictures of the apartment.
                </p>
              ) : null}
            </div>

            <div className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-navy-500">Capacity</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Users size={15} className="text-lemma-dark" /> Up to {apartment.maxGuests}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-navy-500">Bedrooms</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <BedDouble size={15} className="text-lemma-dark" />{' '}
                  {apartment.bedrooms === 0 ? 'Studio' : apartment.bedrooms}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-navy-500">Bathrooms</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Bath size={15} className="text-lemma-dark" /> {apartment.bathrooms}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-navy-500">Floor Area</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Maximize2 size={15} className="text-lemma-dark" /> {apartment.sizeSqm} m²
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-navy-500">Level</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Layers size={15} className="text-lemma-dark" />{' '}
                  {apartment.floor === 0 ? 'Ground' : `Floor ${apartment.floor}`}
                </p>
              </div>
            </div>

            <div className="card space-y-4 p-6">
              <h2 className="text-[1.1rem] font-semibold text-navy-900">About this Residence</h2>
              <p className="text-[0.9rem] leading-relaxed text-navy-600">{apartment.description}</p>
              <div className="rounded-md bg-sand-50 px-4 py-3 text-[0.84rem] text-navy-700">
                <strong>Bed configuration:</strong> {apartment.bedConfiguration}
              </div>

              {/* Only what the operator ticked for this unit. A unit with no Wi-Fi
                  simply has no Wi-Fi line — nothing is assumed on its behalf. */}
              {apartment.amenities.length > 0 ? (
                <div className="pt-2">
                  <h3 className="text-[0.95rem] font-semibold text-navy-900">
                    What this apartment has
                  </h3>
                  <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {apartment.amenities.map((amenity) => (
                      <li
                        key={amenity}
                        className="flex items-center gap-2 text-[0.84rem] text-navy-700"
                      >
                        <CheckCircle2 size={15} className="shrink-0 text-lemma-dark" />
                        {amenity}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="pt-2 text-[0.82rem] leading-relaxed text-navy-500">
                  The fittings for this apartment are being confirmed. Ask reception and we will
                  tell you exactly what is there.
                </p>
              )}
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="text-[1.05rem] font-semibold text-navy-900">
                Rate Structure &amp; Stay Policies
              </h2>
              <div className="grid gap-3 text-[0.84rem] text-navy-600 sm:grid-cols-2">
                <p>
                  <strong>Standard Nightly Rate:</strong> K
                  {apartment.nightlyRate.toLocaleString('en-US')} / night
                </p>
                {apartment.weekendRate ? (
                  <p>
                    <strong>Weekend Rate (Fri–Sat):</strong> K
                    {apartment.weekendRate.toLocaleString('en-US')} / night
                  </p>
                ) : null}
                {apartment.extraGuestFee ? (
                  <p>
                    <strong>Additional Guest Fee:</strong> K
                    {apartment.extraGuestFee.toLocaleString('en-US')} / night above{' '}
                    {apartment.includedGuests ?? 2} guests
                  </p>
                ) : null}
                <p>
                  <strong>Check-in / Check-out:</strong> {db.settings.booking.checkInTime} /{' '}
                  {db.settings.booking.checkOutTime}
                </p>
              </div>
              <p className="border-t border-sand-200 pt-3 text-[0.8rem] text-navy-500">
                {db.settings.booking.cancellationText}
              </p>
            </div>
          </div>

          {/* Right: Live Availability & Booking Submission Widget */}
          <ApartmentBookingWidget
            apartment={apartment}
            settings={db.settings}
            initialCheckIn={checkIn}
            initialCheckOut={checkOut}
            initialGuests={guests}
            today={db.__today}
            prefillUser={
              session
                ? {
                    fullName: session.user.name,
                    email: session.user.email,
                    phone: session.user.phone,
                  }
                : null
            }
          />
        </div>
      </main>

      <PublicFooter property={db.settings.property} />
    </div>
  );
}
