import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../components/LineChart';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Avatar, Badge, Button, Card, Field, inputCls, ProgressBar, SectionTitle, Segmented } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtDate, fmtDelta } from '../lib/format';
import { useLang, useT, type Lang } from '../lib/i18n';
import { isTelegram, openTelegramLink, shareToTelegram } from '../lib/telegram';
import type { Achievement, Stats, User } from '../lib/types';
import { hasRole, useAuth } from '../store/auth';

interface History {
  points: Array<{ date: string; rating: number }>;
  current: number | null;
  peak: number | null;
  dayChange: number;
  weekChange: number;
}

export default function Profile() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const groups = useAuth((s) => s.groups);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const botUsername = useAuth((s) => s.config.botUsername);
  const { lang, setLang } = useLang();
  const [type, setType] = useState<'OVERALL' | 'MATH' | 'RW'>('OVERALL');
  const me = useQuery({ queryKey: ['me-stats'], queryFn: () => api<{ stats: Stats }>('/me') });
  const hist = useQuery({ queryKey: ['rating-history', type, 90], queryFn: () => api<History>(`/me/rating-history?type=${type}&days=90`) });
  const ach = useQuery({ queryKey: ['achievements'], queryFn: () => api<Achievement[]>('/me/achievements') });
  const comments = useQuery({ queryKey: ['comments'], queryFn: () => api<Array<{ id: string; text: string; createdAt: string; teacher: string }>>('/me/comments') });

  const [target, setTarget] = useState(user.targetScore?.toString() ?? '');
  const [exam, setExam] = useState(user.examDate ? user.examDate.slice(0, 10) : '');
  useEffect(() => {
    setTarget(user.targetScore?.toString() ?? '');
    setExam(user.examDate ? user.examDate.slice(0, 10) : '');
  }, [user.targetScore, user.examDate]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ user: User }>('/me', { method: 'PATCH', body }),
    onSuccess: (r) => {
      setUser(r.user);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(t('common.saved'), { icon: '✅' });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const parent = useMutation({
    mutationFn: () => api<{ code: string; link: string | null }>('/me/parent-code', { body: {} }),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  const stats = me.data?.stats;
  const r = stats?.ratings[type];

  return (
    <Page title={t('profile.title')}>
      <Card className="flex items-center gap-3">
        <Avatar name={user.name} url={user.photoUrl} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{user.name}</div>
          {user.username && <div className="text-sm text-hint">@{user.username}</div>}
          <div className="mt-1 flex flex-wrap gap-1">
            {user.roles.map((role) => (
              <Badge key={role}>{role}</Badge>
            ))}
          </div>
        </div>
      </Card>

      {hasRole(user, 'TEACHER', 'OPERATOR') && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to="/teacher" className="rounded-2xl bg-card p-3 text-center font-semibold">
            👩‍🏫 {t('teacher.groups')}
          </Link>
          {hasRole(user, 'OPERATOR') && (
            <Link to="/admin" className="rounded-2xl bg-card p-3 text-center font-semibold">
              🧭 Admin
            </Link>
          )}
        </div>
      )}

      {stats && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['OVERALL', 'MATH', 'RW'] as const).map((k) => (
              <button key={k} onClick={() => setType(k)} className={`rounded-2xl p-3 text-center ${type === k ? 'bg-accent text-accent-text' : 'bg-card'}`}>
                <div className="text-xs opacity-80">{k === 'OVERALL' ? t('lb.all') : k === 'MATH' ? 'Math' : 'R&W'}</div>
                <div className="text-xl font-black">
                  {stats.ratings[k].rating}
                  {stats.ratings[k].provisional && '?'}
                </div>
              </button>
            ))}
          </div>
          {r && (
            <Card className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <Badge color={r.title.color}>
                  {r.title.icon} {r.title.name}
                </Badge>
                <div className="text-xs text-hint">
                  {t('profile.peak')}: <b className="text-text">{r.peak}</b> · {t('home.estimated')}: <b className="text-text">{r.estimatedSat}</b>
                </div>
              </div>
              <div className="mb-1 text-sm font-semibold">{t('profile.history')}</div>
              {hist.data && <LineChart points={hist.data.points.map((p) => ({ x: p.date.slice(5), y: p.rating }))} />}
              {hist.data && (
                <div className="mt-1 flex justify-around text-xs text-hint">
                  <span>
                    24h: <b className={hist.data.dayChange >= 0 ? 'text-green-600' : 'text-red-500'}>{fmtDelta(hist.data.dayChange)}</b>
                  </span>
                  <span>
                    7d: <b className={hist.data.weekChange >= 0 ? 'text-green-600' : 'text-red-500'}>{fmtDelta(hist.data.weekChange)}</b>
                  </span>
                </div>
              )}
            </Card>
          )}
          <Card className="mt-3">
            <div className="mb-1 flex justify-between text-sm">
              <span>
                ⭐ {t('profile.level')} {stats.level.level}
              </span>
              <span className="text-hint">
                {user.xp} / {stats.level.next} XP
              </span>
            </div>
            <ProgressBar value={stats.level.progress * 100} />
          </Card>
        </>
      )}

      <SectionTitle>{t('profile.achievements')}</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {ach.data?.map((a) => (
          <div key={a.code} title={a.description} className={`rounded-2xl bg-card p-2 text-center ${a.earnedAt ? '' : 'opacity-35 grayscale'}`}>
            <div className="text-2xl">{a.icon}</div>
            <div className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-tight">{a.name}</div>
          </div>
        ))}
      </div>

      <SectionTitle>{t('common.save')}</SectionTitle>
      <Card>
        <Field label={t('profile.lang')}>
          <Segmented
            value={lang}
            onChange={(l: Lang) => {
              setLang(l);
              save.mutate({ lang: l });
            }}
            options={[
              { value: 'uz', label: "O'zbek" },
              { value: 'ru', label: 'Русский' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('profile.target')}>
            <input className={inputCls} type="number" min={400} max={1600} step={10} value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label={t('profile.examDate')}>
            <input className={inputCls} type="date" value={exam} onChange={(e) => setExam(e.target.value)} />
          </Field>
        </div>
        <label className="mb-3 flex items-center justify-between">
          <span className="text-sm">{t('profile.notifyDaily')}</span>
          <input type="checkbox" checked={user.notifyDaily} onChange={(e) => save.mutate({ notifyDaily: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
        <Button
          className="w-full"
          loading={save.isPending}
          onClick={() => save.mutate({ targetScore: target ? Number(target) : null, examDate: exam || null })}
        >
          {t('common.save')}
        </Button>
      </Card>

      {(comments.data?.length ?? 0) > 0 && (
        <>
          <SectionTitle>{t('profile.comments')}</SectionTitle>
          <div className="flex flex-col gap-2">
            {comments.data!.map((c) => (
              <Card key={c.id}>
                <div className="text-sm">{c.text}</div>
                <div className="mt-1 text-xs text-hint">
                  {c.teacher} · {fmtDate(c.createdAt, true)}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle>{t('profile.groups')}</SectionTitle>
      <Card>
        {groups.length === 0 && <div className="mb-2 text-sm text-hint">—</div>}
        {groups.map((g) => (
          <div key={g.id} className="mb-1 flex justify-between text-sm">
            <span>{g.name}</span>
            <Badge>{g.role}</Badge>
          </div>
        ))}
        <Link to="/join" className="mt-2 block text-sm text-link">
          + {t('profile.joinGroup')}
        </Link>
      </Card>

      <SectionTitle>{t('profile.parent')}</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-hint">{t('profile.parentText')}</p>
        {parent.data ? (
          <div className="rounded-xl bg-soft p-3 text-center">
            <div className="font-mono text-xl font-bold tracking-widest">{parent.data.code}</div>
            {parent.data.link && (
              <Button size="sm" className="mt-2" onClick={() => shareToTelegram(parent.data!.link!, 'SAT Prep: haftalik hisobotni olish uchun bosing')}>
                📤 {t('common.share')}
              </Button>
            )}
          </div>
        ) : (
          <Button variant="secondary" loading={parent.isPending} onClick={() => parent.mutate()}>
            👨‍👩‍👧 {t('profile.parentCode')}
          </Button>
        )}
      </Card>

      <SectionTitle>💻 {t('profile.webTitle')}</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-hint">{t('profile.webText', { url: window.location.host })}</p>
        {user.phone && (
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <span>{t('profile.phoneLinked')}</span>
            <b className="tabular-nums">{user.phone}</b>
          </div>
        )}
        {botUsername && (
          <Button variant="secondary" onClick={() => openTelegramLink(`https://t.me/${botUsername}?start=phone`)}>
            {user.phone ? t('profile.relinkPhone') : t('profile.linkPhone')}
          </Button>
        )}
      </Card>

      {!isTelegram && (
        <Button
          variant="danger"
          size="lg"
          className="mt-6"
          onClick={() => {
            qc.clear();
            logout();
          }}
        >
          🚪 {t('profile.logout')}
        </Button>
      )}
    </Page>
  );
}
