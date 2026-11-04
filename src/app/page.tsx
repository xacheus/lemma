import Link from 'next/link';
import {
  ArrowRight,
  Bath,
  BedDouble,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingBasket,
  Users,
  UtensilsCrossed,
  Waves,
  Wifi,
  Zap,
} from 'lucide-react';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getSession } from '@/lib/auth/session';
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
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
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

  /** Cycle through the first two gallery photographs of each published apartment. */
  const heroSlides = slides
    .flatMap((s) => s.photos.slice(0, 2).map((photo, photoIndex) => ({
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
    })));

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const stayQuery = `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`;
  const nights = availability.nights;
  const featuredPhotos = published
    .flatMap((apt) => apt.gallery?.map((g) => g.url) ?? apt.photos)
    .filter((p): p is string => Boolean(p));

  return (
    <div className="flex min-h-screen flex-col bg-white text-navy-900">
      <PublicHeader property={property} session={session} activePath="/" unreadCount={unreadForSession(db, session)} />

      <main className="flex-1">
        {/* ----------------------------------------------------------------- hero */}
        {heroSlides.length > 0 ? (
          <HomeHeroCarousel
            slides={heroSlides}
            stayQuery={stayQuery}
            propertyName={property.name}
            totalApartments={published.length}
          />
        ) : (
          <section className="border-b border-sand-200 bg-sand-50">
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-lemma-dark">
                {property.addressLine} · {property.city}, {property.country}
              </p>
              <h1 className="mt-3 max-w-3xl text-[2.15rem] font-semibold leading-[1.06] tracking-[-0.02em] text-navy-900 sm:text-[2.9rem]">
                Furnished apartments
                <span className="block text-navy-500">you can book by the night.</span>
              </h1>
              <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-navy-600">
                Find an apartment in Lusaka. Explore options, then confirm the unit and rate
                with reception before your stay.
              </p>
            </div>
          </section>
        )}

        {published.some(isSampleListing) ? (
          <div className="border-b border-sand-200 bg-sand-50 px-4 py-3 text-center text-[0.8rem] text-navy-700">
            Example listings: unit details, availability and rates need confirmation from reception.
            Photos marked representative are stock images, not photographs of this property.
          </div>
        ) : null}

        {/* Availability search — directly under the hero, above the fold. */}
        <section className="border-b border-sand-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            <form
              action="/apartments"
              method="get"
              className="grid gap-3 rounded-lg border border-sand-200 bg-sand-50/60 p-3.5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_auto] lg:items-end"
            >
              <div>
                <label className="label mb-1 block" htmlFor="home-checkin">
                  Check-in
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
                  Check-out
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
              <button type="submit" className="btn btn-primary h-[38px] justify-center px-5">
                Check availability
              </button>
            </form>
            <p className="mt-2 text-[0.74rem] text-navy-500">
              {nights > 0
                ? `${nights} night${nights === 1 ? '' : 's'} · rates in ZMW per night · no card needed to enquire.`
                : 'Choose your arrival and departure dates.'}
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ apartment grid */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                The apartments
              </p>
              <h2 className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.01em] text-navy-900">
                Choose the one that fits your stay
              </h2>
            </div>
            {published.length > 0 ? (
              <Link
                href={`/apartments?${stayQuery}`}
                className="inline-flex items-center gap-1.5 text-[0.86rem] font-semibold text-navy-900 hover:text-lemma-dark"
              >
                All {published.length} apartments <ArrowRight size={15} />
              </Link>
            ) : null}
          </div>

          {published.length === 0 ? (
            <div className="mt-8 rounded-md border border-dashed border-sand-300 bg-sand-50 px-6 py-12 text-center">
              <h3 className="text-[1.05rem] font-semibold text-navy-900">
                Apartments are being prepared for online booking
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-[0.88rem] leading-relaxed text-navy-600">
                Nothing is published on the website yet. Call or message reception and we will
                confirm availability and hold your dates directly.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <a href={`tel:${property.phone}`} className="btn btn-primary">
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
            <div className="stagger mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                  <article
                    key={apt.id}
                    className="group flex flex-col overflow-hidden rounded-lg border border-sand-200 bg-white transition-colors duration-300 hover:border-brand-300"
                  >
                    <Link href={`/apartments/${apt.slug}?${stayQuery}`} className="img-zoom block overflow-hidden">
                      <div className="relative">
                        <PhotoFrame src={cover} alt={apt.name} ratio="16 / 10" variant="card" />
                        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm ${
                              available
                                ? 'bg-[#0f3d2b]/85 text-[#a9ecc6]'
                                : 'bg-charcoal-950/80 text-white/75'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-[#5ed69b]' : 'bg-white/50'}`}
                            />
                            {fits
                              ? available
                                ? 'Available'
                                : 'Booked'
                              : `Sleeps ${apt.maxGuests}`}
                          </span>
                        </div>
                        {isRepresentativeImage(cover) ? (
                          <span className="absolute bottom-3 right-3 rounded-sm bg-charcoal-950/70 px-2 py-1 text-[0.62rem] font-medium uppercase tracking-[0.1em] text-white/85 backdrop-blur-sm">
                            Representative photo
                          </span>
                        ) : null}
                      </div>
                    </Link>

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-lemma-dark">
                          {apt.code} · {APARTMENT_TIER_LABELS[apt.tier] ?? apt.tier}
                        </span>
                        {isSampleListing(apt) ? <span className="text-[0.7rem] font-medium text-navy-500">Example listing</span> : null}
                      </div>
                      <Link href={`/apartments/${apt.slug}?${stayQuery}`}>
                        <h3 className="mt-1.5 text-[1.1rem] font-semibold leading-snug text-navy-900 hover:text-lemma-dark">
                          {apt.name}
                        </h3>
                      </Link>
                      <p className="mt-1.5 line-clamp-2 text-[0.85rem] leading-relaxed text-navy-600">
                        {apt.tagline || apt.description}
                      </p>

                      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.79rem] text-navy-600">
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} /> {apt.maxGuests} guests
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BedDouble size={13} /> {apt.bedrooms === 0 ? 'Studio' : `${apt.bedrooms} bed`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Bath size={13} /> {apt.bathrooms} bath
                        </span>
                      </div>

                      {apt.amenities.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.74rem] text-navy-500">
                          {amenityIcons.length > 0 ? (
                            amenityIcons.map((Icon, i) => <Icon key={`${apt.id}-icon-${i}`} size={14} />)
                          ) : null}
                          <span className="line-clamp-1">
                            {apt.amenities.slice(0, 3).join(' · ')}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-auto pt-5">
                        <div className="flex items-end justify-between gap-3 border-t border-sand-200 pt-3.5">
                          <div>
                            <span className="text-[1.15rem] font-semibold tabular-nums text-navy-900">
                              {formatKwacha(apt.nightlyRate)}
                            </span>
                            <span className="text-[0.78rem] text-navy-500"> / night</span>
                            {apt.nightlyRate > 0 && nights > 0 ? (
                              <p className="mt-0.5 text-[0.72rem] text-navy-400">
                                {`${formatKwacha(apt.nightlyRate * nights)} for ${nights} night${nights === 1 ? '' : 's'}`}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Link
                            href={`/apartments/${apt.slug}?${stayQuery}`}
                            className="btn btn-secondary flex-1 justify-center py-2 text-[0.8rem]"
                          >
                            View details
                          </Link>
                          <Link
                            href={`/apartments/${apt.slug}?${stayQuery}#book`}
                            className="btn btn-primary flex-1 justify-center py-2 text-[0.8rem]"
                          >
                            {isSampleListing(apt) ? 'Send an enquiry' : 'Book now'}
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

        {/* ------------------------------------------------------- what's included */}
        <Reveal as="section" className="border-y border-sand-200 bg-sand-50">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                What every apartment includes
              </p>
              <h2 className="mt-1.5 text-[1.65rem] font-semibold tracking-[-0.01em] text-navy-900">
                Set up for a week, not just a night
              </h2>
              <p className="mt-3 text-[0.9rem] leading-relaxed text-navy-600">
                Each unit is fully furnished and self-catering. The day-to-day costs are included in
                the nightly rate. There is no separate service charge at check-out.
              </p>

              <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {[
                  { icon: Wifi, title: 'Wi-Fi included', body: 'Working internet in every apartment, suitable for calls.' },
                  { icon: Zap, title: 'Backup power', body: 'Lights, internet and the fridge stay on through an outage.' },
                  { icon: UtensilsCrossed, title: 'Full kitchen', body: 'Hob, fridge, microwave, kettle and cooking utensils.' },
                  { icon: CheckCircle2, title: 'Linen & housekeeping', body: 'Fresh bedding and towels, with cleaning during your stay.' },
                  { icon: Clock, title: `Check-in ${booking.checkInTime}`, body: `Check-out by ${booking.checkOutTime}. Late arrivals by arrangement.` },
                  { icon: MapPin, title: 'Secure parking', body: 'Off-street parking inside the compound, included.' },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <item.icon size={17} className="mt-0.5 shrink-0 text-lemma-dark" aria-hidden="true" />
                    <div>
                      <dt className="text-[0.86rem] font-semibold text-navy-900">{item.title}</dt>
                      <dd className="mt-0.5 text-[0.8rem] leading-relaxed text-navy-600">{item.body}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {featuredPhotos.slice(0, 3).map((photo, i) => (
                <div key={`${photo}-${i}`} className={i === 2 ? 'sm:col-span-2' : ''}>
                  <div className="relative overflow-hidden rounded-md">
                    <PhotoFrame
                      src={photo}
                      alt="Furnished apartment interior"
                      ratio={i === 2 ? '16 / 8' : '4 / 3'}
                      variant="card"
                    />
                    {isRepresentativeImage(photo) ? (
                      <span className="absolute bottom-2 right-2 rounded-sm bg-charcoal-950/70 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.08em] text-white/85">
                        Representative
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* -------------------------------------------------------------- find us */}
        <Reveal as="section" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-lg border border-sand-200 bg-white p-6 sm:p-8">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
                Reception
              </p>
              <h2 className="mt-1.5 text-[1.5rem] font-semibold tracking-[-0.01em] text-navy-900">
                Speak to a person before you book
              </h2>
              <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-navy-600">
                Long stay, group booking, or arriving late at night? Message reception directly and
                we will confirm what is free and what it costs.
              </p>

              <ul className="mt-5 space-y-3 text-[0.88rem] text-navy-700">
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
                  <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="hover:underline">
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
                    href={`https://wa.me/${waDigits}?text=${encodeURIComponent('Hello Lemma Apartments, I would like to ask about availability.')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                  >
                    <MessageCircle size={15} /> WhatsApp {property.whatsapp}
                  </a>
                ) : null}
                <Link href="/contact" className="btn btn-secondary">
                  Contact &amp; directions
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-sand-200 bg-sand-50 p-6 sm:p-8">
              <h2 className="text-[1.05rem] font-semibold text-navy-900">Paying for your stay</h2>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-navy-600">
                We take Airtel Money, MTN Mobile Money, bank transfer and cash at reception. A{' '}
                {booking.depositPercent}% deposit is required to hold your dates; the balance is due
                before or on arrival.
              </p>
              <ul className="mt-4 space-y-2 text-[0.85rem] text-navy-700">
                {payments.methods
                  .filter((m) => m.enabled)
                  .map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="shrink-0 text-lemma-dark" />
                      {m.label}
                    </li>
                  ))}
              </ul>
              <p className="mt-4 border-t border-sand-200 pt-4 text-[0.78rem] leading-relaxed text-navy-500">
                Payments are confirmed by a member of staff once the money arrives. An uploaded
                proof is a claim, not a cleared payment. You will see the status in your account.
              </p>
              <Link href="/policies" className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-navy-900 hover:text-lemma-dark">
                Booking terms &amp; cancellation policy <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Reveal>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
