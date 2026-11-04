#!/usr/bin/env node
/**
 * The audit scenarios on the showcase workspace (REAL server + temp SQLite), the four cognitive walkthroughs:
 *   الف «قیمت اشتراک چه تغییری کرد و چرا؟»  — the diff, its one-line summary, the newest drafts open, compare two versions
 *   ب «یک فکر خام دربارهٔ گرهٔ ارسال بنویس» — in the structure view, no other view needed
 *   ج «دانشی ثبت کن که به خط قرمز تخفیف تکیه دارد» — in the record dialog («بیشتر»), both directions, with search
 *   د «در بوم ببین چه چیزی به لحن پاسخ وابسته است» — the inspector says it; lines: halos in their own layer, below every line
 * Screenshots → docs/screens/explore-*.png (1280) and explore-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-explore.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-explore-'));
const PORT = 3125;
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
    const tag = mobile ? 'explore-m' : 'explore';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}-${width}.png` });
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).evaluate((n) => n.click()); };
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click());

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('ساخت یا بازنشانی فضای نمونه');
    await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 1500 }).catch(() => {});
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
    const objs = (await api('/workspaces/ws_demo/state')).objects;

    step(`[${width}] الف: «قیمت اشتراک چه تغییری کرد و چرا؟» — the card → «نسخه‌ها»: a one-line summary above the before/after, the newest drafts open, any two versions comparable`);
    await nav('منبع حقیقت', 'منبع');
    await page.getByRole('heading', { name: 'قیمت اشتراک ماهانه' }).first().waitFor();
    const dlg = page.getByRole('dialog');
    // the showcase has two cards with this title (they contradict each other): the one that was rewritten has the diff
    let found = false;
    for (let i = 0; i < 2 && !found; i++) {
      await page.getByText('قیمت اشتراک ماهانه', { exact: true }).nth(i).click();
      await dlg.getByRole('tab', { name: /^نسخه‌ها/ }).click();
      found = await dlg.getByTestId('diff-summary').first().waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (!found) await page.keyboard.press('Escape');
    }
    assert.ok(found, 'a rewritten price card shows its diff');
    assert.match(await dlg.getByTestId('diff-summary').first().innerText(), /کلمه (حذف|اضافه)/, 'one plain line says how much changed');
    await shot('1-history');
    await dlg.getByRole('button', { name: 'مقایسهٔ دو نسخه' }).click();
    await dlg.getByTestId('compare-versions').waitFor();
    await shot('2-compare');
    assert.ok((await dlg.getByTestId('compare-versions').getByTestId('diff-summary').count()) >= 1, 'two versions compared with a summary');
    await page.keyboard.press('Escape');

    step(`[${width}] ب: «یک فکر خام دربارهٔ گرهٔ ارسال» — in the structure view, one calm invitation in the node itself`);
    const ship = page.locator('section', { has: page.getByRole('heading', { name: 'ارسال و بسته‌بندی' }) }).last();
    await ship.scrollIntoViewIfNeeded();
    // the node's calm invitation opens «فکر تازه» for THIS node; if the node already has thoughts, its counter opens the space and the box is the button there
    assert.ok(await ship.getByRole('button', { name: /فایل یا متنی داری/ }).count() >= 1, 'a file can be added to this node from the node');
    const invite = ship.getByRole('button', { name: 'فکر خامی داری؟ بنویس' });
    if (await invite.count()) await invite.click(); else { await ship.getByTestId('open-thoughts').click(); await page.getByRole('button', { name: 'فکر تازه' }).first().click(); }
    await page.getByRole('dialog').getByLabel('فکرت را بنویس').fill('اگر ارسال را روز پنجشنبه ثابت کنیم شکایت‌ها کم می‌شود؟');
    await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).click();
    await page.waitForTimeout(600);
    assert.ok((await api('/workspaces/ws_demo/state')).notes.some((n) => n.content.includes('پنجشنبه')), 'the note is saved');
    await shot('3-raw-thought');
    await nav('منبع حقیقت', 'منبع');

    step(`[${width}] ج: «دانشی ثبت کن که به خط قرمز تخفیف تکیه دارد» — «بیشتر» has both directions, with search; saved as depends_on`);
    await page.getByRole('button', { name: /^(ثبت دانش|افزودن دانش)$/ }).first().click();
    const rec = page.getByRole('dialog');
    await rec.getByLabel('چه چیزی دربارهٔ کسب‌وکارت درست است؟').fill('جشنوارهٔ پاییز را با هدیه برگزار می‌کنیم، نه با کاهش قیمت.');
    await rec.getByRole('button', { name: 'بیشتر' }).click();
    const rel = rec.getByTestId('relations');
    await rel.waitFor();
    await rel.getByRole('group', { name: 'بر چه تکیه دارد؟' }).getByLabel('جستجوی دانش').fill('تخفیف');
    await rel.getByRole('group', { name: 'بر چه تکیه دارد؟' }).getByRole('button', { name: 'افزودن' }).first().click();
    await rel.getByRole('group', { name: 'روی چه اثر دارد؟' }).getByLabel('جستجوی دانش').fill('لحن');
    await rel.getByRole('group', { name: 'روی چه اثر دارد؟' }).getByRole('button', { name: 'افزودن' }).first().click();
    await shot('4-relations');
    await rec.getByRole('button', { name: 'ذخیره' }).first().click();
    await page.waitForTimeout(1200);
    const st = await api('/workspaces/ws_demo/state');
    const mine = st.objects.find((o) => o.content.includes('جشنوارهٔ پاییز را با هدیه'));
    assert.ok(mine, 'saved');
    const nodiscount = objs.find((o) => o.id === 'dm_nodiscount'), tone = objs.find((o) => o.id === 'dm_tone');
    assert.ok(st.relationships.some((r) => r.type === 'depends_on' && r.sourceId === mine.id && r.targetId === nodiscount.id), 'this rests on the no-discount rule');
    assert.ok(st.relationships.some((r) => r.type === 'depends_on' && r.sourceId === tone.id && r.targetId === mine.id), 'the tone decision now rests on this (it affects it)');
    assert.equal(st.relationships.filter((r) => !['depends_on', 'supersedes', 'overrides'].includes(r.type)).length, 0, 'no new kind of relation');

    step(`[${width}] د: «در بوم ببین چه چیزی به لحن پاسخ وابسته است» — the card, the inspector sentence, lines in two layers`);
    await nav('منبع حقیقت', 'منبع');
    await radio('بوم');
    await page.getByTestId('canvas-stage').waitFor();
    await page.getByTestId('canvas-toolbar').getByRole('textbox', { name: 'جستجوی کارت' }).fill('لحن پاسخ');
    await page.keyboard.press('Enter');
    await page.getByTestId('inspector-object').waitFor();
    assert.match(await page.getByTestId('inspector-summary').innerText(), /چیز/, 'the inspector says how many things are tied to it');
    await page.getByTestId('canvas-inspector').getByRole('button', { name: /^چه چیزی روی آن سوار است|^به چه چیزی وابسته است/ }).first().click();
    const layers = await page.locator('[data-testid=canvas-edges] > g[data-layer]').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-layer')));
    assert.deepEqual(layers, ['halo', 'line', 'hit'], 'halos are below every line');
    await page.waitForTimeout(300);
    await shot('5-canvas');
    assert.deepEqual(errors, []);
  }
  console.log('== explore: OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
