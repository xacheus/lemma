import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICIAL_BRAND_NAME, RESERVATIONS_SENDER_NAME, normalizeBusinessName } from '../src/lib/brand';
import { DEFAULT_SETTINGS } from '../src/lib/db/default-settings';

test('official brand and existing business contact defaults are consistent', () => {
  assert.equal(OFFICIAL_BRAND_NAME, 'Lemma Heights Apartments');
  assert.equal(DEFAULT_SETTINGS.property.name, OFFICIAL_BRAND_NAME);
  assert.equal(DEFAULT_SETTINGS.property.legalName, OFFICIAL_BRAND_NAME);
  assert.equal(DEFAULT_SETTINGS.googleBusiness?.businessName, OFFICIAL_BRAND_NAME);
  assert.equal(DEFAULT_SETTINGS.notifications.senderName, RESERVATIONS_SENDER_NAME);

  assert.equal(DEFAULT_SETTINGS.property.addressLine, 'Barlaston Park');
  assert.equal(DEFAULT_SETTINGS.property.city, 'Lusaka');
  assert.equal(DEFAULT_SETTINGS.property.country, 'Zambia');
  assert.equal(DEFAULT_SETTINGS.property.email, 'lemmaheights@gmail.com');
  assert.equal(DEFAULT_SETTINGS.property.phone, '+260 574 556 207');
});

test('legacy business labels normalize to the official brand without changing custom names', () => {
  assert.equal(normalizeBusinessName('Lemma Apartments'), OFFICIAL_BRAND_NAME);
  assert.equal(normalizeBusinessName('LEMMA APARTMENTS'), OFFICIAL_BRAND_NAME);
  assert.equal(normalizeBusinessName('Lemma Apartments.'), 'Lemma Heights Apartments.');
  assert.equal(normalizeBusinessName('Lemma Apartments Reservations'), RESERVATIONS_SENDER_NAME);
  assert.equal(normalizeBusinessName('Lemma Reservations'), RESERVATIONS_SENDER_NAME);
  assert.equal(normalizeBusinessName('Lemma Heights Apartments'), OFFICIAL_BRAND_NAME);
  assert.equal(normalizeBusinessName('Lemma Heights Corporate Desk'), 'Lemma Heights Corporate Desk');
  assert.equal(normalizeBusinessName(''), OFFICIAL_BRAND_NAME);
});
