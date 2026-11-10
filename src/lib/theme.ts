import { create } from 'zustand';
import type { I18nKey } from './i18n';
import { store } from './storage';
import { isTelegram, tg } from './telegram';

/**
 * Ilova ko'rinishi: avto (Telegram/qurilma mavzusi), yorug' yoki qorong'i rejim
 * va foydalanuvchining o'z ranglari (fon, kartalar, yozuv, chiziqlar, asosiy rang).
 * Ranglar CSS o'zgaruvchilari orqali qo'llanadi — butun ilova (Tailwind ranglari) shulardan foydalanadi.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';
export const COLOR_KEYS = ['bg', 'card', 'text', 'line', 'accent'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemePrefs = { mode: ThemeMode } & Partial<Record<ColorKey, string>>;

export const DEFAULT_THEME: ThemePrefs = { mode: 'auto' };
const STORAGE_KEY = 'sat_theme';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Yorug' va qorong'i rejimning standart ranglari (index.css bilan bir xil) */
export const PALETTES: Record<'light' | 'dark', Record<ColorKey, string>> = {
  light: { bg: '#f3f4f8', card: '#ffffff', text: '#0f172a', line: '#e2e4ea', accent: '#4f46e5' },
  dark: { bg: '#0b1020', card: '#141b2f', text: '#e5e7eb', line: '#283152', accent: '#6366f1' },
};

const HINTS = { light: '#64748b', dark: '#94a3b8' } as const;

export const PRESETS: Array<{ id: string; name: I18nKey; theme: ThemePrefs }> = [
  { id: 'ocean', name: 'theme.p.ocean', theme: { mode: 'light', bg: '#e9f2fb', card: '#ffffff', text: '#0b2540', line: '#cfe0f1', accent: '#0284c7' } },
  { id: 'forest', name: 'theme.p.forest', theme: { mode: 'light', bg: '#edf5ee', card: '#ffffff', text: '#14281b', line: '#d3e6d6', accent: '#15803d' } },
  { id: 'sepia', name: 'theme.p.sepia', theme: { mode: 'light', bg: '#f3ead7', card: '#fbf6ea', text: '#3b2f22', line: '#e0cfae', accent: '#b45309' } },
  { id: 'night', name: 'theme.p.night', theme: { mode: 'dark', bg: '#0f0c1d', card: '#1b1630', text: '#ece9f7', line: '#342c52', accent: '#a78bfa' } },
  { id: 'graphite', name: 'theme.p.graphite', theme: { mode: 'dark', bg: '#111315', card: '#1c1f23', text: '#e8eaed', line: '#30353b', accent: '#22c55e' } },
  { id: 'contrast', name: 'theme.p.contrast', theme: { mode: 'dark', bg: '#000000', card: '#0d0d0d', text: '#ffffff', line: '#6b7280', accent: '#facc15' } },
];

// ───────────── Rang hisob-kitoblari ─────────────

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexOf([r, g, b]: number[]): string {
  return `#${[r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')}`;
}

/** a dan b ga t ulushda aralashtirish */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return hexOf(A.map((x, i) => x + (B[i] - x) * t));
}

/** WCAG nisbiy yorqinlik */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG kontrast nisbati (1…21) */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function normalizeTheme(raw: unknown): ThemePrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mode: ThemeMode = o.mode === 'light' || o.mode === 'dark' ? o.mode : 'auto';
  const out: ThemePrefs = { mode };
  for (const k of COLOR_KEYS) if (typeof o[k] === 'string' && HEX.test(o[k] as string)) out[k] = (o[k] as string).toLowerCase();
  return out;
}

export const isDefaultTheme = (t: ThemePrefs) => t.mode === 'auto' && COLOR_KEYS.every((k) => !t[k]);

const CSS_VARS = ['--bg', '--card', '--text', '--hint', '--accent', '--accent-text', '--link', '--line', '--soft'];

