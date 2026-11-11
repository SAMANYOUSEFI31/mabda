/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of workspace: plans, account, usage, the demo workspace, a new workspace. Each lazy dialog loads the first time it is opened. */

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
  return (
    <>
    <DangerDialog open={demoDelete} onClose={() => setDemoDelete(false)} title="پاک کردن فضای نمونه؟" description="همهٔ داده‌های فضای نمونه (دانش، یادداشت، خروجی، تاریخچه) پاک می‌شود. این داده‌ها ساختگی‌اند و فضاهای دیگرت دست نمی‌خورند؛ هر وقت خواستی دوباره ساخته می‌شود." confirmLabel="پاک کن" onConfirm={handleDeleteDemo} />
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
      onClose={() => setIsNewWorkspaceModalOpen(false)}
      size="sm"
      title="ایجاد فضای کاری جدید"
      description="هر فضای کاری داده‌های منبع حقیقت، دارایی‌ها و تاریخچهٔ جداگانه‌ای دارد."
      footer={
        <>
          <Button variant="ghost" onClick={() => setIsNewWorkspaceModalOpen(false)}>انصراف</Button>
          <Button variant="primary" type="submit" form="new-workspace-form">ایجاد فضای کاری</Button>
        </>
      }
    >
      <form id="new-workspace-form" onSubmit={handleCreateWorkspace}>
        <TextField
          label="نام فضای کاری یا نام برند"
          required
          placeholder="مثلاً: استودیو دیزاین نوین"
          value={newWsName}
          onChange={(e) => setNewWsName(e.target.value)}
        />
      </form>
    </Dialog>
    </>
  );
}
