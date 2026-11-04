#!/usr/bin/env node
/**
 * Saved packs + examples on a REAL server + temp SQLite: the user applies a starter (grey samples), builds a pack, copies it
 * with one click, and the clipboard text — what an AI would get — holds her knowledge, her instruction and NO sample.
 * Screenshots → docs/screens/packs-*.png (1280) and packs-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-packs.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-packs-'));
const PORT = 3112;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const api = async (path, method = 'GET', body) => (await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const step = (m) => console.log('•', m);

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'packs-m' : 'packs';
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).click(); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).click(); };
    const unique = `${width}-${Date.now()}`;
    const FACT = `سقف سفارش ماهانه ${unique}`;

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    const wid = (await api('/workspaces')).workspaces[0].id;

    step(`[${width}] an example starter: grey «نمونه» cards appear, never knowledge`);
    await nav('منبع حقیقت', 'منبع');
    await page.getByRole('button', { name: 'ساخت دانش' }).count(); // (no-op: keeps the nav settled)
    const before = (await api(`/workspaces/${wid}/state`)).objects.length;
    await api(`/workspaces/${wid}/starters/services/apply`, 'POST', {});
    await page.reload({ waitUntil: 'networkidle' });
    await nav('منبع حقیقت', 'منبع');
    await page.getByText('نمونه‌ها (به AI نمی‌رسند)').first().waitFor();
    assert.ok((await page.getByText('نمونه', { exact: true }).count()) >= 1, 'the «نمونه» badge is visible');
    const st = await api(`/workspaces/${wid}/state`);
    assert.equal(st.objects.length, before, 'knowledge unchanged');
    assert.ok(st.samples.length >= 6);
    await shot('1-samples');

    step(`[${width}] a real fact with a facet, then build a pack and copy it in one click`);
    await api(`/workspaces/${wid}/objects`, 'POST', { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: FACT, content: `${FACT}: ۵۰ سفارش`, nodeId: 'offer', facets: ['مشتری ماهانه'] });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'بسته‌های دانش' }).click(); // level 3 until one is saved
    await page.getByRole('button', { name: 'بستهٔ تازه' }).click();
    await page.getByLabel('نام بسته').fill('برای متن تبلیغ');
    await page.getByLabel('دستور کوتاه برای AI (اختیاری)').fill('فقط از همین بسته کار کن.');
    await page.getByRole('button', { name: 'ذخیرهٔ بسته' }).click();
    await page.getByText('برای متن تبلیغ').first().waitFor();
    await page.getByText(/توکن/).first().waitFor();
    await shot('2-pack');
    await page.getByRole('dialog').getByRole('button', { name: 'کپی', exact: true }).first().click();
    await page.getByText(/کپی شد/).first().waitFor();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /mabda-pack/, 'it is a Mabda pack');
    assert.ok(clip.includes('فقط از همین بسته کار کن.'), 'the instruction opens the pack');
    assert.ok(clip.includes(FACT), 'her Confirmed knowledge is in it');
    assert.ok(!clip.includes('مثال:'), 'NO example reaches what the AI is given');
    assert.ok(!clip.includes('نمونه‌ها (به AI نمی‌رسند)'));
    await page.keyboard.press('Escape');

    step(`[${width}] map: grouped by dependency by default; «بُعد» makes swimlanes; colouring by facet shows the name`);
    await nav('فکر', 'فکر');
    await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click());
    await page.locator('[role=radio]').filter({ hasText: /^تابلو$/ }).first().evaluate((n) => n.click());
    await page.getByRole('application', { name: /بوم/ }).waitFor();
    await page.getByRole('button', { name: /^گزینه‌ها/ }).click();
    await page.locator('[role=group][aria-label] select').nth(1).selectOption('facet', { force: true });
    await page.keyboard.press('Escape');
    await page.getByText('مشتری ماهانه').first().waitFor();
    await shot('3-map-facet');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  }
  console.log('\nOK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  try { process.kill(-child.pid); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
