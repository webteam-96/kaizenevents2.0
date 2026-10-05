// Shared helpers for new field properties (visibility / text case / sort choices).

/**
 * Should this field render at all?
 * "hide" = omit entirely. "show" and "disabled" both render (caller decides).
 */
export const isFieldHidden = (field) => field?.visibility === 'hide';

/** Is this field forced to read-only via its Visibility setting? */
export const isFieldDisabledByVisibility = (field) => field?.visibility === 'disabled';

/**
 * Transform input text according to field.text_case.
 * "default" | undefined => no change
 * "upper" | "lower" | "proper"
 */
export const applyTextCase = (value, field) => {
  if (typeof value !== 'string' || !field?.text_case || field.text_case === 'default') {
    return value;
  }
  switch (field.text_case) {
    case 'upper': return value.toUpperCase();
    case 'lower': return value.toLowerCase();
    case 'proper':
      return value.replace(/\b\w/g, (c) => c.toUpperCase())
                  .replace(/(\w)(\w*)/g, (_, a, b) => a.toUpperCase() + b.toLowerCase());
    default: return value;
  }
};

/**
 * Returns options sorted according to field.sort_choices:
 *   "manual" | undefined => original order
 *   "asc"   => A → Z by label
 *   "desc"  => Z → A by label
 */
export const sortedChoiceOptions = (field) => {
  const options = Array.isArray(field?.options) ? field.options : [];
  const mode = field?.sort_choices;
  if (!mode || mode === 'manual') return options;
  const copy = [...options];
  copy.sort((a, b) => {
    const la = (a.label || '').toLowerCase();
    const lb = (b.label || '').toLowerCase();
    return mode === 'asc' ? la.localeCompare(lb) : lb.localeCompare(la);
  });
  return copy;
};

/**
 * Strip characters disallowed by field.input_mask.
 *
 *   any                    — no filtering (passthrough)
 *   letters_only           — Unicode letters only
 *   letters_numbers        — Unicode letters + 0-9
 *   letters_spaces         — Unicode letters + space
 *   letters_numbers_spaces — Unicode letters + 0-9 + space
 *
 * Uses \p{L} so non-Latin scripts (Devanagari, Tamil, etc.) aren't blocked.
 */
export const applyInputMask = (value, field) => {
  if (typeof value !== 'string' || !value) return value;
  const mask = field?.input_mask;
  if (!mask || mask === 'any') return value;
  switch (mask) {
    case 'letters_only':           return value.replace(/[^\p{L}]/gu, '');
    case 'letters_numbers':        return value.replace(/[^\p{L}0-9]/gu, '');
    case 'letters_spaces':         return value.replace(/[^\p{L} ]/gu, '');
    case 'letters_numbers_spaces': return value.replace(/[^\p{L}0-9 ]/gu, '');
    default:                       return value;
  }
};

/** Word count — runs of non-whitespace. Used by textarea word limit. */
export const wordCount = (str) => {
  if (!str) return 0;
  const t = String(str).trim();
  return t ? t.split(/\s+/).length : 0;
};

/** Truncate a string to N words, preserving the original whitespace shape. */
export const truncateToWords = (str, maxWords) => {
  if (!str || !maxWords || maxWords <= 0) return str;
  const parts = String(str).split(/(\s+)/);
  let words = 0;
  let out = '';
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      out += part;
    } else if (part) {
      if (words >= maxWords) break;
      out += part;
      words++;
    }
  }
  return out;
};

/**
 * One-shot sanitizer used by every text input renderer.
 * Calls mask → text case → char truncate → word truncate, in that order.
 *   sanitizeTextInput(rawValue, field) → cleaned value.
 */
export const sanitizeTextInput = (rawValue, field) => {
  if (rawValue == null) return rawValue;
  let v = String(rawValue);
  v = applyInputMask(v, field);
  v = applyTextCase(v, field);
  if (field?.max_length && v.length > field.max_length) v = v.slice(0, field.max_length);
  if (field?.max_words)  v = truncateToWords(v, field.max_words);
  return v;
};

/**
 * Tailwind class for choice-field display layout (radio / checkbox).
 *   "1"      — 1 column (stacked, default)
 *   "2"      — 2 columns (responsive)
 *   "3"      — 3 columns (responsive)
 *   "inline" — flex-wrap (chips side by side)
 */
export const getChoiceLayoutClass = (layout) => {
  switch (layout) {
    case '2':      return 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2';
    case '3':      return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2';
    case 'inline': return 'flex flex-wrap gap-x-4 gap-y-2';
    case '1':
    default:       return 'space-y-2';
  }
};

/**
 * Resolve what the choice option submits.
 * Falls back to label when assigned value is blank — keeps backward compat with
 * forms saved before the "Assigned value" column was added in FieldEditor.
 */
export const resolveOptionValue = (option) => {
  if (!option) return '';
  const v = option.value;
  return (v !== undefined && v !== null && String(v).trim() !== '') ? v : (option.label ?? '');
};

/**
 * Suffixes under which composite widgets store their parts. A field's answer isn't always
 * one key — a "name" field spreads over three — so dropping one has to sweep these too.
 */
const COMPOSITE_SUFFIXES = ['_first', '_middle', '_last', '_country'];

/**
 * Returns a copy of formData with answers to questions the registrant never saw removed.
 *
 * Form state only ever grows: pick a COG name, then switch "Member type" to Rotarian and
 * type a name, and both are still in state at submit. Stored that way the registration
 * carries two names, and everything downstream — the payment page, the receipt, the
 * confirmation email, the Sheets report — has to guess which one is the person.
 *
 * The server strips these again on arrival, which is what actually guarantees it; doing it
 * here keeps the price the form quotes computed from the same answers it sends.
 */
export const omitHiddenFieldValues = (formData, hiddenFieldIds) => {
  if (!formData || !hiddenFieldIds?.length) return formData || {};
  const drop = new Set();
  hiddenFieldIds.forEach((id) => {
    if (!id) return;
    drop.add(id);
    COMPOSITE_SUFFIXES.forEach((suffix) => drop.add(`${id}${suffix}`));
  });
  return Object.fromEntries(Object.entries(formData).filter(([key]) => !drop.has(key)));
};
