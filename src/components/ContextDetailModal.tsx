/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ContextDraft, ContextObject, ContextProvenance, ContextStatus, ContextType, TreeNode } from '../types';
import { flatten } from '../core/nodeTree';
import { dataApi } from '../services/dataApi';
import { Badge, Button, Card, Dialog, Markdown, SegmentedControl, Select, TextField, Textarea, formatJalaliDate, formatNumber } from '../ui';

interface ContextDetailModalProps {
  object: ContextObject | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (saved: ContextDraft) => void;
  onSupersede: (oldId: string, newObj: ContextDraft) => void;
  onArchive: (id: string) => void;
  nodes: TreeNode[];
  workspaceId: string;
  defaultNodeId?: string;
}

/**
 * The form state is initialised from `object` every time the modal opens,
 * so the stateful part is a child that mounts fresh on open.
 */
export const ContextDetailModal: React.FC<ContextDetailModalProps> = (props) =>
  props.isOpen ? <ContextDetailForm {...props} /> : null;

const TYPE_OPTIONS = [
  { value: 'Fact', label: 'واقعیت اثبات‌شده' },
  { value: 'Decision', label: 'تصمیم آگاهانه' },
  { value: 'Constraint', label: 'مرز و خط قرمز' },
  { value: 'Asset', label: 'خروجی تأییدشده' },
];
const STATUS_OPTIONS = [
  { value: 'Confirmed', label: 'تأییدشده و فعال' },
  { value: 'Proposed', label: 'پیشنهادی (وارد خروجی نمی‌شود)' },
  { value: 'Needs Review', label: 'نیازمند بازبینی' },
  { value: 'Superseded', label: 'منسوخ با جایگزین' },
  { value: 'Archived', label: 'بایگانی' },
];
const PROVENANCE_OPTIONS = [
  { value: 'User Input', label: 'ورودی مستقیم کاربر' },
  { value: 'Onboarding', label: 'فرم شروع سریع' },
  { value: 'AI Suggested', label: 'پیشنهاد تأییدشدهٔ هوش مصنوعی' },
  { value: 'Asset Derived', label: 'استخراج‌شده از خروجی' },
  { value: 'Imported', label: 'منبع واردشده' },
];

