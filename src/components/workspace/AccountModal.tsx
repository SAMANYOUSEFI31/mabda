/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Workspace } from '../../types';
import { Button, Card, Dialog, Icon } from '../../ui';
import { DangerDialog } from '../shared/Removal';
import { WIPE_WORDS } from './wipeWords';
export { WIPE_WORDS };

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onExportAllData: () => void;
  /** «بایگانی»: everything that is out of the way, with «برگردان» and «حذف دائمی» */
  onOpenArchive: () => void;
  onArchiveWorkspace: () => Promise<void>;
  /** the name was typed (the showcase needs no typing) */
  onDeleteWorkspace: () => Promise<void>;
  /** every piece of data of this install, for good */
  onDeleteEverything: () => Promise<void>;
}

/**
 * «حساب و داده‌ها». There is no sign-in, phone number or SMS in this product (one local user), so none is shown; what is here is
 * real: the export, and the three levels of removal — archive a workspace, delete it, delete everything.
 */
export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, currentWorkspace, onExportAllData, onOpenArchive, onArchiveWorkspace, onDeleteWorkspace, onDeleteEverything }) => {
  const [confirm, setConfirm] = useState<null | 'workspace' | 'everything'>(null);
  const closeAll = () => { setConfirm(null); onClose(); };

  return (
    <>
      <Dialog open={isOpen && !confirm} onClose={closeAll} title="حساب و داده‌ها" description="خروجی داده، بایگانی و حذف فضا.">
        <div className="flex flex-col gap-stack-md">
          <Card padding="lg" className="flex flex-col gap-stack-xs">
            <span className="label-md text-text-default">داده‌های تو کجاست؟</span>
            <p className="body-sm text-text-subtle">
              دانش، یادداشت‌ها و خروجی‌هایت در پایگاه‌دادهٔ همین نصب مبدأ می‌ماند. هیچ‌چیز خودکار به جایی فرستاده نمی‌شود؛ بسته‌های دانش را خودت کپی می‌کنی و یادداشت‌های آزاد هرگز در آن‌ها نمی‌آیند.
            </p>
          </Card>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md text-text-default">پشتیبان‌گیری و خروجی داده</span>
            <Button variant="secondary" iconStart="Download" fullWidth onClick={onExportAllData}>خروجی گرفتن از تمام داده‌های منبع حقیقت (JSON)</Button>
          </div>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md text-text-default">بایگانی و حذف</span>
            <p className="body-sm text-text-subtle">بایگانی برمی‌گردد و تاریخچه را نگه می‌دارد؛ «حذف دائمی» برنمی‌گردد.</p>
            <Button variant="secondary" iconStart="Archive" fullWidth onClick={() => { onClose(); onOpenArchive(); }}>بایگانی و حذف‌های اخیر</Button>
            <Button variant="secondary" iconStart="Archive" fullWidth onClick={async () => { await onArchiveWorkspace(); closeAll(); }}>بایگانی فضا «{currentWorkspace.name}»</Button>
          </div>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md inline-flex items-center gap-inline-xs text-text-danger">
              <Icon name="OctagonAlert" size="md" />
              منطقهٔ خطر
            </span>
            <Button variant="danger" iconStart="Trash2" fullWidth onClick={() => setConfirm('workspace')}>حذف دائمی فضا «{currentWorkspace.name}»…</Button>
            <Button variant="danger" iconStart="Trash2" fullWidth onClick={() => setConfirm('everything')}>حذف همهٔ داده‌ها…</Button>
          </div>
        </div>
      </Dialog>

      <DangerDialog
        open={isOpen && confirm === 'workspace'} onClose={() => setConfirm(null)} title={`حذف دائمی «${currentWorkspace.name}»`}
        description="همهٔ دانش، یادداشت‌ها، خروجی‌ها، فایل‌ها، بسته‌ها و تاریخچهٔ همین فضا برای همیشه پاک می‌شود. فضاهای دیگر دست نمی‌خورند. اگر فقط می‌خواهی کنار برود، «بایگانی» را بزن."
        confirmLabel="حذف دائمی فضا" typed={currentWorkspace.isDemo ? undefined : { phrase: currentWorkspace.name, label: 'نام فضا' }} ack="می‌فهمم که این کار برنمی‌گردد"
        onConfirm={async () => { await onDeleteWorkspace(); closeAll(); }}
      />
      <DangerDialog
        open={isOpen && confirm === 'everything'} onClose={() => setConfirm(null)} title="حذف همهٔ داده‌ها"
        description="همهٔ فضاهای کاری و هرچه در آن‌هاست (دانش، یادداشت‌ها، خروجی‌ها، فایل‌ها، بسته‌ها، قالب‌ها و تاریخچه) از این نصب برای همیشه پاک می‌شود. بعدش برنامه خالی شروع می‌شود. اگر نسخهٔ پشتیبان می‌خواهی، اول «خروجی گرفتن» را بزن."
        confirmLabel="حذف همهٔ داده‌ها" typed={{ phrase: WIPE_WORDS, label: 'عبارت تأیید' }}
        onConfirm={async () => { await onDeleteEverything(); closeAll(); }}
      />
    </>
  );
};
