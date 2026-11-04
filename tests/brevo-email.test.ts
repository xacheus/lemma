import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrandedEmailHtml, dispatchExternalNotification, sendEmailNotification } from '../src/lib/notifications/providers';
import { isBrevoEmailConfigured } from '../src/lib/notifications/email-config';
import { getIntegrationStatus } from '../src/lib/api/snapshot';

const input = { channel: 'email' as const, recipientContact: 'guest@example.test', title: 'Booking request received', body: 'Reference LHA-123', htmlBody: '<p>Reference LHA-123</p>' };

test('branded transactional email uses the official business name', () => {
  const html = buildBrandedEmailHtml({ propertyName: 'Lemma Apartments', subject: 'Booking received' });
  assert.ok(html.includes('Lemma Heights Apartments'));
  assert.ok(!html.includes('Lemma Apartments'));
});

test('Brevo configuration and transactional delivery behavior', async (t) => {
  const savedFetch = globalThis.fetch;
  const saved = { apiKey: process.env.BREVO_API_KEY, from: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME, resend: process.env.RESEND_API_KEY };
  t.after(() => {
    globalThis.fetch = savedFetch;
    for (const [name, value] of Object.entries({ BREVO_API_KEY: saved.apiKey, EMAIL_FROM: saved.from, EMAIL_FROM_NAME: saved.name, RESEND_API_KEY: saved.resend })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  delete process.env.BREVO_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_FROM_NAME;
  process.env.RESEND_API_KEY = 'old-resend-key';
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('unexpected fetch'); }) as typeof fetch;
  assert.equal((await dispatchExternalNotification(input)).status, 'not_connected');
  assert.equal(isBrevoEmailConfigured(), false);
  assert.equal(getIntegrationStatus().emailProviderConfigured, false);
  assert.equal(calls, 0);

  process.env.BREVO_API_KEY = 'test-brevo-secret';
  process.env.EMAIL_FROM = 'not a valid email';
  assert.equal((await dispatchExternalNotification(input)).status, 'not_connected');
  assert.equal(calls, 0);

  process.env.EMAIL_FROM = 'Lemma Heights Apartments Reservations <verified@example.test>';
  let captured: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init! };
    return new Response(JSON.stringify({ messageId: '<brevo-id@example.test>' }), { status: 201 });
  }) as typeof fetch;
  const accepted = await dispatchExternalNotification(input);
  assert.equal(accepted.status, 'sent');
  assert.equal(accepted.providerMessageId, '<brevo-id@example.test>');
  assert.match(accepted.detail, /delivery is not confirmed/i);
  assert.equal(isBrevoEmailConfigured(), true);
  assert.equal(getIntegrationStatus().emailProviderConfigured, true);
  assert.equal(captured!.url, 'https://api.brevo.com/v3/smtp/email');
  const headers = new Headers(captured!.init.headers);
  assert.equal(headers.get('api-key'), 'test-brevo-secret');
  assert.equal(headers.get('authorization'), null);
  const payload = JSON.parse(String(captured!.init.body));
  assert.deepEqual(payload.sender, { email: 'verified@example.test', name: 'Lemma Heights Apartments Reservations' });
  assert.deepEqual(payload.to, [{ email: 'guest@example.test' }]);
  assert.equal(payload.subject, input.title);
  assert.equal(payload.textContent, input.body);
  assert.equal(payload.htmlContent, input.htmlBody);
  assert.ok(captured!.init.signal instanceof AbortSignal);
  assert.ok(!JSON.stringify(payload).includes('test-brevo-secret'));

  process.env.EMAIL_FROM = 'Lemma Apartments <verified@example.test>';
  const { getBrevoEmailConfig } = await import('../src/lib/notifications/email-config');
  assert.deepEqual(getBrevoEmailConfig()?.sender, { email: 'verified@example.test', name: 'Lemma Heights Apartments' });
  process.env.EMAIL_FROM = 'Lemma Reservations <verified@example.test>';
  assert.deepEqual(getBrevoEmailConfig()?.sender, { email: 'verified@example.test', name: 'Lemma Heights Apartments Reservations' });

  process.env.EMAIL_FROM = 'verified@example.test';
  process.env.EMAIL_FROM_NAME = 'Example Desk';
  await sendEmailNotification({ to: input.recipientContact, subject: input.title, textBody: input.body });
  assert.deepEqual(JSON.parse(String(captured!.init.body)).sender, { email: 'verified@example.test', name: 'Example Desk' });
  assert.match(JSON.parse(String(captured!.init.body)).htmlContent, /Reference LHA-123/);

  globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'sensitive provider response test-brevo-secret' }), { status: 403 })) as typeof fetch;
  const rejected = await dispatchExternalNotification(input);
  assert.equal(rejected.status, 'failed');
  assert.match(rejected.detail, /HTTP 403/);
  assert.ok(!rejected.detail.includes('test-brevo-secret'));
  globalThis.fetch = (async () => new Response('{}', { status: 201 })) as typeof fetch;
  assert.equal((await dispatchExternalNotification(input)).status, 'failed');
  globalThis.fetch = (async () => { throw new Error('secret test-brevo-secret'); }) as typeof fetch;
  const network = await sendEmailNotification({ to: input.recipientContact, subject: input.title, textBody: input.body });
  assert.equal(network.ok, false);
  assert.equal(network.deliveryStatus, 'failed');
  assert.ok(!network.detail.includes('test-brevo-secret'));
});

test('swept external notifications remain drafts rather than implying provider delivery', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const { draftNotification } = await import('../src/lib/domain/operations');
  const db = createEmptyDatabase('2026-11-04');
  const record = draftNotification(db, { event: 'booking_confirmation', channel: 'email', title: 'Booking', body: 'Booking request received.', recipientName: 'Guest', recipientContact: 'guest@example.test' });
  assert.equal(record.deliveryStatus, 'queued_for_manual_send');
  assert.match(record.deliveryDetail ?? '', /no provider submission/i);
});

test('email links use only the configured trusted site origin', async (t) => {
  const { trustedEmailSiteOrigin } = await import('../src/lib/notifications/site-origin');
  const { bookingAccessLink } = await import('../src/lib/booking/access');
  const prior = process.env.NEXT_PUBLIC_SITE_URL;
  t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = prior; });
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(trustedEmailSiteOrigin(), null);
  process.env.NEXT_PUBLIC_SITE_URL = 'https://user:password@example.test';
  assert.equal(trustedEmailSiteOrigin(), null);
  process.env.NEXT_PUBLIC_SITE_URL = 'http://untrusted.example.test';
  assert.equal(trustedEmailSiteOrigin(), null);
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test/some-path';
  assert.equal(trustedEmailSiteOrigin(), 'https://example.test');
  assert.equal(bookingAccessLink('test-token'), 'https://example.test/booking/access#token=test-token');
});
