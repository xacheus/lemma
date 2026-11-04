/**
 * Lemma Apartments — Production Domain Types
 *
 * Maps directly to the Firestore collection architecture:
 *   users/{uid}
 *   apartments/{apartmentId}
 *   bookings/{bookingId}
 *   guests/{guestId}
 *   payments/{paymentId}
 *   quotations/{quotationId}
 *   invoices/{invoiceId}
 *   receipts/{receiptId}
 *   staff_tasks/{taskId}
 *   notifications/{notificationId}
 *   maintenance/{maintenanceId}
 *   media/{mediaId}
 *   audit_logs/{logId}
 *   settings/{documentId}
 *
 * All monetary amounts are stored in Zambian Kwacha (ZMW).
 */

export type ID = string;

/* ---------------------------------------------------------- 1. Users & Roles */

export type Role = 'super_admin' | 'admin' | 'receptionist' | 'cleaner' | 'guest';

export type AccountStatus = 'active' | 'deactivated' | 'suspended';

/**
 * Firestore document stored at `users/{uid}` where document ID === Firebase Auth UID.
 */
export interface UserRecord {
  uid: ID;
  fullName: string;
  email: string;
  phoneNumber: string;
  profilePhoto: string;
  role: Role;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  /** Optional staff operational fields */
  username?: string;
  jobTitle?: string;
  shift?: 'morning' | 'afternoon' | 'evening' | null;
  hiredOn?: string;
  permissions?: PermissionKey[] | null;
  /** Server-only password hash & tokens when running local auth fallback */
  passwordHash?: string;
  emailVerificationToken?: string | null;
  passwordResetToken?: string | null;
  passwordResetExpiresAt?: string | null;
  sessionVersion?: number;
}

export interface StaffUser {
  id: ID;
  uid?: ID;
  name: string;
  fullName?: string;
  username: string;
  email: string;
  phone: string;
  phoneNumber?: string;
  profilePhoto?: string;
  role: Role;
  accountStatus?: AccountStatus;
  emailVerified?: boolean;
  jobTitle: string;
  active: boolean;
  hiredOn: string;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt: string | null;
  lastLoginAt?: string | null;
  shift: 'morning' | 'afternoon' | 'evening' | null;
  passwordHash?: string;
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
  | 'media.view'
  | 'media.manage'
  | 'guests.view'
  | 'guests.viewPii'
  | 'guests.manage'
  | 'payments.view'
  | 'payments.record'
  | 'payments.verify'
  | 'payments.refund'
  | 'quotations.view'
  | 'quotations.manage'
  | 'invoices.view'
  | 'invoices.manage'
  | 'housekeeping.view'
  | 'housekeeping.assign'
  | 'housekeeping.complete'
  | 'housekeeping.maintenance'
  | 'reports.view'
  | 'notifications.view'
  | 'notifications.manage'
  | 'notifications.send'
  | 'staff.manage'
  | 'staff.super_admin'
  | 'settings.manage'
  | 'audit.view';

/* --------------------------------------------------- 2. Apartments & Pricing */

export type ApartmentTier =
  | 'standard'
  | 'deluxe'
  | 'executive'
  | 'family'
  | 'premium'
  | 'studio'
  | 'suite'
  | 'penthouse';

export type PublicationStatus = 'published' | 'draft' | 'unpublished';

export interface ApartmentPhoto {
  id: ID;
  url: string;
  publicId: string;
  title: string;
  description: string;
  order: number;
  isCover: boolean;
  mediaType?: 'image' | 'document';
  uploadedAt?: string;
}

export interface SeasonalRateRule {
  id: ID;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  nightlyRate: number; // ZMW
  active: boolean;
}

export interface SpecialOfferRule {
  id: ID;
  name: string;
  minNights: number;
  discountPercent: number;
  validFrom?: string;
  validTo?: string;
  active: boolean;
}

export interface OptionalServiceItem {
  id: ID;
  name: string;
  price: number; // ZMW
  priceType: 'per_stay' | 'per_night';
  description?: string;
  active: boolean;
}

export interface Apartment {
  id: ID;
  number: number;
  /** Unit label shown on door signage / folios, e.g. "LHA-101". */
  code: string;
  name: string;
  slug: string;
  tier: ApartmentTier;
  category?: ApartmentTier;
  tagline: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  floor: number;
  bedConfiguration: string;
  /** Standard weekday nightly rate in ZMW */
  nightlyRate: number;
  /** Optional Friday/Saturday night rate in ZMW */
  weekendRate?: number | null;
  /** Guests included in base rate before extraGuestFee applies */
  includedGuests?: number;
  /** Per-night charge in ZMW for each guest above includedGuests */
  extraGuestFee?: number;
  seasonalRates?: SeasonalRateRule[];
  specialOffers?: SpecialOfferRule[];
  optionalServices?: OptionalServiceItem[];
  amenities: string[];
  facilities?: string[];
  coverPhoto?: string;
  /** Display URLs in order (kept in sync with structured gallery for compatibility) */
  photos: string[];
  gallery?: ApartmentPhoto[];
  publicationStatus?: PublicationStatus;
  active: boolean;
  /** True when the unit is out of service and must not be sold. */
  outOfService: boolean;
  houseNotes: string;
  updatedAt?: string;
}

/* ------------------------------------------- 3. Housekeeping & Maintenance */

export type CleaningStatus =
  | 'clean'
  | 'needs_cleaning'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'inspection_required'
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
  reservationId: ID | null;
  type: HousekeepingTaskType;
  status: CleaningStatus;
  assignedTo: ID | null;
  date: string;
  dueTime: string;
  priority: 'low' | 'normal' | 'high';
  instructions: string;
  checkOutTime?: string | null;
  notes: HousekeepingNote[];
  createdAt: string;
  updatedAt?: string;
  createdBy: ID;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: ID | null;
  inspectedAt?: string | null;
  inspectedBy?: ID | null;
  durationMinutes: number | null;
}

