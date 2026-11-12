import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Badge, Button, Card, Empty, inputCls, Loading } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { confirmDialog } from '../../lib/telegram';
import { hasRole, useAuth } from '../../store/auth';
import { useTaxonomy } from '../Practice';

interface Row {
  id: string;
  title: string;
  section: 'RW' | 'MATH';
  domainId: string;
  skillId: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  status: string;
  version: number;
  rating: number;
  timesAnswered: number;
  accuracy: number | null;
  openReports: number;
  updatedAt: string;
  skill: { name: string };
}

export const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: '#16a34a',
  DRAFT: '#64748b',
  PENDING_REVIEW: '#f59e0b',
  ARCHIVED: '#94a3b8',
};

export default function TemplatesList() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isOperator = hasRole(user, 'OPERATOR');
  const tax = useTaxonomy();
  // ?search=ai — AI generatoridan «AI savollar ro'yxati» havolasi
  const [params] = useSearchParams();
  const [f, setF] = useState({ search: params.get('search') ?? '', section: '', domainId: '', difficulty: '', status: '', page: 1 });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== 0).map(([k, v]) => [k, String(v)])).toString();
  const q = useQuery({ queryKey: ['templates', qs], queryFn: () => api<{ items: Row[]; total: number; size: number }>(`/templates?${qs}`) });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'duplicate' | 'approve' | 'delete' }) =>
      action === 'delete' ? api(`/templates/${id}`, { method: 'DELETE' }) : api(`/templates/${id}/${action}`, { body: {} }),
    onSuccess: (r) => {
      const msg = (r as { message?: string })?.message;
      toast(msg ?? 'Bajarildi', { icon: '✅' });
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  const domains = (tax.data ?? []).filter((d) => !f.section || d.section === f.section);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v, page: 1 }));

  return (
    <Page title="📚 Savollar banki" back wide actions={<Button size="sm" onClick={() => nav('/admin/templates/new')}>➕ Yangi</Button>}>
      <Card className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input className={`${inputCls} col-span-2`} placeholder="Qidiruv (nom, ID, teg)" value={f.search} onChange={(e) => set('search', e.target.value)} />
        <select className={inputCls} value={f.section} onChange={(e) => set('section', e.target.value)}>
          <option value="">Bo'lim</option>
          <option value="MATH">Math</option>
          <option value="RW">R&W</option>
        </select>
        <select className={inputCls} value={f.domainId} onChange={(e) => set('domainId', e.target.value)}>
          <option value="">Domen</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className={inputCls} value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
          <option value="">Qiyinlik</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Holat</option>
          <option value="PUBLISHED">Nashr</option>
          <option value="DRAFT">Qoralama</option>
          <option value="PENDING_REVIEW">Tasdiq kutmoqda</option>
          <option value="ARCHIVED">Arxiv</option>
        </select>
      </Card>
      {q.isLoading && <Loading />}
      {q.data?.items.length === 0 && <Empty />}
      <div className="flex flex-col gap-2">
        {q.data?.items.map((t) => (
          <Card key={t.id} className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => nav(`/admin/templates/${t.id}`)}>
              <div className="truncate font-semibold">{t.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-hint">
                <Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge>
                <span>{t.section === 'MATH' ? 'Math' : 'R&W'}</span>·<span className="truncate">{t.skill.name}</span>·<span>{t.difficulty}</span>·
                <span>Elo {t.rating}</span>·<span>v{t.version}</span>
                {t.timesAnswered > 0 && (
                  <span>
                    · {t.timesAnswered} javob, {t.accuracy}% ✓
                  </span>
                )}
                {t.openReports > 0 && <Badge color="#dc2626">⚠️ {t.openReports}</Badge>}
                <span>· {fmtDate(t.updatedAt)}</span>
              </div>
            </div>
            {isOperator && (
              <div className="flex gap-1.5">
                {t.status === 'PENDING_REVIEW' && (
                  <Button size="sm" variant="success" onClick={() => act.mutate({ id: t.id, action: 'approve' })}>
                    ✓
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: t.id, action: 'duplicate' })} title="Nusxa">
                  ⧉
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => (await confirmDialog("O'chirasizmi? (ishlatilgan bo'lsa arxivlanadi)")) && act.mutate({ id: t.id, action: 'delete' })}
                >
                  🗑
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {q.data && q.data.total > q.data.size && (
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={f.page <= 1} onClick={() => setF((s) => ({ ...s, page: s.page - 1 }))}>
            ←
          </Button>
          <span className="py-1.5 text-sm text-hint">
            {f.page} / {Math.ceil(q.data.total / q.data.size)}
          </span>
          <Button size="sm" variant="secondary" disabled={f.page >= Math.ceil(q.data.total / q.data.size)} onClick={() => setF((s) => ({ ...s, page: s.page + 1 }))}>
            →
          </Button>
        </div>
      )}
      <div className="mt-4 text-center">
        <Link to="/admin/import" className="text-sm text-link">
          📥 Ommaviy import (JSON / CSV)
        </Link>
      </div>
    </Page>
  );
}
