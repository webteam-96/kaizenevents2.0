// Cashfree vendor-split shared constants used by Payment Splits + Vendor settings UIs.

export const SPLIT_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED:      'fixed',
  RESIDUAL:   'residual',
};

export const SPLIT_TYPE_LABEL = {
  [SPLIT_TYPES.PERCENTAGE]: 'Percentage',
  [SPLIT_TYPES.FIXED]:      'Fixed ₹',
  [SPLIT_TYPES.RESIDUAL]:   'Residual (auto)',
};
