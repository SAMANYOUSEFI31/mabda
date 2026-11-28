/**
 * Session replay privacy (src/ui/privacy.tsx, docs/test-data.md §Clarity): a primitive shows its label readable in a Clarity
 * replay, so every call site must pass the app's OWN words, or say `personal`. This test reads every .tsx under src with the
 * TypeScript checker and fails on a label it cannot prove to be the app's words.
 *
 * «Provably the app's words»: a string or JSX text; a number or formatNumber(…); a template whose every ${…} is one of these, or
 * sits inside «…» or after «:», «—», «·» (those parts are masked at run time, privacy.tsx → uiParts); a ?:, ??, || or && of
 * these; a const (or a const object's property or entry) whose value is one of these. Anything else, such as a prop or a
 * value from the data, needs `personal` (masked), or an entry in TRUSTED with the reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { uiParts } from './privacy.tsx';

/** which prop of which primitive is shown readable ('children' = the element's JSX children; 'items' = each item's `label`) */
const CHECKED: Record<string, string[]> = {
  Button: ['children'], NavItem: ['label'], Dialog: ['title'], Tabs: ['items'], SegmentedControl: ['items'], BottomNav: ['items'],
  TextField: ['label'], Textarea: ['label'], Select: ['label'], EmptyState: ['title'], ErrorState: ['title'],
  // wrappers that pass a label on to one of the above (their inner use is in TRUSTED: it is checked here, at their call sites)
  MentionTextarea: ['label'], PlacePicker: ['label'], DangerDialog: ['title', 'confirmLabel', 'cancelLabel'],
};

/**
 * Constant tables of the app's own words that a label may read (`NAME.key` or `NAME[key]`), each checked by reading its
 * definition. A table that could ever hold a person's words must never be added here.
 */
export const WORD_TABLES: Record<string, string> = {
  MX: 'src/core/metricsText.ts', CADENCE_FA: 'src/core/metricsText.ts', VERDICT_FA: 'src/core/metricsText.ts',
  THINKING_FA: 'src/core/thinkingMarkers.ts', TYPE_CHIP_FA: 'src/core/knowledgeGuess.ts', LAYOUT_FA: 'src/core/canvasScene.ts',
  LANE_FA: 'src/core/canvasModel.ts',
  // derived: Object.fromEntries(REQUEST_KINDS → label); REQUEST_KINDS is checked as a table of literal labels below
  KIND_LABEL: 'src/core/aiRequest.ts',
};

/**
 * Call sites checked by reading (`file → the expression as written`), with why the value is always the app's words. Keep it
 * short: prefer a literal, a word table, or `personal`.
 */
export const TRUSTED: Array<{ file: string; expr: string; why: string }> = [
  { file: 'src/components/canvas/ContextCanvas.tsx', expr: '{label}', why: 'from the literal list [[\'Fact\', \'واقعیت\'], …] just before it' },
  { file: 'src/components/context/AiRequestDialog.tsx', expr: '{k.label}', why: 'k is an entry of REQUEST_KINDS (literal labels, checked below)' },
  { file: 'src/components/knowledge/ArchiveDialog.tsx', expr: "label: label('knowledge', 'دانش')", why: 'label(k, t) = t, or t with a count' },
  { file: 'src/components/knowledge/ArchiveDialog.tsx', expr: "label: label('removals', 'بخش‌ها')", why: 'label(k, t) = t, or t with a count' },
  { file: 'src/components/knowledge/ArchiveDialog.tsx', expr: "label: label('outputs', 'خروجی‌ها')", why: 'label(k, t) = t, or t with a count' },
  { file: 'src/components/knowledge/ArchiveDialog.tsx', expr: "label: label('workspaces', 'فضاها')", why: 'label(k, t) = t, or t with a count' },
  { file: 'src/components/knowledge/ContextDetailModal.tsx', expr: 'items={KIND_CHIPS}', why: 'KIND_CHIPS: a literal list in the same file' },
  { file: 'src/components/home/HomeSections.tsx', expr: '{button}', why: 'HomeAction.button: every one is a literal in src/core/homeActions.ts, or the literal «افزودن»' },
  { file: 'src/components/outputs/SpecEditorModal.tsx', expr: '{addLabel}', why: 'every caller of Rows passes a literal addLabel' },
  { file: 'src/components/shared/AddKindSwitch.tsx', expr: 'items={ADD_KINDS}', why: 'ADD_KINDS in src/core/addRequest.ts: literal labels' },
  { file: 'src/components/shared/MentionTextarea.tsx', expr: 'label', why: 'checked at its call sites (CHECKED → MentionTextarea)' },
  { file: 'src/components/shared/PlacePicker.tsx', expr: 'label', why: 'checked at its call sites (CHECKED → PlacePicker)' },
  { file: 'src/components/shared/Removal.tsx', expr: 'title', why: 'checked at its call sites (CHECKED → DangerDialog)' },
  { file: 'src/components/shared/Removal.tsx', expr: '{cancelLabel}', why: 'checked at its call sites (CHECKED → DangerDialog)' },
  { file: 'src/components/shared/Removal.tsx', expr: '{confirmLabel}', why: 'checked at its call sites (CHECKED → DangerDialog)' },
  { file: 'src/components/shell/AppNavigation.tsx', expr: '{p.addAction.label}', why: 'pageAction in src/app/shell/useRemovalAndDialogs.tsx: the literal «افزودن»' },
  { file: 'src/components/structure/QuickStartDialog.tsx', expr: 'q.label', why: 'q is an entry of QUESTIONS (the app\'s questions)' },
  { file: 'src/components/thinking/ThinkingSpace.tsx', expr: '{c.label} ({formatNumber(count(c.id))})', why: 'c is an entry of KINDS, a literal list in the same file' },
];

