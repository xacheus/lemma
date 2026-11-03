import type {
  Apartment,
  ApartmentAvailability,
  BookingStatus,
  CalendarCell,
  CleaningStatus,
  Database,
  DayStatus,
  Guest,
  HousekeepingTask,
  MaintenanceRecord,
  Reservation,
  Settings,
} from './types';
import { CONFIRMED_BOOKING_STATUSES } from './types';
import { addISO, dayDiff, eachISO } from './dates';
import { calculateStayPricing } from './pricing';

export type AvailabilitySource = Pick<
  Database,
  'apartments' | 'reservations' | 'housekeeping' | 'cleaningState'
> & {
  guests?: Guest[];
  maintenance?: MaintenanceRecord[];
  settings: Settings;
};

/* --------------------------------------------------------------------- primitives */

/**
 * Check-in date is included; check-out date is excluded from occupied nights.
 * A new guest may check in on the exact day an earlier guest checks out (`aOut === bIn`).
 */
export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

export function isHoldActive(r: Pick<Reservation, 'status' | 'holdExpiresAt'>, nowIso = new Date().toISOString()): boolean {
  if (r.status !== 'pending_confirmation') return false;
  if (!r.holdExpiresAt) return true;
  return r.holdExpiresAt > nowIso;
}

export function isConfirmed(status: BookingStatus): boolean {
  return CONFIRMED_BOOKING_STATUSES.includes(status);
}

/** True when a reservation actively blocks apartment inventory for its dates. */
export function holdsInventory(r: Pick<Reservation, 'status' | 'holdExpiresAt'>, nowIso = new Date().toISOString()): boolean {
  return isConfirmed(r.status) || isHoldActive(r, nowIso);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const n = dayDiff(checkIn, checkOut);
  return n > 0 ? n : 0;
}

export function stayTotal(nights: number, nightlyRate: number, discount = 0): number {
  return Math.max(0, Math.round((nights * nightlyRate - discount) * 100) / 100);
}

export function reservationCovers(reservation: Reservation, date: string): boolean {
  return reservation.checkIn <= date && date < reservation.checkOut;
}

export function isApartmentPublished(apartment: Apartment): boolean {
  if (apartment.publicationStatus) {
    return apartment.publicationStatus === 'published' && apartment.active;
  }
  return apartment.active;
}

export function sellingApartments(db: AvailabilitySource): Apartment[] {
  return db.apartments.filter((a) => isApartmentPublished(a) && !a.outOfService);
}

/**
 * Readiness rule enforcement (Section 11):
 * An apartment is ready for guest check-in ONLY when its cleaning status is
 * `clean` or `completed` (not `needs_cleaning`, `assigned`, `in_progress`,
 * `inspection_required`, or `maintenance`) AND no blocking maintenance ticket is open.
 */
export function checkApartmentReadiness(
  db: AvailabilitySource,
  apartmentId: string,
): { ready: boolean; status: CleaningStatus; reason: string | null } {
  const apartment = db.apartments.find((a) => a.id === apartmentId);
  if (!apartment || !apartment.active || apartment.outOfService) {
    return { ready: false, status: 'maintenance', reason: 'Apartment is out of service.' };
  }

  const blockingMaint = (db.maintenance ?? []).find(
    (m) => m.apartmentId === apartmentId && m.status !== 'resolved' && m.blocksReadiness,
  );
  if (blockingMaint) {
    return {
      ready: false,
      status: 'maintenance',
      reason: `Open maintenance fault (${blockingMaint.priority}): ${blockingMaint.faultDescription}`,
    };
  }

  const state = db.cleaningState[apartmentId]?.status ?? 'clean';
  if (state === 'clean' || state === 'completed') {
    return { ready: true, status: state, reason: null };
  }

  if (state === 'inspection_required') {
    return {
      ready: false,
      status: state,
      reason: 'Cleaning finished, but supervisor readiness inspection is still required before check-in.',
    };
  }

  if (state === 'maintenance') {
    return {
      ready: false,
      status: state,
      reason: 'Apartment has an active maintenance hold.',
    };
  }

  return {
    ready: false,
    status: state,
    reason: `Housekeeping turnover is currently "${state.replace(/_/g, ' ')}" — complete cleaning before check-in.`,
  };
}

