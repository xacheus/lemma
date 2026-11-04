import { z } from 'zod';

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD).');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.');

export const firebaseSessionSchema = z.object({
  firebaseIdToken: z.string().min(20, 'A Firebase ID token is required.'),
});

export const loginSchema = z.object({
  username: z.string().min(2, 'Enter your email address or login handle.'),
  password: z.string().min(1, 'Enter your password.'),
  firebaseIdToken: z.string().optional(),
});

// Strict customer registration schema — never accepts privileged role fields.
// Every free-text field is trimmed before it is validated, so a trailing space in a
// pasted address is not reported back to the guest as an invalid email.
export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your full name.')
    .max(100, 'Please use a shorter name.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Please enter your email address.')
    .email('That email address does not look right. Please check it.'),
  phoneNumber: z
    .string()
    .trim()
    .min(6, 'Please enter a phone number reception can reach you on.')
    .max(28, 'That phone number is too long.')
    // The form starts the field with a bare "+260" dialling code. Taken on its own it
    // passes a length check but reaches nobody, so it is rejected here.
    .refine((value) => (value.replace(/\D/g, '') ?? '').length >= 9, {
      message: 'Please enter the rest of your phone number.',
    }),
  password: z
    .string()
    .min(6, 'Please choose a password of at least 6 characters.')
    .max(128, 'That password is too long.')
    .optional(),
  firebaseIdToken: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Reset token is required.'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.').max(128),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phoneNumber: z.string().min(4).max(28).optional(),
  profilePhoto: z.string().max(500).optional(),
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(6).max(128).optional(),
});


export const userRoleChangeSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'receptionist', 'cleaner', 'guest']),
  jobTitle: z.string().max(80).optional(),
  shift: z.enum(['morning', 'afternoon', 'evening']).nullable().optional(),
});

export const userStatusChangeSchema = z.object({
  accountStatus: z.enum(['active', 'deactivated', 'suspended']),
  reason: z.string().max(300).optional(),
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

const bookingStatusEnum = z.enum([
  'inquiry',
  'pending_confirmation',
  'reserved',
  'fully_paid',
  'checked_in',
  'checked_out',
  'cancellation_requested',
  'cancelled',
]);

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
    selectedServiceIds: z.array(z.string()).optional(),
    source: z.enum(['website', 'whatsapp', 'phone', 'walk_in', 'email', 'corporate', 'travel_agent']),
    status: bookingStatusEnum.optional(),
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
  .refine((v) => Boolean(v.guestId || (v.guest?.fullName && (v.guest?.phone || v.guest?.email))), {
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
  status: bookingStatusEnum.optional(),
  notes: z.string().max(1200).optional(),
  arrivalTime: timeStr.optional(),
});

export const cancelSchema = z.object({
  reason: z.string().min(4, 'Record why the booking is being cancelled.'),
  refund: z.boolean(),
  refundMethod: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']).optional(),
});

export const cancellationRequestSchema = z.object({
  reason: z.string().min(4, 'Please explain why you are requesting cancellation.').max(600),
});

export const statusSchema = z.object({
  status: bookingStatusEnum,
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
  number: z.coerce.number().int().min(1).max(999).optional(),
  code: z.string().max(32).optional(),
  name: z.string().min(2, 'Name the apartment.'),
  tier: z
    .enum(['standard', 'deluxe', 'executive', 'family', 'premium', 'studio', 'suite', 'penthouse'])
    .optional(),
  tagline: z.string().max(160).optional(),
  description: z.string().max(3000).optional(),
  maxGuests: z.coerce.number().int().min(1).max(16),
  bedrooms: z.coerce.number().int().min(0).max(10),
  bathrooms: z.coerce.number().int().min(1).max(10),
  sizeSqm: z.coerce.number().min(8).max(1000),
  floor: z.coerce.number().int().min(-3).max(40).optional(),
  bedConfiguration: z.string().max(160).optional(),
  nightlyRate: z.coerce.number().min(1, 'A nightly rate in Kwacha is required.'),
  weekendRate: z.coerce.number().min(0).nullable().optional(),
  includedGuests: z.coerce.number().int().min(1).max(16).optional(),
  extraGuestFee: z.coerce.number().min(0).optional(),
  seasonalRates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80),
        startDate: dateStr,
        endDate: dateStr,
        nightlyRate: z.coerce.number().min(1),
        active: z.boolean().default(true),
      }),
    )
    .optional(),
  specialOffers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80),
        minNights: z.coerce.number().int().min(1),
        discountPercent: z.coerce.number().min(0).max(90),
        validFrom: dateStr.optional(),
        validTo: dateStr.optional(),
        active: z.boolean().default(true),
      }),
    )
    .optional(),
  optionalServices: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80),
        price: z.coerce.number().min(0),
        priceType: z.enum(['per_stay', 'per_night']),
        description: z.string().max(200).optional(),
        active: z.boolean().default(true),
      }),
    )
    .optional(),
  amenities: z.array(z.string()).optional(),
  facilities: z.array(z.string()).optional(),
  photos: z.array(z.string().max(500)).max(24).optional(),
  coverPhoto: z.string().max(500).optional(),
  active: z.boolean().optional(),
  publicationStatus: z.enum(['published', 'draft', 'unpublished']).optional(),
  outOfService: z.boolean().optional(),
  houseNotes: z.string().max(800).optional(),
});

