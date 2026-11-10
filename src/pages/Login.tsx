import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Card, inputCls, Segmented, Spinner } from '../components/ui';
import { api, errorText } from '../lib/api';
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

interface QrLogin {
  id: string;
  secret: string;
  expiresAt: string;
  link: string | null;
}
type PollResult = { status: 'pending' | 'expired' | 'rejected' | 'used' } | { status: 'approved'; token: string };
interface PhoneLogin {
  id: string;
  secret: string;
  expiresAt: string;
  phone: string;
  linkBot: string | null;
}

const botFromLink = (link: string | null | undefined) => (link ? /t\.me\/([A-Za-z0-9_]+)/.exec(link)?.[1] ?? null : null);

/** QR kod rasmi (oq fonda — tungi rejimda ham skaner o'qiydi). */
function QrImage({ value, size = 224, children }: { value: string; size?: number; children?: ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Kutubxona faqat kirish sahifasida kerak — Telegram ichidagi asosiy paketga qo'shilmaydi
    void import('qrcode')
      .then((m) => m.default.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }))
      .then((d) => alive && setSrc(d));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return (
    <div className="relative mx-auto rounded-2xl bg-white p-2 shadow-sm" style={{ width: size + 16, height: size + 16 }}>
      {src ? <img src={src} alt="QR" width={size} height={size} className="block" /> : <div className="flex h-full items-center justify-center"><Spinner /></div>}
      {children}
    </div>
  );
}