export function blockedApartments(db: AvailabilitySource): Set<string> {
  const set = new Set<string>();
  for (const apt of db.apartments) {
    if (!isApartmentPublished(apt) || apt.outOfService) {
      set.add(apt.id);
      continue;
    }
    const state = db.cleaningState[apt.id];
    if (state?.status === 'maintenance') set.add(apt.id);
    const hasBlockingMaint = (db.maintenance ?? []).some(
      (m) => m.apartmentId === apt.id && m.status !== 'resolved' && m.blocksReadiness,
    );
    if (hasBlockingMaint) set.add(apt.id);
  }
  return set;
}

/* --------------------------------------------------------------------- conflicts */

export interface ConflictDetail {
  reservationId: string;
  reference: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
}

export interface AvailabilityResult {
  available: boolean;
  conflicts: ConflictDetail[];
  advisories: string[];
  reason?: 'invalid_dates' | 'out_of_service' | 'maintenance' | 'guest_capacity' | 'closed_dates' | 'lead_time';
}

function cleaningOn(db: AvailabilitySource, apartmentId: string, date: string): HousekeepingTask | null {
  return (
    db.housekeeping.find(
      (t) =>
        t.apartmentId === apartmentId &&
        t.date === date &&
        ['needs_cleaning', 'assigned', 'in_progress', 'inspection_required'].includes(t.status),
    ) ?? null
  );
}

export function checkAvailability(
  db: AvailabilitySource,
  input: {
    apartmentId: string;
    checkIn: string;
    checkOut: string;
    guestCount?: number;
    excludeReservationId?: string | null;
    today: string;
    allowPast?: boolean;
    allowUnpublishedForStaff?: boolean;
  },
): AvailabilityResult {
  const apartment = db.apartments.find((a) => a.id === input.apartmentId);
  if (!apartment) return { available: false, conflicts: [], advisories: [], reason: 'out_of_service' };

  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) return { available: false, conflicts: [], advisories: [], reason: 'invalid_dates' };
  if (!input.allowPast && input.checkIn < input.today) {
    return { available: false, conflicts: [], advisories: [], reason: 'closed_dates' };
  }
  const published = input.allowUnpublishedForStaff ? apartment.active : isApartmentPublished(apartment);
  if (!published) {
    return { available: false, conflicts: [], advisories: [], reason: 'out_of_service' };
  }
  if (input.guestCount && input.guestCount > apartment.maxGuests) {
    return { available: false, conflicts: [], advisories: [], reason: 'guest_capacity' };
  }

  const nowIso = new Date().toISOString();
  const state = db.cleaningState[apartment.id];
  const conflicts: ConflictDetail[] = [];

  for (const r of db.reservations) {
    if (r.apartmentId !== apartment.id) continue;
    if (r.id === input.excludeReservationId) continue;
    if (!holdsInventory(r, nowIso)) continue;
    if (!rangesOverlap(input.checkIn, input.checkOut, r.checkIn, r.checkOut)) continue;
    conflicts.push({
      reservationId: r.id,
      reference: r.reference,
      guestName: db.guests?.find((g) => g.id === r.guestId)?.fullName ?? '',
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
    });
  }

  const advisories: string[] = [];
  if (apartment.outOfService) {
    advisories.push(`${apartment.name} is out of service and cannot be sold.`);
    return { available: false, conflicts, advisories, reason: 'out_of_service' };
  }

  const openMaint = (db.maintenance ?? []).find(
    (m) => m.apartmentId === apartment.id && m.status !== 'resolved' && m.blocksReadiness,
  );
  if (openMaint || (state?.status === 'maintenance' && stateCoversDate(db, apartment.id, input.checkIn, input.checkOut))) {
    advisories.push(
      openMaint
        ? `${apartment.name} has an open maintenance block: ${openMaint.faultDescription}`
        : `${apartment.name} has an open maintenance job covering these dates.`,
    );
    return { available: false, conflicts, advisories, reason: 'maintenance' };
  }

  const sameDayCheckout = db.reservations.find(
    (r) =>
      r.apartmentId === apartment.id &&
      r.id !== input.excludeReservationId &&
      r.checkOut === input.checkIn &&
      isConfirmed(r.status),
  );
  const arrivalCleaning = cleaningOn(db, apartment.id, input.checkIn);
  if ((sameDayCheckout || arrivalCleaning) && !conflicts.length) {
    advisories.push(
      `Same-day turnover scheduled on ${input.checkIn} — housekeeping readiness must be completed before ${db.settings.booking.checkInTime} check-in.`,
    );
  }

  return { available: conflicts.length === 0, conflicts, advisories };
}

