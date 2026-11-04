'use client';

import { useState } from 'react';
import { Download, FileCheck2, FilePlus2, Receipt, Search } from 'lucide-react';
import { useApp } from '@/components/providers/app';

export default function AdminInvoicesPage() {
  const { snapshot, request, toast, can, busy } = useApp();
  const [tab, setTab] = useState<'invoices' | 'receipts'>('invoices');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const [reservationId, setReservationId] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerTpin, setCustomerTpin] = useState('');
  const [notes, setNotes] = useState('');

  if (!snapshot) return null;

  const canManage = can('invoices.manage');
  const eligibleBookings = (snapshot.reservations ?? []).filter(
    (r) => r.status !== 'cancelled' && !r.invoiceId,
  );

  const invoices = (snapshot.invoices ?? []).filter((inv) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      inv.customerCompany.toLowerCase().includes(q)
    );
  });

  const receipts = (snapshot.receipts ?? []).filter((rc) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      rc.receiptNumber.toLowerCase().includes(q) ||
      rc.customerName.toLowerCase().includes(q) ||
      rc.bookingReference.toLowerCase().includes(q)
    );
  });

  async function handleGenerateInvoice(e: React.FormEvent) {
    e.preventDefault();
    const targetId = reservationId || eligibleBookings[0]?.id;
    if (!targetId) return;
    const res = await request<{ invoice: { invoiceNumber: string } }>('/api/invoices', {
      method: 'POST',
      data: {
        reservationId: targetId,
        customerCompany,
        customerTpin,
        notes,
      },
    });
    toast({
      tone: 'success',
      title: 'Invoice Issued',
      body: `Invoice ${res.invoice.invoiceNumber} generated and linked to the reservation.`,
    });
    setCreateOpen(false);
    setCustomerCompany('');
    setCustomerTpin('');
    setNotes('');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
            Commercial Accounting
          </p>
          <h1 className="text-[1.45rem] font-bold text-navy-900">
            Invoices &amp; Official Receipts
          </h1>
          <p className="text-[0.83rem] text-navy-500">
            Issue ZMW invoices from confirmed reservations and download official receipts for
            verified payments.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setReservationId(eligibleBookings[0]?.id ?? '');
              setCreateOpen(true);
            }}
            className="btn btn-primary"
          >
            <FilePlus2 size={15} /> Issue Invoice from Booking
          </button>
        ) : null}
      </div>

      {/* Tabs + Search */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('invoices')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[0.82rem] font-medium ${
              tab === 'invoices' ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-sand-100'
            }`}
          >
            <Receipt size={14} /> Invoices ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('receipts')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[0.82rem] font-medium ${
              tab === 'receipts' ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-sand-100'
            }`}
          >
            <FileCheck2 size={14} /> Official Verified Receipts ({receipts.length})
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search document number or customer..."
            className="field pl-8"
          />
        </div>
      </div>

      {tab === 'invoices' ? (
        <div className="card responsive-table-container overflow-x-auto">
          <table className="responsive-table w-full text-left text-[0.83rem]">
            <thead className="border-b border-sand-200 bg-sand-50 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Billed To</th>
                <th className="px-4 py-3">Stay</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Verified Paid</th>
                <th className="px-4 py-3 text-right">Balance Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-navy-500">
                    No invoices issued yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-sand-50/70">
                    <td data-label="Invoice #" className="px-4 py-3.5 font-mono font-semibold text-navy-900">
                      {inv.invoiceNumber}
                    </td>
                    <td data-label="Billed To" className="px-4 py-3.5">
                      <div className="font-semibold text-navy-900">{inv.customerName}</div>
                      <div className="text-[0.75rem] text-navy-500">
                        {inv.customerCompany || inv.customerPhone}
                        {inv.customerTpin ? ` · TPIN ${inv.customerTpin}` : ''}
                      </div>
                    </td>
                    <td data-label="Stay" className="px-4 py-3.5 text-navy-600">
                      <div>{inv.apartmentName}</div>
                      <div className="text-[0.74rem] text-navy-500">
                        {inv.checkIn} → {inv.checkOut}
                      </div>
                    </td>
                    <td data-label="Total" className="px-4 py-3.5 text-right font-semibold tabular-nums">
                      K{inv.totalAmount.toLocaleString('en-US')}
                    </td>
                    <td data-label="Verified Paid" className="px-4 py-3.5 text-right text-st-available font-medium tabular-nums">
                      K{inv.verifiedPaid.toLocaleString('en-US')}
                    </td>
                    <td data-label="Balance Due" className="px-4 py-3.5 text-right font-bold text-navy-900 tabular-nums">
                      K{inv.balanceDue.toLocaleString('en-US')}
                    </td>
                    <td data-label="Status" className="px-4 py-3.5">
                      <span
                        className={`chip uppercase ${
                          inv.status === 'paid'
                            ? 'bg-st-availableBg text-st-available'
                            : inv.status === 'partially_paid'
                              ? 'bg-st-cleaningBg text-st-cleaning'
                              : 'bg-st-cancelledBg text-st-cancelled'
                        }`}
                      >
                        {inv.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td data-label="PDF" className="px-4 py-3.5 text-right">
                      <a
                        href={`/api/documents/invoice/${inv.id}/pdf?download=1`}
                        className="btn btn-secondary px-2.5 py-1 text-[0.75rem]"
                      >
                        <Download size={13} /> PDF
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card responsive-table-container overflow-x-auto">
          <table className="responsive-table w-full text-left text-[0.83rem]">
            <thead className="border-b border-sand-200 bg-sand-50 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
              <tr>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Booking Ref</th>
                <th className="px-4 py-3">Method &amp; Ref</th>
                <th className="px-4 py-3">Verified By</th>
                <th className="px-4 py-3 text-right">Amount (ZMW)</th>
                <th className="px-4 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-navy-500">
                    Official receipts are issued automatically when payments are verified.
                  </td>
                </tr>
              ) : (
                receipts.map((rc) => (
                  <tr key={rc.id} className="hover:bg-sand-50/70">
                    <td data-label="Receipt #" className="px-4 py-3.5 font-mono font-semibold text-navy-900">
                      {rc.receiptNumber}
                    </td>
                    <td data-label="Guest" className="px-4 py-3.5 font-medium text-navy-900">{rc.customerName}</td>
                    <td data-label="Booking Ref" className="px-4 py-3.5 font-mono text-[0.78rem] text-navy-600">
                      {rc.bookingReference}
                    </td>
                    <td data-label="Method & Ref" className="px-4 py-3.5 text-navy-600">
                      <span className="uppercase">{rc.method.replace(/_/g, ' ')}</span> ·{' '}
                      {rc.transactionReference}
                    </td>
                    <td data-label="Verified By" className="px-4 py-3.5 text-navy-600">
                      {rc.verifiedBy} ({rc.paidAt})
                    </td>
                    <td data-label="Amount (ZMW)" className="px-4 py-3.5 text-right font-bold text-st-available tabular-nums">
                      K{rc.amount.toLocaleString('en-US')}
                    </td>
                    <td data-label="PDF" className="px-4 py-3.5 text-right">
                      <a
                        href={`/api/documents/receipt/${rc.id}/pdf?download=1`}
                        className="btn btn-secondary px-2.5 py-1 text-[0.75rem]"
                      >
                        <Download size={13} /> Receipt PDF
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4">
          <form onSubmit={handleGenerateInvoice} className="card my-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
            <h2 className="text-[1.1rem] font-bold text-navy-900">
              Generate Invoice from Reservation
            </h2>
            {eligibleBookings.length === 0 ? (
              <p className="text-[0.84rem] text-navy-600">
                Every active booking already has an issued invoice.
              </p>
            ) : (
              <>
                <div>
                  <label className="label mb-1 block">Select Booking</label>
                  <select
                    value={reservationId}
                    onChange={(e) => setReservationId(e.target.value)}
                    className="field"
                  >
                    {eligibleBookings.slice(0, 50).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.reference} · {b.guest?.fullName ?? 'Guest'} · K
                        {b.totalAmount.toLocaleString('en-US')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label mb-1 block">Company Name (optional)</label>
                    <input
                      value={customerCompany}
                      onChange={(e) => setCustomerCompany(e.target.value)}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="label mb-1 block">Customer TPIN (optional)</label>
                    <input
                      value={customerTpin}
                      onChange={(e) => setCustomerTpin(e.target.value)}
                      className="field"
                    />
                  </div>
                </div>
                <div>
                  <label className="label mb-1 block">Invoice Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="field"
                  />
                </div>
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="btn btn-secondary"
              >
                Close
              </button>
              {eligibleBookings.length > 0 ? (
                <button type="submit" disabled={busy} className="btn btn-primary">
                  {busy ? 'Issuing...' : 'Issue Invoice'}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
