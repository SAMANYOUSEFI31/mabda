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
    <div className="bg-bg-warning-subtle border border-border-warning-subtle rounded-control p-inset-lg mb-stack-lg text-body-md text-text-warning">
      <div className="flex items-start gap-inline-md">
        <span className="text-heading-sm" aria-hidden="true">
          ⚠️
        </span>
        <div className="flex-1 space-y-stack-md">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-text-default text-body-md">
              تشخیص تناقض در منبع حقیقت ({contradictions.length} مورد)
            </h4>
            <span className="text-body-sm text-text-warning bg-bg-warning-subtle px-inset-sm py-inset-xs rounded-indicator">
              اصل P4: انسجام مهم‌تر از حجم است
            </span>
          </div>

          {contradictions.map((contra) => (
            <div
              key={contra.id}
              className="bg-surface-raised border border-border-warning-subtle rounded-control-sm p-inset-lg space-y-stack-sm text-body-sm"
            >
              <p className="text-text-warning font-semibold leading-relaxed">
                {contra.reason}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-inline-md pt-inset-sm">
                <div className="bg-surface-sunken p-inset-md rounded-indicator border border-border-default space-y-stack-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-subtle font-semibold">مورد اول: {contra.itemA.title}</span>
                    <span className="text-caption text-text-brand">{contra.itemA.type}</span>
                  </div>
                  <p className="text-text-default">{contra.itemA.content}</p>
                  <button
                    onClick={() => onResolve(contra.id, contra.itemA.id, contra.itemB.id)}
                    className="mt-stack-sm w-full py-inset-xs px-inset-sm text-center text-body-sm font-semibold bg-bg-neutral-subtle hover:bg-interaction-hover text-text-default rounded-indicator transition-colors"
                  >
                    تثبیت این مورد و بایگانی مورد دوم
                  </button>
                </div>

                <div className="bg-surface-sunken p-inset-md rounded-indicator border border-border-default space-y-stack-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-subtle font-semibold">مورد دوم: {contra.itemB.title}</span>
                    <span className="text-caption text-text-brand">{contra.itemB.type}</span>
                  </div>
                  <p className="text-text-default">{contra.itemB.content}</p>
                  <button
                    onClick={() => onResolve(contra.id, contra.itemB.id, contra.itemA.id)}
                    className="mt-stack-sm w-full py-inset-xs px-inset-sm text-center text-body-sm font-semibold bg-bg-neutral-subtle hover:bg-interaction-hover text-text-default rounded-indicator transition-colors"
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