function stateCoversDate(db: AvailabilitySource, apartmentId: string, from: string, to: string): boolean {
  const openMaintenance = db.housekeeping.some(
    (t) => t.apartmentId === apartmentId && t.status === 'maintenance' && t.date >= from && t.date <= to,
  );
  if (openMaintenance) return true;
  return db.cleaningState[apartmentId]?.status === 'maintenance';
}

/* ----------------------------------------------------------------------- calendar */

export function dayStatus(db: AvailabilitySource, apartment: Apartment, date: string, today: string): CalendarCell {
  const base: CalendarCell = {
    date,
    status: 'available',
    reservationId: null,
    reservationRef: null,
    guestName: null,
    taskId: null,
    maintenanceId: null,
  };

  if (date < today) base.status = 'past';
  if (!apartment.active) return { ...base, status: 'out_of_service' };

  const nowIso = new Date().toISOString();
  const hit = db.reservations.find(
    (r) => r.apartmentId === apartment.id && reservationCovers(r, date) && holdsInventory(r, nowIso),
  );
  if (hit) {
    const guest = db.guests?.find((g) => g.id === hit.guestId);
    const status: DayStatus =
      hit.status === 'checked_in' || hit.checkOut <= today ? 'occupied' : 'reserved';
    return {
      ...base,
      status,
      reservationId: hit.id,
      reservationRef: hit.reference,
      guestName: guest?.fullName ?? 'Guest',
    };
  }

  const openMaint = (db.maintenance ?? []).find(
    (m) => m.apartmentId === apartment.id && m.status !== 'resolved' && m.blocksReadiness && date >= today,
  );
  if (openMaint) {
    return { ...base, status: 'maintenance', maintenanceId: openMaint.id };
  }

  const task = db.housekeeping.find((t) => t.apartmentId === apartment.id && t.date === date);
  if (task) {
    if (task.status === 'maintenance') return { ...base, status: 'maintenance', taskId: task.id };
    if (['needs_cleaning', 'assigned', 'in_progress', 'inspection_required'].includes(task.status)) {
      return { ...base, status: 'cleaning', taskId: task.id };
    }
  }

  if (apartment.outOfService) return { ...base, status: 'out_of_service' };

  const cancelled = db.reservations.find(
    (r) => r.apartmentId === apartment.id && reservationCovers(r, date) && r.status === 'cancelled',
  );
  if (cancelled && date >= today) return { ...base, status: 'cancelled' };
  return base;
}

export function calendarFor(
  db: AvailabilitySource,
  from: string,
  to: string,
  today: string,
  apartmentIds?: string[],
): ApartmentAvailability[] {
  const dates = eachISO(from, to);
  const pool = apartmentIds?.length
    ? db.apartments.filter((a) => apartmentIds.includes(a.id))
    : [...db.apartments].sort((a, b) => a.number - b.number);

  return pool.map((apartment) => {
    const cells = dates.map((date) => dayStatus(db, apartment, date, today));
    return {
      apartmentId: apartment.id,
      cells,
      nightsAvailable: cells.filter((c) => c.status === 'available').length,
    };
  });
}

/* ------------------------------------------------------------------- night snapshot */

export interface NightSnapshot {
  total: number;
  sellable: number;
  occupied: number;
  available: number;
  cleaning: number;
  maintenance: number;
  outOfService: number;
  occupancyRate: number;
}

