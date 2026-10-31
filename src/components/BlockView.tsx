/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContentBlock } from '../types';
import { Badge, Button, Card, Markdown, TypeBadge } from '../ui';

interface BlockViewProps {
  block: ContentBlock;
  /** opens the Context dialog with a *Proposed* draft; the user confirms there */
  onAddToContext?: (block: ContentBlock) => void;
  onSaveAsAsset?: (block: ContentBlock) => void;
  /** direct approval of the model's proposal (explicit user click) */
  onApproveProposal?: (block: ContentBlock) => void;
  onDismissProposal?: (block: ContentBlock) => void;
}

const KIND_TYPE = { fact: 'Fact', decision: 'Decision', constraint: 'Constraint' } as const;

/** One structured answer block: Markdown + per-block actions (add to Context, save as asset, copy). */
export const BlockView: React.FC<BlockViewProps> = ({ block, onAddToContext, onSaveAsAsset, onApproveProposal, onDismissProposal }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(block.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const type = block.kind in KIND_TYPE ? KIND_TYPE[block.kind as keyof typeof KIND_TYPE] : null;

  return (
    <div className="flex flex-col gap-stack-xs" data-block-kind={block.kind}>
      {(type || block.kind === 'question') && (
        <div>{type ? <TypeBadge value={type} /> : <Badge intent="info" icon="Info">سؤال</Badge>}</div>
      )}
      <Markdown>{block.markdown}</Markdown>

      {block.proposal && onApproveProposal && (
        <Card padding="md" className="flex flex-col gap-stack-sm">
          <div className="flex flex-wrap items-center justify-between gap-inline-sm">
            <span className="label-md text-text-default">پیشنهاد ثبت در منبع حقیقت: {block.proposal.title}</span>
            <TypeBadge value={block.proposal.type} />
          </div>
          <p className="body-sm text-text-subtle">{block.proposal.content}</p>
          {block.proposal.reason && <p className="caption text-text-subtle">{block.proposal.reason}</p>}
          <div className="flex flex-wrap items-center gap-inline-sm">
            <Button size="sm" variant="secondary" iconStart="Check" onClick={() => onApproveProposal(block)}>تأیید و افزودن به منبع حقیقت</Button>
            {onDismissProposal && <Button size="sm" variant="ghost" onClick={() => onDismissProposal(block)}>رد کردن</Button>}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-inline-xs">
        {onAddToContext && <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => onAddToContext(block)}>به Context اضافه کن</Button>}
        {onSaveAsAsset && <Button size="sm" variant="ghost" iconStart="Package" onClick={() => onSaveAsAsset(block)}>ذخیره به‌عنوان دارایی</Button>}
        <Button size="sm" variant="ghost" iconStart={copied ? 'Check' : 'Copy'} onClick={copy}>{copied ? 'کپی شد' : 'کپی'}</Button>
      </div>
    </div>
  );
};
