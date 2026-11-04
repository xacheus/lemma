import { addISO, dayDiff, eachISO, format, parseISO, startOfMonth, endOfMonth, startOfWeek, subMonths } from './dates';
import { nightsBetween, isConfirmed, reservationCovers, snapshotForNight, rangesOverlap, holdsInventory } from './availability';
import type {
  Database,
  Guest,
  ID,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Reservation,
  ReservationView,
} from './types';

/* --------------------------------------------------------------------- money rules */

export interface Financials {
  verifiedPaid: number;
  pendingVerification: number;
  refunds: number;
  balanceDue: number;
  depositDue: number;
  paymentStatus: PaymentStatus;
  receiptCount: number;
}

/**
 * Verified money only. A screenshot of an Airtel confirmation SMS is evidence, not
 * cash — `pendingVerification` is deliberately excluded from the balance so a
 * booking can never flip to "paid" without an authorised sign-off.
 */
export function financialsFor(db: Database, reservation: Reservation): Financials {
  const rows = db.payments.filter((p) => p.reservationId === reservation.id);
  let verifiedPaid = 0;
  let pendingVerification = 0;
  let refunds = 0;

  for (const p of rows) {
    if (p.kind === 'refund' || p.verificationStatus === 'refunded') {
      if (p.verificationStatus === 'verified' || p.verificationStatus === 'refunded') {
        refunds += p.amount;
      }
      continue;
    }
    if (p.verificationStatus === 'verified') {
      verifiedPaid += p.amount;
    } else if (p.verificationStatus === 'pending' || p.verificationStatus === 'pending_verification') {
      pendingVerification += p.amount;
    }
  }

  const net = verifiedPaid - refunds;
  const depositPercent = db.settings.booking.depositPercent;
  const depositDue = Math.round((reservation.totalAmount * depositPercent) / 100);

  let paymentStatus: PaymentStatus;
  if (refunds > 0 && net <= 0) paymentStatus = 'refunded';
  else if (net <= 0) paymentStatus = 'unpaid';
  else if (net + 0.001 >= reservation.totalAmount) paymentStatus = 'fully_paid';
  else paymentStatus = 'partially_paid';

  return {
    verifiedPaid: Math.max(0, net),
    pendingVerification,
    refunds,
    balanceDue: Math.max(0, Math.round((reservation.totalAmount - Math.max(0, net)) * 100) / 100),
    depositDue,
    paymentStatus,
    receiptCount: rows.filter((p) => p.kind !== 'refund' && p.verificationStatus !== 'rejected').length,
  };
}

/**
 * Recomputes derived fields on a reservation (payment status, and the booking
 * status auto-advance that reception does not have to remember to do).
 */
