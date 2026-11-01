#!/usr/bin/env node
/**
 * Custom workstream scenario on a REAL server + SQLite and the LOCAL Gemini stand-in (scripted output, not a model):
 *   Context Coach on a new node → build a spec with 5 dependent outputs + 2 guardrails (cycle blocked) →
 *   outputs unlock in dependency order → each output shows pass/fail + reason per criterion and guardrail → Starter is gated.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-spec.mjs
 * Screenshots → docs/screens/spec-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const KEY = 'AIzaSy' + 'A'.repeat(33);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const start = (args, env) => { const c = spawn('npx', args, { env: { ...process.env, ...env }, stdio: 'ignore', detached: true }); children.push(c); };
const stopAll = () => { for (const c of children) { try { process.kill(-c.pid); } catch { /* gone */ } } };
async function up(url) { for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch { /* retry */ } await wait(250); } throw new Error(`not reachable ${url}`); }

const dir = mkdtempSync(join(tmpdir(), 'mabda-spec-'));
start(['tsx', 'server/ai/testing/fakeGemini.ts'], { FAKE_GEMINI_PORT: '4012' });
start(['tsx', 'server.ts'], { PORT: '3102', MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_GEMINI_BASE_URL: 'http://127.0.0.1:4012', MABDA_SECRET: 'scenario-secret', GEMINI_API_KEY: KEY });
const BASE = 'http://127.0.0.1:3102';

const TITLES = ['پژوهش مخاطب', 'جملهٔ موقعیت‌یابی', 'پیام‌های کلیدی', 'ستون‌های محتوا', 'تقویم هفتگی'];
// dependencies by index: B←A, C←A,B, D←B, E←C,D
const DEPS = { 1: [0], 2: [0, 1], 3: [1], 4: [2, 3] };
const GUARDRAILS = ['از واژهٔ «ارزان» استفاده نکن', 'هیچ وعدهٔ درآمد تضمینی نده'];

