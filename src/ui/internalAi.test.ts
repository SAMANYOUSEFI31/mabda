/**
 * Internal (platform) AI is frozen behind MABDA_MANAGED_AI (CLAUDE.md). With the flag off no screen may offer or promise
 * Mabda-made answers: no «ساخت با AI», «بازسازی», «همین‌جا جواب بده», Coach, credits, and no click may end in «AI در دسترس نیست».
 * Two guards:
 *  1. static: a file that can show an internal-AI label must read the flag (`managedEnabled` / `ai.managed…`);
 *  2. render: the main parts rendered with the flag off (the default before the status arrives) carry none of the labels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { uiTexts } from './language.test';
import { buildDemo } from '../core/demoData';
import { ContextReplayCard } from '../components/outputs/ContextReplayCard';
import { AiStatusProvider } from '../services/aiStatus';
import { AiStatusBanner } from '../components/shared/AiNotices';

/** labels that mean «Mabda's own AI makes this» */
const INTERNAL_AI_LABELS = [
  'ساخت با AI', 'ساخت با هوش مصنوعی', 'بازسازی با', 'همین‌جا جواب بده', 'مربی دانش', 'گفتگوی متمرکز',
  'هوش مصنوعی فعلاً در دسترس نیست', 'هوش مصنوعی در دسترس نیست', 'مصرف اعتبار', 'اعتبار کافی', 'اعتبار باقی',
];

const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.tsx$/.test(p) ? [p] : []);
const FILES = ['src/App.tsx', 'src/app', 'src/components'].flatMap(walk);

test('every file that can show an internal-AI label reads the flag', () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8');
    if (/managedEnabled|ai\.managed|\bmanaged\b/.test(src)) continue;
    const hit = uiTexts(f, src).filter((t) => INTERNAL_AI_LABELS.some((l) => t.includes(l)));
    if (hit.length) bad.push(`${f}: ${hit.map((t) => t.slice(0, 40)).join(' | ')}`);
  }
  // known files where the label is a name of data or an error shown only after a flag-gated action (reviewed in the PR list)
  const ALLOWED = [
    'src/components/shared/AiNotices.tsx', // the error card: reached only from flag-gated actions
    'src/components/knowledge/CoachPanel.tsx', // the panel itself: opened only from flag-gated entries
    'src/components/context/SmartChat.tsx', // the focused thread: opened only from a flag-gated entry
    'src/components/context/NodeThreadPanel.tsx', // same thread, same entry
    'src/components/knowledge/ProposalInbox.tsx', // «مربی دانش» is a historical source name of an old suggestion
  ];
  const rest = bad.filter((b) => !ALLOWED.some((a) => b.split('\\').join('/').startsWith(a)));
  assert.deepEqual(rest, []);
});

test('flag off: an asset card (including a hand-made sample) offers no «ساخت با AI», no rebuild and no credits', () => {
  const d = buildDemo(new Date('2026-03-10T08:00:00Z'));
  const stale = { deliverableId: d.deliverables[0].id, reasons: [{ kind: 'version_changed', message: 'نسخهٔ یک دانش عوض شده است.' }] } as never;
  for (const [deliverable, st] of [[d.deliverables[0], undefined], [d.deliverables[0], stale]] as const) {
    const html = renderToStaticMarkup(
      React.createElement(AiStatusProvider, null,
        React.createElement(ContextReplayCard, { deliverable, allContextObjects: d.objects, onOpenContextObject: () => undefined, onRebuild: () => undefined, stale: st })),
    );
    assert.ok(html.length > 200, 'the card rendered');
    for (const l of ['ساخت با AI', 'ساخت با هوش مصنوعی', 'بازسازی', 'اعتبار', 'در دسترس نیست']) assert.ok(!html.includes(l), `«${l}» must not appear with the flag off`);
  }
});

test('flag off: the global banner never says «AI در دسترس نیست»', () => {
  const html = renderToStaticMarkup(React.createElement(AiStatusProvider, null, React.createElement(AiStatusBanner)));
  assert.ok(!html.includes('هوش مصنوعی'));
});
