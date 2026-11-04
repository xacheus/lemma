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
import { isSampleListing } from '@/lib/domain/sample-listings';
import { isRepresentativeImage } from '@/lib/cloudinary/urls';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoFrame } from '@/components/ui/photo';
import { Reveal } from '@/components/ui/motion';
import type { ShowcaseSlide } from '@/components/public/apartment-showcase';
import { HomeHeroCarousel } from '@/components/public/home-hero-carousel';
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

  const checkIn = sp.checkIn && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkIn) && sp.checkIn >= today ? sp.checkIn : today;
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

  const slides: ShowcaseSlide[] = published.map((apt) => {
    const hit = hitById.get(apt.id);
    const fits = apt.maxGuests >= guests;
    const photos = [apt.coverPhoto, ...(apt.gallery?.map((g) => g.url) ?? apt.photos)].filter(
      (p): p is string => Boolean(p),
    );
    return {
      id: apt.id,
      slug: apt.slug,
      name: apt.name,
      code: apt.code,
      tagline: apt.tagline || apt.description.slice(0, 130),
      nightlyRate: apt.nightlyRate,
      maxGuests: apt.maxGuests,
      bedrooms: apt.bedrooms,
      bathrooms: apt.bathrooms,
      photos: Array.from(new Set(photos)),
      available: Boolean(hit?.available) && fits,
      availabilityNote: !fits
        ? `Sleeps up to ${apt.maxGuests}`
        : hit?.available
          ? 'Available for these dates'
          : 'Booked for these dates',
      representative: isRepresentativeImage(photos[0]),
      sample: isSampleListing(apt),
    };
  });

  const heroSlides = slides.flatMap((s) =>
    s.photos.slice(0, 2).map((photo, photoIndex) => ({
      id: `${s.id}-${photoIndex}`,
      slug: s.slug,
      name: s.name,
      code: s.code,
      tagline: s.tagline,
      nightlyRate: s.nightlyRate,
      maxGuests: s.maxGuests,
      bedrooms: s.bedrooms,
      bathrooms: s.bathrooms,
      photo,
      representative: isRepresentativeImage(photo),
      sample: s.sample,
      available: s.available,
      availabilityNote: s.availabilityNote,
    })),
  );

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const stayQuery = `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`;
  const nights = availability.nights;
  const hasSamples = published.some(isSampleListing);
  const featuredPhotos = published
    .flatMap((apt) => apt.gallery?.map((g) => g.url) ?? apt.photos)
    .filter((p): p is string => Boolean(p));

  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
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
          <section className="fallback-hero relative isolate overflow-hidden bg-charcoal-950 text-white">
            <div className="absolute inset-0" aria-hidden="true">
              {['/images/apartments/apt-01/01.jpg', '/images/apartments/apt-02/01.jpg', '/images/apartments/apt-03/01.jpg'].map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className={`fallback-hero-image fallback-hero-image-${index} absolute inset-0 h-full w-full object-cover`} />
              ))}
              <div className="absolute inset-0 bg-gradient-to-r from-charcoal-950/90 via-charcoal-950/65 to-charcoal-950/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950/85 to-transparent" />
            </div>
            <div className="relative mx-auto flex min-h-[28rem] max-w-7xl flex-col justify-end px-4 py-14 sm:px-6 lg:min-h-[34rem] lg:px-8 lg:pb-16">
              <p className="text-[0.8rem] font-medium text-white/80">
                {property.addressLine} · {property.city}, {property.country}
              </p>
              <h1 className="mt-3 max-w-2xl font-display text-[2.2rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-[2.9rem]">
                Furnished apartments in Lusaka,{' '}
                <span className="text-white/75">booked directly with reception.</span>
              </h1>
              <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/75">
                Self-catering stays with backup power, Wi-Fi and gated compound parking. Check
                your dates and speak directly with our front desk.
              </p>
              <Link
                href={`/apartments?${stayQuery}#availability`}
                className="btn mt-6 w-fit bg-white px-5 py-2.5 text-[0.86rem] font-semibold text-charcoal-950 hover:bg-sand-100"
              >
                Check availability <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <p className="mt-5 text-[0.72rem] text-white/65">Representative stock photos · confirm unit with reception</p>
            </div>
          </section>
        )}

        {/* Availability Search Bar */}
        <section className="border-b border-sand-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            <form
              action="/apartments"
              method="get"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_auto] lg:items-end"
            >
              <div>
                <label className="label mb-1 block" htmlFor="home-checkin">
                  Arrival date
                </label>
                <input
                  id="home-checkin"
                  name="checkIn"
                  type="date"
                  defaultValue={checkIn}
                  min={today}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="home-checkout">
                  Departure date
                </label>
                <input
                  id="home-checkout"
                  name="checkOut"
                  type="date"
                  defaultValue={checkOut}
                  min={addISO(checkIn, 1)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="home-guests">
                  Guests
                </label>
                <select id="home-guests" name="guests" defaultValue={String(guests)} className="field">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'guest' : 'guests'}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary h-[38px] justify-center px-6">
                Check availability
              </button>
            </form>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[0.77rem] text-sand-600">
              <span>
                {nights > 0
                  ? `${nights} night${nights === 1 ? '' : 's'} selected · Quoted in Zambian Kwacha (ZMW) · No card payment taken online`
                  : 'Select your arrival and departure dates to compare rates.'}
              </span>
              <Link href="/booking/access" className="font-medium text-navy-800 hover:underline">
                Already have a booking reference?
              </Link>
            </div>
          </div>
        </section>

        {/* Apartments Section */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="font-display text-[1.85rem] font-medium tracking-[-0.015em] text-navy-900 sm:text-[2.1rem]">
                Apartments &amp; nightly rates
              </h2>
              <p className="mt-1.5 text-[0.92rem] leading-relaxed text-sand-700">
                Every apartment is let as a complete private unit with its own kitchen, bathroom,
                Wi-Fi and housekeeping.
              </p>
            </div>
            {published.length > 0 ? (
              <Link
                href={`/apartments?${stayQuery}`}
                className="inline-flex items-center gap-1.5 text-[0.86rem] font-semibold text-navy-900 hover:text-lemma-dark"
              >
                Compare all {published.length} apartments <ArrowRight size={15} />
              </Link>
            ) : null}
          </div>

          {hasSamples ? (
            <div className="mt-5 rounded-lg border border-sand-300/80 bg-white px-4 py-3 text-[0.81rem] leading-relaxed text-sand-700">
              <strong className="font-semibold text-navy-900">Sample catalogue notice:</strong>{' '}
              Listings marked <em>Example</em> use representative stock photography while current
              property photos are being finalised. Submitting a request sends an enquiry to
              reception—you will confirm the exact unit and ZMW rate before paying any deposit.
            </div>
          ) : null}

          {published.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-sand-300 bg-white px-6 py-12 text-center">
              <h3 className="font-display text-[1.2rem] font-medium text-navy-900">
                Online apartment listings are being updated
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-[0.88rem] leading-relaxed text-sand-700">
                Call or WhatsApp reception directly with your dates and party size—we will confirm
                what is open and send a written ZMW quotation.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-primary">
                  <Phone size={15} /> {property.phone}
                </a>
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    <MessageCircle size={15} /> WhatsApp reception
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="stagger mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {published.map((apt) => {
                const hit = hitById.get(apt.id);
                const fits = apt.maxGuests >= guests;
                const available = Boolean(hit?.available) && fits;
                const cover = apt.coverPhoto || apt.photos[0];
                const sample = isSampleListing(apt);
                const amenityIcons = apt.amenities
                  .map((a) => AMENITY_ICONS[a])
                  .filter((icon): icon is typeof Wifi => Boolean(icon))
                  .slice(0, 3);

                return (
                  <article
                    key={apt.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-sand-200 bg-white shadow-card transition-all duration-300 hover:border-sand-300 hover:shadow-pop"
                  >
                    <Link href={`/apartments/${apt.slug}?${stayQuery}`} className="img-zoom block overflow-hidden">
                      <div className="relative">
                        <PhotoFrame src={cover} alt={apt.name} ratio="16 / 10" variant="card" />
                        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold backdrop-blur-sm ${
                              available
                                ? 'bg-[#124230]/90 text-[#b4f0cf]'
                                : 'bg-charcoal-950/80 text-white/85'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-[#66dc9f]' : 'bg-white/50'}`}
                            />
                            {fits
                              ? available
                                ? 'Available'
                                : 'Booked for dates'
                              : `Max ${apt.maxGuests} guests`}
                          </span>
                        </div>
                        {isRepresentativeImage(cover) ? (
                          <span className="absolute bottom-2.5 right-2.5 rounded bg-charcoal-950/70 px-2 py-0.5 text-[0.64rem] font-medium text-white/85 backdrop-blur-sm">
                            Representative photo
                          </span>
                        ) : null}
                      </div>
                    </Link>

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-center justify-between gap-2 text-[0.74rem] text-sand-600">
                        <span className="font-medium text-lemma-dark">
                          {APARTMENT_TIER_LABELS[apt.tier] ?? apt.tier} · {apt.code}
                        </span>
                        {sample ? (
                          <span className="rounded bg-sand-100 px-2 py-0.5 text-[0.68rem] font-medium text-sand-700">
                            Example
                          </span>
                        ) : null}
                      </div>

                      <Link href={`/apartments/${apt.slug}?${stayQuery}`}>
                        <h3 className="mt-1.5 font-display text-[1.22rem] font-medium leading-snug text-navy-900 group-hover:text-lemma-dark">
                          {apt.name}
                        </h3>
                      </Link>
                      <p className="mt-1.5 line-clamp-2 text-[0.85rem] leading-relaxed text-sand-700">
                        {apt.tagline || apt.description}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-sand-200/80 pt-3 text-[0.78rem] text-sand-700">
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} className="text-lemma-dark" /> Up to {apt.maxGuests}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BedDouble size={13} className="text-lemma-dark" />{' '}
                          {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} bed`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Bath size={13} className="text-lemma-dark" /> {apt.bathrooms} bath
                        </span>
                        {apt.sizeSqm ? (
                          <span className="inline-flex items-center gap-1">
                            <Maximize2 size={13} className="text-lemma-dark" /> {apt.sizeSqm} m²
                          </span>
                        ) : null}
                      </div>

                      {apt.amenities.length > 0 ? (
                        <div className="mt-2.5 flex items-center gap-2 text-[0.75rem] text-sand-600">
                          {amenityIcons.length > 0
                            ? amenityIcons.map((Icon, i) => <Icon key={`${apt.id}-icon-${i}`} size={13} className="shrink-0" />)
                            : null}
                          <span className="line-clamp-1">
                            {apt.amenities.slice(0, 3).join(' · ')}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-auto pt-4">
                        <div className="flex items-baseline justify-between gap-2 border-t border-sand-200/80 pt-3.5">
                          <div>
                            <span className="text-[1.18rem] font-bold tabular-nums text-navy-900">
                              {formatKwacha(apt.nightlyRate)}
                            </span>
                            <span className="text-[0.78rem] text-sand-600"> / night</span>
                          </div>
                          {apt.nightlyRate > 0 && nights > 0 ? (
                            <span className="text-[0.76rem] font-medium tabular-nums text-sand-600">
                              {formatKwacha(apt.nightlyRate * nights)} total ({nights}n)
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3.5 grid grid-cols-2 gap-2">
                          <Link
                            href={`/apartments/${apt.slug}?${stayQuery}`}
                            className="btn btn-secondary justify-center py-2 text-[0.8rem]"
                          >
                            View details
                          </Link>
                          <Link
                            href={`/apartments/${apt.slug}?${stayQuery}#book`}
                            className="btn btn-primary justify-center py-2 text-[0.8rem]"
                          >
                            {sample ? 'Send an enquiry' : 'Request dates'}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Reveal>

        {/* How Booking & Payment Work — eliminates guest confusion */}
        <Reveal as="section" className="border-y border-sand-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-[1.75rem] font-medium tracking-[-0.015em] text-navy-900">
                How booking &amp; payment work
              </h2>
              <p className="mt-1.5 text-[0.9rem] leading-relaxed text-sand-700">
                We do not charge cards automatically on this website. Every reservation follows three
                clear steps with our Lusaka reception desk.
              </p>
            </div>

            <ol className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
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
                <li
                  key={item.step}
                  className="rounded-xl border border-sand-200 bg-sand-50/70 p-6"
                >
                  <span className="font-display text-[1.35rem] font-semibold text-gold-600">
                    {item.step}
                  </span>
                  <h3 className="mt-2.5 text-[1.02rem] font-semibold text-navy-900">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-sand-700">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        {/* Practical Comforts — Lusaka-grounded editorial section */}
        <Reveal as="section" className="bg-sand-100/75">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:px-8">
            <div>
              <h2 className="font-display text-[1.8rem] font-medium tracking-[-0.015em] text-navy-900">
                Equipped for working weeks, not just overnight stops
              </h2>
              <p className="mt-2.5 text-[0.92rem] leading-relaxed text-sand-700">
                Whether you are in Lusaka for project work, family visits or a relocation, the
                day-to-day essentials are built into the nightly Kwacha rate—with no surprise
                service fee added at departure.
              </p>

              <dl className="mt-7 grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2">
                {[
                  {
                    icon: Zap,
                    title: 'Backup power during outages',
                    body: 'Lighting, Wi-Fi routers and fridges stay powered through load-shedding windows.',
                  },
                  {
                    icon: Wifi,
                    title: 'Work-ready Wi-Fi',
                    body: 'Dedicated internet in every apartment and a proper table or desk to work from.',
                  },
                  {
                    icon: UtensilsCrossed,
                    title: 'Self-catering kitchen',
                    body: 'Stove/hob, full fridge, microwave, kettle and cookware so you can cook on your own schedule.',
                  },
                  {
                    icon: CheckCircle2,
                    title: 'Fresh linen & housekeeping',
                    body: 'Clean bedding, towels and scheduled apartment servicing included in your rate.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Gated compound parking',
                    body: 'Private off-street parking inside the property boundary at no extra cost.',
                  },
                  {
                    icon: Clock,
                    title: `Check-in from ${booking.checkInTime}`,
                    body: `Check-out by ${booking.checkOutTime}. Late-night arrivals arranged easily via WhatsApp.`,
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-lemma-dark ring-1 ring-sand-200">
                      <item.icon size={16} aria-hidden="true" />
                    </span>
                    <div>
                      <dt className="text-[0.88rem] font-semibold text-navy-900">{item.title}</dt>
                      <dd className="mt-0.5 text-[0.81rem] leading-relaxed text-sand-700">{item.body}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {featuredPhotos.slice(0, 3).map((photo, i) => (
                <div key={`${photo}-${i}`} className={i === 0 ? 'col-span-2' : ''}>
                  <div className="relative overflow-hidden rounded-xl ring-1 ring-sand-200">
                    <PhotoFrame
                      src={photo}
                      alt="Furnished apartment interior"
                      ratio={i === 0 ? '16 / 9' : '4 / 3'}
                      variant="card"
                    />
                    {isRepresentativeImage(photo) ? (
                      <span className="absolute bottom-2 right-2 rounded bg-charcoal-950/70 px-2 py-0.5 text-[0.62rem] font-medium text-white/85">
                        Representative
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Direct Reception & Payment Channels */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
              <h2 className="font-display text-[1.55rem] font-medium tracking-[-0.015em] text-navy-900">
                Talk directly with our Lusaka reception desk
              </h2>
              <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-sand-700">
                Planning an extended stay, booking multiple apartments for colleagues, or arriving on
                a late flight? Message or call reception and we will confirm availability and send a
                formal quotation.
              </p>

              <ul className="mt-5 space-y-3 text-[0.88rem] text-navy-800">
                <li className="flex items-start gap-3">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <span>
                    {property.addressLine}
                    {property.city ? `, ${property.city}` : ''}
                    {property.country ? `, ${property.country}` : ''}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Phone size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="font-medium hover:underline">
                    {property.phone}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Mail size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <a href={`mailto:${property.email}`} className="hover:underline">
                    {property.email}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Clock size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
                  <span>{property.receptionHours}</span>
                </li>
              </ul>

              <div className="mt-6 flex flex-wrap gap-2.5">
                {waDigits ? (
                  <a
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent('Hello Lemma Apartments, I would like to ask about apartment availability.')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                  >
                    <MessageCircle size={15} /> WhatsApp Reception
                  </a>
                ) : null}
                <Link href="/contact" className="btn btn-secondary">
                  Location &amp; directions
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
              <h2 className="font-display text-[1.3rem] font-medium text-navy-900">
                Accepted ZMW payment channels
              </h2>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-sand-700">
                A {booking.depositPercent}% deposit holds your dates once confirmed, with the
                remaining balance payable before or at check-in.
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-[0.85rem] text-navy-800 sm:grid-cols-2">
                {payments.methods
                  .filter((m) => m.enabled)
                  .map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border border-sand-200 bg-sand-50/70 px-3 py-2 font-medium"
                    >
                      <CheckCircle2 size={14} className="shrink-0 text-st-available" />
                      {m.label}
                    </li>
                  ))}
              </ul>
              <p className="mt-4 border-t border-sand-200 pt-4 text-[0.79rem] leading-relaxed text-sand-600">
                Verified merchant and bank details are provided with your booking reference. Every
                payment is checked by staff before your balance updates and an official receipt is issued.
              </p>
              <Link
                href="/policies"
                className="mt-3 inline-flex items-center gap-1.5 text-[0.83rem] font-semibold text-navy-900 hover:text-lemma-dark"
              >
                Read full booking &amp; cancellation terms <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Reveal>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
