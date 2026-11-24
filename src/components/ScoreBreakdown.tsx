import { fmtDelta } from '../lib/format';
import { useT } from '../lib/i18n';
import type { RatingBreakdown } from '../lib/types';

/**
 * Test tugagach: to'g'ri javoblar uchun qo'shilgan, xatolar uchun ayirilgan ball va reyting oldin → keyin.
 * (Egasi: «test ichida ballni ko'rsatmasin — tugagach umumiy ko'rsatsin».)
 */
export function ScoreBreakdown({ b, total }: { b?: RatingBreakdown | null; total: number }) {
  const t = useT();
  const hasRating = !!b && b.before !== null && b.after !== null;
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-green-500/10 p-2">
        <div className="text-[11px] leading-tight text-hint">{t('score.gained')}</div>
        <div className="text-lg font-bold tabular-nums text-green-600">{fmtDelta(Math.round(b?.gained ?? Math.max(0, total)))}</div>
      </div>
      <div className="rounded-xl bg-red-500/10 p-2">
        <div className="text-[11px] leading-tight text-hint">{t('score.lost')}</div>
        <div className="text-lg font-bold tabular-nums text-red-500">{fmtDelta(Math.round(b?.lost ?? Math.min(0, total)))}</div>
      </div>
      <div className="rounded-xl bg-soft p-2">
        <div className="text-[11px] leading-tight text-hint">{t('score.rating')}</div>
        {hasRating ? (
          <>
            <div className="text-lg font-bold tabular-nums">
              {b!.before} → {b!.after}
            </div>
            <div className={`text-xs font-semibold ${b!.after! - b!.before! >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtDelta(b!.after! - b!.before!)}</div>
          </>
        ) : (
          <div className={`text-lg font-bold tabular-nums ${total >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtDelta(total)}</div>
        )}
      </div>
    </div>
  );
}
