import React, { useRef, useState, useEffect, useMemo, useId } from 'react';
import { AlertCircle, LineChart as LineIcon, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * 3D trend chart (claymorphic). Renders one of three modes:
 *   - 'bars'  : extruded 3D bars for `registrations` (navy brand token)
 *   - 'line'  : 3D gold line with spherical nodes + area fill for `revenue`
 *   - 'auto'  : bars for registrations, and (if any revenue) the gold line too
 * Hovering a column grows the hovered bar / node and shows a tooltip. Colors use
 * the theme-adaptive --chart-* tokens so it reads on both light and dark cards.
 *
 * data: [{ label, registrations, revenue }]
 */
const TrendChart = ({ data = [], height = 260, mode = 'auto', loading = false, error = null, onRetry }) => {
  const wrapRef = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  const uid = useId().replace(/[:]/g, '');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect?.width;
      if (cw) setW(Math.max(240, Math.floor(cw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const H = height;
    const PL = 30, PR = 16, PT = 18, PB = 26;
    const dx = 9, dy = -7;
    const baseY = H - PB;
    const UH = baseY - PT;
    const plotW = Math.max(60, w - PL - PR - dx);
    const N = data.length;
    const slot = plotW / Math.max(1, N);
    const barW = Math.max(10, Math.min(30, slot * 0.5));

    const hasRevenue = data.some((d) => (d.revenue || 0) > 0);
    const showLine = mode === 'line' ? true : (mode === 'bars' ? false : hasRevenue);
    const showBars = mode !== 'line';
    const barFactor = (showBars && showLine) ? 0.64 : 0.86;

    const maxReg = Math.max(1, ...data.map((d) => d.registrations || 0));
    const maxRev = Math.max(1, ...data.map((d) => d.revenue || 0));
    const cx = (i) => PL + slot * (i + 0.5);

    const bars = data.map((d, i) => {
      const x = cx(i) - barW / 2;
      const h = ((d.registrations || 0) / maxReg) * (UH * barFactor);
      return { i, x, topY: baseY - h, h, barW };
    });
    const nodes = showLine ? data.map((d, i) => ({
      i, x: cx(i) + (showBars ? dx * 0.5 : 0),
      y: baseY - ((d.revenue || 0) / maxRev) * (UH * 0.9),
    })) : [];
    const linePath = nodes.map((n, i) => `${i ? 'L' : 'M'}${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    // Area fill only for the standalone revenue (line-only) graph.
    const areaPath = (showLine && !showBars && nodes.length)
      ? `${linePath} L${nodes[nodes.length - 1].x.toFixed(1)},${baseY} L${nodes[0].x.toFixed(1)},${baseY} Z`
      : null;

    const step = Math.ceil(N / 6) || 1;
    const labels = data.map((d, i) => ({ i, x: cx(i), show: i % step === 0 || i === N - 1, text: d.label }));
    const grid = [0.25, 0.5, 0.75].map((ff) => PT + UH * ff);
    const nodeStep = Math.max(1, Math.ceil(N / 16));
    return { H, PL, PR, PT, PB, dx, dy, baseY, barW, bars, nodes, linePath, areaPath, labels, grid, nodeStep, showBars, showLine };
  }, [data, w, height, mode]);

  if (loading) {
    return <div className="w-full" style={{ height }}><Skeleton className="w-full h-full rounded-lg" /></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-2" style={{ height }}>
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="text-sm text-foreground font-jakarta">Couldn't load the trend</div>
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary rounded-md px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-2 text-muted-foreground" style={{ height }}>
        <LineIcon className="w-6 h-6" />
        <div className="text-sm font-jakarta">No trend data for this range</div>
        <div className="text-[11px] font-jakarta">Data over time will chart here.</div>
      </div>
    );
  }

  const { H, dx, dy, baseY, bars, nodes, linePath, areaPath, labels, grid, PL, showBars, showLine } = geom;
  const BAR = 'hsl(var(--chart-1))';   // navy (light) / bright blue (dark)
  const GOLD = 'hsl(var(--chart-2))';

  const tip = hover != null ? {
    d: data[hover],
    x: (showLine && nodes[hover]) ? nodes[hover].x : (bars[hover].x + bars[hover].barW / 2),
    y: (showLine && nodes[hover]) ? nodes[hover].y : bars[hover].topY,
  } : null;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Trend over time">
        <defs>
          <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.28" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`node-${uid}`} cx="34%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="38%" stopColor={GOLD} />
            <stop offset="100%" stopColor={GOLD} />
          </radialGradient>
          <filter id={`soft-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.16" />
          </filter>
        </defs>

        {grid.map((gy, k) => (
          <line key={k} x1={PL} y1={gy} x2={w - 16} y2={gy} stroke="hsl(var(--border))" strokeDasharray="3 4" opacity="0.7" />
        ))}
        <line x1={PL} y1={baseY} x2={w - 16} y2={baseY} stroke="hsl(var(--border))" />

        {/* 3D bars */}
        {showBars && bars.map((b) => {
          const isH = hover === b.i;
          const { x, topY, h, barW } = b;
          const topPts = `${x},${topY} ${x + dx},${topY + dy} ${x + barW + dx},${topY + dy} ${x + barW},${topY}`;
          const sidePts = `${x + barW},${topY} ${x + barW + dx},${topY + dy} ${x + barW + dx},${baseY + dy} ${x + barW},${baseY}`;
          return (
            <g key={b.i} style={{ transformBox: 'fill-box', transformOrigin: 'bottom', transition: 'transform .18s cubic-bezier(.22,1,.36,1)', transform: isH ? 'scaleY(1.07) scaleX(1.03)' : 'none' }}>
              <ellipse cx={x + barW / 2 + dx / 2} cy={baseY + 4} rx={barW * 0.7} ry={3} fill="#000" opacity="0.12" />
              <polygon points={sidePts} fill={BAR} />
              <polygon points={sidePts} fill="#000" opacity="0.24" />
              <rect x={x} y={topY} width={barW} height={Math.max(0, h)} rx="3" fill={BAR} />
              <rect x={x} y={topY} width={barW} height={Math.max(0, h)} rx="3" fill={`url(#sheen-${uid})`} />
              <polygon points={topPts} fill={BAR} />
              <polygon points={topPts} fill="#fff" opacity="0.30" />
            </g>
          );
        })}

        {/* 3D revenue line + area + sphere nodes */}
        {showLine && (
          <>
            {areaPath && <path d={areaPath} fill={`url(#area-${uid})`} stroke="none" />}
            <path d={linePath} fill="none" stroke="#000" strokeOpacity="0.16" strokeWidth="6"
              strokeLinecap="round" strokeLinejoin="round" transform="translate(0,2.5)" />
            <path d={linePath} fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {nodes.map((n) => {
              const show = n.i % geom.nodeStep === 0 || n.i === nodes.length - 1 || hover === n.i;
              if (!show) return null;
              return (
                <circle key={n.i} cx={n.x} cy={n.y} r={hover === n.i ? 8 : 5.5}
                  fill={`url(#node-${uid})`} stroke="#000" strokeOpacity="0.18"
                  style={{ transition: 'r .18s cubic-bezier(.22,1,.36,1)' }} filter={`url(#soft-${uid})`} />
              );
            })}
          </>
        )}

        {labels.map((l) => l.show && (
          <text key={l.i} x={l.x} y={baseY + 16} textAnchor="middle" fontSize="10.5"
            fill="hsl(var(--muted-foreground))" fontFamily="Manrope, sans-serif">{l.text}</text>
        ))}

        {bars.map((b) => (
          <rect key={`hit-${b.i}`} x={b.x - (b.barW * 0.3)} y={geom.PT} width={b.barW * 1.6} height={baseY - geom.PT}
            fill="transparent" onMouseEnter={() => setHover(b.i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>

      {tip && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-3 py-2 shadow-lg"
          style={{ left: Math.min(Math.max(tip.x - 60, 4), w - 124), top: Math.max(tip.y - 62, 4), width: 120 }}>
          <div className="text-[11px] font-jakarta text-muted-foreground">{tip.d.label}</div>
          {showBars && (
            <div className="mt-1 flex items-center justify-between text-[11px] font-jakarta">
              <span className="flex items-center gap-1.5 text-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: BAR }} />Regs</span>
              <span className="font-semibold text-foreground tabular-nums">{tip.d.registrations || 0}</span>
            </div>
          )}
          {showLine && (
            <div className="mt-0.5 flex items-center justify-between text-[11px] font-jakarta">
              <span className="flex items-center gap-1.5 text-foreground"><span className="w-2 h-2 rounded-full" style={{ background: GOLD }} />Revenue</span>
              <span className="font-semibold text-foreground tabular-nums">{inr(tip.d.revenue || 0)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrendChart;