function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** Ekranda hozir qaysi rang ishlatilyapti (rang tanlagichda ko'rsatish uchun). */
export function effectiveColors(t: ThemePrefs): Record<ColorKey, string> {
  const dark = t.mode === 'dark' || (t.mode === 'auto' && (isTelegram ? tg?.colorScheme === 'dark' : systemDark()));
  const base = { ...PALETTES[dark ? 'dark' : 'light'] };
  if (t.mode === 'auto') {
    // Avto rejimda Telegram/brauzer ranglari — CSS'dan o'qiymiz (hex bo'lsa)
    const cs = getComputedStyle(document.documentElement);
    for (const k of COLOR_KEYS) {
      if (k === 'line') continue;
      const v = cs.getPropertyValue(`--${k}`).trim();
      if (HEX.test(v)) base[k] = v.toLowerCase();
    }
  }
  return { ...base, ...Object.fromEntries(COLOR_KEYS.filter((k) => t[k]).map((k) => [k, t[k]!])) } as Record<ColorKey, string>;
}

/** Mavzuni sahifaga qo'llash: inline CSS o'zgaruvchilar Telegram va brauzer mavzusidan ustun turadi. */
export function applyTheme(raw: ThemePrefs | null | undefined): void {
  const t = normalizeTheme(raw);
  const root = document.documentElement;
  for (const v of CSS_VARS) root.style.removeProperty(v);
  root.style.removeProperty('color-scheme');
  root.dataset.theme = t.mode;

  // Avto rejimda faqat foydalanuvchi tanlagan ranglar almashtiriladi, qolgani Telegram/qurilmadan
  const c: Partial<Record<ColorKey, string>> = t.mode === 'auto' ? {} : { ...PALETTES[t.mode] };
  for (const k of COLOR_KEYS) if (t[k]) c[k] = t[k];
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  if (c.bg) set('--bg', c.bg);
  if (c.card) set('--card', c.card);
  if (c.text) set('--text', c.text);
  if (t.text) {
    // Yordamchi ranglar o'z yozuv rangidan: ~65% (izoh), ~8% (yumshoq fon)
    set('--hint', `${t.text}a6`);
    set('--soft', `${t.text}14`);
  } else if (t.mode !== 'auto') set('--hint', HINTS[t.mode]);
  if (t.line) set('--line', t.line);
  else if (t.text) set('--line', `${t.text}2e`);
  if (c.accent) {
    set('--accent', c.accent);
    set('--accent-text', contrast(c.accent, '#ffffff') >= 2.6 ? '#ffffff' : '#111827');
    // Havola fonda ko'rinmasa — ochroq/to'qroq qilinadi
    const bg = c.card ?? c.bg;
    set('--link', bg && contrast(c.accent, bg) < 3 ? mix(c.accent, luminance(bg) < 0.3 ? '#ffffff' : '#000000', 0.4) : c.accent);
  }
  const dark = c.bg ? luminance(c.bg) < 0.3 : t.mode === 'dark';
  if (c.bg || t.mode !== 'auto') set('color-scheme', dark ? 'dark' : 'light');

  // Brauzer manzil satri va Telegram sarlavhasi ham shu rangda
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.card ?? c.bg ?? '#4f46e5');
  if (isTelegram && tg) {
    try {
      if (c.bg) {
        tg.setBackgroundColor?.(c.bg);
        if (tg.isVersionAtLeast?.('6.9')) tg.setHeaderColor?.(c.bg);
      } else {
        tg.setBackgroundColor?.('secondary_bg_color');
        tg.setHeaderColor?.('secondary_bg_color');
      }
    } catch {
      /* eski Telegram versiyalari */
    }
  }
}

interface ThemeState {
  theme: ThemePrefs;
  /** Serverga hali yozilmagan o'zgarish bor (serverdagi eski qiymat ustiga yozmaslik uchun) */
  dirty: boolean;
  setTheme: (t: ThemePrefs, opts?: { dirty?: boolean }) => void;
  markSaved: () => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: normalizeTheme(store.get<unknown>(STORAGE_KEY, null)),
  dirty: false,
  setTheme: (t, opts) => {
    const theme = normalizeTheme(t);
    applyTheme(theme);
    store.set(STORAGE_KEY, theme);
    set({ theme, dirty: opts?.dirty ?? false });
  },
  markSaved: () => set({ dirty: false }),
}));

/** Ilova ochilishida (render'dan oldin) — saqlangan mavzu darhol qo'llanadi, rang "sakramaydi". */
export function initTheme(): void {
  applyTheme(useTheme.getState().theme);
}
