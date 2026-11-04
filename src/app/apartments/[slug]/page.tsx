import { publicPaymentMethod } from '@/lib/domain/payment-details';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bath, BedDouble, CheckCircle2, Layers, Maximize2, Users } from 'lucide-react';
import { readPublicSiteData } from '@/lib/public/read-site-data';
import { addISO } from '@/lib/domain/dates';
import { formatKwacha } from '@/lib/domain/money';
import { isSampleListing } from '@/lib/domain/sample-listings';
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
  const { db, session } = await readPublicSiteData();
  const { slug } = await params;
  const sp = await searchParams;

  const apartment = db.apartments.find(
    (a) =>
      (a.slug === slug || a.id === slug) &&
      a.active &&
      !a.outOfService &&
      a.publicationStatus !== 'draft',
  );
  if (!apartment) notFound();

  const checkIn =
    sp.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkIn) ? sp.checkIn : db.__today;
  const checkOut =
    sp.checkOut && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkOut) && sp.checkOut > checkIn
      ? sp.checkOut
      : addISO(checkIn, 2);
  const guests = Math.max(1, Math.min(apartment.maxGuests, Number(sp.guests || 2)));

  const galleryPhotos =
    apartment.gallery?.filter((g) => g.mediaType !== 'document').map((g) => g.url) ??
    apartment.photos;
  const galleryCaptions =
    apartment.gallery?.filter((g) => g.mediaType !== 'document').map((g) => g.title) ?? [];
  const sample = isSampleListing(apartment);

  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader
        property={db.settings.property}
        session={session}
        activePath="/apartments"
        unreadCount={unreadForSession(db, session)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={`/apartments?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`}
          className="inline-flex items-center gap-1.5 text-[0.83rem] font-medium text-sand-700 hover:text-navy-900"
        >
          <ArrowLeft size={14} /> All apartments
        </Link>

        <div className="animate-fade-up mt-4 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.32fr)_minmax(0,0.95fr)]">
          {/* Left: Gallery & Specifications */}
          <div className="space-y-6">
            <div>
              <p className="text-[0.8rem] font-medium text-lemma-dark">
                {APARTMENT_TIER_LABELS[apartment.tier] || apartment.tier} · Unit {apartment.code}
                {sample ? ' · Example listing' : ''}
              </p>
              <h1 className="mt-1 font-display text-[2rem] font-medium tracking-[-0.015em] text-navy-900 sm:text-[2.25rem]">
                {apartment.name}
              </h1>
              {apartment.tagline ? (
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-sand-700">
                  {apartment.tagline}
                </p>
              ) : null}
            </div>

            {sample ? (
              <div className="rounded-lg border border-sand-300 bg-white px-4 py-3 text-[0.83rem] leading-relaxed text-sand-700">
                <strong className="font-semibold text-navy-900">Example listing:</strong> Unit
                layout, features and ZMW rate are confirmed with reception before any payment is
                made. Submitting the form sends an enquiry—no deposit is requested yet.
              </div>
            ) : null}

            <div className="card overflow-hidden p-3 sm:p-4">
              <PhotoStrip
                photos={galleryPhotos}
                alt={apartment.name}
                ratio="16 / 10"
                captions={galleryCaptions}
              />
            </div>

            <div className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
              <div>
                <p className="text-[0.72rem] font-medium text-sand-600">Sleeps</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Users size={15} className="text-lemma-dark" /> Up to {apartment.maxGuests}
                </p>
              </div>
              <div>
                <p className="text-[0.72rem] font-medium text-sand-600">Bedrooms</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <BedDouble size={15} className="text-lemma-dark" />{' '}
                  {apartment.bedrooms === 0 ? 'Studio' : apartment.bedrooms}
                </p>
              </div>
              <div>
                <p className="text-[0.72rem] font-medium text-sand-600">Bathrooms</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Bath size={15} className="text-lemma-dark" /> {apartment.bathrooms}
                </p>
              </div>
              <div>
                <p className="text-[0.72rem] font-medium text-sand-600">Floor area</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Maximize2 size={15} className="text-lemma-dark" /> {apartment.sizeSqm} m²
                </p>
              </div>
              <div>
                <p className="text-[0.72rem] font-medium text-sand-600">Level</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.9rem] font-semibold text-navy-900">
                  <Layers size={15} className="text-lemma-dark" />{' '}
                  {apartment.floor === 0 ? 'Ground' : `Floor ${apartment.floor}`}
                </p>
              </div>
            </div>

            <div className="card space-y-4 p-6">
              <h2 className="font-display text-[1.28rem] font-medium text-navy-900">
                Inside the apartment
              </h2>
              <p className="text-[0.9rem] leading-relaxed text-sand-700">{apartment.description}</p>
              <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-[0.84rem] text-navy-800">
                <strong className="font-semibold">Sleeping arrangement:</strong>{' '}
                {apartment.bedConfiguration}
              </div>

              {/* Strictly render only amenities ticked for this apartment */}
              {apartment.amenities.length > 0 ? (
                <div className="pt-2">
                  <h3 className="text-[0.95rem] font-semibold text-navy-900">
                    Included in this unit
                  </h3>
                  <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {apartment.amenities.map((amenity) => (
                      <li
                        key={amenity}
                        className="flex items-center gap-2 text-[0.85rem] text-navy-800"
                      >
                        <CheckCircle2 size={15} className="shrink-0 text-st-available" />
                        {amenity}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="pt-2 text-[0.83rem] leading-relaxed text-sand-600">
                  The exact inventory list for this unit is being updated—ask reception if you need a
                  specific appliance or setup.
                </p>
              )}
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="font-display text-[1.22rem] font-medium text-navy-900">
                Rates &amp; stay rules
              </h2>
              <div className="grid grid-cols-1 gap-3 text-[0.85rem] text-sand-700 sm:grid-cols-2">
                <p>
                  <strong className="text-navy-900">Weeknight rate:</strong>{' '}
                  {formatKwacha(apartment.nightlyRate)} / night
                </p>
                {apartment.weekendRate ? (
                  <p>
                    <strong className="text-navy-900">Weekend rate (Fri–Sat):</strong>{' '}
                    {formatKwacha(apartment.weekendRate)} / night
                  </p>
                ) : null}
                {apartment.extraGuestFee ? (
                  <p>
                    <strong className="text-navy-900">Extra guest supplement:</strong>{' '}
                    {formatKwacha(apartment.extraGuestFee)} / night above{' '}
                    {apartment.includedGuests ?? 2} guests
                  </p>
                ) : null}
                <p>
                  <strong className="text-navy-900">Check-in / Check-out:</strong>{' '}
                  {db.settings.booking.checkInTime} / {db.settings.booking.checkOutTime}
                </p>
              </div>
              <p className="border-t border-sand-200 pt-3 text-[0.81rem] leading-relaxed text-sand-600">
                {db.settings.booking.cancellationText}
              </p>
            </div>
          </div>

          {/* Right: Live Availability & Booking Submission Widget */}
          <div id="book" className="scroll-mt-24">
            <ApartmentBookingWidget
              apartment={apartment}
              settings={{
                property: { taxPayerId: '' },
                booking: {
                  depositPercent: db.settings.booking.depositPercent,
                  taxesIncluded: db.settings.booking.taxesIncluded,
                },
                tax: db.settings.tax ? { ...db.settings.tax, registrationNumber: '' } : undefined,
                payments: {
                  methods: db.settings.payments.methods
                    .filter((method) => method.enabled)
                    .map((method) => ({ ...publicPaymentMethod(method), enabled: true })),
                  lockMethodToAdmin: db.settings.payments.lockMethodToAdmin,
                  defaultMethod: db.settings.payments.defaultMethod,
                },
              }}
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
        </div>
      </main>

      <PublicFooter property={db.settings.property} />
    </div>
  );
}
