import test from 'node:test';
import assert from 'node:assert/strict';
import { beside, frameAt, freeFrames, shiftFrame, FRAME_HEAD, FRAME_PAD } from './canvasFrames';
import { buildScene } from './canvasScene';
import type { ContextObject, Note, TreeNode } from '../types';

const nodes: TreeNode[] = [{ id: 'ship', label: 'ارسال', description: '' }, { id: 'sub', label: 'اشتراک', description: '' }];
const it = (id: string, nodeId: string, x: number, y: number, unplaced = false) => ({ id, nodeId, x, y, w: 220, h: 120, ...(unplaced ? { unplaced } : {}) });

test('one frame per section with placed cards: the box around them, a header on top, nothing for the tray', () => {
  const fr = freeFrames([it('a', 'ship', 100, 100), it('b', 'ship', 400, 300), it('c', 'sub', 900, 50), it('t', 'sub', 0, 0, true)], nodes);
  assert.deepEqual(fr.map((f) => f.nodeId), ['ship', 'sub']);
  const ship = fr[0];
  assert.deepEqual([ship.x, ship.y, ship.w, ship.h], [100 - FRAME_PAD, 100 - FRAME_HEAD, 520 + 2 * FRAME_PAD, 320 + FRAME_HEAD + FRAME_PAD]);
  assert.deepEqual(ship.ids, ['a', 'b']);
  assert.deepEqual(fr[1].ids, ['c'], 'the unplaced card is not in a frame');
});

test('frameAt: the section under a point (not the card’s own); dragging a card in another frame changes ITS section', () => {
  const fr = freeFrames([it('a', 'ship', 100, 100), it('c', 'sub', 900, 50)], nodes);
  assert.equal(frameAt(fr, 950, 100)?.nodeId, 'sub');
  assert.equal(frameAt(fr, 950, 100, 'sub'), undefined, 'its own section: only a move inside it');
  assert.equal(frameAt(fr, 600, 600), undefined, 'empty canvas');
});

test('moving a frame keeps the group’s shape; nothing leaves the canvas; the menu alternative puts it beside another', () => {
  const items = [it('a', 'ship', 100, 100), it('b', 'ship', 400, 300), it('c', 'sub', 900, 50)];
  const fr = freeFrames(items, nodes);
  assert.deepEqual(shiftFrame(fr[0], items, 50, -20), [{ id: 'a', x: 150, y: 80 }, { id: 'b', x: 450, y: 280 }]);
  assert.deepEqual(shiftFrame(fr[0], items, -500, -500), [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 300, y: 200 }], 'clamped by the member nearest the edge, the shape is kept');
  const { dx, dy } = beside(fr[0], fr[1]);
  const moved = shiftFrame(fr[0], items, dx, dy);
  assert.ok(moved[0].x > fr[1].x + fr[1].w, 'to the right of the other frame');
});

test('a free canvas scene carries nothing new in its data: frames are derived from the cards', () => {
  const o = (id: string, nodeId: string): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: id, nodeId, version: 1, createdAt: '', updatedAt: '' });
  const note: Note = { id: 'n1', workspaceId: 'w', nodeId: 'sub', content: 'یادداشت', createdAt: '', updatedAt: '' };
  const s = buildScene('free', { nodes, objects: [o('x', 'ship')], relationships: [], deliverables: [], notes: [note], canvas: { decisions: [], free: [{ itemRef: 'obj:x', x: 40, y: 80 }, { itemRef: 'note:n1', x: 500, y: 80 }] }, reviewIds: new Set(), staleAssetIds: new Set() });
  const fr = freeFrames(s.items, nodes);
  assert.deepEqual(fr.map((f) => f.nodeId).sort(), ['ship', 'sub']);
});
