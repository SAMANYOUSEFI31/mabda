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
import { useSession } from './SessionGate';

export type FirstRunScreenProps = Pick<AppScope, 'attempt' | 'data' | 'handleCreateWorkspace' | 'newWsName' | 'setCurrentWorkspaceId' | 'setNewWsName' | 'setWs' | 'workspaces'>;

export function FirstRunScreen({ attempt, data, handleCreateWorkspace, newWsName, setCurrentWorkspaceId, setNewWsName, setWs, workspaces, onOpenSample }: FirstRunScreenProps & { /** the marked sample beside it: look at it first, for this visit */ onOpenSample?: () => void }) {
  const archived = workspaces.filter((w) => w.archivedAt);
  const [nameError, setNameError] = useState('');
  const [purpose, setPurpose] = useState<WorkspacePurpose>('personal');
  // an invited person who has no space yet has no account menu: the way out is here (a wrong link, a shared device)
  const { session, signOut } = useSession();
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg" data-testid="first-run">
      {/* the same form as «فضای تازه…», at the same width (its dialog is `sm`): `overlay-xs` (240px) is a tooltip's width and left the
          form narrower than a phone. One column, one edge: the mark, the text and the form all start at the start, as the empty
          state and every form do (identity: the mark heads the page like a letterhead) */}
      <div className="flex w-full max-w-overlay-sm flex-col gap-stack-lg">
        <BrandMark size="lg" word className="self-start" />
        {/* a first visit and a space emptied later read differently: only the second has an archive to point at (§۴۸) */}
        {archived.length > 0
          ? <EmptyState title="هنوز فضایی نداری" description="یک فضا بساز تا آنچه درباره‌اش می‌دانی جایی بنشیند. هرچه کنار گذاشته بودی هم در بایگانی مانده است." />
          : <EmptyState title="فضای خودت را بساز" description="هرچه این‌جا بنویسی فقط مال خودت است. بخش‌های اصلی آماده و خالی می‌آیند تا خودت پرشان کنی." />}
        <form noValidate onSubmit={(e) => { if (!newWsName.trim()) { e.preventDefault(); setNameError('نام فضا را بنویس تا ساخته شود.'); document.getElementById('first-workspace-name')?.focus(); return; } void handleCreateWorkspace(e); }} className="flex flex-col gap-stack-sm">
          <PurposeField onChange={setPurpose} entry />
          <TextField id="first-workspace-name" label="نام فضا" required placeholder={NAME_EXAMPLE[purpose]} value={newWsName} error={nameError || undefined} onChange={(e) => { setNewWsName(e.target.value); if (nameError && e.target.value.trim()) setNameError(''); }} />
          <Button variant="primary" type="submit">افزودن فضا</Button>
        </form>
        {onOpenSample && (
          <div className="flex flex-col items-start gap-stack-xs">
            <p className="body-sm text-text-subtle">می‌خواهی اول ببینی یک فضای پر چه شکلی است؟</p>
            <Button size="sm" variant="ghost" onClick={onOpenSample}>دیدن فضای نمونه</Button>
          </div>
        )}
        {archived.length > 0 && (
          <div className="flex flex-col gap-stack-xs text-start" aria-label="فضاهای بایگانی‌شده">
            <span className="label-md text-text-default">بایگانی‌شده‌ها</span>
            {archived.map((w) => <div key={w.id} className="flex items-center justify-between gap-inline-sm"><span className="body-md">{w.name}</span><Button size="sm" variant="secondary" iconStart="Undo2" onClick={() => { void attempt(() => dataApi.archiveWorkspace(w.id, false)).then((r) => { if (r) { setWs(r.workspaces); setCurrentWorkspaceId(w.id); } }); }}>برگردان</Button></div>)}
          </div>
        )}
        {session?.mode === 'invite' && <div><Button size="sm" variant="ghost" iconStart="LogOut" onClick={() => void signOut()}>خروج از این دستگاه</Button></div>}
      </div>
    </div>
  );
}
