import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Badge, Button, Card, Empty, Loading, SectionTitle } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtDate, fmtDelta } from '../lib/format';
import { useT } from '../lib/i18n';

interface MyAssignment {
  id: string;
  title: string;
  group: string;
  test: { id: string; title: string; type: string };
  dueAt: string | null;
  maxAttempts: number;
  resultsHidden: boolean;
  overdue: boolean;
  attempts: Array<{ id: string; status: string; totalScaled: number | null; correctCount: number | null; totalItems: number; finishedAt: string | null }>;
}

interface PublicTest {
  id: string;
  title: string;
  description: string | null;
  type: string;
  sections: string[];
  moduleCount: number;
  questionCount: number;
  durationMin: number;
}

interface HistoryItem {
  id: string;
  mode: string;
  title: string | null;
  correctCount: number;
  totalItems: number;
  totalScaled: number | null;
  ratingDelta: number;
  finishedAt: string;
}

export default function Tests() {
  const t = useT();
  const nav = useNavigate();
  const assignments = useQuery({ queryKey: ['my-assignments'], queryFn: () => api<MyAssignment[]>('/me/assignments') });
  const publicTests = useQuery({ queryKey: ['public-tests'], queryFn: () => api<PublicTest[]>('/tests/public') });
  const history = useQuery({ queryKey: ['my-attempts'], queryFn: () => api<HistoryItem[]>('/me/attempts') });

  const start = useMutation({
    mutationFn: (body: { testId?: string; assignmentId?: string }) => api<{ attemptId: string }>('/attempts', { body }),
    onSuccess: (r) => nav(`/attempt/${r.attemptId}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  return (
    <Page title={t('tests.title')}>
      <SectionTitle>{t('tests.assigned')}</SectionTitle>
      {assignments.isLoading && <Loading />}
      {assignments.data?.length === 0 && <Empty icon="🗂" />}
      <div className="flex flex-col gap-2.5">
        {assignments.data?.map((a) => {
          const inProgress = a.attempts.find((x) => x.status !== 'FINISHED');
          const finished = a.attempts.filter((x) => x.status === 'FINISHED');
          const canStart = !a.overdue && a.attempts.length < a.maxAttempts;
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-xs text-hint">
                    {a.group} · {a.test.title}
                  </div>
                </div>
                {a.overdue ? <Badge color="#dc2626">{t('home.overdue')}</Badge> : a.dueAt ? <Badge>{fmtDate(a.dueAt, true)}</Badge> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {finished.map((f) => (
                  <button key={f.id} onClick={() => nav(`/attempt/${f.id}/result`)}>
                    <Badge color="#4f46e5">{a.resultsHidden ? '🔒' : f.totalScaled ?? `${f.correctCount}/${f.totalItems}`}</Badge>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-hint">
                  {a.attempts.length}/{a.maxAttempts} {t('tests.attempts')}
                  {a.resultsHidden && ` · ${t('tests.resultsLater')}`}
                </span>
                {inProgress ? (
                  <Button size="sm" onClick={() => nav(`/attempt/${inProgress.id}`)}>
                    {t('common.continue')}
                  </Button>
                ) : canStart ? (
                  <Button size="sm" loading={start.isPending} onClick={() => start.mutate({ assignmentId: a.id })}>
                    {t('common.start')}
                  </Button>
                ) : (
                  <span className="text-xs text-hint">{t('tests.noAttempts')}</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <SectionTitle>{t('tests.public')}</SectionTitle>
      <div className="flex flex-col gap-2.5">
        {publicTests.data?.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{p.title}</div>
                {p.description && <div className="mt-0.5 text-xs text-hint">{p.description}</div>}
              </div>
              <Badge>{p.type}</Badge>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-hint">
                {p.questionCount} {t('common.questions')} · {p.durationMin} {t('common.minutes')}
              </span>
              <Button size="sm" variant="secondary" loading={start.isPending} onClick={() => start.mutate({ testId: p.id })}>
                {t('common.start')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle>{t('tests.history')}</SectionTitle>
      <Card className="p-2">
        {history.data?.length === 0 && <Empty />}
        {history.data?.map((h) => (
          <button
            key={h.id}
            onClick={() => nav(h.mode === 'TEST' ? `/attempt/${h.id}/result` : `/session/${h.id}/review`)}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-soft"
          >
            <span className="text-xl">{h.mode === 'TEST' ? '📝' : h.mode === 'DAILY' ? '📅' : h.mode === 'RUSH' ? '⚡' : h.mode === 'DUEL' ? '⚔️' : '🎯'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{h.title}</div>
              <div className="text-xs text-hint">{fmtDate(h.finishedAt, true)}</div>
            </div>
            <div className="text-right">
              <div className="font-bold">{h.totalScaled ?? `${h.correctCount}/${h.totalItems}`}</div>
              <div className={`text-xs ${h.ratingDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtDelta(h.ratingDelta)}</div>
            </div>
          </button>
        ))}
      </Card>
    </Page>
  );
}