export function recomputeReservation(db: Database, reservationId: ID): Reservation | null {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) return null;
  r.nights = nightsBetween(r.checkIn, r.checkOut);
  if (
    (r.servicesTotal ?? 0) === 0 &&
    (r.extraGuestTotal ?? 0) === 0 &&
    (r.taxAmount ?? 0) === 0
  ) {
    r.totalAmount = Math.max(0, r.nights * r.nightlyRate - (r.discount || 0));
  }
  const f = financialsFor(db, r);
  r.paymentStatus = f.paymentStatus;

  /**
   * The money moves the booking, once, in the direction the deposit rules allow:
   *
   *   inquiry / pending_confirmation → reserved   as soon as verified money covers
   *                                               the deposit
   *   reserved                       → fully_paid  when verified money covers the stay
   *
   * It never walks backwards on its own: a booking that has been confirmed stays
   * confirmed, because the apartment is already being held for that guest. A verified
   * refund is a deliberate staff decision and is handled where the refund is issued.
   * Statuses a person set — checked_in, checked_out, cancelled — are never touched
   * here.
   */
  const depositSatisfied = f.verifiedPaid + 0.001 >= f.depositDue && f.depositDue > 0;
  const inventoryAvailable = !db.reservations.some((other) => other.id !== r.id && other.apartmentId === r.apartmentId && holdsInventory(other) && rangesOverlap(r.checkIn, r.checkOut, other.checkIn, other.checkOut));
  if ((r.status === 'inquiry' || r.status === 'pending_confirmation') && depositSatisfied && inventoryAvailable) {
    r.status = 'reserved';
    r.holdExpiresAt = null;
  }
  if (r.status === 'reserved' && f.paymentStatus === 'fully_paid') r.status = 'fully_paid';
  else if (r.status === 'fully_paid' && f.paymentStatus !== 'fully_paid' && !r.checkedInAt) {
    r.status = 'reserved';
  }

  // Keep any linked invoice balance synchronized with verified payments
  for (const inv of db.invoices ?? []) {
    if (inv.reservationId === r.id && inv.status !== 'void') {
      inv.verifiedPaid = f.verifiedPaid;
      inv.balanceDue = Math.max(0, inv.totalAmount - f.verifiedPaid);
      inv.status =
        inv.balanceDue <= 0
          ? 'paid'
          : f.verifiedPaid > 0
            ? 'partially_paid'
            : 'unpaid';
    }
  }

  r.updatedAt = new Date().toISOString();
  return r;
}

/**
 * Turns the ledger and the claim queue into the six words a guest understands.
 * Verified money always wins: a booking with no balance left is `approved` even if an
 * old claim sits in history.
 */
