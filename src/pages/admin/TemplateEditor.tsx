import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CropArea, ImageDrop, uploadTemplateImage } from '../../components/ImageTools';
import { Page } from '../../components/Layout';
import { MathText } from '../../components/MathText';
import { QuestionView } from '../../components/QuestionView';
import { toast } from '../../components/Toast';
import { Badge, Button, Card, ErrorBox, Field, inputCls, Loading, SectionTitle, Segmented, Sheet } from '../../components/ui';
import { api, ApiError, errorText, mediaUrl } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { encodeImage, padRect, pickImage, type PickedImage, type Rect } from '../../lib/image';
import type { ReviewQuestion } from '../../lib/types';
import { hasRole, useAuth } from '../../store/auth';
import { useTaxonomy } from '../Practice';
import { STATUS_COLORS } from './TemplatesList';

type VarType = 'int' | 'decimal' | 'fraction' | 'choice';
interface Var {
  name: string;
  type: VarType;
  min?: number;
  max?: number;
  step?: number;
  places?: number;
  exclude?: number[];
  numMin?: number;
  numMax?: number;
  denMin?: number;
  denMax?: number;
  allowInteger?: boolean;
  options?: Array<string | number>;
}
type Answer =
  | { kind: 'MCQ'; correct: string; distractors: string[]; format?: string; choiceTemplate?: string }
  | { kind: 'MCQ_TEXT'; choices: string[]; correctIndex?: number; shuffle?: boolean }
  | { kind: 'SPR'; correct: string };
interface Spec {
  version: 1;
  stem: string;
  passage?: string;
  svg?: string;
  explanation?: string;
  variables: Var[];
  derived: Array<{ name: string; expr: string }>;
  constraints: string[];
  answer: Answer;
}
interface Meta {
  title: string;
  section: 'MATH' | 'RW';
  domainId: string;
  skillId: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  tags: string[];
  imageId: string | null;
}
interface Variant extends ReviewQuestion {
  seed: number;
  attempts: number;
  values: Record<string, unknown>;
}
interface Report {
  ok: boolean;
  runs: number;
  successes: number;
  failures: number;
  avgAttempts: number;
  maxAttemptsUsed: number;
  uniqueVariants: number;
  rejections: Record<string, number>;
  divisionByZeroOrNaN: number;
  duplicateChoiceRejections: number;
  constraintRejections: number;
  answerDistribution: Record<string, number>;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

const EMPTY_SPEC: Spec = {
  version: 1,
  stem: 'If ${a}x + {b} = {c}$, what is the value of $x$?',
  variables: [
    { name: 'a', type: 'int', min: 2, max: 9 },
    { name: 'b', type: 'int', min: 1, max: 20 },
    { name: 'x0', type: 'int', min: -10, max: 10, exclude: [0] },
  ],
  derived: [{ name: 'c', expr: 'a*x0 + b' }],
  constraints: ['a != b'],
  answer: { kind: 'MCQ', correct: 'x0', distractors: ['(c + b) / a', 'c - b', '-x0'] },
  explanation: 'Subtract {b}: ${a}x = {=c-b}$, so $x = {x0}$.',
};

const num = (v: string): number | undefined => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Bo'sh maydonlarni olib tashlab, API ga yuboriladigan spec. */
function cleanSpec(s: Spec): Spec {
  const vars = s.variables.map((v) => {
    const base = { name: v.name.trim(), type: v.type };
    if (v.type === 'int') return { ...base, min: v.min ?? 0, max: v.max ?? 0, ...(v.step ? { step: v.step } : {}), ...(v.exclude?.length ? { exclude: v.exclude } : {}) };
    if (v.type === 'decimal') return { ...base, min: v.min ?? 0, max: v.max ?? 0, places: v.places ?? 1, ...(v.exclude?.length ? { exclude: v.exclude } : {}) };
    if (v.type === 'fraction') return { ...base, numMin: v.numMin ?? 1, numMax: v.numMax ?? 9, denMin: v.denMin ?? 2, denMax: v.denMax ?? 9, ...(v.allowInteger ? { allowInteger: true } : {}) };
    return { ...base, options: v.options?.length ? v.options : ['?'] };
  });
  const a = s.answer;
  const answer: Answer =
    a.kind === 'MCQ'
      ? { kind: 'MCQ', correct: a.correct, distractors: a.distractors.filter((d) => d.trim()), ...(a.format ? { format: a.format } : {}), ...(a.choiceTemplate ? { choiceTemplate: a.choiceTemplate } : {}) }
      : a.kind === 'MCQ_TEXT'
        ? { kind: 'MCQ_TEXT', choices: a.choices, ...(a.shuffle === false ? { shuffle: false } : {}) }
        : { kind: 'SPR', correct: a.correct };
  return {
    version: 1,
    stem: s.stem,
    ...(s.passage?.trim() ? { passage: s.passage } : {}),
    ...(s.svg?.trim() ? { svg: s.svg } : {}),
    ...(s.explanation?.trim() ? { explanation: s.explanation } : {}),
    variables: vars as Var[],
    derived: s.derived.filter((d) => d.name.trim() && d.expr.trim()),
    constraints: s.constraints.filter((c) => c.trim()),
    answer,
  };
}

function normalizeSpec(raw: Partial<Spec>): Spec {
  return {
    version: 1,
    stem: raw.stem ?? '',
    passage: raw.passage,
    svg: raw.svg,
    explanation: raw.explanation,
    variables: raw.variables ?? [],
    derived: raw.derived ?? [],
    constraints: raw.constraints ?? [],
    answer: raw.answer ?? { kind: 'SPR', correct: '' },
  };
}

function Box({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Card className="mb-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        {right}
      </div>
      {children}
    </Card>
  );
}

export default function TemplateEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isOperator = hasRole(user, 'OPERATOR');
  const tax = useTaxonomy();
  const existing = useQuery({ queryKey: ['template', id], enabled: !isNew, queryFn: () => api<Record<string, unknown>>(`/templates/${id}`) });

