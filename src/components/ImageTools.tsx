import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from '../lib/api';
import { encodeImage, imageFromClipboard, type PickedImage, type Rect } from '../lib/image';

// ───────────── Ctrl+V: bir nechta joy bo'lsa, rasm oxirgi tanlangan (yoki birinchi ko'rinib turgan) joyga tushadi ─────────────

const zones = new Map<string, { el: HTMLElement; onFile: (f: File) => void }>();
let activeZone: string | null = null;
let listening = false;

/** Yopiq <details> ichidagi element ham Chrome'da o'lchamga ega — shuning uchun alohida tekshiriladi. */
function isShown(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest('details:not([open])')) return false;
  const check = (el as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility;
  return check ? check.call(el) : el.getClientRects().length > 0;
}

function onWindowPaste(e: ClipboardEvent) {
  const file = imageFromClipboard(e);
  if (!file) return;
  const visible = [...zones.entries()].filter(([, z]) => isShown(z.el));
  if (!visible.length) return;
  visible.sort(([, a], [, b]) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const target = visible.find(([id]) => id === activeZone) ?? visible[0];
  e.preventDefault();
  target[1].onFile(file);
}

/** Rasm tanlash: bosish (galereya/kamera), sudrab tashlash yoki Ctrl+V. */
export function ImageDrop({ onFile, label, hint, compact }: { onFile: (f: File) => void; label?: string; hint?: string; compact?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const handler = useRef(onFile);
  handler.current = onFile;
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    zones.set(id, { el, onFile: (f) => handler.current(f) });
    if (!listening) {
      window.addEventListener('paste', onWindowPaste);
      listening = true;
    }
    return () => {
      zones.delete(id);
      if (activeZone === id) activeZone = null;
    };
  }, [id]);

  return (
    <div
      ref={box}
      role="button"
      tabIndex={0}
      onPointerEnter={() => (activeZone = id)}
      onFocus={() => (activeZone = id)}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={clsx(
        'flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center text-sm transition',
        compact ? 'px-3 py-2' : 'flex-col p-4',
        over ? 'border-accent bg-accent/10' : 'border-line text-hint hover:border-accent',
      )}
    >
      <span className={compact ? 'text-lg' : 'text-2xl'}>📷</span>
      <span className="font-medium text-text">{label ?? 'Rasm tanlash'}</span>
      {!compact && <span className="text-xs">{hint ?? "bosing, shu yerga tashlang yoki Ctrl+V bilan joylang"}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

/** Rasm ustida to'rtburchak chizib, kerakli qismni belgilash (sichqoncha yoki barmoq bilan). */
export function CropArea({ image, rect, onChange, maxHeight = 360 }: { image: PickedImage; rect: Rect | null; onChange: (r: Rect | null) => void; maxHeight?: number }) {
  const { url, width, height } = image;
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef<Rect | null>(rect);

  const point = (e: ReactPointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * width,
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) * height,
    };
  };

  return (
    <div
      ref={box}
      className="relative mx-auto cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-line"
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${Math.round((maxHeight * width) / height)}px)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = point(e);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const p = point(e);
        last.current = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) };
        onChange(last.current);
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        // Tasodifiy bosish — belgilash bekor
        if (last.current && (last.current.width < 8 || last.current.height < 8)) {
          last.current = null;
          onChange(null);
        }
      }}
    >
      <img src={url} alt="" draggable={false} className="pointer-events-none block h-full w-full" />
      {rect && (
        <div
          className="pointer-events-none absolute border-2 border-accent"
          style={{
            left: pct(rect.x / width),
            top: pct(rect.y / height),
            width: pct(rect.width / width),
            height: pct(rect.height / height),
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />
      )}
    </div>
  );
}

/** Shablon rasmini (yoki uning belgilangan qismini) siqib, serverga yuklaydi. */
export async function uploadTemplateImage(image: PickedImage, crop: Rect | null): Promise<string> {
  const enc = encodeImage(image, { maxEdge: 1600, maxBytes: 1_500_000, crop });
  const m = await api<{ id: string }>('/media', { body: { mime: enc.mime, data: enc.data } });
  return m.id;
}
