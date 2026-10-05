import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { X, Plus, Trash2, Save, Upload, ArrowDownAZ, ArrowUpAZ, ChevronDown } from 'lucide-react';
import { COUNTRIES } from '../ui/PhoneInput';
import RichTextInput from '../ui/RichTextInput';
import { applicableMessageKeys, defaultMessageFor, MESSAGE_LABELS, gatewayAmountLimitsFor, gatewayLabelFor } from '../../utils/fieldValidation';
import { FIELD_TYPES } from '../../utils/formFieldTypes';

const TEXT_LIKE_TYPES    = ['text', 'textarea', 'email', 'name', 'address'];
const NUMERIC_TYPES      = ['number', 'currency', 'percentage', 'slider', 'custom_amount'];
// Fields where an input-mask makes sense — short, single-line text. Excludes
// textarea (multi-line prose) and address (multi-element). Excludes number /
// currency / phone — those already enforce digits-only by design.
const INPUT_MASK_TYPES   = ['text', 'email', 'name'];
// Multi-line fields where word-count is a useful constraint in addition to
// the character limit (Zoho's Multi Line config).
const WORD_LIMIT_TYPES   = ['textarea'];

// Available input masks. Matches Zoho's "Input Type" dropdown on Single Line.
const INPUT_MASK_OPTIONS = [
  { value: 'any',                   label: 'Any character'              },
  { value: 'letters_only',          label: 'Letters only'               },
  { value: 'letters_numbers',       label: 'Letters + Numbers'          },
  { value: 'letters_spaces',        label: 'Letters + Spaces'           },
  { value: 'letters_numbers_spaces',label: 'Letters + Numbers + Spaces' },
];
const CHOICE_TYPES       = ['dropdown', 'radio', 'checkbox'];
// Field category → brand hue (matches the Field Library palette), for the header chip.
const CATEGORY_HUE = {
  basic:    'var(--cat-basic)',
  choice:   'var(--accent)',
  advanced: 'var(--destructive)',
  layout:   'var(--muted-foreground)',
};

