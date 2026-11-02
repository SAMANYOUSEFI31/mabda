#!/usr/bin/env node
/**
 * Decision board on a REAL server + temp SQLite: drag a Proposed card into «تأییدشده» (= accept, with a reason), backward needs an
 * explicit confirmation, a keyboard/touch path via the card's actions dialog, a line between two cards, a free note → knowledge,
 * JSON Canvas export. Every step is checked against the Change log. Screenshots → docs/screens/canvas-*.png at 1280 and 390.
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
const PORT = 3107;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
async function up() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); } throw new Error('server not reachable'); }
const api = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return r.json(); };
const step = (m) => console.log('•', m);

let browser;
try {
  await up();
  await api('POST', '/bootstrap', {});
  const mk = async (b) => (await api('POST', '/workspaces/ws_studio/objects', { type: 'Decision', provenance: 'AI Suggested', nodeId: 'offer', ...b })).object;
  const p1 = await mk({ status: 'Proposed', title: 'پیشنهاد کانال تلگرام', content: 'کانال اصلی تلگرام باشد', source: { kind: 'mcp', label: 'Claude', at: new Date().toISOString() } });
  const c1 = await mk({ status: 'Confirmed', provenance: 'User Input', title: 'بودجهٔ ماهانه', content: 'پنج میلیون' });
  const c2 = await mk({ status: 'Confirmed', provenance: 'User Input', title: 'کانال تبلیغ', content: 'اینستاگرام' });
  const changes = async () => (await api('GET', '/workspaces/ws_studio/changes/log')).changes;

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const desktop = width >= 768;
    const page = await (await browser.newContext({ viewport: { width, height: desktop ? 900 : 844 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("منبع حقیقت")').or(page.locator('nav[aria-label="منوی پایینی موبایل"] button:has-text("منبع")')).locator('visible=true').first().click();
    await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().click();
    const stage = page.getByRole('application', { name: /بوم تصمیم‌ها/ });
    await stage.waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `docs/screens/canvas-${width}.png` });

    // cards outside the viewport are not drawn (that is what keeps 8000 objects fast): pan with the keyboard until the card is there
    const panTo = async (title) => { await stage.focus(); for (let i = 0; i < 30 && !(await page.locator('[data-object-id]').filter({ hasText: title }).count()); i++) await page.keyboard.press('ArrowDown'); };
    const cardOf = (title) => page.locator(`[data-object-id]`).filter({ hasText: title }).first();
    if (desktop) {
      step(`[${width}] drag the AI proposal into «تأییدشده» → accept dialog with an optional reason`);
      const card = cardOf('پیشنهاد کانال تلگرام');
      const target = cardOf('بودجهٔ ماهانه');
      await panTo('بودجهٔ ماهانه'); await target.focus(); await page.waitForTimeout(150);
      await card.focus(); await page.waitForTimeout(150);
      const a = await card.boundingBox(), b = await target.boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 - 40, a.y + a.height / 2, { steps: 4 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6, { steps: 12 });
      await page.mouse.up();
      await page.screenshot({ path: `docs/screens/canvas-drop-${width}.png` });
      await page.getByRole('dialog').getByText('تأیید این مورد؟').waitFor();
      await page.getByLabel('دلیل (اختیاری)').fill('با تیم هماهنگ شد');
      await page.getByRole('dialog').getByRole('button', { name: 'تأیید', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      await wait(400);
      const acc = (await changes()).find((c) => c.objectId === p1.id && c.kind === 'proposal_accepted');
      assert.ok(acc, 'the drag wrote a proposal_accepted Change');
      assert.deepEqual([acc.reason, acc.actor], ['با تیم هماهنگ شد', 'user']);
      await page.screenshot({ path: `docs/screens/canvas-accepted-${width}.png` });
    }

    step(`[${width}] keyboard/touch path: «انتقال و اتصال» → backward needs an explicit confirmation`);
    await panTo('بودجهٔ ماهانه');
    await page.getByRole('button', { name: /^انتقال و اتصال: بودجهٔ ماهانه/ }).first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: 'در فکر' }).click();
    await page.getByRole('dialog').getByText('برگرداندن مورد تأییدشده').waitFor();
    await page.screenshot({ path: `docs/screens/canvas-backward-${width}.png` });
    assert.equal((await api('GET', '/workspaces/ws_studio/state')).objects.find((o) => o.id === c1.id).status, 'Confirmed', 'nothing changed before the confirmation');
    await page.getByRole('dialog').getByRole('button', { name: 'انصراف' }).click();

    step(`[${width}] a line between two cards = a typed relation`);
    await panTo('کانال تبلیغ');
    await page.getByRole('button', { name: /^انتقال و اتصال: کانال تبلیغ/ }).first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: 'وصل کن به…' }).click();
    await page.getByRole('dialog').getByLabel('این مورد', { exact: true }).selectOption({ label: 'بودجهٔ ماهانه' });
    await page.getByRole('dialog').getByRole('button', { name: 'ساخت' }).click();
    await wait(400);
    const rels = (await api('GET', '/workspaces/ws_studio/state')).relationships;
    assert.ok(rels.some((r) => r.type === 'depends_on' && r.sourceId === c2.id && r.targetId === c1.id));

    step(`[${width}] free note → knowledge (proposed) and JSON Canvas export`);
    await page.getByRole('button', { name: 'یادداشت تازه' }).first().click();
    await page.getByLabel('فکر خام').fill(`شاید قیمت را کم کنیم ${width}`);
    await page.getByRole('dialog').getByRole('button', { name: 'ثبت یادداشت' }).click();
    await wait(400);
    const toK = page.getByRole('button', { name: 'تبدیل به قلم دانش' }).first();
    await toK.focus(); await page.waitForTimeout(150); // focus pans the note into view
    await toK.click();
    await page.getByRole('dialog').getByRole('button', { name: 'تصمیم' }).click();
    await wait(400);
    const st = await api('GET', '/workspaces/ws_studio/state');
    assert.ok(st.objects.some((o) => o.title.startsWith('شاید قیمت را کم کنیم') && o.status === 'Proposed'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'خروجی JSON Canvas' }).click()]);
    assert.match(dl.suggestedFilename(), /\.canvas$/);
    await page.screenshot({ path: `docs/screens/canvas-final-${width}.png` });
    assert.deepEqual(errors, [], 'no page errors');
    await page.context().close();
    // second pass starts from the same server: put things back so the mobile pass can repeat the steps
    await api('PATCH', `/workspaces/ws_studio/objects/${c1.id}`, { status: 'Confirmed' });
    await api('POST', '/workspaces/ws_studio/objects', { type: 'Decision', provenance: 'AI Suggested', nodeId: 'offer', status: 'Proposed', title: 'پیشنهاد کانال تلگرام', content: 'دوباره', source: { kind: 'mcp', label: 'Claude', at: new Date().toISOString() } });
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
