/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ContextObject, TreeNode } from '../types';
import { DEFAULT_TREE_NODES } from '../core/specs';

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
    <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl space-y-stack-xl text-end">
      <div className="border-b border-border-default pb-inset-lg flex items-center justify-between">
        <div>
          <h2 className="text-heading-sm font-bold text-text-default">سند منبع حقیقت (Document View)</h2>
          <p className="text-body-sm text-text-subtle mt-stack-xs">
            داده همون UI است (اصل P6)؛ هر تیتر یک شیء نوع‌دار از دانش است که کلیک روی آن فوراً امکان ویرایش را می‌دهد.
          </p>
        </div>
        <span className="text-body-sm text-text-subtle bg-surface-sunken px-inset-md py-inset-xs rounded-control-sm border border-border-default">
          {activeObjects.length} قلم دانش فعال
        </span>
      </div>

      <div className="space-y-stack-xl">
        {nodes.map((node, index) => {
          const nodeObjects = activeObjects.filter((o) => o.nodeId === node.id);

          return (
            <section key={node.id} className="space-y-stack-md">
              <div className="flex items-center justify-between pb-inset-sm border-b border-border-subtle">
                <div className="flex items-center gap-inline-sm">
                  <span className="text-body-sm font-mono text-text-brand">0{index + 1}.</span>
                  <h3 className="text-heading-xs font-bold text-text-default">{node.label}</h3>
                  <span className="text-body-sm text-text-subtlest hidden sm:inline">
                    ({node.description})
                  </span>
                </div>
                <button
                  onClick={() => onAddNewToNode(node.id)}
                  className="text-body-sm text-text-brand hover:text-text-default px-inset-sm py-inset-xs rounded-indicator hover:bg-interaction-hover transition-colors"
                >
                  + افزودن به این شاخه
                </button>
              </div>

              {nodeObjects.length === 0 ? (
                <div className="p-inset-lg rounded-control-sm bg-surface-sunken border border-border-default border-dashed text-body-sm text-text-subtlest flex items-center justify-between">
                  <span>هیچ موردی در این شاخه ثبت نشده است.</span>
                  <button
                    onClick={() => onAddNewToNode(node.id)}
                    className="text-text-brand font-semibold hover:underline"
                  >
                    ثبت اولین مورد
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-inline-lg">
                  {nodeObjects.map((obj) => (
                    <article
                      key={obj.id}
                      onClick={() => onSelectObject(obj)}
                      className={`p-inset-lg rounded-control-sm border transition-all cursor-pointer text-end group ${
                        obj.status === 'Proposed'
                          ? 'bg-surface-raised border-border-warning-subtle hover:border-border-warning'
                          : obj.status === 'Needs Review'
                          ? 'bg-surface-raised border-border-info-subtle hover:border-border-info'
                          : 'bg-surface-sunken border-border-default hover:border-border-bold'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-inline-sm mb-stack-sm">
                        <h4 className="font-semibold text-text-default text-body-md group-hover:text-text-brand transition-colors">
                          {obj.title}
                        </h4>
                        <div className="flex items-center gap-inline-sm shrink-0 text-caption">
                          <span
                            className={`px-inset-sm py-inset-xs rounded-indicator font-semibold ${
                              obj.type === 'Decision'
                                ? 'bg-bg-brand-subtle text-text-brand'
                                : obj.type === 'Constraint'
                                ? 'bg-bg-warning-subtle text-text-warning'
                                : obj.type === 'Asset'
                                ? 'bg-bg-success-subtle text-text-success'
                                : 'bg-bg-info-subtle text-text-info'
                            }`}
                          >
                            {obj.type}
                          </span>
                          <span
                            className={`px-inset-sm py-inset-xs rounded-indicator ${
                              obj.status === 'Confirmed'
                                ? 'text-text-success bg-bg-success-subtle'
                                : obj.status === 'Proposed'
                                ? 'text-text-warning bg-bg-warning-subtle'
                                : 'text-text-info bg-bg-info-subtle'
                            }`}
                          >
                            {obj.status === 'Confirmed'
                              ? 'تأییدشده'
                              : obj.status === 'Proposed'
                              ? 'پیشنهادی'
                              : 'نیاز به بررسی'}
                          </span>
                        </div>
                      </div>

                      <p className="text-body-sm text-text-default leading-relaxed line-clamp-3">
                        {obj.content}
                      </p>

                      <div className="mt-stack-md pt-inset-sm border-t border-border-subtle flex items-center justify-between text-caption text-text-subtlest">
                        <span>منبع: {obj.provenance}</span>
                        <span className="text-text-subtle group-hover:text-text-default transition-colors">
                          ویرایش یا مشاهده &larr;
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
