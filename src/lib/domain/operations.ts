import { randomUUID } from 'node:crypto';
import type {
  Apartment,
  BookingSource,
  BookingStatus,
  CleaningStatus,
  Database,
  Guest,
  HousekeepingTask,
  ID,
  NotificationChannel,
  GuestSubmittedPayment,
  NotificationRecord,
  Payment,
  PaymentMethod,
  Reservation,
  ReservationEvent,
  StaffUser,
} from './types';
import { checkAvailability, checkApartmentReadiness, nightsBetween, stayTotal } from './availability';
import { calculateStayPricing } from './pricing';
import { financialsFor, recomputeReservation } from './selectors';
import { addISO, dayDiff, formatMediumDate, businessToday, timeNow } from './dates';
import { hashPassword } from '../auth/passwords';
import { appendAuditLog, issueOfficialReceipt } from './production-ops';

/**
 * Business operations. Every write in the product — admin desk, cleaner portal,
 * public booking form — funnels through this module, so the rules below cannot be
 * bypassed by a client that misbehaves. They mutate the in-memory database in place
 * and are always called inside `mutate()` (see src/lib/db/store.ts).
 */

export class OperationError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: string = 'bad_request',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

const nowISO = () => new Date().toISOString();

function nextId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function actorName(db: Database, actorId: ID): string {
  const user = (db.users ?? []).find((u) => u.uid === actorId);
  if (user) return user.fullName;
  return db.staff.find((s) => s.id === actorId)?.name ?? 'System';
}

function log(db: Database, reservationId: ID, actorId: ID, label: string, detail?: string) {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) return;
  const event: ReservationEvent = { at: nowISO(), by: actorName(db, actorId), label, detail };
  r.history.unshift(event);
  r.updatedAt = nowISO();
}

/* --------------------------------------------------------------------- notifications */

export interface NotifyInput {
  event: NotificationRecord['event'];
  channel: NotificationChannel;
  title: string;
  body: string;
  recipientName: string;
  recipientContact: string;
  guestId?: ID | null;
  reservationId?: ID | null;
  apartmentId?: ID | null;
  scheduledFor?: string | null;
  actor?: string;
}

/**
 * Drafts a message. Nothing here pretends to deliver: with no provider connected
 * the record is stored as `not_connected` and reception sends it from their own
 * handset, then marks it sent. That is the honest state of the system.
 */
export function draftNotification(db: Database, input: NotifyInput): NotificationRecord {
  const record: NotificationRecord = {
    id: nextId('nt'),
    event: input.event,
    channel: input.channel,
    title: input.title,
    body: input.body,
    recipientName: input.recipientName,
    recipientContact: input.recipientContact,
    guestId: input.guestId ?? null,
    reservationId: input.reservationId ?? null,
    apartmentId: input.apartmentId ?? null,
    createdAt: nowISO(),
    scheduledFor: input.scheduledFor ?? null,
    deliveryStatus: input.channel === 'in_app' ? 'delivered_manually' : 'not_connected',
    deliveryDetail:
      input.channel === 'in_app'
        ? 'Recorded in the operations log — nothing left the building.'
        : 'No messaging provider is connected. Copy the text or open it in a handset, then mark it sent.',
    markedDeliveredAt: input.channel === 'in_app' ? nowISO() : null,
    markedDeliveredBy: input.actor ?? null,
    readAt: null,
    createdAutomatically: true,
  };
  db.notifications.unshift(record);
  return record;
}

function guestFirstName(guest: Guest) {
  return guest.fullName.split(' ')[0];
}

/* --------------------------------------------------------------------------- guests */

export function findOrCreateGuest(
  db: Database,
  input: {
    guestId?: ID;
    fullName?: string;
    phone?: string;
    email?: string;
    nationalId?: string;
    idType?: Guest['idType'];
    city?: string;
    company?: string;
    specialRequests?: string;
    internalNotes?: string;
    source?: Guest['source'];
  },
  onDuplicate: 'merge' | 'skip' = 'merge',
): Guest {
  if (input.guestId) {
    const existing = db.guests.find((g) => g.id === input.guestId);
    if (!existing) throw new OperationError('Guest record not found.', 404, 'not_found');
    return existing;
  }
  const phone = (input.phone ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  if (!input.fullName?.trim()) throw new OperationError('Guest full name is required.', 422, 'validation');
  if (!phone && !email) {
    throw new OperationError('Capture at least a phone number or an email so reception can reach the guest.', 422, 'validation');
  }
  const dupe = db.guests.find(
    (g) => (phone && g.phone.replace(/\s/g, '') === phone.replace(/\s/g, '')) || (email && g.email.toLowerCase() === email),
  );
  if (dupe) {
    if (onDuplicate === 'skip') return dupe;
    const patch: Partial<Guest> = {};
    if (input.nationalId && !dupe.nationalId) patch.nationalId = input.nationalId;
    if (input.city && !dupe.city) patch.city = input.city;
    if (input.specialRequests) patch.specialRequests = input.specialRequests;
    if (Object.keys(patch).length) Object.assign(dupe, patch);
    return dupe;
  }
  const guest: Guest = {
    id: nextId('gu'),
    fullName: input.fullName.trim(),
    phone: phone || '',
    email: email || '',
    nationalId: input.nationalId?.trim() || '',
    idType: input.idType ?? 'nrc',
    nationality: 'Zambian',
    city: input.city?.trim() || '',
    company: input.company?.trim() || '',
    vip: false,
    specialRequests: input.specialRequests ?? '',
    internalNotes: input.internalNotes ?? '',
    createdAt: nowISO(),
    source: input.source ?? 'website',
  };
  db.guests.unshift(guest);
  return guest;
}

export function updateGuest(db: Database, guestId: ID, patch: Partial<Guest>, actorId: ID): Guest {
  const guest = db.guests.find((g) => g.id === guestId);
  if (!guest) throw new OperationError('Guest record not found.', 404, 'not_found');
  const editable: (keyof Guest)[] = [
    'fullName',
    'phone',
    'email',
    'nationalId',
    'idType',
    'nationality',
    'city',
    'company',
    'vip',
    'specialRequests',
    'internalNotes',
  ];
  for (const key of editable) {
    if (patch[key] !== undefined) (guest as unknown as Record<string, unknown>)[key] = patch[key];
  }
  void actorId;
  return guest;
}

/* ---------------------------------------------------------------------- reservations */

export interface ReservationInput {
  guestId?: ID;
  userId?: ID | null;
  guest?: Parameters<typeof findOrCreateGuest>[1];
  apartmentId: ID;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  nightlyRate?: number;
  discount?: number;
  selectedServiceIds?: string[];
  status?: BookingStatus;
  source: BookingSource;
  notes?: string;
  arrivalTime?: string;
  /** Public submissions are requests until reception accepts them. */
  asInquiry?: boolean;
  initialDeposit?: { amount: number; method: PaymentMethod; reference?: string } | null;
}

function assertAvailability(
  db: Database,
  args: { apartmentId: ID; checkIn: string; checkOut: string; guestCount: number; excludeReservationId?: ID | null; source: BookingSource },
) {
  const result = checkAvailability(db, {
    apartmentId: args.apartmentId,
    checkIn: args.checkIn,
    checkOut: args.checkOut,
    guestCount: args.guestCount,
    excludeReservationId: args.excludeReservationId ?? null,
    today: today(db),
    // A walk-in arriving today, or a reception correction to a stay already running,
    // must be allowed to start on a past-dated check-in.
    allowPast: args.source === 'walk_in' || !!args.excludeReservationId,
  });
  if (result.available) return result;

  if (result.reason === 'invalid_dates') {
    throw new OperationError('Check-out must be at least one night after check-in.', 422, 'validation');
  }
  if (result.reason === 'guest_capacity') {
    const apt = db.apartments.find((a) => a.id === args.apartmentId);
    throw new OperationError(
      `${apt?.name ?? 'That apartment'} sleeps a maximum of ${apt?.maxGuests ?? 0} guests.`,
      422,
      'capacity',
    );
  }
  if (result.reason === 'closed_dates') {
    throw new OperationError('Arrival date is in the past. Set the source to Walk-in to backdate a stay.', 422, 'validation');
  }
  if (result.reason === 'out_of_service') {
    throw new OperationError('That apartment is not available for sale.', 409, 'out_of_service');
  }
  if (result.reason === 'lead_time') {
    throw new OperationError(
      'Same-day arrival is blocked because housekeeping turnover or inspection is still in progress on this unit.',
      409,
      'readiness_blocked',
    );
  }
  if (result.reason === 'maintenance') {
    throw new OperationError(
      'An open maintenance job holds this apartment. Clear it in Housekeeping or pick another unit.',
      409,
      'maintenance_hold',
    );
  }
  const conflict = result.conflicts[0];
  throw new OperationError(
    `${db.apartments.find((a) => a.id === args.apartmentId)?.name ?? 'This apartment'} is already booked ${formatMediumDate(
      conflict?.checkIn,
    )} – ${formatMediumDate(conflict?.checkOut)}${conflict ? ` (${conflict.reference})` : ''}. Choose another unit or different dates.`,
    409,
    'date_conflict',
    { conflicts: result.conflicts },
  );
}

export function today(db: Database): string {
  return db.__today || businessToday();
}

export function createReservation(db: Database, actorId: ID, input: ReservationInput): Reservation {
  const apartment = db.apartments.find((a) => a.id === input.apartmentId);
  if (!apartment) throw new OperationError('Select an apartment.', 422, 'validation');
  const guest = findOrCreateGuest(db, input.guest ?? { guestId: input.guestId });
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) throw new OperationError('Check-out must be after check-in.', 422, 'validation');
  if (input.guestCount < 1) throw new OperationError('A booking needs at least one guest.', 422, 'validation');

  assertAvailability(db, {
    apartmentId: apartment.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    source: input.source,
  });

  const pricing = calculateStayPricing({
    apartment,
    settings: db.settings,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    overrideNightlyRate: input.nightlyRate ?? null,
    manualDiscount: input.discount ?? 0,
    selectedServiceIds: input.selectedServiceIds,
  });

  const nightlyRate = input.nightlyRate ?? pricing.effectiveAverageRate;
  const discount = Math.max(0, pricing.totalDiscount);
  const total =
    input.nightlyRate !== undefined && !(input.selectedServiceIds?.length)
      ? stayTotal(nights, nightlyRate, Math.max(0, input.discount ?? 0))
      : pricing.totalAmount;

  const seq = db.sequences.reservation++;
  const reference = `LHA-${input.checkIn.slice(0, 4)}-${String(seq).padStart(4, '0')}`;
  const autoConfirm = db.settings.booking.autoConfirmPublicRequests;
  const status: BookingStatus = input.asInquiry && !autoConfirm ? 'inquiry' : (input.status ?? 'reserved');
  const holdMins = db.settings.booking.holdDurationMinutes ?? 240;
  const linkedUserId =
    input.userId ??
    guest.userId ??
    (guest.email
      ? (db.users ?? []).find((u) => u.email.toLowerCase() === guest.email.toLowerCase())?.uid ?? null
      : null);

  const reservation: Reservation = {
    id: nextId('rv'),
    reference,
    userId: linkedUserId,
    guestId: guest.id,
    apartmentId: apartment.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    nightlyRate,
    nights,
    extraGuestTotal: input.nightlyRate !== undefined ? 0 : pricing.extraGuestTotal,
    selectedServices: pricing.selectedServices,
    servicesTotal: pricing.servicesTotal,
    taxRatePercent: pricing.taxRatePercent,
    taxAmount: pricing.taxAmount,
    totalAmount: total,
    discount: input.nightlyRate !== undefined ? Math.max(0, input.discount ?? 0) : discount,
    status,
    paymentStatus: 'unpaid',
    source: input.source,
    arrivalTime: input.arrivalTime || db.settings.booking.checkInTime,
    notes: input.notes ?? '',
    holdExpiresAt:
      status === 'pending_confirmation'
        ? new Date(Date.now() + holdMins * 60 * 1000).toISOString()
        : null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    createdBy: actorId,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    cancellationReason: null,
    history: [
      {
        at: nowISO(),
        by: actorName(db, actorId),
        label: status === 'inquiry' ? 'Booking request received' : 'Reservation created',
        detail: `Apartment ${apartment.number} · ${nights} night${nights === 1 ? '' : 's'} · source ${input.source.replace(/_/g, ' ')}`,
      },
    ],
  };
  db.reservations.unshift(reservation);

  appendAuditLog(db, {
    category: 'booking',
    action: 'booking.created',
    actorUid: actorId,
    targetType: 'booking',
    targetId: reservation.id,
    summary: `Created booking ${reference} for ${guest.fullName} (Apt ${apartment.number}, ${input.checkIn} to ${input.checkOut}, K${total.toLocaleString('en-US')}).`,
  });

  if (input.initialDeposit && input.initialDeposit.amount > 0) {
    recordPayment(db, actorId, {
      reservationId: reservation.id,
      amount: input.initialDeposit.amount,
      method: input.initialDeposit.method,
      kind: 'deposit',
      reference: input.initialDeposit.reference ?? '',
      note: 'Deposit declared with the online booking request.',
    });
  }

  if (status === 'inquiry') {
    draftNotification(db, {
      event: 'booking_request',
      channel: 'in_app',
      title: `New website request · ${reference}`,
      body: `${guest.fullName} asked for Apartment ${apartment.number} (${apartment.name}) from ${formatMediumDate(input.checkIn)} to ${formatMediumDate(
        input.checkOut,
      )} for ${input.guestCount} guest${input.guestCount > 1 ? 's' : ''}. Accept the request to hold these dates.`,
      recipientName: 'Front office',
      recipientContact: 'in-app',
      guestId: guest.id,
      reservationId: reservation.id,
      apartmentId: apartment.id,
    });
  } else {
    if (db.settings.notifications.sendBookingConfirmation) {
      draftNotification(db, {
        event: 'booking_confirmation',
        channel: 'whatsapp',
        title: `Booking confirmed · ${reference}`,
        body: `Hello ${guestFirstName(guest)}, your apartment booking has been confirmed. Your check-in date is ${formatMediumDate(
          input.checkIn,
        )} and check-out is ${formatMediumDate(input.checkOut)}. Apartment ${apartment.number} — ${apartment.name}. Thank you for choosing us.`,
        recipientName: guest.fullName,
        recipientContact: guest.phone,
        guestId: guest.id,
        reservationId: reservation.id,
        apartmentId: apartment.id,
      });
    }
  }

  recomputeReservation(db, reservation.id);
  return reservation;
}

