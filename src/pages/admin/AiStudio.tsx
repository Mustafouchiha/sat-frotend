import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Badge, Button, Card, Field, inputCls, Loading, ProgressBar, Segmented, StatTile } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { encodeImage, pickImage } from '../../lib/image';
import type { Domain } from '../../lib/types';

type Section = 'MATH' | 'RW';
type Diff = 'MIXED' | 'EASY' | 'MEDIUM' | 'HARD';

interface JobLog {
  title: string;
  skillId?: string;
  difficulty?: string;
  ok: boolean;
  reason?: string;
  templateId?: string;
}

interface Job {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  section: Section;
  reason: 'admin' | 'student' | 'refill';
  mode: 'topic' | 'sample';
  count: number;
  skillIds: string[];
  difficulty: string;
  files: Array<{ name?: string; mime: string }>;
  total: number;
  done: number;
  created: number;
  rejected: number;
  log: JobLog[];
  error: string | null;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

interface Usage {
  configured: boolean;
  budgetUsd: number;
  today: { chatUsd: number; generateUsd: number; totalUsd: number; messages: number; questions: number };
  month: { chatUsd: number; generateUsd: number; totalUsd: number; messages: number; questions: number };
  bank: Record<string, number>;
}

interface AiSettings {
  chatEnabled: boolean;
  chatModel: string;
  chatDailyLimit: number;
  genModel: string;
  verifyModel: string;
  autoPublish: boolean;
  autoRefill: boolean;
  refillDailyJobs: number;
  studentDailyJobs: number;
  dailyBudgetUsd: number;
}

interface PickedFile {
  name: string;
  mime: string;
  data: string;
  size: number;
}

const MODELS = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5 — eng kuchli ($4 / $20)' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5 — tavsiya ($2 / $10)' },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5 — eng arzon ($0.1 / $0.5)' },
];

const STATUS: Record<Job['status'], [string, string]> = {
  QUEUED: ['Navbatda', '#64748b'],
  RUNNING: ['Ishlayapti', '#2563eb'],
  DONE: ['Tayyor', '#16a34a'],
  FAILED: ['Xato', '#dc2626'],
};
const REASON: Record<Job['reason'], string> = { admin: 'Admin', student: "O'quvchi so'radi", refill: "Avto-to'ldirish" };
const usd = (x: number) => `$${x.toFixed(2)}`;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
    r.readAsDataURL(file);
  });
}

