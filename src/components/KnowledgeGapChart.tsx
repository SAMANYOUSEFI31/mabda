/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ContextObject, WorkstreamSpec, ReadinessResult } from '../types';
import { Badge, Button, Card, Icon, SegmentedControl, Stat, formatNumber } from '../ui';
import type { IconName } from '../ui';

/** Chart colors are Bushido semantic tokens (chart-* / text-* / border-*), resolved by the browser. */
const CHART = {
  grid: 'var(--border-default)',
  axis: 'var(--border-bold)',
  tick: 'var(--text-subtle)',
  tickStrong: 'var(--text-default)',
  coverage: 'var(--chart-categorical-3)',
  target: 'var(--chart-categorical-4)',
  gap: 'var(--chart-categorical-2)',
  font: 'var(--font-sans)',
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface-overlay)',
  borderColor: 'var(--border-default)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-default)',
  fontFamily: CHART.font,
  direction: 'rtl' as const,
  fontSize: 14,
  boxShadow: 'var(--shadow-overlay)',
};

const NODE_LABELS: Record<string, string> = {
  business: 'کسب‌وکار و اهداف',
  brand: 'برند و پیام',
  product: 'محصول و خدمت',
  offer: 'آفر و قیمت‌گذاری',
  content: 'محتوا و بازاریابی',
  asset: 'دارایی‌های تأییدشده',
};

interface KnowledgeGapChartProps {
  currentSpec: WorkstreamSpec;
  allContextObjects: ContextObject[];
  readiness: ReadinessResult;
  onSelectNodeFilter?: (nodeId: string) => void;
  onOpenContextModalForNode?: (nodeId: string) => void;
}

