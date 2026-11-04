'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
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
import { BOOKING_STATUS_META, PAYMENT_STATUS_META } from '@/lib/domain/status';
import type { PaymentStage } from '@/lib/domain/types';
import { formatKwacha } from '@/lib/domain/money';
import { GuestNotifications } from './guest-notifications';
import { GuestPaymentPanel } from './guest-payment-panel';

/**
 * The six payment words promised to the guest, with the tone each one deserves.
 * "Proof submitted" is deliberately not green: nothing has been verified yet.
 */
const STAGE_META: Record<PaymentStage, { label: string; chip: string; note: string }> = {
  awaiting_payment: {
    label: 'Awaiting payment',
    chip: 'bg-st-cancelledBg text-st-cancelled',
    note: 'No payment has been verified for this stay yet.',
  },
  proof_submitted: {
    label: 'Proof submitted',
    chip: 'bg-sand-100 text-navy-700',
    note: 'We have your receipt — reception has not opened it yet.',
  },
  under_verification: {
    label: 'Under verification',
    chip: 'bg-st-cleaningBg text-st-cleaning',
    note: 'Reception is matching your payment against the statement.',
  },
  part_paid: {
    label: 'Part paid',
    chip: 'bg-st-reservedBg text-st-reserved',
    note: 'Part of the stay is settled; the remaining balance is below.',
  },
  approved: {
    label: 'Approved',
    chip: 'bg-st-availableBg text-st-available',
    note: 'Verified. Your receipt is available to view, print or download.',
  },
  rejected: {
    label: 'Payment rejected',
    chip: 'bg-st-cancelledBg text-st-cancelled',
    note: 'The last proof could not be matched. Submit a corrected reference or call reception.',
  },
};

