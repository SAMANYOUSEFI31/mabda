/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Nothing left (a fresh install after «حذف همهٔ داده‌ها», or every workspace archived / deleted): an honest empty start, not an error. */

import { useState } from 'react';
import { dataApi } from '../../services/dataApi';
import { NAME_EXAMPLE, PurposeField } from '../../components/workspace/PurposeField';
import type { WorkspacePurpose } from '../../core/specs';
import { BrandMark, Button, EmptyState, TextField } from '../../ui';
import type { AppScope } from '../shared';

export type FirstRunScreenProps = Pick<AppScope, 'attempt' | 'data' | 'handleCreateWorkspace' | 'newWsName' | 'setCurrentWorkspaceId' | 'setNewWsName' | 'setWs' | 'workspaces'>;

export function FirstRunScreen({ attempt, data, handleCreateWorkspace, newWsName, setCurrentWorkspaceId, setNewWsName, setWs, workspaces }: FirstRunScreenProps) {
  const archived = workspaces.filter((w) => w.archivedAt);
  const [nameError, setNameError] = useState('');
  const [purpose, setPurpose] = useState<WorkspacePurpose>('personal');
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg" data-testid="first-run">
      <div className="flex w-full max-w-overlay-xs flex-col gap-stack-lg text-center">
        <BrandMark size="lg" word className="self-center" />
        <EmptyState title="هنوز فضایی نداری" description="یک فضا بساز تا آنچه درباره‌اش می‌دانی جایی بنشیند. هرچه کنار گذاشته بودی هم در بایگانی مانده است." />
        <form noValidate onSubmit={(e) => { if (!newWsName.trim()) { e.preventDefault(); setNameError('نام فضا را بنویس تا ساخته شود.'); document.getElementById('first-workspace-name')?.focus(); return; } void handleCreateWorkspace(e); }} className="flex flex-col gap-stack-sm text-start">
          <PurposeField onChange={setPurpose} />
          <TextField id="first-workspace-name" label="نام فضا" required placeholder={NAME_EXAMPLE[purpose]} value={newWsName} error={nameError || undefined} onChange={(e) => { setNewWsName(e.target.value); if (nameError && e.target.value.trim()) setNameError(''); }} />
          <Button variant="primary" type="submit">افزودن فضا</Button>
        </form>
        {archived.length > 0 && (
          <div className="flex flex-col gap-stack-xs text-start" aria-label="فضاهای بایگانی‌شده">
            <span className="label-md text-text-default">بایگانی‌شده‌ها</span>
            {archived.map((w) => <div key={w.id} className="flex items-center justify-between gap-inline-sm"><span className="body-md">{w.name}</span><Button size="sm" variant="secondary" iconStart="Undo2" onClick={() => { void attempt(() => dataApi.archiveWorkspace(w.id, false)).then((r) => { if (r) { setWs(r.workspaces); setCurrentWorkspaceId(w.id); } }); }}>برگردان</Button></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
