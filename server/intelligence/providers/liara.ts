import { IntelligenceError, asIntelligenceError, kindOfStatus } from '../errors.ts';
import type { IntelligenceConfig } from '../config.ts';
import type {
  CallOptions, CallUsage, EmbeddingProvider, JudgmentAnswer, JudgmentProvider, JudgmentQuestion, ModelEntry,
  RerankProvider, RerankResult, Reported, Specialists, TranscriptionProvider,
} from '../types.ts';

/**
 * پیاده‌سازی چهار رابط متخصص روی لیارا (سازگار با OpenAI، بدون SDK).
 * شکل درخواست/پاسخ: docs/intelligence-providers.md. بخش‌های تأییدنشده در کد علامت خورده‌اند.
 * هیچ نام مدلی اینجا نیست؛ شناسه فقط از `cfg.models[key].id`.
 * کلید و متن کاربر هرگز در پیام یا detail خطا نمی‌آید.
 */

export function readLiaraEnv(cfg: IntelligenceConfig, env: Record<string, string | undefined>): { baseUrl: string; apiKey: string } | null {
  const baseUrl = env[cfg.liara.baseUrlEnv]?.trim();
  const apiKey = env[cfg.liara.apiKeyEnv]?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bad = (specialist: ModelEntry['kind'], modelKey: string, detail: string) => new IntelligenceError('bad_output', { detail, specialist, modelKey });

export function createLiaraSpecialists(cfg: IntelligenceConfig, opts: { baseUrl: string; apiKey: string; fetch?: typeof fetch }): Specialists {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const scrub = (s: string): string => (opts.apiKey ? s.split(opts.apiKey).join('***') : s);

  function model(key: string, kind: ModelEntry['kind']): ModelEntry {
    const m = cfg.models[key];
    if (!m) throw new IntelligenceError('bad_request', { detail: `مدل «${key}» در config نیست`, specialist: kind, modelKey: key });
    if (m.kind !== kind) throw new IntelligenceError('bad_request', { detail: `مدل «${key}» از نوع ${m.kind} است، ${kind} لازم بود`, specialist: kind, modelKey: key });
    return m;
  }

  /** یک فراخوانی HTTP؛ JSON پاسخ را برمی‌گرداند یا IntelligenceError می‌اندازد. بدون تلاش دوباره. */
  async function call(kind: ModelEntry['kind'], m: ModelEntry, path: string, body: Obj | FormData, o: CallOptions | undefined): Promise<unknown> {
    const timeout = AbortSignal.timeout(cfg.liara.timeoutsMs[kind]);
    const signal = o?.signal ? AbortSignal.any([timeout, o.signal]) : timeout;
    const headers: Record<string, string> = { Authorization: `Bearer ${opts.apiKey}` };
    const isForm = body instanceof FormData;
    if (!isForm) headers['Content-Type'] = 'application/json';
    const doFetch = opts.fetch ?? globalThis.fetch;
    const fail = (e: unknown): IntelligenceError => {
      const err = asIntelligenceError(e, 'provider');
      const kindOut = o?.signal?.aborted && !timeout.aborted ? 'aborted' : err.kind;
      return new IntelligenceError(kindOut, { status: err.status, detail: err.detail === undefined ? undefined : scrub(err.detail), specialist: kind, modelKey: m.key });
    };
    let res: Response;
    let text: string;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method: 'POST', headers, body: isForm ? body : JSON.stringify(body), signal });
      text = await res.text();
    } catch (e) {
      throw fail(e);
    }
    if (!res.ok) {
      throw new IntelligenceError(kindOfStatus(res.status), { status: res.status, detail: scrub(`HTTP ${res.status}: ${text.slice(0, 300)}`), specialist: kind, modelKey: m.key });
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw bad(kind, m.key, 'پاسخ JSON نیست');
    }
  }

  const reportedTokens = (json: Obj): number | undefined => {
    const u = json.usage;
    if (isObj(u)) {
      if (isNum(u.prompt_tokens)) return u.prompt_tokens;
      if (isNum(u.total_tokens)) return u.total_tokens;
      if (isNum(u.input_tokens)) return u.input_tokens;
    }
    const billed = isObj(json.meta) && isObj(json.meta.billed_units) ? json.meta.billed_units : undefined;
    if (billed && isNum(billed.input_tokens)) return billed.input_tokens;
    return undefined;
  };
  const withTokens = (json: Obj, usage: CallUsage): CallUsage => {
    const t = reportedTokens(json);
    return t === undefined ? usage : { ...usage, inputTokens: t };
  };

  // ───────────── embedding ─────────────
  function embedding(key: string): EmbeddingProvider {
    const m = model(key, 'embedding');
    return {
      model: m,
      async embed(texts, role, o) {
        if (m.limits?.maxTexts !== undefined && texts.length > m.limits.maxTexts) {
          throw new IntelligenceError('bad_request', { detail: `شمار متن‌ها (${texts.length}) از سقف مدل (${m.limits.maxTexts}) بیشتر است`, specialist: 'embedding', modelKey: key });
        }
        if (!texts.length) return { value: [], usage: { units: 0 } };
        const prefix = m.inputPrefix?.[role] ?? '';
        const json = await call('embedding', m, '/embeddings', { model: m.id, input: texts.map((t) => prefix + t) }, o);
        if (!isObj(json) || !Array.isArray(json.data)) throw bad('embedding', key, 'data نیست');
        if (json.data.length !== texts.length) throw bad('embedding', key, `شمار بردارها (${json.data.length}) با شمار ورودی (${texts.length}) نمی‌خواند`);
        const slots: Array<number[] | undefined> = new Array(texts.length).fill(undefined);
        json.data.forEach((d: unknown, pos: number) => {
          if (!isObj(d) || !Array.isArray(d.embedding) || !d.embedding.every(isNum)) throw bad('embedding', key, 'بردار نامعتبر');
          const idx = d.index === undefined ? pos : d.index;
          if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= texts.length || slots[idx]) throw bad('embedding', key, 'index نامعتبر');
          if (m.dimensions !== undefined && d.embedding.length !== m.dimensions) throw bad('embedding', key, `بُعد بردار ${d.embedding.length} است، ${m.dimensions} لازم بود`);
          slots[idx] = d.embedding as number[];
        });
        const value = slots.map((s) => s ?? bad('embedding', key, 'بردار گم‌شده'));
        for (const v of value) if (v instanceof Error) throw v;
        return { value: value as number[][], usage: withTokens(json, { units: texts.length }) };
      },
    };
  }

  // ───────────── rerank ─────────────
  function rerank(key: string): RerankProvider {
    const m = model(key, 'rerank');
    return {
      model: m,
      async rerank(query, documents, topN, o): Promise<Reported<RerankResult[]>> {
        if (m.limits?.maxDocuments !== undefined && documents.length > m.limits.maxDocuments) {
          throw new IntelligenceError('bad_request', { detail: `شمار سندها (${documents.length}) از سقف مدل بیشتر است`, specialist: 'rerank', modelKey: key });
        }
        if (!documents.length) return { value: [], usage: { units: 0 } };
        const body: Obj = { model: m.id, query, documents };
        if (topN !== undefined) body.top_n = topN;
        const json = await call('rerank', m, '/rerank', body, o);
        // پاسخ rerank در مستند لیارا نیست؛ شکل Cohere/Voyage پذیرفته می‌شود: results یا data با {index, relevance_score|score}
        const list = isObj(json) ? (Array.isArray(json.results) ? json.results : Array.isArray(json.data) ? json.data : undefined) : undefined;
        if (!isObj(json) || !list) throw bad('rerank', key, 'results نیست');
        const value: RerankResult[] = list.map((r: unknown) => {
          if (!isObj(r)) throw bad('rerank', key, 'عنصر نامعتبر');
          const score = isNum(r.relevance_score) ? r.relevance_score : isNum(r.score) ? r.score : undefined;
          if (typeof r.index !== 'number' || !Number.isInteger(r.index) || r.index < 0 || r.index >= documents.length || score === undefined) throw bad('rerank', key, 'index یا امتیاز نامعتبر');
          return { index: r.index, score };
        });
        value.sort((a, b) => b.score - a.score);
        return { value, usage: withTokens(json, { units: documents.length }) };
      },
    };
  }

  // ───────────── judgment ─────────────
  function judgment(key: string): JudgmentProvider {
    const m = model(key, 'judgment');
    return {
      model: m,
      async decide(state, questions, o): Promise<Reported<JudgmentAnswer[]>> {
        if (m.limits?.maxQuestions !== undefined && questions.length > m.limits.maxQuestions) {
          throw new IntelligenceError('bad_request', { detail: `شمار سؤال‌ها (${questions.length}) از سقف مدل بیشتر است`, specialist: 'judgment', modelKey: key });
        }
        if (!questions.length) return { value: [], usage: { units: 0 } };
        const qs: Obj = {};
        for (const q of questions) qs[q.id] = { type: q.type, instructions: q.instructions, criteria: criteriaObject(q.criteria) };
        const json = await call('judgment', m, '/decisions', { model: m.id, state, questions: qs }, o);
        if (!isObj(json) && !Array.isArray(json)) throw bad('judgment', key, 'پاسخ شیء نیست');
        const value = questions.map((q) => parseAnswer(key, q, findRaw(json, q.id)));
        return { value, usage: withTokens(isObj(json) ? json : {}, { units: questions.length }) };
      },
    };
  }

  // ───────────── transcription ─────────────
  function transcription(key: string): TranscriptionProvider {
    const m = model(key, 'transcription');
    return {
      model: m,
      async transcribe(input, o) {
        const form = new FormData();
        form.append('model', m.id);
        form.append('file', new Blob([input.data as BlobPart], { type: input.mimeType }), input.fileName);
        if (m.sendLanguage === true && input.language) form.append('language', input.language);
        const json = await call('transcription', m, '/audio/transcriptions', form, o);
        if (!isObj(json) || typeof json.text !== 'string') throw bad('transcription', key, 'text نیست');
        const usage: CallUsage = isNum(json.duration) ? { audioSeconds: json.duration } : {};
        return { value: { text: json.text }, usage };
      },
    };
  }

  return { embedding, rerank, judgment, transcription };
}

