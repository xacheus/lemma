import type { Settings } from '../domain/types';

/**
 * Production default configuration for Lemma Apartments.
 * Every field is editable in `/admin/settings` and stored in `settings/business`
 * & `settings/google_business` — never hardcoded inside individual pages.
 */
export const DEFAULT_SETTINGS: Settings = {
  property: {
    name: 'Lemma Apartments',
    legalName: 'Lemma Apartments',
    logoUrl: '/brand/logo.jpg',
    tagline: 'Furnished apartments at Barlaston Park, Lusaka — booked night by night.',
    addressLine: 'Barlaston Park',
    city: 'Lusaka',
    country: 'Zambia',
    phone: '+260 574 556 207',
    whatsapp: '+260 574556207',
    email: 'lemmaheights@gmail.com',
    website: '',
    taxPayerId: '',
    receptionHours: 'Daily, 07:00 – 21:00. Late check-in by arrangement on WhatsApp.',
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
    businessName: 'Lemma Apartments',
    primaryCategory: 'Serviced accommodation',
    secondaryCategories: ['Apartment complex', 'Extended stay hotel'],
    addressLine: 'Barlaston Park',
    city: 'Lusaka',
    province: 'Lusaka Province',
    country: 'Zambia',
    postalCode: '10101',
    serviceArea: 'Lusaka, Zambia',
    phone: '+260 211 470 662',
    website: '',
    description:
      'Furnished apartments at Barlaston Park, Lusaka, Zambia. Studio, one-bedroom and family units with fibre Wi-Fi, backup power, secure parking and housekeeping, priced per night in Zambian Kwacha.',
    openingHours: [
      { day: 'Monday', open: '06:30', close: '22:00', closed: false },
      { day: 'Tuesday', open: '06:30', close: '22:00', closed: false },
      { day: 'Wednesday', open: '06:30', close: '22:00', closed: false },
      { day: 'Thursday', open: '06:30', close: '22:00', closed: false },
      { day: 'Friday', open: '06:30', close: '22:00', closed: false },
      { day: 'Saturday', open: '07:00', close: '22:00', closed: false },
      { day: 'Sunday', open: '07:00', close: '22:00', closed: false },
    ],
    // Populated with uploads from /admin/media. Empty until real photography exists.
    photos: [],
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
          'Dial *181# -> Make Payment -> Pay Merchant. Use the merchant code reception gives you on your booking confirmation, then upload the transaction reference or SMS confirmation so the payment can be verified.',
        accountLabel: 'Merchant Code',
        accountNumber: '',
      },
      {
        id: 'mtn_money',
        label: 'MTN Mobile Money',
        enabled: true,
        instructions:
          'Dial *158# -> MoMo Pay. Use the merchant ID reception gives you on your booking confirmation. Payment is credited once it is verified against the MTN MoMo statement.',
        accountLabel: 'Merchant ID',
        accountNumber: '',
      },
      {
        id: 'bank_transfer',
        label: 'Bank Transfer',
        enabled: true,
        instructions:
          'Transfer in ZMW to the corporate account below using your Booking or Quotation Number as the payment reference.',
        accountLabel: 'Bank / Account',
        accountNumber: 'Lemma Apartments — account details are confirmed by reception before any transfer is made',
      },
      {
        id: 'cash',
        label: 'Cash',
        enabled: true,
        instructions:
          'Payable in ZMW at the Lemma Apartments reception desk against an official numbered receipt.',
        accountLabel: 'Reception Desk',
        accountNumber: 'Front Office Till 1',
      },
    ],
    /**
     * Payment channels are chosen by the guest from this enabled list; the business
     * sets which channels exist, their details and the default. Set
     * lockMethodToAdmin to true to make reception choose the channel instead.
     */
    lockMethodToAdmin: false,
    defaultMethod: 'airtel_money',
    allowPartialPayments: true,
    claimReviewHours: 24,
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
    senderName: 'Lemma Apartments Reservations',
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
