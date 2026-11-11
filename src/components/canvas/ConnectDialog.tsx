/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { ConnectChoice, ConnectOption } from '../../core/connectRules';
import { Alert, Button, Dialog, RadioGroup, TextField } from '../../ui';

interface Props {
  open: boolean;
  from?: string;
  to?: string;
  options: ConnectOption[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (o: ConnectOption, reason: string) => void;
}

/** «وصل کن»: the choice is a SENTENCE with both titles; an option that cannot be chosen says why; nothing is built until the one primary button. */
export const ConnectDialog: React.FC<Props> = ({ open, from, to, options, busy, onClose, onConfirm }) => {
  const [choice, setChoice] = useState<ConnectChoice | undefined>(() => options.find((o) => !o.blocked)?.choice);
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setChoice(options.find((o) => !o.blocked)?.choice); setReason(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = options.find((o) => o.choice === choice);
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="وصل کن" description={from && to ? `بین «${from}» و «${to}» چه رابطه‌ای هست؟` : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" disabled={!cur || !!cur.blocked} loading={busy} onClick={() => cur && onConfirm(cur, reason.trim())}>وصل کن</Button></>}>
      <div className="flex flex-col gap-stack-md" data-testid="connect-dialog">
        <RadioGroup legend="یک جمله را انتخاب کن" value={choice ?? ''} onChange={(v) => setChoice(v as ConnectChoice)}
          options={options.map((o) => ({ value: o.choice, label: <span className="flex flex-col"><span>{o.label}</span>{o.blocked && <span className="body-sm text-text-subtle">{o.blocked}</span>}</span>, disabled: !!o.blocked }))} />
        {cur && !cur.blocked && (
          <Alert intent={cur.type === 'supersedes' ? 'warning' : 'info'}>
            {cur.note ? `${cur.note} ` : ''}{cur.type === 'supersedes' ? 'این کار با «برگرداندن» برنمی‌گردد.' : 'با «برگرداندن» (Ctrl+Z) برمی‌گردد.'}
          </Alert>
        )}
        <TextField label="دلیل (اختیاری)" value={reason} onChange={(e) => setReason(e.target.value)} hint="در تاریخچهٔ تغییرها ثبت می‌شود." />
      </div>
    </Dialog>
  );
};
