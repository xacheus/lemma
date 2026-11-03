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
  Reservation,
  Settings,
} from './types';

/**
 * Everything the availability engine reads. The admin client keeps a copy of these
 * collections in memory, so the same functions drive the public search box, the
 * calendar and the server-side write guard without a database handle.
 */
export type AvailabilitySource = Pick<
  Database,
  'apartments' | 'reservations' | 'housekeeping' | 'cleaningState'
> & { guests?: Guest[]; settings: Settings };
import { CONFIRMED_BOOKING_STATUSES } from './types';
import { addISO, dayDiff, eachISO } from './dates';

/* --------------------------------------------------------------------- primitives */

/** Two stays clash when either starts before the other ends. Checkout day is free. */
export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

export function isConfirmed(status: BookingStatus): boolean {
  return CONFIRMED_BOOKING_STATUSES.includes(status);
}

/** Nights are counted in calendar days; a same-day booking is zero nights. */
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

export function sellingApartments(db: AvailabilitySource): Apartment[] {
  return db.apartments.filter((a) => a.active && !a.outOfService);
}

export function blockedApartments(db: AvailabilitySource): Set<string> {
  const set = new Set<string>();
  for (const apt of db.apartments) {
    if (!apt.active || apt.outOfService) {
      set.add(apt.id);
      continue;
    }
    const state = db.cleaningState[apt.id];
    if (state?.status === 'maintenance') set.add(apt.id);
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
  /** Non-blocking housekeeping advisories (e.g. turnover on the arrival date). */
  advisories: string[];
  reason?: 'invalid_dates' | 'out_of_service' | 'maintenance' | 'guest_capacity' | 'closed_dates' | 'lead_time';
}

function cleaningOn(db: AvailabilitySource, apartmentId: string, date: string): HousekeepingTask | null {
  return (
    db.housekeeping.find(
      (t) =>
        t.apartmentId === apartmentId &&
        t.date === date &&
        (t.status === 'needs_cleaning' || t.status === 'in_progress'),
    ) ?? null
  );
}

/**
 * The single source of truth for "can this apartment be sold for these nights?".
 * Every write path in the app funnels through here, so the public site and the
 * admin desk can never disagree about availability.
 */
export function checkAvailability(
  db: AvailabilitySource,
  input: {
    apartmentId: string;
    checkIn: string;
    checkOut: string;
    guestCount?: number;
    excludeReservationId?: string | null;
    /** Today's business date; passed in so callers stay pure/testable. */
    today: string;
    allowPast?: boolean;
  },
): AvailabilityResult {
  const apartment = db.apartments.find((a) => a.id === input.apartmentId);
  if (!apartment) return { available: false, conflicts: [], advisories: [], reason: 'out_of_service' };

  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) return { available: false, conflicts: [], advisories: [], reason: 'invalid_dates' };
  if (!input.allowPast && input.checkIn < input.today) {
    return { available: false, conflicts: [], advisories: [], reason: 'closed_dates' };
  }
  if (!apartment.active) {
    return { available: false, conflicts: [], advisories: [], reason: 'out_of_service' };
  }
  if (input.guestCount && input.guestCount > apartment.maxGuests) {
    return { available: false, conflicts: [], advisories: [], reason: 'guest_capacity' };
  }

  const state = db.cleaningState[apartment.id];
  const conflicts: ConflictDetail[] = [];
  for (const r of db.reservations) {
    if (r.apartmentId !== apartment.id) continue;
    if (r.id === input.excludeReservationId) continue;
    if (!isConfirmed(r.status)) continue;
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
    return { available: conflicts.length > 0, conflicts, advisories, reason: 'out_of_service' };
  }
  if (state?.status === 'maintenance' && stateCoversDate(db, apartment.id, input.checkIn, input.checkOut)) {
    advisories.push(`${apartment.name} has an open maintenance job covering these dates.`);
    return { available: false, conflicts, advisories, reason: 'maintenance' };
  }

  const arrivalCleaning = cleaningOn(db, apartment.id, input.checkIn);
  if (arrivalCleaning && !conflicts.length) {
    advisories.push(
      `Housekeeping has ${apartment.name} scheduled on the arrival date — reception will confirm readiness before ${db.settings.booking.checkInTime}.`,
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
  };

  if (date < today) base.status = 'past';

  if (!apartment.active) return { ...base, status: 'out_of_service' };

  const hit = db.reservations.find(
    (r) => r.apartmentId === apartment.id && reservationCovers(r, date) && isConfirmed(r.status),
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

  const cancelled = db.reservations.find(
    (r) => r.apartmentId === apartment.id && reservationCovers(r, date) && r.status === 'cancelled',
  );

  const task = db.housekeeping.find((t) => t.apartmentId === apartment.id && t.date === date);
  if (task) {
    if (task.status === 'maintenance') return { ...base, status: 'maintenance', taskId: task.id };
    if (task.status === 'needs_cleaning' || task.status === 'in_progress') {
      return { ...base, status: 'cleaning', taskId: task.id };
    }
  }

  if (apartment.outOfService) return { ...base, status: 'out_of_service' };
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

/** State of the building for the night of `date`. */
export function snapshotForNight(db: AvailabilitySource, date: string): NightSnapshot {
  let occupied = 0;
  let cleaning = 0;
  let maintenance = 0;
  let outOfService = 0;
  let sellable = 0;

  for (const apartment of db.apartments) {
    if (!apartment.active || apartment.outOfService) {
      outOfService += 1;
      continue;
    }
    sellable += 1;
    const isOccupied = db.reservations.some(
      (r) => r.apartmentId === apartment.id && reservationCovers(r, date) && isConfirmed(r.status),
    );
    if (isOccupied) {
      occupied += 1;
      continue;
    }
    const state = db.cleaningState[apartment.id];
    if (state?.status === 'maintenance') maintenance += 1;
    else if (state?.status === 'needs_cleaning' || state?.status === 'in_progress') cleaning += 1;
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

/** Cleaning status for an apartment that is checked out today and not re-let today. */
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
  today: string;
}

export interface SearchHit {
  apartment: Apartment;
  nights: number;
  nightlyRate: number;
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
    return { hits: [], nights: 0, valid: false, error: 'Check-out must be after check-in.' };
  }
  if (opts.checkIn < opts.today) {
    return { hits: [], nights, valid: false, error: 'Arrival date cannot be in the past.' };
  }
  const horizon = addISO(opts.today, db.settings.booking.maxAdvanceBookingDays);
  if (opts.checkIn > horizon) {
    return {
      hits: [],
      nights,
      valid: false,
      error: `We take bookings up to ${db.settings.booking.maxAdvanceBookingDays} nights ahead. Please contact reception for longer lead times.`,
    };
  }

  const pool = opts.apartmentId
    ? db.apartments.filter((a) => a.id === opts.apartmentId)
    : db.apartments.filter((a) => a.active);

  const depositPercent = db.settings.booking.depositPercent;

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
      const total = stayTotal(nights, apartment.nightlyRate);
      let blockedReason: string | null = null;
      if (!result.available) {
        if (result.reason === 'guest_capacity') {
          blockedReason = `Sleeps up to ${apartment.maxGuests}`;
        } else if (result.reason === 'maintenance' || result.reason === 'out_of_service') {
          blockedReason = 'Not available for these dates';
        } else {
          blockedReason = 'Already booked for these dates';
        }
      } else if (!apartment.active) {
        blockedReason = 'Not sold directly';
      }
      return {
        apartment,
        nights,
        nightlyRate: apartment.nightlyRate,
        total,
        depositDue: Math.round((total * depositPercent) / 100),
        available: result.available && apartment.active,
        advisories: result.advisories,
        blockedReason,
      };
    });

  return { hits, nights, valid: true, error: null };
}