export function paymentStageFor(
  db: Database,
  r: Reservation,
  f: Financials,
): ReservationView['paymentStage'] {
  const claims = (db.paymentClaims ?? [])
    .filter((c) => c.reservationId === r.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (f.balanceDue <= 0) return 'approved';
  const open = claims.find((c) => c.status === 'awaiting_verification');
  if (open) {
    // "Proof submitted" until a person has actually opened it; staff opening the
    // queue stamps reviewedAt, which is what promotes it to under verification.
    const reviewed = Boolean(open.reviewedAt);
    return reviewed ? 'under_verification' : 'proof_submitted';
  }
  if (f.pendingVerification > 0) return 'under_verification';
  const latest = claims[0];
  // A declined proof is the guest's most recent news even when earlier money was
  // verified — they still have to send a readable screenshot. The money itself is
  // reported separately (verified, pending, balance), so nothing is hidden by this.
  if (latest?.status === 'rejected') return 'rejected';
  if (f.verifiedPaid > 0) return 'part_paid';
  return 'awaiting_payment';
}

export function decorate(db: Database, r: Reservation): ReservationView {
  const f = financialsFor(db, r);
  const today = db.__today;
  const guest = db.guests.find((g) => g.id === r.guestId) ?? null;
  const apartment = db.apartments.find((a) => a.id === r.apartmentId) ?? null;
  const readiness = apartment
    ? (db.cleaningState[apartment.id]?.status ?? 'clean')
    : 'clean';
  const unitReady =
    (readiness === 'clean' || readiness === 'completed') &&
    !(db.maintenance ?? []).some(
      (m) => m.apartmentId === r.apartmentId && m.status !== 'resolved' && m.blocksReadiness,
    );
  return {
    ...r,
    guest,
    apartment,
    verifiedPaid: f.verifiedPaid,
    pendingVerification: f.pendingVerification,
    refundsTotal: f.refunds,
    balanceDue: f.balanceDue,
    balanceIsSettled: f.balanceDue <= 0,
    depositDue: f.depositDue,
    depositPercent: db.settings.booking.depositPercent,
    isTodayCheckIn: r.checkIn === today && (r.status === 'reserved' || r.status === 'fully_paid'),
    isTodayCheckOut: r.checkOut === today && (r.status === 'checked_in' || r.status === 'checked_out'),
    isConfirmed: isConfirmed(r.status),
    canCheckIn:
      ['reserved', 'fully_paid'].includes(r.status) && dayDiff(today, r.checkIn) <= 0 && unitReady,
    canCheckOut: r.status === 'checked_in',
    receiptCount: f.receiptCount,
    paymentStage: paymentStageFor(db, r, f),
    latestClaim: (() => {
      const c = (db.paymentClaims ?? [])
        .filter((x) => x.reservationId === r.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      return c
        ? {
            id: c.id,
            amount: c.amount,
            method: c.method,
            reference: c.reference,
            status: c.status,
            createdAt: c.createdAt,
          }
        : null;
    })(),
  };
}

export function decorateAll(db: Database, rows: Reservation[] = db.reservations): ReservationView[] {
  return rows
    .map((r) => decorate(db, r))
    .sort((a, b) => (a.checkIn === b.checkIn ? a.reference.localeCompare(b.reference) : a.checkIn < b.checkIn ? 1 : -1));
}

/* --------------------------------------------------------------------- guest rollups */

export interface GuestSummary {
  guest: Guest;
  stays: number;
  nights: number;
  totalSpent: number;
  outstanding: number;
  nextArrival: string | null;
  lastDeparture: string | null;
  lifetimeValue: number;
  cancelled: number;
}

export function guestSummary(db: Database, guest: Guest): GuestSummary {
  const rows = db.reservations.filter((r) => r.guestId === guest.id);
  let totalSpent = 0;
  let outstanding = 0;
  let nights = 0;
  let stays = 0;
  let cancelled = 0;
  let nextArrival: string | null = null;
  let lastDeparture: string | null = null;

  for (const r of rows) {
    const f = financialsFor(db, r);
    if (r.status === 'cancelled') {
      cancelled += 1;
      // A forfeited deposit (verified money the property kept) is still revenue.
      totalSpent += Math.max(0, f.verifiedPaid);
      continue;
    }
    stays += 1;
    nights += r.nights;
    totalSpent += f.verifiedPaid;
    if (r.status !== 'checked_out') outstanding += f.balanceDue;
    if (r.checkIn >= db.__today && (!nextArrival || r.checkIn < nextArrival)) nextArrival = r.checkIn;
    if (r.checkOut <= db.__today && (!lastDeparture || r.checkOut > lastDeparture)) lastDeparture = r.checkOut;
  }

  return {
    guest,
    stays,
    nights,
    totalSpent: Math.max(0, totalSpent),
    outstanding,
    nextArrival,
    lastDeparture,
    lifetimeValue: Math.max(0, totalSpent),
    cancelled,
  };
}

/* ---------------------------------------------------------------------- dashboard */

export interface DashboardMetrics {
  today: string;
  snapshot: ReturnType<typeof snapshotForNight>;
  checkInsToday: ReservationView[];
  checkOutsToday: ReservationView[];
  upcoming: ReservationView[];
  recentPayments: (Payment & { guestName: string; reference: string; apartmentName: string })[];
  needsCleaning: {
    apartmentId: ID;
    apartmentName: string;
    apartmentNumber: number;
    status: string;
    taskId: ID | null;
    assignedToName: string | null;
    dueTime: string | null;
    guestName: string | null;
    checkedOutAt: string | null;
  }[];
  monthRevenue: number;
  monthRevenueTarget: number;
  pendingVerification: number;
  outstandingTotal: number;
  outstandingCount: number;
  monthOccupancyRate: number;
  nightsSoldMonth: number;
  roomNightsAvailableMonth: number;
  arrivalsThisMonth: number;
  cancellationsThisMonth: number;
  revenueSeries: { label: string; key: string; value: number }[];
  revenueDaily: { key: string; label: string; weekday: string; value: number }[];
  priorMonthToDate: number;
  daysElapsedInMonth: number;
  daysInMonth: number;
  occupancySeries: { label: string; key: string; rate: number; occupied: number; sellable: number }[];
  unreadNotifications: number;
  openMaintenance: number;
}

export function dashboard(db: Database): DashboardMetrics {
  const today = db.__today;
  const monthStart = format(startOfMonth(parseISO(today)), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(parseISO(today)), 'yyyy-MM-dd');

  const inMonth = (d: string) => d >= monthStart && d <= monthEnd;

  const checkInsToday = decorateAll(db, db.reservations.filter((r) => r.checkIn === today && ['reserved', 'fully_paid', 'checked_in'].includes(r.status))).sort(
    (a, b) => a.apartment!.number - b.apartment!.number,
  );
  const checkOutsToday = decorateAll(
    db,
    db.reservations.filter((r) => r.checkOut === today && (r.status === 'checked_in' || r.status === 'checked_out')),
  ).sort(
    (a, b) => a.apartment!.number - b.apartment!.number,
  );

  const horizon = addISO(today, 7);
  const upcoming = decorateAll(
    db,
    db.reservations
      .filter((r) => isConfirmed(r.status) && r.checkIn > today && r.checkIn <= horizon)
      .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1)),
  ).slice(0, 6);

  const verifiedThisMonth = db.payments.filter(
    (p) => p.verificationStatus === 'verified' && p.kind !== 'refund' && inMonth(p.paidAt),
  );
  const refundsThisMonth = db.payments
    .filter((p) => p.kind === 'refund' && p.verificationStatus === 'verified' && inMonth(p.paidAt))
    .reduce((s, p) => s + p.amount, 0);
  /** Money actually banked in the current month, net of refunds paid out. */
  const monthRevenue = verifiedThisMonth.reduce((sum, p) => sum + p.amount, 0) - refundsThisMonth;

  const pendingVerification = db.payments
    .filter(
      (p) =>
        (p.verificationStatus === 'pending' || p.verificationStatus === 'pending_verification') &&
        p.kind !== 'refund',
    )
    .reduce((s, p) => s + p.amount, 0);

  let outstandingTotal = 0;
  let outstandingCount = 0;
  for (const r of db.reservations) {
    if (!isConfirmed(r.status) || r.status === 'checked_out') continue;
    const f = financialsFor(db, r);
    if (f.balanceDue > 0) {
      outstandingTotal += f.balanceDue;
      outstandingCount += 1;
    }
  }

  const sellableCount = db.apartments.filter((a) => a.active && !a.outOfService).length;
  const daysInMonth = dayDiff(monthStart, monthEnd) + 1;
  const roomNightsAvailableMonth = sellableCount * daysInMonth;
  let nightsSoldMonth = 0;
  for (const date of eachISO(monthStart, monthEnd)) {
    const snap = snapshotForNight(db, date);
    nightsSoldMonth += snap.occupied + snap.cleaning * 0;
  }
  const monthOccupancyRate = roomNightsAvailableMonth
    ? Math.round((nightsSoldMonth / roomNightsAvailableMonth) * 100)
    : 0;

  // Trends: verified receipts and elapsed occupancy for the last six months.
  const revenueSeries: { label: string; key: string; value: number }[] = [];
  const occupancySeries: { label: string; key: string; rate: number; occupied: number; sellable: number }[] = [];
  const anchor = parseISO(today);
  for (let i = 5; i >= 0; i -= 1) {
    const cursor = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const key = format(cursor, 'yyyy-MM');
    const gross = db.payments
      .filter((p) => p.verificationStatus === 'verified' && p.paidAt.startsWith(key))
      .reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
    revenueSeries.push({ label: format(cursor, 'MMM yy'), key, value: gross });

    const mStart = format(startOfMonth(cursor), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(cursor), 'yyyy-MM-dd');
    // Same definition everywhere: room-nights on the books for the whole month.
    let sold = 0;
    for (const d of eachISO(mStart, mEnd)) sold += snapshotForNight(db, d).occupied;
    const sellableNights = sellableCount * (dayDiff(mStart, mEnd) + 1);
    occupancySeries.push({
      label: format(cursor, 'MMM yy'),
      key,
      rate: sellableNights ? Math.round((sold / sellableNights) * 100) : 0,
      occupied: sold,
      sellable: sellableNights,
    });
  }

  const needsCleaning = db.apartments
    .filter((a) => {
      const s = db.cleaningState[a.id];
      return (
        s &&
        ['needs_cleaning', 'assigned', 'in_progress', 'inspection_required', 'maintenance'].includes(s.status)
      );
    })
    .map((a) => {
      const task = db.housekeeping
        .filter((t) => t.apartmentId === a.id && t.status !== 'clean' && t.status !== 'completed')
        .sort((x, y) => (x.date < y.date ? 1 : -1))[0];
      const cleaner = task?.assignedTo ? db.staff.find((s) => s.id === task.assignedTo) : null;
      const departing = db.reservations.find((r) => r.apartmentId === a.id && r.checkOut === today && r.status === 'checked_in');
      return {
        apartmentId: a.id,
        apartmentName: a.name,
        apartmentNumber: a.number,
        status: db.cleaningState[a.id]?.status ?? 'clean',
        taskId: task?.id ?? null,
        assignedToName: cleaner?.name ?? null,
        dueTime: task?.dueTime ?? null,
        guestName: departing ? db.guests.find((g) => g.id === departing.guestId)?.fullName ?? null : null,
        checkedOutAt: departing?.checkedOutAt ?? null,
      };
    });

  const unreadNotifications = db.notifications.filter((n) => !n.readAt).length;
  const openMaintenance = Math.max(
    db.housekeeping.filter((t) => t.status === 'maintenance').length,
    (db.maintenance ?? []).filter((m) => m.status !== 'resolved').length,
  );

  const arrivalsThisMonth = db.reservations.filter((r) => inMonth(r.checkIn) && r.status !== 'cancelled').length;
  const cancellationsThisMonth = db.reservations.filter(
    (r) => r.cancelledAt && inMonth(r.cancelledAt.slice(0, 10)) && r.checkIn >= monthStart,
  ).length;

  // Daily banked revenue for the last fortnight — the honest shape of a small
  // property's cash flow, and it does not compare a part-finished month with
  // completed ones the way a monthly bar chart would.
  const revenueDaily = eachISO(addISO(today, -13), today).map((d) => ({
    key: d,
    label: format(parseISO(d), 'd MMM'),
    weekday: format(parseISO(d), 'EEE'),
    value: db.payments
      .filter((p) => p.paidAt === d && p.verificationStatus === 'verified')
      .reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0),
  }));

  // Month-to-date pace, compared with the previous month up to the same day.
  const priorMonthAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, Math.min(anchor.getDate(), 28));
  const priorKey = format(priorMonthAnchor, 'yyyy-MM');
  const priorMtdEnd = format(priorMonthAnchor, 'yyyy-MM-dd');
  const priorMonthToDate = db.payments
    .filter(
      (p) =>
        p.verificationStatus === 'verified' &&
        p.paidAt.startsWith(priorKey) &&
        p.paidAt <= priorMtdEnd,
    )
    .reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);

  return {
    today,
    revenueDaily,
    priorMonthToDate,
    daysElapsedInMonth: dayDiff(monthStart, today) + 1,
    daysInMonth: dayDiff(monthStart, monthEnd) + 1,
    snapshot: snapshotForNight(db, today),
    checkInsToday,
    checkOutsToday,
    upcoming,
    recentPayments: [...db.payments]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 6)
      .map((p) => {
        const r = db.reservations.find((x) => x.id === p.reservationId);
        const g = r ? db.guests.find((y) => y.id === r.guestId) : null;
        const apt = r ? db.apartments.find((y) => y.id === r.apartmentId) : null;
        return {
          ...p,
          guestName: g?.fullName ?? 'Unknown guest',
          reference: r?.reference ?? '—',
          apartmentName: apt ? `Apt ${apt.number} · ${apt.name}` : '—',
        };
      }),
    needsCleaning,
    monthRevenue,
    monthRevenueTarget: Math.round((monthRevenue || 1) * 1.15),
    pendingVerification,
    outstandingTotal,
    outstandingCount,
    monthOccupancyRate,
    nightsSoldMonth,
    roomNightsAvailableMonth,
    arrivalsThisMonth,
    cancellationsThisMonth,
    revenueSeries,
    occupancySeries,
    unreadNotifications,
    openMaintenance,
  };
}

