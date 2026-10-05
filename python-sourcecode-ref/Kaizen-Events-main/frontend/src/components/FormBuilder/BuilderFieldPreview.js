import React from 'react';
import { Label } from '../ui/label';
import { ChevronDown, Upload, Star, Calendar, Clock } from 'lucide-react';
import { FIELD_TYPES } from '../../utils/formFieldTypes';

/**
 * BuilderFieldPreview — a stateless, non-interactive WYSIWYG approximation of a
 * form field, used on the form-builder canvas so a field looks like it will on
 * the real form (Canva / Zoho style). This is deliberately NOT FormPreview's
 * stateful renderer (that one needs formData / handleChange / validation). Every
 * mock control is inert; the canvas card wraps this in `pointer-events-none`.
 *
 * Theme-safe: uses semantic tokens (never hardcoded slate / white) so it reads
 * correctly in both light and dark admin themes.
 */

const labelText = (field) =>
  field.label || FIELD_TYPES.find((t) => t.type === field.type)?.label || 'Field';

const Head = ({ field }) => (
  <Label className="text-sm font-jakarta font-medium text-foreground mb-2 block">
    {labelText(field)} {field.required && <span className="text-accent">*</span>}
  </Label>
);

const Help = ({ field }) =>
  field.help_text ? (
    <p className="text-xs text-muted-foreground font-jakarta mt-1.5">{field.help_text}</p>
  ) : null;

// Shared mock-control styles (inert, muted — reads as a disabled form control)
const BOX = 'w-full rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground';
const INPUT = `h-11 px-3 flex items-center ${BOX}`;