  const [meta, setMeta] = useState<Meta>({
    title: '',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LIN1',
    difficulty: 'MEDIUM',
    status: isOperator ? 'DRAFT' : 'PENDING_REVIEW',
    tags: [],
    imageId: null,
  });
  const [spec, setSpec] = useState<Spec>(EMPTY_SPEC);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const t = existing.data;
    if (!t) return;
    setMeta({
      title: t.title as string,
      section: t.section as Meta['section'],
      domainId: t.domainId as string,
      skillId: t.skillId as string,
      difficulty: t.difficulty as Meta['difficulty'],
      status: t.status as Meta['status'],
      tags: (t.tags as string[]) ?? [],
      imageId: (t.imageId as string | null) ?? null,
    });
    setSpec(normalizeSpec(t.spec as Partial<Spec>));
  }, [existing.data]);

  const domains = useMemo(() => (tax.data ?? []).filter((d) => d.section === meta.section), [tax.data, meta.section]);
  const skills = domains.find((d) => d.id === meta.domainId)?.skills ?? [];

  const switchMode = (m: 'form' | 'json') => {
    if (m === 'json') setJsonText(JSON.stringify(cleanSpec(spec), null, 2));
    else {
      try {
        setSpec(normalizeSpec(JSON.parse(jsonText)));
      } catch {
        toast("JSON noto'g'ri", { kind: 'error' });
        return;
      }
    }
    setMode(m);
  };
  const currentSpec = (): Spec => {
    if (mode === 'json') {
      try {
        return normalizeSpec(JSON.parse(jsonText));
      } catch {
        throw new Error("JSON noto'g'ri");
      }
    }
    return cleanSpec(spec);
  };

  const handleErr = (e: unknown) => {
    if (e instanceof ApiError) {
      const errs = (e.data.errors as string[] | undefined) ?? (e.data.report as Report | undefined)?.errors ?? [];
      if (e.data.report) setReport(e.data.report as Report);
      setErrors(errs.length ? errs : [e.message]);
    } else setErrors([errorText(e)]);
    toast(errorText(e), { kind: 'error' });
  };

  const preview = useMutation({
    mutationFn: (s?: Spec) => api<{ variants: Variant[] }>('/templates/preview', { body: { spec: s ?? currentSpec(), count: 10 } }),
    onSuccess: (r) => {
      setVariants(r.variants);
      setErrors([]);
    },
    onError: handleErr,
  });
  const check = useMutation({
    mutationFn: () => api<{ ok: boolean; errors: string[]; report: Report | null }>('/templates/check', { body: { spec: currentSpec(), runs: 500 } }),
    onSuccess: (r) => {
      setReport(r.report);
      setErrors(r.errors);
    },
    onError: handleErr,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...meta, spec: currentSpec() };
      return isNew ? api<{ id: string }>('/templates', { body }) : api<{ id: string }>(`/templates/${id}`, { method: 'PUT', body });
    },
    onSuccess: (r) => {
      toast('Saqlandi', { icon: '✅', kind: 'success' });
      setErrors([]);
      void qc.invalidateQueries({ queryKey: ['templates'] });
      void qc.invalidateQueries({ queryKey: ['template', id] });
      if (isNew) nav(`/admin/templates/${r.id}`, { replace: true });
    },
    onError: handleErr,
  });

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <Page back><ErrorBox error={existing.error} /></Page>;

  const setVar = (i: number, patch: Partial<Var>) => setSpec((s) => ({ ...s, variables: s.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const ans = spec.answer;
  const previewImage = meta.imageId ? `/api/media/${meta.imageId}` : undefined;
  const reports = (existing.data?.reports as Array<{ id: string; message: string; seed: number | null; templateVersion: number | null; createdAt: string }>) ?? [];

  return (
    <Page title={isNew ? '➕ Yangi shablon' : `✏️ ${meta.title || 'Shablon'}`} back wide>
      {!isOperator && <Card className="mb-3 text-sm text-hint">O'qituvchi sifatida yuborgan savolingiz operator tasdiqlagandan keyin bankka qo'shiladi.</Card>}

      <Box title="Asosiy ma'lumotlar">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nomi">
            <input className={inputCls} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bo'lim">
              <select
                className={inputCls}
                value={meta.section}
                onChange={(e) => {
                  const section = e.target.value as Meta['section'];
                  const d = (tax.data ?? []).find((x) => x.section === section);
                  setMeta({ ...meta, section, domainId: d?.id ?? '', skillId: d?.skills[0]?.id ?? '' });
                }}
              >
                <option value="MATH">Math</option>
                <option value="RW">Reading & Writing</option>
              </select>
            </Field>
            <Field label="Qiyinlik">
              <select className={inputCls} value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value as Meta['difficulty'] })}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </Field>
          </div>
          <Field label="Domen">
            <select
              className={inputCls}
              value={meta.domainId}
              onChange={(e) => {
                const d = domains.find((x) => x.id === e.target.value);
                setMeta({ ...meta, domainId: e.target.value, skillId: d?.skills[0]?.id ?? '' });
              }}
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ko'nikma">
            <select className={inputCls} value={meta.skillId} onChange={(e) => setMeta({ ...meta, skillId: e.target.value })}>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {isOperator && (
            <Field label="Holat">
              <select className={inputCls} value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as Meta['status'] })}>
                <option value="DRAFT">Qoralama</option>
                <option value="PUBLISHED">Nashr qilingan</option>
                <option value="PENDING_REVIEW">Tasdiq kutmoqda</option>
                <option value="ARCHIVED">Arxiv</option>
              </select>
            </Field>
          )}
          <Field label="Teglar (vergul bilan)">
            <input className={inputCls} value={meta.tags.join(', ')} onChange={(e) => setMeta({ ...meta, tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          </Field>
        </div>
        {!isNew && existing.data && (
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-hint">
            <Badge color={STATUS_COLORS[meta.status]}>{meta.status}</Badge>
            <span>v{String(existing.data.version)}</span>
            <span>Elo {String(existing.data.rating)}</span>
            <span>
              {String(existing.data.timesAnswered)} javob · {existing.data.timesAnswered ? Math.round((Number(existing.data.timesCorrect) / Number(existing.data.timesAnswered)) * 100) : '—'}% ✓
            </span>
          </div>
        )}
      </Box>

      <FromPlainText
        onApply={(stem, vars) => {
          setSpec((s) => ({ ...s, stem, variables: vars }));
          setMode('form');
        }}
        onAi={
          isOperator
            ? (r, imageId) => {
                const next = normalizeSpec(r.spec);
                setSpec(next);
                setMeta((m) => ({
                  ...m,
                  title: m.title || r.meta.title,
                  section: r.meta.section,
                  domainId: r.meta.domainId ?? m.domainId,
                  skillId: r.meta.skillId ?? m.skillId,
                  difficulty: r.meta.difficulty,
                  ...(imageId ? { imageId } : {}),
                }));
                setReport(r.report);
                setErrors(r.validation.errors ?? []);
                setMode('form');
                // Natijani darhol ko'rsatish: 10 ta variant (chizma bilan)
                if (r.validation.ok) preview.mutate(cleanSpec(next));
                toast("AI taklifi formaga qo'yildi — tekshirib, saqlang", { icon: '✨' });
              }
            : undefined
        }
      />

      <div className="mb-3 flex items-center justify-between">
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'form', label: '📝 Forma' },
            { value: 'json', label: '{ } JSON' },
          ]}
        />
      </div>

      {mode === 'json' ? (
        <Card className="mb-3">
          <textarea className={`${inputCls} font-mono text-xs`} rows={28} value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
        </Card>
      ) : (
        <>
          <Box title="Matnlar">
            <p className="mb-2 text-xs text-hint">
              O'zgaruvchilar: <code>{'{a}'}</code>, format bilan <code>{'{a|coef}'}</code> <code>{'{b|signed}'}</code> <code>{'{c|frac}'}</code>, ifoda{' '}
              <code>{'{=a*b|frac}'}</code>, choice qismi <code>{'{name.1}'}</code>. Formula <code>$...$</code> ichida. Dollar belgisi: <code>\$</code>.
            </p>
            {meta.section === 'RW' && (
              <Field label="Matn (passage)">
                <textarea className={inputCls} rows={5} value={spec.passage ?? ''} onChange={(e) => setSpec({ ...spec, passage: e.target.value })} />
              </Field>
            )}
            <Field label="Savol (stem)">
              <textarea className={`${inputCls} font-mono text-sm`} rows={3} value={spec.stem} onChange={(e) => setSpec({ ...spec, stem: e.target.value })} />
            </Field>
            <Field label="Yechim izohi (explanation)">
              <textarea className={`${inputCls} font-mono text-sm`} rows={3} value={spec.explanation ?? ''} onChange={(e) => setSpec({ ...spec, explanation: e.target.value })} />
            </Field>
            <details>
              <summary className="cursor-pointer text-sm text-link">
                SVG chizma (ixtiyoriy, sonlari variantlar bilan o'zgaradi) {spec.svg?.trim() ? <Badge color="#16a34a">bor</Badge> : null}
              </summary>
              <Field label="SVG (o'zgaruvchilar bilan)">
                <textarea className={`${inputCls} font-mono text-xs`} rows={6} value={spec.svg ?? ''} onChange={(e) => setSpec({ ...spec, svg: e.target.value })} />
              </Field>
            </details>
          </Box>

          <TemplateImageBox imageId={meta.imageId} onChange={(imageId) => setMeta((m) => ({ ...m, imageId }))} />

          <Box
            title="O'zgaruvchilar"
            right={
              <Button size="sm" variant="secondary" onClick={() => setSpec({ ...spec, variables: [...spec.variables, { name: `v${spec.variables.length + 1}`, type: 'int', min: 1, max: 10 }] })}>
                +
              </Button>
            }
          >
            {spec.variables.length === 0 && <div className="text-sm text-hint">O'zgaruvchi yo'q (R&W savollarida ixtiyoriy)</div>}
            {spec.variables.map((v, i) => (
              <div key={i} className="mb-2 grid grid-cols-12 items-end gap-1.5 rounded-xl bg-soft p-2">
                <input className={`${inputCls} col-span-3 font-mono text-sm`} value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} placeholder="nom" />
                <select className={`${inputCls} col-span-3 text-sm`} value={v.type} onChange={(e) => setVar(i, { type: e.target.value as VarType })}>
                  <option value="int">butun</option>
                  <option value="decimal">o'nli</option>
                  <option value="fraction">kasr</option>
                  <option value="choice">tanlov</option>
                </select>
                {(v.type === 'int' || v.type === 'decimal') && (
                  <>
                    <input className={`${inputCls} col-span-2 text-sm`} type="number" placeholder="min" value={v.min ?? ''} onChange={(e) => setVar(i, { min: num(e.target.value) })} />
                    <input className={`${inputCls} col-span-2 text-sm`} type="number" placeholder="max" value={v.max ?? ''} onChange={(e) => setVar(i, { max: num(e.target.value) })} />
                    {v.type === 'decimal' ? (
                      <input className={`${inputCls} col-span-1 text-sm`} type="number" placeholder="xona" value={v.places ?? ''} onChange={(e) => setVar(i, { places: num(e.target.value) })} />
                    ) : (
                      <input className={`${inputCls} col-span-1 text-sm`} type="number" placeholder="qadam" value={v.step ?? ''} onChange={(e) => setVar(i, { step: num(e.target.value) })} />
                    )}
                    <input
                      className={`${inputCls} col-span-11 text-sm`}
                      placeholder="istisno qiymatlar: 0, 1"
                      defaultValue={(v.exclude ?? []).join(', ')}
                      onBlur={(e) => setVar(i, { exclude: e.target.value.split(',').map((x) => num(x)).filter((x): x is number => x !== undefined) })}
                    />
                  </>
                )}
                {v.type === 'fraction' && (
                  <>
                    <input className={`${inputCls} col-span-1 text-xs`} type="number" title="surat min" value={v.numMin ?? ''} onChange={(e) => setVar(i, { numMin: num(e.target.value) })} />
                    <input className={`${inputCls} col-span-1 text-xs`} type="number" title="surat max" value={v.numMax ?? ''} onChange={(e) => setVar(i, { numMax: num(e.target.value) })} />
                    <input className={`${inputCls} col-span-1 text-xs`} type="number" title="maxraj min" value={v.denMin ?? ''} onChange={(e) => setVar(i, { denMin: num(e.target.value) })} />
                    <input className={`${inputCls} col-span-2 text-xs`} type="number" title="maxraj max" value={v.denMax ?? ''} onChange={(e) => setVar(i, { denMax: num(e.target.value) })} />
                  </>
                )}
                {v.type === 'choice' && (
                  <textarea
                    className={`${inputCls} col-span-5 text-sm`}
                    rows={2}
                    placeholder={'har qatorga bitta: Maria|she'}
                    defaultValue={(v.options ?? []).join('\n')}
                    onBlur={(e) =>
                      setVar(i, {
                        options: e.target.value
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((x) => (Number.isNaN(Number(x)) ? x : Number(x))),
                      })
                    }
                  />
                )}
                <button className="col-span-1 rounded-lg py-2 text-red-500" onClick={() => setSpec({ ...spec, variables: spec.variables.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
          </Box>

          <Box title="Hosilaviy o'zgaruvchilar (formula)" right={<Button size="sm" variant="secondary" onClick={() => setSpec({ ...spec, derived: [...spec.derived, { name: '', expr: '' }] })}>+</Button>}>
            {spec.derived.map((d, i) => (
              <div key={i} className="mb-1.5 flex gap-1.5">
                <input className={`${inputCls} w-28 font-mono text-sm`} placeholder="nom" value={d.name} onChange={(e) => setSpec({ ...spec, derived: spec.derived.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <span className="py-2">=</span>
                <input className={`${inputCls} font-mono text-sm`} placeholder="a*x0 + b" value={d.expr} onChange={(e) => setSpec({ ...spec, derived: spec.derived.map((x, j) => (j === i ? { ...x, expr: e.target.value } : x)) })} />
                <button className="px-2 text-red-500" onClick={() => setSpec({ ...spec, derived: spec.derived.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
          </Box>

          <Box title="Cheklovlar" right={<Button size="sm" variant="secondary" onClick={() => setSpec({ ...spec, constraints: [...spec.constraints, ''] })}>+</Button>}>
            <p className="mb-2 text-xs text-hint">
              Masalan: <code>a != b</code>, <code>b^2 - 4*a*c &gt; 0</code>, <code>isInt(answer)</code>. Bajarilmasa generator 200 martagacha qayta urinadi.
            </p>
            {spec.constraints.map((c, i) => (
              <div key={i} className="mb-1.5 flex gap-1.5">
                <input className={`${inputCls} font-mono text-sm`} value={c} onChange={(e) => setSpec({ ...spec, constraints: spec.constraints.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button className="px-2 text-red-500" onClick={() => setSpec({ ...spec, constraints: spec.constraints.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
          </Box>

          <Box title="Javob">
            <Segmented
              className="mb-3"
              value={ans.kind}
              onChange={(k) =>
                setSpec({
                  ...spec,
                  answer:
                    k === 'MCQ'
                      ? { kind: 'MCQ', correct: 'correct' in ans ? ans.correct : '', distractors: ['', '', ''] }
                      : k === 'MCQ_TEXT'
                        ? { kind: 'MCQ_TEXT', choices: ['', '', '', ''] }
                        : { kind: 'SPR', correct: 'correct' in ans ? ans.correct : '' },
                })
              }
              options={[
                { value: 'MCQ', label: 'MCQ (formula)' },
                { value: 'MCQ_TEXT', label: 'MCQ (matn)' },
                { value: 'SPR', label: 'SPR (o\'zi kiritadi)' },
              ]}
            />
            {(ans.kind === 'MCQ' || ans.kind === 'SPR') && (
              <Field label="To'g'ri javob formulasi">
                <input className={`${inputCls} font-mono`} value={ans.correct} onChange={(e) => setSpec({ ...spec, answer: { ...ans, correct: e.target.value } })} />
              </Field>
            )}
            {ans.kind === 'MCQ' && (
              <>
                <div className="mb-1 text-sm font-medium text-hint">Chalg'ituvchilar (tipik xatolar, 3+ ta — tasodifiy 3 tasi tanlanadi)</div>
                {ans.distractors.map((d, i) => (
                  <div key={i} className="mb-1.5 flex gap-1.5">
                    <input
                      className={`${inputCls} font-mono text-sm`}
                      value={d}
                      onChange={(e) => setSpec({ ...spec, answer: { ...ans, distractors: ans.distractors.map((x, j) => (j === i ? e.target.value : x)) } })}
                    />
                    <button className="px-2 text-red-500" onClick={() => setSpec({ ...spec, answer: { ...ans, distractors: ans.distractors.filter((_, j) => j !== i) } })}>
                      ✕
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="secondary" onClick={() => setSpec({ ...spec, answer: { ...ans, distractors: [...ans.distractors, ''] } })}>
                  + chalg'ituvchi
                </Button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Field label="Format">
                    <select className={inputCls} value={ans.format ?? ''} onChange={(e) => setSpec({ ...spec, answer: { ...ans, format: e.target.value || undefined } })}>
                      <option value="">avtomatik</option>
                      <option value="frac">kasr (frac)</option>
                      <option value="r1">1 xona (r1)</option>
                      <option value="r2">2 xona (r2)</option>
                      <option value="d2">pul (d2)</option>
                      <option value="sqrt">ildiz (sqrt)</option>
                      <option value="comma">minglik (comma)</option>
                    </select>
                  </Field>
                  <Field label="Variant shabloni (ixtiyoriy)" hint="masalan: ${v}\pi$ yoki \${v|d2}">
                    <input className={`${inputCls} font-mono text-sm`} value={ans.choiceTemplate ?? ''} onChange={(e) => setSpec({ ...spec, answer: { ...ans, choiceTemplate: e.target.value || undefined } })} />
                  </Field>
                </div>
              </>
            )}
            {ans.kind === 'MCQ_TEXT' && (
              <>
                {ans.choices.map((c, i) => (
                  <Field key={i} label={i === 0 ? "✅ To'g'ri variant" : `Noto'g'ri variant ${i}`}>
                    <input className={clsx(inputCls, i === 0 && 'border-green-500')} value={c} onChange={(e) => setSpec({ ...spec, answer: { ...ans, choices: ans.choices.map((x, j) => (j === i ? e.target.value : x)) } })} />
                  </Field>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={ans.shuffle !== false} onChange={(e) => setSpec({ ...spec, answer: { ...ans, shuffle: e.target.checked } })} />
                  Variantlarni aralashtirish
                </label>
              </>
            )}
          </Box>
        </>
      )}

      {errors.length > 0 && (
        <Card className="mb-3 border-2 border-red-500/40">
          <div className="mb-1 font-semibold text-red-500">Xatolar</div>
          <ul className="list-disc pl-5 text-sm">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="sticky bottom-20 z-20 mb-3 grid grid-cols-3 gap-2 rounded-2xl bg-card p-2 shadow-lg">
        <Button variant="secondary" loading={preview.isPending} onClick={() => preview.mutate()}>
          👁 Preview
        </Button>
        <Button variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>
          🧪 500 test
        </Button>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          💾 Saqlash
        </Button>
      </div>

      {report && <ReportCard r={report} />}
      {variants && (
        <>
          <SectionTitle action={<button className="text-sm text-link" onClick={() => preview.mutate()}>🔄 boshqa 10 ta</button>}>10 ta tasodifiy variant</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {variants.map((v, i) => (
              <Card key={i}>
                <div className="mb-2 flex justify-between text-xs text-hint">
                  <span>#{i + 1} · seed {v.seed}</span>
                  <span>{v.attempts} urinish</span>
                </div>
                <QuestionView q={{ ...v, imageUrl: previewImage }} answer={v.correctLabel} disabled reveal={{ correctLabel: v.correctLabel, correctDisplay: v.correctDisplay, isCorrect: true }} />
                <div className="mt-2 text-sm">
                  To'g'ri: <b>{v.correctDisplay}</b>
                </div>
                {v.explanation && (
                  <div className="mt-2 rounded-xl bg-soft p-2 text-sm">
                    <MathText text={v.explanation} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {reports.length > 0 && id && (
        <>
          <SectionTitle>⚠️ Ochiq shikoyatlar</SectionTitle>
          {reports.map((r) => (
            <ReportItem key={r.id} templateId={id} r={r} />
          ))}
        </>
      )}
    </Page>
  );
}

function ReportCard({ r }: { r: Report }) {
  const total = r.successes || 1;
  return (
    <Card className={clsx('mb-3 border-2', r.ok ? 'border-green-500/40' : 'border-red-500/40')}>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold">{r.ok ? "✅ Avto-tekshiruvdan o'tdi" : "❌ Avto-tekshiruvdan o'tmadi"}</div>
        <span className="text-xs text-hint">{r.durationMs} ms</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          Muvaffaqiyatli: <b>{r.successes}/{r.runs}</b>
        </div>
        <div>
          Har xil variant: <b>{r.uniqueVariants}</b>
        </div>
        <div>
          O'rtacha urinish: <b>{r.avgAttempts}</b> (max {r.maxAttemptsUsed})
        </div>
        <div>
          Nolga bo'lish/NaN: <b>{r.divisionByZeroOrNaN}</b>
        </div>
        <div>
          Takroriy variantlar: <b>{r.duplicateChoiceRejections}</b>
        </div>
        <div>
          Cheklov rad etishlari: <b>{r.constraintRejections}</b>
        </div>
        <div className="col-span-2">
          Javob taqsimoti:{' '}
          {Object.entries(r.answerDistribution).map(([k, v]) => (
            <Badge key={k} className="mr-1">
              {k}: {Math.round((v / total) * 100)}%
            </Badge>
          ))}
        </div>
      </div>
      {r.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-orange-600">
          {r.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {r.errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-500">
          {r.errors.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReportItem({ templateId, r }: { templateId: string; r: { id: string; message: string; seed: number | null; templateVersion: number | null; createdAt: string } }) {
  const [open, setOpen] = useState(false);
  const v = useQuery({
    queryKey: ['variant', templateId, r.seed, r.templateVersion],
    enabled: open && r.seed !== null,
    queryFn: () => api<Variant>(`/templates/${templateId}/variant?seed=${r.seed}${r.templateVersion ? `&version=${r.templateVersion}` : ''}`),
  });
  return (
    <Card className="mb-2">
      <div className="text-sm">{r.message}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-hint">
        <span>
          {fmtDate(r.createdAt, true)} · seed {r.seed ?? '—'} · v{r.templateVersion ?? '?'}
        </span>
        {r.seed !== null && (
          <button className="text-link" onClick={() => setOpen(true)}>
            Aynan shu variant
          </button>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="O'quvchi ko'rgan variant">
        {v.isLoading && <Loading />}
        {v.data && <QuestionView q={v.data} answer={v.data.correctLabel} disabled reveal={{ correctLabel: v.data.correctLabel, correctDisplay: v.data.correctDisplay, isCorrect: true }} />}
      </Sheet>
    </Card>
  );
}

/** Shablonga rasm biriktirish: tanlash → (ixtiyoriy) kerakli qismini belgilash → siqib yuklash. */
function TemplateImageBox({ imageId, onChange }: { imageId: string | null; onChange: (id: string | null) => void }) {
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => void (picked && URL.revokeObjectURL(picked.url)), [picked]);

  const choose = async (f: File) => {
    try {
      setPicked(await pickImage(f));
      setRect(null);
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };
  const attach = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      onChange(await uploadTemplateImage(picked, rect));
      setPicked(null);
      toast('Rasm biriktirildi — saqlashni unutmang', { icon: '🖼' });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      title="🖼 Rasm (ixtiyoriy)"
      right={
        imageId && !picked ? (
          <button className="text-sm text-red-500" onClick={() => onChange(null)}>
            olib tashlash
          </button>
        ) : undefined
      }
    >
      <p className="mb-2 text-xs text-hint">
        Rasm savol ustida barcha variantlarda bir xil chiqadi, shuning uchun undagi sonlar o'zgaruvchi bo'lmasin. Sonlari o'zgaradigan chizma uchun SVG ishlating (AI rasmdan SVG chizib bera oladi).
      </p>
      {picked ? (
        <>
          <CropArea image={picked} rect={rect} onChange={setRect} />
          <p className="mt-1 text-center text-xs text-hint">
            {rect ? `Belgilangan qism: ${Math.round(rect.width)}×${Math.round(rect.height)} px` : "Faqat bir qismi kerak bo'lsa, rasm ustida to'rtburchak chizing"}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button size="sm" loading={busy} onClick={() => void attach()}>
              {rect ? '✂️ Belgilangan qismni biriktirish' : '📎 Butun rasmni biriktirish'}
            </Button>
            {rect && (
              <Button size="sm" variant="secondary" onClick={() => setRect(null)}>
                Belgini o'chirish
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setPicked(null)}>
              Bekor qilish
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {imageId && <img src={mediaUrl(`/api/media/${imageId}`)} alt="" className="mx-auto max-h-48 rounded-xl border border-line" />}
          <ImageDrop onFile={(f) => void choose(f)} label={imageId ? 'Boshqa rasm tanlash' : 'Rasm tanlash'} compact={Boolean(imageId)} />
        </div>
      )}
    </Box>
  );
}

interface OriginalCheck {
  answerMatches: boolean;
  expected: number | null;
  got: number | null;
  problems: string[];
}

interface AiResult {
  spec: Partial<Spec>;
  meta: { title: string; section: 'MATH' | 'RW'; domainId: string | null; skillId: string | null; difficulty: 'EASY' | 'MEDIUM' | 'HARD' };
  suggestion: { notes: string; transcript: string; distractors: Array<{ expr: string; mistake: string }>; svgDropped: boolean };
  /** AI chizmani SVG qila olmaganda: chizma joylashgan qism (yuborilgan rasm pikselida) */
  figureBox: Rect | null;
  original: OriginalCheck | null;
  validation: { ok: boolean; errors: string[] };
  report: Report | null;
  model: string;
}

const fmtNum = (x: number | null) => (x === null ? '—' : String(Number.isInteger(x) ? x : Number(x.toFixed(4))));

function OriginalCheckView({ o }: { o: OriginalCheck }) {
  const good = o.answerMatches && o.problems.length === 0;
  return (
    <div className={clsx('mb-2 rounded-lg p-2 text-xs', good ? 'bg-green-500/10' : 'bg-orange-500/10')}>
      {o.answerMatches
        ? `✅ Asl savoldagi sonlar bilan formula to'g'ri javob beradi: ${fmtNum(o.got)}`
        : o.expected !== null && o.got !== null
          ? `❌ Asl savolning javobi ${fmtNum(o.expected)}, shablon formulasi esa ${fmtNum(o.got)} beradi — formulani tekshiring`
          : "⚠️ Shablonni asl savol bilan tekshirib bo'lmadi"}
      {o.problems.length > 0 && (
        <ul className="mt-1 list-disc pl-4">
          {o.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 3.2: tayyor savoldan shablon — sonlarni topish va (ixtiyoriy) Claude AI taklifi matn yoki rasmdan. */
function FromPlainText({ onApply, onAi }: { onApply: (stem: string, vars: Var[]) => void; onAi?: (r: AiResult, imageId: string | null) => void }) {
  const [text, setText] = useState('');
  const [nums, setNums] = useState<Array<{ index: number; length: number; raw: string; value: number; name: string; on: boolean; suggestion: Var }>>([]);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [img, setImg] = useState<PickedImage | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [attachFigure, setAttachFigure] = useState(true);
  const [applying, setApplying] = useState(false);
  useEffect(() => () => void (img && URL.revokeObjectURL(img.url)), [img]);

  const find = useMutation({
    mutationFn: () => api<{ numbers: Array<{ index: number; length: number; raw: string; value: number; suggestedName: string; suggestion: Var }> }>('/templates/templatize', { body: { text } }),
    onSuccess: (r) => setNums(r.numbers.map((n) => ({ ...n, name: n.suggestedName, on: true }))),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const aiMut = useMutation({
    mutationFn: async () => {
      // Claude rasmni uzun tomoni 2576 px va 3.75 MP gacha to'liq ko'radi — shu chegaradan oshmaydi, koordinatalar 1:1 qoladi
      const enc = img ? encodeImage(img, { maxEdge: 2576, maxPixels: 3_700_000, maxBytes: 2_600_000 }) : null;
      const r = await api<AiResult>('/templates/ai-suggest', {
        body: { ...(text.trim() ? { text: text.trim() } : {}), ...(enc ? { image: { mime: enc.mime, data: enc.data } } : {}) },
      });
      return { r, sentWidth: enc?.width ?? 0 };
    },
    onSuccess: ({ r, sentWidth }) => {
      setAi(r);
      setAttachFigure(true);
      // Yuborilgan (kichraytirilgan) rasm koordinatalarini asl rasmga o'tkazish
      if (r.figureBox && img && sentWidth) {
        const k = img.width / sentWidth;
        setCrop(padRect({ x: r.figureBox.x * k, y: r.figureBox.y * k, width: r.figureBox.width * k, height: r.figureBox.height * k }, img.width, img.height));
      } else setCrop(null);
    },
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  const chooseImage = async (f: File) => {
    try {
      setImg(await pickImage(f));
      setAi(null);
      setCrop(null);
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };
  const apply = () => {
    const picks = nums.filter((n) => n.on).sort((a, b) => b.index - a.index);
    let out = text;
    for (const p of picks) out = `${out.slice(0, p.index)}{${p.name}}${out.slice(p.index + p.length)}`;
    onApply(out, nums.filter((n) => n.on).map((n) => ({ ...n.suggestion, name: n.name })));
    toast("Shablonga aylantirildi — endi javob formulasini yozing", { icon: '✍️' });
  };
  const applyAi = async () => {
    if (!ai || !onAi) return;
    let imageId: string | null = null;
    if (img && crop && attachFigure) {
      setApplying(true);
      try {
        imageId = await uploadTemplateImage(img, crop);
      } catch (e) {
        toast(errorText(e), { kind: 'error' });
        return;
      } finally {
        setApplying(false);
      }
    }
    onAi(ai, imageId);
  };

  return (
    <details className="mb-3 rounded-2xl bg-card p-4">
      <summary className="cursor-pointer font-semibold">🪄 Tayyor savoldan shablon yasash {onAi ? '(matn yoki rasm + AI)' : ''}</summary>
      <p className="my-2 text-xs text-hint">
        Markaz o'zi tuzgan yoki litsenziyaga ega savolni yopishtiring{onAi ? ' yoki rasmini (skrinshot, foto) yuklang' : ''}. Rasmiy College Board savollarini so'zma-so'z kiritmang — AI matnni o'z so'zlari bilan qayta yozadi.
      </p>
      {onAi &&
        (img ? (
          <div className="mb-2 flex items-start gap-3">
            <img src={img.url} alt="" className="max-h-40 max-w-[60%] rounded-xl border border-line object-contain" />
            <div className="flex flex-col gap-2 text-xs text-hint">
              <span>
                {img.width}×{img.height} px
              </span>
              <ImageDrop onFile={(f) => void chooseImage(f)} label="Boshqa rasm" compact />
              <button
                className="text-left text-red-500"
                onClick={() => {
                  setImg(null);
                  setAi(null);
                  setCrop(null);
                }}
              >
                ✕ rasmni olib tashlash
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-2">
            <ImageDrop onFile={(f) => void chooseImage(f)} label="Savol rasmini yuklash (skrinshot yoki foto)" />
          </div>
        ))}
      <textarea
        className={inputCls}
        rows={img ? 2 : 4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={img ? "Qo'shimcha izoh (ixtiyoriy): masalan, «faqat burchakni o'zgartir» yoki «javobni SPR qil»" : 'If 3x + 7 = 22, what is the value of x?'}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {!img && (
          <Button size="sm" variant="secondary" disabled={!text.trim()} loading={find.isPending} onClick={() => find.mutate()}>
            🔢 Sonlarni topish
          </Button>
        )}
        {onAi && (
          <Button size="sm" variant={img ? 'primary' : 'secondary'} disabled={!img && text.trim().length < 10} loading={aiMut.isPending} onClick={() => aiMut.mutate()}>
            ✨ {img ? 'Rasmdan shablon (Claude)' : 'AI taklifi (Claude)'}
          </Button>
        )}
      </div>
      {aiMut.isPending && <p className="mt-2 text-xs text-hint">Claude savolni o'qib, yechib, shablon tuzmoqda — odatda 30–90 soniya…</p>}
      {nums.length > 0 && !img && (
        <div className="mt-3">
          <div className="mb-2 text-sm text-hint">Qaysi sonlar o'zgaruvchi bo'ladi?</div>
          <div className="flex flex-wrap gap-2">
            {nums.map((n, i) => (
              <div key={i} className={clsx('flex items-center gap-1 rounded-xl border-2 px-2 py-1', n.on ? 'border-accent' : 'border-line opacity-60')}>
                <input type="checkbox" checked={n.on} onChange={(e) => setNums(nums.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                <b>{n.raw}</b>→
                <input className="w-12 rounded border border-line bg-card px-1 font-mono text-sm" value={n.name} onChange={(e) => setNums(nums.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-2" onClick={apply}>
            Shablonga aylantirish
          </Button>
        </div>
      )}
      {ai && onAi && (
        <div className="mt-3 rounded-xl bg-soft p-3 text-sm">
          <div className="mb-1 font-semibold">✨ AI taklifi ({ai.model})</div>
          <div className="mb-2 text-hint">{ai.suggestion.notes}</div>
          {ai.original && <OriginalCheckView o={ai.original} />}
          {ai.suggestion.transcript && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-link">AI o'qigan asl savol</summary>
              <div className="mt-1 whitespace-pre-wrap rounded-lg bg-card p-2 text-xs">
                <MathText text={ai.suggestion.transcript} />
              </div>
            </details>
          )}
          {ai.suggestion.distractors.length > 0 && (
            <ul className="mb-2 list-disc pl-5 text-xs">
              {ai.suggestion.distractors.map((d, i) => (
                <li key={i}>
                  <code>{d.expr}</code> — {d.mistake}
                </li>
              ))}
            </ul>
          )}
          {ai.spec.svg && <div className="mb-2 text-xs">🖼 Chizma SVG qilib qayta chizildi — undagi sonlar variantlar bilan o'zgaradi. Preview'da tekshiring.</div>}
          {ai.suggestion.svgDropped && <div className="mb-2 text-xs text-orange-600">AI chizgan SVG xavfsizlik tekshiruvidan o'tmadi va olib tashlandi.</div>}
          {img && crop && (
            <div className="mb-2">
              <label className="mb-1 flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={attachFigure} onChange={(e) => setAttachFigure(e.target.checked)} />
                Chizmani rasm sifatida biriktirish (noto'g'ri belgilangan bo'lsa, rasm ustida qayta chizing)
              </label>
              {attachFigure && <CropArea image={img} rect={crop} onChange={(r) => setCrop((c) => r ?? c)} maxHeight={260} />}
            </div>
          )}
          <div className="mb-2">
            {ai.validation.ok ? <Badge color="#16a34a">Sxema to'g'ri</Badge> : <Badge color="#dc2626">Xatolar: {ai.validation.errors.length}</Badge>}{' '}
            {ai.report && <Badge color={ai.report.ok ? '#16a34a' : '#dc2626'}>100 variant: {ai.report.successes}/100</Badge>}
          </div>
          <Button size="sm" loading={applying} onClick={() => void applyAi()}>
            Formaga qo'llash (saqlanmaydi)
          </Button>
        </div>
      )}
    </details>
  );
}