/* ------------------------------------------------------------------------ reports */

export type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface ReportData {
  from: string;
  to: string;
  period: Period;
  revenue: number;
  revenuePrevious: number;
  revenueChangePct: number | null;
  paymentsCount: number;
  cashCollectedByMethod: { method: PaymentMethod; label: string; total: number; count: number }[];
  reservationsTotal: number;
  reservationsByStatus: { status: string; label: string; count: number }[];
  cancellations: number;
  cancellationRate: number;
  nightsSold: number;
  roomNightsAvailable: number;
  occupancyRate: number;
  adr: number;
  revpar: number;
  averageStay: number;
  outstandingTotal: number;
  outstandingRows: { reservationId: ID; reference: string; guestName: string; apartmentName: string; checkIn: string; balance: number; status: string }[];
  topApartments: { apartmentId: ID; name: string; number: number; nights: number; revenue: number; bookings: number; occupancyRate: number }[];
  series: { key: string; label: string; revenue: number; arrivals: number; departures: number; occupied: number; sellable: number }[];
  sources: { source: string; label: string; count: number; revenue: number }[];
}

export function buildReport(
  db: Database,
  input: { from: string; to: string; period: Period },
): ReportData {
  const { from, to } = input;
  const span = dayDiff(from, to) + 1;
  const prevTo = addISO(from, -1);
  const prevFrom = addISO(prevTo, -(span - 1));

  const inRange = (d: string) => d >= from && d <= to;

  const paymentsInRange = db.payments.filter(
    (p) => p.verificationStatus === 'verified' && p.kind !== 'refund' && inRange(p.paidAt),
  );
  const refundsInRange = db.payments.filter(
    (p) => p.verificationStatus === 'verified' && p.kind === 'refund' && inRange(p.paidAt),
  );
  const revenue =
    paymentsInRange.reduce((s, p) => s + p.amount, 0) - refundsInRange.reduce((s, p) => s + p.amount, 0);

  const prevPayments = db.payments.filter(
    (p) => p.verificationStatus === 'verified' && p.kind !== 'refund' && p.paidAt >= prevFrom && p.paidAt <= prevTo,
  );
  const revenuePrevious = prevPayments.reduce((s, p) => s + p.amount, 0);
  const revenueChangePct = revenuePrevious
    ? Math.round(((revenue - revenuePrevious) / revenuePrevious) * 1000) / 10
    : null;

  const methodTotals = db.settings.payments.methods.map((m) => {
    const rows = paymentsInRange.filter((p) => p.method === m.id);
    return {
      method: m.id,
      label: m.label,
      total: rows.reduce((s, p) => s + p.amount, 0),
      count: rows.length,
    };
  });

  const inRangeStays = db.reservations.filter(
    (r) => (inRange(r.checkIn) || inRange(r.checkOut) || (r.checkIn <= from && r.checkOut >= to)) && r.status !== 'inquiry',
  );
  const confirmedStays = inRangeStays.filter((r) => isConfirmed(r.status));
  const cancellations = db.reservations.filter((r) => r.status === 'cancelled' && inRange(r.checkIn)).length;

  const sellable = db.apartments.filter((a) => a.active && !a.outOfService).length;

  let nightsSold = 0;
  const series: ReportData['series'] = [];
  const occupancyByDate: Record<string, number> = {};
  for (const date of eachISO(from, to)) {
    const snap = snapshotForNight(db, date);
    occupancyByDate[date] = snap.occupied;
    nightsSold += snap.occupied;
  }
  const roomNightsAvailable = sellable * span;

  const allInRange = db.reservations.filter((r) => inRange(r.checkIn));
  const buckets = new Map<string, { revenue: number; arrivals: number; departures: number; occupied: number; days: number }>();
  const bucketKey = (d: string) =>
    input.period === 'day' ? d : input.period === 'week' ? format(startOfWeek(parseISO(d)), 'yyyy-MM-dd') : d.slice(0, 7);

  for (const date of eachISO(from, to)) {
    const key = bucketKey(date);
    const bucket = buckets.get(key) ?? { revenue: 0, arrivals: 0, departures: 0, occupied: 0, days: 0 };
    bucket.occupied += occupancyByDate[date] ?? 0;
    bucket.days += 1;
    bucket.revenue += db.payments
      .filter((p) => p.paidAt === date && p.verificationStatus === 'verified' && p.kind !== 'refund')
      .reduce((s, p) => s + p.amount, 0);
    bucket.arrivals += db.reservations.filter((r) => r.checkIn === date && isConfirmed(r.status)).length;
    bucket.departures += db.reservations.filter((r) => r.checkOut === date && r.status !== 'cancelled').length;
    buckets.set(key, bucket);
  }

  const seriesKeys = [...buckets.keys()].sort();
  for (const key of seriesKeys) {
    const b = buckets.get(key)!;
    series.push({
      key,
      label:
        input.period === 'day'
          ? format(parseISO(key), 'd MMM')
          : input.period === 'week'
            ? `w/c ${format(parseISO(key), 'd MMM')}`
            : input.period === 'year'
              ? key
              : format(parseISO(`${key}-01`), 'MMM yy'),
      revenue: b.revenue,
      arrivals: b.arrivals,
      departures: b.departures,
      occupied: b.occupied,
      sellable: sellable * b.days,
    });
  }

  const stayNights = confirmedStays.reduce((s, r) => s + r.nights, 0);
  const grossRoomRevenue = confirmedStays
    .filter((r) => r.checkIn >= from && r.checkIn <= to)
    .reduce((s, r) => s + r.totalAmount, 0);

  const outstandingRows = confirmedStays
    .map((r) => ({ r, f: financialsFor(db, r) }))
    .filter((x) => x.f.balanceDue > 0 && x.r.status !== 'checked_out')
    .map((x) => ({
      reservationId: x.r.id,
      reference: x.r.reference,
      guestName: db.guests.find((g) => g.id === x.r.guestId)?.fullName ?? '—',
      apartmentName: (() => {
        const a = db.apartments.find((y) => y.id === x.r.apartmentId);
        return a ? `Apt ${a.number} · ${a.name}` : '—';
      })(),
      checkIn: x.r.checkIn,
      balance: x.f.balanceDue,
      status: x.r.status,
    }))
    .sort((a, b) => b.balance - a.balance);

  const byApartment = new Map<ID, { nights: number; revenue: number; bookings: number }>();
  for (const r of confirmedStays) {
    const cur = byApartment.get(r.apartmentId) ?? { nights: 0, revenue: 0, bookings: 0 };
    cur.nights += r.nights;
    cur.revenue += financialsFor(db, r).verifiedPaid || r.totalAmount;
    cur.bookings += 1;
    byApartment.set(r.apartmentId, cur);
  }

  const topApartments = db.apartments
    .map((a) => {
      const agg = byApartment.get(a.id) ?? { nights: 0, revenue: 0, bookings: 0 };
      return {
        apartmentId: a.id,
        name: a.name,
        number: a.number,
        nights: agg.nights,
        revenue: agg.revenue,
        bookings: agg.bookings,
        occupancyRate: roomNightsAvailable ? Math.round((agg.nights / (span * 1)) * 100) : 0,
      };
    })
    .sort((x, y) => y.nights - x.nights);

  const bySource = new Map<string, { count: number; revenue: number }>();
  for (const r of allInRange) {
    const cur = bySource.get(r.source) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += r.status === 'cancelled' || r.status === 'inquiry' ? 0 : r.totalAmount;
    bySource.set(r.source, cur);
  }

  const statusCounts = ['inquiry', 'reserved', 'fully_paid', 'checked_in', 'checked_out', 'cancelled'].map((status) => ({
    status,
    label: status.replace(/_/g, ' '),
    count: db.reservations.filter((r) => r.status === status && inRange(r.checkIn)).length,
  }));

  const totalBookingsForRate = db.reservations.filter((r) => r.status !== 'inquiry' && inRange(r.checkIn)).length;

  return {
    from,
    to,
    period: input.period,
    revenue,
    revenuePrevious,
    revenueChangePct,
    paymentsCount: paymentsInRange.length,
    cashCollectedByMethod: methodTotals,
    reservationsTotal: totalBookingsForRate,
    reservationsByStatus: statusCounts,
    cancellations,
    cancellationRate: totalBookingsForRate ? Math.round((cancellations / totalBookingsForRate) * 100) : 0,
    nightsSold,
    roomNightsAvailable,
    occupancyRate: roomNightsAvailable ? Math.round((nightsSold / roomNightsAvailable) * 100) : 0,
    adr: stayNights ? Math.round(grossRoomRevenue / stayNights) : 0,
    revpar: sellable && span ? Math.round(revenue / (sellable * span)) : 0,
    averageStay: confirmedStays.length
      ? Math.round((confirmedStays.reduce((s, r) => s + r.nights, 0) / confirmedStays.length) * 10) / 10
      : 0,
    outstandingTotal: outstandingRows.reduce((s, r) => s + r.balance, 0),
    outstandingRows,
    topApartments,
    series,
    sources: [...bySource.entries()].map(([source, v]) => ({ source, label: source.replace(/_/g, ' '), ...v })),
  };
}

