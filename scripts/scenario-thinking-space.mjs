#!/usr/bin/env node
/**
 * «فکر جدا از حقیقت» on a REAL server + temp SQLite, in an EMPTY workspace (not the showcase), the six walkthroughs:
 *   الف an idea and a question about the price, with no syntax      ب the thinking space: a question → knowledge → approved → it is in the truth
 *   ج a section becomes a main section: what stops reaching it is said first     د the quick start says what it built
 *   ه edit an approved price WITHOUT approving: the request for an AI still carries the approved price    و the truth map: a suggestion only with «نشان بده چه در راه است»
 * Screenshots → docs/screens/space-*.png
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-thinking-space.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-space-'));
let BASE = '';
const children = [];
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'space-m' : 'space';
    await startServer(mobile ? 3132 : 3131, tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}-${width}.png` });
    const account = async (name) => {
      // spaces (and what acts on one) live in the space picker at the head of the bar; the rest in the account menu
      const inSpace = !/حساب و داده|پلن و ارتقا|مصرف|امکانات|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      const label = name === 'فضای کاری تازه' ? 'فضای تازه…' : name;
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); return; }
      if (page.viewportSize().width < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: label }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: label }).first().click(); }
    };
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).evaluate((n) => n.click()); };
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click());
    /** the command palette: Ctrl/⌘+K on desktop, the header button on phones */
    const palette = async (q, hit) => {
      if (mobile) await page.getByRole('button', { name: 'جستجو' }).first().click(); else await page.keyboard.press('Control+KeyK');
      await page.getByRole('combobox', { name: 'جستجو' }).fill(q);
      await page.locator('[role=dialog] [role=option]').filter({ hasText: hit }).first().click();
    };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('فضای کاری تازه');
    await page.getByLabel('نام فضای کاری یا نام برند').fill(`فکر ${width}`);
    await page.getByRole('button', { name: 'ایجاد فضای کاری' }).click();
    await page.getByText(`خانه: فکر ${width}`).waitFor({ timeout: 8000 });
    const wid = (await call('GET', '/workspaces')).workspaces.find((w) => w.name === `فکر ${width}`).id;
    const state = () => call('GET', `/workspaces/${wid}/state`);

    step(`[${width}] الف: an idea and a question about the price — a box and a chip, no syntax; the question mark makes a question`);
    await palette('فکر تازه', 'فکر تازه');
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('فکرت را بنویس').fill('قیمت اشتراک سه‌ماهه چقدر باشد؟');
    assert.equal(await dlg.getByRole('radio', { name: 'سؤال' }).getAttribute('aria-checked'), 'true', 'the question mark chose «سؤال»');
    await shot('1-thought');
    await dlg.getByRole('button', { name: 'ذخیره' }).click();
    await page.getByText(/فکر ثبت شد/).waitFor();
    await palette('فکر تازه', 'فکر تازه');
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('فکرت را بنویس').fill('یک بستهٔ هدیه با قیمت ثابت');
    assert.equal(await dlg.getByRole('radio', { name: 'ایده' }).getAttribute('aria-checked'), 'true');
    await dlg.getByRole('button', { name: 'ذخیره' }).click();
    await page.waitForTimeout(500);
    const notes = (await state()).notes.map((n) => n.content);
    assert.ok(notes.includes('[سؤال] قیمت اشتراک سه‌ماهه چقدر باشد؟') && notes.includes('[ایده] یک بستهٔ هدیه با قیمت ثابت'), `the markers were written for her: ${JSON.stringify(notes)}`);
    assert.equal((await state()).objects.length, 0, 'a thought is never knowledge');

    step(`[${width}] ب: the thinking space → the question to knowledge (a prefilled form) → suggested → approved → it is in the truth`);
    await palette('فضای فکر', 'رفتن به فکر');
    const space = page.getByTestId('thinking-space');
    await space.waitFor();
    await space.getByText('قیمت اشتراک سه‌ماهه چقدر باشد؟').first().waitFor();
    await space.getByText('یک بستهٔ هدیه با قیمت ثابت').first().waitFor();
    await shot('2-space');
    await space.getByRole('radio', { name: /^سؤال/ }).click();
    assert.equal(await space.getByText('یک بستهٔ هدیه با قیمت ثابت').count(), 0, 'the filter shows only questions');
    await space.getByRole('radio', { name: /^همه/ }).click();
    await space.locator('li', { hasText: 'قیمت اشتراک سه‌ماهه چقدر' }).getByRole('button', { name: 'به دانش ببر' }).click();
    const form = page.getByRole('dialog');
    assert.equal(await form.getByLabel('چه چیزی دربارهٔ کسب‌وکارت درست است؟').inputValue(), 'قیمت اشتراک سه‌ماهه چقدر باشد؟', 'the text is prefilled');
    await form.getByLabel('چه چیزی دربارهٔ کسب‌وکارت درست است؟').fill('قیمت اشتراک سه‌ماهه ۱٫۱ میلیون تومان است.');
    await form.getByRole('button', { name: 'ذخیره' }).first().click();
    await page.waitForTimeout(700);
    let objs = (await state()).objects;
    assert.equal(objs.length, 1);
    assert.deepEqual([objs[0].status, objs[0].source?.kind], ['Proposed', 'note'], 'proposed, and the line it came from is remembered');
    await space.getByText('منتظر تصمیم تو').first().waitFor();
    await shot('3-waiting');
    await space.getByRole('button', { name: 'تأیید', exact: true }).first().click();
    await page.waitForTimeout(700);
    objs = (await state()).objects;
    assert.equal(objs[0].status, 'Confirmed');
    await nav('منبع حقیقت', 'منبع');
    await radio('ساختار');
    await page.getByText('قیمت اشتراک سه‌ماهه ۱٫۱ میلیون تومان است.').first().waitFor();
    assert.equal(await page.getByTestId('open-thoughts').count() >= 1, true, 'the node says «N فکر باز» (the idea is still open)');

    step(`[${width}] ه: edit an APPROVED price without approving: it stays a draft and the request for an AI still carries the approved price`);
    await page.getByText('قیمت اشتراک سه‌ماهه ۱٫۱ میلیون تومان است.').first().click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('چه چیزی دربارهٔ کسب‌وکارت درست است؟').fill('قیمت اشتراک سه‌ماهه ۱٫۴ میلیون تومان است.');
    await edit.getByTestId('draft-choice').waitFor();
    assert.equal(await edit.getByRole('radio', { name: 'پیش‌نویس بماند' }).getAttribute('aria-checked'), 'true', 'the safe choice is the default');
    await shot('4-draft-choice');
    await edit.getByRole('button', { name: 'ذخیره' }).first().click();
    await page.getByText(/پیش‌نویس ذخیره شد/).waitFor();
    objs = (await state()).objects;
    assert.deepEqual([objs[0].content, objs[0].draft?.content], ['قیمت اشتراک سه‌ماهه ۱٫۱ میلیون تومان است.', 'قیمت اشتراک سه‌ماهه ۱٫۴ میلیون تومان است.']);
    await palette('آماده‌سازی درخواست', 'آماده‌سازی درخواست');
    await page.getByRole('dialog').getByLabel('درخواستت را در یک خط بنویس').fill('قیمت اشتراک چقدر است؟');
    await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] textarea[readonly]')].some((t) => t.value.includes('۱٫۱ میلیون') && !t.value.includes('۱٫۴ میلیون')), null, { timeout: 15000 });
    await shot('5-request-approved-price');
    await page.keyboard.press('Escape');
    await palette('فضای فکر', 'رفتن به فکر');
    await page.getByTestId('thinking-space').getByText('۱ تغییر در انتظار تأیید').waitFor();
    await page.getByTestId('thinking-space').getByRole('button', { name: 'تأیید و جایگزین کن' }).click();
    await page.waitForTimeout(700);
    assert.equal((await state()).objects[0].content, 'قیمت اشتراک سه‌ماهه ۱٫۴ میلیون تومان است.', 'approved: it replaced the text');

    step(`[${width}] ج: a section becomes a main section — what stops reaching it is said BEFORE the move`);
    const ws = await state();
    const offer = ws.nodes.find((n) => n.label === 'آفر و قیمت‌گذاری');
    const w = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: offer.id, label: 'کارگاه' })).node;
    await call('POST', `/workspaces/${wid}/objects`, { type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: 'بدون تخفیف آفر', content: 'در آفر هیچ تخفیفی نمی‌دهیم.', nodeId: offer.id, reach: 'position' });
    await page.reload({ waitUntil: 'networkidle' });
    await account(`فکر ${width}`);
    await page.getByText(`خانه: فکر ${width}`).waitFor();
    await nav('منبع حقیقت', 'منبع');
    await page.getByRole('button', { name: 'عملیات گرهٔ کارگاه' }).first().evaluate((n) => n.click());
    await page.getByRole('menuitem', { name: 'جابه‌جایی…' }).click();
    await page.getByRole('dialog').getByLabel('کجا برود؟').selectOption({ label: 'سطح اصلی (بخش اصلی)' });
    await page.getByTestId('move-effect').getByText(/«بدون تخفیف آفر»/).waitFor();
    await shot('6-move-effect');
    await page.getByRole('dialog').getByRole('button', { name: 'جابه‌جا کن' }).click();
    await page.waitForTimeout(700);
    assert.equal((await state()).nodes.find((n) => n.id === w.id).parentId, undefined, 'it is a main section now');

    step(`[${width}] و: the truth map has only approved knowledge; «نشان بده چه در راه است» adds suggestions, faint`);
    await call('POST', `/workspaces/${wid}/objects`, { type: 'Decision', status: 'Proposed', provenance: 'User Input', title: 'پیشنهاد آزمایشی', content: 'یک بستهٔ آزمایشی ۲ ماهه', nodeId: offer.id });
    await page.reload({ waitUntil: 'networkidle' });
    await account(`فکر ${width}`);
    await page.getByText(`خانه: فکر ${width}`).waitFor();
    await nav('منبع حقیقت', 'منبع');
    await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click());
    await page.getByTestId('canvas-stage').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-pending]').count(), 0, 'no suggestion on the truth map');
    await page.getByRole('button', { name: /^گزینه‌ها/ }).click();
    await page.getByLabel('نشان بده چه در راه است').check({ force: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    assert.ok(await page.locator('[data-pending]').count() >= 1, 'the suggestion is drawn, faint, with its relations');
    await shot('7-canvas-pending');

    step(`[${width}] د: the quick start says what it built — node by node, approved vs waiting, with «ببین» and the way to the thinking space`);
    await page.mouse.click(5, 300); await page.waitForTimeout(200); await account('شروع سریع');
    await page.getByRole('button', { name: /به چند سؤال کوتاه جواب می‌دهم/ }).click();
    await page.getByLabel('روی چه کاری کار می‌کنی؟').fill('طراحی کمپین محتوا');
    await page.getByLabel('مخاطب اصلی تو کیست؟').fill('کسب‌وکارهای کوچک');
    await page.getByRole('button', { name: 'آماده‌سازی بسته' }).click();
    const made = page.getByTestId('quickstart-made');
    await made.waitFor();
    assert.match(await made.innerText(), /تأییدشده/);
    assert.ok(await made.getByRole('button', { name: 'ببین' }).count() >= 1);
    await shot('8-quickstart-made');
    await page.getByRole('button', { name: 'تمام شد' }).click();

    assert.deepEqual(errors, []);
  }
  console.log('== thinking-space: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
