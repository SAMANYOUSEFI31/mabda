#!/usr/bin/env node
/**
 * Copy/paste scenario on a REAL server + temp SQLite (AI parsing is not needed: the pasted answer uses the headings):
 *   «کپی برای هوش مصنوعی» (size shown) → an outside AI's answer (scripted here) → «وارد کردن پاسخ» → blocks →
 *   Context (Proposed) + asset with the pack's lineage → the proposals inbox → confirm.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-paste.mjs   → docs/screens/paste-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-paste-'));
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: '3105', MABDA_DB_PATH: join(dir, 'm.sqlite') }, stdio: 'ignore', detached: true });
const BASE = 'http://127.0.0.1:3105';
async function up() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); } throw new Error('server not reachable'); }

let browser;
try {
  await up();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
  const shot = (n, full = false) => page.screenshot({ path: `docs/screens/paste-${n}.png`, fullPage: full });
  const step = (m) => console.log('•', m);
  const nav = (label) => page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${label}")`).first().click();
  const account = async (name) => { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText('خانه: استودیو').waitFor();

  step('studio: «کپی برای هوش مصنوعی» on an output → pack with its size');
  await nav('خروجی‌ها'); await page.getByTestId('build-main_positioning').click();
  await page.getByRole('button', { name: 'بیشتر دربارهٔ این خروجی' }).click(); // the copy is under «⋯» of the output
  await page.getByRole('menuitem', { name: 'کپی برای هوش مصنوعی' }).click();
  await page.getByText(/حدود .* توکن/).first().waitFor();
  const pack = await page.getByLabel('پیش‌نمایش بسته (فقط‌خواندنی)').inputValue();
  assert.match(pack, /<!-- mabda-pack:/);
  assert.match(pack, /## واقعیت‌های تأییدشده \(Confirmed\)/);
  assert.match(pack, /## Asset: عنوان خروجی/);
  assert.match(pack, /معیارهای پذیرش/);
  await shot('1-pack');
  await page.getByRole('button', { name: 'کپی', exact: true }).click();
  await page.getByText('کپی شد', { exact: true }).waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, pack, 'what is copied is exactly the preview');
  const marker = pack.match(/<!-- mabda-pack:[A-Za-z0-9_-]+ -->/)[0];

  step('the outside AI answers in the requested format (scripted); paste it back');
  const answer = [
    marker,
    'سلام! این پاسخ من بر پایهٔ بسته است.',
    '## Decision: تمرکز بر طراحان فریلنسر',
    'اولین بخش هدف، طراحان فریلنسر هستند.',
    '## Fact: بودجهٔ ماهانه',
    'بودجهٔ بازاریابی ماهانه ۱۰ میلیون تومان است.',
    '## Question: کانال اصلی کدام است؟',
    'برای انتخاب کانال لازم است بدانم اینستاگرام یا لینکدین.',
    '## Asset: جملهٔ موقعیت‌یابی',
    'برای طراحان فریلنسر که از توضیح دوبارهٔ کسب‌وکارشان خسته‌اند، مبدأ منبع حقیقتی است که هر AI از آن کار می‌کند.',
  ].join('\n');
  await page.getByRole('button', { name: 'پاسخ AI را وارد کن' }).click();
  await page.getByRole('textbox', { name: 'پاسخ AI' }).fill(answer);
  await page.getByRole('button', { name: 'تبدیل به بلوک' }).click();
  await page.getByText('بر اساس سرتیترها').waitFor();
  await page.getByText(/اصالت: .* قلم دانش از/).waitFor();
  await shot('2-blocks');

  step('blocks → Context (Proposed) and → asset with the pack lineage');
  const blockCard = (t) => page.locator('div.rounded-control-sm', { has: page.getByText(t, { exact: true }) }).last();
  await blockCard('تمرکز بر طراحان فریلنسر').getByRole('button', { name: 'به دانش (پیشنهادی)' }).click();
  await blockCard('بودجهٔ ماهانه').getByRole('button', { name: 'به دانش (پیشنهادی)' }).click();
  await blockCard('جملهٔ موقعیت‌یابی').getByRole('button', { name: 'ذخیره به‌عنوان دارایی' }).click();
  await page.getByText('در کتابخانهٔ دارایی‌ها ذخیره شد').waitFor();
  assert.equal(await page.getByText('به صندوق پیشنهادها رفت').count(), 2);
  await shot('3-imported');
  await page.keyboard.press('Escape');

  await nav('منبع حقیقت');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(/[2۲] پیشنهاد منتظر تأیید توست/).first().waitFor(); // the home says it in one line…
  await page.locator('button[aria-controls="home-all"]').click(); // …and the inbox itself is under «همه»
  await page.getByText(/پاسخ چسبانده‌شده/).first().waitFor();
  await shot('4-inbox', true);

  step('confirm one suggestion: it becomes a fact; reject another');
  const item = (t) => page.locator('li', { has: page.getByText(t, { exact: true }) }).first();
  await item('بدون وعدهٔ درآمد').getByRole('button', { name: 'تأیید' }).click();
  await page.getByText(/تأیید شد و حالا واقعیت است/).waitFor();
  await item('بودجهٔ ماهانه').getByRole('button', { name: 'رد' }).click();
  assert.equal(await page.getByText(/پیشنهاد منتظر تأیید توست/).count(), 0, 'both pasted proposals were resolved');

  step('the pasted asset is in the library with the pack lineage');
  await nav('خروجی‌ها');
  await page.getByText('جملهٔ موقعیت‌یابی', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'ردپای دانش و معیارها' }).first().click();
  await page.getByRole('button', { name: 'مشاهدهٔ ورودی‌ها' }).first().click().catch(() => {});
  await shot('5-asset-lineage', true);
  assert.deepEqual(errors, [], 'no page errors');
  console.log('\nOK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  try { process.kill(-child.pid); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
