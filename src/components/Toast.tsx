import { create } from 'zustand';

interface ToastItem {
  id: number;
  text: string;
  icon?: string;
  kind: 'info' | 'success' | 'error';
}

interface ToastState {
  items: ToastItem[];
  push: (text: string, opts?: { icon?: string; kind?: ToastItem['kind'] }) => void;
}

let nextId = 1;

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, opts) => {
    const id = nextId++;
    set((s) => ({ items: [...s.items, { id, text, icon: opts?.icon, kind: opts?.kind ?? 'info' }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3500);
  },
}));

export const toast = (text: string, opts?: { icon?: string; kind?: ToastItem['kind'] }) => useToast.getState().push(text, opts);

export function Toaster() {
  const items = useToast((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" style={{ paddingTop: 'var(--safe-top)' }}>
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg animate-pop ${
            t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-green-600 text-white' : 'bg-card text-text'
          }`}
        >
          {t.icon && <span className="text-lg">{t.icon}</span>}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
