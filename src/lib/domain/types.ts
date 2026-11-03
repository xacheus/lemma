/**
 * Lemma Heights Apartments — domain types.
 *
 * The whole product (public booking site + administration suite) reads and writes
 * these shapes. Every monetary amount is stored in Zambian Kwacha (ZMW) as an
 * integer number of kwacha — amounts in this business are never fractional, and
 * keeping integers avoids floating point drift in the payment ledger.
 */

export type ID = string;

/* ------------------------------------------------------------------ apartments */

export type ApartmentTier =
  | 'standard'
  | 'deluxe'
  | 'executive'
  | 'family'
  | 'premium'
  | 'studio'
  | 'suite';

export interface Apartment {
  id: ID;
  number: number;
  /** Unit label shown on door signage / folios, e.g. "LHA-101". */
  code: string;
  name: string;
  slug: string;
  tier: ApartmentTier;
  tagline: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  floor: number;
  bedConfiguration: string;
  nightlyRate: number;
  amenities: string[];
  /** Conventional paths under /public — see docs/PHOTOGRAPHY.md. */
  photos: string[];
  active: boolean;
  /** True when the unit is out of service and must not be sold. */
  outOfService: boolean;
  houseNotes: string;
}

export type CleaningStatus =
  | 'clean'
  | 'needs_cleaning'
  | 'in_progress'
  | 'maintenance';

export interface HousekeepingNote {
  at: string;
  by: ID;
  byName: string;
  text: string;
}

export type HousekeepingTaskType =
  | 'turnover'
  | 'stayover'
  | 'pre_arrival'
  | 'deep_clean'
  | 'maintenance';

export interface HousekeepingTask {
  id: ID;
  apartmentId: ID;
  /** Set when the task was produced by a departure. */
  reservationId: ID | null;
  type: HousekeepingTaskType;
  status: CleaningStatus;
  assignedTo: ID | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm — target completion time. */
  dueTime: string;
  priority: 'low' | 'normal' | 'high';
  instructions: string;
  notes: HousekeepingNote[];
  createdAt: string;
  createdBy: ID;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: ID | null;
  /** Minutes actually spent, derived on completion. */
  durationMinutes: number | null;
}

/* ----------------------------------------------------------------------- staff */

export type Role = 'admin' | 'receptionist' | 'cleaner';

export interface StaffUser {
  id: ID;
  name: string;
  /** Login handle used on the sign-in screen. */
  username: string;
  email: string;
  phone: string;
  role: Role;
  jobTitle: string;
  active: boolean;
  hiredOn: string;
  lastSeenAt: string | null;
  /** Only meaningful for cleaners. */
  shift: 'morning' | 'afternoon' | 'evening' | null;
  /** sha256$salt$digest — server-side only, never included in an API payload. */
  passwordHash?: string;
  /** Free-text permission notes shown to admins. */
  permissions: PermissionKey[] | null;
}

export type PermissionKey =
  | 'reservations.view'
  | 'reservations.create'
  | 'reservations.edit'
  | 'reservations.cancel'
  | 'reservations.checkin'
  | 'calendar.view'
  | 'apartments.view'
  | 'apartments.manage'
  | 'guests.view'
  | 'guests.viewPii'
  | 'guests.manage'
  | 'payments.view'
  | 'payments.record'
  | 'payments.verify'
  | 'payments.refund'
  | 'housekeeping.view'
  | 'housekeeping.assign'
  | 'housekeeping.complete'
  | 'housekeeping.maintenance'
  | 'reports.view'
  | 'notifications.view'
  | 'notifications.manage'
  | 'notifications.send'
  | 'staff.manage'
  | 'settings.manage'
  | 'data.reset';

/* ----------------------------------------------------------------------- guests */

export interface Guest {
  id: ID;
  fullName: string;
  phone: string;
  email: string;
  /** National Registration Card or passport number. Restricted by `guests.viewPii`. */
  nationalId: string;
  idType: 'nrc' | 'passport';
  nationality: string;
  city: string;
  company: string;
  vip: boolean;
  /** Standing preferences the team should honour on every stay. */
  specialRequests: string;
  internalNotes: string;
  createdAt: string;
  /** How the guest first reached the property. */
  source: GuestSource;
}

