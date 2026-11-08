import clsx from 'clsx';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { initials } from '../lib/format';

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={clsx('rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', onClick && 'cursor-pointer active:scale-[0.99] transition', className)}
    >
      {children}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5',
        size === 'lg' && 'w-full px-5 py-3.5 text-base',
        variant === 'primary' && 'bg-accent text-accent-text',
        variant === 'secondary' && 'bg-soft text-text',
        variant === 'ghost' && 'text-link',
        variant === 'danger' && 'bg-red-600 text-white',
        variant === 'success' && 'bg-green-600 text-white',
        className,
      )}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', !color && 'bg-soft text-hint', className)}
      style={color ? { background: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={clsx('h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent', className)} />;
}

export function Loading({ text }: { text?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-hint">
      <Spinner />
      <span className="text-sm">{text ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const msg = error instanceof Error ? error.message : String(error ?? t('common.error'));
  return (
    <Card className="text-center">
      <div className="mb-2 text-3xl">⚠️</div>
      <p className="mb-3 text-sm text-hint">{msg}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </Card>
  );
}

export function Empty({ icon = '📭', text }: { icon?: string; text?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-hint">
      <div className="text-4xl">{icon}</div>
      <div className="text-sm">{text ?? t('common.none')}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-soft p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
            value === o.value ? 'bg-card text-text shadow-sm' : 'text-hint',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fadeIn sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-card p-4 pb-safe animate-slideUp sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">{title}</h3>
            <button onClick={onClose} className="rounded-full bg-soft px-2.5 py-1 text-hint">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent/15 font-bold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name) || '?'}
    </div>
  );
}

export function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-soft', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color ?? 'var(--accent)' }} />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between px-1">
      <h2 className="text-sm font-bold uppercase tracking-wide text-hint">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-hint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-hint">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-base outline-none focus:border-accent';

export function StatTile({ label, value, sub, color }: { label: ReactNode; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <div className="text-xs text-hint">{label}</div>
      <div className="mt-0.5 text-xl font-bold" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-hint">{sub}</div>}
    </div>
  );
}
