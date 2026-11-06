#!/usr/bin/env node
/**
 * «بوم تراز اول» on a REAL server + temp SQLite (docs/canvas-design.md), the walkthroughs:
 *   الف overview: which sections depend most on «ارسال»; zoom out = rows + counted lines; open one         (360 · 1280 · 1920)
 *   ب   around one item: what «قیمت اشتراک» rests on and affects; depth; back to the whole
 *   د   «وصل کن»: «تخفیف دانشجویی» affects «قیمت اشتراک» — mouse, tap-tap, keyboard
 *   هـ  provenance: the thought it came from
 *   و   add one knowledge: the rest of the canvas stays where it was
 *   ز   300 sample cards (a test script, not user data): speed and legibility
 * Screenshots → docs/screens/world-*.png
 *   CHROMIUM_PATH=... WIDTHS=1280,360,1920 node scripts/scenario-canvas-world.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-world-'));
let BASE = '';
const children = [];
const stopAll = () => {
  for (const c of children.splice(0)) {
    if (process.platform === 'win32') { try { spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
    else { try { process.kill(-c.pid); } catch { try { c.kill(); } catch { /* gone */ } } }
  }
};
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), NODE_ENV: 'development' }, stdio: 'ignore', detached: true, shell: process.platform === 'win32' }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const step = (m) => console.log('•', m);
/** wait (up to 6s) until a condition holds — the app answers over the network */
const until = async (fn) => { for (let i = 0; i < 30; i++) { if (await fn()) return true; await wait(200); } return false; };

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of (process.env.WIDTHS ?? '1280,360,1920').split(',').map(Number)) {
    const mobile = width < 768;
    const tag = `world-${width}`;
    await startServer(3200 + Math.floor(Math.random() * 600) * 2 + (mobile ? 1 : 0), tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 800 : width >= 1920 ? 1080 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const click = (loc) => loc.evaluate((n) => n.click());
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    const nav = (m, d) => click(page.locator(mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`));
    const stage = page.getByTestId('canvas-stage');
    const enter = async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText(/^خانه: /).waitFor();
      if (!(await page.getByText(`خانه: دنیا ${width}`).count())) await account(`دنیا ${width}`);
      await page.getByText(`خانه: دنیا ${width}`).waitFor({ timeout: 8000 });
    };
    const toTruth = async () => { await nav('منبع', 'منبع حقیقت'); await click(page.locator('[role=radio]').filter({ hasText: /^نمای کلی$/ }).first()); await stage.waitFor(); await page.waitForTimeout(500); };
    const toolbar = page.getByTestId('canvas-toolbar');
    const lod = () => stage.getAttribute('data-lod');
    const zoomOnce = async (name) => {
      if (mobile) { await toolbar.getByRole('button', { name: 'بیشتر' }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); }
      else await toolbar.getByRole('button', { name }).click();
    };
    const zoomTo = async (want) => { for (let i = 0; i < 14 && (await lod()) !== want; i++) { await zoomOnce(want === 'far' ? 'کوچک‌نمایی' : 'بزرگ‌نمایی'); await page.waitForTimeout(60); } };

    /** bring a card into view through the canvas search (cards outside the viewport are not drawn) */
    const goCard = async (title) => { const q = page.locator('#canvas-search'); await q.fill(title); await q.press('Enter'); await page.waitForTimeout(450); };
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('فضای کاری تازه');
    await page.getByLabel('نام فضای کاری یا نام برند').fill(`دنیا ${width}`);
    await page.getByRole('button', { name: 'ایجاد فضای کاری' }).click();
    await page.getByText(`خانه: دنیا ${width}`).waitFor({ timeout: 8000 });
    const wid = (await call('GET', '/workspaces')).workspaces.find((w) => w.name === `دنیا ${width}`).id;
    const state = () => call('GET', `/workspaces/${wid}/state`);
    const root = (await state()).nodes.find((n) => !n.parentId).id;
    const node = async (parentId, label) => (await call('POST', `/workspaces/${wid}/nodes`, { parentId, label })).node.id;
    const ship = await node(root, 'ارسال'), sub = await node(root, 'اشتراک'), gift = await node(sub, 'بستهٔ هدیه'), brand = await node(root, 'برند');
    const mk = async (nodeId, title, extra = {}) => (await call('POST', `/workspaces/${wid}/objects`, { workspaceId: wid, type: 'Decision', status: 'Confirmed', provenance: 'User Input', title, content: `${title}: متن`, nodeId, ...extra })).object;
    const link = (o, ...targets) => call('PUT', `/workspaces/${wid}/objects/${o.id}/dependencies`, { dependsOn: targets.map((t) => t.id) });

    // data
    const note = (await call('POST', `/workspaces/${wid}/notes`, { nodeId: sub, content: '[ایده] قیمت اشتراک ماهانه بشود ۲۹۰ هزار' })).note;
    const cost = await mk(ship, 'هزینهٔ ارسال', { type: 'Fact' });
    const speed = await mk(ship, 'زمان ارسال');
    const price = await mk(sub, 'قیمت اشتراک', { source: { kind: 'note', noteId: note.id, quote: 'قیمت اشتراک ماهانه بشود ۲۹۰ هزار' } });
    await link(price, cost, speed);
    const deps = [];
    for (const t of ['پیک اشتراک', 'بستهٔ پایه', 'بستهٔ طلایی', 'تعرفهٔ سازمانی', 'مهلت تحویل اشتراک']) { const o = await mk(sub, t); await link(o, cost); deps.push(o); }
    const giftPrice = await mk(gift, 'قیمت بستهٔ هدیه'); await link(giftPrice, price);
    const student = await mk(gift, 'تخفیف دانشجویی');
    await mk(brand, 'لحن برند', { type: 'Constraint' });
    await enter();
    await toTruth();

    // ── الف
    step(`[${width}] الف: the overview — a row per section, the sticky label, the layers`);
    assert.equal(await page.locator('[role=radio]').filter({ hasText: /^(رابطه‌ها|تابلو|آزاد)$/ }).count(), 0, 'no layout switch: one overview');
    await stage.locator('[data-testid=row-rail]').first().waitFor();
    const rails = await page.getByTestId('row-rail').allInnerTexts();
    console.log('   rows:', rails.map((r) => r.replace(/\s+/g, ' ').slice(0, 50)).join(' | '));
    assert.ok(rails.some((r) => /ارسال/.test(r)) && rails.some((r) => /اشتراک/.test(r)));
    await toolbar.getByRole('button', { name: 'متناسب‌سازی' }).click();
    await page.waitForTimeout(400);
    await shot('1-overview');
    await zoomTo('far');
    await page.getByTestId('row-edge').first().waitFor();
    const edgeTexts = await page.getByTestId('row-edge').allInnerTexts();
    console.log('   far lines:', edgeTexts.join(' | '));
    assert.ok(edgeTexts.some((t) => /۷ وابستگی به «ارسال»/.test(t)), 'seven dependencies on «ارسال» are ONE line with a count');
    assert.ok((await page.getByTestId('row-summary').count()) >= 3, 'each row is one summary');
    assert.equal(await stage.locator('[data-item-id]').count(), 0, 'zoomed out there are no cards');
    await shot('2-far');
    await page.getByTestId('row-edge').first().click();
    await page.waitForTimeout(300);
    await zoomTo('near');
    assert.ok((await stage.locator('[data-item-id]').count()) > 0, 'zoomed in the cards come back');
    await shot('3-near');
    if (mobile) await click(page.getByTestId('row-rail').filter({ hasText: 'اشتراک' }).first()); // a phone shows a small tab first
    const open = page.getByTestId('row-rail').filter({ hasText: 'اشتراک' }).getByRole('button', { name: /زیربخش‌ها/ });
    if (await open.count()) { await open.first().click(); await toolbar.getByRole('button', { name: 'متناسب‌سازی' }).click(); await zoomTo('mid'); await page.waitForTimeout(300); assert.ok((await page.getByTestId('row-rail').filter({ hasText: 'بستهٔ هدیه' }).count()) > 0, 'a deeper section got its own row'); }

    // ── ب
    step(`[${width}] ب: around «قیمت اشتراک» and back`);
    await toolbar.getByRole('button', { name: 'متناسب‌سازی' }).click();
    await zoomTo('near');
    const card = (id) => stage.locator(`[data-item-id="o:${id}"]`);
    await goCard('قیمت اشتراک');
    await click(card(price.id).first());
    await page.waitForTimeout(300);
    if (mobile) { /* the inspector is a sheet on phones */ }
    const lineageBtn = page.getByRole('button', { name: 'دور این مورد' }).first();
    await lineageBtn.waitFor();
    await lineageBtn.click();
    await page.getByTestId('lineage-bar').waitFor();
    const text = (await page.getByTestId('lineage-text').innerText()).replace(/\s+/g, ' ');
    console.log('   lineage:', text.slice(0, 200));
    assert.match(text, /بر این‌ها تکیه دارد/); assert.match(text, /هزینهٔ ارسال/); assert.match(text, /زمان ارسال/);
    assert.match(text, /روی این‌ها اثر دارد.*قیمت بستهٔ هدیه/);
    assert.ok(!/لحن برند/.test(text), 'unrelated cards are not in it');
    await shot('4-lineage');
    await page.getByTestId('lineage-bar').getByRole('radio', { name: '۱ قدم' }).click({ force: true });
    await page.waitForTimeout(300);
    await page.getByTestId('lineage-bar').getByRole('button', { name: 'برگشت به نمای کلی' }).click();
    await page.getByTestId('lineage-bar').waitFor({ state: 'detached' });
    await stage.locator('[data-testid=row-rail]').first().waitFor();

    // ── هـ
    step(`[${width}] هـ: where «قیمت اشتراک» came from`);
    await goCard('قیمت اشتراک');
    await click(card(price.id).first());
    await page.waitForTimeout(300);
    const prov = page.getByRole('button', { name: /^منشأ/ }).first();
    if (await prov.count()) await prov.click();
    await page.getByTestId('provenance').waitFor();
    const provText = (await page.getByTestId('provenance').innerText()).replace(/\s+/g, ' ');
    console.log('   provenance:', provText);
    assert.match(provText, /از فکری آمد: «.*قیمت اشتراک ماهانه/);
    await shot('5-provenance');

    // ── د
    step(`[${width}] د: «تخفیف دانشجویی» affects «قیمت اشتراک» (tap-tap)`);
    const relsBefore = (await state()).relationships.length;
    await toolbar.getByRole('button', { name: /^وصل کن/ }).click();
    await page.getByTestId('connect-bar').waitFor();
    await goCard('تخفیف دانشجویی');
    await click(card(student.id).first());
    await page.waitForTimeout(200);
    assert.match(await page.getByTestId('connect-bar').innerText(), /تخفیف دانشجویی.*انتخاب شد/);
    await goCard('قیمت اشتراک');
    await click(card(price.id).first());
    const dlg = page.getByTestId('connect-dialog');
    await dlg.waitFor();
    const sentences = (await dlg.innerText()).replace(/\s+/g, ' ');
    console.log('   sentences:', sentences.slice(0, 220));
    assert.match(sentences, /«تخفیف دانشجویی» بر «قیمت اشتراک» تکیه دارد/);
    assert.match(sentences, /«تخفیف دانشجویی» روی «قیمت اشتراک» اثر دارد/);
    assert.equal((await state()).relationships.length, relsBefore, 'nothing is built before the button');
    await shot('6-connect');
    await dlg.getByRole('radio', { name: /روی «قیمت اشتراک» اثر دارد/ }).check({ force: true });
    await page.getByRole('dialog').getByRole('button', { name: 'وصل کن' }).click();
    assert.ok(await until(async () => (await state()).relationships.some((r) => r.type === 'depends_on' && r.sourceId === price.id && r.targetId === student.id)), 'affects = the price depends on the discount');
    // undo
    await stage.focus();
    await page.keyboard.press('Control+KeyZ');
    assert.ok(await until(async () => !(await state()).relationships.some((r) => r.sourceId === price.id && r.targetId === student.id)), 'Ctrl+Z took it back');
    // keyboard: C, Enter on a focused card, Enter on another
    await stage.focus();
    await page.keyboard.press('KeyC');
    await page.getByTestId('connect-bar').waitFor();
    await goCard('تخفیف دانشجویی');
    await card(student.id).first().focus();
    await page.keyboard.press('Enter');
    await goCard('قیمت اشتراک');
    await card(price.id).first().focus();
    await page.keyboard.press('Enter');
    await dlg.waitFor();
    await page.keyboard.press('Escape'); // closes the dialog
    await page.waitForTimeout(200);
    await stage.focus();
    await page.keyboard.press('Escape'); // leaves the tool
    await page.waitForTimeout(200);
    assert.equal(await page.getByTestId('connect-bar').count(), 0, 'Esc cancels');
    // a duplicate is refused in words
    await link(await mk(sub, 'موقت'), price);

    // ── و
    step(`[${width}] و: one more knowledge — the rest stays where it was`);
    const places = () => stage.locator('[data-item-id]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-item-id'), e.getAttribute('style') ?? ''])));
    await toolbar.getByRole('button', { name: 'متناسب‌سازی' }).click();
    await zoomTo('near');
    await enter(); await toTruth(); await zoomTo('near'); // the same fresh state before and after (opened rows are not remembered)
    const before = await places();
    await mk(brand, 'نکتهٔ تازه برند');
    await enter(); await toTruth();
    await zoomTo('near');
    const after = await places();
    const both = Object.keys(before).filter((k) => after[k] !== undefined); // only cards drawn in both views can be compared
    const same = both.filter((k) => after[k] === before[k]).length;
    console.log(`   unchanged ${same} of ${both.length} cards drawn in both`);
    if (same < both.length) console.log('   e.g.', both.slice(0, 2).map((k) => `${before[k]} => ${after[k]}`).join(' || '));
    assert.ok(both.length >= 3 && same >= Math.floor(both.length * 0.8), 'most cards stayed');

    // ── ج
    step(`[${width}] ج: the thinking canvas — a section frame moves its cards; a thought dragged into another frame changes its section`);
    const nA = (await call('POST', `/workspaces/${wid}/canvas/free/notes`, { content: 'فکر الف دربارهٔ ارسال', x: 80, y: 120, nodeId: ship })).note;
    await call('POST', `/workspaces/${wid}/canvas/free/notes`, { content: 'فکر دوم دربارهٔ ارسال', x: 80, y: 280, nodeId: ship });
    await call('POST', `/workspaces/${wid}/canvas/free/notes`, { content: 'فکر دربارهٔ اشتراک', x: 620, y: 120, nodeId: sub });
    await enter();
    await nav('فکر', 'فکر'); await click(page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first()); await stage.waitFor(); await page.waitForTimeout(500);
    await toolbar.getByRole('button', { name: 'متناسب‌سازی' }).click();
    await zoomTo('mid');
    const frameOf = (id) => page.locator(`[data-testid=section-frame][data-frame="${id}"]`);
    await frameOf(ship).waitFor();
    await frameOf(sub).waitFor();
    assert.equal(await page.locator('[role=radio]').filter({ hasText: /^(تابلو|آزاد)$/ }).count(), 0, 'one free canvas: no layout switch');
    await shot('9-frames');
    // the menu alternative (no dragging): move the «ارسال» frame beside «اشتراک»
    const pos = async (noteId) => (await call('GET', `/workspaces/${wid}/state`)).canvas.free.find((i) => i.itemRef === `note:${noteId}`);
    const before0 = await pos(nA.id);
    if (mobile) { // a phone: the same thing from the «⋯» menu, in 44px buttons (the in-stage header scales with the zoom)
      await toolbar.getByRole('button', { name: 'بیشتر' }).click();
      await page.getByRole('menuitem', { name: 'جابه‌جا کردن یک بخش…' }).click();
      await page.getByTestId('frame-dialog').getByRole('combobox').first().selectOption(ship);
      await page.getByTestId('frame-dialog').getByRole('button', { name: 'پایین‌تر' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'بستن' }).first().click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    } else {
      await click(frameOf(ship).getByRole('button', { name: /جابه‌جا کن: ارسال/ }));
      await page.getByTestId('frame-menu').getByRole('menuitem', { name: /ببر پایین‌تر/ }).click();
    }
    assert.ok(await until(async () => (await pos(nA.id)).y > before0.y), 'the whole frame moved down by the menu');
    await stage.focus();
    await page.keyboard.press('Control+KeyZ');
    assert.ok(await until(async () => (await pos(nA.id)).y === before0.y), 'Ctrl+Z put it back');
    // drag a thought from «ارسال» into the «اشتراک» frame
    const noteEl = stage.locator(`[data-item-id="note:${nA.id}"]`).first();
    const nb = await noteEl.boundingBox(), fb = await frameOf(sub).boundingBox();
    if (!mobile && nb && fb) {
      await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      const n1 = (await state()).notes.find((n) => n.id === nA.id);
      assert.equal(n1.nodeId, sub, 'the thought is now in «اشتراک»');
      await stage.focus();
      await page.keyboard.press('Control+KeyZ');
      assert.ok(await until(async () => (await state()).notes.find((n) => n.id === nA.id).nodeId === ship), 'Ctrl+Z gave it back');
    }
    // the no-drag way: the card menu
    await page.keyboard.press('Escape');
    await goCard('فکر الف');
    await noteEl.focus();
    await page.keyboard.press('Shift+F10');
    if (process.env.DEBUG_CTX) await shot('dbg-ctx');
    await page.getByRole('menuitem', { name: 'جابه‌جا کن به بخش…' }).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption(sub);
    await page.getByRole('dialog').getByRole('button', { name: 'جابه‌جا کن' }).click();
    await page.waitForTimeout(700);
    assert.equal((await state()).notes.find((n) => n.id === nA.id).nodeId, sub, 'the menu moved it too');

    // ── ز
    step(`[${width}] ز: 300 sample cards (a test script, not user data): speed and legibility`);
    const sections = [ship, sub, gift, brand];
    const made = [];
    for (let i = 0; i < 300; i += 20) {
      const batch = await Promise.all(Array.from({ length: 20 }, (_, j) => mk(sections[(i + j) % 4], `نمونهٔ ${i + j}`, { type: (i + j) % 17 === 0 ? 'Constraint' : 'Decision' })));
      made.push(...batch);
    }
    for (let i = 20; i < 300; i += 3) await call('PUT', `/workspaces/${wid}/objects/${made[i].id}/dependencies`, { dependsOn: [made[(i * 7) % i].id] });
    await enter();
    const t0 = Date.now();
    await nav('منبع', 'منبع حقیقت'); await click(page.locator('[role=radio]').filter({ hasText: /^نمای کلی$/ }).first());
    await stage.locator('[data-testid=row-rail], [data-testid=row-summary]').first().waitFor({ timeout: 20000 });
    const opened = Date.now() - t0;
    const t1 = Date.now();
    for (let i = 0; i < 6; i++) await zoomOnce(i < 3 ? 'کوچک‌نمایی' : 'بزرگ‌نمایی');
    const zoomMs = (Date.now() - t1) / 6;
    await zoomTo('mid');
    const drawn = await stage.locator('[data-item-id]').count();
    const frame = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 800) res(n / ((performance.now() - t) / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    console.log(`   opened in ${opened}ms · a zoom step ${Math.round(zoomMs)}ms · ${drawn} cards drawn at the middle level · ~${Math.round(frame)} fps idle`);
    await shot('7-300-mid');
    await zoomTo('far');
    await shot('8-300-far');
    assert.ok(opened < 15000, 'the canvas opens in a reasonable time');
    assert.ok(drawn < 300, 'only what is in view is drawn');
    assert.ok((await page.getByTestId('row-edge').count()) >= 1, 'far: lines between rows are counted');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no horizontal overflow of the page');

    assert.deepEqual(errors, [], 'no page errors');
    step(`[${width}] ok`);
    stopAll();
  }
  console.log('✓ canvas world scenario passed');
} finally {
  await browser?.close();
  stopAll();
}
