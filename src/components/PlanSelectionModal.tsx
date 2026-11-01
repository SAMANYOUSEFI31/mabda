/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PlanId, Workspace } from '../types';
import { PLANS } from '../core/creditEngine';
import { entitlementsOf, PLAN_IDS } from '../core/entitlements';
import { useAiStatus } from '../services/aiStatus';
import { Badge, Button, Card, Dialog, Icon, ModeBadge, formatNumber, formatUsd } from '../ui';

interface PlanSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onSelectPlan: (planId: PlanId) => void;
}

const WHO: Record<PlanId, string> = {
  starter: 'برای یک کسب‌وکار که تازه منبع حقیقتش را می‌سازد',
  pro: 'برای اپراتور روزانه‌ای که چند پروژه و جریان کار سفارشی دارد',
  max: 'برای مشاور یا آژانس با چند مشتری',
};

const k = (n: number) => (n >= 1_000_000 ? `${formatNumber(Math.round(n / 100_000) / 10)} میلیون` : `${formatNumber(Math.round(n / 1000))} هزار`);

/** The plan page speaks in outcomes. No local-currency price lives in code: the gateway converts at payment time. */
export const PlanSelectionModal: React.FC<PlanSelectionModalProps> = ({ isOpen, onClose, currentWorkspace, onSelectPlan }) => {
  const ai = useAiStatus();
  const managed = ai.managedEnabled;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="منبع حقیقت کسب‌وکار، وصل به AI خودت"
      description="اشتراک مبدأ برای ساختار و موتورهاست: دانشت منظم می‌ماند، تغییرها دیده می‌شوند و هر AI که می‌خواهی از همین منبع کار می‌کند. ذخیرهٔ Context و دارایی در همهٔ پلن‌ها آزاد است."
    >
      <div className="flex flex-col gap-stack-lg">
        <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-3">
          {PLAN_IDS.map((pid) => {
            const e = entitlementsOf(pid);
            const p = PLANS[pid];
            const isCurrent = currentWorkspace.planId === pid;
            const rows: Array<{ ok: boolean; text: string }> = [
              { ok: true, text: `${formatNumber(e.workspaces)} فضای کاری برای کسب‌وکارها یا مشتری‌هایت` },
              { ok: true, text: `تا ${formatNumber(e.maxObjects)} قلم دانش فعال در درخت منبع حقیقت` },
              { ok: true, text: `فایل‌هایت را بخوان: حدود ${k(e.fileTokensPerMonth)} توکن پردازش در ماه` },
              { ok: e.engines.changeImpact, text: 'بفهم کدام دارایی با تغییر دانش قدیمی شد' },
              { ok: e.engines.semanticContradiction, text: 'تناقض معنایی بین تصمیم‌هایت را پیدا کن' },
              { ok: e.byok, text: 'کلید API خودت را وصل کن؛ هزینهٔ توکن مستقیم با خودت' },
              { ok: e.mcp, text: 'دانشت را از طریق MCP به هر دستیار AI بده' },
              { ok: e.contextPack, text: 'بستهٔ Context بگیر و هرجا خواستی ببر' },
              { ok: e.customSpecs, text: 'جریان کار سفارشی با وابستگی و گاردریل بساز' },
              { ok: true, text: `هر روز تا ${formatNumber(e.decisionJudgmentsPerDay)} قضاوت هوشمند و ${formatNumber(e.coachPerDay)} جلسهٔ Context Coach، با هزینهٔ ما` },
            ];
            return (
              <Card key={pid} padding="lg" selected={isCurrent || undefined} className="flex h-full flex-col justify-between gap-stack-lg">
                <div className="flex flex-col gap-stack-md">
                  <div className="flex items-center justify-between gap-inline-sm">
                    <h3 className="title text-text-default">{p.title}</h3>
                    {isCurrent && <Badge intent="neutral" emphasis="bold" icon="Check">پلن فعال</Badge>}
                  </div>
                  <p className="body-sm text-text-subtle">{WHO[pid]}</p>
                  <div className="flex items-baseline gap-inline-xs">
                    <span className="text-numeric-lg text-text-default">{formatUsd(e.priceMonthlyUsd, 0)}</span>
                    <span className="body-sm text-text-subtle">در ماه</span>
                  </div>

                  <ul className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md body-sm">
                    {rows.map((r) => (
                      <li key={r.text} className={`flex items-start gap-inline-sm ${r.ok ? 'text-text-default' : 'text-text-subtlest'}`}>
                        <Icon name={r.ok ? 'Check' : 'Minus'} size="sm" className="mt-stack-xs shrink-0" />
                        <span><span className="sr-only">{r.ok ? 'شامل: ' : 'شامل نیست: '}</span>{r.text}</span>
                      </li>
                    ))}
                  </ul>

                  {managed && (
                    <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md body-sm">
                      <span className="label-md text-text-default">AI مدیریت‌شده (با اعتبار)</span>
                      <span className="text-text-default">{formatNumber(p.creditsMonthly)} اعتبار ماهانه برای خروجی‌ها</span>
                      <span className="text-text-subtle">گفتگو: {formatNumber(p.dailyChatLimit)} پیام در روز</span>
                      <div className="flex flex-wrap gap-inline-xs">{p.allowedModes.map((m) => <ModeBadge key={m} value={m} />)}</div>
                    </div>
                  )}
                </div>

                {isCurrent ? (
                  <Badge intent="success" icon="CircleCheck" className="justify-center">پلن فعلی شما</Badge>
                ) : (
                  <Button variant="secondary" fullWidth onClick={() => { onSelectPlan(pid); onClose(); }}>
                    فعال‌سازی پلن {p.title.split(' ')[0]}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
        <p className="caption text-text-subtle">
          قیمت‌ها به دلار و مبنای اقتصادی‌اند؛ مبلغ محلی هنگام پرداخت با نرخ روز درگاه محاسبه می‌شود. عددهای ظرفیت در این نسخه تخمینی‌اند و بعد از دورهٔ Alpha با مصرف واقعی تنظیم می‌شوند.
        </p>
      </div>
    </Dialog>
  );
};
