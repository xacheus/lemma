#!/usr/bin/env node
/** Viewport regression test against a running local fixture. See README.md. */
import { chromium } from 'playwright-core';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to a Chromium or Chrome executable.');
const base = process.env.RESPONSIVE_BASE_URL || 'http://localhost:3000';
const widths = [320, 360, 375, 390, 414, 768, 1024, 1440];
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const publicContext = await browser.newContext({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
const staffContext = await browser.newContext({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
let failures = 0;

async function check(page, label) {
  const result = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    // Ignore content intentionally contained by a scrolling or clipping widget, but
    // not the body's overflow safeguard: that must not conceal layout mistakes.
    const outside = [...document.querySelectorAll('main *')].filter((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || (rect.left >= -1 && rect.right <= innerWidth + 1)) return false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) return false;
      }
      return true;
    }).slice(0, 3).map((element) => `${element.tagName}.${String(element.className).slice(0, 80)}`);
    return { client, scroll, outside };
  });
  if (result.scroll > result.client || result.outside.length) {
    failures++;
    console.error(`FAIL ${label}: ${JSON.stringify(result)}`);
  }
}

async function visitRoutes(context, routes) {
  const page = await context.newPage();
  for (const route of routes) {
    try {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      if (!response?.ok() || new URL(page.url()).pathname !== route) throw new Error(`HTTP ${response?.status()} at ${page.url()}`);
      await page.waitForTimeout(700); // allow client-side dashboards to load
      for (const width of widths) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(100);
        await check(page, `${route} ${width}px`);
      }
      console.log(`Checked ${route}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${route}: ${error.message}`);
    }
  }
  return page;
}

try {
  const publicPage = await visitRoutes(publicContext, ['/', '/apartments', '/about', '/contact', '/policies', '/login', '/register', '/forgot-password']);
  await publicPage.close();
  const login = await staffContext.request.post(`${base}/api/auth/login`, {
    data: { username: process.env.E2E_ADMIN_EMAIL || 'chanda@lemma.test', password: process.env.E2E_ADMIN_PASSWORD || 'LemmaAdmin2026!' },
  });
  if (!login.ok()) throw new Error('Staff fixture login failed; prepare the disposable local dataset first.');
  const session = await staffContext.request.get(`${base}/api/session`);
  const snapshot = (await session.json()).data;
  const apartment = snapshot.apartments?.[0];
  const reservation = snapshot.reservations?.[0];
  const routes = [
    '/admin', '/admin/calendar', '/admin/reservations', '/admin/apartments', '/admin/guests',
    '/admin/payments', '/admin/housekeeping', '/admin/staff', '/admin/settings', '/admin/reports',
    '/admin/notifications', '/admin/media', '/admin/invoices', '/admin/quotations', '/admin/audit-logs', '/portal/cleaning',
    ...(apartment ? [`/apartments/${apartment.slug}`, `/admin/apartments/${apartment.id}`] : []),
    ...(reservation ? [`/admin/reservations/${reservation.id}`, `/admin/guests/${reservation.guestId}`, `/print/folio/${reservation.id}`] : []),
  ];
  const page = await visitRoutes(staffContext, routes);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${base}/admin/calendar`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: 'Month' }).waitFor({ timeout: 30000 });
  for (const view of ['Month', 'Week', 'Day']) {
    await page.getByRole('radio', { name: view }).click();
    await check(page, `calendar ${view}`);
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await check(page, 'mobile sidebar');
  await page.getByRole('button', { name: 'Close navigation' }).last().click();
  await page.getByRole('button', { name: 'New booking' }).last().click();
  await check(page, 'booking dialog');
  await page.close();
} finally {
  await browser.close();
}
if (failures) throw new Error(`${failures} responsive checks failed`);
console.log('Responsive checks passed.');
