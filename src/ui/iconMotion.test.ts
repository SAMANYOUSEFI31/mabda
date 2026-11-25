import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, type IconName } from './Icon.tsx';

// motion.md «آیکن و نشان»: the icons that move a part carry exactly one marked part, drawn like lucide's own, and nothing else moves
const html = (name: IconName, draw = false) => renderToStaticMarkup(createElement(Icon, { name, draw }));

test('destinations and checks have one stroke to write in, with pathLength 1', () => {
  for (const name of ['House', 'Lightbulb', 'Package', 'Check', 'CircleCheck'] as IconName[]) {
    const out = html(name);
    assert.equal(out.match(/class="mb-ink"/g)?.length, 1, `${name}: one ink stroke`);
    assert.match(out, /pathLength="1"/, `${name}: pathLength`);
    assert.match(out, /class="lucide lucide-/, `${name}: still a lucide icon`);
  }
});

test('out / down / up arrows mark only the arrow', () => {
  assert.equal(html('ExternalLink').match(/mb-ip--out/g)?.length, 2);
  assert.equal(html('Download').match(/mb-ip--down/g)?.length, 2);
  assert.equal(html('Upload').match(/mb-ip--up/g)?.length, 2);
});

test('draw is opt-in: an icon is still unless asked', () => {
  assert.doesNotMatch(html('Check'), /data-draw/);
  assert.match(html('Check', true), /data-draw="true"/);
});

test('«حقیقت» turns a page instead: one leaf, hidden until it turns', () => {
  const out = html('BookOpen');
  assert.equal(out.match(/class="mb-turn"/g)?.length, 1);
  assert.doesNotMatch(out, /mb-ink/);
});

test('«درخواست برای ابزار دیگر» lifts its two flaps', () => {
  const out = html('PackageOpen');
  assert.match(out, /mb-ip--lift-a/); assert.match(out, /mb-ip--lift-b/);
});
