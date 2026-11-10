import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Field, inputCls, Loading, ProgressBar, Segmented, Sheet } from '../../components/ui';
import { api, downloadUrl, errorText } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { confirmDialog, downloadFile, shareToTelegram } from '../../lib/telegram';
import { useAuth } from '../../store/auth';

interface Invite {
  id: string;
  code: string;
  label: string | null;
  createdAt: string;
  usedAt: string | null;
  usedBy: { id: string; name: string; username: string | null } | null;
}

interface GroupData {
  id: string;
  name: string;
  inviteCode: string;
  leaderboardEnabled: boolean;
  /** Umumiy kod ishlaydimi (o'chirilsa — faqat shaxsiy kodlar) */
  openJoin: boolean;
  students: Array<{
    id: string;
    name: string;
    username: string | null;
    photoUrl: string | null;
    lastSeenAt: string | null;
    ratings: { OVERALL: number; MATH: number; RW: number };
    streak: number;
    answered: number;
    accuracy: number | null;
    lastScore: number | null;
    blur30d: number;
    targetScore: number | null;
  }>;
  teachers: Array<{ id: string; name: string }>;
  assignments: Array<{ id: string; title: string; test: { title: string }; dueAt: string | null; completed: number; total: number; maxAttempts: number }>;
}

interface Analytics {
  days: number;
  students: number;
  skills: Array<{ skillId: string; name: string; domain: string; section: string; total: number; correct: number; accuracy: number; avgTimeSec: number | null; students: number }>;
  weakest: Analytics['skills'];
}

interface TestRow {
  id: string;
  title: string;
  type: string;
  questionCount: number;
  durationMin: number;
}

