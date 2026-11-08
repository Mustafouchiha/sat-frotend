import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { Badge, Card, ErrorBox, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';

interface Data {
  assignment: { title: string; dueAt: string | null; maxAttempts: number; test: { title: string; type: string } };
  rows: Array<{
    student: { id: string; name: string; username: string | null };
    attempts: number;
    inProgress: boolean;
    best: { id: string; totalScaled: number | null; rwScaled: number | null; mathScaled: number | null; correctCount: number; totalItems: number; finishedAt: string; blurCount: number } | null;
  }>;
}

export default function AssignmentResults() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['assignment-results', id], queryFn: () => api<Data>(`/assignments/${id}/results`) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Page back><ErrorBox error={q.error} /></Page>;
  const { assignment: a, rows } = q.data;
  const sorted = [...rows].sort((x, y) => (y.best?.totalScaled ?? y.best?.correctCount ?? -1) - (x.best?.totalScaled ?? x.best?.correctCount ?? -1));
  return (
    <Page title={a.title} back wide>
      <Card className="mb-3 text-sm text-hint">
        {a.test.title} · Muddat: {fmtDate(a.dueAt, true)} · Urinishlar: {a.maxAttempts}
      </Card>
      <Card className="p-2">
        {sorted.map((r) => (
          <button
            key={r.student.id}
            disabled={!r.best}
            onClick={() => r.best && nav(`/attempt/${r.best.id}/result`)}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-soft"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.student.name}</div>
              <div className="text-xs text-hint">
                {r.attempts} urinish
                {r.best?.blurCount ? <span className="text-orange-500"> · ↗{r.best.blurCount}</span> : null}
              </div>
            </div>
            {r.best ? (
              <div className="text-right">
                <div className="font-bold">{r.best.totalScaled ?? `${r.best.correctCount}/${r.best.totalItems}`}</div>
                {r.best.rwScaled !== null && (
                  <div className="text-xs text-hint">
                    R&W {r.best.rwScaled} · Math {r.best.mathScaled}
                  </div>
                )}
              </div>
            ) : r.inProgress ? (
              <Badge color="#f59e0b">Jarayonda</Badge>
            ) : (
              <Badge color="#dc2626">Topshirmagan</Badge>
            )}
          </button>
        ))}
      </Card>
    </Page>
  );
}
