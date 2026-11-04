import {
  AirVent,
  Bath,
  BedDouble,
  Car,
  CookingPot,
  Droplets,
  Dumbbell,
  Flame,
  Refrigerator,
  ShieldCheck,
  Sparkles,
  Tv,
  UtensilsCrossed,
  Waves,
  WashingMachine,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The amenity vocabulary.
 *
 * Everything here is optional and per-apartment: the operator ticks what the unit
 * actually has, and only the ticked ones are rendered on the public page. An unticked
 * amenity is not "unknown" or "probably included" — it is simply absent, which is the
 * honest way to sell a room you have not seen.
 *
 * The list covers the usual Lusaka serviced-apartment fittings. An operator can also
 * add their own wording through the editor, and those custom labels render exactly
 * like these (with a neutral icon).
 */
export interface AmenityDefinition {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Shown under the label in the picker, so staff know what it covers. */
  hint?: string;
  group: 'Essentials' | 'Comfort' | 'Kitchen' | 'Building';
}

export const AMENITY_LIBRARY: AmenityDefinition[] = [
  { key: 'wifi', label: 'Free Wi-Fi', icon: Wifi, group: 'Essentials', hint: 'Guest network in the apartment' },
  { key: 'water', label: 'Hot water', icon: Flame, group: 'Essentials' },
  { key: 'power', label: 'Backup power', icon: Zap, group: 'Essentials', hint: 'Stays on through load shedding' },
  { key: 'security', label: 'Security', icon: ShieldCheck, group: 'Essentials', hint: 'Guarded compound / alarm' },
  { key: 'parking', label: 'Parking', icon: Car, group: 'Essentials', hint: 'Off-street, inside the gate' },
  { key: 'towel', label: 'Linen & towels', icon: Bath, group: 'Essentials', hint: 'Changed during the stay' },
  { key: 'ac', label: 'Air conditioning', icon: AirVent, group: 'Comfort' },
  { key: 'tv', label: 'Television', icon: Tv, group: 'Comfort' },
  { key: 'dstv', label: 'Satellite TV (DSTV)', icon: Tv, group: 'Comfort' },
  { key: 'desk', label: 'Work desk', icon: BedDouble, group: 'Comfort' },
  { key: 'pool', label: 'Swimming pool', icon: Waves, group: 'Comfort' },
  { key: 'gym', label: 'Gym', icon: Dumbbell, group: 'Comfort' },
  { key: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed, group: 'Kitchen', hint: 'Full kitchen, self-catering' },
  { key: 'kitchenette', label: 'Kitchenette', icon: CookingPot, group: 'Kitchen' },
  { key: 'fridge', label: 'Refrigerator', icon: Refrigerator, group: 'Kitchen' },
  { key: 'washer', label: 'Washing machine', icon: WashingMachine, group: 'Kitchen' },
  { key: 'laundry', label: 'Laundry service', icon: Sparkles, group: 'Building' },
  { key: 'borehole', label: 'Borehole water', icon: Droplets, group: 'Building' },
  { key: 'housekeeping', label: 'Daily housekeeping', icon: Sparkles, group: 'Building' },
];

const BY_LABEL = new Map(AMENITY_LIBRARY.map((a) => [a.label.toLowerCase(), a]));
const BY_KEY = new Map(AMENITY_LIBRARY.map((a) => [a.key, a]));

/** Icon for a stored amenity label; `null` means "use the neutral bullet". */
export function amenityIcon(label: string): LucideIcon | null {
  return BY_LABEL.get(label.trim().toLowerCase())?.icon ?? BY_KEY.get(label.trim().toLowerCase())?.icon ?? null;
}

/**
 * Older records stored short keys ('wifi') and newer ones store labels ('Free Wi-Fi').
 * The public page should read the same either way.
 */
export function amenityLabel(label: string): string {
  const known = BY_LABEL.get(label.trim().toLowerCase()) ?? BY_KEY.get(label.trim().toLowerCase());
  return known?.label ?? label;
}

export function normaliseAmenities(list: string[] | undefined): string[] {
  if (!list) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    const label = amenityLabel(value);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
