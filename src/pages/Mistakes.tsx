import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { MathText } from '../components/MathText';
import { QuestionView } from '../components/QuestionView';
import { toast } from '../components/Toast';
import { Badge, Button, Card, Empty, Loading, Sheet } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useT } from '../lib/i18n';
import type { ReviewQuestion } from '../lib/types';

interface MistakeItem {
  templateId: string;
  title: string;
  section: string;
  skill: string;
  domain: string;
  available: boolean;
  lastAnswerId: string;
  lastWrongAt: string;
  count: number;
  review: { stage: number; streak: number; dueAt: string; due: boolean } | null;
}

export default function Mistakes() {
  const t = useT();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['mistakes'], queryFn: () => api<{ items: MistakeItem[]; reviewDue: number }>('/me/mistakes') });
  const [viewId, setViewId] = useState<string | null>(null);
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

  if (q.isLoading) return <Loading />;
  const items = q.data?.items ?? [];

  return (
    <Page title={`📒 ${t('mistakes.title')}`} back>
      <p className="mb-3 px-1 text-sm text-hint">{t('mistakes.subtitle')}</p>
      {items.length > 0 && (
        <Button size="lg" className="mb-3" loading={reviewAll.isPending} onClick={() => reviewAll.mutate()}>
          🔁 {t('mistakes.retryAll')} {q.data?.reviewDue ? `(${q.data.reviewDue})` : ''}
        </Button>
      )}
      {items.length === 0 && <Empty icon="🎉" text={t('mistakes.empty')} />}
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
            <div className="mt-3 flex gap-2">
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
          </>
        )}
      </Sheet>
    </Page>
  );
}
