#!/usr/bin/env node
/**
 * Full scenario against a REAL server + SQLite (temp DB) and a LOCAL Gemini stand-in (scripted output, not a model):
 *   audience changes → assets become «قدیمی» with a reason → rebuild at half price → fresh again.
 * Also exercises: user nodes + notes (extract → Proposed), file upload + processing, node-scoped chat.
 * Screenshots → docs/screens/impact-*.png at 1280 and 390.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-impact.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const KEY = 'AIzaSy' + 'A'.repeat(33);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(url, tries = 80) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok || r.status < 500) return; } catch { /* retry */ } await wait(250); }
  throw new Error(`not reachable: ${url}`);
}
const children = [];
const start = (cmd, args, env) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore', detached: true });
  children.push(c);
  return c;
};
const stopAll = () => { for (const c of children) { try { process.kill(-c.pid); } catch { /* gone */ } } children.length = 0; };

async function scenario(width, tag) {
  const dir = mkdtempSync(join(tmpdir(), 'mabda-scn-'));
  const fakePort = 4010 + (width === 390 ? 1 : 0);
  const port = 3100 + (width === 390 ? 1 : 0);
  start('npx', ['tsx', 'server/ai/testing/fakeGemini.ts'], { FAKE_GEMINI_PORT: String(fakePort) });
  start('npx', ['tsx', 'server.ts'], { PORT: String(port), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_GEMINI_BASE_URL: `http://127.0.0.1:${fakePort}`, MABDA_SECRET: 'scenario-secret', NODE_ENV: 'development', MABDA_MANAGED_AI: '1' });
  await up(`http://127.0.0.1:${port}/api/health`);
  const BASE = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n, full = false) => page.screenshot({ path: `docs/screens/impact-${tag}-${n}.png`, fullPage: full });
  const step = (m) => console.log(`[${tag}] •`, m);
  const desktop = width >= 768;
  const goTab = async (d, m) => {
    if (desktop) await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).click();
    else await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).click();
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText('منبع حقیقت: استودیو').waitFor();

  step('BYOK key');
  await page.getByRole('button', { name: 'تنظیم کلید API' }).first().click();
  await page.getByLabel('کلید Gemini API').fill(KEY);
  await page.getByRole('button', { name: 'آزمودن و ذخیرهٔ کلید' }).click();
  await page.getByText('کلید شخصی فعال').waitFor();
  await page.keyboard.press('Escape');

  step('tree: user node under «محتوا», rename a system node, a note and «استخراج»');
  await page.getByRole('button', { name: 'عملیات گرهٔ محتوا و بازاریابی' }).click();
  await page.getByRole('menuitem', { name: 'زیرگرهٔ جدید' }).click();
  await page.getByLabel('نام گره').fill('کمپین پاییز');
  await page.getByRole('button', { name: 'ساخت گره' }).click();
  await page.getByRole('dialog').getByText('Context Coach').first().waitFor(); // the Coach opens for the new node
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'کمپین پاییز' }).waitFor();
  await page.getByRole('button', { name: 'عملیات گرهٔ برند و پیام' }).click();
  await page.getByRole('menuitem', { name: 'تغییر نام' }).click();
  await page.getByLabel('نام گره').fill('هویت و پیام برند');
  await page.getByRole('button', { name: 'ذخیرهٔ نام' }).click();
  await page.getByRole('heading', { name: 'هویت و پیام برند' }).waitFor();
  // system nodes cannot be deleted
  await page.getByRole('button', { name: 'عملیات گرهٔ هویت و پیام برند' }).click();
  assert.ok(await page.getByRole('menuitem', { name: 'حذف' }).isDisabled(), 'system node: delete disabled');
  await page.keyboard.press('Escape');
  const campaign = page.locator('section', { has: page.getByRole('heading', { name: 'کمپین پاییز' }) }).last();
  await campaign.getByRole('button', { name: /یادداشت‌ها/ }).click();
  await campaign.getByLabel('یادداشت تازه').fill('بودجه پنجاه میلیون است و کانال اصلی اینستاگرام.');
  await campaign.getByRole('button', { name: 'افزودن یادداشت' }).click();
  await campaign.getByRole('button', { name: 'استخراج' }).click();
  await page.getByText(/مورد پیشنهادی ساخته شد/).waitFor();
  await shot('1-tree-notes', true);

  step('files: upload a txt, processed once (summary + Proposed + chunks)');
  const f = join(dir, 'brief.txt');
  writeFileSync(f, 'بودجهٔ کمپین پاییز پنجاه میلیون تومان است.\n\nکانال اصلی کمپین اینستاگرام است و مخاطب فریلنسرها هستند.\n\n'.repeat(30));
  await page.locator('input[type=file]').setInputFiles(f);
  await page.getByText('آماده', { exact: true }).first().waitFor({ timeout: 30000 });
  await page.getByText(/قطعه/).first().waitFor();
  await shot('2-files', true);

  step('node chat: scoped to the node, context & proposals stay in its sub-tree');
  await campaign.getByRole('button', { name: 'گفتگو با این گره' }).click();
  await page.getByLabel('محدودهٔ گفتگو').waitFor();
  assert.equal(await page.getByLabel('محدودهٔ گفتگو').inputValue() !== '', true, 'scope preselected');
  await page.getByLabel('پیام شما').fill('بودجه کمپین چقدر است؟');
  await page.getByRole('button', { name: 'ارسال', exact: true }).click();
  await page.getByText('تصمیم نمونه').waitFor({ timeout: 20000 });
  await shot('3-node-chat');

  step('workstream: generate an asset (records the exact context versions)');
  await goTab('استودیوی جریان‌های کار', 'جریان‌ها');
  await page.getByRole('button', { name: 'ساخت دارایی' }).waitFor();
  await page.getByText(/بدون کسر اعتبار/).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'ساخت دارایی' }).click();
  await page.getByRole('tab', { name: /^خروجی‌ها/ }).waitFor();
  await page.getByText('Context Replay').first().waitFor({ timeout: 30000 });
  await shot('4-asset-fresh');
  assert.equal(await page.getByText('قدیمی', { exact: true }).count(), 0, 'nothing is stale yet');

  step('change the audience → toast «این تغییر روی N دارایی اثر دارد»');
  await goTab('منبع حقیقت', 'منبع حقیقت');
  await page.getByRole('heading', { name: 'مخاطب اصلی (ICP)' }).first().click();
  await page.getByRole('dialog').getByLabel('محتوای دقیق دانش').fill('مدیران محصول استارتاپ‌های ایرانی که به منبع حقیقت واحد نیاز دارند.');
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
  const toastEl = page.getByText(/این تغییر روی .* دارایی اثر دارد/);
  await toastEl.waitFor();
  const impactText = await toastEl.first().innerText();
  console.log(`[${tag}]   toast:`, impactText);
  await shot('5-impact-toast');

  step('assets: «قدیمی» badge + reason + half-price rebuild');
  await goTab('کتابخانهٔ دارایی‌ها', 'دارایی‌ها');
  await page.getByRole('tab', { name: /^قدیمی/ }).click();
  await page.getByText('این دارایی قدیمی شده است').first().waitFor();
  await page.getByText(/از نسخهٔ ۱ به ۲ تغییر کرد/).first().waitFor();
  await shot('6-asset-stale', true);
  const staleBefore = await page.getByText('این دارایی قدیمی شده است').count();
  await page.getByRole('button', { name: 'بازسازی با نصف قیمت' }).first().click();
  await page.getByRole('tab', { name: /^خروجی‌ها/ }).waitFor({ timeout: 30000 });
  await page.getByText('بازسازی‌شده').first().waitFor({ timeout: 30000 });
  await shot('7-rebuilt');

  step('assets again: one fewer stale asset, rebuilt one is fresh and replays version 2');
  await goTab('کتابخانهٔ دارایی‌ها', 'دارایی‌ها');
  await page.getByRole('tab', { name: /^قدیمی/ }).waitFor();
  const staleAfter = await page.getByText('این دارایی قدیمی شده است').count();
  console.log(`[${tag}]   stale before=${staleBefore} after=${staleAfter}`);
  await page.getByRole('tab', { name: /^تمام دارایی‌ها/ }).click();
  await page.getByText(/نسخهٔ ۲/).first().waitFor();
  await shot('8-after-rebuild', true);

  step('ledger shows the extraction, file processing and rebuild with real usage');
  await goTab('دفتر کل', 'دفتر کل');
  await page.getByText(/پردازش فایل/).first().waitFor();
  await shot('9-ledger');

  assert.ok(staleBefore >= 2, 'at least the seeded asset and the new one were stale');
  assert.equal(staleAfter, staleBefore - 1, 'only the rebuilt asset became fresh');
  assert.deepEqual(errors, [], 'no page errors');
  await browser.close();
  stopAll();
  rmSync(dir, { recursive: true, force: true });
  await wait(500);
}

try {
  await scenario(1280, 'd');
  await scenario(390, 'm');
  console.log('\nOK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  stopAll();
}
