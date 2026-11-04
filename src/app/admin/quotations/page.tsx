'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CalendarPlus,
  Copy,
  Download,
  FilePlus2,
  Mail,
  Receipt,
  Search,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { calculateStayPricing } from '@/lib/domain/pricing';
import { addISO } from '@/lib/domain/dates';

export default function AdminQuotationsPage() {
  const { snapshot, request, toast, can, busy } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form state
  const firstApt = snapshot?.apartments[0]?.id ?? '';
  const today = snapshot?.today ?? '2026-11-03';
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+260 ');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [apartmentId, setApartmentId] = useState(firstApt);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addISO(today, 3));
  const [guestCount, setGuestCount] = useState(2);
  const [discount, setDiscount] = useState(0);
  const [validityDays, setValidityDays] = useState(7);
  const [notes, setNotes] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const selectedApt = useMemo(
    () => snapshot?.apartments.find((a) => a.id === (apartmentId || firstApt)) ?? null,
    [snapshot?.apartments, apartmentId, firstApt],
  );

  const livePreview = useMemo(() => {
    if (!selectedApt || !snapshot) return null;
    return calculateStayPricing({
      apartment: selectedApt,
      settings: snapshot.settings,
      checkIn,
      checkOut,
      guestCount,
      manualDiscount: discount,
      selectedServiceIds,
    });
  }, [selectedApt, snapshot, checkIn, checkOut, guestCount, discount, selectedServiceIds]);

  if (!snapshot) return null;

  const quotations = (snapshot.quotations ?? []).filter((q) => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const needle = searchQuery.toLowerCase();
      return (
        q.quotationNumber.toLowerCase().includes(needle) ||
        q.customerName.toLowerCase().includes(needle) ||
        q.customerCompany.toLowerCase().includes(needle) ||
        q.apartmentName.toLowerCase().includes(needle)
      );
    }
    return true;
  });

  const pageSize = 20;
  const paged = quotations.slice(0, page * pageSize);
  const canManage = can('quotations.manage');

  async function handleCreateQuotation(e: React.FormEvent) {
    e.preventDefault();
    await request('/api/quotations', {
      method: 'POST',
      data: {
        idempotencyKey: `ui-${Date.now()}-${customerPhone}`,
        customerName,
        customerPhone,
        customerEmail,
        customerCompany,
        apartmentId: apartmentId || firstApt,
        checkIn,
        checkOut,
        guestCount,
        discount,
        validityDays,
        selectedServiceIds,
        notes,
      },
    });
    toast({ tone: 'success', title: 'Quotation generated', body: 'Official ZMW quotation saved and ready for PDF download.' });
    setCreateOpen(false);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerCompany('');
    setNotes('');
  }

  async function runQuotationAction(
    id: string,
    action: 'convert_to_booking' | 'convert_to_invoice' | 'send_email',
  ) {
    const res = await request<{
      reservation?: { reference: string };
      invoice?: { invoiceNumber: string };
      sent?: boolean;
      detail?: string;
    }>(`/api/quotations/${id}`, {
      method: 'POST',
      data: { action },
    });
    if (action === 'convert_to_booking') {
      toast({
        tone: 'success',
        title: 'Converted to Booking',
        body: `Confirmed reservation ${res.reservation?.reference ?? ''} created.`,
      });
    } else if (action === 'convert_to_invoice') {
      toast({
        tone: 'success',
        title: 'Invoice Generated',
        body: `Invoice ${res.invoice?.invoiceNumber ?? ''} created from quotation.`,
      });
    } else {
      toast({
        tone: res.sent ? 'success' : 'info',
        title: res.sent ? 'Quotation Emailed' : 'Share Link Ready',
        body: res.detail || 'Email provider status recorded.',
      });
    }
  }

  function copyShareLink(id: string, shareToken: string) {
    const url = `${window.location.origin}/api/documents/quotation/${id}/pdf?token=${encodeURIComponent(shareToken)}`;
    navigator.clipboard?.writeText(url);
    toast({ tone: 'success', title: 'PDF Share Link Copied', body: url });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
            Commercial Documents
          </p>
          <h1 className="text-[1.45rem] font-bold text-navy-900">Quotations</h1>
          <p className="text-[0.83rem] text-navy-500">
            Generate official ZMW quotations, download branded PDFs, and convert directly into
            confirmed reservations or tax invoices.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="btn btn-primary"
          >
            <FilePlus2 size={15} /> New Quotation
          </button>
        ) : null}
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search QUO number, customer, company, or apartment..."
            className="field pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="field w-auto"
        >
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="converted">Converted</option>
          <option value="expired">Expired</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      {/* Quotations Table */}
      <div className="card responsive-table-container overflow-x-auto">
        <table className="responsive-table w-full text-left text-[0.83rem]">
          <thead className="border-b border-sand-200 bg-sand-50 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
            <tr>
              <th className="px-4 py-3">Quotation #</th>
              <th className="px-4 py-3">Customer / Organisation</th>
              <th className="px-4 py-3">Apartment &amp; Stay</th>
              <th className="px-4 py-3">Valid Until</th>
              <th className="px-4 py-3 text-right">Total (ZMW)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-navy-500">
                  No quotations match the current filter.
                </td>
              </tr>
            ) : (
              paged.map((q) => (
                <tr key={q.id} className="hover:bg-sand-50/70">
                  <td data-label="Quotation #" className="px-4 py-3.5 font-mono font-semibold text-navy-900">
                    {q.quotationNumber}
                  </td>
                  <td data-label="Customer / Organisation" className="px-4 py-3.5">
                    <div className="font-semibold text-navy-900">{q.customerName}</div>
                    <div className="text-[0.75rem] text-navy-500">
                      {q.customerCompany ? `${q.customerCompany} · ` : ''}
                      {q.customerPhone}
                    </div>
                  </td>
                  <td data-label="Apartment & Stay" className="px-4 py-3.5">
                    <div className="font-medium text-navy-800">
                      Apt {q.apartmentNumber} · {q.apartmentName}
                    </div>
                    <div className="text-[0.75rem] text-navy-500">
                      {q.checkIn} → {q.checkOut} ({q.nights}n · {q.guestCount}g)
                    </div>
                  </td>
                  <td data-label="Valid Until" className="px-4 py-3.5 text-navy-600 tabular-nums">{q.expiryDate}</td>
                  <td data-label="Total (ZMW)" className="px-4 py-3.5 text-right font-bold text-navy-900 tabular-nums">
                    K{q.totalAmount.toLocaleString('en-US')}
                  </td>
                  <td data-label="Status" className="px-4 py-3.5">
                    <span className="chip bg-sand-100 text-navy-700 ring-1 ring-sand-300 uppercase">
                      {q.status}
                    </span>
                  </td>
                  <td data-label="Actions" className="px-4 py-3.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <a
                        href={`/api/documents/quotation/${q.id}/pdf?download=1`}
                        className="btn btn-secondary px-2.5 py-1 text-[0.75rem]"
                        title="Download Quotation PDF"
                      >
                        <Download size={13} /> PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => copyShareLink(q.id, q.shareToken)}
                        className="btn btn-secondary px-2.5 py-1 text-[0.75rem]"
                        title="Copy Shareable PDF Link"
                      >
                        <Copy size={13} />
                      </button>
                      {canManage && q.customerEmail ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runQuotationAction(q.id, 'send_email')}
                          className="btn btn-secondary px-2.5 py-1 text-[0.75rem]"
                          title="Email Quotation"
                        >
                          <Mail size={13} />
                        </button>
                      ) : null}
                      {canManage && !q.reservationId ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runQuotationAction(q.id, 'convert_to_booking')}
                          className="btn btn-secondary px-2.5 py-1 text-[0.75rem]"
                          title="Convert to Reservation"
                        >
                          <CalendarPlus size={13} /> To Booking
                        </button>
                      ) : null}
                      {canManage && !q.invoiceId ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runQuotationAction(q.id, 'convert_to_invoice')}
                          className="btn btn-primary px-2.5 py-1 text-[0.75rem]"
                          title="Convert to Tax Invoice"
                        >
                          <Receipt size={13} /> To Invoice
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {quotations.length > paged.length ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-secondary"
          >
            <ArrowRightLeft size={14} /> Load next 20 quotations
          </button>
        </div>
      ) : null}

      {/* Create Quotation Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4">
          <form
            onSubmit={handleCreateQuotation}
            className="card my-auto w-full max-w-2xl space-y-4 p-4 sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-sand-200 pb-3">
              <h2 className="text-[1.15rem] font-bold text-navy-900">Generate ZMW Quotation</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="text-[0.8rem] text-navy-500 hover:text-navy-900"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label mb-1 block">Customer Full Name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block">Company / Organisation (optional)</label>
                <input
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label mb-1 block">Phone / WhatsApp</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block">Email Address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="field"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="label mb-1 block">Apartment</label>
                <select
                  value={apartmentId || firstApt}
                  onChange={(e) => setApartmentId(e.target.value)}
                  className="field"
                >
                  {snapshot.apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      Apt {a.number} · {a.name} (K{a.nightlyRate.toLocaleString('en-US')}/night · max{' '}
                      {a.maxGuests})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label mb-1 block">Check-in</label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block">Check-out</label>
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block">Guests</label>
                <input
                  type="number"
                  min={1}
                  max={selectedApt?.maxGuests ?? 8}
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  className="field"
                  required
                />
              </div>
            </div>

            {selectedApt?.optionalServices?.length ? (
              <div className="space-y-1.5">
                <p className="label">Optional Add-on Services</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selectedApt.optionalServices
                    .filter((s) => s.active)
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center justify-between rounded border border-sand-200 px-3 py-2 text-[0.8rem]"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedServiceIds.includes(s.id)}
                            onChange={() =>
                              setSelectedServiceIds((prev) =>
                                prev.includes(s.id)
                                  ? prev.filter((x) => x !== s.id)
                                  : [...prev, s.id],
                              )
                            }
                          />
                          {s.name}
                        </span>
                        <span className="font-semibold">K{s.price.toLocaleString('en-US')}</span>
                      </label>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label mb-1 block">Manual Discount (ZMW)</label>
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="field"
                />
              </div>
              <div>
                <label className="label mb-1 block">Validity (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label mb-1 block">Notes / Special Terms</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="field"
              />
            </div>

            {livePreview && livePreview.nights > 0 ? (
              <div className="rounded-md bg-sand-50 p-3.5 text-[0.82rem] tabular-nums space-y-1">
                <div className="flex justify-between">
                  <span>
                    {livePreview.nights} night(s) @ avg K
                    {livePreview.effectiveAverageRate.toLocaleString('en-US')}
                  </span>
                  <span>K{livePreview.roomSubtotal.toLocaleString('en-US')}</span>
                </div>
                {livePreview.servicesTotal > 0 ? (
                  <div className="flex justify-between">
                    <span>Add-on Services</span>
                    <span>K{livePreview.servicesTotal.toLocaleString('en-US')}</span>
                  </div>
                ) : null}
                {livePreview.totalDiscount > 0 ? (
                  <div className="flex justify-between text-st-available">
                    <span>Total Discount</span>
                    <span>- K{livePreview.totalDiscount.toLocaleString('en-US')}</span>
                  </div>
                ) : null}
                {livePreview.taxRatePercent > 0 ? (
                  <div className="flex justify-between">
                    <span>
                      {livePreview.taxName} ({livePreview.taxRatePercent}%{' '}
                      {livePreview.taxInclusive ? 'incl.' : 'excl.'})
                    </span>
                    <span>K{livePreview.taxAmount.toLocaleString('en-US')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-sand-200 pt-1.5 font-bold text-navy-900">
                  <span>Total Quotation (ZMW)</span>
                  <span>K{livePreview.totalAmount.toLocaleString('en-US')}</span>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? 'Generating...' : 'Generate Quotation'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
