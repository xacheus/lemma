import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession, verifyToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/store';
import { decorate } from '@/lib/domain/selectors';
import { formatKwacha } from '@/lib/domain/money';
import { formatDateTime, formatLongDate, formatMediumDate } from '@/lib/domain/dates';
import { BOOKING_STATUS_META, PAYMENT_METHOD_META, PAYMENT_STATUS_META } from '@/lib/domain/status';
import { CloseLink, PrintButton, PrintFooter, PrintHeader, PrintSheet } from '../../print-shell';

export const dynamic = 'force-dynamic';

/**
 * The guest folio: the whole account for one stay, printed for the desk drawer or for a
 * guest who asks for their statement. Balances come from the same arithmetic the screen
 * uses, so a printed folio can never disagree with what reception is looking at.
 */
export default async function FolioPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const userId = verifyToken(store.get('lemma_session')?.value);
  if (!userId) redirect('/login');
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.permissions.has('reservations.view')) notFound();

  const { id } = await params;
  const db = getDb();
  const reservation = db.reservations.find((r) => r.id === id);
  if (!reservation) notFound();
  const view = decorate(db, reservation);
  const p = db.settings.property;
  const payments = db.payments.filter((x) => x.reservationId === reservation.id).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const showPii = session.permissions.has('guests.viewPii');
  const cleaning = db.housekeeping.filter((t) => t.reservationId === reservation.id);

  return (
    <PrintSheet
      title={`Folio ${view.reference}`}
      toolbar={
        <>
          <span className="text-[0.78rem] text-navy-400">Statement as at {formatDateTime(new Date().toISOString())}</span>
          <PrintButton label="Print folio" />
          <CloseLink href={`/admin/reservations/${view.id}`} label="Back to screen" />
        </>
      }
    >
      <PrintHeader property={p} documentLabel="Guest folio" documentNumber={view.reference} issuedOn={formatMediumDate(db.__today)} />

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <p className="print-label">Guest</p>
          <p className="mt-1 text-[1.05rem] font-semibold text-navy-900">{view.guest?.fullName ?? '—'}</p>
          <p className="mt-0.5 text-[0.82rem] leading-relaxed text-navy-500">
            {view.guest?.phone}
            {view.guest?.email ? ` · ${view.guest.email}` : ''}
            <br />
            {showPii && view.guest?.nationalId
              ? `${view.guest.idType === 'passport' ? 'Passport' : 'NRC'} ${view.guest.nationalId} · ${view.guest.nationality || 'Zambia'}`
              : 'Identity document verified at check-in'}
            {view.guest?.company ? <><br />{view.guest.company}</> : null}
          </p>
        </div>
        <div>
          <p className="print-label">Stay</p>
          <table className="mt-1 w-full border-collapse text-[0.84rem]">
            <tbody className="divide-y divide-sand-200">
              <MiniLine label="Apartment" value={`Apt ${view.apartment?.number} — ${view.apartment?.name}`} />
              <MiniLine label="Arrival" value={`${formatLongDate(view.checkIn)} from ${db.settings.booking.checkInTime}`} />
              <MiniLine label="Departure" value={`${formatLongDate(view.checkOut)} by ${db.settings.booking.checkOutTime}`} />
              <MiniLine label="Nights / guests" value={`${view.nights} night${view.nights === 1 ? '' : 's'} · ${view.guestCount} guest${view.guestCount === 1 ? '' : 's'}`} />
              <MiniLine label="Booked via" value={`${view.source.replace(/_/g, ' ')} · ${formatMediumDate(view.createdAt.slice(0, 10))}`} />
              <MiniLine label="Status" value={`${BOOKING_STATUS_META[view.status].label} · ${PAYMENT_STATUS_META[view.paymentStatus].label}`} />
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-7">
        <p className="print-label mb-2">Charges</p>
        <table className="w-full border-collapse text-[0.88rem]">
          <thead>
            <tr className="border-b border-navy-800 text-left text-[0.72rem] uppercase tracking-wide text-navy-400">
              <th className="py-1.5 pr-2 font-semibold">Description</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Rate</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Qty</th>
              <th className="py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            <tr>
              <td className="py-2 pr-2">
                Accommodation — Apt {view.apartment?.number} {view.apartment?.name}
                <span className="block text-[0.76rem] text-navy-400">
                  {formatMediumDate(view.checkIn)} → {formatMediumDate(view.checkOut)}
                  {db.settings.booking.taxesIncluded ? ' · taxes included in the rate' : ''}
                </span>
              </td>
              <td className="py-2 pr-2 text-right tnum">{formatKwacha(view.nightlyRate)}</td>
              <td className="py-2 pr-2 text-right tnum">{view.nights}</td>
              <td className="py-2 text-right font-semibold tnum">{formatKwacha(view.nightlyRate * view.nights)}</td>
            </tr>
            {view.discount ? (
              <tr>
                <td className="py-2 pr-2 text-navy-500">Agreed discount</td>
                <td className="py-2 pr-2 text-right text-navy-400">—</td>
                <td className="py-2 pr-2 text-right text-navy-400">—</td>
                <td className="py-2 text-right tnum">−{formatKwacha(view.discount)}</td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-navy-800">
              <td className="py-2 pr-2 text-[0.78rem] font-semibold uppercase tracking-wide text-navy-500" colSpan={3}>
                Total charges
              </td>
              <td className="py-2 text-right text-[1.05rem] font-bold tnum">{formatKwacha(view.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <p className="print-label mb-2">Payments</p>
        {payments.length ? (
          <table className="w-full border-collapse text-[0.86rem]">
            <thead>
              <tr className="border-b border-sand-300 text-left text-[0.72rem] uppercase tracking-wide text-navy-400">
                <th className="py-1.5 pr-2 font-semibold">Date</th>
                <th className="py-1.5 pr-2 font-semibold">Method / reference</th>
                <th className="py-1.5 pr-2 font-semibold">Type</th>
                <th className="py-1.5 pr-2 font-semibold">Verification</th>
                <th className="py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {payments.map((pay) => (
                <tr key={pay.id}>
                  <td className="py-1.5 pr-2 text-navy-600">{formatMediumDate(pay.paidAt.slice(0, 10))}</td>
                  <td className="py-1.5 pr-2">
                    <span className="block text-navy-800">{PAYMENT_METHOD_META[pay.method].label}</span>
                    <span className="block font-mono text-[0.74rem] text-navy-400">{pay.reference || '—'}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-navy-600">{pay.kind.replace(/_/g, ' ')}</td>
                  <td className="py-1.5 pr-2 text-[0.8rem]">
                    {pay.verificationStatus === 'verified' ? (
                      <span className="text-st-available">Verified{pay.verifiedBy ? ` · ${pay.verifiedBy}` : ''}</span>
                    ) : pay.verificationStatus === 'rejected' ? (
                      <span className="text-st-cancelled">Rejected</span>
                    ) : (
                      <span className="text-gold-700">Awaiting verification</span>
                    )}
                  </td>
                  <td className={`py-1.5 text-right tnum ${pay.kind === 'refund' ? 'text-st-cancelled' : ''}`}>
                    {pay.kind === 'refund' ? '−' : ''}
                    {formatKwacha(pay.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-sand-300">
                <td className="py-2 pr-2 text-[0.78rem] font-semibold uppercase tracking-wide text-navy-500" colSpan={4}>
                  Money verified to this account
                </td>
                <td className="py-2 text-right font-semibold tnum">{formatKwacha(view.verifiedPaid)}</td>
              </tr>
              {view.pendingVerification ? (
                <tr>
                  <td className="py-1 pr-2 text-[0.78rem] text-gold-700" colSpan={4}>
                    Claimed with proof, awaiting a supervisor&apos;s check
                  </td>
                  <td className="py-1 text-right text-gold-700 tnum">{formatKwacha(view.pendingVerification)}</td>
                </tr>
              ) : null}
              <tr className="border-t-2 border-navy-800">
                <td className="py-2 pr-2 text-[0.78rem] font-semibold uppercase tracking-wide text-navy-500" colSpan={4}>
                  Balance due
                </td>
                <td className={`py-2 text-right text-[1.15rem] font-bold tnum ${view.balanceDue ? 'text-st-cancelled' : 'text-st-available'}`}>
                  {view.balanceDue ? formatKwacha(view.balanceDue) : 'Nil'}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="rounded-lg bg-sand-100/70 px-3 py-2.5 text-[0.84rem] text-navy-500">
            No money has been received against this folio. The deposit of {formatKwacha(view.depositDue)} is due to confirm the stay, with{' '}
            {formatKwacha(Math.max(0, view.totalAmount - view.depositDue))} by {db.settings.booking.checkInTime} on arrival day.
          </p>
        )}
      </section>

      {view.notes || view.guest?.specialRequests ? (
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {view.notes ? (
            <div>
              <p className="print-label mb-1">Desk notes</p>
              <p className="whitespace-pre-line rounded-lg bg-sand-50 px-3 py-2 text-[0.82rem] leading-relaxed text-navy-600 ring-1 ring-sand-200">{view.notes}</p>
            </div>
          ) : null}
          {view.guest?.specialRequests ? (
            <div>
              <p className="print-label mb-1">Guest preferences on file</p>
              <p className="whitespace-pre-line rounded-lg bg-sand-50 px-3 py-2 text-[0.82rem] leading-relaxed text-navy-600 ring-1 ring-sand-200">{view.guest.specialRequests}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {cleaning.length ? (
        <section className="mt-6">
          <p className="print-label mb-1.5">Housekeeping tied to this stay</p>
          <ul className="space-y-1 text-[0.8rem] text-navy-600">
            {cleaning.map((t) => (
              <li key={t.id}>
                {formatMediumDate(t.date)} · {t.type.replace(/_/g, ' ')} · {t.status.replace(/_/g, ' ')}
                {t.completedAt ? ` (completed ${t.completedAt.slice(11, 16)})` : ` (due ${t.dueTime})`}
                {t.notes.length ? ` — ${t.notes[t.notes.length - 1].text}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PrintFooter
        lines={[
          `Deposit policy: ${db.settings.booking.depositPercent}% of the stay total, balance by ${db.settings.booking.checkInTime} on the day of arrival.`,
          `Cancellation: ${db.settings.booking.cancellationText}`,
          reservation.status === 'cancelled'
            ? `This folio was cancelled on ${formatDateTime(reservation.cancelledAt ?? reservation.updatedAt)}${reservation.cancellationReason ? ` — ${reservation.cancellationReason}` : ''}.`
            : `Last amended ${formatDateTime(reservation.updatedAt)}.`,
          `Prepared by ${session.user.name} (${session.user.jobTitle || session.user.role}) for ${view.guest?.fullName ?? 'the guest'}.`,
          'Amounts are in Zambian Kwacha (K). Money shown as verified has been matched to a merchant confirmation or bank statement by a supervisor.',
        ]}
        signature={view.balanceDue ? 'Received by / balance confirmed' : 'Folio closed — received by'}
      />

      <p className="no-print mt-4 text-center text-[0.76rem] text-navy-400">
        This is a print view.{' '}
        <Link href={`/admin/reservations/${view.id}`} className="link">
          Return to the interactive folio
        </Link>{' '}
        to record payments or amend the stay.
      </p>
    </PrintSheet>
  );
}

function MiniLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="py-1 pr-3 text-left align-top text-[0.76rem] font-medium uppercase tracking-wide text-navy-400">
        {label}
      </th>
      <td className="py-1 text-right align-top text-navy-800">{value}</td>
    </tr>
  );
}
