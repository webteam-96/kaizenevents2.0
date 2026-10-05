// Which pages of a multi-page form a set of answers actually routes through — and so which
// fields the registrant never saw.
//
// Page skipping is a second way a question can go unasked, alongside the show/hide field rules,
// and it strands answers the same way: fill page 2, go back to page 1, change the answer that
// drives the rule so page 2 is now skipped, and page 2's answers are still in form state.
//
// The path is recomputed from the CURRENT answers rather than read off the navigation history,
// which is the point — "given what you have ended up answering, which pages apply?". A page
// walked through and then routed around by a change of mind is exactly the case being caught.
//
// Mirrors the server's PageFlow.cs. The two must agree: the server is what strips the answer,
// this is what keeps the price the form quotes computed from the same set.

// A jump_to rule can point backwards, so a form can be authored whose rules cycle.
const MAX_STEPS = 200;

const toStr = (v) => (v === null || v === undefined ? '' : String(v));
const toNum = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const checkCondition = (condition, formData) => {
  const actual = formData?.[condition?.field_id];
  const expected = condition?.value;

  // Multi-select checkboxes store arrays — membership, not scalar equality.
  if (Array.isArray(actual)) {
    const selected = actual.map(toStr);
    switch (condition?.operator) {
      case 'equals':
      case 'contains':      return selected.includes(toStr(expected));
      case 'not_equals':
      case 'not_contains':  return !selected.includes(toStr(expected));
      case 'is_empty':      return selected.length === 0;
      case 'is_not_empty':  return selected.length > 0;
      default:              return false;
    }
  }

  const a = toStr(actual).toLowerCase();
  const b = toStr(expected).toLowerCase();
  switch (condition?.operator) {
    case 'equals':        return toStr(actual) === toStr(expected);
    case 'not_equals':    return toStr(actual) !== toStr(expected);
    case 'contains':      return a.includes(b);
    case 'not_contains':  return !a.includes(b);
    case 'greater_than':  return toNum(actual) >  toNum(expected);
    case 'less_than':     return toNum(actual) <  toNum(expected);
    case 'greater_equal': return toNum(actual) >= toNum(expected);
    case 'less_equal':    return toNum(actual) <= toNum(expected);
    case 'is_empty':      return !actual;
    case 'is_not_empty':  return !!actual;
    case 'starts_with':   return a.startsWith(b);
    case 'ends_with':     return a.endsWith(b);
    default:              return false;
  }
};

/**
 * Splits a form's field ids into pages at its page breaks. Each break's `position` counts the
 * fields before it; everything after the last break is the final page.
 */
export const splitFieldsIntoPages = (formConfig) => {
  const allFields = formConfig?.fields || [];
  const breaks = (formConfig?.page_breaks || [])
    .slice()
    .sort((x, y) => (x.position ?? 0) - (y.position ?? 0));

  const pages = [];
  let lastPos = 0;
  for (const b of breaks) {
    const pos = Math.max(lastPos, Math.min(b.position ?? allFields.length, allFields.length));
    pages.push(allFields.slice(lastPos, pos).map((f) => f?.id).filter(Boolean));
    lastPos = pos;
  }
  pages.push(allFields.slice(lastPos).map((f) => f?.id).filter(Boolean));
  return pages;
};

/**
 * Field ids on pages these answers route past. Empty for a single-page form, a form with no page
 * breaks, or a config that can't be read — in each of those no field can be page-skipped, and
 * claiming otherwise could only discard a real answer.
 */
export const skippedPageFieldIds = (formConfig, formData) => {
  const pages = splitFieldsIntoPages(formConfig);
  if (pages.length <= 1) return [];

  const rules = formConfig?.page_rules || [];
  const totalPages = pages.length;

  const nextFromRules = (current) => {
    for (const rule of rules) {
      if ((rule.source_page ?? 1) !== current) continue;
      const conds = rule.conditions || [];
      if (conds.length === 0) continue;

      const matched = (rule.match_type || 'all') === 'any'
        ? conds.some((c) => checkCondition(c, formData))
        : conds.every((c) => checkCondition(c, formData));
      if (!matched) continue;

      const target = rule.target_page || (current + 1);
      // skip_to lands PAST the named page; jump_to lands ON it.
      if (rule.action === 'skip_to') return Math.min(totalPages, target + 1);
      if (rule.action === 'jump_to') return Math.min(totalPages, Math.max(1, target));
      // Anything else isn't navigation — keep looking.
    }
    return null;
  };

  const visited = new Set([1]);
  let current = 1;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const next = nextFromRules(current) ?? current + 1;
    if (next > totalPages) break;   // walked off the end — the form is done
    if (visited.has(next)) break;   // a cycle, stop
    visited.add(next);
    current = next;
  }

  const skipped = [];
  pages.forEach((ids, i) => {
    if (!visited.has(i + 1)) skipped.push(...ids);
  });
  return skipped;
};
