// When a choice field's stored value no longer matches any current option
// (the organizer edited or deleted the option after people registered),
// exports would fall back to the raw slug ("tanvi_sawant_panaji_riviera_goa_20_qty").
// Humanize it instead: underscores → spaces, words capitalized.
// Only slug-shaped values are touched — anything else passes through unchanged.
const SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

export function humanizeOptionValue(value) {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) return value;
  return value
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
