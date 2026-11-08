import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { useLang } from '../lib/i18n';
import { store } from '../lib/storage';
import { isTelegram, tg } from '../lib/telegram';
import type { Role, Stats, User } from '../lib/types';

interface MeResponse {
  user: User;
  stats: Stats;
  groups: Array<{ id: string; name: string; role: 'STUDENT' | 'TEACHER' }>;
  config: { botUsername: string | null; desmosKey: string | null };
}

type Status = 'idle' | 'loading' | 'ready' | 'need-login' | 'error';

interface AuthState {
  token: string | null;
  user: User | null;
  groups: MeResponse['groups'];
  config: MeResponse['config'];
  status: Status;
  error?: string;
  startParam?: string | null;
  init: () => Promise<void>;
  loginWith: (path: '/auth/widget' | '/auth/dev', body: unknown) => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  expire: () => void;
  logout: () => void;
}

const TOKEN_KEY = 'sat_token';

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  groups: [],
  config: { botUsername: null, desmosKey: null },
  status: 'idle',

  init: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: undefined });
    try {
      if (isTelegram && tg) {
        // Telegram ichida: har safar initData bilan yangi token (HMAC serverda tekshiriladi)
        const r = await fetchAuth('/auth/telegram', { initData: tg.initData });
        set({ token: r.token, startParam: r.startParam ?? null });
        store.set(TOKEN_KEY, r.token);
      } else {
        const saved = store.get<string | null>(TOKEN_KEY, null);
        if (!saved) return set({ status: 'need-login' });
        set({ token: saved });
      }
      await get().refresh();
      set({ status: 'ready' });
    } catch (e) {
      if (!isTelegram) {
        store.remove(TOKEN_KEY);
        return set({ status: 'need-login', token: null });
      }
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  loginWith: async (path, body) => {
    set({ status: 'loading', error: undefined });
    try {
      const r = await fetchAuth(path, body);
      store.set(TOKEN_KEY, r.token);
      set({ token: r.token });
      await get().refresh();
      set({ status: 'ready' });
    } catch (e) {
      set({ status: 'need-login', error: e instanceof Error ? e.message : String(e) });
    }
  },

  refresh: async () => {
    const me = await api<MeResponse>('/me');
    set({ user: me.user, groups: me.groups, config: me.config });
    const lang = useLang.getState();
    if (me.user.lang && me.user.lang !== lang.lang) lang.setLang(me.user.lang);
  },

  setUser: (u) => set({ user: u }),

  expire: () => {
    store.remove(TOKEN_KEY);
    if (isTelegram) {
      set({ token: null, status: 'idle' });
      void get().init();
    } else set({ token: null, user: null, status: 'need-login' });
  },

  logout: () => {
    store.remove(TOKEN_KEY);
    set({ token: null, user: null, status: 'need-login' });
  },
}));

async function fetchAuth(path: string, body: unknown): Promise<{ token: string; startParam?: string | null }> {
  // auth endpointlari tokensiz chaqiriladi
  const { apiUrl } = await import('../lib/api');
  const res = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, (data.message as string) || 'Kirish xatosi', data);
  return data as { token: string; startParam?: string | null };
}

export function hasRole(user: User | null, ...roles: Role[]): boolean {
  if (!user) return false;
  return user.roles.includes('SUPER_ADMIN') || roles.some((r) => user.roles.includes(r));
}
