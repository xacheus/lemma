import { z } from 'zod';

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD).');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.');

export const loginSchema = z.object({
  username: z.string().min(2, 'Enter your login handle.'),
  password: z.string().min(1, 'Enter your password.'),
});

const guestFields = {
  fullName: z.string().min(2, 'Guest full name is required.'),
  phone: z.string().min(6, 'A reachable phone number is required.'),
  email: z.string().email('Enter a valid email address.').or(z.literal('')).optional(),
  nationalId: z.string().max(32).optional(),
  idType: z.enum(['nrc', 'passport']).optional(),
  city: z.string().max(60).optional(),
  company: z.string().max(120).optional(),
  specialRequests: z.string().max(600).optional(),
};

export const reservationCreateSchema = z
  .object({
    guestId: z.string().min(1).optional(),
    guest: z.object(guestFields).optional(),
    apartmentId: z.string().min(1, 'Choose an apartment.'),
    checkIn: dateStr,
    checkOut: dateStr,
    guestCount: z.coerce.number().int().min(1).max(12),
    nightlyRate: z.coerce.number().min(0).optional(),
    discount: z.coerce.number().min(0).optional(),
    source: z.enum(['website', 'whatsapp', 'phone', 'walk_in', 'email', 'corporate', 'travel_agent']),
    status: z.enum(['inquiry', 'reserved', 'fully_paid', 'checked_in', 'checked_out', 'cancelled']).optional(),
    notes: z.string().max(1200).optional(),
    arrivalTime: timeStr.optional(),
    asInquiry: z.boolean().optional(),
    initialDeposit: z
      .object({
        amount: z.coerce.number().min(0),
        method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
        reference: z.string().max(64).optional(),
      })
      .nullable()
      .optional(),
  })
  .refine((v) => (v.guestId || v.guest?.fullName) && (v.guest?.phone || v.guest?.email) !== undefined, {
    message: 'Attach an existing guest or capture a name and contact detail.',
    path: ['guest'],
  });

export const reservationPatchSchema = z.object({
  guestId: z.string().min(1).optional(),
  guest: z.object(guestFields).optional(),
  apartmentId: z.string().min(1).optional(),
  checkIn: dateStr.optional(),
  checkOut: dateStr.optional(),
  guestCount: z.coerce.number().int().min(1).max(12).optional(),
  nightlyRate: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  source: z.enum(['website', 'whatsapp', 'phone', 'walk_in', 'email', 'corporate', 'travel_agent']).optional(),
  status: z.enum(['inquiry', 'reserved', 'fully_paid', 'checked_in', 'checked_out', 'cancelled']).optional(),
  notes: z.string().max(1200).optional(),
  arrivalTime: timeStr.optional(),
});

export const cancelSchema = z.object({
  reason: z.string().min(4, 'Record why the booking is being cancelled.'),
  refund: z.boolean(),
  refundMethod: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']).optional(),
});

export const statusSchema = z.object({
  status: z.enum(['inquiry', 'reserved', 'fully_paid', 'checked_in', 'checked_out', 'cancelled']),
  note: z.string().max(400).optional(),
});

export const actionSchema = z.object({
  action: z.enum(['check_in', 'check_out', 'reopen']),
  arrivalTime: timeStr.optional(),
});

export const guestSchema = z.object({
  fullName: z.string().min(2, 'Full name is required.'),
  phone: z.string().min(6, 'A phone number is required.'),
  email: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  nationalId: z.string().max(32).optional(),
  idType: z.enum(['nrc', 'passport']).optional(),
  nationality: z.string().max(40).optional(),
  city: z.string().max(60).optional(),
  company: z.string().max(120).optional(),
  vip: z.boolean().optional(),
  specialRequests: z.string().max(600).optional(),
  internalNotes: z.string().max(1200).optional(),
  source: z.enum(['website', 'whatsapp', 'phone', 'walk_in', 'referral', 'corporate', 'email', 'travel_agent']).optional(),
});

export const apartmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Name the apartment.'),
  tier: z.enum(['standard', 'deluxe', 'executive', 'family', 'premium', 'studio', 'suite']).optional(),
  tagline: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  maxGuests: z.coerce.number().int().min(1).max(12),
  bedrooms: z.coerce.number().int().min(0).max(8),
  bathrooms: z.coerce.number().int().min(1).max(6),
  sizeSqm: z.coerce.number().min(8).max(600),
  floor: z.coerce.number().int().min(-3).max(30).optional(),
  bedConfiguration: z.string().max(120).optional(),
  nightlyRate: z.coerce.number().min(1, 'A nightly rate in Kwacha is required.'),
  amenities: z.array(z.string()).optional(),
  photos: z.array(z.string().max(300)).max(8).optional(),
  active: z.boolean().optional(),
  outOfService: z.boolean().optional(),
  houseNotes: z.string().max(600).optional(),
});

