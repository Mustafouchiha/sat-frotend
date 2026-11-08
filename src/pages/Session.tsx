import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Page, useTelegramBack } from '../components/Layout';
import { MathText } from '../components/MathText';
import { QuestionView } from '../components/QuestionView';
import { ReportButton } from '../components/ReportSheet';
import { TimerPill, useCountdown } from '../components/Timer';
import { toast } from '../components/Toast';
import { Badge, Button, Card, ErrorBox, Loading } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtDelta, secs } from '../lib/format';
import { useT } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { confirmDialog, haptic } from '../lib/telegram';
import type { AnswerResult, ReviewQuestion, SessionState } from '../lib/types';

interface DuelSide {
  userId: string;
  name: string;
  answered: number;
  correct: number;
  finished: boolean;
}
interface DuelSummary {
  id: string;
  status: string;
  count: number;
  winnerId: string | null;
  creator: DuelSide | null;
  opponent: DuelSide | null;
  me?: string;
}

/** Chess.com uslubidagi "+12" / "−8" animatsiyasi. */
function RatingDelta({ delta, k }: { delta: number; k: number }) {
  if (!delta) return null;
  return (
    <span key={k} className={clsx('pointer-events-none absolute -top-2 right-4 text-2xl font-black animate-floatUp', delta > 0 ? 'text-green-500' : 'text-red-500')}>
      {fmtDelta(delta)}
    </span>
  );
}

