import Link from 'next/link';
import {
  ArrowRight,
  Bath,
  Building2,
  BedDouble,
  CheckCircle2,
  Clock,
  MapPin,
  Maximize2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Wifi,
} from 'lucide-react';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getSession } from '@/lib/auth/session';
import { addISO } from '@/lib/domain/dates';
import { APARTMENT_TIER_LABELS } from '@/lib/domain/status';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoFrame } from '@/components/ui/photo';
import { CountUp, Reveal } from '@/components/ui/motion';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
  const { property, booking } = db.settings;

  const publishedApartments = db.apartments
    .filter((a) => a.active && a.publicationStatus !== 'draft')
    .sort((a, b) => a.number - b.number);
  const featured = publishedApartments.slice(0, 6);

  const defaultCheckIn = db.__today;
  const defaultCheckOut = addISO(db.__today, 3);
  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');

  return (
    <div className="flex min-h-screen flex-col bg-white text-navy-900">
      <PublicHeader property={property} session={session} activePath="/" />

      <main className="flex-1">
        {/* Hero Banner */}
        <section className="relative isolate overflow-hidden bg-charcoal-950 text-white">
          {/* Photograph layer: settles in once, then holds still */}
          <div className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hero-banner.jpg"
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              className="hero-settle h-full w-full object-cover object-[62%_center] opacity-[0.92]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-charcoal-950 via-charcoal-950/85 to-charcoal-950/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950 via-transparent to-charcoal-950/40" />
            {/* Architectural hairline grid, faint */}
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                backgroundSize: '72px 72px',
              }}
            />
          </div>

          <div className="mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 lg:px-8 lg:pb-20 lg:pt-24">
            <div className="max-w-2xl">
              <div className="hero-line flex items-center gap-3" style={{ animationDelay: '0.05s' }}>
                <span className="relative flex h-1.5 w-1.5">
                  {/* emerald is the one non-brand accent, reserved for "open / live" */}
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-[#34d399]" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34d399]" />
                </span>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/70">
                  Serviced Residences · {property.city}, {property.country}
                </p>
              </div>

              <h1
                className="hero-line mt-5 text-[2.3rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[3.1rem] lg:text-[3.4rem]"
                style={{ animationDelay: '0.12s' }}
              >
                A quiet base in Lusaka,
                <span className="block text-white/70">run like a house, not a hotel.</span>
              </h1>

              <p
                className="hero-line mt-5 max-w-xl text-[0.98rem] leading-relaxed text-white/75"
                style={{ animationDelay: '0.2s' }}
              >
                {publishedApartments.length > 0
                  ? `${publishedApartments.length} furnished ${
                      publishedApartments.length === 1 ? 'apartment' : 'apartments'
                    } on Great East Road — solar backup, 200Mbps fibre, full kitchens and honest Kwacha billing.`
                  : 'Furnished apartments on Great East Road — solar backup, 200Mbps fibre, full kitchens and honest Kwacha billing.'}
              </p>

              <div
                className="hero-line mt-7 flex flex-wrap items-center gap-3"
                style={{ animationDelay: '0.28s' }}
              >
                <Link
                  href="/apartments"
                  className="btn shine bg-white px-6 py-3 text-[0.9rem] font-semibold text-charcoal-900 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:bg-white/90"
                >
                  Check availability <ArrowRight size={16} />
                </Link>
                <a
                  href={`tel:${property.phone}`}
                  className="btn border border-white/25 px-5 py-3 text-[0.88rem] text-white transition-colors duration-300 hover:border-white/50 hover:bg-white/10"
                >
                  <Phone size={15} /> {property.phone}
                </a>
              </div>
            </div>

            {/* Floating availability card */}
            <form
              action="/apartments"
              method="get"
              className="hero-line mt-10 grid gap-3 rounded-xl border border-white/15 bg-white/95 p-4 text-navy-900 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)] backdrop-blur-md sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.7fr_auto] lg:items-end"
              style={{ animationDelay: '0.36s' }}
            >
              <div>
                <label className="label mb-1 block" htmlFor="hero-checkin">
                  Check-in
                </label>
                <input
                  id="hero-checkin"
                  name="checkIn"
                  type="date"
                  defaultValue={defaultCheckIn}
                  min={defaultCheckIn}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="hero-checkout">
                  Check-out
                </label>
                <input
                  id="hero-checkout"
                  name="checkOut"
                  type="date"
                  defaultValue={defaultCheckOut}
                  min={addISO(defaultCheckIn, 1)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="hero-guests">
                  Guests
                </label>
                <select id="hero-guests" name="guests" defaultValue="2" className="field">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'Guest' : 'Guests'}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary shine h-[38px] justify-center px-5 transition-transform duration-300 ease-smooth hover:-translate-y-0.5"
              >
                Search dates
              </button>
            </form>

            {/* Trust strip */}
            <div className="hero-line mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 text-[0.78rem] text-white/65" style={{ animationDelay: '0.44s' }}>
              {[
                { icon: Sun, label: 'Solar & inverter backup' },
                { icon: Wifi, label: '200Mbps fibre' },
                { icon: ShieldCheck, label: '24/7 gated security' },
                { icon: Clock, label: `Check-in from ${booking.checkInTime}` },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <item.icon size={14} className="text-white/80" /> {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Apartments */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                Residences &amp; Suites
              </p>
              <h2 className="mt-1 text-[1.65rem] font-bold tracking-tight text-navy-900">
                Featured Serviced Apartments
              </h2>
            </div>
            {publishedApartments.length > 0 ? (
              <Link
                href="/apartments"
                className="inline-flex items-center gap-1.5 text-[0.86rem] font-semibold text-navy-900 hover:text-lemma-dark"
              >
                View all {publishedApartments.length}{' '}
                {publishedApartments.length === 1 ? 'apartment' : 'apartments'}{' '}
                <ArrowRight size={15} />
              </Link>
            ) : null}
          </div>

          {featured.length === 0 ? (
            <div className="mt-8 rounded-md border border-dashed border-sand-300 bg-sand-50 px-6 py-12 text-center">
              <Building2 size={22} className="mx-auto text-lemma-dark" />
              <h3 className="mt-3 text-[1.05rem] font-semibold text-navy-900">
                Apartments are being prepared for online booking
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-[0.88rem] leading-relaxed text-navy-600">
                The residence list is not published yet. Call or message reception and we will
                confirm availability and hold dates for you directly.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <a href={`tel:${property.phone}`} className="btn btn-primary">
                  <Phone size={15} /> Call reception ({property.phone})
                </a>
                <Link href="/contact" className="btn btn-secondary">
                  Contact the front desk
                </Link>
              </div>
            </div>
          ) : (
          <div className="stagger mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((apt) => (
              <article
                key={apt.id}
                className="hover-lift group flex flex-col overflow-hidden rounded-lg border border-sand-200 bg-white hover:border-brand-300 hover:shadow-pop"
              >
                <Link href={`/apartments/${apt.slug}`} className="img-zoom block overflow-hidden">
                  <PhotoFrame
                    src={apt.coverPhoto || apt.photos[0]}
                    alt={apt.name}
                    ratio="16 / 10"
                    variant="card"
                  />
                </Link>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-lemma-dark">
                    <span>{APARTMENT_TIER_LABELS[apt.tier] || apt.tier}</span>
                    <span>Unit {apt.code}</span>
                  </div>
                  <Link href={`/apartments/${apt.slug}`}>
                    <h3 className="mt-1.5 text-[1.08rem] font-semibold text-navy-900 hover:text-lemma-dark">
                      {apt.name}
                    </h3>
                  </Link>
                  <p className="mt-1.5 line-clamp-2 text-[0.84rem] leading-relaxed text-navy-600">
                    {apt.tagline || apt.description}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3.5 border-t border-sand-200 pt-3.5 text-[0.78rem] text-navy-600">
                    <span className="inline-flex items-center gap-1">
                      <Users size={13} /> Up to {apt.maxGuests}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BedDouble size={13} /> {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} Bed`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bath size={13} /> {apt.bathrooms} Bath
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Maximize2 size={13} /> {apt.sizeSqm} m²
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-1">
                    <div>
                      <span className="text-[1.12rem] font-bold text-navy-900 tabular-nums">
                        K{apt.nightlyRate.toLocaleString('en-US')}
                      </span>
                      <span className="text-[0.78rem] text-navy-500"> / night</span>
                    </div>
                    <Link
                      href={`/apartments/${apt.slug}`}
                      className="btn btn-secondary py-1.5 text-[0.8rem]"
                    >
                      Details &amp; Book
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          )}
        </Reveal>

        {/* Amenities & Guest Benefits */}
        <Reveal as="section" className="border-y border-sand-200 bg-sand-50">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                  Engineered for Reliability
                </p>
                <h2 className="mt-1.5 text-[1.65rem] font-bold tracking-tight text-navy-900">
                  Amenities &amp; Corporate Guest Standards
                </h2>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-navy-600">
                  Every residence is equipped for uninterrupted work and comfortable extended stays
                  in Lusaka, backed by on-site engineering and reception teams.
                </p>

                <div className="stagger mt-6 grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      icon: Sun,
                      title: 'Solar & Inverter Backup',
                      desc: 'Uninterrupted lighting, refrigeration, Wi-Fi, and workstation power.',
                    },
                    {
                      icon: Wifi,
                      title: '200Mbps Dedicated Fibre',
                      desc: 'Reliable video calls and VPN connectivity in every apartment.',
                    },
                    {
                      icon: ShieldCheck,
                      title: '24/7 Gated Security',
                      desc: 'Controlled access, perimeter CCTV, and dedicated on-site parking.',
                    },
                    {
                      icon: Sparkles,
                      title: 'Daily Housekeeping',
                      desc: 'Scheduled linen service, full kitchens, and inspected turnovers.',
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="hover-lift rounded-lg border border-sand-200 bg-white p-4 hover:border-brand-300 hover:shadow-card"
                    >
                      <item.icon size={18} className="text-lemma-dark" />
                      <h3 className="mt-2.5 text-[0.9rem] font-semibold text-navy-900">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-[0.8rem] leading-relaxed text-navy-600">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <PhotoFrame
                  src="/images/rooms/kitchen.jpg"
                  alt="Fitted Apartment Kitchen"
                  ratio="4 / 3"
                  variant="card"
                />
                <PhotoFrame
                  src="/images/property/amenities.jpg"
                  alt="Courtyard Terrace & Gardens"
                  ratio="4 / 3"
                  variant="card"
                />
                <div className="sm:col-span-2">
                  <PhotoFrame
                    src="/images/rooms/living-room.jpg"
                    alt="Spacious Open-Plan Living Room"
                    ratio="16 / 8"
                    variant="detail"
                  />
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Numbers band */}
        <Reveal as="section" className="bg-charcoal-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-px overflow-hidden px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {[
              { value: publishedApartments.length, suffix: '', label: 'Serviced apartments', sub: 'Studio to three-bedroom family units' },
              { value: 200, suffix: 'Mbps', label: 'Fibre in every unit', sub: 'Dedicated, not shared building Wi-Fi' },
              { value: 24, suffix: '/7', label: 'Gated security', sub: 'Controlled access and on-site parking' },
              { value: 50, suffix: '%', label: 'Deposit to confirm', sub: 'Balance due on or before check-in' },
            ].map((stat) => (
              <div key={stat.label} className="border-l border-white/10 px-5 py-6 first:border-l-0 lg:py-4">
                <p className="text-[2rem] font-semibold leading-none tracking-tight">
                  <CountUp value={stat.value} />
                  <span className="text-[1rem] font-medium text-white/50">{stat.suffix}</span>
                </p>
                <p className="mt-2.5 text-[0.86rem] font-semibold text-white/90">{stat.label}</p>
                <p className="mt-1 text-[0.76rem] leading-relaxed text-white/50">{stat.sub}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Location & Direct Reception CTA */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 rounded-lg border border-sand-200 bg-white p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                Location &amp; Direct Desk
              </p>
              <h2 className="mt-1 text-[1.45rem] font-bold text-navy-900">
                Chainama Lands, Great East Road, Lusaka
              </h2>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-navy-600">
                Conveniently positioned between Kenneth Kaunda International Airport and East Park /
                Arcades commercial districts. Need an official ZMW corporate quotation before you
                travel? Contact our front desk directly.
              </p>
              <div className="mt-4 flex items-center gap-2 text-[0.84rem] text-navy-700">
                <MapPin size={15} className="text-lemma-dark" />
                <span>
                  {property.addressLine}, {property.city}, {property.country}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link href="/apartments" className="btn btn-primary justify-center py-2.5">
                Check Dates &amp; Book Online <ArrowRight size={15} />
              </Link>
              {waDigits ? (
                <a
                  href={`https://wa.me/${waDigits}?text=${encodeURIComponent('Hello Lemma Heights Reception, I would like to enquire about apartment availability.')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary justify-center py-2.5"
                >
                  <MessageCircle size={15} /> Enquire via WhatsApp
                </a>
              ) : null}
              <a href={`tel:${property.phone}`} className="btn btn-secondary justify-center py-2.5">
                <Phone size={15} /> Call Reception ({property.phone})
              </a>
            </div>
          </div>
        </Reveal>

      </main>

      <PublicFooter property={property} />
    </div>
  );
}
