import clsx from 'clsx';
import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { mediaUrl } from '../lib/api';
import { useT } from '../lib/i18n';
import type { Question } from '../lib/types';
import { MathInline, MathText } from './MathText';

export interface Reveal {
  correctLabel?: string;
  correctDisplay?: string;
  isCorrect?: boolean | null;
}

/** SPR javobini qanday o'qilishini ko'rsatish: "3/4" -> \frac{3}{4} */
function sprPreview(v: string): string | null {
  const s = v.trim().replace(',', '.');
  if (!s) return null;
  const m = /^(-?)(\d+)\/(\d+)$/.exec(s);
  if (m) return `$${m[1]}\\dfrac{${m[2]}}{${m[3]}}$`;
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return `$${s}$`;
  return null;
}

export function SvgFigure({ svg }: { svg: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }), [svg]);
  return <div className="svg-figure my-3 flex justify-center" dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function QuestionView({
  q,
  answer,
  onAnswer,
  disabled,
  reveal,
  eliminated,
  onToggleEliminate,
  eliminatorOn,
}: {
  q: Question;
  answer?: string | null;
  onAnswer?: (v: string) => void;
  disabled?: boolean;
  reveal?: Reveal;
  eliminated?: string[];
  onToggleEliminate?: (label: string) => void;
  eliminatorOn?: boolean;
}) {
  const t = useT();
  const preview = q.type === 'SPR' && answer ? sprPreview(answer) : null;

  return (
    <div>
      {q.passage && (
        <div className="mb-4 rounded-2xl border border-line bg-soft/40 p-4 text-[15px]">
          <MathText text={q.passage} />
        </div>
      )}
      {q.imageUrl && <img src={mediaUrl(q.imageUrl)} alt="" className="mx-auto mb-3 max-h-64 rounded-xl" />}
      {q.svg && <SvgFigure svg={q.svg} />}
      <MathText text={q.stem} className="mb-4 text-[16px] font-medium" />

      {q.type === 'MCQ' && q.choices && (
        <div className="flex flex-col gap-2.5">
          {q.choices.map((c) => {
            const selected = answer === c.label;
            const isElim = eliminated?.includes(c.label);
            const isCorrect = reveal?.correctLabel === c.label;
            const isWrongPick = reveal && selected && !isCorrect;
            return (
              <div key={c.label} className="flex items-stretch gap-2">
                <button
                  disabled={disabled}
                  onClick={() => (eliminatorOn && onToggleEliminate ? onToggleEliminate(c.label) : onAnswer?.(c.label))}
                  className={clsx(
                    'flex flex-1 items-start gap-3 rounded-2xl border-2 p-3 text-left transition',
                    !reveal && selected && 'border-accent bg-accent/10',
                    !reveal && !selected && 'border-line bg-card',
                    reveal && isCorrect && 'border-green-500 bg-green-500/10',
                    isWrongPick && 'border-red-500 bg-red-500/10',
                    reveal && !isCorrect && !isWrongPick && 'border-line bg-card opacity-70',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
                      selected && !reveal ? 'border-accent bg-accent text-accent-text' : 'border-line',
                      reveal && isCorrect && 'border-green-500 bg-green-500 text-white',
                      isWrongPick && 'border-red-500 bg-red-500 text-white',
                    )}
                  >
                    {c.label}
                  </span>
                  <MathInline text={c.text} className={clsx('pt-0.5', isElim && !reveal && 'strike')} />
                </button>
                {onToggleEliminate && !reveal && (
                  <button
                    onClick={() => onToggleEliminate(c.label)}
                    disabled={disabled}
                    aria-label="eliminate"
                    className={clsx('w-9 shrink-0 rounded-xl text-sm font-bold', isElim ? 'bg-red-500/15 text-red-500' : 'bg-soft text-hint')}
                  >
                    <span className="line-through">{c.label}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {q.type === 'SPR' && (
        <div>
          <input
            inputMode="text"
            autoComplete="off"
            disabled={disabled}
            value={answer ?? ''}
            maxLength={(answer ?? '').startsWith('-') ? 6 : 5}
            onChange={(e) => onAnswer?.(e.target.value.replace(/[^0-9./\-,]/g, ''))}
            placeholder={t('session.enterAnswer')}
            className={clsx(
              'w-full rounded-2xl border-2 bg-card px-4 py-3 text-center text-2xl font-bold tracking-wider outline-none',
              reveal ? (reveal.isCorrect ? 'border-green-500' : 'border-red-500') : 'border-line focus:border-accent',
            )}
          />
          <div className="mt-2 flex min-h-[28px] items-center justify-between gap-2 text-xs text-hint">
            <span>{t('session.sprHint')}</span>
            {preview && <MathInline text={preview} className="text-base text-text" />}
          </div>
          {reveal && (
            <div className="mt-2 rounded-xl bg-green-500/10 p-3 text-sm">
              {t('common.correctAnswer')}: <b>{reveal.correctDisplay}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
