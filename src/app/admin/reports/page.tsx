'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarRange, Download, FileJson, RefreshCw } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, DataTable, EmptyState, Panel, Skeleton, StatusChip } from '@/components/ui';
import { DateInput, Segmented } from '@/components/ui/forms';
import { AreaChart, BarChart, DonutChart, LegendSwatches } from '@/components/ui/charts';
import { formatKwacha, formatKwachaCompact, percent } from '@/lib/domain/money';
import { formatMediumDate, monthRange } from '@/lib/domain/dates';
import { BOOKING_STATUS_META, PAYMENT_METHOD_META } from '@/lib/domain/status';
import { downloadCsv, downloadJson } from '@/lib/browser/csv';
import type { ReportData } from '@/lib/domain/selectors';

type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

export default function ReportsPage() {
  const { snapshot, request, can, toast } = useApp();
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [report, setReport] = useState<ReportData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!snapshot) return;
    setState('loading');
    setError(null);
    const params = new URLSearchParams({ period });
    if (period === 'custom' && custom.from && custom.to) {
      params.set('from', custom.from);
      params.set('to', custom.to);
    }
    try {
      const data = await request<{ report: ReportData }>(`/api/reports?${params.toString()}`);
      setReport(data.report);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The report could not be built.');
      setState('error');
    }
  }, [snapshot, request, period, custom.from, custom.to]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  const revenuePoints = useMemo(
    () => (report?.series ?? []).map((s) => ({ label: s.label, value: s.revenue, sub: `${s.arrivals} in · ${s.departures} out` })),
    [report],
  );
  const occupancyPoints = useMemo(
    () => (report?.series ?? []).map((s) => ({ label: s.label, value: percent(s.occupied, Math.max(1, s.sellable)), detail: `${s.occupied}/${s.sellable} room-nights` })),
    [report],
  );
  const methodSlices = useMemo(() => {
    const palette: Record<string, string> = { airtel_money: '#e0322b', mtn_money: '#cba33f', bank_transfer: '#1d756e', cash: '#2f4c74' };
    return (report?.cashCollectedByMethod ?? [])
      .filter((m) => m.total > 0)
      .map((m) => ({ label: m.label, value: m.total, color: palette[m.method] ?? '#8a8a8a' }));
  }, [report]);

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!can('reports.view'))
    return (
      <div className="space-y-4">
        <PageHeader title="Reports" description="Revenue and occupancy reporting." />
        <EmptyState icon={AlertTriangle} title="Reporting is restricted" body="Only reception managers and the owner can see revenue and occupancy reporting. Your role does not include reports.view." />
      </div>
    );

  const range = monthRange(snapshot.today);
  const periodStart = period === 'month' ? `${range.year}-${range.month}-01` : period === 'year' ? `${range.year}-01-01` : null;
  const effective = report
    ? { from: report.from, to: report.to }
    : { from: custom.from || periodStart || snapshot.today, to: custom.to || snapshot.today };

  function exportRows() {
    if (!report) return;
    downloadCsv(
      `lemma-report-${report.period}-${report.from}-to-${report.to}`,
      ['Section', 'Key', 'Count', 'Value (K)', 'Note'],
      [
        ['summary', 'Revenue verified', String(report.paymentsCount), String(report.revenue), `${report.period} ${report.from} → ${report.to}`],
        ['summary', 'Nights sold', String(report.nightsSold), String(report.adr), `ADR ${formatKwacha(report.adr)} · RevPAR ${formatKwacha(report.revpar)}`],
        ['summary', 'Occupancy', String(report.occupancyRate), '', `${report.nightsSold}/${report.roomNightsAvailable} room-nights`],
        ['summary', 'Cancellations', String(report.cancellations), '', `${report.cancellationRate}% of requests`],
        ['summary', 'Outstanding', String(report.outstandingRows.length), String(report.outstandingTotal), 'Balances still open on confirmed folios'],
        ...report.topApartments.map((a) => ['apartment', `Apt ${a.number} ${a.name}`, String(a.bookings), String(a.revenue), `${a.nights} nights · ${a.occupancyRate}% occupied`]),
        ...report.reservationsByStatus.map((s) => ['booking status', s.label, String(s.count), '', '']),
        ...report.cashCollectedByMethod.map((m) => ['method', m.label, String(m.count), String(m.total), 'Verified receipts only']),
        ...report.sources.map((s) => ['source', s.label, String(s.count), String(s.revenue), '']),
        ...report.outstandingRows.map((o) => ['outstanding folio', `${o.reference} ${o.guestName}`, '1', String(o.balance), `${o.apartmentName} · arrives ${o.checkIn} · ${o.status}`]),
      ],
    );
    toast({ tone: 'success', title: 'Export started', body: 'The report was written out as CSV, one row per figure, so it opens straight into a spreadsheet.' });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & analytics"
        description="Every figure is recomputed from the live register each time you change the window — nothing here is a cached summary."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={() => setNonce((n) => n + 1)} disabled={state === 'loading'}>
              {state === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalculate
            </button>
            <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={() => report && downloadJson(`lemma-report-${report.from}-to-${report.to}`, report)} disabled={!report}>
              <FileJson size={14} /> JSON
            </button>
            <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={exportRows} disabled={!report}>
              <Download size={14} /> CSV report
            </button>
          </div>
        }
      />

      <div className="card flex flex-wrap items-end justify-between gap-3 p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="label mb-1">Period</p>
            <Segmented
              ariaLabel="Reporting period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
                { value: 'year', label: 'Year' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>
          {period === 'custom' ? (
            <>
              <DateInput label="From" value={custom.from} max={custom.to || snapshot.today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <DateInput label="To" value={custom.to} min={custom.from || undefined} max={snapshot.today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              {custom.from && custom.to && custom.to < custom.from ? <Alert tone="error">The end date must be after the start date.</Alert> : null}
            </>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 pb-1 text-[0.78rem] text-navy-400">
          <CalendarRange size={13} />
          {state === 'loading' ? 'Recomputing…' : report ? `${formatMediumDate(effective.from)} → ${formatMediumDate(effective.to)} · generated for ${snapshot.user.name}` : 'No window selected'}
        </p>
      </div>

      {error ? (
        <Alert tone="error" title="Report failed" action={<button type="button" className="btn-secondary btn-sm" onClick={() => setNonce((n) => n + 1)}>Retry</button>}>
          {error}
        </Alert>
      ) : null}

      {state === 'loading' && !report ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !report ? (
        <EmptyState title="Nothing to show" body="Pick a window to build the report." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label={`Revenue (${report.period})`}
              value={formatKwacha(report.revenue)}
              hint={
                report.revenueChangePct === null
                  ? 'No earlier window to compare with'
                  : `${report.revenueChangePct >= 0 ? '▲' : '▼'} ${Math.abs(report.revenueChangePct)}% vs ${formatKwachaCompact(report.revenuePrevious)} before`
              }
              tone={report.revenueChangePct !== null && report.revenueChangePct < 0 ? 'bad' : 'good'}
            />
            <Kpi label="Reservations" value={String(report.reservationsTotal)} hint={`${report.nightsSold} nights sold · avg stay ${report.averageStay}N`} />
            <Kpi label="Occupancy" value={`${report.occupancyRate}%`} hint={`${report.nightsSold} of ${report.roomNightsAvailable} room-nights available`} />
            <Kpi label="RevPAR" value={formatKwacha(report.revpar)} hint={`ADR ${formatKwacha(report.adr)} · ${report.paymentsCount} verified receipts`} />
            <Kpi label="Cancellations" value={String(report.cancellations)} hint={`${report.cancellationRate}% of all requests in the window`} tone={report.cancellationRate > 15 ? 'warn' : 'muted'} />
            <Kpi label="Outstanding" value={report.outstandingTotal ? formatKwacha(report.outstandingTotal) : 'Settled'} hint={`${report.outstandingRows.length} folio${report.outstandingRows.length === 1 ? '' : 's'} still owing`} tone={report.outstandingTotal ? 'bad' : 'good'} />
            <Kpi label="Average length of stay" value={`${report.averageStay} nights`} hint="Confirmed and completed stays only" />
            <Kpi label="Cash by method" value={methodSlices.length ? methodSlices[0].label : '—'} hint={methodSlices.length ? `${formatKwacha(methodSlices[0].value)} of ${formatKwacha(report.revenue)}` : 'Nothing banked in this window'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Panel title="Revenue in the window" subtitle="Verified money only — pending proof never counts as revenue." icon={BarChart3} bodyClass="p-4">
              {revenuePoints.length ? <AreaChart data={revenuePoints} format={(n) => formatKwacha(n)} /> : <EmptyState title="No receipts in this window" body="Record a payment and it will appear here." />}
            </Panel>
            <Panel title="Payment mix" subtitle="Share of verified takings by channel">
              <div className="p-4">
                {methodSlices.length ? (
                  <DonutChart slices={methodSlices} centreLabel="Banked" centreValue={formatKwachaCompact(report.revenue)} format={(n) => formatKwacha(n)} />
                ) : (
                  <p className="py-8 text-center text-[0.82rem] text-navy-400">No verified receipts in this period.</p>
                )}
                <div className="mt-3">
                  <LegendSwatches items={methodSlices.map((m) => ({ label: `${m.label} · ${formatKwacha(m.value)}`, className: '' }))} />
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Occupancy through the window" subtitle="Room-nights sold against room-nights on offer">
              <div className="p-4">{occupancyPoints.length ? <BarChart data={occupancyPoints} max={100} unit="%" /> : <p className="py-8 text-center text-[0.82rem] text-navy-400">Nothing to chart.</p>}</div>
            </Panel>
            <Panel title="Booking status mix" subtitle="Where every request in the register ended up">
              <ul className="divide-y divide-sand-100">
                {report.reservationsByStatus.map((s) => {
                  const key = s.status as keyof typeof BOOKING_STATUS_META;
                  const meta = BOOKING_STATUS_META[key];
                  return (
                    <li key={s.status} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <StatusChip className={meta?.chip ?? ''}>{meta?.label ?? s.label}</StatusChip>
                      <span className="flex items-center gap-3 text-[0.82rem]">
                        <span className="text-navy-500 tnum">{s.count}</span>
                        <span className="w-24 text-right font-semibold text-navy-800 tnum">{percent(s.count, Math.max(1, report.reservationsTotal))}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <Panel title="Most-booked apartments" subtitle="Ranked by revenue the unit produced in this window" bodyClass="divide-y divide-sand-100">
            {report.topApartments.length ? (
              <DataTable head={['Apartment', 'Bookings', 'Nights', 'Occupancy', 'Revenue', 'Share']}>
                {report.topApartments.map((a, i) => (
                  <tr key={a.apartmentId} className="row-hover border-b border-sand-100 last:border-b-0">
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-sand-100 text-[0.72rem] font-bold text-navy-500">{i + 1}</span>
                        <span className="text-[0.84rem] font-medium text-navy-800">
                          Apt {a.number} · {a.name}
                        </span>
                      </span>
                    </td>
                    <td className="td text-right text-[0.82rem] text-navy-600 tnum">{a.bookings}</td>
                    <td className="td text-right text-[0.82rem] text-navy-600 tnum">{a.nights}</td>
                    <td className="td text-right text-[0.82rem] text-navy-600 tnum">{a.occupancyRate}%</td>
                    <td className="td text-right text-[0.85rem] font-semibold text-navy-800 tnum">{formatKwacha(a.revenue)}</td>
                    <td className="td">
                      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
                        <span className="block h-full rounded-full bg-teal-500" style={{ width: `${percent(a.revenue, Math.max(1, report.topApartments[0].revenue))}%` }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <div className="p-4">
                <EmptyState title="No nights sold" body="No apartment produced revenue inside this window." />
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Outstanding balances" subtitle={`${formatKwacha(report.outstandingTotal)} across ${report.outstandingRows.length} folios`} bodyClass="divide-y divide-sand-100">
              {report.outstandingRows.length ? (
                report.outstandingRows.slice(0, 8).map((o) => (
                  <div key={o.reservationId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] font-semibold text-navy-800">{o.guestName}</p>
                      <p className="truncate text-[0.74rem] text-navy-400">
                        {o.reference} · {o.apartmentName} · arrives {formatMediumDate(o.checkIn)}
                      </p>
                    </div>
                    <StatusChip className={BOOKING_STATUS_META[o.status as keyof typeof BOOKING_STATUS_META]?.chip ?? ''}>
                      {BOOKING_STATUS_META[o.status as keyof typeof BOOKING_STATUS_META]?.label ?? o.status}
                    </StatusChip>
                    <span className="w-24 text-right text-[0.85rem] font-bold text-st-cancelled tnum">{formatKwacha(o.balance)}</span>
                  </div>
                ))
              ) : (
                <div className="p-4">
                  <EmptyState title="Nothing owed" body="Every confirmed folio in this window is settled." />
                </div>
              )}
            </Panel>

            <Panel title="Where the bookings came from" subtitle="Verified revenue attributed to the channel that made the request" bodyClass="divide-y divide-sand-100">
              {report.sources.length ? (
                report.sources.map((s) => (
                  <div key={s.source} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-28 shrink-0 text-[0.82rem] font-medium text-navy-700">{s.label}</span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sand-200">
                      <span className="block h-full rounded-full bg-navy-600" style={{ width: `${percent(s.revenue, Math.max(1, report.revenue))}%` }} />
                    </span>
                    <span className="w-10 text-right text-[0.78rem] text-navy-500 tnum">{s.count}×</span>
                    <span className="w-24 text-right text-[0.82rem] font-semibold text-navy-800 tnum">{formatKwachaCompact(s.revenue)}</span>
                  </div>
                ))
              ) : (
                <div className="p-4">
                  <EmptyState title="No attributed bookings" />
                </div>
              )}
            </Panel>
          </div>

          <p className="text-[0.76rem] leading-relaxed text-navy-400">
            Method totals: {report.cashCollectedByMethod.map((m) => `${m.label} ${formatKwacha(m.total)} (${m.count})`).join(' · ')}. Cancellations, enquiries and unverified receipts are excluded
            from revenue by definition — the same rules the folio screen uses, so a number here always ties back to a guest&apos;s account.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'good' | 'bad' | 'warn' | 'muted' }) {
  const accent = tone === 'good' ? 'text-st-available' : tone === 'bad' ? 'text-st-cancelled' : tone === 'warn' ? 'text-gold-700' : 'text-navy-400';
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className="mt-1 font-display text-[1.35rem] leading-none text-navy-800 tnum">{value}</p>
      <p className={`mt-1.5 text-[0.75rem] leading-snug ${accent}`}>{hint}</p>
    </div>
  );
}
