#!/usr/bin/env node
/**
 * Screenshot every main view at 390px and 1280px into docs/screens/ and print layout audit findings
 * (horizontal overflow, text < 12px, long text < 14px, touch targets < 44px, physical-direction misplacement).
 * Usage: node scripts/screens.mjs [baseUrl]   (default http://localhost:3100)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = process.env.SCREENS_OUT || 'docs/screens';
mkdirSync(OUT, { recursive: true });

const SIZES = process.env.ALL_WIDTHS
  ? [[320, 640], [360, 740], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [1280, 900], [1440, 900], [1920, 1080]].map(([width, height]) => ({ name: String(width) + (width > height ? 'l' : ''), width, height }))
  : [{ name: '390', width: 390, height: 844 }, { name: '1280', width: 1280, height: 900 }];
const TABS = [
  { id: 'home', label: 'خانه' },
  { id: 'context', label: 'منبع', desktopLabel: 'منبع حقیقت' },
  { id: 'workstreams', label: 'خروجی‌ها', then: 'build' },
  { id: 'assets', label: 'خروجی‌ها' },
  { id: 'thinking', label: 'فکر' },
];

const audit = () => {
  const out = { overflow: null, tiny: [], smallBody: [], touch: [], contrast: [], edges: [], canvas: [], primaries: 0, dimmedChecked: 0 };
  // contrast: composite ancestor backgrounds, compare with text color (WCAG relative luminance)
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); let bg = { r: 9, g: 9, b: 11, a: 1 }; for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; };
  out.primaries = [...document.querySelectorAll('.bsh-btn--primary')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[inert]'); }).length;
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((e) => (e.getBoundingClientRect().right > de.clientWidth + 1 || e.getBoundingClientRect().left < -1) && e.getBoundingClientRect().width > 0 && !e.closest('[data-testid=canvas-stage]')).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}[${(e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20)}]`);
    out.overflow = `${de.scrollWidth} > ${de.clientWidth} ← ${wide.join(' | ')}`;
  }
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const fg = parse(getComputedStyle(el).color);
      // transparency of any ancestor (opacity-*) lowers the real contrast too — it is part of the measurement
      if (fg) { let op = 1; for (let a = el; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity); fg.a *= op; }
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
  // canvas toolbar: controls are GROUPED (view · history · camera · note · details · «⋯»); more than 9 loose children means it grew back into a bar
  const tb = document.querySelector('[data-testid=canvas-toolbar]');
  if (tb && vis(tb)) {
    const controls = [...tb.children].filter((c) => vis(c) && !c.hasAttribute('data-toolbar-overflow'));
    if (controls.length > 9) out.canvas.push(`toolbar shows ${controls.length} groups/controls (max 9)`);
  }
  // focus mode: a card outside the selection is quieter by background and border — its title must stay readable (≥ 3:1, opacity counted)
  for (const t of document.querySelectorAll('[data-dimmed=true] [data-card-title]')) {
    if (!vis(t)) continue;
    out.dimmedChecked++;
    const fg = parse(getComputedStyle(t).color); let op = 1;
    for (let a = t; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity);
    if (!fg) continue;
    fg.a *= op; const bg = bgOf(t); const f = over(fg, bg);
    const ratio = (Math.max(lum(f), lum(bg)) + 0.05) / (Math.min(lum(f), lum(bg)) + 0.05);
    if (ratio < 3) out.canvas.push(`dimmed card title ${ratio.toFixed(2)}:1 "${t.textContent.trim().slice(0, 24)}"`);
  }
  // inspector first view: one plain sentence, at most two actions
  const ins = document.querySelector('[data-testid=inspector-object]');
  if (ins && vis(ins)) {
    if (!ins.querySelector('[data-testid=inspector-about]')) out.canvas.push('inspector: no plain sentence');
    const acts = [...(ins.querySelector('[data-testid=inspector-actions]')?.querySelectorAll('button') ?? [])].filter(vis);
    if (acts.length > 2) out.canvas.push(`inspector shows ${acts.length} actions (max 2)`);
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
    if (r.dimmedChecked) console.log(`  [${size.name}] ${name}: ${r.dimmedChecked} dimmed card titles measured`);
    const bad = r.overflow || r.tiny.length || r.smallBody.length || r.touch.length || r.contrast.length || r.edges.length || r.canvas.length || r.primaries > 1;
    if (bad) { problems++; console.log(`\n[${size.name}] ${name}`); if (r.overflow) console.log('  overflow-x:', r.overflow); if (r.primaries > 1) console.log('  primary buttons visible:', r.primaries); for (const k of ['tiny', 'smallBody', 'touch', 'contrast', 'edges', 'canvas']) if (r[k].length) console.log(`  ${k}:`, [...new Set(r[k])].slice(0, 8).join(' | ')); }
  };
  const goTab = async (t) => {
    const mobile = size.width < 768;
    const sel = mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${t.label}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${t.desktopLabel || t.label}")`;
    await page.locator(sel).first().click();
    if (t.then === 'build') await page.getByTestId('outputs-build').getByRole('button', { name: /^بساز/ }).first().click();
  };
  const closeDialog = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

  await goTab(TABS[0]); await shoot('home');
  // weekly review: three sections one after another, then the summary
  await page.getByRole('button', { name: 'بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'بازبینی هفتگی' }).click(); await page.waitForTimeout(200); await shoot('weekly-1');
  for (const n of [2, 3, 4]) { await page.getByRole('dialog').getByRole('button', { name: /دیدم؛ بعدی|جمع‌بندی/ }).click(); await page.waitForTimeout(150); await shoot(`weekly-${n}`); }
  await closeDialog();
  await goTab(TABS[1]); await shoot('context-doc');
  // table view
  await page.getByRole('button', { name: 'نماهای بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'جدول' }).click(); await shoot('context-table');
  await page.locator('[role=radio]').filter({ hasText: /^سند$/ }).first().click(); await shoot('context-read');
  await page.locator('[role=radio]').filter({ hasText: /^Markdown$/ }).first().click(); await shoot('context-markdown');
  await page.locator('[role=radio]').filter({ hasText: /^ساختار$/ }).first().click();
  // add context dialog
  await page.getByRole('button', { name: /افزودن دانش/ }).first().click(); await shoot('dialog-context'); await closeDialog();

  await goTab(TABS[2]); await shoot('workstreams-create');
  await page.getByRole("tab", { name: /چه چیزی کم است/ }).click(); await shoot('workstreams-gap');
  await page.getByRole("tab", { name: /^خروجی‌ها/ }).click(); await shoot('workstreams-history');

  await goTab(TABS[3]); await shoot('assets');

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
  await accountItem('حساب و داده‌ها'); await shoot('dialog-account'); await closeDialog();
  await accountItem('اتصال به هوش مصنوعی (MCP)'); await shoot('dialog-connect');
  await page.getByRole('dialog').getByRole('button', { name: 'ساخت کلید' }).click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(400); await shoot('dialog-connect-2'); await closeDialog();
  // the canvas on the showcase workspace: its four states (relations, board, free, full screen)
  await accountItem('ساخت یا بازنشانی فضای نمونه');
  await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 2500 }).catch(() => {});
  await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
  await page.getByRole('button', { name: 'بستن' }).first().click({ timeout: 800 }).catch(() => {});
  await goTab(TABS[1]);
  // «واردِ یک بخش شدن»: a section alone, a sub-section deeper, then back out with the on-screen button
  await page.getByRole('button', { name: /^رفتن به بخش/ }).first().click(); await shoot('context-focus');
  await page.getByTestId('sub-section').first().click(); await shoot('context-focus-deep');
  await page.getByRole('button', { name: /^برگشت به/ }).first().click(); await page.getByRole('button', { name: /^برگشت به/ }).first().click({ timeout: 1500 }).catch(() => {});
  await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click());
  const layoutTab = async (name) => { await page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click()); await page.waitForTimeout(500); };
  await page.getByTestId('canvas-stage').waitFor();
  await page.waitForTimeout(500); await shoot('canvas-relations');
  await page.locator('[data-item-id^="o:"]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(350); await shoot('canvas-relations-selected');
  await page.getByTestId('canvas-inspector').getByRole('button', { name: /^به چه چیزی وابسته است/ }).click({ timeout: 2000 }).catch(() => {}); await page.getByTestId('canvas-inspector').getByRole('button', { name: /^چه چیزی روی آن سوار است/ }).click({ timeout: 2000 }).catch(() => {}); await shoot('canvas-inspector-open');
  // the thinking canvas: «آزاد» (with the tray) and «تابلو»
  await goTab(TABS[4]); await shoot('thinking-list');
  await page.locator('[role=radio]').filter({ hasText: /^بوم$/ }).first().evaluate((n) => n.click());
  await page.getByTestId('canvas-stage').waitFor();
  await shoot('canvas-free');
  await layoutTab('تابلو'); await shoot('canvas-board');
  await goTab(TABS[1]);
  await page.getByTestId('canvas-stage').focus(); await page.keyboard.press('KeyF'); await page.waitForTimeout(400); await shoot('canvas-fullscreen');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // the showcase's outputs (two are «به‌روز نیست») and the workflow page with its questions
  await goTab(TABS[3]); await shoot('assets-demo');
  await goTab(TABS[2]); await shoot('workstreams-demo');
  // the removal model: the node delete dialog (plan, tree after, what stops reaching whom) and the archive
  await goTab(TABS[1]);
  await page.locator('[role=radio]').filter({ hasText: /^ساختار$/ }).first().click();
  await page.getByRole('button', { name: 'عملیات گرهٔ کارگاه برشته‌کاری' }).first().click();
  await page.getByRole('menuitem', { name: 'حذف' }).click();
  await page.getByTestId('node-delete').waitFor(); await page.waitForTimeout(300);
  await shoot('dialog-node-delete'); await closeDialog();
  await accountItem('بایگانی و حذف‌های اخیر'); await page.waitForTimeout(500); await shoot('dialog-archive'); await closeDialog();
  // «درخواست برای AI» on the showcase: «ممیزی» + one line, scoped to the whole tree (the preview is the exact text that is copied)
  await goTab(TABS[0]);
  await shoot('home-demo');
  await page.locator('button[aria-controls="home-all"]').click(); await page.waitForTimeout(250); await shoot('home-all');
  await page.locator('button[aria-controls="home-all"]').click();
  await page.getByRole('button', { name: 'درخواست برای AI' }).first().click();
  await page.getByRole('dialog').getByRole('radio', { name: 'ممیزی' }).click();
  await page.locator('#ai-request-line').fill('طرح تخفیف پاییز با قیدهای ما جور است؟');
  await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] textarea[readonly]')].some((t) => t.value.includes('تخفیف پاییز')));
  await shoot('dialog-request'); await closeDialog();
  // «بسته‌های دانش»: a pack being built, with the live preview (what comes, from where, what did not and why)
  await goTab(TABS[0]);
  await page.getByRole('button', { name: 'بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'بسته‌های دانش' }).click();
  await page.getByRole('button', { name: 'بستهٔ تازه' }).click();
  await page.getByRole('dialog').getByLabel('نام بسته').fill('پاسخ به مشتری');
  await page.getByRole('dialog').getByRole('checkbox', { name: /^(— )*پشتیبانی و پس از فروش$/ }).evaluate((n) => n.click());
  await page.getByTestId('explain-group-guardrail').waitFor(); await page.waitForTimeout(500);
  await shoot('dialog-pack-edit'); await closeDialog();
  // the global search: a few letters, grouped results (the keyboard shortcut on desktop, the header button on phones)
  if (mobile) await page.getByRole('button', { name: 'جستجو' }).first().click(); else await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'جستجو' }).fill('قیم');
  await page.locator('[role=dialog] [role=option]').first().waitFor();
  await shoot('dialog-search'); await closeDialog();
  if (errors.length) { problems++; console.log(`\n[${size.name}] console/page errors:`, [...new Set(errors)].slice(0, 6)); }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} view(s) with audit findings` : '\naudit clean');
