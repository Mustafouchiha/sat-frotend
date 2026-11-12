import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { Badge, Button, Card, ErrorBox, Loading, ProgressBar, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtDelta, fmtTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { useAuth } from '../store/auth';
import type { ReviewQuestion } from '../lib/types';
import { ReviewList } from './Session';

interface ResultData {
  id: string;
  title: string | null;
  testType: string | null;
  student: { id: string; firstName: string; lastName: string | null };
  startedAt: string;
  finishedAt: string;
  blurCount: number;
  hidden: boolean;
  availableAt?: string;
  scores?: { rwScaled: number | null; mathScaled: number | null; totalScaled: number | null; rwRaw: number | null; mathRaw: number | null; correct: number; total: number; ratingDelta: number };
  modules?: Array<{ order: number; section: 'RW' | 'MATH'; stage: number; variant?: string; correct: number; total: number }>;
  domains?: Array<{ id: string; name: string; correct: number; total: number }>;
  items?: Array<{
    id: string;
    number: number;
    section: string | null;
    question: ReviewQuestion;
    answer: string | null;
    isCorrect: boolean | null;
    timeSpentMs: number;
    ratingDelta: number | null;
    templateId: string;
    templateVersion: number;
    seed: number;
    domain: string;
    skill: string;
  }>;
}

export default function Result() {
  const { id = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['result', id], queryFn: () => api<ResultData>(`/attempts/${id}/result`) });
  const meId = useAuth((st) => st.user?.id);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page back><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const r = q.data;

  if (r.hidden) {
    return (
      <Page title={t('result.title')} back>
        <Card className="text-center">
          <div className="text-5xl">🔒</div>
          <p className="mt-2 text-sm text-hint">{t('result.hidden')}</p>
          <p className="mt-1 font-semibold">{fmtDate(r.availableAt, true)}</p>
        </Card>
      </Page>
    );
  }
  const s = r.scores!;
  const duration = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();

  return (
    <Page title={t('result.title')} back>
      <Card className="text-center">
        <div className="text-sm text-hint">{r.title}</div>
        {s.totalScaled !== null ? (
          <>
            <div className="mt-1 text-xs font-semibold uppercase text-hint">{t('result.total')}</div>
            <div className="text-6xl font-black text-accent">{s.totalScaled}</div>
            <div className="text-xs text-hint">400–1600</div>
          </>
        ) : s.rwScaled !== null || s.mathScaled !== null ? (
          <div className="mt-2 text-6xl font-black text-accent">{s.rwScaled ?? s.mathScaled}</div>
        ) : (
          <div className="mt-2 text-6xl font-black text-accent">
            {s.correct}
            <span className="text-2xl text-hint">/{s.total}</span>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {s.rwScaled !== null && (
            <div className="rounded-xl bg-soft p-3">
              <div className="text-xs text-hint">Reading & Writing</div>
              <div className="text-2xl font-bold">{s.rwScaled}</div>
              <div className="text-xs text-hint">{s.rwRaw} ✓</div>
            </div>
          )}
          {s.mathScaled !== null && (
            <div className="rounded-xl bg-soft p-3">
              <div className="text-xs text-hint">Math</div>
              <div className="text-2xl font-bold">{s.mathScaled}</div>
              <div className="text-xs text-hint">{s.mathRaw} ✓</div>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Badge>⏱ {fmtTime(duration)}</Badge>
          <Badge color={s.ratingDelta >= 0 ? '#16a34a' : '#dc2626'}>
            {t('session.ratingChange')}: {fmtDelta(s.ratingDelta)}
          </Badge>
          {r.blurCount > 0 && <Badge color="#f59e0b">↗ {r.blurCount}</Badge>}
        </div>
      </Card>

      {r.modules && r.modules.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {r.modules.map((m) => (
            <Card key={m.order} className="p-3">
              <div className="text-xs text-hint">
                {m.section === 'MATH' ? 'Math' : 'R&W'} · {t('runner.module')} {m.stage}
                {m.variant && m.variant !== 'STANDARD' ? ` (${m.variant})` : ''}
              </div>
              <div className="text-lg font-bold">
                {m.correct}/{m.total}
              </div>
            </Card>
          ))}
        </div>
      )}

      {r.domains && (
        <>
          <SectionTitle>{t('result.byDomain')}</SectionTitle>
          <Card>
            {r.domains.map((d) => {
              const pct = d.total ? Math.round((d.correct / d.total) * 100) : 0;
              return (
                <div key={d.id} className="mb-3 last:mb-0">
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{d.name}</span>
                    <span className="text-hint">
                      {d.correct}/{d.total} · {pct}%
                    </span>
                  </div>
                  <ProgressBar value={pct} color={pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'} />
                </div>
              );
            })}
          </Card>
        </>
      )}

      {r.items && (
        <>
          <SectionTitle>{t('result.questions')}</SectionTitle>
          <ReviewList items={r.items.map((it) => ({ ...it, order: it.number }))} askAi={!r.student || r.student.id === meId} />
        </>
      )}
      <Button size="lg" variant="secondary" className="mt-4" onClick={() => nav('/mistakes')}>
        📒 {t('home.mistakes')}
      </Button>
    </Page>
  );
}
