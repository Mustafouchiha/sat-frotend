import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';

/** «🤖 AI'dan so'rash» — javob berilgan savol bo'yicha AI ustozni ochadi (savol matni, javoblar va izoh AI'ga beriladi). */
export function AskAiButton({ answerId, className }: { answerId?: string | null; className?: string }) {
  const t = useT();
  const nav = useNavigate();
  if (!answerId) return null;
  return (
    <button
      onClick={() => nav(`/ai?answer=${encodeURIComponent(answerId)}`)}
      className={clsx('inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-sm font-medium text-accent active:scale-[0.98]', className)}
    >
      {t('ai.ask')}
    </button>
  );
}
