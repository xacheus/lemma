'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  ScanSearch,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { Alert, Panel } from '@/components/ui';
import { SelectInput } from '@/components/ui/forms';
import { formatKwacha } from '@/lib/domain/money';
import type { PaymentMethod } from '@/lib/domain/types';

interface Line {
  index: number;
  date: string | null;
  amount: number | null;
  reference: string;
  method: PaymentMethod;
  description: string;
  problems: string[];
}

interface Suggestion {
  reservationId: string;
  reference: string;
  guestName: string | null;
  apartmentNumber: number | null;
  balanceDue: number;
  confidence: string;
  claimId: string | null;
  claimReference: string | null;
  notes: string[];
}

interface Row {
  line: Line;
  suggestions: Suggestion[];
  alreadyBanked: boolean;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  exact_amount_and_reference: 'Reference + amount',
  reference_only: 'Reference only',
  amount_and_date: 'Amount + date',
  amount_only: 'Amount only',
};

const CONFIDENCE_TONE: Record<string, string> = {
  exact_amount_and_reference: 'bg-st-availableBg text-st-available',
  reference_only: 'bg-st-cleaningBg text-st-cleaning',
  amount_and_date: 'bg-st-reservedBg text-st-reserved',
  amount_only: 'bg-sand-100 text-sand-700',
};

/**
 * Bank / mobile-money statement import.
 *
 * The file is parsed on the server and matched against open balances; this screen
 * only proposes. A line is banked when someone ticks it and presses import, and it
 * goes through the ordinary payment rules — so if the property requires two
 * signatures, the imported receipt waits in the verification queue like any other.
 */
