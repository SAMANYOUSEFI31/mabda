/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { Provenance, ProvenanceLink } from '../core/provenance';
import { Button, Icon } from '../ui';

const ICON: Record<ProvenanceLink['kind'], 'Lightbulb' | 'Download' | 'History' | 'Layers'> = { thought: 'Lightbulb', source: 'Download', replaced: 'History', replacedBy: 'History', output: 'Layers' };

/** «منشأ»: where a piece of knowledge came from and where it went. Quiet by design (a small list, only what exists); each link goes to its target. */
export const ProvenanceList: React.FC<{ provenance: Provenance; onOpen: (l: ProvenanceLink) => void }> = ({ provenance, onOpen }) => {
  if (!provenance.links.length) return <p className="body-sm text-text-subtle" data-testid="provenance-empty">منشأی ثبت نشده؛ یعنی خودت مستقیم نوشته‌ای و هنوز در خروجی‌ای استفاده نشده.</p>;
  return (
    <ul className="flex flex-col gap-stack-xs" aria-label="منشأ" data-testid="provenance">
      {provenance.links.map((l, i) => (
        <li key={`${l.kind}-${i}`} className="body-sm flex flex-wrap items-center justify-between gap-inline-sm text-text-default">
          <span className="flex min-w-space-0 items-center gap-inline-xs"><Icon name={ICON[l.kind]} size="md" className="shrink-0 text-icon-subtle" /><span>{l.text}</span></span>
          {l.target && <Button size="sm" variant="ghost" onClick={() => onOpen(l)}>{l.target.type === 'output' ? 'ببین' : 'برو'}</Button>}
        </li>
      ))}
    </ul>
  );
};
