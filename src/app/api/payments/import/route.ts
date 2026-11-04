import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { paymentImportSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { recordPayment } from '@/lib/domain/operations';
import { matchStatement, parseStatement } from '@/lib/domain/statement-import';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

/**
 * Statement import for reception and management.
 *
 * POST without `commit` parses the pasted/uploaded statement and returns proposed
 * matches — read-only, nothing is written. POST with `commit: true` and a list of
 * confirmed lines records each as a normal payment through recordPayment(), so the
 * usual verification rules apply: an importer cannot bank money by uploading a file
 * unless their role already allows self-verification.
 *
 * The file never leaves the server; only the parsed lines are echoed back.
 */
export const POST = apiRoute({
  permission: 'payments.record',
  handler: async ({ req, session }) => {
    const input = await readBody(req, paymentImportSchema);
    await ensureCloudFirestoreHydrated();

    if (!input.commit) {
      const parsed = parseStatement(input.csv, input.fallbackMethod);
      if (parsed.error) throw new HttpError(parsed.error, 422, 'validation');
      const db = getDb();
      const rows = matchStatement(db, parsed.rows);
      return {
        rows,
        totals: {
          lines: rows.length,
          matched: rows.filter((r) => r.suggestions.length > 0).length,
          unmatched: rows.filter((r) => r.suggestions.length === 0).length,
          duplicates: rows.filter((r) => r.alreadyBanked).length,
          value: Math.round(
            rows.reduce((sum, r) => sum + (r.line.amount ?? 0), 0) * 100,
          ) / 100,
        },
      };
    }

    const lines = input.lines ?? [];
    if (!lines.length) {
      throw new HttpError('Tick at least one statement line to bank.', 422, 'validation');
    }

    return runAtomicTransaction((db) => {
      const banked: string[] = [];
      const skipped: { line: number; reason: string }[] = [];
      const paymentIds: string[] = [];

      for (const line of lines) {
        const reservation = db.reservations.find((r) => r.id === line.reservationId);
        if (!reservation) {
          skipped.push({ line: line.index, reason: 'That booking no longer exists.' });
          continue;
        }
        if (reservation.status === 'cancelled') {
          skipped.push({ line: line.index, reason: `${reservation.reference} is cancelled.` });
          continue;
        }
        const dupe = db.payments.find(
          (p) =>
            p.reservationId === reservation.id &&
            p.reference.trim().toUpperCase() === line.reference.trim().toUpperCase() &&
            Math.abs(p.amount - line.amount) < 0.01,
        );
        if (dupe) {
          skipped.push({ line: line.index, reason: 'That reference is already in the ledger.' });
          continue;
        }
        try {
          const payment = recordPayment(db, session.user.id, {
            reservationId: reservation.id,
            amount: line.amount,
            method: line.method,
            kind: line.kind,
            reference: line.reference,
            paidAt: line.date ?? undefined,
            note: line.note || `Statement import · ${line.description || 'no narrative'}`,
            claimId: line.claimId ?? null,
          });
          banked.push(`${line.reference} → ${reservation.reference}`);
          paymentIds.push(payment.id);
        } catch (err) {
          skipped.push({
            line: line.index,
            reason: err instanceof Error ? err.message : 'Could not record this line.',
          });
        }
      }

      return {
        banked,
        skipped,
        paymentIds,
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
