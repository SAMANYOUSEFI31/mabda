/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Contradiction } from '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { ContextDraft, ContextObject, RedlineExample, Metric, MetricDirection, GeneratedDeliverable, ContextProvenance, ContextRelationship, ContextStatus, ContextType, TreeNode } from '../../types';
import { dependentsOf, planDecisions } from '../../core/decisionGraph';
import type { ReviewNeed } from '../../core/decisionGraph';
import { defaultNodeId, flatten, treeIndent } from '../../core/nodeTree';
import { scopeEffect } from '../../core/scopeMove';
import { indirectReach, redundantLinks } from '../../core/dependencyReduction';
import { thoughtsAbout, stripAbout } from '../../core/thoughtAbout';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { reachSentence } from '../../core/packScope';
import { influenceOf } from '../../core/influence';
import { InfluencePanel } from './InfluencePanel';
import { MentionTextarea } from '../shared/MentionTextarea';
import { RelationPicker } from './RelationPicker';
import { BeforeAfter } from '../shared/BeforeAfter';
import { affectPlan, affectedBy } from '../../core/relationPlan';
import { TYPE_CHIP_FA, guessTitle, guessType } from '../../core/knowledgeGuess';
import { suggestLinks } from '../../core/mentions';
import { suggestUpstreamLinks } from '../../core/upstreamLinks';
import { AroundPanel } from './AroundPanel';
import { aroundOf } from '../../core/around';
import { ApprovalBadge, VersionHistoryView } from './VersionHistoryView';
import { conflictPartners, displayState } from '../../core/displayState';
import { clearPendingAddText, takePendingAddText } from '../../core/addRequest';
import { AddKindSwitch } from '../shared/AddKindSwitch';
import { ADD_DESCRIPTION, addSwitchable, markAddSwitchable } from '../../core/addRequest';
import { reasonAllowed, versionHistory } from '../../core/versionHistory';
import type { ContextChange, Note } from '../../types';
import { MX } from '../../core/metricsText';
import { EXAMPLE_LIMIT, EXAMPLE_MAX_CHARS, canHaveExamples, cleanExamples } from '../../core/redlineExamples';
import { parseNumber } from '../../core/metrics';
import { dataApi } from '../../services/dataApi';
import { DateField, Alert, Badge, Button, Card, Checkbox, Dialog, Markdown, Menu, Nuqta, SegmentedControl, Select, Tabs, TextField, Textarea, formatJalaliDate, formatNumber } from '../../ui';

interface ContextDetailModalProps {
  /** the app's unresolved contradictions, so the «تناقض» marker matches the counters (UX-04) */
  conflicts?: Contradiction[];
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
  /** a NEW piece of knowledge: «چند دانش داری؟» opens the batch entry from the moment the person starts writing one */
  onOpenBatch?: () => void;
  /** the open thoughts (derived from notes): the ones that name this knowledge are listed as «فکرهای باز دربارهٔ این» */
  thoughts?: NoteThinkingItem[];
  onOpenThinking?: () => void;
  onThinkAbout?: (object: ContextObject) => void;
  /** derived «needs review»: a dependency changed and nobody reviewed this object since */
  reviewNeed?: ReviewNeed;
  titleOf?: (id: string) => string;
  onAcceptReview?: (objectId: string) => void;
  /** for «اثرگذاران و اثرپذیران»: the assets built from this object */
  deliverables?: GeneratedDeliverable[];
  /** for «منشأ» (the thought a piece of knowledge came from) */
  notes?: Note[];
  /** a provenance link to a thought: go to it */
  onOpenNote?: (noteId: string, nodeId: string) => void;
  /** a provenance link to an output */
  onOpenAssets?: () => void;
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
  { value: 'Constraint', label: 'خط قرمز' },
];
/**
 * The state of a piece of knowledge is a LIFECYCLE moved by actions (approve, replace, archive, restore), not a field to pick:
 * «گذشته» without a successor or an archive entry was a broken state, and «قدیمی» is set by the engines. The only choice the form
 * still offers is the one that has no other door: turning a proposal into truth (docs/ux/decisions.md §۱). Where it came from
 * («منبع») is a record, shown on the card, never an input.
 */