export const paymentCreateSchema = z.object({
  reservationId: z.string().min(1),
  amount: z.coerce.number().positive('Enter the amount actually received.'),
  method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
  kind: z.enum(['deposit', 'part_payment', 'final_settlement']),
  reference: z.string().max(64).optional(),
  paidAt: dateStr.optional(),
  note: z.string().max(600).optional(),
  /** Bank a receipt that was submitted by the guest from their account. */
  claimId: z.string().max(60).nullable().optional(),
  proof: z
    .object({
      fileName: z.string().max(120),
      mimeType: z.string().max(60),
      dataUrl: z.string().max(750_000, 'Please use a proof image or PDF under 500 KB.'),
      publicId: z.string().max(240).optional(),
      sizeBytes: z.coerce.number().min(0).max(500 * 1024, 'Proof must be under 500 KB. You can submit a transaction reference without an attachment.'),
    })
    .nullable()
    .optional(),
});

/**
 * A guest's own payment submission. The channel is chosen by the guest from the
 * methods the business has enabled; nothing here can bank money — it records a claim.
 */
export const guestPaymentClaimSchema = z.object({
  reservationId: z.string().min(1, 'Choose the booking this payment is for.'),
  amount: z.coerce.number().positive('Enter the amount you paid.'),
  method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
  reference: z.string().min(3, 'Enter the transaction ID, SMS code or slip number.').max(64),
  paidAt: dateStr.optional(),
  note: z.string().max(400).optional(),
  proof: z
    .object({
      fileName: z.string().max(120),
      mimeType: z.string().max(60),
      dataUrl: z.string().max(750_000, 'Please use a proof image or PDF under 500 KB.'),
      publicId: z.string().max(240).optional(),
      sizeBytes: z.coerce.number().min(0).max(500 * 1024, 'Proof must be under 500 KB. You can submit a transaction reference without an attachment.'),
    })
    .refine((proof) => {
      if (!proof) return true;
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(proof.mimeType)) return false;
      const prefix = `data:${proof.mimeType};base64,`;
      if (!proof.dataUrl.startsWith(prefix)) return false;
      const encoded = proof.dataUrl.slice(prefix.length);
      return /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) &&
        Buffer.from(encoded, 'base64').byteLength === proof.sizeBytes;
    }, 'The proof file could not be read. Please choose a smaller image or PDF.')
    .nullable()
    .optional(),
});

