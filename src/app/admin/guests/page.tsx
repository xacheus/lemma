'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, Plus, ShieldAlert, Star } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { DataTable, EmptyState, Pagination, Skeleton, StatusChip } from '@/components/ui';
import { SearchInput, Segmented } from '@/components/ui/forms';
import { GuestEditor, GUEST_SOURCE_LABELS, maskId } from '@/components/admin/guest-editor';
import { formatKwacha, formatKwachaCompact } from '@/lib/domain/money';
import { formatMediumDate } from '@/lib/domain/dates';
import { downloadCsv } from '@/lib/browser/csv';
import type { Guest } from '@/lib/domain/types';
import type { GuestTotals } from '@/lib/view-types';

type SortKey = 'name' | 'spent' | 'stays' | 'outstanding' | 'recent';
type Filter = 'all' | 'balance' | 'vip' | 'new';

const PAGE_SIZE = 14;

export default function GuestsPage() {
  const { snapshot, can, toast } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spent', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    if (!snapshot?.guests) return [];
    const totals = snapshot.guestTotals ?? {};
    const reservations = snapshot.reservations ?? [];
    const needle = query.trim().toLowerCase();
    let list = snapshot.guests.map((guest) => ({
      guest,
      totals: totals[guest.id] ?? ({ stays: 0, totalSpent: 0, outstanding: 0, nights: 0 } as GuestTotals),
      lastStay:
        reservations
          .filter((r) => r.guestId === guest.id && r.status !== 'cancelled')
          .map((r) => r.checkOut)
          .sort()
          .reverse()[0] ?? null,
      nextArrival:
        reservations
          .filter((r) => r.guestId === guest.id && r.status !== 'cancelled' && r.checkIn >= snapshot.today)
          .map((r) => r.checkIn)
          .sort()[0] ?? null,
      sources: Array.from(new Set(reservations.filter((r) => r.guestId === guest.id).map((r) => r.source))),
    }));

    if (needle)
      list = list.filter((r) =>
        [r.guest.fullName, r.guest.phone, r.guest.email, r.guest.city, r.guest.company, r.guest.nationalId]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );

    if (filter === 'balance') list = list.filter((r) => r.totals.outstanding > 0);
    if (filter === 'vip') list = list.filter((r) => r.guest.vip);
    if (filter === 'new') list = list.filter((r) => r.totals.stays <= 1);

    const factor = sort.dir === 'asc' ? 1 : -1;
    const value = (r: (typeof list)[number]) => {
      switch (sort.key) {
        case 'name':
          return r.guest.fullName;
        case 'stays':
          return r.totals.stays;
        case 'outstanding':
          return r.totals.outstanding;
        case 'recent':
          return r.lastStay ?? '';
        default:
          return r.totals.totalSpent;
      }
    };
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [snapshot, query, filter, sort]);

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!snapshot.guests)
    return (
      <div className="space-y-4">
        <PageHeader title="Guests" description="The guest register holds personal data and is restricted by role." />
        <EmptyState
          icon={ShieldAlert}
          title="The register is closed to your role"
          body="Cleaners see only the housekeeping assigned to them — no names, no contact details, no money. Sign in as a receptionist or manager to view guests."
        />
      </div>
    );

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = rows.reduce(
    (acc, r) => ({
      spent: acc.spent + r.totals.totalSpent,
      outstanding: acc.outstanding + r.totals.outstanding,
      stays: acc.stays + r.totals.stays,
    }),
    { spent: 0, outstanding: 0, stays: 0 },
  );

  function toggleSort(key: SortKey) {
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc' }));
  }

  function exportCsv() {
    downloadCsv(
      `guests-${snapshot!.today}`,
      ['Name', 'Phone', 'Email', 'City', 'Company', 'Stays', 'Nights', 'Total spent (K)', 'Outstanding (K)', 'Last departure'],
      rows.map((r) => [
        r.guest.fullName,
        r.guest.phone,
        r.guest.email,
        r.guest.city,
        r.guest.company,
        String(r.totals.stays),
        String(r.totals.nights),
        String(r.totals.totalSpent),
        String(r.totals.outstanding),
        r.lastStay ?? '',
      ]),
    );
    toast({ tone: 'success', title: 'Export started', body: `${rows.length} guest rows written to CSV (no ID numbers — those stay in the register).` });
  }

  const sortableHead = [
    <SortButton key="guest" label="Guest" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />,
    <SortButton key="contact" label="Contact" />,
    <SortButton key="source" label="Source" />,
    <SortButton key="stays" label="Stays" active={sort.key === 'stays'} dir={sort.dir} onClick={() => toggleSort('stays')} align="right" />,
    <SortButton key="spent" label="Spent" active={sort.key === 'spent'} dir={sort.dir} onClick={() => toggleSort('spent')} align="right" />,
    <SortButton key="balance" label="Balance" active={sort.key === 'outstanding'} dir={sort.dir} onClick={() => toggleSort('outstanding')} align="right" />,
    <SortButton key="last-/-next-stay" label="Last / next stay" active={sort.key === 'recent'} dir={sort.dir} onClick={() => toggleSort('recent')} />,
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Guests"
        description="One record per person, with the money and the history that belongs to them. ID numbers are masked for roles without PII rights."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={exportCsv} disabled={!rows.length}>
              <Download size={14} /> Export CSV
            </button>
            {can('guests.manage') ? (
              <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={() => setAdding(true)}>
                <Plus size={15} /> Add guest
              </button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip">{snapshot.guests.length} records</span>
          <span className="chip">{totals.stays} stays booked</span>
          <span className="chip">{formatKwachaCompact(totals.spent)} lifetime revenue</span>
          {totals.outstanding ? <span className="chip bg-st-cancelledBg text-st-cancelled">{formatKwacha(totals.outstanding)} outstanding</span> : null}
          {!can('guests.viewPii') ? (
            <span className="chip">
              <ShieldAlert size={11} /> PII hidden for your role
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Name, phone, email, city or company" className="w-full sm:w-72" />
          <Segmented
            ariaLabel="Filter guests"
            value={filter}
            onChange={(v) => { setFilter(v); setPage(1); }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'balance', label: 'Owing' },
              { value: 'vip', label: 'VIP' },
              { value: 'new', label: 'First-timers' },
            ]}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <DataTable head={sortableHead}>
          {shown.length ? (
            shown.map(({ guest, totals: t, lastStay, nextArrival, sources }) => (
              <tr key={guest.id} className="row-hover border-b border-sand-100 last:border-b-0">
                <td className="td">
                  <Link href={`/admin/guests/${guest.id}`} className="flex items-center gap-2.5">
                    <Avatar name={guest.fullName} vip={guest.vip} />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.85rem] font-semibold text-navy-800 group-hover:text-teal-700">{guest.fullName}</span>
                      <span className="block truncate text-[0.72rem] text-navy-400">
                        {guest.city || '—'}
                        {guest.company ? ` · ${guest.company}` : ''} · {guest.nationalId ? `${guest.idType.toUpperCase()} ${maskId(guest.nationalId)}` : 'no ID on file'}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="td">
                  <span className="block text-[0.8rem] text-navy-700 tnum">{guest.phone}</span>
                  <span className="block truncate text-[0.72rem] text-navy-400">{guest.email || 'no email'}</span>
                </td>
                <td className="td">
                  <span className="flex flex-wrap gap-1">
                    {sources.length ? (
                      sources.map((s) => (
                        <span key={s} className="chip">
                          {GUEST_SOURCE_LABELS[s] ?? s}
                        </span>
                      ))
                    ) : (
                      <span className="text-[0.78rem] text-navy-400">{GUEST_SOURCE_LABELS[guest.source] ?? '—'}</span>
                    )}
                  </span>
                </td>
                <td className="td text-right">
                  <span className="text-[0.85rem] font-semibold text-navy-800 tnum">{t.stays}</span>
                  <span className="block text-[0.72rem] text-navy-400 tnum">{t.nights} nights</span>
                </td>
                <td className="td text-right text-[0.85rem] font-semibold text-navy-800 tnum">{formatKwacha(t.totalSpent)}</td>
                <td className="td text-right">
                  {t.outstanding ? (
                    <StatusChip className="bg-st-cancelledBg text-st-cancelled" dot="bg-current">
                      {formatKwacha(t.outstanding)}
                    </StatusChip>
                  ) : (
                    <span className="text-[0.8rem] text-st-available">settled</span>
                  )}
                </td>
                <td className="td">
                  <span className="block text-[0.78rem] text-navy-600">{lastStay ? `Out ${formatMediumDate(lastStay)}` : 'Never stayed'}</span>
                  {nextArrival ? <span className="block text-[0.72rem] text-st-reserved">Arrives {formatMediumDate(nextArrival)}</span> : null}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="px-4 py-8">
                <EmptyState
                  title={query ? 'No guest matches that search' : 'Nobody in this view'}
                  body={query ? `Nothing on the register matches “${query}”. Try a phone number fragment instead — names are sometimes spelled differently at booking.` : 'Clear the filter to see the whole register.'}
                  action={
                    query ? (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setQuery('')}>
                        Clear search
                      </button>
                    ) : null
                  }
                />
              </td>
            </tr>
          )}
        </DataTable>
        <Pagination page={page} pages={pages} total={rows.length} perPage={PAGE_SIZE} onPage={setPage} />
      </div>

      <GuestEditor open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active?: boolean;
  dir?: 'asc' | 'desc';
  onClick?: () => void;
  align?: 'left' | 'right';
}) {
  if (!onClick) return <span className={align === 'right' ? 'block text-right' : ''}>{label}</span>;
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-navy-800 ${active ? 'text-navy-800' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {label}
      <span className="text-[0.6rem]">{active ? (dir === 'asc' ? '▲' : '▼') : '◆'}</span>
    </button>
  );
}

function Avatar({ name, vip }: { name: string; vip: boolean }) {
  return (
    <span className="relative shrink-0">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-100 text-[0.72rem] font-bold text-navy-600">
        {name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join('')}
      </span>
      {vip ? <Star size={10} className="absolute -right-1 -top-1 fill-gold-400 text-gold-500" /> : null}
    </span>
  );
}

export type { Guest };
