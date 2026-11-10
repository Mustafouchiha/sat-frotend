import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calculator } from '../components/Calculator';
import { Page, useTelegramBack } from '../components/Layout';
import { QuestionView } from '../components/QuestionView';
import { ReferenceSheet } from '../components/ReferenceSheet';
import { TimerPill, useCountdown } from '../components/Timer';
import { toast } from '../components/Toast';
import { Button, Card, ErrorBox, Loading, Sheet } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { store } from '../lib/storage';
import { confirmDialog, haptic, setClosingConfirmation } from '../lib/telegram';
import type { Question } from '../lib/types';
import { useAuth } from '../store/auth';

interface Item {
  order: number;
  number: number;
  question: Question;
  answer: string | null;
  marked: boolean;
  timeSpentMs: number;
}

type TestState =
  | { status: 'FINISHED'; attemptId: string }
  | {
      status: 'BREAK';
      attemptId: string;
      title: string;
      next: { order: number; section: 'RW' | 'MATH'; index: number; totalModules: number; durationSec: number };
      breakSeconds: number;
      breakEndsAt: string | null;
      serverNow: string;
    }
  | {
      status: 'IN_PROGRESS';
      attemptId: string;
      title: string;
      module: { order: number; section: 'RW' | 'MATH'; stage: number; index: number; totalModules: number; durationSec: number; deadlineAt: string };
      serverNow: string;
      items: Item[];
    };

interface Local {
  answers: Record<number, string | null>;
  marked: Record<number, boolean>;
  eliminated: Record<number, string[]>;
  time: Record<number, number>;
  dirty: number[];
}

const emptyLocal = (): Local => ({ answers: {}, marked: {}, eliminated: {}, time: {}, dirty: [] });

export default function TestRunner() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['test-state', id], queryFn: () => api<TestState>(`/attempts/${id}/state`), refetchOnWindowFocus: false });
  const nav = useNavigate();

  useEffect(() => {
    if (q.data?.status === 'FINISHED') nav(`/attempt/${id}/result`, { replace: true });
  }, [q.data?.status, id, nav]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page back><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  if (q.data.status === 'BREAK') return <BreakScreen s={q.data} onContinue={() => q.refetch()} />;
  if (q.data.status === 'IN_PROGRESS') return <ModuleRunner key={`${id}-${q.data.module.order}`} s={q.data} onChanged={() => q.refetch()} />;
  return <Loading />;
}

