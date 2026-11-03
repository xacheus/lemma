import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, ShieldCheck, Sun, Wifi } from 'lucide-react';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getSession } from '@/lib/auth/session';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { PhotoFrame } from '@/components/ui/photo';
import { Reveal } from '@/components/ui/motion';

export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
  const { property, booking } = db.settings;
  const publishedCount = db.apartments.filter(
    (a) => a.active && a.publicationStatus !== 'draft',
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-white text-navy-900">
      <PublicHeader property={property} session={session} activePath="/about" />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <div className="animate-fade-up grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-lemma-dark">
              About {property.name}
            </p>
            <h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-tight text-navy-900">
              Dependable corporate and family residences in Lusaka.
            </h1>
            <p className="mt-4 text-[0.94rem] leading-relaxed text-navy-600">
              Located at {property.addressLine} in {property.city}, {property.name} offers{' '}
              {publishedCount > 0
                ? `${publishedCount} privately serviced ${publishedCount === 1 ? 'apartment' : 'apartments'}`
                : 'privately serviced apartments'}{' '}
              ranging from efficient executive studios to spacious family residences. Every unit is
              managed directly by our on-site hospitality, housekeeping, and facilities teams.
            </p>
            <p className="mt-3 text-[0.94rem] leading-relaxed text-navy-600">
              Whether visiting Lusaka for project consulting, NGO missions, regional conferences, or
              relocation, guests enjoy predictable ZMW invoicing, verified payment receipts, and
              calm residential privacy off Great East Road.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/apartments" className="btn btn-primary">
                Explore Apartments <ArrowRight size={15} />
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Contact Front Desk
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <PhotoFrame
                src="/images/hero/exterior-building.jpg"
                alt="Lemma Heights Exterior"
                ratio="16 / 9"
                variant="detail"
              />
            </div>
            <PhotoFrame
              src="/images/property/reception.jpg"
              alt="Reception Desk"
              ratio="4 / 3"
              variant="card"
            />
            <PhotoFrame
              src="/images/property/amenities.jpg"
              alt="Courtyard Gardens"
              ratio="4 / 3"
              variant="card"
            />
          </div>
        </div>

        <div className="stagger grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Sun,
              title: 'Uninterrupted Power & Water',
              text: 'Dedicated solar/inverter backup and pressurized borehole water storage keep every suite operational around the clock.',
            },
            {
              icon: Wifi,
              title: 'Enterprise Connectivity',
              text: 'High-speed fibre Wi-Fi and ergonomic work desks in every apartment support remote teams and executive calls.',
            },
            {
              icon: ShieldCheck,
              title: 'Transparent Corporate Billing',
              text: 'Itemised ZMW quotations, tax invoices with TPIN details, and verified payment receipts for finance teams.',
            },
          ].map((c) => (
            <div key={c.title} className="card hover-lift p-6 hover:border-brand-300 hover:shadow-pop">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <c.icon size={18} />
              </span>
              <h2 className="mt-3 text-[1.02rem] font-semibold text-navy-900">{c.title}</h2>
              <p className="mt-1.5 text-[0.86rem] leading-relaxed text-navy-600">{c.text}</p>
            </div>
          ))}
        </div>

        <Reveal className="card p-6 sm:p-8">
          <div className="flex items-center gap-2 text-navy-900">
            <Building2 size={18} className="text-lemma-dark" />
            <h2 className="text-[1.15rem] font-semibold">House Policies &amp; Arrival Guide</h2>
          </div>
          <div className="mt-4 grid gap-4 text-[0.86rem] text-navy-700 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
              <span>
                <strong>Check-in &amp; Check-out:</strong> Arrival from {booking.checkInTime};
                departure by {booking.checkOutTime}. Reception hours: {property.receptionHours}.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
              <span>
                <strong>Confirmation Deposit:</strong> Standard deposit of {booking.depositPercent}%
                via Airtel Money, MTN MoMo, Bank Transfer, or Cash at reception.
              </span>
            </div>
            <div className="sm:col-span-2 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-lemma-dark" />
              <span>
                <strong>Cancellation Policy:</strong> {booking.cancellationText}
              </span>
            </div>
          </div>
        </Reveal>

        {/* Closing banner */}
        <Reveal as="section" className="overflow-hidden rounded-xl bg-charcoal-950 text-white">
          <div className="flex flex-col items-start justify-between gap-5 px-6 py-8 sm:flex-row sm:items-center sm:px-10">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-white/50">
                {property.city}, {property.country}
              </p>
              <h2 className="mt-1.5 text-[1.35rem] font-semibold tracking-tight">
                Ready to hold dates at {property.name}?
              </h2>
              <p className="mt-1 text-[0.86rem] text-white/60">
                Live availability, instant Kwacha pricing, no booking fee.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/apartments"
                className="btn shine bg-white px-5 py-2.5 text-[0.85rem] font-semibold text-charcoal-900 transition-transform duration-300 ease-smooth hover:-translate-y-0.5"
              >
                Check availability <ArrowRight size={15} />
              </Link>
              <a
                href={`tel:${property.phone}`}
                className="btn border border-white/25 px-4 py-2.5 text-[0.85rem] transition-colors hover:bg-white/10"
              >
                Call reception
              </a>
            </div>
          </div>
        </Reveal>
      </main>

      <PublicFooter property={property} />
    </div>
  );
}