const FieldEditor = ({ field, onUpdate, onClose, paymentGateway }) => {
  const [localField, setLocalField] = useState(field);
  const [hasChanges, setHasChanges] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importReplace, setImportReplace] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [trackedId, setTrackedId] = useState(field.id);

  // Reset local state SYNCHRONOUSLY when a different field is selected.
  // Doing this during render (not in an effect) guarantees `localField` already
  // points at the newly-selected field before child inputs — e.g. the rich-text
  // editor — mount, so they never briefly render the previous field's data.
  if (field.id !== trackedId) {
    setTrackedId(field.id);
    setLocalField(field);
    setHasChanges(false);
    setShowMessages(false);
  }

  const handleChange = (key, value) => {
    const updated = { ...localField, [key]: value };
    setLocalField(updated);
    setHasChanges(true);
  };

  // Custom validation wording. An emptied box drops the key entirely rather than
  // storing "", so the field falls back to the default message instead of
  // showing the registrant a blank error.
  const handleMessageChange = (key, value) => {
    const next = { ...(localField.validation_messages || {}) };
    if (value.trim()) next[key] = value;
    else delete next[key];
    handleChange('validation_messages', Object.keys(next).length ? next : null);
  };

  const handleSave = () => {
    // Validate options for choice fields
    const choiceFieldTypes = ['dropdown', 'radio', 'checkbox', 'image_choice'];
    if (choiceFieldTypes.includes(localField.type)) {
      if (!localField.options || localField.options.length === 0) {
        return; // Don't save - validation warning is already shown
      }
    }

    // Sanitize options to ensure all have valid 'value' fields before saving
    let fieldToSave = { ...localField };
    if (fieldToSave.options && fieldToSave.options.length > 0) {
      fieldToSave.options = fieldToSave.options.map((opt, idx) => ({
        ...opt,
        value: opt.value || generateValueFromLabel(opt.label || `option_${idx}`)
      }));
    }
    onUpdate(fieldToSave);
    setHasChanges(false);
  };

  const handleNameConfigChange = (key, value) => {
    const updatedConfig = { 
      ...(localField.name_config || {}), 
      [key]: value 
    };
    handleChange('name_config', updatedConfig);
  };

  // Generate a URL-safe value from label
  const generateValueFromLabel = (label) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '') || `option_${Date.now()}`;
  };

  const handleOptionChange = (index, key, value) => {
    const updatedOptions = [...(localField.options || [])];
    updatedOptions[index] = { ...updatedOptions[index], [key]: value };
    
    // Auto-generate value from label when label changes
    if (key === 'label') {
      updatedOptions[index].value = generateValueFromLabel(value);
    }
    
    handleChange('options', updatedOptions);
  };

  const makeNewOption = () => {
    const optionNum = (localField.options?.length || 0) + 1;
    const label = `Option ${optionNum}`;
    return { label, value: generateValueFromLabel(label), price_modifier: 0 };
  };

  const addOption = () => {
    handleChange('options', [...(localField.options || []), makeNewOption()]);
  };

  // Insert a new option immediately after the given index, so options can be
  // added in place (no scrolling to the bottom on long lists).
  const addOptionAt = (index) => {
    const updatedOptions = [...(localField.options || [])];
    updatedOptions.splice(index + 1, 0, makeNewOption());
    handleChange('options', updatedOptions);
  };

  const removeOption = (index) => {
    const updatedOptions = (localField.options || []).filter((_, i) => i !== index);
    handleChange('options', updatedOptions);
  };

  // Sort existing options alphabetically (mutates the stored order)
  const sortOptions = (direction) => {
    const sorted = [...(localField.options || [])].sort((a, b) => {
      const la = (a.label || '').toLowerCase();
      const lb = (b.label || '').toLowerCase();
      return direction === 'asc' ? la.localeCompare(lb) : lb.localeCompare(la);
    });
    handleChange('options', sorted);
  };

  // Import choices from pasted text — one option per line. Each line may carry
  // an optional price after a separator (comma, "|", "=" or ":"), e.g.
  //   "VIP Pass, 500"  →  label "VIP Pass", amount 500
  //   "Standard = 100" →  label "Standard", amount 100
  // A line with commas but no trailing number is still treated as a quick
  // comma-separated list of plain labels (backward compatible).
  const handleImportChoices = () => {
    const rawLines = importText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (rawLines.length === 0) {
      setShowImport(false);
      return;
    }

    // Matches "<label> <sep> <number>" where sep is , | = or : and the value
    // after it is a (possibly negative/decimal) number at the end of the line.
    const AMOUNT_RE = /^(.*[^\s|=:,])\s*[|=:]\s*(-?\d+(?:\.\d+)?)\s*$|^(.*[^\s,])\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

    const parseLine = (line) => {
      const m = line.match(AMOUNT_RE);
      if (m) {
        const label  = (m[1] ?? m[3]).trim();
        const amount = parseFloat(m[2] ?? m[4]);
        return [{ label, amount: Number.isFinite(amount) ? amount : 0 }];
      }
      // No trailing amount — a comma list becomes several plain labels.
      if (line.includes(',')) {
        return line.split(',').map(s => s.trim()).filter(Boolean).map(label => ({ label, amount: 0 }));
      }
      return [{ label: line, amount: 0 }];
    };

    const newOptions = rawLines.flatMap(parseLine).map(({ label, amount }) => ({
      label,
      value: generateValueFromLabel(label),
      price_modifier: amount,
    }));

    const base = importReplace ? [] : (localField.options || []);
    handleChange('options', [...base, ...newOptions]);
    setImportText('');
    setImportReplace(false);
    setShowImport(false);
  };

  const hasOptions    = CHOICE_TYPES.includes(field.type);
  const isDivider     = field.type === 'divider';
  const isLayoutField = ['section_header', 'divider'].includes(field.type);
  const isNameField   = field.type === 'name';
  const isRichText    = field.type === 'rich_text';
  const isTermsCheckbox = field.type === 'terms_checkbox';
  const isNumeric     = NUMERIC_TYPES.includes(field.type);
  const isTextLike    = TEXT_LIKE_TYPES.includes(field.type);
  const isPhone       = field.type === 'phone' || field.type === 'tel';
  const supportsMask  = INPUT_MASK_TYPES.includes(field.type);
  const supportsWordLimit = WORD_LIMIT_TYPES.includes(field.type);
  const nameConfig    = localField.name_config || {};

  // Derived from localField, not field, so a limit typed in above makes its
  // message row appear immediately — before the field has been saved.
  const messageKeys = applicableMessageKeys(localField);
  const customMessageCount = messageKeys.filter(
    (k) => (localField.validation_messages?.[k] || '').trim()
  ).length;

  return (
    <div className="p-5 space-y-6">
      {/* Header — presents the field type as an extended Field-Library chip: a
          category-coloured icon medallion (same hues as the palette) + type name. */}
      {(() => {
        const meta = FIELD_TYPES.find((f) => f.type === field.type);
        const TypeIcon = meta?.icon;
        const typeLabel = meta?.label || 'Field';
        const hue = `hsl(${CATEGORY_HUE[meta?.category] || 'var(--primary)'})`;
        return (
          <div>
            <div className="flex items-center gap-3">
              <span className="ke-chip w-11 h-11 shrink-0" style={{ '--chip': hue }}>
                {TypeIcon && <TypeIcon className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-jakarta font-semibold uppercase tracking-wider text-muted-foreground">
                  Field Settings
                </div>
                <div className="text-base font-outfit font-bold text-foreground truncate leading-tight">{typeLabel}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                data-testid="close-editor"
                className="hover:bg-muted rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {meta?.description && (
              <p className="text-xs mt-2 text-muted-foreground font-jakarta">{meta.description}</p>
            )}
            <div className="ke-rule-gold mt-3" />
          </div>
        );
      })()}

      {/* Field Label */}
      <div>
        <Label className="text-foreground font-jakarta font-medium mb-2 block">
          {isLayoutField ? (isDivider ? 'Label (optional)' : 'Title') : isRichText ? 'Heading (optional)' : 'Label'}{!isRichText && !isDivider && ' *'}
        </Label>
        <Input
          value={localField.label}
          onChange={(e) => handleChange('label', e.target.value)}
          placeholder={isRichText ? 'e.g. Terms & Conditions (leave blank to hide)' : 'Enter label'}
          data-testid="field-label-input"
          className="h-11 rounded-lg border-border focus-visible:ring-primary"
        />
      </div>

      {/* Rich Text content editor — the modern formatting editor opens right here */}
      {isRichText && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Content
          </Label>
          <p className="text-xs text-muted-foreground font-jakarta mb-2">
            Type and format the text below. It appears exactly like this on the form.
          </p>
          <RichTextInput
            key={field.id}
            value={localField.content || ''}
            onChange={(html) => handleChange('content', html)}
            placeholder="Write and format your content here…"
          />
        </div>
      )}

      {/* Rich Text appearance — background & border for the content box */}
      {isRichText && (
        <div className="ke-card p-5 space-y-4">
          <div>
            <h4 className="ke-section-title text-[15px]">Appearance</h4>
            <div className="ke-rule-gold mt-2 mb-2" />
          </div>

          {/* Background colour */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground font-jakarta">Background color</span>
              {localField.content_bg_color && (
                <input
                  type="color"
                  value={localField.content_bg_color}
                  onChange={(e) => handleChange('content_bg_color', e.target.value)}
                  className="w-8 h-8 p-0 border border-border rounded cursor-pointer bg-transparent"
                  title="Pick background color"
                />
              )}
            </div>
            <Switch
              checked={!!localField.content_bg_color}
              onCheckedChange={(checked) => handleChange('content_bg_color', checked ? '#f1f5f9' : '')}
            />
          </div>

          {/* Border */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground font-jakarta">Border</span>
              {localField.content_border_color && (
                <input
                  type="color"
                  value={localField.content_border_color}
                  onChange={(e) => handleChange('content_border_color', e.target.value)}
                  className="w-8 h-8 p-0 border border-border rounded cursor-pointer bg-transparent"
                  title="Pick border color"
                />
              )}
            </div>
            <Switch
              checked={!!localField.content_border_color}
              onCheckedChange={(checked) => handleChange('content_border_color', checked ? '#cbd5e1' : '')}
            />
          </div>
        </div>
      )}

      {/* Name Field Configuration */}
      {isNameField && (
        <div className="ke-card p-5 space-y-4">
          <div>
            <h4 className="ke-section-title text-[15px]">Name Fields Configuration</h4>
            <div className="ke-rule-gold mt-2 mb-2" />
          </div>
          <p className="text-xs text-muted-foreground font-jakarta mb-4">
            Choose which name parts to include. Each part will be a separate input.
          </p>

          {/* First Name Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg">
            <div>
              <Label className="text-foreground font-jakarta font-medium">First Name</Label>
              <p className="text-xs text-muted-foreground font-jakarta">Always enabled</p>
            </div>
            <Switch
              checked={true}
              disabled={true}
              data-testid="name-first-toggle"
            />
          </div>
          
          {/* Middle Name Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg">
            <div>
              <Label className="text-foreground font-jakarta font-medium">Middle Name</Label>
              <p className="text-xs text-muted-foreground font-jakarta">Optional field</p>
            </div>
            <Switch
              checked={nameConfig.show_middle_name || false}
              onCheckedChange={(checked) => handleNameConfigChange('show_middle_name', checked)}
              data-testid="name-middle-toggle"
            />
          </div>
          
          {/* Last Name Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg">
            <div>
              <Label className="text-foreground font-jakarta font-medium">Last Name</Label>
              <p className="text-xs text-muted-foreground font-jakarta">Recommended</p>
            </div>
            <Switch
              checked={nameConfig.show_last_name !== false}
              onCheckedChange={(checked) => handleNameConfigChange('show_last_name', checked)}
              data-testid="name-last-toggle"
            />
          </div>

          {/* Sub-field Labels */}
          <div className="mt-4 space-y-3">
            <Label className="text-muted-foreground font-jakarta font-medium text-sm">Customize Labels</Label>
            
            <div>
              <Label className="text-muted-foreground font-jakarta text-xs mb-1 block">First Name Label</Label>
              <Input
                value={nameConfig.first_name_label || 'First Name'}
                onChange={(e) => handleNameConfigChange('first_name_label', e.target.value)}
                placeholder="First Name"
                className="h-9 rounded-lg border-border text-sm"
              />
            </div>
            
            {nameConfig.show_middle_name && (
              <div>
                <Label className="text-muted-foreground font-jakarta text-xs mb-1 block">Middle Name Label</Label>
                <Input
                  value={nameConfig.middle_name_label || 'Middle Name'}
                  onChange={(e) => handleNameConfigChange('middle_name_label', e.target.value)}
                  placeholder="Middle Name"
                  className="h-9 rounded-lg border-border text-sm"
                />
              </div>
            )}
            
            {nameConfig.show_last_name !== false && (
              <div>
                <Label className="text-muted-foreground font-jakarta text-xs mb-1 block">Last Name Label</Label>
                <Input
                  value={nameConfig.last_name_label || 'Last Name'}
                  onChange={(e) => handleNameConfigChange('last_name_label', e.target.value)}
                  placeholder="Last Name"
                  className="h-9 rounded-lg border-border text-sm"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Placeholder - Only for input fields */}
      {!isLayoutField && !isNameField && !['checkbox', 'radio', 'section_header', 'terms_checkbox', 'rich_text', 'rating', 'slider', 'yes_no', 'address', 'signature', 'image_choice'].includes(field.type) && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Placeholder
          </Label>
          <Input
            value={localField.placeholder || ''}
            onChange={(e) => handleChange('placeholder', e.target.value)}
            placeholder="Enter placeholder text"
            data-testid="field-placeholder-input"
            className="h-11 rounded-lg border-border focus-visible:ring-primary"
          />
        </div>
      )}

      {/* Help Text */}
      <div>
        <Label className="text-foreground font-jakarta font-medium mb-2 block">
          {isLayoutField ? 'Description' : 'Help Text'}
        </Label>
        {isTermsCheckbox ? (
          <>
            <p className="text-xs text-muted-foreground font-jakarta mb-2">
              Type and format the terms text below. It appears exactly like this beneath the checkbox.
            </p>
            <RichTextInput
              key={field.id}
              value={localField.help_text || ''}
              onChange={(html) => handleChange('help_text', html)}
              placeholder="Write and format your terms & conditions here…"
            />
          </>
        ) : (
          <textarea
            value={localField.help_text || ''}
            onChange={(e) => handleChange('help_text', e.target.value)}
            placeholder="Additional information for users"
            rows={3}
            data-testid="field-help-text-input"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        )}
      </div>

      {/* Terms & Conditions URL — terms_checkbox only */}
      {field.type === 'terms_checkbox' && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Terms &amp; Conditions URL
          </Label>
          <Input
            type="url"
            value={localField.terms_url || ''}
            onChange={(e) => handleChange('terms_url', e.target.value)}
            placeholder="https://example.com/terms"
            data-testid="field-terms-url-input"
            className="h-11 rounded-lg border-border focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Registrants get a "View terms" link next to the checkbox.</p>
        </div>
      )}

      {/* Required Toggle */}
      {!isLayoutField && !isRichText && (
        <div className="flex items-center justify-between ke-card p-5">
          <div>
            <Label className="text-foreground font-jakarta font-medium">Required Field</Label>
            <p className="text-xs text-muted-foreground font-jakarta mt-1">
              User must fill this field
            </p>
          </div>
          <Switch
            checked={localField.required}
            onCheckedChange={(checked) => handleChange('required', checked)}
            data-testid="field-required-toggle"
          />
        </div>
      )}

      {/* Field Width */}
      {!isLayoutField && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Field Width
          </Label>
          <select
            value={localField.width || 'large'}
            onChange={(e) => handleChange('width', e.target.value)}
            data-testid="field-width-select"
            className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="small">Small  (50%)</option>
            <option value="medium">Medium (66%)</option>
            <option value="large">Large  (100% — full width)</option>
          </select>
        </div>
      )}

      {/* Visibility — all fields */}
      {!isLayoutField && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Visibility
          </Label>
          <select
            value={localField.visibility || 'show'}
            onChange={(e) => handleChange('visibility', e.target.value)}
            className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="show">Show (default)</option>
            <option value="hide">Hide — field not shown on form</option>
            <option value="disabled">Disabled — shown but read-only</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Use Field Rules to toggle visibility dynamically based on other answers.
          </p>
        </div>
      )}

      {/* Character Limit — text-like fields.
          `name` gets a maximum only: its limit caps each part (first/middle/last)
          as the registrant types, so a minimum across three boxes has no meaning. */}
      {isTextLike && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Character Limit {isNameField ? '' : '(Min / Max)'}
          </Label>
          <div className={isNameField ? '' : 'grid grid-cols-2 gap-2'}>
            {!isNameField && (
              <Input
                type="number"
                min="1"
                value={localField.min_length ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleChange('min_length', v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
                }}
                placeholder="No minimum"
                className="h-11 rounded-lg border-border focus-visible:ring-primary"
              />
            )}
            <Input
              type="number"
              min="1"
              value={localField.max_length ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('max_length', v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
              }}
              placeholder="No limit"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isNameField
              ? 'Maximum characters per name part. Leave blank for no limit.'
              : 'The maximum stops typing at that length; the minimum is checked on submit. Leave blank for no limit.'}
          </p>
        </div>
      )}

      {/* Input Text Case — text-like fields */}
      {isTextLike && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Input Text Case
          </Label>
          <select
            value={localField.text_case || 'default'}
            onChange={(e) => handleChange('text_case', e.target.value)}
            className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="default">System Default</option>
            <option value="upper">UPPER CASE</option>
            <option value="lower">lower case</option>
            {field.type !== 'email' && <option value="proper">Proper Case</option>}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Automatically transforms input as the user types.</p>
        </div>
      )}

      {/* Input Mask — letters only / letters+numbers / etc.  Matches Zoho. */}
      {supportsMask && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Allowed Characters
          </Label>
          <select
            value={localField.input_mask || 'any'}
            onChange={(e) => handleChange('input_mask', e.target.value)}
            className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {INPUT_MASK_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Restrict what users can type. Invalid characters are blocked as the user types.
          </p>
        </div>
      )}

      {/* Word Limit — textarea only (in addition to character limit) */}
      {supportsWordLimit && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Word Limit (Min / Max)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min="1"
              value={localField.min_words ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('min_words', v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
              }}
              placeholder="No minimum"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
            <Input
              type="number"
              min="1"
              value={localField.max_words ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('max_words', v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
              }}
              placeholder="No limit"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            The maximum stops typing at that many words; the minimum is checked on submit.
            Character Limit (above) still applies independently.
          </p>
        </div>
      )}

      {/* Range — numeric fields. custom_amount is a special case: the payment
          gateway itself has a hard floor/ceiling (see gatewayAmountLimitsFor),
          so unlike a plain number/currency/percentage/slider field, its range
          can never be "no limit" — it's always seeded to the gateway's bounds
          and can only be narrowed, never widened past them. Applies regardless
          of whether the field is required; what "required" changes is whether
          the registrant must fill it in at all (see the submit-time checks). */}
      {isNumeric && field.type === 'custom_amount' && (() => {
        const gw = gatewayAmountLimitsFor(paymentGateway);
        const gwLabel = gatewayLabelFor(paymentGateway);
        const minVal = localField.min_value ?? gw.min;
        const maxVal = localField.max_value ?? gw.max;
        return (
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Range (Min / Max)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={gw.min}
                max={maxVal}
                // Free-typing on every keystroke — clamping here would fight a
                // multi-digit amount as it's typed (e.g. typing "150000" one
                // digit at a time, re-floored against a stale Maximum after
                // every keystroke, never lands on the intended value). The
                // actual floor/ceiling/min<=max enforcement happens on blur,
                // once the admin is done typing.
                value={localField.min_value ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleChange('min_value', v === '' ? null : parseFloat(v));
                }}
                onBlur={() => {
                  const parsed = localField.min_value;
                  const safe = Number.isFinite(parsed) ? parsed : gw.min;
                  const currentMax = localField.max_value ?? gw.max;
                  const clamped = Math.min(Math.max(safe, gw.min), Math.min(currentMax, gw.max));
                  if (clamped !== parsed) handleChange('min_value', clamped);
                }}
                placeholder="Minimum"
                className="h-11 rounded-lg border-border focus-visible:ring-primary"
              />
              <Input
                type="number"
                min={minVal}
                max={gw.max}
                value={localField.max_value ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleChange('max_value', v === '' ? null : parseFloat(v));
                }}
                onBlur={() => {
                  const parsed = localField.max_value;
                  const safe = Number.isFinite(parsed) ? parsed : gw.max;
                  const currentMin = localField.min_value ?? gw.min;
                  const clamped = Math.max(Math.min(safe, gw.max), Math.max(currentMin, gw.min));
                  if (clamped !== parsed) handleChange('max_value', clamped);
                }}
                placeholder="Maximum"
                className="h-11 rounded-lg border-border focus-visible:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This campaign collects payments via <strong>{gwLabel}</strong>, which accepts
              ₹{gw.min}–₹{gw.max} per transaction — a donation outside this range would be
              rejected at the gateway, so the range can only be narrowed here, never widened
              past it.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Added to the total automatically. If a master pricing formula is set, reference this field there instead.
            </p>
          </div>
        );
      })()}

      {/* Range — other numeric fields (number/currency/percentage/slider): no
          gateway involved, so these stay genuinely optional/unbounded. */}
      {isNumeric && field.type !== 'custom_amount' && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Range (Min / Max)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={localField.min_value ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('min_value', v === '' ? null : parseFloat(v));
              }}
              placeholder="Minimum"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
            <Input
              type="number"
              value={localField.max_value ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('max_value', v === '' ? null : parseFloat(v));
              }}
              placeholder="Maximum"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Leave blank for no limit.</p>
        </div>
      )}

      {/* Max Rating — rating only */}
      {field.type === 'rating' && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Maximum Rating
          </Label>
          <Input
            type="number"
            min="3"
            max="10"
            value={localField.max_rating ?? 5}
            onChange={(e) => {
              const v = e.target.value;
              handleChange('max_rating', v === '' ? 5 : Math.max(3, Math.min(10, parseInt(v, 10) || 5)));
            }}
            data-testid="field-max-rating-input"
            className="h-11 rounded-lg border-border focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Number of stars shown (3–10). Default is 5.</p>
        </div>
      )}

      {/* Slider — step size (the Min / Max range comes from the numeric Range editor above) */}
      {field.type === 'slider' && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Step
          </Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={localField.step ?? 1}
            onChange={(e) => {
              const v = e.target.value;
              handleChange('step', v === '' ? 1 : Math.max(0, parseFloat(v) || 1));
            }}
            data-testid="field-slider-step-input"
            className="h-11 rounded-lg border-border focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Increment between values (e.g. 1, 5, or 0.5). Set the range in Min / Max above.
          </p>
        </div>
      )}

      {/* Yes / No — custom button labels */}
      {field.type === 'yes_no' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">"Yes" label</Label>
            <Input
              value={localField.yes_label ?? 'Yes'}
              onChange={(e) => handleChange('yes_label', e.target.value)}
              placeholder="Yes"
              data-testid="field-yes-label-input"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
          </div>
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">"No" label</Label>
            <Input
              value={localField.no_label ?? 'No'}
              onChange={(e) => handleChange('no_label', e.target.value)}
              placeholder="No"
              data-testid="field-no-label-input"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
          </div>
        </div>
      )}

      {/* Divider — line style */}
      {isDivider && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Style
          </Label>
          <select
            value={localField.divider_style || 'line'}
            onChange={(e) => handleChange('divider_style', e.target.value)}
            data-testid="field-divider-style-select"
            className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="line">Solid line</option>
            <option value="dashed">Dashed line</option>
            <option value="space">Blank space (no line)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Add an optional Label above to show a caption centered on the line.
          </p>
        </div>
      )}

      {/* Address — toggle the optional sub-fields (Street / City / State / Postal
          are always shown). */}
      {field.type === 'address' && (() => {
        const ac = localField.address_config || {};
        const setAc = (k, v) => handleChange('address_config', { ...ac, [k]: v });
        return (
          <div className="ke-card p-5 space-y-4">
            <div>
              <h4 className="ke-section-title text-[15px]">Address Fields</h4>
              <div className="ke-rule-gold mt-2 mb-2" />
            </div>
            <p className="text-xs text-muted-foreground font-jakarta">
              Street, City, State and Postal Code are always shown. Toggle the optional parts below.
            </p>
            <div className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg">
              <Label className="text-foreground font-jakarta font-medium">Address Line 2</Label>
              <Switch
                checked={ac.show_line2 !== false}
                onCheckedChange={(c) => setAc('show_line2', c)}
                data-testid="address-line2-toggle"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg">
              <Label className="text-foreground font-jakarta font-medium">Country</Label>
              <Switch
                checked={ac.show_country !== false}
                onCheckedChange={(c) => setAc('show_country', c)}
                data-testid="address-country-toggle"
              />
            </div>
          </div>
        );
      })()}

      {/* Image Choices — options with a label + image URL each (single-select,
          non-pricing). Uses the shared option handlers but shows no price field. */}
      {field.type === 'image_choice' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-foreground font-jakarta font-medium block">
              Image Options <span className="text-accent">*</span>
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={addOption}
              data-testid="add-image-option"
              className="h-8 px-2 hover:bg-muted"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {(localField.options || []).length === 0 && (
            <p className="text-xs text-amber-600 font-jakarta mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              ⚠️ Add at least one image option.
            </p>
          )}
          <div className="space-y-3">
            {(localField.options || []).map((option, index) => (
              <div key={index} className="p-3 border border-border rounded-lg bg-muted space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={option.label || ''}
                    onChange={(e) => handleOptionChange(index, 'label', e.target.value)}
                    placeholder="Option label"
                    data-testid={`image-option-label-${index}`}
                    className="h-9 rounded-lg border-border flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    className="h-9 px-2 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <Input
                  value={option.image_url || ''}
                  onChange={(e) => handleOptionChange(index, 'image_url', e.target.value)}
                  placeholder="Image URL (https://…)"
                  data-testid={`image-option-url-${index}`}
                  className="h-9 rounded-lg border-border"
                />
                {option.image_url && (
                  <img
                    src={option.image_url}
                    alt=""
                    className="h-16 rounded border border-border object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Paste an image URL for each option. Registrants pick exactly one.
          </p>
        </div>
      )}

      {/* File Upload settings — size cap + accepted file kinds. The size cap
          mirrors client + server enforcement: images_docs are hard-capped at
          5 MB, audio/video at 25 MB. */}
      {field.type === 'file_upload' && (() => {
        const isAudioVideo = ['audio', 'video', 'audio_video'].includes(localField.accept_types);
        const sizeCap = isAudioVideo ? 25 : 5;
        return (
        <div className="space-y-4">
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Max file size (MB)
            </Label>
            <Input
              type="number"
              min="1"
              max={sizeCap}
              value={localField.max_file_size_mb ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('max_file_size_mb', v === '' ? null : Math.max(1, Math.min(sizeCap, parseInt(v, 10) || 1)));
              }}
              placeholder="5"
              data-testid="field-max-file-size-input"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isAudioVideo ? 'Up to 25 MB for audio/video.' : 'Up to 5 MB for images & documents.'}
            </p>
          </div>
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Accepted files
            </Label>
            <select
              value={localField.accept_types || 'images_docs'}
              onChange={(e) => handleChange('accept_types', e.target.value)}
              data-testid="field-accept-types-select"
              className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="images_docs">Images &amp; documents</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
              <option value="audio_video">Audio &amp; Video</option>
            </select>
          </div>
        </div>
        );
      })()}

      {/* Phone Country Config — phone only */}
      {isPhone && (() => {
        const mode    = localField.phone_country_mode || 'all';
        const allowed = Array.isArray(localField.phone_allowed_countries)
          ? localField.phone_allowed_countries
          : [];

        const toggleCountry = (code) => {
          const next = allowed.includes(code)
            ? allowed.filter(c => c !== code)
            : [...allowed, code];
          handleChange('phone_allowed_countries', next);
          // If default country is no longer allowed, clear it
          if (localField.phone_default_country && !next.includes(localField.phone_default_country)) {
            handleChange('phone_default_country', next[0] || '');
          }
        };

        return (
          <div className="space-y-3">
            <div>
              <Label className="text-foreground font-jakarta font-medium mb-2 block">
                Country Code
              </Label>
              <select
                value={mode}
                onChange={(e) => handleChange('phone_country_mode', e.target.value)}
                className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="all">Accept all countries</option>
                <option value="allowed">Restrict to specific countries</option>
              </select>
            </div>

            {mode === 'allowed' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-muted-foreground font-jakarta text-xs block">
                      Allowed Countries <span className="text-muted-foreground">({allowed.length} selected)</span>
                    </Label>
                    {allowed.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleChange('phone_allowed_countries', [])}
                        className="text-xs text-muted-foreground hover:text-red-500"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-border rounded-lg p-2 bg-muted space-y-1">
                    {COUNTRIES.map(c => (
                      <label
                        key={c.code}
                        className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-card"
                      >
                        <input
                          type="checkbox"
                          checked={allowed.includes(c.code)}
                          onChange={() => toggleCountry(c.code)}
                          style={{ accentColor: 'hsl(var(--primary))', width: 16, height: 16, appearance: 'auto' }}
                        />
                        <span className="text-sm text-foreground flex-1">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.dial}</span>
                      </label>
                    ))}
                  </div>
                  {allowed.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ Pick at least one country, or switch back to "Accept all countries".
                    </p>
                  )}
                </div>

                {allowed.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground font-jakarta text-xs mb-1 block">Default Country</Label>
                    <select
                      value={localField.phone_default_country || allowed[0]}
                      onChange={(e) => handleChange('phone_default_country', e.target.value)}
                      className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      {allowed.map(code => {
                        const c = COUNTRIES.find(x => x.code === code);
                        return c ? (
                          <option key={code} value={code}>
                            {c.name} ({c.dial})
                          </option>
                        ) : null;
                      })}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Column Layout — radio + checkbox only (dropdown is always 1 column).
          Matches Zoho's "Display layout" picker (1 / 2 / 3 columns / inline). */}
      {(field.type === 'radio' || field.type === 'checkbox') && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Display Layout
          </Label>
          <select
            value={localField.column_layout || '1'}
            onChange={(e) => handleChange('column_layout', e.target.value)}
            className="w-full h-11 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="1">1 Column (stacked, default)</option>
            <option value="2">2 Columns</option>
            <option value="3">3 Columns</option>
            <option value="inline">Inline (side-by-side, wraps)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            How the options are arranged on the form. Stacked is easiest to read; multi-column saves space.
          </p>
        </div>
      )}

      {/* Selection Limit — checkbox only (Min / Max). Max disables further ticks once
          reached; min is checked on submit, same as Character Limit's min/max split. */}
      {field.type === 'checkbox' && (
        <div>
          <Label className="text-foreground font-jakarta font-medium mb-2 block">
            Selections (Min / Max)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min="1"
              value={localField.min_selections ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('min_selections', v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
              }}
              placeholder="No minimum"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
            <Input
              type="number"
              min="1"
              value={localField.max_selections ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange('max_selections', v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
              }}
              placeholder="No limit"
              className="h-11 rounded-lg border-border focus-visible:ring-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            The maximum stops ticking further boxes; the minimum is checked on submit. Leave either blank for no limit.
          </p>
        </div>
      )}

      {/* Options - For dropdown, radio, checkbox */}
      {hasOptions && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-foreground font-jakarta font-medium block">
              Options <span className="text-accent">*</span>
            </Label>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sortOptions('asc')}
                title="Sort options A → Z"
                className="h-8 px-2 hover:bg-muted"
              >
                <ArrowDownAZ className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sortOptions('desc')}
                title="Sort options Z → A"
                className="h-8 px-2 hover:bg-muted"
              >
                <ArrowUpAZ className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowImport(true)}
                title="Import choices from a list"
                className="h-8 px-2 hover:bg-muted"
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {(localField.options || []).length === 0 && (
            <p className="text-xs text-amber-600 font-jakarta mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              ⚠️ At least one option is required for this field type.
            </p>
          )}
          <div className="space-y-2">
            {(localField.options || []).map((option, index) => (
              <div key={index} className="p-2 border border-border rounded-lg bg-muted space-y-2">
                {/* Row 1: Label + delete button */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      value={option.label || ''}
                      onChange={(e) => handleOptionChange(index, 'label', e.target.value)}
                      placeholder="Option label"
                      data-testid={`option-label-${index}`}
                      className="h-9 rounded-lg border-border"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addOptionAt(index)}
                    title="Add an option below this one"
                    data-testid={`add-option-after-${index}`}
                    className="text-green-600 hover:bg-green-50 hover:text-green-700 h-9 w-9 p-0 flex-shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    title="Remove this option"
                    data-testid={`remove-option-${index}`}
                    className="hover:bg-red-50 hover:text-red-500 h-9 w-9 p-0 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {/* Row 2: Assigned Value + Price modifier */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      value={option.value ?? ''}
                      onChange={(e) => handleOptionChange(index, 'value', e.target.value)}
                      placeholder="Assigned value (optional — defaults to label)"
                      data-testid={`option-value-${index}`}
                      className="h-9 rounded-lg border-border text-xs"
                    />
                  </div>
                  <div className="w-28 flex items-center" title="Price modifier — adds to total when this option is selected">
                    <span className="text-muted-foreground text-sm mr-1">₹</span>
                    <Input
                      type="number"
                      value={option.price_modifier !== undefined && option.price_modifier !== null ? option.price_modifier : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleOptionChange(index, 'price_modifier', val === '' ? 0 : parseFloat(val) || 0);
                      }}
                      placeholder="0"
                      data-testid={`option-price-${index}`}
                      className="h-9 rounded-lg border-border text-right w-full"
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={addOption}
              data-testid="add-option-button"
              className="w-full border-border hover:bg-muted rounded-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Option
            </Button>
          </div>
        </div>
      )}

      {/* Import Choices Modal */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowImport(false)}
        >
          <div
            className="ke-card shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="ke-section-title text-lg">Import Choices</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowImport(false)} className="h-8 w-8 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Paste one choice per line. To set a price, add the amount after a
              comma, <span className="font-mono">|</span>, <span className="font-mono">=</span> or <span className="font-mono">:</span>
              &nbsp;(e.g. <span className="font-mono">VIP Pass, 500</span>). Choices without an amount default to 0.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              placeholder={`e.g.\nEarly Bird, 300\nStandard, 500\nVIP Pass = 1000\n\n— or, without prices —\n\nSmall, Medium, Large`}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={importReplace}
                onChange={(e) => setImportReplace(e.target.checked)}
                style={{ accentColor: 'hsl(var(--primary))', width: 16, height: 16, appearance: 'auto' }}
              />
              <span className="text-sm text-foreground">Replace all existing options (otherwise append)</span>
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
              <Button
                onClick={handleImportChoices}
                disabled={!importText.trim()}
                className="bg-primary hover:bg-primary-hover"
              >
                Import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Messages — one row per rule that can actually fire on this field.
          Only rules the admin has configured show up (e.g. "Above character limit"
          appears once a Character Limit is set), so the list never offers a message
          for something that will never happen. Blank = use the wording shown as the
          placeholder. */}
      {messageKeys.length > 0 && (
        <div className="ke-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMessages((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span>
              <span className="text-foreground font-jakarta font-medium block">Validation Messages</span>
              <span className="text-xs text-muted-foreground">
                {customMessageCount > 0
                  ? `${customMessageCount} custom message${customMessageCount === 1 ? '' : 's'}`
                  : 'Using default wording'}
              </span>
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showMessages ? 'rotate-180' : ''}`} />
          </button>

          {showMessages && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Write the sentence the registrant should see, exactly as you want it read —
                for example <span className="italic">“Aadhaar number must be 12 digits.”</span>{' '}
                Leave a box empty to use the grey wording already shown in it.
              </p>
              {messageKeys.map((key) => (
                <div key={key}>
                  <Label className="text-xs text-muted-foreground font-jakarta mb-1 block">
                    {MESSAGE_LABELS[key] || key}
                  </Label>
                  <Input
                    value={localField.validation_messages?.[key] ?? ''}
                    onChange={(e) => handleMessageChange(key, e.target.value)}
                    /* A finished sentence with this field's real name and limits already
                       filled in — not a template — so the admin has something to copy or
                       overwrite rather than a format to learn. */
                    placeholder={defaultMessageFor(localField, key)}
                    className="h-10 rounded-lg border-border focus-visible:ring-primary text-sm"
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                More messages appear here as you add rules to this field — set a Character
                Limit or a Range above and you can word those warnings too.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Save Button — also pinned as a sticky action bar so it stays reachable
          at the bottom of a long scrolling editor without changing its behavior. */}
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 px-6 pt-4 pb-6 border-t border-border ke-glass">
        {(() => {
          const choiceFieldTypes = ['dropdown', 'radio', 'checkbox', 'image_choice'];
          const isChoiceField = choiceFieldTypes.includes(field.type);
          const hasNoOptions = isChoiceField && (!localField.options || localField.options.length === 0);
          const canSave = hasChanges && !hasNoOptions;
          
          return (
            <Button
              onClick={handleSave}
              disabled={!canSave}
              data-testid="save-field-button"
              className={`w-full ${canSave ? 'bg-primary hover:bg-primary-hover' : 'bg-muted'}`}
            >
              <Save className="w-4 h-4 mr-2" />
              {hasNoOptions ? 'Add options to save' : (hasChanges ? 'Save Field Changes' : 'No Changes')}
            </Button>
          );
        })()}
      </div>
    </div>
  );
};

export default FieldEditor;
