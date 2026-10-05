// Field-level validation for public forms.
//
// Single source of truth for WHICH rules a field can carry, what each rule's
// default error message is, and how a submitted value is checked against them.
// The public registration page, the landing-page form and the builder preview all
// call into here, so a rule added below is enforced everywhere at once.
//
// The server mirrors this in RegistrationController.ValidateFormFields — a rule
// changed here must be changed there too, or a spoofed client gets past it.

import { wordCount } from './fieldProperties';

// Types whose min/max CHARACTER limits are validated on submit. `name` is
// deliberately absent: it stores three separate parts, and its character limit
// acts as a per-part typing cap rather than a rule on one submitted value.
export const LENGTH_VALIDATED_TYPES = ['text', 'textarea', 'email', 'address'];

// Types that carry a character limit at all (validated ones + `name`, capped while typing).
export const LENGTH_CAPPED_TYPES = [...LENGTH_VALIDATED_TYPES, 'name'];

export const WORD_LIMIT_TYPES = ['textarea'];

export const NUMERIC_TYPES = ['number', 'currency', 'percentage', 'slider', 'custom_amount'];

// Real per-transaction bounds the payment gateways themselves enforce (checked Sept 2026):
// Razorpay rejects below ₹1 or (by default) above ₹5,00,000; Instamojo rejects below ₹9 or
// above ₹2,00,000. Mirrors KaizenEvents.Core.Constants.PaymentGatewayLimits — a rule changed
// there must be changed here too, same as every other rule in this file.
export const GATEWAY_AMOUNT_LIMITS = {
  razorpay:  { min: 1, max: 500000 },
  instamojo: { min: 9, max: 200000 },
  cashfree:  { min: 1, max: 500000 },
};

export const gatewayAmountLimitsFor = (paymentGateway) =>
  GATEWAY_AMOUNT_LIMITS[paymentGateway] || GATEWAY_AMOUNT_LIMITS.razorpay;

// Display name for the gateway a bound came from — same fallback as
// gatewayAmountLimitsFor, so the two never name a different gateway than the
// numbers they're sitting next to.
export const GATEWAY_LABELS = {
  razorpay:  'Razorpay',
  instamojo: 'Instamojo',
  cashfree:  'Cashfree',
};

export const gatewayLabelFor = (paymentGateway) =>
  GATEWAY_LABELS[paymentGateway] || GATEWAY_LABELS.razorpay;

/**
 * Default wording for each rule, as a template. The {label}/{min}/{max}/{count}
 * tokens exist so the DEFAULTS can name the field and its limits — admins are never
 * asked to type them. They write a plain sentence; see defaultMessageFor(), which
 * resolves these into a finished sentence for the editor to show as a placeholder.
 */
export const DEFAULT_MESSAGES = {
  required:   '{label} is required.',
  min_length: '{label} must be at least {min} characters.',
  max_length: '{label} cannot be longer than {max} characters.',
  min_words:  '{label} must be at least {min} words.',
  max_words:  '{label} cannot be longer than {max} words.',
  min_value:  '{label} must be at least {min}.',
  max_value:  '{label} cannot be more than {max}.',
  number:     '{label} must be a number.',
  email:      "{label} doesn't look like a valid email address.",
  phone:      "{label} doesn't look like a valid phone number.",
  date:       '{label} is not a valid date.',
  rating:     'Please choose a rating between 1 and {max} for {label}.',
  min_selections: '{label}: please select at least {min}.',
  max_selections: '{label}: please select no more than {max}.',
};

/**
 * What the admin sees as the row heading — phrased as the situation the registrant
 * is in, so it reads as "when this happens, say this".
 */
