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
}

type TestType = 'MOCK' | 'SECTION' | 'MODULE' | 'TOPIC' | 'HOMEWORK' | 'QUICK';

export default function AdminTests() {
  const qc = useQueryClient();
  const tax = useTaxonomy();
  const q = useQuery({ queryKey: ['tests-all'], queryFn: () => api<TestRow[]>('/tests') });
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
        },
      }),
    onSuccess: () => {
      toast('Test yaratildi', { icon: '✅' });
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
  const domains = (tax.data ?? []).filter((d) => f.sections.includes(d.section));

  return (
    <Page
      title="📝 Testlar"
      back
      wide
      actions={
        <div className="flex gap-2">
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
        Avto test har bir o'quvchiga savollar to'plamidan (domen/qiyinlik bo'yicha) tasodifiy shablonlar va o'z sonlarini beradi — yonma-yon o'tirganlar har xil
        savol ko'radi. Mock test real SAT kabi: R&W 2×27 (32 daq), Math 2×22 (35 daq), 2-modul adaptiv.
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
        <Button size="lg" disabled={!f.title.trim()} loading={create.isPending} onClick={() => create.mutate()}>
          Yaratish
        </Button>
      </Sheet>
      <ManualTestSheet open={manualOpen} onClose={() => setManualOpen(false)} onDone={() => void qc.invalidateQueries({ queryKey: ['tests-all'] })} />
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
