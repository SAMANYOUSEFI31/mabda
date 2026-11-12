/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of workspace: plans, account, usage, the demo workspace, a new workspace. Each lazy dialog loads the first time it is opened. */

import { useState } from 'react';
import { NAME_EXAMPLE, PurposeField } from '../../components/workspace/PurposeField';
import type { WorkspacePurpose } from '../../core/specs';
import { DangerDialog } from '../../components/shared/Removal';
import { Button, Dialog, TextField } from '../../ui';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const AccountModal = lazyNamed(() => import('../../components/workspace/AccountModal'), 'AccountModal');
const PlanSelectionModal = lazyNamed(() => import('../../components/workspace/PlanSelectionModal'), 'PlanSelectionModal');
const UsageDialog = lazyNamed(() => import('../../components/workspace/UsageDialog'), 'UsageDialog');

export type WorkspaceDialogsProps = Pick<ReadyScope, 'currentWorkspace' | 'demoBusy' | 'demoConfirm' | 'demoDelete' | 'handleArchiveWorkspace' | 'handleChangePlan' | 'handleCreateWorkspace' | 'handleDeleteDemo' | 'handleDeleteEverything' | 'handleDeleteWorkspace' | 'handleExportAllData' | 'handleResetDemo' | 'isAccountModalOpen' | 'isNewWorkspaceModalOpen' | 'isPlanModalOpen' | 'newWsName' | 'setArchiveOpen' | 'setDemoConfirm' | 'setDemoDelete' | 'setIsAccountModalOpen' | 'setIsNewWorkspaceModalOpen' | 'setIsPlanModalOpen' | 'setNewWsName' | 'setUsageOpen' | 'usageOpen'>;

export function WorkspaceDialogs({ currentWorkspace, demoBusy, demoConfirm, demoDelete, handleArchiveWorkspace, handleChangePlan, handleCreateWorkspace, handleDeleteDemo, handleDeleteEverything, handleDeleteWorkspace, handleExportAllData, handleResetDemo, isAccountModalOpen, isNewWorkspaceModalOpen, isPlanModalOpen, newWsName, setArchiveOpen, setDemoConfirm, setDemoDelete, setIsAccountModalOpen, setIsNewWorkspaceModalOpen, setIsPlanModalOpen, setNewWsName, setUsageOpen, usageOpen }: WorkspaceDialogsProps) {
  const [nameError, setNameError] = useState('');
  const [purpose, setPurpose] = useState<WorkspacePurpose>('personal');
  return (
    <>
    <DangerDialog open={demoDelete} onClose={() => setDemoDelete(false)} title="فضای نمونه حذف شود؟" description="همهٔ داده‌های فضای نمونه (دانش، یادداشت، خروجی، تاریخچه) پاک می‌شود. این داده‌ها ساختگی‌اند و فضاهای دیگرت دست نمی‌خورند؛ هر وقت خواستی دوباره ساخته می‌شود." confirmLabel="حذف فضای نمونه" onConfirm={handleDeleteDemo} />
    {/* Plan Selection Modal (Starter / Pro / Max - F6) */}
    <Deferred when={isPlanModalOpen}><PlanSelectionModal
      isOpen={isPlanModalOpen}
      onClose={() => setIsPlanModalOpen(false)}
      currentWorkspace={currentWorkspace}
      onSelectPlan={(pid) => {
        handleChangePlan(pid);
        setIsPlanModalOpen(false);
      }}
    /></Deferred>
    {/* Account Modal (F1 - Mobile OTP, JSON Data Export, 30-day Deletion) */}
    <Deferred when={isAccountModalOpen}><AccountModal
      isOpen={isAccountModalOpen}
      onClose={() => setIsAccountModalOpen(false)}
      currentWorkspace={currentWorkspace}
      onExportAllData={handleExportAllData}
      onOpenArchive={() => setArchiveOpen(true)}
      onArchiveWorkspace={handleArchiveWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
      onDeleteEverything={handleDeleteEverything}
    /></Deferred>
    <Deferred when={usageOpen}><UsageDialog open={usageOpen} onClose={() => setUsageOpen(false)} /></Deferred>
    <Dialog
      open={demoConfirm}
      onClose={() => setDemoConfirm(false)}
      size="sm"
      title="بازنشانی فضای نمونه؟"
      footer={<><Button variant="ghost" onClick={() => setDemoConfirm(false)}>انصراف</Button><Button variant="primary" loading={demoBusy} onClick={handleResetDemo}>بازنشانی</Button></>}
    >
      <p className="body-md text-text-default">همهٔ داده‌های «فضای نمونه» (دانش، یادداشت، دارایی، تاریخچه) پاک و از نو ساخته می‌شود. فضاهای دیگرت دست نمی‌خورند.</p>
    </Dialog>
    {/* New workspace dialog */}
    <Dialog
      open={isNewWorkspaceModalOpen}
      onClose={() => { setIsNewWorkspaceModalOpen(false); setNameError(''); }}
      size="sm"
      title="فضای تازه"
      description="هر فضا دانش، خروجی‌ها و تاریخچهٔ جدای خودش را دارد."
      footer={
        <>
          <Button variant="ghost" onClick={() => setIsNewWorkspaceModalOpen(false)}>انصراف</Button>
          <Button variant="primary" type="submit" form="new-workspace-form">افزودن فضا</Button>
        </>
      }
    >
      <form id="new-workspace-form" noValidate onSubmit={(e) => { if (!newWsName.trim()) { e.preventDefault(); setNameError('نام فضا را بنویس تا ساخته شود.'); document.getElementById('new-workspace-name')?.focus(); return; } void handleCreateWorkspace(e); }}>
        <div className="flex flex-col gap-stack-md">
        <PurposeField onChange={setPurpose} />
        <TextField
          label="نام فضا"
          id="new-workspace-name"
          required
          placeholder={NAME_EXAMPLE[purpose]}
          value={newWsName}
          error={nameError || undefined}
          onChange={(e) => { setNewWsName(e.target.value); if (nameError && e.target.value.trim()) setNameError(''); }}
        />
        </div>
      </form>
    </Dialog>
    </>
  );
}
