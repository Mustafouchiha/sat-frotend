import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Avatar, Button, Card, SectionTitle, Segmented } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useT } from '../lib/i18n';
import { useAuth } from '../store/auth';

interface RushBoard {
  entries: Array<{ rank: number; userId: string; name: string; photoUrl: string | null; value: number }>;
  myBest: number;
}

export default function Rush() {
  const t = useT();
  const nav = useNavigate();
  const me = useAuth((s) => s.user);
  const [duration, setDuration] = useState<'180' | '300'>('180');
  const [section, setSection] = useState<'MATH' | 'RW' | 'MIX'>('MATH');
  const board = useQuery({ queryKey: ['rush-board', duration], queryFn: () => api<RushBoard>(`/leaderboard/rush?duration=${duration}`) });
  const start = useMutation({
    mutationFn: () => api<{ attemptId: string }>('/sessions/rush', { body: { durationSec: Number(duration), section: section === 'MIX' ? null : section } }),
    onSuccess: (r) => nav(`/session/${r.attemptId}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  return (
    <Page title={`⚡ ${t('rush.title')}`} back>
      <Card>
        <p className="mb-4 text-sm text-hint">{t('rush.subtitle')}</p>
        <div className="mb-3">
          <Segmented
            value={duration}
            onChange={setDuration}
            options={[
              { value: '180', label: `3 ${t('common.minutes')}` },
              { value: '300', label: `5 ${t('common.minutes')}` },
            ]}
          />
        </div>
        <div className="mb-4">
          <Segmented
            value={section}
            onChange={setSection}
            options={[
              { value: 'MATH', label: 'Math' },
              { value: 'RW', label: 'R&W' },
              { value: 'MIX', label: t('section.MIX') },
            ]}
          />
        </div>
        <div className="mb-4 flex items-center justify-between rounded-xl bg-soft p-3">
          <span className="text-sm text-hint">{t('rush.best')}</span>
          <span className="text-2xl font-black">{board.data?.myBest ?? 0}</span>
        </div>
        <Button size="lg" loading={start.isPending} onClick={() => start.mutate()}>
          ⚡ {t('common.start')}
        </Button>
      </Card>
      <SectionTitle>{t('rush.leaders')}</SectionTitle>
      <Card className="p-2">
        {(board.data?.entries ?? []).length === 0 && <div className="p-4 text-center text-sm text-hint">—</div>}
        {board.data?.entries.map((r) => (
          <div key={r.userId} className={`flex items-center gap-3 rounded-xl p-2 ${r.userId === me?.id ? 'bg-accent/10' : ''}`}>
            <span className="w-6 text-center font-bold text-hint">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <Avatar name={r.name} url={r.photoUrl} size={32} />
            <span className="flex-1 truncate font-medium">{r.name}</span>
            <span className="text-lg font-bold">{r.value}</span>
          </div>
        ))}
      </Card>
    </Page>
  );
}
