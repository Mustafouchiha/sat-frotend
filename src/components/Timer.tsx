import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { fmtTime } from '../lib/format';

/**
 * Server vaqti bo'yicha taymer: mijoz soatini o'zgartirib aldab bo'lmaydi
 * (offset = serverNow - Date.now() so'rov paytida hisoblanadi).
 */
export function useCountdown(deadlineAt: string | null | undefined, serverNow?: string, onExpire?: () => void) {
  const offset = useRef(0);
  const [left, setLeft] = useState<number | null>(null);
  const fired = useRef(false);
  const cb = useRef(onExpire);
  cb.current = onExpire;

  useEffect(() => {
    if (serverNow) offset.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  useEffect(() => {
    fired.current = false;
    if (!deadlineAt) {
      setLeft(null);
      return;
    }
    const end = new Date(deadlineAt).getTime();
    const tick = () => {
      const ms = end - (Date.now() + offset.current);
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        cb.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  return left;
}

export function TimerPill({ ms, hidden, onToggle, warnAt = 5 * 60_000 }: { ms: number | null; hidden?: boolean; onToggle?: () => void; warnAt?: number }) {
  if (ms === null) return null;
  const warn = ms <= warnAt;
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'rounded-full px-3 py-1 font-mono text-sm font-bold tabular-nums transition',
        warn ? 'bg-red-500/15 text-red-500' : 'bg-soft text-text',
        warn && ms <= 60_000 && 'animate-pulse',
      )}
    >
      {hidden ? '⏱ ••:••' : `⏱ ${fmtTime(ms)}`}
    </button>
  );
}
