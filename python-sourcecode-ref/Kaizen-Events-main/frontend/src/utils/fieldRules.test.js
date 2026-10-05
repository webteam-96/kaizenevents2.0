import { evaluateCondition, computeFieldStates } from './fieldRules';

const fields = [
  { id: 'meal', type: 'checkbox', label: 'Meal Preference' },
  { id: 'city', type: 'dropdown', label: 'City' },
  { id: 'jain_note', type: 'text', label: 'Jain Note' },
  { id: 'other_city', type: 'text', label: 'Other City' },
];

describe('evaluateCondition', () => {
  describe('checkbox (array) values use membership semantics', () => {
    test('equals matches when the option is among the selected values', () => {
      const cond = { field_id: 'meal', operator: 'equals', value: 'jain' };
      expect(evaluateCondition(cond, { meal: ['veg', 'jain'] }, fields)).toBe(true);
      expect(evaluateCondition(cond, { meal: ['veg'] }, fields)).toBe(false);
    });

    test('contains behaves as membership too', () => {
      const cond = { field_id: 'meal', operator: 'contains', value: 'jain' };
      expect(evaluateCondition(cond, { meal: ['jain'] }, fields)).toBe(true);
      expect(evaluateCondition(cond, { meal: [] }, fields)).toBe(false);
    });

    test('not_equals is the negation of membership', () => {
      const cond = { field_id: 'meal', operator: 'not_equals', value: 'jain' };
      expect(evaluateCondition(cond, { meal: ['veg'] }, fields)).toBe(true);
      expect(evaluateCondition(cond, { meal: ['jain', 'veg'] }, fields)).toBe(false);
    });

    test('is_empty / is_not_empty check array length', () => {
      expect(evaluateCondition({ field_id: 'meal', operator: 'is_empty' }, { meal: [] }, fields)).toBe(true);
      expect(evaluateCondition({ field_id: 'meal', operator: 'is_not_empty' }, { meal: ['veg'] }, fields)).toBe(true);
    });

    test('numeric operators are false for arrays', () => {
      const cond = { field_id: 'meal', operator: 'greater_than', value: '1' };
      expect(evaluateCondition(cond, { meal: ['veg', 'jain'] }, fields)).toBe(false);
    });
  });

  describe('scalar values', () => {
    test('equals is strict equality', () => {
      const cond = { field_id: 'city', operator: 'equals', value: 'mumbai' };
      expect(evaluateCondition(cond, { city: 'mumbai' }, fields)).toBe(true);
      expect(evaluateCondition(cond, { city: 'pune' }, fields)).toBe(false);
      expect(evaluateCondition(cond, {}, fields)).toBe(false);
    });
  });
});

describe('computeFieldStates', () => {
  const showRule = {
    id: 'r1',
    match_type: 'all',
    conditions: [{ field_id: 'meal', operator: 'equals', value: 'jain' }],
    actions: [{ action: 'show', target_field_id: 'jain_note' }],
  };

  test('show-rule target is hidden until the condition is met', () => {
    const before = computeFieldStates([showRule], { meal: ['veg'] }, fields);
    expect(before.jain_note.visible).toBe(false);

    const after = computeFieldStates([showRule], { meal: ['veg', 'jain'] }, fields);
    expect(after.jain_note.visible).toBe(true);
  });

  test('fields without rules stay visible and not required', () => {
    const states = computeFieldStates([showRule], {}, fields);
    expect(states.city).toEqual({ visible: true, required: null, disabled: false });
  });

  test('require action marks the target required only when the condition matches', () => {
    const requireRule = {
      id: 'r2',
      match_type: 'all',
      conditions: [{ field_id: 'city', operator: 'equals', value: 'other' }],
      actions: [{ action: 'require', target_field_id: 'other_city' }],
    };

    const notMet = computeFieldStates([requireRule], { city: 'mumbai' }, fields);
    expect(notMet.other_city.required).toBe(null);

    const met = computeFieldStates([requireRule], { city: 'other' }, fields);
    expect(met.other_city.required).toBe(true);
  });
});