export const KnowledgeGapChart: React.FC<KnowledgeGapChartProps> = ({
  currentSpec,
  allContextObjects,
  readiness,
  onSelectNodeFilter,
  onOpenContextModalForNode,
}) => {
  const [chartType, setChartType] = useState<'radar' | 'bar'>('radar');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Core 6 knowledge nodes
  const nodeIds = ['business', 'brand', 'product', 'offer', 'content', 'asset'] as const;

  const requiredNodeIds = useMemo(
    () => currentSpec.requiredContext.map((r) => r.nodeId),
    [currentSpec]
  );
  const suggestedNodeIds = useMemo(
    () => currentSpec.suggestedContext.map((s) => s.nodeId),
    [currentSpec]
  );

  // Process data for charts
  const chartData = useMemo(() => {
    return nodeIds.map((nodeId) => {
      const label = NODE_LABELS[nodeId] || nodeId;
      const nodeObjects = allContextObjects.filter(
        (o) => o.nodeId === nodeId && o.status !== 'Archived'
      );
      const confirmedObjects = nodeObjects.filter((o) => o.status === 'Confirmed');

      const isRequired = requiredNodeIds.includes(nodeId);
      const isSuggested = suggestedNodeIds.includes(nodeId);

      // Target expectation (0 - 100)
      const targetExpectation = isRequired ? 100 : isSuggested ? 70 : 40;

      // Actual coverage score based on confirmed objects (0 - 100)
      let actualScore = 0;
      if (isRequired) {
        actualScore = Math.min(100, confirmedObjects.length >= 2 ? 100 : confirmedObjects.length * 50);
      } else if (isSuggested) {
        actualScore = Math.min(100, confirmedObjects.length >= 1 ? 100 : 30);
      } else {
        actualScore = Math.min(100, confirmedObjects.length > 0 ? 80 : 25);
      }

      const gapScore = Math.max(0, targetExpectation - actualScore);

      return {
        nodeId,
        nodeName: label.split(' ')[0], // short name for radar axis
        fullLabel: label,
        'پوشش دانش موجود': actualScore,
        'هدف موردنیاز': targetExpectation,
        'شکاف دانشی': gapScore,
        countConfirmed: confirmedObjects.length,
        countDraft: nodeObjects.filter(
          (o) => o.status === 'Proposed' || o.status === 'Needs Review'
        ).length,
        isRequired,
        isSuggested,
      };
    });
  }, [allContextObjects, currentSpec, requiredNodeIds, suggestedNodeIds]);

  const selectedNodeData = chartData.find((d) => d.nodeId === activeNodeId);

  const missingRequiredCount = readiness.gaps.filter(
    (g) => g.importance === 'required' && g.status === 'missing'
  ).length;
  const missingSuggestedCount = readiness.gaps.filter(
    (g) => g.importance === 'suggested' && g.status === 'missing'
  ).length;
  const isReady = readiness.status === 'ready';

  const COVERAGE = 'پوشش دانش موجود';
  const TARGET = 'هدف موردنیاز';
  const GAP = 'شکاف دانشی';

  return (
    <Card padding="xl" className="flex flex-col gap-stack-lg">
      {/* Header and controls */}
      <div className="flex flex-col justify-between gap-inline-lg border-b border-border-default pb-inset-lg sm:flex-row sm:items-center">
        <div>
          <h3 className="title text-text-default">رادار و تحلیل بصری شکاف‌های دانش</h3>
          <p className="body-sm mt-stack-xs text-text-subtle">
            مقایسهٔ «دانش تأییدشده در منبع حقیقت» با «اهداف و نیازمندی‌های این جریان کار»
          </p>
        </div>
        <SegmentedControl
          label="نوع نمودار"
          value={chartType}
          onChange={(id) => setChartType(id as 'radar' | 'bar')}
          items={[
            { id: 'radar', label: 'راداری', icon: 'Target' },
            { id: 'bar', label: 'میله‌ای', icon: 'ChartColumn' },
          ]}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-inline-md sm:grid-cols-4">
        <Stat label="نمرهٔ آمادگی جریان" value={`${formatNumber(readiness.score)}٪`} delta="از ۱۰۰" />
        <Stat
          label="شکاف‌های بحرانی مسدودکننده"
          value={formatNumber(missingRequiredCount)}
          delta="حوزهٔ بدون مدرک"
          trend={missingRequiredCount > 0 ? 'down' : 'up'}
        />
        <Stat label="فرصت‌های بهبود تکمیلی" value={formatNumber(missingSuggestedCount)} delta="پیشنهاد ارتقا" />
        <Stat
          label="وضعیت تولید دارایی"
          value={isReady ? 'آماده' : 'ناقص'}
          delta={isReady ? 'تولید باکیفیت ممکن است' : 'نیاز به رفع کسری'}
          trend={isReady ? 'up' : 'down'}
        />
      </div>

      {/* Chart canvas (direction forced so chart axes keep their conventional orientation) */}
      <div className="mx-auto aspect-square w-full max-w-overlay-lg sm:aspect-4/3" dir="ltr" role="img" aria-label="نمودار پوشش دانش در شش حوزهٔ منبع حقیقت">
        {chartType === 'radar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
              <PolarGrid stroke={CHART.grid} />
              <PolarAngleAxis dataKey="nodeName" tick={{ fill: CHART.tickStrong, fontSize: 14, fontFamily: CHART.font }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke={CHART.axis} tick={{ fill: CHART.tick, fontSize: 12 }} />
              <Radar name={TARGET} dataKey={TARGET} stroke={CHART.target} fill={CHART.target} fillOpacity={0.12} strokeDasharray="4 4" strokeWidth={2} />
              <Radar name={COVERAGE} dataKey={COVERAGE} stroke={CHART.coverage} fill={CHART.coverage} fillOpacity={0.4} strokeWidth={2} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: any, name: any) => [`${formatNumber(Number(value))}٪`, name]} />
              <Legend wrapperStyle={{ paddingTop: 12, fontSize: 14, fontFamily: CHART.font }} />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 25 }}> {/* check:design-ignore recharts API key names */}
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="nodeName" tick={{ fill: CHART.tick, fontSize: 12, fontFamily: CHART.font }} stroke={CHART.axis} />
              <YAxis stroke={CHART.axis} tick={{ fill: CHART.tick, fontSize: 12 }} domain={[0, 100]} unit="٪" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: any, name: any) => [`${formatNumber(Number(value))}٪`, name]} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 14, fontFamily: CHART.font }} />
              <Bar dataKey={COVERAGE} fill={CHART.coverage} radius={[4, 4, 0, 0]} />
              <Bar dataKey={GAP} fill={CHART.gap} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Domain drill-down */}
      <div className="flex flex-col gap-stack-md border-t border-border-default pt-inset-lg">
        <div className="flex flex-col justify-between gap-inline-sm sm:flex-row sm:items-center">
          <span className="label-md text-text-default">بررسی سریع وضعیت حوزه‌ها (برای دیدن جزئیات یا ثبت دانش انتخاب کن)</span>
          <span className="caption flex flex-wrap items-center gap-inline-md text-text-subtle">
            <span className="inline-flex items-center gap-inline-xs"><Icon name="CircleCheck" size="xs" className="text-icon-success" />کامل</span>
            <span className="inline-flex items-center gap-inline-xs"><Icon name="OctagonAlert" size="xs" className="text-icon-danger" />کسری بحرانی</span>
            <span className="inline-flex items-center gap-inline-xs"><Icon name="TriangleAlert" size="xs" className="text-icon-warning" />فرصت ارتقا</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-inline-sm sm:grid-cols-3 lg:grid-cols-6">
          {chartData.map((node) => {
            const isMissingRequired = requiredNodeIds.includes(node.nodeId) && node.countConfirmed === 0;
            const isMissingSuggested = suggestedNodeIds.includes(node.nodeId) && node.countConfirmed === 0;
            const isFull = node.countConfirmed >= 2;
            const isActive = activeNodeId === node.nodeId;
            const icon: IconName = isMissingRequired ? 'OctagonAlert' : isMissingSuggested ? 'TriangleAlert' : isFull ? 'CircleCheck' : 'Info';
            const iconCls = isMissingRequired ? 'text-icon-danger' : isMissingSuggested ? 'text-icon-warning' : isFull ? 'text-icon-success' : 'text-icon-info';
            return (
              <button
                key={node.nodeId}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActiveNodeId(isActive ? null : node.nodeId);
                  if (onSelectNodeFilter) onSelectNodeFilter(node.nodeId);
                }}
                className={`flex min-h-touch flex-col justify-between gap-stack-sm rounded-control border p-inset-md text-start transition-colors ${
                  isActive
                    ? 'border-border-selected bg-bg-selected'
                    : 'border-border-default bg-surface-raised hover:border-border-default-hover hover:bg-interaction-hover'
                }`}
              >
                <span className="flex items-center justify-between gap-inline-xs">
                  <span className="label-md truncate text-text-default">{node.fullLabel.split(' ')[0]}</span>
                  <Icon name={icon} size="md" className={iconCls} />
                </span>
                <span className="flex items-baseline justify-between gap-inline-xs caption">
                  <span className="text-text-subtle">{formatNumber(node.countConfirmed)} مدرک تأییدشده</span>
                  <span className="label-sm tabular-nums text-text-default">{formatNumber(node[COVERAGE])}٪</span>
                </span>
              </button>
            );
          })}
        </div>

        {selectedNodeData && (
          <div className="flex flex-col justify-between gap-inline-md rounded-control border border-border-default bg-surface-sunken p-inset-lg sm:flex-row sm:items-center">
            <div className="flex flex-col gap-stack-xs">
              <div className="flex flex-wrap items-center gap-inline-sm">
                <span className="title text-text-default">{selectedNodeData.fullLabel}</span>
                {selectedNodeData.isRequired && <Badge intent="danger">پیش‌نیاز الزامی این کار</Badge>}
                {selectedNodeData.isSuggested && <Badge intent="info">پیشنهادی برای کیفیت حداکثری</Badge>}
              </div>
              <p className="body-sm text-text-subtle">
                وضعیت: {formatNumber(selectedNodeData.countConfirmed)} مورد تأییدشده در درخت حقیقت، پوشش {formatNumber(selectedNodeData[COVERAGE])}٪ از نیاز.
                {selectedNodeData[GAP] > 0 ? ` کسری شناسایی‌شده: ${formatNumber(selectedNodeData[GAP])}٪.` : ' این شاخه کامل است.'}
              </p>
            </div>
            <Button
              variant="secondary"
              iconStart="Plus"
              onClick={() => {
                if (onOpenContextModalForNode) onOpenContextModalForNode(selectedNodeData.nodeId);
              }}
            >
              ثبت مستقیم شیء دانش در {selectedNodeData.nodeName}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};
