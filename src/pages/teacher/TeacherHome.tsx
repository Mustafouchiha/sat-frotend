import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Badge, Button, Card, Empty, inputCls, Loading } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { hasRole, useAuth } from '../../store/auth';

export interface GroupRow {
  id: string;
  name: string;
  inviteCode: string;
  leaderboardEnabled: boolean;
  students: number;
  teachers: Array<{ id: string; name: string }>;
}

export default function TeacherHome() {
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isOperator = hasRole(user, 'OPERATOR');
  const q = useQuery({ queryKey: ['groups'], queryFn: () => api<GroupRow[]>('/groups') });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api('/groups', { body: { name } }),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  return (
    <Page title={`👩‍🏫 ${t('teacher.groups')}`} wide>
      <div className="mb-3 flex flex-wrap gap-2">
        <Link to="/admin/templates/new" className="rounded-xl bg-card px-3 py-2 text-sm font-semibold">
          ➕ Savol taklif qilish
        </Link>
        <Link to="/admin/templates" className="rounded-xl bg-card px-3 py-2 text-sm font-semibold">
          📚 Savollar banki
        </Link>
        {isOperator && (
          <Link to="/admin" className="rounded-xl bg-card px-3 py-2 text-sm font-semibold">
            🧭 Admin panel
          </Link>
        )}
      </div>
      {isOperator && (
        <Card className="mb-3 flex gap-2">
          <input className={inputCls} placeholder="Yangi guruh nomi (masalan: SAT-2 ertalabki)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            +
          </Button>
        </Card>
      )}
      {q.isLoading && <Loading />}
      {q.data?.length === 0 && <Empty text="Sizga hali guruh biriktirilmagan" />}
      <div className="grid gap-3 sm:grid-cols-2">
        {q.data?.map((g) => (
          <Card key={g.id} onClick={() => nav(`/teacher/groups/${g.id}`)}>
            <div className="flex items-start justify-between">
              <div className="text-lg font-bold">{g.name}</div>
              <Badge>
                👥 {g.students}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-hint">
              {t('teacher.invite')}: <b className="font-mono tracking-wider text-text">{g.inviteCode}</b>
            </div>
            {g.teachers.length > 0 && <div className="mt-1 text-xs text-hint">👩‍🏫 {g.teachers.map((x) => x.name).join(', ')}</div>}
          </Card>
        ))}
      </div>
    </Page>
  );
}
