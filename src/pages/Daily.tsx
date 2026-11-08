import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Avatar, Button, Card, ErrorBox, Loading, SectionTitle } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtTime, msToTashkentMidnight } from '../lib/format';
import { useT } from '../lib/i18n';
import { useAuth } from '../store/auth';

interface DailyInfo {
  date: string;
  available: boolean;
  count: number;
  durationMin: number;
  my: { attemptId: string; status: string; correct: number; total: number } | null;
  streak: { current: number; best: number; doneToday: boolean };
  leaderboard: Array<{ rank: number; userId: string; name: string; photoUrl: string | null; correct: number; total: number; timeMs: number }>;
}

export default function Daily() {
  const t = useT();
  const nav = useNavigate();
  const me = useAuth((s) => s.user);
  const q = useQuery({ queryKey: ['daily'], queryFn: () => api<DailyInfo>('/daily') });
  const [toMidnight, setToMidnight] = useState(msToTashkentMidnight());
  useEffect(() => {
    const id = window.setInterval(() => setToMidnight(msToTashkentMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const start = useMutation({
    mutationFn: () => api<{ attemptId: string }>('/daily/start', { body: {} }),
    onSuccess: (r) => nav(`/session/${r.attemptId}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const done = d.my?.status === 'FINISHED';

  return (
    <Page title={t('daily.title')} back>
      <Card className="text-center">
        <div className="text-6xl">🔥</div>
        <div className="mt-1 text-4xl font-black">{d.streak.current}</div>
        <div className="text-sm text-hint">
          {t('home.streak')} · {t('profile.peak')}: {d.streak.best}
        </div>
        <p className="mx-auto mt-3 max-w-sm text-sm text-hint">{t('daily.subtitle')}</p>
        <div className="mt-1 text-xs text-hint">
          {d.count} {t('common.questions')} · {d.durationMin} {t('common.minutes')}
        </div>
        <div className="mt-4">
          {done ? (
            <>
              <div className="mb-2 font-semibold text-green-600">
                ✓ {t('daily.done')} · {d.my!.correct}/{d.my!.total}
              </div>
              <div className="text-sm text-hint">
                {t('daily.next')}: <span className="font-mono">{fmtTime(toMidnight)}</span>
              </div>
              <Button variant="secondary" className="mt-3" onClick={() => nav(`/session/${d.my!.attemptId}/review`)}>
                🔍 {t('session.review')}
              </Button>
            </>
          ) : (
            <Button size="lg" disabled={!d.available} loading={start.isPending} onClick={() => (d.my ? nav(`/session/${d.my.attemptId}`) : start.mutate())}>
              {d.my ? t('daily.continue') : t('daily.start')}
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-hint">❄️ {t('daily.freeze')}</p>
      </Card>

      <SectionTitle>{t('daily.leaders')}</SectionTitle>
      <Card className="p-2">
        {d.leaderboard.length === 0 && <div className="p-4 text-center text-sm text-hint">—</div>}
        {d.leaderboard.map((r) => (
          <div key={r.userId} className={`flex items-center gap-3 rounded-xl p-2 ${r.userId === me?.id ? 'bg-accent/10' : ''}`}>
            <span className="w-6 text-center font-bold text-hint">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <Avatar name={r.name} url={r.photoUrl} size={32} />
            <span className="flex-1 truncate font-medium">{r.name}</span>
            <span className="font-bold">
              {r.correct}/{r.total}
            </span>
            <span className="w-14 text-right font-mono text-xs text-hint">{fmtTime(r.timeMs)}</span>
          </div>
        ))}
      </Card>
    </Page>
  );
}
