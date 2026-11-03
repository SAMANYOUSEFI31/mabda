/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SceneItem } from '../core/canvasScene';
import type { Lod } from '../core/canvasLod';
import { Badge, Icon, IconButton, StatusBadge, TypeBadge, formatNumber } from '../ui';

export const FACET_TINT = ['border-border-info-subtle bg-bg-info-subtle', 'border-border-success-subtle bg-bg-success-subtle', 'border-border-warning-subtle bg-bg-warning-subtle', 'border-border-default bg-bg-neutral-subtle'];

/** the small marks of a card: review is a labelled chip, the rest are icon-only with a name (never colour alone) */
function Marks({ item }: { item: SceneItem }) {
  const small = 'inline-flex items-center justify-center rounded-pill border border-border-default bg-surface-raised text-icon-subtle min-w-space-6 min-h-space-6';
  return (
    <>
      {item.review && <Badge intent="warning" icon={false}>بازبینی</Badge>}
      {item.assumption && <span className={small} title="فرض: واقعیت نیست" role="img" aria-label="فرض"><Icon name="CircleHelp" size="xs" /></span>}
      {item.expired && <span className={small} title="منقضی شده" role="img" aria-label="منقضی"><Icon name="Clock" size="xs" /></span>}
      {item.global && <span className={small} title="برای کل درخت" role="img" aria-label="دامنهٔ کل"><Icon name="Globe" size="xs" /></span>}
    </>
  );
}

const aria = (item: SceneItem) => {
  if (item.kind === 'object') return `${item.label}${item.review ? '، نیاز به بازبینی' : ''}${item.assumption ? '، فرض' : ''}${item.expired ? '، منقضی' : ''}${item.global ? '، دامنهٔ کل' : ''}`;
  if (item.kind === 'node') return `گرهٔ ${item.label}، ${formatNumber(item.count ?? 0)} مورد`;
  if (item.kind === 'assets') return `${formatNumber(item.count ?? 0)} خروجی`;
  if (item.kind === 'note') return `یادداشت آزاد: ${item.label}`;
  return `خروجی ${item.label}${item.review ? '، نیاز به بازبینی' : ''}`;
};

interface CardProps {
  item: SceneItem;
  lod: Lod;
  selected: boolean;
  /** next to the selection (a neighbour through a line) */
  neighbour: boolean;
  dimmed: boolean;
  dragging?: boolean;
  tint?: string;
  draggable: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onOpen: (item: SceneItem) => void;
  onContext: (item: SceneItem, x: number, y: number) => void;
  onPointerDown?: (e: React.PointerEvent, item: SceneItem) => void;
  onLink?: (e: React.PointerEvent, item: SceneItem) => void;
  onToggleNode?: (nodeId: string) => void;
  onFocus: (item: SceneItem) => void;
  onKey: (e: React.KeyboardEvent, item: SceneItem) => void;
  onActions?: (item: SceneItem) => void;
}

/**
 * ONE card anatomy for every layout: type icon · status chip · small marks on the first row, the title (two lines) under it,
 * and — close up — a short summary. Far away it is only a shape (no text), so thousands stay readable and cheap.
 */