function JobCard({ job, skillName }: { job: Job; skillName: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const [label, color] = STATUS[job.status];
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <Card className="p-3">
      <button className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">
              {job.section === 'MATH' ? '📐 Math' : '📖 English'} · {job.mode === 'sample' ? 'eski test bo\'yicha' : job.skillIds.length ? job.skillIds.map(skillName).join(', ') : "barcha mavzular"}
            </div>
            <div className="text-xs text-hint">
              {REASON[job.reason]} · {fmtDate(job.createdAt, true)} · {job.count} ta so'raldi · {usd(job.costUsd)}
            </div>
          </div>
          <Badge color={color}>{label}</Badge>
        </div>
        {(job.status === 'RUNNING' || job.status === 'QUEUED') && <ProgressBar value={Math.max(4, pct)} className="mt-2 h-1.5" />}
        <div className="mt-1.5 text-sm">
          <span className="text-green-600">✓ {job.created} ta bankka qo'shildi</span>
          {job.rejected > 0 && <span className="text-hint"> · ✗ {job.rejected} ta tekshiruvdan o'tmadi</span>}
        </div>
        {job.error && <div className="mt-1 text-xs text-red-500">{job.error}</div>}
      </button>
      {open && job.log.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-sm">
          {job.log.map((l, i) => (
            <div key={i} className="flex items-start gap-2">
              <span>{l.reason === 'info' ? 'ℹ️' : l.ok ? '✅' : '❌'}</span>
              <div className="min-w-0 flex-1">
                {l.templateId ? (
                  <Link to={`/admin/templates/${l.templateId}`} className="text-link">
                    {l.title}
                  </Link>
                ) : (
                  <span>{l.title}</span>
                )}
                {l.difficulty && <span className="text-xs text-hint"> · {l.difficulty}</span>}
                {!l.ok && l.reason && <div className="text-xs text-hint">{l.reason}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SettingsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: { ai: AiSettings } }>('/admin/settings') });
  const [v, setV] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data && !v) setV(q.data.settings.ai);
  }, [q.data, v]);
  if (!v) return <Loading />;
  const set = <K extends keyof AiSettings>(k: K, val: AiSettings[K]) => setV({ ...v, [k]: val });
  const save = async () => {
    setBusy(true);
    try {
      await api('/admin/settings/ai', { method: 'PUT', body: { value: v } });
      toast('Saqlandi', { kind: 'success', icon: '✅' });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const model = (k: 'chatModel' | 'genModel' | 'verifyModel') => (
    <select value={v[k]} onChange={(e) => set(k, e.target.value)} className={inputCls}>
      {MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
  const toggle = (k: 'chatEnabled' | 'autoPublish' | 'autoRefill', text: string, hint: string) => (
    <label className="flex items-start gap-3 rounded-xl bg-soft p-3">
      <input type="checkbox" checked={v[k]} onChange={(e) => set(k, e.target.checked)} className="mt-1 h-4 w-4" />
      <span>
        <span className="font-medium">{text}</span>
        <span className="block text-xs text-hint">{hint}</span>
      </span>
    </label>
  );
  const num = (k: 'chatDailyLimit' | 'refillDailyJobs' | 'studentDailyJobs') => (
    <input type="number" min={0} max={1000} value={v[k]} onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0))} className={inputCls} />
  );
  return (
    <Card>
      <div className="mb-3 font-semibold">⚙️ AI sozlamalari</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="AI ustoz (chat) modeli" hint="Narx: 1 mln token, kirish / chiqish">
          {model('chatModel')}
        </Field>
        <Field label="O'quvchiga kuniga xabarlar" hint="O'qituvchi va admin uchun cheklov yo'q">
          {num('chatDailyLimit')}
        </Field>
        <Field label="Savol yaratish modeli" hint="Sifat muhim — Opus tavsiya etiladi">
          {model('genModel')}
        </Field>
        <Field label="Tekshiruvchi model" hint="Savolni javobsiz yechib, xatoni topadi">
          {model('verifyModel')}
        </Field>
        <Field label="Avto-to'ldirish: kuniga vazifa" hint="Har biri ~5 savol">
          {num('refillDailyJobs')}
        </Field>
        <Field label="O'quvchi «Yangi savollar»: kuniga" hint="Har biri ~6 savol">
          {num('studentDailyJobs')}
        </Field>
        <Field label="Kunlik AI byudjeti ($)" hint="Yetganda chat va savol yaratish ertagacha to'xtaydi; 0 — cheklovsiz">
          <input type="number" min={0} max={1000} step={0.5} value={v.dailyBudgetUsd} onChange={(e) => set('dailyBudgetUsd', Math.max(0, Number(e.target.value) || 0))} className={inputCls} />
        </Field>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {toggle('chatEnabled', 'AI ustoz yoqilgan', 'Mini App va Telegram botda chat')}
        {toggle('autoPublish', 'Tekshiruvdan o\'tgan savollar darhol bankka', "O'chirilsa — «Tekshiruvda» holatida qoladi, siz tasdiqlaysiz")}
        {toggle('autoRefill', "Avto-to'ldirish", "O'quvchi bankdagi barcha savollarni ko'rib bo'lgan mavzuga AI o'zi yangi savollar qo'shadi")}
      </div>
      <Button className="mt-3" loading={busy} onClick={() => void save()}>
        💾 Saqlash
      </Button>
    </Card>
  );
}

export default function AiStudio() {
  const qc = useQueryClient();
  const tax = useQuery({ queryKey: ['taxonomy'], queryFn: () => api<Domain[]>('/taxonomy'), staleTime: 3600_000 });
  const usage = useQuery({ queryKey: ['ai-usage'], queryFn: () => api<Usage>('/ai/usage') });
  const jobs = useQuery({
    queryKey: ['ai-jobs'],
    queryFn: () => api<{ jobs: Job[] }>('/ai/jobs'),
    refetchInterval: (query) => (query.state.data?.jobs.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING') ? 3000 : false),
  });

  const [section, setSection] = useState<Section>('MATH');
  const [mode, setMode] = useState<'topic' | 'sample'>('topic');
  const [domainId, setDomainId] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Diff>('MIXED');
  const [count, setCount] = useState(10);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const domains = useMemo(() => (tax.data ?? []).filter((d) => d.section === section), [tax.data, section]);
  const skillName = (id: string) => (tax.data ?? []).flatMap((d) => d.skills).find((s) => s.id === id)?.name ?? id;
  const domain = domains.find((d) => d.id === domainId);

  useEffect(() => {
    setDomainId('');
    setSkillIds([]);
  }, [section]);

  // Ishlayotgan vazifa tugaganda — xarajat va bank sonlari yangilansin
  const running = jobs.data?.jobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length ?? 0;
  useEffect(() => {
    if (!running) void qc.invalidateQueries({ queryKey: ['ai-usage'] });
  }, [running, qc]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const out: PickedFile[] = [];
    for (const f of Array.from(list)) {
      try {
        if (f.type === 'application/pdf') {
          if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name}: PDF 15 MB dan katta`);
          out.push({ name: f.name, mime: f.type, data: await readBase64(f), size: f.size });
        } else if (f.type.startsWith('image/')) {
          const enc = encodeImage(await pickImage(f), { maxEdge: 2400, maxBytes: 3_000_000 });
          out.push({ name: f.name, mime: enc.mime, data: enc.data, size: enc.bytes });
        } else {
          throw new Error(`${f.name}: faqat rasm yoki PDF`);
        }
      } catch (e) {
        toast(errorText(e), { kind: 'error' });
      }
    }
    setFiles((prev) => [...prev, ...out].slice(0, 8));
  };

  const start = async () => {
    setBusy(true);
    try {
      await api<{ jobId: string }>('/ai/generate', {
        body: {
          section,
          mode,
          domainId: mode === 'topic' ? domainId || null : null,
          skillIds: mode === 'topic' ? skillIds : [],
          difficulty: mode === 'topic' ? difficulty : 'MIXED',
          count,
          text: mode === 'sample' ? text : undefined,
          files: mode === 'sample' ? files.map(({ name, mime, data }) => ({ name, mime, data })) : [],
          note: note || undefined,
        },
      });
      toast("AI ishni boshladi — natija pastda ko'rinadi", { kind: 'success', icon: '🤖' });
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ['ai-jobs'] });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const u = usage.data;
  return (
    <Page title="🤖 AI savol generatori" back wide>
      {u && !u.configured && (
        <Card className="mb-3 border-2 border-orange-400/50 text-sm">
          <div className="mb-1 font-semibold">AI hali ulanmagan</div>
          Railway → sat-backend xizmati → <b>Variables</b> → <code>ANTHROPIC_API_KEY</code> qo'shing (kalit console.anthropic.com → API Keys). Saqlangach
          server qayta ishga tushadi va bu sahifa ishlaydi.
        </Card>
      )}
      {u && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label={u.budgetUsd > 0 ? `Bugungi xarajat (byudjet ${usd(u.budgetUsd)})` : 'Bugungi xarajat'}
            value={usd(u.today.totalUsd)}
            sub={`chat ${usd(u.today.chatUsd)} · savollar ${usd(u.today.generateUsd)}`}
            color={u.budgetUsd > 0 && u.today.totalUsd >= u.budgetUsd ? '#dc2626' : undefined}
          />
          <StatTile label="30 kunda" value={usd(u.month.totalUsd)} sub={`${u.month.messages} xabar · ${u.month.questions} savol`} />
          <StatTile label="Bankdagi AI savollar" value={u.bank.PUBLISHED ?? 0} sub={`tekshiruvda: ${u.bank.PENDING_REVIEW ?? 0}`} />
          <StatTile label="Bugun" value={`${u.today.questions} savol`} sub={`${u.today.messages} ta chat xabar`} />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Card>
            <Segmented
              value={section}
              onChange={setSection}
              options={[
                { value: 'MATH', label: '📐 Math' },
                { value: 'RW', label: '📖 English (R&W)' },
              ]}
            />
            <Segmented
              className="mt-2"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'topic', label: "🎯 Mavzu bo'yicha" },
                { value: 'sample', label: "📄 Eski test bo'yicha" },
              ]}
            />
            <p className="mt-2 text-xs text-hint">
              {mode === 'topic'
                ? "Mavzu va qiyinlikni tanlang — AI shu mavzuda yangi, SAT uslubidagi savollar yozadi."
                : "Eski SAT testidan savollarni qo'ying yoki sahifa rasmlari / PDF yuklang — AI mavzularini aniqlab, xuddi shu mavzu va qiyinlikda yangi savollar tuzadi."}{' '}
              Har bir savolni boshqa AI javobini ko'rmasdan yechib tekshiradi; mos kelmasa — bankka qo'shilmaydi.
            </p>

            {mode === 'topic' ? (
              <div className="mt-3 flex flex-col gap-3">
                <Field label="Domen">
                  <select value={domainId} onChange={(e) => (setDomainId(e.target.value), setSkillIds([]))} className={inputCls}>
                    <option value="">Barcha mavzular</option>
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {domain && (
                  <Field label="Ko'nikmalar" hint="Tanlanmasa — domendagi hammasi">
                    <div className="flex flex-wrap gap-1.5">
                      {domain.skills.map((s) => {
                        const on = skillIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSkillIds(on ? skillIds.filter((x) => x !== s.id) : [...skillIds, s.id])}
                            className={clsx('rounded-full px-3 py-1 text-sm', on ? 'bg-accent text-accent-text' : 'bg-soft text-hint')}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
                <Field label="Qiyinlik">
                  <Segmented
                    value={difficulty}
                    onChange={setDifficulty}
                    options={[
                      { value: 'MIXED', label: 'Aralash' },
                      { value: 'EASY', label: 'Easy' },
                      { value: 'MEDIUM', label: 'Medium' },
                      { value: 'HARD', label: 'Hard' },
                    ]}
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <Field label="Eski test savollari (matn)" hint="Bir nechta savolni ketma-ket qo'yish mumkin">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className={inputCls} placeholder="1. If 3x + 5 = 20, what is the value of x? A) 3 B) 5 ..." />
                </Field>
                <Field label="Yoki rasm / PDF" hint="8 tagacha fayl, jami 20 MB gacha">
                  <input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
                </Field>
                {files.length > 0 && (
                  <div className="flex flex-col gap-1 text-sm">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-soft px-2 py-1">
                        <span className="truncate">
                          {f.mime === 'application/pdf' ? '📄' : '🖼'} {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <button onClick={() => setFiles(files.filter((_, k) => k !== i))} className="text-hint">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-[110px_1fr] gap-3">
              <Field label="Nechta savol">
                <input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} className={inputCls} />
              </Field>
              <Field label="Izoh (ixtiyoriy)">
                <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Masalan: kontekstli masalalar ko'proq bo'lsin" />
              </Field>
            </div>
            <Button size="lg" className="mt-3" loading={busy} disabled={!u?.configured || (mode === 'sample' && !files.length && text.trim().length < 30)} onClick={() => void start()}>
              ✨ {count} ta savol yaratish
            </Button>
            <p className="mt-2 text-center text-xs text-hint">Taxminan 1 savol ≈ 1–2 daqiqa va $0.05–0.15 (Opus + tekshiruv). Sahifani yopsangiz ham ish davom etadi.</p>
          </Card>
          <SettingsCard />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="font-semibold">Vazifalar</div>
            <Link to="/admin/templates?search=ai" className="text-sm text-link">
              AI savollar ro'yxati →
            </Link>
          </div>
          {jobs.isLoading && <Loading />}
          {jobs.data?.jobs.length === 0 && <Card className="text-sm text-hint">Hali vazifa yo'q</Card>}
          {jobs.data?.jobs.map((j) => (
            <JobCard key={j.id} job={j} skillName={skillName} />
          ))}
        </div>
      </div>
    </Page>
  );
}
