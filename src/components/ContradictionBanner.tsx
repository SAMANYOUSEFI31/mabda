/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Contradiction } from '../types';
import { Alert, Button, Card, TypeBadge, formatNumber } from '../ui';

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
    <Alert intent="warning" title={`تشخیص تناقض در منبع حقیقت (${formatNumber(contradictions.length)} مورد)`} className="mb-stack-lg">
      <div className="flex flex-col gap-stack-md pt-inset-sm">
        <p className="text-text-subtle">انسجام مهم‌تر از حجم است: یکی از دو مورد را تثبیت کنید تا دیگری بایگانی شود.</p>
        {contradictions.map((contra) => (
          <Card key={contra.id} padding="md" className="flex flex-col gap-stack-sm">
            <p className="label-md text-text-default">{contra.reason}</p>
            <div className="grid grid-cols-1 gap-inline-md md:grid-cols-2">
              {([['اول', contra.itemA, contra.itemB], ['دوم', contra.itemB, contra.itemA]] as const).map(([ordinal, keep, drop]) => (
                <div key={keep.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                  <div className="flex items-center justify-between gap-inline-sm">
                    <span className="label-md text-text-default">مورد {ordinal}: {keep.title}</span>
                    <TypeBadge value={keep.type} />
                  </div>
                  <p className="body-sm text-text-subtle">{keep.content}</p>
                  <Button variant="secondary" size="sm" fullWidth onClick={() => onResolve(contra.id, keep.id, drop.id)}>
                    تثبیت این مورد و بایگانی مورد {ordinal === 'اول' ? 'دوم' : 'اول'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Alert>
  );
};