export default function BuilderFieldPreview({ field }) {
  const options = Array.isArray(field.options) ? field.options : [];

  switch (field.type) {
    case 'name': {
      const c = field.name_config || {};
      const parts = [
        { key: 'first', label: c.first_name_label || 'First Name', show: c.show_first_name !== false },
        { key: 'middle', label: c.middle_name_label || 'Middle Name', show: !!c.show_middle_name },
        { key: 'last', label: c.last_name_label || 'Last Name', show: c.show_last_name !== false },
      ].filter((p) => p.show);
      return (
        <div>
          <Head field={field} />
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${parts.length || 1}, 1fr)` }}>
            {parts.map((p) => (
              <div key={p.key}>
                <span className="block text-[11px] text-muted-foreground font-jakarta mb-1">{p.label}</span>
                <div className={INPUT}>&nbsp;</div>
              </div>
            ))}
          </div>
          <Help field={field} />
        </div>
      );
    }

    case 'textarea':
      return (
        <div>
          <Head field={field} />
          <div className={`h-20 px-3 py-2 ${BOX}`}>{field.placeholder || ''}</div>
          <Help field={field} />
        </div>
      );

    case 'rich_text':
      return (
        <div>
          {field.label ? <Head field={field} /> : null}
          <div className={`h-20 px-3 py-2 ${BOX} flex items-start italic`}>Formatted text block</div>
          <Help field={field} />
        </div>
      );

    case 'dropdown':
      return (
        <div>
          <Head field={field} />
          <div className={`${INPUT} justify-between`}>
            <span>{options[0]?.label || field.placeholder || 'Select an option'}</span>
            <ChevronDown className="w-4 h-4 opacity-60" />
          </div>
          <Help field={field} />
        </div>
      );

    case 'radio':
      return (
        <div>
          <Head field={field} />
          <div className="space-y-2">
            {(options.length ? options : [{ label: 'Option 1' }]).map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                <span className="w-4 h-4 rounded-full border border-muted-foreground/50 inline-block" />
                {o.label}
              </div>
            ))}
          </div>
          <Help field={field} />
        </div>
      );

    case 'checkbox':
      return (
        <div>
          <Head field={field} />
          <div className="space-y-2">
            {(options.length ? options : [{ label: 'Option 1' }]).map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                <span className="w-4 h-4 rounded border border-muted-foreground/50 inline-block" />
                {o.label}
              </div>
            ))}
          </div>
          <Help field={field} />
        </div>
      );

    case 'file_upload':
      return (
        <div>
          <Head field={field} />
          <div className="rounded-lg border border-dashed border-border bg-muted/30 py-6 flex flex-col items-center justify-center text-muted-foreground">
            <Upload className="w-5 h-5 mb-1.5 opacity-70" />
            <span className="text-xs font-jakarta">Click to upload or drag &amp; drop</span>
          </div>
          <Help field={field} />
        </div>
      );

    case 'section_header':
      return (
        <div className="border-b border-border pb-2">
          <h3 className="text-lg font-outfit font-semibold text-foreground">{labelText(field)}</h3>
          {field.help_text && (
            <p className="text-sm text-muted-foreground font-jakarta mt-1">{field.help_text}</p>
          )}
        </div>
      );

    case 'terms_checkbox':
      return (
        <div>
          <div className="flex items-start gap-2 text-sm text-foreground">
            <span className="w-4 h-4 mt-0.5 rounded border border-muted-foreground/50 inline-block shrink-0" />
            <span>
              {labelText(field)} {field.required && <span className="text-accent">*</span>}
            </span>
          </div>
          <Help field={field} />
        </div>
      );

    case 'price':
      return (
        <div className="rounded-lg border border-border bg-primary-subtle px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-jakarta font-medium text-foreground">{labelText(field)}</span>
          <span className="text-base font-outfit font-bold text-primary">₹0.00</span>
        </div>
      );

    case 'rating': {
      const n = Math.max(3, Math.min(10, parseInt(field.max_rating, 10) || 5));
      return (
        <div>
          <Head field={field} />
          <div className="flex items-center gap-1">
            {Array.from({ length: n }).map((_, i) => (
              <Star key={i} className="w-6 h-6 text-muted-foreground/40" />
            ))}
          </div>
          <Help field={field} />
        </div>
      );
    }

    case 'date':
    case 'time':
      return (
        <div>
          <Head field={field} />
          <div className={`${INPUT} justify-between`}>
            <span>{field.placeholder || (field.type === 'date' ? 'dd / mm / yyyy' : '--:--')}</span>
            {field.type === 'date' ? <Calendar className="w-4 h-4 opacity-60" /> : <Clock className="w-4 h-4 opacity-60" />}
          </div>
          <Help field={field} />
        </div>
      );

    case 'currency':
    case 'custom_amount':
      return (
        <div>
          <Head field={field} />
          <div className={INPUT}>
            <span className="mr-1.5 text-muted-foreground">₹</span>
            <span>{field.placeholder || '0'}</span>
          </div>
          <Help field={field} />
        </div>
      );

    case 'text':
    case 'email':
    case 'phone':
    case 'number':
      return (
        <div>
          <Head field={field} />
          <div className={INPUT}>{field.placeholder || ''}&nbsp;</div>
          <Help field={field} />
        </div>
      );

    case 'divider': {
      const dStyle = field.divider_style || 'line';
      if (dStyle === 'space') return <div className="py-5" aria-hidden="true" />;
      const bs = dStyle === 'dashed' ? 'border-dashed' : 'border-solid';
      return field.label ? (
        <div className="flex items-center gap-3 py-1">
          <span className={`flex-1 border-t ${bs} border-border`} />
          <span className="text-xs font-jakarta font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
            {field.label}
          </span>
          <span className={`flex-1 border-t ${bs} border-border`} />
        </div>
      ) : (
        <hr className={`border-t ${bs} border-border`} />
      );
    }

    case 'slider': {
      const minV = Number.isFinite(parseFloat(field.min_value)) ? parseFloat(field.min_value) : 0;
      const maxV = Number.isFinite(parseFloat(field.max_value)) ? parseFloat(field.max_value) : 100;
      return (
        <div>
          <Head field={field} />
          <div className="flex items-center gap-3">
            <span className="flex-1 h-2 rounded-full bg-muted relative">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted-foreground/50 border border-border" />
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{minV}–{maxV}</span>
          </div>
          <Help field={field} />
        </div>
      );
    }

    case 'yes_no':
      return (
        <div>
          <Head field={field} />
          <div className="inline-flex rounded-xl border border-border p-1 gap-1">
            <span className="px-5 py-1.5 rounded-lg text-sm bg-primary/10 text-foreground">{field.yes_label || 'Yes'}</span>
            <span className="px-5 py-1.5 rounded-lg text-sm text-muted-foreground">{field.no_label || 'No'}</span>
          </div>
          <Help field={field} />
        </div>
      );

    case 'address': {
      const ac = field.address_config || {};
      const rows = [
        { label: ac.line1_label || 'Street Address', full: true },
        ...(ac.show_line2 !== false ? [{ label: ac.line2_label || 'Apartment, suite, etc.', full: true }] : []),
        { label: ac.city_label || 'City' },
        { label: ac.state_label || 'State / Province' },
        { label: ac.postal_label || 'Postal / ZIP Code' },
        ...(ac.show_country !== false ? [{ label: ac.country_label || 'Country' }] : []),
      ];
      return (
        <div>
          <Head field={field} />
          <div className="grid grid-cols-2 gap-2">
            {rows.map((r, i) => (
              <div key={i} className={r.full ? 'col-span-2' : ''}>
                <span className="block text-[11px] text-muted-foreground font-jakarta mb-1">{r.label}</span>
                <div className={INPUT}>&nbsp;</div>
              </div>
            ))}
          </div>
          <Help field={field} />
        </div>
      );
    }

    case 'signature':
      return (
        <div>
          <Head field={field} />
          <div className="h-24 rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center text-muted-foreground text-xs font-jakarta italic">
            Signature area
          </div>
          <Help field={field} />
        </div>
      );

    case 'image_choice':
      return (
        <div>
          <Head field={field} />
          <div className="grid grid-cols-3 gap-2">
            {(options.length ? options : [{ label: 'Option 1' }, { label: 'Option 2' }, { label: 'Option 3' }]).slice(0, 6).map((o, i) => (
              <div key={i} className="rounded-lg border border-border overflow-hidden">
                <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
                  {o.image_url ? (
                    <img src={o.image_url} alt={o.label} className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  )}
                </div>
                <div className="px-2 py-1 text-[11px] text-muted-foreground font-jakarta truncate">{o.label}</div>
              </div>
            ))}
          </div>
          <Help field={field} />
        </div>
      );

    default:
      // Unknown / future field type — still render something sensible.
      return (
        <div>
          <Head field={field} />
          <div className={`${INPUT} justify-between`}>
            <span>&nbsp;</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{field.type}</span>
          </div>
          <Help field={field} />
        </div>
      );
  }
}
