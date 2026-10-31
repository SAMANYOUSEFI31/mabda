/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, TextField, useToast } from '../ui';
import { asAiError, deleteByokKey, putByokKey } from '../services/apiClient';
import { useAiStatus } from '../services/aiStatus';

const TIER_FA = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' } as const;

export const AiSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { status, refresh } = useAiStatus();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await putByokKey(key.trim());
      setKey('');
      await refresh();
      toast.show({ intent: 'success', message: 'کلید ذخیره شد. از این پس درخواست‌ها با کلید خودت انجام می‌شود و اعتباری کم نمی‌شود.' });
    } catch (err) {
      setError(asAiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteByokKey();
      await refresh();
      toast.show({ intent: 'info', message: 'کلید حذف شد.' });
    } catch (err) {
      setError(asAiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="تنظیمات هوش مصنوعی"
      description="کلید API خودت را وارد کن (BYOK). کلید رمزنگاری‌شده روی سرور ذخیره می‌شود و فقط برای درخواست‌های خودت به‌کار می‌رود."
    >
      <div className="flex flex-col gap-stack-lg">
        <Card padding="md" className="flex flex-col gap-stack-sm">
          <div className="flex items-center justify-between gap-inline-sm">
            <span className="label-md text-text-default">وضعیت</span>
            {status?.available ? (
              <Badge intent="success">{status.source === 'byok' ? 'کلید شخصی فعال' : 'کلید مدیریت‌شدهٔ سرور فعال'}</Badge>
            ) : (
              <Badge intent="warning">غیرفعال</Badge>
            )}
          </div>
          {status?.byokConfigured && <p className="body-sm text-text-subtle">کلید ذخیره‌شده: <span dir="ltr" className="code">…{status.byokLast4}</span></p>}
          {status && !status.available && status.unavailable && <p className="body-sm text-text-subtle">{status.unavailable.message}</p>}
          <p className="caption text-text-subtle">
            با کلید شخصی، اعتبار کم نمی‌شود ولی توکن و هزینه در دفتر کل ثبت می‌شود. هوش مصنوعی مدیریت‌شده {status?.managedEnabled ? 'روشن' : 'خاموش'} است (feature flag).
          </p>
        </Card>

        <form onSubmit={save} className="flex flex-col gap-stack-md">
          <TextField
            label="کلید Gemini API"
            type="password"
            dir="ltr"
            autoComplete="off"
            placeholder="AIzaSy…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            error={error ?? undefined}
            hint="از Google AI Studio بگیر. پیش از ذخیره، کلید با یک درخواست واقعی آزموده می‌شود."
          />
          <div className="flex flex-wrap gap-inline-sm">
            <Button type="submit" variant="primary" loading={busy} disabled={!key.trim()}>آزمودن و ذخیرهٔ کلید</Button>
            {status?.byokConfigured && <Button variant="secondary" iconStart="Trash2" disabled={busy} onClick={remove}>حذف کلید</Button>}
          </div>
        </form>

        {status?.available && (
          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg">
            <span className="label-md text-text-default">مدل‌های هر سطح</span>
            <ul className="flex flex-col gap-stack-xs body-sm">
              {status.tiers.map((t) => (
                <li key={t.tier} className="flex items-center justify-between gap-inline-sm">
                  <span className="text-text-subtle">{TIER_FA[t.tier]}</span>
                  <span className="flex items-center gap-inline-sm">
                    <span dir="ltr" className="code">{t.modelId}</span>
                    <Badge intent={t.verified ? 'success' : 'warning'}>{t.verified ? 'تأییدشده' : 'تأییدنشده'}</Badge>
                  </span>
                </li>
              ))}
            </ul>
            {status.warnings.map((w) => <Alert key={w} intent="warning">{w}</Alert>)}
          </div>
        )}
      </div>
    </Dialog>
  );
};