function DuelBar({ duelId, meId }: { duelId: string; meId?: string }) {
  const [s, setS] = useState<DuelSummary | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<DuelSummary>(`/duels/${duelId}`).then((d) => alive && setS(d)).catch(() => undefined);
    void load();
    const sock = getSocket();
    const onUpdate = (d: DuelSummary) => d?.id === duelId && setS((prev) => ({ ...d, me: prev?.me ?? d.me }));
    sock.emit('duel:watch', duelId);
    sock.on('duel:update', onUpdate);
    const poll = window.setInterval(load, 5000); // socket uzilsa ham ishlaydi
    return () => {
      alive = false;
      sock.off('duel:update', onUpdate);
      sock.emit('duel:unwatch', duelId);
      window.clearInterval(poll);
    };
  }, [duelId]);
  if (!s) return null;
  const me = s.creator?.userId === (s.me ?? meId) ? s.creator : s.opponent;
  const opp = me === s.creator ? s.opponent : s.creator;
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
      {[me, opp].map((side, i) => (
        <div key={i} className={clsx('rounded-xl p-2', i === 0 ? 'bg-accent/10' : 'bg-soft')}>
          <div className="truncate font-semibold">{side?.name ?? '...'}</div>
          <div className="text-hint">
            ✓ {side?.correct ?? 0} · {side?.answered ?? 0}/{s.count} {side?.finished ? '🏁' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SessionRunner() {
  const { id = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [answer, setAnswer] = useState<string>('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [deltaKey, setDeltaKey] = useState(0);
  const shownAt = useRef(Date.now());

  const q = useQuery({ queryKey: ['session', id], queryFn: () => api<SessionState>(`/sessions/${id}`), refetchOnWindowFocus: false });
  const s = q.data;
  const isRush = s?.mode === 'RUSH';

  const onBack = useCallback(() => {
    void confirmDialog(t('runner.leave')).then((ok) => ok && nav('/'));
  }, [nav, t]);
  useTelegramBack(s?.status === 'IN_PROGRESS' ? onBack : undefined);

  const finish = useCallback(async () => {
    try {
      await api(`/sessions/${id}/finish`, { body: {} });
    } finally {
      await q.refetch();
    }
  }, [id, q]);

  const left = useCountdown(s?.status === 'IN_PROGRESS' ? s.deadlineAt : null, s?.serverNow, () => {
    toast(t('session.timeUp'), { icon: '⏰' });
    void finish();
  });

  useEffect(() => {
    setAnswer('');
    setResult(null);
    shownAt.current = Date.now();
  }, [s?.question?.order]);

  const submit = async (value?: string) => {
    const v = value ?? answer;
    if (!s?.question || !v) return;
    setBusy(true);
    try {
      const r = await api<AnswerResult>(`/sessions/${id}/answer`, {
        body: { order: s.question.order, answer: v, timeSpentMs: Date.now() - shownAt.current },
      });
      haptic(r.correct ? 'success' : 'error');
      setDeltaKey((k) => k + 1);
      for (const a of r.achievements) toast(`${a.name}`, { icon: a.icon, kind: 'success' });
      if (isRush) {
        // Rush: izohsiz, darhol keyingi savol
        setResult(r);
        setTimeout(() => {
          setResult(null);
          void q.refetch();
        }, 650);
      } else {
        setResult(r);
      }
      if (r.finished) void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
      void q.refetch();
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <Loading />;
  if (q.error || !s) return <Page><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;

  if (s.status === 'FINISHED' || !s.question) return <SessionSummary s={s} />;

  const total = s.total ?? undefined;
  const progress = total ? ((s.answered + (result ? 0 : 0)) / total) * 100 : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32" style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}>
      <div className="relative mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{s.title}</div>
          <div className="text-xs text-hint">
            {isRush ? (
              <>
                {t('session.score')}: <b className="text-text">{s.correct}</b> · {t('session.lives')}: {'❤️'.repeat(s.lives ?? 0)}
                {'🤍'.repeat(Math.max(0, 3 - (s.lives ?? 0)))}
              </>
            ) : (
              <>
                {t('session.question')} {s.answered + 1}
                {total ? ` / ${total}` : ''} · ✓ {s.correct}
              </>
            )}
          </div>
        </div>
        <TimerPill ms={left} warnAt={isRush ? 30_000 : 60_000} />
        {result && <RatingDelta delta={result.ratingDelta} k={deltaKey} />}
      </div>
      {total && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-soft">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {s.duelId && <DuelBar duelId={s.duelId} />}

      <Card className={clsx(isRush && result && (result.correct ? 'ring-2 ring-green-500' : 'ring-2 ring-red-500'))}>
        <QuestionView
          q={s.question}
          answer={answer}
          onAnswer={(v) => {
            if (result) return;
            setAnswer(v);
            haptic('select');
            if (isRush && s.question?.type === 'MCQ') void submit(v);
          }}
          disabled={!!result || busy}
          reveal={result && !isRush ? { correctLabel: result.correctLabel, correctDisplay: result.correctDisplay, isCorrect: result.correct } : undefined}
        />
      </Card>

      {result && !isRush && (
        <Card className={clsx('mt-3 border-2', result.correct ? 'border-green-500/40' : 'border-red-500/40')}>
          <div className="mb-1 flex items-center justify-between">
            <div className={clsx('text-lg font-bold', result.correct ? 'text-green-600' : 'text-red-500')}>
              {result.correct ? `✓ ${t('common.correct')}` : `✗ ${t('common.wrong')}`}
            </div>
            <Badge color={result.ratingDelta >= 0 ? '#16a34a' : '#dc2626'}>
              {fmtDelta(result.ratingDelta)} · {result.rating}
            </Badge>
          </div>
          {!result.correct && (
            <div className="mb-2 text-sm">
              {t('common.correctAnswer')}: <b>{result.correctDisplay}</b>
            </div>
          )}
          {result.explanation && (
            <div className="rounded-xl bg-soft p-3 text-sm">
              <div className="mb-1 text-xs font-semibold text-hint">{t('common.explanation')}</div>
              <MathText text={result.explanation} />
            </div>
          )}
          <div className="mt-2 text-right">
            <ReportButton refData={result.ref} />
          </div>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 p-3 backdrop-blur" style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}>
        <div className="mx-auto max-w-2xl">
          {result && !isRush ? (
            <Button size="lg" onClick={() => void q.refetch()}>
              {result.finished ? t('session.result') : t('common.next')} →
            </Button>
          ) : (
            (!isRush || s.question.type === 'SPR') && (
              <Button size="lg" disabled={!answer} loading={busy} onClick={() => void submit()}>
                {t('common.submit')}
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SessionSummary({ s }: { s: SessionState }) {
  const t = useT();
  const nav = useNavigate();
  const accuracy = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
  return (
    <Page title={t('session.finished')}>
      <Card className="text-center">
        <div className="mb-2 text-5xl">{s.mode === 'RUSH' ? '⚡' : accuracy >= 80 ? '🏆' : accuracy >= 50 ? '👍' : '💪'}</div>
        <div className="text-sm text-hint">{s.title}</div>
        <div className="my-2 text-5xl font-black">
          {s.correct}
          {s.mode !== 'RUSH' && <span className="text-2xl text-hint"> / {s.answered}</span>}
        </div>
        <div className="mb-4 flex justify-center gap-2">
          <Badge color={s.ratingDelta >= 0 ? '#16a34a' : '#dc2626'}>
            {t('session.ratingChange')}: {fmtDelta(s.ratingDelta)}
          </Badge>
          {s.mode !== 'RUSH' && <Badge>{accuracy}%</Badge>}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => nav(`/session/${s.id}/review`)}>
            🔍 {t('session.review')}
          </Button>
          {s.duelId && (
            <Button size="lg" variant="secondary" onClick={() => nav(`/duel/${s.duelId}`)}>
              ⚔️ {t('duel.title')}
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={() => nav('/')}>
            {t('common.home')}
          </Button>
        </div>
      </Card>
    </Page>
  );
}

interface ReviewData {
  attempt: { id: string; title: string; correct: number; total: number; ratingDelta: number };
  items: Array<{
    order: number;
    question: ReviewQuestion;
    answer: string | null;
    isCorrect: boolean | null;
    timeSpentMs: number;
    ratingDelta: number | null;
    templateId: string;
    templateVersion: number;
    seed: number;
    skill: string;
    domain: string;
  }>;
}

export function SessionReview() {
  const { id = '' } = useParams();
  const t = useT();
  const q = useQuery({ queryKey: ['session-review', id], queryFn: () => api<ReviewData>(`/sessions/${id}/review`) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page back><ErrorBox error={q.error} /></Page>;
  return (
    <Page title={t('session.review')} back>
      <Card className="mb-3 flex items-center justify-between">
        <div className="text-sm text-hint">{q.data.attempt.title}</div>
        <div className="text-xl font-bold">
          {q.data.attempt.correct}/{q.data.attempt.total}
        </div>
      </Card>
      <ReviewList items={q.data.items} />
      <div className="mt-4">
        <Link to="/mistakes" className="text-sm text-link">
          📒 {t('home.mistakes')} →
        </Link>
      </div>
    </Page>
  );
}

export function ReviewList({ items }: { items: ReviewData['items'] }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <Card key={`${it.order}-${i}`} className="p-0">
          <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(open === i ? null : i)}>
            <span
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                it.isCorrect ? 'bg-green-500' : it.answer ? 'bg-red-500' : 'bg-gray-400',
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{it.skill}</div>
              <div className="text-xs text-hint">
                {it.domain} · {secs(it.timeSpentMs)}
                {it.ratingDelta ? ` · ${fmtDelta(it.ratingDelta)}` : ''}
              </div>
            </div>
            <span className="text-hint">{open === i ? '▴' : '▾'}</span>
          </button>
          {open === i && (
            <div className="border-t border-line p-3">
              <QuestionView
                q={it.question}
                answer={it.answer}
                disabled
                reveal={{ correctLabel: it.question.correctLabel, correctDisplay: it.question.correctDisplay, isCorrect: it.isCorrect }}
              />
              <div className="mt-2 text-sm">
                {t('common.yourAnswer')}: <b>{it.answer ?? '—'}</b> · {t('common.correctAnswer')}: <b>{it.question.correctDisplay}</b>
              </div>
              {it.question.explanation && (
                <div className="mt-2 rounded-xl bg-soft p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-hint">{t('common.explanation')}</div>
                  <MathText text={it.question.explanation} />
                </div>
              )}
              <div className="mt-2 text-right">
                <ReportButton refData={{ templateId: it.templateId, templateVersion: it.templateVersion, seed: it.seed }} />
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
