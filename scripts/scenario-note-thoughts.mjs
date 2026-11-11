#!/usr/bin/env node
/**
 * «یادداشت و فکرها» on a REAL server + temp SQLite (docs/spine.md → یادداشت ↔ فکر), walkthroughs ب و ج in the browser:
 *   ب  delete a note that holds two open thoughts: the dialog says so; by default they stay («یادداشتش حذف شد»); with the tick they go
 *   ج  a converted thought → archive → permanent delete: the dialog lists the thought that says the same words; afterwards no trace
 * Screenshots → docs/screens/note-thoughts-*.png
 *   CHROMIUM_PATH=... WIDTHS=1280,390 node scripts/scenario-note-thoughts.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-notes-'));
let BASE = '';
const children = [];
const stopAll = () => { for (const c of children.splice(0)) { if (process.platform === 'win32') { try { spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } else { try { process.kill(-c.pid); } catch { /* gone */ } } } };
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true, shell: process.platform === 'win32' }));
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const step = (m) => console.log('•', m);
const until = async (fn) => { for (let i = 0; i < 30; i++) { if (await fn()) return true; await wait(200); } return false; };

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of (process.env.WIDTHS ?? '1280,390').split(',').map(Number)) {
    const mobile = width < 768;
    const tag = `note-thoughts-${width}`;
    await startServer(3200 + Math.floor(Math.random() * 600) * 2 + (mobile ? 1 : 0), tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const click = (loc) => loc.evaluate((n) => n.click());
    const account = async (name) => {
      // spaces (and what acts on one) live in the space picker at the head of the bar; the rest in the account menu
      const inSpace = !/حساب و داده|پلن و ارتقا|مصرف|امکانات|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      const label = name === 'فضای کاری تازه' ? 'فضای تازه…' : name;
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); return; }
      if (page.viewportSize().width < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: label }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: label }).first().click(); }
    };
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('فضای کاری تازه');
    await page.getByRole('radio', { name: 'کار یا کسب‌وکار' }).click(); await page.getByLabel('نام فضا', { exact: true }).fill(`یادداشت ${width}`);
    await page.getByRole('button', { name: 'ساختن فضا' }).click();
    await page.getByText(`خانه: یادداشت ${width}`).waitFor({ timeout: 10000 });
    const wid = (await call('GET', '/workspaces')).workspaces.find((w) => w.name === `یادداشت ${width}`).id;
    const state = () => call('GET', `/workspaces/${wid}/state`);
    const root = (await state()).nodes.find((n) => !n.parentId).id;
    const nav = (m, d) => click(page.locator(mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`));
    const enter = async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText(/^خانه: /).waitFor();
      if (!(await page.getByText(`خانه: یادداشت ${width}`).count())) await account(`یادداشت ${width}`);
      await page.getByText(`خانه: یادداشت ${width}`).waitFor({ timeout: 10000 });
    };

    // ── ب
    step(`[${width}] ب: delete a note with two open thoughts`);
    const note = (await call('POST', `/workspaces/${wid}/notes`, { nodeId: root, content: '[ایده] قیمت اشتراک ماهانه\n[سؤال] ارسال چطور باشد؟' })).note;
    await enter();
    await nav('منبع', 'منبع حقیقت');
    await page.waitForTimeout(1200);
    if (process.env.DEBUG_NOTE) { await shot('dbg'); console.log((await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 700)); }
    await click(page.getByRole('button', { name: /^یادداشت‌ها/ }).first());
    await page.getByLabel('حذف یادداشت').first().waitFor({ timeout: 15000 });
    await click(page.getByLabel('حذف یادداشت').first());
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ');
    console.log('   dialog:', text.slice(0, 160));
    assert.match(text, /۲ فکر باز دارد/);
    assert.match(text, /می‌مانند/);
    await shot('1-delete-dialog');
    assert.equal((await dlg.getByRole('checkbox').isChecked()), false, 'the default is: the thoughts stay');
    await dlg.getByRole('button', { name: 'حذف یادداشت' }).click();
    assert.ok(await until(async () => !(await state()).notes.some((n) => n.id === note.id)), 'the note is gone');
    const left = (await state()).thoughts.filter((t) => t.status === 'open');
    assert.equal(left.length, 2, 'both thoughts stayed');
    assert.ok(left.every((t) => t.sourceState === 'note_deleted'));
    await page.getByText(/فکر باز مانده است/).first().waitFor({ timeout: 5000 });
    await shot('2-toast');
    // the thinking space says where they came from
    await nav('فکر', 'فکر');
    await page.waitForTimeout(800);
    if (process.env.DEBUG_NOTE) await shot('dbg2');
    await page.getByText('یادداشتش حذف شد؛ فکر می‌ماند').first().waitFor({ timeout: 8000 });
    await shot('3-thinking-list');

    // ── ج
    step(`[${width}] ج: a thought becomes knowledge, is archived and erased for good`);
    const SECRET = 'شماره کارت ۶۰۳۷-۹۹۷۱-۲۳۴۵-۶۷۸۹ محرمانه';
    const n2 = (await call('POST', `/workspaces/${wid}/notes`, { nodeId: root, content: `[فرض] ${SECRET}` })).note;
    const th = (await state()).thoughts.find((t) => t.sourceNoteId === n2.id);
    const obj = (await call('POST', `/workspaces/${wid}/objects`, { workspaceId: wid, type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'کارت من', content: SECRET, nodeId: root, source: { kind: 'note', thoughtId: th.id, at: new Date().toISOString() } })).object;
    await call('PATCH', `/workspaces/${wid}/objects/${obj.id}`, { status: 'Archived' });
    const impact = (await call('GET', `/workspaces/${wid}/objects/${obj.id}/purge-impact`)).impact;
    assert.deepEqual(impact.copies.thoughts.map((t) => t.id), [th.id], 'the thought that says the same words is listed');
    assert.ok(!JSON.stringify(impact).includes('6037'), 'the impact never repeats the text');
    const r = await call('DELETE', `/workspaces/${wid}/objects/${obj.id}/permanent`, { confirm: true, copies: { notes: [n2.id], thoughts: [th.id] } });
    assert.equal(r.scrubbed.thoughts, 1);
    const all = JSON.stringify(await state());
    assert.ok(!all.includes('6037'), 'no trace of the text in anything the app can read');
    assert.ok(!all.includes(th.id), 'not even the thought');
    await enter();
    assert.deepEqual(errors, [], 'no page errors');
    step(`[${width}] ok`);
    stopAll();
  }
  console.log('✓ note-thoughts scenario passed');
} finally {
  await browser?.close();
  stopAll();
}
