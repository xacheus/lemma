import type {
  ApartmentTier,
  BookingSource,
  BookingStatus,
  CleaningStatus,
  DayStatus,
  DeliveryStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  VerificationStatus,
} from './types';

export interface Meta {
  label: string;
  chip: string;
  dot: string;
  description: string;
}

export const BOOKING_STATUS_META: Record<BookingStatus, Meta> = {
  inquiry: {
    label: 'Inquiry',
    chip: 'bg-sand-100 text-sand-700 ring-1 ring-sand-300',
    dot: 'bg-sand-500',
    description: 'Enquiry only — does not block inventory.',
  },
  pending_confirmation: {
    label: 'Pending Confirmation',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Temporary booking hold awaiting deposit or reception confirmation.',
  },
  reserved: {
    label: 'Reserved',
    chip: 'bg-st-reservedBg text-st-reserved ring-1 ring-st-reserved/25',
    dot: 'bg-st-reserved',
    description: 'Confirmed booking holding apartment inventory.',
  },
  fully_paid: {
    label: 'Fully Paid',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    dot: 'bg-st-available',
    description: 'Confirmed and verified as paid in full.',
  },
  checked_in: {
    label: 'Checked-in',
    chip: 'bg-st-occupiedBg text-st-occupied ring-1 ring-st-occupied/25',
    dot: 'bg-st-occupied',
    description: 'Guest is currently in residence.',
  },
  checked_out: {
    label: 'Checked-out',
    chip: 'bg-sand-200 text-sand-700 ring-1 ring-sand-400/70',
    dot: 'bg-sand-600',
    description: 'Stay completed and closed.',
  },
  cancellation_requested: {
    label: 'Cancellation Requested',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Guest requested cancellation — awaiting staff review.',
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25',
    dot: 'bg-st-cancelled',
    description: 'Released inventory — never counts as occupancy.',
  },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, Meta> = {
  unpaid: {
    label: 'Unpaid',
    chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25',
    dot: 'bg-st-cancelled',
    description: 'No verified funds received.',
  },
  partially_paid: {
    label: 'Partially Paid',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Deposit or part payment banked, balance outstanding.',
  },
  fully_paid: {
    label: 'Fully Paid',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    dot: 'bg-st-available',
    description: 'Verified receipts cover the full stay.',
  },
  refunded: {
    label: 'Refunded',
    chip: 'bg-sand-200 text-sand-700 ring-1 ring-sand-400/70',
    dot: 'bg-sand-600',
    description: 'Money returned to the guest.',
  },
};

export const CLEANING_STATUS_META: Record<CleaningStatus, Meta> = {
  clean: {
    label: 'Completed / Ready',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    dot: 'bg-st-available',
    description: 'Inspected and ready for guest check-in.',
  },
  completed: {
    label: 'Completed',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    dot: 'bg-st-available',
    description: 'Cleaning completed and ready per property rules.',
  },
  needs_cleaning: {
    label: 'Needs Cleaning',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Awaiting allocation or cleaning start.',
  },
  assigned: {
    label: 'Assigned',
    chip: 'bg-st-reservedBg text-st-reserved ring-1 ring-st-reserved/25',
    dot: 'bg-st-reserved',
    description: 'Assigned to housekeeping attendant.',
  },
  in_progress: {
    label: 'In Progress',
    chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-300',
    dot: 'bg-brand-500',
    description: 'Housekeeping attendant is cleaning the apartment.',
  },
  inspection_required: {
    label: 'Inspection Required',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Cleaned — awaiting supervisor sign-off before check-in.',
  },
  maintenance: {
    label: 'Maintenance Hold',
    chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25',
    dot: 'bg-st-cancelled',
    description: 'Blocked from check-in until maintenance is resolved.',
  },
};

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; short: string; hint: string }> = {
  airtel_money: {
    label: 'Airtel Money',
    short: 'Airtel',
    hint: 'Mobile money — verify against the Airtel Money SMS reference before banking.',
  },
  mtn_money: {
    label: 'MTN Mobile Money',
    short: 'MTN MoMo',
    hint: 'Mobile money — verify against the MoMo SMS reference before banking.',
  },
  bank_transfer: {
    label: 'Bank Transfer',
    short: 'Bank',
    hint: 'Zanaco / FNB / Stanbic — reconcile against the statement line.',
  },
  cash: {
    label: 'Cash',
    short: 'Cash',
    hint: 'Notes counted at reception against a numbered receipt.',
  },
};

export const SOURCE_META: Record<BookingSource, string> = {
  website: 'Website',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  walk_in: 'Walk-in',
  email: 'Email',
  corporate: 'Corporate',
  travel_agent: 'Travel agent',
};

