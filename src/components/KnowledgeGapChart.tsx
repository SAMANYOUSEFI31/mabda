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
    <div className="bg-[#121215] border border-[#27272a] rounded-2xl p-5 sm:p-6 space-y-6 text-right transition-all shadow-xl">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#27272a] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48] animate-pulse" />
            <h3 className="text-base font-bold text-white tracking-tight">
              رادار و تحلیل بصری شکاف‌های دانش (Knowledge Gap Radar)
            </h3>
          </div>
          <p className="text-xs text-[#a1a1aa] mt-1">
            مقایسه هوشمند میان «دانش تأییدشده در منبع حقیقت» با «اهداف و نیازمندی‌های این جریان کار»
          </p>
        </div>

        {/* View Switcher: Radar vs Bar */}
        <div className="flex items-center gap-1 bg-[#18181b] border border-[#27272a] p-1 rounded-xl text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setChartType('radar')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              chartType === 'radar'
                ? 'bg-[#e11d48] text-white shadow-xs'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            <span>🕸️</span>
            <span>نمودار راداری</span>
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              chartType === 'bar'
                ? 'bg-[#e11d48] text-white shadow-xs'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            <span>📊</span>
            <span>نمودار میله‌ای</span>
          </button>
        </div>
      </div>

      {/* High-level KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3">
          <span className="text-[#a1a1aa] block text-[11px]">نمره آمادگی جریان</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className={`text-2xl font-bold font-mono ${
                readiness.score >= 80
                  ? 'text-[#10b981]'
                  : readiness.score >= 50
                  ? 'text-[#f59e0b]'
                  : 'text-[#e11d48]'
              }`}
            >
              {readiness.score}٪
            </span>
            <span className="text-[10px] text-[#71717a]">از ۱۰۰</span>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3">
          <span className="text-[#a1a1aa] block text-[11px]">شکاف‌های بحرانی مسدودکننده</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className={`text-2xl font-bold font-mono ${
                missingRequiredCount > 0 ? 'text-[#e11d48]' : 'text-[#10b981]'
              }`}
            >
              {missingRequiredCount}
            </span>
            <span className="text-[10px] text-[#71717a]">حوزه بدون مدرک</span>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3">
          <span className="text-[#a1a1aa] block text-[11px]">فرصت‌های بهبود تکمیلی</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold font-mono text-[#38bdf8]">
              {missingSuggestedCount}
            </span>
            <span className="text-[10px] text-[#71717a]">پیشنهاد ارتقا</span>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3">
          <span className="text-[#a1a1aa] block text-[11px]">وضعیت تولید دارایی</span>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isReady ? 'bg-[#10b981]' : 'bg-[#e11d48]'
              }`}
            />
            <span
              className={`font-semibold text-xs ${
                isReady ? 'text-[#10b981]' : 'text-[#e11d48]'
              }`}
            >
              {isReady ? 'آماده تولید باکیفیت' : 'نیاز به رفع کسری'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="h-72 sm:h-80 w-full flex items-center justify-center pt-2" dir="ltr">
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
      <div className="space-y-3 pt-2 border-t border-[#27272a]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">
            بررسی سریع وضعیت حوزه‌ها (برای مشاهده جزئیات یا ثبت فکت کلیک کنید):
          </span>
          <span className="text-[#a1a1aa] text-[11px]">
            راهنما: سبز = کامل | قرمز = کسری بحرانی | نارنجی = فرصت ارتقا
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
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
                className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
                  activeNodeId === node.nodeId
                    ? 'border-[#e11d48] bg-[#e11d48]/10 ring-1 ring-[#e11d48]'
                    : isMissingRequired
                    ? 'border-[#e11d48]/40 bg-[#e11d48]/5 hover:border-[#e11d48]'
                    : isMissingSuggested
                    ? 'border-[#f59e0b]/40 bg-[#f59e0b]/5 hover:border-[#f59e0b]'
                    : 'border-[#27272a] bg-[#18181b] hover:border-[#3f3f46]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white truncate">
                    {node.fullLabel.split(' ')[0]}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isMissingRequired
                        ? 'bg-[#e11d48]'
                        : isMissingSuggested
                        ? 'bg-[#f59e0b]'
                        : isFull
                        ? 'bg-[#10b981]'
                        : 'bg-[#38bdf8]'
                    }`}
                  />
                </div>

                <div className="mt-2 flex items-baseline justify-between text-[10px]">
                  <span className="text-[#a1a1aa]">{node.countConfirmed} مدرک تاییدشده</span>
                  <span
                    className={`font-mono font-bold ${
                      isMissingRequired
                        ? 'text-[#e11d48]'
                        : isMissingSuggested
                        ? 'text-[#f59e0b]'
                        : 'text-[#10b981]'
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
          <div className="p-3.5 bg-[#18181b] border border-[#27272a] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="space-y-0.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{selectedNodeData.fullLabel}</span>
                {selectedNodeData.isRequired && (
                  <span className="text-[10px] text-[#e11d48] font-semibold bg-[#e11d48]/15 px-2 py-0.5 rounded">
                    پیش‌نیاز الزامی این کار
                  </span>
                )}
                {selectedNodeData.isSuggested && (
                  <span className="text-[10px] text-[#38bdf8] font-semibold bg-[#38bdf8]/15 px-2 py-0.5 rounded">
                    پیشنهادی برای کیفیت حداکثری
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#a1a1aa]">
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
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-xs"
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