export type MaintenancePriority = 'low' | 'normal' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'reported' | 'assigned' | 'in_progress' | 'resolved';

export interface MaintenancePhoto {
  id: ID;
  url: string;
  publicId: string;
  caption?: string;
  uploadedAt: string;
}

export interface MaintenanceRecord {
  id: ID;
  apartmentId: ID;
  apartmentNumber: number;
  apartmentName: string;
  faultDescription: string;
  priority: MaintenancePriority;
  assignedTo: ID | null;
  assignedToName: string | null;
  status: MaintenanceStatus;
  blocksReadiness: boolean;
  photos: MaintenancePhoto[];
  resolutionNotes: string;
  reportedBy: ID;
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/* --------------------------------------------------------------- 4. Guests */

export type GuestSource =
  | 'website'
  | 'whatsapp'
  | 'phone'
  | 'walk_in'
  | 'referral'
  | 'corporate'
  | 'email'
  | 'travel_agent';

export interface Guest {
  id: ID;
  /** Linked Firebase Auth UID if the guest registered an online account */
  userId?: ID | null;
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  idType: 'nrc' | 'passport';
  nationality: string;
  city: string;
  company: string;
  vip: boolean;
  specialRequests: string;
  internalNotes: string;
  createdAt: string;
  updatedAt?: string;
  source: GuestSource;
}

/* --------------------------------------------------- 5. Bookings / Folios */

export type BookingStatus =
  | 'inquiry'
  | 'pending_confirmation'
  | 'reserved'
  | 'fully_paid'
  | 'checked_in'
  | 'checked_out'
  | 'cancellation_requested'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'fully_paid' | 'refunded';

export type BookingSource =
  | 'website'
  | 'whatsapp'
  | 'phone'
  | 'walk_in'
  | 'email'
  | 'corporate'
  | 'travel_agent';

/** Statuses that permanently hold inventory (plus unexpired pending_confirmation holds). */
export const CONFIRMED_BOOKING_STATUSES: BookingStatus[] = [
  'reserved',
  'fully_paid',
  'checked_in',
  'checked_out',
  'cancellation_requested',
];

export const OCCUPYING_STATUSES: BookingStatus[] = [
  'reserved',
  'fully_paid',
  'checked_in',
  'cancellation_requested',
];

export interface ReservationEvent {
  at: string;
  by: string;
  label: string;
  detail?: string;
}

export interface SelectedServiceLine {
  id: ID;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface Reservation {
  id: ID;
  reference: string;
  /** Authenticated customer UID when booked by or linked to a registered guest */
  userId?: ID | null;
  guestId: ID;
  apartmentId: ID;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  nightlyRate: number;
  nights: number;
  roomSubtotal?: number;
  extraGuestTotal?: number;
  servicesTotal?: number;
  selectedServices?: SelectedServiceLine[];
  discount: number;
  taxRatePercent?: number;
  taxAmount?: number;
  totalAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  /** ISO timestamp when a temporary `pending_confirmation` hold expires */
  holdExpiresAt?: string | null;
  quotationId?: ID | null;
  invoiceId?: ID | null;
  source: BookingSource;
  arrivalTime: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancellationRequestedAt?: string | null;
  cancellationRequestReason?: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  history: ReservationEvent[];
}

/* ----------------------------------------------------- 6. Payments Ledger */

export type PaymentMethod = 'airtel_money' | 'mtn_money' | 'bank_transfer' | 'cash';

export type VerificationStatus =
  | 'pending'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'refunded';

export interface PaymentProof {
  fileName: string;
  mimeType: string;
  /** Cloudinary secure URL or local uploaded asset URL */
  url?: string;
  publicId?: string;
  dataUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  sizeBytes: number;
}

export interface PaymentAuditEntry {
  at: string;
  by: string;
  action: string;
  status: VerificationStatus;
  note?: string;
}

export interface Payment {
  id: ID;
  reservationId: ID;
  bookingId?: ID;
  guestId?: ID;
  userId?: ID | null;
  receiptId?: ID | null;
  receiptNumber?: string | null;
  amount: number;
  method: PaymentMethod;
  kind: 'deposit' | 'part_payment' | 'final_settlement' | 'refund';
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
  auditTrail?: PaymentAuditEntry[];
  createdAt: string;
}

/* ------------------------------- 7. Quotations, Invoices & Payment Receipts */

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'expired'
  | 'declined'
  | 'converted';

export interface DocumentLineItem {
  description: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  amount: number;
}

export interface Quotation {
  id: ID;
  quotationNumber: string;
  idempotencyKey?: string | null;
  shareToken: string;
  status: QuotationStatus;
  issueDate: string;
  expiryDate: string;
  userId: ID | null;
  guestId: ID | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCompany: string;
  customerAddress: string;
  apartmentId: ID;
  apartmentNumber: number;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  nightlyRate: number;
  lineItems: DocumentLineItem[];
  additionalServices: SelectedServiceLine[];
  subtotal: number;
  discount: number;
  taxName: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  taxAmount: number;
  totalAmount: number;
  depositPercent: number;
  depositRequired: number;
  outstandingBalance: number;
  notes: string;
  termsAndConditions: string;
  paymentInstructions: string;
  reservationId: ID | null;
  invoiceId: ID | null;
  emailedAt: string | null;
  createdBy: ID;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'void';

export interface Invoice {
  id: ID;
  invoiceNumber: string;
  idempotencyKey?: string | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  quotationId: ID | null;
  reservationId: ID | null;
  userId: ID | null;
  guestId: ID | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCompany: string;
  customerTpin: string;
  apartmentId: ID | null;
  apartmentNumber: number | null;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  lineItems: DocumentLineItem[];
  subtotal: number;
  discount: number;
  taxName: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  taxAmount: number;
  totalAmount: number;
  verifiedPaid: number;
  balanceDue: number;
  notes: string;
  paymentInstructions: string;
  termsAndConditions: string;
  createdBy: ID;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptRecord {
  id: ID;
  receiptNumber: string;
  paymentId: ID;
  reservationId: ID;
  invoiceId: ID | null;
  userId: ID | null;
  guestId: ID | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  apartmentName: string;
  apartmentNumber: number;
  bookingReference: string;
  amount: number;
  method: PaymentMethod;
  transactionReference: string;
  paidAt: string;
  verifiedBy: string;
  verifiedAt: string;
  totalBookingAmount: number;
  totalVerifiedPaid: number;
  remainingBalance: number;
  createdAt: string;
}

/* ------------------------------------------- 8. Media & Audit Log Records */

export type MediaCategory =
  | 'apartment'
  | 'property'
  | 'property_document'
  | 'profile'
  | 'profile_photo'
  | 'payment_proof'
  | 'maintenance'
  | 'document'
  | 'brand';

export interface MediaRecord {
  id: ID;
  url: string;
  thumbnailUrl: string;
  detailUrl: string;
  publicId: string;
  storageProvider: 'cloudinary' | 'local';
  mediaType: 'image' | 'document';
  category: MediaCategory;
  title: string;
  description: string;
  apartmentId: ID | null;
  apartmentName: string | null;
  order: number;
  isCover: boolean;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  visibility: 'public' | 'private';
  uploadedBy: ID;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditCategory =
  | 'role'
  | 'auth'
  | 'booking'
  | 'payment'
  | 'refund'
  | 'staff'
  | 'apartment'
  | 'document'
  | 'media'
  | 'housekeeping'
  | 'maintenance'
  | 'settings';

export interface AuditLogRecord {
  id: ID;
  category: AuditCategory;
  action: string;
  actorUid: ID;
  actorName: string;
  actorRole: Role | 'system' | 'public';
  targetType: string;
  targetId: ID;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
}

/* ----------------------------------------------------- 9. Notifications */

export type NotificationChannel = 'whatsapp' | 'sms' | 'email' | 'in_app';

export type NotificationEventType =
  | 'new_booking'
  | 'booking_confirmation'
  | 'booking_request'
  | 'payment_recorded'
  | 'payment_received'
  | 'payment_verified'
  | 'payment_rejected'
  | 'upcoming_checkin'
  | 'checkin_reminder'
  | 'upcoming_checkout'
  | 'checkout_reminder'
  | 'balance_reminder'
  | 'booking_cancellation'
  | 'cancellation'
  | 'cleaning_assignment'
  | 'cleaning_assigned'
  | 'cleaning_completed'
  | 'maintenance_report'
  | 'maintenance_reported'
  | 'reservation_modified'
  | 'quotation_sent';

export type DeliveryStatus =
  | 'not_connected'
  | 'in_app_only'
  | 'queued_for_manual_send'
  | 'delivered_manually'
  | 'sent'
  | 'failed';

export interface NotificationRecord {
  id: ID;
  event: NotificationEventType;
  channel: NotificationChannel;
  title: string;
  body: string;
  recipientUid?: ID | null;
  recipientName: string;
  recipientContact: string;
  guestId: ID | null;
  reservationId: ID | null;
  apartmentId: ID | null;
  providerMessageId?: string | null;
  createdAt: string;
  scheduledFor: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryDetail: string;
  markedDeliveredAt: string | null;
  markedDeliveredBy: string | null;
  sentAt?: string | null;
  readAt: string | null;
  createdAutomatically: boolean;
}

/* ------------------------------ 10. Settings, GBP & Dashboard Aggregations */

export interface PaymentMethodSetting {
  id: PaymentMethod;
  label: string;
  enabled: boolean;
  instructions: string;
  accountLabel: string;
  accountNumber: string;
}

export interface ChannelSetting {
  enabled: boolean;
  connected: boolean;
  provider: string | null;
  note: string;
}

export interface TaxSettings {
  enabled: boolean;
  name: string;
  ratePercent: number;
  inclusive: boolean;
  registrationNumber: string;
}

export interface DocumentNumberingSettings {
  quotationPrefix: string;
  quotationValidityDays: number;
  invoicePrefix: string;
  receiptPrefix: string;
  termsAndConditions: string;
}

export interface GoogleBusinessOpeningHour {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

export interface GoogleBusinessProfileSettings {
  businessName: string;
  primaryCategory: string;
  secondaryCategories: string[];
  addressLine: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  serviceArea: string;
  phone: string;
  website: string;
  description: string;
  openingHours: GoogleBusinessOpeningHour[];
  photos: string[];
  placeId: string;
  mapsProfileUrl: string;
  /** Strictly false unless confirmed by Google Business Profile verification */
  googleVerified: boolean;
  verificationNote: string;
  updatedAt: string;
}

export interface DashboardSummaryDoc {
  totalBookings: number;
  monthlyVerifiedRevenue: Record<string, number>; // YYYY-MM -> ZMW verified net of refunds
  currentMonthKey: string;
  currentMonthRevenue: number;
  occupiedCount: number;
  availableApartments: number;
  cleaningApartments: number;
  maintenanceApartments: number;
  todayCheckInsCount: number;
  todayCheckOutsCount: number;
  pendingVerificationAmount: number;
  openMaintenanceCount: number;
  updatedAt: string;
}

export interface Settings {
  property: {
    name: string;
    legalName: string;
    logoUrl?: string;
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
    /** Optional public-facing copy; blank fields fall back to sensible defaults. */
    privacyPolicy?: string;
    bookingTerms?: string;
  };
  tax?: TaxSettings;
  documents?: DocumentNumberingSettings;
  googleBusiness?: GoogleBusinessProfileSettings;
  booking: {
    checkInTime: string;
    checkOutTime: string;
    depositPercent: number;
    minNightsWeekend: number;
    maxAdvanceBookingDays: number;
    holdDurationMinutes?: number;
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
    requireInspectionBeforeReady?: boolean;
  };
  locale: {
    currency: 'ZMW';
    currencySymbol: string;
    timezone: string;
    dateStyle: 'day-month-year';
  };
}

/* ----------------------------------------------------- 11. Database Root */

export type CalendarSource = Pick<
  Database,
  'apartments' | 'reservations' | 'housekeeping' | 'cleaningState'
> & { maintenance?: MaintenanceRecord[] };

export interface Database {
  version: number;
  createdAt: string;
  updatedAt: string;
  users?: UserRecord[];
  apartments: Apartment[];
  housekeeping: HousekeepingTask[];
  maintenance?: MaintenanceRecord[];
  cleaningState: Record<ID, { status: CleaningStatus; updatedAt: string; note: string }>;
  guests: Guest[];
  staff: StaffUser[];
  reservations: Reservation[];
  payments: Payment[];
  quotations?: Quotation[];
  invoices?: Invoice[];
  receipts?: ReceiptRecord[];
  media?: MediaRecord[];
  auditLogs?: AuditLogRecord[];
  notifications: NotificationRecord[];
  settings: Settings;
  dashboardSummary?: DashboardSummaryDoc;
  /**
   * ISO timestamp of the one-time creation of the starting catalogue. Recorded so
   * that deleting a starting apartment keeps it deleted on the next request.
   */
  catalogueSeededAt?: string;
  sequences: {
    reservation: number;
    receipt: number;
    quotation?: number;
    invoice?: number;
  };
  __today: string;
}

/* ----------------------------------------------------- 12. Derived Views */

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  totalEstimate?: number;
}

export interface ReservationView extends Reservation {
  guest: Guest | null;
  apartment: Apartment | null;
  verifiedPaid: number;
  pendingVerification: number;
  refundsTotal?: number;
  balanceDue: number;
  balanceIsSettled: boolean;
  depositDue: number;
  depositPercent?: number;
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
  maintenanceId?: ID | null;
}

export interface ApartmentAvailability {
  apartmentId: ID;
  cells: CalendarCell[];
  nightsAvailable: number;
}
