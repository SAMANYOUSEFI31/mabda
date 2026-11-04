/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ContextDraft, ContextObject, RedlineExample, Metric, MetricDirection, GeneratedDeliverable, ContextProvenance, ContextRelationship, ContextStatus, ContextType, TreeNode } from '../types';
import { dependentsOf, planDecisions } from '../core/decisionGraph';
import type { ReviewNeed } from '../core/decisionGraph';
import { defaultNodeId, flatten } from '../core/nodeTree';
import { reachSentence } from '../core/packScope';
import { influenceOf } from '../core/influence';
import { InfluencePanel } from './InfluencePanel';
import { MentionTextarea } from './MentionTextarea';
import { RelationPicker } from './RelationPicker';
import { BeforeAfter } from './BeforeAfter';
import { affectPlan, affectedBy } from '../core/relationPlan';
import { TYPE_CHIP_FA, guessTitle, guessType } from '../core/knowledgeGuess';
import { suggestLinks } from '../core/mentions';
import { ApprovalBadge, VersionHistoryView } from './VersionHistoryView';
import { reasonAllowed, versionHistory } from '../core/versionHistory';
import type { ContextChange } from '../types';
import { MX } from '../core/metricsText';
import { EXAMPLE_LIMIT, EXAMPLE_MAX_CHARS, canHaveExamples, cleanExamples } from '../core/redlineExamples';
import { parseNumber } from '../core/metrics';
import { dataApi } from '../services/dataApi';
import { Alert, Badge, Button, Card, Checkbox, Dialog, Markdown, Menu, SegmentedControl, Select, Tabs, TextField, Textarea, formatJalaliDate, formatNumber } from '../ui';

interface ContextDetailModalProps {
  object: ContextObject | null;
  isOpen: boolean;
  onClose: () => void;
  /** `reason` only for an edit of confirmed knowledge: it is stored in the Change, never in the text */
  onSave: (saved: ContextDraft, opts?: { reason?: string; asDraft?: boolean }) => void | Promise<ContextObject | undefined>;
  /** the unapproved rewrite of this confirmed knowledge: approve (it replaces the text) / reject (it is dropped) */
  onApproveDraft?: (id: string) => Promise<void>;
  onRejectDraft?: (id: string) => Promise<void>;
  /** the reason is stored in the Change log, never in the object's text */
  onSupersede: (oldId: string, newObj: ContextDraft, reason?: string) => void;
  onArchive: (id: string) => void;
  nodes: TreeNode[];
  workspaceId: string;
  defaultNodeId?: string;
  /** every object + the `depends_on` relations: «وابسته به» (what this decision rests on) is chosen here */
  /** the metrics a decision can state an expectation about */
  metrics?: Metric[];
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
  onApproveDraft,
  onRejectDraft,
  onSupersede,
  onArchive,
  nodes,
  workspaceId,
  defaultNodeId: defaultNodeIdProp = '',
  allObjects = [],
  metrics = [],
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