export function StatementImport() {
  const { request, toast, refresh, can } = useApp();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fallbackMethod, setFallbackMethod] = useState<PaymentMethod>('bank_transfer');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<{ lines: number; matched: number; unmatched: number; duplicates: number; value: number } | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ banked: string[]; skipped: { line: number; reason: string }[] } | null>(null);

  async function analyse() {
    if (!csv.trim()) {
      setError('Paste the statement or choose a CSV file first.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await request<{ rows: Row[]; totals: typeof totals }>('/api/payments/import', {
        method: 'POST',
        data: { csv, fallbackMethod },
      });
      setRows(data.rows);
      setTotals(data.totals);
      // Pre-tick the confident matches only — an "amount only" guess must be chosen.
      const pre: Record<number, number> = {};
      for (const row of data.rows) {
        if (row.alreadyBanked) continue;
        const best = row.suggestions[0];
        if (best && (best.confidence === 'exact_amount_and_reference' || best.confidence === 'reference_only')) {
          pre[row.line.index] = 0;
        }
      }
      setSelected(pre);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The statement could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!rows) return;
    const lines = Object.entries(selected)
      .map(([index, suggestionIdx]) => {
        const row = rows.find((r) => r.line.index === Number(index));
        const suggestion = row?.suggestions[suggestionIdx];
        if (!row || !suggestion || row.line.amount === null) return null;
        return {
          index: row.line.index,
          reservationId: suggestion.reservationId,
          amount: row.line.amount,
          method: row.line.method,
          reference: row.line.reference || `IMPORT-${row.line.index}`,
          date: row.line.date,
          description: row.line.description,
          kind: 'part_payment' as const,
          claimId: suggestion.claimId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (!lines.length) {
      setError('Tick at least one matched line to bank.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await request<{ banked: string[]; skipped: { line: number; reason: string }[] }>(
        '/api/payments/import',
        { method: 'POST', data: { csv, fallbackMethod, commit: true, lines } },
      );
      setResult(data);
      toast({
        tone: data.banked.length ? 'success' : 'info',
        title: data.banked.length ? `${data.banked.length} payment${data.banked.length === 1 ? '' : 's'} recorded` : 'Nothing recorded',
        body: data.banked.length
          ? 'Each one follows the normal rules — if a second signature is required it is in the verification queue.'
          : 'Every line you ticked was skipped; see the reasons below.',
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import did not complete.');
    } finally {
      setBusy(false);
    }
  }

  if (!can('payments.record')) {
    return (
      <Panel title="Statement import" subtitle="Bring a bank or mobile-money export in and match it against open balances.">
        <Alert tone="warn" title="Needs payments.record">
          Your role can view the ledger but not record money. Ask an administrator if importing
          statements belongs to your desk.
        </Alert>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error" title="Import not completed">{error}</Alert> : null}

      <Panel
        title="Import a bank or mobile-money statement"
        subtitle="CSV with a date and an amount column; a reference column is what makes the match reliable. Nothing is banked until you confirm the ticks."
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label mb-1 block" htmlFor="statement-file">
                Statement CSV
              </label>
              <input
                id="statement-file"
                type="file"
                accept=".csv,text/csv,text/plain"
                className="field py-1.5 text-[0.82rem]"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000) {
                    setError('That file is over 2 MB. Export a shorter date range.');
                    return;
                  }
                  const text = await file.text();
                  setCsv(text);
                  setFileName(file.name);
                  setRows(null);
                  setResult(null);
                  setError(null);
                }}
              />
              {fileName ? (
                <p className="mt-1 text-[0.74rem] text-navy-500">
                  Loaded {fileName}. Press Analyse to see proposed matches.
                </p>
              ) : null}
            </div>
            <div className="sm:w-56">
              <SelectInput
                label="Assume this channel"
                value={fallbackMethod}
                onChange={(e) => setFallbackMethod(e.target.value as PaymentMethod)}
                options={[
                  { value: 'bank_transfer', label: 'Bank transfer' },
                  { value: 'airtel_money', label: 'Airtel Money' },
                  { value: 'mtn_money', label: 'MTN Mobile Money' },
                  { value: 'cash', label: 'Cash' },
                ]}
                hint="Used when the file does not say"
              />
            </div>
          </div>

          <details className="rounded-md border border-sand-200 bg-sand-50 px-3 py-2">
            <summary className="cursor-pointer text-[0.8rem] font-medium text-navy-700">
              Or paste the statement text
            </summary>
            <textarea
              className="field mt-2 min-h-[110px] font-mono text-[0.76rem]"
              placeholder={'date,amount,reference,description\n2026-11-01,2175.00,MP2607.AB12345,Airtel money from 0977'}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setRows(null);
              }}
            />
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={() => void analyse()} disabled={busy || !csv.trim()}>
              {busy && !rows ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
              Analyse statement
            </button>
            {rows ? (
              <span className="text-[0.78rem] text-navy-500">
                {totals?.lines ?? 0} lines · {totals?.matched ?? 0} with a possible match ·{' '}
                {totals?.duplicates ?? 0} already in the ledger
              </span>
            ) : null}
          </div>
        </div>
      </Panel>

      {result ? (
        <Panel title="Import result">
          {result.banked.length ? (
            <ul className="space-y-1 text-[0.82rem] text-navy-700">
              {result.banked.map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-st-available" /> {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.82rem] text-navy-500">Nothing was recorded.</p>
          )}
          {result.skipped.length ? (
            <ul className="mt-2 space-y-1 text-[0.8rem] text-navy-600">
              {result.skipped.map((s) => (
                <li key={s.line} className="flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-st-cleaning" />
                  Line {s.line}: {s.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      {rows ? (
        <Panel
          title={`Review ${rows.length} statement line${rows.length === 1 ? '' : 's'}`}
          subtitle="Only ticked lines are banked. A tick records a payment under your name — it does not skip the verification step."
          bodyClass="divide-y divide-sand-100"
        >
          {rows.map((row) => {
            const picked = selected[row.line.index];
            const pickedSuggestion = picked !== undefined ? row.suggestions[picked] : undefined;
            return (
              <div key={row.line.index} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-[0.88rem] font-semibold text-navy-900">
                      {row.line.amount === null ? 'Unreadable amount' : formatKwacha(row.line.amount)}
                      <span className="ml-2 text-[0.78rem] font-normal text-navy-500">
                        {row.line.date ?? 'no date'} · {row.line.reference || 'no reference'}
                      </span>
                    </p>
                    {row.line.description ? (
                      <p className="mt-0.5 text-[0.76rem] text-navy-500">{row.line.description}</p>
                    ) : null}
                    {row.line.problems.length ? (
                      <ul className="mt-1 space-y-0.5 text-[0.74rem] text-st-cancelled">
                        {row.line.problems.map((p) => (
                          <li key={p} className="flex items-start gap-1.5">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {p}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.alreadyBanked ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-[0.75rem] text-st-cleaning">
                        <ShieldCheck size={12} /> This reference is already in the ledger — not offered for import.
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1 basis-56">
                    {row.alreadyBanked ? (
                      <span className="chip">Duplicate</span>
                    ) : row.suggestions.length === 0 ? (
                      <span className="chip">No match found — record it from the folio instead</span>
                    ) : (
                      <div className="space-y-1.5">
                        {row.suggestions.map((s, i) => (
                          <label
                            key={`${s.reservationId}-${i}`}
                            className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[0.78rem] transition ${
                              picked === i ? 'border-navy-900 bg-sand-50' : 'border-sand-200 hover:border-brand-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`line-${row.line.index}`}
                              className="mt-0.5"
                              checked={picked === i}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = { ...prev };
                                  if (picked === i) delete next[row.line.index];
                                  else next[row.line.index] = i;
                                  return next;
                                })
                              }
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-navy-900">{s.reference}</span>
                                <span className={`chip ${CONFIDENCE_TONE[s.confidence] ?? ''}`}>
                                  {CONFIDENCE_LABEL[s.confidence] ?? s.confidence}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-navy-600">
                                {s.guestName ?? 'Guest'} · Apt {s.apartmentNumber ?? '—'} · outstanding{' '}
                                {formatKwacha(s.balanceDue)}
                                {s.claimReference ? ` · claim ref ${s.claimReference}` : ''}
                              </span>
                              {s.notes.map((n) => (
                                <span key={n} className="mt-0.5 block text-[0.72rem] text-navy-400">
                                  {n}
                                </span>
                              ))}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {pickedSuggestion && row.line.amount !== null && row.line.amount > pickedSuggestion.balanceDue + 0.01 ? (
                  <p className="mt-1.5 text-[0.75rem] text-st-cancelled">
                    This line is more than the {formatKwacha(pickedSuggestion.balanceDue)} outstanding
                    on {pickedSuggestion.reference}. The import will refuse it — split it or record the
                    surplus separately.
                  </p>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="text-[0.78rem] text-navy-500">
              {Object.keys(selected).length} line{Object.keys(selected).length === 1 ? '' : 's'} ticked
              ·{' '}
              {formatKwacha(
                Object.entries(selected).reduce((sum, [idx, si]) => {
                  const row = rows.find((r) => r.line.index === Number(idx));
                  return sum + (row?.suggestions[si] ? (row.line.amount ?? 0) : 0);
                }, 0),
              )}
            </p>
            <button
              type="button"
              className="btn-primary h-9 px-3 text-[0.82rem]"
              disabled={busy || !Object.keys(selected).length}
              onClick={() => void commit()}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Record {Object.keys(selected).length || ''} payment{Object.keys(selected).length === 1 ? '' : 's'}
            </button>
          </div>
        </Panel>
      ) : null}

      {!rows ? (
        <p className="flex items-start gap-2 text-[0.76rem] leading-relaxed text-navy-500">
          <FileUp size={13} className="mt-0.5 shrink-0" />
          Nothing is uploaded to the mobile-money or bank provider — this reads an export the
          property already has. That is why every match is confirmed by a person.
        </p>
      ) : null}
    </div>
  );
}
