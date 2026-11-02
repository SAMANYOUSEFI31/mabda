/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { STARTERS } from '../core/starters';
import { Alert, Button, Dialog, formatNumber } from '../ui';

interface Props {
  open: boolean;
  samplesCount: number;
  onClose: () => void;
  onApply: (starterId: string) => Promise<void>;
  onRemoveAll: () => Promise<void>;
}

/** «اسکلت شروع»: grey examples for one kind of business. They show the SHAPE of a good answer; no AI or engine ever sees them, and writing your own over one replaces it. */
export const StarterDialog: React.FC<Props> = ({ open, samplesCount, onClose, onApply, onRemoveAll }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  return (
    <Dialog open={open} onClose={onClose} size="md" title="اسکلت شروع" description="نوع کسب‌وکارت را انتخاب کن؛ چند نمونهٔ خاکستری در گره‌ها می‌نشیند تا ببینی جواب خوب چه شکلی است." footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
      <div className="flex flex-col gap-stack-md">
        <Alert intent="info">نمونه‌ها «دانش» نیستند: به هیچ AI و هیچ موتوری (شکاف، آمادگی، تناقض، بسته) نمی‌رسند و در سقف پلن شمرده نمی‌شوند. هر کدام را ویرایش کنی مال خودت می‌شود.</Alert>
        {STARTERS.map((st) => (
          <div key={st.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
            <span className="label-md text-text-default">{st.title}</span>
            <p className="body-sm text-text-subtle">{st.description} · {formatNumber(st.samples.length)} نمونه</p>
            <div><Button size="sm" variant="secondary" iconStart="Plus" loading={busy === st.id} onClick={() => run(st.id, () => onApply(st.id))}>افزودن نمونه‌ها</Button></div>
          </div>
        ))}
        {samplesCount > 0 && <div><Button variant="ghost" iconStart="Trash2" loading={busy === 'rm'} onClick={() => run('rm', onRemoveAll)}>حذف همهٔ نمونه‌ها ({formatNumber(samplesCount)})</Button></div>}
      </div>
    </Dialog>
  );
};
