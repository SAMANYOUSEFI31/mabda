/**
 * Reading a document into text, server side. Reuses server/files/extract.ts (txt / md / pdf / docx, size cap, Persian errors);
 * only .docx is read differently here: headings and list items must survive as `#` and `- ` (they are the measurable
 * boundary hints of the chunker), which mammoth's raw-text mode throws away.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileExtractError, MAX_FILE_BYTES, extractText } from '../files/extract.ts';

/** the characters of one document we accept (about 400 notes at the import budget); longer: split it */
export const MAX_DOC_CHARS = 300_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const strip = (s: string) => s.replace(/<[^>]+>/g, '');

/** mammoth's simple HTML (h1-h6, p, ul/ol/li, table, br) → text where headings are `#` lines and list items are `- ` lines */
export function htmlToText(html: string): string {
  const s = html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, l: string, t: string) => `\n\n${'#'.repeat(Number(l))} ${strip(t).trim()}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t: string) => `\n- ${strip(t).trim()}`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<\/(p|ul|ol|table|tr|div)>/gi, '\n\n');
  return decode(strip(s)).replace(/[ \t]+\n/g, '\n').replace(/ \| \n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** the one normal form of a document: it is what is stored, hashed, chunked and pointed into */
export const normalizeDocText = (text: string): string =>
  text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export const hashDocText = (normalized: string): string => createHash('sha256').update(normalized, 'utf8').digest('hex');

export interface ReadDoc { text: string; hash: string }

/** a pasted text or a file → its normal text and hash. Throws FileExtractError (Persian) for unreadable / empty / too long. */
export async function readDocument(input: { text?: string; file?: { name: string; buffer: Buffer } }): Promise<ReadDoc> {
  let raw: string;
  if (input.file) {
    const ext = path.extname(input.file.name).toLowerCase();
    if (ext === '.docx') {
      if (input.file.buffer.length > MAX_FILE_BYTES) throw new FileExtractError('حجم فایل بیشتر از ۲۵ مگابایت است.');
      try {
        const mammoth = (await import('mammoth')).default;
        raw = htmlToText((await mammoth.convertToHtml({ buffer: input.file.buffer })).value);
      } catch { throw new FileExtractError('خواندن فایل ممکن نشد؛ ممکن است خراب یا رمزگذاری‌شده باشد.'); }
      if (!raw.trim()) throw new FileExtractError('متنی در فایل پیدا نشد.');
    } else raw = await extractText(input.file.buffer, input.file.name);
  } else raw = String(input.text ?? '');
  const text = normalizeDocText(raw);
  if (!text) throw new FileExtractError('متنی برای وارد کردن نیست.');
  if (text.length > MAX_DOC_CHARS) throw new FileExtractError('سند بیش از حد بلند است؛ آن را در چند بخش وارد کن.');
  return { text, hash: hashDocText(text) };
}
