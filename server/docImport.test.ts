import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { migrate } from './db/migrations.ts';
import { Repo } from './db/repo.ts';
import { DocImportService } from './docimport/service.ts';
import { IMPORT_BUDGET_TOKENS, locateInSource, planChunks } from './docimport/plan.ts';
import { htmlToText, readDocument } from './docimport/readers.ts';
import { registerSlotProvider } from '../src/core/suggestionSlots.ts';
import type { Workspace } from '../src/types/index.ts';

const U = 'local';
const S = { userId: U, workspaceId: 'w1' };
const mk = () => {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  const ws: Workspace = { id: 'w1', name: 'w', slug: 'w', description: '', planId: 'starter', creditsRemaining: 100, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' };
  repo.saveWorkspace(U, ws);
  return { repo, svc: new DocImportService(repo) };
};
const CAP = IMPORT_BUDGET_TOKENS * 3;

/** a real .docx: a zip with content types, rels, styles (Heading 1/2) and a document with headings, paragraphs and a list */
async function makeDocx(): Promise<Buffer> {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const style = (id: string, name: string) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;
  z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${style('Normal', 'Normal')}${style('Heading1', 'heading 1')}${style('Heading2', 'heading 2')}</w:styles>`);
  const p = (text: string, styleId?: string) => `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('قیمت‌گذاری', 'Heading1')}${p('اشتراک ماهانه ۴۹۰ هزار تومان است & تخفیف سالانه دارد.')}${p('مخاطب', 'Heading1')}${p('فریلنسرهای ایرانی که فاکتور می‌دهند.')}${p('کانال‌ها', 'Heading2')}${p('Telegram and Instagram DMs.')}</w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

/** a minimal text PDF (Helvetica, one page) built by hand */
function makePdf(text: string): Buffer {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = `BT /F1 14 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('a document with headings: each heading starts a chunk (a candidate), headings are suggested section names, and text is preserved', () => {
  const doc = '# قیمت\nاشتراک ماهانه ۴۹۰ هزار تومان.\n\n# مخاطب\nفریلنسرهای ایرانی.\n\n## کانال‌ها\nTelegram and Instagram DMs.';
  const chunks = planChunks(doc);
  assert.deepEqual(chunks.map((c) => c.heading), ['قیمت', 'مخاطب', 'کانال‌ها']);
  assert.deepEqual(chunks.map((c) => c.sectionHint), ['قیمت', 'مخاطب', 'کانال‌ها']);
  assert.equal(chunks.map((c) => c.text).join('\n\n'), doc);
});

test('a heading with nothing under it joins what follows (a title above a subtitle)', () => {
  const chunks = planChunks('# سند برنامه\n\n## قیمت\nمتن قیمت.');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, 'قیمت');
  assert.match(chunks[0].text, /سند برنامه/);
});

test('a long text with no headings and no order is cut by length at blank lines / sentences; every word survives, in order', () => {
  const para = (i: number) => `بند ${i}: ` + 'این یک جملهٔ نمونه دربارهٔ کسب‌وکار است. '.repeat(8) + 'And some English words mixed in, نیم‌فاصله و ارقام ۱۲۳.';
  const text = Array.from({ length: 30 }, (_, i) => para(i)).join('\n\n');
  const chunks = planChunks(text);
  assert.ok(chunks.length > 5);
  assert.ok(chunks.every((c) => c.text.length <= CAP + 5), 'each chunk fits the budget');
  assert.ok(chunks.every((c) => !c.heading && !c.sectionHint), 'no heading was invented');
  assert.equal(chunks.map((c) => c.text).join('\n\n').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});

test('one long wall of text with no blank lines at all is cut by sentences, not truncated', () => {
  const text = Array.from({ length: 120 }, (_, i) => `جملهٔ شمارهٔ ${i} دربارهٔ مشتری.`).join(' ');
  const chunks = planChunks(text);
  assert.ok(chunks.length > 3);
  assert.equal(chunks.map((c) => c.text).join(' ').replace(/\s+/g, ' '), text);
});

test('a short paragraph about several topics stays one chunk (no invented topic boundary); the user can split it', () => {
  const text = 'قیمت اشتراک ۴۹۰ است. دفتر در تهران است. باید وکیل بگیریم. لحن برند صمیمی باشد.';
  assert.equal(planChunks(text).length, 1);
});

test('bullets in an over-budget list become boundaries; the heading hint is carried by every chunk of the section', () => {
  const items = Array.from({ length: 40 }, (_, i) => `- مورد شمارهٔ ${i} با کمی توضیح بیشتر برای پر شدن بودجه`).join('\n');
  const chunks = planChunks(`# فهرست کارها\n${items}`);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].heading, 'فهرست کارها');
  assert.ok(chunks.every((c) => c.sectionHint === 'فهرست کارها'));
  assert.ok(chunks.slice(1).every((c) => !c.heading));
  assert.ok(chunks.slice(1).every((c) => c.text.startsWith('- ')), 'cuts fall on bullets');
});

