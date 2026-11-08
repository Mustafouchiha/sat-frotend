/** Telegram WebApp (telegram-web-app.js) ustidan yengil typed qobiq. */

interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  isVisible?: boolean;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string; language_code?: string } };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
  downloadFile?: (params: { url: string; file_name: string }, cb?: (ok: boolean) => void) => void;
  showConfirm?: (msg: string, cb: (ok: boolean) => void) => void;
  isVersionAtLeast?: (v: string) => boolean;
  BackButton: TgButton;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

export const tg: TgWebApp | undefined = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

/** Mini App haqiqatan Telegram ichida ochilganmi (initData mavjud). */
export const isTelegram = !!tg?.initData;

export function initTelegram(): void {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (isTelegram) {
      document.documentElement.classList.add('in-telegram');
      tg.disableVerticalSwipes?.();
      tg.setHeaderColor?.('secondary_bg_color');
    }
  } catch {
    /* eski klientlar */
  }
}

export function haptic(kind: 'success' | 'error' | 'warning' | 'light' | 'select'): void {
  const h = tg?.HapticFeedback;
  if (!h || !isTelegram) return;
  try {
    if (kind === 'light') h.impactOccurred('light');
    else if (kind === 'select') h.selectionChanged();
    else h.notificationOccurred(kind);
  } catch {
    /* ignore */
  }
}

/** start_param (t.me/bot/app?startapp=...) yoki URL'dagi parametrlar. */
export function launchParams(): { start?: string; query: URLSearchParams } {
  const query = new URLSearchParams(window.location.search);
  const start = tg?.initDataUnsafe?.start_param ?? query.get('tgWebAppStartParam') ?? undefined;
  return { start: start || undefined, query };
}

export function openExternal(url: string): void {
  if (isTelegram && tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function shareToTelegram(url: string, text: string): void {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (isTelegram && tg?.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, '_blank', 'noopener');
}

export function downloadFile(url: string, fileName: string): void {
  if (isTelegram && tg?.downloadFile && tg.isVersionAtLeast?.('8.0')) {
    tg.downloadFile({ url, file_name: fileName });
    return;
  }
  openExternal(url);
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (isTelegram && tg?.showConfirm && tg.isVersionAtLeast?.('6.2')) tg.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}

export function setClosingConfirmation(on: boolean): void {
  if (!isTelegram) return;
  try {
    if (on) tg?.enableClosingConfirmation?.();
    else tg?.disableClosingConfirmation?.();
  } catch {
    /* ignore */
  }
}
