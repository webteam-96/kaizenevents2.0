import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// title: string; hint?: string; rows: [{ label, value, color }]
const MiniSplitCard = ({ title, hint, rows = [], loading = false }) => (
  <div className="ke-card ke-card-hover p-5">
    <h3 className="ke-section-title text-[14px]">{title}</h3>
    <div className="ke-rule-gold mt-1.5 mb-1" />
    {hint && <div className="text-[11px] text-muted-foreground mb-2 font-jakarta">{hint}</div>}
    {loading ? (
      <div className="space-y-2 mt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    ) : rows.length === 0 ? (
      <div className="text-[11px] text-muted-foreground font-jakarta py-3">No data for this range yet.</div>
    ) : (
      <div className="space-y-1.5 mt-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs font-jakarta">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />{r.label}
            </span>
            <span className="font-semibold text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default MiniSplitCard;
