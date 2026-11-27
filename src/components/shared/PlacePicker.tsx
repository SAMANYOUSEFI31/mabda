/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { TreeNode } from '../../types';
import { NodePicker, NodePickerField } from '../structure/NodePicker';

interface Props {
  nodes: TreeNode[];
  value: string;
  onChange: (nodeId: string) => void;
  /** the field's label when it is open (and its accessible name) */
  label: string;
}

/**
 * Where an answer goes (NEW-01). Wide screens show the section field; on a phone it is one line «در: «بخش» · تغییر» that opens the
 * section picker (a sheet) on tap, so a question is not three stacked controls. The same picker as every «کدام بخش؟» (NodePicker).
 */
export const PlacePicker: React.FC<Props> = ({ nodes, value, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const name = nodes.find((n) => n.id === value)?.label ?? '';
  if (nodes.length < 2) return null;
  return (
    <>
      <p className="body-sm flex flex-wrap items-center gap-inline-xs text-text-subtle md:hidden">
          <span>در: «{name}»</span>
          <span aria-hidden="true">·</span>
          <button type="button" className="body-sm inline-flex min-h-touch min-w-touch items-center justify-center text-text-default underline underline-offset-2" aria-label={`${label}: «${name}»؛ تغییر`} onClick={() => setOpen(true)}>تغییر</button>
        </p>
      <NodePicker open={open} onClose={() => setOpen(false)} title={label} nodes={nodes} value={value} onPick={onChange} />
      <NodePickerField label={label} nodes={nodes} value={value} onChange={onChange} className="max-md:hidden" />
    </>
  );
};
