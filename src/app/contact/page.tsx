import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { readPublicSiteData } from '@/lib/public/read-site-data';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { unreadForSession } from '@/lib/domain/inbox';
import { OFFICIAL_BRAND_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const { db, session } = await readPublicSiteData();
  const { property, booking, payments } = db.settings;
  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const fullAddress = [property.addressLine, property.city, property.country]
    .filter(Boolean)
    .join(', ');
  const mapsQueryUrl =
    db.settings.googleBusiness?.mapsProfileUrl?.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.name} ${fullAddress}`)}`;

  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader
        property={property}
        session={session}
        activePath="/contact"
        unreadCount={unreadForSession(db, session)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-10 px-4 py-12 sm:px-6 lg:px-8">
        <div className="animate-fade-up max-w-2xl">
          <p className="text-[0.8rem] font-medium text-lemma-dark">
            {property.addressLine} · {property.city}
          </p>
          <h1 className="mt-1 font-display text-[2.05rem] font-medium tracking-[-0.015em] text-navy-900 sm:text-[2.3rem]">
            Location &amp; front desk contact
          </h1>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-sand-700">
            Reach our Lusaka reception desk directly for date enquiries, corporate or monthly stay
            quotations, late-evening check-ins, or driving directions to the gate.
          </p>
        </div>

        <div className="stagger grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="space-y-6">
            <div className="card space-y-5 p-6 sm:p-7">
              <div className="flex items-center gap-3 border-b border-sand-200 pb-4">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-sand-100 text-lemma-dark ring-1 ring-sand-200">
                  <Phone size={17} />
                </span>
                <div>
                  <h2 className="font-display text-[1.22rem] font-medium text-navy-900">
                    Front desk contact
                  </h2>
                  <p className="text-[0.78rem] text-sand-600">
                    Direct phone, WhatsApp and email handled on site in Lusaka
                  </p>
                </div>
              </div>

              <ul className="space-y-3.5 text-[0.88rem] text-navy-800">
                <li className="flex items-start gap-3">
                  <MapPin size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Address</p>
                    <p className="text-sand-700">{fullAddress}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Phone size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Telephone</p>
                    <a
                      href={`tel:${property.phone.replace(/\s/g, '')}`}
                      className="text-sand-700 hover:text-navy-900 hover:underline"
                    >
                      {property.phone}
                    </a>
                  </div>
                </li>
                {waDigits ? (
                  <li className="flex items-start gap-3">
                    <MessageCircle size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                    <div>
                      <p className="font-semibold text-navy-900">WhatsApp reception</p>
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-lemma-dark hover:underline"
                      >
                        Message {property.whatsapp}
                      </a>
                    </div>
                  </li>
                ) : null}
                <li className="flex items-start gap-3">
                  <Mail size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Email</p>
                    <a
                      href={`mailto:${property.email}`}
                      className="text-sand-700 hover:text-navy-900 hover:underline"
                    >
                      {property.email}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <div>
                    <p className="font-semibold text-navy-900">Reception hours</p>
                    <p className="text-sand-700">{property.receptionHours}</p>
                  </div>
                </li>
              </ul>

              <div className="flex flex-wrap gap-2.5 border-t border-sand-200 pt-4">
                <Link href="/apartments" className="btn btn-primary">
                  Check availability online
                </Link>
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${OFFICIAL_BRAND_NAME}, I would like to request a stay quotation.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    <MessageCircle size={15} /> Request quote on WhatsApp
                  </a>
                ) : null}
              </div>
            </div>

            <div className="card space-y-3.5 p-6 sm:p-7">
              <h2 className="font-display text-[1.18rem] font-medium text-navy-900">
                Accepted ZMW payment channels
              </h2>
              <p className="text-[0.84rem] leading-relaxed text-sand-700">
                We accept local mobile money, bank transfer and cash in Zambian Kwacha. To keep
                payments traceable, merchant and account numbers are issued alongside your booking
                reference.
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {payments.methods
                  .filter((m) => m.enabled)
                  .map((m) => {
                    const configuredAccount = m.accountNumber?.trim();
                    return (
                      <div
                        key={m.id}
                        className="rounded-lg border border-sand-200 bg-sand-50/70 p-3 text-[0.82rem]"
                      >
                        <p className="flex items-center gap-2 font-semibold text-navy-900">
                          <CheckCircle2 size={14} className="shrink-0 text-st-available" />
                          {m.label}
                        </p>
                        {configuredAccount ? (
                          <p className="mt-1 pl-5 text-[0.77rem] text-sand-700">
                            {m.accountLabel}: <strong className="text-navy-900">{configuredAccount}</strong>
                          </p>
                        ) : (
                          <p className="mt-1 pl-5 text-[0.76rem] text-sand-600">
                            {m.id === 'cash'
                              ? 'Paid in ZMW at the front desk against an official receipt'
                              : 'Details provided on your booking confirmation'}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card space-y-4 p-6 sm:p-7">
              <h2 className="font-display text-[1.22rem] font-medium text-navy-900">
                Getting to {property.addressLine}
              </h2>
              <p className="text-[0.86rem] leading-relaxed text-sand-700">
                {property.name} is situated in <strong>{property.addressLine}</strong> on the
                north-western side of Lusaka, within a gated residential compound with private
                on-site parking.
              </p>
              <ul className="space-y-2.5 rounded-lg border border-sand-200 bg-sand-50/70 p-4 text-[0.83rem] text-sand-700">
                <li>
                  <strong className="text-navy-900">Standard check-in:</strong> From{' '}
                  {booking.checkInTime} (check-out by {booking.checkOutTime}).
                </li>
                <li>
                  <strong className="text-navy-900">Late or early arrivals:</strong> Message
                  reception on WhatsApp ahead of time so staff at the gate expect you.
                </li>
                <li>
                  <strong className="text-navy-900">Exact GPS pin:</strong> Use the map search link
                  below, or ask reception on WhatsApp to drop the live gate pin directly to your
                  driver.
                </li>
              </ul>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <a
                  href={mapsQueryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  <MapPin size={15} /> Open {property.addressLine} in Google Maps{' '}
                  <ExternalLink size={13} />
                </a>
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${property.name}, please share the WhatsApp location pin for arrival.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost"
                  >
                    <MessageCircle size={15} /> Request live WhatsApp pin
                  </a>
                ) : null}
              </div>
            </div>

            <div className="card space-y-2.5 p-6 text-[0.85rem] leading-relaxed text-sand-700">
              <p className="flex items-center gap-2 font-semibold text-navy-900">
                <ShieldCheck size={16} className="text-lemma-dark" /> Corporate &amp; extended stays
              </p>
              <p>
                Need a formal pro-forma quotation or ZMW invoice for an organisation, NGO or
                project team? Email <strong>{property.email}</strong> or message reception with your
                company name, dates and number of apartments required.
              </p>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
