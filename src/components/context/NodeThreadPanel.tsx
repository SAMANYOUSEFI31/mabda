/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import type { ContextObject, LedgerEntry, Note, TreeNode } from '../../types';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Badge, Button, Dialog, Markdown, Textarea, TypeBadge, formatNumber, useToast } from '../../ui';

interface Props {
  open: boolean;
  workspaceId: string;
  node: TreeNode | null;
  onClose: () => void;
  /** Proposed objects the server created for this node */
  onProposed: (created: ContextObject[], ledger: LedgerEntry[]) => void;
  onSummary: (note: Note, ledger: LedgerEntry[]) => void;
}

interface Turn { role: 'user' | 'assistant'; content: string; created?: ContextObject[] }

/**
 * «گفتگوی متمرکز»: a thin, cheap-tier thread about ONE heading. The model sees only this node and its parents; whatever it
 * proposes lands as Proposed objects on this node. Ending the thread saves a short summary as a note on the node.
 * No canned replies: a failure is shown with «دوباره».
 */
export const NodeThreadPanel: React.FC<Props> = (props) => (props.open && props.node ? <Thread {...props} node={props.node} /> : null);

const Thread: React.FC<Props & { node: TreeNode }> = ({ workspaceId, node, onClose, onProposed, onSummary }) => {
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'turn' | 'finish' | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const last = useRef('');

  const send = async (text: string, base: Turn[]) => {
    last.current = text;
    const history = base.map((t) => ({ role: t.role, content: t.content }));
    setBusy('turn'); setError(null);
    try {
      const r = await dataApi.threadTurn(workspaceId, node.id, { message: text, history });
      setTurns([...base, { role: 'user', content: text }, { role: 'assistant', content: r.markdown, created: r.created }]);
      setDraft('');
      if (r.created.length) onProposed(r.created, r.ledger);
    } catch (e) {
      setError({ message: e instanceof DataApiError ? e.message : 'خطای ناشناخته.', retry: () => void send(text, base) });
    } finally { setBusy(null); }
  };

  const finish = async () => {
    setBusy('finish'); setError(null);
    try {
      const r = await dataApi.threadFinish(workspaceId, node.id, turns.map((t) => ({ role: t.role, content: t.content })));
      setSummary(r.note.content);
      onSummary(r.note, r.ledger);
      toast.show({ intent: 'success', message: 'خلاصهٔ گفتگو روی این بخش ذخیره شد.' });
    } catch (e) {
      setError({ message: e instanceof DataApiError ? e.message : 'خطای ناشناخته.', retry: () => void finish() });
    } finally { setBusy(null); }
  };

  return (
    <Dialog
      open
      side
      size="lg"
      onClose={onClose}
      title={`گفتگوی متمرکز · ${node.label}`}
      description="مدل فقط همین بخش و والدینش را می‌بیند و فقط برای همین بخش پیشنهاد می‌سازد؛ پیشنهادها تا تأیید تو واقعیت نیستند."
      footer={
        summary ? <Button variant="primary" onClick={onClose}>بستن</Button> : (
          <>
            <Button variant="ghost" loading={busy === 'finish'} disabled={!turns.length || busy === 'turn'} onClick={finish}>پایان گفتگو و ذخیرهٔ خلاصه</Button>
            <Button variant="primary" iconStart="Send" loading={busy === 'turn'} disabled={!draft.trim()} onClick={() => void send(draft.trim(), turns)}>ارسال</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-stack-md">
        {turns.length === 0 && <p className="body-md text-text-subtle">بنویس این بخش باید چه چیزی را بگوید؛ مبدأ پیش‌نویس همین بخش را با هم می‌سازید.</p>}
        {turns.map((t, i) => (
          <div key={i} className={`flex flex-col gap-stack-xs rounded-control-sm border border-border-default p-inset-md ${t.role === 'user' ? 'bg-surface-sunken' : 'bg-surface-raised'}`}>
            <span className="label-md text-text-subtle">{t.role === 'user' ? 'تو' : 'مبدأ'}</span>
            {t.role === 'user' ? <p className="body-md whitespace-pre-wrap text-text-default">{t.content}</p> : <Markdown>{t.content}</Markdown>}
            {t.created && t.created.length > 0 && (
              <div className="flex flex-col gap-stack-xs">
                <Badge intent="info" icon={false}>{formatNumber(t.created.length)} پیشنهاد برای این بخش در صندوق</Badge>
                {t.created.map((o) => (
                  <span key={o.id} className="flex flex-wrap items-center gap-inline-sm"><TypeBadge value={o.type} /><span className="body-sm text-text-default">{o.title}</span></span>
                ))}
              </div>
            )}
          </div>
        ))}
        {summary && (
          <Alert intent="success" title="خلاصهٔ ذخیره‌شده روی این بخش">
            <span className="whitespace-pre-wrap">{summary}</span>
          </Alert>
        )}
        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={error.retry}>دوباره</Button>}>{error.message}</Alert>}
        {!summary && <Textarea label="پیام" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />}
      </div>
    </Dialog>
  );
};
