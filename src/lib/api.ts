import { useAuth } from '../store/auth';

const RAW = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
/** API origin (masalan https://sat-api.up.railway.app). Bo'sh bo'lsa — shu domen. */
export const API_ORIGIN = RAW.replace(/\/+$/, '').replace(/\/api$/i, '');
export const apiUrl = (path: string) => `${API_ORIGIN}/api${path}`;

export class ApiError extends Error {
  status: number;
  code?: string;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = data.code as string | undefined;
    this.data = data;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = useAuth.getState().token;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, "Server bilan aloqa yo'q. Internetni tekshiring.", { code: 'OFFLINE' });
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && token && data.code !== 'BAD_INIT_DATA') {
    useAuth.getState().expire();
  }
  if (!res.ok) throw new ApiError(res.status, (data.message as string) || `Xatolik (${res.status})`, data);
  return data as T;
}

export const mediaUrl = (u?: string | null) => (u ? (/^https?:/.test(u) ? u : `${API_ORIGIN}${u}`) : undefined);

/** Fayl yuklab olish uchun qisqa muddatli token bilan URL. */
export async function downloadUrl(path: string): Promise<string> {
  const { token } = await api<{ token: string }>('/auth/download-token', { method: 'POST', body: {} });
  return `${apiUrl(path)}${path.includes('?') ? '&' : '?'}dl=${encodeURIComponent(token)}`;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Xatolik yuz berdi';
}
