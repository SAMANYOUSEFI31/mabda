/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PlanId, Workspace } from '../types';
import { PLANS } from '../core/creditEngine';
import { Badge, Button, Card, Dialog, ModeBadge, formatNumber, formatUsd } from '../ui';

interface PlanSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onSelectPlan: (planId: PlanId) => void;
}

export const PlanSelectionModal: React.FC<PlanSelectionModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onSelectPlan,
}) => {
  const blurb: Record<PlanId, string> = {
    starter: 'مناسب برای شروع جدی یک کسب‌وکار (حدود ۱۱ خروجی متعادل)',
    pro: 'مناسب اپراتور روزانه (حدود ۳۴ خروجی متعادل یا ۱۸ عمیق)',
    max: 'مناسب مشاور یا آژانس (حدود ۴۰ خروجی عمیق یا ۲۵ خروجی حساس)',
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="انتخاب و تغییر پلن اشتراک مبدأ"
      description="پلن‌ها با دامنهٔ کار از هم جدا می‌شوند، نه با محدودیت مصنوعی؛ ذخیرهٔ Context و Asset در تمام پلن‌ها رایگان و نامحدود است (اصل P6)."
    >
      <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((pid) => {
          const p = PLANS[pid];
          const isCurrent = currentWorkspace.planId === pid;
          return (
            <Card key={pid} padding="lg" selected={isCurrent || undefined} className="flex h-full flex-col justify-between gap-stack-lg">
              <div className="flex flex-col gap-stack-md">
                <div className="flex items-center justify-between gap-inline-sm">
                  <h3 className="title text-text-default">{p.title}</h3>
                  {isCurrent && <Badge intent="neutral" emphasis="bold" icon="Check">پلن فعال</Badge>}
                </div>

                <div className="flex flex-col gap-stack-xs">
                  <div className="flex items-baseline gap-inline-xs">
                    <span className="text-numeric-lg text-text-default">{formatUsd(p.priceMonthlyUsd, 0)}</span>
                    <span className="body-sm text-text-subtle">در ماه</span>
                  </div>
                  <span className="caption text-text-subtle">حدود {formatNumber(p.priceMonthlyToman)} تومان</span>
                </div>

                <dl className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md body-sm">
                  <div className="flex items-center justify-between gap-inline-sm">
                    <dt className="text-text-subtle">اعتبار ماهانهٔ خروجی</dt>
                    <dd className="label-md tabular-nums text-text-default">{formatNumber(p.creditsMonthly)} اعتبار</dd>
                  </div>
                  <div className="flex items-center justify-between gap-inline-sm">
                    <dt className="text-text-subtle">سقف منصفانهٔ گفتگو</dt>
                    <dd className="label-md tabular-nums text-text-default">{formatNumber(p.dailyChatLimit)} پیام در روز</dd>
                  </div>
                  <div className="flex items-center justify-between gap-inline-sm">
                    <dt className="text-text-subtle">سقف فضای کاری</dt>
                    <dd className="label-md tabular-nums text-text-default">{formatNumber(p.workspaceLimit)} عدد</dd>
                  </div>
                  <div className="flex flex-col gap-stack-xs">
                    <dt className="text-text-subtle">الگوهای اجرا</dt>
                    <dd className="flex flex-wrap gap-inline-xs">
                      {p.allowedModes.map((m) => <ModeBadge key={m} value={m} />)}
                    </dd>
                  </div>
                  <p className="caption text-text-subtle">{blurb[pid]}</p>
                </dl>
              </div>

              {isCurrent ? (
                <Badge intent="success" icon="CircleCheck" className="justify-center">پلن فعلی شما</Badge>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    onSelectPlan(pid);
                    onClose();
                  }}
                >
                  فعال‌سازی پلن {p.title.split(' ')[0]}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </Dialog>
  );
};
