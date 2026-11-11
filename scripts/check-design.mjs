#!/usr/bin/env node
/**
 * check:design — fails when UI source bypasses Mabda's semantic tokens (src/ui/tokens, docs/design-system/tokens.md).
 *
 * Flags (in src/** and index.html):
 *   hex        raw hex colors                           #09090b
 *   color-fn   rgb()/rgba()/hsl()/oklch()
 *   arbitrary  Tailwind arbitrary values                bg-[#fff]  text-[10px]  max-h-[90vh]   (var(--token) is allowed)
 *   palette    Tailwind default palette / white / black bg-zinc-900  text-white  border-red-500
 *   raw-var    raw DS palette variables                 var(--neutral-800)  var(--crimson-600)  var(--white-a8)
 *   physical   left/right instead of logical props      ml-2  pr-4  text-right  left-0  marginLeft  border-l
 *   motion     raw ms / ease keywords in transition or animation; duration-150, ease-out
 *   scale      non-token scales                         p-4  gap-2  w-8  text-xs  font-medium  italic  shadow-md
 *
 * Only the generated token files (src/ui/tokens/build/) contain raw values; they are never scanned (src/ui/tokens.test.ts
 * proves they equal the DTCG source). Primitive palette names (ink, lapis, …) exist only in JSON, never as CSS variables.
 * Usage: node scripts/check-design.mjs [--list-rules]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['src', 'index.html'];
const EXT = new Set(['.ts', '.tsx', '.css', '.html']);
const SKIP_DIR = new Set(['node_modules', 'dist']);
const SKIP_PATH = /^src\/ui\/tokens\/build\//;

const PALETTE = '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|crimson|vermilion|ink|lapis|verdigris|ochre|brick|petrol)';
const COLOR_PREFIX = '(?:bg|text|border|border-[xytblrse]|divide|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|decoration|accent|caret|placeholder)';
const SPACING_PREFIX = '(?:p|px|py|pt|pb|ps|pe|m|mx|my|mt|mb|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|bottom|start|end|basis)';

const rules = [
  // ---- raw-line rules ----
  { id: 'hex', line: true, re: /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b(?!-)/g, msg: 'raw hex color — use a semantic token' },
  { id: 'color-fn', line: true, re: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g, msg: 'color function — use a semantic token' },
  { id: 'raw-var', line: true, re: /var\(--(?:neutral|crimson|vermilion|amber|emerald|sky|ink|lapis|verdigris|ochre|brick|petrol)-(?:\d+|a\d+)\)|var\(--white(?:-a\d+)?\)/g, msg: 'raw palette variable — use surface-*/bg-*/text-*/border-* tokens' },
  { id: 'arbitrary', line: true, re: /(?<![\w-])!?-?[a-z][a-z0-9-]*-\[(?![^\]]*var\(--)[^\]\s]+\]/g, msg: 'Tailwind arbitrary value — use a token utility' },
  { id: 'physical', line: true, re: /\b(?:margin|padding)(?:Left|Right)\b|\bborder(?:Left|Right)\b|\b(?:left|right)\s*:\s*[^;,}]|(?:^|[;{\s])(?:margin|padding|border)-(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)|\btextAlign\s*:\s*['"](?:left|right)['"]|(?<![\w-])(?:left|right)\s*:\s*\d/g, msg: 'physical left/right — use logical properties' },
  { id: 'ai-icon', line: true, re: /\b(?:Sparkles?|Wand2?|WandSparkles|Zap|Brain|BrainCircuit|Bot|Stars)\b/g, msg: 'AI-magic icon — forbidden (docs/design-system/iconography.md, «ممنوع»); say it in words' },
  { id: 'motion', line: true, re: /\b(?:transition|animation)(?:-duration|-delay|-timing-function)?\s*:[^;}]*?(?:(?<![\w-])\d+(?:\.\d+)?m?s\b|(?<![\w-])(?:ease|ease-in|ease-out|ease-in-out)(?![\w-]))/g, msg: 'raw duration or easing — use --duration-* / --ease-* (docs/design-system/motion.md)' },
  // ---- token (class) rules ----
  { id: 'motion', tok: /^(?:duration|delay)-\d+$|^ease-(?:in|out|in-out)$/, msg: 'Tailwind duration/easing scale — use duration-fast / duration-base (motion.md)' },
  { id: 'brand', ctx: /./, notIn: /^src\/ui\//, tok: /(?:^|-)(?:bg|text|border|icon)-brand(?:-\S+)?$/, msg: 'brand color outside src/ui — brand is only for the primary Button / BrandMark (never error, warning, selection or link)' },
  { id: 'palette', tok: new RegExp(`^${COLOR_PREFIX}-(?:${PALETTE}-\\d{2,3}|white|black)(?:/\\d+)?$`), msg: 'Tailwind palette color — use a semantic token' },
  { id: 'palette', tok: /^(?:bg|text|border|fill|stroke)-(?:white|black)(?:\/\d+)?$/, msg: 'white/black — use a semantic token' },
  { id: 'physical', tok: /^(?:-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-\S+|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right)|border-[lr](?:-\S+)?|rounded-(?:l|r|tl|tr|bl|br)(?:-\S+)?|-?translate-x-\S+|space-x-reverse|divide-x-reverse|origin-(?:left|right)\S*)$/, msg: 'physical left/right — use ms/me/ps/pe/start/end/text-start/text-end/border-s/e/rounded-s/e' },
  { id: 'scale', tok: new RegExp(`^-?${SPACING_PREFIX}-(?:\\d+(?:\\.\\d+)?|px)$`), msg: 'numeric scale — use space-*/inset-*/stack-*/inline-*/control-*/icon-* tokens' },
  { id: 'scale', tok: /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/, msg: 'Tailwind text size — use text-body-md / label-md / heading-* etc.' },
  { id: 'scale', ctx: /class|@apply/, tok: /^(?:shadow|rounded)$/, msg: 'bare shadow/rounded — use shadow-raised|overflow|overlay and rounded-control|container|overlay|pill' },
  { id: 'scale', tok: /^(?:font-(?:thin|extralight|light|extrabold|black)|italic|not-italic|text-justify|tracking-(?:tighter|tight|normal|wide|wider|widest)|leading-(?:\d+|none|loose))$/, msg: 'type rule: weights 400/500/600/700 only, no italics, no justify, letter-spacing 0' },
  { id: 'scale', tok: /^(?:shadow-(?:xs|sm|md|lg|xl|2xl|inner|none)|backdrop-blur(?:-\S+)?|blur(?:-\S+)?|drop-shadow(?:-\S+)?|z-\d+)$/, msg: 'non-token shadow/radius/blur/z-index — use shadow-raised|overflow|overlay, rounded-*, z-dialog …' },
];

