import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LineChart } from '../../components/LineChart';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Avatar, Badge, Button, Card, ErrorBox, inputCls, Loading, ProgressBar, SectionTitle, StatTile } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { fmtDate, fmtDelta } from '../../lib/format';
import { useT } from '../../lib/i18n';
import type { Stats, User } from '../../lib/types';

interface StudentData {
  user: User;
  stats: Stats;
  ratingHistory: { points: Array<{ date: string; rating: number }>; weekChange: number };
  scoreHistory: Array<{ date: string; total: number | null }>;
  skills: Array<{ id: string; name: string; skills: Array<{ id: string; name: string; mastery: number; answered: number; accuracy: number | null; bucket: string }> }>;
  attempts: Array<{ id: string; mode: string; title: string | null; correctCount: number; totalItems: number; totalScaled: number | null; blurCount: number; ratingDelta: number; finishedAt: string }>;
  avgTimeSec: number | null;
  comments: Array<{ id: string; text: string; createdAt: string; teacher: string }>;
}

export default function StudentDetail() {
  const { id = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['student', id], queryFn: () => api<StudentData>(`/students/${id}`) });
  const comment = useMutation({
    mutationFn: () => api(`/students/${id}/comments`, { body: { text } }),
    onSuccess: () => {
      setText('');
      toast("Izoh yuborildi", { icon: '💬' });
      void qc.invalidateQueries({ queryKey: ['student', id] });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page back><ErrorBox error={q.error} /></Page>;
  const d = q.data;
  const allSkills = d.skills.flatMap((dm) => dm.skills.map((s) => ({ ...s, domain: dm.name }))).filter((s) => s.answered > 0);
  const weak = [...allSkills].sort((a, b) => a.mastery - b.mastery).slice(0, 4);
  const strong = [...allSkills].sort((a, b) => b.mastery - a.mastery).slice(0, 4);

  return (
    <Page title={d.user.name} back wide>
      <Card className="flex items-center gap-3">
        <Avatar name={d.user.name} url={d.user.photoUrl} size={52} />
        <div className="flex-1">
          <div className="font-bold">{d.user.name}</div>
          <div className="text-sm text-hint">{d.user.username ? `@${d.user.username}` : ''}</div>
          <div className="mt-1 flex gap-1">
            <Badge color={d.stats.ratings.OVERALL.title.color}>
              {d.stats.ratings.OVERALL.title.icon} {d.stats.ratings.OVERALL.title.name}
            </Badge>
            {d.user.targetScore && <Badge>🎯 {d.user.targetScore}</Badge>}
          </div>
        </div>
      </Card>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Umumiy reyting" value={d.stats.ratings.OVERALL.rating} sub={`7 kun: ${fmtDelta(d.ratingHistory.weekChange)}`} />
        <StatTile label="Math / R&W" value={`${d.stats.ratings.MATH.rating} / ${d.stats.ratings.RW.rating}`} />
        <StatTile label="Taxminiy SAT" value={d.stats.ratings.OVERALL.estimatedSat} />
        <StatTile label="O'rtacha vaqt / savol" value={d.avgTimeSec ? `${d.avgTimeSec}s` : '—'} sub={`🔥 ${d.stats.streak.current} kun`} />
      </div>

      <SectionTitle>Ball dinamikasi</SectionTitle>
      <Card>
        <div className="mb-1 text-xs text-hint">Reyting (120 kun)</div>
        <LineChart points={d.ratingHistory.points.map((p) => ({ x: p.date.slice(5), y: p.rating }))} />
        {d.scoreHistory.length > 0 && (
          <>
            <div className="mb-1 mt-3 text-xs text-hint">Mock test ballari</div>
            <LineChart color="#16a34a" points={d.scoreHistory.map((p) => ({ x: fmtDate(p.date).slice(0, 5), y: p.total ?? 0 }))} />
          </>
        )}
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-2 font-semibold text-red-500">⚠️ {t('practice.weak')}</div>
          {weak.map((s) => (
            <div key={s.id} className="mb-2">
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate pr-2">{s.name}</span>
                <span>{s.mastery}%</span>
              </div>
              <ProgressBar value={s.mastery} color="#ef4444" />
            </div>
          ))}
        </Card>
        <Card>
          <div className="mb-2 font-semibold text-green-600">💪 {t('practice.strong')}</div>
          {strong.map((s) => (
            <div key={s.id} className="mb-2">
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate pr-2">{s.name}</span>
                <span>{s.mastery}%</span>
              </div>
              <ProgressBar value={s.mastery} color="#22c55e" />
            </div>
          ))}
        </Card>
      </div>

      <SectionTitle>Urinishlar</SectionTitle>
      <Card className="p-2">
        {d.attempts.map((a) => (
          <button
            key={a.id}
            onClick={() => a.mode === 'TEST' && nav(`/attempt/${a.id}/result`)}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-soft"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.title}</div>
              <div className="text-xs text-hint">
                {fmtDate(a.finishedAt, true)}
                {a.blurCount > 0 && <span className="text-orange-500"> · {t('teacher.blur')}: {a.blurCount}</span>}
              </div>
            </div>
            <div className="text-right font-bold">{a.totalScaled ?? `${a.correctCount}/${a.totalItems}`}</div>
          </button>
        ))}
      </Card>

      <SectionTitle>{t('profile.comments')}</SectionTitle>
      <Card>
        <textarea className={inputCls} rows={3} placeholder={t('teacher.comment')} value={text} onChange={(e) => setText(e.target.value)} />
        <Button className="mt-2" disabled={!text.trim()} loading={comment.isPending} onClick={() => comment.mutate()}>
          💬 {t('teacher.comment')}
        </Button>
        <div className="mt-3 flex flex-col gap-2">
          {d.comments.map((c) => (
            <div key={c.id} className="rounded-xl bg-soft p-2 text-sm">
              {c.text}
              <div className="mt-1 text-xs text-hint">
                {c.teacher} · {fmtDate(c.createdAt, true)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