export const ROLE_META: Record<Role, { label: string; description: string; chip: string }> = {
  super_admin: {
    label: 'Super Administrator',
    description: 'Unrestricted ownership control including appointing or removing super administrators.',
    chip: 'bg-navy-900 text-white',
  },
  admin: {
    label: 'Administrator',
    description: 'Full operational & financial control: bookings, apartments, media, payments, invoices, staff and settings.',
    chip: 'bg-brand-700 text-white',
  },
  receptionist: {
    label: 'Receptionist',
    description: 'Front office: reservations, guest registration, check-in/out, quotations and payment recording.',
    chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  },
  cleaner: {
    label: 'Cleaner',
    description: 'Assigned housekeeping & maintenance reporting only. Zero access to financial or guest PII.',
    chip: 'bg-sand-100 text-navy-700 ring-1 ring-sand-300',
  },
  guest: {
    label: 'Guest',
    description: 'Registered customer: view own bookings, download quotations/receipts, manage profile.',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
  },
};

export const VERIFICATION_META: Record<VerificationStatus, Meta> = {
  pending: {
    label: 'Pending Verification',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Recorded — not counted as received until verified.',
  },
  pending_verification: {
    label: 'Pending Verification',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    dot: 'bg-st-cleaning',
    description: 'Recorded — not counted as received until verified.',
  },
  verified: {
    label: 'Verified',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    dot: 'bg-st-available',
    description: 'Confirmed against provider statement or drawer count.',
  },
  rejected: {
    label: 'Rejected',
    chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25',
    dot: 'bg-st-cancelled',
    description: 'Payment proof rejected — excluded from received total.',
  },
  refunded: {
    label: 'Refunded',
    chip: 'bg-sand-200 text-sand-700 ring-1 ring-sand-400/70',
    dot: 'bg-sand-600',
    description: 'Refunded back to guest.',
  },
};

export const DELIVERY_META: Record<DeliveryStatus, { label: string; chip: string; icon: 'link' | 'clock' | 'check' | 'alert' }> = {
  not_connected: {
    label: 'Provider not connected',
    chip: 'bg-sand-100 text-sand-700 ring-1 ring-sand-300',
    icon: 'link',
  },
  in_app_only: {
    label: 'In-app notification',
    chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
    icon: 'check',
  },
  queued_for_manual_send: {
    label: 'Queued for manual dispatch',
    chip: 'bg-st-cleaningBg text-st-cleaning ring-1 ring-st-cleaning/25',
    icon: 'clock',
  },
  delivered_manually: {
    label: 'Dispatched manually',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    icon: 'check',
  },
  sent: {
    label: 'Accepted by provider',
    chip: 'bg-st-availableBg text-st-available ring-1 ring-st-available/25',
    icon: 'check',
  },
  failed: {
    label: 'Dispatch not confirmed',
    chip: 'bg-st-cancelledBg text-st-cancelled ring-1 ring-st-cancelled/25',
    icon: 'alert',
  },
};

export const APARTMENT_TIER_LABELS: Record<ApartmentTier, string> = {
  standard: 'Standard Suite',
  deluxe: 'Deluxe Suite',
  executive: 'Executive Suite',
  family: 'Family Apartment',
  premium: 'Premium Apartment',
  studio: 'Studio Apartment',
  suite: 'One-Bedroom Suite',
  penthouse: 'Penthouse Suite',
};

export const DAY_STATUS_META: Record<DayStatus, { label: string; bg: string; text: string; ring: string }> = {
  available: { label: 'Available', bg: 'bg-st-availableBg', text: 'text-st-available', ring: 'ring-st-available/30' },
  reserved: { label: 'Reserved', bg: 'bg-st-reservedBg', text: 'text-st-reserved', ring: 'ring-st-reserved/30' },
  occupied: { label: 'Occupied', bg: 'bg-st-occupiedBg', text: 'text-st-occupied', ring: 'ring-st-occupied/30' },
  cleaning: { label: 'Cleaning', bg: 'bg-st-cleaningBg', text: 'text-st-cleaning', ring: 'ring-st-cleaning/30' },
  maintenance: { label: 'Maintenance', bg: 'bg-st-cancelledBg', text: 'text-st-cancelled', ring: 'ring-st-cancelled/30' },
  cancelled: { label: 'Cancelled', bg: 'bg-st-cancelledBg', text: 'text-st-cancelled', ring: 'ring-st-cancelled/20' },
  out_of_service: { label: 'Out of service', bg: 'bg-sand-200', text: 'text-sand-700', ring: 'ring-sand-400/50' },
  past: { label: 'Past', bg: 'bg-sand-100/70', text: 'text-sand-500', ring: 'ring-sand-300/50' },
};

export const CALENDAR_LEGEND: { key: DayStatus; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'occupied', label: 'Occupied' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'cancelled', label: 'Cancelled' },
];
