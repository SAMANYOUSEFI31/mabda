import type { ContextObject, PlanId, StoredFile } from '../../src/types/index.ts';
import { chunkText, bm25Rank, selectWithinBudget } from '../../src/core/retrieval.ts';
import { estimateTokens } from '../../src/core/tokens.ts';
import { fileProcessingCharge } from '../../src/core/creditEngine.ts';
import type { FileCharge } from '../../src/core/creditEngine.ts';
import { ledgerEntryFromUsage } from '../../src/core/ledger.ts';
import type { UsageSummary } from '../../src/types/ai.ts';
import type { ExtractRequest, ExtractResult } from '../ai/service.ts';
import type { FileExcerpt } from '../ai/context.ts';
import { RepoError } from '../db/repo.ts';
import type { Repo, Scope } from '../db/repo.ts';
import { defaultNodeId } from '../../src/core/nodeTree.ts';
import { extractText } from './extract.ts';

export type Extractor = (aiUser: string, req: ExtractRequest) => Promise<ExtractResult>;

export const periodOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Token budget for file excerpts injected into one request. */
export const EXCERPT_BUDGET_TOKENS = 3000;

/** what happens past the monthly quota */
export type OveragePolicy = 'ok' | 'credits' | 'blocked';
export interface FilePolicy { managed: () => boolean }
export interface UploadResult { file: StoredFile; charge: FileCharge; period: string; policy: OveragePolicy }
export interface ProcessResult {
  file: StoredFile;
  created: ContextObject[];
  charge: FileCharge;
  /** credits deducted from the workspace */
  creditCost: number;
  usage: UsageSummary;
  truncated: boolean;
}

/** Upload → (user sees quota/credits) → one-time processing → chunks + summary + Proposed objects. */
export class FileService {
  constructor(private readonly repo: Repo, private readonly extract: Extractor, private readonly clock: () => Date = () => new Date(), private readonly policy: FilePolicy = { managed: () => true }) {}

  overagePolicy(charge: FileCharge): OveragePolicy {
    if (charge.withinQuota) return 'ok';
    if (this.policy.managed()) return 'credits';
    return 'blocked';
  }

  private plan(s: Scope): PlanId {
    return this.repo.getWorkspace(s.userId, s.workspaceId)?.planId ?? 'starter';
  }

  /** the showcase workspace processes files for free and is never counted against the monthly quota */
  private chargeOf(s: Scope, used: number, tokens: number): FileCharge {
    const c = fileProcessingCharge(this.plan(s), used, tokens);
    return this.repo.isDemo(s) ? { ...c, withinQuota: true, excessTokens: 0, credits: 0 } : c;
  }

  quota(s: Scope) {
    const period = periodOf(this.clock());
    const used = this.repo.fileUsage(s, period);
    return { period, used, plan: this.plan(s), ...this.chargeOf(s, used, 0) };
  }

  async upload(s: Scope, f: { name: string; mime: string; buffer: Buffer; nodeId?: string }): Promise<UploadResult> {
    this.repo.assertWorkspace(s);
    const text = await extractText(f.buffer, f.name);
    const tokens = estimateTokens(text);
    const file = this.repo.createFile(s, { name: f.name, mime: f.mime, sizeBytes: f.buffer.length, nodeId: f.nodeId, rawText: text, tokens });
    const period = periodOf(this.clock());
    const charge = this.chargeOf(s, this.repo.fileUsage(s, period), tokens);
    return { file, charge, period, policy: this.overagePolicy(charge) };
  }

  /** What processing would cost right now (quota can change between upload and confirm). */
  chargeFor(s: Scope, fileId: string): FileCharge {
    const file = this.repo.getFile(s, fileId);
    if (!file) throw new RepoError('not_found', 'فایل پیدا نشد.');
    return this.chargeOf(s, this.repo.fileUsage(s, periodOf(this.clock())), file.tokens);
  }

