/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Workspace } from '../../types';
import { Button, Card, Dialog, Icon } from '../../ui';
import { DangerDialog } from '../shared/Removal';
import { WIPE_WORDS } from './wipeWords';
export { WIPE_WORDS };

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  /** the whole current workspace as one backup file (BETA-01) */
  onExportAllData: () => void;
  /** a backup file comes back as a new workspace; true = done */
  onRestoreBackup: (file: File) => Promise<boolean>;
  /** «بایگانی»: everything that is out of the way, with «برگردان» and «حذف دائمی» */
  onOpenArchive: () => void;
  onArchiveWorkspace: () => Promise<void>;
  /** the name was typed (the showcase needs no typing) */
  onDeleteWorkspace: () => Promise<void>;
  /** every piece of data of this install, for good */
  onDeleteEverything: () => Promise<void>;
}

/**
 * «حساب و داده‌ها». Signing in is a personal link (online) or nothing at all (one person on their own computer); there is no
 * password, phone number or SMS, so none is shown. What is here is real: the backup and its restore, and the three levels of
 * removal — archive a workspace, delete it, delete everything of this person (never anyone else's).
 */
export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, currentWorkspace, onExportAllData, onRestoreBackup, onOpenArchive, onArchiveWorkspace, onDeleteWorkspace, onDeleteEverything }) => {
  const [confirm, setConfirm] = useState<null | 'workspace' | 'everything'>(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeAll = () => { setConfirm(null); onClose(); };

  return (
    <>
      <Dialog open={isOpen && !confirm} onClose={closeAll} title="حساب و داده‌ها" description="خروجی داده، بایگانی و حذف فضا.">
        <div className="flex flex-col gap-stack-md">
          <Card padding="lg" className="flex flex-col gap-stack-xs">
            <span className="label-md text-text-default">داده‌های تو کجاست؟</span>
            <p className="body-sm text-text-subtle">
              دانش، یادداشت‌ها و خروجی‌هایت در پایگاه‌دادهٔ همین مبدأ می‌ماند و فقط با ورود خودت دیده می‌شود. هیچ‌چیز خودکار به جای دیگری فرستاده نمی‌شود؛ بسته‌های دانش را خودت کپی می‌کنی و یادداشت‌های آزاد هرگز در آن‌ها نمی‌آیند.
            </p>
          </Card>

          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md text-text-default">پشتیبان‌گیری و خروجی داده</span>
            <p className="body-sm text-text-subtle">پشتیبان همهٔ این فضا را در یک فایل می‌دهد: دانش با همهٔ نسخه‌ها، فکرها، رابطه‌ها، تغییرها، بوم، فایل‌ها و عددها. برگرداندن پشتیبان همیشه یک فضای تازه می‌سازد و روی چیزی نمی‌نویسد.</p>
            <Button variant="secondary" iconStart="Download" fullWidth onClick={onExportAllData}>پشتیبان کامل «{currentWorkspace.name}»</Button>
            <Button variant="secondary" iconStart="Upload" fullWidth disabled={restoring} onClick={() => fileRef.current?.click()}>{restoring ? 'در حال برگرداندن…' : 'برگرداندن از فایل پشتیبان…'}</Button>
            <input
              ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={async (e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                setRestoring(true);
                try { if (await onRestoreBackup(f)) closeAll(); } finally { setRestoring(false); }
              }}
            />
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
        description="همهٔ فضاهای کاری تو و هرچه در آن‌هاست (دانش، یادداشت‌ها، خروجی‌ها، فایل‌ها، بسته‌ها، قالب‌ها و تاریخچه) برای همیشه پاک می‌شود. بعدش برنامه برایت خالی شروع می‌شود؛ دادهٔ هیچ‌کس دیگری دست نمی‌خورد. اگر نسخهٔ پشتیبان می‌خواهی، اول پشتیبان هر فضا را بگیر."
        confirmLabel="حذف همهٔ داده‌ها" typed={{ phrase: WIPE_WORDS, label: 'عبارت تأیید' }}
        onConfirm={async () => { await onDeleteEverything(); closeAll(); }}
      />
    </>
  );
};