function* walk(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (SKIP_DIR.has(name)) continue;
      yield* walk(join(path, name));
    }
  } else if (EXT.has(extname(path))) yield path;
}

function stripVariants(token) {
  let t = token;
  // drop variant prefixes (hover:, md:, [&>*]:, group-hover: …) and important/negative markers
  for (;;) {
    const m = t.match(/^(?:\[[^\]]*\]|[a-z0-9-]+(?:\/[a-z0-9-]+)?):(?=\S)/);
    if (!m) break;
    t = t.slice(m[0].length);
  }
  return t.replace(/^!/, '');
}

const findings = [];
for (const target of TARGETS) {
  const abs = join(ROOT, target);
  try { statSync(abs); } catch { continue; }
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file).replaceAll(sep, '/'); // one path style on every OS (the rules match «src/ui/»)
    if (SKIP_PATH.test(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // `theme-color` meta cannot use var(); it is the one documented raw value (same as the DS brief).
      // `check:design-ignore` pragma: for APIs that force a physical key (e.g. recharts margin). Use sparingly.
      const exempt = /name="theme-color"|check:design-ignore/.test(line);
      for (const rule of rules) {
        if (rule.line) {
          if (exempt) continue;
          rule.re.lastIndex = 0;
          let m;
          while ((m = rule.re.exec(line))) {
            findings.push({ rel, line: i + 1, col: m.index + 1, id: rule.id, msg: rule.msg, snippet: m[0].trim() });
            if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
          }
        }
      }
      // class-token rules
      if (!exempt) {
        const tokens = line.split(/[\s"'`{}()<>=,;]+/);
        for (const raw of tokens) {
          if (!raw || raw.length > 80) continue;
          const t = stripVariants(raw);
          for (const rule of rules) {
            if (rule.tok && rule.tok.test(t) && (!rule.ctx || rule.ctx.test(line)) && (!rule.notIn || !rule.notIn.test(rel))) {
              findings.push({ rel, line: i + 1, col: line.indexOf(raw) + 1, id: rule.id, msg: rule.msg, snippet: raw });
              break;
            }
          }
        }
      }
    });
  }
}

// de-duplicate identical (file,line,snippet,id)
const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.rel}:${f.line}:${f.id}:${f.snippet}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (process.argv.includes('--summary')) {
  const byId = {};
  for (const f of unique) byId[f.id] = (byId[f.id] || 0) + 1;
  console.log(byId);
  const byFile = {};
  for (const f of unique) byFile[f.rel] = (byFile[f.rel] || 0) + 1;
  console.log(byFile);
}

if (unique.length) {
  if (!process.argv.includes('--summary')) {
    for (const f of unique) console.error(`${f.rel}:${f.line}:${f.col}  [${f.id}]  ${f.snippet}  — ${f.msg}`);
  }
  console.error(`\ncheck:design FAILED — ${unique.length} violation(s)`);
  process.exit(1);
}
console.log('check:design OK — 0 violations');
