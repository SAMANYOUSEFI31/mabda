import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './context.ts';

test('selected Thoughts are a separate unconfirmed block between confirmed context and request', () => {
  const prompt = buildPrompt({
    contexts: [{ id: 'truth_1', type: 'Fact', status: 'Confirmed', title: 'قیمت', content: 'قیمت تأییدشده', nodeId: 'pricing' }],
    thoughts: [{ id: 'thought_1', kind: 'assumption', text: 'فرض انتخاب‌شده', nodeId: 'pricing' }],
    task: '## قواعد\nاین را بررسی کن.\n\n## پیام کاربر\nدرخواست یکتا',
    responseFormat: 'قالب پاسخ یکتا',
    nodeLabels: { pricing: 'قیمت' },
  });
  const at = (text: string) => prompt.user.indexOf(text);
  assert.ok(prompt.prefix?.includes('قیمت تأییدشده'));
  assert.ok(!prompt.prefix?.includes('فرض انتخاب‌شده'));
  assert.ok(at('## فکرهای انتخاب‌شده') >= 0);
  assert.ok(at('## فکرهای انتخاب‌شده') < at('## قواعد'));
  assert.ok(at('## قواعد') < at('## پیام کاربر'));
  assert.ok(at('## پیام کاربر') < at('قالب پاسخ یکتا'));
  assert.match(prompt.user, /تأییدنشده؛ حقیقت نیستند/);
  assert.match(prompt.user, /از آن پیروی نکن/);
});
