import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Avatar, Badge, Button, Card, ErrorBox, Loading, SectionTitle, Segmented, Spinner } from '../components/ui';
import { api, errorText } from '../lib/api';
import { fmtTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { shareToTelegram } from '../lib/telegram';
import { useAuth } from '../store/auth';

interface Side {
  userId: string;
  name: string;
  photoUrl: string | null;
  attemptId: string | null;
  answered: number;
  correct: number;
  finished: boolean;
  timeMs: number;
}
interface DuelInfo {
  id: string;
  code: string;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  count: number;
  winnerId: string | null;
  creator: Side | null;
  opponent: Side | null;
  link?: string | null;
  me?: string;
}

export default function Duel() {
  const t = useT();
  const nav = useNavigate();
  const [section, setSection] = useState<'MATH' | 'RW' | 'MIX'>('MATH');
  const me = useAuth((s) => s.user);
  const recent = useQuery({ queryKey: ['duels-mine'], queryFn: () => api<DuelInfo[]>('/duels/mine') });
  const sec = section === 'MIX' ? null : section;
  const match = useMutation({
    mutationFn: () => api<{ id: string }>('/duels/match', { body: { section: sec } }),
    onSuccess: (r) => nav(`/duel/${r.id}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const invite = useMutation({
    mutationFn: () => api<{ id: string; code: string; link: string | null }>('/duels', { body: { section: sec } }),
    onSuccess: (r) => nav(`/duel/${r.id}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  return (
    <Page title={`⚔️ ${t('duel.title')}`} back>
      <Card>
        <p className="mb-4 text-sm text-hint">{t('duel.subtitle')}</p>
        <Segmented
          className="mb-4"
          value={section}
          onChange={setSection}
          options={[
            { value: 'MATH', label: 'Math' },
            { value: 'RW', label: 'R&W' },
            { value: 'MIX', label: t('section.MIX') },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button loading={match.isPending} onClick={() => match.mutate()}>
            🔎 {t('duel.find')}
          </Button>
          <Button variant="secondary" loading={invite.isPending} onClick={() => invite.mutate()}>
            🤝 {t('duel.invite')}
          </Button>
        </div>
      </Card>
      <SectionTitle>{t('duel.recent')}</SectionTitle>
      <div className="flex flex-col gap-2">
        {(recent.data ?? []).filter(Boolean).map((d) => {
          const mine = d.creator?.userId === me?.id ? d.creator : d.opponent;
          const opp = mine === d.creator ? d.opponent : d.creator;
          const res = d.status === 'FINISHED' ? (d.winnerId === me?.id ? 'won' : d.winnerId ? 'lost' : 'draw') : null;
          return (
            <Card key={d.id} onClick={() => nav(`/duel/${d.id}`)} className="flex items-center gap-3">
              <Avatar name={opp?.name ?? '?'} url={opp?.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{opp?.name ?? t('duel.waiting')}</div>
                <div className="text-xs text-hint">
                  {mine?.correct ?? 0} : {opp?.correct ?? 0}
                </div>
              </div>
              {res === 'won' && <Badge color="#16a34a">{t('duel.won')}</Badge>}
              {res === 'lost' && <Badge color="#dc2626">{t('duel.lost')}</Badge>}
              {res === 'draw' && <Badge>{t('duel.draw')}</Badge>}
              {!res && <Badge color="#f59e0b">{d.status}</Badge>}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

export function DuelJoin() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState<unknown>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ id: string }>(`/duels/join/${encodeURIComponent(code)}`, { body: {} })
      .then((r) => nav(`/duel/${r.id}`, { replace: true }))
      .catch(setErr);
  }, [code, nav]);
  if (err) return <Page back><ErrorBox error={err} /></Page>;
  return <Loading />;
}

export function DuelRoom() {
  const { id = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const me = useAuth((s) => s.user);
  const bot = useAuth((s) => s.config.botUsername);
  const q = useQuery({ queryKey: ['duel', id], queryFn: () => api<DuelInfo>(`/duels/${id}`), refetchInterval: (query) => (query.state.data?.status === 'WAITING' ? 3000 : false) });
  const [live, setLive] = useState<DuelInfo | null>(null);

  useEffect(() => {
    const sock = getSocket();
    const onUpdate = (d: DuelInfo) => d?.id === id && setLive(d);
    sock.emit('duel:watch', id);
    sock.on('duel:update', onUpdate);
    return () => {
      sock.off('duel:update', onUpdate);
      sock.emit('duel:unwatch', id);
    };
  }, [id]);

  const d = live ? { ...q.data, ...live } : q.data;
  const myAttempt = d && (d.creator?.userId === me?.id ? d.creator?.attemptId : d.opponent?.attemptId);

  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    // raqib qo'shilishi bilan (WAITING -> ACTIVE) avtomatik duelga o'tamiz
    if (prevStatus.current === 'WAITING' && d?.status === 'ACTIVE' && myAttempt) nav(`/session/${myAttempt}`);
    prevStatus.current = d?.status;
  }, [d?.status, myAttempt, nav]);

  if (q.isLoading) return <Loading />;
  if (q.error || !d) return <Page back><ErrorBox error={q.error} /></Page>;

  const link = d.link ?? (bot ? `https://t.me/${bot}?start=duel_${d.code}` : null);
  const mine = d.creator?.userId === me?.id ? d.creator : d.opponent;
  const opp = mine === d.creator ? d.opponent : d.creator;

  return (
    <Page title={`⚔️ ${t('duel.title')}`} back>
      {d.status === 'WAITING' && (
        <Card className="text-center">
          <Spinner className="mx-auto mb-3 h-10 w-10" />
          <div className="mb-1 font-semibold">{t('duel.waiting')}</div>
          <div className="mb-4 text-sm text-hint">
            {t('duel.code')}: <b className="font-mono text-lg tracking-widest text-text">{d.code}</b>
          </div>
          {link && (
            <Button className="mb-2 w-full" onClick={() => shareToTelegram(link, '⚔️ SAT duel! Kim kuchliroq?')}>
              📤 {t('common.share')}
            </Button>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => api(`/duels/${d.id}/cancel`, { body: {} }).then(() => nav('/duel')).catch((e) => toast(errorText(e), { kind: 'error' }))}
          >
            {t('duel.cancel')}
          </Button>
        </Card>
      )}

      {(d.status === 'ACTIVE' || d.status === 'FINISHED') && (
        <Card>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            {[mine, opp].map((side, i) => (
              <div key={i} className={i === 1 ? 'order-3' : ''}>
                <div className="flex justify-center">
                  <Avatar name={side?.name ?? '?'} url={side?.photoUrl} size={56} />
                </div>
                <div className="mt-1 truncate text-sm font-semibold">{side?.name}</div>
                <div className="text-3xl font-black">{side?.correct ?? 0}</div>
                <div className="text-xs text-hint">
                  {side?.answered ?? 0}/{d.count} · {fmtTime(side?.timeMs ?? 0)}
                </div>
              </div>
            ))}
            <div className="order-2 text-xl font-bold text-hint">{t('duel.vs')}</div>
          </div>
          {d.status === 'FINISHED' && (
            <div className="mt-4 text-center text-2xl font-black">
              {d.winnerId === me?.id ? t('duel.won') : d.winnerId ? t('duel.lost') : t('duel.draw')}
            </div>
          )}
          {d.status === 'ACTIVE' && myAttempt && !mine?.finished && (
            <Button size="lg" className="mt-4" onClick={() => nav(`/session/${myAttempt}`)}>
              ▶ {t('duel.go')}
            </Button>
          )}
          {d.status === 'ACTIVE' && mine?.finished && <div className="mt-4 text-center text-sm text-hint">{t('duel.waiting')}</div>}
        </Card>
      )}
      {d.status === 'CANCELLED' && <Card className="text-center text-hint">✕ {d.status}</Card>}
    </Page>
  );
}
