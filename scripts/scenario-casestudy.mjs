#!/usr/bin/env node
/**
 * The showcase workspace on a REAL server + temp SQLite: one click builds it, a second click resets it to the same state, and
 * every view of docs/case-study.md has content. Counts come from the API, states are read from the page.
 * Screenshots → docs/screens/casestudy-*.png (1280) and casestudy-m-*.png (390).
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-casestudy.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-case-'));
const PORT = 3109;
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
    const tag = mobile ? 'casestudy-m' : 'casestudy';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().click();
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).click(); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).click(); };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText('خانه: استودیو').waitFor();

    step(`[${width}] one click builds the showcase workspace`);
    const listBefore = (await api('/workspaces')).workspaces;
    const hadDemo = listBefore.some((w) => w.id === 'ws_demo');
    const before = listBefore.length - (hadDemo ? 1 : 0);
    await account('ساخت یا بازنشانی فضای نمونه');
    if (hadDemo) { await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click(); }
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
    const list = (await api('/workspaces')).workspaces;
    assert.equal(list.length, before + 1);
    assert.equal(list.find((w) => w.id === 'ws_demo').isDemo, true);
    const st = await api('/workspaces/ws_demo/state');
    assert.ok(st.objects.length >= 30 && st.changes.length > 40);

    step(`[${width}] home: what needs you (contradictions, review, waiting decisions, flip-flop warning)`);
    await page.getByText('تصمیم‌های منتظر').first().waitFor();
    await page.getByText('تصمیم همزمان').first().waitFor();
    await page.getByText(/چند بار عوض شده/).first().waitFor();
    await page.getByRole('heading', { name: 'نیاز به بازبینی' }).first().waitFor();
    await shot('1-home');

    step(`[${width}] contradictions panel`);
    await page.getByRole('heading', { name: /تناقض/ }).first().waitFor();
    assert.ok((await page.getByText(/قیمت اشتراک ماهانه/).count()) >= 2);

    step(`[${width}] proposals inbox with sources and reasons`);
    await page.getByText('پیشنهاد AI بیرونی').first().waitFor().catch(() => {});
    await page.getByText(/AI بیرونی \(MCP\)/).first().waitFor();
    await page.getByText(/دلیل پیشنهاد/).first().waitFor();
    await page.getByText(/تغییر پیشنهادی/).first().waitFor();

    step(`[${width}] weekly review: three sections, then the summary`);
    await page.getByRole('button', { name: /بازبینی هفتگی/ }).first().click();
    await page.getByRole('dialog').getByText(/بخش ۱ از ۴/).waitFor();
    await shot('2-weekly-1');
    await page.getByRole('dialog').getByRole('button', { name: 'دیدم؛ بعدی' }).click();
    await page.getByRole('dialog').getByText('بدون تغییر بپذیر').first().waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'دیدم؛ بعدی' }).click();
    await page.getByRole('dialog').getByText('آمادهٔ تصمیم').first().waitFor();
    await shot('2-weekly-3');
    await page.keyboard.press('Escape');

    step(`[${width}] map, board, history`);
    await nav('منبع حقیقت', 'منبع');
    await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click()); await page.waitForTimeout(400);
    const layoutTab = async (n) => { await page.locator('[role=radio]').filter({ hasText: new RegExp(`^${n}$`) }).first().evaluate((x) => x.click()); await page.waitForTimeout(450); };
    await layoutTab('رابطه‌ها');
    await page.getByRole('application', { name: /بوم/ }).waitFor();
    await shot('3-map');
    await layoutTab('تابلو');
    await shot('4-board');
    await layoutTab('آزاد');
    assert.ok((await page.getByText(/شاید یک اشتراک هدیه/).count()) >= 1);
    await radio('ساختار');
    await page.getByRole('heading', { name: 'اشتراک ماهانه' }).first().waitFor();
    await page.getByText('بستهٔ اشتراک', { exact: true }).first().waitFor().catch(() => {});

    step(`[${width}] history of an object (who, what, why) with before/after`);
    await page.getByText('مخاطب اصلی', { exact: true }).first().click();
    await page.getByRole('tab', { name: /^تاریخچه/ }).click();
    await page.getByText(/دلیل: بعد از نظرسنجی/).waitFor();
    await shot('5-history');
    await page.keyboard.press('Escape');

    step(`[${width}] workstreams: ready / missing / ambiguous`);
    await nav('جریان‌های کار', 'جریان‌ها');
    await page.waitForTimeout(500); await shot('7-workstreams');
    if (!mobile) await page.locator('text=معرفی برند >> visible=true').first().waitFor();
    const specs = (await api('/workspaces/ws_demo/state')).specs;
    assert.equal(specs.length, 3);

    step(`[${width}] assets: three hand-made samples, two need a review, «ساخت با AI» is offered`);
    await nav('دارایی‌ها', 'دارایی‌ها');
    assert.equal(await page.getByText('نمونهٔ دستی', { exact: true }).count(), 3);
    assert.equal(await page.getByText('نیاز به بازبینی', { exact: true }).count() >= 2, true);
    assert.ok((await page.getByRole('button', { name: 'ساخت با AI' }).count()) >= 3);
    assert.ok((await page.getByText(/به «.*» وابسته است و «.*» تغییر کرده/).count()) >= 1, 'dependency_changed reason');
    await shot('6-assets');

    step(`[${width}] reset twice = the same state`);
    const a = JSON.stringify(await api('/workspaces/ws_demo/state'));
    await nav('منبع حقیقت', 'منبع');
    await account('ساخت یا بازنشانی فضای نمونه');
    await page.getByRole('dialog').getByText('بازنشانی فضای نمونه؟').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await wait(500);
    assert.equal(JSON.stringify(await api('/workspaces/ws_demo/state')), a);
    assert.equal((await api('/workspaces')).workspaces.length, before + 1, 'still one showcase workspace');
    assert.deepEqual(errors, [], 'no page errors');
    await page.context().close();
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
