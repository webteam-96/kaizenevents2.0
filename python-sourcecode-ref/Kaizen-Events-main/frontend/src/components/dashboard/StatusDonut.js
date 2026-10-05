import React, { useState, useMemo, useId } from 'react';
import { AlertCircle, PieChart as PieIcon, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Brand-token slice colors (theme-adaptive → legible on light AND dark cards):
// Paid=navy/blue, Pending=gold, Failed=red, Other=grey. No off-brand hues.
const COLORS = {
  paid: 'hsl(var(--chart-1))',
  pending: 'hsl(var(--chart-2))',
  failed: 'hsl(var(--chart-3))',
  other: 'hsl(var(--muted-foreground))',
};

// ── 3D pie geometry (tilted extruded cylinder) ──────────────────────────────
const VW = 240, VH = 172;
const CX = 120, CY = 76, RX = 84, RY = 47, DEPTH = 22;
const TAU = Math.PI * 2;
const pt = (r, ry, a) => [CX + r * Math.cos(a), CY + ry * Math.sin(a)];
const f = (n) => n.toFixed(2);

/**
 * By Payment Status as a claymorphic 3D pie. Each slice is an extruded cylinder
 * segment (top face + front-facing side wall). Hovering a slice pops it outward
 * along its radius and grows it (and highlights its legend row). Colors are brand
 * tokens so it reads on both light and dark surfaces.
 *
 * counts: { paid, pending, failed, other }
 */
const StatusDonut = ({ counts = { paid: 0, pending: 0, failed: 0, other: 0 }, loading = false, error = null, onRetry }) => {
  const [hover, setHover] = useState(null);
  const uid = useId().replace(/[:]/g, '');
  const total = (counts.paid || 0) + (counts.pending || 0) + (counts.failed || 0) + (counts.other || 0);

  const legend = [
    { key: 'paid', label: 'Paid', value: counts.paid || 0, color: COLORS.paid },
    { key: 'pending', label: 'Pending', value: counts.pending || 0, color: COLORS.pending },
    { key: 'failed', label: 'Failed', value: counts.failed || 0, color: COLORS.failed },
    ...(counts.other ? [{ key: 'other', label: 'Other', value: counts.other, color: COLORS.other }] : []),
  ];

  const slices = useMemo(() => {
    const src = legend.filter((s) => s.value > 0);
    let cur = -Math.PI / 2; // start at top, go clockwise
    return src.map((s) => {
      const frac = s.value / (total || 1);
      const a1 = cur, a2 = cur + frac * TAU;
      cur = a2;
      const mid = (a1 + a2) / 2;
      // Front-facing sub-arc (sin θ > 0 → lower half → [0, π]) gets the side wall.
      const b1 = Math.max(a1, 0), b2 = Math.min(a2, Math.PI);
      let side = null;
      if (b2 > b1 + 1e-4) {
        const [p1x, p1y] = pt(RX, RY, b1);
        const [p2x, p2y] = pt(RX, RY, b2);
        side = `M${f(p1x)},${f(p1y)} A${RX},${RY} 0 0 1 ${f(p2x)},${f(p2y)} `
             + `L${f(p2x)},${f(p2y + DEPTH)} A${RX},${RY} 0 0 0 ${f(p1x)},${f(p1y + DEPTH)} Z`;
      }
      const [ax, ay] = pt(RX, RY, a1);
      const [bx, by] = pt(RX, RY, a2);
      const largeArc = a2 - a1 > Math.PI ? 1 : 0;
      const top = `M${CX},${CY} L${f(ax)},${f(ay)} A${RX},${RY} 0 ${largeArc} 1 ${f(bx)},${f(by)} Z`;
      // Explode direction + centroid for the pop/grow hover transform.
      const ux = RX * Math.cos(mid), uy = RY * Math.sin(mid);
      const len = Math.hypot(ux, uy) || 1;
      const ex = (ux / len) * 13, ey = (uy / len) * 13;
      const gx = CX + RX * 0.5 * Math.cos(mid), gy = CY + RY * 0.5 * Math.sin(mid);
      const [lx, ly] = pt(RX * 0.6, RY * 0.6, mid);
      return { ...s, side, top, ex, ey, gx, gy, lx, ly, pct: Math.round(frac * 100) };
    });
  }, [counts.paid, counts.pending, counts.failed, counts.other, total]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-center" style={{ height: 172 }}>
          <Skeleton className="w-[170px] h-[110px] rounded-2xl" />
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-8 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="text-sm text-foreground font-jakarta">Couldn't load status breakdown</div>
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary rounded-md px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="py-8 flex flex-col items-center text-center gap-2 text-muted-foreground">
        <PieIcon className="w-6 h-6" />
        <div className="text-sm font-jakarta">No payments to break down</div>
        <div className="text-[11px] font-jakarta">Status split appears once registrations come in.</div>
      </div>
    );
  }

  // Draw non-hovered slices first, hovered slice last so it sits on top.
  const order = slices.map((_, i) => i).sort((a, b) => (a === hover ? 1 : 0) - (b === hover ? 1 : 0));

  return (
    <div>
      <div className="relative" style={{ height: 172 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Payment status breakdown">
          <defs>
            <radialGradient id={`psheen-${uid}`} gradientUnits="userSpaceOnUse" cx={CX - 22} cy={CY - 30} r={RX * 1.35}>
              <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
              <stop offset="60%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ground shadow */}
          <ellipse cx={CX} cy={CY + DEPTH + 8} rx={RX * 0.95} ry={RY * 0.42} fill="#000" opacity="0.14" />

          {order.map((idx) => {
            const s = slices[idx];
            const isH = hover === idx;
            const tf = isH
              ? { transformBox: 'view-box', transformOrigin: `${s.gx}px ${s.gy}px`, transform: `translate(${s.ex}px, ${s.ey}px) scale(1.08)`, transition: 'transform .2s cubic-bezier(.22,1,.36,1)' }
              : { transition: 'transform .2s cubic-bezier(.22,1,.36,1)', transform: 'none' };
            return (
              <g key={s.key} style={{ cursor: 'pointer', ...tf }}
                onMouseEnter={() => setHover(idx)} onMouseLeave={() => setHover(null)}>
                {/* side wall (depth) */}
                {s.side && (
                  <>
                    <path d={s.side} fill={s.color} />
                    <path d={s.side} fill="#000" opacity="0.28" />
                  </>
                )}
                {/* top face + unified sheen + slice separators */}
                <path d={s.top} fill={s.color} stroke="hsl(var(--card))" strokeWidth="1.5" strokeLinejoin="round" />
                <path d={s.top} fill={`url(#psheen-${uid})`} stroke="none" />
                {/* percentage label on hover */}
                {isH && s.pct >= 6 && (
                  <text x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="middle"
                    fontSize="13" fontWeight="700" fill="#fff" fontFamily="Manrope, sans-serif"
                    style={{ paintOrder: 'stroke', pointerEvents: 'none' }} stroke="#000" strokeOpacity="0.25" strokeWidth="0.6">
                    {s.pct}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* legend (hover a row to highlight its slice, and vice-versa) */}
      <div className="mt-3 space-y-1.5">
        {slices.map((s, i) => {
          const isH = hover === i;
          return (
            <div key={s.key}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className={`flex items-center justify-between text-xs font-jakarta rounded-md px-1 -mx-1 py-0.5 cursor-default transition-colors ${isH ? 'bg-muted' : ''}`}>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                <span className={isH ? 'text-foreground font-medium' : ''}>{s.label}</span>
              </span>
              <span className="flex items-center gap-2">
                {isH && <span className="text-[10px] text-muted-foreground tabular-nums">{s.pct}%</span>}
                <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusDonut;
