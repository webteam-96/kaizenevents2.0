import React from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const initials = (name) => {
  const s = String(name == null ? '' : name).trim();
  if (!s) return 'G';
  return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
};

const badgeClass = (status) => {
  if (status === 'completed') return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300';
  if (status === 'pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
};
const badgeText = (status) => (status === 'completed' ? 'Paid' : status ? status[0].toUpperCase() + status.slice(1) : '—');

// items: [{ id, name, eventName, amount, status, timeLabel }]
const RecentRegistrations = ({ items = [], loading = false, error = null, onRetry }) => {
  if (loading) {
    return (
      <div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="text-sm text-foreground font-jakarta">Couldn't load registrations</div>
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

  if (items.length === 0) {
    return (
      <div className="py-6 flex flex-col items-center text-center gap-2 text-muted-foreground">
        <Inbox className="w-6 h-6" />
        <div className="text-sm font-jakarta">No registrations yet</div>
        <div className="text-[11px] font-jakarta">New sign-ups in this range will appear here.</div>
      </div>
    );
  }

  return (
    <div>
      {items.map((it, i) => (
        <div key={it.id || i} className={`flex items-center gap-3 py-2 ${i < items.length - 1 ? 'border-b border-border' : ''}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-primary-subtle text-primary">{initials(it.name)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground truncate font-jakarta">{it.name}</div>
            <div className="text-[11px] text-muted-foreground truncate font-jakarta">{it.eventName} · {it.timeLabel}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-bold text-foreground">{inr(it.amount)}</div>
            <span className={`text-[10px] px-2 py-0.5 rounded-sm font-semibold ${badgeClass(it.status)}`}>{badgeText(it.status)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecentRegistrations;
