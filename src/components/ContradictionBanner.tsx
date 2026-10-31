/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Contradiction } from '../types';

interface ContradictionBannerProps {
  contradictions: Contradiction[];
  onResolve: (contradictionId: string, keepItemId: string, archiveItemId: string) => void;
}

export const ContradictionBanner: React.FC<ContradictionBannerProps> = ({
  contradictions,
  onResolve,
}) => {
  if (contradictions.length === 0) return null;

  return (
    <div className="bg-[#451a03]/80 border border-[#f59e0b]/40 rounded-xl p-4 mb-6 text-sm text-[#fde68a]">
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">
          ⚠️
        </span>
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-base">
              تشخیص تناقض در منبع حقیقت ({contradictions.length} مورد)
            </h4>
            <span className="text-xs text-[#fbbf24] bg-[#78350f] px-2 py-0.5 rounded">
              اصل P4: انسجام مهم‌تر از حجم است
            </span>
          </div>

          {contradictions.map((contra) => (
            <div
              key={contra.id}
              className="bg-[#18181b] border border-[#f59e0b]/30 rounded-lg p-3.5 space-y-2 text-xs"
            >
              <p className="text-[#fde68a] font-medium leading-relaxed">
                {contra.reason}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-[#09090b] p-2.5 rounded border border-[#27272a] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#a1a1aa] font-medium">مورد اول: {contra.itemA.title}</span>
                    <span className="text-[10px] text-[#fb7185]">{contra.itemA.type}</span>
                  </div>
                  <p className="text-[#fafafa]">{contra.itemA.content}</p>
                  <button
                    onClick={() => onResolve(contra.id, contra.itemA.id, contra.itemB.id)}
                    className="mt-2 w-full py-1 px-2 text-center text-xs font-semibold bg-[#27272a] hover:bg-[#3f3f46] text-white rounded transition-colors"
                  >
                    تثبیت این مورد و بایگانی مورد دوم
                  </button>
                </div>

                <div className="bg-[#09090b] p-2.5 rounded border border-[#27272a] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#a1a1aa] font-medium">مورد دوم: {contra.itemB.title}</span>
                    <span className="text-[10px] text-[#fb7185]">{contra.itemB.type}</span>
                  </div>
                  <p className="text-[#fafafa]">{contra.itemB.content}</p>
                  <button
                    onClick={() => onResolve(contra.id, contra.itemB.id, contra.itemA.id)}
                    className="mt-2 w-full py-1 px-2 text-center text-xs font-semibold bg-[#27272a] hover:bg-[#3f3f46] text-white rounded transition-colors"
                  >
                    تثبیت این مورد و بایگانی مورد اول
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
