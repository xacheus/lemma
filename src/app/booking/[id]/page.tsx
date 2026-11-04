import { readPublicSiteData } from '@/lib/public/read-site-data';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { unreadForSession } from '@/lib/domain/inbox';
import { GuestBookingClient } from './booking-detail-client';

export const dynamic = 'force-dynamic';

export default async function GuestBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, session } = await readPublicSiteData();

  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader
        property={db.settings.property}
        session={session}
        activePath="/booking"
        unreadCount={unreadForSession(db, session)}
      />
      <main className="flex-1">
        <GuestBookingClient
          id={id}
          property={db.settings.property}
          checkInTime={db.settings.booking.checkInTime}
          checkOutTime={db.settings.booking.checkOutTime}
        />
      </main>
      <PublicFooter property={db.settings.property} />
    </div>
  );
}