const PROPOSAL_STATUS_OPTIONS = [
  { value: 'Proposed', label: 'پیشنهاد (هنوز وارد خروجی‌ها نمی‌شود)' },
  { value: 'Confirmed', label: 'حقیقت (تأییدش می‌کنم)' },
];
/** «فرض» is a kind she picks, next to «واقعیت», not a box that says the chip she picked was wrong (stored as a Fact + assumption) */
type KindChip = ContextType | 'Assumption';
const KIND_CHIPS: Array<{ id: KindChip; label: string }> = [{ id: 'Fact', label: 'واقعیت' }, { id: 'Assumption', label: 'فرض' }, { id: 'Decision', label: 'تصمیم' }, { id: 'Constraint', label: 'خط قرمز' }];

const ContextDetailForm: React.FC<ContextDetailModalProps> = ({
  conflicts,
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
  onOpenBatch,
  thoughts = [],
  onOpenThinking,
  onThinkAbout,
  reviewNeed,
  titleOf,
  onAcceptReview,
  deliverables = [],
  notes = [],
  onOpenNote,
  onOpenAssets,
  onOpenRelated,
  onPatchObject,
}) => {
  const isEditing = !!object && object.id !== ''; // id '' = a prefilled draft (e.g. from an AI block)
  // the kind switch only when opened from the global «افزودن»; a section's «+ حقیقت» is locked to «حقیقت» (addRequest.ts)
  const [switchable] = useState(() => !object && addSwitchable());
  useEffect(() => () => markAddSwitchable(false), []);

  // opening a knowledge that has a waiting draft shows what she clicked: the CONFIRMED text, the same as the card. The draft is shown
  // against it in the notice below, with «ادامهٔ ویرایش پیش‌نویس» to bring it into the editor (docs/ux/decisions.md §۱۲)
  const [title, setTitle] = useState(object?.title ?? '');
  // text carried over from the «فکر» or «فایل» side of «افزودن» (patterns.md §۳)
  const [content, setContent] = useState(() => object?.content ?? (object ? '' : takePendingAddText()));
  const [onDraft, setOnDraft] = useState(false);
  useEffect(() => () => clearPendingAddText(), []);
  const [contentError, setContentError] = useState('');
  const [applyNow, setApplyNow] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // the kind and the title are guessed from the text until the user picks / writes her own (src/core/knowledgeGuess.ts)
  const keepsOwn = !!object; // editing, or a prefilled draft that already has them
  const [typeTouched, setTypeTouched] = useState(keepsOwn);
  const [titleTouched, setTitleTouched] = useState(keepsOwn && !!object?.title);
  const [type, setType] = useState<ContextType>(object?.type || 'Fact');
  const [status, setStatus] = useState<ContextStatus>(object?.status || 'Confirmed');
  const [nodeId, setNodeId] = useState(object?.nodeId || defaultNodeIdProp || defaultNodeId(nodes));
  /** switching to «فکر» carries the section only when she picked it here; otherwise the thought keeps its own default («تازه‌ها») */
  const [nodePicked, setNodePicked] = useState(false);
  const [provenance, setProvenance] = useState<ContextProvenance>(
    object?.provenance || 'User Input'
  );
  const [reach, setReach] = useState<'global' | 'position'>(object?.reach ?? (object?.type === 'Constraint' || !object ? 'global' : 'position'));
  const [validUntil, setValidUntil] = useState(object?.validUntil ?? '');
  const [facets, setFacets] = useState<string[]>(object?.facets ?? []);
  const [examples, setExamples] = useState<RedlineExample[]>(object?.examples ?? []); // the draft's examples come with «ادامهٔ ویرایش پیش‌نویس»
  const continueDraft = () => { if (!object?.draft) return; setContent(object.draft.content); setTitle(object.draft.title ?? object.title); if (object.draft.examples) setExamples(object.draft.examples); setOnDraft(true); };
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
  const [promote, setPromote] = useState<null | { to: string; reason: string }>(null);
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
  const around = useMemo(() => (isEditing && object ? aroundOf({ objectId: object.id, objects: allObjects, relationships, nodes, thoughts, notes, deliverables }) : undefined), [isEditing, object, allObjects, relationships, nodes, thoughts, notes, deliverables]);
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
  const linkSuggestions = useMemo(() => {
    const dismissed = [...deps, ...allObjects.map((o) => o.id).filter((id) => turnedDown.includes(noKey(id)))];
    const named = suggestLinks({ text: content, title, selfId: object?.id, objects: allObjects, relationships, dismissed });
    // …and what reaches this section from ABOVE and talks about the same thing (a hint with its reason; one tap accepts)
    const above = suggestUpstreamLinks({ title: title.trim() || guessTitle(content), type, nodeId, selfId: object?.id, objects: allObjects, nodes, relationships, dismissed: [...dismissed, ...named.map((s) => s.targetId)] });
    return [...named, ...above];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, type, nodeId, nodes, object?.id, allObjects, relationships, deps, turnedDown]);
  const turnDown = (targetId: string) => { const next = [...turnedDown, noKey(targetId)].slice(-200); setTurnedDown(next); try { localStorage.setItem('mabda.mentions.no', JSON.stringify(next)); } catch { /* optional */ } };
  const history = useMemo(() => versionHistory(changes), [changes]);
  const [tab, setTab] = useState<'edit' | 'history' | 'around'>('edit');
  useEffect(() => {
    if (!isEditing || !object) return;
    let live = true;
    dataApi.changeLog(object.workspaceId, { objectId: object.id }).then((r) => { if (live) setChanges(r.changes); }).catch(() => { /* history is optional */ });
    return () => { live = false; };
  }, [isEditing, object]);

  const addFacet = (raw: string) => { const f = raw.replace(/\s+/g, ' ').trim().slice(0, 40); if (f) setFacets((l) => (l.includes(f) || l.length >= 8 ? l : [...l, f])); setFacetDraft(''); };
  const facetsFinal = () => { const f = facetDraft.replace(/\s+/g, ' ').trim().slice(0, 40); return f && !facets.includes(f) && facets.length < 8 ? [...facets, f] : facets; };
  const partners = useMemo(() => conflictPartners(allObjects, conflicts), [allObjects, conflicts]);
  const conflictWith = object ? partners.get(object.id) : undefined;
  const shownState = object ? displayState(object, partners) : 'truth';
  const knownFacets = useMemo(() => [...new Set(allObjects.flatMap((o) => o.facets ?? []))].sort((a, b) => a.localeCompare(b)), [allObjects]);

  // editing the TEXT of confirmed knowledge: the user chooses — keep it as a draft (nothing downstream sees it) or replace the text now
  const confirmedEdit = isEditing && !!object && object.status === 'Confirmed' && !object.sample && !isSupersedingMode;
  // the examples are part of a red line's text: changing them is a change of the text (draft or replace, like the rest)
  const examplesChanged = JSON.stringify(cleanExamples(examples) ?? null) !== JSON.stringify(cleanExamples(object?.examples ?? []) ?? null);
  const textChanged = confirmedEdit && (content.trim() !== object!.content.trim() || (title.trim() || guessTitle(content)) !== object!.title || examplesChanged);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || guessTitle(content);
    if (!content.trim()) { setContentError('آنچه درست است را بنویس تا ثبت شود.'); document.getElementById('context-content')?.focus(); return; }
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

    const keepDraft = !!object?.draft && !onDraft && !textChanged && confirmedEdit;
    const updated: ContextDraft = {
      id: isEditing ? object!.id : undefined,
      workspaceId: object?.workspaceId || workspaceId,
      type,
      status,
      provenance,
      // a waiting draft she did not touch (the editor still shows the confirmed text) is sent back as it was: saving the type or the
      // place must not throw her draft away (a direct write of the text clears it on the server)
      title: keepDraft ? (object!.draft!.title ?? finalTitle) : finalTitle,
      content: keepDraft ? object!.draft!.content : content.trim(),
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

  // the verb names what is being added: an assumption is not «truth» yet (decisions.md §۱)
  const addLabel = type === 'Fact' && assumption ? 'افزودن فرض' : 'افزودن حقیقت';
  const title_ = isSupersedingMode
    ? 'جایگزین کردن — قبلی در تاریخچه می‌ماند'
    : isEditing
    ? 'ویرایش دانش'
    : switchable ? 'افزودن' : addLabel;
  // a waiting draft and nothing else touched: the one decision of this view is the draft, so the main button IS «تأیید پیش‌نویس»;
  // a «ذخیرهٔ تغییرات» there read as «confirmed» while it confirmed nothing (decisions.md §۱۲). Any other change brings «ذخیره» back.
  const approveMode = isEditing && !!object?.draft && !onDraft && !textChanged && !moreOpen && !isSupersedingMode && !!onApproveDraft
    && type === object.type && nodeId === object.nodeId && assumption === (object.assumption === true);
  const saveLabel = confirmedEdit && textChanged ? (applyNow ? 'ذخیره و جایگزینی' : 'ذخیرهٔ پیش‌نویس') : 'ذخیرهٔ تغییرات';

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      steady={switchable}
      dirty={content.trim() !== ((onDraft ? object?.draft?.content : undefined) ?? object?.content ?? '').trim() || title !== ((onDraft ? object?.draft?.title : undefined) ?? object?.title ?? '')}
      title={title_}
      description={isEditing ? undefined : switchable ? ADD_DESCRIPTION : 'هر چه درست است بنویس؛ نوع و جایش را بعد هم می‌شود عوض کرد.'}
      footer={
        isEditing && tab !== 'edit' ? (
          // nothing to save on «نسخه‌ها» or «اطراف»: one way out, no save button
          <Button variant="secondary" onClick={onClose}>بستن</Button>
        ) : (
          <>
            {isEditing && !isSupersedingMode && object && (
              <Menu
                label="کارهای دیگر با این دانش"
                side="top"
                trigger={<Button type="button" variant="ghost" iconStart="Ellipsis">بیشتر</Button>}
                items={[
                  { label: 'جایگزین کردن', icon: 'History', onSelect: () => setIsSupersedingMode(true) },
                  { label: 'بایگانی', icon: 'Archive', onSelect: () => { onArchive(object.id); onClose(); } },
                ]}
              />
            )}
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            {approveMode
              ? <Button variant="primary" type="button" iconStart="Check" onClick={async () => { await onApproveDraft!(object!.id); onClose(); }}>جایگزینی</Button>
              : <Button variant="primary" type="submit" form="context-detail-form">
                  {isSupersedingMode ? 'ثبت جایگزینی' : isEditing ? saveLabel : addLabel}
                </Button>}
          </>
        )
      }
    >
      {isEditing && object && (
        <div className="mb-stack-md flex flex-col gap-stack-sm">
          <ApprovalBadge history={history} state={shownState} />
          {conflictWith && (
            // no margin column in a dialog: the contradiction is one short inline sentence beside its dot (meaning-map.md)
            <p className="inline-flex items-start gap-inline-xs body-sm text-text-default">
              <Nuqta state="conflict" size="sm" className="mt-stack-xs" />
              <span>تناقض: با «{conflictWith.title}» در بخش «{nodes.find((n) => n.id === conflictWith.nodeId)?.label ?? '—'}» نمی‌خواند؛ یکی را نگه دار.</span>
            </p>
          )}
          <Tabs label="بخش‌های جزئیات" value={tab} onChange={(v) => setTab(v as 'edit' | 'history' | 'around')} items={[{ id: 'edit', label: 'ویرایش' }, { id: 'history', label: `نسخه‌ها (${formatNumber(history.entries.length)})` }, { id: 'around', label: 'اطراف این مورد' }]} />
        </div>
      )}
      {tab === 'around' && isEditing && object && (
        <div className="flex flex-col gap-stack-lg">
          <AroundPanel object={object} around={around!} allObjects={allObjects} onOpenObject={onOpenRelated} onOpenNote={onOpenNote} onOpenThinking={onOpenThinking} onOpenAssets={onOpenAssets} />
          {influence && <InfluencePanel influence={influence} nodes={nodes} onOpenObject={onOpenRelated} />}
        </div>
      )}
      {tab === 'history' && isEditing && (
        <VersionHistoryView changes={changes} titleOf={titleOf} nodeLabel={(id) => nodes.find((n) => n.id === id)?.label ?? id} />
      )}
      <form id="context-detail-form" noValidate onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.requestSubmit(); } }} className={`${(tab === 'history' || tab === 'around') && isEditing ? 'hidden' : 'flex'} flex-col gap-stack-md`}>
        {switchable && <AddKindSwitch value="truth" text={content} nodeId={nodePicked ? nodeId : undefined} onLeave={onClose} />}
        {object?.status === 'Confirmed' && onThinkAbout && (
          <div>
            <Button type="button" size="sm" variant="secondary" iconStart="Lightbulb" onClick={() => onThinkAbout(object)}>دربارهٔ این فکر کن</Button>
          </div>
        )}
        {/* سطح ۱: یک جعبهٔ متن، یک عنوان خودکار، سه چیپ نوع و یک چیپ بخش */}
        <MentionTextarea
          id="context-content"
          label={type === 'Fact' && assumption ? 'چه چیزی را فرض می‌کنی؟' : 'چه چیزی درست است؟'}
          required
          error={contentError || undefined}
          rows={isEditing ? 5 : 6}
          value={content}
          onValueChange={(v) => { setContent(v); if (contentError && v.trim()) setContentError(''); }}
          objects={allObjects}
          selfId={object?.id}
          placeholder="مثلاً: جلسهٔ هفتگی دوشنبه‌هاست. / به بادام‌زمینی حساسیت دارم. / بودجهٔ این کار ۲۰ میلیون است."
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
            {KIND_CHIPS.map(({ id, label }) => {
              const on = id === 'Assumption' ? type === 'Fact' && assumption : type === id && !(id === 'Fact' && assumption);
              return <Button key={id} type="button" size="sm" role="radio" aria-checked={on} variant={on ? 'secondary' : 'ghost'} iconStart={on ? 'Check' : undefined} onClick={() => { setType(id === 'Assumption' ? 'Fact' : id); setAssumption(id === 'Assumption'); setTypeTouched(true); }}>{label}</Button>;
            })}
          </div>
          <Menu
            label="این دانش در کدام بخش باشد؟"
            className="scroll-menu"
            trigger={<Button type="button" size="sm" variant="ghost" iconStart="FolderTree">در: {nodes.find((n) => n.id === nodeId)?.label ?? nodes[0]?.label ?? 'بدون بخش'}</Button>}
            items={flatten(nodes).map(({ node, depth }) => ({ label: `${treeIndent(depth)}${node.label}`, icon: node.id === nodeId ? 'Check' as const : undefined, onSelect: () => { setNodeId(node.id); setNodePicked(true); } }))}
          />
        </div>
        {!typeTouched && content.trim() && <p className="body-sm text-text-subtle">نوع را خودمان حدس زدیم؛ اگر درست نیست، عوضش کن.</p>}
        {type === 'Fact' && assumption && <p className="body-sm text-text-subtle">فرض یعنی هنوز ثابت نشده: هرگز به‌عنوان واقعیت در خروجی‌ها و بسته‌ها نمی‌آید و جدا، زیر «فرض‌های فعال» می‌آید. تاریخ بازبینی‌اش در «جزئیات بیشتر» است.</p>}
        {!object && onOpenBatch && <div><Button type="button" size="sm" variant="ghost" iconStart="ListChecks" onClick={() => { onClose(); onOpenBatch(); }}>چند دانش داری؟ یکجا وارد کن</Button></div>}
        {linkSuggestions.length > 0 && (
          <ul className="flex flex-col gap-stack-xs" aria-label="پیشنهاد رابطه">
            {linkSuggestions.map((sg) => (
              <li key={sg.targetId} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control border border-border-default bg-surface-sunken p-inset-md">
                <span className="body-sm text-text-default">{sg.fromNode ? `از بخش «${sg.fromNode}» به اینجا می‌رسد و از «${sg.because}» حرف می‌زند. به «${sg.title}» وابسته است؟` : sg.because ? `عنوان‌هایتان واژهٔ مشترک دارد (${sg.because}). به «${sg.title}» وابسته است؟` : `این متن به «${sg.title}» اشاره می‌کند؛ رابطهٔ «وابسته به» بسازم؟`} <span className="text-text-subtle">با ذخیره ثبت می‌شود و در تاریخچه می‌آید.</span></span>
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
              label="دلیل جایگزین کردن"
              value={supersedeReason}
              onChange={(e) => setSupersedeReason(e.target.value)}
              placeholder="مثلاً: عدد تازه‌تری پیدا کردم"
              hint="مورد قبلی پاک نمی‌شود؛ با رابطهٔ «جایگزین کرد» در تاریخچه می‌ماند."
            />
          </Card>
        )}
        {object?.draft && (
          <Alert intent="info" title="یک تغییر در انتظار تأیید داری">
            <div className="flex flex-col gap-stack-sm">
              <p className="body-sm text-text-default">{onDraft ? 'بالا پیش‌نویس را ویرایش می‌کنی. تا تأیید نشود، خروجی‌ها و بسته‌ها متنِ تأییدشده را می‌بینند.' : 'بالا متن تأییدشده است، همان که خروجی‌ها و بسته‌ها می‌بینند. پیش‌نویس در برابرش:'}</p>
              <BeforeAfter before={object.content} after={object.draft.content} />
              <div className="flex flex-wrap gap-inline-sm">
                {onApproveDraft && !approveMode && <Button type="button" size="sm" variant="secondary" iconStart="Check" onClick={async () => { await onApproveDraft(object.id); onClose(); }}>جایگزینی</Button>}
                {!onDraft && <Button type="button" size="sm" variant="ghost" iconStart="Pencil" onClick={continueDraft}>ادامهٔ ویرایش پیش‌نویس</Button>}
                {onRejectDraft && <Button type="button" size="sm" variant="ghost" iconStart="X" onClick={async () => { await onRejectDraft(object.id); onClose(); }}>رد</Button>}
              </div>
            </div>
          </Alert>
        )}
        {confirmedEdit && textChanged && (
          <div className="flex flex-col gap-stack-xs" data-testid="draft-choice">
            <SegmentedControl label="این تغییر" value={applyNow ? 'now' : 'draft'} onChange={(v) => setApplyNow(v === 'now')} items={[{ id: 'draft', label: 'پیش‌نویس بماند' }, { id: 'now', label: 'همین حالا جایگزین شود' }]} />
            {object?.draft && !onDraft && !applyNow && <p className="body-sm text-text-default">این متن جای پیش‌نویسی را می‌گیرد که منتظر بود.</p>}
            <p className="body-sm text-text-subtle">{applyNow ? 'متن تازه فوراً جای متن تأییدشده می‌نشیند و خروجی‌ها همین را می‌بینند.' : 'متن تأییدشده همان می‌ماند و خروجی‌ها و بسته‌ها هنوز آن را می‌بینند؛ وقتی پیش‌نویس را تأیید کنی جایش را می‌گیرد.'}</p>
          </div>
        )}
        <div>
          <Button type="button" size="sm" variant="ghost" iconStart={moreOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={moreOpen} aria-controls="context-more" onClick={() => setMoreOpen((v) => !v)}>جزئیات بیشتر</Button>
        </div>
        {moreOpen && (
          <div id="context-more" className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg">
            {object?.status === 'Proposed' && <Select label="وضعیت" value={status} onChange={(e) => setStatus(e.target.value as ContextStatus)} options={PROPOSAL_STATUS_OPTIONS} />}
        {type === 'Constraint' && (
          <div className="flex flex-col gap-stack-xs">
            <SegmentedControl label="محدودهٔ اثر این خط قرمز" value={reach} onChange={(v) => setReach(v as 'global' | 'position')} items={[{ id: 'global', label: 'همه‌جا' }, { id: 'position', label: 'فقط این بخش و زیرشاخه‌ها' }]} />
            <p className="body-sm text-text-subtle">{reach === 'global' ? 'در هر خروجی و گفتگو، در هر بخشی، خط قرمز است.' : 'فقط برای این بخش و زیربخش‌هایش خط قرمز است؛ بخش‌های دیگر آن را نمی‌بینند.'}</p>
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
            {examples.length > 0 && <p className="body-sm text-text-subtle">مثال‌ها کنار همین قاعده در خروجی‌ها و بسته‌ها می‌آیند تا مرزش روشن باشد.</p>}
          </div>
        )}
        {isEditing && !isSupersedingMode && reasonAllowed(object!.status) && (
          <TextField label="دلیل این ویرایش (اختیاری)" value={editReason} onChange={(e) => setEditReason(e.target.value)} hint="فقط برای ویرایش دانش تأییدشده است؛ در مسیر نسخه‌ها ثبت می‌شود، نه در متن. پیش‌نویس دلیل نمی‌گیرد." />
        )}
        <DateField label="اعتبار تا (اختیاری)" value={validUntil} onValueChange={(v) => setValidUntil(v)} hint="بعد از این روز دیگر به هیچ خروجی و گفتگویی نمی‌رود؛ در تاریخچه می‌ماند." />
        <div className="flex flex-col gap-stack-xs" role="group" aria-label="بُعدها">
          <TextField label="بُعد (اختیاری)" value={facetDraft} onChange={(e) => setFacetDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === '،') { e.preventDefault(); addFacet(facetDraft); } }} hint="یک برچسب آزاد که از میان درخت می‌گذرد: «مخاطب سازمانی»، «فصل پاییز». Enter بزن." />
          {facets.length > 0 && <div className="flex flex-wrap gap-inline-xs">{facets.map((f) => <Button key={f} type="button" size="sm" variant="secondary" iconEnd="X" aria-label={`حذف بُعد ${f}`} onClick={() => setFacets((l) => l.filter((x) => x !== f))}>{f}</Button>)}</div>}
          {knownFacets.filter((f) => !facets.includes(f)).length > 0 && <div className="flex flex-wrap items-center gap-inline-xs"><span className="caption text-text-subtle">پیشنهاد از بُعدهای موجود:</span>{knownFacets.filter((f) => !facets.includes(f)).slice(0, 8).map((f) => <Button key={f} type="button" size="sm" variant="ghost" onClick={() => addFacet(f)}>{f}</Button>)}</div>}
        </div>
        {type === 'Fact' && assumption && <DateField label="بازبینی این فرض تا (اختیاری)" value={reviewBy} onValueChange={(v) => setReviewBy(v)} hint="در «این هفته» و «خانه» که رسید دوباره می‌پرسیم." />}
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
                <DateField label="تاریخ بازبینی" value={reviewOn} onValueChange={(v) => setReviewOn(v)} hint="در بازبینی هفتگی می‌پرسیم «نتیجه چه شد؟»" />
                {metrics.length > 0 && (
                  <div className="flex flex-col gap-stack-sm" role="group" aria-label={MX.expectationField}>
                    <span className="label-md text-text-default">{MX.expectationField}</span>
                    <Select label={MX.expectationMetric} value={expMetric} onChange={(e) => { setExpMetric(e.target.value); const m = metrics.find((x) => x.id === e.target.value); if (m) { setExpDir(m.direction); if (!expTarget && m.target !== undefined) setExpTarget(String(m.target)); } }} options={[{ value: '', label: MX.expectationNone }, ...metrics.filter((m) => !m.archived || m.id === expMetric).map((m) => ({ value: m.id, label: m.name }))]} />
                    {expMetric && (
                      <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-3">
                        <Select label="جهت" value={expDir} onChange={(e) => setExpDir(e.target.value as MetricDirection)} options={[{ value: 'up', label: 'بالا برود' }, { value: 'down', label: 'پایین بیاید' }]} />
                        <TextField label={MX.expectationTarget} inputMode="decimal" value={expTarget} onChange={(e) => setExpTarget(e.target.value)} error={expTarget.trim() && expTargetNum === null ? 'عدد معتبر بنویس.' : undefined} />
                        <DateField label={MX.expectationBy} value={expBy} onValueChange={(v) => setExpBy(v)} error={!expBy ? 'تاریخ لازم است.' : undefined} />
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
            <div><Button type="button" size="sm" variant="ghost" iconStart="ArrowRight" onClick={() => setPromote((p) => (p ? null : { to: parentNodeId ?? 'global', reason: '' }))}>کجا اعمال شود</Button></div>
            {promote && (() => {
              const eff = scopeEffect(nodes, relationships ?? [], object, promote.to === 'global' ? { kind: 'global' } : { kind: 'node', nodeId: promote.to }, new Date());
              const unchanged = promote.to === 'global' ? object.reach === 'global' : promote.to === object.nodeId && object.reach !== 'global';
              // a reason is asked only when the REACH changes (to or from «همه‌جا»); a plain move to another branch is tidying, like «در: …» above
              const reachChanges = promote.to === 'global' || object.reach === 'global';
              return (
                <div className="flex flex-col gap-stack-sm rounded-control border border-border-selected p-inset-lg" role="group" aria-label="کجا اعمال شود">
                  <Select label="این دانش در کدام بخش خانه دارد؟" value={promote.to} onChange={(e) => setPromote({ ...promote, to: e.target.value })} options={[{ value: 'global', label: 'همه‌جا' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${treeIndent(depth)}${n.label}${n.id === object.nodeId && object.reach !== 'global' ? ' (الان)' : ''}` }))]} hint="بالاتر = به بخش‌های بیشتری می‌رسد. هر دانش یک خانه دارد؛ برای چند بخش، اولین والد مشترکشان را انتخاب کن." />
                  <p className="body-sm text-text-default" aria-live="polite" data-testid="scope-effect">{unchanged ? 'همین‌جاست؛ چیزی عوض نمی‌شود.' : eff.sentence}</p>
                  <Textarea label={reachChanges ? 'دلیل (لازم)' : 'دلیل (اختیاری)'} rows={2} value={promote.reason} onChange={(e) => setPromote({ ...promote, reason: e.target.value })} />
                  <div><Button type="button" size="sm" variant="secondary" disabled={unchanged || (reachChanges && !promote.reason.trim())} onClick={async () => { await onPatchObject(object.id, promote.to === 'global' ? { reach: 'global', reason: promote.reason.trim() } : { nodeId: promote.to, ...(object.reach === 'global' ? { reach: 'position' as const } : {}), reason: promote.reason.trim() }); onClose(); }}>انتقال به این جا</Button></div>
                </div>
              );
            })()}
          </div>
        )}

        {isEditing && object && (() => {
          const about = thoughtsAbout(thoughts, object.id, allObjects, nodes);
          if (!about.length) return null;
          return (
            <section className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md" aria-label="فکرهای باز دربارهٔ این" data-testid="thoughts-about">
              <h4 className="label-md text-text-default">فکرهای باز دربارهٔ این ({formatNumber(about.length)})</h4>
              <ul className="flex flex-col gap-stack-xs">{about.slice(0, 5).map((t) => <li key={t.key} className="body-sm text-text-default">{stripAbout(t.text) || t.text}</li>)}</ul>
              {onOpenThinking && <div><Button type="button" size="sm" variant="ghost" iconStart="Lightbulb" onClick={onOpenThinking}>باز کردن در فضای فکر</Button></div>}
            </section>
          );
        })()}
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
            {isEditing && object && redundantLinks(allObjects, [...relationships.filter((r) => !(r.type === 'depends_on' && r.sourceId === object.id)), ...deps.map((d) => ({ id: `tmp_${d}`, type: 'depends_on', sourceId: object.id, targetId: d }) as ContextRelationship)]).filter((l) => l.from === object.id && deps.includes(l.to)).map((l) => (
              <div key={l.to} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle p-inset-sm" data-testid="redundant-link">
                <p className="body-sm text-text-default">«{titleOf?.(l.to) ?? l.to}» لازم نیست؛ از راه «{l.via.map((v) => titleOf?.(v) ?? v).join('» و «')}» به آن می‌رسد.</p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDeps(deps.filter((d) => d !== l.to))}>برش دار</Button>
              </div>
            ))}
            {isEditing && object && (() => {
              const r = indirectReach(object.id, allObjects, relationships);
              if (!r.upstream.length && !r.downstream.length) return null;
              const names = (ids: string[]) => `${ids.slice(0, 3).map((x) => `«${titleOf?.(x) ?? x}»`).join('، ')}${ids.length > 3 ? ` و ${formatNumber(ids.length - 3)} مورد دیگر` : ''}`;
              return (
                <p className="body-sm text-text-subtle" data-testid="indirect-reach">
                  {r.upstream.length ? `از راه‌های غیرمستقیم هم از ${names(r.upstream)} اثر می‌پذیرد. ` : ''}
                  {r.downstream.length ? `از راه‌های غیرمستقیم روی ${names(r.downstream)} هم اثر می‌گذارد.` : ''}
                </p>
              );
            })()}
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
