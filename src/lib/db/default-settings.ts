import type { Settings } from '../domain/types';

/**
 * Configuration for the demo property. Everything here is editable from
 * Settings → and the rest of the app reads through it (deposit percentage,
 * check-in/out times, which payment channels are switched on, reminder timing).
 */
export const DEFAULT_SETTINGS: Settings = {
  property: {
    name: 'Lemma Heights Apartments',
    legalName: 'Lemma Heights (Private) Limited',
    tagline: 'Serviced apartments on the Great East Road, Lusaka',
    addressLine: 'Plot 2144B, Chainama Lands, Great East Road',
    city: 'Lusaka',
    country: 'Zambia',
    phone: '+260 211 470 662',
    whatsapp: '+260 977 220 001',
    email: 'reception@lemmaheights.zm',
    website: 'https://lemmaheights.zm',
    taxPayerId: '14/220887/001',
    receptionHours: '06:30 – 22:00, seven days. Late arrivals by arrangement.',
  },
  booking: {
    checkInTime: '14:00',
    checkOutTime: '10:00',
    depositPercent: 50,
    minNightsWeekend: 1,
    maxAdvanceBookingDays: 330,
    cancellationPolicyHours: 48,
    cancellationText:
      'Free cancellation up to 48 hours before arrival. Inside 48 hours the deposit is retained, except for no-show refunds authorised by the manager on duty.',
    taxesIncluded: true,
    autoConfirmPublicRequests: false,
  },
  payments: {
    methods: [
      {
        id: 'airtel_money',
        label: 'Airtel Money',
        enabled: true,
        instructions: 'Dial *181# → Pay to Business → use the property merchant code. Send the confirmation SMS to reception WhatsApp for verification.',
        accountLabel: 'Merchant code',
        accountNumber: '4522108',
      },
      {
        id: 'mtn_money',
        label: 'MTN Mobile Money',
        enabled: true,
        instructions: 'Dial *158# → MoMo Pay → Merchant. The deposit is only banked once the MoMo reference is confirmed on the merchant statement.',
        accountLabel: 'Merchant ID',
        accountNumber: '8224471',
      },
      {
        id: 'bank_transfer',
        label: 'Bank Transfer',
        enabled: true,
        instructions: 'EFT to the account below, quoting the reservation reference as the payment narrative. Allow one business day for clearing.',
        accountLabel: 'Account name / branch',
        accountNumber: 'Lemma Heights (Pvt) Ltd — Zanaco Lusaka CBD — 3011044827110',
      },
      {
        id: 'cash',
        label: 'Cash at reception',
        enabled: true,
        instructions: 'Notes counted at the desk against a pre-numbered receipt. Foreign currency is accepted at the day\u2019s bureau rate displayed in the lobby.',
        accountLabel: 'Drawer',
        accountNumber: 'Reception till 1',
      },
    ],
    proofUploadEnabled: true,
    requireVerification: true,
    receiptPrefix: 'RCP',
  },
  notifications: {
    whatsapp: {
      enabled: true,
      connected: false,
      provider: null,
      note: 'No WhatsApp Business API account is configured. Message drafts open in the handset app instead.',
    },
    sms: {
      enabled: true,
      connected: false,
      provider: null,
      note: 'No SMS aggregator (e.g. Twilio, Africell Bulk SMS) is connected, so nothing can be dispatched automatically.',
    },
    email: {
      enabled: true,
      connected: false,
      provider: null,
      note: 'SMTP is not configured. Use an email client with the drafted copy, or connect a provider in Settings.',
    },
    checkInReminderDays: 1,
    checkOutReminderDays: 1,
    balanceReminderDays: 2,
    sendBookingConfirmation: true,
    sendPaymentConfirmation: true,
    sendCancellationNotice: true,
    sendCleaningReminders: true,
    sendBalanceReminders: true,
    senderName: 'Lemma Heights Reception',
  },
  housekeeping: {
    turnaroundMinutes: 90,
    autoAssignCleaner: true,
    preArrivalInspectionMinutes: 20,
  },
  locale: {
    currency: 'ZMW',
    currencySymbol: 'K',
    timezone: 'Africa/Lusaka',
    dateStyle: 'day-month-year',
  },
};
