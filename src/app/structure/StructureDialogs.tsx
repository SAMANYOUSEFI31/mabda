/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of structure: section dialogs, quick start, starters, save-as-template. Each lazy dialog loads the first time it is opened. */

import { ledgerEntryFromUsage } from '../../core/ledger';
import { dataApi } from '../../services/dataApi';
import { Button, Dialog, TextField } from '../../ui';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const NodeDialogs = lazyNamed(() => import('../../components/structure/NodeDialogs'), 'NodeDialogs');
const QuickStartDialog = lazyNamed(() => import('../../components/structure/QuickStartDialog'), 'QuickStartDialog');
const StarterDialog = lazyNamed(() => import('../../components/structure/StarterDialog'), 'StarterDialog');

export type StructureDialogsProps = Pick<ReadyScope, 'attempt' | 'data' | 'ensureLibrarySpec' | 'handleApplyStarter' | 'handleCreateObjects' | 'handleDeleteSamples' | 'handleSaveProposals' | 'handleSaveTemplate' | 'handleThoughtSectioned' | 'isOnboardingOpen' | 'isStarterOpen' | 'nodeDialog' | 'nodeOp' | 'nodes' | 'openThinkingSpace' | 'patch' | 'persistDeliverable' | 'persistLedger' | 'reload' | 'revealWhenThere' | 'setActiveTab' | 'setContextViewMode' | 'setIsOnboardingOpen' | 'setIsStarterOpen' | 'setLedger' | 'setNodeDialog' | 'setStatus' | 'setTemplateDraft' | 'stale' | 'templateDraft' | 'toast' | 'wid' | 'workspaceContexts'>;

export function StructureDialogs({ attempt, data, ensureLibrarySpec, handleApplyStarter, handleCreateObjects, handleDeleteSamples, handleSaveProposals, handleSaveTemplate, handleThoughtSectioned, isOnboardingOpen, isStarterOpen, nodeDialog, nodeOp, nodes, openThinkingSpace, patch, persistDeliverable, persistLedger, reload, revealWhenThere, setActiveTab, setContextViewMode, setIsOnboardingOpen, setIsStarterOpen, setLedger, setNodeDialog, setStatus, setTemplateDraft, stale, templateDraft, toast, wid, workspaceContexts }: StructureDialogsProps) {
  return (
    <>
    <Deferred when={!!nodeDialog}><NodeDialogs
      state={nodeDialog}
      nodes={nodes}
      objects={workspaceContexts}
      notes={data.notes}
      thoughts={data.thoughts}
      files={data.files}
      onClose={() => setNodeDialog(null)}
      workspaceId={wid}
      onCreate={async (parentId, label, description) => {
        const r = await attempt(() => dataApi.createNode(wid, { parentId, label, description }));
        if (!r) throw new Error('create failed');
        patch((d) => ({ ...d, nodes: r.nodes }));
        return r.node.id;
      }}
      onOpenCoach={(nodeId) => setNodeDialog({ kind: 'coach', nodeId })}
      onSaveProposals={handleSaveProposals}
      onLedger={setLedger}
      onRename={(nodeId, label, description) => nodeOp(() => dataApi.renameNode(wid, nodeId, { label, description }))}
      relationships={data.relationships}
      onMove={(nodeId, parentId, reason) => nodeOp(() => dataApi.moveNode(wid, nodeId, parentId, undefined, reason))}
      onDelete={async (nodeId, transferTo, mode) => {
        const r = await attempt(() => dataApi.deleteNode(wid, nodeId, transferTo, mode));
        if (!r) throw new Error('node delete failed');
        patch((d) => ({ ...d, nodes: r.nodes, objects: r.objects, notes: r.notes, thoughts: r.thoughts, files: r.files, stale: r.stale }));
        void reload(wid);
        toast.show({ intent: 'success', message: `${r.removal.label}.`, duration: 12000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.undoRemoval(wid, r.removal.id)).then((u) => { if (u) { patch((d) => ({ ...d, nodes: u.nodes, objects: u.objects, notes: u.notes, thoughts: u.thoughts, files: u.files, samples: u.samples, changes: u.changes, stale: u.stale })); toast.show({ intent: 'success', message: 'برگشت؛ همه‌چیز همان‌طور که بود.' }); } }); } } });
      }}
      onThoughtSectioned={handleThoughtSectioned}
    /></Deferred>
    <Deferred when={isOnboardingOpen}><QuickStartDialog
      open={isOnboardingOpen}
      onClose={() => setIsOnboardingOpen(false)}
      workspaceId={wid}
      onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
      onCreateObjects={(items) => { ensureLibrarySpec('main_positioning'); return handleCreateObjects(items); }}
      onConfirmMany={async (ids) => { for (const id of ids) await setStatus(id, 'Confirmed'); }}
      nodes={nodes}
      onGoToNode={(nodeId) => { setActiveTab('context'); setContextViewMode('doc'); revealWhenThere(`node-${nodeId}`); }}
      onOpenThinking={() => openThinkingSpace()}
      onSampleDone={(firstDeliverable) => {
        ensureLibrarySpec('main_positioning');
        void (async () => {
          if (!(await persistDeliverable(firstDeliverable))) return;
          if (firstDeliverable.usage) {
            await persistLedger(ledgerEntryFromUsage({ workspaceId: wid, action: 'خروجی نمونهٔ شروع سریع', mode: 'auto', creditCost: 0, usage: firstDeliverable.usage, plan: firstDeliverable.plan, id: `led_onb_${Date.now()}` }));
          }
        })();
      }}
    /></Deferred>
    <Deferred when={isStarterOpen}><StarterDialog open={isStarterOpen} samplesCount={data?.samples?.length ?? 0} onClose={() => setIsStarterOpen(false)} onApply={handleApplyStarter} onRemoveAll={() => handleDeleteSamples()} /></Deferred>
    <Dialog
      open={!!templateDraft}
      onClose={() => setTemplateDraft(null)}
      size="sm"
      title="ذخیره به‌عنوان قالب"
      footer={<><Button variant="ghost" onClick={() => setTemplateDraft(null)}>انصراف</Button><Button variant="primary" disabled={!templateDraft?.name.trim()} onClick={handleSaveTemplate}>ذخیرهٔ قالب</Button></>}
    >
      <div className="flex flex-col gap-stack-sm">
        <TextField label="نام قالب" value={templateDraft?.name ?? ''} onChange={(e) => setTemplateDraft((d) => (d ? { ...d, name: e.target.value } : d))} />
        <p className="body-sm text-text-subtle">{templateDraft?.kind === 'node' ? 'گره، زیرگره‌ها و دانش تأییدشدهٔ داخلش ذخیره می‌شود؛ هر جا بیاوری، دانش‌ها «نمونهٔ خاکستری» می‌شوند.' : 'خودِ جریان کار (هدف، موارد لازم و خروجی‌ها) ذخیره می‌شود.'}</p>
      </div>
    </Dialog>
    </>
  );
}
