// Razorpay Route shared constants for the per-event vendor-split UIs.
// Split semantics are identical to Cashfree — re-export from there so we
// keep a single source of truth for the value enum.

export { SPLIT_TYPES, SPLIT_TYPE_LABEL } from './cashfree';

// Razorpay v2 Linked Account business types (from /v2/accounts API).
// Full list per Razorpay Route integration guide.
export const BUSINESS_TYPES = [
  { value: 'individual',             label: 'Individual' },
  { value: 'proprietorship',         label: 'Proprietorship' },
  { value: 'partnership',            label: 'Partnership' },
  { value: 'private_limited',        label: 'Private Limited' },
  { value: 'public_limited',         label: 'Public Limited' },
  { value: 'llp',                    label: 'LLP' },
  { value: 'trust',                  label: 'Trust' },
  { value: 'society',                label: 'Society' },
  { value: 'ngo',                    label: 'NGO' },
  { value: 'not_yet_registered',     label: 'Not Yet Registered' },
  { value: 'educational_institutes', label: 'Educational Institutes' },
  { value: 'other',                  label: 'Other' },
];