/** Nights actually slept inside a window, ignoring enquiries and cancellations. */
export function nightsBetweenSummary(
  rows: { nights: number; checkIn: string; checkOut: string; status: string }[],
  window?: [string, string],
): number {
  return rows.reduce((sum, r) => {
    if (r.status === 'cancelled' || r.status === 'inquiry') return sum;
    if (!window) return sum + r.nights;
    const from = r.checkIn < window[0] ? window[0] : r.checkIn;
    const capEnd = addISO(window[1], 1);
    const to = r.checkOut > capEnd ? capEnd : r.checkOut;
    return sum + Math.max(0, dayDiff(from, to));
  }, 0);
}

export function periodBounds(today: string, period: Period): { from: string; to: string } {
  if (period === 'day') return { from: today, to: today };
  if (period === 'week') {
    const s = format(startOfWeek(parseISO(today)), 'yyyy-MM-dd');
    return { from: s, to: addISO(s, 6) };
  }
  if (period === 'year') {
    return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  }
  const anchor = parseISO(today);
  if (period === 'month') {
    return { from: format(startOfMonth(anchor), 'yyyy-MM-dd'), to: format(endOfMonth(anchor), 'yyyy-MM-dd') };
  }
  return { from: addISO(today, -29), to: today };
}

export function trailingMonths(today: string, count: number) {
  const anchor = parseISO(today);
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(anchor, count - 1 - i);
    return {
      key: format(d, 'yyyy-MM'),
      label: format(d, 'MMM yy'),
      from: format(startOfMonth(d), 'yyyy-MM-dd'),
      to: format(endOfMonth(d), 'yyyy-MM-dd'),
    };
  });
}