const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.tsx$/.test(p) && !/\.test\./.test(p) ? [p] : []);

/** the end of a balanced {…}, (…) or […] starting at `i` (strings and templates inside are skipped) */
function closing(src: string, i: number): number {
  const open = src[i];
  const close = open === '{' ? '}' : open === '(' ? ')' : ']';
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "'" || c === '"' || c === '`') { j = stringEnd(src, j); continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  return src.length;
}
/** the index of the closing quote of the string or template starting at `i` */
function stringEnd(src: string, i: number): number {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (q === '`' && src[j] === '$' && src[j + 1] === '{') { j = closing(src, j + 1); continue; }
    if (src[j] === q) return j;
  }
  return src.length;
}

const HOLE = '\uE000';
const NUMERIC = /^(formatNumber|formatPercentValue|String|Number|Math\.\w+)\(|\.length$|^\d+$|^[\w.]+\s*[-+*/]\s*\d+$/;

/**
 * Reduces an expression to its shape: every string literal, template, word-table read and number becomes `_`. A template's
 * `${…}` must be a number or a word, or sit inside «…» or after «:», «—», «·» (masked at run time); otherwise → null.
 */
function shape(expr: string): string | null {
  let out = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'" || c === '"') { i = stringEnd(expr, i); out += '_'; continue; }
    if (c === '`') {
      const end = stringEnd(expr, i);
      // the template's text with each ${…} as one placeholder; a hole is masked when uiParts puts it in a person's part
      let text = '';
      const holes: string[] = [];
      for (let j = i + 1; j < end; j++) {
        if (expr[j] === '\\') { text += expr[j + 1]; j++; continue; }
        if (expr[j] === '$' && expr[j + 1] === '{') { const k = closing(expr, j + 1); holes.push(expr.slice(j + 2, k)); text += HOLE; j = k; continue; }
        text += expr[j];
      }
      let h = 0;
      for (const part of uiParts(text)) {
        for (const ch of part.text) {
          if (ch !== HOLE) continue;
          const hole = holes[h++].trim();
          if (!part.person && !(NUMERIC.test(hole) || words(hole))) return null;
        }
      }
      i = end; out += '_'; continue;
    }
    out += c;
  }
  // word tables and numbers
  const tables = Object.keys(WORD_TABLES).join('|');
  if (tables) out = out.replace(new RegExp(`\\b(${tables})(\\.\\w+|\\[[^\\]]*\\])`, 'g'), '_');
  out = out.replace(/\b(formatNumber|formatPercentValue)\((?:[^()]|\([^()]*\))*\)/g, '_').replace(/[\w.]+\.length\b/g, '_').replace(/\b\d+\b/g, '_');
  return out.replace(/\s+as\s+const\b/g, '').replace(/\s+/g, ' ').trim();
}

/** split at a top-level operator (outside brackets) */
function splitTop(s: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0, at = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && s.startsWith(op, i)) { parts.push(s.slice(at, i)); at = i + op.length; i += op.length - 1; }
  }
  parts.push(s.slice(at));
  return parts;
}

