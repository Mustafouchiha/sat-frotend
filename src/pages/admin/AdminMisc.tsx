import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { QuestionView } from '../../components/QuestionView';
import { toast } from '../../components/Toast';
import { Badge, Button, Card, Empty, Field, inputCls, Loading, Segmented, Sheet, StatTile } from '../../components/ui';
import { api, downloadUrl, errorText } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { confirmDialog, downloadFile } from '../../lib/telegram';
import type { ReviewQuestion } from '../../lib/types';
import type { GroupRow } from '../teacher/TeacherHome';

export default function AdminMisc() {
  const { section } = useParams();
  switch (section) {
    case 'scales':
      return <Scales />;
    case 'settings':
      return <Settings />;
    case 'stats':
      return <StatsPage />;
    case 'reports':
      return <Reports />;
    case 'announce':
      return <Announce />;
    case 'audit':
      return <Audit />;
    case 'import':
      return <ImportExport />;
    default:
      return <Navigate to="/admin" replace />;
  }
}

// ───────── Ball shkalasi ─────────

function Scales() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['scales'], queryFn: () => api<Record<string, Array<{ raw: number; scaled: number }>>>('/admin/scales') });
  const [section, setSection] = useState<'RW' | 'MATH'>('MATH');
  const [variant, setVariant] = useState<'STANDARD' | 'EASY' | 'HARD'>('HARD');
  const [rows, setRows] = useState<Array<{ raw: number; scaled: number }>>([]);
  const max = section === 'RW' ? 54 : 44;
  useEffect(() => {
    const existing = q.data?.[`${section}:${variant}`];
    setRows(existing?.length ? existing : Array.from({ length: max + 1 }, (_, raw) => ({ raw, scaled: 200 })));
  }, [q.data, section, variant, max]);
  const save = useMutation({
    mutationFn: () => api('/admin/scales', { method: 'PUT', body: { section, variant, rows } }),
    onSuccess: () => {
      toast('Shkala saqlandi', { icon: '✅' });
      void qc.invalidateQueries({ queryKey: ['scales'] });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const fill = () => {
    const span = variant === 'EASY' ? 440 : 600;
    setRows(Array.from({ length: max + 1 }, (_, raw) => ({ raw, scaled: Math.round((200 + (span * raw) / max) / 10) * 10 })));
  };
  return (
    <Page title="📏 Ball shkalasi" back wide>
      <Card className="mb-3 text-sm text-hint">
        Xom ball (to'g'ri javoblar soni, to'liq bo'lim: R&W 54, Math 44) → 200–800. Oson va qiyin 2-modul yo'nalishi uchun alohida jadval.
      </Card>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <Segmented value={section} onChange={setSection} options={[{ value: 'RW', label: 'R&W' }, { value: 'MATH', label: 'Math' }]} />
        <Segmented
          value={variant}
          onChange={setVariant}
          options={[
            { value: 'HARD', label: 'Qiyin yo\'nalish' },
            { value: 'EASY', label: 'Oson yo\'nalish' },
            { value: 'STANDARD', label: 'Adaptivsiz' },
          ]}
        />
      </div>
      {q.isLoading ? (
        <Loading />
      ) : (
        <Card>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {rows.map((r, i) => (
              <label key={r.raw} className="text-center">
                <div className="text-xs text-hint">{r.raw}</div>
                <input
                  type="number"
                  step={10}
                  min={200}
                  max={800}
                  value={r.scaled}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, scaled: Number(e.target.value) } : x)))}
                  className="w-full rounded-lg border border-line bg-card px-1 py-1 text-center text-sm"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={fill}>
              Formula bilan to'ldirish
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Saqlash
            </Button>
          </div>
        </Card>
      )}
    </Page>
  );
}

// ───────── Sozlamalar ─────────

