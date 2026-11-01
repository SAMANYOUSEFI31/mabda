/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ContextObject, ObjectSource, TreeNode } from '../types';
import { Badge, Button, Card, EmptyState, TypeBadge, formatJalaliDate, formatNumber } from '../ui';

const KIND_FA: Record<ObjectSource['kind'], string> = {
  mcp: 'AI بیرونی (MCP)', chat: 'گفتگو', coach: 'Context Coach', file: 'فایل', note: 'یادداشت', paste: 'پاسخ چسبانده‌شده', user: 'خودم',
};

interface Props {
  objects: ContextObject[];
  nodes: TreeNode[];
  onAccept: (obj: ContextObject) => void;
  onEdit: (obj: ContextObject) => void;
  onReject: (obj: ContextObject) => void;
  onOpenImport: () => void;
  onOpenPack: () => void;
  onOpenConnect: () => void;
}

/** Everything suggested by an AI (MCP client, chat, Coach, a file, a note, a pasted answer) waits here. Nothing is a fact until the user confirms it. */
export const ProposalInbox: React.FC<Props> = ({ objects, nodes, onAccept, onEdit, onReject, onOpenImport, onOpenPack, onOpenConnect }) => {
  const pending = objects.filter((o) => o.status === 'Proposed').sort((a, b) => (b.source?.at ?? b.createdAt).localeCompare(a.source?.at ?? a.createdAt));
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <Card padding="xl" className="flex flex-col gap-stack-lg" aria-label="صندوق پیشنهادها">
      <div className="flex flex-col justify-between gap-inline-md border-b border-border-default pb-inset-lg md:flex-row md:items-center">
        <div className="flex flex-col gap-stack-xs">
          <div className="flex items-center gap-inline-sm">
            <h2 className="heading-sm text-text-default">صندوق پیشنهادها</h2>
            <Badge intent={pending.length ? 'warning' : 'neutral'} icon={false}>{formatNumber(pending.length)} منتظر تأیید</Badge>
          </div>
          <p className="body-sm text-text-subtle">پیشنهاد هر AI (Claude از طریق MCP، گفتگو، Coach، فایل، پاسخ چسبانده‌شده) اینجا می‌ماند. تا تأیید نکنی واقعیت نیست و به‌عنوان واقعیت به هیچ AI داده نمی‌شود.</p>
        </div>
        <div className="flex flex-wrap items-center gap-inline-sm">
          <Button variant="secondary" size="sm" iconStart="Copy" onClick={onOpenPack}>کپی کل دانش برای AI</Button>
          <Button variant="secondary" size="sm" iconStart="Upload" onClick={onOpenImport}>وارد کردن پاسخ AI</Button>
          <Button variant="secondary" size="sm" iconStart="Link2" onClick={onOpenConnect}>اتصال به Claude و AIهای دیگر</Button>
        </div>
      </div>

      {pending.length === 0 ? (
        <EmptyState icon="Inbox" title="پیشنهاد منتظری نیست" description="وقتی AI تو چیزی پیشنهاد بدهد (از طریق MCP یا پاسخ چسبانده‌شده)، اینجا می‌بینی که از کدام AI و کی آمده." />
      ) : (
        <ul className="flex flex-col gap-stack-md">
          {pending.map((o) => (
            <li key={o.id} className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <div className="flex flex-wrap items-center gap-inline-sm">
                  <TypeBadge value={o.type} />
                  <span className="label-md text-text-default">{o.title}</span>
                </div>
                <span className="caption text-text-subtle">{label(o.nodeId)}</span>
              </div>
              <p className="body-md text-text-default">{o.content}</p>
              {o.source?.reason && <p className="caption text-text-subtle">دلیل پیشنهاد: {o.source.reason}</p>}
              <div className="flex flex-wrap items-center justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm">
                <span className="caption text-text-subtle">
                  منبع: {o.source ? `${KIND_FA[o.source.kind]}${o.source.label ? ` («${o.source.label}»)` : ''} · ${formatJalaliDate(o.source.at)}` : `پیشنهاد AI · ${formatJalaliDate(o.createdAt)}`}
                </span>
                <div className="flex items-center gap-inline-xs">
                  <Button size="sm" variant="secondary" iconStart="Check" onClick={() => onAccept(o)}>تأیید</Button>
                  <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => onEdit(o)}>ویرایش</Button>
                  <Button size="sm" variant="ghost" iconStart="X" onClick={() => onReject(o)}>رد</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
