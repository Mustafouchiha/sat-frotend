import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Avatar, Badge, Button, Card, Field, inputCls, Loading, Segmented, Sheet } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { Role, User } from '../../lib/types';
import type { GroupRow } from '../teacher/TeacherHome';

interface UserRow extends User {
  lastSeenAt: string | null;
  groups: Array<{ id: string; name: string; role: string }>;
}

const ROLES: Role[] = ['SUPER_ADMIN', 'OPERATOR', 'TEACHER', 'STUDENT', 'PARENT'];

export default function AdminUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [edit, setEdit] = useState<UserRow | null>(null);
  const qs = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), ...(role ? { role } : {}) }).toString();
  const q = useQuery({ queryKey: ['admin-users', qs], queryFn: () => api<{ items: UserRow[]; total: number }>(`/admin/users?${qs}`) });

  return (
    <Page title="🧑‍💼 Foydalanuvchilar" back wide>
      <Card className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className={`${inputCls} col-span-2`} placeholder="Ism, @username yoki Telegram ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Holat</option>
          <option value="PENDING">Kutishda</option>
          <option value="ACTIVE">Faol</option>
          <option value="BLOCKED">Bloklangan</option>
        </select>
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Rol</option>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Card>
      {q.isLoading && <Loading />}
      <div className="text-xs text-hint">Jami: {q.data?.total ?? 0}</div>
      <Card className="mt-1 p-2">
        {q.data?.items.map((u) => (
          <button key={u.id} onClick={() => setEdit(u)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-soft">
            <Avatar name={u.name} url={u.photoUrl} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {u.name} {u.username && <span className="text-xs text-hint">@{u.username}</span>}
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {u.roles.map((r) => (
                  <Badge key={r}>{r}</Badge>
                ))}
                {u.groups.map((g) => (
                  <Badge key={g.id} color="#4f46e5">
                    {g.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-right text-xs">
              <Badge color={u.status === 'ACTIVE' ? '#16a34a' : u.status === 'PENDING' ? '#f59e0b' : '#dc2626'}>{u.status}</Badge>
              <div className="mt-1 text-hint">{fmtDate(u.lastSeenAt)}</div>
            </div>
          </button>
        ))}
      </Card>
      {edit && <EditUser user={edit} onClose={() => setEdit(null)} onDone={() => void qc.invalidateQueries({ queryKey: ['admin-users'] })} />}
    </Page>
  );
}

function EditUser({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const [roles, setRoles] = useState<Role[]>(user.roles);
  const [status, setStatus] = useState(user.status);
  const [groupId, setGroupId] = useState('');
  const [groupRole, setGroupRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api<GroupRow[]>('/groups') });
  const save = useMutation({
    mutationFn: () => api(`/admin/users/${user.id}`, { method: 'PATCH', body: { roles, status } }),
    onSuccess: () => {
      toast('Saqlandi', { icon: '✅' });
      onDone();
      onClose();
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const addToGroup = useMutation({
    mutationFn: () => api(`/groups/${groupId}/members`, { body: { userId: user.id, role: groupRole } }),
    onSuccess: () => {
      toast("Guruhga qo'shildi", { icon: '✅' });
      onDone();
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  return (
    <Sheet open onClose={onClose} title={user.name}>
      <div className="mb-3 text-xs text-hint">Telegram ID: {user.tgId}</div>
      <Field label="Rollar">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])}
              className={`rounded-lg px-2.5 py-1.5 text-sm ${roles.includes(r) ? 'bg-accent text-accent-text' : 'bg-soft'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Holat">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'PENDING', label: 'Kutishda' },
            { value: 'ACTIVE', label: 'Faol' },
            { value: 'BLOCKED', label: 'Blok' },
          ]}
        />
      </Field>
      <Button size="lg" disabled={!roles.length} loading={save.isPending} onClick={() => save.mutate()}>
        Saqlash
      </Button>
      <div className="mt-4 border-t border-line pt-3">
        <Field label="Guruhga qo'shish">
          <div className="flex gap-2">
            <select className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— guruh —</option>
              {groups.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select className={inputCls} value={groupRole} onChange={(e) => setGroupRole(e.target.value as 'STUDENT' | 'TEACHER')}>
              <option value="STUDENT">O'quvchi</option>
              <option value="TEACHER">O'qituvchi</option>
            </select>
          </div>
        </Field>
        <Button variant="secondary" disabled={!groupId} loading={addToGroup.isPending} onClick={() => addToGroup.mutate()}>
          Qo'shish
        </Button>
      </div>
    </Sheet>
  );
}