export function snapshotForNight(db: AvailabilitySource, date: string): NightSnapshot {
  let occupied = 0;
  let cleaning = 0;
  let maintenance = 0;
  let outOfService = 0;
  let sellable = 0;
  const nowIso = new Date().toISOString();

  for (const apartment of db.apartments) {
    if (!apartment.active || apartment.outOfService) {
      outOfService += 1;
      continue;
    }
    sellable += 1;
    const isOccupied = db.reservations.some(
      (r) => r.apartmentId === apartment.id && reservationCovers(r, date) && holdsInventory(r, nowIso),
    );
    if (isOccupied) {
      occupied += 1;
      continue;
    }
    const blockingMaint = (db.maintenance ?? []).some(
      (m) => m.apartmentId === apartment.id && m.status !== 'resolved' && m.blocksReadiness,
    );
    const state = db.cleaningState[apartment.id];
    if (blockingMaint || state?.status === 'maintenance') {
      maintenance += 1;
    } else if (
      state &&
      ['needs_cleaning', 'assigned', 'in_progress', 'inspection_required'].includes(state.status)
    ) {
      cleaning += 1;
    }
  }

  const available = Math.max(0, sellable - occupied - cleaning - maintenance);
  return {
    total: db.apartments.length,
    sellable,
    occupied,
    available,
    cleaning,
    maintenance,
    outOfService,
    occupancyRate: sellable ? Math.round((occupied / sellable) * 100) : 0,
  };
}

export function cleaningStatusFor(db: AvailabilitySource, apartmentId: string, date: string): CleaningStatus {
  const state = db.cleaningState[apartmentId];
  if (state) return state.status;
  const task = db.housekeeping
    .filter((t) => t.apartmentId === apartmentId && t.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return task?.status ?? 'clean';
}

/* ------------------------------------------------------------------ public search */

export interface SearchOptions {
  checkIn: string;
  checkOut: string;
  guests: number;
  apartmentId?: string | null;
  category?: string | null;
  today: string;
}

export interface SearchHit {
  apartment: Apartment;
  nights: number;
  nightlyRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  depositDue: number;
  available: boolean;
  advisories: string[];
  blockedReason: string | null;
}

export function searchAvailability(
  db: AvailabilitySource,
  opts: SearchOptions,
): { hits: SearchHit[]; nights: number; valid: boolean; error: string | null } {
  const nights = nightsBetween(opts.checkIn, opts.checkOut);
  if (nights <= 0) {
    return { hits: [], nights: 0, valid: false, error: 'Check-out date must be after check-in date.' };
  }
  if (opts.checkIn < opts.today) {
    return { hits: [], nights, valid: false, error: 'Check-in date cannot be in the past.' };
  }
  const horizon = addISO(opts.today, db.settings.booking.maxAdvanceBookingDays);
  if (opts.checkIn > horizon) {
    return {
      hits: [],
      nights,
      valid: false,
      error: `Online reservations open up to ${db.settings.booking.maxAdvanceBookingDays} days ahead. Contact reception for extended corporate bookings.`,
    };
  }

  const pool = db.apartments.filter((a) => {
    if (!isApartmentPublished(a)) return false;
    if (opts.apartmentId && a.id !== opts.apartmentId) return false;
    if (opts.category && opts.category !== 'all' && a.tier !== opts.category) return false;
    return true;
  });

  const hits: SearchHit[] = pool
    .sort((a, b) => a.number - b.number)
    .map((apartment) => {
      const result = checkAvailability(db, {
        apartmentId: apartment.id,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        guestCount: opts.guests,
        today: opts.today,
      });
      const pricing = calculateStayPricing({
        apartment,
        settings: db.settings,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        guestCount: opts.guests,
      });

      let blockedReason: string | null = null;
      if (!result.available) {
        if (result.reason === 'guest_capacity') {
          blockedReason = `Maximum ${apartment.maxGuests} guests`;
        } else if (result.reason === 'maintenance' || result.reason === 'out_of_service') {
          blockedReason = 'Unavailable (maintenance / out of service)';
        } else {
          blockedReason = 'Reserved for selected dates';
        }
      }

      return {
        apartment,
        nights,
        nightlyRate: pricing.effectiveAverageRate,
        subtotal: pricing.subtotalAfterDiscount,
        taxAmount: pricing.taxAmount,
        total: pricing.totalAmount,
        depositDue: pricing.depositRequired,
        available: result.available && isApartmentPublished(apartment),
        advisories: result.advisories,
        blockedReason,
      };
    });

  return { hits, nights, valid: true, error: null };
}