export const CanvasItemCard = React.memo(function CanvasItemCard(p: CardProps) {
  const { item, lod } = p;
  // focus mode: a card that is not part of the selection gets a quieter BACKGROUND and BORDER — its text is never made transparent, so every title stays readable (contrast ≥ 3:1, measured in screens.mjs)
  const tone = p.dimmed ? 'border-border-subtle bg-surface-sunken' : item.pending && !p.selected ? 'border-dashed border-border-default bg-surface-sunken' : p.selected ? 'border-border-selected bg-bg-selected' : p.neighbour ? 'border-border-bold bg-surface-raised' : p.tint ? p.tint : item.kind === 'node' ? 'border-border-bold bg-surface-raised' : item.sample ? 'border-border-default bg-bg-neutral-subtle' : 'border-border-default bg-surface-raised';
  const common = `canvas-card canvas-glide absolute top-space-0 start-space-0 overflow-hidden rounded-control border ${tone} ${p.dragging ? 'is-lifted' : ''} ${p.draggable ? '' : 'cursor-pointer'}`;
  const style = { transform: `translate(${item.x}px, ${item.y}px)`, inlineSize: item.w, blockSize: item.h };

  if (lod === 'far') {
    return (
      <div
        data-item-id={item.id} data-dimmed={p.dimmed || undefined} data-no-pan="" data-lod="far" role="button" tabIndex={0} aria-label={aria(item)} aria-pressed={p.selected}
        onClick={(e) => p.onSelect(item.id, e.shiftKey || e.metaKey || e.ctrlKey)} onFocus={() => p.onFocus(item)} onKeyDown={(e) => p.onKey(e, item)}
        className={`${common} ${item.kind === 'note' ? 'bg-bg-warning-subtle' : ''}`} style={style}
      />
    );
  }
  const role = item.kind === 'object' ? 'group' : 'group';
  return (
    <div
      data-item-id={item.id} data-dimmed={p.dimmed || undefined} data-object-id={item.objectId} data-no-pan="" data-lod={lod} tabIndex={0} role={role} aria-label={aria(item)} aria-selected={p.selected}
      onPointerDown={(e) => p.onPointerDown?.(e, item)}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; p.onSelect(item.id, e.shiftKey || e.metaKey || e.ctrlKey); }}
      onDoubleClick={() => p.onOpen(item)}
      onContextMenu={(e) => { e.preventDefault(); p.onContext(item, e.clientX, e.clientY); }}
      onFocus={() => p.onFocus(item)}
      onKeyDown={(e) => p.onKey(e, item)}
      className={`${common} p-inset-sm`}
      style={style}
    >
      {item.kind === 'object' && p.onLink && <button type="button" aria-label={`وصل کن: ${item.label}`} title="بکش روی کارت دیگر تا وصل شود" onPointerDown={(e) => p.onLink?.(e, item)} onClick={() => p.onActions?.(item)} className="absolute top-space-0 start-space-0 flex min-h-touch-comfortable min-w-touch-comfortable items-center justify-center rounded-control-sm text-icon-subtle"><Icon name="Link2" size="sm" /></button>}
      <div dir="rtl" className="flex h-full flex-col justify-between gap-stack-xs">
        {item.kind === 'object' && (
          <span className="flex items-center justify-between gap-inline-xs">
            <span className="flex min-w-space-0 flex-wrap items-center gap-inline-xs" style={{ paddingInlineEnd: 0 }}>
              {item.type && <TypeBadge value={item.type} iconOnly />}
              {item.status && item.status !== 'Confirmed' && <StatusBadge value={item.status} />}
              <Marks item={item} />
              {p.tint && item.facet && <span className="caption text-text-subtle">{item.facet}</span>}
            </span>
            {item.sample && <Badge intent="neutral" icon={false}>نمونه</Badge>}
          </span>
        )}
        {item.kind === 'node' && (
          <span className="flex items-center justify-between gap-inline-xs">
            <span className="flex items-center gap-inline-xs"><Icon name="FolderTree" size="sm" className="text-icon-subtle" /><Badge intent="neutral" icon={false}>{formatNumber(item.count ?? 0)} مورد</Badge></span>
            {(item.count ?? 0) > 0 && item.nodeId && p.onToggleNode && (
              <button type="button" aria-expanded={!!item.expanded} aria-label={`${item.expanded ? 'جمع کردن' : 'باز کردن'} موردهای ${item.label}`} onClick={() => p.onToggleNode?.(item.nodeId!)} className="flex min-h-touch-comfortable min-w-touch-comfortable items-center justify-center rounded-control-sm text-icon-default">{item.expanded ? '−' : '+'}</button>
            )}
          </span>
        )}
        {(item.kind === 'asset' || item.kind === 'assets') && (
          <span className="flex items-center gap-inline-xs"><Icon name="Package" size="sm" className="text-icon-subtle" /><Badge intent="neutral" icon={false}>{item.kind === 'assets' ? `${formatNumber(item.count ?? 0)} خروجی` : 'خروجی'}</Badge>{item.review && <Badge intent="warning" icon={false}>قدیمی</Badge>}</span>
        )}
        {item.kind === 'note' && <span className="flex items-center gap-inline-xs"><Icon name="StickyNote" size="sm" className="text-icon-subtle" /><Badge intent="neutral" icon={false}>یادداشت</Badge></span>}
        <span data-card-title="" className={`body-sm ${lod === 'near' ? 'line-clamp-2' : 'line-clamp-3'} ${p.dimmed ? 'text-text-subtle' : 'text-text-default'} ${item.kind === 'node' ? 'label-md' : ''}`}>{item.label}</span>
        {lod === 'near' && item.summary && item.kind !== 'node' && <span className="body-sm line-clamp-1 text-text-subtle">{item.summary}</span>}
      </div>
    </div>
  );
});

