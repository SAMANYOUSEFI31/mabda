/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { contextDoc, docTabs, tabOfAnchor } from '../core/contextMarkdown';
import { Tabs } from '../ui';
import { DocReader } from './DocReader';

const REFS_KEY = 'mabda.doc.refs';
const readRefs = () => { try { return localStorage.getItem(REFS_KEY) === '1'; } catch { return false; } };

interface Props {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  /** the last approval of each object: «آخرین تأیید: نسخهٔ N» in its meta line when it is not the current version */
  approvals: Record<string, { version: number }>;
  fileName: string;
  empty?: React.ReactNode;
}

/**
 * The document view, the way a long document is read: the first-level sections are tabs; each tab has an outline of its own
 * headings that shows where you are (scroll-spy) and links every section by a stable address (#o-<object id>). The Markdown
 * stays linear — «با ارجاع‌ها» only adds flat «وابسته به» / «برگرفته از» lines.
 */
export const DocWorkspace: React.FC<Props> = ({ nodes, objects, relationships, approvals, fileName, empty }) => {
  const tabs = useMemo(() => docTabs(nodes, objects), [nodes, objects]);
  const fromHash = () => { const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''; return h ? tabOfAnchor(h, tabs, nodes, objects)?.id : undefined; };
  const [tabId, setTabId] = useState<string | undefined>(() => fromHash() ?? tabs[0]?.id);
  const [refs, setRefs] = useState(readRefs);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];

  // an address with #o-… / #n-… opens its tab (also when the address changes while the view is open)
  useEffect(() => {
    const on = () => { const id = fromHash(); if (id) setTabId(id); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, nodes, objects]);

  const doc = useMemo(
    () => (tab ? contextDoc({ nodes, objects, nodeId: tab.nodeId, ownOnly: tab.own, refs, relationships, approvals }) : { markdown: '', outline: [] }),
    [tab, nodes, objects, refs, relationships, approvals],
  );
  if (!tab) return <>{empty}</>;

  return (
    <DocReader
      markdown={doc.markdown}
      outline={doc.outline}
      fileName={`${fileName} - ${tab.label}`}
      empty={empty}
      refs={{ checked: refs, onChange: (on) => { setRefs(on); try { localStorage.setItem(REFS_KEY, on ? '1' : '0'); } catch { /* optional */ } } }}
      header={tabs.length > 1 ? <Tabs label="بخش‌های سند" value={tab.id} onChange={(id) => { setTabId(id); window.history.replaceState(null, '', window.location.pathname + window.location.search); }} items={tabs.map((t) => ({ id: t.id, label: t.label }))} /> : undefined}
    />
  );
};
