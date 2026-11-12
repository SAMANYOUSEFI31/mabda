#!/usr/bin/env node
/**
 * «ثبت سریع» on a REAL server + temp SQLite, at 1280 and 390. It also MEASURES the steps (not guesses): every user action
 * (a click/tap, a key chord, a text entry) goes through `act()`, which counts it. The old way (nav → «فکر تازه» → write → «ذخیره»)
 * and the new way are both run from the same starting pages and the table is printed.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-quick-capture.mjs
 * Screenshots → docs/screens/quick-capture-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-qc-'));
const PORT = Number(process.env.QC_PORT || 3141);
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const call = async (method, path, body) => (await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const state = () => call('GET', '/workspaces/ws_studio/state');
const step = (m) => console.log('•', m);
const table = [];

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const where = mobile ? 'موبایل' : 'دسکتاپ';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/quick-capture-${n}-${width}.png` });
    let steps = 0;
    const act = async (fn) => { steps++; await fn(); };
    const nav = (d, m) => act(() => (mobile
      ? page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click())
      : page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).evaluate((n) => n.click())));
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click());
    const home = async () => { await page.goto(BASE, { waitUntil: 'networkidle' }); await page.getByText(/^خانه: /).waitFor(); };
    const noteTexts = async () => (await state()).notes.map((n) => n.content);
    const uniq = () => `${width}-${Math.random().toString(36).slice(2, 7)}`;

    // ── الف: the OLD way, measured from three starting pages ──
    const oldWay = async (text, onThinking = false) => {
      steps = 0;
      if (!onThinking) await nav('فکر', 'فکر');
      await act(() => page.getByRole('button', { name: 'فکر تازه' }).first().click());
      const dlg = page.getByRole('dialog');
      await act(() => dlg.getByLabel('فکرت را بنویس').fill(text));
      await act(() => dlg.getByRole('button', { name: 'ذخیره' }).click());
      await page.getByText(/فکر ثبت شد/).waitFor();
      return steps;
    };
    const start = { home: async () => { await home(); }, tree: async () => { await home(); await nav('منبع حقیقت', 'منبع'); await radio('ساختار'); }, canvas: async () => { await home(); await nav('منبع حقیقت', 'منبع'); await radio('نمای کلی'); await page.getByTestId('canvas-stage').waitFor(); }, thinkingCanvas: async () => { await home(); await nav('فکر', 'فکر'); await radio('بوم'); await page.getByTestId('canvas-stage').waitFor(); } };
    const label = { home: 'خانه', tree: 'درخت (منبع ← ساختار)', canvas: 'بوم (منبع ← نمای کلی)', thinkingCanvas: 'بوم فکر' };
    for (const k of ['home', 'tree', 'canvas', 'thinkingCanvas']) {
      step(`[${width}] قبل از تغییر، شروع از ${label[k]}`);
      await start[k]();
      const t = `قدیم ${k} ${uniq()}`;
      const n = await oldWay(t, k === 'thinkingCanvas');
      assert.ok((await noteTexts()).some((c) => c.includes(t)), 'the old way saved it');
      table.push({ from: `${label[k]} — ${where}`, before: n });
    }
    if (!mobile) {
      step(`[${width}] قبل از تغییر، با پالت: Ctrl+K ← نوشتن «فکر تازه» ← انتخاب ← نوشتن ← ذخیره`);
      await home(); steps = 0;
      await act(() => page.keyboard.press('Control+KeyK'));
      await act(() => page.getByRole('combobox', { name: 'جستجو' }).fill('فکر تازه'));
      await act(() => page.locator('[role=dialog] [role=option]').filter({ hasText: 'فکر تازه' }).first().click());
      await act(() => page.getByRole('dialog').getByLabel('فکرت را بنویس').fill(`پالت ${uniq()}`));
      await act(() => page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).click());
      await page.getByText(/فکر ثبت شد/).waitFor();
      table.push({ from: `پالت (Ctrl+K) — ${where}`, before: steps });
    }

    // ── ب: the NEW way, from the same pages ──
    // phones: the bar's «افزودن» opens what fits the page (a truth on «منبع»); one tap on «فکر» switches, the text kept
    const open = async () => {
      if (!mobile) return act(() => page.keyboard.press('Control+KeyJ'));
      await act(() => page.getByTestId('quick-capture-fab').click());
      const thought = page.getByRole('dialog', { name: 'افزودن' }).getByRole('radio', { name: 'فکر' });
      await thought.waitFor();
      if ((await thought.getAttribute('aria-checked')) !== 'true') await act(() => thought.click());
    };
    const quick = async (text, { save = 'click' } = {}) => {
      const dlg = page.getByRole('dialog', { name: 'افزودن' });
      await act(() => dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(text));
      if (save === 'keys' && !mobile) await act(() => page.keyboard.press('Control+Enter'));
      else await act(() => dlg.getByRole('button', { name: /^افزودن/ }).click());
    };
    for (const k of ['home', 'tree', 'canvas', 'thinkingCanvas']) {
      step(`[${width}] ثبت سریع، شروع از ${label[k]}`);
      await start[k]();
      steps = 0;
      await open();
      const dlg = page.getByRole('dialog', { name: 'افزودن' });
      await dlg.waitFor();
      assert.equal(await dlg.getByLabel('کجا برود؟ (اختیاری)').inputValue(), '', 'at the top level no section is preselected: it goes to «تازه‌ها»');
      const t = `سریع ${k} ${uniq()}`;
      await quick(t);
      await page.waitForFunction(() => document.body.innerText.includes('۱ مورد ثبت شد'));
      const url = page.url();
      assert.ok((await noteTexts()).some((c) => c.includes(t)), 'saved through the existing thought path');
      const note = (await state()).notes.find((c) => c.content.includes(t));
      const st = await state();
      const rootId = st.nodes.find((n) => !n.parentId).id;
      assert.equal(note.nodeId, rootId, 'no place chosen → the default (top) section, shown in «تازه‌ها» until she places it');
      assert.ok((await state()).thoughts.some((x) => x.text.includes(t) && x.status === 'open'), 'a Thought was made');
      table.push({ from: `${label[k]} — ${where}`, after: steps });
      // on «منبع» the phone bar's «افزودن» opens a truth (the page's own thing), so a thought there costs one tap on «فکر»
      const cap = mobile && (k === 'tree' || k === 'canvas') ? 4 : 3;
      assert.ok(steps <= cap, `quick capture takes at most ${cap} steps (${steps})`);
      assert.equal(page.url(), url, 'she did not leave the page');
      // continuous: the dialog is still open, the box is empty and focused: the next item is write + save
      assert.equal(await dlg.getByLabel('چه چیزی به ذهنت رسید؟').inputValue(), '');
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'focus returned to the box');
      if (k === 'home') {
        steps = 0;
        const t2 = `سریع دوم ${uniq()}`;
        await quick(t2, { save: 'keys' });
        await page.waitForFunction(() => document.body.innerText.includes('۲ مورد ثبت شد'));
        table.push({ from: `مورد دوم پشت سر هم — ${where}`, after: steps });
        assert.equal(steps, 2);
        await shot('1-continuous');
      }
      await act(() => dlg.getByRole('button', { name: 'تمام' }).click());
    }

    step(`[${width}] متن بلند و نامرتب: همان‌طور که هست یک فکر می‌شود؛ «هر خط یک فکر» جدا می‌کند`);
    await home();
    await open();
    let dlg = page.getByRole('dialog', { name: 'افزودن' });
    const long = Array.from({ length: 12 }, (_, i) => `خط ${i + 1} از متن بلند ${width}`).join('\n') + '\n\n   ```نامرتب```  ';
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(long);
    await dlg.getByRole('button', { name: /^افزودن$/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('۱ مورد ثبت شد'));
    assert.ok((await state()).notes.some((n) => n.content.includes(`خط 12 از متن بلند ${width}`)), 'nothing of a long text is lost');
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(`الف ${width}\nب ${width}\nج ${width}`);
    await dlg.getByLabel('هر خط یک فکر جدا').check();
    await shot('2-per-line');
    const before = (await state()).thoughts.length;
    await dlg.getByRole('button', { name: /^افزودن ۳ فکر$/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('۴ مورد ثبت شد'));
    assert.equal((await state()).thoughts.length - before, 3, 'three lines → three thoughts');

    step(`[${width}] Shift+Enter خط تازه در همان فکر است؛ Esc پیش‌نویس را نگه می‌دارد`);
    if (!mobile) {
      const box = dlg.getByLabel('چه چیزی به ذهنت رسید؟');
      await box.fill('');
      await box.pressSequentially('اول');
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(120); // the caret is placed on the next frame; a person cannot type faster than that
      await box.pressSequentially('دوم');
      assert.equal(await box.inputValue(), 'اول\n  دوم', 'Shift+Enter writes a continuation line');
    }
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(`پیش‌نویس ${width}`);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'افزودن' }).waitFor({ state: 'detached' });
    await open();
    dlg = page.getByRole('dialog', { name: 'افزودن' });
    assert.equal(await dlg.getByLabel('چه چیزی به ذهنت رسید؟').inputValue(), `پیش‌نویس ${width}`, 'the unsent draft came back');
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill('');

    step(`[${width}] تکراریِ دقیقاً یکسان (نرمال‌سازی فارسی) هشدار می‌دهد، ثبت را نمی‌بندد؛ لایهٔ هوش خاموش = هیچ اثری`);
    const dupText = `قيمت اشتراك را بالا ببريم ${width}`;
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(dupText);
    await dlg.getByRole('button', { name: /^افزودن$/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('مورد ثبت شد'));
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(`قیمت اشتراک را بالا ببریم ${width}`);
    await dlg.getByText('تکراری است').waitFor();
    await shot('3-duplicate');
    assert.equal(await dlg.getByTestId('quick-capture-place').count(), 0, 'no «place» trace while the intelligence layer is off');
    assert.equal(await dlg.getByTestId('quick-capture-maybe-dup').count(), 0, 'no «maybe duplicate» trace while the intelligence layer is off');
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(`قیمت اشتراک را کمی بالا ببریم ${width}`);
    assert.equal(await dlg.getByText('تکراری است').count(), 0, 'similar is not identical');
    await dlg.getByRole('button', { name: 'تمام' }).click();

    step(`[${width}] داخل یک بخش: همان بخش پیش‌فرض است`);
    await home();
    await nav('منبع حقیقت', 'منبع');
    await radio('ساختار');
    const nodeBtn = page.locator('[data-node-id], [data-testid^="node-"]').first();
    const st0 = await state();
    const nodeId = st0.nodes.find((n) => n.parentId && n.id !== st0.nodes.find((x) => !x.parentId).id).id;
    await page.evaluate((id) => { window.location.hash = `#node=${id}`; window.dispatchEvent(new PopStateEvent('popstate')); }, nodeId);
    await page.waitForTimeout(400);
    await open();
    dlg = page.getByRole('dialog', { name: 'افزودن' });
    assert.equal(await dlg.getByLabel('کجا برود؟ (اختیاری)').inputValue(), nodeId, 'inside a section, that section is the default');
    await shot('4-in-section');
    const t3 = `داخل بخش ${uniq()}`;
    await dlg.getByLabel('چه چیزی به ذهنت رسید؟').fill(t3);
    await dlg.getByRole('button', { name: /^افزودن$/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('مورد ثبت شد'));
    assert.equal((await state()).notes.find((n) => n.content.includes(t3)).nodeId, nodeId);
    void nodeBtn;
    await dlg.getByRole('button', { name: 'تمام' }).click();

    if (mobile) {
      step('[390] «ثبت» در خود ناوبری پایین: هدف لمسی ۴۴px و هیچ چیز روی صفحه شناور نیست');
      await home();
      const fab = page.getByTestId('quick-capture-fab');
      const b = await fab.boundingBox();
      const nb = await page.locator('nav[aria-label="منوی پایینی موبایل"]').boundingBox();
      assert.ok(b && b.width >= 44 && b.height >= 44, 'touch target');
      assert.ok(b.y >= nb.y && b.y + b.height <= nb.y + nb.height, 'inside the bottom navigation');
      await shot('0-fab');
    } else {
      assert.equal(await page.getByTestId('quick-capture-fab').isVisible(), false, 'the bottom-bar capture is for phones only');
    }
    assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
  }

  console.log('\n| از کجا | قبل (قدم) | بعد (قدم) |\n| --- | --- | --- |');
  const rows = new Map();
  for (const r of table) { const x = rows.get(r.from) ?? {}; rows.set(r.from, { ...x, ...r }); }
  for (const [from, r] of rows) console.log(`| ${from} | ${r.before ?? '—'} | ${r.after ?? '—'} |`);
  console.log('\nquick-capture scenario OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
