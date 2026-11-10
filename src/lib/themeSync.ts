import { toast } from '../components/Toast';
import { useAuth } from '../store/auth';
import { api, errorText } from './api';
import { isDefaultTheme, normalizeTheme, useTheme, type ThemePrefs } from './theme';
import type { User } from './types';

let timer: number | undefined;

/**
 * Mavzuni darhol qo'llaydi va profilga saqlaydi (telefon va kompyuterda bir xil ko'rinadi).
 * Rang tanlagichni sudraganda har harakatda so'rov ketmasligi uchun 0.7 s kutiladi.
 */
export function changeTheme(t: ThemePrefs): void {
  useTheme.getState().setTheme(t, { dirty: true });
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), 700);
}

async function flush(): Promise<void> {
  timer = undefined;
  const theme = useTheme.getState().theme;
  if (!useAuth.getState().token) {
    useTheme.getState().markSaved();
    return;
  }
  try {
    const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { theme: isDefaultTheme(theme) ? null : normalizeTheme(theme) } });
    useAuth.getState().setUser(r.user);
    if (timer === undefined) useTheme.getState().markSaved();
  } catch (e) {
    toast(errorText(e), { kind: 'error' });
  }
}
