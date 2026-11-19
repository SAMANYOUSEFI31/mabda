#!/usr/bin/env node
/**
 * Monitored numbers on a REAL server + temp SQLite (showcase workspace): in the weekly review the user records a number in a few clicks,
 * the monitored truth shows its number's history with the decisions as vertical lines, a due decision is judged «به انتظار رسید / نیمه / نرسید»,
 * the plain count on Home follows — and no sentence on the way claims a cause.
 * Screenshots → docs/screens/metrics-*.png (1280) and metrics-m-*.png (390).
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-metrics.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-metrics-'));
const PORT = 3113;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const api = async (path, method = 'GET', body) => (await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const step = (m) => console.log('•', m);
const CAUSAL = /(?<![؀-ۿ])(اثر|تأثیر|تاثیر|علت|باعث|موجب|ناشی|به‌دلیل|به دلیل|بخاطر|به‌خاطر|سبب)/;

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'metrics-m' : 'metrics';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const account = async (name) => {
      // spaces (and what acts on one) live in the space picker at the head of the bar; the rest in the account menu
      const inSpace = !/حساب و داده|پلن و ارتقا|مصرف|امکانات|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      const label = name === 'فضا تازه' ? 'فضای تازه…' : name;
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); return; }
      if (page.viewportSize().width < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: label }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: label }).first().click(); }
    };
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    const had = (await api('/workspaces')).workspaces.some((w) => w.id === 'ws_demo');
    await account('بازسازی فضای نمونه');
    if (had) await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click();
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();

    step(`[${width}] home: no count of expectation versus result (owner decision §۴۲); a verdict that is due waits in «منتظر تو»`);
    await page.locator('button[aria-controls="home-all"]').click(); // the full list is under «همه»
    await page.getByText(/مورد موعد بازبینی دارد/).first().waitFor();
    assert.equal(await page.getByTestId('expectation-tally').count(), 0);
    await shot('1-home');

    step(`[${width}] weekly review: a number in a few clicks (field → record)`);
    await page.getByRole('button', { name: /بازبینی هفتگی/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText(/بخش ۱ از ۴/).waitFor();
    for (let i = 0; i < 3; i++) await dlg.getByRole('button', { name: 'دیدم؛ بعدی' }).click();
    await dlg.getByText(/بخش ۴ از ۴: عددهای این هفته/).waitFor();
    await dlg.getByLabel(/سفارش هفتگی/).fill('۱۱۸');
    await shot('2-weekly-numbers');
    await dlg.getByRole('button', { name: /ثبت عددها/ }).click();
    await page.waitForTimeout(500);
    let st = await api('/workspaces/ws_demo/state');
    const added = st.measurements.find((m) => m.value === 118);
    assert.ok(added && added.status === 'Confirmed' && added.source === 'manual' && added.metricId === 'met_demo_orders');
    await page.keyboard.press('Escape');

    step(`[${width}] the chart on the monitored truth: its number as a line, decisions as vertical lines, «پس از» sentences`);
    // monitoring is an option on a truth (no metrics section): open «سفارش هفتگی» from the palette
    await page.keyboard.press('Control+k'); await page.keyboard.type('سفارش هفتگی'); await page.waitForTimeout(600); await page.keyboard.press('Enter');
    const md = page.getByTestId('monitor-panel');
    await md.waitFor();
    assert.equal(await md.locator('svg[role=img]').count(), 1, 'one chart: the history of this truth\'s number');
    assert.ok((await md.locator('svg[role=img] line[stroke-dasharray="3 3"]').count()) >= 1, 'the decision that expects something of this number is a strong vertical line');
    await md.getByText(/پس از «کانال اصلی تبلیغ»: از ۹۵ سفارش به ۱۱۲ سفارش/).waitFor();
    const text = await md.innerText();
    assert.doesNotMatch(text, CAUSAL, 'no sentence claims a cause');
    await shot('3-chart');
    await page.keyboard.press('Escape');

    step(`[${width}] a due decision: judged with one of three buttons`);
    await page.getByRole('button', { name: /بازبینی هفتگی/ }).first().click();
    for (let i = 0; i < 2; i++) await dlg.getByRole('button', { name: 'دیدم؛ بعدی' }).click();
    await dlg.getByText(/انتظار: «ماندگاری اشتراک» بالا برود/).waitFor();
    assert.match(await dlg.innerText(), /پس از «قیمت اشتراک ماهانه»: از ۶۴ درصد به ۶۶ درصد/);
    assert.doesNotMatch(await dlg.innerText(), CAUSAL);
    await shot('4-verdict');
    await dlg.getByRole('button', { name: /^نیمه/ }).click();
    await page.waitForTimeout(500);
    st = await api('/workspaces/ws_demo/state');
    const j = st.changes.filter((c) => c.objectId === 'dm_price2' && c.kind === 'outcome_noted').at(-1);
    assert.equal(j.after.verdict, 'partial');
    assert.equal(j.after.metricId, 'met_demo_retention');
    await page.keyboard.press('Escape');
    await shot('5-home-after');
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