let browser;
try {
  await up(`${BASE}/api/health`);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
  const shot = (n, full = false) => page.screenshot({ path: `docs/screens/spec-${n}.png`, fullPage: full });
  const step = (m) => console.log('•', m);
  const nav = (label) => page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${label}")`).click();
  const account = async (name) => { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText('منبع حقیقت: استودیو').waitFor();
  await account('کلید هوش مصنوعی');
  await page.getByLabel('کلید Gemini API').fill(KEY);
  await page.getByRole('button', { name: 'آزمودن و ذخیرهٔ کلید' }).click();
  await page.getByText('کلید شخصی فعال').waitFor();
  await page.keyboard.press('Escape');

  step('Context Coach right after creating a node');
  await page.getByRole('button', { name: 'عملیات گرهٔ محتوا و بازاریابی' }).click();
  await page.getByRole('menuitem', { name: 'زیرگرهٔ جدید' }).click();
  await page.getByLabel('نام گره').fill('کمپین عرضه');
  await page.getByLabel('توضیح کوتاه (اختیاری)').fill('مشتری خوب می‌خواهیم');
  await page.getByRole('button', { name: 'ساخت گره' }).click();
  await page.getByRole('dialog').getByText('مربی دانش').first().waitFor();
  await page.getByRole('button', { name: 'از مربی دانش بپرس' }).click();
  await page.getByText('سؤال‌های روشن‌کننده').waitFor({ timeout: 20000 });
  await page.getByText('ابهام‌ها').waitFor();
  await shot('1-coach');
  await page.getByRole('button', { name: 'ثبت به‌عنوان پیشنهادی' }).click();
  await page.getByText(/مورد پیشنهادی ثبت شد/).waitFor();
  await page.keyboard.press('Escape');

  step('spec editor: 5 outputs, dependencies, 2 guardrails; a cycle is blocked');
  await nav('جریان‌های کار');
  await page.getByRole('button', { name: 'جریان کار تازه' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('عنوان جریان کار').fill('کمپین عرضهٔ محصول');
  await dlg.getByLabel('هدف (Target)').fill('ساخت بستهٔ کامل پیام و محتوا برای عرضهٔ محصول جدید');
  await dlg.getByRole('button', { name: 'افزودن مورد' }).first().click();
  await dlg.getByLabel('نام Context').first().fill('بودجهٔ کمپین');
  for (let i = 1; i < 5; i++) await dlg.getByRole('button', { name: 'افزودن خروجی' }).click();
  for (let i = 0; i < 5; i++) {
    await dlg.getByLabel('عنوان خروجی').nth(i).fill(TITLES[i]);
    await dlg.getByLabel('معیار', { exact: true }).nth(i).fill(`${TITLES[i]} روشن، مشخص و مبتنی بر Context باشد`);
  }
  for (const [i, deps] of Object.entries(DEPS)) {
    const fs = dlg.locator('fieldset').nth(Number(i));
    for (const d of deps) await fs.getByLabel(TITLES[d]).check();
  }
  // A cannot depend on E (E ← C ← B ← A)
  const aOnE = dlg.locator('fieldset').nth(0).getByLabel(TITLES[4]);
  assert.ok(await aOnE.isDisabled(), 'a dependency that closes a cycle is disabled');
  await dlg.getByText(/این انتخاب چرخه می‌سازد/).first().waitFor();
  await shot('2-editor-cycle-blocked', true);
  await dlg.getByRole('button', { name: 'افزودن گاردریل' }).click();
  await dlg.getByRole('button', { name: 'افزودن گاردریل' }).click();
  for (let i = 0; i < 2; i++) await dlg.getByLabel('گاردریل', { exact: true }).nth(i).fill(GUARDRAILS[i]);
  await dlg.getByRole('button', { name: 'ذخیره و فعال‌سازی' }).click();
  await page.getByRole('button', { name: 'ساخت دارایی' }).waitFor({ timeout: 15000 });

  step('studio: order follows the graph, blocked outputs are locked with the reason');
  const list = page.getByRole('list', { name: 'خروجی‌های این جریان کار' });
  const items = await list.locator('li, [role=option], button').allInnerTexts();
  console.log('  list:', items.join(' | ').replace(/\n/g, ' ').slice(0, 300));
  assert.ok(await list.getByText(/ابتدا بساز: «پژوهش مخاطب»/).count() >= 1, 'locked item names its missing dependency');
  await shot('3-studio-locked');

  assert.equal(await page.getByText(/موجودی اعتبار|اعتبار باقی‌مانده|هزینهٔ این اجرا|[۰-۹]+ اعتبار/).count(), 0, 'managed AI is off: no credit number anywhere');

  step('run all five in dependency order');
  const built = [];
  for (const t of TITLES) {
    await page.getByRole('tab', { name: 'تولید' }).click();
    await list.getByText(t, { exact: false }).first().click();
    await page.getByRole('heading', { name: t, level: 3 }).waitFor();
    const btn = page.getByRole('button', { name: 'ساخت دارایی' });
    await btn.waitFor();
    let enabled = false;
    for (let i = 0; i < 60 && !enabled; i++) { enabled = await btn.isEnabled(); if (!enabled) await wait(250); }
    assert.ok(enabled, `${t} is unlocked after its dependencies were built (${built.join('، ') || '—'})`);
    await btn.click();
    await page.getByRole('tab', { name: /^خروجی‌ها/ }).waitFor();
    await page.getByText('معیارهای پذیرش و گاردریل‌ها').first().waitFor({ timeout: 40000 });
    built.push(t);
    console.log('  built:', t);
    if (t === TITLES[0]) await shot('4-first-output-checks');
  }
  await page.getByRole('tab', { name: /^خروجی‌ها/ }).click();
  const cards = await page.getByText('معیارهای پذیرش و گاردریل‌ها').count();
  assert.equal(cards, 5, 'every output shows its checks');
  assert.ok(await page.getByText(/گاردریل: از واژهٔ «ارزان»/).count() >= 5, 'spec guardrail checked on every output');
  assert.ok(await page.getByText(/گاردریل: .*تخفیف/).count() >= 5 || (await page.getByText(/گاردریل: /).count()) >= 10, 'guardrails listed');
  await shot('5-all-outputs', true);

  step('Pro and above only: the Starter workspace gets the upgrade notice');
  await account('آکادمی رشد فریلنسرها');
  await page.getByText('منبع حقیقت: آکادمی').waitFor().catch(() => {});
  await nav('جریان‌های کار');
  await page.getByRole('button', { name: 'تعریف جریان کار سفارشی' }).click();
  await page.getByText('جریان کار سفارشی از پلن Pro').waitFor();
  await shot('6-starter-gated');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('\nOK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopAll();
  rmSync(dir, { recursive: true, force: true });
}
