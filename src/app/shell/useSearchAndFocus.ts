/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { dialogOpen } from '../../core/addRequest';
import React, { useEffect, useMemo, useState } from 'react';
import type { CompareMode } from '../../components/knowledge/TruthCompareDialog';
import { buildInheritNotices } from '../../core/inheritNotice';
import { buildSearchIndex } from '../../core/globalSearch';
import { buildWeeklyReview, reviewDue } from '../../core/weeklyReview';
import { flipFlops, needsReview, planDecisions, waitingDecisions } from '../../core/decisionGraph';
import { orderWaitingByStructure } from '../../core/decisionOrder';
import { pathTo } from '../../core/nodeFocus';
import { subtreeIds } from '../../core/nodeTree';
import type { AppCoreScope } from './useAppCore';

export type SearchAndFocusScope = ReturnType<typeof useSearchAndFocus>;

export function useSearchAndFocus(p: AppCoreScope) {
  const { data, nodes, setSpaceNode, workspaceContexts } = p;
  // ── global search (Ctrl/⌘+K): the index is built once per data change; notes are for DISPLAY here, never for an AI ──
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [homeAllOpen, setHomeAllOpen] = useState(false);
  const [canvasReveal, setCanvasReveal] = useState<{ id: string; n: number } | null>(null);
  const [savedPackCount, setSavedPackCount] = useState(0);
  const [focusNotes, setFocusNotes] = useState<{ nodeId: string; n: number } | null>(null);
  const [focusAsset, setFocusAsset] = useState<{ id: string; n: number } | null>(null);
  const searchIdx = useMemo(() => buildSearchIndex({ nodes, objects: workspaceContexts, deliverables: (data?.deliverables ?? []).filter((d) => !d.archivedAt), notes: data?.notes ?? [], thoughts: data?.thoughts ?? [], files: data?.files ?? [] }), [nodes, workspaceContexts, data?.deliverables, data?.notes, data?.thoughts, data?.files]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      // «/» opens search when no field is being typed in (navigation.md «میان‌برها»; the physical key, so a Persian layout works too)
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.code === 'Slash' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !typing && !dialogOpen()) { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  /** scroll to an element that appears after a tab / view change (it may take a moment to mount) */
  // «واردِ یک بخش شدن»: the focused section lives in history (#node=…), so the browser / phone back button, a direct link and reload all work
  const nodeFromUrl = () => { try { const m = /#node=([^&]+)/.exec(window.location.hash); return m ? decodeURIComponent(m[1]) : null; } catch { return null; } };
  const [focusNodeId, setFocusNodeId] = useState<string | null>(nodeFromUrl);
  const urlOf = (id: string | null) => (id ? `#node=${encodeURIComponent(id)}` : window.location.pathname + window.location.search);
  /** every state remembers where it came FROM, so «برگشت» (the arrow, the phone's back, the browser's back) climbs one level instead of leaving */
  const pushFocus = (id: string | null, prev: string | null) => { try { window.history.pushState({ node: id, prev }, '', urlOf(id)); } catch { /* optional */ } };
  const goFocus = (id: string | null) => {
    const cur = focusNodeId;
    if (id === cur) return;
    const st = window.history.state as { node?: string | null; prev?: string | null } | null;
    // «برگشت» to the place we just came from IS the browser's back (so the history stays a clean path, no loop)
    if (st && st.node === cur && (st.prev ?? null) === id) { try { window.history.back(); return; } catch { /* fall through */ } }
    setFocusNodeId(id);
    if (!id) pushFocus(null, cur);
    else if ((nodes.find((n) => n.id === id)?.parentId ?? null) === (cur ?? null)) pushFocus(id, cur); // one level in
    else {
      // a jump (search, a link, a far breadcrumb): the levels in between go into the history, so back climbs one level at a time
      const path = pathTo(nodes, id).map((c) => c.id);
      let prev: string | null = cur && path.includes(cur) ? cur : null;
      for (const step of path.slice(prev ? path.indexOf(prev) + 1 : 0)) { pushFocus(step, prev); prev = step; }
    }
    window.scrollTo({ top: 0 });
  };
  // a direct link to a deep section: rebuild the path under it once the tree is known, so «back» climbs instead of leaving the app
  const climbedRef = React.useRef(false);
  useEffect(() => {
    if (climbedRef.current || !nodes.length || !focusNodeId) return;
    const path = pathTo(nodes, focusNodeId).map((c) => c.id);
    if (!path.length) return; // the section is not in this workspace's tree (yet): wait
    climbedRef.current = true;
    if (path.length < 2) return;
    try { window.history.replaceState({ node: null, prev: null }, '', window.location.pathname + window.location.search); } catch { return; }
    let prev: string | null = null;
    for (const step of path) { pushFocus(step, prev); prev = step; }
  }, [nodes, focusNodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => setFocusNodeId(nodeFromUrl()); window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  // while we are INSIDE a section, the thinking space and the canvases show only that section and what is under it (one tap on the chip shows all again)
  const focusSection = focusNodeId ? nodes.find((n) => n.id === focusNodeId) : undefined;
  const focusScope = useMemo(() => (focusSection ? new Set(subtreeIds(nodes, focusSection.id)) : null), [focusSection, nodes]);
  const [spaceNodeSeen, setSpaceNodeSeen] = useState<string | null>(null);
  useEffect(() => { if (focusNodeId !== spaceNodeSeen) { setSpaceNodeSeen(focusNodeId); setSpaceNode(focusNodeId ?? undefined); } }, [focusNodeId, spaceNodeSeen]);
  const revealWhenThere = (id: string) => { let tries = 0; const t = setInterval(() => { const el = document.getElementById(id); if (el || ++tries > 20) { clearInterval(t); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); } }, 60); };
  const deliverables = (data?.deliverables ?? []).filter((d) => !d.archivedAt); // archived outputs are out of every list and count (the archive shows them)
  const ledgerEntries = data?.ledger ?? [];
  const stale = data?.stale ?? [];
  // derived, never stored: dependents whose dependency changed after they were last written or reviewed
  const reviewNeeds = useMemo(() => needsReview(data?.objects ?? [], data?.relationships ?? [], data?.changes ?? []), [data?.objects, data?.relationships, data?.changes]);
  const reviewIdSet = useMemo(() => new Set(reviewNeeds.keys()), [reviewNeeds]);
  const staleIdSet = useMemo(() => new Set((data?.stale ?? []).map((s) => s.deliverableId)), [data?.stale]);
  // the order of waiting decisions: dependencies first (decisionGraph), then — only among equals — the upper section's item before its sub-sections'
  const waitingOrdered = useMemo(() => {
    const objs = data?.objects ?? [];
    const plan = planDecisions(objs, data?.relationships ?? []);
    const o = orderWaitingByStructure(waitingDecisions(plan), plan, objs, nodes);
    return { waiting: o.waiting, structure: Object.fromEntries([...o.below].map(([id, b]) => [id, b.length])) as Record<string, number> };
  }, [data?.objects, data?.relationships, nodes]);
  const waiting = waitingOrdered.waiting;
  // «دیدم» for the calm inheritance news is remembered on this device only
  const [inheritSeen, setInheritSeen] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mabda.inherit.seen') ?? '[]') as string[]; } catch { return []; } });
  const markInheritSeen = (key: string) => setInheritSeen((cur) => { const next = [...cur, key].slice(-200); try { localStorage.setItem('mabda.inherit.seen', JSON.stringify(next)); } catch { /* optional */ } return next; });
  const inheritNotices = useMemo(() => buildInheritNotices({ changes: data?.changes ?? [], objects: data?.objects ?? [], nodes, relationships: data?.relationships ?? [], seen: inheritSeen }), [data?.changes, data?.objects, data?.relationships, nodes, inheritSeen]);
  const flips = useMemo(() => flipFlops(data?.objects ?? [], data?.changes ?? []), [data?.objects, data?.changes]);
  const weekly = useMemo(() => buildWeeklyReview({ objects: data?.objects ?? [], relationships: data?.relationships ?? [], changes: data?.changes ?? [], deliverables: data?.deliverables ?? [], nodes }), [data?.objects, data?.relationships, data?.changes, data?.deliverables, nodes]);
  const weeklyDue = reviewDue(data?.weeklyReviewAt, weekly);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [compare, setCompare] = useState<{ mode: CompareMode; scopeNodeId?: string } | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
  return { paletteOpen, setPaletteOpen, usageOpen, setUsageOpen, homeAllOpen, setHomeAllOpen, canvasReveal, setCanvasReveal, savedPackCount, setSavedPackCount, focusNotes, setFocusNotes, focusAsset, setFocusAsset, searchIdx, focusNodeId, goFocus, focusSection, focusScope, revealWhenThere, deliverables, ledgerEntries, stale, reviewNeeds, reviewIdSet, staleIdSet, waitingOrdered, waiting, markInheritSeen, inheritNotices, flips, weekly, weeklyDue, weeklyOpen, setWeeklyOpen, compare, setCompare, metricsOpen, setMetricsOpen };
}
