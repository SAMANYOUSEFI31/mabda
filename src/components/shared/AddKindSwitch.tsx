/**
 * The control at the top of every «افزودن» dialog (patterns.md §۳): فکر · حقیقت · فایل. Switching carries the text over.
 */
import React from 'react';
import { SegmentedControl } from '../../ui';
import { ADD_KINDS, requestAdd } from '../../core/addRequest';
import type { AddKind } from '../../core/addRequest';

export const AddKindSwitch: React.FC<{ value: AddKind; text?: string; nodeId?: string; onLeave: (to: AddKind) => void }> = ({ value, text, nodeId, onLeave }) => (
  <SegmentedControl
    label="چه چیزی اضافه می‌کنی؟" fullWidth value={value} items={ADD_KINDS}
    onChange={(id) => {
      if (id === value) return;
      // one box, not three: no exit or enter while she switches (components.css «is-steady»)
      const root = document.documentElement;
      root.dataset.addSwitch = '1';
      setTimeout(() => { delete root.dataset.addSwitch; }, 600);
      onLeave(id as AddKind);
      // after this dialog has closed, so the next one is not refused as «a dialog is open»
      setTimeout(() => requestAdd({ kind: id as AddKind, ...(text?.trim() ? { text } : {}), ...(nodeId ? { nodeId } : {}) }), 0);
    }}
  />
);