/* ------------------------------------------------------------------ reservations */

/** Where a guest record came from — a superset of the booking channels. */
export type GuestSource = 'website' | 'whatsapp' | 'phone' | 'walk_in' | 'referral' | 'corporate' | 'email' | 'travel_agent';

export type BookingStatus =
  | 'inquiry'
  | 'reserved'
  | 'fully_paid'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'fully_paid' | 'refunded';

/** How a reservation reached the property. */
export type BookingSource =
  | 'website'
  | 'whatsapp'
  | 'phone'
  | 'walk_in'
  | 'email'
  | 'corporate'
  | 'travel_agent';

/** Statuses that hold inventory and block other guests from the same dates. */
export const CONFIRMED_BOOKING_STATUSES: BookingStatus[] = [
  'reserved',
  'fully_paid',
  'checked_in',
  'checked_out',
];

/** Statuses that mean somebody is physically in the unit tonight. */
export const OCCUPYING_STATUSES: BookingStatus[] = ['reserved', 'fully_paid', 'checked_in'];

export interface ReservationEvent {
  at: string;
  by: string;
  label: string;
  detail?: string;
}

export interface Reservation {
  id: ID;
  reference: string;
  guestId: ID;
  apartmentId: ID;
  /** Local dates. checkOut is the morning the guest vacates — it is not a charged night. */
  checkIn: string;
  checkOut: string;
  guestCount: number;
  /** Price captured at booking time — rate changes must not rewrite old folios. */
  nightlyRate: number;
  nights: number;
  totalAmount: number;
  /** Discounts are rare but real (long stays, corporate rate). Always >= 0. */
  discount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  source: BookingSource;
  arrivalTime: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  history: ReservationEvent[];
}

/* --------------------------------------------------------------------- payments */

export type PaymentMethod = 'airtel_money' | 'mtn_money' | 'bank_transfer' | 'cash';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface PaymentProof {
  fileName: string;
  mimeType: string;
  /** Base64 data URL — the demo keeps evidence next to the record it belongs to. */
  dataUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  sizeBytes: number;
}

