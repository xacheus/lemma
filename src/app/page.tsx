import Link from 'next/link';
import {
  ArrowRight,
  Bath,
  BedDouble,
  CheckCircle2,
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
        {/* Hero Section */}
        <section className="border-b border-sand-200 bg-navy-900 text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:px-8 lg:py-16">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-lemma-light">
                Serviced Residences · {property.city}, {property.country}
              </p>
              <h1 className="mt-3 text-[2.1rem] font-bold leading-[1.15] tracking-tight sm:text-[2.65rem]">
                Quiet, solar-backed serviced apartments on Great East Road.
              </h1>
              <p className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-navy-200">
                Twelve thoughtfully furnished apartments in Chainama Lands — built for corporate
                travellers, diplomatic missions, and families seeking reliable power, 200Mbps fibre
                internet, full kitchens, and transparent ZMW billing.
              </p>

              {/* Live Availability Search Bar */}
              <form
                action="/apartments"
                method="get"
                className="mt-7 grid gap-3 rounded-md border border-white/15 bg-white p-4 text-navy-900 shadow-card sm:grid-cols-4"
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
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="btn btn-primary w-full justify-center py-2.5"
                  >
                    Search Availability
                  </button>
                </div>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-5 text-[0.8rem] text-navy-200">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-lemma-light" /> Check-in from{' '}
                  {booking.checkInTime}
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-lemma-light" /> Instant corporate ZMW
                  quotations &amp; receipts
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-md ring-1 ring-white/20">
              <PhotoFrame
                src="/images/hero/exterior-building.jpg"
                alt="Lemma Heights Apartments Exterior"
                ratio="4 / 3"
                variant="hero"
                priority
              />
            </div>
          </div>
        </section>

        {/* Featured Apartments */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                Residences &amp; Suites
              </p>
              <h2 className="mt-1 text-[1.65rem] font-bold tracking-tight text-navy-900">
                Featured Serviced Apartments
              </h2>
            </div>
            <Link
              href="/apartments"
              className="inline-flex items-center gap-1.5 text-[0.86rem] font-semibold text-navy-900 hover:text-lemma-dark"
            >
              View all {publishedApartments.length} apartments <ArrowRight size={15} />
            </Link>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((apt) => (
              <article
                key={apt.id}
                className="flex flex-col overflow-hidden rounded-md border border-sand-200 bg-white transition hover:border-lemma"
              >
                <Link href={`/apartments/${apt.slug}`} className="block">
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
        </section>

        {/* Amenities & Guest Benefits */}
        <section className="border-y border-sand-200 bg-sand-50">
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

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
                      className="rounded-md border border-sand-200 bg-white p-4"
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
        </section>

        {/* Location & Direct Reception CTA */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 rounded-md border border-sand-200 bg-white p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
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
        </section>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
