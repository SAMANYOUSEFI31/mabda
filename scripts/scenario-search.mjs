#!/usr/bin/env node
/**
 * Global search (Ctrl/⌘+K) and «@» references on the showcase workspace (REAL server + temp SQLite):
 * a few letters find an object / node / asset / note, the keyboard alone drives the palette, commands run;
 * typing «@» offers names, and a reference only SUGGESTS a «وابسته به» link — it exists after «بساز» + save, with a Change.
 * Screenshots → docs/screens/search-*.png (1280) and search-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-search.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-search-'));
const PORT = 3116;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const api = async (path) => (await fetch(`${BASE}/api${path}`)).json();
const step = (m) => console.log('•', m);

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'search-m' : 'search';
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
    const options = () => page.locator('[role=dialog] [role=option]');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('ساخت یا بازنشانی فضای نمونه');
    await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 1500 }).catch(() => {});
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
    await page.waitForTimeout(800);

    step(`[${width}] Ctrl/⌘+K opens it with the input focused; a few letters find things, grouped`);
    await openPalette();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox', 'the focus is in the input');
    await type('لحن');
    await options().first().waitFor();
    const groups = await page.locator('[role=dialog] [role=group]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    assert.ok(groups.includes('دانش'), `groups: ${groups}`);
    assert.ok((await page.locator('[role=dialog]').innerText()).includes('لحن برند'));
    await shot('1-results');

    step(`[${width}] the keyboard alone: ↓ moves, Enter opens the object`);
    await type('ساعت پاسخ');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('[role=dialog] [role=option][aria-selected=true]').count(), 1);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] input')].some((i) => i.value === 'ساعت پاسخگویی'));
    await page.keyboard.press('Escape');

    step(`[${width}] a note, an asset and a node are found too; a command runs`);
    await openPalette(); await type('هدیه');
    assert.ok((await page.locator('[role=dialog] [role=group][aria-label="یادداشت‌ها"]').count()) === 1, 'the note group');
    await page.keyboard.press('Enter');
    await page.getByLabel('یادداشت تازه').waitFor();
    const assetTitle = (await api('/workspaces/ws_demo/state')).deliverables[0].title;
    await openPalette(); await type(assetTitle.split(' ').slice(0, 2).join(' '));
    assert.ok((await page.locator('[role=dialog] [role=group][aria-label="دارایی‌ها"]').count()) === 1, 'the asset group');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await openPalette(); await type('کارگاه برشته');
    assert.ok((await page.locator('[role=dialog] [role=group][aria-label="گره‌ها"]').count()) === 1, 'the node group');
    await page.keyboard.press('Enter');
    await page.locator('#node-dn_ws').waitFor();
    await openPalette(); await type('ثبت');
    assert.equal(await options().first().getAttribute('data-kind'), 'command');
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').getByLabel('عنوان شیء (کوتاه و گویا)').waitFor();

    step(`[${width}] «@» offers names and writes a reference — it makes no relationship`);
    const ta = page.getByRole('dialog').getByLabel('محتوای دقیق دانش');
    await ta.fill('زمان پاسخ طبق @ساع');
    await page.locator('[role=dialog] [role=listbox][aria-label="دانش‌هایی که می‌شود نام برد"] [role=option]').first().waitFor();
    await shot('2-mention');
    await ta.press('Enter');
    assert.match(await ta.inputValue(), /@«ساعت پاسخگویی» $/);
    await page.keyboard.press('Escape');

    step(`[${width}] saving a text that names an object only SUGGESTS the link; «بساز» + save creates it with a Change`);
    assert.equal((await api('/workspaces/ws_demo/state')).relationships.filter((r) => r.sourceId === 'dm_tone' && r.type === 'depends_on').length, 0);
    await openPalette(); await type('لحن پاسخ به مشتری'); await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog');
    await dlg.getByText(/این متن به «ساعت پاسخگویی» اشاره می‌کند؛ رابطهٔ «وابسته به» بسازم؟/).waitFor();
    assert.equal((await api('/workspaces/ws_demo/state')).relationships.filter((r) => r.sourceId === 'dm_tone' && r.type === 'depends_on').length, 0, 'nothing is linked by showing the chip');
    await shot('3-suggest');
    await dlg.getByRole('button', { name: 'بساز' }).click();
    await dlg.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
    await page.waitForFunction(async (u) => (await (await fetch(u)).json()).relationships.some((r) => r.sourceId === 'dm_tone' && r.targetId === 'dm_sup_hours' && r.type === 'depends_on'), `${BASE}/api/workspaces/ws_demo/state`, { timeout: 8000 });
    const ch = (await api('/workspaces/ws_demo/changes/log?objectId=dm_tone')).changes.filter((c) => c.after?.dependsOn);
    assert.ok(ch.length === 1 && ch[0].after.dependsOn.includes('dm_sup_hours'), 'the link is a Change');
    // «نه» creates nothing and is remembered
    await openPalette(); await type('لحن پاسخ به مشتری'); await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('dialog').getByText(/این متن به «ساعت پاسخگویی» اشاره می‌کند/).count(), 0, 'already linked: no chip');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
  }
  console.log('== search: OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
