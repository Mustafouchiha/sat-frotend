import { useState } from 'react';
import { api, errorText } from '../lib/api';
import { useT } from '../lib/i18n';
import { toast } from './Toast';
import { Button, inputCls, Sheet } from './ui';

export interface QuestionRef {
  templateId: string;
  templateVersion?: number;
  seed?: number;
}

/** "Savolda xato bor" — aynan shu variant (template + versiya + seed) bilan yuboriladi. */
export function ReportButton({ refData, className }: { refData: QuestionRef; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api('/reports', { body: { ...refData, message: text } });
      toast(t('session.reportSent'), { icon: '✅', kind: 'success' });
      setOpen(false);
      setText('');
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? 'text-xs text-hint underline'}>
        ⚠️ {t('session.report')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('session.report')}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className={inputCls}
          placeholder={t('session.reportPlaceholder')}
        />
        <Button size="lg" className="mt-3" disabled={text.trim().length < 3} loading={busy} onClick={send}>
          {t('common.submit')}
        </Button>
      </Sheet>
    </>
  );
}
