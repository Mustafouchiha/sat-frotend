import clsx from 'clsx';
import { useState } from 'react';
import { api, errorText } from '../lib/api';
import { useT } from '../lib/i18n';
import { canRequestContact, canScanQr, confirmDialog, haptic, isTelegram, openTelegramLink, requestContact, scanQr } from '../lib/telegram';
import { useAuth } from '../store/auth';
import { toast } from './Toast';
import { Button, Card } from './ui';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Profil → «Kompyuterdan kirish»: telefondagi Telegram'ning QR skaneri bilan kompyuterdagi QR'ni
 * skanerlab tasdiqlash (bot chatiga o'tmasdan) va telefon raqamni bir bosishda ulash.
 */
export function WebAccessCard() {
  const t = useT();
  const user = useAuth((s) => s.user)!;
  const refresh = useAuth((s) => s.refresh);
  const config = useAuth((s) => s.config);
  const bot = config.botUsername;
  const title = config.botTitle ?? bot ?? 'bot';
  const [busy, setBusy] = useState<'scan' | 'phone' | null>(null);

  const scan = async () => {
    const data = await scanQr(t('web.scanText'));
    if (!data) return;
    const id = /login_([A-Za-z0-9_-]{16,40})/.exec(data)?.[1];
    if (!id) {
      haptic('error');
      toast(t('web.notLoginQr'), { kind: 'error' });
      return;
    }
    setBusy('scan');
    try {
      const info = await api<{ device: string }>('/web-login/peek', { body: { id } });
      if (!(await confirmDialog(t('web.confirm', { device: info.device })))) return;
      await api('/web-login/approve', { body: { id } });
      haptic('success');
      toast(t('web.approved'), { icon: '💻', kind: 'success' });
    } catch (e) {
      haptic('error');
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const linkPhone = async () => {
    if (!canRequestContact) {
      // Eski Telegram yoki brauzer: bot chatida «📱 Raqamni ulashish» tugmasi chiqadi
      if (bot) openTelegramLink(`https://t.me/${bot}?start=phone`);
      return;
    }
    setBusy('phone');
    try {
      if (!(await requestContact())) return;
      // Telegram raqamni botga yuboradi, bot uni profilga ulaydi — bir necha soniyada
      for (const ms of [1200, 2000, 3000, 4000]) {
        await sleep(ms);
        await refresh();
        if (useAuth.getState().user?.phone) {
          haptic('success');
          toast(t('web.phoneLinked'), { icon: '📱', kind: 'success' });
          break;
        }
      }
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mt-3">
      <div className="mb-1 font-semibold">💻 {t('profile.webTitle')}</div>
      {/* Skaner faqat Telegram ichida kerak: kompyuterdagi brauzerda foydalanuvchi allaqachon kirgan */}
      {isTelegram && <p className="mb-3 text-sm text-hint">{t('web.text', { url: window.location.host })}</p>}
      {canScanQr ? (
        <Button size="lg" loading={busy === 'scan'} onClick={() => void scan()}>
          📷 {t('web.scan')}
        </Button>
      ) : (
        isTelegram && <p className="rounded-xl bg-soft p-2 text-xs text-hint">{t('web.scanPhoneOnly')}</p>
      )}
      <div className={clsx('flex items-center justify-between gap-2 text-sm', isTelegram && 'mt-4 border-t border-line pt-3')}>
        <span>{t('profile.phoneLinked')}</span>
        <b className="tabular-nums">{user.phone ?? '—'}</b>
      </div>
      {(canRequestContact || bot) && (
        <Button variant="secondary" className="mt-2 w-full" loading={busy === 'phone'} onClick={() => void linkPhone()}>
          {user.phone ? t('profile.relinkPhone') : t('profile.linkPhone')}
        </Button>
      )}
      <p className="mt-2 text-xs text-hint">{t('web.codeChat', { title, bot: bot ?? 'bot' })}</p>
    </Card>
  );
}