export default function GroupDetail() {
  const { id = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const bot = useAuth((s) => s.config.botUsername);
  const [tab, setTab] = useState<'students' | 'analytics' | 'assignments' | 'codes'>('students');
  const [assignOpen, setAssignOpen] = useState(false);
  const q = useQuery({ queryKey: ['group', id], queryFn: () => api<GroupData>(`/groups/${id}`) });
  const an = useQuery({ queryKey: ['group-analytics', id], enabled: tab === 'analytics', queryFn: () => api<Analytics>(`/groups/${id}/analytics?days=30`) });

  const toggleLb = useMutation({
    mutationFn: (v: boolean) => api(`/groups/${id}`, { method: 'PATCH', body: { leaderboardEnabled: v } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['group', id] }),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const regen = useMutation({
    mutationFn: () => api(`/groups/${id}/code`, { body: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['group', id] }),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page back><ErrorBox error={q.error} /></Page>;
  const g = q.data;
  const inviteLink = bot ? `https://t.me/${bot}?start=join_${g.inviteCode}` : null;

  const exportXlsx = async () => {
    try {
      downloadFile(await downloadUrl(`/groups/${id}/export`), `${g.name}.xlsx`);
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };

  return (
    <Page title={g.name} back wide>
      <Card className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs text-hint">
              {t('teacher.invite')} {!g.openJoin && <Badge color="#dc2626">{t('invite.off')}</Badge>}
            </div>
            <div className={clsx('font-mono text-2xl font-black tracking-[0.25em]', !g.openJoin && 'text-hint line-through')}>{g.inviteCode}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {inviteLink && (
              <Button size="sm" onClick={() => shareToTelegram(inviteLink, `${g.name} guruhiga qo'shiling`)}>
                📤 {t('common.share')}
              </Button>
            )}
            <Button size="sm" variant="secondary" loading={regen.isPending} onClick={() => regen.mutate()}>
              🔄
            </Button>
            <Button size="sm" variant="secondary" onClick={exportXlsx}>
              📊 {t('teacher.export')}
            </Button>
          </div>
        </div>
        <label className="mt-3 flex items-center justify-between text-sm">
          <span>{t('teacher.leaderboard')}</span>
          <input type="checkbox" checked={g.leaderboardEnabled} onChange={(e) => toggleLb.mutate(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </Card>

      <Segmented
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'students', label: `${t('teacher.students')} (${g.students.length})` },
          { value: 'analytics', label: t('teacher.analytics') },
          { value: 'assignments', label: t('teacher.assignments') },
          { value: 'codes', label: `🔑 ${t('invite.tab')}` },
        ]}
      />

      {tab === 'codes' && <InvitesTab group={g} bot={bot} />}

      {tab === 'students' && (
        <Card className="p-2">
          {g.students.length === 0 && <Empty />}
          {g.students.map((s, i) => (
            <button key={s.id} onClick={() => nav(`/teacher/students/${s.id}`)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-soft">
              <span className="w-5 text-center text-xs text-hint">{i + 1}</span>
              <Avatar name={s.name} url={s.photoUrl} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-xs text-hint">
                  🔥 {s.streak} · {s.answered} ✍️ · {s.accuracy ?? '—'}%{s.blur30d > 0 ? ` · ↗${s.blur30d}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold">{s.ratings.OVERALL}</div>
                <div className="text-xs text-hint">{s.lastScore ? `SAT ${s.lastScore}` : '—'}</div>
              </div>
            </button>
          ))}
        </Card>
      )}

      {tab === 'analytics' && (
        <>
          {an.isLoading && <Loading />}
          {an.data && (
            <>
              <Card className="mb-3">
                <div className="mb-2 font-semibold">⚠️ {t('teacher.weakest')}</div>
                {an.data.weakest.length === 0 && <div className="text-sm text-hint">Ma'lumot yetarli emas (har ko'nikmada kamida 5 javob kerak)</div>}
                {an.data.weakest.map((s) => (
                  <div key={s.skillId} className="mb-2">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="truncate pr-2">{s.name}</span>
                      <span className="shrink-0 text-hint">{s.accuracy}%</span>
                    </div>
                    <ProgressBar value={s.accuracy} color="#ef4444" />
                  </div>
                ))}
              </Card>
              <Card>
                <div className="mb-2 text-sm text-hint">Barcha ko'nikmalar · oxirgi {an.data.days} kun</div>
                {an.data.skills.map((s) => (
                  <div key={s.skillId} className="mb-3">
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate">
                        {s.name} <span className="text-xs text-hint">({s.domain})</span>
                      </span>
                      <span className="shrink-0 text-xs text-hint">
                        {s.correct}/{s.total} · {s.avgTimeSec ?? '—'}s · 👥{s.students}
                      </span>
                    </div>
                    <ProgressBar value={s.accuracy} color={s.accuracy >= 70 ? '#22c55e' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444'} />
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'assignments' && (
        <>
          <Button size="lg" className="mb-3" onClick={() => setAssignOpen(true)}>
            ➕ {t('teacher.newAssignment')}
          </Button>
          <div className="flex flex-col gap-2">
            {g.assignments.length === 0 && <Empty />}
            {g.assignments.map((a) => (
              <Card key={a.id} onClick={() => nav(`/teacher/assignments/${a.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.title}</div>
                    <div className="text-xs text-hint">
                      {a.test.title} · {fmtDate(a.dueAt, true)}
                    </div>
                  </div>
                  <Badge color="#4f46e5">
                    {a.completed}/{a.total}
                  </Badge>
                </div>
                <ProgressBar className="mt-2" value={a.total ? (a.completed / a.total) * 100 : 0} />
              </Card>
            ))}
          </div>
          <AssignSheet open={assignOpen} onClose={() => setAssignOpen(false)} groupId={id} onDone={() => void qc.invalidateQueries({ queryKey: ['group', id] })} />
        </>
      )}
    </Page>
  );
}

function AssignSheet({ open, onClose, groupId, onDone }: { open: boolean; onClose: () => void; groupId: string; onDone: () => void }) {
  const t = useT();
  const tests = useQuery({ queryKey: ['tests-all'], enabled: open, queryFn: () => api<TestRow[]>('/tests') });
  const [testId, setTestId] = useState('');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [attempts, setAttempts] = useState(1);
  const [vis, setVis] = useState<'IMMEDIATE' | 'AFTER_DUE'>('IMMEDIATE');
  const create = useMutation({
    mutationFn: () =>
      api('/assignments', {
        body: {
          testId,
          groupId,
          title: title || undefined,
          dueAt: due ? new Date(due).toISOString() : null,
          maxAttempts: attempts,
          resultVisibility: vis,
        },
      }),
    onSuccess: () => {
      toast("Topshiriq berildi, o'quvchilarga bot orqali xabar yuborildi", { icon: '✅', kind: 'success' });
      onDone();
      onClose();
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('teacher.newAssignment')}>
      <Field label="Test">
        <select className={inputCls} value={testId} onChange={(e) => setTestId(e.target.value)}>
          <option value="">— tanlang —</option>
          {tests.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title} ({x.type}, {x.questionCount} savol, {x.durationMin} daq)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nomi (ixtiyoriy)">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Muddat">
          <input className={inputCls} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Urinishlar soni">
          <input className={inputCls} type="number" min={1} max={20} value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Natijani ko'rsatish">
        <Segmented
          value={vis}
          onChange={setVis}
          options={[
            { value: 'IMMEDIATE', label: 'Darhol' },
            { value: 'AFTER_DUE', label: 'Muddat tugagach' },
          ]}
        />
      </Field>
      <Button size="lg" disabled={!testId} loading={create.isPending} onClick={async () => (await confirmDialog("O'quvchilarga xabar yuboriladi. Davom etasizmi?")) && create.mutate()}>
        {t('teacher.newAssignment')}
      </Button>
    </Sheet>
  );
}

/** Shaxsiy kirish kodlari: har o'quvchiga alohida, bir martalik; umumiy kodni o'chirib qo'yish mumkin. */
function InvitesTab({ group, bot }: { group: GroupData; bot: string | null }) {
  const t = useT();
  const qc = useQueryClient();
  const [names, setNames] = useState('');
  const [count, setCount] = useState('5');
  const key = ['group-invites', group.id];
  const list = useQuery({ queryKey: key, queryFn: () => api<Invite[]>(`/groups/${group.id}/invites`) });
  const nameList = names
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const toggleOpen = useMutation({
    mutationFn: (v: boolean) => api(`/groups/${group.id}`, { method: 'PATCH', body: { openJoin: v } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['group', group.id] }),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const create = useMutation({
    mutationFn: (body: { labels?: string[]; count?: number }) => api<Invite[]>(`/groups/${group.id}/invites`, { body }),
    onSuccess: (created) => {
      setNames('');
      void qc.invalidateQueries({ queryKey: key });
      toast(`🔑 +${created.length}`, { kind: 'success' });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (inviteId: string) => api(`/groups/${group.id}/invites/${inviteId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  const linkOf = (code: string) => (bot ? `https://t.me/${bot}?start=join_${code}` : null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('common.copied'), { icon: '📋' });
    } catch {
      window.prompt(t('common.copy'), text);
    }
  };
  const invites = list.data ?? [];
  const unused = invites.filter((i) => !i.usedBy);
  const copyAll = () =>
    void copy(unused.map((i) => [i.label ?? '—', i.code, linkOf(i.code)].filter(Boolean).join(' — ')).join('\n'));

  return (
    <>
      <Card className="mb-3">
        <label className="flex items-center justify-between gap-3">
          <span className="font-semibold">{t('invite.openJoin')}</span>
          <input
            type="checkbox"
            checked={group.openJoin}
            disabled={toggleOpen.isPending}
            onChange={(e) => toggleOpen.mutate(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
        </label>
        <p className="mt-1 text-xs text-hint">{t('invite.openJoinHint')}</p>
      </Card>

      <Card className="mb-3">
        <div className="mb-1 font-semibold">🔑 {t('invite.personal')}</div>
        <p className="mb-3 text-xs text-hint">{t('invite.personalHint')}</p>
        <Field label={t('invite.names')}>
          <textarea className={inputCls} rows={4} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Aziz Karimov\nMadina Yusupova'} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!nameList.length} loading={create.isPending} onClick={() => create.mutate({ labels: nameList })}>
            🔑 {nameList.length ? t('invite.createNamed', { n: nameList.length }) : t('invite.createCount')}
          </Button>
          <span className="text-xs text-hint">{t('invite.orCount')}</span>
          <input
            className="w-20 rounded-xl border border-line bg-card px-2 py-1.5 text-center outline-none focus:border-accent"
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!(Number(count) >= 1 && Number(count) <= 100)}
            loading={create.isPending}
            onClick={() => create.mutate({ count: Math.round(Number(count)) })}
          >
            {t('invite.createCount')}
          </Button>
        </div>
      </Card>

      <Card className="p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2">
          <span className="text-sm text-hint">{t('invite.summary', { total: invites.length, used: invites.length - unused.length })}</span>
          {unused.length > 0 && (
            <Button size="sm" variant="secondary" onClick={copyAll}>
              📋 {t('invite.copyAll')}
            </Button>
          )}
        </div>
        {list.isLoading && <Loading />}
        {!list.isLoading && invites.length === 0 && <div className="p-3 text-center text-sm text-hint">{t('invite.empty')}</div>}
        {invites.map((i) => {
          const link = linkOf(i.code);
          return (
            <div key={i.id} className="flex flex-wrap items-center gap-2 border-t border-line p-2">
              {/* Telefonda ism to'liq ko'rinsin: kod va tugmalar keyingi qatorga tushadi */}
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <div className="truncate font-medium">{i.label ?? '—'}</div>
                <div className="text-xs text-hint">
                  {i.usedBy ? (
                    <span className="text-green-600">
                      ✅ {t('invite.used')}: {i.usedBy.name}
                      {i.usedBy.username ? ` (@${i.usedBy.username})` : ''} · {i.usedAt ? fmtDate(i.usedAt, true) : ''}
                    </span>
                  ) : (
                    <>⏳ {t('invite.unused')}</>
                  )}
                </div>
              </div>
              <code className={clsx('rounded-lg bg-soft px-2 py-1 font-mono text-base font-bold tracking-widest', i.usedBy && 'text-hint line-through')}>{i.code}</code>
              {!i.usedBy && (
                <div className="flex gap-1">
                  <button className="rounded-lg px-2 py-1 hover:bg-soft" title={t('common.copy')} onClick={() => void copy(link ? `${i.code} — ${link}` : i.code)}>
                    📋
                  </button>
                  {link && (
                    <button
                      className="rounded-lg px-2 py-1 hover:bg-soft"
                      title={t('common.share')}
                      onClick={() => shareToTelegram(link, t('invite.shareText', { name: i.label ?? '', group: group.name, code: i.code }))}
                    >
                      📤
                    </button>
                  )}
                  <button
                    className="rounded-lg px-2 py-1 text-red-500 hover:bg-red-500/10"
                    title="✕"
                    onClick={async () => {
                      if (await confirmDialog(`${i.label ?? i.code}: ✕?`)) remove.mutate(i.id);
                    }}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}