export const paymentImportSchema = z.object({
  csv: z.string().min(10, 'Paste or upload the statement first.').max(2_000_000),
  fallbackMethod: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']).default('bank_transfer'),
  commit: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        index: z.coerce.number().int(),
        reservationId: z.string().min(1),
        amount: z.coerce.number().positive(),
        method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
        reference: z.string().min(1).max(64),
        date: dateStr.nullable().optional(),
        description: z.string().max(200).optional(),
        note: z.string().max(300).optional(),
        kind: z.enum(['deposit', 'part_payment', 'final_settlement']).default('part_payment'),
        claimId: z.string().max(60).nullable().optional(),
      }),
    )
    .optional(),
});

export const guestPaymentClaimReviewSchema = z.object({
  status: z.enum(['rejected']),
  note: z.string().min(4, 'Tell the guest why the payment was not found.').max(400),
});

export const paymentVerifySchema = z.object({
  status: z.enum(['verified', 'rejected']),
  note: z.string().max(400).optional(),
});

export const refundSchema = z.object({
  reservationId: z.string().optional(),
  amount: z.coerce.number().positive(),
  method: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
  reference: z.string().max(64).optional(),
  note: z.string().max(400).optional(),
});

const cleaningStatusEnum = z.enum([
  'clean',
  'needs_cleaning',
  'assigned',
  'in_progress',
  'completed',
  'inspection_required',
  'maintenance',
]);

export const housekeepingCreateSchema = z.object({
  apartmentId: z.string().min(1),
  type: z.enum(['turnover', 'stayover', 'pre_arrival', 'deep_clean', 'maintenance']),
  date: dateStr,
  dueTime: timeStr.optional(),
  assignedTo: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  instructions: z.string().max(600).optional(),
  status: cleaningStatusEnum.optional(),
  reservationId: z.string().nullable().optional(),
});

export const housekeepingPatchSchema = z.object({
  status: cleaningStatusEnum.optional(),
  assignedTo: z.string().nullable().optional(),
  date: dateStr.optional(),
  dueTime: timeStr.optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  instructions: z.string().max(600).optional(),
  note: z.string().max(600).optional(),
  apartmentId: z.string().optional(),
  type: z.enum(['turnover', 'stayover', 'pre_arrival', 'deep_clean', 'maintenance']).optional(),
});

export const maintenanceCreateSchema = z.object({
  apartmentId: z.string().min(1, 'Select an apartment.'),
  faultDescription: z.string().min(4, 'Describe the fault or repair needed.').max(1200),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.string().nullable().optional(),
  blocksReadiness: z.boolean().optional(),
  photos: z
    .array(
      z.object({
        url: z.string().max(600),
        publicId: z.string().max(240),
        caption: z.string().max(200).optional(),
      }),
    )
    .optional(),
});

export const maintenancePatchSchema = z.object({
  status: z.enum(['reported', 'assigned', 'in_progress', 'resolved']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.string().nullable().optional(),
  blocksReadiness: z.boolean().optional(),
  resolutionNotes: z.string().max(1200).optional(),
  addPhotos: z
    .array(
      z.object({
        url: z.string().max(600),
        publicId: z.string().max(240),
        caption: z.string().max(200).optional(),
      }),
    )
    .optional(),
});

export const quotationCreateSchema = z.object({
  idempotencyKey: z.string().max(100).optional(),
  guestId: z.string().optional(),
  customerName: z.string().min(2, 'Customer name is required.').max(120),
  customerEmail: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  customerPhone: z.string().min(6, 'Customer phone is required.').max(32),
  customerCompany: z.string().max(120).optional(),
  customerAddress: z.string().max(200).optional(),
  apartmentId: z.string().min(1, 'Select an apartment.'),
  checkIn: dateStr,
  checkOut: dateStr,
  guestCount: z.coerce.number().int().min(1).max(16),
  overrideNightlyRate: z.coerce.number().min(1).nullable().optional(),
  discount: z.coerce.number().min(0).optional(),
  selectedServiceIds: z.array(z.string()).optional(),
  customServices: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120),
        quantity: z.coerce.number().min(1),
        unitPrice: z.coerce.number().min(0),
        total: z.coerce.number().min(0),
      }),
    )
    .optional(),
  notes: z.string().max(1200).optional(),
  validityDays: z.coerce.number().int().min(1).max(90).optional(),
  reservationId: z.string().nullable().optional(),
});