/** QR: brauzer so'rov yaratadi, telefonda bot orqali tasdiqlanadi, brauzer har 2 soniyada holatni so'raydi. */
function QrPanel({ onToken, onBot }: { onToken: (token: string) => void; onBot: (bot: string | null) => void }) {
  const t = useT();
  const [qr, setQr] = useState<QrLogin | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired' | 'rejected' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const autoRefreshes = useRef(0);

  const create = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const r = await api<QrLogin>('/web-login/qr', { body: {} });
      if (!r.link) throw new Error("Bot nomi sozlanmagan (BOT_USERNAME)");
      setQr(r);
      onBot(botFromLink(r.link));
      setState('ready');
    } catch (e) {
      setError(errorText(e));
      setState('error');
    }
  }, [onBot]);

  useEffect(() => {
    void create();
  }, [create]);

  useEffect(() => {
    if (state !== 'ready' || !qr) return;
    let stopped = false;
    const tick = async () => {
      // Sahifa ko'rinmay turganda so'ramaymiz (masalan foydalanuvchi Telegram'ga o'tgan)
      if (stopped || document.hidden) return;
      try {
        const r = await api<PollResult>('/web-login/poll', { body: { id: qr.id, secret: qr.secret } });
        if (stopped) return;
        if (r.status === 'approved') {
          stopped = true;
          onToken(r.token);
        } else if (r.status === 'expired' || r.status === 'used') {
          // QR 5 daqiqa yashaydi: ochiq sahifada bir necha marta o'zi yangilanadi
          if (autoRefreshes.current++ < 10) void create();
          else setState('expired');
        } else if (r.status === 'rejected') setState('rejected');
      } catch {
        /* tarmoq uzilishi — keyingi urinishda */
      }
    };
    const iv = window.setInterval(() => void tick(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [state, qr, create, onToken]);

  const bot = botFromLink(qr?.link);
  const restart = () => {
    autoRefreshes.current = 0;
    void create();
  };

  return (
    <Card className="flex h-full flex-col">
      <h2 className="mb-3 text-lg font-bold">🔳 {t('login.qrTitle')}</h2>
      <div className="mb-4">
        {state === 'error' ? (
          <div className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-600">
            <p>{error}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={restart}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <QrImage value={qr?.link ?? 'https://t.me'}>
            {(state === 'loading' || state === 'expired' || state === 'rejected') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/90 p-4 text-center text-sm font-semibold text-slate-800">
                {state === 'loading' ? (
                  <Spinner />
                ) : (
                  <>
                    <span>{state === 'expired' ? `⌛ ${t('login.qrExpired')}` : `❌ ${t('login.qrRejected')}`}</span>
                    <Button size="sm" onClick={restart}>
                      🔄 {t('login.newQr')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </QrImage>
        )}
      </div>
      <ol className="mb-4 flex flex-col gap-2 text-sm">
        {[t('login.qrStep1'), t('login.qrStep2', { bot: bot ?? 'bot' }), t('login.qrStep3')].map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {state === 'ready' && <p className="mb-3 flex items-center gap-2 text-xs text-hint"><span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />{t('login.waiting')}</p>}
      {qr?.link && state === 'ready' && (
        <div className="mt-auto">
          <a href={qr.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 py-2.5 font-semibold text-white">
            ✈️ {t('login.openTelegram')}
          </a>
          <p className="mt-1 text-center text-xs text-hint">{t('login.openTelegramHint')}</p>
        </div>
      )}
    </Card>
  );
}

/** Telefon raqam: botga ulangan raqamga Telegram orqali 6 xonali kod keladi. */
function PhonePanel({ bot, onToken }: { bot: string | null; onToken: (token: string) => void }) {
  const t = useT();
  const [phone, setPhone] = useState('+998 ');
  const [req, setReq] = useState<PhoneLogin | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<PhoneLogin>('/web-login/phone', { body: { phone } });
      setReq(r);
      setCode('');
      setCooldown(60);
      window.setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (!req || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/web-login/phone/verify', { body: { id: req.id, secret: req.secret, code: value } });
      onToken(r.token);
    } catch (e) {
      setError(errorText(e));
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const botName = botFromLink(req?.linkBot) ?? bot ?? 'bot';
  return (
    <Card className="flex h-full flex-col">
      <h2 className="mb-1 text-lg font-bold">📱 {t('login.phoneTitle')}</h2>
      <p className="mb-4 text-sm text-hint">{t('login.phoneHint', { bot: botName })}</p>
      {!req ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className={clsx(inputCls, 'text-lg tracking-wide')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s()-]/g, ''))}
            placeholder="+998 90 123 45 67"
          />
          <Button type="submit" size="lg" className="mt-3" loading={busy} disabled={phone.replace(/\D/g, '').length < 9}>
            {t('login.sendCode')}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="mb-3 rounded-xl bg-soft p-3 text-sm">{t('login.codeSent', { phone: req.phone, bot: botName })}</p>
          <input
            ref={codeRef}
            className={clsx(inputCls, 'text-center text-2xl font-bold tracking-[0.5em]')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            aria-label={t('login.code')}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              if (v.length === 6) void verify(v);
            }}
          />
          <Button type="submit" size="lg" className="mt-3" loading={busy} disabled={code.length !== 6}>
            {t('login.signIn')}
          </Button>
          <div className="mt-3 flex items-center justify-between text-sm">
            <button type="button" className="text-link" onClick={() => setReq(null)}>
              ← {t('login.changePhone')}
            </button>
            <button type="button" className="text-link disabled:text-hint" disabled={cooldown > 0 || busy} onClick={() => void send()}>
              {cooldown > 0 ? t('login.resendIn', { s: cooldown }) : t('login.resend')}
            </button>
          </div>
          <details className="mt-4 rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{t('login.noCode')}</summary>
            <p className="mt-2 text-hint">{t('login.noCodeText', { bot: botName })}</p>
            {req.linkBot && (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <QrImage value={req.linkBot} size={120} />
                <div className="flex flex-col gap-1">
                  <a href={req.linkBot} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#229ED9] px-3 py-2 text-center font-semibold text-white">
                    ✈️ {t('login.openBot')}
                  </a>
                  <span className="text-xs text-hint">{t('login.scanToOpenBot')}</span>
                </div>
              </div>
            )}
          </details>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </Card>
  );
}

/** Telegram'dan tashqarida (kompyuter yoki telefon brauzeri): QR kod yoki telefon raqam bilan kirish; lokal — dev login. */
export function LoginPage() {
  const t = useT();
  const loginWith = useAuth((s) => s.loginWith);
  const acceptToken = useAuth((s) => s.acceptToken);
  const error = useAuth((s) => s.error);
  const status = useAuth((s) => s.status);
  const devLogin = import.meta.env.VITE_DEV_LOGIN === 'true';
  const [tab, setTab] = useState<'qr' | 'phone'>('qr');
  const [bot, setBot] = useState<string | null>((import.meta.env.VITE_BOT_USERNAME as string | undefined) ?? null);
  const onToken = useCallback((token: string) => void acceptToken(token), [acceptToken]);
  const onBot = useCallback((b: string | null) => b && setBot(b), []);

  const devUsers = [
    { tgId: 100000004, firstName: 'Aziz', label: "O'quvchi" },
    { tgId: 100000003, firstName: 'Nodira', label: "O'qituvchi" },
    { tgId: 100000002, firstName: 'Operator', label: 'Operator' },
    { tgId: 100000001, firstName: 'Admin', label: 'Super admin' },
  ];

  return (
    <div className="min-h-screen px-4 py-8 lg:py-16">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center gap-4 lg:mb-10">
          <img src="/icon.svg" alt="" className="h-14 w-14 lg:h-16 lg:w-16" />
          <div>
            <h1 className="text-2xl font-bold lg:text-3xl">{t('login.title')}</h1>
            <p className="text-hint">{t('login.subtitle')}</p>
          </div>
        </header>

        <Segmented
          className="mb-3 lg:hidden"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'qr', label: `🔳 ${t('login.tabQr')}` },
            { value: 'phone', label: `📱 ${t('login.tabPhone')}` },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={clsx(tab !== 'qr' && 'hidden lg:block')}>
            <QrPanel onToken={onToken} onBot={onBot} />
          </div>
          <div className={clsx(tab !== 'phone' && 'hidden lg:block')}>
            <PhonePanel bot={bot} onToken={onToken} />
          </div>
        </div>

        {bot && <p className="mt-6 text-center text-xs text-hint lg:hidden">{t('login.mobileHint', { bot })}</p>}
        {status === 'loading' && (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}

        {devLogin && (
          <Card className="mx-auto mt-6 max-w-md">
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
      </div>
    </div>
  );
}
