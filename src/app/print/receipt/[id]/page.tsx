import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession, verifyToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/store';
import { decorate } from '@/lib/domain/selectors';
import { formatKwacha } from '@/lib/domain/money';
import { formatDateTime, formatMediumDate } from '@/lib/domain/dates';
import { PAYMENT_METHOD_META } from '@/lib/domain/status';
import { PrintSheet, PrintFooter, PrintHeader, PrintButton, CloseLink } from '../../print-shell';

export const dynamic = 'force-dynamic';

/**
 * A receipt for one payment. It states the truth of the record: money that has only
 * been *claimed* with a screenshot is printed as awaiting verification, never as paid.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const userId = verifyToken(store.get('lemma_session')?.value);
  if (!userId) redirect('/login');
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.permissions.has('payments.view')) notFound();

  const { id } = await params;
  const db = getDb();
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) notFound();
  const reservation = db.reservations.find((r) => r.id === payment.reservationId);
  const view = reservation ? decorate(db, reservation) : null;
  const guest = view?.guest ?? null;
  const apartment = view?.apartment ?? null;
  const p = db.settings.property;

  const sameDay = db.payments
    .filter((x) => x.paidAt.slice(0, 10) === payment.paidAt.slice(0, 10))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sequence = String(sameDay.findIndex((x) => x.id === payment.id) + 1).padStart(4, '0');
  const receiptNumber = `${db.settings.payments.receiptPrefix}-${payment.paidAt.slice(0, 10).replace(/-/g, '')}-${sequence}`;
  const methodSetting = db.settings.payments.methods.find((m) => m.id === payment.method);
  const pending = payment.verificationStatus === 'pending';

  return (
    <PrintSheet
      title={`Receipt ${receiptNumber}`}
      toolbar={
        <>
          <span className="text-[0.78rem] text-navy-400">Opens in a print dialog — choose “Save as PDF” for a copy.</span>
          <CloseLink href={`/admin/reservations/${payment.reservationId}`} label="Back to folio" />
          <PrintButton label="Print or save PDF" />
        </>
      }
    >
      <PrintHeader
        property={p}
        documentLabel="Official receipt"
        documentNumber={receiptNumber}
        issuedOn={formatMediumDate(payment.paidAt.slice(0, 10))}
      />

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="print-label">Received from</p>
          <p className="mt-1 text-[1.05rem] font-semibold text-navy-900">{guest?.fullName ?? 'Guest'}</p>
          <p className="mt-0.5 text-[0.82rem] leading-relaxed text-navy-500">
            {guest?.phone}
            {guest?.email ? ` · ${guest.email}` : ''}
          </p>
          {guest?.company ? <p className="mt-0.5 text-[0.82rem] text-navy-500">{guest.company}</p> : null}
        </div>
        <div className="rounded-lg border border-sand-300 bg-sand-50/70 p-3.5">
          <p className="print-label">Amount received</p>
          <p className="mt-1 text-[2rem] font-bold leading-none text-navy-900 tnum">{formatKwacha(payment.amount)}</p>
          <p className="mt-1.5 text-[0.78rem] uppercase tracking-wide text-navy-500">{inWords(payment.amount)} kwacha only</p>
          {pending ? (
            <p className="mt-2 rounded border border-gold-300 bg-gold-50 px-2 py-1 text-[0.76rem] font-semibold text-gold-700">
              Awaiting verification — this amount is not yet counted on the guest&apos;s account.
            </p>
          ) : null}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-[0.86rem]">
        <tbody className="divide-y divide-sand-200">
          <Line label="Reservation" value={reservation ? `${reservation.reference} · ${formatMediumDate(reservation.checkIn)} → ${formatMediumDate(reservation.checkOut)} (${reservation.nights} night${reservation.nights === 1 ? '' : 's'})` : '—'} />
          <Line label="Apartment" value={apartment ? `Apartment ${apartment.number} — ${apartment.name} (${apartment.code})` : '—'} />
          <Line label="Payment method" value={`${PAYMENT_METHOD_META[payment.method].label}${methodSetting ? ` · ${methodSetting.accountLabel} ${methodSetting.accountNumber}` : ''}`} />
          <Line label="Transaction reference" value={payment.reference || 'Paid in cash at the front desk'} mono />
          <Line label="Value date" value={formatDateTime(payment.paidAt)} />
          <Line label="Receipt type" value={payment.kind === 'deposit' ? `Deposit (${db.settings.booking.depositPercent}% of the stay total)` : payment.kind === 'final_settlement' ? 'Final settlement' : 'Part payment'} />
          {payment.note ? <Line label="Note" value={payment.note} /> : null}
        </tbody>
      </table>

      {view ? (
        <div className="mt-6">
          <p className="print-label mb-2">Account position after this receipt</p>
          <table className="w-full border-collapse text-[0.86rem]">
            <tbody className="divide-y divide-sand-200">
              <Line label="Accommodation total" value={formatKwacha(view.totalAmount)} />
              {view.discount ? <Line label="Discount applied" value={`−${formatKwacha(view.discount)}`} /> : null}
              <Line label="Money verified to date" value={formatKwacha(view.verifiedPaid)} />
              {view.pendingVerification ? <Line label="Awaiting verification" value={formatKwacha(view.pendingVerification)} /> : null}
              <Line label="Balance due" value={view.balanceDue ? formatKwacha(view.balanceDue) : 'Nil — folio settled'} strong />
            </tbody>
          </table>
        </div>
      ) : null}

      {payment.proof ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="print-label">Supporting evidence on file</p>
            <p className="mt-1 text-[0.82rem] text-navy-500">
              {payment.proof.fileName} · uploaded {formatDateTime(payment.proof.uploadedAt)} by {payment.proof.uploadedBy}. Held against this receipt in the property system.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={payment.proof.dataUrl} alt="Proof of payment" className="h-24 w-24 rounded border border-sand-300 object-cover" />
        </div>
      ) : null}

      <PrintFooter
        lines={[
          payment.verificationStatus === 'verified'
            ? `Verified by ${payment.verifiedBy ?? 'a supervisor'} on ${formatDateTime(payment.verifiedAt ?? payment.createdAt)}${payment.verificationNote ? ` — ${payment.verificationNote}` : ''}`
            : payment.verificationStatus === 'rejected'
              ? `This entry was rejected: ${payment.verificationNote || 'the transaction could not be matched to a payment in our account'}. No amount has been credited.`
              : 'Entered by a staff member and awaiting verification against the merchant account or bank statement.',
          `Recorded at the desk by ${payment.recordedByName}.`,
          `${p.legalName} · TPIN ${p.taxPayerId} · ${p.addressLine}, ${p.city}`,
          'This receipt acknowledges money received against the reservation above. It is not a tax invoice and does not constitute a confirmed booking on its own.',
        ]}
        signature="Authorised signatory"
      />
    </PrintSheet>
  );
}

function Line({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <tr>
      <th scope="row" className="w-[12rem] py-2 pr-3 text-left align-top text-[0.78rem] font-medium uppercase tracking-wide text-navy-400">
        {label}
      </th>
      <td className={`py-2 text-right align-top ${strong ? 'text-[1rem] font-bold text-navy-900' : 'text-navy-800'} ${mono ? 'font-mono text-[0.82rem]' : ''}`}>{value}</td>
    </tr>
  );
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function inWords(amount: number): string {
  const n = Math.round(amount);
  if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)} million ${inWords(n % 1_000_000)}`.trim();
  if (n >= 1000) return `${inWords(Math.floor(n / 1000))} thousand ${inWords(n % 1000)}`.trim();
  if (n >= 100) return `${ONES[Math.floor(n / 100)]} hundred ${inWords(n % 100)}`.trim();
  if (n >= 20) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
  return ONES[n] ?? String(n);
}
