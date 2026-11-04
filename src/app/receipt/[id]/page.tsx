import { ownsGuestResource } from '@/lib/domain/ownership';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { formatKwacha } from '@/lib/domain/money';
import { formatMediumDate } from '@/lib/domain/dates';
import { PAYMENT_METHOD_META } from '@/lib/domain/status';
import { BrandMark } from '@/components/public/brand-mark';
import { normalizeBusinessName } from '@/lib/brand';
import { PrintTrigger } from './print-trigger';

export const dynamic = 'force-dynamic';

/**
 * A receipt the guest can read on screen.
 *
 * It is only ever rendered for a payment that a member of staff has verified — the
 * database does not contain a receipt record for anything else, and this page reads
 * the receipt record rather than the payment. Owners and staff can open it too; anyone
 * else gets a 404 rather than a hint that the id exists.
 *
 * "Print" uses the browser dialog (which offers Save as PDF); the PDF route mints the
 * same document server-side for a direct download.
 */
export default async function GuestReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/account');
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const { id } = await params;

  const receipt = (db.receipts ?? []).find((rc) => rc.id === id || rc.receiptNumber === id);
  if (!receipt) notFound();

  const isStaff = ['super_admin', 'admin', 'receptionist'].includes(session.user.role);
  const owns = ownsGuestResource(db, session.uid, session.userRecord.emailVerified ? session.user.email : '', {
    userId: receipt.userId, guestId: receipt.guestId, reservationId: receipt.reservationId, docEmail: receipt.customerEmail,
  });
  if (!isStaff && !owns) notFound();

  const property = db.settings.property;
  const payment = db.payments.find((p) => p.id === receipt.paymentId);
  const reservation = db.reservations.find((r) => r.id === receipt.reservationId);
  const apartment = reservation ? db.apartments.find((a) => a.id === reservation.apartmentId) : null;
  const channel = db.settings.payments.methods.find((m) => m.id === receipt.method);

  const rows: [string, string][] = [
    ['Receipt number', receipt.receiptNumber],
    ['Booking reference', receipt.bookingReference],
    ['Guest', receipt.customerName],
    ['Apartment', `Apartment ${receipt.apartmentNumber} · ${receipt.apartmentName}`],
    ['Check-in', receipt.checkIn ? formatMediumDate(receipt.checkIn) : reservation ? formatMediumDate(reservation.checkIn) : '—'],
    ['Check-out', receipt.checkOut ? formatMediumDate(receipt.checkOut) : reservation ? formatMediumDate(reservation.checkOut) : '—'],
    ['Nights', String(receipt.nights ?? reservation?.nights ?? '—')],
    ['Payment method', PAYMENT_METHOD_META[receipt.method]?.label ?? receipt.method],
    ['Paid to', receipt.paymentDestination ?? channel?.accountNumber ?? channel?.label ?? '—'],
    ['Transaction reference', receipt.transactionReference || 'Cash at reception'],
    ['Amount received', formatKwacha(receipt.amount)],
    ['Total booking amount', formatKwacha(receipt.totalBookingAmount)],
    ['Remaining balance', receipt.remainingBalance > 0 ? formatKwacha(receipt.remainingBalance) : 'Nil — settled'],
    ['Payment approval date', formatMediumDate(receipt.verifiedAt.slice(0, 10))],
    ['Approved by', receipt.verifiedBy],
  ];

  return (
    <div className="min-h-screen bg-sand-100 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href="/account" className="inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-navy-700 hover:text-navy-900">
            <ArrowLeft size={14} /> Back to my account
          </Link>
          <div className="flex gap-2">
            <a
              href={`/api/documents/receipt/${receipt.id}/pdf?download=1`}
              className="btn btn-secondary btn-sm"
            >
              <Download size={13} /> Download PDF
            </a>
            <PrintTrigger />
          </div>
        </div>

        <article className="rounded-lg border border-sand-200 bg-white p-6 shadow-card sm:p-9 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-sand-200 pb-5">
            <div className="flex items-center gap-3">
              <BrandMark tone="light" size="lg" />
              <div>
                <p className="font-display text-[1.12rem] font-semibold text-navy-900">
                  {normalizeBusinessName(property.name)}
                </p>
                <p className="text-[0.74rem] leading-relaxed text-sand-600">
                  {property.addressLine}
                  {property.city ? `, ${property.city}` : ''}
                  {property.country ? `, ${property.country}` : ''}
                </p>
                <p className="text-[0.74rem] text-sand-600">
                  {property.phone} · {property.email}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
                Official receipt
              </p>
              <p className="font-mono text-[0.9rem] font-semibold text-navy-900">{receipt.receiptNumber}</p>
              <p className="text-[0.72rem] text-navy-500">Issued {formatMediumDate(receipt.createdAt.slice(0, 10))}</p>
            </div>
          </header>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-md bg-sand-50 px-4 py-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.12em] text-navy-400">Amount received</p>
              <p className="text-[1.9rem] font-bold leading-none tabular-nums text-navy-900">
                {formatKwacha(receipt.amount)}
              </p>
            </div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-st-availableBg px-2.5 py-1 text-[0.74rem] font-semibold text-st-available">
              <ShieldCheck size={13} /> Verified payment
            </p>
          </div>

          <dl className="mt-5 divide-y divide-sand-100">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                <dt className="text-[0.76rem] uppercase tracking-[0.06em] text-navy-400">{label}</dt>
                <dd className="text-right text-[0.86rem] font-medium text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>

          {payment?.verificationNote ? (
            <p className="mt-4 rounded-md border border-sand-200 bg-sand-50 p-3 text-[0.78rem] leading-relaxed text-navy-600">
              Verification note: {payment.verificationNote}
            </p>
          ) : null}

          <footer className="mt-6 border-t border-sand-200 pt-4 text-[0.74rem] leading-relaxed text-navy-500">
            <p>
              Confirmed by {receipt.verifiedBy} on {formatMediumDate(receipt.verifiedAt.slice(0, 10))}. This
              receipt acknowledges money received against booking {receipt.bookingReference} and is not a tax
              invoice.
            </p>
            <p className="mt-1">
              {normalizeBusinessName(property.legalName || property.name)}
              {property.taxPayerId ? ` · TPIN ${property.taxPayerId}` : ''} · {property.email}
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
