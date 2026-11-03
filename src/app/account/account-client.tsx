'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
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

export function GuestAccountClient({ initialSnapshot }: { initialSnapshot: SnapshotView }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SnapshotView>(initialSnapshot);
  const [tab, setTab] = useState<'bookings' | 'documents' | 'profile'>('bookings');

  // Profile form state
  const [fullName, setFullName] = useState(snapshot.account?.fullName || snapshot.user.name);
  const [phoneNumber, setPhoneNumber] = useState(snapshot.account?.phoneNumber || snapshot.user.phone);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // Cancellation request modal state
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  const reservations = snapshot.reservations ?? [];
  const quotations = snapshot.quotations ?? [];
  const invoices = snapshot.invoices ?? [];
  const receipts = snapshot.receipts ?? [];
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-sand-200 pb-2">
        {[
          { id: 'bookings', label: `My Bookings (${reservations.length})`, icon: CalendarDays },
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

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-3.5">
                    <div className="flex flex-wrap gap-2">
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
                  <a
                    href={`/api/documents/receipt/${rc.id}/pdf?download=1`}
                    className="btn btn-secondary py-1 px-2.5 text-[0.75rem]"
                  >
                    <Download size={12} /> PDF
                  </a>
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
