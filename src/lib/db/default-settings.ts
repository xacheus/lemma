import type { Settings } from '../domain/types';

/**
 * Production default configuration for Lemma Heights Apartments.
 * Every field is editable in `/admin/settings` and stored in `settings/business`
 * & `settings/google_business` — never hardcoded inside individual pages.
 */
export const DEFAULT_SETTINGS: Settings = {
  property: {
    name: 'Lemma Heights Apartments',
    legalName: 'Lemma Heights (Private) Limited',
    logoUrl: '/brand/logo.jpg',
    tagline: 'Serviced apartments on Great East Road, Chainama Lands, Lusaka',
    addressLine: 'Plot 2144B, Chainama Lands, Great East Road',
    city: 'Lusaka',
    country: 'Zambia',
    phone: '+260 211 470 662',
    whatsapp: '+260 977 220 001',
    email: 'reception@lemmaheights.zm',
    website: 'https://lemmaheights.zm',
    taxPayerId: '14/220887/001',
    receptionHours: '06:30 – 22:00 daily. 24-hour security & late check-in by arrangement.',
  },
  tax: {
    enabled: false,
    name: 'VAT',
    ratePercent: 16,
    inclusive: false,
    registrationNumber: '14/220887/001',
  },
  documents: {
    quotationPrefix: 'QUO',
    quotationValidityDays: 7,
    invoicePrefix: 'INV',
    receiptPrefix: 'RCP',
    termsAndConditions:
      'A 50% deposit is required to confirm a reservation and hold apartment dates. Balance is payable prior to or upon check-in. Free cancellation up to 48 hours before scheduled check-in time (14:00 CAT). Quotations do not hold apartment availability until converted into a confirmed reservation.',
  },
  googleBusiness: {
    businessName: 'Lemma Heights Apartments',
    primaryCategory: 'Serviced accommodation',
    secondaryCategories: ['Apartment complex', 'Extended stay hotel'],
    addressLine: 'Plot 2144B, Chainama Lands, Great East Road',
    city: 'Lusaka',
    province: 'Lusaka Province',
    country: 'Zambia',
    postalCode: '10101',
    serviceArea: 'Lusaka, Zambia',
    phone: '+260 211 470 662',
    website: 'https://lemmaheights.zm',
    description:
      'Upscale serviced apartments on Great East Road in Chainama Lands, Lusaka. Featuring studio, standard, deluxe, executive and family apartments with 200Mbps fibre Wi-Fi, solar and generator backup power, borehole water, secure parking and daily housekeeping.',
    openingHours: [
      { day: 'Monday', open: '06:30', close: '22:00', closed: false },
      { day: 'Tuesday', open: '06:30', close: '22:00', closed: false },
      { day: 'Wednesday', open: '06:30', close: '22:00', closed: false },
      { day: 'Thursday', open: '06:30', close: '22:00', closed: false },
      { day: 'Friday', open: '06:30', close: '22:00', closed: false },
      { day: 'Saturday', open: '07:00', close: '22:00', closed: false },
      { day: 'Sunday', open: '07:00', close: '22:00', closed: false },
    ],
    photos: [
      '/images/hero/exterior-building.jpg',
      '/images/property/reception.jpg',
      '/images/rooms/executive-suite.jpg',
      '/images/rooms/living-room.jpg',
      '/images/property/amenities.jpg',
    ],
    placeId: '',
    mapsProfileUrl: '',
    googleVerified: false,
    verificationNote:
      'Not yet verified by Google. Complete postal, phone, or video verification in Google Business Profile Manager before marking verified.',
    updatedAt: new Date().toISOString(),
  },
  booking: {
    checkInTime: '14:00',
    checkOutTime: '10:00',
    depositPercent: 50,
    minNightsWeekend: 1,
    maxAdvanceBookingDays: 365,
    holdDurationMinutes: 60,
    cancellationPolicyHours: 48,
    cancellationText:
      'Free cancellation up to 48 hours before arrival. Inside 48 hours the deposit is retained, except where a refund is authorised by management.',
    taxesIncluded: true,
    autoConfirmPublicRequests: false,
  },
  payments: {
    methods: [
      {
        id: 'airtel_money',
        label: 'Airtel Money',
        enabled: true,
        instructions:
          'Dial *181# -> Make Payment -> Pay Merchant -> Enter Merchant Code 4522108. Share transaction reference or upload SMS confirmation.',
        accountLabel: 'Merchant Code',
        accountNumber: '4522108',
      },
      {
        id: 'mtn_money',
        label: 'MTN Mobile Money',
        enabled: true,
        instructions:
          'Dial *158# -> MoMo Pay -> Merchant ID 8224471. Payment is credited once verified against the MTN MoMo merchant statement.',
        accountLabel: 'Merchant ID',
        accountNumber: '8224471',
      },
      {
        id: 'bank_transfer',
        label: 'Bank Transfer',
        enabled: true,
        instructions:
          'Transfer in ZMW to the corporate account below using your Booking or Quotation Number as the payment reference.',
        accountLabel: 'Bank / Account',
        accountNumber: 'Lemma Heights (Pvt) Ltd — Zanaco Lusaka Business Centre — Acc 3011044827110 (Sort 010001)',
      },
      {
        id: 'cash',
        label: 'Cash',
        enabled: true,
        instructions:
          'Payable in ZMW at the Lemma Heights reception desk against an official numbered receipt.',
        accountLabel: 'Reception Desk',
        accountNumber: 'Front Office Till 1',
      },
    ],
    proofUploadEnabled: true,
    requireVerification: true,
    receiptPrefix: 'RCP',
  },
  notifications: {
    whatsapp: {
      enabled: true,
      connected: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      provider: process.env.WHATSAPP_ACCESS_TOKEN ? 'Meta WhatsApp Cloud API' : null,
      note: 'Configure WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID for automated delivery; otherwise use in-app + one-click WhatsApp dispatch.',
    },
    sms: {
      enabled: true,
      connected: Boolean(process.env.SMS_WEBHOOK_URL && process.env.SMS_API_KEY),
      provider: process.env.SMS_WEBHOOK_URL ? 'Configured SMS Gateway' : null,
      note: 'Configure SMS_WEBHOOK_URL and SMS_API_KEY for carrier delivery; otherwise logged in-app.',
    },
    email: {
      enabled: true,
      connected: Boolean(process.env.RESEND_API_KEY),
      provider: process.env.RESEND_API_KEY ? 'Resend Transactional Email' : null,
      note: 'Configure RESEND_API_KEY for automated email delivery; otherwise in-app + mailto compose.',
    },
    checkInReminderDays: 1,
    checkOutReminderDays: 1,
    balanceReminderDays: 2,
    sendBookingConfirmation: true,
    sendPaymentConfirmation: true,
    sendCancellationNotice: true,
    sendCleaningReminders: true,
    sendBalanceReminders: true,
    senderName: 'Lemma Heights Reservations',
  },
  housekeeping: {
    turnaroundMinutes: 90,
    autoAssignCleaner: true,
    preArrivalInspectionMinutes: 20,
    requireInspectionBeforeReady: false,
  },
  locale: {
    currency: 'ZMW',
    currencySymbol: 'K',
    timezone: 'Africa/Lusaka',
    dateStyle: 'day-month-year',
  },
};
