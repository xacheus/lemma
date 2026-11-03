import { snapshotForNight } from '../domain/availability';
import { businessToday } from '../domain/dates';
import type { DashboardSummaryDoc, Database } from '../domain/types';

/**
 * Trusted Backend Aggregation Engine (`settings/dashboard_summary`) — Section 14E
 *
 * Maintains pre-computed summary metrics whenever a booking, payment verification,
 * checkout, housekeeping turnover, or maintenance status mutates.
 *
 * CRITICAL FINANCIAL RULE:
 * `monthlyVerifiedRevenue` includes ONLY payments with `verificationStatus === 'verified'`
 * (net of verified refunds). Pending or rejected payments are NEVER included in revenue.
 */
export function computeDashboardSummary(db: Database): DashboardSummaryDoc {
  const today = db.__today || businessToday();
  const currentMonthKey = today.slice(0, 7);
  const monthlyVerifiedRevenue: Record<string, number> = {};

  let pendingVerificationAmount = 0;
  for (const p of db.payments) {
    if (p.verificationStatus === 'verified') {
      const mKey = p.paidAt.slice(0, 7);
      const signed = p.kind === 'refund' ? -p.amount : p.amount;
      monthlyVerifiedRevenue[mKey] = Math.round(((monthlyVerifiedRevenue[mKey] ?? 0) + signed) * 100) / 100;
    } else if (
      (p.verificationStatus === 'pending' || p.verificationStatus === 'pending_verification') &&
      p.kind !== 'refund'
    ) {
      pendingVerificationAmount += p.amount;
    }
  }

  const snap = snapshotForNight(db, today);
  const todayCheckInsCount = db.reservations.filter(
    (r) => r.checkIn === today && ['reserved', 'fully_paid', 'checked_in'].includes(r.status),
  ).length;
  const todayCheckOutsCount = db.reservations.filter(
    (r) => r.checkOut === today && ['checked_in', 'checked_out'].includes(r.status),
  ).length;

  const openMaintTickets = (db.maintenance ?? []).filter((m) => m.status !== 'resolved').length;
  const hkMaint = db.housekeeping.filter((t) => t.status === 'maintenance').length;

  const summary: DashboardSummaryDoc = {
    totalBookings: db.reservations.filter((r) => r.status !== 'cancelled').length,
    monthlyVerifiedRevenue,
    currentMonthKey,
    currentMonthRevenue: Math.max(0, monthlyVerifiedRevenue[currentMonthKey] ?? 0),
    occupiedCount: snap.occupied,
    availableApartments: snap.available,
    cleaningApartments: snap.cleaning,
    maintenanceApartments: snap.maintenance,
    todayCheckInsCount,
    todayCheckOutsCount,
    pendingVerificationAmount: Math.round(pendingVerificationAmount * 100) / 100,
    openMaintenanceCount: Math.max(openMaintTickets, hkMaint),
    updatedAt: new Date().toISOString(),
  };

  db.dashboardSummary = summary;
  return summary;
}
