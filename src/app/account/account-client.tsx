'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  LogOut,
  MessageCircle,
  Receipt,
  User,
  XCircle,
} from 'lucide-react';
import type { SnapshotView } from '@/lib/view-types';
import { ROLE_META } from '@/lib/domain/status';
import type { PaymentStage } from '@/lib/domain/types';
import { formatKwacha } from '@/lib/domain/money';
import { formatMediumDate } from '@/lib/domain/dates';
import { GuestNotifications } from './guest-notifications';
import { GuestPaymentPanel } from './guest-payment-panel';

const STAGE_NOTE: Record<PaymentStage, string> = {
  awaiting_payment: 'No payment has been verified for this stay yet.',
  proof_submitted:
    'We received your payment reference. Reception will check it against our statement shortly.',
  under_verification:
    'Reception is currently matching your payment reference against our statement.',
  part_paid: 'Your deposit is verified and dates are held. The remaining balance is shown above.',
  approved: 'Payment verified in full. Your official ZMW receipt is ready to view or download.',
  rejected:
    'The last payment reference could not be matched on our statement. Please submit a corrected reference or message reception.',
};

type GuestReservationRow = NonNullable<SnapshotView['reservations']>[number];

function unifiedBookingStatus(r: GuestReservationRow): {
  label: string;
  chip: string;
  step: 0 | 1 | 2 | 3 | 4;
} {
  if (r.status === 'cancelled') {
    return { label: 'Cancelled', chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25', step: 0 };
  }
  if (r.status === 'cancellation_requested') {
    return {
      label: 'Cancellation requested',
      chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
      step: 0,
    };
  }
  if (r.status === 'checked_out') {
    return { label: 'Stay completed', chip: 'bg-sand-200 text-swdl-muted', step: 4 };
  }
  if (r.status === 'checked_in') {
    return { label: 'Checked in', chip: 'bg-st-occupiedBg text-st-occupied ring-1 ring-st-occupied/25', step: 4 };
  }
  if (r.status === 'inquiry') {
    return {
      label: 'Enquiry sent · awaiting confirmation',
      chip: 'bg-swdl-light text-swdl-ink ring-1 ring-sand-300',
      step: 1,
    };
  }
  if (r.paymentStage === 'proof_submitted' || r.paymentStage === 'under_verification') {
    return {
      label: 'Payment under review',
      chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
      step: 2,
    };
  }
  if (r.paymentStage === 'rejected') {
    return {
      label: 'Payment reference not matched',
      chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25',
      step: 1,
    };
  }
  if (r.status === 'fully_paid' || r.paymentStatus === 'fully_paid') {
    return {
      label: 'Confirmed · paid in full',
      chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
      step: 3,
    };
  }
  if (r.status === 'reserved' && r.verifiedPaid > 0) {
    return {
      label: 'Confirmed · deposit verified',
      chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
      step: 3,
    };
  }
  if (r.status === 'reserved') {
    return {
      label: 'Reserved · awaiting deposit',
      chip: 'bg-st-reservedBg text-st-reserved ring-1 ring-st-reserved/25',
      step: 2,
    };
  }
  return {
    label: 'Request received · awaiting deposit',
    chip: 'bg-swdl-light text-swdl-ink ring-1 ring-sand-300',
    step: 1,
  };
}

export function GuestAccountClient({
  initialSnapshot,
  justRegistered = false,
}: {
  initialSnapshot: SnapshotView;
  justRegistered?: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SnapshotView>(initialSnapshot);
  const [tab, setTab] = useState<'bookings' | 'notifications' | 'documents' | 'profile'>(
    'bookings',
  );
  const [showWelcome, setShowWelcome] = useState(justRegistered);

  useEffect(() => {
    if (!justRegistered) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  }, [justRegistered]);

  const [fullName, setFullName] = useState(snapshot.account?.fullName || snapshot.user.name);
  const [phoneNumber, setPhoneNumber] = useState(
    snapshot.account?.phoneNumber || snapshot.user.phone,
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const selectTabFromHash = useCallback(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'payments') setTab('bookings');
    else if (hash === 'notifications') setTab('notifications');
    else if (hash === 'documents') setTab('documents');
    else if (hash === 'profile') setTab('profile');
  }, []);

  useEffect(() => {
    selectTabFromHash();
    window.addEventListener('hashchange', selectTabFromHash);
    return () => window.removeEventListener('hashchange', selectTabFromHash);
  }, [selectTabFromHash]);

  const [payTarget, setPayTarget] = useState<{ id: string; reference: string } | null>(null);

  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  const reservations = snapshot.reservations ?? [];
  const actionablePayable = reservations.filter(
    (r) =>
      r.balanceDue > 0 &&
      !['cancelled', 'checked_out', 'inquiry'].includes(r.status) &&
      r.paymentStage !== 'proof_submitted' &&
      r.paymentStage !== 'under_verification',
  );
  const owed = actionablePayable.reduce((sum, r) => sum + r.balanceDue, 0);
  const quotations = snapshot.quotations ?? [];
  const invoices = snapshot.invoices ?? [];
  const receipts = snapshot.receipts ?? [];
  const receiptsFor = (reservationId: string) =>
    receipts.filter((rc) => rc.reservationId === reservationId);
  const waDigits = snapshot.settings.property.whatsapp.replace(/[^0-9]/g, '');
  const roleLabel =
    snapshot.user.role === 'guest'
      ? 'Guest Account'
      : ROLE_META[snapshot.user.role]?.label || snapshot.user.role;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phoneNumber,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setProfileErr(json.error ?? 'Could not update profile.');
      } else {
        setSnapshot(json.data.snapshot);
        setCurrentPassword('');
        setNewPassword('');
        setProfileMsg('Profile updated.');
      }
    } catch {
      setProfileErr('Network error while saving profile.');
    } finally {
      setProfileBusy(false);
    }
  }

  async function submitCancelRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelTargetId) return;
    setCancelBusy(true);
    setCancelErr(null);
    try {
      const res = await fetch(`/api/reservations/${cancelTargetId}/cancel-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setCancelErr(json.error ?? 'Could not submit cancellation request.');
      } else {
        setSnapshot(json.data.snapshot);
        setCancelTargetId(null);
        setCancelReason('');
      }
    } catch {
      setCancelErr('Network error while submitting cancellation request.');
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="swdl-card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-[0.78rem] font-medium text-swdl-goldDark">{roleLabel}</p>
          <h1 className="mt-0.5 font-heading text-[1.65rem] font-medium text-swdl-navy">
            Welcome, {snapshot.account?.fullName || snapshot.user.name}
          </h1>
          <p className="text-[0.84rem] text-swdl-muted">{snapshot.user.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot.user.role !== 'guest' ? (
            <Link
              href={snapshot.user.role === 'cleaner' ? '/portal/cleaning' : '/admin'}
              className="btn btn-gold py-1.5 text-[0.8rem]"
            >
              Open Staff Workspace
            </Link>
          ) : null}
          <Link href="/apartments" className="btn btn-navy-outline py-1.5 text-[0.8rem]">
            Book a stay
          </Link>
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-navy-outline py-1.5 text-[0.8rem]"
            >
              <MessageCircle size={14} /> WhatsApp reception
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-ghost py-1.5 text-[0.8rem]"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      {showWelcome ? (
        <div className="flex items-start gap-3 rounded-xl border border-st-paid/30 bg-st-paidBg px-4 py-3.5">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-st-paid" />
          <div className="min-w-0">
            <p className="text-[0.88rem] font-semibold text-swdl-navy">
              Your guest account is ready.
            </p>
            <p className="mt-0.5 text-[0.82rem] text-swdl-muted">
              Browse available apartments when you are ready—your bookings, payment references and
              official ZMW receipts will appear here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="ml-auto rounded p-1 text-swdl-muted hover:bg-white/60"
            aria-label="Dismiss"
          >
            <XCircle size={15} />
          </button>
        </div>
      ) : null}

      {owed > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DFE3E8] bg-white px-5 py-4 shadow-swdl">
          <div>
            <p className="text-[0.9rem] font-semibold text-swdl-navy">
              {formatKwacha(owed)} balance remaining across your upcoming stays
            </p>
            <p className="mt-0.5 text-[0.81rem] text-swdl-muted">
              Pay via Airtel Money, MTN Mobile Money, bank transfer or cash, then record the
              reference here for staff verification.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-gold py-2 text-[0.82rem]"
            onClick={() => {
              const target = actionablePayable[0];
              if (target) setPayTarget({ id: target.id, reference: target.reference });
            }}
          >
            <CreditCard size={14} /> Submit payment
          </button>
        </div>
      ) : null}

      {/* Tabs */}
      <div
        id="account-sections"
        className="flex scroll-mt-24 flex-wrap gap-2 border-b border-[#DFE3E8] pb-2"
      >
        {[
          { id: 'bookings', label: `My Stays (${reservations.length})`, icon: CalendarDays },
          {
            id: 'notifications',
            label: `Updates${
              (snapshot.notifications ?? []).filter((n) => !n.readAt).length
                ? ` (${(snapshot.notifications ?? []).filter((n) => !n.readAt).length})`
                : ''
            }`,
            icon: Bell,
          },
          {
            id: 'documents',
            label: `Receipts & Documents (${quotations.length + invoices.length + receipts.length})`,
            icon: FileText,
          },
          { id: 'profile', label: 'Profile & Password', icon: User },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[0.83rem] font-medium transition ${
              tab === t.id
                ? 'bg-swdl-navy text-white'
                : 'text-swdl-muted hover:bg-swdl-light hover:text-swdl-navy'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'notifications' ? (
        <GuestNotifications
          notifications={snapshot.notifications ?? []}
          onChanged={(rows) => setSnapshot((s) => ({ ...s, notifications: rows }))}
        />
      ) : null}

      {/* Tab 1: Bookings */}
      {tab === 'bookings' ? (
        <div className="space-y-4">
          {reservations.length === 0 ? (
            <div className="swdl-card p-10 text-center">
              <p className="font-heading text-[1.2rem] font-medium text-swdl-navy">
                No bookings on your account yet
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-[0.85rem] leading-relaxed text-swdl-muted">
                Compare available apartments and request dates online—no card payment is asked for
                on the website.
              </p>
              <Link href="/apartments" className="btn btn-gold mt-5 inline-flex">
                Explore apartments
              </Link>
            </div>
          ) : (
            reservations.map((r) => {
              const myReceipts = receiptsFor(r.id);
              const isPendingInquiry = r.status === 'inquiry';
              const statusBadge = unifiedBookingStatus(r);
              const claimUnderReview =
                r.paymentStage === 'proof_submitted' || r.paymentStage === 'under_verification';
              const canSubmitPayment =
                r.balanceDue > 0 &&
                !['cancelled', 'checked_out', 'inquiry'].includes(r.status) &&
                !claimUnderReview;
              const canRequestCancel = [
                'inquiry',
                'pending_confirmation',
                'reserved',
                'fully_paid',
              ].includes(r.status);

              return (
                <div key={r.id} className="swdl-card space-y-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[0.82rem] font-bold text-swdl-navy">
                          {r.reference}
                        </span>
                        <span className={`chip ${statusBadge.chip}`}>{statusBadge.label}</span>
                      </div>
                      <h2 className="mt-1.5 font-heading text-[1.22rem] font-medium text-swdl-navy">
                        {r.apartment
                          ? `Apartment ${r.apartment.number} · ${r.apartment.name}`
                          : 'Assigned Apartment'}
                      </h2>
                      <p className="mt-0.5 text-[0.85rem] text-swdl-muted">
                        {formatMediumDate(r.checkIn)} → {formatMediumDate(r.checkOut)} · {r.nights}{' '}
                        {r.nights === 1 ? 'night' : 'nights'}, {r.guestCount}{' '}
                        {r.guestCount === 1 ? 'guest' : 'guests'}
                      </p>
                    </div>

                    <div className="text-left tabular-nums sm:text-right">
                      <p className="text-[0.73rem] text-swdl-muted">Stay total</p>
                      <p className="text-[1.18rem] font-bold text-swdl-navy">
                        {formatKwacha(r.totalAmount)}
                      </p>
                      {r.verifiedPaid > 0 ? (
                        <p className="text-[0.78rem] font-medium text-st-available">
                          Verified paid: {formatKwacha(r.verifiedPaid)}
                        </p>
                      ) : null}
                      {r.pendingVerification > 0 ? (
                        <p className="text-[0.77rem] font-medium text-st-cleaning">
                          Under review: {formatKwacha(r.pendingVerification)}
                        </p>
                      ) : null}
                      {r.balanceDue > 0 && !isPendingInquiry ? (
                        <p className="text-[0.8rem] font-semibold text-swdl-ink">
                          Balance remaining: {formatKwacha(r.balanceDue)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Visual progress bar for active stays */}
                  {statusBadge.step > 0 ? (
                    <ol
                      aria-label="Booking progress"
                      className="grid grid-cols-2 gap-1.5 rounded-lg border border-[#DFE3E8] bg-swdl-light p-2 text-[0.72rem] sm:grid-cols-4"
                    >
                      {[
                        { step: 1, label: '1. Requested' },
                        { step: 2, label: '2. Deposit review' },
                        { step: 3, label: '3. Confirmed' },
                        { step: 4, label: '4. Check-in' },
                      ].map((item) => {
                        const done = statusBadge.step > item.step;
                        const current = statusBadge.step === item.step;
                        return (
                          <li
                            key={item.step}
                            className={`rounded px-2.5 py-1.5 text-center font-medium ${
                              current
                                ? 'bg-navy-900 font-semibold text-white'
                                : done
                                  ? 'bg-white text-st-available ring-1 ring-[#DFE3E8]'
                                  : 'text-swdl-muted'
                            }`}
                          >
                            {item.label}
                            {done ? ' ✓' : ''}
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}

                  <div className="rounded-lg border border-[#DFE3E8] bg-swdl-light/70 px-3.5 py-2.5 text-[0.81rem] leading-relaxed text-swdl-muted">
                    <p>
                      {isPendingInquiry
                        ? 'Enquiry received — reception will confirm dates and open deposit instructions shortly.'
                        : STAGE_NOTE[r.paymentStage] ?? ''}
                    </p>
                    {r.latestClaim ? (
                      <p className="mt-1 text-[0.76rem] text-swdl-muted">
                        Last submission:{' '}
                        <strong className="text-swdl-ink">
                          {r.latestClaim.status === 'rejected' ? 'Declined' : 'Submitted'}{' '}
                          {formatKwacha(r.latestClaim.amount)}
                        </strong>{' '}
                        · ref <span className="font-mono">{r.latestClaim.reference}</span> ·{' '}
                        {new Date(r.latestClaim.createdAt).toLocaleDateString('en-GB')}
                      </p>
                    ) : null}
                    {myReceipts.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {myReceipts.map((rc) => (
                          <Link
                            key={rc.id}
                            href={`/receipt/${rc.id}`}
                            className="inline-flex items-center gap-1 rounded border border-[#DFE3E8] bg-white px-2.5 py-1 text-[0.74rem] font-medium text-swdl-navy hover:border-navy-900"
                          >
                            <Receipt size={12} /> {rc.receiptNumber} · {formatKwacha(rc.amount)}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DFE3E8] pt-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {canSubmitPayment ? (
                        <button
                          type="button"
                          onClick={() => setPayTarget({ id: r.id, reference: r.reference })}
                          className="btn btn-gold py-1.5 text-[0.79rem]"
                        >
                          <CreditCard size={13} />
                          {r.verifiedPaid > 0 ? 'Pay remaining balance' : 'Pay deposit / submit ref'}
                          <span className="tabular-nums">· {formatKwacha(r.balanceDue)}</span>
                        </button>
                      ) : claimUnderReview ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-st-cleaning/30 bg-st-cleaningBg/60 px-3 py-1.5 text-[0.78rem] font-medium text-st-cleaning">
                          <Clock size={13} /> Verification in progress
                        </span>
                      ) : null}
                      {!isPendingInquiry ? (
                        <a
                          href={`/api/documents/confirmation/${r.id}/pdf?download=1`}
                          className="btn btn-navy-outline py-1.5 text-[0.78rem]"
                        >
                          <Download size={13} /> Booking PDF
                        </a>
                      ) : null}
                      {r.quotationId ? (
                        <a
                          href={`/api/documents/quotation/${r.quotationId}/pdf?download=1`}
                          className="btn btn-navy-outline py-1.5 text-[0.78rem]"
                        >
                          <Download size={13} /> Quotation PDF
                        </a>
                      ) : null}
                      {r.invoiceId ? (
                        <a
                          href={`/api/documents/invoice/${r.invoiceId}/pdf?download=1`}
                          className="btn btn-navy-outline py-1.5 text-[0.78rem]"
                        >
                          <Download size={13} /> Invoice PDF
                        </a>
                      ) : null}
                    </div>

                    {canRequestCancel ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelTargetId(r.id);
                          setCancelReason('');
                          setCancelErr(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#DFE3E8] px-3 py-1.5 text-[0.78rem] font-medium text-st-cancelled hover:bg-st-cancelledBg"
                      >
                        <XCircle size={13} /> Request cancellation
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {/* Tab 2: Quotations, Invoices & Verified Receipts */}
      {tab === 'documents' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="swdl-card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-swdl-navy">
              <FileText size={16} className="text-swdl-goldDark" /> Quotations ({quotations.length})
            </h2>
            {quotations.length === 0 ? (
              <p className="text-[0.82rem] text-swdl-muted">No quotations on your account.</p>
            ) : (
              quotations.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-md border border-[#DFE3E8] p-3 text-[0.8rem]"
                >
                  <div>
                    <p className="font-semibold text-swdl-navy">{q.quotationNumber}</p>
                    <p className="text-swdl-muted">
                      {q.apartmentName} · {formatKwacha(q.totalAmount)}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/quotation/${q.id}/pdf?download=1`}
                    className="btn btn-navy-outline px-2.5 py-1 text-[0.75rem]"
                  >
                    <Download size={12} /> PDF
                  </a>
                </div>
              ))
            )}
          </div>

          <div className="swdl-card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-swdl-navy">
              <FileText size={16} className="text-swdl-goldDark" /> Invoices ({invoices.length})
            </h2>
            {invoices.length === 0 ? (
              <p className="text-[0.82rem] text-swdl-muted">No invoices issued yet.</p>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-md border border-[#DFE3E8] p-3 text-[0.8rem]"
                >
                  <div>
                    <p className="font-semibold text-swdl-navy">{inv.invoiceNumber}</p>
                    <p className="text-swdl-muted">
                      Total {formatKwacha(inv.totalAmount)} · Due {formatKwacha(inv.balanceDue)}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/invoice/${inv.id}/pdf?download=1`}
                    className="btn btn-navy-outline px-2.5 py-1 text-[0.75rem]"
                  >
                    <Download size={12} /> PDF
                  </a>
                </div>
              ))
            )}
          </div>

          <div className="swdl-card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-swdl-navy">
              <Receipt size={16} className="text-swdl-goldDark" /> Official Receipts ({receipts.length})
            </h2>
            {receipts.length === 0 ? (
              <p className="text-[0.82rem] text-swdl-muted">
                Official receipts appear automatically once payments are verified.
              </p>
            ) : (
              receipts.map((rc) => (
                <div
                  key={rc.id}
                  className="flex items-center justify-between rounded-md border border-[#DFE3E8] p-3 text-[0.8rem]"
                >
                  <div>
                    <p className="font-semibold text-swdl-navy">{rc.receiptNumber}</p>
                    <p className="font-medium text-st-available">
                      Verified {formatKwacha(rc.amount)} ({formatMediumDate(rc.paidAt)})
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Link
                      href={`/receipt/${rc.id}`}
                      className="btn btn-navy-outline px-2.5 py-1 text-[0.75rem]"
                      title="View or print receipt"
                    >
                      <Receipt size={12} /> View
                    </Link>
                    <a
                      href={`/api/documents/receipt/${rc.id}/pdf?download=1`}
                      className="btn btn-ghost px-2.5 py-1 text-[0.75rem]"
                      title="Download PDF"
                    >
                      <Download size={12} /> PDF
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Tab 3: Profile & Password */}
      {tab === 'profile' ? (
        <form onSubmit={saveProfile} className="swdl-card max-w-xl space-y-4 p-6">
          <h2 className="font-heading text-[1.2rem] font-medium text-swdl-navy">
            Contact details &amp; password
          </h2>
          <div>
            <label className="label mb-1 block" htmlFor="pf-name">
              Full name
            </label>
            <input
              id="pf-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="field"
              required
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="pf-phone">
              Phone / WhatsApp number
            </label>
            <input
              id="pf-phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="field"
              required
            />
          </div>

          <div className="space-y-3 border-t border-[#DFE3E8] pt-4">
            <p className="text-[0.82rem] font-semibold text-swdl-ink">
              Change password (leave blank to keep current password)
            </p>
            <div>
              <label className="label mb-1 block" htmlFor="pf-curpw">
                Current password
              </label>
              <input
                id="pf-curpw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="pf-newpw">
                New password
              </label>
              <input
                id="pf-newpw"
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field"
              />
            </div>
          </div>

          {profileErr ? (
            <p className="flex items-center gap-2 rounded-md bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
              <AlertCircle size={15} /> {profileErr}
            </p>
          ) : null}
          {profileMsg ? (
            <p className="flex items-center gap-2 rounded-md bg-st-availableBg px-3 py-2 text-[0.8rem] text-st-available">
              <CheckCircle2 size={15} /> {profileMsg}
            </p>
          ) : null}

          <button type="submit" disabled={profileBusy} className="btn btn-gold">
            {profileBusy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      ) : null}

      {payTarget ? (
        <GuestPaymentPanel
          reservationId={payTarget.id}
          reference={payTarget.reference}
          onClose={() => setPayTarget(null)}
          onSubmitted={() => router.refresh()}
        />
      ) : null}

      {cancelTargetId ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4">
          <form
            onSubmit={submitCancelRequest}
            className="swdl-card my-auto w-full max-w-md space-y-4 p-5 sm:p-6"
          >
            <h3 className="font-heading text-[1.2rem] font-medium text-swdl-navy">
              Request booking cancellation
            </h3>
            <p className="text-[0.83rem] leading-relaxed text-swdl-muted">
              Your cancellation request is sent directly to reception for review in line with our
              booking terms.
            </p>
            <div>
              <label className="label mb-1 block" htmlFor="cancel-reason">
                Reason for cancellation
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="field"
                placeholder="e.g. Travel dates postponed…"
                required
              />
            </div>
            {cancelErr ? <p className="text-[0.8rem] text-st-cancelled">{cancelErr}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTargetId(null)}
                className="btn btn-navy-outline"
              >
                Keep booking
              </button>
              <button type="submit" disabled={cancelBusy} className="btn btn-gold">
                {cancelBusy ? 'Submitting…' : 'Send request'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
