#!/usr/bin/env node
/**
 * Closing layers on a phone (docs/design-system/overlays.md «حرکت‌های دست و بستن»), the regressions found on a real phone:
 *   1. a tap outside a menu closes it and does nothing else (closing the space menu once opened a truth under it);
 *   2. the next tap works at once (a closing layer never holds a tap);
 *   3. a sheet dragged down from its body, at the body's top, closes; dragged a little, it settles back;
 *   4. the system's back (Android, an installed PWA) from any page lands on «خانه», not out of the app; with a sheet open it
 *      closes the sheet first; from «خانه» it leaves (Android «Principles of navigation»: one fixed start).
 * Needs a running app with the owner sample (MABDA_ALLOW_SAMPLES=1):
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-dismiss.mjs [http://localhost:3100]
 */
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const failures = [];
const guard = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { failures.push(name); console.log('  ✗', name, '\n   ', e.message.split('\n')[0]); } };
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'fa-IR' });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
const tab = () => page.locator('.mb-bottomnav [aria-current=page]').textContent();
const touchDrag = (sel, dy) => page.evaluate(async ({ sel, dy }) => {
  const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + 40;
  const t = (yy) => new Touch({ identifier: 1, target: el, clientX: x, clientY: yy });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(y)], bubbles: true, cancelable: true }));
  for (let i = 1; i <= 10; i++) { el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(y + (dy * i) / 10)], bubbles: true, cancelable: true })); await new Promise((r) => requestAnimationFrame(r)); }
  el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }));
}, { sel, dy });

await guard('a tap outside the space menu only closes it; the next tap works', async () => {
  const thinking = await page.locator('.mb-bottomnav button', { hasText: 'فکر' }).boundingBox();
  await page.locator('header[data-pin=app] button[aria-haspopup="menu"]').tap();
  await page.locator('[role=menu]').waitFor();
  await page.touchscreen.tap(thinking.x + thinking.width / 2, thinking.y + thinking.height / 2);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('[role=menu]:visible').count(), 0, 'the menu closed');
  assert.equal((await tab()).trim(), 'خانه', 'the tap that closed the menu went through to the tab under it');
  await page.touchscreen.tap(thinking.x + thinking.width / 2, thinking.y + thinking.height / 2);
  await page.waitForTimeout(400);
  assert.equal((await tab()).trim(), 'فکر', 'the next tap did nothing');
});

await guard('a menu closed by its own trigger opens again on the very next tap', async () => {
  const trigger = page.locator('header[data-pin=app] button[aria-haspopup="menu"]');
  await trigger.tap(); await page.locator('[role=menu]').waitFor();
  await trigger.tap(); await trigger.tap();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[role=menu]:visible').count(), 1);
  await page.keyboard.press('Escape');
});

await guard('a sheet pulled down from its body closes; a small pull settles back', async () => {
  await page.locator('header[data-pin=app] button[aria-label="حساب کاربری"]').tap();
  await page.locator('.mb-dialog').waitFor();
  await touchDrag('.mb-dialog__body', 30);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.mb-dialog-layer:not(.is-inline)[data-state=open]').count(), 1, 'a small pull closed it');
  assert.equal(await page.locator('.mb-dialog').evaluate((e) => e.style.transform), '', 'it did not settle back');
  await touchDrag('.mb-dialog__body', 400);
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.mb-dialog-layer:not(.is-inline)[data-state=open]').count(), 0, 'a long pull did not close it');
});

await guard('back from any page goes to «خانه»; a sheet first; from «خانه» it leaves', async () => {
  const pg = await ctx.newPage(); // a fresh history: one entry, the start
  await pg.goto(BASE, { waitUntil: 'networkidle' });
  const at = async () => (await pg.locator('.mb-bottomnav [aria-current=page]').textContent()).trim();
  const navTo = async (label) => { await pg.locator('.mb-bottomnav button', { hasText: label }).first().tap(); await pg.waitForTimeout(500); };
  const len = () => pg.evaluate(() => history.length);
  const start = await len();
  await navTo('فکر'); await navTo('حقیقت');
  assert.equal(await at(), 'حقیقت');
  assert.equal(await len(), start + 1, 'moving between pages stacked entries');
  await pg.locator('header[data-pin=app] button[aria-label="حساب کاربری"]').tap();
  await pg.locator('.mb-dialog').waitFor();
  await pg.goBack(); await pg.waitForTimeout(500);
  assert.equal(await pg.locator('.mb-dialog-layer:not(.is-inline)[data-state=open]').count(), 0, 'back did not close the sheet');
  assert.equal(await at(), 'حقیقت', 'back with a sheet open left the page');
  await pg.goBack(); await pg.waitForTimeout(500);
  assert.equal(await at(), 'خانه', 'back from a page did not land on «خانه»');
  await navTo('فکر'); await navTo('خانه');
  assert.equal(await at(), 'خانه');
  assert.equal(await pg.evaluate(() => history.state?.tab ?? 'home'), 'home', '«خانه» is not the start entry');
  await pg.close();
});

await browser.close();
if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall passed');
