/**
 * متخصص «قاعده»: تکه‌کردن متن بلند برای مدل‌هایی که سقف ورودی دارند (مثلاً E5: ۵۱۲ توکن).
 *
 * قاعدهٔ طراحی: کد فقط روی چیزهای واقعاً قابل‌اندازه‌گیری تصمیم می‌گیرد:
 *   ۱) طول به توکن در برابر سقف مدل؛ ۲) تیتر و بولت صریح؛ ۳) خط خالی؛ ۴) پایان جمله.
 * هیچ شرطی مثل «وسط متن موضوع عوض شد» نداریم (سنجهٔ قابل‌اعتماد ندارد). متن کوتاه‌تر از بودجه همیشه یک تکه است،
 * حتی اگر چندموضوعی باشد؛ متن بلندتر ثابت و بی‌ابهام بریده می‌شود: اول با تیتر، بعد خط خالی، بعد جمله، بعد پنجرهٔ نویسه.
 * هیچ متنی بی‌صدا بریده (truncate) نمی‌شود: مجموع تکه‌ها همهٔ متن است.
 */

export interface TokenMeter { count(text: string): number }

/** سنجش محافظه‌کارانه: توکن ≈ نویسه ÷ charsPerToken، گرد به بالا. با ارزیابی (نسبت توکن واقعی به تخمین) کالیبره می‌شود. */
export const charMeter = (charsPerToken: number): TokenMeter => ({ count: (t) => Math.ceil(t.length / charsPerToken) });

/** ۲: مرز جمله بر فاصله مقدم شد؛ ۳: همپوشانی ~۱۰٪ در برش پنجرهٔ نویسه (مرز تکه‌ها عوض شد، پس embeddingهای ذخیره‌شده دوباره ساخته می‌شوند) */
export const CHUNKER_VERSION = 3;

export interface Chunk { index: number; text: string; tokens: number }

const HEADING = /^\s{0,3}(#{1,6})\s+\S/;
const BULLET = /^\s*(?:[-*•·]|\d+[.)]|[۰-۹]+[.)])\s+\S/;

/**
 * پنجرهٔ نویسه که از ابتدا شروع می‌شود و در نیمهٔ دوم پنجره می‌بُرد، به ترتیب ترجیح: پایان خط یا جمله (. ؟ ? ! ؛ ;)،
 * سپس ویرگول (، ,)، سپس فاصله؛ فقط اگر هیچ‌کدام در نیمهٔ دوم نبود، سر حد پنجره. پیش‌تر همهٔ مرزها با هم مقایسه می‌شدند و
 * آخرین «فاصله» تقریباً همیشه برنده بود، پس مرز جمله عملاً ترجیحی نداشت (بررسی دوم بیرونی، الگوریتم ۷).
 */
export function cutWindow(text: string, maxChars: number): [string, string] {
  if (text.length <= maxChars) return [text, ''];
  const window = text.slice(0, maxChars);
  const last = (marks: string[]) => Math.max(...marks.map((m) => window.lastIndexOf(m)));
  const half = maxChars * 0.5;
  const tiers = [['\n'], ['. ', '؟ ', '? ', '! ', '؛ ', '; '], ['، ', ', '], [' ']];
  let at = maxChars;
  for (const marks of tiers) { const i = last(marks); if (i > half) { at = i + 1; break; } }
  return [text.slice(0, at).trim(), text.slice(at).trim()];
}

const OVERLAP_RATIO = 0.1;

/** انتهای `text` به طول حداکثر `max` نویسه، شروع‌شده از آغاز یک واژه (وسط واژه نمی‌بُرد)؛ اگر مرز واژه‌ای نبود، خالی */
export function overlapTail(text: string, max: number): string {
  if (max < 2 || text.length <= 1) return '';
  const tail = text.slice(-max);
  const sp = tail.indexOf(' ');
  if (text.length <= max || sp < 0) return '';
  return tail.slice(sp + 1).trim();
}

/** تیتر صریح مارک‌داون: هر تیتر یک بخش جدید را آغاز می‌کند */
export function splitByHeadings(text: string): string[] {
  const parts: string[] = [];
  let cur: string[] = [];
  for (const line of text.split('\n')) {
    if (HEADING.test(line) && cur.some((l) => l.trim())) { parts.push(cur.join('\n').trim()); cur = []; }
    cur.push(line);
  }
  if (cur.some((l) => l.trim())) parts.push(cur.join('\n').trim());
  return parts;
}

