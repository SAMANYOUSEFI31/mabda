/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { ContextObject, TreeNode } from '../types';
import { composeThought, guessThoughtKind, THINKING_FA, THOUGHT_KINDS } from '../core/thoughts';
import type { ThinkingKind } from '../core/thinkingMarkers';
import { flatten } from '../core/nodeTree';
import { Button, Dialog, SegmentedControl, Select } from '../ui';
import { MentionTextarea } from './MentionTextarea';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: TreeNode[];
  objects: ContextObject[];
  /** the node it is opened from (a node page): chosen for her; empty = no particular place */
  nodeId?: string;
  onSave: (nodeId: string, content: string) => Promise<void>;
}

/**
 * «فکر تازه»: one box, four chips (ایده by default; a text that ends with «؟» becomes a سؤال by itself, and she can change it).
 * No bracket to learn: the marker is written FOR her. A thought is never knowledge and never goes to an AI.
 */
export const ThoughtDialog: React.FC<Props> = ({ open, onClose, nodes, objects, nodeId = '', onSave }) => {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ThinkingKind>('idea');
  const [touched, setTouched] = useState(false);
  const [node, setNode] = useState(nodeId);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(''); setKind('idea'); setTouched(false); setNode(nodeId); } }, [open, nodeId]);
  useEffect(() => { if (!touched) setKind(guessThoughtKind(text)); }, [text, touched]);

  const save = async () => {
    const content = composeThought(text, kind);
    if (!content) return;
    setBusy(true);
    try { await onSave(node, content); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open} onClose={onClose} size="md" title="فکر تازه" description="هرچه هنوز حقیقت نیست: یک ایده، سؤال، فرض یا تصمیمی که باز مانده. جدا از دانش می‌ماند و به AI نمی‌رسد."
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={busy} disabled={!text.trim()} onClick={save}>ذخیره</Button></>}
    >
      <div className="flex flex-col gap-stack-md" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } }}>
        <MentionTextarea label="فکرت را بنویس" rows={3} value={text} onValueChange={setText} objects={objects} placeholder="مثلاً: قیمت اشتراک سه‌ماهه چقدر باشد؟" hint="با @ نام یک دانش را بیاور. Ctrl/⌘+Enter ذخیره می‌کند؛ نشانگر را خودمان می‌نویسیم." />
        <SegmentedControl label="این یک…" value={kind} onChange={(v) => { setKind(v as ThinkingKind); setTouched(true); }} items={THOUGHT_KINDS.map((k) => ({ id: k, label: THINKING_FA[k] }))} />
        <Select label="دربارهٔ کدام بخش؟ (اختیاری)" value={node} onChange={(e) => setNode(e.target.value)} options={[{ value: '', label: 'بدون بخش مشخص' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))]} />
      </div>
    </Dialog>
  );
};
