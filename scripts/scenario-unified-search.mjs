#!/usr/bin/env node
/**
 * The unified search and «اطراف این مورد» on the showcase workspace (REAL server + temp SQLite):
 * results are grouped, best first, shown progressively («نمایش بیشتر» is reachable by keyboard and reveals more — no fixed ceiling),
 * Persian digits / Arabic letters find the same thing, and an object's «اطراف این مورد» tab lists its relations, thoughts, outputs and source.
 * Screenshots → docs/screens/usearch-*.png (1280) and usearch-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-unified-search.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-usearch-'));
const PORT = 3117;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const step = (m) => console.log('•', m);

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'usearch-m' : 'usearch';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    const openPalette = async () => { if (mobile) await page.getByRole('button', { name: 'جستجو' }).first().click(); else await page.keyboard.press('Control+KeyK'); await page.getByRole('combobox', { name: 'جستجو' }).waitFor(); };
    const type = async (q) => { await page.getByRole('combobox', { name: 'جستجو' }).fill(q); await page.waitForTimeout(150); };
    const group = (name) => page.locator(`[role=dialog] [role=group][aria-label="${name}"] [role=option]:not([data-kind=more])`);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('بازسازی فضای نمونه');
    await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 1500 }).catch(() => {});
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
    await page.waitForTimeout(800);

    step(`[${width}] a common word: the best few first, a «نمایش بیشتر» row, and the keyboard alone reveals the rest`);
    await openPalette(); await type('مشتری');
    assert.equal(await group('دانش').count(), 5, 'five first');
    const more = page.locator('[role=dialog] [role=option][data-kind=more][data-group=object]');
    assert.equal(await more.count(), 1);
    await shot('1-first-five');
    for (let i = 0; i < 40; i++) {
      if (await more.getAttribute('aria-selected') === 'true') break;
      await page.keyboard.press('ArrowDown');
    }
    assert.equal(await more.getAttribute('aria-selected'), 'true', 'the keyboard reaches the «more» row');
    await page.keyboard.press('Enter');
    assert.ok((await group('دانش').count()) > 5, 'more rows after Enter');
    await shot('2-more');
    assert.ok((await page.getByRole('dialog').innerText()).includes('مشتری'));

    step(`[${width}] Persian digits and Arabic letters find the same thing`);
    await type('قيمت'); // Arabic ي
    assert.ok((await group('دانش').count()) > 0, 'Arabic ي');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    step(`[${width}] «اطراف این مورد»: relations, thoughts, outputs and source in one tab`);
    await openPalette(); await type('روز ارسال اشتراک'); await page.keyboard.press('Enter');
    await page.getByRole('tab', { name: 'اطراف این مورد' }).click();
    const around = page.getByRole('region', { name: 'اطراف این مورد' });
    await around.waitFor();
    for (const t of ['رابطه‌ها و وابستگی‌ها', 'فکرهای باز دربارهٔ این', 'خروجی‌هایی که از این استفاده کرده‌اند', 'منبع']) assert.equal(await around.getByRole('region', { name: t }).count(), 1, t);
    assert.equal(await page.locator('[data-testid=around-related]').count(), 0, 'the semantic «related» point is off: nothing is shown');
    await shot('3-around');
    assert.deepEqual(errors, [], errors.join('\n'));
  }
  console.log('== unified search: OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid); } catch { /* already gone */ }
  rmSync(dir, { recursive: true, force: true });
}
