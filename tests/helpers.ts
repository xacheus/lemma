import type { Apartment } from '../src/lib/domain/types';

/**
 * Explicit test-only apartment fixtures used solely inside unit tests.
 * Production databases start with `apartments: []` until management adds real units.
 */
export function buildTestApartments(now = '2026-11-04T10:00:00.000Z'): Apartment[] {
  return [
    {
      id: 'test-apt-101',
      number: 101,
      code: 'A-101',
      slug: 'barlaston-suite-101',
      name: 'Barlaston Suite 101',
      tier: 'studio',
      floor: 0,
      bedrooms: 0,
      bathrooms: 1,
      sizeSqm: 38,
      maxGuests: 2,
      includedGuests: 2,
      extraGuestFee: 0,
      nightlyRate: 950,
      bedConfiguration: '1 Queen bed',
      tagline: 'Ground-floor self-catering suite',
      description: 'Private furnished studio suite used for automated test verification.',
      amenities: ['Wi-Fi', 'Backup power', 'Fully fitted kitchen'],
      photos: [],
      gallery: [],
      houseNotes: '',
      active: true,
      outOfService: false,
      publicationStatus: 'published',
      updatedAt: now,
    },
    {
      id: 'test-apt-102',
      number: 102,
      code: 'A-102',
      slug: 'barlaston-deluxe-102',
      name: 'Barlaston Deluxe 102',
      tier: 'deluxe',
      floor: 1,
      bedrooms: 1,
      bathrooms: 1,
      sizeSqm: 54,
      maxGuests: 3,
      includedGuests: 2,
      extraGuestFee: 150,
      nightlyRate: 1350,
      bedConfiguration: '1 King bed',
      tagline: 'First-floor one-bedroom apartment',
      description: 'Private one-bedroom apartment used for automated test verification.',
      amenities: ['Wi-Fi', 'Backup power', 'Fully fitted kitchen', 'Washer'],
      photos: [],
      gallery: [],
      houseNotes: '',
      active: true,
      outOfService: false,
      publicationStatus: 'published',
      updatedAt: now,
    },
  ];
}
