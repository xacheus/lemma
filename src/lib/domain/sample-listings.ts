import type { Apartment } from './types';

/** The original three example listings remain browseable until staff replace them. */
const SAMPLE_IDS = new Set(['apt-studio', 'apt-one_bed', 'apt-family']);

export function isSampleListing(apartment: Pick<Apartment, 'id'>): boolean {
  return SAMPLE_IDS.has(apartment.id);
}
