import { readPublicSiteData } from '@/lib/public/read-site-data';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { unreadForSession } from '@/lib/domain/inbox';
import { BookingAccessClient } from './booking-access-client';

export const dynamic = 'force-dynamic';

export default async function BookingAccessPage() {
  const { db, session } = await readPublicSiteData();

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader
        property={db.settings.property}
        session={session}
        activePath="/booking/access"
        unreadCount={unreadForSession(db, session)}
      />
      <main className="flex-1">
        <BookingAccessClient property={db.settings.property} />
      </main>
      <PublicFooter property={db.settings.property} />
    </div>
  );
}
