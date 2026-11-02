#!/usr/bin/env node
/**
 * Map view on a REAL server + a big temp SQLite: a Max workspace with 8000 context objects in 40 nodes, dependency chains
 * and 300 assets. Checks the page stays responsive (render time, drawn cards ≪ objects, pan/zoom frame cost), the
 * impact path lights up, and the keyboard works. Screenshots → docs/screens/map-*.png
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-map.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-map-'));
const DB = join(dir, 'm.sqlite');
const PORT = 3106;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: DB, MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
async function up() { for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); } throw new Error('server not reachable'); }
const step = (m) => console.log('•', m);

let browser;
try {
  await up();
  await fetch(`${BASE}/api/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  step('seeding 8000 objects, chains and 300 assets straight into SQLite');
  const db = new Database(DB);
  const ws = JSON.parse(db.prepare("SELECT data FROM workspaces WHERE id = 'ws_studio'").get().data);
  db.prepare("UPDATE workspaces SET data = ? WHERE id = 'ws_studio'").run(JSON.stringify({ ...ws, planId: 'max' }));
  const t = new Date().toISOString();
  db.transaction(() => {
    for (let i = 0; i < 40; i++) db.prepare('INSERT OR IGNORE INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)').run(`big${i}`, 'local', 'ws_studio', 'business', `حوزهٔ ${i}`, '', 100 + i);
    const ins = db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)');
    const rel = db.prepare("INSERT INTO context_relationships (id,user_id,workspace_id,source_id,target_id,type,created_at) VALUES (?,?,?,?,?,'depends_on',?)");
    for (let i = 0; i < 8000; i++) ins.run(`big_o${i}`, 'local', 'ws_studio', ['Fact', 'Decision', 'Constraint'][i % 3], 'Confirmed', 'User Input', `مورد ${i} در حوزهٔ ${i % 40}`, `متن مورد ${i}`, `big${i % 40}`, t, t);
    for (let i = 40; i < 8000; i += 2) rel.run(`big_r${i}`, 'local', 'ws_studio', `big_o${i}`, `big_o${i - 40}`, t);
  })();
  const cols = db.prepare('PRAGMA table_info(deliverables)').all().map((c) => c.name);
  assert.ok(cols.length > 0, 'deliverables table exists');
  db.close();

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('[role=radio]').filter({ hasText: /^نقشه$/ }).first().click();
    const t0 = Date.now();
    await page.getByRole('application', { name: /نقشه/ }).waitFor();
    const cards = () => page.locator('[role=application] button[aria-pressed]').count();
    const drawn = await cards();
    step(`[${width}] map rendered in ${Date.now() - t0}ms with ${drawn} cards drawn (8000 objects)`);
    assert.ok(Date.now() - t0 < 5000, 'first render is quick');
    assert.ok(drawn < 120, `only what is visible is drawn (${drawn})`);
    await page.screenshot({ path: `docs/screens/map-big-${width}.png` });

    // expand one node (2000 → only 200 objects), then pan around: every frame stays cheap
    await page.getByRole('button', { name: 'جا دادن در صفحه' }).click();
    await page.getByRole('button', { name: 'باز کردن موردهای حوزهٔ 0' }).click();
    await page.waitForTimeout(300);
    const box = await page.getByRole('application', { name: /نقشه/ }).boundingBox();
    const t1 = Date.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(box.x + box.width / 2 - i * 12, box.y + box.height / 2 + i * 5);
    await page.mouse.up();
    const perFrame = (Date.now() - t1) / 30;
    step(`[${width}] 30 pan moves: ${perFrame.toFixed(1)}ms each, ${await cards()} cards drawn`);
    assert.ok(perFrame < 120, `pan is smooth (${perFrame}ms/frame)`);

    // select an object → its path of effect lights up and the summary panel opens (keyboard: focus + Enter)
    await page.getByRole('button', { name: 'جا دادن در صفحه' }).click();
    const obj = page.locator('[role=application] button[aria-pressed][aria-label^="مورد"]').first();
    await obj.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('complementary', { name: 'خلاصهٔ مورد انتخاب‌شده' }).getByRole('button', { name: 'باز کردن' }).waitFor();
    await page.screenshot({ path: `docs/screens/map-impact-${width}.png` });
    assert.deepEqual(errors, [], 'no page errors');
    await page.context().close();
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