const SETTING_LABELS: Record<string, string> = {
  rating: "Reyting (Elo, SAT shkalasida: umumiy 400–1600, Math va R&W 200–800): K-faktorlar, provisional, tezlik bonusi",
  titles: 'Unvonlar (nomi, chegara, rang, ikonka)',
  ratingToSat: 'Reyting → taxminiy SAT ball jadvali',
  mastery: "Mastery: o'sish/pasayish tezligi, zaif/kuchli chegaralar",
  srs: 'Spaced repetition: intervallar (kun) va chiqish sharti',
  autoTest: "Avto-test nisbati: zaif / o'rtacha / kuchli",
  forMe: '"Men uchun" rejimi: oyna va maqsad',
  difficulty: 'Hisoblangan qiyinlik chegaralari',
  daily: 'Kunlik test: savollar soni, vaqt, eslatma soati',
  rush: 'Puzzle Rush parametrlari',
  duel: 'Duel parametrlari',
  xp: 'XP mukofotlari',
  streak: 'Streak freeze',
  adaptive: 'Adaptiv modul chegarasi (standart)',
};

function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Record<string, unknown>; defaults: Record<string, unknown> }>('/admin/settings') });
  return (
    <Page title="⚙️ Sozlamalar" back wide>
      <Card className="mb-3 text-sm text-hint">Barcha sonli parametrlar shu yerda. JSON ko'rinishida tahrirlang; faqat o'zgartirilgan maydonlar saqlanadi, qolganlari standart.</Card>
      {q.isLoading && <Loading />}
      {q.data &&
        Object.keys(q.data.defaults).map((key) => (
          <SettingEditor key={key} k={key} value={q.data!.settings[key]} onSaved={() => void qc.invalidateQueries({ queryKey: ['settings'] })} />
        ))}
    </Page>
  );
}

