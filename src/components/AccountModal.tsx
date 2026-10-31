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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs text-right animate-in fade-in">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
          <div>
            <h3 className="text-base font-bold text-white">حساب کاربری (User Account — F1)</h3>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              ورود با موبایل و کد یکبارمصرف، خروجی داده و حریم خصوصی
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] hover:text-white p-1 rounded-md hover:bg-[#27272a] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Mobile phone info */}
          <div className="bg-[#09090b] p-3.5 rounded-xl border border-[#27272a] space-y-2">
            <span className="text-[#a1a1aa] block font-medium">شماره موبایل ثبت‌شده:</span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-white text-sm" dir="ltr">
                {phone}
              </span>
              <span className="text-[10px] text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded font-bold">
                تأییدشده با پیامک ✓
              </span>
            </div>
          </div>

          {/* Privacy statement */}
          <div className="bg-[#09090b] p-3.5 rounded-xl border border-[#27272a] space-y-1.5 text-[#a1a1aa] leading-relaxed">
            <span className="font-bold text-white block">حریم خصوصی داده‌ها:</span>
            <p>
              داده‌های منبع حقیقت و گفتگوهای شما رمزنگاری‌شده نگهداری می‌شوند و هرگز برای آموزش مدل‌های عمومی استفاده نمی‌شوند.
            </p>
          </div>

          {/* Export data */}
          <div className="pt-2 border-t border-[#27272a] space-y-2">
            <span className="font-bold text-white block">پشتیبان‌گیری و خروجی داده:</span>
            <button
              onClick={onExportAllData}
              className="w-full py-2 px-3 text-xs font-semibold text-white bg-[#09090b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#52525b] rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>📥</span>
              <span>خروجی گرفتن از تمام داده‌های منبع حقیقت (JSON)</span>
            </button>
          </div>

          {/* Delete account */}
          <div className="pt-2 border-t border-[#27272a] space-y-2">
            <span className="font-bold text-[#fb7185] block">منطقه خطر (حذف حساب):</span>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full py-2 px-3 text-xs font-medium text-[#fb7185] bg-[#4c0519]/20 hover:bg-[#4c0519]/40 border border-[#e11d48]/40 rounded-lg transition-colors"
              >
                درخواست حذف حساب و پاکسازی داده‌ها
              </button>
            ) : (
              <div className="p-3 bg-[#4c0519]/40 border border-[#e11d48] rounded-lg space-y-2 text-[#fecdd3]">
                <p>
                  معیار پذیرش F1: حذف حساب همهٔ داده‌ها را ظرف ۳۰ روز به طور برگشت‌ناپذیر پاک می‌کند.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="px-3 py-1 text-xs text-[#a1a1aa] hover:text-white"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={() => {
                      onDeleteAccount();
                      onClose();
                    }}
                    className="px-3 py-1 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded"
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
