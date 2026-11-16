#!/usr/bin/env node
/**
 * RES-01 (closed dialogs stay in the page?): opens and closes the add, search, account and weekly-review dialogs many times on a
 * REAL server and counts what is left in the page: open layers, DOM nodes, and the JS heap after a forced GC.
 *   node scripts/scenario-dialog-memory.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-dlg-'));
const port = 3900 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${port}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, 'd.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-child.pid); } catch { /* gone */ } };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--js-flags=--expose-gc'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' })).newPage();
  await page.goto(BASE); await page.waitForLoadState('networkidle'); await wait(1500);
  const measure = async () => page.evaluate(() => { window.gc?.(); return { layers: document.querySelectorAll('.mb-dialog-layer').length, nodes: document.getElementsByTagName('*').length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e5) / 10 }; });
  let opened = 0;
  const openClose = async (key) => { await page.keyboard.press(key); await wait(500); if (await page.locator('.mb-dialog-layer').count()) opened++; await page.keyboard.press('Escape'); await wait(600); };
  const cycle = async () => { await openClose('n'); await openClose('Control+k'); };
  await page.locator('body').click({ position: { x: 640, y: 450 } }).catch(() => {});
  await page.keyboard.press('Escape');
  await cycle();
  console.log('dialogs seen open in the first round:', opened, '(of 2)');
  if (opened < 2) { console.log('FAIL: the dialogs did not open, nothing was measured'); process.exitCode = 1; }
  const first = await measure();
  console.log('after 1 open/close of each:', first);
  for (let i = 0; i < 25; i++) await cycle();
  const after = await measure();
  console.log('after 26 rounds:', after);
  if (after.layers !== 0) { console.log('FAIL: a closed dialog is still in the page'); process.exitCode = 1; }
  if (after.nodes > first.nodes * 1.05) { console.log('FAIL: the page grows with every open/close'); process.exitCode = 1; }
  await browser.close();
} finally { stop(); }
