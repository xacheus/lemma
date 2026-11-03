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
  NotificationRecord,
  Payment,
  PaymentMethod,
  Reservation,
  ReservationEvent,
  StaffUser,
} from './types';
import { checkAvailability, nightsBetween, stayTotal } from './availability';
import { recomputeReservation } from './selectors';
import { addISO, dayDiff, formatMediumDate, businessToday, timeNow } from './dates';
import { hashPassword } from '../auth/passwords';

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
 * handset, then marks it sent. That is the honest state of the demo.
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
        : 'No messaging provider is connected to this demo. Copy the text or open it in a handset, then mark it sent.',
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
  guest?: Parameters<typeof findOrCreateGuest>[1];
  apartmentId: ID;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  nightlyRate?: number;
  discount?: number;
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

  const nightlyRate = input.nightlyRate ?? apartment.nightlyRate;
  const discount = Math.max(0, input.discount ?? 0);
  const total = stayTotal(nights, nightlyRate, discount);
  const seq = db.sequences.reservation++;
  const reference = `LHA-${input.checkIn.slice(0, 4)}-${String(seq).padStart(4, '0')}`;
  const autoConfirm = db.settings.booking.autoConfirmPublicRequests;
  const status: BookingStatus = input.asInquiry && !autoConfirm ? 'inquiry' : (input.status ?? 'reserved');

  const reservation: Reservation = {
    id: nextId('rv'),
    reference,
    guestId: guest.id,
    apartmentId: apartment.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    nightlyRate,
    nights,
    totalAmount: total,
    discount,
    status,
    paymentStatus: 'unpaid',
    source: input.source,
    arrivalTime: input.arrivalTime || db.settings.booking.checkInTime,
    notes: input.notes ?? '',
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
    inquiry: ['reserved', 'cancelled'],
    reserved: ['fully_paid', 'checked_in', 'cancelled'],
    fully_paid: ['checked_in', 'reserved', 'cancelled'],
    checked_in: ['checked_out'],
    checked_out: [],
    cancelled: ['reserved'],
  };
  if (!allowed[r.status].includes(status)) {
    throw new OperationError(
      `Cannot move a ${r.status.replace(/_/g, ' ')} booking to ${status.replace(/_/g, ' ')} — reception would never do that.`,
      409,
      'bad_transition',
    );
  }
  r.status = status;
  log(db, r.id, actorId, `Status → ${status.replace(/_/g, ' ')}`, note);
  recomputeReservation(db, r.id);
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
  r.status = 'checked_in';
  r.checkedInAt = nowISO();
  r.arrivalTime = arrivalTime || timeNow();
  log(db, r.id, actorId, 'Checked in', `Keys issued at ${r.arrivalTime} · ${r.guestCount} guest${r.guestCount > 1 ? 's' : ''}`);
  if (db.settings.housekeeping.autoAssignCleaner) {
    ensureStayoverTask(db, r, actorId);
  }
  recomputeReservation(db, r.id);
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
  const actor = db.staff.find((s) => s.id === actorId);
  const canSelfVerify = actor?.role === 'admin';
  const autoVerify = canSelfVerify && !db.settings.payments.requireVerification ? true : canSelfVerify && input.method === 'cash';

  const payment: Payment = {
    id: nextId('pay'),
    reservationId: r.id,
    amount,
    method: input.method,
    kind: input.kind,
    reference: (input.reference ?? '').trim() || (input.method === 'cash' ? `CASH-${r.reference.slice(-4)}` : ''),
    paidAt: input.paidAt || today(db),
    recordedBy: actorId,
    recordedByName: actor?.name ?? 'System',
    verificationStatus: autoVerify ? 'verified' : 'pending',
    verifiedBy: autoVerify ? actor?.name ?? 'System' : null,
    verifiedAt: autoVerify ? nowISO() : null,
    verificationNote: autoVerify
      ? input.method === 'cash'
        ? 'Cash counted at the desk and reconciled with the drawer.'
        : 'Entered and verified by the manager on duty.'
      : '',
    proof: input.proof
      ? { ...input.proof, uploadedAt: nowISO(), uploadedBy: actor?.name ?? 'System' }
      : null,
    note: input.note ?? '',
    createdAt: nowISO(),
  };
  if (!payment.reference) payment.reference = `REC-${String(db.sequences.receipt++).padStart(5, '0')}`;
  db.payments.unshift(payment);

  r.history.unshift({
    at: nowISO(),
    by: actor?.name ?? 'System',
    label: payment.verificationStatus === 'verified' ? 'Payment banked' : 'Payment recorded — awaiting verification',
    detail: `K${amount.toLocaleString('en-US')} · ${methodSetting.label}${payment.reference ? ` · ref ${payment.reference}` : ''}`,
  });
  r.updatedAt = nowISO();

  if (payment.verificationStatus === 'pending' && db.settings.notifications.sendPaymentConfirmation) {
    const guest = db.guests.find((g) => g.id === r.guestId);
    if (guest) {
      draftNotification(db, {
        event: 'payment_received',
        channel: 'in_app',
        title: `Payment awaiting verification · ${r.reference}`,
        body: `${actor?.name ?? 'Reception'} recorded K${amount.toLocaleString('en-US')} by ${methodSetting.label}${
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
        event: 'payment_received',
        channel: 'whatsapp',
        title: `Receipt confirmed · ${r.reference}`,
        body: `Thank you ${guestFirstName(guest)}, we have received K${amount.toLocaleString('en-US')} by ${methodSetting.label}${
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

  recomputeReservation(db, r.id);
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
  p.verificationStatus = status;
  p.verifiedBy = actorName(db, actorId);
  p.verifiedAt = nowISO();
  p.verificationNote = note || (status === 'verified' ? 'Reference matched against the provider statement.' : 'Rejected by the verifier.');
  const r = db.reservations.find((x) => x.id === p.reservationId);
  if (r) {
    r.history.unshift({
      at: nowISO(),
      by: p.verifiedBy,
      label: status === 'verified' ? 'Payment verified' : 'Payment rejected',
      detail: `K${p.amount.toLocaleString('en-US')} · ${p.method.replace(/_/g, ' ')}${note ? ` · ${note}` : ''}`,
    });
    recomputeReservation(db, r.id);
  }
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
  const actor = db.staff.find((s) => s.id === actorId);
  if (actor?.role === 'cleaner') {
    if (task.assignedTo !== actor.id) {
      throw new OperationError('That job is not on your list.', 403, 'not_assigned');
    }
    if (patch.assignedTo !== undefined || patch.date !== undefined || patch.apartmentId !== undefined || patch.type !== undefined) {
      throw new OperationError('Cleaners can update progress and report faults, not re-plan the schedule.', 403, 'scope');
    }
  }

  const before = task.status;
  if (patch.assignedTo !== undefined) task.assignedTo = patch.assignedTo;
  if (patch.date) task.date = patch.date;
  if (patch.dueTime) task.dueTime = patch.dueTime;
  if (patch.priority) task.priority = patch.priority;
  if (patch.instructions !== undefined) task.instructions = patch.instructions;
  if (patch.type) task.type = patch.type;
  if (patch.apartmentId) task.apartmentId = patch.apartmentId;

  if (patch.status && patch.status !== before) {
    task.status = patch.status;
    if (patch.status === 'in_progress' && !task.startedAt) task.startedAt = nowISO();
    if (patch.status === 'clean') {
      task.completedAt = nowISO();
      task.completedBy = actorId;
      const start = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
      task.durationMinutes = Math.max(1, Math.round((Date.now() - start) / 60000));
    } else {
      task.completedAt = null;
      task.completedBy = null;
    }
  }

  if (patch.note) {
    task.notes.unshift({ at: nowISO(), by: actorId, byName: actor?.name ?? 'System', text: patch.note });
  }

  if (task.status !== before) {
    db.cleaningState[task.apartmentId] = {
      status: task.status,
      updatedAt: nowISO(),
      note:
        task.status === 'clean'
          ? `Turnover completed by ${task.completedBy ? db.staff.find((s) => s.id === task.completedBy)?.name ?? 'staff' : 'staff'}${
              task.durationMinutes ? ` in ${task.durationMinutes} minutes` : ''
            }.`
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
        body: `${actor?.name ?? 'A cleaner'} flagged ${apartment?.name}: ${patch.note || task.instructions}. The unit is held against new bookings until it is signed off.`,
        recipientName: 'Alice Chanda',
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
        actor: actor?.name ?? undefined,
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
  void actorId;
  if (input.id) {
    const apt = db.apartments.find((a) => a.id === input.id);
    if (!apt) throw new OperationError('Apartment not found.', 404, 'not_found');
    Object.assign(apt, input);
    return apt;
  }
  const number = Math.max(0, ...db.apartments.map((a) => a.number)) + 1;
  const name = input.name?.trim() || `Apartment ${number}`;
  const apt: Apartment = {
    id: nextId('apt'),
    number,
    code: `LHA-${100 + number}`,
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
    amenities: input.amenities ?? [],
    photos: [
      `/images/apartments/apt-${String(number).padStart(2, '0')}/01.jpg`,
      `/images/apartments/apt-${String(number).padStart(2, '0')}/02.jpg`,
    ],
    active: true,
    outOfService: false,
    houseNotes: input.houseNotes ?? '',
  };
  db.apartments.push(apt);
  db.cleaningState[apt.id] = { status: 'clean', updatedAt: nowISO(), note: 'Added to the catalogue.' };
  return apt;
}

/* ----------------------------------------------------------------------------- staff */

export function upsertStaff(
  db: Database,
  actorId: ID,
  input: Partial<StaffUser> & { id?: ID; password?: string },
): StaffUser {
  void actorId;
  if (input.id) {
    const user = db.staff.find((s) => s.id === input.id);
    if (!user) throw new OperationError('Staff account not found.', 404, 'not_found');
    const { password, ...rest } = input;
    Object.assign(user, rest);
    if (password) user.passwordHash = hashPassword(password);
    return user;
  }
  const username = (input.username ?? '').trim().toLowerCase();
  if (!username) throw new OperationError('A login handle is required.', 422, 'validation');
  if (db.staff.some((s) => s.username.toLowerCase() === username)) {
    throw new OperationError('That login handle is already taken.', 409, 'duplicate');
  }
  if (!input.name?.trim()) throw new OperationError('Enter the staff member’s name.', 422, 'validation');
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
    passwordHash: hashPassword(input.password || 'lemma2026'),
  };
  db.staff.push(user);
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
    n.deliveryDetail = `Sent by ${n.markedDeliveredBy} from their own handset${patch.note ? ` — ${patch.note}` : ''}. This demo has no provider to confirm delivery, so the timestamp is the staff claim, not a carrier receipt.`;
  }
  if (patch.note && !patch.delivered) n.deliveryDetail = patch.note;
  return n;
}

/**
 * Runs the reminder sweep the scheduler would run: check-in reminders, check-out
 * reminders and balance chasers, skipping anything already drafted for that stay.
 */
export function runReminderSweep(db: Database): { created: number; skipped: number } {
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
  return { created, skipped };
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
