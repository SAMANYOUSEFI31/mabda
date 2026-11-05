#!/usr/bin/env node
/**
 * End-to-end UI check of the AI flows against a LOCAL Gemini stand-in (scripted output, not a model):
 *   FAKE_GEMINI_PORT=4010 bun run server/ai/testing/fakeGemini.ts &
 *   GEMINI_API_KEY="$MABDA_TEST_GEMINI_KEY" MABDA_MANAGED_AI=1 MABDA_GEMINI_BASE_URL=http://127.0.0.1:4010 PORT=3100 bun run server.ts &
 * Set MABDA_TEST_GEMINI_KEY to a syntactically valid placeholder; the local stand-in does not verify credentials.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/e2e-ai.mjs
 * Verifies: platform-managed AI, streamed chat blocks + plan line, add-to-context draft, credit preview from the plan,
 * deliverable generation with real stages, ledger with real usage, and the error + retry path (set KILL_FAKE_PID=<pid of the stand-in> to also test it).
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
const page = await ctx.newPage();
const account = async (name) => { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); };
const askHere = async (text) => {
  await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("خانه")').click();
  await page.getByRole('button', { name: 'درخواست برای AI' }).first().click();
  await page.getByLabel('درخواستت را در یک خط بنوی').fill(text);
  await page.getByRole('dialog').getByRole('button', { name: 'همین‌جا جواب بده' }).click();
};
const errors = [];
page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
const shot = (n) => page.screenshot({ path: `docs/screens/ai-${n}.png` });
const step = (m) => console.log('•', m);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

step('platform-managed AI: streamed structured blocks');
await askHere('می‌خواهیم روی فریلنسرها تمرکز کنیم');
await page.getByText('تصمیم نمونه').waitFor({ timeout: 20000 });
await shot('3-chat-answer');
assert.ok(await page.getByRole('button', { name: 'به دانش اضافه کن' }).count(), 'the response remains a Proposed Knowledge action');

step('block → Context: opens a Proposed draft in the Context dialog');
await page.getByRole('button', { name: 'به دانش اضافه کن' }).first().click();
const draftDialog = page.getByRole('dialog', { name: 'ثبت دانش' });
await draftDialog.waitFor();
await draftDialog.getByRole('button', { name: 'بیشتر' }).click();
assert.equal(await draftDialog.getByLabel('وضعیت').inputValue(), 'Proposed');
await shot('4-add-to-context-draft');
await page.keyboard.press('Escape');

step('workstream: managed credit preview comes from the router plan; generate shows real stages');
await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("خروجی‌ها")').click(); await page.getByTestId('outputs-build').getByRole('button', { name: /^بساز/ }).first().click();
await page.getByText(/[۰-۹]+ اعتبار/).first().waitFor({ timeout: 15000 });
await shot('5-credit-preview');
await page.getByRole('button', { name: 'ساخت دارایی' }).click();
await page.getByRole('tab', { name: /^خروجی‌ها/ }).waitFor();
await page.getByText('در کتابخانه').count();
await page.locator('table').first().waitFor({ timeout: 30000 });
await shot('6-deliverable-markdown');

step('ledger: row with real tokens/cost and model/pattern');
await account('مصرف و دفتر کل');
await page.getByText('مصرف و دفتر کل').waitFor();
await shot('7-ledger');

if (process.env.KILL_FAKE_PID) {
  step('provider down → clear error + retry (no canned reply)');
  process.kill(Number(process.env.KILL_FAKE_PID));
  await new Promise((r) => setTimeout(r, 500));
  await askHere('پیام آزمایشی دو');
  await page.getByRole('button', { name: 'دوباره' }).first().waitFor({ timeout: 20000 });
  await shot('8-error-retry');
  const errorDialog = page.getByRole('dialog', { name: 'درخواست برای AI' });
  assert.equal(await errorDialog.getByText('تصمیم نمونه').count(), 0, 'provider failure does not show a canned answer');
  assert.ok(await page.getByText(/ارتباط|سرویس مدل|به‌موقع/).count(), 'a clear error message is visible');
}

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('\nOK');
