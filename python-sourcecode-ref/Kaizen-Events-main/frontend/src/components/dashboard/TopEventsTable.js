import React from 'react';
import { ChevronRight, AlertCircle, Trophy, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
// Brand chart tokens for the top-3 rank chips — theme in both light and dark.
const RANK_TOKENS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)'];

// rows: [{ id, name, regs, paid, revenue, share }]
// onRowClick(id): navigate to that event.
const TopEventsTable = ({ rows = [], onRowClick, loading = false, error = null, onRetry }) => {
  if (loading) {
    return (
      <div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 px-2">
            <Skeleton className="w-6 h-6 rounded-md shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-1.5 w-full max-w-[180px]" />
            </div>
            <Skeleton className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="text-sm text-foreground font-jakarta">Couldn't load top events</div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary rounded-md px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-6 flex flex-col items-center text-center gap-2 text-muted-foreground">
        <Trophy className="w-6 h-6" />
        <div className="text-sm font-jakarta">No events yet</div>
        <div className="text-[11px] font-jakarta">Top performers rank here once events collect registrations.</div>
      </div>
    );
  }

  return (
    <div>
      {rows.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onRowClick && onRowClick(r.id)}
          className="group w-full text-left flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg border-b border-border last:border-b-0 hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Rank */}
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 font-outfit"
            style={{
              background: i < 3 ? `hsl(${RANK_TOKENS[i]} / 0.12)` : 'hsl(var(--muted))',
              color: i < 3 ? `hsl(${RANK_TOKENS[i]})` : 'hsl(var(--muted-foreground))',
            }}
          >
            {i + 1}
          </span>

          {/* Name + share bar + sub-stats */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground truncate font-jakarta group-hover:text-primary" title={r.name}>
              {r.name}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="rounded-full h-1.5 flex-1 max-w-[180px] overflow-hidden bg-muted">
                <div className="h-full rounded-full ke-hl" style={{ width: `${Math.max(0, Math.min(100, r.share || 0))}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground font-jakarta whitespace-nowrap">{r.regs} regs · {r.paid} paid</span>
            </div>
          </div>

          {/* Revenue + chevron */}
          <div className="text-xs font-bold text-foreground font-outfit shrink-0">{inr(r.revenue)}</div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
        </button>
      ))}
    </div>
  );
};

export default TopEventsTable;
