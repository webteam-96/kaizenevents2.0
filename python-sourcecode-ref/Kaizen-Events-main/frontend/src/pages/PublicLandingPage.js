import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import SearchableSelect from '../components/ui/SearchableSelect';
import {
  Loader2, CheckCircle, X, CreditCard, AlertCircle,
  Calendar, MapPin, Users, Clock, Mail, Phone, Globe,
  ChevronDown, ChevronUp, Twitter, Linkedin, Facebook, Lock,
  Banknote, Copy, Home, Star
} from 'lucide-react';
import { toast } from 'sonner';
import PaymentCheckout from '../components/PaymentCheckout';
import { CampaignArchivedPage, RegistrationClosedPage, RegistrationComingSoon } from './ErrorPages';
import { usePublicForm } from '../hooks/usePublicForm';
import PhoneInput from '../components/ui/PhoneInput';
import Footer from '../components/Footer';
import {
  isFieldHidden, isFieldDisabledByVisibility, applyTextCase, sortedChoiceOptions,
  sanitizeTextInput, wordCount, getChoiceLayoutClass, resolveOptionValue, omitHiddenFieldValues,
} from '../utils/fieldProperties';
import { resolveRegistrantContact } from '../utils/registrantContact';
import { validateFieldValue, gatewayAmountFieldError } from '../utils/fieldValidation';
import { applyCouponToTotal, describeCoupon } from '../utils/couponPricing';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${API_BASE_URL}${url}` : (url || '');

// custom_amount contribution to the total: empty/non-numeric input counts as 0,
// otherwise the typed value as-is. NOT clamped to min_value/max_value — bounds are
// enforced entirely by validateFieldValue/gatewayAmountFieldError, which block
// Submit and show an inline error for anything out of range. Clamping here too used
// to silently round e.g. an optional field's deliberate 0 up to the gateway floor,
// showing a wrong total instead of ₹0 with no error visible at all.
const safeCustomAmount = (raw) => {
  if (raw === undefined || raw === null || raw === '') return 0;
  const amount = parseFloat(raw);
  return isNaN(amount) ? 0 : amount;
};

// file_upload accept attribute by configured accept_types (default: any file)
const ACCEPT_ATTRS = { audio: 'audio/*', video: 'video/*', audio_video: 'audio/*,video/*' };

const PublicLandingPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // Per-field validation errors, keyed by field id. Set on submit, cleared as the
  // registrant edits the offending field.
  const [fieldErrors, setFieldErrors] = useState({});
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registrationId, setRegistrationId] = useState(null);
  // The pending registration this page has already created, if any. Sent back on a resubmit
  // so "Back to form" → edit → submit amends that attempt instead of minting a second
  // registration and leaving the first payable under the old answers. Held in component
  // state only, so it lives exactly as long as the attempt being corrected: a reload, a new
  // tab or a fresh visit starts a genuinely new registration, and one person registering
  // several attendees in a row is never merged into one.
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [registrationData, setRegistrationData] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);
  // Offline payment state
  const [offlineOtp, setOfflineOtp] = useState(null);
  const [showOfflineSuccess, setShowOfflineSuccess] = useState(false);

  useEffect(() => {
    fetchCampaignData();
  }, [slug]);

  const fetchCampaignData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/public/campaigns/${slug}`);
      const campaignData = response.data;
      
      // If landing page is disabled, redirect to registration form
      if (campaignData.has_landing_page === false) {
        navigate(`/register/${slug}`, { replace: true });
        return;
      }

      // Closed-group campaigns need the member-selection UI, which only the
      // standard registration page has. Send the user there instead of the
      // landing-page builder output.
      if (campaignData.campaign_type === 'closed_group') {
        navigate(`/register/${slug}`, { replace: true });
        return;
      }

      setCampaign(campaignData);
    } catch (error) {
      if (error.response?.status === 404) {
        setError('not_found');
        toast.error('Event not found or not active');
      } else if (error.response?.status === 410) {
        setError('archived');
        // No toast for archived - we show a dedicated page
      } else {
        setError('error');
        toast.error('Failed to load event');
      }
    } finally {
      setLoading(false);
    }
  };

  // Check registration status
  const getRegistrationStatus = () => {
    if (!campaign) return 'closed';
    
    const now = new Date();
    const startDate = campaign.registration_start_date ? new Date(campaign.registration_start_date) : null;
    const endDate = campaign.registration_end_date ? new Date(campaign.registration_end_date) : null;
    
    // Check if campaign is archived
    if (campaign.status === 'archived') return 'archived';
    
    // Check if registration hasn't started yet
    if (startDate && now < startDate) return 'not_started';
    
    // Check if registration has ended
    if (endDate && now > endDate) return 'ended';
    
    // Check if registration is disabled
    if (campaign.registration_enabled === false) return 'disabled';
    
    // Check if campaign is not active
    if (campaign.status !== 'active') return 'closed';
    
    return 'open';
  };

  // Handle Register button click - either open external form or show modal.
  // Optional `tier` arg comes from a pricing tier card and pre-fills the mapped form field.
  const handleRegisterClick = (tier = null) => {
    // Check if registration is disabled
    if (campaign.registration_enabled === false) {
      toast.error('Registration is currently closed for this event');
      return;
    }

    if (campaign.use_external_form && campaign.external_form_url) {
      window.open(campaign.external_form_url, '_blank');
      return;
    }

    // If tier has a form field mapping, pre-fill the value
    if (tier && tier.form_field_id && tier.form_field_option_value) {
      const field = (campaign.form_config?.fields || [])
        .find(f => f.id === tier.form_field_id);
      if (field) {
        const value = field.type === 'checkbox'
          ? [tier.form_field_option_value]   // checkbox expects an array
          : tier.form_field_option_value;
        setFormData(prev => ({ ...prev, [tier.form_field_id]: value }));
        setSelectedTier(tier);
      } else {
        setSelectedTier(null);
      }
    } else {
      setSelectedTier(null);
    }

    setShowRegistrationModal(true);
  };

  const handleChange = (fieldId, value) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // Name parts store as "{id}_first" etc.; the error hangs off the base id.
    const baseId = fieldId.replace(/_(first|middle|last|country)$/, '');
    setFieldErrors((prev) => {
      if (!prev[baseId]) return prev;
      const next = { ...prev };
      delete next[baseId];
      return next;
    });
  };

  // Best-effort registrant name attached to public uploads so files can be
  // traced back to a person (backend reads the `registrant_name` FormData key).
  const resolveRegistrantName = () => {
    const fields = campaign?.form_config?.fields || [];
    const nameField = fields.find((f) => f.type === 'name');
    if (nameField) {
      const composed = `${formData[`${nameField.id}_first`] || ''} ${formData[`${nameField.id}_last`] || ''}`.trim();
      if (composed) return composed;
    }
    const labeledText = fields.find(
      (f) => f.type === 'text' && String(f.label || '').toLowerCase().includes('name')
    );
    if (labeledText && typeof formData[labeledText.id] === 'string') {
      return formData[labeledText.id].trim();
    }
    return '';
  };

  const calculateTotal = (withCoupon = true) => {
    if (!campaign?.form_config) return 0;
    
    const formConfig = campaign.form_config;
    const fields = formConfig.fields || [];
    // Check both field names for formula (pricing_formula is the new name, master_formula is legacy)
    const masterFormula = formConfig.pricing_formula || formConfig.master_formula || '';
    
    let total = 0;
    
    // If there's a formula defined, use it to calculate total
    if (masterFormula && masterFormula.trim()) {
      try {
        // Replace field references in formula with actual values
        let formulaStr = masterFormula;
        
        // Replace base_price reference
        formulaStr = formulaStr.replace(/\$\{base_price\}/g, parseFloat(formConfig.base_price) || 0);
        
        // Replace field references
        fields.forEach((field) => {
          const fieldValue = formData[field.id];
          let numericValue = 0;

          // Hidden fields contribute 0 to the formula — their stored value lingers in
          // formData but must not affect the price once the field is no longer shown.
          if (isFieldVisible(field.id)) {
            if (field.options && fieldValue) {
              // For fields with options, get the price modifier
              const selectedValues = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
              field.options.forEach((option) => {
                if (selectedValues.includes(option.value)) {
                  numericValue += parseFloat(option.price_modifier) || 0;
                }
              });
            } else if (fieldValue && !isNaN(parseFloat(fieldValue))) {
              // For numeric fields, use the value directly
              numericValue = parseFloat(fieldValue);
            }
          }

          // Replace field reference in formula
          const fieldRegex = new RegExp(`\\$\\{${field.id}\\}`, 'g');
          formulaStr = formulaStr.replace(fieldRegex, numericValue);
        });
        
        // Evaluate the formula safely (basic math only)
        // Replace common functions
        formulaStr = formulaStr.replace(/sum\(([^)]+)\)/gi, (match, args) => {
          const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
          return values.reduce((a, b) => a + b, 0);
        });
        formulaStr = formulaStr.replace(/avg\(([^)]+)\)/gi, (match, args) => {
          const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
          return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        });
        formulaStr = formulaStr.replace(/min\(([^)]+)\)/gi, (match, args) => {
          const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
          return Math.min(...values);
        });
        formulaStr = formulaStr.replace(/max\(([^)]+)\)/gi, (match, args) => {
          const values = args.split(',').map(v => parseFloat(v.trim()) || 0);
          return Math.max(...values);
        });
        formulaStr = formulaStr.replace(/round\(([^)]+)\)/gi, (match, args) => {
          return Math.round(parseFloat(args) || 0);
        });
        
        // Handle if() function: if(condition, true_value, false_value)
        // Repeatedly process nested if() calls
        let maxIterations = 10;
        while (maxIterations-- > 0 && /if\s*\(/i.test(formulaStr)) {
          formulaStr = formulaStr.replace(
            /if\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
            (match, condition, trueVal, falseVal) => {
              try {
                // Parse and evaluate the condition
                const conditionStr = condition.trim();
                let result = false;
                
                // Handle comparison operators
                if (conditionStr.includes('>=')) {
                  const [left, right] = conditionStr.split('>=').map(s => parseFloat(s.trim()) || 0);
                  result = left >= right;
                } else if (conditionStr.includes('<=')) {
                  const [left, right] = conditionStr.split('<=').map(s => parseFloat(s.trim()) || 0);
                  result = left <= right;
                } else if (conditionStr.includes('==')) {
                  const [left, right] = conditionStr.split('==').map(s => parseFloat(s.trim()) || 0);
                  result = left === right;
                } else if (conditionStr.includes('!=')) {
                  const [left, right] = conditionStr.split('!=').map(s => parseFloat(s.trim()) || 0);
                  result = left !== right;
                } else if (conditionStr.includes('>')) {
                  const [left, right] = conditionStr.split('>').map(s => parseFloat(s.trim()) || 0);
                  result = left > right;
                } else if (conditionStr.includes('<')) {
                  const [left, right] = conditionStr.split('<').map(s => parseFloat(s.trim()) || 0);
                  result = left < right;
                } else {
                  // If no comparison operator, evaluate as truthy/falsy
                  result = parseFloat(conditionStr) !== 0;
                }
                
                return result ? (parseFloat(trueVal.trim()) || 0) : (parseFloat(falseVal.trim()) || 0);
              } catch (e) {
                console.warn('Error evaluating if() condition:', e);
                return parseFloat(falseVal.trim()) || 0;
              }
            }
          );
        }
        
        // Safely evaluate basic math expression
        // Only allow numbers, operators, and parentheses
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
      // No formula defined — auto-sum: base_price + sum of selected options' price_modifiers
      total = parseFloat(formConfig.base_price) || 0;
      fields.forEach((field) => {
        // custom_amount adds the registrant-entered value (clamped to min/max),
        // with the same hidden-field exclusion as option modifiers below — the
        // backend mirrors these semantics, keeping client total == server total.
        if (field.type === 'custom_amount') {
          if (!isFieldVisible(field.id)) return;
          total += safeCustomAmount(formData[field.id]);
          return;
        }
        if (!Array.isArray(field.options) || field.options.length === 0) return;
        // Hidden fields (by rules / static visibility) must NOT contribute to the price.
        // A registrant who picked a priced option then switched away should not still be
        // charged for it once the field is no longer shown.
        if (!isFieldVisible(field.id)) return;
        const fieldValue = formData[field.id];
        if (fieldValue === undefined || fieldValue === null || fieldValue === '') return;
        const selectedValues = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
        field.options.forEach((option) => {
          if (selectedValues.includes(option.value)) {
            total += parseFloat(option.price_modifier) || 0;
          }
        });
      });
    }

    // Apply coupon discount. Floor, cap, clamp and rounding all live in
    // couponPricing.js, which mirrors the server's CouponCalculator — the two have to
    // agree to the paisa or the server rejects the submission as an amount mismatch.
    // `withCoupon: false` returns the pre-discount subtotal, which is what the price
    // summary subtracts from to show the discount as a rupee amount — the percentage
    // alone would be wrong the moment a cap or floor moves it.
    if (couponApplied && withCoupon) {
      return applyCouponToTotal(couponApplied, Math.max(0, total));
    }

    return Math.max(0, total);
  };

  /** Rupees the applied coupon takes off, after its cap and floor. */
  const couponDiscountAmount = () =>
    couponApplied ? Math.max(0, calculateTotal(false) - calculateTotal(true)) : 0;

  // Evaluate a single condition
  const evaluateCondition = (condition) => {
    // Check if this is a name field (which stores values in _first, _middle, _last sub-keys)
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
  };

  // Evaluate field rules to determine field visibility and state
  const getFieldState = (fieldId) => {
    const fieldRules = campaign?.form_config?.field_rules || [];

    // Default state
    let state = {
      visible: true,
      required: null, // null means use field's default required setting
      disabled: false,
      value: null
    };

    // "show" is evaluated as OR across ALL rules: a field targeted by any show-action
    // is hidden by default and becomes visible if AT LEAST ONE show-rule's conditions
    // are met. This is what lets multiple overlapping rules coexist (e.g. one rule per
    // group size all targeting the same member fields) — a non-matching rule must not
    // clobber a matching one. A matched 'hide' always wins.
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
  };

  const isFieldVisible = (fieldId) => getFieldState(fieldId).visible;

  // Real-time gateway-bound check on any custom_amount (donation) field — see the
  // matching block in PublicRegistration.js for why this exists: it recomputes on every
  // keystroke so Submit greys out the instant a typed amount falls outside what the
  // gateway will accept — required or not, since gatewayAmountFieldError itself treats a
  // typed 0 the same as any other sub-minimum amount, and stays silent on a still-blank
  // field either way.
  const liveAmountError = useMemo(() => {
    const fields = campaign?.form_config?.fields || [];
    for (const field of fields) {
      if (field.type !== 'custom_amount') continue;
      const message = gatewayAmountFieldError(field, formData, {
        paymentEnabled: campaign?.payment_enabled !== false,
        paymentGateway: campaign?.payment_gateway,
      });
      if (message) return { fieldId: field.id, message };
    }
    return null;
  }, [campaign, formData]);

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    
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
          // The bounds have to come along, or the preview would ignore a cap the
          // server applies and every submission would fail the amount check.
          max_discount_amount: response.data.max_discount_amount ?? null,
          min_discount_amount: response.data.min_discount_amount ?? null
        });
        toast.success('Coupon applied successfully!');
      } else {
        // The API field is `message`; reading `error` swallowed every real reason
        // ("Coupon has expired.", "Coupon usage limit reached.") behind a generic string.
        toast.error(response.data.message || 'Invalid coupon code');
        setCouponApplied(null);
      }
    } catch (error) {
      toast.error('Failed to validate coupon');
      setCouponApplied(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCouponCode('');
    setCouponApplied(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Full field validation (required, character/word limits, numeric range, format)
    // using each field's configured wording. HTML form validation can't cover rating
    // buttons or money fields at all, and doesn't know about the builder's limits.
    {
      const errors = {};
      let first = null;
      for (const f of campaign.form_config?.fields || []) {
        const st = getFieldState(f.id);
        if (isFieldHidden(f) || !st.visible) continue;
        const req = st.required !== null ? st.required : f.required;
        const message = validateFieldValue(f, formData, {
          required: req,
          paymentEnabled: campaign?.payment_enabled !== false,
          paymentGateway: campaign?.payment_gateway,
        });
        if (message) {
          errors[f.id] = message;
          if (!first) first = message;
        }
      }
      setFieldErrors(errors);
      if (first) {
        toast.error(first);
        return;
      }
    }

    setSubmitting(true);

    try {
      // Tell the server which fields the registrant never saw (hidden by conditional
      // rules / static visibility), so it doesn't enforce "required" on them. The
      // client is the source of truth for visibility — this prevents false required
      // errors from any drift between the client and server rule engines.
      const allFormFields = campaign?.form_config?.fields || [];
      const hiddenFieldIds = allFormFields
        .filter((f) => f.id && !isFieldVisible(f.id))
        .map((f) => f.id);

      // ...and drop their answers outright rather than just flagging them: form state only
      // ever grows, so a name picked before the registrant switched away is still in it at
      // submit, and the registration ends up carrying two. Priced and submitted from the
      // same stripped copy so the two can't disagree.
      const submittedFormData = omitHiddenFieldValues(formData, hiddenFieldIds);

      // Get authoritative price from backend (avoids "Amount mismatch" when pricing_rules apply)
      let totalAmount = calculateTotal();
      try {
        const priceResp = await axios.post(
          `${API_BASE_URL}/api/campaigns/${campaign.id}/calculate-price`,
          { form_data: submittedFormData, coupon_code: couponApplied?.code || null }
        );
        if (priceResp.data && typeof priceResp.data.total === 'number') {
          totalAmount = priceResp.data.total;
        }
      } catch (priceErr) {
        console.warn('Backend price calculation failed, using local total:', priceErr);
      }

      // Check if this is an offline payment campaign
      const isOfflinePayment = campaign.payment_collection_method === 'offline';

      if (isOfflinePayment) {
        // Submit to offline registration endpoint - always generate OTP for offline campaigns
        const response = await axios.post(`${API_BASE_URL}/api/registrations/offline/submit`, {
          campaign_id: campaign.id,
          form_data: submittedFormData,
          total_amount: totalAmount,
          coupon_code: couponApplied?.code || null,
          hidden_field_ids: hiddenFieldIds
        });
        
        const regData = response.data;
        setRegistrationId(regData.registration_id);
        setOfflineOtp(regData.otp);
        setShowOfflineSuccess(true);
        toast.success('Registration submitted! Please save your OTP.');
      } else {
        // Regular registration flow
        const response = await axios.post(`${API_BASE_URL}/api/registrations/submit`, {
          campaign_id: campaign.id,
          form_data: submittedFormData,
          total_amount: totalAmount,
          coupon_code: couponApplied?.code || null,
          hidden_field_ids: hiddenFieldIds,
          // Correcting the attempt already made on this page rather than starting another.
          // Ignored by the server unless the token matches an outstanding registration.
          existing_registration_id: pendingAttempt?.id || null,
          payment_token: pendingAttempt?.token || null
        });

        const regData = response.data;
        setRegistrationId(regData.id);
        setPendingAttempt(regData.payment_token ? { id: regData.id, token: regData.payment_token } : null);

        // Resolve buyer fields (form ids are like `field_abc123`, so hard-coded keys such
        // as formData.phone are almost never populated). Ranked the same way the server
        // ranks it, off the stripped copy, so the name in the payment popup is the name on
        // the receipt and never one the registrant switched away from.
        const contact = resolveRegistrantContact(allFormFields, submittedFormData);
        const resolvedName  = contact.name || 'Guest';
        const resolvedEmail = contact.email || '';
        const resolvedPhone = contact.phone || '';

        setRegistrationData({
          ...regData,
          buyer_name: resolvedName,
          buyer_email: resolvedEmail || 'guest@example.com',
          buyer_phone: resolvedPhone
        });

        if (totalAmount > 0 && campaign.payment_account_id) {
          setShowPayment(true);
        } else if (totalAmount > 0 && !campaign.payment_account_id) {
          toast.warning('Payment configuration pending. Your registration is saved.');
          setRegistrationComplete(true);
        } else {
          await axios.post(`${API_BASE_URL}/api/registrations/payment/callback`, {
            registration_id: regData.id,
            payment_id: `free_${Date.now()}`,
            payment_gateway: 'free',
            status: 'success',
            amount: 0
          });
          setRegistrationComplete(true);
          toast.success('Registration successful!');
        }
      }
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = (paymentId, gatewayPaymentId) => {
    // Paid — there is nothing left to correct.
    setPendingAttempt(null);
    setRegistrationComplete(true);
    setShowPayment(false);
    toast.success('Payment successful! Registration confirmed.');
  };

  const handlePaymentFailure = (errorCode) => {
    toast.error('Payment failed. Please try again.');
  };

  const closeModal = () => {
    if (registrationComplete || showOfflineSuccess) {
      // Reset everything when closing after success
      setShowRegistrationModal(false);
      setRegistrationComplete(false);
      setShowPayment(false);
      setShowOfflineSuccess(false);
      setOfflineOtp(null);
      setFormData({});
      setCouponCode('');
      setCouponApplied(null);
      setRegistrationData(null);
      setRegistrationId(null);
      setSelectedTier(null);
    } else if (!showPayment && !submitting) {
      setShowRegistrationModal(false);
      setSelectedTier(null);
    }
  };

  // Renders a field and appends its validation error inside the same wrapper, so
  // every field type shows the message without repeating markup in each branch.
  const renderField = (field) => {
    const rendered = renderFieldControl(field);
    if (!rendered) return rendered;
    const message = fieldErrors[field.id]
      || (liveAmountError?.fieldId === field.id ? liveAmountError.message : null);

    // Cloned on EVERY render, not only when there's a message: React.Children.toArray
    // re-keys the children, so cloning conditionally would change the key scheme the
    // moment an error appears or clears — remounting the input and stealing focus from
    // the registrant mid-keystroke. Keeping the shape constant keeps focus.
    return React.cloneElement(
      rendered,
      { key: field.id },
      ...React.Children.toArray(rendered.props.children),
      message ? (
        <p key="__validation_error" className="text-xs text-red-600 font-jakarta mt-1" role="alert">
          {message}
        </p>
      ) : null
    );
  };

  const renderFieldControl = (field) => {
    // Static Visibility property (admin set): "hide" removes the field entirely
    if (isFieldHidden(field)) {
      return null;
    }

    // Check field visibility based on field rules
    if (!isFieldVisible(field.id)) {
      return null;
    }

    const fieldState = getFieldState(field.id);
    // New width names (small/medium/large) + legacy (full/half/third) for back-compat.
    const widthClass = {
      small:  'col-span-6',
      medium: 'col-span-8',
      large:  'col-span-12',
      full:   'col-span-12',
      half:   'col-span-6',
      third:  'col-span-4',
    }[field.width] || 'col-span-12';

    const isRequired = fieldState.required !== null ? fieldState.required : field.required;
    const isDisabled = fieldState.disabled || isFieldDisabledByVisibility(field);

    if (field.type === 'section_header') {
      return (
        <div key={field.id} className="col-span-12 mb-2 mt-4">
          <h3 className="text-lg font-semibold text-slate-900">{field.label}</h3>
          {field.help_text && <p className="text-sm text-slate-600">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'name') {
      const nameConfig = field.name_config || {};
      const showFirst = nameConfig.show_first_name !== false;
      const showMiddle = nameConfig.show_middle_name === true;
      const showLast = nameConfig.show_last_name !== false;
      const visibleCount = [showFirst, showMiddle, showLast].filter(Boolean).length;
      
      const getColSpan = () => {
        if (visibleCount === 1) return 'col-span-12';
        if (visibleCount === 2) return 'col-span-6';
        return 'col-span-4';
      };
      const colSpan = getColSpan();

      return (
        <div key={field.id} className="col-span-12">
          <Label className="text-slate-700 font-medium mb-2 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <div className="grid grid-cols-12 gap-3">
            {showFirst && (
              <div className={colSpan}>
                <Label className="text-slate-500 text-xs mb-1 block">
                  {nameConfig.first_name_label || 'First Name'}
                </Label>
                <Input
                  type="text"
                  value={formData[`${field.id}_first`] || ''}
                  onChange={(e) => handleChange(`${field.id}_first`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  required={isRequired}
                  disabled={isDisabled}
                  className="h-10 rounded-lg border-slate-200"
                />
              </div>
            )}
            {showMiddle && (
              <div className={colSpan}>
                <Label className="text-slate-500 text-xs mb-1 block">
                  {nameConfig.middle_name_label || 'Middle Name'}
                </Label>
                <Input
                  type="text"
                  value={formData[`${field.id}_middle`] || ''}
                  onChange={(e) => handleChange(`${field.id}_middle`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  disabled={isDisabled}
                  className="h-10 rounded-lg border-slate-200"
                />
              </div>
            )}
            {showLast && (
              <div className={colSpan}>
                <Label className="text-slate-500 text-xs mb-1 block">
                  {nameConfig.last_name_label || 'Last Name'}
                </Label>
                <Input
                  type="text"
                  value={formData[`${field.id}_last`] || ''}
                  onChange={(e) => handleChange(`${field.id}_last`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  disabled={isDisabled}
                  className="h-10 rounded-lg border-slate-200"
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (field.type === 'dropdown') {
      const lockedByTier = selectedTier && selectedTier.form_field_id === field.id;
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
            {lockedByTier && (
              <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded">
                Selected: {selectedTier.name}
              </span>
            )}
          </Label>
          <SearchableSelect
            id={field.id}
            value={formData[field.id] || ''}
            onChange={(v) => handleChange(field.id, v)}
            options={sortedChoiceOptions(field).map((opt) => ({
              value: resolveOptionValue(opt),
              label: opt.label,
            }))}
            required={isRequired}
            disabled={lockedByTier}
            className="w-full h-10 rounded-lg border border-slate-200 pl-3 pr-10 py-2 text-sm flex items-center focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-slate-50 disabled:text-slate-600 disabled:cursor-not-allowed"
          />
        </div>
      );
    }

    if (field.type === 'textarea') {
      const txt = formData[field.id] || '';
      const wc  = wordCount(txt);
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <textarea
            value={txt}
            onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
            placeholder={field.placeholder}
            required={isRequired}
            disabled={isDisabled}
            rows={3}
            maxLength={field.max_length || undefined}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-slate-50 disabled:text-slate-600"
          />
          {(field.max_length || field.max_words) && (
            <p className="text-xs text-slate-400 mt-1 text-right space-x-2">
              {field.max_length && <span>{txt.length} / {field.max_length} chars</span>}
              {field.max_words  && (
                <span className={wc > field.max_words ? 'text-red-500' : ''}>
                  {wc} / {field.max_words} words
                </span>
              )}
            </p>
          )}
        </div>
      );
    }

    if (field.type === 'checkbox') {
      // Check if this checkbox has multiple options
      const hasOptions = field.options && Array.isArray(field.options) && field.options.length > 0;
      
      if (hasOptions) {
        // Multi-select checkbox with options
        const lockedByTier = selectedTier && selectedTier.form_field_id === field.id;
        const selected     = formData[field.id] || [];
        const maxSel       = field.max_selections;
        const atMax        = maxSel && selected.length >= maxSel;
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
              {field.label} {isRequired && <span className="text-red-500">*</span>}
              {lockedByTier && (
                <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded">
                  Selected: {selectedTier.name}
                </span>
              )}
              {maxSel && (
                <span className={`ml-2 text-xs font-normal ${atMax ? 'text-amber-600' : 'text-slate-500'}`}>
                  ({selected.length}/{maxSel} selected)
                </span>
              )}
            </Label>
            <div className={getChoiceLayoutClass(field.column_layout)}>
              {sortedChoiceOptions(field).map((opt) => {
                const submitValue = resolveOptionValue(opt);
                const isChecked   = selected.includes(submitValue);
                const lockedOut   = atMax && !isChecked;
                const disabled    = lockedByTier || lockedOut;
                return (
                  <div key={opt.value ?? opt.label} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`${field.id}-${opt.value ?? opt.label}`}
                      checked={isChecked}
                      onChange={(e) => {
                        const current = formData[field.id] || [];
                        const newValue = e.target.checked
                          ? [...current, submitValue]
                          : current.filter(v => v !== submitValue);
                        handleChange(field.id, newValue);
                      }}
                      disabled={disabled}
                      title={lockedOut ? `Maximum ${maxSel} selections allowed` : undefined}
                      style={{ accentColor: '#091D40', width: 18, height: 18, appearance: 'auto', opacity: disabled ? 0.6 : 1 }}
                    />
                    <Label htmlFor={`${field.id}-${opt.value ?? opt.label}`}
                           className={`text-sm ${disabled ? 'text-slate-400' : 'text-slate-600'}`}>
                      {opt.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      } else {
        // Single boolean checkbox (no options)
        return (
          <div key={field.id} className={widthClass}>
            <label htmlFor={field.id} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                id={field.id}
                checked={formData[field.id] || false}
                onChange={(e) => handleChange(field.id, e.target.checked)}
                required={isRequired}
                style={{ accentColor: '#091D40', width: 18, height: 18, appearance: 'auto', marginTop: 2 }}
              />
              <span className="text-slate-700 font-medium text-sm">
                {field.label} {isRequired && <span className="text-red-500">*</span>}
              </span>
            </label>
          </div>
        );
      }
    }

    // Terms & Conditions checkbox
    if (field.type === 'terms_checkbox') {
      return (
        <div key={field.id} className={widthClass}>
          <label htmlFor={field.id} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              id={field.id}
              checked={formData[field.id] || false}
              onChange={(e) => handleChange(field.id, e.target.checked)}
              required={isRequired}
              style={{ accentColor: '#091D40', width: 18, height: 18, appearance: 'auto', marginTop: 4 }}
            />
            <span className="text-slate-700 text-sm">
              {field.label} {isRequired && <span className="text-red-500">*</span>}
              {field.terms_url && (
                <>
                  {' '}
                  <a
                    href={field.terms_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    /* stopPropagation keeps the click from toggling the wrapping
                       label's checkbox; the link itself must still open. */
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    View terms
                  </a>
                </>
              )}
            </span>
          </label>
          {field.help_text && <p className="text-xs text-slate-500 mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'radio') {
      const lockedByTier = selectedTier && selectedTier.form_field_id === field.id;
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
            {lockedByTier && (
              <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded">
                Selected: {selectedTier.name}
              </span>
            )}
          </Label>
          <div className={getChoiceLayoutClass(field.column_layout)}>
            {sortedChoiceOptions(field).map((opt) => {
              const submitValue = resolveOptionValue(opt);
              return (
              <div key={opt.value ?? opt.label} className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`${field.id}-${opt.value ?? opt.label}`}
                  name={field.id}
                  value={submitValue}
                  checked={formData[field.id] === submitValue}
                  onChange={(e) => handleChange(field.id, e.target.value)}
                  required={isRequired}
                  disabled={lockedByTier}
                  className="h-4 w-4 border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
                />
                <Label htmlFor={`${field.id}-${opt.value ?? opt.label}`} className={`text-sm ${lockedByTier ? 'text-slate-400' : 'text-slate-600'}`}>
                  {opt.label}
                </Label>
              </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Money inputs — custom_amount feeds the running total (see calculateTotal);
    // currency is plain data and never auto-added to the price.
    if (field.type === 'custom_amount' || field.type === 'currency') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">₹</span>
            <Input
              type="text"
              inputMode="decimal"
              value={formData[field.id] || ''}
              onChange={(e) => {
                // Only allow numbers and a single decimal point (keep the first dot).
                const value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                handleChange(field.id, value);
              }}
              placeholder={field.placeholder || '0.00'}
              required={isRequired}
              disabled={isDisabled}
              className="h-10 pl-7 rounded-lg border-slate-200 focus:ring-primary/50"
            />
          </div>
          {field.help_text && <p className="text-xs text-slate-500 mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'rating') {
      const maxRating = parseInt(field.max_rating, 10) || 5;
      const selectedRating = parseInt(formData[field.id], 10) || 0;
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <div className="flex items-center gap-1">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleChange(field.id, value)}
                disabled={isDisabled}
                aria-label={`Rate ${value} out of ${maxRating}`}
                className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Star className={`w-6 h-6 transition-colors ${value <= selectedRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Handle phone/mobile number fields - numbers only
    if (field.type === 'phone' || field.type === 'tel') {
      const allowedCountries = field.phone_country_mode === 'allowed'
        && Array.isArray(field.phone_allowed_countries)
        && field.phone_allowed_countries.length > 0
          ? field.phone_allowed_countries
          : undefined;
      const defaultCountry = field.phone_default_country
        || (allowedCountries ? allowedCountries[0] : 'IN');
      const effectiveCountry = formData[`${field.id}_country`] || defaultCountry;
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <PhoneInput
            value={formData[field.id] || ''}
            onChange={(v) => handleChange(field.id, v)}
            countryCode={effectiveCountry}
            onCountryChange={(c) => handleChange(`${field.id}_country`, c)}
            required={isRequired}
            disabled={isDisabled}
            allowedCountries={allowedCountries}
          />
        </div>
      );
    }

    // Handle number fields - numbers only
    if (field.type === 'number') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            value={formData[field.id] || ''}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9.]/g, '');
              handleChange(field.id, value);
            }}
            placeholder={field.placeholder}
            required={isRequired}
            disabled={isDisabled}
            min={field.min_value ?? undefined}
            max={field.max_value ?? undefined}
            className="h-10 rounded-lg border-slate-200 focus:ring-primary/50"
          />
        </div>
      );
    }

    // Handle email fields - with email validation
    if (field.type === 'email') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <Input
            type="email"
            value={formData[field.id] || ''}
            onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
            placeholder={field.placeholder || 'example@email.com'}
            required={isRequired}
            disabled={isDisabled}
            maxLength={field.max_length || undefined}
            pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
            className="h-10 rounded-lg border-slate-200 focus:ring-primary/50"
          />
        </div>
      );
    }

    // File upload — uploads to backend, stores URL in form_data
    if (field.type === 'file_upload') {
      const stored    = formData[field.id];
      const uploading = stored?.uploading;
      const fileName  = stored?.name || null;
      const fileUrl   = stored?.url  || null;

      const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Client-side size cap: audio/video fields allow up to 25MB, everything
        // else 5MB. field.max_file_size_mb may lower but never raise the cap.
        const capMb = ['audio', 'video', 'audio_video'].includes(field.accept_types) ? 25 : 5;
        const maxMb = Math.min(field.max_file_size_mb || capMb, capMb);
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(`"${file.name}" is too large. Maximum file size is ${maxMb} MB.`);
          e.target.value = '';
          return;
        }
        handleChange(field.id, { uploading: true, name: file.name });
        try {
          const fd = new FormData();
          fd.append('file', file);
          // Metadata keys the upload endpoint reads to associate the file with
          // its campaign/field/person: campaign_id, field_id, registrant_name.
          fd.append('campaign_id', campaign.id);
          fd.append('field_id', field.id);
          const registrantName = resolveRegistrantName();
          if (registrantName) fd.append('registrant_name', registrantName);
          const resp = await axios.post(
            `${API_BASE_URL}/api/uploads/public`,
            fd,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
          if (resp.data?.success) {
            handleChange(field.id, {
              url:  resp.data.url,
              name: resp.data.filename,
              size: resp.data.size
            });
            toast.success('File uploaded');
          } else {
            throw new Error('Upload failed');
          }
        } catch (err) {
          toast.error(err.response?.data?.detail || 'File upload failed');
          handleChange(field.id, null);
        }
      };

      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
            {field.label} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <div className="flex items-center gap-3">
            <label
              htmlFor={`file-${field.id}`}
              className={`inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${uploading ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:bg-primary/90'}`}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
              {uploading ? 'Uploading...' : (fileUrl ? 'Change file' : 'Choose file')}
            </label>
            <input
              id={`file-${field.id}`}
              type="file"
              accept={ACCEPT_ATTRS[field.accept_types]}
              onChange={handleUpload}
              required={isRequired && !fileUrl}
              disabled={isDisabled || uploading}
              className="hidden"
            />
            {fileUrl ? (
              <a href={`${API_BASE_URL}${fileUrl}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate max-w-[250px]">
                {fileName}
              </a>
            ) : (
              <span className="text-sm text-slate-600 truncate">
                {fileName || 'No file chosen'}
              </span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className={widthClass}>
        <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
          {field.label} {isRequired && <span className="text-red-500">*</span>}
        </Label>
        <Input
          type={field.type}
          value={formData[field.id] || ''}
          onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
          placeholder={field.placeholder}
          required={isRequired}
          disabled={isDisabled}
          maxLength={field.max_length || undefined}
          className="h-10 rounded-lg border-slate-200 focus:ring-primary/50"
        />
        {field.max_length && (
          <p className="text-xs text-slate-400 mt-1 text-right">
            {(formData[field.id] || '').length} / {field.max_length}
          </p>
        )}
      </div>
    );
  };

  // Get theme from landing page config or defaults
  const getTheme = () => {
    const config = campaign?.landing_page_config;
    return {
      primary: config?.theme?.primary_color || '#091D40',
      secondary: config?.theme?.secondary_color || '#14b8a6',
      background: config?.theme?.background_color || '#ffffff',
      text: config?.theme?.text_color || '#1e293b'
    };
  };

  const theme = campaign ? getTheme() : {};

  // Render landing page sections
  const renderSection = (section) => {
    switch (section.type) {
      case 'hero':
        return (
          <section 
            key={section.id} 
            className="relative min-h-[80vh] flex items-center justify-center overflow-hidden"
            style={{
              backgroundImage: section.image_url ? `url(${toAbsUrl(section.image_url)})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: section.image_url ? undefined : theme.primary
            }}
          >
            {section.image_url && (
              <div className="absolute inset-0 bg-black/50" />
            )}
            <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
                {section.title || campaign.name}
              </h1>
              {section.subtitle && (
                <p className="text-xl md:text-2xl text-white/90 mb-8">
                  {section.subtitle}
                </p>
              )}
              {section.content && (
                <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
                  {section.content}
                </p>
              )}
              
              {/* Registration Button based on status */}
              {registrationStatus === 'open' && (
                <Button 
                  onClick={handleRegisterClick}
                  size="lg"
                  className="px-8 py-6 text-lg font-semibold shadow-lg"
                  style={{ backgroundColor: theme.secondary }}
                >
                  Register Now
                </Button>
              )}
              
              {registrationStatus === 'not_started' && (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 inline-block">
                  <RegistrationComingSoon 
                    campaignName={campaign.name}
                    startDate={campaign.registration_start_date}
                  />
                </div>
              )}
              
              {registrationStatus === 'ended' && (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 inline-block">
                  <div className="flex items-center gap-2 text-white/90">
                    <Lock className="w-5 h-5" />
                    <span className="font-semibold">Registration Closed</span>
                  </div>
                  <p className="text-white/70 text-sm mt-2">
                    Registration ended on {new Date(campaign.registration_end_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              
              {registrationStatus === 'disabled' && (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 inline-block">
                  <div className="flex items-center gap-2 text-white/90">
                    <Lock className="w-5 h-5" />
                    <span className="font-semibold">Registrations Currently Closed</span>
                  </div>
                  <p className="text-white/70 text-sm mt-2">
                    Registration has been paused by the organizer
                  </p>
                </div>
              )}
              
              {registrationStatus === 'closed' && (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 inline-block">
                  <div className="flex items-center gap-2 text-white/90">
                    <Lock className="w-5 h-5" />
                    <span>Registration currently closed</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        );

      case 'about':
        return (
          <section key={section.id} className="py-16 px-4 bg-white">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4" style={{ color: theme.text }}>
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-lg text-slate-600 mb-6">{section.subtitle}</p>
              )}
              {section.content && (
                <p className="text-slate-600 leading-relaxed">{section.content}</p>
              )}
              {section.features && (
                <div className="grid md:grid-cols-3 gap-6 mt-8">
                  {section.features.map((feature, i) => (
                    <Card key={i} className="p-6 text-center">
                      <div className="text-4xl mb-3">{feature.icon}</div>
                      <h3 className="font-semibold mb-2">{feature.title}</h3>
                      <p className="text-sm text-slate-600">{feature.desc}</p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </section>
        );

      case 'speakers':
        const speakerItems = section.items || section.speakers || [];
        const speakerCount = speakerItems.length;
        // Dynamic grid alignment based on number of speakers
        const getSpeakersGridClass = () => {
          if (speakerCount === 1) return 'flex justify-center';
          if (speakerCount === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto';
          if (speakerCount === 3) return 'grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto';
          if (speakerCount === 4) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6';
          return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6';
        };
        return (
          <section key={section.id} className="py-16 px-4 bg-slate-50">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4" style={{ color: theme.text }}>
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-center text-slate-600 mb-10">{section.subtitle}</p>
              )}
              <div className={getSpeakersGridClass()}>
                {speakerItems.map((speaker, i) => (
                  <Card key={i} className={`p-6 text-center ${speakerCount === 1 ? 'max-w-xs w-full' : ''}`}>
                    {(speaker.photo || speaker.image_url) && (
                      <img 
                        src={toAbsUrl(speaker.photo || speaker.image_url)}
                        alt={speaker.name}
                        className="w-[115px] h-[115px] rounded-full mx-auto mb-4 object-cover"
                      />
                    )}
                    <h3 className="text-lg font-semibold">{speaker.name}</h3>
                    <p className="text-base text-slate-600">{speaker.title}</p>
                    {speaker.bio && <p className="text-sm text-slate-500 mt-2">{speaker.bio}</p>}
                  </Card>
                ))}
              </div>
            </div>
          </section>
        );

      case 'schedule':
        return (
          <section key={section.id} className="py-16 px-4 bg-white">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4" style={{ color: theme.text }}>
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-center text-slate-600 mb-10">{section.subtitle}</p>
              )}
              <div className="space-y-4">
                {(section.items || section.schedule || []).map((item, i) => (
                  <Card key={i} className="p-4 flex items-start gap-4">
                    <div className="text-sm font-semibold text-slate-500 w-20">
                      {item.time}
                    </div>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      {item.description && (
                        <p className="text-sm text-slate-600">{item.description}</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        );

      case 'pricing':
        const pricingItems = section.items || section.tiers || [];
        const pricingCount = pricingItems.length;
        // Dynamic grid alignment based on number of items
        const getPricingGridClass = () => {
          if (pricingCount === 1) return 'flex justify-center';
          if (pricingCount === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto';
          if (pricingCount === 3) return 'grid grid-cols-1 md:grid-cols-3 gap-6';
          if (pricingCount === 4) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6';
          return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
        };
        return (
          <section key={section.id} className="py-16 px-4 bg-slate-50">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4" style={{ color: theme.text }}>
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-center text-slate-600 mb-10">{section.subtitle}</p>
              )}
              <div className={getPricingGridClass()}>
                {pricingItems.map((tier, i) => (
                  <Card key={i} className={`p-6 text-center ${pricingCount === 1 ? 'max-w-sm w-full' : ''} ${tier.featured ? 'ring-2 ring-primary' : ''}`}>
                    {tier.featured && (
                      <span className="inline-block px-3 py-1 text-xs font-semibold bg-primary text-white rounded-full mb-4">
                        Most Popular
                      </span>
                    )}
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                    <div className="text-3xl font-bold my-4" style={{ color: theme.primary }}>
                      {tier.price}
                    </div>
                    <ul className="text-sm text-slate-600 space-y-2 mb-6">
                      {(Array.isArray(tier.features) ? tier.features : (tier.features || '').split(',')).map((f, j) => (
                        <li key={j}>✓ {typeof f === 'string' ? f.trim() : f}</li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => handleRegisterClick(tier)}
                      variant={tier.featured ? 'default' : 'outline'}
                      className="w-full"
                    >
                      Register
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        );

      case 'faq':
        return (
          <section key={section.id} className="py-16 px-4 bg-white">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4" style={{ color: theme.text }}>
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-center text-slate-600 mb-10">{section.subtitle}</p>
              )}
              <div className="space-y-3">
                {(section.items || section.faqs || []).map((faq, i) => (
                  <Card key={i} className="overflow-hidden">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full p-4 flex items-center justify-between text-left font-semibold"
                    >
                      {faq.question}
                      {expandedFaq === i ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    {expandedFaq === i && (
                      <div className="px-4 pb-4 text-slate-600">
                        {faq.answer}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          </section>
        );

      case 'contact':
        return (
          <section key={section.id} className="py-16 px-4" style={{ backgroundColor: theme.primary }}>
            <div className="max-w-4xl mx-auto text-center text-white">
              <h2 className="text-3xl font-bold mb-4">{section.title}</h2>
              {section.subtitle && (
                <p className="text-white/80 mb-8">{section.subtitle}</p>
              )}
              <div className="flex flex-wrap justify-center gap-6">
                {section.email && (
                  <a href={`mailto:${section.email}`} className="flex items-center gap-2 text-white/90 hover:text-white">
                    <Mail className="w-5 h-5" /> {section.email}
                  </a>
                )}
                {section.phone && (
                  <a href={`tel:${section.phone}`} className="flex items-center gap-2 text-white/90 hover:text-white">
                    <Phone className="w-5 h-5" /> {section.phone}
                  </a>
                )}
              </div>
              {registrationStatus === 'open' && (
                <Button 
                  onClick={handleRegisterClick}
                  size="lg"
                  className="mt-8 px-8"
                  style={{ backgroundColor: theme.secondary }}
                >
                  Register Now
                </Button>
              )}
              {registrationStatus === 'ended' && (
                <div className="mt-8 inline-flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2">
                  <Lock className="w-4 h-4" />
                  <span>Registration Closed</span>
                </div>
              )}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading event...</p>
        </div>
      </div>
    );
  }

  // Show archived page for archived campaigns
  if (error === 'archived' || campaign?.status === 'archived') {
    return <CampaignArchivedPage campaignName={campaign?.name} />;
  }

  if (!campaign || error === 'not_found') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Event Not Found</h2>
          <p className="text-slate-600">This event is either inactive or does not exist.</p>
        </Card>
      </div>
    );
  }

  const registrationStatus = getRegistrationStatus();

  const landingConfig = campaign.landing_page_config;
  const sections = landingConfig?.sections || [];
  const visibleSections = sections.filter(s => s.visible !== false).sort((a, b) => a.order - b.order);

  // If no landing page configured, show default hero
  const hasLandingPage = visibleSections.length > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Render Landing Page Sections */}
      {hasLandingPage ? (
        visibleSections.map(section => renderSection(section))
      ) : (
        // Default hero if no landing page configured
        <section 
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: theme.primary }}
        >
          <div className="text-center px-4 max-w-4xl mx-auto">
            {campaign.logo_url && (
              <img src={toAbsUrl(campaign.logo_url)} alt={campaign.name} className="h-20 mx-auto mb-6" />
            )}
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
              {campaign.name}
            </h1>
            <p className="text-xl text-white/80 mb-4">{campaign.organization_name}</p>
            {campaign.description && (
              <p className="text-lg text-white/70 mb-8 max-w-2xl mx-auto">
                {campaign.description}
              </p>
            )}
            <Button 
              onClick={handleRegisterClick}
              size="lg"
              className="px-8 py-6 text-lg font-semibold bg-white text-slate-900 hover:bg-slate-100"
            >
              Register Now
            </Button>
          </div>
        </section>
      )}

      {/* Registration Modal */}
      {showRegistrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold">
                {showOfflineSuccess ? 'Registration Submitted!' : registrationComplete ? 'Registration Complete!' : showPayment ? 'Complete Payment' : 'Register for ' + campaign.name}
              </h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={closeModal}
                disabled={submitting || (showPayment && !registrationComplete && !showOfflineSuccess)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {showOfflineSuccess && offlineOtp ? (
                // Offline Payment Success - Show OTP
                (() => {
                  // Extract registrant name from form data
                  const getRegistrantName = () => {
                    const fields = campaign?.form_config?.fields || [];
                    for (const field of fields) {
                      if (field.type === 'name') {
                        const firstName = formData[`${field.id}_first`] || '';
                        const lastName = formData[`${field.id}_last`] || '';
                        const fullName = `${firstName} ${lastName}`.trim();
                        if (fullName) return fullName;
                      }
                    }
                    if (formData.name) return formData.name;
                    if (formData.full_name) return formData.full_name;
                    return '';
                  };
                  const registrantName = getRegistrantName();
                  const eventName = campaign?.name || 'the event';
                  
                  return (
                    <div className="text-center py-8">
                      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                      </div>
                      
                      <h3 className="text-2xl font-bold text-slate-900 mb-2">
                        {registrantName ? `Hey ${registrantName}!` : 'Registration Submitted!'}
                      </h3>
                      
                      <p className="text-slate-600 mb-6">
                        You have successfully registered for <strong>{eventName}</strong>. 
                        Please share the following OTP after paying at the Registration Counter to complete your registration.
                      </p>
                      
                      {/* OTP Display */}
                      <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-6 mb-6 mx-auto max-w-xs">
                        <p className="text-white/80 text-sm mb-2">Your Registration OTP</p>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-4xl font-mono font-bold text-white tracking-widest">
                            {offlineOtp}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(offlineOtp);
                              toast.success('OTP copied to clipboard!');
                            }}
                            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                            title="Copy OTP"
                          >
                            <Copy className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-2 max-w-sm mx-auto">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>OTP has been emailed to your registered email</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <CreditCard className="w-4 h-4 text-primary flex-shrink-0" />
                          <span>Amount to pay: <strong className="text-primary">₹{calculateTotal().toFixed(2)}</strong></span>
                        </div>
                      </div>
                      
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left max-w-sm mx-auto mb-6">
                        <p className="text-sm text-amber-800">
                          <strong>Important:</strong> Please save this OTP. You&apos;ll need to present it at the event venue along with the payment to complete your registration.
                        </p>
                      </div>
                      
                      <Button onClick={closeModal} size="lg">
                        <Home className="w-4 h-4 mr-2" />
                        Back to Event Page
                      </Button>
                    </div>
                  );
                })()
              ) : registrationComplete ? (
                // Success State
                <div className="text-center py-8">
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-green-600 mb-2">Registration Successful!</h3>
                  <p className="text-slate-600 mb-6">Thank you for registering for {campaign.name}</p>
                  <div className="bg-slate-50 rounded-lg p-4 mb-6 inline-block">
                    <p className="text-sm text-slate-500 mb-1">Registration ID</p>
                    <p className="font-mono font-semibold">{registrationId}</p>
                  </div>
                  <p className="text-sm text-slate-500 mb-6">
                    A confirmation email has been sent to your registered email address.
                  </p>
                  <Button onClick={closeModal} size="lg">
                    Back to Event Page
                  </Button>
                </div>
              ) : showPayment && registrationData ? (
                // Payment State
                <PaymentCheckout
                  campaignId={campaign.id}
                  registrationId={registrationData.id}
                  amount={registrationData.total_amount}
                  buyerName={registrationData.buyer_name}
                  buyerEmail={registrationData.buyer_email}
                  buyerPhone={registrationData.buyer_phone}
                  purpose={`Registration for ${campaign.name}`}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentFailure={handlePaymentFailure}
                />
              ) : (
                // Registration Form
                campaign.form_config && campaign.form_config.fields ? (
                  // noValidate — see PublicRegistration: the browser's uneditable popups would
                  // pre-empt the organizer's own validation messages. handleSubmit validates every
                  // field itself, and the server re-checks.
                  <form onSubmit={handleSubmit} noValidate className="grid grid-cols-12 gap-4">
                    {campaign.form_config.fields.map((field) => renderField(field))}

                    {/* Coupon Code */}
                    {campaign.form_config.base_price > 0 && (
                      <div className="col-span-12 mt-2 pt-4 border-t">
                        <Label className="text-slate-700 font-medium mb-1.5 block text-sm">
                          Have a coupon code?
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="Enter coupon code"
                            disabled={couponApplied}
                            className="h-10 uppercase"
                          />
                          {couponApplied ? (
                            <Button type="button" variant="outline" onClick={removeCoupon} className="h-10">
                              Remove
                            </Button>
                          ) : (
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={validateCoupon}
                              disabled={validatingCoupon || !couponCode.trim()}
                              className="h-10"
                            >
                              {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                            </Button>
                          )}
                        </div>
                        {couponApplied && (
                          <p className="text-sm text-green-600 mt-1">
                            ✓ Coupon applied! {describeCoupon(couponApplied)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Price Summary */}
                    {campaign.form_config.base_price > 0 && (
                      <div className="col-span-12 mt-2 pt-4 border-t">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">Base Price</span>
                          <span>₹{(campaign.form_config.base_price || 0).toFixed(2)}</span>
                        </div>
                        {couponApplied && (
                          <div className="flex justify-between text-sm text-green-600 mb-1">
                            <span>Discount</span>
                            <span>-₹{couponDiscountAmount().toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-lg pt-2 border-t border-dashed">
                          <span>Total</span>
                          <span style={{ color: theme.primary }}>₹{calculateTotal().toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Submit Button */}
                    <div className="col-span-12 mt-4">
                      <Button
                        type="submit"
                        disabled={submitting || !!liveAmountError}
                        className="w-full h-12 text-base font-semibold"
                        style={{ backgroundColor: theme.primary }}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : calculateTotal() > 0 ? (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Continue to Payment - ₹{calculateTotal().toFixed(2)}
                          </>
                        ) : (
                          'Complete Registration'
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600">Registration form is not yet configured.</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default PublicLandingPage;
