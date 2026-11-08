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

export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const { db, session } = await readPublicSiteData();
  const { property, booking, payments } = db.settings;
  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const fullAddress = [property.addressLine, property.city, property.country]
    .filter(Boolean)
    .join(', ');
  const bannerPhoto =
    db.apartments
      .flatMap((a) => [a.coverPhoto, ...(a.gallery?.map((g) => g.url) ?? a.photos)])
      .find(Boolean) ?? null;

  const mapsQueryUrl =
    db.settings.googleBusiness?.mapsProfileUrl?.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.name} ${fullAddress}`)}`;

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader
        property={property}
        session={session}
        activePath="/contact"
        unreadCount={unreadForSession(db, session)}
      />

      <main className="flex-1">
        <section
          className="page-banner"
          style={bannerPhoto ? { backgroundImage: `url("${bannerPhoto}")` } : undefined}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
            <span className="eyebrow">Contact Us</span>
            <h1 className="mt-2 max-w-3xl font-heading text-[2rem] font-extrabold tracking-[-0.01em] text-white sm:text-[2.6rem]">
              Location &amp; front desk contact
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[0.98rem] leading-relaxed text-[#D7DEE6]">
              Reach our Lusaka reception desk directly for date enquiries, corporate or monthly stay
              quotations, late-evening check-ins, or driving directions to the gate.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-7xl space-y-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <p className="text-center font-heading text-[0.78rem] font-extrabold uppercase tracking-[0.16em] text-swdl-goldDark">
            {property.addressLine} · {property.city}
          </p>

        <div className="stagger grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="space-y-6">
            <div className="swdl-card space-y-5 p-7 sm:p-8">
              <div className="flex items-center gap-3 border-b border-[#EEE] pb-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-swdl-light text-swdl-goldDark ring-1 ring-swdl-gold/30">
                  <Phone size={17} />
                </span>
                <div>
                  <h2 className="font-heading text-[1.22rem] font-extrabold">
                    Front desk contact
                  </h2>
                  <p className="text-[0.8rem] text-swdl-muted">
                    Direct phone, WhatsApp and email handled on site in Lusaka
                  </p>
                </div>
              </div>

              <ul className="space-y-3.5 text-[0.9rem] text-swdl-ink">
                <li className="flex items-start gap-3">
                  <MapPin size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <div>
                    <p className="font-heading font-bold text-swdl-navy">Address</p>
                    <p className="text-swdl-muted">{fullAddress}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Phone size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <div>
                    <p className="font-heading font-bold text-swdl-navy">Telephone</p>
                    <a
                      href={`tel:${property.phone.replace(/\s/g, '')}`}
                      className="text-swdl-muted transition-colors hover:text-swdl-goldDark"
                    >
                      {property.phone}
                    </a>
                  </div>
                </li>
                {waDigits ? (
                  <li className="flex items-start gap-3">
                    <MessageCircle size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                    <div>
                      <p className="font-heading font-bold text-swdl-navy">WhatsApp reception</p>
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-swdl-goldDark transition-colors hover:text-swdl-navy"
                      >
                        Message {property.whatsapp}
                      </a>
                    </div>
                  </li>
                ) : null}
                <li className="flex items-start gap-3">
                  <Mail size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <div>
                    <p className="font-heading font-bold text-swdl-navy">Email</p>
                    <a
                      href={`mailto:${property.email}`}
                      className="text-swdl-muted transition-colors hover:text-swdl-goldDark"
                    >
                      {property.email}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <div>
                    <p className="font-heading font-bold text-swdl-navy">Reception hours</p>
                    <p className="text-swdl-muted">{property.receptionHours}</p>
                  </div>
                </li>
              </ul>

              <div className="flex flex-wrap gap-3 border-t border-[#EEE] pt-5">
                <Link href="/apartments" className="btn btn-gold px-6 py-2.5">
                  Check availability online
                </Link>
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent('Hello Lemma Apartments, I would like to request a stay quotation.')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-navy px-6 py-2.5"
                  >
                    <MessageCircle size={15} /> Request quote on WhatsApp
                  </a>
                ) : null}
              </div>
            </div>

            <div className="swdl-card space-y-3.5 p-7 sm:p-8">
              <h2 className="font-heading text-[1.2rem] font-extrabold">
                Accepted ZMW payment channels
              </h2>
              <p className="text-[0.88rem] leading-relaxed text-swdl-muted">
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
                        className="rounded-[10px] border border-[#DFE3E8] bg-swdl-card p-3.5 text-[0.85rem] transition-colors hover:border-swdl-gold"
                      >
                        <p className="flex items-center gap-2 font-heading font-bold text-swdl-navy">
                          <CheckCircle2 size={14} className="shrink-0 text-swdl-goldDark" />
                          {m.label}
                        </p>
                        {configuredAccount ? (
                          <p className="mt-1 pl-5 text-[0.8rem] text-swdl-muted">
                            {m.accountLabel}: <strong className="font-semibold text-swdl-navy">{configuredAccount}</strong>
                          </p>
                        ) : (
                          <p className="mt-1 pl-5 text-[0.8rem] text-swdl-muted">
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
            <div className="swdl-card space-y-4 p-7 sm:p-8">
              <h2 className="font-heading text-[1.22rem] font-extrabold">
                Getting to {property.addressLine}
              </h2>
              <p className="text-[0.9rem] leading-relaxed text-swdl-muted">
                {property.name} is situated in <strong>{property.addressLine}</strong> on the
                north-western side of Lusaka, within a gated residential compound with private
                on-site parking.
              </p>
              <ul className="space-y-2.5 rounded-[10px] border border-[#DFE3E8] bg-swdl-card p-4 text-[0.86rem] text-swdl-muted">
                <li>
                  <strong className="font-semibold text-swdl-navy">Standard check-in:</strong> From{' '}
                  {booking.checkInTime} (check-out by {booking.checkOutTime}).
                </li>
                <li>
                  <strong className="font-semibold text-swdl-navy">Late or early arrivals:</strong> Message
                  reception on WhatsApp ahead of time so staff at the gate expect you.
                </li>
                <li>
                  <strong className="font-semibold text-swdl-navy">Exact GPS pin:</strong> Use the map search link
                  below, or ask reception on WhatsApp to drop the live gate pin directly to your
                  driver.
                </li>
              </ul>

              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href={mapsQueryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-navy px-5 py-2.5"
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

            <div className="swdl-card space-y-2.5 p-7 text-[0.88rem] leading-relaxed text-swdl-muted">
              <p className="flex items-center gap-2 font-heading font-bold text-swdl-navy">
                <ShieldCheck size={16} className="text-swdl-goldDark" /> Corporate &amp; extended stays
              </p>
              <p>
                Need a formal pro-forma quotation or ZMW invoice for an organisation, NGO or
                project team? Email <strong>{property.email}</strong> or message reception with your
                company name, dates and number of apartments required.
              </p>
            </div>
          </div>
        </div>
        </div>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
