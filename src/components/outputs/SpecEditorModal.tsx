/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { DeliverableSpec, OutputBandId, PlanId, TreeNode, WorkstreamSpec } from '../../types';
import { PLANS } from '../../core/creditEngine';
import { flatten } from '../../core/nodeTree';
import { validateSpec, wouldCreateCycle } from '../../core/specGraph';
import { Alert, Button, Card, Checkbox, Dialog, IconButton, Select, TextField, Textarea, formatNumber } from '../../ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaveSpec: (spec: WorkstreamSpec) => Promise<boolean> | boolean;
  planId: PlanId;
  nodes: TreeNode[];
  /** every spec the user can copy from (built-in + custom) */
  specs: WorkstreamSpec[];
  /** a custom spec to edit; undefined = new */
  initial?: WorkstreamSpec;
  onUpgrade: () => void;
}

/** The form state is built from `initial` every time the dialog opens. */
export const SpecEditorModal: React.FC<Props> = (props) => (props.isOpen ? <SpecEditor {...props} /> : null);

let uidCounter = 0;
const uid = () => `u${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

interface Line { uid: string; text: string }
interface CtxItem { uid: string; key: string; label: string; description: string; nodeId: string }
interface DelItem { id: string; title: string; type: 'Asset' | 'Deliverable'; description: string; band: OutputBandId; dependsOn: string[]; criteria: Line[] }
interface Draft { title: string; target: string; description: string; required: CtxItem[]; suggested: CtxItem[]; optional: CtxItem[]; deliverables: DelItem[]; guardrails: Line[] }

const COST: Record<'Asset' | 'Deliverable', DeliverableSpec['baseCreditCost']> = {
  Asset: { fast: 1, auto: 2, critique: 10, sensitive: 20 },
  Deliverable: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
};
const BAND_OPTIONS = [
  { value: 'short', label: 'کوتاه' },
  { value: 'medium', label: 'متوسط' },
  { value: 'long', label: 'بلند' },
];
const TYPE_OPTIONS = [
  { value: 'Asset', label: 'دارایی کوچک (سریع)' },
  { value: 'Deliverable', label: 'خروجی اصلی (تفصیلی)' },
];

const lines = (xs: string[] = []): Line[] => xs.map((text) => ({ uid: uid(), text }));
const ctxItems = (xs: WorkstreamSpec['requiredContext']): CtxItem[] => xs.map((c) => ({ uid: uid(), key: c.key, label: c.label, description: c.description, nodeId: c.nodeId }));

function toDraft(s?: WorkstreamSpec, copy = false): Draft {
  if (!s) {
    return { title: '', target: '', description: '', required: [], suggested: [], optional: [], guardrails: [], deliverables: [{ id: `del_${uid()}`, title: '', type: 'Asset', description: '', band: 'medium', dependsOn: [], criteria: lines(['']) }] };
  }
  // a copy gets fresh deliverable ids (dependencies are remapped) so it never collides with the original
  const idMap = new Map(s.deliverables.map((d) => [d.id, copy ? `del_${uid()}` : d.id]));
  return {
    title: copy ? `${s.title} (کپی)` : s.title, target: s.target, description: s.description,
    required: ctxItems(s.requiredContext), suggested: ctxItems(s.suggestedContext), optional: ctxItems(s.optionalContext),
    guardrails: lines(s.guardrails),
    deliverables: s.deliverables.map((d) => ({
      id: idMap.get(d.id)!, title: d.title, type: d.type, description: d.description, band: d.outputBand ?? 'medium',
      dependsOn: (d.dependsOn ?? []).map((x) => idMap.get(x)!).filter(Boolean), criteria: lines(d.acceptanceCriteria),
    })),
  };
}

function toSpec(d: Draft, id: string): WorkstreamSpec {
  const ctx = (xs: CtxItem[], prefix: string) => xs.filter((x) => x.label.trim()).map((x) => ({ key: x.key || `${prefix}_${x.uid}`, label: x.label.trim(), description: x.description.trim() || x.label.trim(), nodeId: x.nodeId }));
  return {
    id, title: d.title.trim(), target: d.target.trim(), description: d.description.trim() || d.target.trim(),
    requiredContext: ctx(d.required, 'req'), suggestedContext: ctx(d.suggested, 'sug'), optionalContext: ctx(d.optional, 'opt'),
    guardrails: d.guardrails.map((g) => g.text.trim()).filter(Boolean),
    deliverables: d.deliverables.map((x, i) => ({
      id: x.id, title: x.title.trim(), type: x.type, description: x.description.trim(), order: i + 1,
      dependsOn: x.dependsOn.length ? x.dependsOn : undefined, outputBand: x.band, baseCreditCost: COST[x.type],
      acceptanceCriteria: x.criteria.map((c) => c.text.trim()).filter(Boolean),
    })),
  };
}

/** Unbounded list with add / remove / move up / move down. */
function Rows<T extends { uid?: string; id?: string }>({ items, onChange, render, add, addLabel, empty }: {
  items: T[]; onChange: (next: T[]) => void; render: (item: T, patch: (p: Partial<T>) => void, index: number) => React.ReactNode; add: () => T; addLabel: string; empty?: string;
}) {
  const key = (x: T) => (x.uid ?? x.id) as string;
  const move = (i: number, to: number) => { const a = [...items]; const [x] = a.splice(i, 1); a.splice(to, 0, x); onChange(a); };
  return (
    <div className="flex flex-col gap-stack-sm">
      {items.length === 0 && empty && <p className="body-sm text-text-subtle">{empty}</p>}
      {items.map((it, i) => (
        <div key={key(it)} className="flex items-start gap-inline-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
          <div className="min-w-space-0 flex-1">{render(it, (p) => onChange(items.map((x) => (key(x) === key(it) ? { ...x, ...p } : x))), i)}</div>
          <div className="flex shrink-0 flex-col gap-inline-xs sm:flex-row">
            <IconButton icon="ChevronUp" label="بالاتر" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} />
            <IconButton icon="ChevronDown" label="پایین‌تر" size="sm" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
            <IconButton icon="Trash2" label="حذف" size="sm" onClick={() => onChange(items.filter((x) => key(x) !== key(it)))} />
          </div>
        </div>
      ))}
      <div><Button variant="secondary" size="sm" iconStart="Plus" onClick={() => onChange([...items, add()])}>{addLabel}</Button></div>
    </div>
  );
}

const SpecEditor: React.FC<Props> = ({ onClose, onSaveSpec, planId, nodes, specs, initial, onUpgrade }) => {
  const allowed = PLANS[planId].customSpecs;
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [copyFrom, setCopyFrom] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const specId = React.useRef(initial?.id ?? `spec_custom_${uid()}`).current;

  if (!allowed) {
    return (
      <Dialog open onClose={onClose} size="sm" title="جریان کار سفارشی از پلن Pro" description={`پلن فعلی این فضای کاری ${PLANS[planId].title} است.`}
        footer={<><Button variant="ghost" onClick={onClose}>بستن</Button><Button variant="primary" onClick={() => { onClose(); onUpgrade(); }}>ارتقای پلن</Button></>}>
        <p className="body-md text-text-default">ساخت و ویرایش جریان کار با خروجی‌های وابسته، معیار پذیرش و خط قرمز در پلن‌های Pro و Max فعال است. جریان‌های آماده در همهٔ پلن‌ها در دسترس‌اند.</p>
      </Dialog>
    );
  }

  const nodeOptions = flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }));
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const graph = draft.deliverables.map((d, i) => ({ id: d.id, order: i + 1, dependsOn: d.dependsOn }));
  const titleOf = (id: string) => draft.deliverables.find((d) => d.id === id)?.title.trim() || 'خروجی بدون عنوان';

  const ctxEditor = (key: 'required' | 'suggested' | 'optional', title: string, hint: string) => (
    <Card padding="lg" className="flex flex-col gap-stack-md">
      <div><h4 className="title text-text-default">{title}</h4><p className="caption text-text-subtle">{hint}</p></div>
      <Rows<CtxItem>
        items={draft[key]} onChange={(next) => set({ [key]: next } as Partial<Draft>)} addLabel="افزودن مورد"
        add={() => ({ uid: uid(), key: '', label: '', description: '', nodeId: '' })}
        render={(it, patch) => (
          <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
            <TextField label="نام قلم دانش" value={it.label} onChange={(e) => patch({ label: e.target.value })} />
            <Select label="شاخه" value={it.nodeId} onChange={(e) => patch({ nodeId: e.target.value })} options={nodeOptions} />
            <div className="sm:col-span-2"><TextField label="توضیح (برای پرسش شکاف)" value={it.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          </div>
        )}
      />
    </Card>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const spec = toSpec(draft, specId);
    const issues = validateSpec(spec);
    setErrors(issues.map((i) => i.message));
    if (issues.length) return;
    setSaving(true);
    try { if (await onSaveSpec(spec)) onClose(); } finally { setSaving(false); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={initial ? 'ویرایش جریان کار' : 'جریان کار سفارشی'}
      description="هر جریان کار یک مشخصهٔ داده‌محور است: دانش لازم، خروجی‌های وابسته، معیار پذیرش و خط قرمز. محدودیت‌های تأییدشدهٔ فضای کار خودکار به‌عنوان خط قرمز اعمال می‌شوند."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button variant="primary" type="submit" form="spec-editor-form" loading={saving} iconEnd="ArrowLeft">ذخیره و فعال‌سازی</Button>
        </>
      }
    >
      <form id="spec-editor-form" onSubmit={submit} className="flex flex-col gap-stack-lg">
        {!initial && (
          <Card padding="md" className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
            <div className="sm:flex-1">
              <Select label="کپی از جریان کار موجود" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} options={[{ value: '', label: 'انتخاب کن…' }, ...specs.map((s) => ({ value: s.id, label: s.title }))]} />
            </div>
            <Button variant="secondary" iconStart="Copy" disabled={!copyFrom} onClick={() => { const s = specs.find((x) => x.id === copyFrom); if (s) setDraft(toDraft(s, true)); }}>کپی کن</Button>
          </Card>
        )}

        <Card padding="lg" className="flex flex-col gap-stack-md">
          <h4 className="title text-text-default">مشخصات کلی</h4>
          <TextField label="عنوان جریان کار" required value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="مثلاً: کتابچهٔ برند، پروپوزال پروژه…" />
          <TextField label="هدف" required value={draft.target} onChange={(e) => set({ target: e.target.value })} placeholder="چه نتیجه‌ای ساخته شود؟" />
          <Textarea label="توضیح (اختیاری)" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        </Card>

        {ctxEditor('required', 'دانش لازم', 'بدون این‌ها خروجی قابل‌اعتماد نیست؛ رادار شکاف دنبالشان می‌گردد.')}
        {ctxEditor('suggested', 'دانش پیشنهادی', 'کیفیت را بالا می‌برند.')}
        {ctxEditor('optional', 'دانش اختیاری', 'اگر باشد استفاده می‌شود.')}

        <Card padding="lg" className="flex flex-col gap-stack-md">
          <div><h4 className="title text-text-default">خروجی‌ها و وابستگی‌ها</h4><p className="caption text-text-subtle">ترتیب اجرا از گراف وابستگی می‌آید؛ هر خروجی تا ساخته‌شدن وابستگی‌هایش قفل است.</p></div>
          <Rows<DelItem>
            items={draft.deliverables} onChange={(next) => set({ deliverables: next })} addLabel="افزودن خروجی"
            add={() => ({ id: `del_${uid()}`, title: '', type: 'Asset', description: '', band: 'medium', dependsOn: [], criteria: lines(['']) })}
            render={(it, patch, index) => {
              const others = draft.deliverables.filter((x) => x.id !== it.id);
              return (
                <div className="flex flex-col gap-stack-sm">
                  <span className="label-md text-text-default">خروجی {formatNumber(index + 1)}</span>
                  <TextField label="عنوان خروجی" value={it.title} onChange={(e) => patch({ title: e.target.value })} />
                  <TextField label="توضیح" value={it.description} onChange={(e) => patch({ description: e.target.value })} />
                  <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
                    <Select label="نوع" value={it.type} onChange={(e) => patch({ type: e.target.value as DelItem['type'] })} options={TYPE_OPTIONS} />
                    <Select label="طول خروجی" value={it.band} onChange={(e) => patch({ band: e.target.value as OutputBandId })} options={BAND_OPTIONS} />
                  </div>
                  <fieldset className="flex flex-col gap-stack-xs">
                    <legend className="label-md text-text-default">وابسته به (چندانتخابی)</legend>
                    {others.length === 0 && <span className="caption text-text-subtle">خروجی دیگری برای انتخاب نیست.</span>}
                    {others.map((o) => {
                      const checked = it.dependsOn.includes(o.id);
                      const blocked = !checked && wouldCreateCycle(graph, it.id, o.id);
                      return (
                        <Checkbox
                          key={o.id}
                          label={titleOf(o.id)}
                          checked={checked}
                          disabled={blocked}
                          hint={blocked ? `این انتخاب چرخه می‌سازد («${titleOf(o.id)}» از پیش به «${titleOf(it.id)}» وابسته است).` : undefined}
                          onChange={(e) => patch({ dependsOn: e.target.checked ? [...it.dependsOn, o.id] : it.dependsOn.filter((x) => x !== o.id) })}
                        />
                      );
                    })}
                  </fieldset>
                  <div className="flex flex-col gap-stack-xs">
                    <span className="label-md text-text-default">معیارهای پذیرش</span>
                    <Rows<Line>
                      items={it.criteria} onChange={(next) => patch({ criteria: next })} addLabel="افزودن معیار" add={() => ({ uid: uid(), text: '' })}
                      render={(c, p) => <TextField label="معیار" value={c.text} onChange={(e) => p({ text: e.target.value })} />}
                    />
                  </div>
                </div>
              );
            }}
          />
        </Card>

        <Card padding="lg" className="flex flex-col gap-stack-md">
          <div><h4 className="title text-text-default">خط قرمزها</h4><p className="caption text-text-subtle">قوانینی که هیچ خروجی نباید نقض کند. نقض هر کدام، خروجی را «تأییدنشده» می‌کند.</p></div>
          <Rows<Line> items={draft.guardrails} onChange={(next) => set({ guardrails: next })} addLabel="افزودن خط قرمز" add={() => ({ uid: uid(), text: '' })} empty="خط قرمزی تعریف نشده؛ فقط محدودیت‌های تأییدشدهٔ فضای کار اعمال می‌شوند."
            render={(g, p) => <TextField label="خط قرمز" value={g.text} onChange={(e) => p({ text: e.target.value })} />} />
        </Card>

        {errors.length > 0 && (
          <Alert intent="danger" title="پیش از ذخیره این موارد را اصلاح کن">
            <ul className="list-inside list-disc">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
          </Alert>
        )}
      </form>
    </Dialog>
  );
};
