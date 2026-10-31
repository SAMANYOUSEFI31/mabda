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
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-8 text-right">
      <div className="border-b border-[#27272a] pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">سند منبع حقیقت (Document View)</h2>
          <p className="text-xs text-[#a1a1aa] mt-1">
            داده همون UI است (اصل P6)؛ هر تیتر یک شیء نوع‌دار از دانش است که کلیک روی آن فوراً امکان ویرایش را می‌دهد.
          </p>
        </div>
        <span className="text-xs text-[#a1a1aa] bg-[#09090b] px-3 py-1 rounded-md border border-[#27272a]">
          {activeObjects.length} قلم دانش فعال
        </span>
      </div>

      <div className="space-y-8">
        {nodes.map((node, index) => {
          const nodeObjects = activeObjects.filter((o) => o.nodeId === node.id);

          return (
            <section key={node.id} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#27272a]/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#e11d48]">0{index + 1}.</span>
                  <h3 className="text-lg font-bold text-white">{node.label}</h3>
                  <span className="text-xs text-[#7d7d86] hidden sm:inline">
                    ({node.description})
                  </span>
                </div>
                <button
                  onClick={() => onAddNewToNode(node.id)}
                  className="text-xs text-[#fb7185] hover:text-white px-2 py-1 rounded hover:bg-[#27272a] transition-colors"
                >
                  + افزودن به این شاخه
                </button>
              </div>

              {nodeObjects.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#09090b]/40 border border-[#27272a] border-dashed text-xs text-[#7d7d86] flex items-center justify-between">
                  <span>هیچ موردی در این شاخه ثبت نشده است.</span>
                  <button
                    onClick={() => onAddNewToNode(node.id)}
                    className="text-[#e11d48] font-medium hover:underline"
                  >
                    ثبت اولین مورد
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {nodeObjects.map((obj) => (
                    <article
                      key={obj.id}
                      onClick={() => onSelectObject(obj)}
                      className={`p-4 rounded-lg border transition-all cursor-pointer text-right group ${
                        obj.status === 'Proposed'
                          ? 'bg-[#18181b]/80 border-[#f59e0b]/40 hover:border-[#f59e0b]'
                          : obj.status === 'Needs Review'
                          ? 'bg-[#18181b]/80 border-[#38bdf8]/40 hover:border-[#38bdf8]'
                          : 'bg-[#09090b] border-[#27272a] hover:border-[#52525b]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-white text-sm group-hover:text-[#fb7185] transition-colors">
                          {obj.title}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          <span
                            className={`px-1.5 py-0.5 rounded font-medium ${
                              obj.type === 'Decision'
                                ? 'bg-[#e11d48]/15 text-[#fb7185]'
                                : obj.type === 'Constraint'
                                ? 'bg-[#f59e0b]/15 text-[#fbbf24]'
                                : obj.type === 'Asset'
                                ? 'bg-[#10b981]/15 text-[#34d399]'
                                : 'bg-[#0284c7]/15 text-[#38bdf8]'
                            }`}
                          >
                            {obj.type}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              obj.status === 'Confirmed'
                                ? 'text-[#10b981] bg-[#10b981]/10'
                                : obj.status === 'Proposed'
                                ? 'text-[#f59e0b] bg-[#f59e0b]/10'
                                : 'text-[#38bdf8] bg-[#38bdf8]/10'
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

                      <p className="text-xs text-[#d4d4d8] leading-relaxed line-clamp-3">
                        {obj.content}
                      </p>

                      <div className="mt-3 pt-2 border-t border-[#27272a]/40 flex items-center justify-between text-[11px] text-[#7d7d86]">
                        <span>منبع: {obj.provenance}</span>
                        <span className="text-[#a1a1aa] group-hover:text-white transition-colors">
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
