import test from 'node:test';
import assert from 'node:assert/strict';
import { addOption, askText, optionConflicts, optionsOf, recordOfChoice, removeOption } from './decisionOptions.ts';
import { aboutToken } from './thoughtAbout.ts';
import type { ContextObject, TreeNode } from '../types';

const nodes = [{ id: 'ws', label: 'کارگاه' }] as unknown as TreeNode[];
const ob = (id: string, p: Partial<ContextObject>) => ({ id, nodeId: 'ws', status: 'Confirmed', type: 'Decision', title: id, content: id, version: 1, ...p }) as unknown as ContextObject;
const note = `[تصمیم باز] کانال فروش کارگاه چه باشد؟\n- اینستاگرام\n- سایت با تخفیف همیشگی ${aboutToken('قیمت کارگاه')}\n- فروش حضوری\n\n[ایده] چیز دیگر`;

test('گزینه‌ها همان خط‌های فهرست زیر تصمیم‌اند و با خط خالی یا خط بعدی تمام می‌شوند', () => {
  const o = optionsOf(note, 0, [ob('p', { title: 'قیمت کارگاه' })], nodes);
  assert.deepEqual(o.map((x) => x.title), ['اینستاگرام', 'سایت با تخفیف همیشگی', 'فروش حضوری']);
  assert.deepEqual(o[1].restsOn, ['p']);
});

test('افزودن و برداشتن گزینه فقط همان خط را عوض می‌کند', () => {
  const added = addOption(note, 0, ' تلگرام ', [], nodes);
  assert.equal(optionsOf(added, 0, [], nodes).length, 4);
  assert.ok(added.includes('[ایده] چیز دیگر'));
  assert.equal(removeOption(added, 1).includes('اینستاگرام'), false);
});

test('تناقض با خط قرمز در حاکم همان بخش، قطعی و بدون حدس', () => {
  const guard = ob('g', { type: 'Constraint', title: 'مرز قیمت کارگاه', content: 'تخفیف نداریم' });
  const hit = optionConflicts({ title: 'تخفیف ۲۰ درصد برای ثبت‌نام زودهنگام', text: 'تخفیف ۲۰ درصد برای ثبت‌نام زودهنگام' }, 'ws', [guard], nodes, [], '2026-01-01');
  const none = optionConflicts({ title: 'فروش حضوری', text: 'فروش حضوری' }, 'ws', [guard], nodes, [], '2026-01-01');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].constraint.id, 'g');
  assert.equal(none.length, 0);
});

test('رکورد انتخاب: انتخاب‌شده بدون دلیل، بقیه با دلیل رد', () => {
  const r = recordOfChoice('کانال؟', 'اینستاگرام', [{ title: 'سایت', reason: ' گران است ' }]);
  assert.deepEqual(r.options, [{ title: 'اینستاگرام' }, { title: 'سایت', rejectedReason: 'گران است' }]);
  assert.equal(r.question, 'کانال؟');
});

test('متن AI برای خواندن و ویرایش آماده است', () => {
  assert.ok(askText('کانال؟', [{ title: 'الف' }, { title: 'ب' }]).includes('2. ب'));
});
