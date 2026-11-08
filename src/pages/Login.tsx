import { useEffect, useRef } from 'react';
import { Button, Card, Spinner } from '../components/ui';
import { useT } from '../lib/i18n';
import { useAuth } from '../store/auth';

export function Splash() {
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const init = useAuth((s) => s.init);
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <img src="/icon.svg" alt="" className="h-16 w-16" />
      {status === 'error' ? (
        <>
          <p className="max-w-xs text-sm text-hint">{error}</p>
          <Button onClick={() => void init()}>{t('common.retry')}</Button>
        </>
      ) : (
        <Spinner />
      )}
    </div>
  );
}

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

/** Telegram'dan tashqarida (desktop brauzer) — Telegram Login Widget; lokal — dev login. */
export function LoginPage() {
  const t = useT();
  const loginWith = useAuth((s) => s.loginWith);
  const error = useAuth((s) => s.error);
  const status = useAuth((s) => s.status);
  const widgetRef = useRef<HTMLDivElement>(null);
  const botUsername = import.meta.env.VITE_BOT_USERNAME as string | undefined;
  const devLogin = import.meta.env.VITE_DEV_LOGIN === 'true';

  useEffect(() => {
    if (!botUsername || !widgetRef.current) return;
    window.onTelegramAuth = (user) => void loginWith('/auth/widget', user);
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', botUsername);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    widgetRef.current.innerHTML = '';
    widgetRef.current.appendChild(s);
  }, [botUsername, loginWith]);

  const devUsers = [
    { tgId: 100000004, firstName: 'Aziz', label: "O'quvchi" },
    { tgId: 100000003, firstName: 'Nodira', label: "O'qituvchi" },
    { tgId: 100000002, firstName: 'Operator', label: 'Operator' },
    { tgId: 100000001, firstName: 'Admin', label: 'Super admin' },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <img src="/icon.svg" alt="" className="h-20 w-20" />
      <div>
        <h1 className="text-2xl font-bold">{t('login.title')}</h1>
        <p className="mt-1 text-hint">{t('login.subtitle')}</p>
      </div>
      <Card className="w-full">
        <p className="mb-3 text-sm">📱 {t('login.openInTelegram')}</p>
        {botUsername && (
          <>
            <a className="mb-4 block font-semibold text-link" href={`https://t.me/${botUsername}`}>
              @{botUsername}
            </a>
            <p className="mb-2 text-xs text-hint">{t('login.widget')}</p>
            <div ref={widgetRef} className="flex justify-center" />
          </>
        )}
      </Card>
      {devLogin && (
        <Card className="w-full">
          <p className="mb-2 text-xs font-semibold text-hint">{t('login.dev')}</p>
          <div className="grid grid-cols-2 gap-2">
            {devUsers.map((u) => (
              <Button key={u.tgId} variant="secondary" size="sm" loading={status === 'loading'} onClick={() => void loginWith('/auth/dev', u)}>
                {u.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
