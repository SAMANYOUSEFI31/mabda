/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Workspace } from '../types';
import { Badge, Button, Card, Dialog, Icon } from '../ui';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onExportAllData: () => void;
  onDeleteAccount: () => void;
  onOpenAiSettings: () => void;
  onOpenConnect: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onExportAllData,
  onDeleteAccount,
  onOpenAiSettings,
  onOpenConnect,
}) => {
  const [phone] = useState('09123456789');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const closeAll = () => {
    setDeleteConfirm(false);
    onClose();
  };

  return (
    <>
      <Dialog
        open={isOpen && !deleteConfirm}
        onClose={closeAll}
        title="حساب کاربری"
        description="ورود با موبایل و کد یکبارمصرف، خروجی داده و حریم خصوصی"
      >
        <div className="flex flex-col gap-stack-md">
          <Card padding="lg" className="flex flex-col gap-stack-sm">
            <span className="label-md text-text-subtle">شمارهٔ موبایل ثبت‌شده</span>
            <div className="flex items-center justify-between gap-inline-md">
              <span className="code text-text-default" dir="ltr">{phone}</span>
              <Badge intent="success">تأییدشده با پیامک</Badge>
            </div>
          </Card>

          <Card padding="lg" className="flex flex-col gap-stack-xs">
            <span className="label-md text-text-default">حریم خصوصی داده‌ها</span>
            <p className="body-sm text-text-subtle">
              داده‌های منبع حقیقت و گفتگوهای شما رمزنگاری‌شده نگهداری می‌شوند و هرگز برای آموزش مدل‌های عمومی استفاده نمی‌شوند.
            </p>
          </Card>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md text-text-default">هوش مصنوعی</span>
            <Button variant="secondary" iconStart="Settings" fullWidth onClick={onOpenAiSettings}>کلید API شخصی من و وضعیت مدل‌ها</Button>
            <Button variant="secondary" iconStart="Link2" fullWidth onClick={() => { onClose(); onOpenConnect(); }}>اتصال به Claude و AIهای دیگر (MCP)</Button>
          </div>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md text-text-default">پشتیبان‌گیری و خروجی داده</span>
            <Button variant="secondary" iconStart="Download" fullWidth onClick={onExportAllData}>
              خروجی گرفتن از تمام داده‌های منبع حقیقت (JSON)
            </Button>
          </div>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md inline-flex items-center gap-inline-xs text-text-danger">
              <Icon name="OctagonAlert" size="md" />
              منطقهٔ خطر
            </span>
            <Button variant="danger" iconStart="Trash2" fullWidth onClick={() => setDeleteConfirm(true)}>
              درخواست حذف حساب و پاکسازی داده‌ها
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        alert
        size="sm"
        open={isOpen && deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="حذف حساب؟"
        description="حذف حساب همهٔ داده‌ها را ظرف ۳۰ روز به‌طور برگشت‌ناپذیر پاک می‌کند. اگر مطمئن نیستی، انصراف بده."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>انصراف</Button>
            <Button
              variant="danger-bold"
              onClick={() => {
                onDeleteAccount();
                closeAll();
              }}
            >
              حذف حساب
            </Button>
          </>
        }
      />
    </>
  );
};
