// Works out who a submission belongs to — the registrant's name, email and phone.
//
// Mirrors the server's FormContact.Resolve (KaizenEvents.Shared/Helpers/FormContact.cs)
// rank for rank. The two have to agree: this one names the buyer in the payment popup,
// that one names them on the receipt, the confirmation email and the Sheets report, and
// a registrant seeing two different names across those has no way to tell which took.

import { resolveOptionValue } from './fieldProperties';

/**
 * Labels that name someone (or something) other than the registrant. "Club Name" and
 * "Spouse Name" both contain "name", so the registrant's own field has to outrank them.
 */
const FOREIGN_SUBJECTS = [
  'club', 'company', 'organisation', 'organization', 'institute', 'institution',
  'school', 'college', 'team', 'chapter', 'district', 'business', 'bank', 'event',
  'project', 'spouse', 'partner', 'guest', 'emergency', 'guardian', 'father',
  'mother', 'parent', 'nominee', 'referrer', 'contact person',
];

/**
 * Labels that unambiguously mean "the person registering". These beat any other name-ish
 * label whatever order the fields appear in — which is what separates a plain "Name" from
 * a "Select Name (COG)" sitting above it.
 */
const SELF_LABELS = [
  'name', 'full name', 'fullname', 'your name', 'participant name', 'attendee name',
  'registrant name', 'member name', 'delegate name', 'candidate name',
  'student name', 'first name',
];

const NO_MATCH = Number.MAX_SAFE_INTEGER;

const rankFor = (slot, type, label) => {
  const lbl = String(label || '').trim().toLowerCase();
  const foreign = FOREIGN_SUBJECTS.some((w) => lbl.includes(w));

  if (slot === 'name') {
    if (type === 'name') return foreign ? 6 : 0;
    if (!lbl.includes('name')) return NO_MATCH;
    if (SELF_LABELS.includes(lbl)) return foreign ? 6 : 1;
    return foreign ? 6 : 2;
  }

  if (slot === 'email') {
    if (type === 'email') return foreign ? 6 : 0;
    if (!lbl.includes('email') && !lbl.includes('e-mail')) return NO_MATCH;
    return foreign ? 6 : 2;
  }

  // phone
  if (type === 'phone' || type === 'tel') return foreign ? 6 : 0;
  if (lbl.includes('phone') || lbl.includes('mobile') || lbl.includes('whatsapp')) {
    return foreign ? 6 : 2;
  }
  // "Contact" alone is a weaker hint — "Emergency Contact Number" is a phone number,
  // just not the registrant's.
  if (lbl.includes('contact')) return foreign ? 6 : 3;
  return NO_MATCH;
};

/**
 * Turns a stored choice value back into the label the registrant picked
 * ("kailash_hemraj_jethani_3142" → "Kailash Hemraj Jethani"). Mirrors the server's
 * FormContact.ResolveOptionLabel, so a name picked from a dropdown reads the same in the
 * payment popup as it does on the receipt.
 */
const optionLabel = (field, raw) => {
  if (!raw || !Array.isArray(field?.options)) return raw;
  const hit = field.options.find((o) => (resolveOptionValue(o) === raw) || (o?.value === raw));
  return hit ? (hit.label ?? raw) : raw;
};

/** Reads one field's answer, stitching a composite Name field's parts back together. */
const readValue = (formData, field) => {
  if (field.type === 'name') {
    const combined = [
      formData[`${field.id}_first`],
      formData[`${field.id}_middle`],
      formData[`${field.id}_last`],
    ].filter(Boolean).join(' ').trim();
    if (combined) return combined;
  }
  const raw = formData[field.id];
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).map((v) => optionLabel(field, String(v))).join(', ');
  }
  if (raw === undefined || raw === null) return '';
  return optionLabel(field, String(raw));
};

const pick = (slot, fields, formData) => {
  let best = null;
  fields.forEach((field, order) => {
    if (!field?.id) return;
    if (['section_header', 'calculated', 'price'].includes(field.type)) return;
    const value = readValue(formData, field);
    if (!value || !String(value).trim()) return;
    const rank = rankFor(slot, field.type, field.label);
    if (rank === NO_MATCH) return;
    // Ties go to the earlier field, matching how the form reads top-down.
    if (!best || rank < best.rank) best = { rank, order, value };
  });
  return best ? best.value : '';
};

/**
 * Resolves { name, email, phone } from a submission. Pass form data that has already had
 * hidden answers dropped (see omitHiddenFieldValues) — a question the registrant never saw
 * should not be able to name them.
 */
export const resolveRegistrantContact = (fields, formData) => {
  const list = Array.isArray(fields) ? fields : [];
  const data = formData || {};
  return {
    name:  pick('name',  list, data),
    email: pick('email', list, data),
    phone: pick('phone', list, data),
  };
};
