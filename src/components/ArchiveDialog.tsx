/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ContextObject, GeneratedDeliverable, TreeNode, Workspace } from '../types';
import { dataApi, DataApiError } from '../services/dataApi';
import { Alert, Badge, Button, Dialog, EmptyState, SegmentedControl, Spinner, StatusBadge, TypeBadge, formatJalaliDate, formatNumber, useToast } from '../ui';
import { DangerDialog, PurgeDialog } from './Removal';

type Section = 'knowledge' | 'removals' | 'outputs' | 'workspaces';
interface Props {
  open: boolean;
  workspaceId: string;
  nodes: TreeNode[];
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onClose: () => void;
  /** something came back or went for good: the page reloads its data */
  onChanged: () => void;
  onWorkspacesChange: (list: Workspace[]) => void;
}

/**
 * «بایگانی»: everything that is out of the way, in ONE place, with the same two words everywhere — «برگردان» and «حذف دائمی».
 * Knowledge (archived / replaced), recent removals of sections, archived outputs, archived workspaces.
 */
export const ArchiveDialog: React.FC<Props> = (props) => (props.open ? <Inner {...props} /> : null);

const Inner: React.FC<Props> = ({ workspaceId, nodes, workspaces, currentWorkspaceId, onClose, onChanged, onWorkspacesChange }) => {
  const toast = useToast();
  const [section, setSection] = useState<Section>('knowledge');
  const [data, setData] = useState<Awaited<ReturnType<typeof dataApi.archive>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [purge, setPurge] = useState<ContextObject | null>(null);
  const [deleteWs, setDeleteWs] = useState<Workspace | null>(null);
  const load = useCallback(async () => { try { setData(await dataApi.archive(workspaceId)); setError(null); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? 'بخش حذف‌شده';
  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await fn(); toast.show({ intent: 'success', message: done }); await load(); onChanged(); } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'انجام نشد؛ دوباره تلاش کن.' }); } finally { setBusy(null); }
  };
  const archivedWs = workspaces.filter((w) => w.archivedAt);
  const counts = { knowledge: data?.objects.length ?? 0, removals: data?.removals.length ?? 0, outputs: data?.deliverables.length ?? 0, workspaces: archivedWs.length };
  const label = (k: Section, t: string) => (counts[k] ? `${t} (${counts[k]})` : t);

  const row = (key: string, main: React.ReactNode, sub: React.ReactNode, actions: React.ReactNode) => (
    <li key={key} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
      <span className="flex min-w-space-0 flex-1 flex-col gap-stack-xs"><span className="flex flex-wrap items-center gap-inline-xs">{main}</span><span className="caption text-text-subtle">{sub}</span></span>
      <span className="flex flex-wrap items-center gap-inline-xs">{actions}</span>
    </li>
  );

  return (
    <>
      <Dialog open onClose={onClose} size="lg" title="بایگانی" description="هرچه کنار گذاشته‌ای اینجاست. «برگردان» همه‌چیز را همان‌طور که بود برمی‌گرداند؛ «حذف دائمی» برنمی‌گردد."
        footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
        <div className="flex flex-col gap-stack-md">
          <SegmentedControl label="بخش بایگانی" value={section} onChange={(v) => setSection(v as Section)} items={[
            { id: 'knowledge', label: label('knowledge', 'دانش') }, { id: 'removals', label: label('removals', 'گره‌های حذف‌شده') },
            { id: 'outputs', label: label('outputs', 'خروجی‌ها') }, { id: 'workspaces', label: label('workspaces', 'فضاهای کاری') },
          ]} />
          {error && <Alert intent="danger">{error}</Alert>}
          {!data && !error && <div className="flex justify-center p-inset-xl"><Spinner /></div>}
          {data && section === 'knowledge' && (data.objects.length === 0
            ? <EmptyState icon="Archive" title="بایگانی دانش خالی است" description="دانشی که بایگانی می‌کنی اینجا می‌ماند؛ تاریخچه و منشأش سالم است." />
            : <ul className="flex flex-col gap-stack-xs" aria-label="دانش بایگانی‌شده" data-testid="archive-knowledge">
              {data.objects.map((o) => row(o.id,
                <><span className="body-md text-text-default">{o.title}</span><TypeBadge value={o.type} /><StatusBadge value={o.status} /></>,
                <>{nodeLabel(o.nodeId)} · {formatJalaliDate(o.updatedAt)}</>,
                <>
                  {o.status === 'Archived' && <Button size="sm" variant="secondary" iconStart="Undo2" loading={busy === `r${o.id}`} onClick={() => run(`r${o.id}`, () => dataApi.restoreObject(workspaceId, o.id), `«${o.title}» برگشت.`)}>برگردان</Button>}
                  <Button size="sm" variant="ghost" iconStart="Trash2" aria-label={`حذف دائمی «${o.title}»`} onClick={() => setPurge(o)}>حذف دائمی…</Button>
                </>))}
            </ul>)}
          {data && section === 'removals' && (data.removals.length === 0
            ? <EmptyState icon="Archive" title="حذف تازه‌ای نیست" description="گرهی که حذف یا با شاخه‌اش بایگانی کنی تا وقتی برنگردانی اینجا می‌ماند." />
            : <ul className="flex flex-col gap-stack-xs" aria-label="حذف‌های اخیر">
              {data.removals.map((r) => row(r.id, <span className="body-md text-text-default">{r.label}</span>, formatJalaliDate(r.createdAt),
                <Button size="sm" variant="secondary" iconStart="Undo2" loading={busy === r.id} onClick={() => run(r.id, () => dataApi.undoRemoval(workspaceId, r.id), 'برگشت؛ بخش‌ها و دانش‌شان همان‌طور که بودند.')}>برگردان</Button>))}
            </ul>)}
          {data && section === 'outputs' && (data.deliverables.length === 0
            ? <EmptyState icon="Archive" title="خروجی بایگانی‌شده‌ای نیست" description="خروجی‌ای که بایگانی کنی از فهرست و از شمار «قدیمی» بیرون می‌رود و اینجا می‌ماند." />
            : <ul className="flex flex-col gap-stack-xs" aria-label="خروجی‌های بایگانی‌شده">
              {data.deliverables.map((d: GeneratedDeliverable) => row(d.id, <span className="body-md text-text-default">{d.title}</span>, formatJalaliDate(d.archivedAt ?? d.createdAt),
                <>
                  <Button size="sm" variant="secondary" iconStart="Undo2" loading={busy === d.id} onClick={() => run(d.id, () => dataApi.restoreDeliverable(workspaceId, d.id), `«${d.title}» برگشت.`)}>برگردان</Button>
                  <Button size="sm" variant="ghost" iconStart="Trash2" aria-label={`حذف «${d.title}»`} onClick={() => run(`x${d.id}`, () => dataApi.deleteDeliverable(workspaceId, d.id), `«${d.title}» حذف شد.`)}>حذف</Button>
                </>))}
            </ul>)}
          {section === 'workspaces' && (archivedWs.length === 0
            ? <EmptyState icon="Archive" title="فضای کاری بایگانی‌شده‌ای نیست" description="فضای کاری‌ای که بایگانی کنی از منو بیرون می‌رود و همهٔ داده‌اش می‌ماند." />
            : <ul className="flex flex-col gap-stack-xs" aria-label="فضاهای کاری بایگانی‌شده">
              {archivedWs.map((w) => row(w.id, <><span className="body-md text-text-default">{w.name}</span>{w.isDemo && <Badge intent="neutral" icon={false}>نمونه</Badge>}</>, w.archivedAt ? formatJalaliDate(w.archivedAt) : '',
                <>
                  <Button size="sm" variant="secondary" iconStart="Undo2" loading={busy === w.id} onClick={() => run(w.id, async () => { onWorkspacesChange((await dataApi.archiveWorkspace(w.id, false)).workspaces); }, `«${w.name}» برگشت.`)}>برگردان</Button>
                  <Button size="sm" variant="ghost" iconStart="Trash2" aria-label={`حذف دائمی فضای «${w.name}»`} onClick={() => setDeleteWs(w)}>حذف دائمی…</Button>
                </>))}
            </ul>)}
        </div>
      </Dialog>
      <PurgeDialog workspaceId={workspaceId} object={purge} onClose={() => setPurge(null)} onDone={(r) => { setPurge(null); toast.show({ intent: 'success', message: `برای همیشه حذف شد${r.scrubbed.thoughts ? `؛ ${formatNumber(r.scrubbed.thoughts)} فکر هم پاک شد` : ''}.` }); void load(); onChanged(); }} />
      <DangerDialog
        open={!!deleteWs} onClose={() => setDeleteWs(null)} title={`حذف دائمی «${deleteWs?.name ?? ''}»`}
        description="همهٔ دانش، یادداشت‌ها، خروجی‌ها، فایل‌ها و تاریخچهٔ این فضای کاری برای همیشه پاک می‌شود."
        confirmLabel="حذف دائمی فضای کاری" typed={deleteWs && !deleteWs.isDemo ? { phrase: deleteWs.name, label: 'نام فضای کاری' } : undefined} ack="می‌فهمم که این کار برنمی‌گردد"
        onConfirm={async () => { if (!deleteWs) return; try { const r = await dataApi.deleteWorkspace(deleteWs.id, deleteWs.name); onWorkspacesChange(r.workspaces); setDeleteWs(null); toast.show({ intent: 'success', message: `«${deleteWs.name}» برای همیشه حذف شد.` }); } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'حذف نشد؛ دوباره تلاش کن.' }); } }}
      />
    </>
  );
};
