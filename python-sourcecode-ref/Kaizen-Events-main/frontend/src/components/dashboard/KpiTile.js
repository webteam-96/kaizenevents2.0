import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// A single KPI tile: colored left accent bar, icon chip, label, big value, sub line.
// `accent` / `iconBg` are passed in by the parent (currently brand hex values) and drive
// the inline-styled accent bar + icon chip; the rest of the surface is fully tokenized.
const KpiTile = ({ icon: Icon, label, value, sub, subTone = 'muted', accent = '#091D40', iconBg = 'hsl(var(--primary-subtle))', loading = false }) => {
  const toneClass = subTone === 'up'
    ? 'text-green-600 dark:text-green-400'
    : subTone === 'down'
      ? 'text-destructive'
      : 'text-muted-foreground';

  if (loading) {
    return (
      <div className="ke-card relative p-5 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-28 mt-3" />
            <Skeleton className="h-3 w-16 mt-2" />
          </div>
          <Skeleton className="w-11 h-11 rounded-[0.85rem] shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
      {/* Accent hairline along the top edge — the card's brand signal. */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">{label}</div>
          <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{value}</div>
          {sub != null && <div className={`text-[11px] mt-1.5 font-jakarta ${toneClass}`}>{sub}</div>}
        </div>
        {Icon && (
          <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${iconBg}, transparent 85%)` }}>
            <Icon className="w-5 h-5" style={{ color: accent }} />
          </span>
        )}
      </div>
    </div>
  );
};

export default KpiTile;