function BreakScreen({ s, onContinue }: { s: Extract<TestState, { status: 'BREAK' }>; onContinue: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const left = useCountdown(s.breakEndsAt, s.serverNow);
  const go = async () => {
    setBusy(true);
    try {
      await api(`/attempts/${s.attemptId}/next`, { body: {} });
      onContinue();
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title={s.title}>
      <Card className="text-center">
        <div className="text-6xl">☕</div>
        <h2 className="mt-2 text-xl font-bold">{t('runner.break')}</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-hint">{t('runner.breakText')}</p>
        {left !== null && <div className="my-4 font-mono text-5xl font-black tabular-nums">{fmtTime(left)}</div>}
        <div className="mb-4 text-sm text-hint">
          {t('runner.module')} {s.next.index + 1}/{s.next.totalModules} · {s.next.section === 'MATH' ? 'Math' : 'Reading & Writing'} ·{' '}
          {Math.round(s.next.durationSec / 60)} {t('common.minutes')}
        </div>
        <Button size="lg" loading={busy} onClick={go}>
          {t('common.continue')} →
        </Button>
      </Card>
    </Page>
  );
}

function ModuleRunner({ s, onChanged }: { s: Extract<TestState, { status: 'IN_PROGRESS' }>; onChanged: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const desmosKey = useAuth((st) => st.config.desmosKey);
  const storageKey = `sat_run_${s.attemptId}_${s.module.order}`;
  const [local, setLocal] = useState<Local>(() => {
    const saved = store.get<Local>(storageKey, emptyLocal());
    // server javoblari + qurilmadagi (hali yuborilmagan) javoblar
    const merged = emptyLocal();
    for (const it of s.items) {
      merged.answers[it.order] = it.answer;
      merged.marked[it.order] = it.marked;
      merged.time[it.order] = it.timeSpentMs;
    }
    for (const o of saved.dirty) {
      if (o in saved.answers) merged.answers[o] = saved.answers[o];
      if (o in saved.marked) merged.marked[o] = saved.marked[o];
      if (o in saved.time) merged.time[o] = Math.max(saved.time[o], merged.time[o] ?? 0);
    }
    merged.eliminated = saved.eliminated ?? {};
    merged.dirty = saved.dirty ?? [];
    return merged;
  });
  const [idx, setIdx] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [elimOn, setElimOn] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [sync, setSync] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const enterTs = useRef(Date.now());
  const localRef = useRef(local);
  localRef.current = local;
  const inflight = useRef(false);

  const items = s.items;
  const cur = items[idx];

  // qurilmada saqlash (internet uzilsa ham yo'qolmaydi)
  useEffect(() => {
    store.set(storageKey, local);
  }, [local, storageKey]);

  // Telegram: testdan tasodifan chiqib ketmaslik
  useEffect(() => {
    setClosingConfirmation(true);
    return () => setClosingConfirmation(false);
  }, []);

  const onBack = useCallback(() => {
    void confirmDialog(t('runner.leave')).then((ok) => ok && nav('/tests'));
  }, [nav, t]);
  useTelegramBack(onBack);

  /** Joriy savolda o'tgan vaqtni hisobga olish. */
  const commitTime = useCallback(() => {
    const now = Date.now();
    const delta = now - enterTs.current;
    enterTs.current = now;
    const order = items[idx]?.order;
    if (order === undefined || delta < 300) return;
    setLocal((l) => ({
      ...l,
      time: { ...l.time, [order]: (l.time[order] ?? 0) + delta },
      dirty: l.dirty.includes(order) ? l.dirty : [...l.dirty, order],
    }));
  }, [idx, items]);

  const flush = useCallback(async (): Promise<boolean> => {
    const l = localRef.current;
    if (!l.dirty.length) return true;
    if (inflight.current) return false;
    inflight.current = true;
    setSync('saving');
    const sent = [...l.dirty];
    try {
      await api(`/attempts/${s.attemptId}/answers`, {
        method: 'PUT',
        body: {
          moduleOrder: s.module.order,
          answers: sent.map((o) => ({ order: o, answer: l.answers[o] ?? null, marked: !!l.marked[o], timeSpentMs: Math.round(l.time[o] ?? 0) })),
        },
      });
      setLocal((cur2) => ({
        ...cur2,
        // yuborilgandan keyin yana o'zgargan savollar navbatda qoladi
        dirty: cur2.dirty.filter(
          (o) => !sent.includes(o) || cur2.answers[o] !== l.answers[o] || cur2.marked[o] !== l.marked[o] || cur2.time[o] !== l.time[o],
        ),
      }));
      setSync('saved');
      return true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        // modul yopilgan (vaqt tugagan) — server holatini qayta olamiz
        store.remove(storageKey);
        onChanged();
        return false;
      }
      setSync('offline');
      return false;
    } finally {
      inflight.current = false;
    }
  }, [onChanged, s.attemptId, s.module.order, storageKey]);

  // o'zgarishlarni 1 soniyadan keyin yuborish; offline bo'lsa qayta urinish
  useEffect(() => {
    if (!local.dirty.length) return;
    const tm = window.setTimeout(() => void flush(), 1000);
    return () => window.clearTimeout(tm);
  }, [local.dirty, local.answers, local.marked, flush]);
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    const retry = window.setInterval(() => localRef.current.dirty.length && void flush(), 8000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(retry);
    };
  }, [flush]);

  // boshqa ilovaga o'tish qayd qilinadi
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        commitTime();
        void api(`/attempts/${s.attemptId}/event`, { body: { type: 'blur' }, keepalive: true }).catch(() => undefined);
        void flush();
      } else enterTs.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [commitTime, flush, s.attemptId]);

  const submitModule = useCallback(
    async (auto = false) => {
      if (submitting) return;
      setSubmitting(true);
      commitTime();
      // state yangilanishini kutib, keyin yuboramiz
      await new Promise((r) => setTimeout(r, 50));
      const ok = await flush();
      if (!ok && !auto && localRef.current.dirty.length) {
        toast(t('runner.offline'), { kind: 'error' });
        setSubmitting(false);
        return;
      }
      try {
        const r = await api<{ finished?: boolean }>(`/attempts/${s.attemptId}/submit-module`, { body: { moduleOrder: s.module.order } });
        store.remove(storageKey);
        haptic('success');
        if (r.finished) void qc.invalidateQueries({ queryKey: ['dashboard'] });
      } catch (e) {
        toast(errorText(e), { kind: 'error' });
      } finally {
        setSubmitting(false);
        onChanged();
      }
    },
    [commitTime, flush, onChanged, qc, s.attemptId, s.module.order, storageKey, submitting, t],
  );

  const left = useCountdown(s.module.deadlineAt, s.serverNow, () => {
    toast(t('session.timeUp'), { icon: '⏰' });
    void submitModule(true);
  });

  const go = (i: number) => {
    if (i < 0 || i >= items.length) return;
    commitTime();
    setIdx(i);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  const setAnswer = (v: string) => {
    if (!cur) return;
    setLocal((l) => ({
      ...l,
      answers: { ...l.answers, [cur.order]: v || null },
      dirty: l.dirty.includes(cur.order) ? l.dirty : [...l.dirty, cur.order],
    }));
  };
  const toggleMark = () => {
    if (!cur) return;
    haptic('light');
    setLocal((l) => ({
      ...l,
      marked: { ...l.marked, [cur.order]: !l.marked[cur.order] },
      dirty: l.dirty.includes(cur.order) ? l.dirty : [...l.dirty, cur.order],
    }));
  };
  const toggleElim = (label: string) => {
    if (!cur) return;
    setLocal((l) => {
      const list = l.eliminated[cur.order] ?? [];
      const next = list.includes(label) ? list.filter((x) => x !== label) : [...list, label];
      // chizilgan variant tanlangan bo'lsa, tanlov bekor qilinadi
      const answers = next.includes(label) && l.answers[cur.order] === label ? { ...l.answers, [cur.order]: null } : l.answers;
      return { ...l, answers, eliminated: { ...l.eliminated, [cur.order]: next } };
    });
  };

  const unanswered = useMemo(() => items.filter((it) => !local.answers[it.order]).length, [items, local.answers]);
  const isMath = s.module.section === 'MATH';

  const confirmSubmit = async () => {
    const msg = `${t('runner.confirmSubmit')}${unanswered ? `\n${t('runner.unanswered')}: ${unanswered}` : ''}`;
    if (await confirmDialog(msg)) void submitModule(false);
  };

  // Kompyuterda: ← / → bilan savollar orasida yurish (yozish maydonida yoki oyna ochiq bo'lsa ishlamaydi)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || navOpen || calcOpen || refOpen) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' && idx < items.length - 1) {
        e.preventDefault();
        go(idx + 1);
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        go(idx - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // R&W matnli savollar kompyuterda ikki ustunda: matn chapda, savol o'ngda
  const wide = !!cur?.question.passage;

  return (
    <div
      className={clsx('no-copy mx-auto min-h-screen pb-36', wide ? 'max-w-3xl lg:max-w-6xl' : 'max-w-3xl')}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 px-4 py-2 backdrop-blur" style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{isMath ? 'Math' : 'Reading & Writing'}</div>
            <div className="text-xs text-hint">
              {t('runner.module')} {s.module.index + 1}/{s.module.totalModules}
            </div>
          </div>
          <TimerPill ms={left} hidden={timerHidden} onToggle={() => setTimerHidden((h) => !h)} />
          <div className="flex gap-1.5">
            {isMath && (
              <>
                <button onClick={() => setCalcOpen(true)} className="rounded-xl bg-soft px-2.5 py-1.5 text-lg" title={t('runner.calculator')}>
                  🧮
                </button>
                <button onClick={() => setRefOpen(true)} className="rounded-xl bg-soft px-2.5 py-1.5 text-lg" title={t('runner.reference')}>
                  📐
                </button>
              </>
            )}
          </div>
        </div>
        {sync === 'offline' && <div className="mt-1 rounded-lg bg-orange-500/15 px-2 py-1 text-center text-xs text-orange-600">📴 {t('runner.offline')}</div>}
      </header>

      <div className="px-4 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-text px-2.5 py-1 text-sm font-bold text-card">{cur?.number}</span>
            <button
              onClick={toggleMark}
              className={clsx('rounded-lg px-2.5 py-1 text-sm font-semibold', local.marked[cur?.order ?? -1] ? 'bg-orange-500/20 text-orange-600' : 'bg-soft text-hint')}
            >
              🔖 {local.marked[cur?.order ?? -1] ? t('runner.marked') : t('runner.mark')}
            </button>
          </div>
          {cur?.question.type === 'MCQ' && (
            <button
              onClick={() => setElimOn((v) => !v)}
              className={clsx('rounded-lg px-2.5 py-1 text-sm font-semibold', elimOn ? 'bg-red-500/15 text-red-500' : 'bg-soft text-hint')}
            >
              <span className="line-through">ABC</span> {t('runner.eliminate')}
            </button>
          )}
        </div>
        {cur && (
          <Card>
            <QuestionView
              q={cur.question}
              answer={local.answers[cur.order]}
              onAnswer={(v) => {
                setAnswer(v);
                haptic('select');
              }}
              eliminated={local.eliminated[cur.order]}
              onToggleEliminate={elimOn ? toggleElim : undefined}
              eliminatorOn={elimOn}
              split
            />
          </Card>
        )}
        <div className="mt-2 text-right text-xs text-hint">
          {sync === 'saving' ? t('runner.syncing') : sync === 'saved' && !local.dirty.length ? `✓ ${t('runner.synced')}` : ''}
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-3 pt-3 backdrop-blur" style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}>
        <div className={clsx('mx-auto flex items-center gap-2', wide ? 'max-w-3xl lg:max-w-6xl' : 'max-w-3xl')}>
          <Button variant="secondary" disabled={idx === 0} onClick={() => go(idx - 1)} title="←">
            ←
          </Button>
          <button onClick={() => setNavOpen(true)} className="flex-1 rounded-xl bg-soft py-2.5 font-semibold">
            {t('runner.questions')} {cur?.number}/{items.length} ▴
          </button>
          {idx < items.length - 1 ? (
            <Button onClick={() => go(idx + 1)}>→</Button>
          ) : (
            <Button loading={submitting} onClick={confirmSubmit}>
              ✓
            </Button>
          )}
        </div>
      </footer>

      <Sheet open={navOpen} onClose={() => setNavOpen(false)} title={t('runner.questions')}>
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-hint">
          <span>⬛ {t('home.done')}</span>
          <span>⬜ {t('runner.unanswered')}: {unanswered}</span>
          <span>🔖 {t('runner.marked')}</span>
        </div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
          {items.map((it, i) => {
            const answered = !!local.answers[it.order];
            return (
              <button
                key={it.order}
                onClick={() => go(i)}
                className={clsx(
                  'relative aspect-square rounded-xl border-2 text-sm font-bold',
                  answered ? 'border-accent bg-accent text-accent-text' : 'border-dashed border-line',
                  i === idx && 'ring-2 ring-orange-500 ring-offset-2 ring-offset-card',
                )}
              >
                {it.number}
                {local.marked[it.order] && <span className="absolute -right-1 -top-2 text-xs">🔖</span>}
              </button>
            );
          })}
        </div>
        <Button size="lg" className="mt-4" loading={submitting} onClick={confirmSubmit}>
          {t('runner.submitModule')}
        </Button>
      </Sheet>
      <Sheet open={calcOpen} onClose={() => setCalcOpen(false)} title={t('runner.calculator')} wide>
        <Calculator desmosKey={desmosKey} />
      </Sheet>
      <Sheet open={refOpen} onClose={() => setRefOpen(false)} title={t('runner.reference')}>
        <ReferenceSheet />
      </Sheet>
    </div>
  );
}
