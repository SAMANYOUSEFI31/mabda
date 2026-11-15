/**
 * RES-03 measurement: does reading a large document make other people wait? Starts the app in memory, sends the largest
 * document the import accepts (and five of them at once), and meanwhile asks the server for something small every 10 ms.
 * Prints how long the other request waited at most. Run: `npx tsx scripts/measure-docload.ts` (PARAS=2000 by default).
 * Result on 2026-11-15 (cloud container, 2000 paragraphs ≈ 456 KB .docx): one preview 227 ms, others waited ≤ 14 ms;
 * five at once 531 ms, others waited ≤ 135 ms. PDF parsing yields to the event loop (300 pages: 1.6 s, no stall).
 */
import Database from 'better-sqlite3';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import { createApp } from '../server/app.ts';
import { migrate } from '../server/db/migrations.ts';
async function docx(n: number) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const p = (t: string, h?: boolean) => `<w:p>${h ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${Array.from({ length: n }, (_, i) => p(i % 12 === 0 ? `بخش ${i}` : `بند شمارهٔ ${i}: اشتراک ماهانه ۴۹۰ هزار تومان است و ارسال رایگان دارد؛ مشتری‌ها فریلنسرهای ایرانی‌اند.`, i % 12 === 0)).join('')}</w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}
const db = new Database(':memory:'); migrate(db);
const { app } = createApp(db);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
const j = async (m: string, p: string, b?: unknown) => (await fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json() as any;
const ws = (await j('POST', '/bootstrap', {})).workspaces[0].id;
const paras = Number(process.env.PARAS ?? 2000);
const buf = await docx(paras);
async function probe(label: string, work: () => Promise<unknown>) {
  let max = 0, n = 0, stop = false;
  const loop = (async () => { while (!stop) { const s = performance.now(); await fetch(base + '/session'); max = Math.max(max, performance.now() - s); n++; await new Promise((r) => setTimeout(r, 10)); } })();
  const s = performance.now(); const r = await work(); const d = performance.now() - s; stop = true; await loop;
  console.log(`${label}: ${d.toFixed(0)} ms; another person's request waited at most ${max.toFixed(0)} ms (${n} probes)`, typeof r === 'object' && r && 'error' in (r as any) ? JSON.stringify((r as any).error).slice(0, 120) : '');
}
const form = () => { const f = new FormData(); f.set('file', new Blob([new Uint8Array(buf)]), 'big.docx'); return f; };
await probe(`document preview, ${paras} paragraphs (${buf.length} bytes)`, async () => (await fetch(`${base}/workspaces/${ws}/memory/document/preview`, { method: 'POST', body: form() })).json());
await probe(`5 people at once: document preview`, async () => Promise.all(Array.from({ length: 5 }, async () => (await fetch(`${base}/workspaces/${ws}/memory/document/preview`, { method: 'POST', body: form() })).json())));
await probe(`5 people at once: file upload`, async () => Promise.all(Array.from({ length: 5 }, async () => (await fetch(`${base}/workspaces/${ws}/files`, { method: 'POST', body: form() })).json())));
let fileId = '';
await probe('file upload', async () => { const r = await (await fetch(`${base}/workspaces/${ws}/files`, { method: 'POST', body: form() })).json() as any; fileId = r.file?.id; return r; });
await probe('file process', async () => (await fetch(`${base}/workspaces/${ws}/files/${fileId}/process`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json());
server.close(); process.exit(0);
