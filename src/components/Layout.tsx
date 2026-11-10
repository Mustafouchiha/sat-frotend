import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { isTelegram, tg } from '../lib/telegram';
import { useTheme, type ThemeMode } from '../lib/theme';
import { changeTheme } from '../lib/themeSync';
import { hasRole, useAuth } from '../store/auth';
import { Avatar } from './ui';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };

const TAB_ROOTS = ['/', '/practice', '/tests', '/leaderboard', '/profile', '/teacher', '/admin'];

/** Telegram BackButton: asosiy tablardan tashqari sahifalarda ko'rinadi. */
export function useTelegramBack(override?: () => void) {
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    const app = tg;
    if (!isTelegram || !app) return;
    const isRoot = TAB_ROOTS.includes(loc.pathname);
    const handler = override ?? (() => nav(-1));
    if (isRoot && !override) {
      app.BackButton.hide();
      return;
    }
    app.BackButton.show();
    app.BackButton.onClick(handler);
    return () => {
      app.BackButton.offClick(handler);
    };
  }, [loc.pathname, nav, override]);
}

export function Page({ title, children, actions, back, wide }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; back?: boolean; wide?: boolean }) {
  const nav = useNavigate();
  useTelegramBack();
  return (
    <div
      className={clsx('mx-auto px-4 pb-28 pt-3 lg:px-8 lg:pb-12', wide ? 'max-w-5xl lg:max-w-6xl' : 'max-w-2xl lg:max-w-3xl')}
      style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {back && !isTelegram && (
              <button onClick={() => nav(-1)} className="rounded-full bg-soft px-2.5 py-1 text-hint">
                ←
              </button>
            )}
            {title && <h1 className="truncate text-xl font-bold">{title}</h1>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/** Katta ekranda (kompyuter) pastki menyu o'rniga chap tomondagi menyu. */
export function SideNav() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const theme = useTheme((s) => s.theme);
  const staff = hasRole(user, 'OPERATOR', 'TEACHER');
  const items = [
    { to: '/', icon: '🏠', label: t('nav.home') },
    { to: '/practice', icon: '🎯', label: t('nav.practice') },
    { to: '/tests', icon: '📝', label: t('nav.tests') },
    { to: '/leaderboard', icon: '🏆', label: t('nav.rating') },
    ...(staff ? [{ to: hasRole(user, 'OPERATOR') ? '/admin' : '/teacher', icon: '🧭', label: t('nav.panel') }] : []),
    { to: '/profile', icon: '👤', label: t('nav.profile') },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-card px-3 py-5 lg:flex">
      <div className="mb-6 flex items-center justify-between gap-2 px-3">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-bold">SAT Prep</span>
        </Link>
        {/* Tez almashtirish: avto → yorug' → qorong'i (batafsil ranglar — Profilda) */}
        <button
          onClick={() => changeTheme({ ...theme, mode: NEXT_MODE[theme.mode] })}
          title={{ auto: t('theme.auto'), light: t('theme.light'), dark: t('theme.dark') }[theme.mode]}
          aria-label={t('theme.title')}
          className="rounded-lg px-2 py-1 text-lg hover:bg-soft"
        >
          {{ auto: '🌗', light: '☀️', dark: '🌙' }[theme.mode]}
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) =>
              clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition', isActive ? 'bg-accent/10 text-accent' : 'text-hint hover:bg-soft hover:text-text')
            }
          >
            <span className="text-xl leading-none">{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
      </nav>
      {user && (
        <div className="mt-auto border-t border-line pt-4">
          <Link to="/profile" className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-soft">
            <Avatar name={user.name} url={user.photoUrl} size={34} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              {user.username && <div className="truncate text-xs text-hint">@{user.username}</div>}
            </div>
          </Link>
          {!isTelegram && (
            <button
              onClick={() => {
                qc.clear();
                logout();
              }}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
            >
              🚪 {t('profile.logout')}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export function BottomNav() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const staff = hasRole(user, 'OPERATOR', 'TEACHER');
  const tabs = [
    { to: '/', icon: '🏠', label: t('nav.home') },
    { to: '/practice', icon: '🎯', label: t('nav.practice') },
    { to: '/tests', icon: '📝', label: t('nav.tests') },
    { to: '/leaderboard', icon: '🏆', label: t('nav.rating') },
    staff
      ? { to: hasRole(user, 'OPERATOR') ? '/admin' : '/teacher', icon: '🧭', label: t('nav.panel') }
      : { to: '/profile', icon: '👤', label: t('nav.profile') },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-accent' : 'text-hint')
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
