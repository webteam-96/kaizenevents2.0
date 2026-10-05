import {
  NET_FEE_RATE, rangeToDays, filterRegistrations, computeKpis,
  computeStatusCounts, computeTrend, computeTopEvents,
  computeGatewaySplit, computeCollectionSplit, computeEventStatusCounts,
} from './dashboardStats';

const NOW = new Date('2026-07-02T12:00:00Z');
const reg = (o) => ({ payment_status: 'completed', total_amount: 0, created_at: NOW.toISOString(), campaignId: 'c1', ...o });

const REGS = [
  reg({ id: '1', campaignId: 'c1', payment_status: 'completed', total_amount: 1000, created_at: '2026-07-02T09:00:00Z' }),
  reg({ id: '2', campaignId: 'c1', payment_status: 'pending',   total_amount: 500,  created_at: '2026-07-01T09:00:00Z' }),
  reg({ id: '3', campaignId: 'c2', payment_status: 'completed', total_amount: 3000, created_at: '2026-06-20T09:00:00Z' }),
  reg({ id: '4', campaignId: 'c2', payment_status: 'failed',    total_amount: 0,    created_at: '2026-05-01T09:00:00Z' }),
];
const CAMPAIGNS = [
  { id: 'c1', name: 'Event One', status: 'active', payment_gateway: 'razorpay', payment_collection_method: 'online' },
  { id: 'c2', name: 'Event Two', status: 'draft',  payment_gateway: 'instamojo', payment_collection_method: 'offline' },
];

test('rangeToDays maps ranges', () => {
  expect(rangeToDays('7d')).toBe(7);
  expect(rangeToDays('30d')).toBe(30);
  expect(rangeToDays('90d')).toBe(90);
  expect(rangeToDays('all')).toBeNull();
});

test('filterRegistrations by campaign', () => {
  expect(filterRegistrations(REGS, { campaignId: 'c1' }).map(r => r.id)).toEqual(['1', '2']);
});

test('filterRegistrations by status', () => {
  expect(filterRegistrations(REGS, { status: 'completed' }).map(r => r.id)).toEqual(['1', '3']);
});

test('filterRegistrations by range uses cutoff', () => {
  // 30d before 2026-07-02 => 2026-06-02; keeps ids 1,2,3 (5/1 excluded)
  const ids = filterRegistrations(REGS, { range: '30d', now: NOW }).map(r => r.id);
  expect(ids.sort()).toEqual(['1', '2', '3']);
});

test('computeKpis', () => {
  const k = computeKpis(REGS);
  expect(k.totalRevenue).toBe(4000);
  expect(k.netRevenue).toBeCloseTo(4000 * (1 - NET_FEE_RATE), 5);
  expect(k.pendingRevenue).toBe(500);
  expect(k.totalRegs).toBe(4);
  expect(k.paid).toBe(2);
  expect(k.pending).toBe(1);
  expect(k.conversion).toBeCloseTo(50, 5);
  expect(k.avgValue).toBe(2000);
});

test('computeKpis handles empty', () => {
  const k = computeKpis([]);
  expect(k.conversion).toBe(0);
  expect(k.avgValue).toBe(0);
});

test('computeStatusCounts', () => {
  expect(computeStatusCounts(REGS)).toEqual({ paid: 2, pending: 1, failed: 1, other: 0 });
});

test('computeTrend daily 7d returns 7 buckets, newest last', () => {
  const t = computeTrend(filterRegistrations(REGS, { range: '7d', now: NOW }), '7d', NOW);
  expect(t).toHaveLength(7);
  const last = t[t.length - 1];
  expect(last.registrations).toBe(1); // id 1 on 7/02
  expect(last.revenue).toBe(1000);
});

test('computeTopEvents sorts by revenue desc with share', () => {
  const top = computeTopEvents(REGS, CAMPAIGNS);
  expect(top[0].name).toBe('Event Two'); // 3000
  expect(top[0].revenue).toBe(3000);
  expect(top[0].share).toBe(100);
  expect(top[1].name).toBe('Event One'); // 1000
  expect(top[1].share).toBeCloseTo(33.33, 1);
});

test('computeGatewaySplit sums completed revenue per gateway', () => {
  const g = computeGatewaySplit(REGS, CAMPAIGNS);
  expect(g).toEqual({ razorpay: 1000, instamojo: 3000 });
});

test('computeCollectionSplit counts by method', () => {
  expect(computeCollectionSplit(REGS, CAMPAIGNS)).toEqual({ online: 2, offline: 2 });
});

test('computeEventStatusCounts', () => {
  expect(computeEventStatusCounts(CAMPAIGNS)).toEqual({ active: 1, draft: 1, closed: 0 });
});

// Regression guard: the KPI window (filterRegistrations) and the trend chart (computeTrend)
// must cover the same span, so no registration inside a bounded range is dropped from the
// chart. A boundary reg at local-noon N days ago is the case that broke before the fix.
const localNoonDaysAgo = (base, n) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() - n, 12, 0, 0).toISOString();

test('no registration inside a bounded window is dropped from the trend (reconciles with count)', () => {
  const set = [
    ...REGS,
    { id: 'b7', campaignId: 'c1', payment_status: 'completed', total_amount: 100, created_at: localNoonDaysAgo(NOW, 6) },
    { id: 'today', campaignId: 'c1', payment_status: 'completed', total_amount: 100, created_at: localNoonDaysAgo(NOW, 0) },
  ];
  ['7d', '30d', '90d'].forEach((range) => {
    const filtered = filterRegistrations(set, { range, now: NOW });
    const trendTotal = computeTrend(filtered, range, NOW).reduce((s, b) => s + b.registrations, 0);
    expect(trendTotal).toBe(filtered.length);
  });
});

test('computeTrend ignores an unparseable created_at instead of crashing', () => {
  const set = [{ id: 'x', campaignId: 'c1', payment_status: 'completed', total_amount: 10, created_at: 'not-a-date' }];
  expect(() => computeTrend(set, 'all', NOW)).not.toThrow();
  expect(computeTrend(set, 'all', NOW)).toEqual([]);
});
