import { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  validateFieldValue,
  isValidEmail as isValidEmailShared,
  isValidPhone as isValidPhoneShared,
} from '../utils/fieldValidation';
import { applyCouponToTotal } from '../utils/couponPricing';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

// custom_amount contribution to the total: empty/non-numeric input counts as 0,
// otherwise the typed value as-is. NOT clamped to min_value/max_value — bounds are
// enforced entirely by validateFieldValue/gatewayAmountFieldError, which block
// Submit and show an inline error for anything out of range. Clamping here too used
// to silently round e.g. an optional field's deliberate 0 up to the gateway floor,
// showing "Continue to Payment - ₹1.00" instead of ₹0 with no error visible at all.
const safeCustomAmount = (raw) => {
  if (raw === undefined || raw === null || raw === '') return 0;
  const amount = parseFloat(raw);
  return isNaN(amount) ? 0 : amount;
};

/**
 * Shared hook for public registration forms
 * Used by both PublicRegistration and PublicLandingPage components
 */
export const usePublicForm = (campaign) => {
  const [formData, setFormData] = useState({});
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Handle form field changes
  const handleFieldChange = useCallback((fieldId, value) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  // Evaluate a single condition for field rules
  const evaluateCondition = useCallback((condition) => {
    const conditionField = campaign?.form_config?.fields?.find(f => f.id === condition.field_id);
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
    // equals/not_equals/contains must test membership, not scalar equality — an
    // array is never === a string, which is why a checkbox condition never fired.
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
  }, [campaign, formData]);

  // Evaluate field rules to determine field visibility and state
  const getFieldState = useCallback((fieldId) => {
    const fieldRules = campaign?.form_config?.field_rules || [];
    
    let state = {
      visible: true,
      required: null,
      disabled: false,
      value: null
    };

    // "show" is OR across ALL rules: a field targeted by any show-action is hidden by
    // default and becomes visible if AT LEAST ONE show-rule's conditions are met, so
    // multiple overlapping rules don't clobber each other. A matched 'hide' always wins.
    let hasShowRule = false;
    let shownByMatch = false;
    let hiddenByMatch = false;

    fieldRules.forEach(rule => {
      const conditions = rule.conditions || [];
      const conditionsMet = rule.match_type === 'all'
        ? conditions.every(evaluateCondition)
        : conditions.some(evaluateCondition);

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
          case 'set_value':
            if (conditionsMet) state.value = action.value;
            break;
          default:
            break;
        }
      });
    });

    if (hasShowRule) state.visible = shownByMatch;
    if (hiddenByMatch) state.visible = false;

    return state;
  }, [campaign, evaluateCondition]);

  // Check if a field should be visible
  const isFieldVisible = useCallback((fieldId) => {
    return getFieldState(fieldId).visible;
  }, [getFieldState]);

  // Evaluate formula string with proper function handling
  const evaluateFormulaString = useCallback((formulaStr) => {
    // Replace common functions
    let result = formulaStr;
    
    result = result.replace(/sum\(([^)]+)\)/gi, (match, args) => {
      const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
      return values.reduce((a, b) => a + b, 0);
    });
    
    result = result.replace(/avg\(([^)]+)\)/gi, (match, args) => {
      const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    });
    
    result = result.replace(/min\(([^)]+)\)/gi, (match, args) => {
      const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
      return Math.min(...values);
    });
    
    result = result.replace(/max\(([^)]+)\)/gi, (match, args) => {
      const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
      return Math.max(...values);
    });
    
    result = result.replace(/round\(([^)]+)\)/gi, (match, args) => {
      return Math.round(parseFloat(args) || 0);
    });
    
    // Handle if() function: if(condition, true_value, false_value)
    let maxIterations = 10;
    while (maxIterations-- > 0 && /if\s*\(/i.test(result)) {
      result = result.replace(
        /if\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
        (match, condition, trueVal, falseVal) => {
          try {
            const conditionStr = condition.trim();
            let conditionResult = false;
            
            if (conditionStr.includes('>=')) {
              const [left, right] = conditionStr.split('>=').map(s => parseFloat(s.trim()) || 0);
              conditionResult = left >= right;
            } else if (conditionStr.includes('<=')) {
              const [left, right] = conditionStr.split('<=').map(s => parseFloat(s.trim()) || 0);
              conditionResult = left <= right;
            } else if (conditionStr.includes('==')) {
              const [left, right] = conditionStr.split('==').map(s => parseFloat(s.trim()) || 0);
              conditionResult = left === right;
            } else if (conditionStr.includes('!=')) {
              const [left, right] = conditionStr.split('!=').map(s => parseFloat(s.trim()) || 0);
              conditionResult = left !== right;
            } else if (conditionStr.includes('>')) {
              const [left, right] = conditionStr.split('>').map(s => parseFloat(s.trim()) || 0);
              conditionResult = left > right;
            } else if (conditionStr.includes('<')) {
              const [left, right] = conditionStr.split('<').map(s => parseFloat(s.trim()) || 0);
              conditionResult = left < right;
            } else {
              conditionResult = parseFloat(conditionStr) !== 0;
            }
            
            return conditionResult ? (parseFloat(trueVal.trim()) || 0) : (parseFloat(falseVal.trim()) || 0);
          } catch (e) {
            console.warn('Error evaluating if() condition:', e);
            return parseFloat(falseVal.trim()) || 0;
          }
        }
      );
    }
    
    return result;
  }, []);

  // Calculate total amount based on formula or base price
  const calculateTotal = useCallback(() => {
    if (!campaign?.form_config) return 0;
    
    const formConfig = campaign.form_config;
    const fields = formConfig.fields || [];
    const masterFormula = formConfig.pricing_formula || formConfig.master_formula || '';
    
    let total = 0;
    
    if (masterFormula && masterFormula.trim()) {
      try {
        let formulaStr = masterFormula;
        
        // Replace base_price reference
        formulaStr = formulaStr.replace(/\$\{base_price\}/g, parseFloat(formConfig.base_price) || 0);
        
        // Replace field references
        fields.forEach((field) => {
          const fieldValue = formData[field.id];
          let numericValue = 0;

          // Hidden fields contribute 0 — a value left behind after the registrant
          // switches away must not keep affecting the price.
          if (isFieldVisible(field.id)) {
            if (field.options && fieldValue) {
              const selectedValues = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
              field.options.forEach((option) => {
                if (selectedValues.includes(option.value)) {
                  numericValue += parseFloat(option.price_modifier) || 0;
                }
              });
            } else if (fieldValue && !isNaN(parseFloat(fieldValue))) {
              numericValue = parseFloat(fieldValue);
            }
          }

          const fieldRegex = new RegExp(`\\$\\{${field.id}\\}`, 'g');
          formulaStr = formulaStr.replace(fieldRegex, numericValue);
        });
        
        // Evaluate formula functions
        formulaStr = evaluateFormulaString(formulaStr);
        
        // Safely evaluate basic math expression
        if (/^[\d\s+\-*/().]+$/.test(formulaStr)) {
          total = eval(formulaStr);
        } else {
          console.warn('Invalid formula characters detected:', formulaStr);
          total = parseFloat(formConfig.base_price) || 0;
        }
      } catch (error) {
        console.error('Error evaluating formula:', error);
        total = parseFloat(formConfig.base_price) || 0;
      }
    } else {
      total = parseFloat(formConfig.base_price) || 0;
      // custom_amount fields add the registrant-entered value (clamped to the
      // field's min/max). Hidden fields contribute 0 — same visibility rule as
      // the formula path above, keeping the client total == server total.
      fields.forEach((field) => {
        if (field.type !== 'custom_amount') return;
        if (!isFieldVisible(field.id)) return;
        total += safeCustomAmount(formData[field.id]);
      });
    }

    // Apply coupon discount. All of the arithmetic — floor, cap, clamp, rounding —
    // lives in couponPricing.js, which mirrors the server's CouponCalculator. Doing it
    // inline here is what would let the two drift and start failing the server's
    // amount-mismatch check.
    if (couponApplied) {
      return applyCouponToTotal(couponApplied, Math.max(0, total));
    }

    return Math.max(0, total);
  }, [campaign, formData, couponApplied, evaluateFormulaString, isFieldVisible]);

  // Validate coupon code
  const validateCoupon = useCallback(async () => {
    if (!couponCode.trim() || !campaign?.id) return;
    
    setValidatingCoupon(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/campaigns/${campaign.id}/validate-coupon`, {
        code: couponCode.trim()
      });
      
      if (response.data.valid) {
        setCouponApplied({
          code: couponCode.trim().toUpperCase(),
          discount_type: response.data.discount_type,
          discount_value: response.data.discount_value,
          // Carrying the bounds is what lets the preview apply the same cap/floor the
          // server will; without them the shown total would be wrong whenever a cap bites.
          max_discount_amount: response.data.max_discount_amount ?? null,
          min_discount_amount: response.data.min_discount_amount ?? null
        });
        toast.success('Coupon applied successfully!');
      } else {
        // The API field is `message` — reading `error` here meant every real reason
        // ("Coupon has expired.", "Coupon usage limit reached.") was replaced by a
        // generic string, so registrants were never told what was actually wrong.
        toast.error(response.data.message || 'Invalid coupon code');
        setCouponApplied(null);
      }
    } catch (error) {
      toast.error('Failed to validate coupon');
      setCouponApplied(null);
    } finally {
      setValidatingCoupon(false);
    }
  }, [couponCode, campaign?.id]);

  // Remove applied coupon
  const removeCoupon = useCallback(() => {
    setCouponCode('');
    setCouponApplied(null);
    toast.info('Coupon removed');
  }, []);

  // Validate email format
  const isValidEmail = useCallback((email) => isValidEmailShared(email), []);

  // Validate phone number — 7 to 15 digits (international)
  const isValidPhone = useCallback((phone) => isValidPhoneShared(phone), []);

  /**
   * Validate every visible field before submission — required, character/word
   * limits, numeric range and format — using each field's configured wording.
   * Rules live in utils/fieldValidation so this hook, the registration page, the
   * landing page and the builder preview can never drift apart.
   *
   * Returns { valid, error, field_id, errors } — `errors` is keyed by field id for
   * inline display; `error` is the first message, for a toast.
   */
  const validateForm = useCallback(() => {
    const fields = campaign?.form_config?.fields || [];
    const errors = {};
    let first = null;
    let firstFieldId = null;

    for (const field of fields) {
      const fieldState = getFieldState(field.id);
      if (!fieldState.visible) continue;

      const isRequired = fieldState.required !== null ? fieldState.required : field.required;
      const message = validateFieldValue(field, formData, {
        required: isRequired,
        paymentEnabled: campaign?.payment_enabled !== false,
        paymentGateway: campaign?.payment_gateway,
      });
      if (message) {
        errors[field.id] = message;
        if (!first) { first = message; firstFieldId = field.id; }
      }
    }

    return first
      ? { valid: false, error: first, field_id: firstFieldId, errors }
      : { valid: true, errors: {} };
  }, [campaign, formData, getFieldState]);

  // Build form data for submission
  const buildSubmissionData = useCallback(() => {
    const fields = campaign?.form_config?.fields || [];
    const submissionFormData = {};
    
    fields.forEach((field) => {
      if (field.type === 'name') {
        const firstName = formData[`${field.id}_first`] || '';
        const middleName = formData[`${field.id}_middle`] || '';
        const lastName = formData[`${field.id}_last`] || '';
        submissionFormData[field.id] = {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          full_name: `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, ' ').trim()
        };
      } else {
        submissionFormData[field.id] = formData[field.id];
      }
    });
    
    return submissionFormData;
  }, [campaign, formData]);

  // Get extractable fields (email, phone, name) for registration
  const getExtractedFields = useCallback(() => {
    const fields = campaign?.form_config?.fields || [];
    let email = '';
    let phone = '';
    let name = '';
    
    fields.forEach((field) => {
      if (field.type === 'email' && formData[field.id]) {
        email = formData[field.id];
      }
      if ((field.type === 'phone' || field.type === 'tel') && formData[field.id]) {
        phone = formData[field.id];
      }
      if (field.type === 'name') {
        const firstName = formData[`${field.id}_first`] || '';
        const lastName = formData[`${field.id}_last`] || '';
        name = `${firstName} ${lastName}`.trim();
      }
    });
    
    return { email, phone, name };
  }, [campaign, formData]);

  return {
    // State
    formData,
    setFormData,
    couponCode,
    setCouponCode,
    couponApplied,
    setCouponApplied,
    validatingCoupon,
    
    // Handlers
    handleFieldChange,
    validateCoupon,
    removeCoupon,
    
    // Field state helpers
    getFieldState,
    isFieldVisible,
    evaluateCondition,
    
    // Calculations
    calculateTotal,
    
    // Validation
    validateForm,
    isValidEmail,
    isValidPhone,
    
    // Data builders
    buildSubmissionData,
    getExtractedFields,
  };
};

export default usePublicForm;