/** true when the shaped expression can only produce `_` values: _, c ? T : T, c && T, T ?? T, T || T, T + T, (T) */
function onlyWords(s: string): boolean {
  s = s.trim();
  while (s.startsWith('(') && closing(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
  if (s === '_' || s === 'undefined' || s === 'null' || s === 'false') return true;
  if (/^[A-Za-z_$][\w$]*$/.test(s)) return localConst(s);
  // a ?: binds loosest: the first top-level «?» that is not «??» or «?.»
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === '?' && s[i + 1] !== '?' && s[i + 1] !== '.' && s[i - 1] !== '?') {
      // the matching «:»
      let d = 0, nest = 0;
      for (let j = i + 1; j < s.length; j++) {
        const x = s[j];
        if ('([{'.includes(x)) d++;
        else if (')]}'.includes(x)) d--;
        else if (d === 0 && x === '?' && s[j + 1] !== '?' && s[j + 1] !== '.' && s[j - 1] !== '?') nest++;
        else if (d === 0 && x === ':') { if (nest === 0) return onlyWords(s.slice(i + 1, j)) && onlyWords(s.slice(j + 1)); nest--; }
      }
      return false;
    }
  }
  for (const op of ['??', '||']) { const p = splitTop(s, op); if (p.length > 1) return p.every(onlyWords); }
  const and = splitTop(s, '&&'); if (and.length > 1) return onlyWords(and[and.length - 1]);
  const plus = splitTop(s, '+'); if (plus.length > 1) return plus.every(onlyWords);
  return false;
}

/** the file being read: a bare name is followed to its `const` in the same file (every one of that name must be words) */
let currentSrc = '';
const following = new Set<string>();
function localConst(name: string): boolean {
  if (following.has(name)) return false;
  const re = new RegExp(`\\bconst\\s+${name.replace('$', '\\$')}\\s*(?::[^=]+)?=\\s*`, 'g');
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(currentSrc))) {
    let j = re.lastIndex, depth = 0;
    const start = j;
    for (; j < currentSrc.length; j++) {
      const c = currentSrc[j];
      if (c === "'" || c === '"' || c === '`') { j = stringEnd(currentSrc, j); continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if ((c === ';' || c === '\n') && depth === 0 && !/[?:]\s*$/.test(currentSrc.slice(start, j)) && !/^\s*[?:]/.test(currentSrc.slice(j + 1, j + 40))) break;
    }
    values.push(currentSrc.slice(start, j));
  }
  if (!values.length) return false;
  following.add(name);
  try { return values.every((v) => words(v)); } finally { following.delete(name); }
}

export const words = (expr: string): boolean => { const s = shape(expr); return s !== null && onlyWords(s); };

/** the attributes of the tag opening at `i` (just after its name), and where the opening tag ends */
function readTag(src: string, i: number): { attrs: Record<string, string | true>; end: number; selfClosing: boolean } {
  const attrs: Record<string, string | true> = {};
  while (i < src.length) {
    while (/\s/.test(src[i])) i++;
    if (src[i] === '/' && src[i + 1] === '>') return { attrs, end: i + 2, selfClosing: true };
    if (src[i] === '>') return { attrs, end: i + 1, selfClosing: false };
    if (src[i] === '{') { i = closing(src, i) + 1; continue; } // {...spread}
    const m = /^[\w:-]+/.exec(src.slice(i));
    if (!m) { i++; continue; }
    const name = m[0];
    i += name.length;
    if (src[i] !== '=') { attrs[name] = true; continue; }
    i++;
    if (src[i] === '"' || src[i] === "'") { const e = stringEnd(src, i); attrs[name] = src.slice(i, e + 1); i = e + 1; }
    else if (src[i] === '{') { const e = closing(src, i); attrs[name] = src.slice(i + 1, e).trim(); i = e + 1; }
  }
  return { attrs, end: i, selfClosing: true };
}

/** the `label:` values of an items expression (a literal array, or a .map that returns objects); null when there is no literal */
function itemLabels(expr: string): string[] | null {
  if (!/\blabel\s*:/.test(expr)) return null;
  const out: string[] = [];
  const re = /\blabel\s*:\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) {
    let j = re.lastIndex, depth = 0;
    const start = j;
    for (; j < expr.length; j++) {
      const c = expr[j];
      if (c === "'" || c === '"' || c === '`') { j = stringEnd(expr, j); continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
    out.push(expr.slice(start, j).trim());
  }
  return out;
}

interface Finding { at: string; what: string }
const trusted = (file: string, expr: string) => TRUSTED.some((t) => t.file === file && t.expr === expr);

export function check(files = walk('src').filter((f) => !f.startsWith('src/ui/'))): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    currentSrc = src;
    const re = new RegExp(`<(${Object.keys(CHECKED).join('|')})(?=[\\s/>])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const tag = m[1];
      const { attrs, end, selfClosing } = readTag(src, m.index + m[0].length);
      if (attrs.personal) continue;
      const at = `${file}:${src.slice(0, m.index).split('\n').length} <${tag}>`;
      const bad = (expr: string) => { if (!trusted(file, expr)) out.push({ at, what: expr.replace(/\s+/g, ' ').slice(0, 120) }); };
      for (const prop of CHECKED[tag]) {
        if (prop === 'children') {
          if (selfClosing) continue;
          const close = src.indexOf(`</${tag}>`, end);
          const body = src.slice(end, close);
          if (body.includes('<')) continue; // an element inside: not plain text, stays masked
          // text and {…} together reach the Button as one string (privacy.tsx → isPlainText): read them as one template
          let tpl = '`';
          for (let i = 0; i < body.length; i++) {
            if (body[i] === '{') { const e = closing(body, i); const expr = body.slice(i + 1, e).trim(); if (expr && !expr.startsWith('/*')) tpl += '${' + expr + '}'; i = e; }
            else tpl += body[i] === '`' ? '\\`' : body[i];
          }
          tpl = tpl.replace(/\s+/g, ' ') + '`';
          if (tpl !== '` `' && tpl !== '``' && !words(tpl)) bad(body.trim());
          continue;
        }
        const v = attrs[prop];
        if (v === undefined || v === true || /^["']/.test(v as string) || (v as string).startsWith('<')) continue;
        if (prop === 'items') {
          const labels = itemLabels(v as string);
          if (!labels) { bad(`items={${v}}`); continue; }
          for (const l of labels) if (!l.startsWith('<') && !words(l)) bad(`label: ${l}`);
        } else if (!words(v as string)) bad(v as string);
      }
    }
  }
  return out;
}

