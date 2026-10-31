import path from 'node:path';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'] as const;

export class FileExtractError extends Error {}

/** Plain text out of txt / md / pdf / docx. Throws FileExtractError with a Persian message. */
export async function extractText(buf: Buffer, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) throw new FileExtractError('فقط فایل‌های txt، md، pdf و docx پشتیبانی می‌شوند.');
  if (buf.length > MAX_FILE_BYTES) throw new FileExtractError('حجم فایل بیشتر از ۲۵ مگابایت است.');
  let text = '';
  try {
    if (ext === '.txt' || ext === '.md') text = buf.toString('utf8').replace(/^﻿/, '');
    else if (ext === '.pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
    } else {
      const mammoth = (await import('mammoth')).default;
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    }
  } catch (e) {
    if (e instanceof FileExtractError) throw e;
    throw new FileExtractError('خواندن فایل ممکن نشد؛ ممکن است خراب یا رمزگذاری‌شده باشد.');
  }
  text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (!text) throw new FileExtractError('متنی در فایل پیدا نشد (اگر اسکن‌شده است، ابتدا OCR کنید).');
  return text;
}
