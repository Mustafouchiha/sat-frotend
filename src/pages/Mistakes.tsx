import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AskAiButton } from '../components/AskAi';
import { Page } from '../components/Layout';
import { MathText } from '../components/MathText';
import { QuestionView } from '../components/QuestionView';
import { toast } from '../components/Toast';
import { Badge, Button, Card, Empty, Loading, ProgressBar, SectionTitle, Sheet } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useT } from '../lib/i18n';
import type { ReviewQuestion } from '../lib/types';
import type { AiStatus } from './AiTutor';

interface MistakeItem {
  templateId: string;
  title: string;
  section: string;
  skillId: string;
  skill: string;
  domain: string;
  available: boolean;
  lastAnswerId: string;
  lastWrongAt: string;
  count: number;
  review: { stage: number; streak: number; dueAt: string; due: boolean } | null;
}

interface WeakTopic {
  skillId: string;
  name: string;
  section: string;
  domain: string;
  mistakes: number;
  questions: number;
  lastWrongAt: string | null;
}

interface JobView {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  total: number;
  done: number;
  created: number;
  rejected: number;
  error: string | null;
}

type PracticeResp = { attemptId?: string; jobId?: string };

/** AI shu mavzuda yangi savollar tayyorlayotganda — jarayon va tayyor bo'lgach mashqni ochish. */
function GeneratingSheet({ job, onClose }: { job: { jobId: string; skillId: string; name: string } | null; onClose: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const started = useRef<string | null>(null);
  const q = useQuery({
    queryKey: ['ai-job', job?.jobId],
    enabled: !!job,
    queryFn: () => api<JobView>(`/ai/jobs/${job!.jobId}`),
    refetchInterval: (query) => (query.state.data && ['DONE', 'FAILED'].includes(query.state.data.status) ? false : 2500),
  });
  const j = q.data;
  useEffect(() => {
    if (!job || !j || !['DONE', 'FAILED'].includes(j.status) || started.current === job.jobId) return;
    started.current = job.jobId;
    if (j.status === 'FAILED' && !j.created && j.error) toast(j.error, { kind: 'error' });
    api<PracticeResp>('/ai/practice', { body: { skillId: job.skillId, jobId: job.jobId } })
      .then((r) => r.attemptId && nav(`/session/${r.attemptId}`))
      .catch((e) => {
        toast(errorText(e), { kind: 'error' });
        onClose();
      });
  }, [j, job, nav, onClose]);

  const pct = j && j.total ? Math.round((j.done / j.total) * 100) : 5;
  return (
    <Sheet open={!!job} onClose={onClose} title={`✨ ${job?.name ?? ''}`}>
      <div className="py-2 text-center">
        <div className="mb-2 text-4xl">🤖</div>
        <div className="font-semibold">{t('mistakes.generating')}</div>
        <p className="mt-1 text-sm text-hint">{t('mistakes.generatingHint')}</p>
        <ProgressBar value={Math.max(5, pct)} className="mt-4 h-2" />
        {j && j.created > 0 && <div className="mt-2 text-sm text-green-600">{t('mistakes.generated', { n: j.created })}</div>}
      </div>
    </Sheet>
  );
}

export default function Mistakes() {
  const t = useT();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['mistakes'], queryFn: () => api<{ items: MistakeItem[]; topics: WeakTopic[]; reviewDue: number }>('/me/mistakes') });
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => api<AiStatus>('/ai/status') });
  const [viewId, setViewId] = useState<string | null>(null);
  const [gen, setGen] = useState<{ jobId: string; skillId: string; name: string } | null>(null);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const view = useQuery({
    queryKey: ['answer', viewId],
    enabled: !!viewId,
    queryFn: () => api<{ question: ReviewQuestion; answer: string | null }>(`/me/answers/${viewId}`),
  });

  const retry = useMutation({
    mutationFn: (templateIds: string[]) => api<{ attemptId: string }>('/sessions/practice', { body: { templateIds } }),
    onSuccess: (r) => nav(`/session/${r.attemptId}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const reviewAll = useMutation({
    mutationFn: () => api<{ attemptId: string }>('/sessions/review', { body: {} }),
    onSuccess: (r) => nav(`/session/${r.attemptId}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  const practice = async (tp: WeakTopic) => {
    setBusySkill(tp.skillId);
    try {
      const r = await api<PracticeResp>('/ai/practice', { body: { skillId: tp.skillId } });
      if (r.attemptId) nav(`/session/${r.attemptId}`);
      else if (r.jobId) setGen({ jobId: r.jobId, skillId: tp.skillId, name: tp.name });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusySkill(null);
    }
  };

  if (q.isLoading) return <Loading />;
  const items = q.data?.items ?? [];
  const topics = q.data?.topics ?? [];
  const aiOn = !!ai.data?.enabled;

  return (
    <Page title={`📒 ${t('mistakes.title')}`} back>
      <p className="mb-3 px-1 text-sm text-hint">{t('mistakes.subtitle')}</p>
      {items.length > 0 && (
        <Button size="lg" className="mb-3" loading={reviewAll.isPending} onClick={() => reviewAll.mutate()}>
          🔁 {t('mistakes.retryAll')} {q.data?.reviewDue ? `(${q.data.reviewDue})` : ''}
        </Button>
      )}
      {items.length === 0 && <Empty icon="🎉" text={t('mistakes.empty')} />}

      {topics.length > 0 && (
        <>
          <SectionTitle>🎯 {t('mistakes.topics')}</SectionTitle>
          <p className="-mt-1 mb-2 px-1 text-xs text-hint">{aiOn ? t('mistakes.topicsHint') : t('mistakes.topicsHintNoAi')}</p>
          <div className="mb-2 flex flex-col gap-2">
            {topics.map((tp) => (
              <Card key={tp.skillId}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{tp.name}</div>
                    <div className="text-xs text-hint">
                      {tp.section === 'MATH' ? 'Math' : 'R&W'} · {tp.domain}
                    </div>
                  </div>
                  <Badge color="#dc2626">{t('mistakes.mistakesCount', { n: tp.mistakes })}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {aiOn && (
                    <Button size="sm" variant="secondary" onClick={() => nav(`/ai?lesson=${encodeURIComponent(tp.skillId)}`)}>
                      {t('mistakes.explain')}
                    </Button>
                  )}
                  <Button size="sm" loading={busySkill === tp.skillId} onClick={() => void practice(tp)}>
                    {t('mistakes.newQuestions')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <SectionTitle>📝 {t('mistakes.questions')}</SectionTitle>
        </>
      )}

      <div className="flex flex-col gap-2">
        {items.map((m) => (
          <Card key={m.templateId}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{m.skill}</div>
                <div className="text-xs text-hint">
                  {m.domain} · {m.count} {t('mistakes.times')} · {fmtDate(m.lastWrongAt)}
                </div>
              </div>
              {m.review &&
                (m.review.due ? <Badge color="#dc2626">{t('mistakes.dueNow')}</Badge> : <Badge>{t('mistakes.inQueue')} · {fmtDate(m.review.dueAt)}</Badge>)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setViewId(m.lastAnswerId)}>
                👁 {t('mistakes.view')}
              </Button>
              {m.available && (
                <Button size="sm" loading={retry.isPending} onClick={() => retry.mutate([m.templateId])}>
                  🎲 {t('mistakes.retry')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={!!viewId} onClose={() => setViewId(null)} title={t('mistakes.view')}>
        {view.isLoading && <Loading />}
        {view.data && (
          <>
            <QuestionView
              q={view.data.question}
              answer={view.data.answer}
              disabled
              reveal={{ correctLabel: view.data.question.correctLabel, correctDisplay: view.data.question.correctDisplay, isCorrect: false }}
            />
            {view.data.question.explanation && (
              <div className="mt-3 rounded-xl bg-soft p-3 text-sm">
                <div className="mb-1 text-xs font-semibold text-hint">{t('common.explanation')}</div>
                <MathText text={view.data.question.explanation} />
              </div>
            )}
            {aiOn && (
              <div className="mt-3 text-right">
                <AskAiButton answerId={viewId} />
              </div>
            )}
          </>
        )}
      </Sheet>
      <GeneratingSheet job={gen} onClose={() => setGen(null)} />
    </Page>
  );
}
