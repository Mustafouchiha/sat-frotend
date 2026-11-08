import { useEffect, useRef, useState } from 'react';

// ───────── Oddiy ilmiy kalkulyator (Desmos kaliti bo'lmasa) — eval ishlatilmaydi ─────────

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: '('; v: '(' } | { t: ')'; v: ')' };

const FNS = ['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'];
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'neg': 4 };

function tokenize(s: string, deg: boolean): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const src = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      let j = i;
      while (j < src.length && /[a-z]/i.test(src[j])) j++;
      const w = src.slice(i, j).toLowerCase();
      if (w === 'pi') out.push({ t: 'num', v: Math.PI });
      else if (w === 'e') out.push({ t: 'num', v: Math.E });
      else if (FNS.includes(w)) out.push({ t: 'fn', v: w });
      else throw new Error('?');
      i = j;
      continue;
    }
    if ('+-*/^'.includes(c)) {
      const prev = out[out.length - 1];
      const unary = c === '-' && (!prev || prev.t === 'op' || prev.t === '(' || prev.t === 'fn');
      out.push({ t: 'op', v: unary ? 'neg' : c });
      i++;
      continue;
    }
    if (c === '(') out.push({ t: '(', v: '(' });
    else if (c === ')') out.push({ t: ')', v: ')' });
    else throw new Error('?');
    i++;
  }
  void deg;
  return out;
}

export function evaluateExpr(s: string, deg = true): number {
  const toks = tokenize(s, deg);
  const output: Tok[] = [];
  const stack: Tok[] = [];
  for (const tk of toks) {
    if (tk.t === 'num') output.push(tk);
    else if (tk.t === 'fn') stack.push(tk);
    else if (tk.t === 'op') {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t === 'fn') {
          output.push(stack.pop()!);
          continue;
        }
        if (top.t !== 'op') break;
        const right = tk.v === '^' || tk.v === 'neg';
        if (PREC[top.v] > PREC[tk.v] || (PREC[top.v] === PREC[tk.v] && !right)) output.push(stack.pop()!);
        else break;
      }
      stack.push(tk);
    } else if (tk.t === '(') stack.push(tk);
    else {
      while (stack.length && stack[stack.length - 1].t !== '(') output.push(stack.pop()!);
      stack.pop();
      if (stack.length && stack[stack.length - 1].t === 'fn') output.push(stack.pop()!);
    }
  }
  while (stack.length) output.push(stack.pop()!);
  const st: number[] = [];
  const toRad = (x: number) => (deg ? (x * Math.PI) / 180 : x);
  for (const tk of output) {
    if (tk.t === 'num') st.push(tk.v);
    else if (tk.t === 'fn') {
      const a = st.pop()!;
      const r = { sqrt: Math.sqrt(a), sin: Math.sin(toRad(a)), cos: Math.cos(toRad(a)), tan: Math.tan(toRad(a)), log: Math.log10(a), ln: Math.log(a), abs: Math.abs(a) }[tk.v];
      st.push(r ?? NaN);
    } else if (tk.t === 'op') {
      if (tk.v === 'neg') {
        st.push(-(st.pop() ?? NaN));
        continue;
      }
      const b = st.pop()!;
      const a = st.pop()!;
      st.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b : tk.v === '/' ? a / b : a ** b);
    }
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) throw new Error('Xato');
  return parseFloat(st[0].toPrecision(12));
}

function ScientificCalculator() {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string>('');
  const [deg, setDeg] = useState(true);
  const keys = ['7', '8', '9', '÷', 'sqrt(', '4', '5', '6', '×', '^', '1', '2', '3', '-', '(', '0', '.', 'π', '+', ')'];
  const fns = ['sin(', 'cos(', 'tan(', 'log(', 'ln(', 'abs('];
  const calc = () => {
    try {
      setResult(String(evaluateExpr(expr, deg)));
    } catch {
      setResult('Xato');
    }
  };
  return (
    <div>
      <div className="mb-2 rounded-xl bg-soft p-3 text-right">
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && calc()}
          className="w-full bg-transparent text-right font-mono text-lg outline-none"
          placeholder="0"
        />
        <div className="min-h-[28px] font-mono text-2xl font-bold">{result && `= ${result}`}</div>
      </div>
      <div className="mb-2 grid grid-cols-6 gap-1.5">
        {fns.map((f) => (
          <button key={f} onClick={() => setExpr((s) => s + f)} className="rounded-lg bg-soft py-2 text-xs font-semibold">
            {f.replace('(', '')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {keys.map((k) => (
          <button key={k} onClick={() => setExpr((s) => s + k)} className="rounded-lg bg-soft py-3 text-lg font-semibold">
            {k === 'sqrt(' ? '√' : k}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        <button onClick={() => setDeg((d) => !d)} className="rounded-lg bg-soft py-3 text-sm font-semibold">
          {deg ? 'DEG' : 'RAD'}
        </button>
        <button onClick={() => setExpr((s) => s.slice(0, -1))} className="rounded-lg bg-soft py-3 font-semibold">
          ⌫
        </button>
        <button onClick={() => (setExpr(''), setResult(''))} className="rounded-lg bg-soft py-3 font-semibold">
          C
        </button>
        <button onClick={calc} className="rounded-lg bg-accent py-3 text-lg font-bold text-accent-text">
          =
        </button>
      </div>
    </div>
  );
}

// ───────── Desmos (API kalit bo'lsa) ─────────

declare global {
  interface Window {
    Desmos?: { GraphingCalculator: (el: HTMLElement, opts?: Record<string, unknown>) => { destroy(): void } };
  }
}

let desmosLoading: Promise<void> | null = null;
function loadDesmos(key: string): Promise<void> {
  if (window.Desmos) return Promise.resolve();
  desmosLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(key)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Desmos yuklanmadi'));
    document.head.appendChild(s);
  });
  return desmosLoading;
}

function DesmosCalculator({ apiKey, onFail }: { apiKey: string; onFail: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let calc: { destroy(): void } | null = null;
    loadDesmos(apiKey)
      .then(() => {
        if (ref.current && window.Desmos) calc = window.Desmos.GraphingCalculator(ref.current, { keypad: true, expressions: true, settingsMenu: false });
      })
      .catch(onFail);
    return () => calc?.destroy();
  }, [apiKey, onFail]);
  return <div ref={ref} className="h-[60vh] w-full overflow-hidden rounded-xl" />;
}

export function Calculator({ desmosKey }: { desmosKey?: string | null }) {
  const [fallback, setFallback] = useState(!desmosKey);
  if (desmosKey && !fallback) return <DesmosCalculator apiKey={desmosKey} onFail={() => setFallback(true)} />;
  return <ScientificCalculator />;
}
