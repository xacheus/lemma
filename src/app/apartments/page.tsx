import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getSession } from '@/lib/auth/session';
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
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
  const sp = await searchParams;

  const checkIn =
    sp.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkIn) ? sp.checkIn : db.__today;
  const checkOut =
    sp.checkOut && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkOut) && sp.checkOut > checkIn
      ? sp.checkOut
      : addISO(checkIn, 3);
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
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader property={db.settings.property} session={session} activePath="/apartments" unreadCount={unreadForSession(db, session)} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
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
      </main>
      <PublicFooter property={db.settings.property} />
    </div>
  );
}
