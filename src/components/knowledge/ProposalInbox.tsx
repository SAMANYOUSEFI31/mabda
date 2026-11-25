/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { proposalContext } from '../../core/proposalContext';
import { useAiStatus } from '../../services/aiStatus';
import { importLabel } from '../../core/importLabel';
import { SOURCE_FA } from '../../core/provenance';
import { BeforeAfter } from '../shared/BeforeAfter';
import type { ContextObject, ObjectSource, TreeNode } from '../../types';
import { Badge, Button, Card, IconButton, Menu, PROVENANCE_LABEL, TextField, TypeBadge, formatJalaliDate, formatNumber, Nuqta, TYPE_META, sampleMark, useLeaving } from '../../ui';

const KIND_FA = SOURCE_FA; // one dictionary with the provenance lines (core/provenance.ts)

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
  /** inside «منتظر تو» on «فکر»: a sub-heading under that section, not a peer of it (decisions.md §۳۸) */
  nested?: boolean;
}

/** Suggested, imported and pasted content waits here. Nothing is a fact until the user confirms it. */
export const ProposalInbox: React.FC<Props> = ({ objects, nodes, onAccept, onReplace, onEdit, onReject, onOpenImport, onOpenPack, onOpenMemory, keepOrder, hints, nested }) => {
  const pending = objects.filter((o) => o.status === 'Proposed').sort(keepOrder ? () => 0 : (a, b) => (b.source?.at ?? b.createdAt).localeCompare(a.source?.at ?? a.createdAt));
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const [reasons, setReasons] = useState<Record<string, string | undefined>>({}); // undefined = field closed
  const reasonOf = (id: string) => reasons[id]?.trim() || undefined;
  const { managedEnabled } = useAiStatus();
  // a proposal that is decided does not vanish: an approved one shows its dot settling into «حقیقت», then the row fades and its
  // gap closes (motion.md «تأیید: پیشنهاد ← حقیقت»); a rejected one just fades and closes. The list never jumps.
  // (which ones were approved is remembered here: the parent may pass only the proposals, so the approved one is no longer in it)
  const accepted = useRef(new Set<string>());
  const { rows, rowRef } = useLeaving(pending, (o) => o.id, { delay: (o) => (accepted.current.has(o.id) ? 140 : 0) });
  const truthNow = (o: ContextObject, leaving: boolean) => leaving && accepted.current.has(o.id);
  const accept = (o: ContextObject, reason?: string) => { accepted.current.add(o.id); onAccept(o, reason); };
  const reject = (o: ContextObject, reason?: string) => { accepted.current.delete(o.id); onReject(o, reason); };
  const replace = (o: ContextObject, replacesId: string, reason?: string) => { accepted.current.add(o.id); onReplace(o, replacesId, reason); };
  // tools used now and then sit under one quiet trigger; the inbox itself is the content (thinking page stays calm)
  const actions = (
    <Menu
      label="آوردن یا بردن دانش"
      align="end"
      className="shrink-0"
      trigger={<Button variant="ghost" size="sm" iconEnd="ChevronDown">آوردن یا بردن دانش</Button>}
      items={[
        { label: 'کپی کل دانش برای استفاده در هر ابزار', icon: 'Copy', onSelect: onOpenPack },
        { label: 'وارد کردن پاسخ ابزار دیگر', icon: 'Upload', onSelect: onOpenImport },
        { label: importLabel(managedEnabled), icon: 'FolderInput', onSelect: onOpenMemory },
      ]}
    />
  );

  // nothing waiting: one sentence and the ways to bring AI suggestions in — no big empty card
  if (rows.length === 0) {
    return (
      <Card padding="md" id="proposal-inbox" className="flex flex-col justify-between gap-inline-md md:flex-row md:items-center" aria-label="صندوق پیشنهادها">
        <p className="body-md text-text-subtle">صندوق پیشنهادها خالی است. هر چیزی که وارد کنی و هنوز تأیید نشده باشد اینجا منتظر تأیید تو می‌ماند.</p>
        {actions}
      </Card>
    );
  }

  return (
    <section id="proposal-inbox" className="flex flex-col gap-stack-lg" aria-label="صندوق پیشنهادها">
      <div className={`flex flex-col justify-between gap-inline-md md:flex-row md:items-center ${nested ? '' : 'border-b border-border-default pb-inset-lg'}`}>
        <div className="flex flex-col gap-stack-xs">
          {/* one count format everywhere: «عنوان (n)» (§۳۸) */}
          {nested
            ? <h3 className="headline text-text-default">پیشنهادها ({formatNumber(pending.length)})</h3>
            : <h2 className="heading-sm text-text-default">صندوق پیشنهادها ({formatNumber(pending.length)})</h2>}
          <p className="body-sm text-text-subtle">پیشنهادها، فایل‌ها و متن‌های واردشده اینجا می‌مانند. تا تأیید نکنی واقعیت نیستند و به‌عنوان واقعیت به هیچ ابزاری داده نمی‌شوند.</p>
        </div>
        {actions}
      </div>

      <ul className="flex flex-col gap-stack-md">
        {rows.map(({ item: o, key, leaving }) => (
          <li key={key} ref={rowRef(key)} data-knowledge={truthNow(o, leaving) ? 'truth' : 'proposed'} className="mb-knowledge flex flex-col gap-stack-sm p-inset-lg">
            <Nuqta state={truthNow(o, leaving) ? 'truth' : 'proposed'} className="mb-knowledge__nuqta" />
            <div className="flex flex-wrap items-center justify-between gap-inline-sm">
              <div className="flex flex-col gap-stack-xs">
                <span className="headline text-text-default">{o.title}</span>
                <span className="body-sm text-text-subtle">{TYPE_META[o.type].label} · {label(o.nodeId)}{sampleMark(o)}</span>
              </div>
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
            {(() => {
              const replaces = proposalContext(o, objects).replaces;
              // components.md «گروه دکمه»: at most three side by side, the rest under «⋯» (§۳۸). The decision and its two everyday
              // alternatives stay together; «کنار قبلی» is rare and waits in «⋯». The optional reason is not a decision but a note ON
              // one, so it sits with the source line, labelled like its neighbours (§۴۸: a speech bubble alone reads as «comment» or
              // «chat»), and the three decisions never break onto two rows on a phone
              const reasonOpen = reasons[o.id] !== undefined;
              const toggleReason = () => setReasons((r) => ({ ...r, [o.id]: r[o.id] === undefined ? '' : undefined }));
              return (
                <div className="flex flex-wrap items-center justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm">
                  <span className="flex flex-wrap items-center gap-inline-sm">
                    <span className="body-sm text-text-subtle">
                      منبع: {o.provenance === 'Sample' ? `${PROVENANCE_LABEL.Sample} · ${formatJalaliDate(o.createdAt)}` : o.source ? `${KIND_FA[o.source.kind]}${o.source.label ? ` («${o.source.label}»)` : ''} · ${formatJalaliDate(o.source.at)}` : `${PROVENANCE_LABEL[o.provenance]} · ${formatJalaliDate(o.createdAt)}`}
                    </span>
                    <Button size="sm" variant="ghost" iconStart="MessageSquare" aria-label={`${reasonOpen ? 'برداشتن دلیل' : 'افزودن دلیل'} برای «${o.title}»`} aria-expanded={reasonOpen} onClick={toggleReason}>{reasonOpen ? 'برداشتن دلیل' : 'افزودن دلیل'}</Button>
                  </span>
                  <div className="flex flex-wrap items-center gap-inline-xs">
                    {replaces
                      ? <Button size="sm" variant="secondary" iconStart="Check" onClick={() => replace(o, replaces.id, reasonOf(o.id))}>جایگزینی</Button>
                      : <Button size="sm" variant="secondary" iconStart="Check" onClick={() => accept(o, reasonOf(o.id))}>تأیید</Button>}
                    <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => onEdit(o)}>ویرایش</Button>
                    <Button size="sm" variant="ghost" iconStart="X" onClick={() => reject(o, reasonOf(o.id))}>رد</Button>
                    {replaces && <Menu label={`کارهای بیشتر برای «${o.title}»`} align="end" trigger={<IconButton icon="Ellipsis" size="sm" label={`کارهای بیشتر برای «${o.title}»`} />} items={[{ label: 'تأیید کنار قبلی', icon: 'Check', onSelect: () => accept(o, reasonOf(o.id)) }]} />}
                  </div>
                </div>
              );
            })()}
            {reasons[o.id] !== undefined && (
              <TextField label={`دلیل برای «${o.title}»`} hint="در تاریخچهٔ تغییرها ثبت می‌شود، نه در متن." value={reasons[o.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [o.id]: e.target.value }))} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