const ContextDetailForm: React.FC<ContextDetailModalProps> = ({
  object,
  onClose,
  onSave,
  onSupersede,
  onArchive,
  nodes,
  workspaceId,
  defaultNodeId = 'business',
}) => {
  const isEditing = !!object && object.id !== ''; // id '' = a prefilled draft (e.g. from an AI block)

  const [title, setTitle] = useState(object?.title || '');
  const [content, setContent] = useState(object?.content || '');
  const [contentView, setContentView] = useState<'edit' | 'preview'>('edit');
  const [type, setType] = useState<ContextType>(object?.type || 'Decision');
  const [status, setStatus] = useState<ContextStatus>(object?.status || 'Confirmed');
  const [nodeId, setNodeId] = useState(object?.nodeId || defaultNodeId);
  const [provenance, setProvenance] = useState<ContextProvenance>(
    object?.provenance || 'User Input'
  );
  const [isSupersedingMode, setIsSupersedingMode] = useState(false);
  const [supersedeReason, setSupersedeReason] = useState('');
  const [versions, setVersions] = useState<Array<{ version: number; title: string; content: string; createdAt: string }>>([]);
  useEffect(() => {
    if (!isEditing || !object) return;
    let live = true;
    dataApi.objectVersions(object.workspaceId, object.id).then((v) => { if (live) setVersions(v); }).catch(() => { /* history is optional */ });
    return () => { live = false; };
  }, [isEditing, object]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (isSupersedingMode && object) {
      onSupersede(object.id, {
        workspaceId: object.workspaceId,
        type,
        status: 'Confirmed',
        provenance: 'User Input',
        title,
        content: `${content}\n\n[دلیل جایگزینی: ${supersedeReason || 'به‌روزرسانی تصمیم'}]`,
        nodeId,
      });
      onClose();
      return;
    }

    const updated: ContextDraft = {
      id: isEditing ? object!.id : undefined,
      workspaceId: object?.workspaceId || workspaceId,
      type,
      status,
      provenance,
      title: title.trim(),
      content: content.trim(),
      nodeId,
      supersededById: object?.supersededById,
      source: object?.source,
      slotKey: object?.slotKey,
    };

    onSave(updated);
    onClose();
  };

  const title_ = isSupersedingMode
    ? 'جایگزینی تصمیم — حفظ تاریخچه'
    : isEditing
    ? 'ویرایش شیء در منبع حقیقت'
    : 'ثبت شیء جدید در منبع حقیقت';

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={title_}
      description="هر مورد منشأ و نوع دارد؛ هیچ تصمیمی بدون پشتوانه رها نمی‌شود."
      footer={
        <>
          {isEditing && !isSupersedingMode && (
            <>
              <Button variant="secondary" iconStart="History" onClick={() => setIsSupersedingMode(true)}>
                جایگزینی تصمیم
              </Button>
              <Button
                variant="secondary"
                iconStart="Archive"
                onClick={() => {
                  if (object) {
                    onArchive(object.id);
                    onClose();
                  }
                }}
              >
                بایگانی
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button variant="primary" type="submit" form="context-detail-form">
            {isSupersedingMode ? 'ثبت جایگزینی' : isEditing ? 'ذخیرهٔ تغییرات' : 'ثبت در منبع حقیقت'}
          </Button>
        </>
      }
    >
      <form id="context-detail-form" onSubmit={handleSubmit} className="flex flex-col gap-stack-md">
        <TextField
          label="عنوان شیء (کوتاه و گویا)"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثلاً: مخاطب هدف اصلی، مرز عدم تخفیف، لحن برند…"
        />

        <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
          <Select label="نوع شیء" value={type} onChange={(e) => setType(e.target.value as ContextType)} options={TYPE_OPTIONS} />
          <Select label="وضعیت" value={status} onChange={(e) => setStatus(e.target.value as ContextStatus)} options={STATUS_OPTIONS} />
        </div>

        <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
          <Select label="شاخه در درخت دانش" value={nodeId} onChange={(e) => setNodeId(e.target.value)} options={flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }))} />
          <Select label="منبع" value={provenance} onChange={(e) => setProvenance(e.target.value as ContextProvenance)} options={PROVENANCE_OPTIONS} />
        </div>

        <div className="flex flex-col gap-stack-xs">
          <SegmentedControl
            label="نمای محتوا"
            value={contentView}
            onChange={(id) => setContentView(id as 'edit' | 'preview')}
            items={[{ id: 'edit', label: 'ویرایش', icon: 'Pencil' }, { id: 'preview', label: 'پیش‌نمایش', icon: 'Eye' }]}
          />
          {contentView === 'edit' ? (
            <Textarea
              label="محتوای دقیق دانش"
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="توضیح کامل واقعیت، تصمیم یا خط قرمز به زبان صریح… (Markdown پشتیبانی می‌شود)"
            />
          ) : (
            <div className="min-h-touch-comfortable rounded-control border border-border-default bg-surface-sunken p-inset-lg">
              {content.trim() ? <Markdown>{content}</Markdown> : <p className="body-sm text-text-subtle">هنوز چیزی ننوشته‌ای.</p>}
            </div>
          )}
        </div>

        {isEditing && object && (
          <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent="neutral" icon={false}>نسخهٔ {formatNumber(object.version)}</Badge>
              <span className="caption text-text-subtle">با هر ویرایش عنوان، متن یا نوع، شمارهٔ نسخه بالا می‌رود و دارایی‌هایی که از نسخهٔ قبلی ساخته شده‌اند «قدیمی» می‌شوند.</span>
            </div>
            {versions.length > 1 && (
              <ul className="caption flex flex-col gap-stack-xs text-text-subtle" aria-label="تاریخچهٔ نسخه‌ها">
                {versions.map((v) => (
                  <li key={v.version}>نسخهٔ {formatNumber(v.version)} · {formatJalaliDate(v.createdAt)} · {v.content.slice(0, 70)}{v.content.length > 70 ? '…' : ''}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isSupersedingMode && (
          <Card padding="md" className="flex flex-col gap-stack-sm">
            <TextField
              label="دلیل جایگزینی تصمیم قبلی"
              value={supersedeReason}
              onChange={(e) => setSupersedeReason(e.target.value)}
              placeholder="مثلاً: تغییر رویکرد استراتژیک پس از بازخورد مشتریان"
              hint="تصمیم قبلی پاک نمی‌شود؛ با رابطهٔ supersedes در تاریخچهٔ منبع حقیقت می‌ماند."
            />
          </Card>
        )}
      </form>
    </Dialog>
  );
};
