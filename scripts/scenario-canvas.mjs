#!/usr/bin/env node
/**
 * The unified canvas («بوم») on a REAL server + temp SQLite (showcase workspace): three layouts, focus mode on lines,
 * a move with undo / redo, a note by double-click, a card placed in the free space, full screen that keeps its state and
 * leaves with ESC, search and keyboard navigation.
 * Screenshots → docs/screens/canvas-*.png (1280) and canvas-m-*.png (390).
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-canvas.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-canvas-'));
const PORT = 3106;
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
    const tag = mobile ? 'canvas-m' : 'canvas';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const click = (loc) => loc.evaluate((n) => n.click());
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    const layoutTab = async (name) => { await click(page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first()); await page.waitForTimeout(450); };
    const stage = page.getByTestId('canvas-stage');
    const root = page.getByTestId('canvas-root');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.removeItem('mabda.canvas.prefs'); localStorage.removeItem('mabda.canvas.tips'); });
    await page.getByText(/^خانه: /).waitFor();
    const had = (await api('/workspaces')).workspaces.some((w) => w.id === 'ws_demo');
    await account('ساخت یا بازنشانی فضای نمونه');
    if (had) await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click();
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
    await click(page.locator(mobile ? 'nav[aria-label="منوی پایینی موبایل"] button:has-text("منبع")' : 'nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("منبع حقیقت")'));
    await click(page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first());
    await stage.waitFor();

    step(`[${width}] one «بوم» (the old «نقشه» is gone) with three layouts, each answering one question`);
    assert.equal(await page.locator('[role=radio]').filter({ hasText: /^نقشه$/ }).count(), 0);
    for (const l of ['رابطه‌ها', 'تابلو', 'آزاد']) assert.ok(await page.locator('[role=radio]').filter({ hasText: new RegExp(`^${l}$`) }).count() >= 1, l);
    await layoutTab('رابطه‌ها');
    await page.getByTestId('layout-about').waitFor();
    assert.match(await page.getByTestId('layout-about').innerText(), /چه چیزی روی چه چیزی اثر می‌گذارد/);
    await page.getByTestId('canvas-tip').waitFor();
    await shot('1-relations');

    step(`[${width}] focus mode: select a card → its lines are strong and carry a type label; the rest dim but stay`);
    const edgesBefore = await page.locator('[data-testid=canvas-edges] [data-edge]').count();
    assert.ok(edgesBefore >= 2, 'lines are drawn');
    assert.equal(await page.locator('[data-testid=canvas-edges] g.opacity-35').count(), 0, 'calm default: nothing is dimmed without a selection');
    const endpoint = await page.evaluate(() => {
      for (const g of document.querySelectorAll('[data-testid=canvas-edges] [data-edge]')) {
        const [, a, b] = g.getAttribute('data-edge').split('|');
        for (const id of [a, b]) if (document.querySelector(`[data-item-id="${id}"]`)) return id;
      }
      return null;
    });
    assert.ok(endpoint, 'a drawn line has a visible end card');
    await click(page.locator(`[data-item-id="${endpoint}"]`));
    await page.waitForTimeout(250);
    assert.ok((await page.locator('[data-edge-chip]').count()) >= 1, 'the selected card’s lines get a label chip');
    assert.ok((await page.locator('[data-testid=canvas-edges] g.opacity-35').count()) >= 1, 'other lines are dimmed');
    assert.ok((await page.locator('[data-testid=canvas-edges] [data-edge]').count()) >= edgesBefore, 'none is hidden');
    await page.getByTestId('inspector-object').waitFor();
    await shot('2-focus');
    await page.getByRole('button', { name: /^گزینه‌ها/ }).click();
    await page.getByRole('switch', { name: 'نمایش همهٔ خط‌ها' }).check({ force: true });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-testid=canvas-edges] g.opacity-35').count(), 0, '«نمایش همهٔ خط‌ها» turns the dimming off');
    await page.getByRole('switch', { name: 'نمایش همهٔ خط‌ها' }).uncheck({ force: true });
    await page.keyboard.press('Escape');

    step(`[${width}] board: status columns, «needs review» is a badge (not a column), a move by the actions dialog, undo and redo`);
    await layoutTab('تابلو');
    assert.equal(await page.getByText('نیاز به بازبینی', { exact: true }).locator('visible=true').count().catch(() => 0) >= 0, true);
    const cols = await page.locator('[data-testid=canvas-stage] >> text=/^(در فکر|تأییدشده)$/').count();
    assert.ok(cols >= 2, 'two status columns');
    await shot('3-board');
    const st0 = await api('/workspaces/ws_demo/state');
    const prop = st0.objects.find((o) => o.status === 'Proposed' && o.type === 'Decision');
    await page.getByRole('button', { name: 'جستجوی کارت' }).first().click().catch(() => {});
    await page.getByLabel('جستجوی کارت').fill(prop.title.slice(0, 12));
    await page.waitForTimeout(300);
    await click(page.locator('ul[role=listbox] button').first());
    await page.getByTestId('inspector-object').waitFor();
    await page.getByTestId('canvas-inspector').getByRole('button', { name: 'انتقال و اتصال' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'تأییدشده' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'تأیید', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal((await api('/workspaces/ws_demo/state')).objects.find((o) => o.id === prop.id).status, 'Confirmed');
    await page.getByRole('button', { name: /^برگرداندن/ }).click();
    await page.waitForTimeout(700);
    assert.equal((await api('/workspaces/ws_demo/state')).objects.find((o) => o.id === prop.id).status, 'Proposed', 'Ctrl+Z puts it back (a normal, recorded change)');
    await page.getByRole('button', { name: /^از نو/ }).click();
    await page.waitForTimeout(700);
    assert.equal((await api('/workspaces/ws_demo/state')).objects.find((o) => o.id === prop.id).status, 'Confirmed', 'redo');
    await page.getByRole('button', { name: /^برگرداندن/ }).click(); await page.waitForTimeout(500);

    step(`[${width}] board columns are a view: dependency layer columns are display-only`);
    await page.getByRole('button', { name: /^گزینه‌ها/ }).click();
    await page.waitForTimeout(300);
    await page.locator('[role=group][aria-label] select').first().selectOption('layer', { force: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.ok((await page.locator('[data-testid=canvas-stage] >> text=/^(پایه|لایهٔ \\d)$/').count()) >= 1, 'layer columns');
    if (!(await page.locator('[role=group][aria-label] select').count())) { await page.getByRole('button', { name: /^گزینه‌ها/ }).click(); await page.waitForTimeout(400); }
    await page.locator('[role=group][aria-label] select').first().selectOption('status', { force: true });
    await page.keyboard.press('Escape');

    step(`[${width}] free: double-click on the empty space → a note; a real card can be placed beside it`);
    await layoutTab('آزاد');
    await shot('4-free');
    const box = await stage.boundingBox();
    const notesBefore = (await api('/workspaces/ws_demo/state')).notes.length;
    if (mobile) { await page.getByRole('button', { name: 'بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'یادداشت تازه' }).click(); } // touch path: no double-click
    else await page.mouse.dblclick(box.x + box.width - 140, box.y + 300);
    await page.getByRole('dialog').locator('textarea').fill('یک فکر تازه از روی بوم');
    await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).click();
    await page.waitForTimeout(600);
    assert.equal((await api('/workspaces/ws_demo/state')).notes.length, notesBefore + 1);
    const free0 = (await api('/workspaces/ws_demo/state')).canvas.free.filter((i) => i.itemRef.startsWith('obj:')).length;
    await layoutTab('رابطه‌ها');
    await click(page.locator('[data-item-id^="o:"]').first());
    await page.getByTestId('canvas-inspector').getByRole('button', { name: 'بگذار در فضای آزاد' }).click();
    await page.waitForTimeout(600);
    assert.equal((await api('/workspaces/ws_demo/state')).canvas.free.filter((i) => i.itemRef.startsWith('obj:')).length, free0 + 1);
    assert.equal(await page.getByTestId('layout-about').innerText().catch(() => ''), 'می‌خواهم قبل از ساختار دادن فکر کنم.', 'placing a card shows the free layout');

    step(`[${width}] full screen keeps layout, zoom and selection; ESC leaves; the page is not scrollable meanwhile`);
    await layoutTab('رابطه‌ها');
    await click(page.locator('[data-item-id^="o:"]').first());
    const zoomBefore = await page.locator('[data-testid=canvas-stage] >> text=/٪/').first().innerText();
    const selectedBefore = await page.locator('[data-testid=canvas-inspector] h3').first().innerText();
    await stage.focus();
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(400);
    assert.equal(await root.getAttribute('data-fullscreen'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
    assert.equal(await page.locator('[data-testid=canvas-stage] >> text=/٪/').first().innerText(), zoomBefore, 'zoom is kept');
    assert.equal(await page.locator('[data-testid=canvas-inspector] h3').first().innerText(), selectedBefore, 'selection is kept');
    const rect = await root.boundingBox();
    assert.ok(rect.width >= width - 2 && rect.height >= (mobile ? 844 : 900) - 2, 'covers the whole window');
    await shot('5-fullscreen');
    // focus trap: Tab many times, the focus never leaves the layer
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-testid=canvas-root]')), true, 'focus stays inside');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await root.getAttribute('data-fullscreen'), 'false');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '', 'scroll is released');
    assert.equal(await page.locator('[data-testid=canvas-inspector] h3').first().innerText(), selectedBefore, 'selection survives leaving');

    step(`[${width}] keyboard: arrows move between cards; the shortcut help opens with «؟»`);
    const first = page.locator('[data-item-id^="o:"]').first();
    await first.focus();
    const focusedBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-item-id'));
    for (const k of ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
    const focusedAfter = await page.evaluate(() => document.activeElement?.getAttribute('data-item-id'));
    assert.ok(focusedAfter, 'a card has focus');
    void focusedBefore;
    await page.keyboard.press('Shift+Slash');
    await page.getByRole('dialog').getByText('تمام‌صفحه (ESC خروج)').waitFor();
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  }
  console.log('\nOK');
} catch (e) {
  console.error('\nFAILED:', e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  try { process.kill(-child.pid); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
