/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { THINKING_FA, displayLine, kindOfLine, markLine, parseThinking, continuationLines } from '../core/thinkingMarkers';
import type { ThinkingKind } from '../core/thinkingMarkers';
import { IconButton, Menu, ThinkingBadge } from '../ui';

const KINDS: ThinkingKind[] = ['question', 'assumption', 'open_decision', 'idea'];

interface Props {
  content: string;
  /** the note text with a line marked / unmarked (the caller saves it) */
  onChange: (content: string) => void | Promise<void>;
}

/**
 * A note shown line by line. The system's reading of each line is a quiet badge (a line that ends with «؟» is a question by
 * itself); hovering a line — or holding it on a phone — opens a small menu «علامت بزن» that writes the marker for the user.
 * Nobody has to learn a bracket, and the note text is never changed except by choosing from this menu.
 */
export const NoteLines: React.FC<Props> = ({ content, onChange }) => {
  const press = useRef<number | undefined>(undefined);
  const lines = content.split('\n');
  const items = new Map(parseThinking(content).map((i) => [i.line, i]));
  const continued = continuationLines(content);
  return (
    <div className="flex flex-col" data-testid="note-lines">
      {lines.map((raw, i) => {
        if (!raw.trim()) return <div key={i} className="h-stack-sm" aria-hidden="true" />;
        // the 2nd, 3rd… line of ONE thought: it is part of the thought above, so no badge and no marker menu of its own
        if (continued.has(i)) return <p key={i} data-line={i} className="body-md ps-inset-lg whitespace-pre-wrap text-text-default">{raw.replace(/\\\s*$/, '')}</p>;
        const kind = kindOfLine(raw);
        const explicit = !!items.get(i) && !items.get(i)!.inferred;
        const shown = (explicit ? displayLine(raw) : raw).replace(/\\\s*$/, '');
        return (
          <div
            key={i}
            className="note-line group relative flex items-start justify-between gap-inline-sm rounded-control-sm"
            data-line={i}
            onPointerDown={(e) => { if (e.pointerType !== 'touch') return; const el = e.currentTarget; window.clearTimeout(press.current); press.current = window.setTimeout(() => el.querySelector<HTMLButtonElement>('.note-mark')?.click(), 520); }}
            onPointerUp={() => window.clearTimeout(press.current)}
            onPointerMove={() => window.clearTimeout(press.current)}
            onPointerCancel={() => window.clearTimeout(press.current)}
          >
            <p className="body-md min-w-space-0 flex-1 whitespace-pre-wrap text-text-default">
              {kind && <ThinkingBadge kind={kind} className="me-inline-xs align-middle" />}
              {shown}
            </p>
            <Menu
              label="علامت بزن"
              align="end"
              trigger={<IconButton icon="TagIcon" size="sm" label={`علامت بزن: ${raw.trim().slice(0, 24)}`} className="note-mark shrink-0" />}
              items={[
                ...KINDS.map((k) => ({ label: `${THINKING_FA[k]}${kind === k ? ' ✓' : ''}`, icon: kind === k ? ('Check' as const) : undefined, onSelect: () => void onChange(markLine(content, i, k)) })),
                ...(explicit ? [{ divider: true } as const, { label: 'بدون علامت', onSelect: () => void onChange(markLine(content, i, null)) }] : []),
              ]}
            />
          </div>
        );
      })}
    </div>
  );
};
