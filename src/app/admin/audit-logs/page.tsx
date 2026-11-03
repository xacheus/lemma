'use client';

import { useState } from 'react';
import { ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { useApp } from '@/components/providers/app';

export default function AdminAuditLogsPage() {
  const { snapshot } = useApp();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);

  if (!snapshot) return null;

  const filtered = (snapshot.auditLogs ?? []).filter((log) => {
    if (category !== 'all' && log.category !== category) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return (
        log.summary.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const visible = filtered.slice(0, limit);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-lemma-dark">
            Security &amp; Compliance
          </p>
          <h1 className="text-[1.45rem] font-bold text-navy-900">Immutable Audit Trail</h1>
          <p className="text-[0.83rem] text-navy-500">
            Every role change, staff deactivation, payment verification, refund, apartment price
            amendment, and commercial document generation is recorded here.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-sand-200 bg-white px-3 py-1.5 text-[0.76rem] font-medium text-navy-700">
          <ShieldCheck size={14} className="text-st-available" /> Append-Only Ledger
        </span>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by actor, action, or summary..."
            className="field pl-8"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field w-auto"
        >
          <option value="all">All Categories</option>
          <option value="role">Role Changes</option>
          <option value="staff">Staff &amp; Account Status</option>
          <option value="payment">Payment Verification</option>
          <option value="refund">Refunds</option>
          <option value="booking">Booking Changes</option>
          <option value="apartment">Apartment &amp; Pricing</option>
          <option value="document">Quotations &amp; Invoices</option>
          <option value="media">Media Uploads &amp; Deletions</option>
          <option value="maintenance">Maintenance</option>
          <option value="settings">System Settings</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-[0.82rem]">
          <thead className="border-b border-sand-200 bg-sand-50 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
            <tr>
              <th className="px-4 py-3">Timestamp (UTC)</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-navy-500">
                  No audit events match the selected filter.
                </td>
              </tr>
            ) : (
              visible.map((log) => (
                <tr key={log.id} className="hover:bg-sand-50/70">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-navy-500 whitespace-nowrap">
                    {log.createdAt.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="chip bg-sand-100 text-navy-700 ring-1 ring-sand-300 uppercase">
                      {log.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-navy-900">{log.actorName}</div>
                    <div className="text-[0.72rem] uppercase text-navy-500">
                      {String(log.actorRole).replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.76rem] text-navy-700">{log.action}</td>
                  <td className="px-4 py-3 text-navy-800">{log.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > visible.length ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + 20)}
            className="btn btn-secondary"
          >
            <ClipboardList size={14} /> Show next 20 entries
          </button>
        </div>
      ) : null}
    </div>
  );
}
