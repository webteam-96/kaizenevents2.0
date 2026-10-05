import { format as dfFormat } from 'date-fns';

// The .NET backend stores timestamps in UTC but serializes them WITHOUT a
// timezone marker (e.g. "2026-07-02T14:00:00"). `new Date()` / `parseISO()`
// read such strings as LOCAL time, so the UTC clock face gets displayed as-is
// — 5h30m behind IST. This helper treats naive datetime strings as UTC so
// formatting renders the true local (IST) time.
export function parseServerDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const hasTime = value.includes('T') || value.includes(' ');
    // Ends with Z or a ±HH:MM / ±HHMM offset → already timezone-aware
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
    const normalized = hasTime && !hasTz ? `${value.replace(' ', 'T')}Z` : value;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Millisecond epoch for sorting; NaN-safe (missing/bad dates sort first). */
export function serverDateMs(value) {
  const d = parseServerDate(value);
  return d ? d.getTime() : 0;
}

/** date-fns format() that never throws — returns '' for missing/bad dates. */
export function formatServerDate(value, pattern) {
  const d = parseServerDate(value);
  return d ? dfFormat(d, pattern) : '';
}