export const quotationActionSchema = z.object({
  action: z.enum(['set_status', 'convert_to_booking', 'convert_to_invoice', 'send_email']),
  status: z.enum(['draft', 'sent', 'accepted', 'expired', 'converted', 'declined']).optional(),
  customerTpin: z.string().max(40).optional(),
  emailTo: z.string().email().optional(),
});

export const invoiceCreateSchema = z.object({
  reservationId: z.string().min(1, 'Select a booking.'),
  customerCompany: z.string().max(120).optional(),
  customerTpin: z.string().max(40).optional(),
  notes: z.string().max(1200).optional(),
});

export const mediaPatchSchema = z.object({
  title: z.string().max(160).optional(),
  description: z.string().max(600).optional(),
  apartmentId: z.string().nullable().optional(),
  isCover: z.boolean().optional(),
  order: z.coerce.number().int().min(0).optional(),
});

export const galleryReorderSchema = z.object({
  apartmentId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)),
});

export const staffSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Name is required.'),
  username: z.string().min(2, 'Choose a login handle.'),
  email: z.string().email('Enter a valid email.').or(z.literal('')).optional(),
  phone: z.string().max(24).optional(),
  role: z.enum(['super_admin', 'admin', 'receptionist', 'cleaner']),
  jobTitle: z.string().max(60).optional(),
  active: z.boolean().optional(),
  shift: z.enum(['morning', 'afternoon', 'evening']).nullable().optional(),
  password: z.string().min(6, 'Use at least six characters.').optional(),
  permissions: z.array(z.string()).nullable().optional(),
});

export const staffImportSchema = z.object({
  csv: z.string().min(10, 'Paste or upload the staff list first.').max(500_000),
});

export const settingsSchema = z.object({
  property: z.record(z.string(), z.any()).optional(),
  tax: z.record(z.string(), z.any()).optional(),
  documents: z.record(z.string(), z.any()).optional(),
  booking: z.record(z.string(), z.any()).optional(),
  payments: z.object({
    methods: z.array(z.object({
      id: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']),
      label: z.string().trim().min(1).max(80),
      enabled: z.boolean(),
      instructions: z.string().max(1000),
      accountLabel: z.string().max(80),
      accountNumber: z.string().max(200),
      networkName: z.string().max(100).optional(),
      recipientName: z.string().max(120).optional(),
      mobileNumber: z.string().max(80).optional(),
      merchantCode: z.string().max(80).optional(),
      agentCode: z.string().max(80).optional(),
      businessName: z.string().max(120).optional(),
      bankName: z.string().max(120).optional(),
      bankAccountName: z.string().max(120).optional(),
      bankAccountNumber: z.string().max(120).optional(),
      bankBranch: z.string().max(120).optional(),
      additionalInstructions: z.string().max(1000).optional(),
    }).strict()).max(4).refine((methods) => new Set(methods.map((m) => m.id)).size === methods.length, 'Payment methods must be unique.').optional(),
  }).passthrough().optional(),
  notifications: z.record(z.string(), z.any()).optional(),
  housekeeping: z.record(z.string(), z.any()).optional(),
  googleBusiness: z.record(z.string(), z.any()).optional(),
  googleBusinessProfile: z.record(z.string(), z.any()).optional(),
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
    selectedServiceIds: z.array(z.string()).optional(),
    notes: z.string().max(800).optional(),
    agreedPolicy: z.literal(true, { error: 'Please accept the booking conditions.' }),
    /**
     * The channel the guest intends to pay through. Optional so an older form still
     * books; when present it must be one the business has enabled, and it decides
     * which instructions the confirmation shows. It is a preference, not a payment.
     */
    paymentMethod: z.enum(['airtel_money', 'mtn_money', 'bank_transfer', 'cash']).optional(),
    /** Honeypot — humans never see this field. */
    company_url: z.string().max(0).optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in.', path: ['checkOut'] });
