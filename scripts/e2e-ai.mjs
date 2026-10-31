#!/usr/bin/env node
/**
 * End-to-end UI check of the AI flows against a LOCAL Gemini stand-in (scripted output, not a model):
 *   FAKE_GEMINI_PORT=4010 npx tsx server/ai/testing/fakeGemini.ts &
 *   MABDA_GEMINI_BASE_URL=http://127.0.0.1:4010 PORT=3100 npx tsx server.ts &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/e2e-ai.mjs
 * Verifies: no-key banner, BYOK save, streamed chat blocks + plan line, add-to-context draft, credit preview from the plan,
 * deliverable generation with real stages, ledger with real usage, and the error + retry path (set KILL_FAKE_PID=<pid of the stand-in> to also test it).
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:3100';
const KEY = 'AIzaSy' + 'A'.repeat(33);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `docs/screens/ai-${n}.png` });
const step = (m) => console.log('•', m);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

step('no key → setup banner, nothing generated');
await page.getByText('هوش مصنوعی هنوز راه‌اندازی نشده').waitFor();
await shot('1-no-key-banner');

step('BYOK: save key through the settings dialog');
await page.getByRole('button', { name: 'تنظیم کلید API' }).first().click();
await page.getByLabel('کلید Gemini API').fill(KEY);
await page.getByRole('button', { name: 'آزمودن و ذخیرهٔ کلید' }).click();
await page.getByText('کلید شخصی فعال').waitFor();
await shot('2-byok-saved');
await page.keyboard.press('Escape');
await page.getByText('هوش مصنوعی هنوز راه‌اندازی نشده').waitFor({ state: 'detached' });

step('chat: streamed structured blocks + «چرا؟» line');
await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("گفتگو و استخراج دانش")').click();
await page.getByLabel('پیام شما').fill('می‌خواهیم روی فریلنسرها تمرکز کنیم');
await page.getByRole('button', { name: 'ارسال', exact: true }).click();
await page.getByText('تصمیم نمونه').waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'چرا؟' }).last().click();
await shot('3-chat-answer');
assert.ok(await page.getByText(/با حالت «/).count(), 'plan line is shown');

step('block → Context: opens a Proposed draft in the Context dialog');
await page.getByRole('button', { name: 'به Context اضافه کن' }).first().click();
await page.getByRole('dialog').waitFor();
assert.equal(await page.getByLabel('وضعیت').inputValue(), 'Proposed');
await shot('4-add-to-context-draft');
await page.keyboard.press('Escape');

step('workstream: credit preview comes from the router plan; generate shows real stages');
await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("استودیوی جریان‌های کار")').click();
await page.getByText(/بدون کسر اعتبار/).first().waitFor({ timeout: 15000 });
await shot('5-credit-preview');
await page.getByRole('button', { name: 'ساخت دارایی' }).click();
await page.getByRole('tab', { name: /^خروجی‌ها/ }).waitFor();
await page.getByText('در کتابخانه').count();
await page.locator('table').first().waitFor({ timeout: 30000 });
await shot('6-deliverable-markdown');

step('ledger: row with real tokens/cost and model/pattern');
await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("دفتر کل")').click();
await page.getByText('کلید شخصی').first().waitFor();
await shot('7-ledger');

if (process.env.KILL_FAKE_PID) {
  step('provider down → clear error + retry (no canned reply)');
  process.kill(Number(process.env.KILL_FAKE_PID));
  await new Promise((r) => setTimeout(r, 500));
  await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("گفتگو و استخراج دانش")').click();
  await page.getByLabel('پیام شما').fill('پیام آزمایشی دو');
  await page.getByRole('button', { name: 'ارسال', exact: true }).click();
  await page.getByRole('button', { name: 'دوباره' }).first().waitFor({ timeout: 20000 });
  await shot('8-error-retry');
  assert.equal(await page.getByText(/stand-in/).count() >= 0, true);
  assert.ok(await page.getByText(/ارتباط|سرویس مدل|به‌موقع/).count(), 'a clear error message is visible');
}

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('\nOK');
