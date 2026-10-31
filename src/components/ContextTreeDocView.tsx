/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ContextObject, TreeNode } from '../types';
import { DEFAULT_TREE_NODES } from '../core/specs';
import { Badge, Button, Card, EmptyState, PROVENANCE_LABEL, StatusBadge, TypeBadge, formatNumber } from '../ui';

interface ContextTreeDocViewProps {
  objects: ContextObject[];
  nodes?: TreeNode[];
  onSelectObject: (obj: ContextObject) => void;
  onAddNewToNode: (nodeId: string) => void;
}

export const ContextTreeDocView: React.FC<ContextTreeDocViewProps> = ({
  objects,
  nodes = DEFAULT_TREE_NODES,
  onSelectObject,
  onAddNewToNode,
}) => {
  const activeObjects = objects.filter(
    (o) => o.status !== 'Archived' && o.status !== 'Superseded'
  );

  return (
    <Card padding="xl" className="flex flex-col gap-stack-xl">
      <div className="flex flex-col gap-inline-md border-b border-border-default pb-inset-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="heading-sm text-text-default">سند منبع حقیقت</h2>
          <p className="body-sm mt-stack-xs text-text-subtle">
            داده همان UI است (اصل P6)؛ هر تیتر یک شیء نوع‌دار از دانش است و با زدن روی آن ویرایشش می‌کنی.
          </p>
        </div>
        <Badge intent="neutral" icon={false}>{formatNumber(activeObjects.length)} قلم دانش فعال</Badge>
      </div>

      <div className="flex flex-col gap-stack-xl">
        {nodes.map((node, index) => {
          const nodeObjects = activeObjects.filter((o) => o.nodeId === node.id);

          return (
            <section key={node.id} className="flex flex-col gap-stack-md" aria-labelledby={`node-${node.id}`}>
              <div className="flex items-center justify-between gap-inline-md border-b border-border-subtle pb-inset-sm">
                <div className="flex min-w-space-0 flex-wrap items-baseline gap-x-inline-sm">
                  <span className="label-md tabular-nums text-text-subtlest">{formatNumber(index + 1)}.</span>
                  <h3 id={`node-${node.id}`} className="heading-xs text-text-default">{node.label}</h3>
                  <span className="body-sm hidden text-text-subtle sm:inline">({node.description})</span>
                </div>
                <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => onAddNewToNode(node.id)}>
                  افزودن به این شاخه
                </Button>
              </div>

              {nodeObjects.length === 0 ? (
                <EmptyState
                  icon="Inbox"
                  title="هنوز موردی در این شاخه ثبت نشده"
                  action={<Button variant="secondary" size="sm" onClick={() => onAddNewToNode(node.id)}>ثبت اولین مورد</Button>}
                />
              ) : (
                <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">
                  {nodeObjects.map((obj) => (
                    <Card key={obj.id} padding="lg" onClick={() => onSelectObject(obj)} className="flex flex-col gap-stack-sm">
                      <div className="flex items-start justify-between gap-inline-sm">
                        <h4 className="title text-text-default">{obj.title}</h4>
                        <div className="flex shrink-0 flex-wrap justify-end gap-inline-xs">
                          <TypeBadge value={obj.type} />
                          <StatusBadge value={obj.status} />
                        </div>
                      </div>
                      <p className="body-md line-clamp-3 text-text-default">{obj.content}</p>
                      <div className="mt-stack-xs flex items-center justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm caption text-text-subtle">
                        <span>منبع: {PROVENANCE_LABEL[obj.provenance]}</span>
                        <span className="inline-flex items-center gap-inline-xs">ویرایش یا مشاهده</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
};
