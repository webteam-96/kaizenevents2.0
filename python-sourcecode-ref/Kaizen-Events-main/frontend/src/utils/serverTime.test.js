import { parseServerDate, serverDateMs, formatServerDate } from './serverTime';

test('naive datetime string is treated as UTC, not local', () => {
  // The backend serializes UTC without a marker; both must be the same instant.
  expect(parseServerDate('2026-07-02T14:00:00').getTime())
    .toBe(new Date('2026-07-02T14:00:00Z').getTime());
});

test('Z-suffixed and offset strings are passed through unchanged', () => {
  expect(parseServerDate('2026-07-02T14:00:00Z').getTime())
    .toBe(new Date('2026-07-02T14:00:00Z').getTime());
  expect(parseServerDate('2026-07-02T19:30:00+05:30').getTime())
    .toBe(new Date('2026-07-02T14:00:00Z').getTime());
});

test('fractional seconds (DATETIME(6)) are handled', () => {
  expect(parseServerDate('2026-07-02T14:00:00.123456').getTime())
    .toBe(new Date('2026-07-02T14:00:00.123456Z').getTime());
});

test('space-separated datetime is normalized', () => {
  expect(parseServerDate('2026-07-02 14:00:00').getTime())
    .toBe(new Date('2026-07-02T14:00:00Z').getTime());
});

test('date-only strings still parse (no Z appended)', () => {
  const d = parseServerDate('2026-07-02');
  expect(d).not.toBeNull();
  expect(Number.isNaN(d.getTime())).toBe(false);
});

test('null / undefined / empty / garbage return null instead of throwing', () => {
  expect(parseServerDate(null)).toBeNull();
  expect(parseServerDate(undefined)).toBeNull();
  expect(parseServerDate('')).toBeNull();
  expect(parseServerDate('not-a-date')).toBeNull();
});

test('Date instances pass through; invalid Date becomes null', () => {
  const d = new Date('2026-07-02T14:00:00Z');
  expect(parseServerDate(d)).toBe(d);
  expect(parseServerDate(new Date('nope'))).toBeNull();
});

test('serverDateMs is sort-safe for bad input', () => {
  expect(serverDateMs('not-a-date')).toBe(0);
  expect(serverDateMs(null)).toBe(0);
  expect(serverDateMs('2026-07-02T14:00:00')).toBe(new Date('2026-07-02T14:00:00Z').getTime());
});

test('formatServerDate never throws and formats in local time', () => {
  expect(formatServerDate(null, 'yyyy-MM-dd')).toBe('');
  expect(formatServerDate('garbage', 'yyyy-MM-dd')).toBe('');
  const out = formatServerDate('2026-07-02T14:00:00', 'yyyy-MM-dd HH:mm:ss');
  // Rendered in the runner's local zone — must equal the local representation of 14:00 UTC.
  const expected = new Date('2026-07-02T14:00:00Z');
  const pad = (n) => String(n).padStart(2, '0');
  expect(out).toBe(
    `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())} ` +
    `${pad(expected.getHours())}:${pad(expected.getMinutes())}:${pad(expected.getSeconds())}`
  );
});
