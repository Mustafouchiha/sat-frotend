import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '../components/Layout';
import { Avatar, Badge, Card, Empty, ErrorBox, Loading, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { fmtDelta, fmtTime } from '../lib/format';
import { useT } from '../lib/i18n';
import type { Title } from '../lib/types';
import { useAuth } from '../store/auth';

interface Entry {
  rank: number;
  userId: string;
  name: string;
  photoUrl: string | null;
  value: number;
  title?: Title;
  provisional?: boolean;
  correct?: number;
  total?: number;
  timeMs?: number;
}

type Tab = 'rating' | 'daily' | 'rush';

export default function Leaderboard() {
  const t = useT();
  const me = useAuth((s) => s.user);
  const groups = useAuth((s) => s.groups).filter((g) => g.role === 'STUDENT');
  const [tab, setTab] = useState<Tab>('rating');
  const [type, setType] = useState<'OVERALL' | 'MATH' | 'RW'>('OVERALL');
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('all');
  const [scope, setScope] = useState<string>('center');

  const url =
    tab === 'daily'
      ? '/leaderboard/daily'
      : tab === 'rush'
        ? '/leaderboard/rush?duration=180'
        : `/leaderboard?type=${type}&period=${period}${scope !== 'center' ? `&scope=group&groupId=${scope}` : ''}`;
  const q = useQuery({ queryKey: ['lb', url], queryFn: () => api<{ entries: Entry[]; myRank?: number | null; myBest?: number }>(url) });

  return (
    <Page title={`🏆 ${t('lb.title')}`}>
      <Segmented
        className="mb-2"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rating', label: t('home.rating') },
          { value: 'daily', label: t('lb.daily') },
          { value: 'rush', label: '⚡ Rush' },
        ]}
      />
      {tab === 'rating' && (
        <>
          <Segmented
            className="mb-2"
            value={type}
            onChange={setType}
            options={[
              { value: 'OVERALL', label: t('lb.all') },
              { value: 'MATH', label: 'Math' },
              { value: 'RW', label: 'R&W' },
            ]}
          />
          <div className="mb-3 flex gap-2">
            <Segmented
              className="flex-1"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'week', label: t('lb.week') },
                { value: 'month', label: t('lb.month') },
              ]}
            />
            {groups.length > 0 && (
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-xl border border-line bg-card px-2 text-sm">
                <option value="center">{t('lb.center')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </>
      )}
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && (
        <Card className="p-2">
          {q.data.entries.length === 0 && <Empty />}
          {q.data.entries.map((e) => (
            <div key={e.userId} className={`flex items-center gap-3 rounded-xl p-2 ${e.userId === me?.id ? 'bg-accent/10' : ''}`}>
              <span className="w-7 text-center font-bold text-hint">{e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</span>
              <Avatar name={e.name} url={e.photoUrl} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.name}</div>
                {e.title && (
                  <Badge color={e.title.color} className="mt-0.5">
                    {e.title.icon} {e.title.name}
                  </Badge>
                )}
              </div>
              {tab === 'daily' ? (
                <div className="text-right">
                  <div className="font-bold">
                    {e.correct}/{e.total}
                  </div>
                  <div className="font-mono text-xs text-hint">{fmtTime(e.timeMs ?? 0)}</div>
                </div>
              ) : (
                <div className="text-lg font-bold tabular-nums">
                  {tab === 'rating' && period !== 'all' ? fmtDelta(e.value) : e.value}
                  {e.provisional && <span className="text-hint">?</span>}
                </div>
              )}
            </div>
          ))}
          {q.data.myRank && !q.data.entries.some((e) => e.userId === me?.id) && (
            <div className="mt-2 border-t border-line p-2 text-center text-sm text-hint">
              {t('lb.myRank')}: <b className="text-text">#{q.data.myRank}</b>
            </div>
          )}
        </Card>
      )}
    </Page>
  );
}