export const paymentCreateSchema = z.object({
  reservationId: z.string().min(1),
  amount: z.coerce.number().positive('Enter the amount actually received.'),
  method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
  kind: z.enum(['deposit', 'part_payment', 'final_settlement']),
  reference: z.string().max(64).optional(),
  paidAt: dateStr.optional(),
  note: z.string().max(600).optional(),
  proof: z
    .object({
      fileName: z.string().max(120),
      mimeType: z.string().max(60),
      dataUrl: z.string().max(4_500_000),
      sizeBytes: z.coerce.number().min(0),
    })
    .nullable()
    .optional(),
});

export const paymentVerifySchema = z.object({
  status: z.enum(['verified', 'rejected']),
  note: z.string().max(400).optional(),
});

export const refundSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
  reference: z.string().max(64).optional(),
  note: z.string().max(400).optional(),
});

export const housekeepingCreateSchema = z.object({
  apartmentId: z.string().min(1),
  type: z.enum(['turnover', 'stayover', 'pre_arrival', 'deep_clean', 'maintenance']),
  date: dateStr,
  dueTime: timeStr.optional(),
  assignedTo: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  instructions: z.string().max(600).optional(),
  status: z.enum(['clean', 'needs_cleaning', 'in_progress', 'maintenance']).optional(),
  reservationId: z.string().nullable().optional(),
});

export const housekeepingPatchSchema = z.object({
  status: z.enum(['clean', 'needs_cleaning', 'in_progress', 'maintenance']).optional(),
  assignedTo: z.string().nullable().optional(),
  date: dateStr.optional(),
  dueTime: timeStr.optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  instructions: z.string().max(600).optional(),
  note: z.string().max(600).optional(),
  apartmentId: z.string().optional(),
  type: z.enum(['turnover', 'stayover', 'pre_arrival', 'deep_clean', 'maintenance']).optional(),
});

export const staffSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Name is required.'),
  username: z.string().min(2, 'Choose a login handle.'),
  email: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  phone: z.string().max(24).optional(),
  role: z.enum(['admin', 'receptionist', 'cleaner']),
  jobTitle: z.string().max(60).optional(),
  active: z.boolean().optional(),
  shift: z.enum(['morning', 'afternoon', 'evening']).nullable().optional(),
  password: z.string().min(6, 'Use at least six characters.').optional(),
  permissions: z.array(z.string()).nullable().optional(),
});

export const settingsSchema = z.object({
  property: z.record(z.string(), z.any()).optional(),
  booking: z.record(z.string(), z.any()).optional(),
  payments: z.record(z.string(), z.any()).optional(),
  notifications: z.record(z.string(), z.any()).optional(),
  housekeeping: z.record(z.string(), z.any()).optional(),
  locale: z.record(z.string(), z.any()).optional(),
});

export const notificationPatchSchema = z.object({
  read: z.boolean().optional(),
  delivered: z.boolean().optional(),
  note: z.string().max(400).optional(),
});

export const notificationSendSchema = z.object({
  reservationId: z.string().optional(),
  guestId: z.string().optional(),
  channel: z.enum(['whatsapp', 'sms', 'email', 'in_app']),
  title: z.string().min(3).max(90),
  body: z.string().min(10, 'Write the message the guest will read.'),
  recipientName: z.string().min(2),
  recipientContact: z.string().min(6),
  markSent: z.boolean().optional(),
});

export const publicBookingSchema = z
  .object({
    fullName: z.string().min(2, 'Please tell us your full name.'),
    phone: z.string().min(6, 'A reachable phone number is required.'),
    email: z.string().email('Enter a valid email address.').or(z.literal('')).optional(),
    nationalId: z.string().max(32).optional(),
    idType: z.enum(['nrc', 'passport']).optional(),
    apartmentId: z.string().min(1, 'Choose an apartment.'),
    checkIn: dateStr,
    checkOut: dateStr,
    guestCount: z.coerce.number().int().min(1).max(12),
    notes: z.string().max(800).optional(),
    agreedPolicy: z.literal(true, { error: 'Please accept the booking conditions.' }),
    /** Honeypot — humans never see this field. */
    company_url: z.string().max(0).optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in.', path: ['checkOut'] });