export function updateReservation(
  db: Database,
  actorId: ID,
  reservationId: ID,
  patch: Partial<ReservationInput>,
): Reservation {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Reservation not found.', 404, 'not_found');
  if (r.status === 'checked_out') {
    throw new OperationError('This stay is closed. Re-open it before amending dates or price.', 409, 'closed_folio');
  }

  const apartmentId = patch.apartmentId ?? r.apartmentId;
  const checkIn = patch.checkIn ?? r.checkIn;
  const checkOut = patch.checkOut ?? r.checkOut;
  const guestCount = patch.guestCount ?? r.guestCount;
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) throw new OperationError('Check-out must be after check-in.', 422, 'validation');

  const changingInventory = checkIn !== r.checkIn || checkOut !== r.checkOut || apartmentId !== r.apartmentId;
  if (changingInventory) {
    assertAvailability(db, {
      apartmentId,
      checkIn,
      checkOut,
      guestCount,
      excludeReservationId: r.id,
      source: r.source,
    });
    if (r.status === 'checked_in' && (checkIn > today(db) || checkOut <= today(db))) {
      throw new OperationError(
        'The guest is in residence — check them out before moving the stay to different dates.',
        409,
        'in_residence',
      );
    }
  }

  if (patch.guest?.fullName || patch.guestId) {
    const guest = findOrCreateGuest(db, patch.guest ?? { guestId: patch.guestId });
    if (guest.id !== r.guestId) {
      r.guestId = guest.id;
      log(db, r.id, actorId, 'Guest changed', `Now registered to ${guest.fullName}`);
    }
  }

  const before = { checkIn: r.checkIn, checkOut: r.checkOut, apartmentId: r.apartmentId, nightlyRate: r.nightlyRate, guestCount: r.guestCount, discount: r.discount };
  r.apartmentId = apartmentId;
  r.checkIn = checkIn;
  r.checkOut = checkOut;
  r.guestCount = guestCount;
  r.nightlyRate = patch.nightlyRate ?? r.nightlyRate;
  r.discount = Math.max(0, patch.discount ?? r.discount);
  r.notes = patch.notes !== undefined ? patch.notes : r.notes;
  r.source = (patch.source as BookingSource) ?? r.source;
  r.arrivalTime = patch.arrivalTime ?? r.arrivalTime;
  if (patch.status && patch.status !== r.status) r.status = patch.status;
  r.nights = nightsBetween(r.checkIn, r.checkOut);
  r.totalAmount = stayTotal(r.nights, r.nightlyRate, r.discount);

  if (
    changingInventory &&
    (before.checkIn !== r.checkIn || before.checkOut !== r.checkOut || before.apartmentId !== r.apartmentId)
  ) {
    const apt = db.apartments.find((a) => a.id === r.apartmentId);
    log(
      db,
      r.id,
      actorId,
      'Stay amended',
      `${formatMediumDate(before.checkIn)}–${formatMediumDate(before.checkOut)} in Apt ${
        db.apartments.find((a) => a.id === before.apartmentId)?.number
      } moved to ${formatMediumDate(r.checkIn)}–${formatMediumDate(r.checkOut)} in Apt ${apt?.number}`,
    );
    if (db.settings.notifications.sendBookingConfirmation) {
      const guest = db.guests.find((g) => g.id === r.guestId);
      if (guest) {
        draftNotification(db, {
          event: 'reservation_modified',
          channel: 'whatsapp',
          title: `Booking amended · ${r.reference}`,
          body: `Hello ${guestFirstName(guest)}, your stay with us has been changed to ${formatMediumDate(r.checkIn)} – ${formatMediumDate(
            r.checkOut,
          )} in Apartment ${apt?.number} (${apt?.name}). Your new total is K${r.totalAmount.toLocaleString('en-US')}. Reply with any questions.`,
          recipientName: guest.fullName,
          recipientContact: guest.phone,
          guestId: guest.id,
          reservationId: r.id,
          apartmentId: r.apartmentId,
        });
      }
    }
  }

  recomputeReservation(db, r.id);
  return r;
}