export interface Payment {
  id: ID;
  reservationId: ID;
  amount: number;
  method: PaymentMethod;
  kind: 'deposit' | 'part_payment' | 'final_settlement' | 'refund';
  /** Mobile-money transaction reference or bank confirmation number. */
  reference: string;
  paidAt: string;
  recordedBy: ID;
  recordedByName: string;
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verificationNote: string;
  proof: PaymentProof | null;
  note: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ notifications */

export type NotificationChannel = 'whatsapp' | 'sms' | 'email' | 'in_app';

export type NotificationEventType =
  | 'booking_confirmation'
  | 'booking_request'
  | 'payment_received'
  | 'checkin_reminder'
  | 'checkout_reminder'
  | 'balance_reminder'
  | 'cancellation'
  | 'cleaning_assigned'
  | 'cleaning_completed'
  | 'maintenance_reported'
  | 'reservation_modified';

/**
 * `not_connected` is the honest default: no messaging provider is wired up, so
 * the system never claims a message was delivered.
 */
export type DeliveryStatus =
  | 'not_connected'
  | 'queued_for_manual_send'
  | 'delivered_manually'
  | 'failed';

export interface NotificationRecord {
  id: ID;
  event: NotificationEventType;
  channel: NotificationChannel;
  title: string;
  body: string;
  recipientName: string;
  recipientContact: string;
  guestId: ID | null;
  reservationId: ID | null;
  apartmentId: ID | null;
  createdAt: string;
  scheduledFor: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryDetail: string;
  markedDeliveredAt: string | null;
  markedDeliveredBy: string | null;
  readAt: string | null;
  createdAutomatically: boolean;
}

/* --------------------------------------------------------------------- settings */

export interface PaymentMethodSetting {
  id: PaymentMethod;
  label: string;
  enabled: boolean;
  /** Paybill / merchant code for mobile money, account number for transfers. */
  instructions: string;
  accountLabel: string;
  accountNumber: string;
}

export interface ChannelSetting {
  enabled: boolean;
  /** Always false until a real provider is wired up — surfaced in the UI. */
  connected: boolean;
  provider: string | null;
  note: string;
}

export interface Settings {
  property: {
    name: string;
    legalName: string;
    tagline: string;
    addressLine: string;
    city: string;
    country: string;
    phone: string;
    whatsapp: string;
    email: string;
    website: string;
    taxPayerId: string;
    receptionHours: string;
  };
  booking: {
    checkInTime: string;
    checkOutTime: string;
    depositPercent: number;
    minNightsWeekend: number;
    maxAdvanceBookingDays: number;
    cancellationPolicyHours: number;
    cancellationText: string;
    taxesIncluded: boolean;
    autoConfirmPublicRequests: boolean;
  };
  payments: {
    methods: PaymentMethodSetting[];
    proofUploadEnabled: boolean;
    requireVerification: boolean;
    receiptPrefix: string;
  };
  notifications: {
    whatsapp: ChannelSetting;
    sms: ChannelSetting;
    email: ChannelSetting;
    checkInReminderDays: number;
    checkOutReminderDays: number;
    balanceReminderDays: number;
    sendBookingConfirmation: boolean;
    sendPaymentConfirmation: boolean;
    sendCancellationNotice: boolean;
    sendCleaningReminders: boolean;
    sendBalanceReminders: boolean;
    senderName: string;
  };
  housekeeping: {
    turnaroundMinutes: number;
    autoAssignCleaner: boolean;
    preArrivalInspectionMinutes: number;
  };
  locale: {
    currency: 'ZMW';
    currencySymbol: string;
    timezone: string;
    dateStyle: 'day-month-year';
  };
}

/* ------------------------------------------------------------------------ db root */

/** Subset of the database the calendar/availability engine needs to do its job. */
export type CalendarSource = Pick<Database, 'apartments' | 'reservations' | 'housekeeping' | 'cleaningState'>;

export interface Database {
  version: number;
  /** Anchor date the demo data was generated for; used to keep the demo evergreen. */
  seededOn: string;
  createdAt: string;
  updatedAt: string;
  apartments: Apartment[];
  housekeeping: HousekeepingTask[];
  /** Apartment-level housekeeping snapshot, keyed by apartment id. */
  cleaningState: Record<ID, { status: CleaningStatus; updatedAt: string; note: string }>;
  guests: Guest[];
  staff: StaffUser[];
  reservations: Reservation[];
  payments: Payment[];
  notifications: NotificationRecord[];
  settings: Settings;
  sequences: { reservation: number; receipt: number };
  /**
   * Business date in Africa/Lusaka, stamped by the store on every read and never
   * persisted. Selectors use it so "today" is the property's today, not the clock
   * of whoever happens to be hosting the demo.
   */
  __today: string;
}

/* ------------------------------------------------------------------ derived views */

export interface ReservationView extends Reservation {
  guest: Guest | null;
  apartment: Apartment | null;
  /** Sum of verified payments only. */
  verifiedPaid: number;
  /** Recorded but awaiting verification by authorised staff. */
  pendingVerification: number;
  balanceDue: number;
  balanceIsSettled: boolean;
  depositDue: number;
  isTodayCheckIn: boolean;
  isTodayCheckOut: boolean;
  isConfirmed: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  receiptCount: number;
}

export type DayStatus =
  | 'available'
  | 'reserved'
  | 'occupied'
  | 'cleaning'
  | 'maintenance'
  | 'cancelled'
  | 'out_of_service'
  | 'past';

export interface CalendarCell {
  date: string;
  status: DayStatus;
  reservationId: ID | null;
  reservationRef: string | null;
  guestName: string | null;
  taskId: ID | null;
}

export interface ApartmentAvailability {
  apartmentId: ID;
  cells: CalendarCell[];
  nightsAvailable: number;
}
