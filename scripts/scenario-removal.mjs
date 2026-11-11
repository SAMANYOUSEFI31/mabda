#!/usr/bin/env node
/**
 * «مدل حذف» on a REAL server + temp SQLite: (الف) a card number pasted by mistake is erased for good — no trace in ANY table;
 * (ب) a section with two sub-sections is deleted, then undone; (ج) the showcase is wiped with one confirm; (د) «حذف همهٔ داده‌ها».
 * Screenshots → docs/screens/removal-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-removal-'));
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
    const tag = mobile ? 'removal-m' : 'removal';
    await startServer(mobile ? 3162 : 3161, tag);
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
    await page.getByLabel('نام فضای کاری یا نام برند').fill(`حذف ${width}`);
    await page.getByRole('button', { name: 'ایجاد فضای کاری' }).click();
    await page.getByText(`خانه: حذف ${width}`).waitFor({ timeout: 8000 });
    const wid = (await call('GET', '/workspaces')).workspaces.find((w) => w.name === `حذف ${width}`).id;
    const state = () => call('GET', `/workspaces/${wid}/state`);
    const reselect = async () => { await page.reload({ waitUntil: 'networkidle' }); await account(`حذف ${width}`); await page.getByText(`خانه: حذف ${width}`).waitFor(); };
    const nodes0 = (await state()).nodes;
    const product = nodes0.find((n) => n.label === 'محصول و خدمت');

    step(`[${width}] الف: a card number pasted by mistake — archive it, then erase it for good; no trace in any table`);
    const CARD = '۶۰۳۷-۹۹۷۱-۲۳۴۵-۶۷۸۹';
    const obj = (await call('POST', `/workspaces/${wid}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'شمارهٔ کارت اشتباهی', content: `شمارهٔ کارت من ${CARD} است.`, nodeId: product.id })).object;
    await call('PATCH', `/workspaces/${wid}/objects/${obj.id}`, { content: `شمارهٔ کارت من ${CARD} است (ویرایش).`, reason: 'اصلاح' });
    await call('POST', `/workspaces/${wid}/notes`, { nodeId: product.id, content: `یادداشت\nکارت ${CARD} را اشتباهی نوشتم\nخط بی‌خطر` });
    await reselect();
    await nav('منبع حقیقت', 'منبع');
    await radio('ساختار');
    await page.getByRole('button', { name: 'شمارهٔ کارت اشتباهی' }).first().click().catch(async () => { await page.getByText('شمارهٔ کارت اشتباهی').first().click(); });
    const detail = page.getByRole('dialog').last();
    await detail.getByRole('button', { name: 'بایگانی' }).click();
    await page.getByRole('button', { name: 'برگرداندن' }).first().waitFor();
    assert.equal((await state()).objects.find((o) => o.id === obj.id).status, 'Archived', 'archived first: nothing is erased by one click');
    await palette('بایگانی', 'رفتن به بایگانی');
    const arch = page.getByRole('dialog').last();
    await arch.getByTestId('archive-knowledge').getByRole('button', { name: /حذف دائمی/ }).click();
    const purge = page.getByRole('alertdialog');
    await purge.getByTestId('purge-effects').waitFor();
    assert.match(await purge.getByTestId('purge-effects').innerText(), /نسخه و .* ردّ تغییر/);
    await purge.getByTestId('purge-copies').waitFor();
    assert.ok(await purge.getByRole('checkbox', { name: /خط‌های یادداشتِ بخش/ }).isChecked(), 'the note that says the same is found (digits typed in another script) and ticked');
    await shot('1-purge-step1');
    await purge.getByRole('button', { name: 'ادامه' }).click();
    assert.equal(await purge.getByRole('button', { name: 'حذف دائمی' }).isDisabled(), true, 'the last step needs a tick');
    await purge.getByRole('checkbox', { name: 'می‌فهمم که این کار برنمی‌گردد' }).evaluate((n) => n.click());
    await shot('2-purge-step2');
    await purge.getByRole('button', { name: 'حذف دائمی' }).click();
    await page.getByText('برای همیشه حذف شد.').first().waitFor();
    await page.waitForTimeout(500);
    const db = new Database(join(dir, `${tag}.sqlite`), { readonly: true });
    const all = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => `${t.name}\n${db.prepare(`SELECT * FROM ${t.name}`).all().map((r) => JSON.stringify(r)).join('\n')}`).join('\n');
    db.close();
    for (const needle of ['6037', '۶۰۳۷', 'شمارهٔ کارت اشتباهی', 'ویرایش']) assert.ok(!all.includes(needle), `no trace of «${needle}» in any table of the database file`);
    assert.ok(all.includes('خط بی‌خطر'), 'what was not the secret stayed');
    await page.keyboard.press('Escape').catch(() => {});

    step(`[${width}] ب: «کارگاه» with two sub-sections is deleted — the tree after is shown first — then she changes her mind`);
    const ws1 = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: product.id, label: 'کارگاه' })).node;
    const sub1 = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: ws1.id, label: 'برنامهٔ جلسه‌ها' })).node;
    const sub2 = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: ws1.id, label: 'قیمت کارگاه' })).node;
    await call('POST', `/workspaces/${wid}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'سرفصل جلسه', content: 'سه جلسه', nodeId: sub1.id });
    await call('POST', `/workspaces/${wid}/objects`, { type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: 'خط قرمز فقط کارگاه', content: 'تخفیف گروهی نداریم', nodeId: ws1.id, reach: 'position' });
    await reselect();
    await nav('منبع حقیقت', 'منبع');
    await radio('ساختار');
    await page.getByRole('button', { name: 'عملیات گرهٔ کارگاه' }).click();
    await page.getByRole('menuitem', { name: 'حذف' }).click();
    const dd = page.getByRole('dialog').last();
    await dd.getByTestId('node-delete').waitFor();
    await dd.getByRole('button', { name: 'ساختار بعد از حذف' }).click();
    await dd.getByTestId('node-delete-tree').waitFor();
    assert.match(await dd.getByTestId('node-delete-tree').innerText(), /می‌رود زیر «محصول و خدمت»/, 'the sub-sections come up under the parent — said before it happens');
    assert.match(await dd.getByTestId('node-delete-effect').innerText(), /خط قرمز فقط کارگاه/, 'what no longer reaches whom is said');
    await shot('3-node-delete');
    await dd.getByRole('button', { name: 'حذف و بردن محتوا' }).click();
    await page.getByText(/«کارگاه» حذف شد/).first().waitFor();
    assert.ok(!(await state()).nodes.some((n) => n.id === ws1.id), 'it is gone');
    assert.equal((await state()).nodes.find((n) => n.id === sub1.id).parentId, product.id);
    await page.getByRole('button', { name: 'برگرداندن' }).first().click();
    await page.getByText('برگشت؛ همه‌چیز همان‌طور که بود.').first().waitFor();
    const after = await state();
    assert.equal(after.nodes.find((n) => n.id === ws1.id)?.parentId, product.id, 'the section is back where it was');
    assert.equal(after.nodes.find((n) => n.id === sub1.id).parentId, ws1.id, 'and so are its sub-sections');
    assert.equal(after.objects.find((o) => o.title === 'خط قرمز فقط کارگاه').nodeId, ws1.id, 'and its rule');
    await shot('4-node-undone');

    step(`[${width}] ج: the showcase is wiped with one confirm`);
    await account('ساخت یا بازنشانی فضای نمونه');
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor({ timeout: 15000 });
    await account('پاک کردن فضای نمونه');
    const dc = page.getByRole('alertdialog');
    await dc.getByRole('button', { name: 'پاک کن' }).click();
    await page.getByText('فضای نمونه پاک شد.').first().waitFor();
    assert.ok(!(await call('GET', '/workspaces')).workspaces.some((w) => w.isDemo), 'the showcase is gone');
    await shot('5-demo-gone');

    step(`[${width}] د: «حذف همهٔ داده‌ها» — typed words, then the install is really empty`);
    await account('حساب و داده‌ها');
    await page.getByRole('dialog').getByRole('button', { name: /^حذف همهٔ داده‌ها/ }).click();
    const wipe = page.getByRole('alertdialog');
    assert.equal(await wipe.getByRole('button', { name: 'حذف همهٔ داده‌ها' }).isDisabled(), true, 'nothing happens without the words');
    await wipe.getByLabel('عبارت تأیید').fill('حذف همهٔ داده‌ها');
    await shot('6-wipe-confirm');
    await wipe.getByRole('button', { name: 'حذف همهٔ داده‌ها' }).click();
    await page.getByTestId('first-run').waitFor();
    assert.deepEqual((await call('GET', '/workspaces')).workspaces, [], 'the server holds no workspace');
    const db2 = new Database(join(dir, `${tag}.sqlite`), { readonly: true });
    const left = db2.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('schema_migrations','kv')").all().map((t) => [t.name, db2.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n]).filter(([, n]) => n > 0);
    db2.close();
    assert.deepEqual(left, [], 'every table is empty');
    await shot('7-first-run');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('first-run').waitFor();
    assert.deepEqual((await call('GET', '/workspaces')).workspaces, [], 'a restart does not bring a sample back behind her back');

    assert.deepEqual(errors, []);
    await page.context().close();
  }
  console.log('== removal: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
