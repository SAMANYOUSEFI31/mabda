/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ContextObject, ContextRelationship, TreeNode } from '../../types';
import { contextDoc, docTabs, pendingInTab, tabOfAnchor, withWholeTab } from '../../core/contextMarkdown';
import { Button, Tabs, formatNumber } from '../../ui';
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
  /** suggestions wait in the thinking space: the reader says how many and opens them there */
  onOpenSuggestions?: () => void;
}

/**
 * The document view, the way a long document is read: the first-level sections are tabs; each tab has an outline of its own
 * headings that shows where you are (scroll-spy) and links every section by a stable address (#o-<object id>). The Markdown
 * stays linear — «با ارجاع‌ها» only adds flat «وابسته به» / «برگرفته از» lines.
 */
export const DocWorkspace: React.FC<Props> = ({ nodes, objects, relationships, approvals, fileName, empty, onOpenSuggestions }) => {
  const tabs = useMemo(() => withWholeTab(docTabs(nodes, objects)), [nodes, objects]);
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
    () => (tab ? contextDoc({ nodes, objects, ...(tab.whole ? { title: fileName } : { nodeId: tab.nodeId, ownOnly: tab.own }), refs, relationships, approvals }) : { markdown: '', outline: [] }),
    [tab, nodes, objects, refs, relationships, approvals, fileName],
  );
  // the whole document, for «کپی/دانلود کل سند» from any tab (DATA-03): built only when asked
  const whole = useMemo(() => (tabs.length > 1 && !tab?.whole ? () => contextDoc({ nodes, objects, title: fileName, refs, relationships, approvals }).markdown : undefined), [tabs.length, tab, nodes, objects, fileName, refs, relationships, approvals]);
  const pending = tab ? pendingInTab(tab, nodes, objects) : 0;
  if (!tab) return <>{empty}</>;

  return (
    <DocReader
      markdown={doc.markdown}
      outline={doc.outline}
      fileName={tab.whole ? fileName : `${fileName} - ${tab.label}`}
      whole={whole && { markdown: whole, fileName }}
      notice={pending > 0 ? (
        <p className="body-sm flex flex-wrap items-center gap-inline-sm text-text-subtle" role="status">
          <span>{formatNumber(pending)} پیشنهاد {tab.whole ? 'در این فضا' : 'در این بخش'} منتظر تأیید توست؛ سند فقط حقیقتِ تأییدشده را دارد.</span>
          {onOpenSuggestions && <Button size="sm" variant="ghost" iconEnd="ChevronLeft" onClick={onOpenSuggestions}>دیدن پیشنهادها</Button>}
        </p>
      ) : undefined}
      empty={empty}
      refs={{ checked: refs, onChange: (on) => { setRefs(on); try { localStorage.setItem(REFS_KEY, on ? '1' : '0'); } catch { /* optional */ } } }}
      header={tabs.length > 1 ? <div className="max-w-full overflow-x-auto"><Tabs label="بخش‌های سند" value={tab.id} onChange={(id) => { setTabId(id); window.history.replaceState(null, '', window.location.pathname + window.location.search); }} items={tabs.map((t) => ({ id: t.id, label: t.label }))} /></div> : undefined}
    />
  );
};
