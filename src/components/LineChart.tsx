import { useMemo } from 'react';

/** Yengil SVG chiziqli grafik (reyting / ball dinamikasi). */
export function LineChart({
  points,
  height = 140,
  color = 'var(--accent)',
  showLabels = true,
}: {
  points: Array<{ x: string; y: number }>;
  height?: number;
  color?: string;
  showLabels?: boolean;
}) {
  const W = 320;
  const H = height;
  const pad = { l: 34, r: 8, t: 10, b: showLabels ? 20 : 8 };
  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const ys = points.map((p) => p.y);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (max - min < 20) {
      min -= 10;
      max += 10;
    }
    const sx = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
    const sy = (y: number) => pad.t + (1 - (y - min) / (max - min)) * (H - pad.t - pad.b);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const area = `${d} L${sx(points.length - 1).toFixed(1)},${H - pad.b} L${sx(0).toFixed(1)},${H - pad.b} Z`;
    const ticks = [min, (min + max) / 2, max].map((v) => ({ v: Math.round(v), y: sy(v) }));
    return { d, area, ticks, sx, sy };
  }, [points, H, pad.b, pad.l, pad.r, pad.t]);

  if (!geo) return <div className="py-8 text-center text-sm text-hint">—</div>;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {geo.ticks.map((t) => (
        <g key={t.v}>
          <line x1={pad.l} x2={W - pad.r} y1={t.y} y2={t.y} stroke="var(--line)" strokeDasharray="3 3" />
          <text x={pad.l - 4} y={t.y + 3} textAnchor="end" fontSize="9" fill="var(--hint)">
            {t.v}
          </text>
        </g>
      ))}
      <path d={geo.area} fill={color} opacity={0.12} />
      <path d={geo.d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={geo.sx(points.length - 1)} cy={geo.sy(last.y)} r={3.5} fill={color} />
      {showLabels && points.length > 1 && (
        <>
          <text x={pad.l} y={H - 4} fontSize="9" fill="var(--hint)">
            {points[0].x}
          </text>
          <text x={W - pad.r} y={H - 4} fontSize="9" fill="var(--hint)" textAnchor="end">
            {last.x}
          </text>
        </>
      )}
    </svg>
  );
}
