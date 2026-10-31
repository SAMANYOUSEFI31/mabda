/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Workspace } from '../types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onExportAllData: () => void;
  onDeleteAccount: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onExportAllData,
  onDeleteAccount,
}) => {
  if (!isOpen) return null;

  const [phone, setPhone] = useState('۰۹۱۲۳۴۵۶۷۸۹');
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isVerified, setIsVerified] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <div className="fixed inset-space-0 z-dialog flex items-center justify-center p-inset-lg bg-bg-scrim text-end">
      <div className="bg-surface-raised border border-border-default rounded-container w-full max-w-overlay-md shadow-overlay p-inset-xl space-y-stack-lg">
        <div className="flex items-center justify-between border-b border-border-default pb-inset-md">
          <div>
            <h3 className="text-body-md font-bold text-text-default">حساب کاربری (User Account — F1)</h3>
            <p className="text-body-sm text-text-subtle mt-stack-xs">
              ورود با موبایل و کد یکبارمصرف، خروجی داده و حریم خصوصی
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-default p-inset-xs rounded-control-sm hover:bg-interaction-hover transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-stack-md text-body-sm">
          {/* Mobile phone info */}
          <div className="bg-surface-sunken p-inset-lg rounded-control border border-border-default space-y-stack-sm">
            <span className="text-text-subtle block font-semibold">شماره موبایل ثبت‌شده:</span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-text-default text-body-md" dir="ltr">
                {phone}
              </span>
              <span className="text-caption text-text-success bg-bg-success-subtle px-inset-sm py-inset-xs rounded-indicator font-bold">
                تأییدشده با پیامک ✓
              </span>
            </div>
          </div>

          {/* Privacy statement */}
          <div className="bg-surface-sunken p-inset-lg rounded-control border border-border-default space-y-stack-sm text-text-subtle leading-relaxed">
            <span className="font-bold text-text-default block">حریم خصوصی داده‌ها:</span>
            <p>
              داده‌های منبع حقیقت و گفتگوهای شما رمزنگاری‌شده نگهداری می‌شوند و هرگز برای آموزش مدل‌های عمومی استفاده نمی‌شوند.
            </p>
          </div>

          {/* Export data */}
          <div className="pt-inset-sm border-t border-border-default space-y-stack-sm">
            <span className="font-bold text-text-default block">پشتیبان‌گیری و خروجی داده:</span>
            <button
              onClick={onExportAllData}
              className="w-full py-inset-sm px-inset-md text-body-sm font-semibold text-text-default bg-surface-sunken hover:bg-interaction-hover border border-border-default hover:border-border-bold rounded-control-sm transition-colors flex items-center justify-center gap-inline-sm"
            >
              <span>📥</span>
              <span>خروجی گرفتن از تمام داده‌های منبع حقیقت (JSON)</span>
            </button>
          </div>

          {/* Delete account */}
          <div className="pt-inset-sm border-t border-border-default space-y-stack-sm">
            <span className="font-bold text-text-brand block">منطقه خطر (حذف حساب):</span>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full py-inset-sm px-inset-md text-body-sm font-semibold text-text-brand bg-bg-brand-subtle hover:bg-bg-brand-subtle border border-border-brand-subtle rounded-control-sm transition-colors"
              >
                درخواست حذف حساب و پاکسازی داده‌ها
              </button>
            ) : (
              <div className="p-inset-md bg-bg-brand-subtle border border-border-brand rounded-control-sm space-y-stack-sm text-text-brand">
                <p>
                  معیار پذیرش F1: حذف حساب همهٔ داده‌ها را ظرف ۳۰ روز به طور برگشت‌ناپذیر پاک می‌کند.
                </p>
                <div className="flex items-center justify-end gap-inline-sm pt-inset-xs">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="px-inset-md py-inset-xs text-body-sm text-text-subtle hover:text-text-default"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={() => {
                      onDeleteAccount();
                      onClose();
                    }}
                    className="px-inset-md py-inset-xs text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-indicator"
                  >
                    تأیید نهایی حذف حساب
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
