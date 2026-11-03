#!/usr/bin/env node
/**
 * «معماری اطلاعات»: the walkthroughs on a REAL server + temp SQLite, in an EMPTY workspace:
 *   ب  three thoughts about «کارگاه» on the thinking canvas, beside the truth card «تخفیف نداریم», two suggestions linked
 *      (a dashed relation) → «اگر همه را تأیید کنم؟» → the truth map → approve → the same relation is real
 *   ج  a section made from a thought, under «محصول و خدمت» and as a main section
 *   د  from home to an open thought, and its decision
 * (الف — an output, then a price change, and which output is stale — is scenario-impact.)
 * Screenshots → docs/screens/flows-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-flows-'));
let BASE = '';
const children = [];
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'flows-m' : 'flows';
    await startServer(mobile ? 3142 : 3141, tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}-${width}.png` });
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
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

    const nodes = () => state().then((s) => s.nodes);
    const product = (await nodes()).find((n) => n.label === 'محصول و خدمت');
    assert.ok(product, 'the default tree has «محصول و خدمت»');

    step(`[${width}] ج: a section made from a thought — under «محصول و خدمت», then as a main section; the thought is done`);
    for (const [text, parentValue] of [['کارگاه‌های حضوری هم برگزار کنیم', product.id], ['یک بخش جدا برای شراکت‌ها لازم داریم', '']]) {
      await palette('فکر تازه', 'فکر تازه');
      await page.getByRole('dialog').getByLabel('فکرت را بنویس').fill(text);
      await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).click();
      await page.waitForTimeout(500);
      await nav('فکر', 'فکر');
      await page.getByTestId('thinking-space').waitFor();
      await page.getByTestId('thinking-space').locator('li', { hasText: text }).getByRole('button', { name: 'ساخت بخش' }).click();
      const dlg = page.getByRole('dialog');
      assert.ok((await dlg.getByLabel('نام گره').inputValue()).length > 3, 'a name is suggested from the thought');
      await dlg.getByLabel('زیر کدام بخش؟').selectOption(parentValue);
      if (!parentValue) await shot('1-section-from-thought');
      await dlg.getByRole('button', { name: 'ساخت گره' }).click();
      await page.getByText(/ساخته شد/).first().waitFor();
      await page.waitForTimeout(500);
    }
    const ns = await nodes();
    const sub = ns.find((n) => n.label.startsWith('کارگاه‌های حضوری'));
    const top = ns.find((n) => n.label.startsWith('یک بخش جدا'));
    assert.equal(sub?.parentId, product.id, 'under «محصول و خدمت»');
    assert.ok(top && !top.parentId, 'a main section');
    assert.equal(await page.getByTestId('thinking-space').locator('li', { hasText: 'کارگاه‌های حضوری' }).count(), 0, 'the thought is no longer open');

    step(`[${width}] ب: three thoughts about «کارگاه», a truth card beside them, two suggestions linked; «اگر همه را تأیید کنم؟» shows the truth map`);
    const ws = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: product.id, label: 'کارگاه' })).node;
    for (const t of ['[ایده] کارگاه آنلاین ماهانه', '[ایده] کارگاه حضوری فصلی', '[سؤال] کارگاه رایگان باشد یا پولی؟']) await call('POST', `/workspaces/${wid}/notes`, { nodeId: ws.id, content: t });
    const anchor = (await call('POST', `/workspaces/${wid}/objects`, { type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: 'تخفیف نداریم', content: 'هیچ تخفیفی نمی‌دهیم.', nodeId: product.id })).object;
    const a = (await call('POST', `/workspaces/${wid}/objects`, { type: 'Decision', status: 'Proposed', provenance: 'User Input', title: 'کارگاه آنلاین ماهانه', content: 'هر ماه یک کارگاه آنلاین', nodeId: ws.id })).object;
    const b = (await call('POST', `/workspaces/${wid}/objects`, { type: 'Decision', status: 'Proposed', provenance: 'User Input', title: 'بستهٔ کارگاه با اشتراک', content: 'کارگاه در اشتراک بیاید', nodeId: ws.id })).object;
    await call('POST', `/workspaces/${wid}/canvas/connect`, { fromId: b.id, toId: a.id, type: 'depends_on' });
    await page.reload({ waitUntil: 'networkidle' });
    await account(`فکر ${width}`);
    await page.getByText(`خانه: فکر ${width}`).waitFor();
    await nav('فکر', 'فکر');
    await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click());
    await page.getByTestId('canvas-stage').waitFor();
    await page.waitForTimeout(600);
    if (!mobile) assert.ok((await page.locator('path[data-pending]').count()) >= 1, 'the relation between two suggestions is dashed (on a phone the tray is off-screen at this zoom; src/core/canvasScene.test.ts covers it)');
    await page.getByRole('button', { name: 'متناسب‌سازی' }).click(); await page.waitForTimeout(500);
    assert.ok((await page.locator('[data-item-id^="note:"]').count()) >= 3, 'the three thoughts are in the «تازه‌ها» tray');
    assert.ok((await page.locator('[data-pending]').count()) >= 2, 'the suggestions are drawn as suggestions');
    // bring the truth card next to the thoughts: «⋯» → the dialog; then drag one thought beside it
    await page.getByTestId('canvas-toolbar').getByRole('button', { name: 'بیشتر' }).evaluate((n) => n.click());
    await page.getByRole('menuitem', { name: /کارت حقیقت را کنار فکرها بیاور/ }).click();
    await page.getByRole('dialog').getByLabel('کدام کارت؟').selectOption({ label: 'تخفیف نداریم' });
    await page.getByRole('dialog').getByRole('button', { name: 'بگذار روی بوم فکر' }).click();
    await page.waitForTimeout(700);
    let free = (await state()).canvas.free;
    const at = free.find((i) => i.itemRef === `obj:${anchor.id}`);
    assert.ok(at, 'the SAME card (not a copy) sits on the thinking canvas');
    if (!mobile) { // dragging a card on a phone is the same code path (pointer events); the thinking canvas is a desktop-first tool
      const note0 = page.locator('[data-item-id^="note:"]').first();
      const nb = await note0.boundingBox(); const ab = await page.locator(`[data-item-id="o:${anchor.id}"]`).boundingBox();
      assert.ok(nb && ab, 'both cards are visible');
      await page.mouse.move(nb.x + nb.width / 2, nb.y + 20); await page.mouse.down();
      await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height + 50, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(700);
      free = (await state()).canvas.free;
      assert.ok(free.some((i) => i.itemRef.startsWith('note:')), 'the dragged thought now has a place of its own');
    }
    await shot('2-thinking-canvas');
    await page.getByRole('button', { name: /اگر همه را تأیید کنم، نقشهٔ حقیقت/ }).click();
    await page.getByTestId('canvas-stage').waitFor();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'متناسب‌سازی' }).click(); await page.waitForTimeout(500);
    assert.ok((await page.locator('[data-pending]').count()) >= 2, 'the truth map shows what is on its way, faint');
    await shot('3-truth-preview');
    await nav('فکر', 'فکر');
    await page.getByTestId('thinking-space').waitFor().catch(async () => { await page.locator('[role=radio]').filter({ hasText: /^فهرست$/ }).first().evaluate((n) => n.click()); });
    for (let i = 0; i < 6 && (await page.getByTestId('thinking-space').getByRole('button', { name: 'تأیید', exact: true }).count()) > 0; i++) {
      await page.getByTestId('thinking-space').getByRole('button', { name: 'تأیید', exact: true }).first().click();
      await page.waitForTimeout(500);
    }
    const objs = (await state()).objects;
    assert.equal(objs.find((o) => o.id === a.id).status, 'Confirmed');
    assert.equal(objs.find((o) => o.id === b.id).status, 'Confirmed');
    await nav('منبع حقیقت', 'منبع');
    await radio('بوم');
    await page.getByTestId('canvas-stage').waitFor();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'متناسب‌سازی' }).click(); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-pending]').count(), 0, 'approved: the same relation is simply real');
    assert.equal(await page.locator(`[data-item-id="o:${a.id}"], [data-item-id="o:${b.id}"]`).count(), 2, 'both cards are on the truth map');
    await page.locator(`[data-item-id="o:${a.id}"]`).evaluate((n) => n.click());
    await page.waitForTimeout(400);
    assert.ok((await page.locator('path[data-line]').count()) >= 1, 'and the relation between them is a line');
    await shot('4-truth-approved');

    step(`[${width}] د: from home to an open thought and its decision`);
    await call('POST', `/workspaces/${wid}/notes`, { nodeId: product.id, content: '[سؤال] قیمت پایهٔ کارگاه چقدر باشد؟' });
    await page.reload({ waitUntil: 'networkidle' });
    await account(`فکر ${width}`);
    await page.getByText(`خانه: فکر ${width}`).waitFor();
    await nav('خانه', 'خانه');
    await page.getByRole('button', { name: 'ببین' }).first().click();
    const sp = page.getByTestId('thinking-space');
    await sp.waitFor();
    await sp.locator('li', { hasText: 'قیمت پایهٔ کارگاه' }).getByRole('button', { name: 'به دانش ببر' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).first().click();
    await page.waitForTimeout(700);
    await sp.getByText('منتظر تصمیم تو').first().waitFor();
    await sp.getByRole('button', { name: 'تأیید', exact: true }).first().click();
    await page.waitForTimeout(600);
    assert.ok((await state()).objects.some((o) => o.title.includes('قیمت پایهٔ کارگاه') || o.content.includes('قیمت پایهٔ کارگاه')), 'decided: it is knowledge now');
    await shot('5-decided');

    assert.deepEqual(errors, []);
    await page.context().close();
  }
  console.log('== flows: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
