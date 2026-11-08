import katex from 'katex';
import { memo, useMemo } from 'react';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderText(s: string): string {
  // \$ -> $, **qalin**, yangi qator -> <br>
  return escapeHtml(s.replace(/\\\$/g, '$'))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function renderTex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' });
  } catch {
    return escapeHtml(tex);
  }
}

/** $...$ va $$...$$ formulalarni KaTeX bilan, qolganini matn sifatida (generator bilan bir xil qoida). */
export function renderMath(src: string): string {
  let out = '';
  let i = 0;
  let mode: 'text' | 'inline' | 'display' = 'text';
  let buf = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      buf += ch + src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '$') {
      const dbl = src[i + 1] === '$';
      if (mode === 'text') {
        out += renderText(buf);
        buf = '';
        mode = dbl ? 'display' : 'inline';
        i += dbl ? 2 : 1;
        continue;
      }
      if (mode === 'display' && dbl) {
        out += renderTex(buf, true);
        buf = '';
        mode = 'text';
        i += 2;
        continue;
      }
      if (mode === 'inline') {
        out += renderTex(buf, false);
        buf = '';
        mode = 'text';
        i += 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (mode === 'text') out += renderText(buf);
  else out += renderText((mode === 'display' ? '$$' : '$') + buf);
  return out;
}

export const MathText = memo(function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMath(text ?? ''), [text]);
  return <div className={`math-text ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

export function MathInline({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMath(text ?? ''), [text]);
  return <span className={`math-text ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
