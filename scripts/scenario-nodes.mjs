#!/usr/bin/env node
/**
 * «کاربر خدماتی است»: on a REAL server + temp SQLite, a new workspace's five nodes are an ordinary start — the user deletes
 * «آفر و قیمت‌گذاری», builds «بسته‌های خدمت», answers the quick-start questions (whose node hints are now gone), makes a
 * second main section and deletes the old root: nothing is locked, nothing is lost, no screen breaks.
 * Screenshots → docs/screens/nodes-*.png (1280) and nodes-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-nodes.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-nodes-'));
let BASE = '';
const children = [];
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const api = async (path) => (await fetch(`${BASE}/api${path}`)).json();
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'nodes-m' : 'nodes';
    await startServer(mobile ? 3128 : 3127, tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}-${width}.png` });
    const account = async (name) => {
      // spaces (and what acts on one) live in the space picker at the head of the bar; the rest in the account menu
      const inSpace = !/حساب و داده|پلن و ارتقا|مصرف|امکانات|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      const label = name === 'فضا تازه' ? 'فضای تازه…' : name;
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); return; }
      if (page.viewportSize().width < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: label }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: label }).first().click(); }
    };
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).evaluate((n) => n.click()); };
    const nodeOp = async (label, item) => { await page.getByRole('button', { name: `عملیات بخش ${label}` }).first().evaluate((n) => n.click()); await page.getByRole('menuitem', { name: item }).click(); };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('فضا تازه');
    await page.getByLabel('نام فضا', { exact: true }).fill(`استودیو ${width}`);
    await page.getByRole('button', { name: 'افزودن فضا' }).click();
    await page.getByText(`خانه: استودیو ${width}`).waitFor({ timeout: 8000 });
    const wid = (await api('/workspaces')).workspaces.find((w) => w.name === `استودیو ${width}`).id;
    const nodes = async () => (await api(`/workspaces/${wid}/state`)).nodes;

    step(`[${width}] the five nodes are ordinary: no «سیستمی» badge, no lock`);
    await nav('منبع حقیقت', 'منبع');
    await page.getByRole('heading', { name: 'آفر و قیمت‌گذاری' }).first().waitFor();
    assert.equal(await page.getByText('سیستمی', { exact: true }).count(), 0, 'no node is marked as locked');
    await shot('1-structure');

    step(`[${width}] she deletes «آفر و قیمت‌گذاری» (empty: no questions) and builds «بسته‌های خدمت» under «محصول و خدمت»`);
    await nodeOp('آفر و قیمت‌گذاری', 'حذف');
    await page.getByRole('dialog').getByText('خالی است و بدون هیچ اثری حذف می‌شود').waitFor();
    await shot('2-delete-empty');
    await page.getByRole('dialog').getByRole('button', { name: 'حذف', exact: true }).click();
    await page.waitForTimeout(500);
    assert.ok(!(await nodes()).some((n) => n.id === 'offer'));
    await nodeOp('محصول و خدمت', 'افزودن زیربخش');
    await page.getByLabel('نام بخش').fill('بسته‌های خدمت');
    await page.getByRole('button', { name: 'افزودن بخش' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); // internal AI is frozen: no Coach opens for the new node
    await page.getByRole('heading', { name: 'بسته‌های خدمت' }).first().waitFor();

    step(`[${width}] the quick start: its hints point at nodes that may be gone — the answers still land somewhere real`);
    await account('شروع سریع');
    await page.getByRole('button', { name: /به چند سؤال کوتاه جواب می‌دهم/ }).click();
    await page.getByLabel('روی چه کاری کار می‌کنی؟').fill('طراحی کمپین محتوا');
    await page.getByLabel('مخاطب اصلی تو کیست؟').fill('کسب‌وکارهای کوچک');
    await page.getByRole('button', { name: 'آماده‌سازی بسته' }).click();
    await page.getByText('بستهٔ دانش تو آماده است').waitFor();
    await page.getByRole('button', { name: 'تمام شد' }).click();
    const st = await api(`/workspaces/${wid}/state`);
    const ids = new Set(st.nodes.map((n) => n.id));
    assert.ok(st.objects.length >= 2 && st.objects.every((o) => ids.has(o.nodeId)), 'every answer is in a node that exists');

    step(`[${width}] the starter «خدمات» brings a node of its own and puts its examples there`);
    await nav('منبع حقیقت', 'منبع');
    const ap = await (await fetch(`${BASE}/api/workspaces/${wid}/starters/services/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    assert.ok(ap.added >= 6 && ap.nodes.filter((n) => n.label === 'بسته‌های خدمت').length === 1, 'one node «بسته‌های خدمت» — the one she built is reused');
    await page.reload({ waitUntil: 'networkidle' });
    await account(`استودیو ${width}`); // a reload opens the first workspace; go back to hers
    await page.getByText(`خانه: استودیو ${width}`).waitFor();
    await nav('منبع حقیقت', 'منبع');
    await shot('3-service-start');

    step(`[${width}] the only root cannot be deleted; with a second main section the old root goes — its content moves, with a reason on record`);
    await nodeOp('کسب‌وکار', 'حذف');
    await page.getByRole('dialog').getByText(/آخرین بخش اصلی/).waitFor();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: /^حذف/ }).last().isDisabled(), true);
    await shot('4-last-root');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'بخش اصلی تازه' }).click();
    await page.getByLabel('نام بخش').fill('خدمات');
    await page.getByRole('button', { name: 'افزودن بخش' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); // internal AI is frozen: no Coach opens for the new node
    await nodeOp('کسب‌وکار', 'حذف');
    await page.getByRole('dialog').getByText(/با محتوای این بخش چه کنیم/).waitFor();
    await shot('5-delete-with-content');
    await page.getByRole('dialog').getByRole('button', { name: 'حذف و بردن محتوا' }).click();
    await page.screenshot({ path: '/tmp/nodes-after-click.png' });
    let after, ids2;
    for (let i = 0; i < 20; i++) { await wait(300); after = await api(`/workspaces/${wid}/state`); ids2 = new Set(after.nodes.map((n) => n.id)); if (!ids2.has('business')) break; }
    assert.ok(!ids2.has('business'), 'the old root is gone: ' + JSON.stringify(after.nodes.map((n) => [n.id, n.label, n.parentId])));
    assert.ok(after.objects.every((o) => ids2.has(o.nodeId)), `nothing dangling: ${JSON.stringify(after.objects.filter((o) => !ids2.has(o.nodeId)).map((o) => o.nodeId))}`);
    assert.equal(after.objects.length, st.objects.length, 'nothing lost');
    await page.getByRole('heading', { name: 'خدمات' }).first().waitFor();
    await shot('6-after');
    assert.deepEqual(errors, []);
  }
  console.log('== nodes: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
