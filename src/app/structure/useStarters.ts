/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextDraft, ContextObject } from '../../types';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import { resolveNodeId } from '../../core/nodeTree';
import type { AppCoreScope } from '../shell/useAppCore';

export type StartersScope = ReturnType<typeof useStarters>;

export function useStarters(p: AppCoreScope) {
  const { attempt, nodes, patch, setTemplateDraft, templateDraft, toast, wid } = p;
  // ── examples (starters / templates) ──
  const handleApplyStarter = async (starterId: string) => {
    const r = await attempt(() => dataApi.applyStarter(wid, starterId));
    if (!r) return;
    patch((d) => ({ ...d, samples: r.samples, ...(r.nodes ? { nodes: r.nodes } : {}) }));
    toast.show({ intent: 'success', message: r.added ? `${formatNumber(r.added)} نمونهٔ خاکستری اضافه شد؛ به AI نمی‌رسند.` : 'این نمونه‌ها قبلاً اضافه شده‌اند.' });
  };
  const handleDeleteSamples = async (nodeIds?: string[]) => {
    const r = await attempt(() => dataApi.deleteSamples(wid, nodeIds));
    if (r) patch((d) => ({ ...d, samples: r.samples }));
  };
  const handleSaveTemplate = async () => {
    if (!templateDraft?.name.trim()) return;
    const r = await attempt(() => dataApi.saveTemplate(wid, { ...templateDraft, name: templateDraft.name.trim() }));
    if (r) { toast.show({ intent: 'success', message: 'قالب ذخیره شد؛ در «کتابخانهٔ جریان‌ها › قالب‌های من» می‌توانی در هر فضایی بیاوری.' }); setTemplateDraft(null); }
  };
  const handleApplyTemplate = async (templateId: string, parentId?: string) => {
    const r = await attempt(() => dataApi.applyTemplate(wid, templateId, parentId));
    if (!r) return;
    if (r.nodes) patch((d) => ({ ...d, nodes: r.nodes!, samples: r.samples ?? d.samples }));
    if (r.spec) { patch((d) => ({ ...d, specs: [r.spec!, ...d.specs] })); }
    toast.show({ intent: 'success', message: r.spec ? 'جریان کار به این فضا آمد.' : `بخش‌ها آمدند و ${formatNumber(r.added ?? 0)} نمونهٔ خاکستری اضافه شد.` });
  };

  const handleCreateObjects = async (drafts: ContextDraft[]): Promise<ContextObject[]> => {
    const out: ContextObject[] = [];
    for (const dr of drafts) {
      const r = await dataApi.createObject(wid, { type: dr.type, status: dr.status, provenance: dr.provenance, title: dr.title, content: dr.content, nodeId: resolveNodeId(nodes, dr.nodeId) });
      out.push(r.object);
    }
    patch((d) => ({ ...d, objects: [...out.slice().reverse(), ...d.objects] }));
    return out;
  };
  return { handleApplyStarter, handleDeleteSamples, handleSaveTemplate, handleApplyTemplate, handleCreateObjects };
}
