import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { isTelegram, tg } from '../lib/telegram';
import { hasRole, useAuth } from '../store/auth';

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
    <div className={clsx('mx-auto px-4 pb-28 pt-3', wide ? 'max-w-5xl' : 'max-w-2xl')} style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}>
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
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
