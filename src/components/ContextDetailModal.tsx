/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, ContextProvenance, ContextStatus, ContextType, TreeNode } from '../types';
import { DEFAULT_TREE_NODES } from '../core/specs';

interface ContextDetailModalProps {
  object: ContextObject | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (saved: ContextObject) => void;
  onSupersede: (oldId: string, newObj: Omit<ContextObject, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onArchive: (id: string) => void;
  nodes?: TreeNode[];
  defaultNodeId?: string;
}

export const ContextDetailModal: React.FC<ContextDetailModalProps> = ({
  object,
  isOpen,
  onClose,
  onSave,
  onSupersede,
  onArchive,
  nodes = DEFAULT_TREE_NODES,
  defaultNodeId = 'business',
}) => {
  if (!isOpen) return null;

  const isEditing = !!object;

  const [title, setTitle] = useState(object?.title || '');
  const [content, setContent] = useState(object?.content || '');
  const [type, setType] = useState<ContextType>(object?.type || 'Decision');
  const [status, setStatus] = useState<ContextStatus>(object?.status || 'Confirmed');
  const [nodeId, setNodeId] = useState(object?.nodeId || defaultNodeId);
  const [provenance, setProvenance] = useState<ContextProvenance>(
    object?.provenance || 'User Input'
  );
  const [isSupersedingMode, setIsSupersedingMode] = useState(false);
  const [supersedeReason, setSupersedeReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (isSupersedingMode && object) {
      onSupersede(object.id, {
        workspaceId: object.workspaceId,
        type,
        status: 'Confirmed',
        provenance: 'User Input',
        title,
        content: `${content}\n\n[دلیل جایگزینی: ${supersedeReason || 'به‌روزرسانی تصمیم'}]`,
        nodeId,
      });
      onClose();
      return;
    }

    const updated: ContextObject = {
      id: object?.id || `ctx_${Date.now()}`,
      workspaceId: object?.workspaceId || 'ws_studio',
      type,
      status,
      provenance,
      title: title.trim(),
      content: content.trim(),
      nodeId,
      supersededById: object?.supersededById,
      createdAt: object?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs text-right animate-in fade-in">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              {isSupersedingMode
                ? 'جایگزینی تصمیم (Supersedes) — حفظ تاریخچه'
                : isEditing
                ? 'ویرایش شیء در منبع حقیقت'
                : 'ثبت شیء جدید در منبع حقیقت'}
            </h3>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              اصل P6: ساختار، خودِ دارایی است. هیچ تصمیمی بدون منشأ و دسته‌بندی رها نمی‌شود.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] hover:text-white p-1 rounded-md hover:bg-[#27272a] transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[#d4d4d8] font-medium mb-1.5">
              عنوان شیء (کوتاه و گویا) <span className="text-[#e11d48]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: مخاطب هدف اصلی، مرز عدم تخفیف، لحن برند..."
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#e11d48]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#d4d4d8] font-medium mb-1.5">
                نوع شیء (Context Type)
              </label>
              <select
                aria-label="نوع شیء دانش"
                value={type}
                onChange={(e) => setType(e.target.value as ContextType)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#e11d48]"
              >
                <option value="Fact">Fact (واقعیت اثبات‌شده)</option>
                <option value="Decision">Decision (تصمیم آگاهانه)</option>
                <option value="Constraint">Constraint (مرز و خط قرمز)</option>
                <option value="Asset">Asset (خروجی تأییدشده)</option>
              </select>
            </div>

            <div>
              <label className="block text-[#d4d4d8] font-medium mb-1.5">
                وضعیت (Status)
              </label>
              <select
                aria-label="وضعیت شیء دانش"
                value={status}
                onChange={(e) => setStatus(e.target.value as ContextStatus)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#e11d48]"
              >
                <option value="Confirmed">Confirmed (تأییدشده و فعال)</option>
                <option value="Proposed">Proposed (پیشنهادی - وارد خروجی نمی‌شود)</option>
                <option value="Needs Review">Needs Review (نیاز به بازبینی)</option>
                <option value="Superseded">Superseded (منسوخ با جایگزین)</option>
                <option value="Archived">Archived (بایگانی)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#d4d4d8] font-medium mb-1.5">
                شاخه در درخت دانش (Tree Node)
              </label>
              <select
                aria-label="شاخه در درخت دانش"
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#e11d48]"
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#d4d4d8] font-medium mb-1.5">
                منبع (Provenance)
              </label>
              <select
                aria-label="منبع شیء دانش"
                value={provenance}
                onChange={(e) => setProvenance(e.target.value as ContextProvenance)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#e11d48]"
              >
                <option value="User Input">User Input (ورودی مستقیم کاربر)</option>
                <option value="Onboarding">Onboarding (فرم شروع سریع)</option>
                <option value="AI Suggested">AI Suggested (پیشنهاد تأییدشده AI)</option>
                <option value="Asset Derived">Asset Derived (استخراج‌شده از خروجی)</option>
                <option value="Imported">Imported (منبع واردشده)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[#d4d4d8] font-medium mb-1.5">
              محتوای دقیق دانش <span className="text-[#e11d48]">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="توضیح کامل فکت، تصمیم یا خط قرمز به زبان صریح..."
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-3 text-white text-xs leading-relaxed focus:outline-none focus:border-[#e11d48]"
            />
          </div>

          {isSupersedingMode && (
            <div className="bg-[#4c0519]/40 border border-[#e11d48]/40 p-3 rounded-lg space-y-1.5">
              <label className="block text-[#fb7185] font-semibold">
                دلیل جایگزینی این تصمیم قبلی:
              </label>
              <input
                type="text"
                value={supersedeReason}
                onChange={(e) => setSupersedeReason(e.target.value)}
                placeholder="مثلاً: تغییر رویکرد استراتژیک پس از بازخورد مشتریان"
                className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-1.5 text-xs text-white"
              />
              <p className="text-[11px] text-[#a1a1aa]">
                تصمیم قبلی پاک نخواهد شد؛ بلکه با رابطه supersedes در تاریخچه منبع حقیقت باقی می‌ماند.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-[#27272a] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isEditing && !isSupersedingMode && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsSupersedingMode(true)}
                    className="px-3 py-1.5 text-xs font-medium text-[#fbbf24] bg-[#78350f]/30 hover:bg-[#78350f]/60 rounded-lg transition-colors border border-[#f59e0b]/30"
                  >
                    جایگزینی تصمیم (Supersede)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (object) {
                        onArchive(object.id);
                        onClose();
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-[#fb7185] hover:bg-[#4c0519]/30 rounded-lg transition-colors"
                  >
                    بایگانی
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-[#a1a1aa] hover:text-white rounded-lg hover:bg-[#27272a] transition-colors"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shadow-sm"
              >
                {isSupersedingMode ? 'ثبت جایگزینی' : isEditing ? 'ذخیره تغییرات' : 'ثبت در منبع حقیقت'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