  // opening a knowledge that has a draft continues the DRAFT (the approved text is shown next to it, below)
  const [title, setTitle] = useState(object?.draft?.title ?? object?.title ?? '');
  const [content, setContent] = useState(object?.draft?.content ?? object?.content ?? '');
  const [applyNow, setApplyNow] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // the kind and the title are guessed from the text until the user picks / writes her own (src/core/knowledgeGuess.ts)
  const keepsOwn = !!object; // editing, or a prefilled draft that already has them
  const [typeTouched, setTypeTouched] = useState(keepsOwn);
  const [titleTouched, setTitleTouched] = useState(keepsOwn && !!object?.title);
  const [type, setType] = useState<ContextType>(object?.type || 'Fact');
  const [status, setStatus] = useState<ContextStatus>(object?.status || 'Confirmed');
  const [nodeId, setNodeId] = useState(object?.nodeId || defaultNodeIdProp || defaultNodeId(nodes));
  const [provenance, setProvenance] = useState<ContextProvenance>(
    object?.provenance || 'User Input'
  );
  const [reach, setReach] = useState<'global' | 'position'>(object?.reach ?? (object?.type === 'Constraint' || !object ? 'global' : 'position'));
  const [validUntil, setValidUntil] = useState(object?.validUntil ?? '');
  const [facets, setFacets] = useState<string[]>(object?.facets ?? []);
  const [examples, setExamples] = useState<RedlineExample[]>(object?.examples ?? []);
  const [facetDraft, setFacetDraft] = useState('');
  const [assumption, setAssumption] = useState(object?.assumption === true);
  const [reviewBy, setReviewBy] = useState(object?.reviewBy ?? '');
  const [recordOpen, setRecordOpen] = useState(false);
  const [question, setQuestion] = useState(object?.record?.question ?? '');
  const [options, setOptions] = useState<Array<{ title: string; rejectedReason: string }>>((object?.record?.options ?? []).map((o) => ({ title: o.title, rejectedReason: o.rejectedReason ?? '' })));
  const [expectation, setExpectation] = useState(object?.record?.expectation ?? '');
  const [reviewOn, setReviewOn] = useState(object?.record?.reviewOn ?? '');
  const me0 = object?.record?.metricExpectation;
  const [expMetric, setExpMetric] = useState(me0?.metricId ?? '');
  const [expDir, setExpDir] = useState<MetricDirection>(me0?.direction ?? 'up');
  const [expTarget, setExpTarget] = useState(me0?.targetValue !== undefined ? String(me0.targetValue) : '');
  const [expBy, setExpBy] = useState(me0?.by ?? '');
  const expTargetNum = expTarget.trim() ? parseNumber(expTarget) : null;
  const expectationOk = !expMetric || (!!expBy && (!expTarget.trim() || expTargetNum !== null));
  const [promote, setPromote] = useState<null | { to: 'parent' | 'global'; reason: string }>(null);
  const [isSupersedingMode, setIsSupersedingMode] = useState(false);
  const currentDeps = object && isEditing ? relationships.filter((r) => r.type === 'depends_on' && r.sourceId === object.id).map((r) => r.targetId) : [];
  const [deps, setDeps] = useState<string[]>(currentDeps);
  const currentEffects = object && isEditing ? affectedBy(object.id, relationships) : [];
  const [effects, setEffects] = useState<string[]>(currentEffects);
  const candidates = allObjects.filter((o) => o.id !== object?.id && o.status !== 'Superseded' && o.status !== 'Archived' && o.status !== 'Proposed');
  const sameDeps = deps.slice().sort().join('|') === currentDeps.slice().sort().join('|');
  const plan = isEditing && object ? planDecisions(allObjects, relationships) : null;
  const unit = plan?.layers.flat().find((u) => u.ids.includes(object!.id));
  const dependents = isEditing && object ? dependentsOf(object.id, relationships, allObjects) : [];
  const influence = useMemo(() => (isEditing && object ? influenceOf(object.id, allObjects, nodes, relationships, deliverables, new Date()) : undefined), [isEditing, object, allObjects, nodes, relationships, deliverables]);
  const parentNodeId = object ? nodes.find((n) => n.id === object.nodeId)?.parentId : undefined;
  const [supersedeReason, setSupersedeReason] = useState('');
  const [changes, setChanges] = useState<ContextChange[]>([]);
  const [editReason, setEditReason] = useState('');
  useEffect(() => { if (!typeTouched) setType(guessType(content)); }, [content, typeTouched]);
  useEffect(() => { if (!titleTouched) setTitle(content.trim() ? guessTitle(content) : ''); }, [content, titleTouched]);
  // «@» references only SUGGEST a link: nothing is linked until she says yes; «نه» is remembered per pair
  const noKey = (targetId: string) => `${object?.id ?? 'new'}>${targetId}`;
  const readNo = (): string[] => { try { return JSON.parse(localStorage.getItem('mabda.mentions.no') ?? '[]') as string[]; } catch { return []; } };
  const [turnedDown, setTurnedDown] = useState<string[]>(readNo);
  const linkSuggestions = useMemo(
    () => suggestLinks({ text: content, selfId: object?.id, objects: allObjects, relationships, dismissed: [...deps, ...allObjects.map((o) => o.id).filter((id) => turnedDown.includes(noKey(id)))] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, object?.id, allObjects, relationships, deps, turnedDown],
  );
  const turnDown = (targetId: string) => { const next = [...turnedDown, noKey(targetId)].slice(-200); setTurnedDown(next); try { localStorage.setItem('mabda.mentions.no', JSON.stringify(next)); } catch { /* optional */ } };
  const history = useMemo(() => versionHistory(changes), [changes]);
  const [tab, setTab] = useState<'edit' | 'history' | 'influence'>('edit');
  useEffect(() => {
    if (!isEditing || !object) return;
    let live = true;
    dataApi.changeLog(object.workspaceId, { objectId: object.id }).then((r) => { if (live) setChanges(r.changes); }).catch(() => { /* history is optional */ });
    return () => { live = false; };
  }, [isEditing, object]);

  const addFacet = (raw: string) => { const f = raw.replace(/\s+/g, ' ').trim().slice(0, 40); if (f) setFacets((l) => (l.includes(f) || l.length >= 8 ? l : [...l, f])); setFacetDraft(''); };
  const facetsFinal = () => { const f = facetDraft.replace(/\s+/g, ' ').trim().slice(0, 40); return f && !facets.includes(f) && facets.length < 8 ? [...facets, f] : facets; };
  const knownFacets = useMemo(() => [...new Set(allObjects.flatMap((o) => o.facets ?? []))].sort((a, b) => a.localeCompare(b)), [allObjects]);

  // editing the TEXT of confirmed knowledge: the user chooses — keep it as a draft (nothing downstream sees it) or replace the text now
  const confirmedEdit = isEditing && !!object && object.status === 'Confirmed' && !object.sample && !isSupersedingMode;
  const textChanged = confirmedEdit && (content.trim() !== object!.content.trim() || (title.trim() || guessTitle(content)) !== object!.title);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || guessTitle(content);
    if (!content.trim()) return;
    if (type === 'Decision' && !expectationOk) { setRecordOpen(true); return; }

    if (isSupersedingMode && object) {
      onSupersede(object.id, {
        workspaceId: object.workspaceId,
        type,
        status: 'Confirmed',
        provenance: 'User Input',
        title: finalTitle,
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
      title: finalTitle,
      content: content.trim(),
      nodeId,
      supersededById: object?.supersededById,
      source: object?.source,
      slotKey: object?.slotKey,
      ...(type === 'Constraint' ? { reach } : object?.reach ? { reach: object.reach } : {}),
      ...(validUntil ? { validUntil } : {}),
      ...(facetsFinal().length ? { facets: facetsFinal() } : {}),
      ...(canHaveExamples({ type, reach: type === 'Constraint' ? reach : object?.reach }) && cleanExamples(examples) ? { examples: cleanExamples(examples) } : {}),
      ...(type === 'Fact' && assumption ? { assumption: true, ...(reviewBy ? { reviewBy } : {}) } : {}),
      ...(type === 'Decision' && (question.trim() || options.some((o) => o.title.trim()) || expectation.trim() || reviewOn || (expMetric && expBy))
        ? { record: { ...(question.trim() ? { question: question.trim() } : {}), ...(options.some((o) => o.title.trim()) ? { options: options.filter((o) => o.title.trim()).map((o) => ({ title: o.title.trim(), ...(o.rejectedReason.trim() ? { rejectedReason: o.rejectedReason.trim() } : {}) })) } : {}), ...(expectation.trim() ? { expectation: expectation.trim() } : {}), ...(reviewOn ? { reviewOn } : {}), ...(expMetric && expBy ? { metricExpectation: { metricId: expMetric, direction: expDir, ...(expTargetNum !== null ? { targetValue: expTargetNum } : {}), by: expBy } } : {}) } }
        : {}),
    };

    // the dependency set is saved after the object itself (a new object only has an id once it exists)
    void (async () => {
      const asDraft = confirmedEdit && !applyNow && (textChanged || !!object?.draft);
      const reason = isEditing && reasonAllowed(object!.status) && editReason.trim() ? editReason.trim() : undefined;
      const saved = await onSave(updated, reason || asDraft ? { ...(reason ? { reason } : {}), ...(asDraft ? { asDraft: true } : {}) } : undefined);
      const id = isEditing ? object!.id : saved?.id;
      if (id && onSetDependencies && !sameDeps) await onSetDependencies(id, deps);
      // «روی چه اثر دارد»: the same depends_on, written on the other side (the plan lists only the objects that change)
      if (id && onSetDependencies) for (const step of affectPlan(id, effects, relationships)) await onSetDependencies(step.objectId, step.dependsOn);
    })();
    onClose();
  };

  const title_ = isSupersedingMode
    ? 'جایگزینی تصمیم — حفظ تاریخچه'
    : isEditing
    ? 'ویرایش دانش'
    : 'ثبت دانش';

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={title_}
      description={isEditing ? undefined : 'هر چه دربارهٔ کسب‌وکارت درست است بنویس. بقیه‌اش را خودمان حدس می‌زنیم.'}
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
            {isSupersedingMode ? 'ثبت جایگزینی' : isEditing ? 'ذخیرهٔ تغییرات' : 'ذخیره'}
          </Button>
        </>
      }
    >
      {isEditing && object && (
        <div className="mb-stack-md flex flex-col gap-stack-sm">
          <ApprovalBadge history={history} />
          <Tabs label="بخش‌های جزئیات" value={tab} onChange={(v) => setTab(v as 'edit' | 'history' | 'influence')} items={[{ id: 'edit', label: 'ویرایش' }, { id: 'history', label: `نسخه‌ها (${formatNumber(history.entries.length)})` }, { id: 'influence', label: 'اثرگذاران' }]} />
        </div>
      )}
      {tab === 'influence' && isEditing && object && influence && <InfluencePanel influence={influence} nodes={nodes} onOpenObject={onOpenRelated} />}
      {tab === 'history' && isEditing && (
        <VersionHistoryView changes={changes} titleOf={titleOf} nodeLabel={(id) => nodes.find((n) => n.id === id)?.label ?? id} />
      )}
      <form id="context-detail-form" onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.requestSubmit(); } }} className={`${(tab === 'history' || tab === 'influence') && isEditing ? 'hidden' : 'flex'} flex-col gap-stack-md`}>
        {/* سطح ۱: یک جعبهٔ متن، یک عنوان خودکار، سه چیپ نوع و یک چیپ گره */}
        <MentionTextarea
          label="چه چیزی دربارهٔ کسب‌وکارت درست است؟"
          required
          rows={isEditing ? 5 : 6}
          value={content}
          onValueChange={setContent}
          objects={allObjects}
          selfId={object?.id}
          placeholder="مثلاً: مخاطب اصلی ما فریلنسرهای طراح‌اند. / تخفیف نداریم. / تصمیم گرفتیم اینستاگرام کانال اصلی باشد."
        />
        <TextField
          label="عنوان"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
          placeholder={content.trim() ? guessTitle(content) : 'با نوشتن متن، عنوان خودکار ساخته می‌شود'}
          hint={titleTouched || !content.trim() ? undefined : 'خودکار از متن ساخته شد.'}
        />
        <div className="flex flex-wrap items-center gap-inline-sm">
          <div role="radiogroup" aria-label="نوع" className="flex flex-wrap gap-inline-xs">
            {(['Fact', 'Decision', 'Constraint'] as ContextType[]).map((t) => (
              <Button key={t} type="button" size="sm" role="radio" aria-checked={type === t} variant={type === t ? 'secondary' : 'ghost'} iconStart={type === t ? 'Check' : undefined} onClick={() => { setType(t); setTypeTouched(true); }}>{TYPE_CHIP_FA[t]}</Button>
            ))}
          </div>
          <Menu
            label="این دانش در کدام بخش باشد؟"
            className="scroll-menu"
            trigger={<Button type="button" size="sm" variant="ghost" iconStart="FolderTree">در: {nodes.find((n) => n.id === nodeId)?.label ?? 'کسب‌وکار'}</Button>}
            items={flatten(nodes).map(({ node, depth }) => ({ label: `${'— '.repeat(depth)}${node.label}`, icon: node.id === nodeId ? 'Check' as const : undefined, onSelect: () => setNodeId(node.id) }))}
          />
        </div>
        {!typeTouched && content.trim() && <p className="body-sm text-text-subtle">نوع را خودمان حدس زدیم؛ هر کدام درست نیست، عوضش کن.</p>}
        {linkSuggestions.length > 0 && (
          <ul className="flex flex-col gap-stack-xs" aria-label="پیشنهاد رابطه از ارجاع‌ها">
            {linkSuggestions.map((sg) => (
              <li key={sg.targetId} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control border border-border-default bg-surface-sunken p-inset-md">
                <span className="body-sm text-text-default">این متن به «{sg.title}» اشاره می‌کند؛ رابطهٔ «وابسته به» بسازم؟ <span className="text-text-subtle">با ذخیره ثبت می‌شود و در تاریخچه می‌آید.</span></span>
                <span className="flex items-center gap-inline-xs">
                  <Button type="button" size="sm" variant="secondary" iconStart="Link2" disabled={deps.length >= 20} onClick={() => setDeps((cur) => [...cur, sg.targetId])}>بساز</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => turnDown(sg.targetId)}>نه</Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {isEditing && object && reviewNeed && onAcceptReview && (
          <Alert
            intent="warning"
            title="نیاز به بازبینی"
            action={<Button size="sm" variant="secondary" onClick={() => { onAcceptReview(object.id); onClose(); }}>بدون تغییر بپذیر</Button>}
          >
            این مورد به {reviewNeed.changedDependencies.map((d) => `«${titleOf?.(d.id) ?? d.id}»`).join('، ')} وابسته است و آن تغییر کرده. اگر هنوز درست است، بدون تغییر بپذیر؛ وگرنه آن را ویرایش یا جایگزین کن.
          </Alert>
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
        {object?.draft && (
          <Alert intent="info" title="یک تغییر در انتظار تأیید داری">
            <div className="flex flex-col gap-stack-sm">
              <p className="body-sm text-text-default">تا تأیید نشود، AI و خروجی‌ها همین متنِ تأییدشده را می‌بینند. پایین، متن تأییدشده در برابر پیش‌نویس است.</p>
              <BeforeAfter before={object.content} after={object.draft.content} />
              <div className="flex flex-wrap gap-inline-sm">
                {onApproveDraft && <Button type="button" size="sm" variant="secondary" iconStart="Check" onClick={async () => { await onApproveDraft(object.id); onClose(); }}>تأیید و جایگزین کن</Button>}
                {onRejectDraft && <Button type="button" size="sm" variant="ghost" iconStart="X" onClick={async () => { await onRejectDraft(object.id); onClose(); }}>رد کن</Button>}
              </div>
            </div>
          </Alert>
        )}
        {confirmedEdit && textChanged && (
          <div className="flex flex-col gap-stack-xs" data-testid="draft-choice">
            <SegmentedControl label="این تغییر" value={applyNow ? 'now' : 'draft'} onChange={(v) => setApplyNow(v === 'now')} items={[{ id: 'draft', label: 'پیش‌نویس بماند' }, { id: 'now', label: 'همین حالا جایگزین شود' }]} />
            <p className="body-sm text-text-subtle">{applyNow ? 'متن تازه فوراً جای متن تأییدشده می‌نشیند و AI همین را می‌بیند.' : 'متن تأییدشده همان می‌ماند و AI و خروجی‌ها هنوز آن را می‌بینند؛ وقتی پیش‌نویس را تأیید کنی جایش را می‌گیرد.'}</p>
          </div>
        )}
        <div>
          <Button type="button" size="sm" variant="ghost" iconStart={moreOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={moreOpen} aria-controls="context-more" onClick={() => setMoreOpen((v) => !v)}>بیشتر</Button>
        </div>
        {moreOpen && (
          <div id="context-more" className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg">
            <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
              <Select label="وضعیت" value={status} onChange={(e) => setStatus(e.target.value as ContextStatus)} options={STATUS_OPTIONS} />
              <Select label="منبع" value={provenance} onChange={(e) => setProvenance(e.target.value as ContextProvenance)} options={PROVENANCE_OPTIONS} />
            </div>
        {type === 'Constraint' && (
          <div className="flex flex-col gap-stack-xs">
            <SegmentedControl label="محدودهٔ اثر این قید" value={reach} onChange={(v) => setReach(v as 'global' | 'position')} items={[{ id: 'global', label: 'همه‌جا' }, { id: 'position', label: 'فقط این بخش و زیرشاخه‌ها' }]} />
            <p className="body-sm text-text-subtle">{reach === 'global' ? 'در هر خروجی و گفتگو، در هر گره‌ای، گاردریل است.' : 'فقط برای این گره و زیرگره‌هایش گاردریل است؛ بخش‌های دیگر آن را نمی‌بینند.'}</p>
            <p className="body-sm text-text-default" data-testid="reach-sentence">{reachSentence({ nodeId, type, reach }, nodes)}</p>
          </div>
        )}
        {canHaveExamples({ type, reach: type === 'Constraint' ? reach : object?.reach }) && (
          <div className="flex flex-col gap-stack-sm" role="group" aria-label="مثال‌ها" data-testid="redline-examples">
            {examples.map((ex, i) => (
              <div key={i} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle p-inset-md">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <SegmentedControl label={`مثال ${formatNumber(i + 1)}`} value={ex.kind} onChange={(v) => setExamples((l) => l.map((x, j) => (j === i ? { ...x, kind: v as RedlineExample['kind'] } : x)))} items={[{ id: 'good', label: 'درست' }, { id: 'bad', label: 'نادرست' }]} />
                  <Button type="button" size="sm" variant="ghost" iconStart="X" aria-label={`حذف مثال ${formatNumber(i + 1)}`} onClick={() => setExamples((l) => l.filter((_, j) => j !== i))}>حذف</Button>
                </div>
                <TextField label="متن کوتاه مثال" value={ex.text} maxLength={EXAMPLE_MAX_CHARS} onChange={(e) => setExamples((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} hint={ex.kind === 'good' ? 'یک نمونه از آنچه این قاعده را رعایت می‌کند.' : 'یک نمونه از آنچه این قاعده را می‌شکند.'} />
              </div>
            ))}
            {examples.length < EXAMPLE_LIMIT && <div><Button type="button" size="sm" variant="ghost" iconStart="Plus" onClick={() => setExamples((l) => [...l, { kind: l.some((x) => x.kind === 'good') ? 'bad' : 'good', text: '' }])}>افزودن مثال</Button></div>}
            {examples.length > 0 && <p className="body-sm text-text-subtle">مثال‌ها کنار همین قاعده به AI می‌روند تا مرز را بهتر بفهمد.</p>}
          </div>
        )}
        {isEditing && !isSupersedingMode && reasonAllowed(object!.status) && (
          <TextField label="دلیل این ویرایش (اختیاری)" value={editReason} onChange={(e) => setEditReason(e.target.value)} hint="فقط برای ویرایش دانش تأییدشده است؛ در مسیر نسخه‌ها ثبت می‌شود، نه در متن. پیش‌نویس دلیل نمی‌گیرد." />
        )}
        <TextField label="اعتبار تا (اختیاری)" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} hint="بعد از این روز دیگر به هیچ خروجی و گفتگویی نمی‌رود؛ در تاریخچه می‌ماند." />
        <div className="flex flex-col gap-stack-xs" role="group" aria-label="بُعدها">
          <TextField label="بُعد (اختیاری)" value={facetDraft} onChange={(e) => setFacetDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === '،') { e.preventDefault(); addFacet(facetDraft); } }} hint="یک برچسب آزاد که از میان درخت می‌گذرد: «مخاطب سازمانی»، «فصل پاییز». Enter بزن." />
          {facets.length > 0 && <div className="flex flex-wrap gap-inline-xs">{facets.map((f) => <Button key={f} type="button" size="sm" variant="secondary" iconEnd="X" aria-label={`حذف بُعد ${f}`} onClick={() => setFacets((l) => l.filter((x) => x !== f))}>{f}</Button>)}</div>}
          {knownFacets.filter((f) => !facets.includes(f)).length > 0 && <div className="flex flex-wrap items-center gap-inline-xs"><span className="caption text-text-subtle">پیشنهاد از بُعدهای موجود:</span>{knownFacets.filter((f) => !facets.includes(f)).slice(0, 8).map((f) => <Button key={f} type="button" size="sm" variant="ghost" onClick={() => addFacet(f)}>{f}</Button>)}</div>}
        </div>
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
                {metrics.length > 0 && (
                  <div className="flex flex-col gap-stack-sm" role="group" aria-label={MX.expectationField}>
                    <span className="label-md text-text-default">{MX.expectationField}</span>
                    <Select label={MX.expectationMetric} value={expMetric} onChange={(e) => { setExpMetric(e.target.value); const m = metrics.find((x) => x.id === e.target.value); if (m) { setExpDir(m.direction); if (!expTarget && m.target !== undefined) setExpTarget(String(m.target)); } }} options={[{ value: '', label: MX.expectationNone }, ...metrics.filter((m) => !m.archived || m.id === expMetric).map((m) => ({ value: m.id, label: m.name }))]} />
                    {expMetric && (
                      <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-3">
                        <Select label="جهت" value={expDir} onChange={(e) => setExpDir(e.target.value as MetricDirection)} options={[{ value: 'up', label: 'بالا برود' }, { value: 'down', label: 'پایین بیاید' }]} />
                        <TextField label={MX.expectationTarget} inputMode="decimal" value={expTarget} onChange={(e) => setExpTarget(e.target.value)} error={expTarget.trim() && expTargetNum === null ? 'عدد معتبر بنویس.' : undefined} />
                        <TextField label={MX.expectationBy} type="date" value={expBy} onChange={(e) => setExpBy(e.target.value)} error={!expBy ? 'تاریخ لازم است.' : undefined} />
                      </div>
                    )}
                  </div>
                )}
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

        {onSetDependencies && candidates.length > 0 && (
          <div className="flex flex-col gap-stack-md rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md" role="group" aria-label="ارتباط با دانش دیگر" data-testid="relations">
            <RelationPicker
              label="بر چه تکیه دارد؟"
              hint="اگر این مورد روی تصمیم یا دانش دیگری سوار است، آن را بگذار. با تغییرِ آن‌ها، این مورد و خروجی‌های ساخته‌شده از آن نیاز به بازبینی پیدا می‌کنند."
              options={candidates} selected={deps} onChange={setDeps} titleOf={(id) => titleOf?.(id) ?? id}
            />
            <RelationPicker
              label="روی چه اثر دارد؟"
              hint="مواردی که به این تکیه دارند. با تغییرِ این مورد آن‌ها نیاز به بازبینی پیدا می‌کنند."
              options={candidates} selected={effects} onChange={setEffects} titleOf={(id) => titleOf?.(id) ?? id}
            />
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

            {content.trim() && (
              <div className="flex flex-col gap-stack-xs">
                <span className="label-md text-text-default">پیش‌نمایش متن</span>
                <div className="rounded-control border border-border-default bg-surface-sunken p-inset-lg"><Markdown>{content}</Markdown></div>
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
};