// ───────────── قضاوت: ساخت درخواست و تجزیهٔ پاسخ ─────────────

function criteriaObject(c: JudgmentQuestion['criteria']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of c) {
    if (typeof item === 'string') out[item] = item;
    else out[item.id] = item.description;
  }
  return out;
}

/** مقدار خام پاسخِ یک سؤال: سطح بالا یا زیر answers/results/data (کلید = شناسهٔ سؤال). undefined = پاسخی نیست. */
function findRaw(json: unknown, id: string): unknown {
  const containers: unknown[] = [json];
  if (isObj(json)) for (const k of ['answers', 'results', 'data']) containers.push(json[k]);
  for (const c of containers) {
    if (isObj(c) && Object.prototype.hasOwnProperty.call(c, id)) return c[id];
    if (Array.isArray(c)) {
      const hit = c.find((x) => isObj(x) && (x.id === id || x.question === id || x.name === id || x.key === id));
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

const probMap = (v: unknown): Record<string, number> | undefined => {
  if (!isObj(v)) return undefined;
  const entries = Object.entries(v);
  if (!entries.length || !entries.every(([, x]) => isNum(x))) return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
};

const asChoice = (v: unknown): string | null | undefined => {
  if (v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  return undefined;
};

/**
 * هشدار: شکل پاسخ `/decisions` در مستند لیارا نیامده و تأییدنشده است.
 * این تجزیه‌گر چند شکل محتمل را می‌پذیرد (رشتهٔ ساده؛ شیء با choice|answer|value|label|decision،
 * probabilities|probs|scores|distribution و confidence|probability؛ شیءِ فقط-عدد = توزیع احتمال؛ عدد برای score؛ بولی/رشته برای noul).
 * باید با `bun run eval:intelligence` و کلید واقعی تأیید و در صورت نیاز اصلاح شود.
 * هرچه نفهمد bad_output است، نه حدس.
 */
function parseAnswer(modelKey: string, q: JudgmentQuestion, raw: unknown): JudgmentAnswer {
  const fail = (why: string) => bad('judgment', modelKey, `سؤال «${q.id}»: ${why}`);
  if (raw === undefined) throw fail('پاسخی نیست');
  const base = { id: q.id, raw };

  if (q.type === 'score') {
    if (isNum(raw)) return { ...base, choice: null, score: raw };
    if (typeof raw === 'string' && raw.trim() !== '' && isNum(Number(raw))) return { ...base, choice: null, score: Number(raw) };
    if (isObj(raw)) {
      const s = [raw.score, raw.value, raw.answer].find(isNum);
      if (s === undefined) throw fail('امتیاز نیست');
      const conf = [raw.confidence, raw.probability].find(isNum);
      return { ...base, choice: null, score: s, ...(conf !== undefined ? { confidence: conf } : {}) };
    }
    throw fail('امتیاز نیست');
  }

  // choice | noul
  const direct = asChoice(raw);
  if (direct !== undefined) return { ...base, choice: direct };
  if (!isObj(raw)) throw fail('شکل ناشناخته');

  let choice: string | null | undefined;
  for (const k of ['choice', 'answer', 'value', 'label', 'decision']) {
    if (k in raw) { choice = asChoice(raw[k]); if (choice !== undefined) break; }
  }
  let probabilities: Record<string, number> | undefined;
  for (const k of ['probabilities', 'probs', 'scores', 'distribution']) {
    const p = probMap(raw[k]);
    if (p) { probabilities = p; break; }
  }
  if (choice === undefined) {
    // شیءِ فقط-عدد: توزیع احتمال؛ برگزیده = بیشینه
    const dist = probMap(raw);
    if (!dist) throw fail('گزینه‌ای در پاسخ نیست');
    const best = Object.entries(dist).reduce((a, b) => (b[1] > a[1] ? b : a));
    return { ...base, choice: best[0], probabilities: dist, confidence: best[1] };
  }
  const explicit = [raw.confidence, raw.probability].find(isNum);
  const confidence = explicit ?? (probabilities && choice !== null && isNum(probabilities[choice]) ? probabilities[choice] : undefined);
  return { ...base, choice, ...(probabilities ? { probabilities } : {}), ...(confidence !== undefined ? { confidence } : {}) };
}
