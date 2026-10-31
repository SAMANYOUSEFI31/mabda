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

  return (
    <div className="bg-surface-raised border border-border-default rounded-container p-inset-lg sm:p-inset-xl space-y-stack-lg text-end transition-all shadow-overlay">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-inline-lg border-b border-border-default pb-inset-lg">
        <div>
          <div className="flex items-center gap-inline-sm">
            <span className="w-space-3 h-space-3 rounded-pill bg-bg-brand-bold" />
            <h3 className="text-body-md font-bold text-text-default">
              رادار و تحلیل بصری شکاف‌های دانش (Knowledge Gap Radar)
            </h3>
          </div>
          <p className="text-body-sm text-text-subtle mt-stack-xs">
            مقایسه هوشمند میان «دانش تأییدشده در منبع حقیقت» با «اهداف و نیازمندی‌های این جریان کار»
          </p>
        </div>

        {/* View Switcher: Radar vs Bar */}
        <div className="flex items-center gap-inline-xs bg-surface-raised border border-border-default p-inset-xs rounded-control text-body-sm self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setChartType('radar')}
            className={`px-inset-md py-inset-sm rounded-control-sm font-semibold transition-all flex items-center gap-inline-sm ${
              chartType === 'radar'
                ? 'bg-bg-brand-bold text-text-default shadow-raised'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            <span>🕸️</span>
            <span>نمودار راداری</span>
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-inset-md py-inset-sm rounded-control-sm font-semibold transition-all flex items-center gap-inline-sm ${
              chartType === 'bar'
                ? 'bg-bg-brand-bold text-text-default shadow-raised'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            <span>📊</span>
            <span>نمودار میله‌ای</span>
          </button>
        </div>
      </div>

      {/* High-level KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-inline-md text-body-sm">
        <div className="bg-surface-raised border border-border-default rounded-control p-inset-md">
          <span className="text-text-subtle block text-caption">نمره آمادگی جریان</span>
          <div className="flex items-baseline gap-inline-xs mt-stack-xs">
            <span
              className={`text-heading-md font-bold font-mono ${
                readiness.score >= 80
                  ? 'text-text-success'
                  : readiness.score >= 50
                  ? 'text-text-warning'
                  : 'text-text-brand'
              }`}
            >
              {readiness.score}٪
            </span>
            <span className="text-caption text-text-subtlest">از ۱۰۰</span>
          </div>
        </div>

        <div className="bg-surface-raised border border-border-default rounded-control p-inset-md">
          <span className="text-text-subtle block text-caption">شکاف‌های بحرانی مسدودکننده</span>
          <div className="flex items-baseline gap-inline-xs mt-stack-xs">
            <span
              className={`text-heading-md font-bold font-mono ${
                missingRequiredCount > 0 ? 'text-text-brand' : 'text-text-success'
              }`}
            >
              {missingRequiredCount}
            </span>
            <span className="text-caption text-text-subtlest">حوزه بدون مدرک</span>
          </div>
        </div>

        <div className="bg-surface-raised border border-border-default rounded-control p-inset-md">
          <span className="text-text-subtle block text-caption">فرصت‌های بهبود تکمیلی</span>
          <div className="flex items-baseline gap-inline-xs mt-stack-xs">
            <span className="text-heading-md font-bold font-mono text-text-info">
              {missingSuggestedCount}
            </span>
            <span className="text-caption text-text-subtlest">پیشنهاد ارتقا</span>
          </div>
        </div>

        <div className="bg-surface-raised border border-border-default rounded-control p-inset-md">
          <span className="text-text-subtle block text-caption">وضعیت تولید دارایی</span>
          <div className="mt-stack-xs flex items-center gap-inline-sm">
            <span
              className={`w-space-2 h-space-2 rounded-pill ${
                isReady ? 'bg-bg-success-bold' : 'bg-bg-brand-bold'
              }`}
            />
            <span
              className={`font-semibold text-body-sm ${
                isReady ? 'text-text-success' : 'text-text-brand'
              }`}
            >
              {isReady ? 'آماده تولید باکیفیت' : 'نیاز به رفع کسری'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="h-space-40 sm:h-space-8 w-full flex items-center justify-center pt-inset-sm" dir="ltr">
        {chartType === 'radar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis
                dataKey="nodeName"
                tick={{ fill: '#e4e4e7', fontSize: 11, fontFamily: 'Vazirmatn' }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                stroke="#3f3f46"
                tick={{ fill: '#71717a', fontSize: 9 }}
              />
              <Radar
                name="هدف موردنیاز"
                dataKey="هدف موردنیاز"
                stroke="#38bdf8"
                fill="#38bdf8"
                fillOpacity={0.12}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <Radar
                name="پوشش دانش موجود"
                dataKey="پوشش دانش موجود"
                stroke="#e11d48"
                fill="#e11d48"
                fillOpacity={0.4}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: '#27272a',
                  borderRadius: '12px',
                  color: '#fafafa',
                  fontFamily: 'Vazirmatn',
                  textAlign: 'right',
                  direction: 'rtl',
                  fontSize: '11px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                }}
                formatter={(value: any, name: any) => [`${value}٪`, name]}
              />
              <Legend
                wrapperStyle={{
                  paddingTop: '12px',
                  fontSize: '11px',
                  fontFamily: 'Vazirmatn',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 10, left: 10, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="nodeName"
                tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'Vazirmatn' }}
                stroke="#3f3f46"
              />
              <YAxis
                stroke="#3f3f46"
                tick={{ fill: '#71717a', fontSize: 10 }}
                domain={[0, 100]}
                unit="٪"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: '#27272a',
                  borderRadius: '12px',
                  color: '#fafafa',
                  fontFamily: 'Vazirmatn',
                  textAlign: 'right',
                  direction: 'rtl',
                  fontSize: '11px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                }}
                formatter={(value: any, name: any) => [`${value}٪`, name]}
              />
              <Legend
                wrapperStyle={{
                  paddingTop: '8px',
                  fontSize: '11px',
                  fontFamily: 'Vazirmatn',
                }}
              />
              <Bar dataKey="پوشش دانش موجود" fill="#e11d48" radius={[4, 4, 0, 0]} />
              <Bar dataKey="شکاف دانشی" fill="#f59e0b" radius={[4, 4, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Interactive Domain Drill-Down Bar */}
      <div className="space-y-stack-md pt-inset-sm border-t border-border-default">
        <div className="flex items-center justify-between text-body-sm">
          <span className="font-semibold text-text-default">
            بررسی سریع وضعیت حوزه‌ها (برای مشاهده جزئیات یا ثبت فکت کلیک کنید):
          </span>
          <span className="text-text-subtle text-caption">
            راهنما: سبز = کامل | قرمز = کسری بحرانی | نارنجی = فرصت ارتقا
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-inline-sm">
          {chartData.map((node) => {
            const isMissingRequired = requiredNodeIds.includes(node.nodeId) && node.countConfirmed === 0;
            const isMissingSuggested = suggestedNodeIds.includes(node.nodeId) && node.countConfirmed === 0;
            const isFull = node.countConfirmed >= 2;

            return (
              <button
                key={node.nodeId}
                type="button"
                onClick={() => {
                  setActiveNodeId(activeNodeId === node.nodeId ? null : node.nodeId);
                  if (onSelectNodeFilter) onSelectNodeFilter(node.nodeId);
                }}
                className={`p-inset-md rounded-control border text-end transition-all flex flex-col justify-between ${
                  activeNodeId === node.nodeId
                    ? 'border-border-brand bg-bg-brand-subtle ring-1 ring-border-brand'
                    : isMissingRequired
                    ? 'border-border-brand-subtle bg-bg-brand-subtle hover:border-border-brand'
                    : isMissingSuggested
                    ? 'border-border-warning-subtle bg-bg-warning-subtle hover:border-border-warning'
                    : 'border-border-default bg-surface-raised hover:border-border-bold'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-caption font-bold text-text-default truncate">
                    {node.fullLabel.split(' ')[0]}
                  </span>
                  <span
                    className={`w-space-2 h-space-2 rounded-pill ${
                      isMissingRequired
                        ? 'bg-bg-brand-bold'
                        : isMissingSuggested
                        ? 'bg-bg-warning-bold'
                        : isFull
                        ? 'bg-bg-success-bold'
                        : 'bg-bg-info-bold'
                    }`}
                  />
                </div>

                <div className="mt-stack-sm flex items-baseline justify-between text-caption">
                  <span className="text-text-subtle">{node.countConfirmed} مدرک تاییدشده</span>
                  <span
                    className={`font-mono font-bold ${
                      isMissingRequired
                        ? 'text-text-brand'
                        : isMissingSuggested
                        ? 'text-text-warning'
                        : 'text-text-success'
                    }`}
                  >
                    {node['پوشش دانش موجود']}٪
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Node Action Drawer */}
        {selectedNodeData && (
          <div className="p-inset-lg bg-surface-raised border border-border-default rounded-control flex flex-col sm:flex-row sm:items-center justify-between gap-inline-md">
            <div className="space-y-stack-xs text-body-sm">
              <div className="flex items-center gap-inline-sm">
                <span className="font-bold text-text-default">{selectedNodeData.fullLabel}</span>
                {selectedNodeData.isRequired && (
                  <span className="text-caption text-text-brand font-semibold bg-bg-brand-subtle px-inset-sm py-inset-xs rounded-indicator">
                    پیش‌نیاز الزامی این کار
                  </span>
                )}
                {selectedNodeData.isSuggested && (
                  <span className="text-caption text-text-info font-semibold bg-bg-info-subtle px-inset-sm py-inset-xs rounded-indicator">
                    پیشنهادی برای کیفیت حداکثری
                  </span>
                )}
              </div>
              <p className="text-caption text-text-subtle">
                وضعیت: {selectedNodeData.countConfirmed} فکت تأییدشده در درخت حقیقت، پوشش{' '}
                {selectedNodeData['پوشش دانش موجود']}٪ از نیاز.
                {selectedNodeData['شکاف دانشی'] > 0
                  ? ` کسری شناسایی‌شده: ${selectedNodeData['شکاف دانشی']}٪.`
                  : ' این شاخه کامل است.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onOpenContextModalForNode) {
                  onOpenContextModalForNode(selectedNodeData.nodeId);
                }
              }}
              className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shrink-0 flex items-center justify-center gap-inline-sm shadow-raised"
            >
              <span>+</span>
              <span>ثبت مستقیم شیء دانش در {selectedNodeData.nodeName}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
