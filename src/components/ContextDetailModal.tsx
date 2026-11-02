/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ContextDraft, ContextObject, GeneratedDeliverable, ContextProvenance, ContextRelationship, ContextStatus, ContextType, TreeNode } from '../types';
import { dependentsOf, planDecisions } from '../core/decisionGraph';
import type { ReviewNeed } from '../core/decisionGraph';
import { flatten } from '../core/nodeTree';
import { influenceOf } from '../core/influence';
import { InfluencePanel } from './InfluencePanel';
import { ChangeEntry } from './ChangeEntry';
import type { ContextChange } from '../types';
import { dataApi } from '../services/dataApi';
import { Alert, Badge, Button, Card, Checkbox, Dialog, Markdown, SegmentedControl, Select, Tabs, TextField, Textarea, formatJalaliDate, formatNumber } from '../ui';

interface ContextDetailModalProps {
  object: ContextObject | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (saved: ContextDraft) => void | Promise<ContextObject | undefined>;
  /** the reason is stored in the Change log, never in the object's text */
  onSupersede: (oldId: string, newObj: ContextDraft, reason?: string) => void;
  onArchive: (id: string) => void;
  nodes: TreeNode[];
  workspaceId: string;
  defaultNodeId?: string;
  /** every object + the `depends_on` relations: «وابسته به» (what this decision rests on) is chosen here */
  allObjects?: ContextObject[];
  relationships?: ContextRelationship[];
  onSetDependencies?: (objectId: string, dependsOn: string[]) => Promise<void> | void;
  /** derived «needs review»: a dependency changed and nobody reviewed this object since */
  reviewNeed?: ReviewNeed;
  titleOf?: (id: string) => string;
  onAcceptReview?: (objectId: string) => void;
  /** for «اثرگذاران و اثرپذیران»: the assets built from this object */
  deliverables?: GeneratedDeliverable[];
  onOpenRelated?: (o: ContextObject) => void;
  /** one targeted edit with a reason (a Change) — «ببر بالاتر» */
  onPatchObject?: (id: string, patch: { nodeId?: string; reach?: 'global' | 'position'; reason: string }) => Promise<unknown>;
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
  allObjects = [],
  relationships = [],
  onSetDependencies,
  reviewNeed,
  titleOf,
  onAcceptReview,
  deliverables = [],
  onOpenRelated,
  onPatchObject,
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
  const [reach, setReach] = useState<'global' | 'position'>(object?.reach ?? (object?.type === 'Constraint' || !object ? 'global' : 'position'));
  const [validUntil, setValidUntil] = useState(object?.validUntil ?? '');
  const [assumption, setAssumption] = useState(object?.assumption === true);
  const [reviewBy, setReviewBy] = useState(object?.reviewBy ?? '');
  const [recordOpen, setRecordOpen] = useState(false);
  const [question, setQuestion] = useState(object?.record?.question ?? '');
  const [options, setOptions] = useState<Array<{ title: string; rejectedReason: string }>>((object?.record?.options ?? []).map((o) => ({ title: o.title, rejectedReason: o.rejectedReason ?? '' })));
  const [expectation, setExpectation] = useState(object?.record?.expectation ?? '');
  const [reviewOn, setReviewOn] = useState(object?.record?.reviewOn ?? '');
  const [promote, setPromote] = useState<null | { to: 'parent' | 'global'; reason: string }>(null);
  const [isSupersedingMode, setIsSupersedingMode] = useState(false);
  const currentDeps = object && isEditing ? relationships.filter((r) => r.type === 'depends_on' && r.sourceId === object.id).map((r) => r.targetId) : [];
  const [deps, setDeps] = useState<string[]>(currentDeps);
  const [depsOpen, setDepsOpen] = useState(false);
  const candidates = allObjects.filter((o) => o.id !== object?.id && o.status !== 'Superseded' && o.status !== 'Archived' && o.status !== 'Proposed');
  const sameDeps = deps.slice().sort().join('|') === currentDeps.slice().sort().join('|');
  const plan = isEditing && object ? planDecisions(allObjects, relationships) : null;
  const unit = plan?.layers.flat().find((u) => u.ids.includes(object!.id));
  const dependents = isEditing && object ? dependentsOf(object.id, relationships, allObjects) : [];
  const influence = useMemo(() => (isEditing && object ? influenceOf(object.id, allObjects, nodes, relationships, deliverables, new Date()) : undefined), [isEditing, object, allObjects, nodes, relationships, deliverables]);
  const parentNodeId = object ? nodes.find((n) => n.id === object.nodeId)?.parentId : undefined;
  const [supersedeReason, setSupersedeReason] = useState('');
  const [changes, setChanges] = useState<ContextChange[]>([]);
  const [tab, setTab] = useState<'edit' | 'history' | 'influence'>('edit');
  useEffect(() => {
    if (!isEditing || !object) return;
    let live = true;
    dataApi.changeLog(object.workspaceId, { objectId: object.id }).then((r) => { if (live) setChanges(r.changes); }).catch(() => { /* history is optional */ });
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
        content: content.trim(),
        nodeId,
      }, supersedeReason.trim() || 'به‌روزرسانی تصمیم');
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
      ...(type === 'Constraint' ? { reach } : object?.reach ? { reach: object.reach } : {}),
      ...(validUntil ? { validUntil } : {}),
      ...(type === 'Fact' && assumption ? { assumption: true, ...(reviewBy ? { reviewBy } : {}) } : {}),
      ...(type === 'Decision' && (question.trim() || options.some((o) => o.title.trim()) || expectation.trim() || reviewOn)
        ? { record: { ...(question.trim() ? { question: question.trim() } : {}), ...(options.some((o) => o.title.trim()) ? { options: options.filter((o) => o.title.trim()).map((o) => ({ title: o.title.trim(), ...(o.rejectedReason.trim() ? { rejectedReason: o.rejectedReason.trim() } : {}) })) } : {}), ...(expectation.trim() ? { expectation: expectation.trim() } : {}), ...(reviewOn ? { reviewOn } : {}) } }
        : {}),
    };

    // the dependency set is saved after the object itself (a new object only has an id once it exists)
    void (async () => {
      const saved = await onSave(updated);
      const id = isEditing ? object!.id : saved?.id;
      if (id && onSetDependencies && !sameDeps) await onSetDependencies(id, deps);
    })();
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
      {isEditing && object && (
        <div className="mb-stack-md">
          <Tabs label="بخش‌های جزئیات" value={tab} onChange={(v) => setTab(v as 'edit' | 'history' | 'influence')} items={[{ id: 'edit', label: 'ویرایش' }, { id: 'history', label: `تاریخچه (${formatNumber(changes.length)})` }, { id: 'influence', label: 'اثرگذاران' }]} />
        </div>
      )}
      {tab === 'influence' && isEditing && object && influence && <InfluencePanel influence={influence} nodes={nodes} onOpenObject={onOpenRelated} />}
      {tab === 'history' && isEditing && (
        changes.length === 0 ? <p className="body-md text-text-subtle">هنوز تغییری ثبت نشده است.</p> : (
          <ol className="flex flex-col gap-stack-sm" aria-label="تاریخچهٔ تغییرها (جدیدترین اول)">
            {changes.slice().reverse().map((c) => (
              <ChangeEntry key={c.id} change={c} titleOf={titleOf} nodeLabel={(id) => nodes.find((n) => n.id === id)?.label ?? id} />
            ))}
          </ol>
        )
      )}
      <form id="context-detail-form" onSubmit={handleSubmit} className={`${(tab === 'history' || tab === 'influence') && isEditing ? 'hidden' : 'flex'} flex-col gap-stack-md`}>
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
        {type === 'Constraint' && (
          <div className="flex flex-col gap-stack-xs">
            <SegmentedControl label="محدودهٔ اثر این قید" value={reach} onChange={(v) => setReach(v as 'global' | 'position')} items={[{ id: 'global', label: 'همه‌جا' }, { id: 'position', label: 'فقط این بخش و زیرشاخه‌ها' }]} />
            <p className="body-sm text-text-subtle">{reach === 'global' ? 'در هر خروجی و گفتگو، در هر گره‌ای، گاردریل است.' : 'فقط برای این گره و زیرگره‌هایش گاردریل است؛ بخش‌های دیگر آن را نمی‌بینند.'}</p>
          </div>
        )}
        <TextField label="اعتبار تا (اختیاری)" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} hint="بعد از این روز دیگر به هیچ خروجی و گفتگویی نمی‌رود؛ در تاریخچه می‌ماند." />
        {type === 'Fact' && (
          <div className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
            <Checkbox label="این یک فرض است، نه واقعیت" checked={assumption} onChange={(e) => setAssumption(e.target.checked)} />
            <p className="body-sm text-text-subtle">فرض هرگز به‌عنوان واقعیت به AI داده نمی‌شود (حتی اگر تأییدشده باشد)؛ در بخش جدای «فرض‌های فعال» با دستور صریح می‌رود.</p>
            {assumption && <TextField label="بازبینی تا (اختیاری)" type="date" value={reviewBy} onChange={(e) => setReviewBy(e.target.value)} hint="در «این هفته» و «خانه» که رسید دوباره می‌پرسیم." />}
          </div>
        )}
        {type === 'Decision' && (
          <div className="flex flex-col gap-stack-sm">
            <div><Button type="button" size="sm" variant="ghost" iconStart={recordOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={recordOpen} onClick={() => setRecordOpen((v) => !v)}>رکورد تصمیم (اختیاری)</Button></div>
            {recordOpen && (
              <div className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" role="group" aria-label="رکورد تصمیم">
                <TextField label="سؤال" value={question} onChange={(e) => setQuestion(e.target.value)} />
                <div className="flex flex-col gap-stack-xs">
                  <span className="label-md text-text-default">گزینه‌های بررسی‌شده و دلیل ردشدن هرکدام</span>
                  {options.map((o, i) => (
                    <div key={i} className="grid grid-cols-1 gap-inline-sm sm:grid-cols-3">
                      <TextField label={`گزینهٔ ${formatNumber(i + 1)}`} value={o.title} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      <TextField label="چرا رد شد؟ (خالی = رد نشده)" value={o.rejectedReason} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? { ...x, rejectedReason: e.target.value } : x)))} />
                      <div className="self-end"><Button type="button" size="sm" variant="ghost" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))}>حذف</Button></div>
                    </div>
                  ))}
                  <div><Button type="button" size="sm" variant="secondary" iconStart="Plus" onClick={() => setOptions((l) => [...l, { title: '', rejectedReason: '' }])}>افزودن گزینه</Button></div>
                </div>
                <TextField label="چه انتظاری داریم؟" value={expectation} onChange={(e) => setExpectation(e.target.value)} />
                <TextField label="تاریخ بازبینی" type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} hint="در بازبینی هفتگی می‌پرسیم «نتیجه چه شد؟»" />
              </div>
            )}
          </div>
        )}
        {isEditing && object && onPatchObject && (
          <div className="flex flex-col gap-stack-xs">
            <div><Button type="button" size="sm" variant="ghost" iconStart="ArrowRight" onClick={() => setPromote((p) => (p ? null : { to: parentNodeId ? 'parent' : 'global', reason: '' }))}>ببر بالاتر</Button></div>
            {promote && (
              <div className="flex flex-col gap-stack-sm rounded-control border border-border-selected p-inset-lg" role="group" aria-label="ببر بالاتر">
                <SegmentedControl label="کجا ببرم؟" value={promote.to} onChange={(v) => setPromote({ ...promote, to: v as 'parent' | 'global' })} items={[...(parentNodeId ? [{ id: 'parent', label: `گرهٔ والد: ${nodes.find((n) => n.id === parentNodeId)?.label ?? ''}` }] : []), { id: 'global', label: 'همه‌جا' }]} />
                <Textarea label="دلیل (لازم)" rows={2} value={promote.reason} onChange={(e) => setPromote({ ...promote, reason: e.target.value })} />
                <div><Button type="button" size="sm" variant="secondary" disabled={!promote.reason.trim()} onClick={async () => { await onPatchObject(object.id, promote.to === 'parent' && parentNodeId ? { nodeId: parentNodeId, reason: promote.reason.trim() } : { reach: 'global', reason: promote.reason.trim() }); onClose(); }}>{promote.to === 'parent' ? 'ببر به گرهٔ والد' : 'همه‌جا اثر بدهد'}</Button></div>
              </div>
            )}
          </div>
        )}

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

        {isEditing && object && reviewNeed && onAcceptReview && (
          <Alert
            intent="warning"
            title="نیاز به بازبینی"
            action={<Button size="sm" variant="secondary" onClick={() => { onAcceptReview(object.id); onClose(); }}>بدون تغییر بپذیر</Button>}
          >
            این مورد به {reviewNeed.changedDependencies.map((d) => `«${titleOf?.(d.id) ?? d.id}»`).join('، ')} وابسته است و آن تغییر کرده. اگر هنوز درست است، بدون تغییر بپذیر؛ وگرنه آن را ویرایش یا جایگزین کن.
          </Alert>
        )}

        {onSetDependencies && candidates.length > 0 && (
          <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md">
            <div className="flex flex-wrap items-center justify-between gap-inline-sm">
              <span className="label-md text-text-default">وابسته به ({formatNumber(deps.length)})</span>
              <Button type="button" size="sm" variant="ghost" aria-expanded={depsOpen} onClick={() => setDepsOpen((v) => !v)}>{depsOpen ? 'بستن فهرست' : 'انتخاب وابستگی‌ها'}</Button>
            </div>
            <p className="body-sm text-text-subtle">اگر این تصمیم روی تصمیم‌های دیگری سوار است، آن‌ها را انتخاب کن. با تغییر آن‌ها، این مورد و خروجی‌های ساخته‌شده از آن «نیاز به بازبینی» می‌شوند.</p>
            {depsOpen && (
              <div className="grid grid-cols-1 gap-stack-xs sm:grid-cols-2">
                {candidates.map((o) => (
                  <Checkbox key={o.id} label={o.title} checked={deps.includes(o.id)} onChange={(e) => setDeps((cur) => (e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id)))} />
                ))}
              </div>
            )}
            {!depsOpen && deps.length > 0 && <p className="body-sm text-text-default">{deps.map((id) => titleOf?.(id) ?? id).join('، ')}</p>}
            {isEditing && (dependents.length > 0 || unit?.concurrent) && (
              <p className="body-sm text-text-subtle">
                {dependents.length > 0 ? `${formatNumber(dependents.length)} مورد (مستقیم یا غیرمستقیم) روی این مورد سوارند. ` : ''}
                {unit?.concurrent ? `با ${unit.ids.filter((x) => x !== object!.id).map((x) => `«${titleOf?.(x) ?? x}»`).join('، ') || 'خودش'} باید هم‌زمان تصمیم گرفته شود.` : ''}
                {unit && !unit.concurrent && unit.state === 'blocked' ? `هنوز منتظر تأیید ${unit.blockedBy.map((x) => `«${titleOf?.(x) ?? x}»`).join('، ')} است.` : ''}
              </p>
            )}
          </div>
        )}

        {isEditing && object && (
          <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent="neutral" icon={false}>نسخهٔ {formatNumber(object.version)}</Badge>
              <span className="caption text-text-subtle">با هر ویرایش عنوان، متن یا نوع، شمارهٔ نسخه بالا می‌رود و دارایی‌هایی که از نسخهٔ قبلی ساخته شده‌اند «نیاز به بازبینی» می‌شوند.</span>
            </div>
          </div>
        )}

        {isSupersedingMode && (
          <Card padding="md" className="flex flex-col gap-stack-sm">
            <TextField
              label="دلیل جایگزینی تصمیم قبلی"
              value={supersedeReason}
              onChange={(e) => setSupersedeReason(e.target.value)}
              placeholder="مثلاً: تغییر رویکرد استراتژیک پس از بازخورد مشتریان"
              hint="تصمیم قبلی پاک نمی‌شود؛ با رابطهٔ «جایگزین کرد» در تاریخچهٔ منبع حقیقت می‌ماند."
            />
          </Card>
        )}
      </form>
    </Dialog>
  );
};
