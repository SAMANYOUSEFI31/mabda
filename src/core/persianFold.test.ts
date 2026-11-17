import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persianFold } from './persianFold';
import { normalizeFa } from './contextEngine';
import { normalizeText } from './retrieval';

test('persianFold: ۀ/ة→ه, tatweel and harakat out, ZWNJ/RLM→space, digits Latin', () => {
  assert.equal(persianFold('خانۀ'), 'خانه');
  assert.equal(persianFold('زكـات'), 'زکات');
  assert.equal(persianFold('کتاب‌ها‏۱۲٣'), 'کتاب ها 123');
});

test('normalizeFa and retrieval normalizeText fold identically (one shared normalizer)', () => {
  for (const s of ['خانۀ بزرگ', 'ة', 'كتـاب ي', 'قیمت ۵۰۰ تومان', 'مشتری‌ها']) {
    assert.equal(normalizeFa(s), normalizeText(s).replace(/\s+/g, ' ').trim());
  }
});
