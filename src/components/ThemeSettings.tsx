import clsx from 'clsx';
import { useMemo } from 'react';
import { useT } from '../lib/i18n';
import { COLOR_KEYS, contrast, effectiveColors, isDefaultTheme, PRESETS, useTheme, type ColorKey, type ThemeMode, type ThemePrefs } from '../lib/theme';
import { changeTheme } from '../lib/themeSync';
import { Button, Card, Segmented } from './ui';

const LABELS: Record<ColorKey, Parameters<ReturnType<typeof useT>>[0]> = {
  bg: 'theme.bg',
  card: 'theme.card',
  text: 'theme.text',
  line: 'theme.line',
  accent: 'theme.accent',
};

const sameTheme = (a: ThemePrefs, b: ThemePrefs) => a.mode === b.mode && COLOR_KEYS.every((k) => (a[k] ?? '') === (b[k] ?? ''));

/** Profil → «Ko'rinish»: rejim, tayyor ranglar va o'z ranglari (fon, kartalar, yozuv, chiziqlar, asosiy rang). */
export function ThemeSettings() {
  const t = useT();
  const theme = useTheme((s) => s.theme);
  const colors = useMemo(() => effectiveColors(theme), [theme]);
  const ratio = Math.min(contrast(colors.text, colors.bg), contrast(colors.text, colors.card));

  return (
    <Card>
      <Segmented
        value={theme.mode}
        onChange={(mode: ThemeMode) => changeTheme({ ...theme, mode })}
        options={[
          { value: 'auto', label: `🌗 ${t('theme.auto')}` },
          { value: 'light', label: `☀️ ${t('theme.light')}` },
          { value: 'dark', label: `🌙 ${t('theme.dark')}` },
        ]}
      />
      {theme.mode === 'auto' && <p className="mt-2 text-xs text-hint">{t('theme.autoHint')}</p>}

      <div className="mb-2 mt-4 text-sm font-semibold">{t('theme.presets')}</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        <PresetButton label={t('theme.p.default')} theme={{ mode: 'auto' }} active={isDefaultTheme(theme)} />
        {PRESETS.map((p) => (
          <PresetButton key={p.id} label={t(p.name)} theme={p.theme} active={sameTheme(theme, p.theme)} />
        ))}
      </div>

      <div className="mb-2 mt-4 text-sm font-semibold">{t('theme.custom')}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COLOR_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
            <input
              type="color"
              value={colors[k]}
              onChange={(e) => changeTheme({ ...theme, [k]: e.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
              aria-label={t(LABELS[k])}
            />
            <span className="flex-1 text-sm">{t(LABELS[k])}</span>
            <code className="text-xs text-hint">{colors[k]}</code>
            {theme[k] && (
              <button
                type="button"
                title={t('theme.reset')}
                className="rounded-lg px-1.5 text-hint hover:bg-soft"
                onClick={(e) => {
                  e.preventDefault();
                  const next = { ...theme };
                  delete next[k];
                  changeTheme(next);
                }}
              >
                ✕
              </button>
            )}
          </label>
        ))}
      </div>

      {ratio < 3 && (
        <p className="mt-3 rounded-xl bg-orange-500/15 p-2 text-sm text-orange-600">⚠️ {t('theme.lowContrast', { r: ratio.toFixed(1) })}</p>
      )}

      {!isDefaultTheme(theme) && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => changeTheme({ mode: 'auto' })}>
          ↺ {t('theme.reset')}
        </Button>
      )}
    </Card>
  );
}

function PresetButton({ label, theme, active }: { label: string; theme: ThemePrefs; active: boolean }) {
  const c = theme.bg ? (theme as Required<ThemePrefs>) : null;
  return (
    <button
      type="button"
      onClick={() => changeTheme(theme)}
      className={clsx('flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-xs font-medium', active ? 'border-accent' : 'border-line')}
    >
      <span
        className="flex h-10 w-full items-center justify-center gap-1 rounded-lg text-sm font-bold"
        style={c ? { background: c.bg, color: c.text, boxShadow: `inset 0 0 0 1px ${c.line}` } : { background: 'linear-gradient(135deg, #f3f4f8 50%, #0b1020 50%)' }}
      >
        {c ? (
          <>
            Aa <span className="h-3 w-3 rounded-full" style={{ background: c.accent }} />
          </>
        ) : (
          <span className="rounded bg-white/80 px-1 text-[10px] text-slate-700">🌗</span>
        )}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
