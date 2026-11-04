import Link from 'next/link';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getSession } from '@/lib/auth/session';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoFrame } from '@/components/ui/photo';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
  const { property, payments } = db.settings;
  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');

  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader property={property} session={session} activePath="/contact" unreadCount={unreadForSession(db, session)} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6 lg:px-8 space-y-10">
        <div className="animate-fade-up">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
            Direct Front Office
          </p>
          <h1 className="mt-1 text-[1.95rem] font-bold tracking-tight text-navy-900">
            Contact &amp; Directions
          </h1>
          <p className="mt-1.5 max-w-2xl text-[0.92rem] text-navy-600">
            Reach our Lusaka reception desk directly for group reservations, long-stay corporate
            quotations, airport transfers, or arrival assistance.
          </p>
        </div>

        <div className="stagger grid gap-8 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-6">
            <div className="card space-y-4 p-6">
              <div className="flex items-center gap-2.5 border-b border-sand-100 pb-3.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <MapPin size={16} />
                </span>
                <div>
                  <h2 className="text-[1.05rem] font-semibold leading-tight text-navy-900">Reception Details</h2>
                  <p className="text-[0.75rem] text-navy-400">Reach the desk directly — no call centre</p>
                </div>
              </div>
              <ul className="space-y-3 text-[0.88rem] text-navy-700">
                <li className="flex items-start gap-3">
                  <MapPin size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Street Address</p>
                    <p>
                      {property.addressLine}, {property.city}, {property.country}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Phone size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Telephone</p>
                    <a href={`tel:${property.phone}`} className="hover:underline">
                      {property.phone}
                    </a>
                  </div>
                </li>
                {waDigits ? (
                  <li className="flex items-start gap-3">
                    <MessageCircle size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                    <div>
                      <p className="font-semibold text-navy-900">WhatsApp Desk</p>
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-lemma-dark font-medium hover:underline"
                      >
                        Chat with Reception ({property.whatsapp})
                      </a>
                    </div>
                  </li>
                ) : null}
                <li className="flex items-start gap-3">
                  <Mail size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Email</p>
                    <a href={`mailto:${property.email}`} className="hover:underline">
                      {property.email}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Reception Hours</p>
                    <p>{property.receptionHours}</p>
                  </div>
                </li>
              </ul>

              <div className="flex flex-wrap gap-3 border-t border-sand-200 pt-4">
                <Link href="/apartments" className="btn btn-primary">
                  Check Availability Online
                </Link>
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent('Hello Lemma Apartments Reception, I would like to request a stay quotation.')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    <MessageCircle size={15} /> WhatsApp Quotation Request
                  </a>
                ) : null}
              </div>
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="text-[1.05rem] font-semibold text-navy-900">
                Accepted ZMW Payment Channels
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {payments.methods
                  .filter((m) => m.enabled)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-sand-200 bg-sand-50 p-3 text-[0.8rem] transition-colors duration-200 hover:border-brand-300 hover:bg-white"
                    >
                      <p className="font-semibold text-navy-900">{m.label}</p>
                      <p className="mt-0.5 text-navy-600">
                        {m.accountLabel}: <strong>{m.accountNumber}</strong>
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card img-zoom overflow-hidden p-3">
              <PhotoFrame
                src="/images/property/reception.jpg"
                alt="Lemma Apartments Reception"
                ratio="16 / 10"
                variant="detail"
              />
            </div>
            <div className="card p-6 text-[0.86rem] text-navy-600 space-y-2">
              <h3 className="text-[1rem] font-semibold text-navy-900">
                Airport &amp; Business District Access
              </h3>
              <p>
                Approximately 20 minutes from Kenneth Kaunda International Airport along Great East
                Road, and 10 minutes to East Park Mall, UNZA, and Arcades commercial precinct.
              </p>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
