import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { toast } from '../components/Toast';
import { Button, Card, inputCls } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useT } from '../lib/i18n';
import type { User } from '../lib/types';
import { useAuth } from '../store/auth';

export default function Join() {
  const t = useT();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [busy, setBusy] = useState(false);
  const setUser = useAuth((s) => s.setUser);
  const refresh = useAuth((s) => s.refresh);
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const qc = useQueryClient();

  const join = async () => {
    setBusy(true);
    try {
      const r = await api<{ user: User; group: { name: string } }>('/me/join', { body: { code } });
      setUser(r.user);
      await refresh();
      await qc.invalidateQueries();
      toast(`${t('join.success')} ${r.group.name}`, { icon: '🎉', kind: 'success' });
      nav('/', { replace: true });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('join.title')}>
      <Card className="text-center">
        <div className="mb-2 text-5xl">👋</div>
        {user && <p className="mb-1 font-semibold">{user.name}</p>}
        <p className="mb-4 text-sm text-hint">{t('join.text')}</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('join.code')}
          className={`${inputCls} text-center text-2xl font-bold tracking-[0.3em]`}
          maxLength={16}
        />
        <Button size="lg" className="mt-3" disabled={code.trim().length < 4} loading={busy} onClick={join}>
          {t('join.button')}
        </Button>
      </Card>
    </Page>
  );
}
