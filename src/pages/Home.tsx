import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { LineChart } from '../components/LineChart';
import { Page } from '../components/Layout';
import { Avatar, Badge, Card, ErrorBox, Loading, ProgressBar, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtDelta } from '../lib/format';
import { useT } from '../lib/i18n';
import type { Stats, User } from '../lib/types';

interface Dashboard {
  user: User;
  stats: Stats;
  daily: { date: string; done: boolean; attemptId: string | null; correct: number; total: number };
  reviewDue: number;
  assignments: Array<{
    id: string;
    title: string;
    testTitle: string;
    dueAt: string | null;
    maxAttempts: number;
    attemptsUsed: number;
    done: boolean;
    inProgressId: string | null;
    overdue: boolean;
  }>;
  lastTest: { id: string; title: string; totalScaled: number | null; correctCount: number; totalItems: number; finishedAt: string } | null;
  weeklyDelta: number;
  daysToExam: number | null;
}

export default function Home() {
  const t = useT();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/me/dashboard') });
  const hist = useQuery({
    queryKey: ['rating-history', 'OVERALL', 30],
    queryFn: () => api<{ points: Array<{ date: string; rating: number }> }>('/me/rating-history?type=OVERALL&days=30'),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const r = d.stats.ratings.OVERALL;
  const lvl = d.stats.level;

  return (
    <Page>
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={d.user.name} url={d.user.photoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">
            {t('home.hello')}, {d.user.firstName || d.user.name}!
          </div>
          <div className="flex items-center gap-2 text-xs text-hint">
            <span>
              ⭐ {t('profile.level')} {lvl.level}
            </span>
            <ProgressBar value={lvl.progress * 100} className="h-1.5 w-20" />
          </div>
        </div>
        <Link to="/daily" className="flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1.5 font-bold text-orange-500">
          🔥 {d.stats.streak.current}
        </Link>
      </div>

      <Card onClick={() => nav('/profile')} className="relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-hint">{t('home.rating')}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tabular-nums">{r.rating}</span>
              {r.provisional && (
                <span title={t('home.provisional')} className="text-2xl font-bold text-hint">
                  ?
                </span>
              )}
              <span className={`text-sm font-bold ${d.weeklyDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {fmtDelta(d.weeklyDelta)} <span className="font-normal text-hint">{t('home.week')}</span>
              </span>
            </div>
            <Badge color={r.title.color} className="mt-1">
              {r.title.icon} {r.title.name}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-xs text-hint">{t('home.estimated')}</div>
            <div className="text-2xl font-bold text-accent">{r.estimatedSat}</div>
            {/* Taxminiy SAT = Math + R&W */}
            <div className="mt-1 flex gap-1 text-xs text-hint tabular-nums">
              <span>Math {d.stats.ratings.MATH.rating}</span>
              <span>+</span>
              <span>R&W {d.stats.ratings.RW.rating}</span>
            </div>
          </div>
        </div>
        {hist.data && hist.data.points.length > 1 && (
          <div className="mt-2">
            <LineChart points={hist.data.points.map((p) => ({ x: p.date.slice(5), y: p.rating }))} height={80} showLabels={false} />
          </div>
        )}
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card onClick={() => nav('/profile')}>
          <div className="text-xs text-hint">{t('home.target')}</div>
          <div className="text-xl font-bold">{d.user.targetScore ?? '—'}</div>
        </Card>
        <Card onClick={() => nav('/profile')}>
          <div className="text-xs text-hint">{t('home.examIn')}</div>
          <div className="text-xl font-bold">{d.daysToExam !== null ? `${d.daysToExam} ${t('common.days')}` : '—'}</div>
        </Card>
      </div>
      {!d.user.targetScore && !d.daysToExam && (
        <Link to="/profile" className="mt-2 block px-1 text-sm text-link">
          ✏️ {t('home.setTarget')}
        </Link>
      )}

      <SectionTitle>{t('home.today')}</SectionTitle>
      <div className="flex flex-col gap-2.5">
        <Card onClick={() => nav('/daily')} className="flex items-center gap-3">
          <div className="text-3xl">📅</div>
          <div className="flex-1">
            <div className="font-semibold">{t('home.daily')}</div>
            <div className="text-sm text-hint">
              {d.daily.done ? `${t('home.dailyDone')} · ${d.daily.correct}/${d.daily.total}` : t('home.dailyTodo')}
            </div>
          </div>
          {d.daily.done ? <span className="text-2xl">✅</span> : <span className="text-hint">›</span>}
        </Card>
        {d.reviewDue > 0 && (
          <Card onClick={() => nav('/mistakes')} className="flex items-center gap-3">
            <div className="text-3xl">🔁</div>
            <div className="flex-1">
              <div className="font-semibold">{t('home.review')}</div>
              <div className="text-sm text-hint">
                {d.reviewDue} {t('home.reviewDue')}
              </div>
            </div>
            <span className="text-hint">›</span>
          </Card>
        )}
        {d.assignments.map((a) => (
          <Card key={a.id} onClick={() => nav('/tests')} className="flex items-center gap-3">
            <div className="text-3xl">📝</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{a.title}</div>
              <div className="text-sm text-hint">
                {a.done ? (
                  <span className="text-green-600">✓ {t('home.done')}</span>
                ) : a.overdue ? (
                  <span className="text-red-500">{t('home.overdue')}</span>
                ) : (
                  <>
                    {t('home.due')}: {fmtDate(a.dueAt, true)}
                  </>
                )}
              </div>
            </div>
            <span className="text-hint">›</span>
          </Card>
        ))}
      </div>

      <SectionTitle>{t('home.play')}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Tile to="/practice" icon="🎯" title={t('nav.practice')} sub={t('practice.title')} />
        <Tile to="/rush" icon="⚡" title={t('home.rush')} sub={t('home.rushDesc')} />
        <Tile to="/duel" icon="⚔️" title={t('home.duel')} sub={t('home.duelDesc')} />
        <Tile to="/mistakes" icon="📒" title={t('home.mistakes')} sub={d.reviewDue ? `${d.reviewDue} ${t('mistakes.dueNow').toLowerCase()}` : '—'} />
      </div>

      {d.lastTest && (
        <>
          <SectionTitle>{t('home.lastTest')}</SectionTitle>
          <Card onClick={() => nav(`/attempt/${d.lastTest!.id}/result`)} className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{d.lastTest.title}</div>
              <div className="text-sm text-hint">{fmtDate(d.lastTest.finishedAt)}</div>
            </div>
            <div className="text-2xl font-black text-accent">
              {d.lastTest.totalScaled ?? `${d.lastTest.correctCount}/${d.lastTest.totalItems}`}
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}

function Tile({ to, icon, title, sub }: { to: string; icon: string; title: string; sub: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-card p-4 transition active:scale-[0.98]">
      <div className="mb-1 text-3xl">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-hint">{sub}</div>
    </Link>
  );
}
