/** Zambian Kwacha helpers. Amounts are integer kwacha (1 ZMW = 100 ngwee). */

const GROUPER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatKwacha(amount: number, opts: { decimals?: boolean } = {}): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const hasNgwee = !Number.isInteger(abs);
  const showDecimals = opts.decimals ?? hasNgwee;
  const body = showDecimals
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : GROUPER.format(Math.round(abs));
  return `${negative ? '-' : ''}K${body}`;
}

/** Compact form for chart axes and tight table cells: 48500 -> "K48.5k". */
export function formatKwachaCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `K${(amount / 1_000_000).toFixed(1)}m`;
  if (abs >= 1000) return `K${(amount / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `K${GROUPER.format(amount)}`;
}

export function parseAmountInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function roundKwacha(n: number): number {
  return Math.round(n * 100) / 100;
}

export function percent(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}