export function setReservationStatus(
  db: Database,
  actorId: ID,
  reservationId: ID,
  status: BookingStatus,
  note?: string,
): Reservation {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Reservation not found.', 404, 'not_found');
  const allowed: Record<BookingStatus, BookingStatus[]> = {
    inquiry: ['pending_confirmation', 'reserved', 'cancelled'],
    pending_confirmation: ['reserved', 'fully_paid', 'cancelled'],
    reserved: ['fully_paid', 'checked_in', 'cancellation_requested', 'cancelled'],
    fully_paid: ['checked_in', 'reserved', 'cancellation_requested', 'cancelled'],
    checked_in: ['checked_out'],
    checked_out: [],
    cancellation_requested: ['reserved', 'fully_paid', 'cancelled'],
    cancelled: ['reserved'],
  };
  if (!(allowed[r.status] ?? []).includes(status)) {
    throw new OperationError(
      `Cannot move a ${r.status.replace(/_/g, ' ')} booking to ${status.replace(/_/g, ' ')}.`,
      409,
      'bad_transition',
    );
  }
  const beforeStatus = r.status;
  r.status = status;
  log(db, r.id, actorId, `Status → ${status.replace(/_/g, ' ')}`, note);
  recomputeReservation(db, r.id);
  appendAuditLog(db, {
    category: 'booking',
    action: 'booking.status_changed',
    actorUid: actorId,
    targetType: 'booking',
    targetId: r.id,
    summary: `Booking ${r.reference} status changed from ${beforeStatus} to ${status}.`,
    before: { status: beforeStatus },
    after: { status },
  });
  return r;
}

export function checkInReservation(db: Database, actorId: ID, reservationId: ID, arrivalTime?: string): Reservation {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Reservation not found.', 404, 'not_found');
  if (!['reserved', 'fully_paid'].includes(r.status)) {
    throw new OperationError(`Only a reserved or paid booking can be checked in (this one is ${r.status.replace(/_/g, ' ')}).`, 409, 'bad_transition');
  }
  if (r.checkIn > today(db)) {
    throw new OperationError(`Arrival is ${formatMediumDate(r.checkIn)} — check-in opens on the day of arrival.`, 409, 'too_early');
  }
  const readiness = checkApartmentReadiness(db, r.apartmentId);
  if (!readiness.ready) {
    throw new OperationError(
      readiness.reason || 'Apartment is not yet marked clean and ready for check-in.',
      409,
      'readiness_blocked',
    );
  }
  r.status = 'checked_in';
  r.checkedInAt = nowISO();
  r.arrivalTime = arrivalTime || timeNow();
  log(db, r.id, actorId, 'Checked in', `Keys issued at ${r.arrivalTime} · ${r.guestCount} guest${r.guestCount > 1 ? 's' : ''}`);
  if (db.settings.housekeeping.autoAssignCleaner) {
    ensureStayoverTask(db, r, actorId);
  }
  recomputeReservation(db, r.id);
  appendAuditLog(db, {
    category: 'booking',
    action: 'booking.checked_in',
    actorUid: actorId,
    targetType: 'booking',
    targetId: r.id,
    summary: `Checked in ${r.reference} at ${r.arrivalTime}.`,
  });
  return r;
}

export function checkOutReservation(db: Database, actorId: ID, reservationId: ID): Reservation {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Reservation not found.', 404, 'not_found');
  if (r.status !== 'checked_in') {
    throw new OperationError('Only a booking the guest has actually arrived on can be checked out.', 409, 'bad_transition');
  }
  r.status = 'checked_out';
  r.checkedOutAt = nowISO();
  const banked = db.payments
    .filter((p) => p.reservationId === r.id && p.verificationStatus === 'verified' && p.kind !== 'refund')
    .reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, r.totalAmount - banked);
  log(
    db,
    r.id,
    actorId,
    'Checked out',
    balance > 0
      ? `Folio closed with an outstanding balance of K${balance.toLocaleString('en-US')} — moved to the debtors list`
      : 'Folio closed and settled',
  );
  openTurnoverTask(db, r, actorId);
  recomputeReservation(db, r.id);
  return r;
}

export function cancelReservation(
  db: Database,
  actorId: ID,
  reservationId: ID,
  reason: string,
  opts: { refund?: boolean; refundMethod?: PaymentMethod } = {},
): Reservation {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Reservation not found.', 404, 'not_found');
  if (r.status === 'cancelled') throw new OperationError('This booking is already cancelled.', 409, 'already_cancelled');
  if (r.status === 'checked_out') throw new OperationError('A completed stay cannot be cancelled.', 409, 'closed_folio');

  const priorStatus = r.status;
  r.status = 'cancelled';
  r.cancelledAt = nowISO();
  r.cancellationReason = reason;
  r.history.unshift({
    at: nowISO(),
    by: actorName(db, actorId),
    label: 'Cancelled',
    detail: reason || 'No reason captured',
  });

  const paid = db.payments
    .filter((p) => p.reservationId === r.id && p.verificationStatus === 'verified' && p.kind !== 'refund')
    .reduce((s, p) => s + p.amount, 0);

  if (opts.refund && paid > 0) {
    const refundAmount = Math.min(paid, r.totalAmount);
    db.payments.unshift({
      id: nextId('pay'),
      reservationId: r.id,
      amount: refundAmount,
      method: opts.refundMethod ?? 'airtel_money',
      kind: 'refund',
      reference: `RF-${randomUUID().slice(0, 8).toUpperCase()}`,
      paidAt: today(db),
      recordedBy: actorId,
      recordedByName: actorName(db, actorId),
      verificationStatus: 'verified',
      verifiedBy: actorName(db, actorId),
      verifiedAt: nowISO(),
      verificationNote: 'Refund authorised at cancellation.',
      proof: null,
      note: `Refund of K${refundAmount.toLocaleString('en-US')} on cancellation of ${r.reference}.`,
      createdAt: nowISO(),
    });
  } else if (paid > 0) {
    r.history.unshift({
      at: nowISO(),
      by: actorName(db, actorId),
      label: 'Deposit retained',
      detail: `K${paid.toLocaleString('en-US')} banked and not refunded under the cancellation policy.`,
    });
  }

  const guest = db.guests.find((g) => g.id === r.guestId);
  if (guest && db.settings.notifications.sendCancellationNotice) {
    draftNotification(db, {
      event: 'cancellation',
      channel: 'whatsapp',
      title: `Booking cancelled · ${r.reference}`,
      body: `Hello ${guestFirstName(guest)}, your booking for ${formatMediumDate(r.checkIn)} – ${formatMediumDate(
        r.checkOut,
      )} has been cancelled. ${
        opts.refund && paid > 0
          ? `A refund of K${paid.toLocaleString('en-US')} will be sent to your ${opts.refundMethod === 'bank_transfer' ? 'bank account' : 'mobile money number'} within two business days.`
          : paid > 0
            ? 'Your deposit has been retained under our cancellation policy.'
            : 'No payment had been received, so nothing is owed either way.'
      } You are welcome to rebook whenever suits.`,
      recipientName: guest.fullName,
      recipientContact: guest.phone,
      guestId: guest.id,
      reservationId: r.id,
      apartmentId: r.apartmentId,
    });
  }

  // Release the cleaning job that was waiting on this departure, if any.
  for (const task of db.housekeeping) {
    if (task.reservationId === r.id && (task.status === 'needs_cleaning' || task.status === 'in_progress') && priorStatus !== 'checked_in') {
      task.status = 'clean';
      task.completedAt = nowISO();
      task.notes.unshift({ at: nowISO(), by: actorId, byName: actorName(db, actorId), text: 'Booking cancelled before arrival — no turnover needed.' });
      db.cleaningState[task.apartmentId] = { status: 'clean', updatedAt: nowISO(), note: 'Cancellation before arrival.' };
    }
  }

  recomputeReservation(db, r.id);
  return r;
}

/* -------------------------------------------------------------------------- payments */

