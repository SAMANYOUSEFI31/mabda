/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ContextObject, ContextStatus, ContextType, TreeNode } from '../../types';
import { conflictPartners, DISPLAY_LABEL, displayState } from '../../core/displayState';
import {
  Button, Card, CONTEXT_STATUS_OPTIONS, CONTEXT_TYPE_OPTIONS, EmptyState, PROVENANCE_LABEL, ReachBadge, SampleBadge, Select, StatusBadge, Table, TextField, TypeBadge,
} from '../../ui';

interface ContextTableViewProps {
  objects: ContextObject[];
  nodes: TreeNode[];
  onSelectObject: (obj: ContextObject) => void;
  /** grey examples (starter / template): shown with «نمونه», never part of any engine */
  samples?: ContextObject[];
}

export const ContextTableView: React.FC<ContextTableViewProps> = ({
  objects,
  nodes,
  onSelectObject,
  samples = [],
}) => {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedNode, setSelectedNode] = useState<string>('all');
  const [selectedFacet, setSelectedFacet] = useState<string>('all');
  const partners = useMemo(() => conflictPartners(objects), [objects]);
  const facetNames = [...new Set([...objects, ...samples].flatMap((o) => o.facets ?? []))].sort((a, b) => a.localeCompare(b));

  const filteredObjects = [...objects, ...samples].filter((o) => {
    if (selectedFacet !== 'all' && !(o.facets ?? []).includes(selectedFacet)) return false;
    if (selectedType !== 'all' && o.type !== selectedType) return false;
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false;
    if (selectedNode !== 'all' && o.nodeId !== selectedNode) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = o.title.toLowerCase().includes(q);
      const matchContent = o.content.toLowerCase().includes(q);
      if (!matchTitle && !matchContent) return false;
    }
    return true;
  });

  const getNodeLabel = (nodeId: string) => {
    const n = nodes.find((node) => node.id === nodeId);
    return n ? n.label : nodeId;
  };

  const rows = filteredObjects as unknown as Array<Record<string, unknown> & ContextObject>;

  return (
    <section className="flex flex-col gap-stack-md">
      <div>
        <h2 className="heading-sm text-text-default">همهٔ دانسته‌ها در یک جدول</h2>
        <p className="body-sm mt-stack-xs text-text-subtle">جستجو کن، بر اساس نوع، وضعیت یا بخش فیلتر کن و ببین هر مورد از کجا آمده.</p>
      </div>

      <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="جستجو"
          iconStart="Search"
          placeholder="عنوان یا متن…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="نوع"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          options={[{ value: 'all', label: 'تمام انواع' }, ...CONTEXT_TYPE_OPTIONS]}
        />
        <Select
          label="وضعیت"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          options={[{ value: 'all', label: 'تمام وضعیت‌ها' }, ...CONTEXT_STATUS_OPTIONS]}
        />
        <Select
          label="شاخهٔ درخت"
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
          options={[{ value: 'all', label: 'تمام شاخه‌ها' }, ...nodes.map((n) => ({ value: n.id, label: n.label }))]}
        />
        {facetNames.length > 0 && (
          <Select
            label="بُعد"
            value={selectedFacet}
            onChange={(e) => setSelectedFacet(e.target.value)}
            options={[{ value: 'all', label: 'همهٔ بُعدها' }, ...facetNames.map((f) => ({ value: f, label: f }))]}
          />
        )}
      </div>

      {filteredObjects.length === 0 && (
        <EmptyState icon="Search" title="دادهای با این فیلترها پیدا نشد" description="فیلترها را کم کن یا عبارت جستجو را تغییر بده." />
      )}

      {/* Mobile: card list */}
      {filteredObjects.length > 0 && (
        <div className="flex flex-col gap-stack-sm md:hidden">
          {filteredObjects.map((obj) => (
            <Card key={obj.id} padding="md" knowledge={obj.sample ? 'sample' : displayState(obj, partners)} onClick={() => onSelectObject(obj)} className="flex flex-col gap-stack-xs">
              <div className="flex items-start justify-between gap-inline-sm">
                <span className="title text-text-default">{obj.title}</span>
                <span className="flex items-center gap-inline-xs"><TypeBadge value={obj.type} /><ReachBadge object={obj} />{obj.sample && <SampleBadge />}</span>
              </div>
              <p className="body-sm line-clamp-2 text-text-subtle">{obj.content}</p>
              <p className="body-sm text-text-subtle">{obj.sample ? '' : `${DISPLAY_LABEL[displayState(obj, partners)]} · `}{getNodeLabel(obj.nodeId)} · از «{PROVENANCE_LABEL[obj.provenance]}»</p>
            </Card>
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {filteredObjects.length > 0 && (
        <div className="hidden md:block">
          <Table
            caption="قلم‌های دانش"
            rows={rows}
            onRowClick={(row) => onSelectObject(row)}
            columns={[
              { key: 'title', label: 'عنوان', render: (r) => <span className="label-md text-text-default">{r.title}</span> },
              { key: 'type', label: 'نوع', render: (r) => <span className="flex items-center gap-inline-xs"><TypeBadge value={r.type} /><ReachBadge object={r} />{r.sample && <SampleBadge />}</span> },
              { key: 'status', label: 'وضعیت', render: (r) => <StatusBadge value={r.status} conflict={!r.sample && partners.has(r.id)} /> },
              { key: 'nodeId', label: 'شاخه', render: (r) => getNodeLabel(r.nodeId) },
              { key: 'provenance', label: 'منبع', render: (r) => PROVENANCE_LABEL[r.provenance] },
              { key: 'content', label: 'محتوا', render: (r) => <span className="line-clamp-1 max-w-overlay-xs text-text-subtle">{r.content}</span> },
              {
                key: 'actions',
                label: 'اقدام',
                render: (r) => (
                  <Button size="sm" variant="ghost" iconStart="Pencil" onClick={(e) => { e.stopPropagation(); onSelectObject(r); }}>
                    ویرایش
                  </Button>
                ),
              },
            ]}
          />
        </div>
      )}
    </section>
  );
};
