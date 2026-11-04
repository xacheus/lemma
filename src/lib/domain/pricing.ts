import { eachISO, parseISO } from './dates';
import { nightsBetween } from './availability';
import type {
  Apartment,
  DocumentLineItem,
  SelectedServiceLine,
  Settings,
} from './types';

export type PricingSettings = {
  booking: Pick<Settings['booking'], 'taxesIncluded' | 'depositPercent'>;
  tax?: Settings['tax'];
  property: Pick<Settings['property'], 'taxPayerId'>;
};

export interface NightPriceBreakdown {
  date: string;
  rate: number;
  rule: 'standard' | 'weekend' | 'seasonal';
  ruleLabel: string;
}

export interface StayPricingResult {
  nights: number;
  nightlyBreakdown: NightPriceBreakdown[];
  effectiveAverageRate: number;
  roomSubtotal: number;
  extraGuests: number;
  extraGuestTotal: number;
  servicesTotal: number;
  selectedServices: SelectedServiceLine[];
  offerDiscount: number;
  offerName: string | null;
  manualDiscount: number;
  totalDiscount: number;
  subtotalAfterDiscount: number;
  taxEnabled: boolean;
  taxName: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  taxAmount: number;
  totalAmount: number;
  depositPercent: number;
  depositRequired: number;
  balanceAfterDeposit: number;
  lineItems: DocumentLineItem[];
}

function isWeekendNight(isoDate: string): boolean {
  const d = parseISO(isoDate);
  const day = d.getDay(); // 5 = Friday, 6 = Saturday
  return day === 5 || day === 6;
}

/**
 * Calculates deterministic ZMW stay pricing across:
 *   1. Seasonal rate rules (highest precedence per date)
 *   2. Weekend rate (Friday & Saturday nights, if configured)
 *   3. Standard nightly rate (or explicit override rate)
 *   4. Length-of-stay special offers
 *   5. Additional guest fees above included occupancy
 *   6. Optional services (per stay or per night)
 *   7. Authorized manual discount
 *   8. Configurable tax settings (never hardcoded)
 */