test('locateInSource: whole, merged (head+tail), repeated passage by turn, and not-found is null', () => {
  const src = 'الف الف الف\n\nب ب ب\n\nالف الف الف\n\nج ج ج';
  const first = locateInSource(src, 'الف الف الف', 0)!;
  const second = locateInSource(src, 'الف الف الف', first.start + 1)!;
  assert.ok(second.start > first.start);
  assert.equal(src.slice(second.start, second.end), 'الف الف الف');
  const merged = locateInSource(src, 'الف الف الف\n\n\n\nب ب ب', 0)!; // separator differs from the source
  assert.equal(src.slice(merged.start, merged.end), 'الف الف الف\n\nب ب ب');
  assert.equal(locateInSource(src, 'چیزی که نیست', 0), null);
});

test('.docx (a real zip): headings and text are read, entities decoded, chunks follow the Word headings', async () => {
  const r = await readDocument({ file: { name: 'برنامه.docx', buffer: await makeDocx() } });
  assert.match(r.text, /^# قیمت‌گذاری/);
  assert.match(r.text, /## کانال‌ها/);
  assert.match(r.text, /۴۹۰ هزار تومان است & تخفیف/);
  const chunks = planChunks(r.text);
  assert.deepEqual(chunks.map((c) => c.heading), ['قیمت‌گذاری', 'مخاطب', 'کانال‌ها']);
});

test('htmlToText: lists become bullets, tags are stripped, entities decoded once', () => {
  assert.equal(htmlToText('<h2>تیتر</h2><p>الف &amp;lt; ب</p><ul><li>یک</li><li><strong>دو</strong></li></ul>'), '## تیتر\n\nالف &lt; ب\n\n- یک\n- دو');
});

test('.pdf with a text layer is read; an empty or broken file is a clear Persian error', async () => {
  const r = await readDocument({ file: { name: 'a.pdf', buffer: makePdf('Pricing is monthly') } });
  assert.match(r.text, /Pricing is monthly/);
  await assert.rejects(() => readDocument({ file: { name: 'b.pdf', buffer: Buffer.from('not a pdf') } }), /خواندن فایل ممکن نشد/);
  await assert.rejects(() => readDocument({ file: { name: 'c.docx', buffer: Buffer.from('not a zip') } }), /خواندن فایل ممکن نشد/);
  await assert.rejects(() => readDocument({ file: { name: 'd.rtf', buffer: Buffer.from('x') } }), /فقط فایل/);
  await assert.rejects(() => readDocument({ text: '   \n ' }), /متنی/);
});

test('paste and a file of the same text have the same hash (dedupe is by content, not by how it arrived)', async () => {
  const a = await readDocument({ text: 'سلام\r\n\r\n\r\nدنیا  \n' });
  const b = await readDocument({ file: { name: 'x.txt', buffer: Buffer.from('﻿سلام\n\nدنیا', 'utf8') } });
  assert.equal(a.hash, b.hash);
});

test('preview saves nothing; commit stores the whole text as a source and every note points to its passage', async () => {
  const { repo, svc } = mk();
  const doc = '# قیمت\nاشتراک ماهانه چقدر باشد؟\n\n# مخاطب\nفریلنسرهای ایرانی.\n\nTelegram + اینستاگرام.';
  const p = await svc.preview(S, { text: doc, name: 'plan.md' });
  assert.equal(repo.listNotes(S).length, 0);
  assert.equal(repo.listFiles(S).length, 0);
  assert.deepEqual(p.headings, ['قیمت', 'مخاطب']);
  assert.equal(p.duplicate, undefined);

  const r = svc.commit(S, { name: p.name, text: p.text, chunks: p.chunks.map((c) => ({ text: c.text })) });
  assert.equal(r.duplicate, false);
  assert.equal(r.notes.length, p.chunks.length);
  assert.equal(repo.getFileText(S, r.file.id), p.text, 'the full text is the source, nothing missing');
  assert.equal(r.file.status, 'ready');
  assert.equal(repo.listReadyChunks(S).length, 0, 'the source is never injected into a request by itself');
  // everything in default place («تازه‌ها»), no sections created
  const home = repo.listNodes(S).length;
  assert.ok(r.notes.every((n) => n.nodeId === r.notes[0].nodeId));
  assert.equal(r.nodes.length, home);
  for (const n of r.notes) {
    const src = svc.sourceOf(S, n.id)!;
    assert.equal(src.fileName, 'plan.md');
    assert.ok(src.start !== null && src.end !== null);
    assert.equal(src.excerpt, n.content.trim());
  }
  // the question line became a thought (inferred), nothing else was made
  assert.ok(r.thoughts.some((t) => t.kind === 'question' && /چقدر/.test(t.text)));
  assert.equal(repo.listObjects(S).length, 0, 'no knowledge was made');
});

test('importing the same document again (even as a file) creates nothing new', async () => {
  const { repo, svc } = mk();
  const text = 'متن اول سند.\n\nمتن دوم سند.';
  const first = svc.commit(S, { name: 'a.txt', text, chunks: [{ text: 'متن اول سند.' }, { text: 'متن دوم سند.' }] });
  const p = await svc.preview(S, { file: { name: 'copy.txt', buffer: Buffer.from(`${text}\r\n`) } });
  assert.equal(p.duplicate?.fileId, first.file.id);
  assert.equal(p.duplicate?.noteCount, 2);
  const again = svc.commit(S, { name: 'copy.txt', text: p.text, chunks: p.chunks.map((c) => ({ text: c.text })) });
  assert.equal(again.duplicate, true);
  assert.equal(repo.listNotes(S).length, 2);
  assert.equal(repo.listFiles(S).length, 1);
  // deleting the source lets the user import it again
  repo.deleteFile(S, first.file.id);
  assert.equal(svc.commit(S, { name: 'a.txt', text, chunks: [{ text }] }).duplicate, false);
});

test('merged and split chunks still point into the source; a chunk the user left out is still in the source file', async () => {
  const { repo, svc } = mk();
  const text = 'الف الف.\n\nب ب.\n\nج ج.\n\nد د.';
  const r = svc.commit(S, { name: 'm.txt', text, chunks: [{ text: 'الف الف.\n\n\nب ب.' }, { text: 'ج' }, { text: 'ج.' }] });
  const [m, , tail] = r.notes;
  assert.equal(svc.sourceOf(S, m.id)!.excerpt, 'الف الف.\n\nب ب.');
  assert.ok(svc.sourceOf(S, tail.id)!.start! > svc.sourceOf(S, m.id)!.end!);
  assert.match(repo.getFileText(S, r.file.id)!, /د د\./, 'the left-out last chunk is still in the stored text');
});

test('sections are created only when the user passes them: reused if they exist, under the default place, all-or-nothing', async () => {
  const { repo, svc } = mk();
  const home = repo.listNodes(S);
  const doc = '# قیمت\nالف.\n\n# مخاطب\nب.\n\n# قیمت\nج.';
  const p = await svc.preview(S, { text: doc });
  const r = svc.commit(S, { name: 'd.md', text: p.text, chunks: p.chunks.map((c) => ({ text: c.text, section: c.sectionHint })) });
  const created = r.nodes.filter((n) => !home.some((h) => h.id === n.id));
  assert.deepEqual(created.map((n) => n.label).sort(), ['قیمت', 'مخاطب'].sort());
  assert.equal(r.notes[0].nodeId, r.notes[2].nodeId, 'the repeated heading reuses the section');
  assert.notEqual(r.notes[0].nodeId, r.notes[1].nodeId);
  // a failure rolls everything back: no file, no notes
  const before = { notes: repo.listNotes(S).length, files: repo.listFiles(S).length };
  assert.throws(() => svc.commit(S, { name: 'bad', text: 'متن دیگر', chunks: [{ text: 'متن دیگر', section: 'x'.repeat(10) }, { text: '   ' }].concat(Array.from({ length: 401 }, () => ({ text: 'y', section: '' }))) }), /بیش از حد/);
  assert.deepEqual({ notes: repo.listNotes(S).length, files: repo.listFiles(S).length }, before);
});

test('commit needs at least one kept chunk; the source is untouched by a rejected commit', () => {
  const { repo, svc } = mk();
  assert.throws(() => svc.commit(S, { text: 'متن', chunks: [{ text: '  ' }] }), /دست‌کم یک تکه/);
  assert.equal(repo.listFiles(S).length, 0);
});

test('suggestion slots are OFF: no provider means no suggestions; a registered provider is shown but never applied, and a failing one is ignored', async () => {
  const { repo, svc } = mk();
  const doc = 'متن اول.\n\n# عنوان\nمتن دوم.';
  assert.equal((await svc.preview(S, { text: doc })).chunks.some((c) => c.suggestions), false);
  const off1 = registerSlotProvider('kind', async () => [{ slot: 'kind', label: 'سؤال' }]);
  const off2 = registerSlotProvider('duplicate', async () => { throw new Error('boom'); });
  try {
    const p = await svc.preview(S, { text: doc });
    assert.ok(p.chunks.every((c) => c.suggestions?.length === 1 && c.suggestions[0].label === 'سؤال'));
    svc.commit(S, { text: p.text, chunks: p.chunks.map((c) => ({ text: c.text })) });
    assert.ok(repo.listNotes(S).every((n) => !n.content.includes('سؤال')), 'a suggestion never edits the note');
  } finally { off1(); off2(); }
});
