import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import SearchableSelect from '../ui/SearchableSelect';
import SignaturePad from '../ui/SignaturePad';
import { Checkbox } from '../ui/checkbox';
import { X, Star, Eye } from 'lucide-react';
import api from '../../services/api';
import { debounce } from 'lodash';
import {
  getChoiceLayoutClass, resolveOptionValue, sanitizeTextInput, wordCount,
} from '../../utils/fieldProperties';
import { computeFieldStates } from '../../utils/fieldRules';
import { validateFieldValue } from '../../utils/fieldValidation';
import { RichTextView } from '../ui/RichTextInput';
import { hexToRgba } from '../../utils/colorUtils';

const DEFAULT_THEME = {
  primary_color: '#091D40',
  secondary_color: '#14b8a6',
  background_color: '#ffffff',
  text_color: '#1e293b',
  accent_color: '#091D40',
  font_family: 'Libre Baskerville',
  card_style: 'solid',
  gradient: null,
  page_background: '#f8fafc'
};

// custom_amount contribution to the total: empty/non-numeric input counts as 0,
// otherwise the typed value as-is — NOT clamped to min_value/max_value. Mirrors the
// public form (PublicRegistration/PublicLandingPage) so the preview total matches
// what registrants and the server compute; see safeCustomAmount there for why
// clamping here would show the admin a misleading preview total.
const safeCustomAmount = (raw) => {
  if (raw === undefined || raw === null || raw === '') return 0;
  const amount = parseFloat(raw);
  return isNaN(amount) ? 0 : amount;
};