test('every readable label in a session replay is the app\'s own words, or marked `personal`', () => {
  const found = check();
  assert.deepEqual(found.map((f) => `${f.at}: ${f.what}`), [], 'a label that may be a person\'s words: add `personal` (it stays masked), or use a literal or a word table');
});

test('every word table holds only literal words', () => {
  for (const [name, file] of Object.entries({ ...WORD_TABLES, REQUEST_KINDS: 'src/core/aiRequest.ts', ADD_KINDS: 'src/core/addRequest.ts' })) {
    if (name === 'KIND_LABEL') continue; // derived from REQUEST_KINDS
    const src = readFileSync(file, 'utf8');
    const m = new RegExp(`export const ${name}\\b[^=]*=\\s*`).exec(src);
    assert.ok(m, `${name} in ${file}`);
    const at = m.index + m[0].length;
    const open = src.slice(at).search(/[{[]/) + at;
    const body = src.slice(open, closing(src, open) + 1).replace(/\/\/[^\n]*/g, '');
    const values = name === 'REQUEST_KINDS' || name === 'ADD_KINDS' ? itemLabels(body) ?? [] : [...body.matchAll(/:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
    assert.ok(values.length > 0, name);
    for (const v of values) assert.ok(/^(['"]).*\1$/.test(v), `${name}: ${v} is not a literal`);
  }
});

test('the shape rules', () => {
  assert.equal(words("'ذخیره'"), true);
  assert.equal(words("copied ? 'کپی شد' : 'کپی'"), true);
  assert.equal(words('`حذف دائمی «${object.title}»`'), true);
  assert.equal(words('`انتقال و اتصال: ${activeObj?.title ?? \'\'}`'), true);
  assert.equal(words('`فایل‌ها (${formatNumber(data.files.length)})`'), true);
  assert.equal(words('step === 1 ? `حذف «${o.title}»` : \'آخرین تأیید\''), true);
  assert.equal(words('object.title'), false);
  assert.equal(words('`ویرایش ${object.title}`'), false);
  assert.equal(words("name ?? 'بی‌نام'"), false);
  assert.equal(words("open && 'بستن'"), true);
});

test('uiParts: a quoted item and everything after «:» stay a person\'s words', () => {
  assert.deepEqual(uiParts('حذف دائمی «سفر شمال»'), [{ text: 'حذف دائمی ', person: false }, { text: '«سفر شمال»', person: true }]);
  assert.deepEqual(uiParts('انتقال و اتصال: قیمت‌گذاری'), [{ text: 'انتقال و اتصال:', person: false }, { text: ' قیمت‌گذاری', person: true }]);
  assert.deepEqual(uiParts('ذخیره'), [{ text: 'ذخیره', person: false }]);
  assert.deepEqual(uiParts('آنچه در «الف» اثر دارد'), [{ text: 'آنچه در ', person: false }, { text: '«الف»', person: true }, { text: ' اثر دارد', person: false }]);
  // an unclosed quote masks to the end
  assert.deepEqual(uiParts('حذف «نیمه'), [{ text: 'حذف ', person: false }, { text: '«نیمه', person: true }]);
  // a name that holds a quote mark or a colon is still masked whole
  assert.deepEqual(uiParts('حذف «الف»ب» از فهرست'), [{ text: 'حذف ', person: false }, { text: '«الف»ب»', person: true }, { text: ' از فهرست', person: false }]);
  assert.deepEqual(uiParts('بایگانی «الف: ب» شد'), [{ text: 'بایگانی ', person: false }, { text: '«الف: ب» شد', person: true }]);
});
