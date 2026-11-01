import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { migrate } from '../db/migrations.ts';
import { Repo } from '../db/repo.ts';
import { FileService, periodOf } from './service.ts';
import type { Extractor } from './service.ts';
import { extractText, FileExtractError } from './extract.ts';
import type { ExtractResult } from '../ai/service.ts';
import { estimateTokens } from '../../src/core/tokens.ts';
import type { Workspace } from '../../src/types/index.ts';

const U = 'local';
const S = { userId: U, workspaceId: 'w1' };
const mk = (plan: Workspace['planId'] = 'starter', credits = 100) => {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, { id: 'w1', name: 'w', slug: 'w', description: '', planId: plan, creditsRemaining: credits, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' });
  return repo;
};
const usage = (byok: boolean) => ({ stages: [{ stage: 'extract' as const, tier: 'cheap' as const, provider: 'gemini', modelId: 'm', effort: 'low' as const, inputTokens: 1000, cachedTokens: 0, outputTokens: 100, thinkingTokens: 0, costUsd: 0.001, durationMs: 5 }], totals: { inputTokens: 1000, cachedTokens: 0, outputTokens: 100, thinkingTokens: 0, costUsd: 0.001 }, byok });
const ok = (byok = false): Extractor => async (): Promise<ExtractResult> => ({ summary: 'خلاصهٔ فایل', objects: [{ type: 'Fact', title: 'مخاطب', content: 'فریلنسرها', nodeId: 'brand' }], usage: usage(byok), truncated: false });
const NOW = new Date('2026-10-15T10:00:00Z');
const txt = (words: number, word = 'کلمه') => Buffer.from(`${word} `.repeat(words), 'utf8');

test('extraction: txt / md / docx / pdf; unsupported, empty and oversize are rejected with Persian messages', async () => {
  assert.equal(await extractText(Buffer.from('﻿سلام دنیا\r\n\r\nبند دوم'), 'a.txt'), 'سلام دنیا\n\nبند دوم');
  assert.match(await extractText(Buffer.from('# تیتر\nمتن'), 'a.md'), /تیتر/);

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>قیمت بسته حرفه‌ای</w:t></w:r></w:p></w:body></w:document>');
  assert.match(await extractText(await zip.generateAsync({ type: 'nodebuffer' }), 'a.docx'), /قیمت بسته/);

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 100 Td (Hello Mabda) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF');
  assert.match(await extractText(pdf, 'a.pdf'), /Hello Mabda/);

  await assert.rejects(extractText(Buffer.from('x'), 'a.exe'), FileExtractError);
  await assert.rejects(extractText(Buffer.from('   \n '), 'a.txt'), /متنی/);
  await assert.rejects(extractText(Buffer.from('not a pdf'), 'a.pdf'), FileExtractError);
});

test('upload computes tokens + the quota preview; processing makes chunks, summary, Proposed «Imported» objects and counts the quota', async () => {
  const repo = mk('starter');
  const svc = new FileService(repo, ok(), () => NOW);
  const { file, charge } = await svc.upload(S, { name: 'brief.txt', mime: 'text/plain', buffer: txt(20000), nodeId: 'brand' });
  assert.equal(file.status, 'uploaded');
  assert.equal(file.tokens, estimateTokens(txt(20000).toString('utf8').trim()));
  assert.equal(charge.withinQuota, true);
  assert.equal(svc.quota(S).used, 0);

  const r = await svc.process(S, file.id, 'user-12345678');
  assert.equal(r.file.status, 'ready');
  assert.ok(r.file.chunkCount > 1);
  assert.equal(r.file.summary, 'خلاصهٔ فایل');
  assert.equal(r.creditCost, 0);
  assert.deepEqual(r.created.map((o) => [o.status, o.provenance, o.nodeId]), [['Proposed', 'Imported', 'brand']]);
  assert.equal(svc.quota(S).used, file.tokens);
  assert.equal(repo.listLedger(S)[0].mode, 'file_processing');
  assert.equal(repo.listLedger(S)[0].inputTokens, 1000, 'ledger carries the provider usage, not the estimate');
  await assert.rejects(svc.process(S, file.id, 'user-12345678'), /قبلاً پردازش/);
});

test('over the monthly quota: 2 credits per started 20k tokens are deducted; BYOK deducts nothing; quota resets next month', async () => {
  const repo = mk('starter', 100);
  let now = NOW;
  const svc = new FileService(repo, ok(), () => now);
  repo.addFileUsage(S, periodOf(NOW), 140_000);
  const big = await svc.upload(S, { name: 'big.txt', mime: 'text/plain', buffer: txt(33000, 'سلام') }); // ≈ 30k tokens: 10k inside, ~20k over
  assert.ok(big.charge.credits >= 2 && !big.charge.withinQuota);
  const r = await svc.process(S, big.file.id, 'user-12345678');
  assert.equal(r.creditCost, big.charge.credits);
  assert.equal(repo.getWorkspace(U, 'w1')!.creditsRemaining, 100 - big.charge.credits);

  const byokRepo = mk('starter', 100);
  const byokSvc = new FileService(byokRepo, ok(true), () => NOW);
  byokRepo.addFileUsage(S, periodOf(NOW), 150_000);
  const f = await byokSvc.upload(S, { name: 'b.txt', mime: 'text/plain', buffer: txt(33000, 'سلام') });
  const rb = await byokSvc.process(S, f.file.id, 'user-12345678');
  assert.equal(rb.creditCost, 0);
  assert.equal(byokRepo.getWorkspace(U, 'w1')!.creditsRemaining, 100, 'own key → no credits');
  assert.ok(byokSvc.quota(S).used > 150_000, 'but the tokens still count against the quota');

  now = new Date('2026-11-02T10:00:00Z');
  assert.equal(svc.quota(S).used, 0, 'new month, new quota');
});

test('a failed extraction charges nothing, counts nothing and can be retried', async () => {
  const repo = mk('pro', 50);
  let fail = true;
  const svc = new FileService(repo, async (...a) => { if (fail) throw new Error('quota'); return ok()(...a); }, () => NOW);
  const { file } = await svc.upload(S, { name: 'x.txt', mime: 'text/plain', buffer: txt(1000) });
  await assert.rejects(svc.process(S, file.id, 'user-12345678'), /quota/);
  assert.equal(repo.getFile(S, file.id)!.status, 'failed');
  assert.equal(svc.quota(S).used, 0);
  assert.equal(repo.listObjects(S).length, 0);
  fail = false;
  assert.equal((await svc.process(S, file.id, 'user-12345678')).file.status, 'ready');
});

test('retrieval: only relevant chunks of READY files, inside the budget', async () => {
  const repo = mk('pro');
  const svc = new FileService(repo, ok(), () => NOW);
  const para = (t: string) => `${t} `.repeat(300);
  const doc = [para('قیمت اشتراک ماهانه بسته حرفه‌ای تخفیف'), para('تاریخچه شرکت تیم مؤسس سال تأسیس'), para('مخاطب فریلنسر طراح مشاور')].join('\n\n');
  const a = await svc.upload(S, { name: 'pricing.txt', mime: 'text/plain', buffer: Buffer.from(doc) });
  const pending = await svc.upload(S, { name: 'pending.txt', mime: 'text/plain', buffer: Buffer.from(para('قیمت اشتراک')) });
  await svc.process(S, a.file.id, 'user-12345678');
  const ex = svc.excerpts(S, 'قیمت اشتراک');
  assert.ok(ex.length >= 1);
  assert.ok(ex.every((e) => e.fileId === a.file.id), 'the unprocessed file is never used');
  assert.ok(ex[0].text.includes('قیمت'));
  assert.ok(!ex.some((e) => e.text.includes('تاریخچه شرکت') && !e.text.includes('قیمت')), 'unrelated chunks stay out');
  assert.equal(svc.excerpts(S, 'xyzzy نامرتبط').length, 0);
  assert.equal(svc.excerpts(S, '').length, 0);
  const tight = svc.excerpts(S, 'قیمت اشتراک', 100);
  assert.deepEqual(tight, [], 'budget smaller than any chunk → nothing partial is injected');
  void pending;
});

test('past the quota: managed AI → credits; flag off → own key pays tokens (never credits) or, if WE would pay, it is blocked', async () => {
  const run = async (managed: boolean, payer: 'us' | 'user') => {
    const repo = mk('starter', 100);
    const svc = new FileService(repo, ok(), () => NOW, { managed: () => managed, payer: () => payer });
    repo.addFileUsage(S, periodOf(NOW), 150_000);
    const up = await svc.upload(S, { name: 'over.txt', mime: 'text/plain', buffer: txt(33000, 'سلام') });
    return { repo, svc, up };
  };
  const credits = await run(true, 'us');
  assert.equal(credits.up.policy, 'credits');
  assert.ok((await credits.svc.process(S, credits.up.file.id, 'user-12345678')).creditCost > 0);

  const own = await run(false, 'user');
  assert.equal(own.up.policy, 'own-key');
  const r = await own.svc.process(S, own.up.file.id, 'user-12345678');
  assert.equal(r.creditCost, 0);
  assert.equal(own.repo.getWorkspace(U, 'w1')!.creditsRemaining, 100);

  const blocked = await run(false, 'us');
  assert.equal(blocked.up.policy, 'blocked');
  await assert.rejects(blocked.svc.process(S, blocked.up.file.id, 'user-12345678'), /سهمیهٔ ماهانهٔ پردازش فایل/);
  assert.equal(blocked.repo.getFile(S, blocked.up.file.id)!.status, 'uploaded', 'nothing was spent and the file can be processed next month');
});
