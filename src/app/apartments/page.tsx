import { readPublicSiteData } from '@/lib/public/read-site-data';
import { addISO } from '@/lib/domain/dates';
import { searchAvailability } from '@/lib/domain/availability';
import { calculateStayPricing } from '@/lib/domain/pricing';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { ApartmentsCatalogueClient } from './catalogue-client';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string; tier?: string }>;
}) {
  const { db, session } = await readPublicSiteData();
  const sp = await searchParams;

  const checkIn =
    sp.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkIn) ? sp.checkIn : db.__today;
  const checkOut =
    sp.checkOut && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkOut) && sp.checkOut > checkIn
      ? sp.checkOut
      : addISO(checkIn, 2);
  const guests = Math.max(1, Math.min(12, Number(sp.guests || 2)));
  const selectedTier = sp.tier || 'all';

  const availability = searchAvailability(db, {
    checkIn,
    checkOut,
    guests,
    today: db.__today,
  });

  const published = db.apartments
    .filter((a) => a.active && a.publicationStatus !== 'draft')
    .sort((a, b) => a.number - b.number);

  const bannerPhoto = published.flatMap((a) => [a.coverPhoto, ...a.photos]).find(Boolean) ?? null;

  const availIds = new Set(
    availability.hits.filter((h) => h.available).map((x) => x.apartment.id),
  );

  const units = published.map((apt) => {
    const pricing = calculateStayPricing({
      apartment: apt,
      settings: db.settings,
      checkIn,
      checkOut,
      guestCount: Math.min(guests, apt.maxGuests),
    });
    const fitsGuests = apt.maxGuests >= guests;
    const isAvailable = fitsGuests && availIds.has(apt.id);
    return {
      apartment: apt,
      isAvailable,
      fitsGuests,
      nights: pricing.nights,
      stayTotal: pricing.totalAmount,
      effectiveRate: pricing.effectiveAverageRate,
      depositRequired: pricing.depositRequired,
    };
  });

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader property={db.settings.property} session={session} activePath="/apartments" unreadCount={unreadForSession(db, session)} />
      <main className="flex-1">
        {/* Inner-page banner band, matching the reference's `.page-header` */}
        <section
          className="page-banner"
          style={bannerPhoto ? { backgroundImage: `url("${bannerPhoto}")` } : undefined}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
            <span className="eyebrow">Properties in Lusaka</span>
            <h1 className="mt-2 max-w-3xl font-heading text-[2rem] font-extrabold tracking-[-0.01em] text-white sm:text-[2.6rem]">
              Apartments &amp; live availability
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[0.98rem] leading-relaxed text-[#D7DEE6]">
              {published.length > 0
                ? 'Pick your arrival and departure dates to see which units are open, what the stay costs in Kwacha, and the deposit needed to hold it.'
                : 'Online apartment listings are currently being updated. Call reception to check availability for your dates.'}
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <ApartmentsCatalogueClient
            units={units}
            initialCheckIn={checkIn}
            initialCheckOut={checkOut}
            initialGuests={guests}
            initialTier={selectedTier}
            today={db.__today}
            publishedTotal={published.length}
            phone={db.settings.property.phone}
          />
        </div>
      </main>
      <PublicFooter property={db.settings.property} />
    </div>
  );
}
