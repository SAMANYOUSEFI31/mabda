import test from 'node:test';
import assert from 'node:assert/strict';
import { fromJsonCanvas, toJsonCanvas } from './jsonCanvas';

const cards = [{ id: 'o:a', text: 'قیمت پایه\nپنج میلیون', x: 10, y: 20, w: 232, h: 76 }, { id: 'note:b', text: 'فکر آزاد', x: -40, y: 300, w: 200, h: 60 }];
const links = [{ id: 'l1', from: 'o:a', to: 'note:b', label: 'وابسته به' }];

test('round trip: export → file text → import gives the same cards and links', () => {
  const file = toJsonCanvas(cards, links);
  const back = fromJsonCanvas(JSON.stringify(file));
  assert.deepEqual(back.cards, cards);
  assert.deepEqual(back.links, links);
  assert.equal(back.skipped, 0);
  assert.deepEqual(file.nodes[0], { id: 'o:a', type: 'text', text: 'قیمت پایه\nپنج میلیون', x: 10, y: 20, width: 232, height: 76 });
  assert.deepEqual(toJsonCanvas(back.cards, back.links), file, 'stable');
});

test('export drops links whose ends are not exported; import keeps only text nodes and valid links', () => {
  assert.deepEqual(toJsonCanvas(cards, [{ id: 'x', from: 'o:a', to: 'missing' }]).edges, []);
  const foreign = { nodes: [{ id: '1', type: 'text', text: 'الف', x: 1, y: 2, width: 3, height: 4 }, { id: '2', type: 'file', file: 'a.md', x: 0, y: 0, width: 1, height: 1 }, { id: '3', type: 'group', x: 0, y: 0, width: 1, height: 1 }, { id: '4', type: 'text', text: 'ب' }], edges: [{ id: 'e', fromNode: '1', toNode: '4' }, { id: 'bad', fromNode: '1', toNode: '2' }] };
  const r = fromJsonCanvas(JSON.stringify(foreign));
  assert.deepEqual(r.cards.map((c) => [c.id, c.w, c.h]), [['1', 3, 4], ['4', 232, 76]]);
  assert.deepEqual(r.links.map((l) => l.id), ['e']);
  assert.equal(r.skipped, 2);
});

test('garbage is rejected with a Persian message', () => {
  assert.throws(() => fromJsonCanvas('not json'), /JSON معتبر نیست/);
  assert.throws(() => fromJsonCanvas('{"edges":[]}'), /بوم JSON Canvas نیست/);
});
