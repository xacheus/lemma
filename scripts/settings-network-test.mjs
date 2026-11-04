#!/usr/bin/env node
/** Tests the settings screen against a disposable local fixture. See README.md. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium or Chrome executable.');
const base = process.env.RESPONSIVE_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: process.env.E2E_ADMIN_EMAIL || 'chanda@lemma.test', password: process.env.E2E_ADMIN_PASSWORD || 'LemmaAdmin2026!' },
  });
  assert.ok(login.ok(), 'prepare and start the disposable local fixture before running this test');
  const page = await context.newPage();
  let attempts = 0;
  let online = false;
  await page.route('**/api/data', async (route) => {
    attempts++;
    if (!online) return route.abort('failed');
    return route.fulfill({ json: { ok: true, data: { today: '2026-11-04', counts: { apartments: 3, guests: 0, staff: 1, reservations: 0, payments: 0, housekeeping: 0, notifications: 0 } } } });
  });
  await page.goto(`${base}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Retry storage figures' }).waitFor();
  const initialAttempts = attempts;
  assert.ok(initialAttempts >= 1 && initialAttempts <= 2, `expected one request (two in Strict Mode), got ${initialAttempts}`);
  await page.getByLabel('Trading name').fill('Testing');
  await page.waitForTimeout(1500);
  assert.equal(attempts, initialAttempts, 'editing and request state changes must not re-fetch storage figures');
  assert.equal(await page.getByText('Action not completed').count(), 0, 'background statistics failures should be shown inline');
  online = true;
  await page.getByRole('button', { name: 'Retry storage figures' }).click();
  await page.getByText('Last updated for 2026-11-04.', { exact: false }).waitFor();
  assert.equal(attempts, initialAttempts + 1, 'retry should issue exactly one new request');

  let writes = 0;
  await page.route('**/api/settings', async (route) => { writes++; await route.abort('failed'); });
  const save = page.getByRole('button', { name: 'Save section' }).first();
  for (let i = 0; i < 4; i++) {
    await save.click();
    await page.getByText('The connection was interrupted. Check whether the change was saved before trying again.').first().waitFor();
    await page.waitForTimeout(100);
  }
  assert.equal(writes, 4, 'failed writes must not be retried automatically');
  assert.equal(await page.getByText('The connection was interrupted. Check whether the change was saved before trying again.').count(), 1, 'identical errors should not flood the screen');
  assert.ok((await page.getByRole('button', { name: 'Dismiss notification' }).count()) <= 3, 'notification stack should stay bounded');
  await page.getByRole('button', { name: 'Dismiss notification' }).first().click();
  assert.equal(await page.getByRole('button', { name: 'Dismiss notification' }).count(), 0, 'notification remains dismissible');
  await page.unroute('**/api/settings');
  let serverFailures = 0;
  await page.route('**/api/settings', async (route) => {
    serverFailures++;
    await route.fulfill({ status: 503, json: { ok: false, error: `Test failure ${serverFailures}` } });
  });
  for (let i = 1; i <= 4; i++) {
    await save.click();
    await page.getByText(`Test failure ${i}`, { exact: true }).first().waitFor();
  }
  assert.equal(await page.getByRole('button', { name: 'Dismiss notification' }).count(), 3, 'only three distinct errors may be displayed at once');
  assert.equal(await page.getByText('Test failure 1', { exact: true }).count(), 0, 'oldest notification is removed when the stack is full');
  assert.equal(attempts, initialAttempts + 1, 'other actions must not restart the background request');
  console.log('Settings network failure and retry checks passed.');
} finally {
  await browser.close();
}
