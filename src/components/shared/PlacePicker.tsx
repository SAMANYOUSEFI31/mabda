/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { TreeNode } from '../../types';
import { flatten, treeIndent } from '../../core/nodeTree';
import { Select } from '../../ui';

interface Props {
  nodes: TreeNode[];
  value: string;
  onChange: (nodeId: string) => void;
  /** the field's label when it is open (and its accessible name) */
  label: string;
}

/**
 * Where an answer goes (NEW-01). Wide screens show the picker; on a phone it is one line «در: «بخش» · تغییر» that opens the picker
 * on tap, so a question is not three stacked controls. Same Select, same place; only the phone hides it until asked.
 */
export const PlacePicker: React.FC<Props> = ({ nodes, value, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const options = flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${treeIndent(depth)}${node.label}` }));
  const name = nodes.find((n) => n.id === value)?.label ?? '';
  if (options.length < 2) return null;
  return (
    <>
      {!open && (
        <p className="body-sm flex flex-wrap items-center gap-inline-xs text-text-subtle md:hidden">
          <span>در: «{name}»</span>
          <span aria-hidden="true">·</span>
          <button type="button" className="body-sm inline-flex min-h-touch min-w-touch items-center justify-center text-text-default underline underline-offset-2" aria-label={`${label}: «${name}»؛ تغییر`} onClick={() => setOpen(true)}>تغییر</button>
        </p>
      )}
      <Select label={label} options={options} value={value} onChange={(e) => onChange(e.target.value)} className={open ? '' : 'max-md:hidden'} />
    </>
  );
};