export function calculateStayPricing(args: {
  apartment: Apartment;
  settings: PricingSettings;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  overrideNightlyRate?: number | null;
  manualDiscount?: number;
  selectedServiceIds?: string[];
  customServices?: SelectedServiceLine[];
}): StayPricingResult {
  const { apartment, settings, checkIn, checkOut, guestCount } = args;
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) {
    return emptyPricing(settings);
  }

  const stayDates = eachISO(checkIn, checkOut).slice(0, nights);
  const seasonalRules = (apartment.seasonalRates ?? []).filter((r) => r.active);

  const nightlyBreakdown: NightPriceBreakdown[] = stayDates.map((date) => {
    if (args.overrideNightlyRate !== undefined && args.overrideNightlyRate !== null && args.overrideNightlyRate > 0) {
      return {
        date,
        rate: Math.round(args.overrideNightlyRate),
        rule: 'standard',
        ruleLabel: 'Agreed nightly rate',
      };
    }

    const seasonal = seasonalRules.find((r) => date >= r.startDate && date <= r.endDate);
    if (seasonal) {
      return {
        date,
        rate: Math.round(seasonal.nightlyRate),
        rule: 'seasonal',
        ruleLabel: seasonal.name,
      };
    }

    if (apartment.weekendRate && apartment.weekendRate > 0 && isWeekendNight(date)) {
      return {
        date,
        rate: Math.round(apartment.weekendRate),
        rule: 'weekend',
        ruleLabel: 'Weekend rate',
      };
    }

    return {
      date,
      rate: Math.round(apartment.nightlyRate),
      rule: 'standard',
      ruleLabel: 'Standard nightly rate',
    };
  });

  const roomSubtotal = nightlyBreakdown.reduce((sum, n) => sum + n.rate, 0);
  const effectiveAverageRate = Math.round(roomSubtotal / nights);

  // Additional guest fee
  const includedGuests = apartment.includedGuests ?? apartment.maxGuests;
  const extraGuestFee = apartment.extraGuestFee ?? 0;
  const extraGuests = extraGuestFee > 0 ? Math.max(0, guestCount - includedGuests) : 0;
  const extraGuestTotal = Math.round(extraGuests * extraGuestFee * nights);

  // Optional services
  const catalogServices = (apartment.optionalServices ?? []).filter((s) => s.active);
  const chosenIds = new Set(args.selectedServiceIds ?? []);
  const selectedServices: SelectedServiceLine[] = [
    ...catalogServices
      .filter((s) => chosenIds.has(s.id))
      .map((s) => {
        const qty = s.priceType === 'per_night' ? nights : 1;
        return {
          id: s.id,
          name: s.name,
          unitPrice: Math.round(s.price),
          quantity: qty,
          total: Math.round(s.price * qty),
        };
      }),
    ...(args.customServices ?? []),
  ];
  const servicesTotal = selectedServices.reduce((sum, s) => sum + s.total, 0);

  // Special offer rule (best matching length-of-stay offer if no override rate)
  let offerDiscount = 0;
  let offerName: string | null = null;
  if (args.overrideNightlyRate === undefined || args.overrideNightlyRate === null) {
    const matchingOffers = (apartment.specialOffers ?? []).filter((o) => {
      if (!o.active || nights < o.minNights) return false;
      if (o.validFrom && checkIn < o.validFrom) return false;
      if (o.validTo && checkIn > o.validTo) return false;
      return true;
    });
    const bestOffer = matchingOffers.sort((a, b) => b.discountPercent - a.discountPercent)[0];
    if (bestOffer && bestOffer.discountPercent > 0) {
      offerDiscount = Math.round((roomSubtotal * bestOffer.discountPercent) / 100);
      offerName = `${bestOffer.name} (${bestOffer.discountPercent}% off)`;
    }
  }

  const manualDiscount = Math.max(0, Math.round(args.manualDiscount ?? 0));
  const grossBeforeDiscount = roomSubtotal + extraGuestTotal + servicesTotal;
  const totalDiscount = Math.min(grossBeforeDiscount, offerDiscount + manualDiscount);
  const subtotalAfterDiscount = Math.max(0, grossBeforeDiscount - totalDiscount);

  // Configurable Tax Settings (never hardcoded)
  const taxCfg = settings.tax ?? {
    enabled: false,
    name: 'VAT',
    ratePercent: 0,
    inclusive: settings.booking.taxesIncluded,
    registrationNumber: settings.property.taxPayerId,
  };

  let taxAmount = 0;
  let totalAmount = subtotalAfterDiscount;
  if (taxCfg.enabled && taxCfg.ratePercent > 0) {
    if (taxCfg.inclusive) {
      // Tax is already inside the quoted ZMW price; extract tax line for disclosure
      taxAmount = Math.round(subtotalAfterDiscount - subtotalAfterDiscount / (1 + taxCfg.ratePercent / 100));
      totalAmount = subtotalAfterDiscount;
    } else {
      // Exclusive tax added on top of subtotal
      taxAmount = Math.round((subtotalAfterDiscount * taxCfg.ratePercent) / 100);
      totalAmount = subtotalAfterDiscount + taxAmount;
    }
  }

  const depositPercent = settings.booking.depositPercent ?? 50;
  const depositRequired = Math.round((totalAmount * depositPercent) / 100);
  const balanceAfterDeposit = Math.max(0, totalAmount - depositRequired);

  // Build clean line items for Quotations & Invoices
  const lineItems: DocumentLineItem[] = [];
  const allSameRate = nightlyBreakdown.every((n) => n.rate === nightlyBreakdown[0].rate);
  if (allSameRate) {
    lineItems.push({
      description: `Accommodation — Apt ${apartment.number} (${apartment.name})`,
      quantity: nights,
      unitLabel: nights === 1 ? 'night' : 'nights',
      unitPrice: nightlyBreakdown[0].rate,
      amount: roomSubtotal,
    });
  } else {
    // Group consecutive or matching rate rules cleanly
    const byRule = new Map<string, { label: string; rate: number; count: number }>();
    for (const n of nightlyBreakdown) {
      const key = `${n.ruleLabel}:${n.rate}`;
      const cur = byRule.get(key) ?? { label: n.ruleLabel, rate: n.rate, count: 0 };
      cur.count += 1;
      byRule.set(key, cur);
    }
    for (const grp of byRule.values()) {
      lineItems.push({
        description: `Apt ${apartment.number} (${apartment.name}) — ${grp.label}`,
        quantity: grp.count,
        unitLabel: grp.count === 1 ? 'night' : 'nights',
        unitPrice: grp.rate,
        amount: grp.count * grp.rate,
      });
    }
  }

  if (extraGuestTotal > 0) {
    lineItems.push({
      description: `Additional guest supplement (${extraGuests} extra guest${extraGuests > 1 ? 's' : ''})`,
      quantity: nights,
      unitLabel: nights === 1 ? 'night' : 'nights',
      unitPrice: extraGuests * extraGuestFee,
      amount: extraGuestTotal,
    });
  }

  for (const svc of selectedServices) {
    lineItems.push({
      description: svc.name,
      quantity: svc.quantity,
      unitLabel: svc.quantity === 1 ? 'service' : 'units',
      unitPrice: svc.unitPrice,
      amount: svc.total,
    });
  }

  return {
    nights,
    nightlyBreakdown,
    effectiveAverageRate,
    roomSubtotal,
    extraGuests,
    extraGuestTotal,
    servicesTotal,
    selectedServices,
    offerDiscount,
    offerName,
    manualDiscount,
    totalDiscount,
    subtotalAfterDiscount,
    taxEnabled: taxCfg.enabled,
    taxName: taxCfg.name || 'Tax',
    taxRatePercent: taxCfg.enabled ? taxCfg.ratePercent : 0,
    taxInclusive: taxCfg.inclusive,
    taxAmount,
    totalAmount,
    depositPercent,
    depositRequired,
    balanceAfterDeposit,
    lineItems,
  };
}

function emptyPricing(settings: PricingSettings): StayPricingResult {
  const taxCfg = settings.tax ?? {
    enabled: false,
    name: 'VAT',
    ratePercent: 0,
    inclusive: true,
    registrationNumber: settings.property.taxPayerId,
  };
  return {
    nights: 0,
    nightlyBreakdown: [],
    effectiveAverageRate: 0,
    roomSubtotal: 0,
    extraGuests: 0,
    extraGuestTotal: 0,
    servicesTotal: 0,
    selectedServices: [],
    offerDiscount: 0,
    offerName: null,
    manualDiscount: 0,
    totalDiscount: 0,
    subtotalAfterDiscount: 0,
    taxEnabled: taxCfg.enabled,
    taxName: taxCfg.name,
    taxRatePercent: taxCfg.ratePercent,
    taxInclusive: taxCfg.inclusive,
    taxAmount: 0,
    totalAmount: 0,
    depositPercent: settings.booking.depositPercent,
    depositRequired: 0,
    balanceAfterDeposit: 0,
    lineItems: [],
  };
}