const splitByBlankLines = (text: string): string[] => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** بولت‌های صریح پشت هم یک بلوک‌اند؛ هر بولت می‌تواند مرز باشد */
function splitByBullets(text: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of text.split('\n')) {
    if (BULLET.test(line) && cur.length) { out.push(cur.join('\n').trim()); cur = []; }
    cur.push(line);
  }
  if (cur.length) out.push(cur.join('\n').trim());
  return out.filter(Boolean);
}

/**
 * متن را به تکه‌هایی می‌شکند که هرکدام در `budgetTokens` (طبق `meter`) جا شوند.
 * با `overlap` هر پنجرهٔ نویسه با انتهای قبلی شروع می‌شود (برای embedding)؛ بدون آن تکه‌ها افراز بدون تکرارند (واردکردن سند).
 * تکه‌های کوچک‌ِ همسایه تا سقف بودجه به هم می‌چسبند تا تکه‌ها ریز نشوند؛ ترتیب متن حفظ می‌شود.
 */
export function chunkByStructure(input: string, budgetTokens: number, meter: TokenMeter, opts: { overlap?: boolean } = {}): Chunk[] {
  const overlapRatio = opts.overlap ? OVERLAP_RATIO : 0; // همپوشانی فقط برای embedding؛ واردکردن سند باید متن را بدون تکرار افراز کند
  const text = input.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  if (!(budgetTokens > 0)) throw new RangeError('budgetTokens باید مثبت باشد');
  if (meter.count(text) <= budgetTokens) return [{ index: 0, text, tokens: meter.count(text) }];

  const pieces: string[] = [];
  const fit = (s: string): boolean => meter.count(s) <= budgetTokens;
  const emit = (s: string, level: number): void => {
    const t = s.trim();
    if (!t) return;
    if (fit(t)) { pieces.push(t); return; }
    if (level === 0) { splitByHeadings(t).length > 1 ? splitByHeadings(t).forEach((p) => emit(p, 1)) : emit(t, 1); return; }
    if (level === 1) { const p = splitByBlankLines(t); p.length > 1 ? p.forEach((x) => emit(x, 2)) : emit(t, 2); return; }
    if (level === 2) { const p = splitByBullets(t); p.length > 1 ? p.forEach((x) => emit(x, 3)) : emit(t, 3); return; }
    // آخرین راه: پنجرهٔ نویسه بر اساس بودجهٔ توکن
    // هر پنجرهٔ بعدی با انتهای پنجرهٔ قبلی (~۱۰٪، از مرز واژه) شروع می‌شود تا جمله‌ای که وسطش بریده شد در هر دو تکه معنا داشته باشد
    let rest = t;
    let maxChars = Math.max(1, Math.floor((t.length * budgetTokens) / Math.max(1, meter.count(t))));
    let prev = '';
    while (rest) {
      let lead = overlapTail(prev, Math.floor(maxChars * overlapRatio));
      let [head, tail] = cutWindow(rest, Math.max(1, maxChars - lead.length));
      let piece = lead ? `${lead} ${head}` : head;
      while (piece.length > 1 && !fit(piece)) {
        maxChars = Math.max(1, Math.floor(maxChars * 0.8));
        lead = overlapTail(prev, Math.floor(maxChars * overlapRatio));
        [head, tail] = cutWindow(rest, Math.max(1, maxChars - lead.length));
        piece = lead ? `${lead} ${head}` : head;
      }
      pieces.push(piece || rest.slice(0, 1));
      prev = head;
      rest = head ? tail : rest.slice(1).trim();
    }
  };
  emit(text, 0);

  const chunks: Chunk[] = [];
  let cur = '';
  const flush = () => { if (cur) { chunks.push({ index: chunks.length, text: cur, tokens: meter.count(cur) }); cur = ''; } };
  for (const p of pieces) {
    const joined = cur ? `${cur}\n\n${p}` : p;
    if (cur && !fit(joined)) flush();
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  flush();
  return chunks;
}
