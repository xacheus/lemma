import type { Database, GuestSubmittedPayment, Payment, PaymentMethod } from './types';
import { formatKwacha } from './money';

/**
 * Bank / mobile-money statement import.
 *
 * There is no provider API to reconcile against, so the honest workflow is: the
 * bursar exports a CSV from the bank or MoMo portal, drops it in here, and the
 * app proposes matches against what the property is owed. Nothing is banked by the
 * import — a suggested match is a suggestion, and a payment is only created when a
 * member of staff confirms a line. That keeps the rule that money counts when a
 * person signs for it.
 *
 * Expected columns (first row is a header, order does not matter, case-insensitive):
 *   date        transaction date  (YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY)
 *   amount      amount in ZMW, commas/spaces tolerated; a separate credit/debit
 *               column pair is also understood
 *   reference   transaction id, merchant reference, slip number
 *   method      optional: airtel / mtn / bank / cash — otherwise inferred from the
 *               reference or the file, and editable before confirming
 *   description optional narrative
 */

export type MatchConfidence = 'exact_amount_and_reference' | 'reference_only' | 'amount_and_date' | 'amount_only';

export interface StatementLine {
  index: number;
  date: string | null;
  amount: number | null;
  reference: string;
  method: PaymentMethod;
  description: string;
  problems: string[];
}

export interface MatchSuggestion {
  reservationId: string;
  reference: string;
  guestName: string | null;
  apartmentNumber: number | null;
  balanceDue: number;
  confidence: MatchConfidence;
  /** Guest claim this line appears to settle, when there is one. */
  claimId: string | null;
  claimReference: string | null;
  notes: string[];
}

export interface StatementRow {
  line: StatementLine;
  suggestions: MatchSuggestion[];
  /** True when the storage reference is already in the ledger — a duplicate import. */
  alreadyBanked: boolean;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'trans date', 'value date', 'posted', 'time'],
  amount: ['amount', 'credit', 'credit amount', 'money in', 'value', 'amount (zmw)', 'amount(zmw)'],
  debit: ['debit', 'debit amount', 'money out', 'withdrawal'],
  reference: ['reference', 'ref', 'transaction id', 'transaction reference', 'txn', 'txn id', 'receipt', 'slip', 'merchant reference', 'external ref'],
  method: ['method', 'channel', 'payment method', 'type'],
  description: ['description', 'narrative', 'details', 'particulars', 'payer', 'sender'],
};

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function inferMethod(reference: string, description: string, hint: string, fallback: PaymentMethod): PaymentMethod {
  const hay = `${hint} ${reference} ${description}`.toLowerCase();
  if (/airtel|\bmp\b|181/.test(hay)) return 'airtel_money';
  if (/mtn|momo|158/.test(hay)) return 'mtn_money';
  if (/cash|till|desk/.test(hay)) return 'cash';
  if (/bank|zanaco|transfer|rtgs|eft|absa|stanbic|equity|ecobank/.test(hay)) return 'bank_transfer';
  return fallback;
}

export function parseStatement(
  text: string,
  fallbackMethod: PaymentMethod = 'bank_transfer',
): { rows: StatementLine[]; error: string | null } {
  const table = splitCsv(text);
  if (table.length < 2) {
    return { rows: [], error: 'That file has no data rows. Export the statement as CSV with a header row.' };
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const columnOf = (key: string) => {
    const aliases = HEADER_ALIASES[key] ?? [];
    return header.findIndex((h) => aliases.includes(h));
  };
  const dateCol = columnOf('date');
  const amountCol = columnOf('amount');
  const debitCol = columnOf('debit');
  const refCol = columnOf('reference');
  const methodCol = columnOf('method');
  const descCol = columnOf('description');

  if (dateCol === -1 || (amountCol === -1 && debitCol === -1)) {
    return {
      rows: [],
      error:
        'Could not find the date and amount columns. The header row needs at least "date" and "amount" (or "credit" / "debit").',
    };
  }

  const rows: StatementLine[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (col: number) => (col >= 0 ? (cells[col] ?? '').trim() : '');
    const problems: string[] = [];
    const date = parseDate(get(dateCol));
    if (!date) problems.push('Date not understood — check the file format.');

    const amount = amountCol >= 0 ? parseAmount(get(amountCol)) : null;
    if (amount === null && debitCol >= 0) {
      // A debit is money leaving; only treat it as a payment when no credit column exists.
      const debit = parseAmount(get(debitCol));
      void debit;
      if (amountCol === -1) {
        problems.push('This line is a debit (money out) — not a payment received.');
      }
    }
    if (amount === null) problems.push('No amount could be read on this line.');

    const reference = get(refCol).slice(0, 64);
    if (!reference) problems.push('No reference — you will need to identify this payment by amount and date.');

    const description = get(descCol).slice(0, 200);
    const method = inferMethod(reference, description, get(methodCol), fallbackMethod);

    rows.push({
      index: i + 1,
      date,
      amount,
      reference,
      method,
      description,
      problems,
    });
  });

  return { rows, error: null };
}