function SettingEditor({ k, value, onSaved }: { k: string; value: unknown; onSaved: () => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  const save = useMutation({
    mutationFn: () => api(`/admin/settings/${k}`, { method: 'PUT', body: { value: JSON.parse(text) } }),
    onSuccess: () => {
      toast('Saqlandi', { icon: '✅' });
      onSaved();
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const reset = useMutation({ mutationFn: () => api(`/admin/settings/${k}`, { method: 'DELETE' }), onSuccess: onSaved });
  return (
    <details className="mb-2 rounded-2xl bg-card p-3">
      <summary className="cursor-pointer">
        <b className="font-mono">{k}</b> <span className="text-sm text-hint">— {SETTING_LABELS[k] ?? ''}</span>
      </summary>
      <textarea className={`${inputCls} mt-2 font-mono text-xs`} rows={Math.min(18, text.split('\n').length + 1)} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="mt-2 flex gap-2">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
        <Button size="sm" variant="secondary" onClick={async () => (await confirmDialog('Standart qiymatga qaytarilsinmi?')) && reset.mutate()}>
          Standartga qaytarish
        </Button>
      </div>
    </details>
  );
}

// ───────── Statistika ─────────

interface StatsData {
  users: number;
  students: number;
  pending: number;
  active7: number;
  attempts30: number;
  answers30: number;
  accuracy30: number | null;
  mockAvg30: number | null;
  mockCount30: number;
  templates: Record<string, number>;
  openReports: number;
  dailyToday: number;
  hardest: Array<{ id: string; title: string; section: string; difficulty: string; rating: number; answered: number; accuracy: number; reports: number; suspicious: boolean }>;
}

function StatsPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['admin-stats'], queryFn: () => api<StatsData>('/admin/stats') });
  if (q.isLoading) return <Loading />;
  const s = q.data;
  if (!s) return null;
  return (
    <Page title="📈 Statistika" back wide>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Foydalanuvchilar" value={s.users} sub={`faol o'quvchi: ${s.students}`} />
        <StatTile label="7 kunda faol" value={s.active7} sub={`kutishda: ${s.pending}`} />
        <StatTile label="Urinishlar (30 kun)" value={s.attempts30} sub={`javoblar: ${s.answers30}`} />
        <StatTile label="Aniqlik (30 kun)" value={`${s.accuracy30 ?? '—'}%`} />
        <StatTile label="O'rtacha mock" value={s.mockAvg30 ?? '—'} sub={`${s.mockCount30} ta test`} />
        <StatTile label="Bugun kunlik test" value={s.dailyToday} />
        <StatTile label="Shablonlar" value={s.templates.PUBLISHED ?? 0} sub={`qoralama ${s.templates.DRAFT ?? 0} · kutish ${s.templates.PENDING_REVIEW ?? 0}`} />
        <StatTile label="Ochiq shikoyatlar" value={s.openReports} color={s.openReports ? '#dc2626' : undefined} />
      </div>
      <h2 className="mb-2 mt-5 text-sm font-bold uppercase text-hint">Eng ko'p xato qilinadigan savollar</h2>
      <Card className="p-2">
        {s.hardest.length === 0 && <Empty text="Kamida 10 ta javob bo'lgan savollar yo'q" />}
        {s.hardest.map((t) => (
          <button key={t.id} onClick={() => nav(`/admin/templates/${t.id}`)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-soft">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="text-xs text-hint">
                {t.section} · {t.difficulty} · Elo {t.rating} · {t.answered} javob
              </div>
            </div>
            {t.suspicious && <Badge color="#dc2626">shubhali</Badge>}
            {t.reports > 0 && <Badge color="#f59e0b">⚠️ {t.reports}</Badge>}
            <div className="w-12 text-right font-bold">{t.accuracy}%</div>
          </button>
        ))}
      </Card>
    </Page>
  );
}

// ───────── Shikoyatlar ─────────

interface ReportRow {
  id: string;
  message: string;
  status: string;
  seed: number | null;
  templateVersion: number | null;
  createdAt: string;
  response: string | null;
  user: { name: string; username: string | null };
  template: { id: string; title: string; version: number };
}

function Reports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const q = useQuery({ queryKey: ['reports', status], queryFn: () => api<ReportRow[]>(`/admin/reports?status=${status}`) });
  const [view, setView] = useState<ReportRow | null>(null);
  const [response, setResponse] = useState('');
  const variant = useQuery({
    queryKey: ['report-variant', view?.id],
    enabled: !!view && view.seed !== null,
    queryFn: () => api<ReviewQuestion>(`/templates/${view!.template.id}/variant?seed=${view!.seed}${view!.templateVersion ? `&version=${view!.templateVersion}` : ''}`),
  });
  const resolve = useMutation({
    mutationFn: (st: 'RESOLVED' | 'REJECTED') => api(`/admin/reports/${view!.id}`, { method: 'PATCH', body: { status: st, response: response || undefined } }),
    onSuccess: () => {
      toast("Javob berildi, o'quvchiga xabar yuborildi", { icon: '✅' });
      setView(null);
      setResponse('');
      void qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  return (
    <Page title="⚠️ Shikoyatlar" back wide>
      <Segmented
        className="mb-3"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'OPEN', label: 'Ochiq' },
          { value: 'RESOLVED', label: 'Hal qilingan' },
          { value: 'REJECTED', label: 'Rad etilgan' },
          { value: 'ALL', label: 'Hammasi' },
        ]}
      />
      {q.isLoading && <Loading />}
      {q.data?.length === 0 && <Empty icon="🎉" />}
      <div className="flex flex-col gap-2">
        {q.data?.map((r) => (
          <Card key={r.id} onClick={() => setView(r)}>
            <div className="flex justify-between gap-2">
              <div className="truncate font-semibold">{r.template.title}</div>
              <Badge>{r.status}</Badge>
            </div>
            <div className="mt-1 text-sm">{r.message}</div>
            <div className="mt-1 text-xs text-hint">
              {r.user.name} · {fmtDate(r.createdAt, true)} · seed {r.seed ?? '—'} · v{r.templateVersion ?? '?'}
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={!!view} onClose={() => setView(null)} title={view?.template.title} wide>
        {view && (
          <>
            <div className="mb-2 rounded-xl bg-soft p-3 text-sm">💬 {view.message}</div>
            {variant.isLoading && <Loading />}
            {variant.data && <QuestionView q={variant.data} answer={variant.data.correctLabel} disabled reveal={{ correctLabel: variant.data.correctLabel, correctDisplay: variant.data.correctDisplay, isCorrect: true }} />}
            <Field label="O'quvchiga javob">
              <textarea className={inputCls} rows={2} value={response} onChange={(e) => setResponse(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="success" loading={resolve.isPending} onClick={() => resolve.mutate('RESOLVED')}>
                ✓ Hal qilindi
              </Button>
              <Button variant="secondary" loading={resolve.isPending} onClick={() => resolve.mutate('REJECTED')}>
                Rad etish
              </Button>
              <Button variant="ghost" onClick={() => window.open(`/admin/templates/${view.template.id}`, '_self')}>
                ✏️ Shablonni tahrirlash
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </Page>
  );
}

// ───────── E'lonlar ─────────

function Announce() {
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api<GroupRow[]>('/groups') });
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [staff, setStaff] = useState(false);
  const send = useMutation({
    mutationFn: () => api<{ queued: number }>('/admin/announcements', { body: { text, groupIds: selected.length ? selected : undefined, includeStaff: staff } }),
    onSuccess: (r) => {
      toast(`${r.queued} ta foydalanuvchiga yuborilmoqda`, { icon: '📢', kind: 'success' });
      setText('');
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  return (
    <Page title="📢 E'lonlar" back>
      <Card>
        <Field label="Xabar matni">
          <textarea className={inputCls} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label="Kimga (bo'sh — barcha faol o'quvchilar)">
          <div className="flex flex-wrap gap-1.5">
            {groups.data?.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelected(selected.includes(g.id) ? selected.filter((x) => x !== g.id) : [...selected, g.id])}
                className={`rounded-lg px-2.5 py-1.5 text-sm ${selected.includes(g.id) ? 'bg-accent text-accent-text' : 'bg-soft'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </Field>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} /> O'qituvchilar va xodimlarga ham
        </label>
        <Button
          size="lg"
          disabled={!text.trim()}
          loading={send.isPending}
          onClick={async () => (await confirmDialog("Xabar bot orqali yuboriladi. Tasdiqlaysizmi?")) && send.mutate()}
        >
          📤 Yuborish
        </Button>
      </Card>
    </Page>
  );
}

// ───────── Audit ─────────

function Audit() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['audit', entity, page],
    queryFn: () =>
      api<{ items: Array<{ id: string; action: string; entity: string; entityId: string | null; diff: unknown; createdAt: string; userName: string | null }>; total: number; size: number }>(
        `/admin/audit?page=${page}${entity ? `&entity=${entity}` : ''}`,
      ),
  });
  return (
    <Page title="🕵️ Audit log" back wide>
      <Segmented
        className="mb-3"
        value={entity}
        onChange={(v) => {
          setEntity(v);
          setPage(1);
        }}
        options={[
          { value: '', label: 'Hammasi' },
          { value: 'template', label: 'Shablon' },
          { value: 'test', label: 'Test' },
          { value: 'user', label: 'Foydalanuvchi' },
          { value: 'group', label: 'Guruh' },
          { value: 'setting', label: 'Sozlama' },
        ]}
      />
      {q.isLoading && <Loading />}
      <Card className="p-2">
        {q.data?.items.map((a) => (
          <details key={a.id} className="border-b border-line p-2 last:border-0">
            <summary className="cursor-pointer text-sm">
              <b>{a.action}</b> {a.entity} <span className="font-mono text-xs text-hint">{a.entityId?.slice(0, 10)}</span> — {a.userName ?? '—'} ·{' '}
              <span className="text-hint">{fmtDate(a.createdAt, true)}</span>
            </summary>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-soft p-2 text-xs">{JSON.stringify(a.diff, null, 2)}</pre>
          </details>
        ))}
      </Card>
      {q.data && q.data.total > q.data.size && (
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </Button>
          <span className="py-1.5 text-sm">{page}</span>
          <Button size="sm" variant="secondary" disabled={page * q.data.size >= q.data.total} onClick={() => setPage(page + 1)}>
            →
          </Button>
        </div>
      )}
    </Page>
  );
}

// ───────── Import / eksport ─────────

const CSV_SAMPLE =
  'title,section,domainId,skillId,difficulty,stem,answerKind,correct,distractor1,distractor2,distractor3,variables,derived,constraints,explanation\n' +
  '"Linear: ax+b=c",MATH,MATH_ALG,MATH_ALG_LIN1,EASY,"If ${a}x + {b} = {c}$, what is $x$?",MCQ,x0,-x0,c-b,(c+b)/a,"[{""name"":""a"",""type"":""int"",""min"":2,""max"":9},{""name"":""b"",""type"":""int"",""min"":1,""max"":20},{""name"":""x0"",""type"":""int"",""min"":-9,""max"":9,""exclude"":[0]}]","[{""name"":""c"",""expr"":""a*x0 + b""}]",a != b,"$x = {x0}$"';

function ImportExport() {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [result, setResult] = useState<{ total: number; created: number; results: Array<{ index: number; ok: boolean; title: string; errors?: string[] }> } | null>(null);
  const imp = useMutation({
    mutationFn: () => api<NonNullable<typeof result>>('/templates/import', { body: { format, content, status } }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const onFile = async (f: File) => {
    setFormat(f.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
    setContent(await f.text());
  };
  const exportJson = async () => {
    try {
      downloadFile(await downloadUrl('/templates/export'), 'sat-templates.json');
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };
  return (
    <Page title="📥 Import / eksport" back wide>
      <Card className="mb-3">
        <div className="mb-2 font-semibold">Eksport</div>
        <Button variant="secondary" onClick={exportJson}>
          ⬇️ Barcha shablonlarni JSON'ga yuklab olish
        </Button>
      </Card>
      <Card>
        <div className="mb-2 font-semibold">Ommaviy import</div>
        <p className="mb-2 text-sm text-hint">
          CSV (Excel'dan "CSV UTF-8" sifatida saqlang) yoki JSON (eksport formatida). Har bir qator saqlashdan oldin avtomatik tekshiriladi.
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented value={format} onChange={setFormat} options={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }]} />
          <input type="file" accept=".csv,.json,.txt" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          <button className="text-sm text-link" onClick={() => (setFormat('csv'), setContent(CSV_SAMPLE))}>
            Namuna CSV
          </button>
        </div>
        <textarea className={`${inputCls} font-mono text-xs`} rows={10} value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
        <div className="mt-2 flex items-center gap-2">
          <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}>
            <option value="DRAFT">Qoralama sifatida</option>
            <option value="PUBLISHED">Darhol nashr qilish</option>
          </select>
          <Button disabled={!content.trim()} loading={imp.isPending} onClick={() => imp.mutate()}>
            Import
          </Button>
        </div>
        {result && (
          <div className="mt-3">
            <div className="mb-2 font-semibold">
              {result.created}/{result.total} ta qo'shildi
            </div>
            {result.results
              .filter((r) => !r.ok)
              .map((r) => (
                <div key={r.index} className="mb-1 rounded-lg bg-red-500/10 p-2 text-xs">
                  <b>
                    #{r.index + 1} {r.title}
                  </b>
                  : {r.errors?.join('; ')}
                </div>
              ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
