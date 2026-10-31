/**
 * TEST/DEV-ONLY stand-in for the Gemini REST API (no network, no model). It speaks just enough of
 * models.list / generateContent / streamGenerateContent (SSE) for end-to-end runs of server + UI, and returns
 * SCRIPTED text. Output produced through it is NOT model output and must never be presented as such.
 * Run: MABDA_GEMINI_BASE_URL=http://127.0.0.1:4010 (see scripts/e2e-ai.mjs)
 */
import http from 'node:http';

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];
const hasKey = (req: http.IncomingMessage) => String(req.headers['x-goog-api-key'] ?? '').startsWith('AIzaSy');

function decide(schema: string) {
  const pick = (id: string, choices: string[], want: string) => ({ id, choice: choices.includes(want) ? want : choices[0], probability: 0.91 });
  return { answers: [pick('taskKind', ['chat', 'extraction', 'drafting', 'strategy', 'analysis'], 'drafting'), pick('difficulty', ['easy', 'medium', 'hard'], 'medium'), pick('importance', ['low', 'medium', 'high'], 'medium')], _s: schema.length };
}

function reply(body: any, attempt: { n: number }) {
  const cfg = body.generationConfig ?? {};
  const schema = JSON.stringify(cfg.responseJsonSchema ?? cfg.responseSchema ?? {});
  const userText = JSON.stringify(body.contents ?? []);
  const isChat = userText.includes('پیام کاربر');
  if (schema.includes('probability') && schema.includes('"reason"')) {
    const ids: string[] = cfg.responseJsonSchema?.properties?.answers?.items?.properties?.id?.enum ?? cfg.responseSchema?.properties?.answers?.items?.properties?.id?.enum ?? [];
    const bad = (process.env.FAKE_BAD_CHECKS ?? '').split(',').filter(Boolean);
    return { text: JSON.stringify({ answers: ids.map((id) => ({ id, choice: bad.includes(id) ? (id[0] === 'g' ? 'violated' : id[0] === 'o' ? 'ambiguous' : 'fail') : id[0] === 'g' ? 'ok' : id[0] === 'o' ? 'clear' : 'pass', probability: 0.9, reason: bad.includes(id) ? '(stand-in) این مورد رعایت نشده است.' : '(stand-in) در متن خروجی رعایت شده است.' })) }), thinking: 0 };
  }
  if (schema.includes('ambiguities')) {
    return { text: JSON.stringify({ questions: ['(stand-in) مخاطب دقیقاً چه کسانی‌اند؟', '(stand-in) بودجه چقدر است؟'], ambiguities: [{ quote: 'مشتری خوب', why: '(stand-in) معیار سنجش ندارد.' }], proposals: [{ type: 'Fact', title: 'نمونهٔ Coach (stand-in)', content: 'کسب‌وکار روی فریلنسرها تمرکز دارد.', nodeId: 'business' }] }), thinking: 0 };
  }
  if (schema.includes('probability')) { const d = decide(schema); return { text: JSON.stringify({ answers: d.answers }), thinking: 0 }; }
  if (schema.includes('passedCriteria')) {
    attempt.n++;
    const fail = Boolean(process.env.FAKE_FAIL_FIRST) && attempt.n === 1;
    return { text: JSON.stringify({ passed: !fail, score: fail ? 52 : 91, passedCriteria: fail ? [] : ['معیار نمونه'], failedCriteria: fail ? ['معیار نمونه'] : [], guardrailViolations: [], strengths: ['(پاسخ نمونهٔ stand-in)'] }), thinking: 0 };
  }
  if (schema.includes('"objects"')) {
    return { text: JSON.stringify({ summary: '(stand-in — خروجی مدل نیست) خلاصهٔ آزمایشی فایل.', objects: [
      { type: 'Fact', title: 'بودجهٔ کمپین (stand-in)', content: 'بودجهٔ کمپین پاییز پنجاه میلیون تومان است.', nodeId: 'content' },
      { type: 'Decision', title: 'کانال اصلی (stand-in)', content: 'اینستاگرام کانال اصلی کمپین است.', nodeId: 'content' },
    ] }), thinking: 0 };
  }
  if (schema.includes('issues')) return { text: JSON.stringify({ issues: ['(stand-in) لحن را صریح‌تر کن'], strengths: ['ساختار'] }), thinking: 120 };
  const blocks = isChat
    ? [
        { id: 'b1', kind: 'paragraph', markdown: '**[stand-in — خروجی مدل نیست]** این پاسخ برای آزمون یکپارچگی سرور و UI ساخته شده است.' },
        { id: 'b2', kind: 'decision', markdown: '- تصمیم نمونه: روی **فریلنسرها** تمرکز کنیم.\n- بدون تخفیف.', proposal: { type: 'Decision', title: 'تمرکز روی فریلنسرها', content: 'مخاطب اصلی فریلنسرها هستند.', nodeId: 'business', reason: 'از پیام کاربر' } },
      ]
    : [
        { id: 'b1', kind: 'heading', markdown: '### جملهٔ موقعیت‌یابی (stand-in)' },
        { id: 'b2', kind: 'paragraph', markdown: 'برای فریلنسرها که زمان زیادی صرف توضیح دوبارهٔ کسب‌وکارشان می‌کنند، مبدأ منبع حقیقتی است که هر خروجی را به دانش تأییدشده وصل می‌کند.' },
        { id: 'b3', kind: 'table', markdown: '| ستون | پیام |\n| --- | --- |\n| ۱ | پایان حافظهٔ گنگ |\n| ۲ | اقتصاد صادقانه |' },
      ];
  return { text: JSON.stringify({ blocks }), thinking: 300 };
}

export function startFakeGemini(port = 4010): Promise<http.Server> {
  const attempt = { n: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!hasKey(req) && !url.searchParams.get('key')?.startsWith('AIzaSy')) {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 403, message: 'API key not valid', status: 'PERMISSION_DENIED' } }));
    }
    if (req.method === 'GET' && /\/models$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ models: MODELS.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'], supportedActions: ['generateContent'] })) }));
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body: any = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
      const r = reply(body, attempt);
      const promptTokens = Math.ceil(raw.length / 3);
      const usage = { promptTokenCount: promptTokens, cachedContentTokenCount: Math.floor(promptTokens / 2), candidatesTokenCount: Math.ceil(r.text.length / 3), thoughtsTokenCount: r.thinking, totalTokenCount: 0 };
      const one = (text: string, withUsage: boolean) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }], ...(withUsage ? { usageMetadata: usage } : {}) });
      if (/streamGenerateContent/.test(url.pathname)) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const t = r.text;
        const step = 40;
        for (let i = 0; i < t.length; i += step) {
          const last = i + step >= t.length;
          res.write(`data: ${JSON.stringify(one(t.slice(i, i + step), last))}\n\n`);
        }
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(one(r.text, true)));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1]?.endsWith('fakeGemini.ts')) {
  startFakeGemini(Number(process.env.FAKE_GEMINI_PORT ?? 4010)).then(() => console.log('fake gemini on :4010'));
}