interface Candidate {
  reservationId: string;
  reference: string;
  guestName: string | null;
  apartmentNumber: number | null;
  balanceDue: number;
  checkIn: string;
  claim: GuestSubmittedPayment | null;
}

function candidates(db: Database): Candidate[] {
  const openClaims = (db.paymentClaims ?? []).filter((c) => c.status === 'awaiting_verification');
  return db.reservations
    .filter((r) => r.status !== 'cancelled' && r.status !== 'checked_out')
    .map((r) => {
      const verified = db.payments
        .filter((p) => p.reservationId === r.id && p.verificationStatus === 'verified' && p.kind !== 'refund')
        .reduce((s, p) => s + p.amount, 0);
      const refunded = db.payments
        .filter((p) => p.reservationId === r.id && p.kind === 'refund' && p.verificationStatus === 'verified')
        .reduce((s, p) => s + p.amount, 0);
      const guest = db.guests.find((g) => g.id === r.guestId);
      return {
        reservationId: r.id,
        reference: r.reference,
        guestName: guest?.fullName ?? null,
        apartmentNumber: db.apartments.find((a) => a.id === r.apartmentId)?.number ?? null,
        balanceDue: Math.max(0, Math.round((r.totalAmount - (verified - refunded)) * 100) / 100),
        checkIn: r.checkIn,
        claim: openClaims.find((c) => c.reservationId === r.id) ?? null,
      };
    })
    .filter((c) => c.balanceDue > 0);
}

/** Proposes matches for each statement line. Never writes anything. */
export function matchStatement(db: Database, lines: StatementLine[]): StatementRow[] {
  const pool = candidates(db);
  const bankedRefs = new Set(
    db.payments
      .filter((p) => p.kind !== 'refund')
      .map((p) => p.reference.trim().toUpperCase())
      .filter(Boolean),
  );

  return lines.map((line) => {
    const alreadyBanked = Boolean(line.reference) && bankedRefs.has(line.reference.toUpperCase());
    if (line.amount === null) return { line, suggestions: [], alreadyBanked };

    const suggestions: MatchSuggestion[] = [];
    const refUpper = line.reference.toUpperCase();

    for (const candidate of pool) {
      const notes: string[] = [];
      const claimMatchesReference =
        candidate.claim && refUpper && candidate.claim.reference.toUpperCase() === refUpper;
      const bookingInDescription =
        line.description.toUpperCase().includes(candidate.reference.toUpperCase());
      const claimCloseInTime =
        candidate.claim &&
        line.date &&
        Math.abs(
          (new Date(`${line.date}T00:00:00Z`).getTime() -
            new Date(`${candidate.claim.paidAt}T00:00:00Z`).getTime()) /
            864e5,
        ) <= 3;
      const amountMatchesBalance = Math.abs(candidate.balanceDue - line.amount) < 0.01;
      const claimAmountMatches = candidate.claim && Math.abs(candidate.claim.amount - line.amount) < 0.01;

      let confidence: MatchConfidence | null = null;
      if (claimMatchesReference && claimAmountMatches) {
        confidence = 'exact_amount_and_reference';
        notes.push('Matches a guest’s submitted claim in both reference and amount.');
      } else if (bookingInDescription && (amountMatchesBalance || claimAmountMatches)) {
        confidence = 'exact_amount_and_reference';
        notes.push('The narrative quotes this booking’s reference.');
      } else if (claimMatchesReference || bookingInDescription) {
        confidence = 'reference_only';
        notes.push('Reference matches, but the amount differs — check before confirming.');
      } else if (claimAmountMatches && claimCloseInTime) {
        confidence = 'amount_and_date';
        notes.push('Same amount as the guest’s claim and paid within a few days of it.');
      } else if (amountMatchesBalance) {
        confidence = 'amount_only';
        notes.push(`Matches the ${formatKwacha(candidate.balanceDue)} outstanding exactly.`);
      }

      if (!confidence) continue;
      suggestions.push({
        reservationId: candidate.reservationId,
        reference: candidate.reference,
        guestName: candidate.guestName,
        apartmentNumber: candidate.apartmentNumber,
        balanceDue: candidate.balanceDue,
        confidence,
        claimId: candidate.claim?.id ?? null,
        claimReference: candidate.claim?.reference ?? null,
        notes,
      });
    }

    const rank: Record<MatchConfidence, number> = {
      exact_amount_and_reference: 0,
      reference_only: 1,
      amount_and_date: 2,
      amount_only: 3,
    };
    suggestions.sort(
      (a, b) => rank[a.confidence] - rank[b.confidence] || a.balanceDue - b.balanceDue,
    );
    return { line, suggestions: suggestions.slice(0, 4), alreadyBanked };
  });
}

export interface ImportedPaymentSummary {
  lines: number;
  banked: Payment[];
  skipped: { line: number; reason: string }[];
}
