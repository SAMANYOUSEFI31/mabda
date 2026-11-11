/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { proposalContext } from '../../core/proposalContext';
import { BeforeAfter } from '../shared/BeforeAfter';
import type { ContextObject, ObjectSource, TreeNode } from '../../types';
import { Badge, Button, Card, TextField, TypeBadge, formatJalaliDate, formatNumber } from '../../ui';

const KIND_FA: Record<ObjectSource['kind'], string> = {
  mcp: 'AI بیرونی', chat: 'گفتگو', coach: 'مربی دانش', file: 'فایل', note: 'یادداشت', paste: 'پاسخ چسبانده‌شده', user: 'خودم', asset: 'خروجی ساخته‌شده',
};

interface Props {
  objects: ContextObject[];
  nodes: TreeNode[];
  /** the optional reason goes to the Change log (never into the text) */
  onAccept: (obj: ContextObject, reason?: string) => void;
  onReplace: (obj: ContextObject, replacesId: string, reason?: string) => void;
  onEdit: (obj: ContextObject) => void;
  onReject: (obj: ContextObject, reason?: string) => void;
  onOpenImport: () => void;
  onOpenPack: () => void;
  onOpenMemory: () => void;
  /** the caller already ordered them (upper section first): keep that order instead of newest-first */
  keepOrder?: boolean;
  /** id → one line about the order («زیربخش‌ها از این ارث می‌برند…») */
  hints?: Record<string, string>;
}

