import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Badge, Button, Card, Field, inputCls, ProgressBar, SectionTitle, Segmented } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useT } from '../lib/i18n';
import type { Domain } from '../lib/types';

type Diff = 'ANY' | 'EASY' | 'MEDIUM' | 'HARD' | 'FOR_ME' | 'ADAPTIVE';

interface SkillDomain {
  id: string;
  name: string;
  section: 'RW' | 'MATH';
  skills: Array<{ id: string; name: string; mastery: number; answered: number; accuracy: number | null; bucket: string }>;
}

export function useTaxonomy() {
  return useQuery({ queryKey: ['taxonomy'], queryFn: () => api<Domain[]>('/taxonomy'), staleTime: 3600_000 });
}

export default function Practice() {
  const t = useT();
  const nav = useNavigate();
  const tax = useTaxonomy();
  const skills = useQuery({ queryKey: ['my-skills'], queryFn: () => api<SkillDomain[]>('/me/skills') });
  const [section, setSection] = useState<'MATH' | 'RW' | 'MIX'>('MATH');
  const [domainId, setDomainId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [difficulty, setDifficulty] = useState<Diff>('ANY');
  const [count, setCount] = useState(10);

  const domains = useMemo(() => (tax.data ?? []).filter((d) => section === 'MIX' || d.section === section), [tax.data, section]);
  const domain = domains.find((d) => d.id === domainId);

  const start = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ attemptId: string }>('/sessions/practice', { body }),
    onSuccess: (r) => nav(`/session/${r.attemptId}`),
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });

  const submit = () =>
    start.mutate({
      section: section === 'MIX' ? null : section,
      domainId: domainId || null,
      skillId: skillId || null,
      difficulty,
      count,
    });

  const weakest = (skills.data ?? [])
    .flatMap((d) => d.skills.map((s) => ({ ...s, domain: d.name })))
    .filter((s) => s.answered > 0)
    .sort((a, b) => a.mastery - b.mastery);

  return (
    <Page title={t('practice.title')}>
      <Card>
        <Field label={t('practice.section')}>
          <Segmented
            value={section}
            onChange={(v) => {
              setSection(v);
              setDomainId('');
              setSkillId('');
            }}
            options={[
              { value: 'MATH', label: t('section.MATH') },
              { value: 'RW', label: 'R&W' },
              { value: 'MIX', label: t('section.MIX') },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('practice.domain')}>
            <select
              className={inputCls}
              value={domainId}
              onChange={(e) => {
                setDomainId(e.target.value);
                setSkillId('');
              }}
            >
              <option value="">{t('practice.any')}</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('practice.skill')}>
            <select className={inputCls} value={skillId} disabled={!domain} onChange={(e) => setSkillId(e.target.value)}>
              <option value="">{t('practice.any')}</option>
              {domain?.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label={t('practice.difficulty')}
          hint={difficulty === 'FOR_ME' ? t('practice.forMeHint') : difficulty === 'ADAPTIVE' ? t('practice.adaptiveHint') : undefined}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {(['ANY', 'EASY', 'MEDIUM', 'HARD', 'FOR_ME', 'ADAPTIVE'] as Diff[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`rounded-xl px-2 py-2 text-sm font-semibold ${difficulty === d ? 'bg-accent text-accent-text' : 'bg-soft'}`}
              >
                {d === 'FOR_ME' ? '🎯 ' : d === 'ADAPTIVE' ? '🧠 ' : ''}
                {t(`diff.${d}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`${t('practice.count')}: ${count}`}>
          <input type="range" min={5} max={30} step={5} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>
        <Button size="lg" loading={start.isPending} onClick={submit}>
          ▶ {t('practice.start')}
        </Button>
      </Card>

      {weakest.length > 0 && (
        <Card className="mt-3 border border-accent/30">
          <div className="mb-2 text-sm font-semibold">💡 {t('practice.recommend')}</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {weakest.slice(0, 3).map((s) => (
              <Badge key={s.id} color="#dc2626">
                {s.name} · {s.mastery}%
              </Badge>
            ))}
          </div>
          <Button variant="secondary" size="sm" loading={start.isPending} onClick={() => start.mutate({ difficulty: 'ADAPTIVE', count: 10 })}>
            🧠 {t('diff.ADAPTIVE')}
          </Button>
        </Card>
      )}

      <SectionTitle>{t('practice.skills')}</SectionTitle>
      <div className="flex flex-col gap-3">
        {(skills.data ?? []).map((d) => (
          <Card key={d.id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">{d.name}</div>
              <Badge>{d.section === 'MATH' ? 'Math' : 'R&W'}</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {d.skills.map((s) => (
                <button
                  key={s.id}
                  className="text-left"
                  onClick={() => start.mutate({ section: d.section, domainId: d.id, skillId: s.id, difficulty: 'FOR_ME', count: 10 })}
                >
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate pr-2">{s.name}</span>
                    <span className="shrink-0 text-hint">
                      {s.answered ? `${s.mastery}% · ${s.answered}` : '—'}
                    </span>
                  </div>
                  <ProgressBar
                    value={s.answered ? s.mastery : 0}
                    color={s.bucket === 'weak' ? '#ef4444' : s.bucket === 'strong' ? '#22c55e' : '#f59e0b'}
                  />
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