interface NoteProps { item: SceneItem; selected: boolean; dimmed: boolean; lod: Lod; editing?: { text: string }; draggable: boolean;
  onSelect: (id: string, additive: boolean) => void; onPointerDown: (e: React.PointerEvent, item: SceneItem) => void; onFocus: (item: SceneItem) => void; onKey: (e: React.KeyboardEvent, item: SceneItem) => void;
  onEdit: (item: SceneItem) => void; onEditText: (text: string) => void; onSave: () => void; onCancel: () => void; onConvert: (item: SceneItem) => void; onDelete: (item: SceneItem) => void }

/** a free note: it is never knowledge, and says so — «تبدیل به قلم دانش» makes a PROPOSED object */
export const CanvasNoteCard = React.memo(function CanvasNoteCard(p: NoteProps) {
  const { item } = p;
  const style = { transform: `translate(${item.x}px, ${item.y}px)`, inlineSize: item.w, blockSize: item.h };
  const base = `canvas-card canvas-glide absolute top-space-0 start-space-0 overflow-hidden rounded-control border ${p.dimmed ? 'border-border-subtle bg-surface-sunken' : `${p.selected ? 'border-border-selected' : 'border-border-default'} bg-bg-warning-subtle`}`;
  if (p.lod === 'far') return <div data-item-id={item.id} data-no-pan="" data-lod="far" role="button" tabIndex={0} aria-label={`یادداشت آزاد: ${item.label}`} onClick={(e) => p.onSelect(item.id, e.shiftKey)} onFocus={() => p.onFocus(item)} onKeyDown={(e) => p.onKey(e, item)} className={base} style={style} />;
  return (
    <div data-item-id={item.id} data-dimmed={p.dimmed || undefined} data-no-pan="" data-lod={p.lod} tabIndex={0} role="group" aria-label={`یادداشت آزاد: ${item.label}. با کلیدهای جهت‌دار جابه‌جا می‌شود.`}
      onPointerDown={(e) => p.onPointerDown(e, item)} onClick={(e) => { if ((e.target as HTMLElement).closest('button, textarea')) return; p.onSelect(item.id, e.shiftKey); }}
      onFocus={() => p.onFocus(item)} onKeyDown={(e) => p.onKey(e, item)} className={`${base} p-inset-sm`} style={style}>
      <div dir="rtl" className="flex h-full flex-col gap-stack-xs">
        {p.editing ? (
          <>
            <textarea aria-label="متن یادداشت" value={p.editing.text} onChange={(e) => p.onEditText(e.target.value)} className="body-sm min-h-space-0 flex-1 resize-none rounded-control-sm border border-border-input bg-surface-raised p-inset-xs text-text-default" />
            <span className="flex gap-inline-xs"><button type="button" onClick={p.onSave} className="bsh-btn bsh-btn--secondary bsh-btn--sm">ذخیره</button><button type="button" onClick={p.onCancel} className="bsh-btn bsh-btn--ghost bsh-btn--sm">انصراف</button></span>
          </>
        ) : (
          <>
            <span className="flex items-center justify-between gap-inline-xs">
              <span className="flex items-center gap-inline-xs"><Icon name="StickyNote" size="sm" className="text-icon-subtle" /><span className="label-sm text-text-subtle">یادداشت</span></span>
              {p.selected && (
                <span className="flex items-center">
                  <IconButton icon="Pencil" label="ویرایش یادداشت" size="sm" onClick={() => p.onEdit(item)} />
                  <IconButton icon="Lightbulb" label="تبدیل به قلم دانش" size="sm" onClick={() => p.onConvert(item)} />
                  <IconButton icon="Trash2" label="حذف یادداشت" size="sm" onClick={() => p.onDelete(item)} />
                </span>
              )}
            </span>
            <p data-card-title="" className={`body-sm line-clamp-3 flex-1 whitespace-pre-wrap ${p.dimmed ? 'text-text-subtle' : 'text-text-default'}`}>{p.lod === 'near' ? item.summary : item.label}</p>
          </>
        )}
      </div>
    </div>
  );
});
