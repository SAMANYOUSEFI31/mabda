#!/usr/bin/env node
/**
 * Screenshot every main view at 390px and 1280px into docs/screens/ and print layout audit findings
 * (horizontal overflow, text < 12px, long text < 14px, touch targets < 44px, physical-direction misplacement).
 * Usage: node scripts/screens.mjs [baseUrl]   (default http://localhost:3100)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = 'docs/screens';
mkdirSync(OUT, { recursive: true });

const SIZES = [{ name: '390', width: 390, height: 844 }, { name: '1280', width: 1280, height: 900 }];
const TABS = [
  { id: 'home', label: 'خانه' },
  { id: 'context', label: 'منبع', desktopLabel: 'منبع حقیقت' },
  { id: 'workstreams', label: 'جریان‌ها', desktopLabel: 'جریان‌های کار' },
  { id: 'chat', label: 'گفتگو' },
  { id: 'assets', label: 'دارایی‌ها' },
];

const audit = () => {
  const out = { overflow: null, tiny: [], smallBody: [], touch: [], contrast: [], edges: [], primaries: 0 };
  // contrast: composite ancestor backgrounds, compare with text color (WCAG relative luminance)
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); let bg = { r: 9, g: 9, b: 11, a: 1 }; for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; };
  out.primaries = [...document.querySelectorAll('.bsh-btn--primary')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[inert]'); }).length;
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.overflow = `${de.scrollWidth} > ${de.clientWidth}`;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const fg = parse(getComputedStyle(el).color);
      if (fg && !el.closest('[disabled], .is-disabled, :disabled')) {
        const bg = bgOf(el); const f = over(fg, bg);
        const l1 = lum(f), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const large = fs >= 24 || (fs >= 18.66 && parseInt(getComputedStyle(el).fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${ratio.toFixed(2)}:1 ${fs}px "${own.slice(0, 30)}"`);
      }
      const key = `${fs}|${own.slice(0, 24)}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (fs < 12) out.tiny.push(`${fs}px "${own.slice(0, 40)}"`);
        else if (own.length > 45 && fs < 14) out.smallBody.push(`${fs}px "${own.slice(0, 40)}"`);
      }
    }
    if (el.matches('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], summary') && !el.matches('input[type=file]')) {
      const r = el.getBoundingClientRect();
      const hitPseudo = /bsh-btn--sm|bsh-iconbtn--sm|bsh-tab\b|bsh-tag__remove|bsh-page|bsh-check__input|bsh-radio__input|bsh-switch__input/.test(el.className);
      // controls INSIDE the canvas stage scale with the zoom by design (docs/canvas-design.md); every one has a ≥ 44px equivalent in the inspector / menu
      if (el.closest('[data-testid=canvas-stage]')) continue;
      if ((r.height < 43.5 || r.width < 43.5) && !hitPseudo && !(el.type === 'checkbox' || el.type === 'radio')) {
        out.touch.push(`${Math.round(r.width)}x${Math.round(r.height)} <${el.tagName.toLowerCase()}> "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`);
      }
    }
  }
  // canvas lines: contrast ≥ 3:1 against the canvas background, stroke ≥ 1.5px, arrow head ≥ 10px
  const stage = document.querySelector('[data-testid=canvas-stage]');
  if (stage) {
    const sbg = bgOf(stage);
    const kinds = new Set();
    for (const line of document.querySelectorAll('[data-testid=canvas-edges] path[data-line]')) {
      const cs = getComputedStyle(line);
      const kind = line.closest('[data-kind]')?.getAttribute('data-kind') ?? '?';
      if (kinds.has(kind)) continue;
      kinds.add(kind);
      const fg = parse(cs.stroke);
      const dim = line.closest('g')?.classList.contains('opacity-35');
      if (!fg) { out.edges.push(`${kind}: no stroke colour`); continue; }
      const f = over(fg, sbg);
      const ratio = (Math.max(lum(f), lum(sbg)) + 0.05) / (Math.min(lum(f), lum(sbg)) + 0.05);
      if (ratio < 3 && !dim) out.edges.push(`${kind}: ${ratio.toFixed(2)}:1`);
      if (parseFloat(cs.strokeWidth) < 1.5) out.edges.push(`${kind}: stroke ${cs.strokeWidth}`);
      const marker = document.querySelector(`#canvas-arrow-${kind}`);
      if (!marker || parseFloat(marker.getAttribute('markerWidth')) < 10) out.edges.push(`${kind}: arrow head too small`);
    }
  }
  return out;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
let problems = 0;
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + (m.location().url || '')); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const shoot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${size.name}.png`, fullPage: false });
    const r = await page.evaluate(audit);
    const bad = r.overflow || r.tiny.length || r.smallBody.length || r.touch.length || r.contrast.length || r.edges.length || r.primaries > 1;
    if (bad) { problems++; console.log(`\n[${size.name}] ${name}`); if (r.overflow) console.log('  overflow-x:', r.overflow); if (r.primaries > 1) console.log('  primary buttons visible:', r.primaries); for (const k of ['tiny', 'smallBody', 'touch', 'contrast', 'edges']) if (r[k].length) console.log(`  ${k}:`, [...new Set(r[k])].slice(0, 8).join(' | ')); }
  };
  const goTab = async (t) => {
    const mobile = size.width < 768;
    const sel = mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${t.label}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${t.desktopLabel || t.label}")`;
    await page.locator(sel).first().click();
  };
  const closeDialog = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

  await goTab(TABS[0]); await shoot('home');
  // weekly review: three sections one after another, then the summary
  await page.getByRole('button', { name: /بازبینی هفتگی/ }).first().click(); await page.waitForTimeout(200); await shoot('weekly-1');
  for (const n of [2, 3, 4]) { await page.getByRole('dialog').getByRole('button', { name: /دیدم؛ بعدی|جمع‌بندی/ }).click(); await page.waitForTimeout(150); await shoot(`weekly-${n}`); }
  await closeDialog();
  await goTab(TABS[1]); await shoot('context-doc');
  // table view
  await page.locator('[role=radio][aria-label], [role=radio]').filter({ hasText: /^جدول$/ }).first().click(); await shoot('context-table');
  await page.locator('[role=radio]').filter({ hasText: /^سند$/ }).first().click(); await shoot('context-read');
  await page.locator('[role=radio]').filter({ hasText: /^Markdown$/ }).first().click(); await shoot('context-markdown');
  await page.locator('[role=radio]').filter({ hasText: /^ساختار$/ }).first().click();
  // add context dialog
  await page.getByRole('button', { name: /افزودن دانش/ }).first().click(); await shoot('dialog-context'); await closeDialog();

  await goTab(TABS[2]); await shoot('workstreams-create');
  await page.getByRole("tab", { name: /شکاف/ }).click(); await shoot('workstreams-gap');
  await page.getByRole("tab", { name: /^خروجی‌ها/ }).click(); await shoot('workstreams-history');

  await goTab(TABS[3]); await shoot('chat');
  await page.getByRole('button', { name: 'نشست‌های گفتگو' }).first().click(); await shoot('chat-sessions');

  await goTab(TABS[4]); await shoot('assets');

  // everything that is not daily work lives in the account menu (desktop) / account drawer (mobile)
  const mobile = size.width < 768;
  const openAccount = async () => {
    if (mobile) await page.getByRole('button', { name: 'حساب کاربری' }).first().click();
    else await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click();
    await page.waitForTimeout(150);
  };
  const accountItem = async (name) => {
    await openAccount();
    await (mobile ? page.getByRole('dialog').getByRole('button', { name }) : page.getByRole('menuitem', { name })).first().click();
    await page.waitForTimeout(250);
  };
  await openAccount(); await shoot(mobile ? 'drawer-account' : 'menu-account'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await accountItem('مصرف و دفتر کل'); await shoot('ledger');
  // plan / economics tabs exist only when MABDA_MANAGED_AI is on
  const maybe = async (loc, fn) => { if (await loc.count()) await fn(loc.first()); };
  await maybe(page.getByRole('tab', { name: /پلن‌ها و اعتبار/ }), async (l) => { await l.click(); await shoot('ledger-plans'); });
  await maybe(page.getByRole('tab', { name: /خطوط قرمز/ }), async (l) => { await l.click(); await shoot('ledger-economics'); });
  await maybe(page.getByRole('tab', { name: /مصرف و سهمیه/ }), async (l) => { await l.click(); await shoot('ledger-usage'); });

  await accountItem('پلن و ارتقا'); await shoot('dialog-plans'); await closeDialog();
  await accountItem('شروع سریع'); await shoot('dialog-onboarding'); await closeDialog();
  await accountItem('حساب کاربری و داده‌ها'); await shoot('dialog-account'); await closeDialog();
  await accountItem('اتصال به هوش مصنوعی (MCP)'); await shoot('dialog-connect'); await closeDialog();
  // the canvas on the showcase workspace: its four states (relations, board, free, full screen)
  await accountItem('ساخت یا بازنشانی فضای نمونه');
  await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 2500 }).catch(() => {});
  await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
  await page.getByRole('button', { name: 'بستن' }).first().click({ timeout: 800 }).catch(() => {});
  await goTab(TABS[1]);
  await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click());
  const layoutTab = async (name) => { await page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click()); await page.waitForTimeout(500); };
  await page.getByTestId('canvas-stage').waitFor();
  await layoutTab('رابطه‌ها'); await shoot('canvas-relations');
  await page.locator('[data-item-id^="o:"]').first().click({ force: true }).catch(() => {}); await page.waitForTimeout(250); await shoot('canvas-relations-selected');
  await layoutTab('تابلو'); await shoot('canvas-board');
  await layoutTab('آزاد'); await shoot('canvas-free');
  await layoutTab('رابطه‌ها');
  await page.getByTestId('canvas-stage').focus(); await page.keyboard.press('KeyF'); await page.waitForTimeout(400); await shoot('canvas-fullscreen');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  if (errors.length) { problems++; console.log(`\n[${size.name}] console/page errors:`, [...new Set(errors)].slice(0, 6)); }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} view(s) with audit findings` : '\naudit clean');