export function GuestAccountClient({
  initialSnapshot,
  justRegistered = false,
}: {
  initialSnapshot: SnapshotView;
  justRegistered?: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SnapshotView>(initialSnapshot);
  const [tab, setTab] = useState<'bookings' | 'notifications' | 'documents' | 'profile'>('bookings');
  // The sign-up redirect carries ?welcome=1. Acknowledge it once, then take it out of the
  // address bar so a refresh or a bookmark does not replay the greeting.
  const [showWelcome, setShowWelcome] = useState(justRegistered);
  useEffect(() => {
    if (!justRegistered) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  }, [justRegistered]);

  // Profile form state
  const [fullName, setFullName] = useState(snapshot.account?.fullName || snapshot.user.name);
  const [phoneNumber, setPhoneNumber] = useState(snapshot.account?.phoneNumber || snapshot.user.phone);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  /**
   * Links elsewhere on the site address account sections by hash (`/account#payments`
   * from the site menu, `/account#notifications` from the header bell). The sections
   * are tabs rather than anchor targets, so the hash decides which tab opens; a hash
   * that maps to nothing simply leaves the default tab in place.
   */
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

  // Payment submission modal
  const [payTarget, setPayTarget] = useState<{ id: string; reference: string } | null>(null);

  // Cancellation request modal state
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  const reservations = snapshot.reservations ?? [];
  const owed = reservations
    .filter((r) => r.balanceDue > 0 && !['cancelled', 'checked_out'].includes(r.status))
    .reduce((sum, r) => sum + r.balanceDue, 0);
  const quotations = snapshot.quotations ?? [];
  const invoices = snapshot.invoices ?? [];
  const receipts = snapshot.receipts ?? [];
  const receiptsFor = (reservationId: string) => receipts.filter((rc) => rc.reservationId === reservationId);
  const waDigits = snapshot.settings.property.whatsapp.replace(/[^0-9]/g, '');

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
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
            Guest Portal · {snapshot.user.role.replace(/_/g, ' ')}
          </p>
          <h1 className="mt-1 text-[1.55rem] font-bold text-navy-900">
            Welcome, {snapshot.account?.fullName || snapshot.user.name}
          </h1>
          <p className="text-[0.84rem] text-navy-500">{snapshot.user.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {snapshot.user.role !== 'guest' ? (
            <Link
              href={snapshot.user.role === 'cleaner' ? '/portal/cleaning' : '/admin'}
              className="btn btn-primary py-1.5 text-[0.8rem]"
            >
              Open Staff Workspace
            </Link>
          ) : null}
          <Link href="/apartments" className="btn btn-secondary py-1.5 text-[0.8rem]">
            New Booking
          </Link>
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary py-1.5 text-[0.8rem]"
            >
              <MessageCircle size={14} /> Contact Reception
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-secondary py-1.5 text-[0.8rem]"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      {showWelcome ? (
        <div className="flex items-start gap-3 rounded-lg border border-st-paid/30 bg-st-paidBg px-4 py-3">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-st-paid" />
          <div className="min-w-0">
            <p className="text-[0.88rem] font-semibold text-navy-900">
              Your account is ready.
            </p>
            <p className="mt-0.5 text-[0.82rem] text-navy-600">
              You are signed in. Browse the apartments when you are ready to book; your
              stays, payments and documents will collect here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="ml-auto rounded p-1 text-navy-400 hover:bg-white/60"
            aria-label="Dismiss"
          >
            <XCircle size={15} />
          </button>
        </div>
      ) : null}

      {owed > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sand-300 bg-sand-50 px-4 py-3">
          <div>
            <p className="text-[0.86rem] font-semibold text-navy-900">
              {formatKwacha(owed)} outstanding on your stay
            </p>
            <p className="mt-0.5 text-[0.8rem] text-navy-600">
              Pay by Airtel Money, MTN Mobile Money, bank transfer or cash, then record it here so
              reception can check it. Your balance updates once it is confirmed.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary py-2 text-[0.82rem]"
            onClick={() => {
              const target = reservations.find(
                (r) => r.balanceDue > 0 && !['cancelled', 'checked_out'].includes(r.status),
              );
              if (target) setPayTarget({ id: target.id, reference: target.reference });
            }}
          >
            <CreditCard size={14} /> Pay now
          </button>
        </div>
      ) : null}

      {/* Tabs */}
      <div id="account-sections" className="flex scroll-mt-24 flex-wrap gap-2 border-b border-sand-200 pb-2">
        {[
          { id: 'bookings', label: `My Bookings (${reservations.length})`, icon: CalendarDays },
          {
            id: 'notifications',
            label: `Notifications${
              (snapshot.notifications ?? []).filter((n) => !n.readAt).length
                ? ` (${(snapshot.notifications ?? []).filter((n) => !n.readAt).length})`
                : ''
            }`,
            icon: Bell,
          },
          {
            id: 'documents',
            label: `Quotations, Invoices & Receipts (${quotations.length + invoices.length + receipts.length})`,
            icon: FileText,
          },
          { id: 'profile', label: 'Profile & Security', icon: User },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[0.83rem] font-medium transition ${
              tab === t.id
                ? 'bg-navy-900 text-white'
                : 'text-navy-600 hover:bg-sand-100 hover:text-navy-900'
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
            <div className="card p-8 text-center">
              <p className="text-[0.95rem] font-medium text-navy-800">
                You do not have any bookings yet.
              </p>
              <p className="mt-1 text-[0.84rem] text-navy-500">
                Browse our available Lusaka serviced apartments to reserve your stay.
              </p>
              <Link href="/apartments" className="btn btn-primary mt-4 inline-flex">
                Browse Apartments
              </Link>
            </div>
          ) : (
            reservations.map((r) => {
              const myReceipts = receiptsFor(r.id);
              const bMeta = BOOKING_STATUS_META[r.status];
              const pMeta = PAYMENT_STATUS_META[r.paymentStatus];
              const canRequestCancel = ['inquiry', 'pending_confirmation', 'reserved', 'fully_paid'].includes(
                r.status,
              );
              return (
                <div key={r.id} className="card p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[0.82rem] font-bold text-navy-900">
                          {r.reference}
                        </span>
                        <span className={`chip ${bMeta?.chip ?? ''}`}>
                          {bMeta?.label ?? r.status}
                        </span>
                        <span className={`chip ${pMeta?.chip ?? ''}`}>
                          {pMeta?.label ?? r.paymentStatus}
                        </span>
                        <span className={`chip ${STAGE_META[r.paymentStage]?.chip ?? ''}`}>
                          {STAGE_META[r.paymentStage]?.label ?? r.paymentStage}
                        </span>
                      </div>
                      <h2 className="mt-1.5 text-[1.1rem] font-semibold text-navy-900">
                        {r.apartment
                          ? `Apartment ${r.apartment.number} · ${r.apartment.name}`
                          : 'Assigned Apartment'}
                      </h2>
                      <p className="text-[0.84rem] text-navy-600">
                        Check-in <strong>{r.checkIn}</strong> · Check-out <strong>{r.checkOut}</strong>{' '}
                        ({r.nights} {r.nights === 1 ? 'night' : 'nights'}, {r.guestCount}{' '}
                        {r.guestCount === 1 ? 'guest' : 'guests'})
                      </p>
                    </div>

                    <div className="text-right tabular-nums">
                      <p className="text-[0.74rem] uppercase tracking-[0.1em] text-navy-500">
                        Stay Total
                      </p>
                      <p className="text-[1.15rem] font-bold text-navy-900">
                        K{r.totalAmount.toLocaleString('en-US')}
                      </p>
                      <p className="text-[0.78rem] text-st-available">
                        Verified Paid: K{r.verifiedPaid.toLocaleString('en-US')}
                      </p>
                      {r.pendingVerification > 0 ? (
                        <p className="text-[0.76rem] text-st-cleaning">
                          Pending Verification: K{r.pendingVerification.toLocaleString('en-US')}
                        </p>
                      ) : null}
                      {r.balanceDue > 0 ? (
                        <p className="text-[0.8rem] font-semibold text-navy-800">
                          Balance Due: K{r.balanceDue.toLocaleString('en-US')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md border border-sand-200 bg-sand-50/70 px-3 py-2 text-[0.79rem] leading-relaxed text-navy-700">
                    <p>{STAGE_META[r.paymentStage]?.note ?? ''}</p>
                    {r.latestClaim ? (
                      <p className="mt-0.5 text-[0.75rem] text-navy-500">
                        {r.latestClaim.status === 'rejected' ? 'Declined' : 'Submitted'}{' '}
                        {formatKwacha(r.latestClaim.amount)} · ref{' '}
                        <span className="font-mono">{r.latestClaim.reference}</span> ·{' '}
                        {new Date(r.latestClaim.createdAt).toLocaleDateString('en-GB')}
                      </p>
                    ) : null}
                    {myReceipts.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {myReceipts.map((rc) => (
                          <a
                            key={rc.id}
                            href={`/api/documents/receipt/${rc.id}/pdf?download=1`}
                            className="inline-flex items-center gap-1 rounded border border-sand-300 bg-white px-2 py-1 text-[0.72rem] font-medium text-navy-800 hover:border-navy-900"
                          >
                            <Receipt size={11} /> {rc.receiptNumber} · {formatKwacha(rc.amount)}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-3.5">
                    <div className="flex flex-wrap gap-2">
                      {r.balanceDue > 0 && !['cancelled', 'checked_out'].includes(r.status) ? (
                        <button
                          type="button"
                          onClick={() => setPayTarget({ id: r.id, reference: r.reference })}
                          className="btn btn-primary py-1.5 text-[0.78rem]"
                        >
                          <CreditCard size={13} />
                          {r.verifiedPaid > 0 ? 'Pay the balance' : 'Pay deposit'}
                          <span className="tabular-nums">· {formatKwacha(r.balanceDue)}</span>
                        </button>
                      ) : null}
                      <a
                        href={`/api/documents/confirmation/${r.id}/pdf?download=1`}
                        className="btn btn-secondary py-1.5 text-[0.78rem]"
                      >
                        <Download size={13} /> Booking Confirmation PDF
                      </a>
                      {r.quotationId ? (
                        <a
                          href={`/api/documents/quotation/${r.quotationId}/pdf?download=1`}
                          className="btn btn-secondary py-1.5 text-[0.78rem]"
                        >
                          <Download size={13} /> Quotation PDF
                        </a>
                      ) : null}
                      {r.invoiceId ? (
                        <a
                          href={`/api/documents/invoice/${r.invoiceId}/pdf?download=1`}
                          className="btn btn-secondary py-1.5 text-[0.78rem]"
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
                        className="inline-flex items-center gap-1.5 rounded-md border border-sand-300 px-3 py-1.5 text-[0.78rem] font-medium text-st-cancelled hover:bg-st-cancelledBg"
                      >
                        <XCircle size={13} /> Request Cancellation
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
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-navy-900">
              <FileText size={16} className="text-lemma-dark" /> Quotations ({quotations.length})
            </h2>
            {quotations.length === 0 ? (
              <p className="text-[0.82rem] text-navy-500">No quotations on your account.</p>
            ) : (
              quotations.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-md border border-sand-200 p-3 text-[0.8rem]"
                >
                  <div>
                    <p className="font-semibold text-navy-900">{q.quotationNumber}</p>
                    <p className="text-navy-500">
                      {q.apartmentName} · K{q.totalAmount.toLocaleString('en-US')}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/quotation/${q.id}/pdf?download=1`}
                    className="btn btn-secondary py-1 px-2.5 text-[0.75rem]"
                  >
                    <Download size={12} /> PDF
                  </a>
                </div>
              ))
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-navy-900">
              <FileText size={16} className="text-lemma-dark" /> Invoices ({invoices.length})
            </h2>
            {invoices.length === 0 ? (
              <p className="text-[0.82rem] text-navy-500">No invoices issued yet.</p>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-md border border-sand-200 p-3 text-[0.8rem]"
                >
                  <div>
                    <p className="font-semibold text-navy-900">{inv.invoiceNumber}</p>
                    <p className="text-navy-500">
                      Total K{inv.totalAmount.toLocaleString('en-US')} · Due K
                      {inv.balanceDue.toLocaleString('en-US')}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/invoice/${inv.id}/pdf?download=1`}
                    className="btn btn-secondary py-1 px-2.5 text-[0.75rem]"
                  >
                    <Download size={12} /> PDF
                  </a>
                </div>
              ))
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-navy-900">
              <Receipt size={16} className="text-lemma-dark" /> Official Receipts ({receipts.length})
            </h2>
            {receipts.length === 0 ? (
              <p className="text-[0.82rem] text-navy-500">
                Official receipts appear automatically once payments are verified.
              </p>
            ) : (
              receipts.map((rc) => (
                <div
                  key={rc.id}
                  className="flex items-center justify-between rounded-md border border-sand-200 p-3 text-[0.8rem]"
                >
                  <div>
                    <p className="font-semibold text-navy-900">{rc.receiptNumber}</p>
                    <p className="text-st-available font-medium">
                      Verified K{rc.amount.toLocaleString('en-US')} ({rc.paidAt})
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Link
                      href={`/receipt/${rc.id}`}
                      className="btn btn-secondary py-1 px-2.5 text-[0.75rem]"
                      title="View, print or download this receipt"
                    >
                      <Receipt size={12} /> View
                    </Link>
                    <a
                      href={`/api/documents/receipt/${rc.id}/pdf?download=1`}
                      className="btn btn-ghost py-1 px-2.5 text-[0.75rem]"
                      title="Download the PDF"
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
        <form onSubmit={saveProfile} className="card max-w-xl space-y-4 p-6">
          <h2 className="text-[1.08rem] font-semibold text-navy-900">
            Update Contact Profile &amp; Password
          </h2>
          <div>
            <label className="label mb-1 block" htmlFor="pf-name">
              Full Name
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
              Phone / WhatsApp Number
            </label>
            <input
              id="pf-phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="field"
              required
            />
          </div>

          <div className="border-t border-sand-200 pt-4 space-y-3">
            <p className="text-[0.82rem] font-semibold text-navy-800">
              Change Password (leave blank to keep current password)
            </p>
            <div>
              <label className="label mb-1 block" htmlFor="pf-curpw">
                Current Password
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
                New Password
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

          <button type="submit" disabled={profileBusy} className="btn btn-primary">
            {profileBusy ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      ) : null}

      {/* Cancellation Request Modal */}
      {payTarget ? (
        <GuestPaymentPanel
          reservationId={payTarget.id}
          reference={payTarget.reference}
          onClose={() => setPayTarget(null)}
          onSubmitted={() => router.refresh()}
        />
      ) : null}

      {cancelTargetId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
          <form onSubmit={submitCancelRequest} className="card w-full max-w-md space-y-4 p-6">
            <h3 className="text-[1.08rem] font-semibold text-navy-900">
              Request Booking Cancellation
            </h3>
            <p className="text-[0.82rem] text-navy-600">
              Your cancellation request will be sent to reception for review in accordance with our
              stay policy.
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
                placeholder="e.g. Travel dates postponed by company..."
                required
              />
            </div>
            {cancelErr ? (
              <p className="text-[0.8rem] text-st-cancelled">{cancelErr}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTargetId(null)}
                className="btn btn-secondary"
              >
                Keep Booking
              </button>
              <button type="submit" disabled={cancelBusy} className="btn btn-primary">
                {cancelBusy ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