  async process(s: Scope, fileId: string, userId: string): Promise<ProcessResult> {
    const file = this.repo.getFile(s, fileId);
    if (!file) throw new RepoError('not_found', 'فایل پیدا نشد.');
    if (file.status === 'ready') throw new RepoError('invalid', 'این فایل قبلاً پردازش شده است.');
    if (file.status === 'processing') throw new RepoError('invalid', 'این فایل در حال پردازش است.');
    const text = this.repo.getFileText(s, fileId);
    if (!text) throw new RepoError('invalid', 'متن فایل در دسترس نیست؛ دوباره بارگذاری کن.');
    const period = periodOf(this.clock());
    const charge = this.chargeOf(s, this.repo.fileUsage(s, period), file.tokens);
    const ws = this.repo.getWorkspace(s.userId, s.workspaceId)!;
    if (this.overagePolicy(charge) === 'blocked') throw new RepoError('forbidden', 'سهمیهٔ ماهانهٔ پردازش فایل این پلن پر شده است؛ ماه بعد ادامه بده یا پلن را ارتقا بده.');

    this.repo.setFileStatus(s, fileId, 'processing');
    let res: ExtractResult;
    try {
      res = await this.extract(userId, {
        kind: 'file', text, nodeId: file.nodeId ?? defaultNodeId(this.repo.listNodes(s)),
        nodes: this.repo.listNodes(s).map((n) => ({ id: n.id, label: n.label })), wantSummary: true,
      });
    } catch (e) {
      // nothing is charged and nothing is counted: the user can retry
      this.repo.setFileStatus(s, fileId, 'failed', { error: (e as { message?: string }).message ?? 'پردازش ناموفق بود.' });
      throw e;
    }

    const creditCost = this.policy.managed() ? charge.credits : 0;
    const created: ContextObject[] = this.repo.db.transaction(() => {
      this.repo.saveChunks(s, fileId, chunkText(fileId, text));
      // the plan's object cap: keep what fits (never fail the whole file over it)
      const objs = res.objects.slice(0, this.repo.objectSlots(s)).map((o) => this.repo.createObject(s, { type: o.type, status: 'Proposed', provenance: 'Imported', title: o.title, content: o.content, nodeId: o.nodeId, source: { kind: 'file', label: file.name, at: new Date().toISOString() } }));
      const summary = (res.summary ?? 'خلاصه‌ای تولید نشد.') + (res.truncated ? '\n\n(خلاصه و پیشنهادها فقط از بخش ابتدایی فایل ساخته شد؛ کل فایل برای بازیابی قطعه‌بندی شده است.)' : '');
      this.repo.setFileStatus(s, fileId, 'ready', { summary });
      if (!this.repo.isDemo(s)) this.repo.addFileUsage(s, period, file.tokens);
      if (creditCost > 0) this.repo.saveWorkspace(s.userId, { ...ws, creditsRemaining: Math.max(0, ws.creditsRemaining - creditCost) });
      this.repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: `پردازش فایل: ${file.name}`, mode: 'file_processing', creditCost, usage: res.usage, now: this.clock() }));
      return objs;
    })();
    return { file: this.repo.getFile(s, fileId)!, created, charge, creditCost, usage: res.usage, truncated: res.truncated };
  }

  /** Only the chunks relevant to `query`, inside the token budget. Files that are not `ready` are never used. */
  excerpts(s: Scope, query: string, budgetTokens = EXCERPT_BUDGET_TOKENS): FileExcerpt[] {
    const chunks = this.repo.listReadyChunks(s);
    if (!chunks.length || !query.trim()) return [];
    const picked = selectWithinBudget(bm25Rank(query, chunks), budgetTokens);
    if (!picked.length) return [];
    const names = new Map(this.repo.listFiles(s).map((f) => [f.id, f.name]));
    return picked.map((c) => ({ fileId: c.fileId, fileName: names.get(c.fileId) ?? c.fileId, index: c.index, text: c.text }));
  }
}
