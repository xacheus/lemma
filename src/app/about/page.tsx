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
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <PublicHeader
        property={property}
        session={session}
        activePath="/about"
        unreadCount={unreadForSession(db, session)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <div className="animate-fade-up grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div>
            <p className="text-[0.8rem] font-medium text-lemma-dark">
              {property.addressLine}, {property.city}
            </p>
            <h1 className="mt-2 font-display text-[2.1rem] font-medium leading-[1.12] tracking-[-0.015em] text-navy-900 sm:text-[2.45rem]">
              Self-catering apartments built for practical stays in Lusaka.
            </h1>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-sand-700">
              Located at {property.addressLine} in {property.city}, {property.name} offers{' '}
              {publishedCount > 0
                ? `${publishedCount} private furnished ${publishedCount === 1 ? 'apartment' : 'apartments'}`
                : 'private furnished apartments'}{' '}
              for guests who prefer a proper kitchen, living space and reliable utilities over a
              standard hotel room.
            </p>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-sand-700">
              Whether you are visiting Lusaka on business, relocating with family, or staying
              between flights, rates are quoted straightforwardly in Zambian Kwacha per apartment per
              night—with Wi-Fi, backup power, housekeeping and compound parking included.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/apartments" className="btn btn-primary">
                View apartments &amp; rates <ArrowRight size={15} />
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Location &amp; front desk
              </Link>
              <Link href="/policies" className="btn btn-ghost">
                Booking &amp; cancellation terms
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
                  } overflow-hidden rounded-xl ring-1 ring-sand-200`}
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
            <div className="card space-y-5 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <BrandMark tone="light" size="lg" />
                <div>
                  <p className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-lemma-dark">
                    Property overview
                  </p>
                  <h2 className="font-display text-[1.3rem] font-medium text-navy-900">
                    {property.name}
                  </h2>
                </div>
              </div>
              <p className="text-[0.88rem] leading-relaxed text-sand-700">
                Managed directly on site at {property.addressLine}. Guests deal with our Lusaka
                reception team from initial availability enquiry through check-in and official ZMW
                receipting.
              </p>
              <ul className="space-y-2.5 border-t border-sand-200 pt-4 text-[0.85rem] text-navy-800">
                <li className="flex items-center gap-2.5">
                  <MapPin size={15} className="shrink-0 text-lemma-dark" />
                  <span>
                    {property.addressLine}, {property.city}, {property.country}
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Clock size={15} className="shrink-0 text-lemma-dark" />
                  <span>{property.receptionHours}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Phone size={15} className="shrink-0 text-lemma-dark" />
                  <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="font-medium hover:underline">
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
            <div key={c.title} className="card p-5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-sand-100 text-lemma-dark ring-1 ring-sand-200">
                <c.icon size={17} />
              </span>
              <h2 className="mt-3 text-[0.98rem] font-semibold text-navy-900">{c.title}</h2>
              <p className="mt-1.5 text-[0.84rem] leading-relaxed text-sand-700">{c.text}</p>
            </div>
          ))}
        </div>

        <Reveal className="card p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-navy-900">
            <Building2 size={18} className="text-lemma-dark" />
            <h2 className="font-display text-[1.3rem] font-medium">Arrival &amp; stay essentials</h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 text-[0.86rem] leading-relaxed text-sand-700 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-st-available" />
              <span>
                <strong className="text-navy-900">Check-in &amp; check-out:</strong> Check-in from{' '}
                {booking.checkInTime}; check-out by {booking.checkOutTime}. Front desk hours:{' '}
                {property.receptionHours}
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-st-available" />
              <span>
                <strong className="text-navy-900">Deposit &amp; balance:</strong>{' '}
                {booking.depositPercent}% of the stay total holds confirmed dates via Airtel Money,
                MTN Mobile Money, bank transfer or cash at reception.
              </span>
            </div>
            <div className="flex items-start gap-2.5 sm:col-span-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-st-available" />
              <span>
                <strong className="text-navy-900">Changes &amp; cancellation:</strong>{' '}
                {booking.cancellationText}
              </span>
            </div>
          </div>
        </Reveal>

        {/* Closing banner */}
        <Reveal as="section" className="overflow-hidden rounded-xl bg-charcoal-950 text-white">
          <div className="flex flex-col items-start justify-between gap-5 px-6 py-8 sm:flex-row sm:items-center sm:px-10">
            <div>
              <p className="text-[0.78rem] text-sand-300">
                {property.addressLine} · {property.city}, {property.country}
              </p>
              <h2 className="mt-1 font-display text-[1.45rem] font-medium tracking-[-0.01em]">
                Planning dates in Lusaka?
              </h2>
              <p className="mt-1 text-[0.86rem] text-sand-300">
                Compare apartments online or speak directly with reception for long-stay quotes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/apartments"
                className="btn bg-white px-5 py-2.5 text-[0.85rem] font-semibold text-charcoal-950 hover:bg-sand-100"
              >
                Check availability <ArrowRight size={15} />
              </Link>
              <a
                href={`tel:${property.phone.replace(/\s/g, '')}`}
                className="btn border border-white/25 px-4 py-2.5 text-[0.85rem] text-white transition-colors hover:bg-white/10"
              >
                Call {property.phone}
              </a>
            </div>
          </div>
        </Reveal>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
