// Pure field-rule evaluation for the builder preview.
// Semantics MUST stay identical to src/hooks/usePublicForm.js
// (evaluateCondition / getFieldState) — the public form is the source of truth.

/**
 * Evaluate a single rule condition against the current form data.
 * @param {object} condition - { field_id, operator, value }
 * @param {object} formData  - { [fieldId]: value } (name fields use id_first/_middle/_last keys)
 * @param {Array}  fields    - form field definitions (needed to detect 'name' fields)
 */
export const evaluateCondition = (condition, formData, fields) => {
  const conditionField = (fields || []).find(f => f.id === condition.field_id);
  let fieldValue;

  if (conditionField?.type === 'name') {
    // For name fields, combine all parts to check if it's not empty
    const firstName = formData[`${condition.field_id}_first`] || '';
    const middleName = formData[`${condition.field_id}_middle`] || '';
    const lastName = formData[`${condition.field_id}_last`] || '';
    fieldValue = `${firstName}${middleName}${lastName}`.trim();
  } else {
    fieldValue = formData[condition.field_id];
  }

  const compareValue = condition.value;

  // Checkbox (multi-select) fields store an ARRAY of selected option values.
  // equals/not_equals/contains must test membership, not scalar equality.
  if (Array.isArray(fieldValue)) {
    const selected = fieldValue.map(String);
    switch (condition.operator) {
      case 'equals':
      case 'contains':
        return selected.includes(String(compareValue));
      case 'not_equals':
        return !selected.includes(String(compareValue));
      case 'is_empty':
        return selected.length === 0;
      case 'is_not_empty':
        return selected.length > 0;
      default:
        return false; // greater_than/less_than aren't meaningful for multi-select
    }
  }

  switch (condition.operator) {
    case 'equals':
      return fieldValue === compareValue;
    case 'not_equals':
      return fieldValue !== compareValue;
    case 'contains':
      return String(fieldValue || '').toLowerCase().includes(String(compareValue || '').toLowerCase());
    case 'greater_than':
      return parseFloat(fieldValue) > parseFloat(compareValue);
    case 'less_than':
      return parseFloat(fieldValue) < parseFloat(compareValue);
    case 'is_empty':
      return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0) || fieldValue === '';
    case 'is_not_empty':
      return fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0) && fieldValue !== '';
    default:
      return false;
  }
};

// Aggregate every rule's actions for one target field — mirrors getFieldState
// in usePublicForm.js exactly (show is OR across rules, matched hide wins).
const getFieldState = (fieldId, fieldRules, formData, fields) => {
  const state = {
    visible: true,
    required: null,
    disabled: false
  };

  let hasShowRule = false;
  let shownByMatch = false;
  let hiddenByMatch = false;

  (fieldRules || []).forEach(rule => {
    const conditions = rule.conditions || [];
    const conditionsMet = rule.match_type === 'all'
      ? conditions.every(c => evaluateCondition(c, formData, fields))
      : conditions.some(c => evaluateCondition(c, formData, fields));

    rule.actions?.forEach(action => {
      if (action.target_field_id !== fieldId) return;
      switch (action.action) {
        case 'show':
          hasShowRule = true;
          if (conditionsMet) shownByMatch = true;
          break;
        case 'hide':
          if (conditionsMet) hiddenByMatch = true;
          break;
        case 'require':
          if (conditionsMet) state.required = true;
          break;
        case 'enable':
          if (conditionsMet) state.disabled = false;
          break;
        case 'disable':
          if (conditionsMet) state.disabled = true;
          break;
        default:
          break;
      }
    });
  });

  if (hasShowRule) state.visible = shownByMatch;
  if (hiddenByMatch) state.visible = false;

  return state;
};

/**
 * Compute { [fieldId]: { visible, required, disabled } } for every field.
 */
export const computeFieldStates = (fieldRules, formData, fields) => {
  const states = {};
  (fields || []).forEach(field => {
    states[field.id] = getFieldState(field.id, fieldRules || [], formData || {}, fields);
  });
  return states;
};
