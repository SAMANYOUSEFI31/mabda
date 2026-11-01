/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { PlanId } from '../types';
import type { UsageInfo } from '../types/state';
import { meters } from '../core/entitlements';
import { dataApi, DataApiError } from '../services/dataApi';
import { useAiStatus } from '../services/aiStatus';
import { Alert, Badge, Button, Card, Progress, formatNumber, formatUsd } from '../ui';

interface Props {
  workspaceId: string;
  planId: PlanId;
  /** changes whenever the workspace data changes, to refresh the meters */
  refreshKey: unknown;
  onOpenPlans: () => void;
}

/** What this plan has used: objects, file quota, today's judgements and Coach — and, with your own key, the approximate token cost. */
export const UsagePanel: React.FC<Props> = ({ workspaceId, planId, refreshKey, onOpenPlans }) => {
  const ai = useAiStatus();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setUsage(await dataApi.usage(workspaceId)); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); }
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (error) return <Alert intent="danger" action={<Button size="sm" variant="secondary" onClick={load}>دوباره</Button>}>{error}</Alert>;
  if (!usage) return <p className="body-sm text-text-subtle">در حال خواندن مصرف…</p>;

  const rows = meters(planId, { objects: usage.objects, fileTokens: usage.fileTokens, judgmentsToday: usage.judgmentsToday, coachToday: usage.coachToday });
  const anyNear = rows.some((r) => r.nearLimit);

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">
        {rows.map((m) => (
          <Card key={m.key} padding="lg" className="flex flex-col gap-stack-sm">
            <div className="flex flex-wrap items-center justify-between gap-inline-sm">
              <span className="label-md text-text-default">{m.label}</span>
              {m.exceeded ? <Badge intent="danger" icon="Lock">پر شد</Badge> : m.nearLimit ? <Badge intent="warning" icon="TriangleAlert">نزدیک سقف</Badge> : null}
            </div>
            <Progress value={Math.min(m.used, m.limit)} max={m.limit} label={m.label} showValue={false} intent={m.exceeded || m.nearLimit ? 'warning' : 'neutral'} />
            <span className="caption tabular-nums text-text-subtle">{formatNumber(m.used)} از {formatNumber(m.limit)} {m.unit}</span>
          </Card>
        ))}
      </div>

      {usage.payer === 'user' && (
        <Alert intent="info" title="قضاوت‌ها با کلید خودت انجام می‌شوند">سرور کلید پلتفرم ندارد؛ قضاوت‌های لایهٔ تصمیم و مربی دانش روی کلید شخصی تو اجرا می‌شوند و سقف روزانه اعمال نمی‌شود.</Alert>
      )}

      {(ai.byok || usage.byokCostUsd > 0) && (
        <Card padding="lg" className="flex flex-col gap-stack-xs">
          <span className="label-md text-text-default">هزینهٔ تقریبی توکن روی کلید خودت (این ماه)</span>
          <span className="text-numeric-md tabular-nums text-text-default">{formatUsd(usage.byokCostUsd, 4)}</span>
          <span className="caption text-text-subtle">با قیمت لیست مدل‌ها محاسبه شده و از متادیتای واقعی توکن می‌آید؛ صورت‌حساب رسمی را شرکت ارائه‌دهندهٔ کلید می‌دهد. از اشتراک مبدأ چیزی کم نمی‌شود.</span>
        </Card>
      )}

      {anyNear && <Button variant="secondary" iconEnd="ArrowLeft" onClick={onOpenPlans}>مقایسهٔ پلن‌ها</Button>}
    </div>
  );
};
