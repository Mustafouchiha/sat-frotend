import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '../../components/Layout';
import { toast } from '../../components/Toast';
import { Badge, Button, Card, Field, inputCls, Loading, SectionTitle, Segmented, Sheet } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { confirmDialog } from '../../lib/telegram';
import { useTaxonomy } from '../Practice';

interface TestRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  adaptive: boolean;
  isPublic: boolean;
  sections: string[];
  moduleCount: number;
  questionCount: number;
  durationMin: number;
  /** AI savol yozayotgan/yozgan test */
  ai: { running: boolean; total: number; done: number; created: number } | null;
}

type TestType = 'MOCK' | 'SECTION' | 'MODULE' | 'TOPIC' | 'HOMEWORK' | 'QUICK';

export default function AdminTests() {
  const qc = useQueryClient();
  const tax = useTaxonomy();
  const q = useQuery({
    queryKey: ['tests-all'],
    queryFn: () => api<TestRow[]>('/tests'),
    // AI savol yozayotgan bo'lsa — holat yangilanib tursin
    refetchInterval: (query) => (query.state.data?.some((t) => t.ai?.running) ? 4000 : false),
  });
  const usage = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api<{ configured: boolean; budgetUsd: number; rwVariants: boolean; today: { totalUsd: number } }>('/ai/usage'),
  });
  const [jsonOpen, setJsonOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [f, setF] = useState({
    title: '',
    type: 'MOCK' as TestType,
    sections: ['RW', 'MATH'] as Array<'RW' | 'MATH'>,
    adaptive: true,
    questionsPerModule: '',
    minutesPerModule: '',
    domainIds: [] as string[],
    difficulty: '',
    isPublic: false,
    ai: false,
  });

  const create = useMutation({
    mutationFn: () =>
      api('/tests/auto', {
        body: {
          title: f.title,
          type: f.type,
          sections: f.sections,
          adaptive: f.adaptive,
          questionsPerModule: f.questionsPerModule ? Number(f.questionsPerModule) : undefined,
          minutesPerModule: f.minutesPerModule ? Number(f.minutesPerModule) : undefined,
          domainIds: f.domainIds.length ? f.domainIds : undefined,
          difficulty: f.difficulty || null,
          isPublic: f.isPublic,
          ai: f.ai && aiAllowed,
        },
      }) as Promise<{ ai: { jobs: number; questions: number } | null }>,
    onSuccess: (r) => {
      toast(r.ai ? `Test yaratildi — AI ${r.ai.questions} ta savol yozmoqda` : 'Test yaratildi', { icon: r.ai ? '🤖' : '✅' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['tests-all'] });
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/tests/${id}?force=true`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tests-all'] }),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  const single = ['MODULE', 'TOPIC', 'QUICK', 'HOMEWORK'].includes(f.type);
  // AI uchun taxmin: savollar soni (buildAutoModules qoidasi), narx va vaqt
  const perModule = (sec: 'RW' | 'MATH') => (f.questionsPerModule ? Number(f.questionsPerModule) : f.type === 'QUICK' ? 10 : sec === 'RW' ? 27 : 22);
  // AI faqat English (R&W) savollarining variantini yozadi — Math'da sonlar o'zi o'zgaradi
  const aiCount = f.sections.includes('RW') ? perModule('RW') * (single ? 1 : f.adaptive ? 3 : 2) : 0;
  const aiAllowed = !!usage.data?.configured && !!usage.data?.rwVariants && aiCount > 0;
  const aiCost = [aiCount * 0.05, aiCount * 0.15];
  const aiMinutes = Math.max(2, Math.round((Math.ceil(aiCount / 5) * 1.5) / 2));
  const budget = usage.data?.budgetUsd ?? 0;
  const budgetLeft = budget > 0 ? Math.max(0, budget - (usage.data?.today.totalUsd ?? 0)) : null;
  const domains = (tax.data ?? []).filter((d) => f.sections.includes(d.section));

  return (
    <Page
      title="📝 Testlar"
      back
      wide
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setJsonOpen(true)}>
            📥 JSON
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setManualOpen(true)}>
            ✋ Qo'lda
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            ⚙️ Avto
          </Button>
        </div>
      }
    >
      <Card className="mb-3 text-sm text-hint">
        Test yaratilganda savollar bankdan bir marta tanlanadi — hamma o'quvchi bir xil savollarni ishlaydi (Math'da sonlar har kimga o'zi, English hammaga aynan bir xil). Tayyor testni (butun imtihon) «📥 JSON» orqali yuklang. Mock test real SAT kabi: R&W 2×27 (32 daq), Math 2×22 (35 daq), 2-modul adaptiv.
      </Card>
      {q.isLoading && <Loading />}
      <div className="grid gap-2 sm:grid-cols-2">
        {q.data?.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{t.title}</div>
              <div className="flex gap-1">
                <Badge>{t.type}</Badge>
                {t.adaptive && <Badge color="#a855f7">adaptiv</Badge>}
                {t.isPublic && <Badge color="#16a34a">ochiq</Badge>}
              </div>
            </div>
            <div className="mt-1 text-xs text-hint">
              {t.sections.join(' + ')} · {t.moduleCount} modul · {t.questionCount} savol · {t.durationMin} daq
            </div>
            {t.ai && (
              <div className={`mt-1 text-xs ${t.ai.running ? 'text-accent' : 'text-hint'}`}>
                🤖 {t.ai.running ? `AI yozmoqda: ${t.ai.done}/${t.ai.total} · ${t.ai.created} ta tayyor` : `AI yozgan savollar: ${t.ai.created} / ${t.ai.total}`}
              </div>
            )}
            <div className="mt-2 text-right">
              <button className="text-xs text-red-500" onClick={async () => (await confirmDialog(`"${t.title}" o'chirilsinmi?`)) && del.mutate(t.id)}>
                🗑 o'chirish
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Avtomatik test yaratish">
        <Field label="Nomi">
          <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Turi">
          <select
            className={inputCls}
            value={f.type}
            onChange={(e) => {
              const type = e.target.value as TestType;
              setF({ ...f, type, sections: type === 'MOCK' ? ['RW', 'MATH'] : f.sections.slice(0, 1).length ? [f.sections[0]] : ['MATH'] });
            }}
          >
            <option value="MOCK">To'liq SAT (mock)</option>
            <option value="SECTION">Bitta bo'lim (2 modul)</option>
            <option value="MODULE">Bitta modul</option>
            <option value="TOPIC">Mavzu bo'yicha</option>
            <option value="HOMEWORK">Uy vazifasi</option>
            <option value="QUICK">Tezkor (10 savol)</option>
          </select>
        </Field>
        {f.type !== 'MOCK' && (
          <Field label="Bo'lim">
            <Segmented
              value={f.sections[0]}
              onChange={(s) => setF({ ...f, sections: [s], domainIds: [] })}
              options={[
                { value: 'MATH', label: 'Math' },
                { value: 'RW', label: 'R&W' },
              ]}
            />
          </Field>
        )}
        {!single && (
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.adaptive} onChange={(e) => setF({ ...f, adaptive: e.target.checked })} />
            Adaptiv 2-modul (1-modul natijasiga qarab oson/qiyin)
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Savollar / modul" hint="bo'sh — SAT standarti">
            <input className={inputCls} type="number" value={f.questionsPerModule} onChange={(e) => setF({ ...f, questionsPerModule: e.target.value })} />
          </Field>
          <Field label="Daqiqa / modul">
            <input className={inputCls} type="number" value={f.minutesPerModule} onChange={(e) => setF({ ...f, minutesPerModule: e.target.value })} />
          </Field>
        </div>
        {single && (
          <>
            <Field label="Domenlar (bo'sh — hammasi, ulush bo'yicha)">
              <div className="flex flex-wrap gap-1.5">
                {domains.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setF({ ...f, domainIds: f.domainIds.includes(d.id) ? f.domainIds.filter((x) => x !== d.id) : [...f.domainIds, d.id] })}
                    className={`rounded-lg px-2 py-1 text-xs ${f.domainIds.includes(d.id) ? 'bg-accent text-accent-text' : 'bg-soft'}`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Qiyinlik">
              <select className={inputCls} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}>
                <option value="">Aralash</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </Field>
          </>
        )}
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} />
          Barcha o'quvchilar uchun ochiq (Testlar → Ochiq testlar)
        </label>
        <label className={`mb-1 flex items-start gap-2 rounded-xl p-2 text-sm ${f.ai ? 'bg-accent/10' : 'bg-soft'}`}>
          <input type="checkbox" className="mt-1" disabled={!aiAllowed} checked={f.ai && aiAllowed} onChange={(e) => setF({ ...f, ai: e.target.checked })} />
          <span>
            <span className="font-medium">🤖 English savollarining yangi variantini AI yozsin (bitta — hammaga bir xil)</span>
            <span className="block text-xs text-hint">
              {!usage.data?.configured
                ? "AI ulanmagan (Railway'da ANTHROPIC_API_KEY yo'q)"
                : !usage.data.rwVariants
                  ? "English variantlari AI sozlamalarida o'chirilgan"
                  : aiCount === 0
                    ? "Testda English (R&W) bo'limi yo'q — Math'da sonlar o'zi o'zgaradi"
                    : `${aiCount} ta English savol · taxminan $${aiCost[0].toFixed(1)}–${aiCost[1].toFixed(1)} · ~${aiMinutes} daqiqa. Har bir variantni ikkinchi AI tekshiradi; tayyor bo'lguncha bankdagi asl savol turadi.`}
            </span>
          </span>
        </label>
        {f.ai && aiAllowed && budgetLeft !== null && aiCost[1] > budgetLeft && (
          <p className="mb-2 rounded-lg bg-orange-500/10 p-2 text-xs text-orange-600">
            Bugungi AI byudjetidan ~${budgetLeft.toFixed(2)} qoldi — AI shunga yetganicha variant yozadi, qolganlarida bankdagi asl savol qoladi. To'liq mock uchun AI qimmat: mavzu, modul yoki tezkor testlarda ishlating yoki byudjetni oshiring.
          </p>
        )}
        <Button size="lg" disabled={!f.title.trim()} loading={create.isPending} onClick={() => create.mutate()}>
          Yaratish
        </Button>
      </Sheet>
      <ManualTestSheet open={manualOpen} onClose={() => setManualOpen(false)} onDone={() => void qc.invalidateQueries({ queryKey: ['tests-all'] })} />
      <JsonImportSheet open={jsonOpen} onClose={() => setJsonOpen(false)} onDone={() => void qc.invalidateQueries({ queryKey: ['tests-all'] })} />
    </Page>
  );
}

/** Qo'lda savol tanlab test (bitta modul). */
function ManualTestSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [section, setSection] = useState<'MATH' | 'RW'>('MATH');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(20);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const list = useQuery({
    queryKey: ['templates-pick', section, search],
    enabled: open,
    queryFn: () => api<{ items: Array<{ id: string; title: string; difficulty: string; skill: { name: string } }> }>(`/templates?status=PUBLISHED&section=${section}&size=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });
  const create = useMutation({
    mutationFn: () =>
      api('/tests', {
        body: {
          title,
          type: 'HOMEWORK',
          modules: [{ order: 0, section, stage: 1, variant: 'STANDARD', durationSec: minutes * 60, items: picked.map((templateId) => ({ templateId })) }],
        },
      }),
    onSuccess: () => {
      toast('Test yaratildi', { icon: '✅' });
      setPicked([]);
      setTitle('');
      onDone();
      onClose();
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  return (
    <Sheet open={open} onClose={onClose} title="Qo'lda test (savollarni tanlash)" wide>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nomi">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Vaqt (daqiqa)">
          <input className={inputCls} type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </Field>
      </div>
      <Segmented
        className="mb-2"
        value={section}
        onChange={(s) => {
          setSection(s);
          setPicked([]);
        }}
        options={[
          { value: 'MATH', label: 'Math' },
          { value: 'RW', label: 'R&W' },
        ]}
      />
      <input className={`${inputCls} mb-2`} placeholder="Qidiruv" value={search} onChange={(e) => setSearch(e.target.value)} />
      <SectionTitle>Tanlangan: {picked.length}</SectionTitle>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
        {list.data?.items.map((t) => (
          <label key={t.id} className="flex items-center gap-2 border-b border-line p-2 text-sm last:border-0">
            <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, t.id] : picked.filter((x) => x !== t.id))} />
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-xs text-hint">
              {t.skill.name} · {t.difficulty}
            </span>
          </label>
        ))}
      </div>
      <Button size="lg" className="mt-3" disabled={!title.trim() || picked.length === 0} loading={create.isPending} onClick={() => create.mutate()}>
        Yaratish ({picked.length} savol)
      </Button>
    </Sheet>
  );
}

interface ImportReport {
  kind: 'test' | 'questions';
  dryRun: boolean;
  total: number;
  created: number;
  reused: number;
  errors: Array<{ path: string; reason: string }>;
  test: { id: string; title: string; questions: number } | null;
}

/** Tayyor test (butun imtihon) yoki savollar — yagona JSON format: tekshirish va import. */
function JsonImportSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const tax = useTaxonomy();
  const [text, setText] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);

  const run = async (dryRun: boolean) => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      toast(`JSON xato: ${(e as Error).message}`, { kind: 'error' });
      return;
    }
    setBusy(dryRun ? 'check' : 'import');
    try {
      const r = await api<ImportReport>('/tests/import', { body: { json, dryRun } });
      setReport(r);
      if (!dryRun && !r.errors.length) {
        toast(r.test ? `Test yaratildi: ${r.test.title}` : `${r.created} ta savol qo'shildi`, { icon: '✅' });
        onDone();
      }
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const example = async () => {
    try {
      setText(JSON.stringify(await api('/tests/import/example'), null, 2));
      setReport(null);
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="📥 Tayyor test yoki savollar (JSON)" wide>
      <p className="mb-2 text-sm text-hint">
        Bitta format. To'liq test: <code>{'{ "title", "modules": [ { "section", "minutes", "questions": [ … ] } ] }'}</code>. Faqat savollar (bankka):{' '}
        <code>{'{ "questions": [ … ] }'}</code>. Savol: <code>skill</code>, <code>difficulty</code>, <code>passage</code>, <code>question</code>,{' '}
        <code>choices</code> (4 ta; Math'da yozma javobda yo'q), <code>answer</code> (A–D yoki son), <code>explanation</code>, <code>figure</code> (SVG). Test
        faqat hamma savol to'g'ri bo'lsa yaratiladi; hamma o'quvchi bir xil savollarni oladi.
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".json,application/json,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void f.text().then((t) => (setText(t), setReport(null)));
          }}
        />
        <button className="text-sm text-link" onClick={() => void example()}>
          Namuna
        </button>
      </div>
      <textarea
        className={`${inputCls} font-mono text-xs`}
        rows={12}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setReport(null);
        }}
        spellCheck={false}
        placeholder='{ "title": "SAT Practice Test 1", "modules": [ … ] }'
      />
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" disabled={!text.trim()} loading={busy === 'check'} onClick={() => void run(true)}>
          🔍 Tekshirish
        </Button>
        <Button disabled={!text.trim()} loading={busy === 'import'} onClick={() => void run(false)}>
          📥 Import
        </Button>
      </div>
      {report && (
        <div className="mt-3 text-sm">
          <div className="mb-1 font-semibold">
            {report.errors.length
              ? `${report.errors.length} ta xato — ${report.kind === 'test' ? 'test yaratilmadi' : "to'g'ri savollar qo'shildi"}`
              : report.dryRun
                ? `✅ Hammasi to'g'ri — ${report.total} ta savol`
                : report.test
                  ? `✅ Test yaratildi: «${report.test.title}» — ${report.test.questions} ta savol`
                  : `✅ ${report.created} ta yangi savol qo'shildi`}
          </div>
          {!report.dryRun && (report.created > 0 || report.reused > 0) && (
            <div className="mb-1 text-xs text-hint">
              Yangi: {report.created} · bankda bor edi (qayta ishlatildi): {report.reused}
            </div>
          )}
          {report.errors.map((e, i) => (
            <div key={i} className="mb-1 rounded-lg bg-red-500/10 p-2 text-xs">
              <b>{e.path || 'JSON'}</b>: {e.reason}
            </div>
          ))}
        </div>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-hint">Ko'nikmalar (skill) ro'yxati</summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {(tax.data ?? []).flatMap((d) =>
            d.skills.map((sk) => (
              <div key={sk.id}>
                <code>{sk.id}</code> — {sk.name} <span className="text-hint">({d.section === 'MATH' ? 'Math' : 'R&W'})</span>
              </div>
            )),
          )}
        </div>
      </details>
    </Sheet>
  );
}