const FormPreview = ({ 
  fields, 
  basePrice, 
  campaignName, 
  onClose, 
  fieldRules = [], 
  pricingRules = [], 
  pricingFormula = '', 
  campaignId = null,
  theme = null,
  headerImage = null,
  submitButtonText = '',
  layoutMode = 'standard'
}) => {
  const [formData, setFormData] = useState({});
  const [calculatedPrice, setCalculatedPrice] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [validationRun, setValidationRun] = useState(false);
  // One-question-per-screen preview paging (card / spotlight layout modes).
  const [previewPage, setPreviewPage] = useState(1);
  // Preview device viewport (Desktop / Tablet / Mobile) — matches the public form's
  // responsive breakpoints so the admin can check each width.
  const [device, setDevice] = useState('desktop');
  const DEVICE_WIDTH = { desktop: '100%', tablet: '768px', mobile: '390px' };

  // Merge default theme with provided theme
  const activeTheme = { ...DEFAULT_THEME, ...theme };

  // Field rules are evaluated locally (same semantics as the public form) —
  // synchronous, no server round-trip.
  const fieldStates = useMemo(
    () => computeFieldStates(fieldRules, formData, fields),
    [fieldRules, formData, fields]
  );

  // Calculate price when form data changes
  const calculatePrice = useCallback(
    debounce(async (values) => {
      if (!campaignId) {
        // Local calculation
        let total = parseFloat(basePrice) || 0;
        fields.forEach((field) => {
          // custom_amount adds the registrant-entered value (clamped to min/max),
          // matching the public form's local price computation.
          if (field.type === 'custom_amount') {
            total += safeCustomAmount(values[field.id]);
            return;
          }
          if (field.options && values[field.id]) {
            const selectedValues = Array.isArray(values[field.id])
              ? values[field.id]
              : [values[field.id]];

            field.options.forEach((option) => {
              if (selectedValues.includes(option.value)) {
                total += parseFloat(option.price_modifier) || 0;
              }
            });
          }
        });
        setCalculatedPrice({ total, base_price: basePrice, subtotal: total });
        return;
      }

      try {
        const response = await api.post(`/campaigns/${campaignId}/calculate-price`, {
          base_price: parseFloat(basePrice) || 0,
          field_values: values,
          pricing_rules: pricingRules,
          pricing_formula: pricingFormula
        });
        // .NET /calculate-price serializes the total as `total` (snake_case),
        // not `total_price` — normalize so calculateTotal() reads a real number.
        setCalculatedPrice({ ...response.data, total: response.data.total });
      } catch (error) {
        console.error('Failed to calculate price:', error);
      }
    }, 300),
    [campaignId, basePrice, pricingRules, pricingFormula, fields]
  );

  // Calculate price when form data changes
  useEffect(() => {
    calculatePrice(formData);
  }, [formData, calculatePrice]);

  const handleChange = (fieldId, value) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    const baseId = fieldId.replace(/_(first|middle|last|country)$/, '');
    setFieldErrors((prev) => {
      if (!prev[baseId]) return prev;
      const next = { ...prev };
      delete next[baseId];
      return next;
    });
  };

  // Runs the public form's validator over the preview's data so the admin can see
  // exactly which rules fire and with what wording, without submitting anything.
  const runValidation = () => {
    const errors = {};
    fields.forEach((field) => {
      if (!isFieldVisible(field.id)) return;
      const message = validateFieldValue(field, formData, { required: isFieldRequired(field) });
      if (message) errors[field.id] = message;
    });
    setFieldErrors(errors);
    setValidationRun(true);
  };

  const calculateTotal = () => {
    if (calculatedPrice) {
      // Guard against a missing total so the render's .toFixed(2) can never throw.
      return calculatedPrice.total ?? 0;
    }

    let total = parseFloat(basePrice) || 0;

    fields.forEach((field) => {
      // custom_amount adds the registrant-entered value as typed (see safeCustomAmount).
      if (field.type === 'custom_amount') {
        total += safeCustomAmount(formData[field.id]);
        return;
      }
      if (field.options && formData[field.id]) {
        const selectedValues = Array.isArray(formData[field.id])
          ? formData[field.id]
          : [formData[field.id]];

        field.options.forEach((option) => {
          if (selectedValues.includes(option.value)) {
            total += parseFloat(option.price_modifier) || 0;
          }
        });
      }
    });

    return total;
  };

  // Check if a field should be visible based on field rules
  const isFieldVisible = (fieldId) => {
    return fieldStates[fieldId]?.visible !== false;
  };

  // Check if a field is required (either by default or by field rules)
  const isFieldRequired = (field) => {
    return field.required || fieldStates[field.id]?.required === true;
  };

  // Renders a field and appends its validation error inside the same wrapper, so
  // every field type shows the message without repeating markup in each branch.
  const renderField = (field) => {
    const rendered = renderFieldControl(field);
    if (!rendered) return rendered;
    const message = fieldErrors[field.id];

    // Cloned on EVERY render, not only when there's a message: React.Children.toArray
    // re-keys the children, so cloning conditionally would change the key scheme the
    // moment an error appears or clears — remounting the input and stealing focus from
    // the registrant mid-keystroke. Keeping the shape constant keeps focus.
    return React.cloneElement(
      rendered,
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
    // Check visibility
    if (!isFieldVisible(field.id)) {
      return null;
    }

    // New width names (small/medium/large) + legacy (full/half/third) for back-compat.
    const widthClass = {
      // New
      small:  'col-span-6',
      medium: 'col-span-8',
      large:  'col-span-12',
      // Legacy (forms saved before the rename keep rendering correctly)
      full:   'col-span-12',
      half:   'col-span-6',
      third:  'col-span-4',
    }[field.width] || 'col-span-12';

    switch (field.type) {
      case 'name':
        const nameConfig = field.name_config || {};
        const showMiddle = nameConfig.show_middle_name;
        const showLast = nameConfig.show_last_name !== false;
        
        // Calculate grid columns based on visible fields
        let gridCols = 1;
        if (showMiddle && showLast) gridCols = 3;
        else if (showLast || showMiddle) gridCols = 2;
        
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {isFieldRequired(field) && <span className="text-accent">*</span>}
            </Label>
            <div className={`grid grid-cols-${gridCols} gap-3`} style={{ 
              display: 'grid', 
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: '0.75rem'
            }}>
              {/* First Name - Always shown */}
              <div>
                <Label className="text-slate-500 font-jakarta text-xs mb-1 block">
                  {nameConfig.first_name_label || 'First Name'}
                </Label>
                <Input
                  type="text"
                  value={formData[`${field.id}_first`] || ''}
                  onChange={(e) => handleChange(`${field.id}_first`, sanitizeTextInput(e.target.value, field))}
                  maxLength={field.max_length || undefined}
                  placeholder={nameConfig.first_name_placeholder || 'Enter first name'}
                  required={isFieldRequired(field)}
                  className="h-11 rounded-lg border-slate-200 focus-visible:ring-primary"
                />
              </div>
              
              {/* Middle Name - Optional */}
              {showMiddle && (
                <div>
                  <Label className="text-slate-500 font-jakarta text-xs mb-1 block">
                    {nameConfig.middle_name_label || 'Middle Name'}
                  </Label>
                  <Input
                    type="text"
                    value={formData[`${field.id}_middle`] || ''}
                    onChange={(e) => handleChange(`${field.id}_middle`, sanitizeTextInput(e.target.value, field))}
                    maxLength={field.max_length || undefined}
                    placeholder={nameConfig.middle_name_placeholder || 'Enter middle name'}
                    className="h-11 rounded-lg border-slate-200 focus-visible:ring-primary"
                  />
                </div>
              )}
              
              {/* Last Name - Optional but recommended */}
              {showLast && (
                <div>
                  <Label className="text-slate-500 font-jakarta text-xs mb-1 block">
                    {nameConfig.last_name_label || 'Last Name'}
                  </Label>
                  <Input
                    type="text"
                    value={formData[`${field.id}_last`] || ''}
                    onChange={(e) => handleChange(`${field.id}_last`, sanitizeTextInput(e.target.value, field))}
                    maxLength={field.max_length || undefined}
                    placeholder={nameConfig.last_name_placeholder || 'Enter last name'}
                    required={field.required}
                    className="h-11 rounded-lg border-slate-200 focus-visible:ring-primary"
                  />
                </div>
              )}
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-2">{field.help_text}</p>}
          </div>
        );

      case 'section_header':
        return (
          <div key={field.id} className="col-span-12 mb-4">
            <h3 className="text-xl font-outfit font-semibold text-slate-900 mb-2">{field.label}</h3>
            {field.help_text && <p className="text-sm text-slate-600 font-jakarta">{field.help_text}</p>}
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <SearchableSelect
              id={field.id}
              value={formData[field.id] || ''}
              onChange={(v) => handleChange(field.id, v)}
              options={(field.options || []).map((opt) => ({
                value: resolveOptionValue(opt),
                label: opt.price_modifier > 0 ? `${opt.label} (+₹${opt.price_modifier})` : opt.label,
              }))}
              required={field.required}
              className="w-full h-11 rounded-lg border border-slate-200 pl-3 pr-10 py-2 text-sm flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );

      case 'radio':
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className={getChoiceLayoutClass(field.column_layout)}>
              {field.options?.map((opt) => {
                const submitValue = resolveOptionValue(opt);
                return (
                  <label key={opt.value ?? opt.label} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name={field.id}
                      value={submitValue}
                      checked={formData[field.id] === submitValue}
                      onChange={(e) => handleChange(field.id, e.target.value)}
                      required={field.required}
                      className="w-4 h-4 text-primary"
                    />
                    <span className="text-sm font-jakarta text-slate-700">
                      {opt.label} {opt.price_modifier > 0 && `(+₹${opt.price_modifier})`}
                    </span>
                  </label>
                );
              })}
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );

      case 'checkbox':
        if (!field.options || field.options.length === 0) {
          return (
            <div key={field.id} className={widthClass}>
              <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
                {field.label} {field.required && <span className="text-accent">*</span>}
              </Label>
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
                ⚠️ No options configured for this checkbox field
              </p>
            </div>
          );
        }
        {
          const selected = formData[field.id] || [];
          const maxSel   = field.max_selections;
          const atMax    = maxSel && selected.length >= maxSel;
          return (
            <div key={field.id} className={widthClass}>
              <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
                {field.label} {field.required && <span className="text-accent">*</span>}
                {maxSel && (
                  <span className={`ml-2 text-xs font-normal ${atMax ? 'text-amber-600' : 'text-slate-500'}`}>
                    ({selected.length}/{maxSel} selected)
                  </span>
                )}
              </Label>
              <div className={getChoiceLayoutClass(field.column_layout)}>
                {field.options.map((opt) => {
                  const submitValue = resolveOptionValue(opt);
                  const isChecked   = selected.includes(submitValue);
                  const lockedOut   = atMax && !isChecked;
                  return (
                    <label key={opt.value ?? opt.label} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        value={submitValue}
                        checked={isChecked}
                        disabled={lockedOut}
                        onChange={(e) => {
                          const current = formData[field.id] || [];
                          const updated = e.target.checked
                            ? [...current, submitValue]
                            : current.filter((v) => v !== submitValue);
                          handleChange(field.id, updated);
                        }}
                        className="w-4 h-4 text-primary rounded"
                      />
                      <span className={`text-sm font-jakarta ${lockedOut ? 'text-slate-400' : 'text-slate-700'}`}>
                        {opt.label} {opt.price_modifier > 0 && `(+₹${opt.price_modifier})`}
                      </span>
                    </label>
                  );
                })}
              </div>
              {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
            </div>
          );
        }

      case 'terms_checkbox':
        return (
          <div key={field.id} className="col-span-12">
            <label className="flex items-start space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData[field.id] || false}
                onChange={(e) => handleChange(field.id, e.target.checked)}
                required={field.required}
                className="w-4 h-4 text-primary rounded mt-1"
              />
              <span className="text-sm font-jakarta text-slate-700">
                {field.label} {field.required && <span className="text-accent">*</span>}
                {field.terms_url && (
                  <a
                    href={field.terms_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    // Don't let the click bubble to the label and toggle the checkbox
                    onClick={(e) => e.stopPropagation()}
                    className="ml-2 text-primary underline hover:text-primary-hover"
                  >
                    View terms
                  </a>
                )}
              </span>
            </label>
            {field.help_text && <RichTextView html={field.help_text} className="text-sm mt-1 ml-6" />}
          </div>
        );

      case 'currency':
      case 'custom_amount':
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
              <Input
                type="number"
                min={field.min_value ?? undefined}
                max={field.max_value ?? undefined}
                value={formData[field.id] || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder || '0'}
                required={field.required}
                className="h-11 rounded-lg border-slate-200 focus-visible:ring-primary pl-7"
              />
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );

      case 'rating': {
        const maxRating = Math.max(3, Math.min(10, parseInt(field.max_rating, 10) || 5));
        const currentRating = parseInt(formData[field.id], 10) || 0;
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className="flex items-center gap-1">
              {Array.from({ length: maxRating }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleChange(field.id, i + 1)}
                  className="p-0.5 transition-transform hover:scale-110"
                  aria-label={`Rate ${i + 1} of ${maxRating}`}
                >
                  <Star
                    className={`w-6 h-6 ${i < currentRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
                  />
                </button>
              ))}
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );
      }

      case 'textarea': {
        const txt = formData[field.id] || '';
        const wc  = wordCount(txt);
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <textarea
              value={txt}
              onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
              maxLength={field.max_length || undefined}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {(field.max_length || field.max_words) && (
              <p className="text-xs text-slate-400 font-jakarta mt-1 text-right space-x-2">
                {field.max_length && <span>{txt.length} / {field.max_length} chars</span>}
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

      case 'rich_text':
        return (
          <div key={field.id} className={widthClass}>
            {field.label && (
              <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
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

      case 'divider': {
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

      case 'slider': {
        const minV  = Number.isFinite(parseFloat(field.min_value)) ? parseFloat(field.min_value) : 0;
        const maxV  = Number.isFinite(parseFloat(field.max_value)) ? parseFloat(field.max_value) : 100;
        const stepV = Number.isFinite(parseFloat(field.step)) && parseFloat(field.step) > 0 ? parseFloat(field.step) : 1;
        const hasVal = formData[field.id] !== undefined && formData[field.id] !== null && formData[field.id] !== '';
        const curV  = hasVal ? parseFloat(formData[field.id]) : minV;
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={minV}
                max={maxV}
                step={stepV}
                value={curV}
                onChange={(e) => handleChange(field.id, e.target.value)}
                className="flex-1 h-2 accent-primary cursor-pointer"
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

      case 'yes_no': {
        const ynVal = formData[field.id];
        const ynOpts = [
          { v: 'yes', label: field.yes_label || 'Yes' },
          { v: 'no',  label: field.no_label  || 'No'  },
        ];
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className="inline-flex rounded-xl border-2 border-slate-200 p-1 gap-1">
              {ynOpts.map((o) => {
                const active = ynVal === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => handleChange(field.id, o.v)}
                    aria-pressed={active}
                    className={`px-6 py-2 rounded-lg text-sm font-jakarta font-medium transition-all min-w-[84px]
                      ${active ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
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

      case 'address': {
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
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className="grid grid-cols-12 gap-3">
              {parts.map((p) => (
                <div key={p.key} className={p.full ? 'col-span-12' : 'col-span-6'}>
                  <Label className="text-slate-500 font-jakarta text-xs mb-1 block uppercase tracking-wide">{p.label}</Label>
                  <Input
                    type="text"
                    value={formData[`${field.id}_${p.key}`] || ''}
                    onChange={(e) => setPart(p.key, sanitizeTextInput(e.target.value, field))}
                    maxLength={field.max_length || undefined}
                    className="h-11 rounded-lg border-slate-200 focus-visible:ring-primary"
                  />
                </div>
              ))}
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );
      }

      case 'signature':
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <SignaturePad
              value={formData[field.id] || null}
              onChange={(dataUrl) => handleChange(field.id, dataUrl)}
            />
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );

      case 'image_choice': {
        const selectedVal = formData[field.id];
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(field.options || []).map((opt) => {
                const val = resolveOptionValue(opt);
                const isSel = selectedVal === val;
                return (
                  <button
                    key={opt.value ?? opt.label}
                    type="button"
                    onClick={() => handleChange(field.id, val)}
                    aria-pressed={isSel}
                    className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${isSel ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200 hover:border-primary/40'}`}
                  >
                    <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden">
                      {opt.image_url ? (
                        <img src={opt.image_url} alt={opt.label} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
                  </button>
                );
              })}
            </div>
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );
      }

      default:
        return (
          <div key={field.id} className={widthClass}>
            <Label className="text-slate-700 font-jakarta font-medium mb-2 block">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </Label>
            <Input
              type={field.type}
              value={formData[field.id] || ''}
              onChange={(e) => handleChange(field.id, sanitizeTextInput(e.target.value, field))}
              placeholder={field.placeholder}
              required={field.required}
              maxLength={field.max_length || undefined}
              className="h-11 rounded-lg border-slate-200 focus-visible:ring-primary"
            />
            {field.max_length && (
              <p className="text-xs text-slate-400 font-jakarta mt-1 text-right">
                {(formData[field.id] || '').length} / {field.max_length}
              </p>
            )}
            {field.help_text && <p className="text-xs text-slate-500 font-jakarta mt-1">{field.help_text}</p>}
          </div>
        );
    }
  };

  // One-question-per-screen preview (card / spotlight). Statically hidden fields
  // are dropped so they don't create blank screens — mirrors the public form.
  const oneFieldPerScreen = layoutMode === 'card' || layoutMode === 'spotlight';
  const screenFields = oneFieldPerScreen ? (fields || []).filter((f) => f.visibility !== 'hide') : (fields || []);
  const totalScreens = oneFieldPerScreen ? Math.max(1, screenFields.length) : 1;
  const curScreen = Math.min(Math.max(1, previewPage), totalScreens);
  const isLastScreen = curScreen >= totalScreens;

  return (
    <div
      className="ke-form-root min-h-screen p-8"
      data-formstyle={activeTheme.style || undefined}
      data-formlayout={activeTheme.style ? (activeTheme.layout || 'card') : undefined}
      data-formfields={activeTheme.style ? (activeTheme.fields || 'stack') : undefined}
      style={{
        background: activeTheme.page_background || activeTheme.gradient || '#f8fafc',
        backgroundImage: activeTheme.page_background_image ? `url(${activeTheme.page_background_image})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...(activeTheme.style ? {} : { fontFamily: activeTheme.font_family || 'Libre Baskerville' }),
        ...(activeTheme.style ? {
          '--fs-primary': activeTheme.primary_color,
          '--fs-accent': activeTheme.accent_color || activeTheme.primary_color,
          '--fs-text': activeTheme.text_color,
          '--fs-surface': activeTheme.background_color,
          '--fs-page': activeTheme.page_background,
          '--fs-font': activeTheme.font_family,
        } : {})
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Admin preview chrome — a slim premium bar floating above the WYSIWYG canvas.
            It uses design-system tokens (not the registrant theme) because it is admin UI:
            the themed page background + form card below stay faithful to the public form. */}
        <div className="ke-card flex items-center justify-between gap-4 p-4 mb-6">
          <div className="flex items-center gap-3">
            <span
              className="ke-medallion"
              style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
            >
              <Eye className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">
                Live Preview
              </div>
              <h1 className="text-xl font-outfit font-bold tracking-tight text-foreground leading-tight">
                Form Preview
              </h1>
              <p className="text-xs text-muted-foreground font-jakarta">{campaignName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Device viewport toggles */}
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              {[['desktop', 'Desktop'], ['tablet', 'Tablet'], ['mobile', 'Mobile']].map(([d, lbl]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  data-testid={`preview-device-${d}`}
                  className={`px-2.5 py-1.5 text-xs font-jakarta rounded-md transition-colors ${device === d ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="close-preview"
              className="border-border hover:bg-muted font-jakarta rounded-lg"
            >
              <X className="w-4 h-4 mr-2" />
              Close Preview
            </Button>
          </div>
        </div>

        {/* Device-constrained form area (Desktop 100% / Tablet 768 / Mobile 390) */}
        <div style={{ maxWidth: DEVICE_WIDTH[device], width: '100%', margin: '0 auto', transition: 'max-width .25s ease' }}>

        {/* Header Image */}
        {headerImage && (
          <div className="mb-6 rounded-xl overflow-hidden shadow-lg">
            <img 
              src={headerImage} 
              alt="Form header" 
              className="w-full h-48 object-cover"
            />
          </div>
        )}

        {/* Form Card */}
        <Card
          className={`ke-form-card rounded-xl border shadow-card p-8 ${layoutMode === 'spotlight' ? 'ke-spotlight' : ''}`}
          style={{
            backgroundColor: activeTheme.background_color,
            backgroundImage: activeTheme.background_image
              ? `linear-gradient(${hexToRgba(activeTheme.background_color, 0.85)}, ${hexToRgba(activeTheme.background_color, 0.85)}), url(${activeTheme.background_image})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderColor: activeTheme.card_style === 'glass' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
            backdropFilter: activeTheme.card_style === 'glass' ? 'blur(10px)' : 'none'
          }}
        >
          <form className="grid grid-cols-12 gap-6">
            {fields.length > 0 ? (
              oneFieldPerScreen ? (
                <>
                  {totalScreens > 1 && (
                    <div className="col-span-12 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-jakarta font-semibold uppercase tracking-wide" style={{ color: activeTheme.text_color, opacity: 0.6 }}>
                          Question {curScreen} of {totalScreens}
                        </span>
                        <span className="text-xs font-jakarta" style={{ color: activeTheme.text_color, opacity: 0.45 }}>
                          {Math.round((curScreen / totalScreens) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${activeTheme.text_color}20` }}>
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(curScreen / totalScreens) * 100}%`, backgroundColor: activeTheme.primary_color }} />
                      </div>
                    </div>
                  )}

                  {screenFields[curScreen - 1] && renderField(screenFields[curScreen - 1])}

                  {totalScreens > 1 && (
                    <div className="col-span-12 flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: `${activeTheme.text_color}20` }}>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={curScreen <= 1}
                        onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      >
                        ← Previous
                      </Button>
                      {!isLastScreen && (
                        <Button
                          type="button"
                          onClick={() => setPreviewPage((p) => Math.min(totalScreens, p + 1))}
                          style={{ backgroundColor: activeTheme.primary_color, color: '#fff' }}
                        >
                          Next →
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                fields.map((field) => renderField(field))
              )
            ) : (
              <div
                className="col-span-12 py-12 text-center font-jakarta text-sm"
                style={{ color: activeTheme.text_color, opacity: 0.6 }}
              >
                No fields have been added to this form yet. Add fields in the builder to preview them here.
              </div>
            )}
          </form>

          {/* Total Price */}
          {basePrice > 0 && (!oneFieldPerScreen || isLastScreen) && (
            <div className="mt-8 pt-6 border-t" style={{ borderColor: `${activeTheme.text_color}20` }}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-outfit font-semibold" style={{ color: activeTheme.text_color }}>
                  Total Amount
                </span>
                <span className="text-2xl font-outfit font-bold" style={{ color: activeTheme.primary_color }}>
                  ₹{calculateTotal().toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Submit Button (Preview Only). In card/spotlight it appears on the last
              screen, matching the public form. Clicking runs the same validation the
              public form runs — so the admin can check their limits and their custom
              messages here — but never submits. */}
          {(!oneFieldPerScreen || isLastScreen) && (
          <div className="mt-6">
            <Button
              type="button"
              onClick={runValidation}
              className="ke-form-submit w-full font-jakarta font-medium rounded-lg h-12"
              style={{
                backgroundColor: activeTheme.primary_color,
                color: '#ffffff'
              }}
            >
              {submitButtonText || 'Register & Pay'}
            </Button>
            {validationRun && !Object.keys(fieldErrors).length && (
              <p className="text-xs text-center mt-2 text-emerald-600 font-jakarta">
                All validation rules pass.
              </p>
            )}
            <p className="text-xs text-center mt-2" style={{ color: activeTheme.text_color, opacity: 0.5 }}>
              This is a preview — the button checks your validation rules and messages, nothing is submitted.
            </p>
          </div>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
};

export default FormPreview;
