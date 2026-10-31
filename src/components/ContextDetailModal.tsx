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
    <div className="fixed inset-space-0 z-dialog flex items-center justify-center p-inset-lg bg-bg-scrim text-end">
      <div className="bg-surface-raised border border-border-default rounded-container w-full max-w-form max-h-[90vh] overflow-y-auto shadow-overlay p-inset-xl space-y-stack-lg">
        <div className="flex items-center justify-between border-b border-border-default pb-inset-lg">
          <div>
            <h3 className="text-heading-xs font-bold text-text-default">
              {isSupersedingMode
                ? 'جایگزینی تصمیم (Supersedes) — حفظ تاریخچه'
                : isEditing
                ? 'ویرایش شیء در منبع حقیقت'
                : 'ثبت شیء جدید در منبع حقیقت'}
            </h3>
            <p className="text-body-sm text-text-subtle mt-stack-xs">
              اصل P6: ساختار، خودِ دارایی است. هیچ تصمیمی بدون منشأ و دسته‌بندی رها نمی‌شود.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-default p-inset-xs rounded-control-sm hover:bg-interaction-hover transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-stack-md text-body-sm">
          <div>
            <label className="block text-text-default font-semibold mb-stack-sm">
              عنوان شیء (کوتاه و گویا) <span className="text-text-brand">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: مخاطب هدف اصلی، مرز عدم تخفیف، لحن برند..."
              className="w-full bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-text-default text-body-sm focus:outline-none focus:border-border-brand"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-inline-md">
            <div>
              <label className="block text-text-default font-semibold mb-stack-sm">
                نوع شیء (Context Type)
              </label>
              <select
                aria-label="نوع شیء دانش"
                value={type}
                onChange={(e) => setType(e.target.value as ContextType)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-text-default text-body-sm focus:outline-none focus:border-border-brand"
              >
                <option value="Fact">Fact (واقعیت اثبات‌شده)</option>
                <option value="Decision">Decision (تصمیم آگاهانه)</option>
                <option value="Constraint">Constraint (مرز و خط قرمز)</option>
                <option value="Asset">Asset (خروجی تأییدشده)</option>
              </select>
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-sm">
                وضعیت (Status)
              </label>
              <select
                aria-label="وضعیت شیء دانش"
                value={status}
                onChange={(e) => setStatus(e.target.value as ContextStatus)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-text-default text-body-sm focus:outline-none focus:border-border-brand"
              >
                <option value="Confirmed">Confirmed (تأییدشده و فعال)</option>
                <option value="Proposed">Proposed (پیشنهادی - وارد خروجی نمی‌شود)</option>
                <option value="Needs Review">Needs Review (نیاز به بازبینی)</option>
                <option value="Superseded">Superseded (منسوخ با جایگزین)</option>
                <option value="Archived">Archived (بایگانی)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-inline-md">
            <div>
              <label className="block text-text-default font-semibold mb-stack-sm">
                شاخه در درخت دانش (Tree Node)
              </label>
              <select
                aria-label="شاخه در درخت دانش"
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-text-default text-body-sm focus:outline-none focus:border-border-brand"
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-sm">
                منبع (Provenance)
              </label>
              <select
                aria-label="منبع شیء دانش"
                value={provenance}
                onChange={(e) => setProvenance(e.target.value as ContextProvenance)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-text-default text-body-sm focus:outline-none focus:border-border-brand"
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
            <label className="block text-text-default font-semibold mb-stack-sm">
              محتوای دقیق دانش <span className="text-text-brand">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="توضیح کامل فکت، تصمیم یا خط قرمز به زبان صریح..."
              className="w-full bg-surface-sunken border border-border-default rounded-control-sm p-inset-md text-text-default text-body-sm leading-relaxed focus:outline-none focus:border-border-brand"
            />
          </div>

          {isSupersedingMode && (
            <div className="bg-bg-brand-subtle border border-border-brand-subtle p-inset-md rounded-control-sm space-y-stack-sm">
              <label className="block text-text-brand font-semibold">
                دلیل جایگزینی این تصمیم قبلی:
              </label>
              <input
                type="text"
                value={supersedeReason}
                onChange={(e) => setSupersedeReason(e.target.value)}
                placeholder="مثلاً: تغییر رویکرد استراتژیک پس از بازخورد مشتریان"
                className="w-full bg-surface-sunken border border-border-default rounded-indicator px-inset-md py-inset-sm text-body-sm text-text-default"
              />
              <p className="text-caption text-text-subtle">
                تصمیم قبلی پاک نخواهد شد؛ بلکه با رابطه supersedes در تاریخچه منبع حقیقت باقی می‌ماند.
              </p>
            </div>
          )}

          <div className="pt-inset-lg border-t border-border-default flex flex-wrap items-center justify-between gap-inline-md">
            <div className="flex items-center gap-inline-sm">
              {isEditing && !isSupersedingMode && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsSupersedingMode(true)}
                    className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-warning bg-bg-warning-subtle hover:bg-bg-warning-subtle rounded-control-sm transition-colors border border-border-warning-subtle"
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
                    className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-brand hover:bg-bg-brand-subtle rounded-control-sm transition-colors"
                  >
                    بایگانی
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-inline-sm">
              <button
                type="button"
                onClick={onClose}
                className="px-inset-lg py-inset-sm text-body-sm font-semibold text-text-subtle hover:text-text-default rounded-control-sm hover:bg-interaction-hover transition-colors"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-inset-lg py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shadow-raised"
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