/** Suggested, imported and pasted content waits here. Nothing is a fact until the user confirms it. */
export const ProposalInbox: React.FC<Props> = ({ objects, nodes, onAccept, onReplace, onEdit, onReject, onOpenImport, onOpenPack, onOpenMemory, keepOrder, hints }) => {
  const pending = objects.filter((o) => o.status === 'Proposed').sort(keepOrder ? () => 0 : (a, b) => (b.source?.at ?? b.createdAt).localeCompare(a.source?.at ?? a.createdAt));
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const [reasons, setReasons] = useState<Record<string, string | undefined>>({}); // undefined = field closed
  const reasonOf = (id: string) => reasons[id]?.trim() || undefined;
  const actions = (
    <div className="flex flex-wrap items-center gap-inline-sm">
      <Button variant="secondary" size="sm" iconStart="Copy" onClick={onOpenPack}>کپی کل دانش برای استفاده در هر ابزار</Button>
      <Button variant="secondary" size="sm" iconStart="Upload" onClick={onOpenImport}>وارد کردن متن آماده</Button>
      <Button variant="secondary" size="sm" iconStart="Brain" onClick={onOpenMemory}>وارد کردن حافظه از ابزار دیگر</Button>
    </div>
  );

  // nothing waiting: one sentence and the ways to bring AI suggestions in — no big empty card
  if (pending.length === 0) {
    return (
      <Card padding="md" id="proposal-inbox" className="flex flex-col justify-between gap-inline-md md:flex-row md:items-center" aria-label="صندوق پیشنهادها">
        <p className="body-md text-text-subtle">صندوق پیشنهادها خالی است. هر چیزی که وارد کنی و هنوز تأیید نشده باشد اینجا منتظر تأیید تو می‌ماند.</p>
        {actions}
      </Card>
    );
  }

  return (
    <Card padding="xl" id="proposal-inbox" className="flex flex-col gap-stack-lg" aria-label="صندوق پیشنهادها">
      <div className="flex flex-col justify-between gap-inline-md border-b border-border-default pb-inset-lg md:flex-row md:items-center">
        <div className="flex flex-col gap-stack-xs">
          <div className="flex items-center gap-inline-sm">
            <h2 className="heading-sm text-text-default">صندوق پیشنهادها</h2>
            <Badge intent="warning" icon={false}>{formatNumber(pending.length)} منتظر تأیید</Badge>
          </div>
          <p className="body-sm text-text-subtle">پیشنهادها، فایل‌ها و متن‌های واردشده اینجا می‌مانند. تا تأیید نکنی واقعیت نیستند و به‌عنوان واقعیت به هیچ ابزاری داده نمی‌شوند.</p>
        </div>
        {actions}
      </div>

      <ul className="flex flex-col gap-stack-md">
        {pending.map((o) => (
          <li key={o.id} className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
            <div className="flex flex-wrap items-center justify-between gap-inline-sm">
              <div className="flex flex-wrap items-center gap-inline-sm">
                <TypeBadge value={o.type} />
                <span className="label-md text-text-default">{o.title}</span>
              </div>
              <span className="body-sm text-text-subtle">{label(o.nodeId)}</span>
            </div>
            {hints?.[o.id] && <p className="body-sm text-text-subtle">{hints[o.id]}</p>}
            {(() => {
              const ctx = proposalContext(o, objects);
              return (
                <>
                  <div className="flex flex-col gap-stack-xs">
                    <span className="label-sm text-text-subtle">تغییر پیشنهادی</span>
                    {ctx.replaces ? (
                      <>
                        <p className="body-sm text-text-default">جای «{ctx.replaces.title}» را می‌گیرد{ctx.replaces.title !== o.title ? ` با عنوان «${o.title}»` : ''}:</p>
                        <BeforeAfter before={ctx.replaces.content} after={o.content} />
                      </>
                    ) : (
                      <p className="body-md text-text-default">{o.content}</p>
                    )}
                  </div>
                  {!ctx.replaces && ctx.related.length > 0 && (
                    <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
                      <span className="label-sm text-text-subtle">همین حوالی از قبل ثبت شده؛ ناسازگاری دارند؟</span>
                      <ul className="flex flex-col gap-stack-xs">
                        {ctx.related.map((r) => (
                          <li key={r.id} className="body-sm text-text-default"><span className="label-sm">{r.title}:</span> {r.content.length > 140 ? `${r.content.slice(0, 140)}…` : r.content}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
            {o.source?.reason && <p className="body-sm text-text-subtle">دلیل پیشنهاد: {o.source.reason}</p>}
            <div className="flex flex-wrap items-center justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm">
              <span className="body-sm text-text-subtle">
                منبع: {o.source ? `${KIND_FA[o.source.kind]}${o.source.label ? ` («${o.source.label}»)` : ''} · ${formatJalaliDate(o.source.at)}` : `پیشنهاد AI · ${formatJalaliDate(o.createdAt)}`}
              </span>
              <div className="flex flex-wrap items-center gap-inline-xs">
                {(() => {
                  const replaces = proposalContext(o, objects).replaces;
                  return replaces ? (
                    <>
                      <Button size="sm" variant="secondary" iconStart="Check" onClick={() => onReplace(o, replaces.id, reasonOf(o.id))}>جایگزین کن</Button>
                      <Button size="sm" variant="ghost" onClick={() => onAccept(o, reasonOf(o.id))}>تأیید کنار قبلی</Button>
                    </>
                  ) : <Button size="sm" variant="secondary" iconStart="Check" onClick={() => onAccept(o, reasonOf(o.id))}>تأیید</Button>;
                })()}
                <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => onEdit(o)}>ویرایش</Button>
                <Button size="sm" variant="ghost" iconStart="X" onClick={() => onReject(o, reasonOf(o.id))}>رد</Button>
                <Button size="sm" variant="ghost" aria-expanded={reasons[o.id] !== undefined} onClick={() => setReasons((r) => ({ ...r, [o.id]: r[o.id] === undefined ? '' : undefined }))}>دلیل (اختیاری)</Button>
              </div>
            </div>
            {reasons[o.id] !== undefined && (
              <TextField label={`دلیل برای «${o.title}»`} hint="در تاریخچهٔ تغییرها ثبت می‌شود، نه در متن." value={reasons[o.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [o.id]: e.target.value }))} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};