export interface PaymentInput {
  reservationId: ID;
  amount: number;
  method: PaymentMethod;
  kind: Payment['kind'];
  reference?: string;
  paidAt?: string;
  note?: string;
  proof?: { fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null;
  /** Set when the receipt is being banked from a guest's submitted claim. */
  claimId?: ID | null;
}

/**
 * What the guest is asked to pay, and which channels they may use.
 *
 * The business decides the channels (Settings → Payments): which exist, their
 * details and the default. The guest chooses from those channels when they pay.
 * `lockMethodToAdmin` flips that around so reception assigns the channel instead —
 * both are supported, and the guest's screens read this object rather than
 * hard-coding an assumption.
 */
export interface PaymentQuote {
  reservationId: ID;
  reference: string;
  totalAmount: number;
  verifiedPaid: number;
  pendingAmount: number;
  balanceDue: number;
  depositPercent: number;
  /** The amount we suggest next (deposit if nothing is paid, else the balance). */
  suggestedAmount: number;
  allowPartial: boolean;
  guestChoosesMethod: boolean;
  defaultMethod: PaymentMethod;
  methods: {
    id: PaymentMethod;
    label: string;
    instructions: string;
    accountLabel: string;
    accountNumber: string;
  }[];
  openClaim: GuestSubmittedPayment | null;
  claims: GuestSubmittedPayment[];
  proofUploadEnabled: boolean;
}

export function paymentQuote(db: Database, reservation: Reservation): PaymentQuote {
  const folio = recomputeReservation(db, reservation.id) ?? reservation;
  const own = (db.paymentClaims ?? []).filter((c) => c.reservationId === reservation.id);
  const financials = financialsFor(db, folio);
  const pendingAmount = financials.pendingVerification;
  const verifiedPaid = financials.verifiedPaid;
  const totalAmount = folio.totalAmount;
  const balanceDue = Math.max(0, Math.round(financials.balanceDue * 100) / 100);
  const depositPercent = db.settings.booking.depositPercent;
  const depositAmount = Math.round((totalAmount * depositPercent) / 100);
  const settings = db.settings.payments;

  return {
    reservationId: reservation.id,
    reference: reservation.reference,
    totalAmount,
    verifiedPaid,
    pendingAmount,
    balanceDue,
    depositPercent,
    suggestedAmount:
      balanceDue <= 0 ? 0 : verifiedPaid === 0 ? Math.min(depositAmount, balanceDue) : balanceDue,
    allowPartial: settings.allowPartialPayments !== false,
    guestChoosesMethod: !settings.lockMethodToAdmin,
    defaultMethod:
      settings.defaultMethod ??
      (settings.methods.find((m) => m.enabled)?.id as PaymentMethod | undefined) ??
      'airtel_money',
    methods: settings.methods
      .filter((m) => m.enabled)
      .map((m) => ({
        id: m.id as PaymentMethod,
        label: m.label,
        instructions: m.instructions,
        accountLabel: m.accountLabel,
        accountNumber: m.accountNumber,
      })),
    openClaim: own.find((c) => c.status === 'awaiting_verification') ?? null,
    claims: [...own].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    proofUploadEnabled: settings.proofUploadEnabled,
  };
}

/**
 * A guest records what they paid, in the channel they chose, with the reference the
 * provider gave them. This is a claim: nothing is banked and no balance moves.
 * Reception verifies it, which is the only path to `recordPayment`.
 */
export function submitPaymentClaim(
  db: Database,
  input: {
    reservationId: ID;
    userId: ID;
    amount: number;
    method: PaymentMethod;
    reference: string;
    paidAt?: string;
    note?: string;
    proof?: { fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null;
  },
): GuestSubmittedPayment {
  db.paymentClaims = db.paymentClaims ?? [];
  const r = db.reservations.find((x) => x.id === input.reservationId);
  if (!r) throw new OperationError('Booking not found.', 404, 'not_found');
  if (r.userId !== input.userId) {
    const guestRecord = db.guests.find((g) => g.id === r.guestId);
    if (guestRecord?.userId !== input.userId) {
      throw new OperationError('That booking does not belong to your account.', 403, 'forbidden');
    }
  }
  if (r.status === 'cancelled') {
    throw new OperationError('This booking is cancelled, so no payment is due.', 409, 'cancelled');
  }
  if (r.status === 'checked_out') {
    throw new OperationError('This stay is closed. Contact reception if something is outstanding.', 409, 'closed_folio');
  }

  const settings = db.settings.payments;
  const method = settings.methods.find((m) => m.id === input.method);
  if (!method?.enabled) {
    throw new OperationError('That payment method is not available. Choose one of the channels shown.', 422, 'method_disabled');
  }
  if (!settings.lockMethodToAdmin && settings.defaultMethod && !settings.methods.some((m) => m.id === input.method && m.enabled)) {
    throw new OperationError('That payment method is not available.', 422, 'method_disabled');
  }

  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new OperationError('Enter the amount you paid.', 422, 'validation');

  const quote = paymentQuote(db, r);
  if (quote.balanceDue <= 0) {
    throw new OperationError('This booking is already settled. Nothing further is due.', 409, 'already_paid');
  }
  if (quote.openClaim) {
    throw new OperationError(
      'A payment is already waiting for reception to check it. Contact us if you need to change it rather than submitting again.',
      409,
      'claim_pending',
    );
  }
  if (!quote.allowPartial) {
    const settledExpected = quote.suggestedAmount;
    if (Math.abs(amount - settledExpected) > 0.01) {
      throw new OperationError(
        `This booking is set up for a single payment of K${settledExpected.toLocaleString('en-US')}.`,
        422,
        'partial_not_allowed',
      );
    }
  }
  if (amount > quote.balanceDue + 0.01) {
    throw new OperationError(
      `That is more than the K${quote.balanceDue.toLocaleString('en-US')} outstanding. Pay the balance or contact reception.`,
      422,
      'overpayment',
    );
  }
  const reference = input.reference.trim();
  if (reference.length < 3) {
    throw new OperationError('Enter the transaction reference, SMS code or slip number.', 422, 'validation');
  }
  if (input.proof && !settings.proofUploadEnabled) {
    throw new OperationError('Proof uploads are switched off — give reception the reference instead.', 422, 'validation');
  }

  const guest = db.guests.find((g) => g.id === r.guestId);
  const claim: GuestSubmittedPayment = {
    id: nextId('clm'),
    reservationId: r.id,
    userId: input.userId,
    guestId: r.guestId,
    amount,
    method: input.method,
    reference,
    paidAt: input.paidAt || today(db),
    note: (input.note ?? '').trim(),
    proof: input.proof ? { ...input.proof, uploadedAt: nowISO(), uploadedBy: guest?.fullName ?? 'Guest' } : null,
    status: 'awaiting_verification',
    paymentId: null,
    linkedAt: null,
    createdAt: nowISO(),
  };
  db.paymentClaims.unshift(claim);

  r.history.unshift({
    at: nowISO(),
    by: guest?.fullName ?? 'Guest',
    label: 'Payment submitted by guest — awaiting verification',
    detail: `K${amount.toLocaleString('en-US')} · ${method.label} · ref ${reference}. Balance is unchanged until staff verify it.`,
  });
  r.updatedAt = nowISO();

  appendAuditLog(db, {
    category: 'payment',
    action: 'payment.claim_submitted',
    actorUid: input.userId,
    targetType: 'reservation',
    targetId: r.id,
    summary: `${guest?.fullName ?? 'Guest'} claimed K${amount.toLocaleString('en-US')} by ${method.label} on ${r.reference}.`,
  });

  // Tell reception there is something to check, and tell the guest where it stands.
  const staffRecipients = (db.users ?? []).filter(
    (u) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'receptionist',
  );
  void staffRecipients;
  draftNotification(db, {
    event: 'payment_submitted',
    channel: 'in_app',
    title: `Payment to verify · ${r.reference}`,
    body: `${guest?.fullName ?? 'A guest'} says they paid K${amount.toLocaleString('en-US')} by ${method.label}, reference ${reference}. Check it against the statement, then record and verify it on the booking.`,
    recipientName: 'Reception',
    recipientContact: db.settings.property.phone,
    guestId: r.guestId,
    reservationId: r.id,
    apartmentId: r.apartmentId,
    actor: guest?.fullName,
  });
  draftNotification(db, {
    event: 'payment_submitted',
    channel: 'in_app',
    title: `Payment received for checking · ${r.reference}`,
    body: `Thank you — we have your ${method.label} reference ${reference} for K${amount.toLocaleString('en-US')}. Reception checks these against the provider statement; your balance updates once it is confirmed.`,
    recipientName: guest?.fullName ?? 'Guest',
    recipientContact: guest?.phone ?? '',
    guestId: r.guestId,
    reservationId: r.id,
    apartmentId: r.apartmentId,
    actor: guest?.fullName,
  });

  return claim;
}

/**
 * Rejects a guest's claim. The balance does not move, and the guest is told why —
 * silently discarding a claim would leave them believing they had paid.
 */
export function rejectPaymentClaim(
  db: Database,
  actorId: ID,
  claimId: ID,
  note: string,
): GuestSubmittedPayment {
  db.paymentClaims = db.paymentClaims ?? [];
  const claim = db.paymentClaims.find((c) => c.id === claimId);
  if (!claim) throw new OperationError('Payment claim not found.', 404, 'not_found');
  if (claim.status === 'linked') {
    throw new OperationError('That claim has already been banked as a receipt.', 409, 'already_state');
  }
  const reviewer = actorName(db, actorId);
  claim.status = 'rejected';
  claim.linkedAt = nowISO();
  claim.paymentId = null;
  claim.note = [claim.note, `Rejected by ${reviewer}: ${note}`].filter(Boolean).join(' · ');

  const r = db.reservations.find((x) => x.id === claim.reservationId);
  if (r) {
    r.history.unshift({
      at: nowISO(),
      by: reviewer,
      label: 'Guest payment claim rejected',
      detail: `K${claim.amount.toLocaleString('en-US')} · ${claim.method.replace(/_/g, ' ')} · ref ${claim.reference} — ${note}`,
    });
    r.updatedAt = nowISO();
    const guest = db.guests.find((g) => g.id === r.guestId);
    if (guest) {
      draftNotification(db, {
        event: 'payment_rejected',
        channel: 'in_app',
        title: `We could not match your payment · ${r.reference}`,
        body: `We looked for your ${claim.method.replace(/_/g, ' ')} payment of K${claim.amount.toLocaleString('en-US')} (reference ${claim.reference}) and could not find it. ${note} Please reply to reception with a screenshot or the correct reference — your booking is unchanged.`,
        recipientName: guest.fullName,
        recipientContact: guest.phone,
        guestId: guest.id,
        reservationId: r.id,
        apartmentId: r.apartmentId,
        actor: reviewer,
      });
    }
  }

  appendAuditLog(db, {
    category: 'payment',
    action: 'payment.claim_rejected',
    actorUid: actorId,
    targetType: 'reservation',
    targetId: claim.reservationId,
    summary: `Rejected guest claim ${claim.id} (K${claim.amount.toLocaleString('en-US')}, ref ${claim.reference}) — ${note}`,
  });

  return claim;
}

export function recordPayment(db: Database, actorId: ID, input: PaymentInput): Payment {
  const r = db.reservations.find((x) => x.id === input.reservationId);
  if (!r) throw new OperationError('Reservation not found.', 404, 'not_found');
  if (r.status === 'cancelled') {
    throw new OperationError('This booking is cancelled — take a refund entry instead of a payment.', 409, 'cancelled');
  }
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new OperationError('Enter an amount greater than zero.', 422, 'validation');
  const methodSetting = db.settings.payments.methods.find((m) => m.id === input.method);
  if (!methodSetting?.enabled) throw new OperationError(`${methodSetting?.label ?? 'That method'} is switched off in Settings → Payments.`, 422, 'method_disabled');

  const existingVerified = db.payments
    .filter((p) => p.reservationId === r.id && p.verificationStatus === 'verified' && p.kind !== 'refund')
    .reduce((s, p) => s + p.amount, 0);
  const pending = db.payments
    .filter((p) => p.reservationId === r.id && p.verificationStatus === 'pending' && p.kind !== 'refund')
    .reduce((s, p) => s + p.amount, 0);
  if (existingVerified + pending + amount > r.totalAmount + 0.01) {
    throw new OperationError(
      `That puts K${(existingVerified + pending + amount).toLocaleString('en-US')} against a folio of K${r.totalAmount.toLocaleString('en-US')}. Reduce the amount or record the surplus as a separate invoice.`,
      422,
      'overpayment',
    );
  }
  if (input.proof && !db.settings.payments.proofUploadEnabled) {
    throw new OperationError('Proof-of-payment uploads are switched off in Settings.', 422, 'validation');
  }

  /**
   * Verification separation of duties: a receipt recorded by someone who cannot
   * verify their own entry stays `pending` until an authorised user signs it off.
   * A screenshot alone never changes the balance.
   */
  const actorUser = (db.users ?? []).find((u) => u.uid === actorId);
  const actorStaff = db.staff.find((s) => s.id === actorId);
  const resolvedRole = actorUser?.role ?? actorStaff?.role;
  const resolvedName = actorUser?.fullName ?? actorStaff?.name ?? 'System';
  const canSelfVerify = resolvedRole === 'super_admin' || resolvedRole === 'admin';
  const autoVerify =
    canSelfVerify && !db.settings.payments.requireVerification
      ? true
      : canSelfVerify && input.method === 'cash';

  const payment: Payment = {
    id: nextId('pay'),
    reservationId: r.id,
    bookingId: r.id,
    guestId: r.guestId,
    userId: r.userId ?? null,
    amount,
    method: input.method,
    kind: input.kind,
    reference: (input.reference ?? '').trim() || (input.method === 'cash' ? `CASH-${r.reference.slice(-4)}` : ''),
    paidAt: input.paidAt || today(db),
    recordedBy: actorId,
    recordedByName: resolvedName,
    verificationStatus: autoVerify ? 'verified' : 'pending',
    verifiedBy: autoVerify ? resolvedName : null,
    verifiedAt: autoVerify ? nowISO() : null,
    verificationNote: autoVerify
      ? input.method === 'cash'
        ? 'Cash counted at the desk and reconciled with the drawer.'
        : 'Entered and verified by the manager on duty.'
      : '',
    proof: input.proof
      ? { ...input.proof, uploadedAt: nowISO(), uploadedBy: resolvedName }
      : null,
    note: input.note ?? '',
    auditTrail: [
      {
        at: nowISO(),
        by: resolvedName,
        action: autoVerify ? 'payment.recorded_and_verified' : 'payment.recorded_pending',
        status: autoVerify ? 'verified' : 'pending',
        note: input.note ?? '',
      },
    ],
    createdAt: nowISO(),
  };
  if (!payment.reference) payment.reference = `REC-${String(db.sequences.receipt++).padStart(5, '0')}`;

  // A receipt banked from a guest's claim carries the claim reference and settles it,
  // so the guest's submission and the ledger entry can never drift apart.
  if (input.claimId) {
    db.paymentClaims = db.paymentClaims ?? [];
    const claim = db.paymentClaims.find((c) => c.id === input.claimId);
    if (!claim) throw new OperationError('That payment claim no longer exists.', 404, 'not_found');
    if (claim.status === 'linked') {
      throw new OperationError('That payment claim has already been banked against a receipt.', 409, 'already_state');
    }
    if (claim.status === 'rejected') {
      throw new OperationError(
        'That claim was rejected. Ask the guest to submit the correct reference, then record it as a desk payment.',
        409,
        'already_state',
      );
    }
    if (claim.reservationId !== r.id) {
      throw new OperationError('That claim belongs to a different booking.', 422, 'validation');
    }
    payment.claimId = claim.id;
    claim.status = 'linked';
    claim.paymentId = payment.id;
    claim.linkedAt = nowISO();
  } else {
    payment.claimId = null;
  }

  db.payments.unshift(payment);

  r.history.unshift({
    at: nowISO(),
    by: resolvedName,
    label: payment.verificationStatus === 'verified' ? 'Payment banked' : 'Payment recorded — awaiting verification',
    detail: `K${amount.toLocaleString('en-US')} · ${methodSetting.label}${payment.reference ? ` · ref ${payment.reference}` : ''}`,
  });
  r.updatedAt = nowISO();

  recomputeReservation(db, r.id);
  if (payment.verificationStatus === 'verified') {
    issueOfficialReceipt(db, payment, resolvedName);
  }

  appendAuditLog(db, {
    category: 'payment',
    action: autoVerify ? 'payment.recorded_verified' : 'payment.recorded_pending',
    actorUid: actorId,
    targetType: 'payment',
    targetId: payment.id,
    summary: `Recorded K${amount.toLocaleString('en-US')} (${methodSetting.label}) for ${r.reference} — status: ${payment.verificationStatus}.`,
    after: { amount, method: input.method, verificationStatus: payment.verificationStatus },
  });

  if (payment.verificationStatus === 'pending' && db.settings.notifications.sendPaymentConfirmation) {
    const guest = db.guests.find((g) => g.id === r.guestId);
    if (guest) {
      draftNotification(db, {
        event: 'payment_received',
        channel: 'in_app',
        title: `Payment awaiting verification · ${r.reference}`,
        body: `${resolvedName} recorded K${amount.toLocaleString('en-US')} by ${methodSetting.label}${
          payment.proof ? ' with a screenshot attached' : ''
        }. An administrator must verify it before the folio moves to paid.`,
        recipientName: 'Authorised verifier',
        recipientContact: 'in-app',
        guestId: guest.id,
        reservationId: r.id,
        apartmentId: r.apartmentId,
      });
    }
  } else if (payment.verificationStatus === 'verified' && db.settings.notifications.sendPaymentConfirmation) {
    const guest = db.guests.find((g) => g.id === r.guestId);
    if (guest) {
      draftNotification(db, {
        event: 'payment_verified',
        channel: 'whatsapp',
        title: `Receipt confirmed · ${r.reference}`,
        body: `Thank you ${guestFirstName(guest)}, we have verified K${amount.toLocaleString('en-US')} by ${methodSetting.label}${
          payment.reference ? ` (ref ${payment.reference})` : ''
        }. ${r.totalAmount - existingVerified - amount > 0 ? `The balance of K${(r.totalAmount - existingVerified - amount).toLocaleString('en-US')} remains due` : 'Your stay is paid in full'}.`,
        recipientName: guest.fullName,
        recipientContact: guest.phone,
        guestId: guest.id,
        reservationId: r.id,
        apartmentId: r.apartmentId,
      });
    }
  }

  return payment;
}

export function setPaymentVerification(
  db: Database,
  actorId: ID,
  paymentId: ID,
  status: 'verified' | 'rejected',
  note: string,
): Payment {
  const p = db.payments.find((x) => x.id === paymentId);
  if (!p) throw new OperationError('Payment not found.', 404, 'not_found');
  if (p.verificationStatus === status) throw new OperationError(`That receipt is already ${status}.`, 409, 'already_state');
  const verifierName = actorName(db, actorId);
  const beforeStatus = p.verificationStatus;
  p.verificationStatus = status;
  p.verifiedBy = verifierName;
  p.verifiedAt = nowISO();
  p.verificationNote = note || (status === 'verified' ? 'Reference matched against the provider statement.' : 'Rejected by the verifier.');
  p.auditTrail = p.auditTrail ?? [];
  p.auditTrail.unshift({
    at: nowISO(),
    by: verifierName,
    action: status === 'verified' ? 'payment.verified' : 'payment.rejected',
    status,
    note: p.verificationNote,
  });

  const r = db.reservations.find((x) => x.id === p.reservationId);
  if (r) {
    r.history.unshift({
      at: nowISO(),
      by: p.verifiedBy,
      label: status === 'verified' ? 'Payment verified' : 'Payment rejected',
      detail: `K${p.amount.toLocaleString('en-US')} · ${p.method.replace(/_/g, ' ')}${note ? ` · ${note}` : ''}`,
    });
    recomputeReservation(db, r.id);
    if (status === 'verified') {
      issueOfficialReceipt(db, p, verifierName);
    }
    const guest = db.guests.find((g) => g.id === r.guestId);
    if (guest && db.settings.notifications.sendPaymentConfirmation) {
      draftNotification(db, {
        event: status === 'verified' ? 'payment_verified' : 'payment_rejected',
        channel: 'in_app',
        title:
          status === 'verified'
            ? `Payment verified · ${r.reference} (${p.receiptNumber ?? p.reference})`
            : `Payment rejected · ${r.reference}`,
        body:
          status === 'verified'
            ? `Payment of K${p.amount.toLocaleString('en-US')} (${p.method.replace(/_/g, ' ')}) verified by ${verifierName}. Official receipt ${p.receiptNumber ?? ''} issued.`
            : `Payment of K${p.amount.toLocaleString('en-US')} (${p.method.replace(/_/g, ' ')}) was rejected: ${p.verificationNote}`,
        recipientName: guest.fullName,
        recipientContact: guest.phone,
        guestId: guest.id,
        reservationId: r.id,
        apartmentId: r.apartmentId,
      });
    }
  }

  appendAuditLog(db, {
    category: 'payment',
    action: status === 'verified' ? 'payment.verified' : 'payment.rejected',
    actorUid: actorId,
    targetType: 'payment',
    targetId: p.id,
    summary: `Payment ${p.reference} (K${p.amount.toLocaleString('en-US')}) changed from ${beforeStatus} to ${status} by ${verifierName}.`,
    before: { verificationStatus: beforeStatus },
    after: { verificationStatus: status, receiptNumber: p.receiptNumber ?? null },
  });

  return p;
}

/* ----------------------------------------------------------------------- housekeeping */

function nextCleaner(db: Database): StaffUser | null {
  const cleaners = db.staff.filter((s) => s.role === 'cleaner' && s.active);
  if (!cleaners.length) return null;
  const load = new Map<string, number>();
  for (const t of db.housekeeping) {
    if (t.assignedTo && (t.status === 'needs_cleaning' || t.status === 'in_progress')) {
      load.set(t.assignedTo, (load.get(t.assignedTo) ?? 0) + 1);
    }
  }
  return [...cleaners].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
}

export function openTurnoverTask(db: Database, reservation: Reservation, actorId: ID): HousekeepingTask {
  const apartmentId = reservation.apartmentId;
  const existing = db.housekeeping.find(
    (t) => t.apartmentId === apartmentId && t.reservationId === reservation.id && t.status !== 'clean',
  );
  if (existing) return existing;

  const guest = db.guests.find((g) => g.id === reservation.guestId);
  const cleaner = db.settings.housekeeping.autoAssignCleaner ? nextCleaner(db) : null;
  const task: HousekeepingTask = {
    id: nextId('hk'),
    apartmentId,
    reservationId: reservation.id,
    type: 'turnover',
    status: 'needs_cleaning',
    assignedTo: cleaner?.id ?? null,
    date: today(db),
    dueTime: db.settings.booking.checkOutTime,
    priority: hasArrivalToday(db, apartmentId) ? 'high' : 'normal',
    instructions: 'Standard turnover: linen and towels, kitchen, bathroom, vacuum, amenity top-up.',
    notes: guest
      ? [
          {
            at: nowISO(),
            by: actorId,
            byName: actorName(db, actorId),
            text: `Departure recorded at ${timeNow()} — guest ${guest.fullName} checked out.`,
          },
        ]
      : [],
    createdAt: nowISO(),
    createdBy: actorId,
    startedAt: null,
    completedAt: null,
    completedBy: null,
    durationMinutes: null,
  };
  db.housekeeping.unshift(task);
  db.cleaningState[apartmentId] = { status: 'needs_cleaning', updatedAt: nowISO(), note: 'Turnover opened by a departure.' };

  if (cleaner && db.settings.notifications.sendCleaningReminders) {
    draftNotification(db, {
      event: 'cleaning_assigned',
      channel: 'sms',
      title: `Cleaning job assigned · Apt ${db.apartments.find((a) => a.id === apartmentId)?.number}`,
      body: `Apt ${db.apartments.find((a) => a.id === apartmentId)?.number} (${db.apartments.find((a) => a.id === apartmentId)?.name}) — turnover due by ${task.dueTime}. ${
        hasArrivalToday(db, apartmentId) ? 'Priority: a new guest arrives today.' : 'Standard priority.'
      }`,
      recipientName: cleaner.name,
      recipientContact: cleaner.phone,
      apartmentId,
      reservationId: reservation.id,
    });
  }
  return task;
}

function hasArrivalToday(db: Database, apartmentId: ID): boolean {
  const t = today(db);
  return db.reservations.some(
    (r) => r.apartmentId === apartmentId && r.checkIn === t && (r.status === 'reserved' || r.status === 'fully_paid'),
  );
}

function ensureStayoverTask(db: Database, reservation: Reservation, actorId: ID) {
  if (reservation.nights < 3) return;
  const midPoint = addISO(reservation.checkIn, Math.ceil(reservation.nights / 2));
  if (midPoint < today(db)) return;
  if (db.housekeeping.some((t) => t.reservationId === reservation.id && t.type === 'stayover')) return;
  db.housekeeping.unshift({
    id: nextId('hk'),
    apartmentId: reservation.apartmentId,
    reservationId: reservation.id,
    type: 'stayover',
    status: 'needs_cleaning',
    assignedTo: db.settings.housekeeping.autoAssignCleaner ? nextCleaner(db)?.id ?? null : null,
    date: midPoint,
    dueTime: '11:00',
    priority: 'low',
    instructions: 'Stayover refresh: towels, bins, bed make-up, dusting. Guest is in the room — knock and ask.',
    notes: [],
    createdAt: nowISO(),
    createdBy: actorId,
    startedAt: null,
    completedAt: null,
    completedBy: null,
    durationMinutes: null,
  });
}

export function updateHousekeepingTask(
  db: Database,
  actorId: ID,
  taskId: ID,
  patch: {
    status?: CleaningStatus;
    assignedTo?: ID | null;
    date?: string;
    dueTime?: string;
    priority?: HousekeepingTask['priority'];
    instructions?: string;
    note?: string;
    apartmentId?: ID;
    type?: HousekeepingTask['type'];
  },
): HousekeepingTask {
  const task = db.housekeeping.find((t) => t.id === taskId);
  if (!task) throw new OperationError('Cleaning task not found.', 404, 'not_found');
  const actorUser = (db.users ?? []).find((u) => u.uid === actorId);
  const actorStaff = db.staff.find((s) => s.id === actorId);
  const actorRole = actorUser?.role ?? actorStaff?.role;
  const actorDisplayName = actorUser?.fullName ?? actorStaff?.name ?? 'System';
  if (actorRole === 'cleaner') {
    if (task.assignedTo !== actorId) {
      throw new OperationError('That job is not on your list.', 403, 'not_assigned');
    }
    if (patch.assignedTo !== undefined || patch.date !== undefined || patch.apartmentId !== undefined || patch.type !== undefined) {
      throw new OperationError('Cleaners can update progress and report faults, not re-plan the schedule.', 403, 'scope');
    }
  }

  const before = task.status;
  if (patch.assignedTo !== undefined) {
    task.assignedTo = patch.assignedTo;
    if (patch.assignedTo && task.status === 'needs_cleaning') {
      task.status = 'assigned';
    }
  }
  if (patch.date) task.date = patch.date;
  if (patch.dueTime) task.dueTime = patch.dueTime;
  if (patch.priority) task.priority = patch.priority;
  if (patch.instructions !== undefined) task.instructions = patch.instructions;
  if (patch.type) task.type = patch.type;
  if (patch.apartmentId) task.apartmentId = patch.apartmentId;

  if (patch.status && patch.status !== before) {
    let targetStatus: CleaningStatus = patch.status === 'completed' ? 'clean' : patch.status;
    if (
      targetStatus === 'clean' &&
      actorRole === 'cleaner' &&
      db.settings.housekeeping.requireInspectionBeforeReady
    ) {
      targetStatus = 'inspection_required';
    }
    task.status = targetStatus;
    if (targetStatus === 'in_progress' && !task.startedAt) task.startedAt = nowISO();
    if (targetStatus === 'clean') {
      task.completedAt = nowISO();
      task.completedBy = actorId;
      const start = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
      task.durationMinutes = Math.max(1, Math.round((Date.now() - start) / 60000));
    } else if (targetStatus !== 'inspection_required') {
      task.completedAt = null;
      task.completedBy = null;
    }
  }

  if (patch.note) {
    task.notes.unshift({ at: nowISO(), by: actorId, byName: actorDisplayName, text: patch.note });
  }

  if (task.status !== before) {
    const blockedByMaintenance = (db.maintenance ?? []).some(
      (m) => m.apartmentId === task.apartmentId && m.status !== 'resolved' && m.blocksReadiness,
    );
    db.cleaningState[task.apartmentId] = {
      status: blockedByMaintenance ? 'maintenance' : task.status,
      updatedAt: nowISO(),
      note:
        task.status === 'clean'
          ? `Turnover completed by ${actorDisplayName}${
              task.durationMinutes ? ` in ${task.durationMinutes} minutes` : ''
            }.`
          : task.status === 'inspection_required'
            ? `Cleaned by ${actorDisplayName} — awaiting supervisor inspection.`
            : task.status === 'maintenance'
              ? 'Maintenance hold — blocked to new bookings.'
              : task.status === 'in_progress'
                ? 'Team is in the unit.'
                : 'Awaiting cleaning.',
    };

    if (task.status === 'maintenance') {
      const apartment = db.apartments.find((a) => a.id === task.apartmentId);
      draftNotification(db, {
        event: 'maintenance_reported',
        channel: 'in_app',
        title: `Maintenance reported · Apt ${apartment?.number}`,
        body: `${actorDisplayName} flagged ${apartment?.name}: ${patch.note || task.instructions}. The unit is held against new bookings until it is signed off.`,
        recipientName: db.settings.property.name,
        recipientContact: db.settings.property.phone,
        apartmentId: task.apartmentId,
        reservationId: task.reservationId,
      });
    }
    if (task.status === 'clean' && before !== 'clean') {
      const apartment = db.apartments.find((a) => a.id === task.apartmentId);
      draftNotification(db, {
        event: 'cleaning_completed',
        channel: 'in_app',
        title: `Apt ${apartment?.number} released for sale`,
        body: `${apartment?.name} passed inspection${task.durationMinutes ? ` after ${task.durationMinutes} minutes of work` : ''}. Reception can sell it again.`,
        recipientName: 'Front office',
        recipientContact: 'in-app',
        apartmentId: task.apartmentId,
        reservationId: task.reservationId,
        actor: actorDisplayName,
      });
    }
  }

  return task;
}

export function createHousekeepingTask(
  db: Database,
  actorId: ID,
  input: {
    apartmentId: ID;
    type: HousekeepingTask['type'];
    status?: CleaningStatus;
    date: string;
    dueTime?: string;
    assignedTo?: ID | null;
    priority?: HousekeepingTask['priority'];
    instructions?: string;
    reservationId?: ID | null;
  },
): HousekeepingTask {
  const apartment = db.apartments.find((a) => a.id === input.apartmentId);
  if (!apartment) throw new OperationError('Choose an apartment.', 422, 'validation');
  const task: HousekeepingTask = {
    id: nextId('hk'),
    apartmentId: input.apartmentId,
    reservationId: input.reservationId ?? null,
    type: input.type,
    status: input.status ?? 'needs_cleaning',
    assignedTo: input.assignedTo ?? (db.settings.housekeeping.autoAssignCleaner ? nextCleaner(db)?.id ?? null : null),
    date: input.date,
    dueTime: input.dueTime ?? '12:00',
    priority: input.priority ?? 'normal',
    instructions: input.instructions ?? '',
    notes: [],
    createdAt: nowISO(),
    createdBy: actorId,
    startedAt: null,
    completedAt: null,
    completedBy: null,
    durationMinutes: null,
  };
  db.housekeeping.unshift(task);
  db.cleaningState[input.apartmentId] = { status: task.status, updatedAt: nowISO(), note: 'Scheduled by reception.' };
  return task;
}

/* ------------------------------------------------------------------------ apartments */

export function upsertApartment(db: Database, actorId: ID, input: Partial<Apartment> & { id?: ID }): Apartment {
  if (input.id) {
    const apt = db.apartments.find((a) => a.id === input.id);
    if (!apt) throw new OperationError('Apartment not found.', 404, 'not_found');
    const priorRate = apt.nightlyRate;
    const priorWeekend = apt.weekendRate;
    Object.assign(apt, input);
    if (input.publicationStatus) {
      apt.active = input.publicationStatus === 'published';
    } else if (input.active !== undefined && !input.publicationStatus) {
      apt.publicationStatus = input.active ? 'published' : 'unpublished';
    }
    apt.updatedAt = nowISO();
    if (priorRate !== apt.nightlyRate || priorWeekend !== apt.weekendRate) {
      appendAuditLog(db, {
        category: 'apartment',
        action: 'apartment.price_changed',
        actorUid: actorId,
        targetType: 'apartment',
        targetId: apt.id,
        summary: `Updated pricing on Apt ${apt.number} (${apt.name}): K${priorRate} -> K${apt.nightlyRate}.`,
        before: { nightlyRate: priorRate, weekendRate: priorWeekend ?? null },
        after: { nightlyRate: apt.nightlyRate, weekendRate: apt.weekendRate ?? null },
      });
    } else {
      appendAuditLog(db, {
        category: 'apartment',
        action: 'apartment.updated',
        actorUid: actorId,
        targetType: 'apartment',
        targetId: apt.id,
        summary: `Updated Apartment ${apt.number} (${apt.name}).`,
      });
    }
    return apt;
  }
  const number = input.number ?? Math.max(0, ...db.apartments.map((a) => a.number)) + 1;
  const name = input.name?.trim() || `Apartment ${number}`;
  // No stock imagery: a new unit starts with exactly the photos the operator supplied.
  const initialPhotos = input.photos ?? [];
  const pubStatus = input.publicationStatus ?? (input.active === false ? 'unpublished' : 'published');
  const apt: Apartment = {
    id: nextId('apt'),
    number,
    code: input.code || `LHA-${100 + number}`,
    name,
    slug: `apt-${number}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    tier: input.tier ?? 'standard',
    tagline: input.tagline ?? '',
    description: input.description ?? '',
    maxGuests: input.maxGuests ?? 2,
    bedrooms: input.bedrooms ?? 1,
    bathrooms: input.bathrooms ?? 1,
    sizeSqm: input.sizeSqm ?? 40,
    floor: input.floor ?? 0,
    bedConfiguration: input.bedConfiguration ?? '1 queen bed',
    nightlyRate: input.nightlyRate ?? 1000,
    weekendRate: input.weekendRate ?? null,
    seasonalRates: input.seasonalRates ?? [],
    specialOffers: input.specialOffers ?? [],
    includedGuests: input.includedGuests ?? Math.min(2, input.maxGuests ?? 2),
    extraGuestFee: input.extraGuestFee ?? 0,
    optionalServices: input.optionalServices ?? [],
    amenities: input.amenities ?? [],
    facilities: input.facilities ?? input.amenities ?? [],
    photos: initialPhotos,
    coverPhoto: input.coverPhoto ?? initialPhotos[0],
    gallery:
      input.gallery ??
      initialPhotos.map((url, idx) => ({
        id: `ph-${number}-${idx + 1}`,
        url,
        publicId: `lemma/apartments/apt-${number}-${idx + 1}`,
        title: `${name} — Photo ${idx + 1}`,
        description: '',
        order: idx,
        isCover: idx === 0,
        mediaType: 'image',
        uploadedAt: nowISO(),
      })),
    active: pubStatus === 'published',
    publicationStatus: pubStatus,
    outOfService: input.outOfService ?? false,
    houseNotes: input.houseNotes ?? '',
    updatedAt: nowISO(),
  };
  db.apartments.push(apt);
  db.cleaningState[apt.id] = { status: 'clean', updatedAt: nowISO(), note: 'Added to the catalogue.' };
  appendAuditLog(db, {
    category: 'apartment',
    action: 'apartment.created',
    actorUid: actorId,
    targetType: 'apartment',
    targetId: apt.id,
    summary: `Created Apartment ${apt.number} (${apt.name}) at K${apt.nightlyRate.toLocaleString('en-US')}/night.`,
  });
  return apt;
}

/* ----------------------------------------------------------------------------- staff */

export function upsertStaff(
  db: Database,
  actorId: ID,
  input: Partial<StaffUser> & { id?: ID; password?: string },
): StaffUser {
  db.users = db.users ?? [];
  if (input.id) {
    const user = db.staff.find((s) => s.id === input.id);
    if (!user) throw new OperationError('Staff account not found.', 404, 'not_found');
    const beforeActive = user.active;
    const beforeRole = user.role;
    const { password, ...rest } = input;
    Object.assign(user, rest);
    if (password) user.passwordHash = hashPassword(password);

    const mirror = db.users.find((u) => u.uid === user.id);
    if (mirror) {
      mirror.fullName = user.name;
      mirror.email = user.email;
      mirror.phoneNumber = user.phone;
      mirror.role = user.role;
      mirror.accountStatus = user.active ? 'active' : 'deactivated';
      mirror.jobTitle = user.jobTitle;
      mirror.shift = user.shift;
      mirror.permissions = user.permissions;
      if (password && user.passwordHash) mirror.passwordHash = user.passwordHash;
      if (!user.active && beforeActive) {
        mirror.sessionVersion = (mirror.sessionVersion ?? 1) + 1;
      }
      mirror.updatedAt = nowISO();
    }

    if (beforeRole !== user.role) {
      appendAuditLog(db, {
        category: 'role',
        action: 'staff.role_changed',
        actorUid: actorId,
        targetType: 'user',
        targetId: user.id,
        summary: `Changed staff role for ${user.name} from ${beforeRole} to ${user.role}.`,
      });
    }
    if (beforeActive !== user.active) {
      appendAuditLog(db, {
        category: 'staff',
        action: user.active ? 'staff.reactivated' : 'staff.deactivated',
        actorUid: actorId,
        targetType: 'user',
        targetId: user.id,
        summary: `${user.active ? 'Reactivated' : 'Deactivated'} staff account ${user.name}.`,
      });
    }
    return user;
  }
  const username = (input.username ?? '').trim().toLowerCase();
  if (!username) throw new OperationError('A login handle is required.', 422, 'validation');
  if (db.staff.some((s) => s.username.toLowerCase() === username)) {
    throw new OperationError('That login handle is already taken.', 409, 'duplicate');
  }
  if (!input.name?.trim()) throw new OperationError('Enter the staff member’s name.', 422, 'validation');
  const password = input.password?.trim();
  if (!password) {
    throw new OperationError('Set a password for this account — the person needs it to sign in.', 422, 'validation');
  }
  if (password.length < 6) {
    throw new OperationError('Passwords need at least six characters.', 422, 'validation');
  }
  const pwHash = hashPassword(password);
  const user: StaffUser = {
    id: nextId('st'),
    name: input.name.trim(),
    username,
    email: input.email ?? '',
    phone: input.phone ?? '',
    role: input.role ?? 'receptionist',
    jobTitle: input.jobTitle ?? '',
    active: input.active ?? true,
    hiredOn: input.hiredOn ?? today(db),
    lastSeenAt: null,
    shift: input.shift ?? null,
    permissions: input.permissions ?? null,
    passwordHash: pwHash,
  };
  db.staff.push(user);
  // One identity per person: the staff row is the account, so only add a user
  // record when one with this uid does not already exist.
  if (!db.users.some((u) => u.uid === user.id)) {
    db.users.unshift({
      uid: user.id,
      fullName: user.name,
      email: (user.email || `${username}@lemmaheights.co.zm`).toLowerCase(),
      phoneNumber: user.phone,
      profilePhoto: '',
      role: user.role,
      accountStatus: user.active ? 'active' : 'deactivated',
      emailVerified: true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastLoginAt: null,
      username: user.username,
      jobTitle: user.jobTitle,
      shift: user.shift,
      permissions: user.permissions,
      hiredOn: user.hiredOn,
      passwordHash: pwHash,
      sessionVersion: 1,
    });
  }
  appendAuditLog(db, {
    category: 'staff',
    action: 'staff.created',
    actorUid: actorId,
    targetType: 'user',
    targetId: user.id,
    summary: `Added staff account ${user.name} (${user.role}).`,
  });
  return user;
}

export function setStaffPermissions(
  db: Database,
  staffId: ID,
  permissions: StaffUser['permissions'],
): StaffUser {
  const user = db.staff.find((s) => s.id === staffId);
  if (!user) throw new OperationError('Staff account not found.', 404, 'not_found');
  user.permissions = permissions && permissions.length ? permissions : null;
  return user;
}

/* ---------------------------------------------------------------------- notifications */

export function markNotification(db: Database, id: ID, patch: { read?: boolean; delivered?: boolean; note?: string; actor?: string }): NotificationRecord {
  const n = db.notifications.find((x) => x.id === id);
  if (!n) throw new OperationError('Notification not found.', 404, 'not_found');
  if (patch.read) n.readAt = nowISO();
  if (patch.delivered) {
    n.deliveryStatus = 'delivered_manually';
    n.markedDeliveredAt = nowISO();
    n.markedDeliveredBy = patch.actor ?? 'Reception';
    n.readAt = n.readAt ?? nowISO();
    n.deliveryDetail = `Sent by ${n.markedDeliveredBy} from their own handset${patch.note ? ` — ${patch.note}` : ''}. No provider is connected to confirm delivery, so the timestamp is the staff claim, not a carrier receipt.`;
  }
  if (patch.note && !patch.delivered) n.deliveryDetail = patch.note;
  return n;
}

/**
 * Runs the reminder sweep the scheduler would run: check-in reminders, check-out
 * reminders and balance chasers, skipping anything already drafted for that stay.
 */
/**
 * Second half of the sweep: guest payment claims that nobody has checked yet.
 *
 * Two notifications come out of here — a nudge to reception once a claim has sat
 * past the review window in Settings, and a holding note to the guest. Neither
 * changes a balance; only a verifier does that.
 */
export function sweepPaymentClaims(
  db: Database,
  day = db.__today || businessToday(),
): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;
  const windowHours = db.settings.payments.claimReviewHours ?? 24;

  for (const claim of db.paymentClaims ?? []) {
    if (claim.status !== 'awaiting_verification') continue;
    const r = db.reservations.find((x) => x.id === claim.reservationId);
    if (!r || r.status === 'cancelled') continue;
    const guest = db.guests.find((g) => g.id === r.guestId);

    const ageHours = (Date.now() - new Date(claim.createdAt).getTime()) / 36e5;
    if (ageHours < windowHours) continue;

    const nudged = db.notifications.some(
      (n) =>
        n.reservationId === r.id &&
        n.createdAt.slice(0, 10) === day &&
        n.title.startsWith('Payment still unchecked'),
    );
    if (nudged) {
      skipped += 1;
      continue;
    }

    draftNotification(db, {
      event: 'payment_recorded',
      channel: 'in_app',
      title: `Payment still unchecked · ${r.reference}`,
      body: `${guest?.fullName ?? 'A guest'} submitted K${claim.amount.toLocaleString('en-US')} by ${claim.method.replace(/_/g, ' ')} (ref ${claim.reference}) ${Math.round(ageHours)} hours ago. Match it against the statement and confirm or reject it.`,
      recipientName: 'Reception',
      recipientContact: db.settings.property.phone,
      guestId: r.guestId,
      reservationId: r.id,
      apartmentId: r.apartmentId,
    });
    created += 1;
  }

  return { created, skipped };
}

export function runReminderSweep(db: Database): { created: number; skipped: number; claims: number } {
  const t = today(db);
  let created = 0;
  let skipped = 0;

  const already = (reservationId: ID, event: NotificationRecord['event']) =>
    db.notifications.some((n) => n.reservationId === reservationId && n.event === event && n.createdAt.slice(0, 10) === t);

  for (const r of db.reservations) {
    const guest = db.guests.find((g) => g.id === r.guestId);
    if (!guest || r.status === 'cancelled' || r.status === 'inquiry') continue;

    const daysToArrival = dayDiff(t, r.checkIn);
    if (r.status === 'reserved' && daysToArrival === db.settings.notifications.checkInReminderDays) {
      if (already(r.id, 'checkin_reminder')) skipped += 1;
      else {
        draftNotification(db, {
          event: 'checkin_reminder',
          channel: 'whatsapp',
          title: `Check-in tomorrow · ${r.reference}`,
          body: `Hello ${guestFirstName(guest)}, we look forward to welcoming you tomorrow, ${formatMediumDate(
            r.checkIn,
          )}. Reception is open until 22:00 and check-in is from ${db.settings.booking.checkInTime}.`,
          recipientName: guest.fullName,
          recipientContact: guest.phone,
          guestId: guest.id,
          reservationId: r.id,
          apartmentId: r.apartmentId,
        });
        created += 1;
      }
    }

    const daysToDeparture = dayDiff(t, r.checkOut);
    if (r.status === 'checked_in' && daysToDeparture === db.settings.notifications.checkOutReminderDays) {
      if (already(r.id, 'checkout_reminder')) skipped += 1;
      else {
        draftNotification(db, {
          event: 'checkout_reminder',
          channel: 'whatsapp',
          title: `Check-out ${daysToDeparture === 0 ? 'today' : 'tomorrow'} · ${r.reference}`,
          body: `Good morning ${guestFirstName(guest)}, a reminder that check-out is by ${db.settings.booking.checkOutTime} ${
            daysToDeparture === 0 ? 'today' : `on ${formatMediumDate(r.checkOut)}`
          }. Reception is happy to hold your luggage or extend the stay if you ask before 09:00.`,
          recipientName: guest.fullName,
          recipientContact: guest.phone,
          guestId: guest.id,
          reservationId: r.id,
          apartmentId: r.apartmentId,
        });
        created += 1;
      }
    }

    if (db.settings.notifications.sendBalanceReminders && daysToArrival >= 0 && daysToArrival <= db.settings.notifications.balanceReminderDays) {
      const f = recomputeReservation(db, r.id);
      if (f && f.totalAmount > 0 && f.paymentStatus !== 'fully_paid' && f.paymentStatus !== 'refunded' && daysToArrival === db.settings.notifications.balanceReminderDays) {
        if (already(r.id, 'balance_reminder')) skipped += 1;
        else {
          const balance = Math.max(
            0,
            f.totalAmount -
              db.payments
                .filter((p) => p.reservationId === f.id && p.verificationStatus === 'verified' && p.kind !== 'refund')
                .reduce((s, p) => s + p.amount, 0),
          );
          draftNotification(db, {
            event: 'balance_reminder',
            channel: 'whatsapp',
            title: `Balance due · ${f.reference}`,
            body: `Hello ${guestFirstName(guest)}, your stay on ${formatMediumDate(f.checkIn)} has a balance of K${balance.toLocaleString(
              'en-US',
            )} outstanding. You can settle by Airtel Money or MTN MoMo using the details in your confirmation, or at reception on arrival.`,
            recipientName: guest.fullName,
            recipientContact: guest.phone,
            guestId: guest.id,
            reservationId: f.id,
            apartmentId: f.apartmentId,
          });
          created += 1;
        }
      }
    }
  }

  const claims = sweepPaymentClaims(db, t);
  return { created: created + claims.created, skipped: skipped + claims.skipped, claims: claims.created };
}

/* -------------------------------------------------------------------------- settings */

export function patchSettings(db: Database, patch: Record<string, unknown>) {
  for (const [section, values] of Object.entries(patch)) {
    if (!values || typeof values !== 'object') continue;
    const target = (db.settings as unknown as Record<string, Record<string, unknown>>)[section];
    if (!target) continue;
    Object.assign(target, values);
  }
}

/* -------------------------------------------------------------------------- helpers */

export function reservationSnapshotIds(db: Database): ID[] {
  return db.reservations.map((r) => r.id);
}

export function newReceiptNumber(db: Database): string {
  return `${db.settings.payments.receiptPrefix}-${db.__today.replace(/-/g, '')}-${String(db.sequences.receipt++).padStart(4, '0')}`;
}

export function dateOrNull(value: string | undefined | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export * from './production-ops';

