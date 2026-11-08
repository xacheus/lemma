import Link from 'next/link';
import {
  ArrowRight,
  Bath,
  BedDouble,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Maximize2,
  MessageCircle,
  Phone,
  ShieldCheck,
  ShoppingBasket,
  Users,
  UtensilsCrossed,
  Waves,
  Wifi,
  Zap,
} from 'lucide-react';
import { readPublicSiteData } from '@/lib/public/read-site-data';
import { addISO, businessToday } from '@/lib/domain/dates';
import { searchAvailability } from '@/lib/domain/availability';
import { APARTMENT_TIER_LABELS } from '@/lib/domain/status';
import { formatKwacha } from '@/lib/domain/money';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoFrame } from '@/components/ui/photo';
import { Reveal } from '@/components/ui/motion';
import { HomeHeroCarousel, type HeroSlide } from '@/components/public/home-hero-carousel';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  'Wi-Fi': Wifi,
  'Backup power': Zap,
  'Fully fitted kitchen': UtensilsCrossed,
  'Fridge / freezer': ShoppingBasket,
  Washer: Waves,
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  const { db, session } = await readPublicSiteData();
  const { property, booking, payments } = db.settings;
  const sp = await searchParams;
  const today = db.__today || businessToday();

  const checkIn =
    sp.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkIn) && sp.checkIn >= today
      ? sp.checkIn
      : today;
  const checkOut =
    sp.checkOut && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkOut) && sp.checkOut > checkIn
      ? sp.checkOut
      : addISO(checkIn, 2);
  const guests = Math.max(1, Math.min(12, Number(sp.guests || 2)));

  const published = db.apartments
    .filter((a) => a.active && a.publicationStatus !== 'draft')
    .sort((a, b) => a.number - b.number);

  const availability = searchAvailability(db, { checkIn, checkOut, guests, today });
  const hitById = new Map(availability.hits.map((h) => [h.apartment.id, h]));

  const heroSlides: HeroSlide[] = published.flatMap((apt) => {
    const hit = hitById.get(apt.id);
    const fits = apt.maxGuests >= guests;
    const available = Boolean(hit?.available) && fits;
    const availabilityNote = !fits
      ? `Sleeps up to ${apt.maxGuests}`
      : hit?.available
        ? 'Available for these dates'
        : 'Booked for these dates';
    const photos = Array.from(
      new Set(
        [apt.coverPhoto, ...(apt.gallery?.map((g) => g.url) ?? apt.photos)].filter(
          (p): p is string => Boolean(p),
        ),
      ),
    );

    if (photos.length === 0) {
      return [
        {
          id: `${apt.id}-0`,
          slug: apt.slug,
          name: apt.name,
          code: apt.code,
          tagline: apt.tagline || apt.description.slice(0, 130),
          nightlyRate: apt.nightlyRate,
          maxGuests: apt.maxGuests,
          bedrooms: apt.bedrooms,
          bathrooms: apt.bathrooms,
          available,
          availabilityNote,
        },
      ];
    }

    return photos.slice(0, 3).map((photo, photoIndex) => ({
      id: `${apt.id}-${photoIndex}`,
      slug: apt.slug,
      name: apt.name,
      code: apt.code,
      tagline: apt.tagline || apt.description.slice(0, 130),
      nightlyRate: apt.nightlyRate,
      maxGuests: apt.maxGuests,
      bedrooms: apt.bedrooms,
      bathrooms: apt.bathrooms,
      photo,
      available,
      availabilityNote,
    }));
  });

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const stayQuery = `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`;
  const nights = availability.nights;
  const featuredPhotos = Array.from(
    new Set(
      published
        .flatMap((apt) => [apt.coverPhoto, ...(apt.gallery?.map((g) => g.url) ?? apt.photos)])
        .filter((p): p is string => Boolean(p)),
    ),
  );

  const rates = published.map((a) => a.nightlyRate).filter((r) => r > 0);
  const minRate = rates.length > 0 ? Math.min(...rates) : null;
  const maxRate = rates.length > 0 ? Math.max(...rates) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: property.name,
    description: property.tagline,
    telephone: property.phone,
    email: property.email,
    currenciesAccepted: 'ZMW',
    paymentAccepted: payments.methods
      .filter((m) => m.enabled)
      .map((m) => m.label)
      .join(', '),
    checkinTime: booking.checkInTime,
    checkoutTime: booking.checkOutTime,
    address: {
      '@type': 'PostalAddress',
      streetAddress: property.addressLine,
      addressLocality: property.city || 'Lusaka',
      addressCountry: 'ZM',
    },
    ...(minRate
      ? {
          priceRange:
            minRate === maxRate
              ? `ZMW ${minRate}`
              : `ZMW ${minRate} – ZMW ${maxRate}`,
        }
      : {}),
    ...(published.length > 0 ? { numberOfRooms: published.length } : {}),
  };

  const sleepCapacity = published.reduce((sum, a) => sum + a.maxGuests, 0);

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PublicHeader
        property={property}
        session={session}
        activePath="/"
        unreadCount={unreadForSession(db, session)}
      />

      <main className="flex-1">
        {/* Hero */}
        {heroSlides.length > 0 ? (
          <HomeHeroCarousel
            slides={heroSlides}
            stayQuery={stayQuery}
            propertyName={property.name}
            totalApartments={published.length}
            addressLine={property.addressLine}
            city={property.city}
          />
        ) : (
          <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_78%_22%,rgba(201,161,90,0.22),transparent_46%),linear-gradient(135deg,#0A1E33_0%,#16436B_55%,#0A192A_100%)] text-white">
            {/* Slow ken-burns brand background keeps the hero photographic before apartments are published */}
            <div className="absolute inset-0 -z-10">
              <div
                className="hero-bg-scale opacity-50"
                style={{
                  backgroundImage: `url("${property.logoUrl ?? '/brand/logo.jpg'}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                aria-hidden="true"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(10,25,42,0.82)_0%,rgba(10,25,42,0.42)_58%,rgba(10,25,42,0.18)_100%)]" />
            <div className="relative mx-auto flex min-h-[30rem] max-w-7xl flex-col justify-center px-4 py-16 sm:px-6 lg:min-h-[34rem] lg:px-8">
              {/* Animated brand photo stack — real project imagery */}
              <div className="mb-8 flex items-end">
                <div className="photo-stack">
                  <div className="photo-stack-item photo-stack-item-1 h-40 w-40 rounded-[1.2rem] md:h-56 md:w-56">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/logo.jpg" alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  </div>
                  <div className="photo-stack-item photo-stack-item-2 -mt-10 ml-[-1rem] h-32 w-32 rounded-[1rem] md:-mt-12 md:ml-[-1.25rem] md:h-44 md:w-44">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/logo.jpg" alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  </div>
                  <div className="photo-stack-item photo-stack-item-3 -mt-14 ml-[-0.5rem] h-28 w-28 rounded-full md:-mt-16 md:ml-[-0.75rem] md:h-36 md:w-36">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/logo.jpg" alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>

              <div className="swdl-rise max-w-2xl">
                <p>
                  <span className="swdl-pill inline-flex items-center gap-2">
                    <MapPin size={13} aria-hidden="true" />
                    {property.addressLine} · {property.city}, {property.country}
                  </span>
                </p>
                <h1 className="mt-5 font-heading text-[2rem] font-extrabold leading-[1.15] tracking-[-0.01em] text-white sm:text-[2.9rem] lg:text-[3.4rem]">
                  Furnished apartments in Lusaka,{' '}
                  <span className="text-swdl-gold">booked directly with our front desk.</span>
                </h1>
                <p className="mt-4 max-w-xl text-[1.02rem] leading-relaxed text-[#E3E9F0]">
                  Self-catering stays at {property.addressLine} with backup power, work-ready Wi-Fi
                  and gated compound parking—quoted transparently in Zambian Kwacha.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3.5">
                  <Link href={`/apartments?${stayQuery}#availability`} className="btn btn-gold px-7 py-3 text-[0.92rem]">
                    Check availability <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  {waDigits ? (
                    <a
                      href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${property.name}, I would like to check apartment availability for ${checkIn} to ${checkOut}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-light px-6 py-3 text-[0.92rem]"
                    >
                      <MessageCircle size={16} /> WhatsApp reception
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Availability Search Bar */}
        <section className="border-b border-swdl-navy/10 bg-white shadow-[0_10px_30px_-24px_rgba(15,43,70,0.5)]">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <form
              action="/apartments"
              method="get"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_auto] lg:items-end"
            >
              <div>
                <label className="label mb-1.5 block" htmlFor="home-checkin">
                  Arrival date
                </label>
                <input
                  id="home-checkin"
                  name="checkIn"
                  type="date"
                  defaultValue={checkIn}
                  min={today}
                  className="field py-2.5"
                  required
                />
              </div>
              <div>
                <label className="label mb-1.5 block" htmlFor="home-checkout">
                  Departure date
                </label>
                <input
                  id="home-checkout"
                  name="checkOut"
                  type="date"
                  defaultValue={checkOut}
                  min={addISO(checkIn, 1)}
                  className="field py-2.5"
                  required
                />
              </div>
              <div>
                <label className="label mb-1.5 block" htmlFor="home-guests">
                  Guests
                </label>
                <select id="home-guests" name="guests" defaultValue={String(guests)} className="field py-2.5">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'guest' : 'guests'}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-navy h-[42px] justify-center px-7">
                Check availability
              </button>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.8rem] text-swdl-muted">
              <span>
                {nights > 0
                  ? `${nights} night${nights === 1 ? '' : 's'} selected · Quoted in Zambian Kwacha (ZMW) · No card payment taken online`
                  : 'Select your arrival and departure dates to compare rates.'}
              </span>
              <Link href="/booking/access" className="font-semibold text-swdl-navy transition-colors hover:text-swdl-goldDark">
                Already have a booking reference?
              </Link>
            </div>
          </div>
        </section>

        {/* Stats band */}
        <section className="stats-band">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-11 text-center sm:px-6 lg:grid-cols-4 lg:px-8">
            {[
              { figure: String(published.length), suffix: '', label: published.length === 1 ? 'Private apartment' : 'Private apartments' },
              { figure: String(sleepCapacity), suffix: '+', label: 'Guests per night' },
              { figure: booking.checkInTime, suffix: '', label: 'Check-in from' },
              { figure: '100', suffix: '%', label: 'ZMW transparent pricing' },
            ].map((stat) => (
              <div key={stat.label}>
                <h3 className="stat-figure">
                  {stat.figure}
                  {stat.suffix}
                </h3>
                <p className="stat-label mt-1.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Apartments Section */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="section-head">
            <span className="eyebrow">Featured Stays</span>
            <h2>Apartments &amp; nightly rates</h2>
            <p>
              Every apartment is let as a complete private unit with its own kitchen, bathroom,
              Wi-Fi and housekeeping.
            </p>
          </div>

          {published.length === 0 ? (
            <div className="swdl-card px-6 py-14 text-center">
              <h3 className="font-heading text-[1.3rem] font-bold">
                Online apartment listings are currently being updated
              </h3>
              <p className="mx-auto mt-2.5 max-w-xl text-[0.92rem] leading-relaxed text-swdl-muted">
                Call or WhatsApp reception directly with your arrival dates and party size—our front
                desk at {property.addressLine} will confirm availability and send a written ZMW
                quotation.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-navy px-6 py-2.5">
                  <Phone size={15} /> {property.phone}
                </a>
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${property.name}, please share availability and rates for ${checkIn} to ${checkOut} (${guests} ${guests === 1 ? 'guest' : 'guests'}).`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-gold px-6 py-2.5"
                  >
                    <MessageCircle size={15} /> WhatsApp reception
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="stagger grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {published.map((apt) => {
                  const hit = hitById.get(apt.id);
                  const fits = apt.maxGuests >= guests;
                  const available = Boolean(hit?.available) && fits;
                  const cover = apt.coverPhoto || apt.photos[0];
                  const amenityIcons = apt.amenities
                    .map((a) => AMENITY_ICONS[a])
                    .filter((icon): icon is typeof Wifi => Boolean(icon))
                    .slice(0, 3);

                  return (
                    <article key={apt.id} className="swdl-card swdl-card-hover group flex flex-col overflow-hidden">
                      <Link href={`/apartments/${apt.slug}?${stayQuery}`} className="img-zoom relative block overflow-hidden">
                        <PhotoFrame src={cover} alt={apt.name} ratio="16 / 10" variant="card" />
                        <span
                          className={`swdl-tag absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 ${
                            available ? 'swdl-tag-open' : 'swdl-tag-dark'
                          }`}
                        >
                          {fits ? (available ? 'Available' : 'Booked for dates') : `Max ${apt.maxGuests} guests`}
                        </span>
                      </Link>

                      <div className="flex flex-1 flex-col p-6">
                        <p className="font-heading text-[0.72rem] font-bold uppercase tracking-[0.12em] text-swdl-goldDark">
                          {APARTMENT_TIER_LABELS[apt.tier] ?? apt.tier} · {apt.code}
                        </p>

                        <Link href={`/apartments/${apt.slug}?${stayQuery}`}>
                          <h3 className="mt-1.5 font-heading text-[1.18rem] font-bold leading-snug transition-colors duration-200 group-hover:text-swdl-goldDark">
                            {apt.name}
                          </h3>
                        </Link>
                        <p className="mt-2 line-clamp-2 text-[0.88rem] leading-relaxed text-swdl-muted">
                          {apt.tagline || apt.description}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#EEE] pt-3.5 text-[0.82rem] text-swdl-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Users size={14} className="text-swdl-goldDark" /> Up to {apt.maxGuests}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <BedDouble size={14} className="text-swdl-goldDark" />{' '}
                            {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} bed`}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Bath size={14} className="text-swdl-goldDark" /> {apt.bathrooms} bath
                          </span>
                          {apt.sizeSqm ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Maximize2 size={14} className="text-swdl-goldDark" /> {apt.sizeSqm} m²
                            </span>
                          ) : null}
                        </div>

                        {apt.amenities.length > 0 ? (
                          <div className="mt-2.5 flex items-center gap-2 text-[0.78rem] text-swdl-muted">
                            {amenityIcons.length > 0
                              ? amenityIcons.map((Icon, i) => (
                                  <Icon key={`${apt.id}-icon-${i}`} size={13} className="shrink-0" />
                                ))
                              : null}
                            <span className="line-clamp-1">{apt.amenities.slice(0, 3).join(' · ')}</span>
                          </div>
                        ) : null}

                        <div className="mt-auto pt-4">
                          <div className="flex items-baseline justify-between gap-2 border-t border-[#EEE] pt-3.5">
                            <div>
                              <span className="font-heading text-[1.25rem] font-extrabold tabular-nums text-swdl-goldDark">
                                {formatKwacha(apt.nightlyRate)}
                              </span>
                              <span className="text-[0.8rem] text-swdl-muted"> / night</span>
                            </div>
                            {apt.nightlyRate > 0 && nights > 0 ? (
                              <span className="text-[0.78rem] font-medium tabular-nums text-swdl-muted">
                                {formatKwacha(apt.nightlyRate * nights)} total ({nights}n)
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2.5">
                            <Link
                              href={`/apartments/${apt.slug}?${stayQuery}`}
                              className="btn border-2 border-swdl-navy/15 bg-white px-3 py-2 font-heading text-[0.8rem] font-bold text-swdl-navy transition-all duration-250 ease-smooth hover:border-swdl-navy hover:-translate-y-0.5"
                            >
                              View details
                            </Link>
                            <Link href={`/apartments/${apt.slug}?${stayQuery}#book`} className="btn btn-gold justify-center px-3 py-2 text-[0.8rem]">
                              Request dates
                            </Link>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-9 text-center">
                <Link href={`/apartments?${stayQuery}`} className="btn btn-navy px-7 py-3 text-[0.9rem]">
                  View all apartments <ArrowRight size={16} />
                </Link>
              </div>
            </>
          )}
        </Reveal>

        {/* Gallery marquee — a slow, endless strip of the property's own photographs */}
        {featuredPhotos.length > 0 ? (
          <Reveal as="section" className="overflow-hidden bg-white py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="section-head">
                <span className="eyebrow">Gallery</span>
                <h2>A glimpse of {property.name}</h2>
                <p>Interiors, kitchens and outdoor space photographed on site in {property.city}.</p>
              </div>
            </div>
            <div className="marquee">
              <div className="marquee-track">
                {[...featuredPhotos.slice(0, 8), ...featuredPhotos.slice(0, 8)].map((photo, i) => (
                  <div className="marquee-item swdl-media" key={`${photo}-${i}`} aria-hidden={i >= Math.min(featuredPhotos.length, 8) ? true : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={i < Math.min(featuredPhotos.length, 8) ? `${property.name} apartment photograph` : ''}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        ) : null}

        {/* How Booking & Payment Work */}
        <Reveal as="section" className="border-y border-swdl-navy/10 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="section-head">
              <span className="eyebrow">What We Do</span>
              <h2>How booking &amp; payment work</h2>
              <p>
                We do not charge cards automatically on this website. Every reservation follows three
                clear steps with our Lusaka reception desk.
              </p>
            </div>

            <ol className="stagger grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Request your dates online',
                  body: 'Pick your apartment, check-in and check-out dates, and leave your phone/WhatsApp and email. You receive a booking reference immediately.',
                },
                {
                  step: '02',
                  title: `Pay the ${booking.depositPercent}% ZMW deposit`,
                  body: 'Once your unit is confirmed, send the deposit via Airtel Money, MTN Mobile Money, bank transfer, or cash at reception using your booking reference.',
                },
                {
                  step: '03',
                  title: 'Staff verification & official receipt',
                  body: 'Upload your transaction reference or screenshot. Reception verifies it against the statement, locks in your dates, and issues a downloadable PDF receipt.',
                },
              ].map((item) => (
                <li key={item.step} className="swdl-card swdl-service p-8 text-center">
                  <span className="font-heading text-[1.6rem] font-extrabold tracking-[0.04em] text-swdl-gold">
                    {item.step}
                  </span>
                  <h3 className="mt-2 font-heading text-[1.05rem] font-bold">{item.title}</h3>
                  <p className="mt-2.5 text-[0.9rem] leading-relaxed text-swdl-muted">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        {/* Practical Comforts — navy split panel */}
        <Reveal as="section" className="bg-swdl-navy">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:px-8">
            <div className="on-navy">
              <span className="eyebrow">Practical Comforts</span>
              <h2 className="mt-1.5 font-heading text-[1.75rem] font-extrabold leading-tight sm:text-[2.1rem]">
                Equipped for working weeks, not just overnight stops
              </h2>
              <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed">
                Whether you are in Lusaka for project work, family visits or a relocation, the
                day-to-day essentials are built into the nightly Kwacha rate—with no surprise
                service fee added at departure.
              </p>

              <ul className="check-gold mt-7 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {[
                  { icon: Zap, title: 'Backup power during outages' },
                  { icon: Wifi, title: 'Work-ready Wi-Fi in every unit' },
                  { icon: UtensilsCrossed, title: 'Self-catering kitchen' },
                  { icon: CheckCircle2, title: 'Fresh linen & housekeeping' },
                  { icon: ShieldCheck, title: 'Gated compound parking' },
                  { icon: Clock, title: `Check-in from ${booking.checkInTime}` },
                ].map((item) => (
                  <li key={item.title}>
                    <item.icon size={16} aria-hidden="true" />
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>

            {featuredPhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3.5">
                {featuredPhotos.slice(0, 3).map((photo, i) => (
                  <div
                    key={`${photo}-${i}`}
                    className={`swdl-media overflow-hidden rounded-[14px] shadow-swdl ${i === 0 || featuredPhotos.length === 1 ? 'col-span-2' : ''}`}
                  >
                    <PhotoFrame
                      src={photo}
                      alt="Furnished apartment interior"
                      ratio={i === 0 || featuredPhotos.length === 1 ? '16 / 9' : '4 / 3'}
                      variant="card"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[14px] border border-white/15 bg-white/[0.06] p-7 backdrop-blur-sm sm:p-8">
                <p className="font-heading text-[0.74rem] font-bold uppercase tracking-[0.16em] text-swdl-gold">
                  Stay summary · {property.city}
                </p>
                <h3 className="mt-2 font-heading text-[1.3rem] font-bold text-white">
                  Direct front-desk management at {property.addressLine}
                </h3>
                <p className="mt-2.5 text-[0.88rem] leading-relaxed text-[#C9D5E1]">
                  Every stay is coordinated by on-site staff rather than third-party agents—from
                  arrival directions and compound access to housekeeping schedules and ZMW tax
                  invoices for corporate travellers.
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 text-[0.84rem]">
                  <div>
                    <dt className="text-[#8FA0B0]">Check-in window</dt>
                    <dd className="mt-0.5 font-semibold text-white">From {booking.checkInTime}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8FA0B0]">Check-out time</dt>
                    <dd className="mt-0.5 font-semibold text-white">By {booking.checkOutTime}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8FA0B0]">Reservation deposit</dt>
                    <dd className="mt-0.5 font-semibold text-white">{booking.depositPercent}% of stay total</dd>
                  </div>
                  <div>
                    <dt className="text-[#8FA0B0]">Billing currency</dt>
                    <dd className="mt-0.5 font-semibold text-white">Zambian Kwacha (ZMW)</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </Reveal>

        {/* Direct Reception & Payment Channels */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="swdl-card p-7 sm:p-9">
              <span className="eyebrow">Front Desk</span>
              <h2 className="mt-1.5 font-heading text-[1.45rem] font-extrabold">
                Talk directly with our Lusaka reception desk
              </h2>
              <p className="mt-2.5 max-w-xl text-[0.92rem] leading-relaxed text-swdl-muted">
                Planning an extended stay, booking multiple apartments for colleagues, or arriving on
                a late flight? Message or call reception and we will confirm availability and send a
                formal quotation.
              </p>

              <ul className="mt-6 space-y-3.5 text-[0.9rem] text-swdl-ink">
                <li className="flex items-start gap-3">
                  <MapPin size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <span>
                    {property.addressLine}
                    {property.city ? `, ${property.city}` : ''}
                    {property.country ? `, ${property.country}` : ''}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Phone size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="font-semibold transition-colors hover:text-swdl-goldDark">
                    {property.phone}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Mail size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <a href={`mailto:${property.email}`} className="transition-colors hover:text-swdl-goldDark">
                    {property.email}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-swdl-goldDark" />
                  <span>{property.receptionHours}</span>
                </li>
              </ul>

              <div className="mt-7 flex flex-wrap gap-3">
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${property.name}, I would like to ask about apartment availability.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-gold px-6 py-2.5"
                  >
                    <MessageCircle size={15} /> WhatsApp Reception
                  </a>
                ) : null}
                <Link href="/contact" className="btn btn-navy px-6 py-2.5">
                  Location &amp; directions
                </Link>
              </div>
            </div>

            <div className="swdl-card p-7 sm:p-9">
              <span className="eyebrow">Payments</span>
              <h2 className="mt-1.5 font-heading text-[1.25rem] font-extrabold">
                Accepted ZMW payment channels
              </h2>
              <p className="mt-2.5 text-[0.88rem] leading-relaxed text-swdl-muted">
                A {booking.depositPercent}% deposit holds your dates once confirmed, with the
                remaining balance payable before or at check-in.
              </p>
              <ul className="mt-5 grid grid-cols-1 gap-2.5 text-[0.87rem] sm:grid-cols-2">
                {payments.methods
                  .filter((m) => m.enabled)
                  .map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-[10px] border border-[#DFE3E8] bg-swdl-card px-3.5 py-2.5 font-semibold text-swdl-navy transition-all duration-250 ease-smooth hover:border-swdl-gold hover:-translate-y-0.5"
                    >
                      <CheckCircle2 size={15} className="shrink-0 text-swdl-goldDark" />
                      {m.label}
                    </li>
                  ))}
              </ul>
              <p className="mt-5 border-t border-[#EEE] pt-4 text-[0.82rem] leading-relaxed text-swdl-muted">
                Verified merchant and bank details are provided with your booking reference. Every
                payment is checked by staff before your balance updates and an official receipt is issued.
              </p>
              <Link
                href="/policies"
                className="mt-3.5 inline-flex items-center gap-1.5 font-heading text-[0.85rem] font-bold text-swdl-navy transition-colors hover:text-swdl-goldDark"
              >
                Read full booking &amp; cancellation terms <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Reveal>

        {/* CTA band */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="cta-band px-7 py-14 text-center sm:px-12">
            <h2 className="font-heading text-[1.55rem] font-extrabold sm:text-[2.1rem]">
              Ready to book your stay in Lusaka?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[0.95rem]">
              Get in touch with the {property.name} team today and we will hold your dates with a
              written ZMW quotation.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3.5">
              <Link href={`/apartments?${stayQuery}#availability`} className="btn btn-gold px-7 py-3 text-[0.92rem]">
                Check availability <ArrowRight size={16} />
              </Link>
              <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-outline-light px-6 py-3 text-[0.92rem]">
                <Phone size={16} /> Call {property.phone}
              </a>
            </div>
          </div>
        </Reveal>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