export const MESSAGE_LABELS = {
  required:   'When left blank',
  min_length: 'When too short',
  max_length: 'When too long',
  min_words:  'When too few words',
  max_words:  'When too many words',
  min_value:  'When the number is too small',
  max_value:  'When the number is too large',
  number:     "When it isn't a number",
  email:      "When the email address isn't valid",
  phone:      "When the phone number isn't valid",
  date:       "When the date isn't valid",
  rating:     'When no rating is chosen',
  min_selections: 'When too few are selected',
  max_selections: 'When too many are selected',
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Which message keys apply to this field, given its type AND which limits the
 * admin actually configured. Drives the Validation Messages editor so admins
 * only see messages that can ever fire.
 */
export const applicableMessageKeys = (field) => {
  if (!field) return [];
  const type = field.type;
  if (['section_header', 'rich_text', 'price', 'calculated', 'divider'].includes(type)) return [];

  const keys = ['required'];

  if (LENGTH_VALIDATED_TYPES.includes(type)) {
    if (num(field.min_length) !== null) keys.push('min_length');
    if (num(field.max_length) !== null) keys.push('max_length');
  }
  if (WORD_LIMIT_TYPES.includes(type)) {
    if (num(field.min_words) !== null) keys.push('min_words');
    if (num(field.max_words) !== null) keys.push('max_words');
  }
  if (NUMERIC_TYPES.includes(type)) {
    keys.push('number');
    if (num(field.min_value) !== null) keys.push('min_value');
    if (num(field.max_value) !== null) keys.push('max_value');
  }
  if (type === 'email') keys.push('email');
  if (type === 'phone' || type === 'tel') keys.push('phone');
  if (type === 'date' || type === 'datetime') keys.push('date');
  if (type === 'rating') keys.push('rating');
  if (type === 'checkbox' && field.options && field.options.length) {
    if (num(field.min_selections) !== null) keys.push('min_selections');
    if (num(field.max_selections) !== null) keys.push('max_selections');
  }

  return keys;
};

/** The bounds that belong to a given rule, for filling {min}/{max}. */
export const messageVars = (field, key) => {
  switch (key) {
    case 'min_length':
    case 'max_length': return { min: num(field?.min_length), max: num(field?.max_length) };
    case 'min_words':
    case 'max_words':  return { min: num(field?.min_words),  max: num(field?.max_words)  };
    case 'min_value':
    case 'max_value':  return { min: num(field?.min_value),  max: num(field?.max_value)  };
    case 'rating':     return { min: 1, max: Math.min(10, Math.max(3, parseInt(field?.max_rating, 10) || 5)) };
    case 'min_selections':
    case 'max_selections': return { min: num(field?.min_selections), max: num(field?.max_selections) };
    default:           return {};
  }
};

/**
 * The finished default sentence for a rule on a specific field — field name and
 * limits already substituted, e.g. "Member Code must be at least 6 characters."
 *
 * This is what the builder shows in the empty message box. Admins read a real
 * sentence and replace it with their own real sentence; they never see or type a
 * token. Recomputed as they edit the field, so renaming the field or changing a
 * limit updates the suggested wording immediately.
 */
export const defaultMessageFor = (field, key) =>
  resolveMessage({ ...(field || {}), validation_messages: null }, key, messageVars(field, key));

/**
 * Resolve the message for a rule: the admin's override if they set one,
 * otherwise the default. Placeholders are filled either way, so an override
 * like "Enter at least {min} characters" still interpolates.
 *
 * `fallback`, when passed, replaces the DEFAULT_MESSAGES[key] lookup for the
 * no-override case only — the admin's own override (if any) always wins either
 * way. Used by gatewayAmountFieldError: a custom_amount field's min/max override
 * is typed into the SAME "When the number is too small/large" boxes as any other
 * numeric field (stored under the `min_value`/`max_value` keys, not a separate
 * "gateway" key — there's only one pair of boxes in the builder), but its
 * DEFAULT wording needs to mention the gateway, not the generic "{label} must be
 * at least {min}." text every other numeric type gets.
 */
export const resolveMessage = (field, key, vars = {}, fallback = null) => {
  const custom = field?.validation_messages?.[key];
  const template = (typeof custom === 'string' && custom.trim())
    ? custom.trim()
    : (fallback ?? DEFAULT_MESSAGES[key] ?? '{label} is invalid.');

  const values = {
    label: field?.label || 'This field',
    min: '', max: '', count: '',
    ...vars,
  };
  return template.replace(/\{(label|min|max|count)\}/g, (_, k) =>
    values[k] === null || values[k] === undefined ? '' : String(values[k]));
};

/**
 * The ONLY bounds check for a custom_amount field — split out from validateFieldValue
 * so it can be reused for LIVE validation (every keystroke, before Continue/Submit is
 * clicked) without dragging in validateFieldValue's required+empty handling, which
 * would show "This field is required" the instant a required field renders blank
 * rather than only after the registrant tries to move on.
 *
 * The effective bound is the NARROWER of the field's own configured min_value/max_value
 * (set by the admin in the builder, which is itself always kept within the gateway's
 * range — see FieldEditor.js) and the gateway's own floor/ceiling — so a legacy field
 * saved before that constraint existed, or edited directly via the API, still can't end
 * up looser than what the gateway will actually accept. This must be the ONLY min/max
 * check custom_amount goes through in validateFieldValue (not also the plain min_value/
 * max_value check every other numeric type gets), which would reject a value before
 * this function got a say.
 *
 * Leaving the field BLANK is the only way to opt out of a contribution on an optional
 * field — that's handled entirely by validateFieldValue's required+empty check above
 * this one, before we're ever called. Once the registrant has typed ANYTHING, including
 * literally "0", it's a real attempt and must clear the floor/ceiling regardless of
 * required — an explicitly-typed 0 gets the same "please enter more" treatment as any
 * other sub-minimum amount, rather than being silently treated as "no answer".
 */
export const gatewayAmountFieldError = (field, formData, { paymentEnabled = false, paymentGateway = null } = {}) => {
  if (!field || field.type !== 'custom_amount' || !paymentEnabled) return null;
  const raw = formData?.[field.id];
  if (raw === undefined || raw === null || raw === '') return null; // nothing typed (yet)
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) return null; // "must be a number" is a separate rule

  const gw = gatewayAmountLimitsFor(paymentGateway);
  const configuredMin = num(field.min_value);
  const configuredMax = num(field.max_value);
  const effectiveMin = configuredMin !== null ? Math.max(configuredMin, gw.min) : gw.min;
  const effectiveMax = configuredMax !== null ? Math.min(configuredMax, gw.max) : gw.max;

  // Looked up under the same 'min_value'/'max_value' keys as every other numeric
  // field's override (the builder's Validation Messages panel has only one "When the
  // number is too small/large" box per field, not a separate gateway-specific one) —
  // an admin-set custom message here always wins. Only the fallback text differs from
  // the generic default, to mention the gateway when nothing was overridden.
  if (parsed < effectiveMin)
    return resolveMessage(field, 'min_value', { min: effectiveMin, max: effectiveMax, count: parsed },
      "Please enter at least ₹{min} — that's the minimum amount our payment gateway accepts due to gateway limitations.");
  if (parsed > effectiveMax)
    return resolveMessage(field, 'max_value', { min: effectiveMin, max: effectiveMax, count: parsed },
      "Please enter at most ₹{max} — that's the maximum amount our payment gateway accepts due to gateway limitations.");
  return null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (v) => EMAIL_RE.test(String(v || '').trim());

/** 7–15 digits, matching the server's IsValidPhone. */
export const isValidPhone = (v) => {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

/**
 * Is this field's stored value empty? Each type stores its value differently,
 * so emptiness has to be decided per type rather than by a single falsy check.
 */
export const isFieldEmpty = (field, formData) => {
  const type = field.type;
  const val = formData?.[field.id];

  if (type === 'name') {
    const nc = field.name_config || {};
    const showFirst = nc.show_first_name !== false;
    const first  = (formData?.[`${field.id}_first`]  || '').trim();
    const middle = (formData?.[`${field.id}_middle`] || '').trim();
    const last   = (formData?.[`${field.id}_last`]   || '').trim();
    return showFirst ? !first : (!first && !middle && !last);
  }
  if (type === 'file_upload')    return !(val && val.url);
  if (type === 'terms_checkbox') return val !== true;
  if (type === 'checkbox' && !(field.options && field.options.length)) return val !== true;
  if (type === 'rating')         return !((parseInt(val, 10) || 0) >= 1);

  if (Array.isArray(val)) return val.length === 0;
  return val === undefined || val === null || String(val).trim() === '';
};

/**
 * Validate one field's value. Returns an error string, or null when valid.
 *
 * `required` is passed in rather than read off the field because conditional
 * field rules (and the paid-campaign phone override) can flip it at runtime.
 * Display-only fields always return null.
 */
export const validateFieldValue = (field, formData, { required = false, paymentEnabled = false, paymentGateway = null } = {}) => {
  if (!field || !field.id) return null;
  const type = field.type;
  if (['section_header', 'rich_text', 'price', 'calculated', 'divider'].includes(type)) return null;

  const empty = isFieldEmpty(field, formData);

  if (required && empty) return resolveMessage(field, 'required');
  // An optional field left blank has nothing else to check — bounds and format
  // rules only apply to a value the registrant actually entered.
  if (empty) return null;

  const raw = formData?.[field.id];
  const str = Array.isArray(raw) ? '' : String(raw ?? '');

  // Character limits
  if (LENGTH_VALIDATED_TYPES.includes(type)) {
    const min = num(field.min_length);
    const max = num(field.max_length);
    const len = str.length;
    if (min !== null && len < min) return resolveMessage(field, 'min_length', { min, max, count: len });
    if (max !== null && len > max) return resolveMessage(field, 'max_length', { min, max, count: len });
  }

  // Word limits
  if (WORD_LIMIT_TYPES.includes(type)) {
    const min = num(field.min_words);
    const max = num(field.max_words);
    if (min !== null || max !== null) {
      const wc = wordCount(str);
      if (min !== null && wc < min) return resolveMessage(field, 'min_words', { min, max, count: wc });
      if (max !== null && wc > max) return resolveMessage(field, 'max_words', { min, max, count: wc });
    }
  }

  // Selection count limits (checkbox with options — a "select multiple" field)
  if (type === 'checkbox' && field.options && field.options.length && Array.isArray(raw)) {
    const min = num(field.min_selections);
    const max = num(field.max_selections);
    const count = raw.length;
    if (min !== null && count < min) return resolveMessage(field, 'min_selections', { min, max, count });
    if (max !== null && count > max) return resolveMessage(field, 'max_selections', { min, max, count });
  }

  // Numeric value + range
  if (NUMERIC_TYPES.includes(type)) {
    const parsed = parseFloat(str);
    if (!Number.isFinite(parsed)) return resolveMessage(field, 'number');

    // custom_amount on a paid campaign goes through gatewayAmountFieldError ONLY — not
    // also the plain min_value/max_value check below, which would double up on exactly
    // the same bound (gatewayAmountFieldError already folds the field's own min_value/
    // max_value in as the narrower bound — see its doc comment). On a free campaign
    // there's no gateway involved, so custom_amount falls through to the same plain
    // check as any other numeric type.
    if (type === 'custom_amount' && paymentEnabled) {
      return gatewayAmountFieldError(field, formData, { paymentEnabled, paymentGateway });
    }

    const min = num(field.min_value);
    const max = num(field.max_value);
    if (min !== null && parsed < min) return resolveMessage(field, 'min_value', { min, max, count: parsed });
    if (max !== null && parsed > max) return resolveMessage(field, 'max_value', { min, max, count: parsed });
  }

  if (type === 'email' && !isValidEmail(str))               return resolveMessage(field, 'email');
  if ((type === 'phone' || type === 'tel') && !isValidPhone(str)) return resolveMessage(field, 'phone');

  if ((type === 'date' || type === 'datetime') && Number.isNaN(Date.parse(str)))
    return resolveMessage(field, 'date');

  if (type === 'rating') {
    const max = Math.min(10, Math.max(3, parseInt(field.max_rating, 10) || 5));
    const r = parseInt(str, 10);
    if (!Number.isFinite(r) || r < 1 || r > max) return resolveMessage(field, 'rating', { min: 1, max });
  }

  return null;
};
