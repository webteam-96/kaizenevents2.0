// Pure aggregation helpers for the Dashboard. No React, no I/O — unit-testable.

import { parseServerDate } from './serverTime';

export const NET_FEE_RATE = 0.0295; // platform gross commission

const DAY = 86400000;
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const shortLabel = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// Local-midnight of a date. Used so bucket boundaries, keys, and labels are all in
// local time (parsing a 'YYYY-MM-DD' string would be UTC and shift days in -UTC zones).
const startOfLocalDay = (d) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };

export function rangeToDays(range) {
  return range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : null;
}

// campaignId: 'all' | id ; status: 'all' | payment_status ; range: '7d'|'30d'|'90d'|'all'
export function filterRegistrations(registrations, { campaignId = 'all', status = 'all', range = 'all', now = new Date() } = {}) {
  const days = rangeToDays(range);
  // Calendar-day aligned to the trend chart's first bucket so the KPI window and the
  // chart cover exactly the same span (e.g. "7d" = today + previous 6 whole days).
  const cutoff = days ? startOfLocalDay(new Date(now.getTime() - (days - 1) * DAY)) : null;
  return (registrations || []).filter((r) => {
    if (campaignId !== 'all' && r.campaignId !== campaignId) return false;
    if (status !== 'all' && r.payment_status !== status) return false;
    // parseServerDate: backend timestamps are naive UTC strings — treat as UTC
    if (cutoff && r.created_at && (parseServerDate(r.created_at) || new Date(0)) < cutoff) return false;
    return true;
  });
}

export function computeKpis(regs) {
  const list = regs || [];
  const paidRegs = list.filter((r) => r.payment_status === 'completed');
  const pendingRegs = list.filter((r) => r.payment_status === 'pending');
  const totalRevenue = paidRegs.reduce((s, r) => s + (r.total_amount || 0), 0);
  const pendingRevenue = pendingRegs.reduce((s, r) => s + (r.total_amount || 0), 0);
  const totalRegs = list.length;
  const paid = paidRegs.length;
  const pending = pendingRegs.length;
  return {
    totalRevenue,
    netRevenue: totalRevenue * (1 - NET_FEE_RATE),
    pendingRevenue,
    totalRegs,
    paid,
    pending,
    conversion: totalRegs ? (paid / totalRegs) * 100 : 0,
    avgValue: paid ? totalRevenue / paid : 0,
  };
}

export function computeStatusCounts(regs) {
  const counts = { paid: 0, pending: 0, failed: 0, other: 0 };
  (regs || []).forEach((r) => {
    if (r.payment_status === 'completed') counts.paid++;
    else if (r.payment_status === 'pending') counts.pending++;
    else if (r.payment_status === 'failed') counts.failed++;
    else counts.other++;
  });
  return counts;
}

// Daily buckets from the range cutoff (or earliest reg for 'all') through `now`.
// Returns [{ label, registrations, revenue }] oldest-first. Capped at 400 buckets.
export function computeTrend(regs, range = 'all', now = new Date()) {
  const list = (regs || []).filter((r) => parseServerDate(r.created_at) !== null);
  if (!list.length) return [];
  const days = rangeToDays(range);
  let startDay;
  if (days) {
    startDay = startOfLocalDay(new Date(now.getTime() - (days - 1) * DAY));
  } else {
    const earliest = list.reduce((min, r) => Math.min(min, parseServerDate(r.created_at).getTime()), Infinity);
    startDay = startOfLocalDay(new Date(earliest));
  }
  const endDay = startOfLocalDay(now);
  let count = Math.round((endDay - startDay) / DAY) + 1;
  if (count < 1) count = 1;
  if (count > 400) { startDay = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - 399); count = 400; }
  const buckets = [];
  const index = {};
  for (let i = 0; i < count; i++) {
    // Local-midnight for each day (robust to month rollover / DST); keys & labels are local too.
    const d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i);
    index[ymd(d)] = i;
    buckets.push({ label: shortLabel(d), registrations: 0, revenue: 0 });
  }
  list.forEach((r) => {
    const i = index[ymd(parseServerDate(r.created_at))];
    if (i === undefined) return;
    buckets[i].registrations++;
    if (r.payment_status === 'completed') buckets[i].revenue += r.total_amount || 0;
  });
  return buckets;
}

// [{ id, name, regs, paid, revenue, share }] sorted by revenue desc.
export function computeTopEvents(regs, campaigns) {
  const nameById = Object.fromEntries((campaigns || []).map((c) => [c.id, c.name]));
  const acc = {};
  (regs || []).forEach((r) => {
    const id = r.campaignId;
    if (!acc[id]) acc[id] = { id, name: nameById[id] || r.campaignName || 'Unknown', regs: 0, paid: 0, revenue: 0 };
    acc[id].regs++;
    if (r.payment_status === 'completed') { acc[id].paid++; acc[id].revenue += r.total_amount || 0; }
  });
  const rows = Object.values(acc).sort((a, b) => b.revenue - a.revenue);
  const max = rows.length ? rows[0].revenue : 0;
  rows.forEach((row) => { row.share = max ? (row.revenue / max) * 100 : 0; });
  return rows;
}

// { [gateway]: completedRevenue } attributed via campaign.payment_gateway.
export function computeGatewaySplit(regs, campaigns) {
  const gwById = Object.fromEntries((campaigns || []).map((c) => [c.id, c.payment_gateway || 'unknown']));
  const out = {};
  (regs || []).forEach((r) => {
    if (r.payment_status !== 'completed') return;
    const gw = gwById[r.campaignId] || 'unknown';
    out[gw] = (out[gw] || 0) + (r.total_amount || 0);
  });
  return out;
}

// { online, offline } registration counts attributed via campaign.payment_collection_method.
export function computeCollectionSplit(regs, campaigns) {
  const methodById = Object.fromEntries((campaigns || []).map((c) => [c.id, c.payment_collection_method]));
  const out = { online: 0, offline: 0 };
  (regs || []).forEach((r) => {
    if (methodById[r.campaignId] === 'offline') out.offline++;
    else out.online++;
  });
  return out;
}

export function computeEventStatusCounts(campaigns) {
  const out = { active: 0, draft: 0, closed: 0 };
  (campaigns || []).forEach((c) => {
    if (c.status === 'active') out.active++;
    else if (c.status === 'draft') out.draft++;
    else if (c.status === 'closed' || c.status === 'archived') out.closed++;
  });
  return out;
}
