#!/usr/bin/env node
/**
 * «ساختار سرنخ است، نه حکم» on a REAL server + temp SQLite (docs/spine.md), the four walkthroughs:
 *   الف a price changes in «اشتراک»: the calm «در N زیربخش هم حاکم است» news; look, go to a sub-section, «دیدم»
 *   ب «قیمت اشتراک» and «قیمت بستهٔ هدیه» (its sub-section) both wait: which comes first, and why
 *   ج a new price decision in «بستهٔ هدیه»: which dependency is suggested (nothing is linked until a tap)
 *   د move a section: no relation was built or removed
 * Screenshots → docs/screens/structure-*.png
 *   CHROMIUM_PATH=... node scripts/scenario-structure-hints.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-structure-'));
let BASE = '';
const children = [];
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), NODE_ENV: 'development' }, stdio: 'ignore', detached: true, shell: process.platform === 'win32' }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const stopAll = () => {
  for (const c of children.splice(0)) {
    if (process.platform === 'win32') { try { spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
    else { try { process.kill(-c.pid); } catch { try { c.kill(); } catch { /* gone */ } } }
  }
};
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of (process.env.WIDTHS ?? '1280,390').split(',').map(Number)) {
    const mobile = width < 768;
    const tag = `structure-${width}`;
    await startServer(3200 + Math.floor(Math.random() * 600) * 2 + (mobile ? 1 : 0), tag); // a fresh port each run: a server left behind by an earlier run is never reused
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).evaluate((n) => n.click()); };
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
    await account('فضا تازه');
    await page.getByRole('radio', { name: 'کسب‌وکار' }).click(); await page.getByLabel('نام فضا', { exact: true }).fill(`سرنخ ${width}`);
    await page.getByRole('button', { name: 'افزودن فضا' }).click();
    await page.getByText(`خانه: سرنخ ${width}`).waitFor({ timeout: 8000 });
    const wid = (await call('GET', '/workspaces')).workspaces.find((w) => w.name === `سرنخ ${width}`).id;
    /** a reload forgets the chosen workspace (the app does not remember it): come back to it */
    const enter = async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText(/^خانه: /).waitFor();
      if (!(await page.getByText(`خانه: سرنخ ${width}`).count())) {
        if (process.env.DEBUG_MENU) { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); console.log('menu:', (await page.getByRole('menuitem').allInnerTexts()).join(' | ')); await page.keyboard.press('Escape'); }
        await account(`سرنخ ${width}`);
      }
      await page.getByText(`خانه: سرنخ ${width}`).waitFor({ timeout: 8000 });
    };
    const state = () => call('GET', `/workspaces/${wid}/state`);
    const root = (await state()).nodes.find((n) => !n.parentId).id;
    const sub = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: root, label: 'اشتراک' })).node.id;
    const gift = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: sub, label: 'بستهٔ هدیه' })).node.id;
    const annual = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: sub, label: 'اشتراک سالانه' })).node.id;
    const mk = async (nodeId, title, status = 'Confirmed', type = 'Decision') => (await call('POST', `/workspaces/${wid}/objects`, { workspaceId: wid, type, status, provenance: status === 'Proposed' ? 'AI Suggested' : 'User Input', title, content: `${title}: متن`, nodeId })).object;

    // ── الف
    step(`[${width}] الف: a price changes in «اشتراک» → one calm notice, no warning`);
    const price = await mk(sub, 'قیمت اشتراک');
    await mk(gift, 'قیمت بستهٔ هدیه');
    await mk(annual, 'لحن برند');
    await call('PATCH', `/workspaces/${wid}/objects/${price.id}`, { content: 'قیمت اشتراک ماهانه ۲۹۰ هزار تومان است.', reason: 'تصمیم تازه' });
    const before = await state();
    await enter();
    const openAll = page.getByRole('button', { name: /همهٔ کارها|نمایش همه/ });
    if (await openAll.count()) await openAll.first().click().catch(() => {});
    if (process.env.DEBUG_HOME) { await page.screenshot({ path: 'docs/screens/dbg-home.png', fullPage: true }); console.log((await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900)); console.log(JSON.stringify((await state()).changes?.slice(-3))); }
    await page.getByTestId('inherit-notices').waitFor({ timeout: 6000 });
    const sentence = (await page.getByTestId('inherit-notices').innerText()).replace(/\s+/g, ' ');
    console.log('   notice:', sentence);
    assert.match(sentence, /حاکم است/);
    assert.equal(await page.getByTestId('inherit-notices').locator('[role=alert]').count(), 0, 'not an alert');
    await shot('1-notice');
    await page.getByTestId('inherit-notices').getByRole('button', { name: 'ببین کجاها' }).click();
    const where = (await page.getByTestId('inherit-notices').innerText()).replace(/\s+/g, ' ');
    assert.match(where, /بستهٔ هدیه/); assert.match(where, /اشتراک سالانه/);
    assert.match(where, /هم‌موضوع: «قیمت بستهٔ هدیه»/, 'the same-topic knowledge of the sub-section is named');
    assert.ok(!/هم‌موضوع: «لحن برند»/.test(where), 'unrelated knowledge is not');
    await shot('2-where');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no horizontal overflow (${overflow})`);
    const after = await state();
    assert.equal(JSON.stringify(after.relationships), JSON.stringify(before.relationships), 'the notice built no relation');
    assert.equal((after.objects ?? []).filter((o) => o.status === 'Needs Review').length, 0, 'and no needs-review');
    await page.getByTestId('inherit-notices').getByRole('button', { name: 'دیدم' }).first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId('inherit-notices').count(), 0, '«دیدم» closes it');
    await enter();
    await page.waitForTimeout(600);
    assert.equal(await page.getByTestId('inherit-notices').count(), 0, 'and it stays closed');

    // ── ب
    step(`[${width}] ب: both prices wait → the upper one first, with the reason`);
    await mk(gift, 'قیمت بستهٔ هدیه تازه', 'Proposed');
    await mk(sub, 'قیمت اشتراک تازه', 'Proposed');
    await enter();
    await nav('فکر', 'فکر');
    await page.getByRole('region', { name: 'منتظر تصمیم تو' }).or(page.locator('section[aria-label="منتظر تصمیم تو"]')).first().waitFor();
    const titles = await page.locator('section[aria-label="منتظر تصمیم تو"] #proposal-inbox li > div:first-child .label-md').allInnerTexts();
    console.log('   order:', titles.join(' | '));
    assert.deepEqual(titles, ['قیمت اشتراک تازه', 'قیمت بستهٔ هدیه تازه'], 'the upper section first even though the lower was added first');
    const sec = (await page.locator('section[aria-label="منتظر تصمیم تو"]').innerText()).replace(/\s+/g, ' ');
    assert.match(sec, /زیربخش‌ها از این ارث می‌برند؛ اول این را روشن کن/);
    await shot('3-order');

    // ── ج
    step(`[${width}] ج: a new price decision in «بستهٔ هدیه» → "depends on" is suggested, not made`);
    await nav('منبع حقیقت', 'منبع');
    await page.getByRole('button', { name: /^(افزودن|ثبت دانش|افزودن دانش|ثبت اولین دانش)$/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('چه چیزی درست است؟').fill('قیمت بستهٔ هدیه ۱۵۰ هزار تومان است.');
    await dlg.getByLabel('عنوان').fill('قیمت بستهٔ هدیه نهایی');
    await dlg.getByRole('button', { name: /^در:/ }).click();
    await page.getByRole('menuitem', { name: /بستهٔ هدیه/ }).first().click();
    await dlg.getByRole('radio', { name: /تصمیم/ }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const list = dlg.getByRole('list', { name: 'پیشنهاد رابطه' });
    await list.waitFor({ timeout: 4000 });
    const text = (await list.innerText()).replace(/\s+/g, ' ');
    console.log('   suggestion:', text);
    assert.match(text, /از بخش «اشتراک» به اینجا می‌رسد و از «قیمت» حرف می‌زند/);
    assert.match(text, /قیمت اشتراک/);
    assert.ok(!/لحن برند/.test(text), 'unrelated upper knowledge is not suggested');
    await shot('4-suggest');
    const relsBefore = (await state()).relationships.length;
    await dlg.getByRole('button', { name: 'نه' }).first().click();
    await page.waitForTimeout(200);
    assert.equal((await state()).relationships.length, relsBefore, 'nothing was linked');
    await dlg.getByRole('button', { name: /^(بستن|انصراف)/ }).first().click().catch(() => page.keyboard.press('Escape'));

    // ── د
    step(`[${width}] د: move a section, no relation is built or removed`);
    const s1 = await state();
    const low = s1.objects.find((o) => o.title === 'قیمت بستهٔ هدیه');
    const top = s1.objects.find((o) => o.title === 'قیمت اشتراک');
    await call('PUT', `/workspaces/${wid}/objects/${low.id}/dependencies`, { dependsOn: [top.id] });
    const k1 = JSON.stringify((await state()).relationships.map((r) => `${r.type}:${r.sourceId}>${r.targetId}`).sort());
    await call('POST', `/workspaces/${wid}/nodes/${gift}/move`, { parentId: root });
    await call('POST', `/workspaces/${wid}/nodes/${sub}/move`, { parentId: gift });
    const k2 = JSON.stringify((await state()).relationships.map((r) => `${r.type}:${r.sourceId}>${r.targetId}`).sort());
    assert.equal(k2, k1, 'moves neither built nor removed a relation');

    assert.deepEqual(errors, [], 'no page errors');
    step(`[${width}] ok`);
    stopAll();
  }
  console.log('✓ structure hints scenario passed');
} finally {
  await browser?.close();
  stopAll();
}
