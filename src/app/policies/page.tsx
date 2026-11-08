import Link from 'next/link';
import { Check, Mail, MessageCircle, Phone } from 'lucide-react';
import { readPublicSiteData } from '@/lib/public/read-site-data';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Booking terms, cancellation and privacy',
  description:
    'How bookings, deposits, cancellations and guest information work at Lemma Apartments in Lusaka.',
};

/**
 * The public policy page. Every commercial figure on it is read from
 * settings/booking, so an administrator changing the deposit percentage or the
 * cancellation window in Admin → Settings updates this page too. The prose can be
 * overridden in settings/property (bookingTerms, privacyPolicy); when it is blank
 * the defaults below are printed.
 */
export default async function PoliciesPage() {
  const { db, session } = await readPublicSiteData();
  const { property, booking, payments } = db.settings;
  const bannerPhoto =
    db.apartments
      .flatMap((a) => [a.coverPhoto, ...(a.gallery?.map((g) => g.url) ?? a.photos)])
      .find(Boolean) ?? null;

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');

  const terms = [
    {
      heading: 'Making a booking',
      body: [
        `A booking request sent from this website creates an enquiry against the apartment's calendar. It does not hold the dates, and no money is taken online.`,
        `To confirm a stay we take a ${booking.depositPercent}% deposit of the total accommodation cost. The dates are held once the deposit is received and the booking is marked Reserved by reception. The balance is payable before or on arrival.`,
        `Nightly rates are quoted in Zambian Kwacha (ZMW) per apartment per night and include the number of guests stated on the booking. Extra guests beyond the apartment's included occupancy are charged at the rate shown on the apartment page.`,
        `The rate covers furnished accommodation, linen and towels, housekeeping during the stay, Wi-Fi, backup power and parking. It does not cover meals, laundry, airport transfers or anything arranged separately.`,
      ],
    },
    {
      heading: 'Arrival and departure',
      body: [
        `Check-in is from ${booking.checkInTime} and check-out is by ${booking.checkOutTime}. Arriving outside reception hours must be arranged in advance on WhatsApp (${property.whatsapp}) so someone is there to meet you.`,
        `We ask for a valid national registration card or passport at check-in. Details are recorded against the booking and are visible only to authorised staff.`,
        `A late check-out may be possible where the apartment is not booked the same night. Ask reception on the day; it is not guaranteed.`,
      ],
    },
    {
      heading: 'Payment',
      body: [
        `We accept ${payments.methods
          .filter((m) => m.enabled)
          .map((m) => m.label)
          .join(', ')}. Account and merchant details are confirmed by reception on your booking confirmation. Never send money to an account number you have not had confirmed by a member of staff.`,
        `When you upload proof of payment, a member of staff checks it against the statement or mobile-money record before it is counted against your balance. Until then the payment shows as awaiting verification and the balance does not move.`,
        `An official receipt is issued for every verified payment and is available from your account.`,
      ],
    },
    {
      heading: 'Changes and cancellation',
      body: [
        booking.cancellationText,
        `To cancel or change a booking, contact reception on WhatsApp (${property.whatsapp}) or by email (${property.email}) with your booking reference. Cancellation by a guest is a request until reception confirms it; the dates are released when the booking is marked Cancelled.`,
        `Refunds are a management decision and are recorded against the original payment. Where a refund is approved it is paid back through the same channel the money arrived.`,
      ],
    },
    {
      heading: 'During your stay',
      body: [
        'Apartments are self-catering. Smoking is not permitted indoors. Parties and events are not permitted, and the number of people staying in an apartment must not exceed the number on the booking.',
        'Please report any damage or fault to reception promptly so it can be fixed. Loss or damage beyond fair wear may be charged at replacement cost.',
        'Housekeeping may need to enter the apartment during your stay. Where possible this is arranged with you in advance.',
      ],
    },
  ];

  const privacy = [
    {
      heading: 'What we collect',
      body: [
        'Your name, phone number and email address, so we can confirm the booking and reach you before arrival. If you create an account we also store a password hash and the date the account was created.',
        'Identity details (NRC or passport number) where they are required at check-in. These are kept against the guest record and are visible only to authorised staff, never on a public page.',
        'The booking details themselves: apartment, dates, guest count, payments and receipts.',
        'Your IP address is recorded briefly when you submit a public booking, purely to rate-limit spam submissions.',
      ],
    },
    {
      heading: 'Who can see it',
      body: [
        'You can see your own bookings, payments and receipts in your account.',
        'Reception and administration can see booking and payment records they need to run the property. Housekeeping staff see only the apartment, dates and any notes about cleaning, not your identity document or financial details.',
        'We do not sell guest data, and we do not share it with advertisers. We would disclose records only where Zambian law requires it.',
      ],
    },
    {
      heading: 'How it is stored',
      body: [
        'Booking and account records are accessible only through authorised accounts. Photographs are stored separately from guest records.',
        'Access to staff screens requires an authenticated account with the right role. Sensitive identity fields are restricted to roles permitted to see them, and every privileged action is written to an audit log.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        `You can ask us to correct your details, or ask what we hold about you, by emailing ${property.email}. We will respond within a reasonable time.`,
        'We do not send marketing messages without your agreement. Booking confirmations, payment notices and arrival reminders are part of the service, not marketing.',
      ],
    },
  ];

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader property={property} session={session} activePath="/policies" unreadCount={unreadForSession(db, session)} />

      <main className="flex-1">
        <section
          className="page-banner"
          style={bannerPhoto ? { backgroundImage: `url("${bannerPhoto}")` } : undefined}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
            <span className="eyebrow">Booking Info</span>
            <h1 className="mt-2 max-w-3xl font-heading text-[2rem] font-extrabold tracking-[-0.01em] text-white sm:text-[2.6rem]">
              Booking terms, cancellation &amp; privacy
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[0.98rem] leading-relaxed text-[#D7DEE6]">
              Clear house and payment rules before you commit to dates. If anything needs
              clarification for your stay, reach reception directly before sending a deposit.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">

        <div className="swdl-card mt-2 p-6 sm:p-7">
          <h2 className="font-heading text-[1.15rem] font-extrabold">At a glance</h2>
          <ul className="check-gold mt-3 space-y-1 text-[0.88rem] leading-relaxed text-swdl-ink">
            <li>
              <Check size={16} aria-hidden="true" />
              <span>{booking.depositPercent}% deposit confirms your dates; the rest is due by arrival.</span>
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              <span>
                Free cancellation up to {booking.cancellationPolicyHours} hours before check-in
                {booking.cancellationPolicyHours > 0 ? ', deposit refunded at management’s discretion.' : '.'}
              </span>
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              <span>Check-in {booking.checkInTime}, check-out {booking.checkOutTime}.</span>
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              <span>Proof of payment is checked by a person before your balance changes.</span>
            </li>
          </ul>
        </div>

        <section aria-labelledby="terms" className="mt-10">
          <h2 id="terms" className="font-heading text-[1.35rem] font-extrabold">
            Booking terms
          </h2>
          {property.bookingTerms?.trim() ? (
            <p className="mt-3 whitespace-pre-line text-[0.92rem] leading-relaxed text-swdl-ink">
              {property.bookingTerms}
            </p>
          ) : (
            <div className="mt-3 space-y-6">
              {terms.map((block) => (
                <div key={block.heading}>
                  <h3 className="font-heading text-[0.98rem] font-bold">{block.heading}</h3>
                  <ul className="mt-1.5 space-y-2 text-[0.9rem] leading-relaxed text-swdl-muted">
                    {block.body.map((line, i) => (
                      <li key={i} className="border-l-2 border-swdl-gold/45 pl-3.5">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="privacy" className="mt-10 border-t border-[#DFE3E8] pt-9">
          <h2 id="privacy" className="font-heading text-[1.35rem] font-extrabold">
            Privacy
          </h2>
          {property.privacyPolicy?.trim() ? (
            <p className="mt-3 whitespace-pre-line text-[0.92rem] leading-relaxed text-swdl-ink">
              {property.privacyPolicy}
            </p>
          ) : (
            <div className="mt-3 space-y-6">
              {privacy.map((block) => (
                <div key={block.heading}>
                  <h3 className="font-heading text-[0.98rem] font-bold">{block.heading}</h3>
                  <ul className="mt-1.5 space-y-2 text-[0.9rem] leading-relaxed text-swdl-muted">
                    {block.body.map((line, i) => (
                      <li key={i} className="border-l-2 border-swdl-gold/45 pl-3.5">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="cta-band mt-10 p-7 text-center sm:p-9">
          <h2 className="font-heading text-[1.3rem] font-extrabold text-white sm:text-[1.5rem]">Questions before you book?</h2>
          <p className="mx-auto mt-2 max-w-xl text-[0.9rem] leading-relaxed">
            Reach the {property.name} front desk directly by WhatsApp, phone or email.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}?text=${encodeURIComponent('Hello Lemma Apartments, I have a question about a booking.')}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-gold px-5 py-2.5 text-[0.84rem]"
              >
                <MessageCircle size={14} /> WhatsApp {property.whatsapp}
              </a>
            ) : null}
            <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-outline-light px-5 py-2.5 text-[0.84rem]">
              <Phone size={14} /> {property.phone}
            </a>
            <a href={`mailto:${property.email}`} className="btn btn-outline-light px-5 py-2.5 text-[0.84rem]">
              <Mail size={14} /> {property.email}
            </a>
          </div>
        </section>

        <p className="mt-8 text-center text-[0.85rem] text-swdl-muted">
          Looking for a room instead?{' '}
          <Link href="/apartments" className="font-semibold text-swdl-navy underline decoration-swdl-gold underline-offset-2 transition-colors hover:text-swdl-goldDark">
            See the apartments and live rates
          </Link>
          .
        </p>
        </div>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
