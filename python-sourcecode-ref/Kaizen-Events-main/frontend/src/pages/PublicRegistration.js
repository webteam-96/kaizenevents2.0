import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { CheckCircle, Loader2, CreditCard, AlertCircle, Calendar, MapPin, Users, Home, ArrowLeft, Search, UserCheck, Lock, ChevronDown, Banknote, Copy, Mail, Clock, Star } from 'lucide-react';
import { toast } from 'sonner';
import PaymentCheckout from '../components/PaymentCheckout';
import { RichTextView } from '../components/ui/RichTextInput';
import { FORM_TEMPLATES, DEFAULT_FORM_THEME, getFormTemplate } from '../data/formTemplates';
import { format, parseISO } from 'date-fns';
import { NotFoundPage, CampaignArchivedPage, RegistrationClosedPage } from './ErrorPages';
import { usePublicForm } from '../hooks/usePublicForm';
import PhoneInput from '../components/ui/PhoneInput';
import SignaturePad from '../components/ui/SignaturePad';
import {
  isFieldHidden, isFieldDisabledByVisibility, applyTextCase, sortedChoiceOptions,
  sanitizeTextInput, wordCount, resolveOptionValue, omitHiddenFieldValues,
} from '../utils/fieldProperties';
import { resolveRegistrantContact } from '../utils/registrantContact';
import { skippedPageFieldIds } from '../utils/pageFlow';
import { validateFieldValue, gatewayAmountFieldError } from '../utils/fieldValidation';
import { applyCouponToTotal, describeCoupon } from '../utils/couponPricing';
import { parseServerDate, formatServerDate } from '../utils/serverTime';
import KaizenBrandFooter from '../components/KaizenBrandFooter';
import { hexToRgba } from '../utils/colorUtils';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
// Convert server-relative upload URLs to absolute (otherwise <img> resolves them against the frontend origin)
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${API_BASE_URL}${url}` : (url || '');

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

// file_upload accept attribute by configured accept_types (default: any file)
const ACCEPT_ATTRS = { audio: 'audio/*', video: 'video/*', audio_video: 'audio/*,video/*' };

const PublicRegistration = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  const [error, setError] = useState(null);
  // Per-field validation errors, keyed by field id. Populated when the registrant
  // tries to advance/submit and cleared as soon as they edit the offending field,
  // so the message disappears while they are fixing it rather than after.
  const [fieldErrors, setFieldErrors] = useState({});

  // Offline Payment State
  const [paymentMethod, setPaymentMethod] = useState('online'); // 'online' or 'offline'
  const [offlineOtp, setOfflineOtp] = useState(null);
  const [showOfflineSuccess, setShowOfflineSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); // 1-indexed for multi-page forms
  const pageHistoryRef = React.useRef([]); // navigation stack for accurate Previous with page rules

  // Closed Group Campaign State
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [verifyingMember, setVerifyingMember] = useState(false);

  // Get form theme from campaign settings or use default
  const getFormTheme = () => {
    const templateId = campaign?.form_config?.template_id;
    if (templateId) {
      return getFormTemplate(templateId).theme;
    }
    return campaign?.form_config?.theme || DEFAULT_FORM_THEME;
  };

  // Check if campaign is closed group type
  const isClosedGroup = campaign?.campaign_type === 'closed_group';

  // Whether this campaign will collect money. Determines whether we force the
  // Phone field to be required (gateways reject orders with a blank phone).
  const isPaidCampaign = campaign?.payment_enabled !== false && !!(
    campaign?.payment_account_id ||
    (campaign?.form_config?.base_price > 0) ||
    (Array.isArray(campaign?.form_config?.pricing_rules) && campaign.form_config.pricing_rules.length > 0)
  );

  useEffect(() => {
    fetchCampaignData();
  }, [slug]);

  // Fetch members when campaign is loaded and is closed group
  useEffect(() => {
    if (isClosedGroup && campaign?.id) {
      fetchMembers();
    }
  }, [isClosedGroup, campaign?.id]);

  const fetchCampaignData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/public/campaigns/${slug}`);
      const campaignData = response.data;

      // Event must be activated for the registration URL to open. Draft / closed events
      // are gated here so the public form never renders — backend rejects submit anyway.
      if (campaignData.status !== 'active') {
        setError('not_active');
        setCampaign(campaignData);
        setLoading(false);
        return;
      }

      // If registration is disabled, show closed message
      if (campaignData.registration_enabled === false) {
        setError('registration_closed');
        setCampaign(campaignData);
        setLoading(false);
        return;
      }

      // Registration-window pre-check — the backend stores these dates UTC-naive,
      // so parse via parseServerDate to compare against the real current instant.
      const regStart = parseServerDate(campaignData.registration_start_date);
      const regEnd = parseServerDate(campaignData.registration_end_date);
      if (regStart && regStart.getTime() > Date.now()) {
        setError('registration_not_started');
        setCampaign(campaignData);
        setLoading(false);
        return;
      }
      if (regEnd && regEnd.getTime() < Date.now()) {
        setError('registration_closed');
        setCampaign(campaignData);
        setLoading(false);
        return;
      }

      // If using external form, redirect to external URL
      if (campaignData.use_external_form && campaignData.external_form_url) {
        window.location.href = campaignData.external_form_url;
        return;
      }

      setCampaign(campaignData);
    } catch (error) {
      if (error.response?.status === 404) {
        setError('not_found');
      } else if (error.response?.status === 410) {
        setError('archived');
      } else {
        setError('error');
        toast.error('Campaign not found or not active');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (search = '') => {
    setLoadingMembers(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/campaigns/${campaign.id}/members/public${params}`
      );
      setMembers(response.data.members || []);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      toast.error('Failed to load member list');
    } finally {
      setLoadingMembers(false);
    }
  };

  // Debounced search for members
  useEffect(() => {
    if (isClosedGroup && campaign?.id && memberSearch.length >= 2) {
      const timer = setTimeout(() => {
        fetchMembers(memberSearch);
      }, 300);
      return () => clearTimeout(timer);
    } else if (isClosedGroup && campaign?.id && memberSearch.length === 0) {
      fetchMembers();
    }
  }, [memberSearch, isClosedGroup, campaign?.id]);

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    if (!memberSearch) return members;
    const search = memberSearch.toLowerCase();
    return members.filter(m => 
      m.name?.toLowerCase().includes(search) ||
      m.mobile_masked?.includes(search)
    );
  }, [members, memberSearch]);

  const selectMember = async (member) => {
    if (member.status === 'registered') {
      toast.error('This member has already registered');
      return;
    }

    setVerifyingMember(true);
    setShowMemberDropdown(false);

    try {
      // Verify member and get prefill data
      const response = await axios.get(
        `${API_BASE_URL}/api/campaigns/${campaign.id}/members/${member.id}/verify`
      );

      if (response.data.can_register) {
        setSelectedMember(member);
        
        // Prefill form data
        const prefillData = response.data.prefill_data || {};
        const newFormData = {
          ...formData,
          member_id: prefillData.member_id,
        };

        // Map prefill data to form fields
        const fields = campaign?.form_config?.fields || [];
        fields.forEach(field => {
          if (field.type === 'name' && prefillData.name) {
            // Try to split the name
            const nameParts = prefillData.name.split(' ');
            newFormData[`${field.id}_first`] = nameParts[0] || '';
            newFormData[`${field.id}_last`] = nameParts.slice(1).join(' ') || '';
            newFormData[field.id] = prefillData.name;
          } else if (field.type === 'email' && prefillData.email) {
            newFormData[field.id] = prefillData.email;
          } else if ((field.type === 'phone' || field.type === 'tel') && prefillData.mobile) {
            newFormData[field.id] = prefillData.mobile;
          }
        });

        // Also add custom fields if they exist
        if (prefillData.custom_fields) {
          Object.entries(prefillData.custom_fields).forEach(([key, value]) => {
            newFormData[key] = value;
          });
        }

        setFormData(newFormData);
        setMemberSearch(member.name);
        toast.success(`Welcome, ${member.name}! Your details have been prefilled.`);
      }
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error('This member has already registered');
      } else {
        toast.error('Failed to verify member');
      }
    } finally {
      setVerifyingMember(false);
    }
  };

  const clearSelectedMember = () => {
    setSelectedMember(null);
    setMemberSearch('');
    setFormData({});
    // A different member is a different person — never amend the previous one's attempt.
    setPendingAttempt(null);
  };

  const handleChange = (fieldId, value) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // Name parts are stored as "{id}_first" etc. but the error hangs off the base
    // id, so strip the suffix before clearing.
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
        // A registrant who picked "10 members" then switched away should not still be
        // charged for those members once the field is no longer shown.
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

  // Check if a field should be visible based on field rules
  const isFieldVisible = (fieldId) => {
    return getFieldState(fieldId).visible;
  };

  // Real-time gateway-bound check on any custom_amount (donation) field — separate from
  // fieldErrors, which only updates when validateCurrentPage() runs on Continue/Submit
  // click. This recomputes on every keystroke so the Submit button greys out the instant
  // a typed amount falls outside what the payment gateway will accept — required or not,
  // since gatewayAmountFieldError itself treats a typed 0 the same as any other
  // sub-minimum amount, and stays silent on a still-blank field either way (so this never
  // shows a premature error before the registrant has typed anything).
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

  // Whether any Field Rule's "show" action targets this field. When it does, the
  // field's static Visibility="hide" setting is just its starting state — isFieldVisible
  // (the rule engine) becomes authoritative and must be allowed to reveal it. Without this,
  // "Hide (default)" + a "show" rule (the documented way to build a conditionally-revealed
  // field — see FieldEditor's Visibility hint) was permanently hidden no matter what the
  // rule's condition evaluated to, because callers checked isFieldHidden() as an
  // unconditional veto ahead of isFieldVisible().
  const hasShowRuleTargeting = (fieldId) => {
    const fieldRules = campaign?.form_config?.field_rules || [];
    return fieldRules.some((rule) =>
      rule.actions?.some((a) => a.action === 'show' && a.target_field_id === fieldId)
    );
  };

  // A field is permanently, statically hidden only when its Visibility="hide" AND no
  // rule's "show" action can ever reveal it. Use this instead of bare isFieldHidden()
  // wherever that static flag is combined with isFieldVisible() to decide rendering,
  // required-ness, or validation — the three call sites must agree.
  const isStaticallyHidden = (field) => isFieldHidden(field) && !hasShowRuleTargeting(field.id);

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
    toast.info('Coupon removed');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // For closed group, ensure member is selected
    if (isClosedGroup && !selectedMember) {
      toast.error('Please select your name from the member list');
      return;
    }

    setSubmitting(true);

    try {
      // Tell the server which fields the registrant never saw — hidden by conditional
      // rules, or hidden outright via the field's Visibility setting — so it doesn't
      // enforce "required" on them. The client is the source of truth for visibility
      // — this prevents false required errors from any drift between the client and
      // server rule engines. Omitting the Visibility-hidden ones made a required field
      // the admin had hidden un-submittable: nothing rendered it, so nothing could
      // fill it, and the server rejected every submission as missing.
      // isStaticallyHidden (not bare isFieldHidden) so a field a "show" rule currently
      // has revealed and filled isn't wrongly reported as unseen/unrequired.
      const allFormFields = campaign?.form_config?.fields || [];
      const hiddenFieldIds = allFormFields
        .filter((f) => f.id && (!isFieldVisible(f.id) || isStaticallyHidden(f)))
        .map((f) => f.id);

      // Pages of a multi-page form these answers route past count as unseen too. The rules
      // that hide a field and the rules that skip a page are separate systems, and only the
      // second explains a page filled in and then routed around after a change of mind.
      skippedPageFieldIds(campaign?.form_config, formData).forEach((id) => {
        if (!hiddenFieldIds.includes(id)) hiddenFieldIds.push(id);
      });

      // ...and drop their answers outright rather than just flagging them. Switching
      // "Member type" from COG to Rotarian hides the COG name dropdown but leaves the
      // name already picked in state; submitted, that registration carries two names and
      // every downstream reader has to guess which one is the person. Priced and
      // submitted from the same stripped copy so the two can't disagree.
      const submittedFormData = omitHiddenFieldValues(formData, hiddenFieldIds);

      // Free events collect no money: force the total to 0 and skip the price check
      // entirely (the backend confirms the registration at ₹0 regardless of form pricing).
      let totalAmount = 0;
      if (campaign.payment_enabled !== false) {
        // Get authoritative price from backend — prevents "Amount mismatch" on submit
        // when the form has pricing_rules the frontend doesn't evaluate
        totalAmount = calculateTotal();
        try {
          const priceResp = await axios.post(
            `${API_BASE_URL}/api/campaigns/${campaign.id}/calculate-price`,
            { form_data: submittedFormData, coupon_code: couponApplied?.code || null }
          );
          if (priceResp.data && typeof priceResp.data.total === 'number') {
            totalAmount = priceResp.data.total;
          }
        } catch (priceErr) {
          // Fall back to local calculation if backend price check fails
          console.warn('Backend price calculation failed, using local total:', priceErr);
        }
      }

      // Include member_id for closed group campaigns
      const submitData = {
        campaign_id: campaign.id,
        form_data: submittedFormData,
        total_amount: totalAmount,
        coupon_code: couponApplied?.code || null,
        hidden_field_ids: hiddenFieldIds
      };

      if (isClosedGroup && selectedMember) {
        submitData.member_id = selectedMember.id;
      }

      // Correcting the attempt already made on this page rather than starting another. The
      // server ignores these unless the token matches an outstanding registration of its own,
      // in which case the submission is a new registration exactly as before.
      if (pendingAttempt) {
        submitData.existing_registration_id = pendingAttempt.id;
        submitData.payment_token = pendingAttempt.token;
      }

      // The campaign may be configured as offline-only at the campaign level
      // (campaign.payment_collection_method === 'offline'), in which case the
      // payment-method toggle isn't shown and the local `paymentMethod` state
      // stays at its 'online' default. Treat that as offline too.
      const effectivePaymentMethod =
        campaign.payment_collection_method === 'offline' ? 'offline' : paymentMethod;

      // Check if offline payment is selected
      if (effectivePaymentMethod === 'offline' && totalAmount > 0) {
        // Submit offline registration
        const response = await axios.post(`${API_BASE_URL}/api/registrations/offline/submit`, submitData);
        const regData = response.data;
        
        setRegistrationId(regData.registration_id);
        setOfflineOtp(regData.otp);
        setShowOfflineSuccess(true);
        toast.success('Registration submitted! Check your email for the OTP.');
        return;
      }
      
      // Submit registration first (online payment flow)
      const response = await axios.post(`${API_BASE_URL}/api/registrations/submit`, submitData);

      const regData = response.data;
      setRegistrationId(regData.id);
      setPendingAttempt(regData.payment_token ? { id: regData.id, token: regData.payment_token } : null);

      // Resolve buyer fields. Form data is keyed by random field ids (`field_abc123`),
      // so `formData.name` is never populated — resolveRegistrantContact walks
      // form_config instead, ranked the same way the server ranks it, so the name in the
      // payment popup is the name on the receipt. Reading the stripped copy keeps a
      // question the registrant switched away from out of it.
      const contact = resolveRegistrantContact(allFormFields, submittedFormData);

      const resolvedName =
        contact.name || selectedMember?.name || 'Guest';
      const resolvedEmail =
        contact.email || selectedMember?.email || '';
      const resolvedPhone =
        contact.phone || selectedMember?.mobile || '';

      setRegistrationData({
        ...regData,
        buyer_name: resolvedName,
        buyer_email: resolvedEmail || 'guest@example.com',
        buyer_phone: resolvedPhone
      });

      // Check if payment is required
      if (totalAmount > 0 && campaign.payment_account_id) {
        // Show payment checkout
        setShowPayment(true);
      } else if (totalAmount > 0 && !campaign.payment_account_id) {
        // No payment account configured - mark as pending
        toast.warning('Payment configuration pending. Your registration is saved.');
        setRegistrationComplete(true);
      } else {
        // Free registration - auto confirm
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
    toast.success('Payment successful! Registration confirmed.');
  };

  const handlePaymentFailure = (errorCode) => {
    toast.error('Payment failed. Please try again.');
  };

  // Render member selection component for closed group campaigns
  const renderMemberSelection = () => {
    if (!isClosedGroup) return null;

    return (
      <div className="col-span-12 mb-6 pb-6 border-b border-slate-200">
        <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-outfit font-semibold text-slate-900">Member Registration</h3>
              <p className="text-sm text-slate-600 font-jakarta">
                This is a closed group event. Please select your name from the list.
              </p>
            </div>
          </div>

          {selectedMember ? (
            // Show selected member
            <div className="bg-white rounded-lg p-4 border border-secondary/30 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 font-jakarta">{selectedMember.name}</p>
                    <p className="text-sm text-slate-500 font-jakarta">
                      {selectedMember.mobile_masked} • {selectedMember.email_masked || 'No email'}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelectedMember}
                  className="text-slate-500 hover:text-accent"
                >
                  Change
                </Button>
              </div>
            </div>
          ) : (
            // Show member search
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setShowMemberDropdown(true);
                  }}
                  onFocus={() => setShowMemberDropdown(true)}
                  placeholder="Search your name or mobile number..."
                  className="pl-10 pr-10 h-12 text-base rounded-xl border-slate-200 focus-visible:ring-primary bg-white"
                />
                {loadingMembers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
                )}
                {!loadingMembers && (
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                )}
              </div>

              {/* Member Dropdown */}
              {showMemberDropdown && (
                <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-72 overflow-y-auto">
                  {filteredMembers.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 font-jakarta">
                      {memberSearch.length >= 2 
                        ? 'No members found matching your search'
                        : 'Type at least 2 characters to search'}
                    </div>
                  ) : (
                    filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => selectMember(member)}
                        disabled={member.status === 'registered' || verifyingMember}
                        className={`w-full px-4 py-3 text-left border-b border-slate-100 last:border-b-0 transition-colors ${
                          member.status === 'registered'
                            ? 'bg-slate-50 cursor-not-allowed opacity-60'
                            : 'hover:bg-primary/5 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              member.status === 'registered' 
                                ? 'bg-slate-200' 
                                : 'bg-primary/10'
                            }`}>
                              {member.status === 'registered' ? (
                                <Lock className="w-5 h-5 text-slate-400" />
                              ) : (
                                <span className="text-primary font-semibold">
                                  {member.name?.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className={`font-medium font-jakarta ${
                                member.status === 'registered' ? 'text-slate-500' : 'text-slate-900'
                              }`}>
                                {member.name}
                              </p>
                              <p className="text-sm text-slate-500 font-jakarta">
                                {member.mobile_masked}
                              </p>
                            </div>
                          </div>
                          {member.status === 'registered' && (
                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-sm font-jakarta">
                              Already Registered
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * Renders a field, then appends its validation error (if any) inside the same
   * wrapper. Done here rather than in each of the ~15 type branches below so every
   * field type gets the message without duplicating markup — and so the error
   * inherits the field's own grid column width.
   */
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
      // data-ftype lets the field-structure engine (formStyles.css [data-formfields])
      // place each field type differently without touching the render branches.
      { key: field.id, 'data-ftype': field.type },
      ...React.Children.toArray(rendered.props.children),
      message ? (
        <p key="__validation_error" className="text-xs text-red-600 font-jakarta mt-1" role="alert">
          {message}
        </p>
      ) : null
    );
  };

  const renderFieldControl = (field) => {
    // Static Visibility property (admin set): "hide" removes the field entirely,
    // unless a Field Rule's "show" action targets it (see isStaticallyHidden).
    if (isStaticallyHidden(field)) {
      return null;
    }

    // Check field visibility based on field rules
    if (!isFieldVisible(field.id)) {
      return null;
    }

    const fieldState = getFieldState(field.id);
    // New width names (small/medium/large) + legacy (full/half/third) for back-compat.
    // Mobile-first: every partial width collapses to col-span-12 on phones to avoid
    // sub-200px fields that are unusable for typing on a touchscreen.
    const widthClass = {
      small:  'col-span-12 sm:col-span-6',
      medium: 'col-span-12 sm:col-span-8',
      large:  'col-span-12',
      full:   'col-span-12',
      half:   'col-span-12 sm:col-span-6',
      third:  'col-span-12 sm:col-span-4',
    }[field.width] || 'col-span-12 sm:col-span-6';

    // For closed group, some fields may be pre-filled and read-only
    const isPrefilledField = isClosedGroup && selectedMember && (
      field.type === 'name' || field.type === 'email' || field.type === 'phone' || field.type === 'tel'
    );

    // Determine if field is required (field rules can override)
    let isRequired = fieldState.required !== null ? fieldState.required : field.required;
    // Phone fields must be required when the campaign collects payment —
    // Instamojo/Cashfree reject orders with a blank buyer phone. Override
    // any "optional" setting in this case so the registrant can't skip it.
    if ((field.type === 'phone' || field.type === 'tel') && isPaidCampaign) {
      isRequired = true;
    }
    const isDisabled = fieldState.disabled || isPrefilledField || isFieldDisabledByVisibility(field);

    if (field.type === 'section_header') {
      return (
        <div key={field.id} className="col-span-12 mb-4 mt-6">
          <h3 className="text-xl font-outfit font-semibold text-slate-900 mb-2">{field.label}</h3>
          {field.help_text && <p className="text-sm text-slate-600 font-jakarta">{field.help_text}</p>}
        </div>
      );
    }

    // Divider / Spacer — a purely visual separator. 'space' leaves blank vertical
    // room; 'line'/'dashed' draw a rule, optionally with a centered caption label.
    if (field.type === 'divider') {
      const dStyle = field.divider_style || 'line';
      if (dStyle === 'space') {
        return <div key={field.id} className="col-span-12 py-5" aria-hidden="true" />;
      }
      const borderStyle = dStyle === 'dashed' ? 'border-dashed' : 'border-solid';
      return (
        <div key={field.id} className="col-span-12 my-3">
          {field.label ? (
            <div className="flex items-center gap-3">
              <span className={`flex-1 border-t ${borderStyle} border-slate-200`} />
              <span className="text-xs font-jakarta font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                {field.label}
              </span>
              <span className={`flex-1 border-t ${borderStyle} border-slate-200`} />
            </div>
          ) : (
            <hr className={`border-t ${borderStyle} border-slate-200`} />
          )}
        </div>
      );
    }

    // Price Summary — a read-only field that shows the live running total. It takes no
    // input and is never part of formData; it just reflects calculateTotal() so it
    // updates as the registrant changes priced selections.
    if (field.type === 'price') {
      const liveTotal = calculateTotal();
      return (
        <div key={field.id} className={widthClass}>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm sm:text-base font-jakarta font-medium text-slate-700">
              {field.label || 'Total Amount'}
            </span>
            <span className="text-xl sm:text-2xl font-outfit font-bold text-primary whitespace-nowrap">
              ₹{(liveTotal || 0).toFixed(2)}
            </span>
          </div>
          {field.help_text && (
            <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>
          )}
        </div>
      );
    }

    if (field.type === 'name') {
      const nameConfig = field.name_config || {};
      const showFirst = nameConfig.show_first_name !== false;
      const showMiddle = nameConfig.show_middle_name === true;
      const showLast = nameConfig.show_last_name !== false;
      const visibleCount = [showFirst, showMiddle, showLast].filter(Boolean).length;
      
      // Calculate column widths based on visible fields.
      // Mobile-first: 3-part names stack (full width) on phones; 2-part names use
      // half-width even on mobile (first + last are short enough to fit).
      const getColSpan = () => {
        if (visibleCount === 1) return 'col-span-12';
        if (visibleCount === 2) return 'col-span-12 sm:col-span-6';
        return 'col-span-12 sm:col-span-4';
      };
      const colSpan = getColSpan();

      return (
        <div key={field.id} className="col-span-12">
          <Label className="text-slate-700 font-jakarta font-medium mb-3 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="grid grid-cols-12 gap-4">
            {showFirst && (
              <div className={colSpan}>
                <Label className="text-slate-700 font-jakarta font-medium text-xs mb-1.5 block uppercase tracking-wide">
                  {nameConfig.first_name_label || 'First Name'}
                </Label>
                <Input
                  type="text"
                  autoComplete="given-name"
                  value={formData[`${field.id}_first`] || ''}
                  onChange={(e) => handleChange(`${field.id}_first`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  placeholder=""
                  required={isRequired}
                  readOnly={isDisabled}
                  className={`h-12 sm:h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                />
              </div>
            )}
            {showMiddle && (
              <div className={colSpan}>
                <Label className="text-slate-700 font-jakarta font-medium text-xs mb-1.5 block uppercase tracking-wide">
                  {nameConfig.middle_name_label || 'Middle Name'}
                </Label>
                <Input
                  type="text"
                  autoComplete="additional-name"
                  value={formData[`${field.id}_middle`] || ''}
                  onChange={(e) => handleChange(`${field.id}_middle`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  placeholder=""
                  readOnly={isDisabled}
                  className={`h-12 sm:h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                />
              </div>
            )}
            {showLast && (
              <div className={colSpan}>
                <Label className="text-slate-700 font-jakarta font-medium text-xs mb-1.5 block uppercase tracking-wide">
                  {nameConfig.last_name_label || 'Last Name'}
                </Label>
                <Input
                  type="text"
                  autoComplete="family-name"
                  value={formData[`${field.id}_last`] || ''}
                  onChange={(e) => handleChange(`${field.id}_last`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  placeholder=""
                  readOnly={isDisabled}
                  className={`h-12 sm:h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                />
              </div>
            )}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'dropdown') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
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
            disabled={isDisabled}
            className="w-full h-12 rounded-lg border border-slate-300 pl-4 pr-10 text-sm bg-white font-jakarta flex items-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer"
          />
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'textarea') {
      const txt = formData[field.id] || '';
      const wc  = wordCount(txt);
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <textarea
            value={txt}
            onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
            placeholder={field.placeholder}
            required={isRequired}
            disabled={isDisabled}
            rows={4}
            maxLength={field.max_length || undefined}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm bg-white font-jakarta focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
          />
          {(field.max_length || field.max_words) && (
            <p className="text-xs text-slate-400 font-jakarta mt-1 text-right space-x-2">
              {field.max_length && (
                <span>{txt.length} / {field.max_length} chars</span>
              )}
              {field.max_words && (
                <span className={wc > field.max_words ? 'text-red-500' : ''}>
                  {wc} / {field.max_words} words
                </span>
              )}
            </p>
          )}
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'rich_text') {
      return (
        <div key={field.id} className={widthClass}>
          {field.label && (
            <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
              {field.label}
            </Label>
          )}
          <RichTextView
            html={field.content || ''}
            bgColor={field.content_bg_color}
            borderColor={field.content_border_color}
          />
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'checkbox') {
      // Check if this checkbox has multiple options
      const hasOptions = field.options && Array.isArray(field.options) && field.options.length > 0;
      
      if (hasOptions) {
        // Multi-select checkbox with options
        const selected   = formData[field.id] || [];
        const maxSel     = field.max_selections;
        const atMax      = maxSel && selected.length >= maxSel;
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-3 block">
              {field.label} {isRequired && <span className="text-accent">*</span>}
              {maxSel && (
                <span className={`ml-2 text-xs font-normal ${atMax ? 'text-amber-600' : 'text-slate-500'}`}>
                  ({selected.length}/{maxSel} selected)
                </span>
              )}
            </Label>
            <div className="flex flex-wrap gap-3">
              {sortedChoiceOptions(field).map((opt) => {
                const submitValue = resolveOptionValue(opt);
                const isChecked   = selected.includes(submitValue);
                const lockedOut   = atMax && !isChecked;
                return (
                  <label
                    key={opt.value ?? opt.label}
                    htmlFor={`${field.id}-${opt.value ?? opt.label}`}
                    className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl border-2 cursor-pointer transition-all min-h-[46px]
                      ${isChecked ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40 hover:bg-slate-50'}
                      ${(isDisabled || lockedOut) ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${isChecked ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                      {isChecked && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </span>
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
                      disabled={isDisabled || lockedOut}
                      title={lockedOut ? `Maximum ${maxSel} selections allowed` : undefined}
                      className="sr-only"
                    />
                    <span className={`font-jakarta text-sm select-none ${isChecked ? 'text-primary font-medium' : (isDisabled || lockedOut) ? 'text-slate-400' : 'text-slate-700'}`}>
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );
      } else {
        // Single boolean checkbox (no options)
        return (
          <div key={field.id} className={widthClass}>
            <label htmlFor={field.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all min-h-[48px]
              ${formData[field.id] ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40 hover:bg-slate-50'}`}>
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${formData[field.id] ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                {formData[field.id] && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2 6 5 9 10 3" />
                  </svg>
                )}
              </span>
              <input
                type="checkbox"
                id={field.id}
                checked={formData[field.id] || false}
                onChange={(e) => handleChange(field.id, e.target.checked)}
                required={isRequired}
                className="sr-only"
              />
              <span className={`font-jakarta text-sm font-medium select-none ${formData[field.id] ? 'text-primary' : 'text-slate-700'}`}>
                {field.label} {isRequired && <span className="text-accent">*</span>}
              </span>
            </label>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );
      }
    }

    if (field.type === 'radio') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-3 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="flex flex-wrap gap-3">
            {sortedChoiceOptions(field).map((opt) => {
              const submitValue = resolveOptionValue(opt);
              const isSelected = formData[field.id] === submitValue;
              return (
                <label
                  key={opt.value ?? opt.label}
                  htmlFor={`${field.id}-${opt.value ?? opt.label}`}
                  className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl border-2 cursor-pointer transition-all min-h-[46px]
                    ${isSelected ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40 hover:bg-slate-50'}
                    ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                    ${isSelected ? 'border-primary' : 'border-slate-300'}`}>
                    {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </span>
                  <input
                    type="radio"
                    id={`${field.id}-${opt.value ?? opt.label}`}
                    name={field.id}
                    value={submitValue}
                    checked={isSelected}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    required={isRequired}
                    disabled={isDisabled}
                    className="sr-only"
                  />
                  <span className={`font-jakarta text-sm select-none ${isSelected ? 'text-primary font-medium' : isDisabled ? 'text-slate-400' : 'text-slate-700'}`}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'file_upload') {
      const stored   = formData[field.id];
      // stored is either: null/undefined, an in-progress { uploading: true, name }, or a final { url, name, size }
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
        // Show in-progress state
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
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
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
              disabled={uploading}
              className="hidden"
            />
            {fileUrl ? (
              <a
                href={`${API_BASE_URL}${fileUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline truncate max-w-[250px]"
              >
                {fileName}
              </a>
            ) : (
              <span className="text-sm text-slate-600 font-jakarta truncate">
                {fileName || 'No file chosen'}
              </span>
            )}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'terms_checkbox') {
      return (
        <div key={field.id} className={widthClass}>
          <label htmlFor={field.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all
            ${formData[field.id] ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40 hover:bg-slate-50'}`}>
            <span className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
              ${formData[field.id] ? 'border-primary bg-primary' : 'border-slate-300'}`}>
              {formData[field.id] && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 6 5 9 10 3" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              id={field.id}
              checked={formData[field.id] || false}
              onChange={(e) => handleChange(field.id, e.target.checked)}
              required={isRequired}
              className="sr-only"
            />
            <span className={`font-jakarta text-sm ${formData[field.id] ? 'text-primary' : 'text-slate-700'}`}>
              {field.label} {isRequired && <span className="text-accent">*</span>}
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
          {field.help_text && <RichTextView html={field.help_text} className="text-sm mt-1" />}
        </div>
      );
    }

    // Money inputs — custom_amount feeds the running total (see calculateTotal);
    // currency is plain data and never auto-added to the price.
    if (field.type === 'custom_amount' || field.type === 'currency') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-jakarta text-sm pointer-events-none">₹</span>
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
              readOnly={isDisabled}
              className={`h-12 sm:h-12 pl-8 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
            />
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'rating') {
      const maxRating = parseInt(field.max_rating, 10) || 5;
      const selectedRating = parseInt(formData[field.id], 10) || 0;
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="flex items-center gap-1">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleChange(field.id, value)}
                disabled={isDisabled}
                aria-label={`Rate ${value} out of ${maxRating}`}
                className="p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Star className={`w-7 h-7 transition-colors ${value <= selectedRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Range slider — stores a numeric value (validated by NUMERIC_TYPES). Shows "—"
    // until the registrant moves the handle, so a required slider reads as unfilled
    // even though the track visually rests at the minimum.
    if (field.type === 'slider') {
      const minV  = Number.isFinite(parseFloat(field.min_value)) ? parseFloat(field.min_value) : 0;
      const maxV  = Number.isFinite(parseFloat(field.max_value)) ? parseFloat(field.max_value) : 100;
      const stepV = Number.isFinite(parseFloat(field.step)) && parseFloat(field.step) > 0 ? parseFloat(field.step) : 1;
      const hasVal = formData[field.id] !== undefined && formData[field.id] !== null && formData[field.id] !== '';
      const curV  = hasVal ? parseFloat(formData[field.id]) : minV;
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={minV}
              max={maxV}
              step={stepV}
              value={curV}
              onChange={(e) => handleChange(field.id, e.target.value)}
              disabled={isDisabled}
              className="flex-1 h-2 accent-primary cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="min-w-[3rem] text-center text-sm font-outfit font-bold text-primary tabular-nums">
              {hasVal ? curV : '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-400 font-jakarta mt-1">
            <span>{minV}</span>
            <span>{maxV}</span>
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Yes / No — a two-button segmented toggle. Stores the string 'yes' or 'no'.
    if (field.type === 'yes_no') {
      const ynVal = formData[field.id];
      const ynOpts = [
        { v: 'yes', label: field.yes_label || 'Yes' },
        { v: 'no',  label: field.no_label  || 'No'  },
      ];
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="inline-flex rounded-xl border-2 border-slate-200 p-1 gap-1">
            {ynOpts.map((o) => {
              const active = ynVal === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => !isDisabled && handleChange(field.id, o.v)}
                  disabled={isDisabled}
                  aria-pressed={active}
                  className={`px-6 py-2 rounded-lg text-sm font-jakarta font-medium transition-all min-w-[84px]
                    ${active ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}
                    ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Image Choices — a single-select grid of image cards. Stores the chosen
    // option's value (a plain string), so validation/submission/pricing treat it
    // like a radio. Options carry no price_modifier (non-pricing by design).
    if (field.type === 'image_choice') {
      const imgOpts = sortedChoiceOptions(field);
      const selectedVal = formData[field.id];
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-3 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {imgOpts.map((opt) => {
              const val = resolveOptionValue(opt);
              const isSel = selectedVal === val;
              return (
                <button
                  key={opt.value ?? opt.label}
                  type="button"
                  onClick={() => !isDisabled && handleChange(field.id, val)}
                  disabled={isDisabled}
                  aria-pressed={isSel}
                  className={`relative rounded-xl border-2 overflow-hidden text-left transition-all
                    ${isSel ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200 hover:border-primary/40'}
                    ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden">
                    {opt.image_url ? (
                      <img
                        src={opt.image_url}
                        alt={opt.label}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <svg className="w-8 h-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>
                  <div className={`px-3 py-2 text-sm font-jakarta ${isSel ? 'text-primary font-semibold bg-primary/5' : 'text-slate-700'}`}>
                    {opt.label}
                  </div>
                  {isSel && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow">
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 6 5 9 10 3" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Structured address — renders separate inputs but also mirrors a combined,
    // comma-joined string into formData[field.id] so required + character-limit
    // validation (address ∈ LENGTH_VALIDATED_TYPES) and submission treat it as one
    // value, exactly like a text field. Sub-parts live under {id}_line1 etc.
    if (field.type === 'address') {
      const ac = field.address_config || {};
      const parts = [
        { key: 'line1',   label: ac.line1_label   || 'Street Address',        full: true,  show: true },
        { key: 'line2',   label: ac.line2_label   || 'Apartment, suite, etc.', full: true,  show: ac.show_line2 !== false },
        { key: 'city',    label: ac.city_label    || 'City',                   full: false, show: true },
        { key: 'state',   label: ac.state_label   || 'State / Province',       full: false, show: true },
        { key: 'postal',  label: ac.postal_label  || 'Postal / ZIP Code',      full: false, show: true },
        { key: 'country', label: ac.country_label || 'Country',                full: false, show: ac.show_country !== false },
      ].filter((p) => p.show);

      const setPart = (partKey, val) => {
        handleChange(`${field.id}_${partKey}`, val);
        const combined = parts
          .map((p) => (p.key === partKey ? val : (formData[`${field.id}_${p.key}`] || '')))
          .map((s) => (s || '').trim())
          .filter(Boolean)
          .join(', ');
        handleChange(field.id, combined);
      };

      return (
        <div key={field.id} className="col-span-12">
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <div className="grid grid-cols-12 gap-3">
            {parts.map((p) => (
              <div key={p.key} className={p.full ? 'col-span-12' : 'col-span-12 sm:col-span-6'}>
                <Label className="text-slate-500 font-jakarta font-medium text-xs mb-1.5 block uppercase tracking-wide">
                  {p.label}
                </Label>
                <Input
                  type="text"
                  value={formData[`${field.id}_${p.key}`] || ''}
                  onChange={(e) => setPart(p.key, sanitizeTextInput(e.target.value, field))}
                  readOnly={isDisabled}
                  maxLength={field.max_length || undefined}
                  className={`h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                />
              </div>
            ))}
          </div>
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Signature — a draw-to-sign pad. Stores a PNG data-URL string in formData[id]
    // (or null), so required/empty checks and submission treat it as a plain value.
    if (field.type === 'signature') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <SignaturePad
            value={formData[field.id] || null}
            onChange={(dataUrl) => handleChange(field.id, dataUrl)}
            disabled={isDisabled}
          />
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
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
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <PhoneInput
            value={formData[field.id] || ''}
            onChange={(v) => handleChange(field.id, v)}
            countryCode={effectiveCountry}
            onCountryChange={(c) => handleChange(`${field.id}_country`, c)}
            required={isRequired}
            disabled={isDisabled}
            allowedCountries={allowedCountries}
            inputClassName="sm:h-12"
          />
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Handle number fields - numbers only
    if (field.type === 'number') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*"
            value={formData[field.id] || ''}
            onChange={(e) => {
              // Only allow numbers and decimal point
              const value = e.target.value.replace(/[^0-9.]/g, '');
              handleChange(field.id, value);
            }}
            placeholder={field.placeholder}
            required={isRequired}
            readOnly={isDisabled}
            min={field.min_value ?? field.min}
            max={field.max_value ?? field.max}
            step={field.step || 'any'}
            className={`h-12 sm:h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
          />
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    // Handle email fields - with email validation
    if (field.type === 'email') {
      return (
        <div key={field.id} className={widthClass}>
          <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
            {field.label} {isRequired && <span className="text-accent">*</span>}
          </Label>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={formData[field.id] || ''}
            onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
            placeholder={field.placeholder || 'example@email.com'}
            required={isRequired}
            readOnly={isDisabled}
            maxLength={field.max_length || undefined}
            pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
            className={`h-12 sm:h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
          />
          {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
        </div>
      );
    }

    return (
      <div key={field.id} className={widthClass}>
        <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
          {field.label} {isRequired && <span className="text-accent">*</span>}
        </Label>
        <Input
          type={field.type === 'phone' || field.type === 'tel' ? 'tel' : field.type}
          value={formData[field.id] || ''}
          onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
          placeholder={field.placeholder}
          required={isRequired}
          readOnly={isDisabled}
          maxLength={field.max_length || undefined}
          className={`h-12 sm:h-12 rounded-lg border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary font-jakarta text-sm placeholder:text-slate-400 ${isDisabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
        />
        {field.max_length && (
          <p className="text-xs text-slate-400 font-jakarta mt-1 text-right">
            {(formData[field.id] || '').length} / {field.max_length}
          </p>
        )}
        {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-jakarta">Loading event...</p>
        </div>
      </div>
    );
  }

  // Error states
  if (error === 'not_found' || !campaign) {
    return <NotFoundPage />;
  }

  if (error === 'archived') {
    return <CampaignArchivedPage campaignName={campaign?.name} />;
  }

  // Event not yet activated — block the form entirely so registrations cannot start
  if (error === 'not_active') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
        <Card className="bg-white rounded-xl border border-slate-100 shadow-card p-8 max-w-lg w-full text-center">
          {campaign?.logo_url && (
            <img
              src={toAbsUrl(campaign.logo_url)}
              alt={campaign.name}
              className="h-16 mx-auto mb-4 object-contain"
            />
          )}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 mb-4">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-outfit font-bold text-slate-900 mb-2">
            Registration Not Available
          </h2>
          <p className="text-slate-600 font-jakarta mb-6">
            {campaign?.name ? `"${campaign.name}"` : 'This event'} is not currently open for registration.
            Please check back once the organizer activates the event.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="border-slate-300 hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={() => navigate('/')}
              className="bg-primary hover:bg-primary-hover"
            >
              <Home className="w-4 h-4 mr-2" />
              Browse Events
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Registration-window gates — closed (ended / disabled) and not-yet-open share
  // the same card chrome (logo + contact note + nav buttons); only the inner
  // message block differs.
  if (error === 'registration_closed' || error === 'registration_not_started') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
        <Card className="bg-white rounded-xl border border-slate-100 shadow-card p-8 max-w-lg w-full text-center">
          {campaign.logo_url && (
            <img
              src={toAbsUrl(campaign.logo_url)}
              alt={campaign.name}
              className="h-16 mx-auto mb-4 object-contain"
            />
          )}
          {error === 'registration_not_started' ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 mb-4">
                <Clock className="w-10 h-10 text-amber-600" />
              </div>
              <h3 className="text-2xl font-outfit font-bold text-slate-900 mb-3">Registration Has Not Started Yet</h3>
              <p className="text-slate-600 mb-4 max-w-sm mx-auto">
                Registration for <span className="font-semibold">{campaign?.name || 'this event'}</span> is not open yet.
              </p>
              <p className="text-sm text-slate-500">
                Registration opens on {formatServerDate(campaign?.registration_start_date, "EEEE, MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          ) : (
            <RegistrationClosedPage
              campaignName={campaign?.name}
              /* Pass a parsed Date — the raw value is UTC-naive, so rendering it
                 directly would show the UTC clock face as if it were local. */
              endDate={parseServerDate(campaign?.registration_end_date) || campaign?.registration_end_date}
            />
          )}
          <p className="text-sm text-slate-500 mt-4">
            For inquiries, please contact the event organizer.
          </p>
          
          {/* Navigation buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6 pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="border-slate-300 hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={() => navigate('/')}
              className="bg-primary hover:bg-primary-hover"
            >
              <Home className="w-4 h-4 mr-2" />
              Browse Events
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const theme = getFormTheme();
  const headerImage = campaign?.form_config?.header_image;
  const bannerImage = campaign?.form_config?.banner_image;
  const submitButtonText = campaign?.form_config?.submit_button_text;

  // Payment Checkout View
  if (showPayment && registrationData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-outfit font-bold text-slate-900 mb-2">
              Complete Payment
            </h1>
            <p className="text-slate-600 font-jakarta">
              for {campaign.name}
            </p>
          </div>

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

          <div className="mt-6 text-center">
            <Button 
              variant="ghost" 
              onClick={() => setShowPayment(false)}
              className="text-slate-500"
            >
              ← Back to form
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Offline Registration Success View
  if (showOfflineSuccess && offlineOtp) {
    const copyOtp = () => {
      navigator.clipboard.writeText(offlineOtp);
      toast.success('OTP copied to clipboard!');
    };

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
      // Fallback to any name-like field
      if (formData.name) return formData.name;
      if (formData.full_name) return formData.full_name;
      return '';
    };

    const registrantName = getRegistrantName();
    const eventName = campaign?.name || 'the event';

    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-6">
        <Card className="bg-white rounded-2xl border border-slate-100 shadow-xl p-8 max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-outfit font-bold text-slate-900 mb-2">
            {registrantName ? `Hey ${registrantName}!` : 'Registration Submitted!'}
          </h2>
          
          <p className="text-slate-600 font-jakarta mb-6">
            You have successfully registered for <strong>{eventName}</strong>. 
            Please share the following OTP after paying at the Registration Counter to complete your registration.
          </p>
          
          {/* OTP Display */}
          <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-6 mb-6">
            <p className="text-white/80 text-sm mb-2 font-jakarta">Your Registration OTP</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-mono font-bold text-white tracking-widest">
                {offlineOtp}
              </span>
              <button
                onClick={copyOtp}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                title="Copy OTP"
              >
                <Copy className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Mail className="w-4 h-4 text-primary" />
              <span>OTP has been emailed to your registered email</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CreditCard className="w-4 h-4 text-primary" />
              <span>Amount to pay: <strong className="text-primary">₹{calculateTotal().toFixed(2)}</strong></span>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
            <p className="text-sm text-amber-800 font-jakarta">
              <strong>Important:</strong> Please save this OTP. You&apos;ll need to present it at the event venue along with the payment to complete your registration.
            </p>
          </div>
          
          <Button
            onClick={() => navigate('/')}
            className="mt-6 bg-primary hover:bg-primary-hover w-full"
          >
            <Home className="w-4 h-4 mr-2" />
            Return to Home
          </Button>
        </Card>
      </div>
    );
  }

  // Registration Complete View
  if (registrationComplete) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="bg-white rounded-xl border border-slate-100 shadow-card p-8 max-w-2xl w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-outfit font-bold text-slate-900 mb-3">
            Registration Successful!
          </h2>
          <p className="text-lg text-slate-600 font-jakarta mb-6">
            Thank you for registering for {campaign.name}
          </p>
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-500 font-jakarta mb-1">Registration ID</p>
            <p className="text-lg font-mono font-semibold text-slate-900">{registrationId}</p>
          </div>
          <p className="text-sm text-slate-600 font-jakarta">
            A confirmation email with your receipt has been sent to your registered email address.
          </p>
        </Card>
      </div>
    );
  }

  // Registration Form View
  return (
    <div
      className={`ke-form-root min-h-screen flex flex-col ${theme.page_background ? '' : 'bg-slate-50'}`}
      data-formstyle={theme.style || undefined}
      data-formlayout={theme.style ? (theme.layout || 'card') : undefined}
      data-formfields={theme.style ? (theme.fields || 'stack') : undefined}
      style={{
        // With a design-language style the CSS engine drives the font (per style);
        // otherwise keep the theme's font_family inline as before (baseline unchanged).
        ...(theme.style ? {} : { fontFamily: theme.font_family || 'Inter' }),
        background: theme.page_background || undefined,
        backgroundImage: theme.page_background_image ? `url(${toAbsUrl(theme.page_background_image)})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        ...(theme.style ? {
          '--fs-primary': theme.primary_color,
          '--fs-accent': theme.accent_color || theme.primary_color,
          '--fs-text': theme.text_color,
          '--fs-surface': theme.background_color,
          '--fs-page': theme.page_background,
          '--fs-font': theme.font_family,
        } : {})
      }}
      onClick={() => setShowMemberDropdown(false)}
    >

      {/* Centered single card */}
      {/* pb clears the fixed KaizenBrandFooter (taller on mobile, where it stacks) so the last
          field and the submit button are never trapped underneath it. */}
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pt-8 pb-40 sm:pb-32">
        {/* Split-layout hero panel (design-language templates with layout='split' only) */}
        {theme.style && theme.layout === 'split' && (
          <aside className="ke-form-aside">
            <div>
              <p className="fa-kicker">{campaign.organization_name || 'Registration'}</p>
              <h2>{campaign.name}</h2>
            </div>
            {(campaign.show_description ?? true) && campaign.description ? (
              <div className="fa-meta"><p>{campaign.description}</p></div>
            ) : null}
          </aside>
        )}
        {/* Card background stays white for un-styled forms; design-language templates
            (data-formstyle) override .ke-form-card to their own surface/text via CSS. */}
        <div
          className="ke-form-card bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
          style={theme.background_image ? {
            backgroundImage: `linear-gradient(${hexToRgba('#ffffff', 0.88)}, ${hexToRgba('#ffffff', 0.88)}), url(${toAbsUrl(theme.background_image)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          } : undefined}
        >

          {/* ── FORM BANNER (full-width image, shown above the header) ── */}
          {bannerImage && (
            <img
              src={toAbsUrl(bannerImage)}
              alt={campaign.name}
              className="w-full h-auto object-cover block"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          {/* ── FORM HEADER IMAGE (full-width, below the banner) ── */}
          {headerImage && (
            <img
              src={toAbsUrl(headerImage)}
              alt={campaign.name}
              className="w-full h-auto object-cover block"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          {/* ── HEADER (centered logo + title + org) ── */}
          <div className="ke-form-header bg-slate-50 border-b border-slate-100 px-6 py-8 text-center">
            {(campaign.show_event_logo ?? true) && campaign.logo_url && (
              <img
                src={toAbsUrl(campaign.logo_url)}
                alt={campaign.organization_name || campaign.name}
                className="h-16 w-auto max-w-[220px] mx-auto object-contain mb-4"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <h1 className="text-2xl sm:text-3xl font-outfit font-bold text-slate-900 leading-tight">{campaign.name}</h1>
            {(campaign.show_organization_name ?? true) && (
              <p className="text-slate-500 text-sm font-jakarta mt-2">{campaign.organization_name}</p>
            )}
            {(campaign.show_description ?? true) && campaign.description && (
              <p className="text-slate-600 text-sm font-jakarta mt-3 max-w-2xl mx-auto whitespace-pre-line">{campaign.description}</p>
            )}
          </div>
          {/* ── END HEADER ── */}

          {/* ── BODY (registration form) ── */}
          <div className={`px-4 sm:px-8 py-6 sm:py-8 ${campaign.form_config?.layout_mode === 'spotlight' ? 'ke-spotlight' : ''}`}>

            {/* Section heading — admin-editable text + visibility toggle (form_config).
                Hidden when show_section_title === false; blank text falls back to default. */}
            {(campaign.form_config?.show_section_title ?? true) && (
              <div className="mb-8 pb-5 border-b border-slate-200">
                <h2 className="text-2xl font-outfit font-bold text-slate-900 leading-tight">
                  {campaign.form_config?.section_title?.trim() || 'Registration Details'}
                </h2>
              </div>
            )}

            {campaign.form_config && campaign.form_config.fields ? (() => {
              // ── Multi-page form setup ────────────────────────────────────
              // Layout mode (opt-in): 'card'/'spotlight' put one question per screen,
              // which supersedes the admin's manual page breaks and page rules (they
              // can't coexist with auto per-field paging). 'standard' is unchanged.
              const layoutMode = campaign.form_config.layout_mode || 'standard';
              const oneFieldPerScreen = layoutMode === 'card' || layoutMode === 'spotlight';
              const allFields  = campaign.form_config.fields || [];
              const pageBreaks = oneFieldPerScreen ? [] : (campaign.form_config.page_breaks || [])
                .slice()
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
              const pageRules  = oneFieldPerScreen ? [] : (campaign.form_config.page_rules || []);

              // Split fields into pages by break positions.
              // Each break's `position` = number of fields before the break.
              // pages[0] = fields 0..break[0].position-1, pages[1] = between break[0] and break[1], etc.
              const pages = [];
              let lastPos = 0;
              for (const b of pageBreaks) {
                const pos = Math.max(lastPos, Math.min(b.position ?? allFields.length, allFields.length));
                pages.push({
                  fields: allFields.slice(lastPos, pos),
                  title: b.title || `Page ${pages.length + 1}`,
                  description: b.description || ''
                });
                lastPos = pos;
              }
              // Final page (after last break or all fields if no breaks)
              pages.push({
                fields: allFields.slice(lastPos),
                title: pageBreaks.length === 0 ? 'Page 1' : (pageBreaks[pageBreaks.length - 1]?.next_title || `Page ${pages.length + 1}`),
                description: ''
              });

              // One-question-per-screen (card / spotlight): rebuild pages so each
              // registrant-visible field is its own screen. Statically hidden fields
              // (Visibility = hide) are dropped so they never create a blank screen.
              // Everything downstream (validation, Next/Previous, submit) is reused
              // unchanged — this only changes how fields are grouped into pages.
              if (oneFieldPerScreen) {
                const screenFields = allFields.filter((f) => f.visibility !== 'hide');
                pages.length = 0;
                (screenFields.length ? screenFields : allFields).forEach((f, i) => {
                  pages.push({ fields: [f], title: `Question ${i + 1}`, description: '' });
                });
                if (pages.length === 0) pages.push({ fields: [], title: '', description: '' });
              }

              const totalPages   = pages.length;
              const isMultiPage  = totalPages > 1;
              const pageIndex    = Math.max(0, Math.min(currentPage - 1, totalPages - 1));
              const currentFields = pages[pageIndex]?.fields || [];
              const pageMeta     = pages[pageIndex] || { title: '', description: '' };
              const isLastPage   = currentPage >= totalPages;
              const isFirstPage  = currentPage <= 1;

              // Returns whether a single field's stored value satisfies its "required"
              // semantics. Pure — no side effects, safe to call during render. Returns
              // null when the field is hidden / not-required (irrelevant). Returns true
              // when filled, false when empty-but-required.
              const checkFieldFilled = (field) => {
                if (!isFieldVisible(field.id)) return null;
                // A field the admin hid via its Visibility setting is never rendered,
                // so the registrant can never fill it. Counting it as unfilled leaves
                // allRequiredFilled false forever and the submit button never appears.
                // validateCurrentPage already skips these — the two must agree.
                // (isStaticallyHidden lets a Field Rule "show" action override the
                // static hide, matching renderFieldControl — see its definition.)
                if (isStaticallyHidden(field)) return null;
                const fieldState = getFieldState(field.id);
                const ruleRequired = fieldState.required !== null ? fieldState.required : field.required;
                const fieldRequired = ruleRequired ||
                  ((field.type === 'phone' || field.type === 'tel') && isPaidCampaign);
                if (!fieldRequired) return null;
                // Display-only fields carry no user input and can never be "filled".
                if (field.type === 'section_header' || field.type === 'price' || field.type === 'rich_text' || field.type === 'divider') return null;

                if (field.type === 'name') {
                  const nc = field.name_config || {};
                  const showFirst = nc.show_first_name !== false;
                  const first  = (formData[`${field.id}_first`]  || '').trim();
                  const middle = (formData[`${field.id}_middle`] || '').trim();
                  const last   = (formData[`${field.id}_last`]   || '').trim();
                  return !(showFirst ? !first : (!first && !middle && !last));
                }

                const val = formData[field.id];

                if (field.type === 'file_upload') {
                  return !!(val && val.url);
                }

                const isBoolCheckbox =
                  field.type === 'terms_checkbox' ||
                  (field.type === 'checkbox' && !(field.options && field.options.length));
                if (isBoolCheckbox) {
                  return val === true;
                }

                // Money fields must be non-empty AND numeric; rating needs a
                // star picked (stored value >= 1).
                if (field.type === 'custom_amount' || field.type === 'currency') {
                  return val !== undefined && val !== null && val !== '' && !isNaN(parseFloat(val));
                }
                if (field.type === 'rating') {
                  return (parseInt(val, 10) || 0) >= 1;
                }

                return !(val === undefined || val === null || val === '' ||
                         (Array.isArray(val) && val.length === 0));
              };

              // Full validation of the current page before advancing or submitting:
              // required, character/word limits, numeric range and format rules, using
              // whatever wording the admin configured per field. Every failing field is
              // marked at once so the registrant sees all of them, and the first one is
              // also toasted (the field may be scrolled off screen).
              const validateCurrentPage = () => {
                const errors = {};
                let first = null;

                for (const field of currentFields) {
                  if (!isFieldVisible(field.id) || isStaticallyHidden(field)) continue;
                  if (field.type === 'section_header' || field.type === 'price' || field.type === 'rich_text' || field.type === 'divider') continue;

                  const fieldState = getFieldState(field.id);
                  const ruleRequired = fieldState.required !== null ? fieldState.required : field.required;
                  const required = ruleRequired ||
                    ((field.type === 'phone' || field.type === 'tel') && isPaidCampaign);

                  const message = validateFieldValue(field, formData, {
                    required,
                    paymentEnabled: campaign?.payment_enabled !== false,
                    paymentGateway: campaign?.payment_gateway,
                  });
                  if (message) {
                    errors[field.id] = message;
                    if (!first) first = message;
                  }
                }

                setFieldErrors(errors);
                if (first) {
                  toast.error(first);
                  return false;
                }
                return true;
              };

              // True only when every required, visible field on this page is
              // filled. The submit button is revealed only once this is true, so
              // registrants see it appear after completing the form.
              const allRequiredFilled = !currentFields.some(
                (field) => checkFieldFilled(field) === false
              );

              // Evaluate page rules — return target page (1-indexed) if a rule matches, else null
              const evaluatePageRules = () => {
                const rulesForThisPage = pageRules.filter(r => (r.source_page ?? 1) === currentPage);
                for (const rule of rulesForThisPage) {
                  const matchType = rule.match_type || 'all';
                  const conds = rule.conditions || [];
                  if (conds.length === 0) continue;

                  const checkCond = (c) => {
                    const actual = formData[c.field_id];
                    const expected = c.value;
                    const toStr = (v) => v === null || v === undefined ? '' : String(v);
                    const toNum = (v) => {
                      const n = parseFloat(v);
                      return isNaN(n) ? 0 : n;
                    };
                    // Multi-select checkboxes store ARRAYS — String(array) never
                    // equals a single option value, so test membership instead.
                    // Same semantics as evaluateCondition above.
                    if (Array.isArray(actual)) {
                      const selected = actual.map(String);
                      switch (c.operator) {
                        case 'equals':
                        case 'contains':
                          return selected.includes(toStr(expected));
                        case 'not_equals':
                        case 'not_contains':
                          return !selected.includes(toStr(expected));
                        case 'is_empty':
                          return selected.length === 0;
                        case 'is_not_empty':
                          return selected.length > 0;
                        default:
                          return false; // numeric/string ops aren't meaningful for arrays
                      }
                    }
                    switch (c.operator) {
                      case 'equals':        return toStr(actual) === toStr(expected);
                      case 'not_equals':    return toStr(actual) !== toStr(expected);
                      case 'contains':      return toStr(actual).toLowerCase().includes(toStr(expected).toLowerCase());
                      case 'not_contains':  return !toStr(actual).toLowerCase().includes(toStr(expected).toLowerCase());
                      case 'greater_than':  return toNum(actual) >  toNum(expected);
                      case 'less_than':     return toNum(actual) <  toNum(expected);
                      case 'greater_equal': return toNum(actual) >= toNum(expected);
                      case 'less_equal':    return toNum(actual) <= toNum(expected);
                      case 'is_empty':      return !actual || (Array.isArray(actual) && actual.length === 0);
                      case 'is_not_empty':  return !!actual && !(Array.isArray(actual) && actual.length === 0);
                      case 'starts_with':   return toStr(actual).toLowerCase().startsWith(toStr(expected).toLowerCase());
                      case 'ends_with':     return toStr(actual).toLowerCase().endsWith(toStr(expected).toLowerCase());
                      default:              return false;
                    }
                  };

                  const matched = matchType === 'any' ? conds.some(checkCond) : conds.every(checkCond);
                  if (matched) {
                    const target = rule.target_page || (currentPage + 1);
                    if (rule.action === 'skip_to') {
                      // Skip the target page, go to the page after it
                      return Math.min(totalPages, target + 1);
                    }
                    if (rule.action === 'jump_to') {
                      return Math.min(totalPages, Math.max(1, target));
                    }
                  }
                }
                return null;
              };

              const goNext = () => {
                if (!validateCurrentPage()) return;
                const ruleTarget = evaluatePageRules();
                const nextPage   = ruleTarget !== null ? ruleTarget : currentPage + 1;
                if (nextPage <= totalPages) {
                  // Push current page onto history for accurate Previous
                  pageHistoryRef.current.push(currentPage);
                  setCurrentPage(nextPage);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              };

              const goBack = () => {
                // Use navigation history stack so Previous goes to the page user actually came from
                const history = pageHistoryRef.current;
                if (history.length > 0) {
                  const prev = history.pop();
                  setCurrentPage(prev);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (currentPage > 1) {
                  setCurrentPage(currentPage - 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              };

              // Wrap the form submit to run page validation on the last page too
              const wrappedSubmit = (e) => {
                if (!validateCurrentPage()) { e.preventDefault(); return; }
                handleSubmit(e);
              };

              // noValidate: the browser's own constraint popups ("Please fill out this field",
              // "Please include an @...") fire before onSubmit and can't be reworded, which would
              // hide the per-field messages the organizer configured in the builder. Every rule
              // the browser was covering — required, email and phone format — is checked by
              // validateCurrentPage() and again server-side.
              return (
              <form onSubmit={wrappedSubmit} noValidate className="grid grid-cols-12 gap-6" onClick={(e) => e.stopPropagation()}>
                {/* Member Selection for Closed Group */}
                {renderMemberSelection()}

                {/* Show form fields only if member is selected (for closed group) or always (for open) */}
                {(!isClosedGroup || selectedMember) && (
                  <>
                    {/* Compact progress bar for one-question-per-screen modes */}
                    {oneFieldPerScreen && isMultiPage && (
                      <div className="col-span-12 mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-jakarta font-semibold uppercase tracking-wide text-slate-500">
                            Question {currentPage} of {totalPages}
                          </span>
                          <span className="text-xs font-jakarta text-slate-400">
                            {Math.round((currentPage / totalPages) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${(currentPage / totalPages) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Step indicator (pill-style, only for standard multi-page forms) */}
                    {isMultiPage && !oneFieldPerScreen && (
                      <div className="col-span-12 mb-6">
                        <div className="flex items-start">
                          {pages.map((page, idx) => {
                            const stepNum = idx + 1;
                            const isCompleted = stepNum < currentPage;
                            const isActive = stepNum === currentPage;
                            return (
                              <React.Fragment key={idx}>
                                <div className="flex flex-col items-center min-w-[56px]">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                                    isCompleted
                                      ? 'bg-green-500 border-green-500 text-white'
                                      : isActive
                                      ? 'bg-primary border-primary text-white'
                                      : 'bg-white border-slate-300 text-slate-400'
                                  }`}>
                                    {isCompleted ? <CheckCircle className="w-4 h-4" /> : stepNum}
                                  </div>
                                  <span className={`text-xs mt-1 font-jakarta text-center leading-tight max-w-[56px] ${
                                    isActive ? 'text-primary font-semibold' : isCompleted ? 'text-green-600' : 'text-slate-400'
                                  }`}>
                                    {page.title || `Step ${stepNum}`}
                                  </span>
                                </div>
                                {idx < pages.length - 1 && (
                                  <div className={`flex-1 h-0.5 mt-4 mx-1 ${
                                    stepNum < currentPage ? 'bg-green-500' : 'bg-slate-200'
                                  }`} />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {/* Page-level title/description below steps */}
                        {(pageMeta.title || pageMeta.description) && (
                          <div className="mt-4">
                            {pageMeta.title && (
                              <h3 className="text-xl font-outfit font-semibold text-slate-900">{pageMeta.title}</h3>
                            )}
                            {pageMeta.description && (
                              <p className="text-sm text-slate-600 font-jakarta mt-1">{pageMeta.description}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Render only current page's fields */}
                    {currentFields.map((field) => renderField(field))}

                    {/* Navigation for multi-page (on all pages except last) */}
                    {isMultiPage && !isLastPage && (
                      <div className="col-span-12 flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={goBack}
                          disabled={isFirstPage}
                        >
                          ← Previous
                        </Button>
                        <Button
                          type="button"
                          onClick={goNext}
                          className="bg-primary hover:bg-primary-hover"
                          style={{ backgroundColor: theme.primary_color, color: '#fff' }}
                        >
                          Next →
                        </Button>
                      </div>
                    )}

                    {/* Previous button on last page (before submit) */}
                    {isMultiPage && isLastPage && (
                      <div className="col-span-12 mt-4">
                        <Button type="button" variant="outline" onClick={goBack}>
                          ← Previous
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {(!isClosedGroup || selectedMember) && isLastPage && (
                  <>

                    {/* Coupon Code Section */}
                    {campaign.form_config.base_price > 0 && (
                      <div className="col-span-12 mt-4 pt-4 border-t border-slate-200">
                        <Label className="text-slate-800 font-jakarta font-semibold text-sm mb-2 block">
                          Have a coupon code?
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="Enter coupon code"
                            disabled={couponApplied}
                            className="h-12 sm:h-12 rounded-lg border-slate-300 font-jakarta text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary uppercase"
                          />
                          {couponApplied ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={removeCoupon}
                              className="h-12 px-5 border-slate-300 font-jakarta font-medium"
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={validateCoupon}
                              disabled={validatingCoupon || !couponCode.trim()}
                              className="h-12 px-5 border-primary text-primary hover:bg-primary/5 font-jakarta font-medium"
                            >
                              {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                            </Button>
                          )}
                        </div>
                        {couponApplied && (
                          <p className="text-sm text-green-600 font-jakarta mt-2">
                            ✓ Coupon &quot;{couponApplied.code}&quot; applied! ({describeCoupon(couponApplied)})
                          </p>
                        )}
                      </div>
                    )}

                    {/* Price Summary */}
                    {campaign.form_config.base_price > 0 && (
                      <div className="col-span-12 mt-4">
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-3">
                          <div className="flex items-center justify-between text-sm text-slate-600 font-jakarta">
                            <span>Registration fee</span>
                            <span>₹{(campaign.form_config?.base_price || 0).toFixed(2)}</span>
                          </div>
                          {couponApplied && (
                            <div className="flex items-center justify-between text-sm text-green-600 font-jakarta">
                              <span>Discount ({couponApplied.code})</span>
                              <span>-₹{couponDiscountAmount().toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                            <span className="text-base font-outfit font-semibold text-slate-900">Total Amount</span>
                            <span className="text-3xl font-outfit font-bold text-primary">
                              ₹{calculateTotal().toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* For offline-only campaigns, show info message */}
                    {campaign.payment_collection_method === 'offline' && calculateTotal() > 0 && (
                      <div className="col-span-12 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-start gap-3">
                          <Banknote className="w-5 h-5 text-amber-600 mt-0.5" />
                          <div>
                            <p className="font-semibold text-amber-800">Pay at Venue</p>
                            <p className="text-sm text-amber-700 mt-1">
                              This event only accepts cash payment at the venue. Please visit the registration desk to complete your registration and payment.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment Method Selection - Only show if offline payments are enabled via legacy config and amount > 0 */}
                    {calculateTotal() > 0 && campaign.payment_config?.allow_offline_payments && campaign.payment_collection_method !== 'offline' && (
                      <div className="col-span-12 mt-4 pt-4 border-t border-slate-200">
                        <Label className="text-slate-700 font-jakarta font-semibold mb-3 block">
                          Choose Payment Method
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Online Payment Option */}
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('online')}
                            className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                              paymentMethod === 'online'
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                paymentMethod === 'online' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                              }`}>
                                <CreditCard className="w-5 h-5" />
                              </div>
                              <div>
                                <p className={`font-semibold font-jakarta ${
                                  paymentMethod === 'online' ? 'text-primary' : 'text-slate-900'
                                }`}>
                                  Pay Online
                                </p>
                                <p className="text-xs text-slate-500">
                                  Card, UPI, Net Banking
                                </p>
                              </div>
                            </div>
                          </button>

                          {/* Offline Payment Option */}
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('offline')}
                            className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                              paymentMethod === 'offline'
                                ? 'border-secondary bg-secondary/5 ring-2 ring-secondary/20'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                paymentMethod === 'offline' ? 'bg-secondary text-white' : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Banknote className="w-5 h-5" />
                              </div>
                              <div>
                                <p className={`font-semibold font-jakarta ${
                                  paymentMethod === 'offline' ? 'text-secondary' : 'text-slate-900'
                                }`}>
                                  Pay at Venue
                                </p>
                                <p className="text-xs text-slate-500">
                                  Cash payment at event
                                </p>
                              </div>
                            </div>
                          </button>
                        </div>
                        
                        {paymentMethod === 'offline' && (
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg animate-in fade-in slide-in-from-top-2">
                            <p className="text-sm text-amber-800 font-jakarta">
                              <strong>Note:</strong> You&apos;ll receive an OTP via email. Show this OTP at the registration desk to complete your payment in cash.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prompt shown until every required field is filled — the
                        submit button stays hidden until then. */}
                    {!allRequiredFilled && (
                      <div className="col-span-12 mt-4">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 font-jakarta">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 text-slate-400" />
                          Please fill in all required fields to continue.
                        </div>
                      </div>
                    )}

                    {/* Submit Button — revealed only once all required fields are
                        filled (allRequiredFilled). Validation still runs on click via
                        validateCurrentPage(). Bottom safe-area inset prevents the
                        iPhone gesture bar from clipping the button. */}
                    {allRequiredFilled && (
                    <div className="col-span-12 mt-4 mb-safe">
                      <Button
                        type="submit"
                        disabled={submitting || (isClosedGroup && !selectedMember) || !!liveAmountError}
                        data-testid="submit-registration"
                        /* Mobile: smaller text (16px) + whitespace-normal so long captions
                           like "Continue to Payment - ₹12,345.00" can wrap instead of
                           overflowing past the card edges on a 320px viewport. */
                        className="ke-form-submit w-full h-14 sm:h-14 px-4 bg-gradient-to-r from-[#091D40] to-[#1e3a8a] hover:from-[#0c2456] hover:to-[#24449b] text-white font-jakarta font-semibold text-base sm:text-lg !whitespace-normal text-center leading-tight rounded-xl shadow-lg shadow-primary/30 transition-all duration-200 active:scale-[0.98]"
                        style={{
                          background: paymentMethod === 'offline' ? '#14b8a6' : undefined,
                          color: '#ffffff'
                        }}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : submitButtonText ? (
                          // Admin-customised label (form builder → Design → Submit Button Text).
                          // Keep the contextual icon; the amount stays visible in the order summary above.
                          <>
                            {calculateTotal() > 0 && (
                              paymentMethod === 'offline'
                                ? <Banknote className="w-5 h-5 mr-2" />
                                : <CreditCard className="w-5 h-5 mr-2" />
                            )}
                            {submitButtonText}
                          </>
                        ) : calculateTotal() > 0 ? (
                          paymentMethod === 'offline' ? (
                            <>
                              <Banknote className="w-5 h-5 mr-2" />
                              Get OTP for Venue Payment
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-5 h-5 mr-2" />
                              {(campaign?.form_config?.submit_button_text?.trim() || 'Continue to Payment')} - ₹{calculateTotal().toFixed(2)}
                            </>
                          )
                        ) : (
                          campaign?.form_config?.submit_button_text?.trim() || 'Submit'
                        )}
                      </Button>
                      {calculateTotal() > 0 && paymentMethod === 'online' && (
                        <p className="text-xs text-slate-500 font-jakarta text-center mt-3">
                          Secure payment powered by Razorpay/Instamojo
                        </p>
                      )}
                    </div>
                    )}
                  </>
                )}

                {/* Prompt to select member if closed group */}
                {isClosedGroup && !selectedMember && (
                  <div className="col-span-12 text-center py-8">
                    <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 font-jakarta">
                      Please select your name from the member list above to continue.
                    </p>
                  </div>
                )}
              </form>
              );
            })() : (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 font-jakarta">Registration form is not yet configured.</p>
              </div>
            )}

          </div>
          {/* ── END BODY ── */}

        </div> {/* END card */}
      </div> {/* END centered wrapper */}

      {/* Kaizen branding — position:fixed, so it stays on screen while the form scrolls. */}
      <KaizenBrandFooter />
    </div>
  );
};

export default PublicRegistration;
