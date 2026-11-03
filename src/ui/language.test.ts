/**
 * The language test (docs/design-principles.md → «واژه‌های ممنوع»): no screen shows the machinery's words. It reads every string
 * and JSX text of src/App.tsx, src/components and src/ui with the TypeScript parser and fails on a banned word.
 * A word that must stay somewhere goes to EXCEPTIONS with the reason — the list is short on purpose.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Banned { re: RegExp; word: string; say: string }
/** the banned words and what to say instead (src/ui/bannedWords.json: shared with scripts/scenario-first3.mjs; the same table is in docs/design-principles.md) */
export const BANNED: Banned[] = (JSON.parse(readFileSync('src/ui/bannedWords.json', 'utf8')) as Array<{ pattern: string; flags: string; word: string; say: string }>).map((b) => ({ re: new RegExp(b.pattern, b.flags), word: b.word, say: b.say }));

/** where a banned word may stay, and why. Keep it short. */
export const EXCEPTIONS: Array<{ file: string; includes: string; why: string }> = [];

const ROOTS = ['src/App.tsx', 'src/components', 'src/ui'];
const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.tsx$/.test(p) ? [p] : []);
const PERSIAN = /[؀-ۿ]/;

/**
 * every piece of text a person can read in a file: string literals and template text with Persian in them, and JSX text.
 * A small scanner (no TypeScript API: the toolchain's compiler has none) that skips comments and reads `${…}` holes as code.
 */
export function uiTexts(_file: string, source = readFileSync(_file, 'utf8')): string[] {
  const out: string[] = [];
  const add = (t: string) => { if (PERSIAN.test(t)) out.push(t); };
  let i = 0;
  const n = source.length;
  const readQuoted = (q: string) => { let t = ''; i++; while (i < n && source[i] !== q && source[i] !== '\n') { if (source[i] === '\\') { t += source[i + 1] ?? ''; i += 2; } else t += source[i++]; } i++; return t; };
  // a template is read as ONE text (its static parts joined): «وضعیت ${x} Proposed» is Persian text with a Latin end
  const readTemplate = () => {
    let t = ''; i++;
    while (i < n && source[i] !== '`') {
      if (source[i] === '\\') { t += source[i + 1] ?? ''; i += 2; }
      else if (source[i] === '$' && source[i + 1] === '{') { t += ' _ '; i += 2; let depth = 1; while (i < n && depth > 0) { const c = source[i]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === "'" || c === '"') { add(readQuoted(c)); continue; } else if (c === '`') { readTemplate(); continue; } i++; } }
      else t += source[i++];
    }
    i++; add(t);
  };
  while (i < n) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; }
    else if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; }
    else if (c === "'" || c === '"') add(readQuoted(c));
    else if (c === '`') readTemplate();
    else if (c === '>' && source[i - 1] !== '=' && source[i - 1] !== '-') { // JSX text between a tag's > and the next < or {
      let j = i + 1; let t = '';
      while (j < n && source[j] !== '<' && source[j] !== '{' && source[j] !== '\n') t += source[j++];
      if (/^[^;=()]*$/.test(t)) add(t);
      i++;
    } else i++;
  }
  return out;
}

export function violations(file: string, source?: string): Array<{ file: string; text: string; word: string; say: string }> {
  const bad: Array<{ file: string; text: string; word: string; say: string }> = [];
  for (const text of uiTexts(file, source)) {
    for (const b of BANNED) {
      if (!b.re.test(text)) continue;
      if (EXCEPTIONS.some((e) => file.endsWith(e.file) && text.includes(e.includes))) continue;
      bad.push({ file, text: text.trim().slice(0, 80), word: b.word, say: b.say });
    }
  }
  return bad;
}

test('the checker itself: finds a banned word in a Persian string, in JSX text and in a template; ignores code', () => {
  const src = "const a = 'ثبت شیء جدید'; const b = <p>این Object را ببین</p>; const c = `وضعیت ${x} Proposed`; const d = Object.keys(y); const e = 'Confirmed';";
  const words = violations('x.tsx', src).map((v) => v.word);
  assert.deepEqual(words.sort(), ['Object', 'Proposed', 'شیء'].sort());
});

test('no screen shows the words of the machinery', () => {
  const all = ROOTS.flatMap(walk).flatMap((f) => violations(f));
  const report = all.map((v) => `${v.file}: «${v.text}» — «${v.word}» → ${v.say}`).join('\n');
  assert.equal(all.length, 0, `\n${report}\n`);
});

test('every exception says why, and still applies (a stale exception is removed)', () => {
  for (const e of EXCEPTIONS) {
    assert.ok(e.why.length > 10, `${e.file}: explain the exception`);
    const f = ROOTS.flatMap(walk).find((p) => p.endsWith(e.file));
    assert.ok(f && readFileSync(f, 'utf8').includes(e.includes), `${e.file}: «${e.includes}» no longer exists`);
  }
});
