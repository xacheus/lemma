import type { Apartment } from '../domain/types';

/**
 * Starting catalogue for Lemma Apartments.
 *
 * These three listings exist so a brand-new install has a real, bookable
 * catalogue on the website instead of an empty page. Every one of them is a
 * normal apartment record: the administrator can edit the rate, the copy, the
 * photographs or delete the unit entirely from Admin → Apartments, and the
 * change is live on the public site immediately.
 *
 * The photographs are AI-generated illustrations of the *kind* of interior the
 * property offers — they are not photographs of Barlaston Park. Anything served
 * from `/images/apartments/**` is therefore labelled "Illustrative image" in the
 * interface (see `isIllustrativePhoto` in src/lib/cloudinary/urls.ts). The moment
 * an administrator uploads the owner's real photographs through the media
 * library they are served from Cloudinary and the label disappears.
 */

export const ILLUSTRATIVE_PHOTO_PREFIX = '/images/apartments/';

export function isIllustrativePhoto(url: string | undefined | null): boolean {
  return Boolean(url && url.startsWith(ILLUSTRATIVE_PHOTO_PREFIX));
}

interface SeedUnit {
  key: string;
  number: number;
  code: string;
  name: string;
  slug: string;
  tier: Apartment['tier'];
  tagline: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  floor: number;
  bedConfiguration: string;
  nightlyRate: number;
  weekendRate: number;
  amenities: string[];
  photos: string[];
}

const UNITS: SeedUnit[] = [
  {
    key: 'studio',
    number: 1,
    code: 'APT 1',
    name: 'Studio Apartment',
    slug: 'studio-apartment',
    tier: 'studio',
    tagline: 'A compact, self-contained studio with its own kitchenette.',
    description:
      'A quiet studio for one or two guests: a queen bed, a small sitting corner and a fitted kitchenette with a two-plate hob, microwave and under-counter fridge. The window looks over the garden, and the ensuite shower room is stocked with linen and towels. Good for a short business trip or a week of quiet work.',
    maxGuests: 2,
    bedrooms: 0,
    bathrooms: 1,
    sizeSqm: 30,
    floor: 0,
    bedConfiguration: '1 queen bed',
    nightlyRate: 950,
    weekendRate: 1050,
    amenities: [
      'Wi-Fi',
      'Backup power',
      'Fully fitted kitchen',
      'Microwave',
      'Fridge / freezer',
      'Air conditioning',
      'Work desk',
      'Daily housekeeping',
      '24/7 security',
      'Private parking',
    ],
    photos: ['01.jpg', '02.jpg', '03.jpg'].map((f) => `/images/apartments/apt-01/${f}`),
  },
  {
    key: 'one_bed',
    number: 2,
    code: 'APT 2',
    name: 'One-Bedroom Apartment',
    slug: 'one-bedroom-apartment',
    tier: 'suite',
    tagline: 'A separate lounge, a full kitchen and a bedroom that closes.',
    description:
      'A one-bedroom apartment with a proper sitting room, a dining table for two and a full kitchen with timber cabinets. The bedroom has a double bed, blackout curtains and built-in storage; the bathroom has both a walk-in shower and a tub. Suited to longer stays and guests who work from the apartment.',
    maxGuests: 3,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 54,
    floor: 1,
    bedConfiguration: '1 double bed + 1 sofa bed',
    nightlyRate: 1450,
    weekendRate: 1600,
    amenities: [
      'Wi-Fi',
      'Backup power',
      'Fully fitted kitchen',
      'Flat-screen TV',
      'Air conditioning',
      'Work desk',
      'Balcony',
      'Washer',
      'Daily housekeeping',
      '24/7 security',
      'Private parking',
      'In-room safe',
    ],
    photos: ['01.jpg', '02.jpg', '03.jpg', '04.jpg'].map((f) => `/images/apartments/apt-02/${f}`),
  },
  {
    key: 'family',
    number: 3,
    code: 'APT 3',
    name: 'Two-Bedroom Family Apartment',
    slug: 'two-bedroom-family-apartment',
    tier: 'family',
    tagline: 'Two bedrooms, two bathrooms and a table that seats four.',
    description:
      'The family unit: a living and dining room that seats four, a large kitchen with a breakfast counter, a main bedroom and a twin room, and a second bathroom so nobody queues in the morning. Tiled floors, plenty of storage and space for a cot. Priced per night for up to four guests; a fifth is welcome for a small nightly supplement.',
    maxGuests: 5,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 86,
    floor: 1,
    bedConfiguration: '1 double bed + 2 single beds',
    nightlyRate: 2300,
    weekendRate: 2500,
    amenities: [
      'Wi-Fi',
      'Backup power',
      'Fully fitted kitchen',
      'Flat-screen TV',
      'Air conditioning',
      'Washer',
      'Fridge / freezer',
      'Microwave',
      'Daily housekeeping',
      '24/7 security',
      'Private parking',
      'Step-free access',
    ],
    photos: ['01.jpg', '02.jpg', '03.jpg'].map((f) => `/images/apartments/apt-03/${f}`),
  },
];

export interface SeededCatalogue {
  apartments: Apartment[];
}

/**
 * Builds the starting units. Called once by the store on a genuinely empty
 * install; the marker it writes means deleting a unit keeps it deleted.
 */
export function buildIllustrativeCatalogue(now: string): SeededCatalogue {
  const apartments: Apartment[] = UNITS.map((unit) => ({
    id: `apt-${unit.key}`,
    number: unit.number,
    code: unit.code,
    name: unit.name,
    slug: unit.slug,
    tier: unit.tier,
    tagline: unit.tagline,
    description: unit.description,
    maxGuests: unit.maxGuests,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    sizeSqm: unit.sizeSqm,
    floor: unit.floor,
    bedConfiguration: unit.bedConfiguration,
    nightlyRate: unit.nightlyRate,
    weekendRate: unit.weekendRate,
    includedGuests: Math.min(2, unit.maxGuests),
    extraGuestFee: unit.key === 'family' ? 150 : 0,
    seasonalRates: [],
    specialOffers: [],
    optionalServices: [],
    amenities: unit.amenities,
    facilities: unit.amenities,
    photos: unit.photos,
    coverPhoto: unit.photos[0],
    gallery: unit.photos.map((url, index) => ({
      id: `${unit.key}-ph-${index + 1}`,
      url,
      publicId: url.replace(/^\//, ''),
      title: `${unit.name} — photograph ${index + 1}`,
      description: 'Illustrative interior. Replace with the property’s own photography in Admin → Apartments.',
      order: index,
      isCover: index === 0,
      mediaType: 'image' as const,
      uploadedAt: now,
    })),
    publicationStatus: 'published',
    active: true,
    outOfService: false,
    houseNotes: 'Illustrative listing created on first run. Edit or delete it from Admin → Apartments.',
    updatedAt: now,
  }));
  return { apartments };
}
