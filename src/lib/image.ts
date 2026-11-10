/** Brauzerda rasmni o'qish, kesish va siqish (canvas) — yuklashdan oldin hajmni kamaytiradi. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickedImage {
  /** Ko'rsatish uchun object URL */
  url: string;
  img: HTMLImageElement;
  width: number;
  height: number;
  /** Asl fayl turi: skrinshot (PNG) bo'lsa PNG saqlanadi — matn aniqroq qoladi */
  mime: string;
}

export interface EncodedImage {
  mime: 'image/png' | 'image/jpeg';
  /** Faqat base64 (data: prefiksiz) */
  data: string;
  width: number;
  height: number;
  bytes: number;
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export async function pickImage(file: Blob): Promise<PickedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Bu rasm fayli emas');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Rasmni o'qib bo'lmadi (HEIC bo'lsa, JPEG yoki PNG ga o'tkazing)");
  }
  return { url, img, width: img.naturalWidth, height: img.naturalHeight, mime: file.type };
}

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

/**
 * Rasmni (yoki uning bir qismini) uzun tomoni maxEdge dan oshmaydigan qilib kodlaydi.
 * Hajm maxBytes dan oshsa, JPEG sifati va o'lcham bosqichma-bosqich kamaytiriladi.
 */
export function encodeImage(src: PickedImage, opts: { maxEdge: number; maxBytes: number; maxPixels?: number; crop?: Rect | null }): EncodedImage {
  const c = clampRect(opts.crop ?? { x: 0, y: 0, width: src.width, height: src.height }, src.width, src.height);
  const preferPng = src.mime === 'image/png' || src.mime === 'image/gif';
  let edge = opts.maxEdge;
  for (let round = 0; round < 6; round++) {
    const byPixels = opts.maxPixels ? Math.sqrt(opts.maxPixels / (c.width * c.height)) : 1;
    const scale = Math.min(1, edge / Math.max(c.width, c.height), byPixels);
    const w = Math.max(1, Math.round(c.width * scale));
    const h = Math.max(1, Math.round(c.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas ishlamayapti');
    // Shaffof PNG qora fonga aylanmasin
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.img, c.x, c.y, c.width, c.height, 0, 0, w, h);
    const candidates: Array<['image/png' | 'image/jpeg', number?]> = preferPng
      ? [['image/png'], ['image/jpeg', 0.92], ['image/jpeg', 0.82]]
      : [['image/jpeg', 0.9], ['image/jpeg', 0.8], ['image/jpeg', 0.7]];
    for (const [mime, q] of candidates) {
      const data = canvas.toDataURL(mime, q).split(',')[1] ?? '';
      if (base64Bytes(data) <= opts.maxBytes) return { mime, data, width: w, height: h, bytes: base64Bytes(data) };
    }
    edge = Math.round(Math.max(w, h) * 0.75);
  }
  throw new Error('Rasmni yetarlicha kichraytirib bo\'lmadi');
}

export function clampRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(w - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(h - 1, Math.round(r.y)));
  return { x, y, width: Math.max(1, Math.min(w - x, Math.round(r.width))), height: Math.max(1, Math.min(h - y, Math.round(r.height))) };
}

/** AI bergan to'rtburchakni biroz kengaytirish — chizma chetlari kesilib qolmasin. */
export function padRect(r: Rect, w: number, h: number, pad = 0.04): Rect {
  const p = Math.round(Math.max(w, h) * pad);
  return clampRect({ x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p }, w, h);
}

/** Clipboard'dan (Ctrl+V / skrinshot) rasm faylini olish. */
export function imageFromClipboard(e: ClipboardEvent): File | null {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}
