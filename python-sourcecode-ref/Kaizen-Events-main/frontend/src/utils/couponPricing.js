// Coupon discount arithmetic for the public forms.
//
// This is a deliberate mirror of KaizenEvents.Shared/Helpers/CouponCalculator.cs.
// The registrant's browser computes the total it shows and then sends that number
// with the submission; the server recalculates independently and rejects the
// submission if the two differ by more than ₹0.01. So any divergence between this
// file and the C# one does not produce a wrong price — it produces a registrant who
// cannot submit at all. Change both, or neither.
//
// Order of operations, matching CouponCalculator.ComputeDiscount:
//   1. raw   — percentage of the subtotal, or the flat amount
//   2. floor — min_discount_amount lifts a small discount up
//   3. cap   — max_discount_amount pulls a large discount down
//   4. clamp — never more than the subtotal, so the payable total can't go negative

/**
 * Rounds to 2 decimals half-away-from-zero, matching
 * Math.Round(value, 2, MidpointRounding.AwayFromZero) on the server.
 * Discounts are never negative here, so JS's half-up Math.round is equivalent.
 */
export const round2 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 100) / 100 * (n < 0 ? -1 : 1);
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A `formula` coupon's discount is evaluated by the server's expression engine
 * against the campaign's stored formula, which the browser never receives — so it
 * cannot be previewed here. Callers use this to avoid showing a confidently wrong
 * number. (No formula coupon is creatable from the admin screen; the type exists
 * only for rows created through the API directly.)
 */
export const isServerOnlyDiscount = (coupon) =>
  (coupon?.discount_type || '').toLowerCase() === 'formula';

/**
 * How much `coupon` takes off `subtotal`.
 *
 * @param {object} coupon   As returned by /validate-coupon: discount_type,
 *                          discount_value, max_discount_amount, min_discount_amount.
 * @param {number} subtotal Pre-discount total.
 * @returns {number} The discount in rupees, rounded to 2 decimals. 0 when the coupon
 *                   is absent, the subtotal is zero or negative, or the discount type
 *                   cannot be evaluated in the browser.
 */
export const computeCouponDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;

  const base = Number(subtotal);
  if (!Number.isFinite(base) || base <= 0) return 0;

  const type  = (coupon.discount_type || '').toLowerCase();
  const value = num(coupon.discount_value) ?? 0;

  let raw;
  if (type === 'percentage')  raw = base * (value / 100);
  else if (type === 'fixed')  raw = value;
  else                        return 0; // formula, or an unknown type — give nothing away

  if (!Number.isFinite(raw) || raw < 0) raw = 0;

  const floor = num(coupon.min_discount_amount);
  const cap   = num(coupon.max_discount_amount);

  if (floor !== null && floor > 0 && raw < floor) raw = floor;
  if (cap   !== null && cap   > 0 && raw > cap)   raw = cap;

  if (raw > base) raw = base;

  return round2(raw);
};

/**
 * The payable total after applying `coupon` to `subtotal`. Rounds the discount first
 * and the total second, exactly as the server does, so the two agree to the paisa.
 */
export const applyCouponToTotal = (coupon, subtotal) => {
  const base = Number(subtotal) || 0;
  const discount = computeCouponDiscount(coupon, base);
  return round2(Math.max(0, base - discount));
};

/**
 * Human-readable summary of the coupon's terms, e.g. "10% off, up to ₹500".
 * Used in the applied-coupon banner so the registrant can see why the discount is
 * what it is rather than being surprised by a cap.
 */
export const describeCoupon = (coupon) => {
  if (!coupon) return '';
  const type  = (coupon.discount_type || '').toLowerCase();
  const value = num(coupon.discount_value) ?? 0;
  const cap   = num(coupon.max_discount_amount);
  const floor = num(coupon.min_discount_amount);

  let text;
  if (type === 'percentage')  text = `${value}% off`;
  else if (type === 'fixed')  text = `₹${value} off`;
  else                        return 'Discount applied';

  if (cap !== null && cap > 0)     text += `, up to ₹${cap}`;
  if (floor !== null && floor > 0) text += `, at least ₹${floor}`;
  return text;
};
