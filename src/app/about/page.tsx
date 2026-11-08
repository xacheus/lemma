import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  UtensilsCrossed,
  Wifi,
  Zap,
} from 'lucide-react';
import { readPublicSiteData } from '@/lib/public/read-site-data';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoFrame } from '@/components/ui/photo';
import { Reveal } from '@/components/ui/motion';
import { BrandMark } from '@/components/public/brand-mark';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const { db, session } = await readPublicSiteData();
  const { property, booking } = db.settings;
  const published = db.apartments.filter(
    (a) => a.active && a.publicationStatus !== 'draft',
  );
  const publishedCount = published.length;
  const realPhotos = Array.from(
    new Set(
      published
        .flatMap((a) => [a.coverPhoto, ...(a.gallery?.map((g) => g.url) ?? a.photos)])
        .filter((p): p is string => Boolean(p)),
    ),
  );

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader
        property={property}
        session={session}
        activePath="/about"
        unreadCount={unreadForSession(db, session)}
      />

      <main className="flex-1">
        {/* Page banner: a full-bleed navy photograph band, as on the reference inner pages */}
        <section
          className="page-banner"
          style={realPhotos[0] ? { backgroundImage: `url("${realPhotos[0]}")` } : undefined}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
            <span className="eyebrow">About Us</span>
            <h1 className="mt-2 max-w-3xl">
              Self-catering apartments built for practical stays in Lusaka.
            </h1>
            <p className="mt-3 font-heading text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-swdl-gold">
              {property.addressLine}, {property.city}
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-7xl space-y-14 px-4 py-14 sm:px-6 lg:px-8">
        <div className="animate-fade-up grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div>
            <p className="font-heading text-[0.8rem] font-bold uppercase tracking-[0.14em] text-swdl-goldDark">
              {property.addressLine}, {property.city}
            </p>
            <h2 className="mt-2 font-heading text-[1.85rem] font-extrabold leading-[1.15] tracking-[-0.01em] sm:text-[2.15rem]">
              A whole apartment, run like a proper front desk.
            </h2>
            <p className="mt-4 text-[0.96rem] leading-relaxed text-swdl-muted">
              Located at {property.addressLine} in {property.city}, {property.name} offers{' '}
              {publishedCount > 0
                ? `${publishedCount} private furnished ${publishedCount === 1 ? 'apartment' : 'apartments'}`
                : 'private furnished apartments'}{' '}
              for guests who prefer a proper kitchen, living space and reliable utilities over a
              standard hotel room.
            </p>
            <p className="mt-3 text-[0.96rem] leading-relaxed text-swdl-muted">
              Whether you are visiting Lusaka on business, relocating with family, or staying
              between flights, rates are quoted straightforwardly in Zambian Kwacha per apartment per
              night—with Wi-Fi, backup power, housekeeping and compound parking included.
            </p>

            <ul className="check-gold mt-6 space-y-1">
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>Managed on site by our own reception team, never a third-party agent</span>
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>Kwacha pricing with an official PDF receipt for every verified payment</span>
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>Linen, housekeeping, Wi-Fi, backup power and parking included in the rate</span>
              </li>
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/apartments" className="btn btn-gold px-6 py-2.5">
                View apartments &amp; rates <ArrowRight size={15} />
              </Link>
              <Link href="/contact" className="btn btn-navy px-6 py-2.5">
                Location &amp; front desk
              </Link>
            </div>
          </div>

          {realPhotos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5">
              {realPhotos.slice(0, 3).map((src, index) => (
                <div
                  key={`${src}-${index}`}
                  className={`${
                    index === 0 || realPhotos.length === 1 ? 'col-span-2' : ''
                  } overflow-hidden rounded-[14px] ring-1 ring-black/5`}
                >
                  <PhotoFrame
                    src={src}
                    alt={`${property.name} apartment interior`}
                    ratio={index === 0 || realPhotos.length === 1 ? '16 / 9' : '4 / 3'}
                    variant={index === 0 ? 'detail' : 'card'}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="swdl-card space-y-5 p-7 sm:p-9">
              <div className="flex items-center gap-3">
                <BrandMark tone="light" size="lg" />
                <div>
                  <p className="font-heading text-[0.72rem] font-bold uppercase tracking-[0.14em] text-swdl-goldDark">
                    Property overview
                  </p>
                  <h2 className="font-heading text-[1.3rem] font-extrabold">
                    {property.name}
                  </h2>
                </div>
              </div>
              <p className="text-[0.9rem] leading-relaxed text-swdl-muted">
                Managed directly on site at {property.addressLine}. Guests deal with our Lusaka
                reception team from initial availability enquiry through check-in and official ZMW
                receipting.
              </p>
              <ul className="space-y-2.5 border-t border-[#EEE] pt-4 text-[0.87rem] text-swdl-ink">
                <li className="flex items-center gap-2.5">
                  <MapPin size={15} className="shrink-0 text-swdl-goldDark" />
                  <span>
                    {property.addressLine}, {property.city}, {property.country}
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Clock size={15} className="shrink-0 text-swdl-goldDark" />
                  <span>{property.receptionHours}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Phone size={15} className="shrink-0 text-swdl-goldDark" />
                  <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="font-semibold transition-colors hover:text-swdl-goldDark">
                    {property.phone}
                  </a>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Zap,
              title: 'Load-shedding backup',
              text: 'Backup power keeps lighting, internet routers and refrigeration running through scheduled outages.',
            },
            {
              icon: Wifi,
              title: 'Work-ready internet',
              text: 'Every unit has dedicated Wi-Fi and table space suited to remote work and video calls.',
            },
            {
              icon: UtensilsCrossed,
              title: 'Private kitchens',
              text: 'Cook on your own timetable with a stove, fridge, microwave, kettle and full utensils.',
            },
            {
              icon: ShieldCheck,
              title: 'Verified ZMW receipts',
              text: `A ${booking.depositPercent}% deposit holds confirmed dates, and every verified payment receives an official PDF receipt.`,
            },
          ].map((c) => (
            <div key={c.title} className="swdl-card swdl-service p-7 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-swdl-light text-swdl-goldDark ring-1 ring-swdl-gold/30">
                <c.icon size={21} />
              </span>
              <h2 className="mt-4 font-heading text-[1rem] font-bold">{c.title}</h2>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-swdl-muted">{c.text}</p>
            </div>
          ))}
        </div>

        <Reveal className="swdl-card p-7 sm:p-9">
          <div className="flex items-center gap-2.5">
            <Building2 size={19} className="text-swdl-goldDark" />
            <h2 className="font-heading text-[1.3rem] font-extrabold">Arrival &amp; stay essentials</h2>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 text-[0.88rem] leading-relaxed text-swdl-muted sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-swdl-goldDark" />
              <span>
                <strong className="font-semibold text-swdl-navy">Check-in &amp; check-out:</strong> Check-in from{' '}
                {booking.checkInTime}; check-out by {booking.checkOutTime}. Front desk hours:{' '}
                {property.receptionHours}
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-swdl-goldDark" />
              <span>
                <strong className="font-semibold text-swdl-navy">Deposit &amp; balance:</strong>{' '}
                {booking.depositPercent}% of the stay total holds confirmed dates via Airtel Money,
                MTN Mobile Money, bank transfer or cash at reception.
              </span>
            </div>
            <div className="flex items-start gap-2.5 sm:col-span-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-swdl-goldDark" />
              <span>
                <strong className="font-semibold text-swdl-navy">Changes &amp; cancellation:</strong>{' '}
                {booking.cancellationText}
              </span>
            </div>
          </div>
        </Reveal>

        {/* Closing banner */}
        <Reveal as="section" className="cta-band px-7 py-14 text-center sm:px-12">
          <p className="font-heading text-[0.76rem] font-bold uppercase tracking-[0.16em] text-swdl-gold">
            {property.addressLine} · {property.city}, {property.country}
          </p>
          <h2 className="mt-2 font-heading text-[1.6rem] font-extrabold text-white sm:text-[2.1rem]">
            Planning dates in Lusaka?
          </h2>
          <p className="mx-auto mt-2.5 max-w-xl text-[0.95rem]">
            Compare apartments online or speak directly with reception for long-stay quotes.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3.5">
            <Link href="/apartments" className="btn btn-gold px-7 py-3 text-[0.92rem]">
              Check availability <ArrowRight size={16} />
            </Link>
            <a
              href={`tel:${property.phone.replace(/\s/g, '')}`}
              className="btn btn-outline-light px-6 py-3 text-[0.92rem]"
            >
              <Phone size={16} /> Call {property.phone}
            </a>
          </div>
        </Reveal>
        </div>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
