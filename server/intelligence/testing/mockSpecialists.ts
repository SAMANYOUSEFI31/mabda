/**
 * فقط برای آزمون: متخصص‌های ساختگی و قطعی. خروجی‌شان خروجی هیچ مدلی نیست و هرگز در مسیر واقعی به کار نمی‌روند.
 */
import { tokenize } from '../../../src/core/retrieval.ts';
import { IntelligenceError } from '../errors.ts';
import type { JudgmentAnswer, JudgmentQuestion, ModelEntry, Specialists } from '../types.ts';

const DIMS = 64;
const h32 = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** کیسهٔ واژه‌های هش‌شده؛ متن‌های هم‌واژه نزدیک‌اند */
export const fakeVector = (text: string): number[] => {
  const v = new Array<number>(DIMS).fill(0);
  for (const t of tokenize(text)) v[h32(t) % DIMS] += 1;
  return v;
};

export interface MockCalls { embed: string[][]; rerank: Array<{ query: string; documents: string[] }>; decide: Array<{ state: string; questions: JudgmentQuestion[] }>; transcribe: number }

export interface MockOptions {
  failEmbedding?: IntelligenceError;
  /** پاسخ داور: تابعی از وضعیت و سؤال‌ها */
  judge?: (state: string, questions: JudgmentQuestion[]) => JudgmentAnswer[];
  rerankScore?: (query: string, doc: string) => number;
  transcript?: string;
}

export function mockSpecialists(opts: MockOptions = {}): { specialists: Specialists; calls: MockCalls } {
  const calls: MockCalls = { embed: [], rerank: [], decide: [], transcribe: 0 };
  const overlap = (a: string, b: string): number => { const A = new Set(tokenize(a)), B = new Set(tokenize(b)); let n = 0; for (const t of A) if (B.has(t)) n++; return A.size ? n / A.size : 0; };
  const specialists: Specialists = {
    embedding: (modelKey) => ({
      model: { key: modelKey, kind: 'embedding', id: `mock/${modelKey}`, maxInputTokens: 512 } as ModelEntry,
      async embed(texts) {
        if (opts.failEmbedding) throw opts.failEmbedding;
        calls.embed.push(texts);
        return { value: texts.map(fakeVector), usage: { inputTokens: texts.reduce((n, t) => n + Math.ceil(t.length / 2.2), 0), units: texts.length } };
      },
    }),
    rerank: (modelKey) => ({
      model: { key: modelKey, kind: 'rerank', id: `mock/${modelKey}`, calibratedScore: true } as ModelEntry,
      async rerank(query, documents, topN) {
        calls.rerank.push({ query, documents });
        const scored = documents.map((d, index) => ({ index, score: (opts.rerankScore ?? overlap)(query, d) })).sort((a, b) => b.score - a.score);
        return { value: scored.slice(0, topN ?? scored.length), usage: { units: documents.length } };
      },
    }),
    judgment: (modelKey) => ({
      model: { key: modelKey, kind: 'judgment', id: `mock/${modelKey}`, maxInputTokens: 4000 } as ModelEntry,
      async decide(state, questions) {
        calls.decide.push({ state, questions });
        const value = opts.judge ? opts.judge(state, questions) : questions.map((q) => ({ id: q.id, choice: null }));
        return { value, usage: { units: questions.length } };
      },
    }),
    transcription: (modelKey) => ({
      model: { key: modelKey, kind: 'transcription', id: `mock/${modelKey}` } as ModelEntry,
      async transcribe() { calls.transcribe++; return { value: { text: opts.transcript ?? 'متن آزمایشی' }, usage: { audioSeconds: 3 } }; },
    }),
  };
  return { specialists, calls };
}
