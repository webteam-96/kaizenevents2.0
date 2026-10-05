import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../services/api';
import { Button } from '../components/ui/button';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
// Server returns relative URLs like /api/uploads/images/... — make them absolute for <img>
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${API_BASE_URL}${url}` : (url || '');
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ArrowLeft, Plus, Save, Eye, GripVertical, Trash2, Copy, Palette, Image, Upload, X, Check, Search, Undo2, Redo2, LayoutGrid, Clock, Sparkles, Asterisk } from 'lucide-react';
import { toast } from 'sonner';
import { FIELD_TYPES, FIELD_CATEGORIES, createDefaultField } from '../utils/formFieldTypes';
import FieldEditor from '../components/FormBuilder/FieldEditor';
import BuilderFieldPreview from '../components/FormBuilder/BuilderFieldPreview';
import FormPreview from '../components/FormBuilder/FormPreview';
import FormulaBuilder from '../components/FormBuilder/FormulaBuilder';
import FieldRules from '../components/FormBuilder/FieldRules';
import PageRules from '../components/FormBuilder/PageRules';
import { FORM_TEMPLATES, applyTemplate } from '../data/formTemplates';
import ImageUploader from '../components/ui/ImageUploader';
import { hexToRgba } from '../utils/colorUtils';

// Field width → 12-col span. Mirrors FormPreview's map (kept LOCAL so the public
// form renderer is never touched). Accepts both new (small/medium/large) and
// legacy (full/half/third) width vocabularies.
const WIDTH_COL = {
  small: 'col-span-6', medium: 'col-span-8', large: 'col-span-12',
  full: 'col-span-12', half: 'col-span-6', third: 'col-span-4',
};
const widthCol = (w) => WIDTH_COL[w] || 'col-span-12';

// Each field category gets its own brand colour, so the palette reads as a
// playful, colour-coded toolbox rather than a flat list. Values are token names
// resolved to `hsl(var(--token))` at use, so light + dark both adapt.
const CATEGORY_HUE = {
  basic:    'var(--cat-basic)',
  choice:   'var(--accent)',
  advanced: 'var(--destructive)',
  layout:   'var(--muted-foreground)',
};
const hueFor = (category) => `hsl(${CATEGORY_HUE[category] || 'var(--primary)'})`;
// Field type → its category colour, for the canvas card spine + type chip.
const hueForType = (type) => hueFor(FIELD_TYPES.find((f) => f.type === type)?.category);
const iconForType = (type) => FIELD_TYPES.find((f) => f.type === type)?.icon || LayoutGrid;

// A palette item you can either CLICK (adds to the end) or DRAG onto the canvas.
const PaletteFieldButton = ({ fieldType, onAdd }) => {
  const Icon = fieldType.icon;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${fieldType.type}`,
    data: { source: 'palette', fieldType },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onAdd(fieldType.type)}
      data-testid={`add-field-${fieldType.type}`}
      title={fieldType.description || fieldType.label}
      style={{ opacity: isDragging ? 0.4 : 1, '--chip': hueFor(fieldType.category) }}
      className="ke-palette-item group w-full flex items-center gap-2.5 p-2 text-left cursor-grab active:cursor-grabbing"
    >
      <span className="ke-palette-chip">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="text-sm font-jakarta font-medium text-foreground flex-1 truncate">{fieldType.label}</span>
      <Plus className="w-4 h-4 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" style={{ color: 'var(--chip)' }} />
    </button>
  );
};

// A WYSIWYG field card on the canvas: shows the real-looking control, selects on
// click, reorders by dragging its grip, exposes duplicate/delete on hover.
const CanvasFieldCard = ({ field, isSelected, onSelect, onDelete, onDuplicate }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id, data: { source: 'canvas' } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, '--chip': hueForType(field.type) }}
      onClick={onSelect}
      data-testid={`canvas-field-${field.id}`}
      className={`ke-fieldcard ${widthCol(field.width)} group relative rounded-xl border bg-card p-4 pl-5 cursor-pointer transition-all ${
        isSelected ? 'is-selected ring-2 ring-accent border-accent shadow-md' : 'border-border hover:border-accent/50 hover:shadow-md'
      }`}
    >
      {field.required && (
        <span className="absolute -top-2 left-3 text-[10px] uppercase tracking-wide bg-accent/10 text-accent px-1.5 py-0.5 rounded">
          Required
        </span>
      )}
      {/* floating toolbar — visible on hover or when selected */}
      <div className={`absolute -top-3 right-3 items-center gap-0.5 rounded-lg border border-border bg-card shadow px-1 py-0.5 z-10 ${isSelected ? 'flex' : 'hidden group-hover:flex'}`}>
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          data-testid={`duplicate-field-${field.id}`}
          title="Duplicate"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          data-testid={`delete-field-${field.id}`}
          title="Delete"
          className="p-1 text-muted-foreground hover:text-accent"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="pointer-events-none">
        <BuilderFieldPreview field={field} />
      </div>
    </div>
  );
};

// Dashed "drop here" slot shown at the insertion point while dragging from the palette.
const InsertGhost = ({ fieldType }) => (
  <div className="col-span-12 rounded-xl border-2 border-dashed border-accent bg-accent/5 py-6 flex items-center justify-center text-accent text-sm font-jakarta font-medium">
    Drop {fieldType?.label || 'field'} here
  </div>
);

// Empty-canvas drop zone (doubles as a click hint).
const CanvasEmptyDropZone = () => {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-dropzone' });
  return (
    <div
      ref={setNodeRef}
      data-testid="canvas-empty-dropzone"
      className={`ke-canvas-dots col-span-12 rounded-2xl border-2 border-dashed py-16 flex flex-col items-center justify-center text-center transition-colors ${
        isOver ? 'border-accent bg-accent/5' : 'border-border'
      }`}
    >
      <span className="ke-medallion animate-float mb-4" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.22), hsl(var(--primary) / 0.10) 85%)' }}>
        <Sparkles className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />
      </span>
      <p className="text-foreground font-outfit font-semibold text-lg mb-1">Let&apos;s build something great</p>
      <p className="text-sm text-muted-foreground font-jakarta">Drag a field here, or tap one from the toolbox on the left ✨</p>
    </div>
  );
};

// A short catch-area below the last card so drops in the empty space append.
const CanvasTailDropZone = () => {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-dropzone' });
  return (
    <div
      ref={setNodeRef}
      className={`col-span-12 h-12 rounded-lg border border-dashed transition-colors ${
        isOver ? 'border-accent bg-accent/5' : 'border-transparent'
      }`}
    />
  );
};

const FormBuilder = ({ view = 'builder' }) => {
  // Two views share this component (same load/save so nothing can drift):
  //   • 'builder' → form structure only (Fields / Formulas / Field Rules / Pages)
  //   • 'themes'  → the Design surface only (templates, colours, header/banner/logo)
  // Themes is reached from the event page; the two are deliberately separate.
  const isThemes = view === 'themes';
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [basePrice, setBasePrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(isThemes ? 'design' : 'fields');
  const [fieldSearch, setFieldSearch] = useState('');

  // Advanced features state
  const [pricingRules, setPricingRules] = useState([]);
  const [pricingFormula, setPricingFormula] = useState('');
  const [fieldRules, setFieldRules] = useState([]);
  const [pageBreaks, setPageBreaks] = useState([]);
  const [pageRules, setPageRules] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  
  // Form design state
  const [headerImage, setHeaderImage] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [submitButtonText, setSubmitButtonText] = useState('');
  // Editable "Registration Details" heading shown above the form fields on the
  // public page. Empty text falls back to the default; the toggle hides it entirely.
  const [sectionTitle, setSectionTitle] = useState('');
  const [showSectionTitle, setShowSectionTitle] = useState(true);
  // Page layout mode: 'standard' (all fields on the page, honouring manual page
  // breaks — today's behaviour), 'card' (one question per screen), or 'spotlight'
  // (one question per screen, enlarged/focused). Opt-in; default 'standard'.
  const [layoutMode, setLayoutMode] = useState('standard');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formTheme, setFormTheme] = useState(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [showEventLogo, setShowEventLogo] = useState(true);
  const [logoSize, setLogoSize] = useState(56);

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  const fetchData = async () => {
    try {
      const [campaignRes, formRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/form`)
      ]);

      setCampaign(campaignRes.data);
      setLogoUrl(campaignRes.data.logo_url || '');
      setShowEventLogo(campaignRes.data.show_event_logo ?? true);
      
      if (formRes.data) {
        setFields(formRes.data.fields || []);
        setBasePrice(formRes.data.base_price || 0);
        setPricingRules(formRes.data.pricing_rules || []);
        setPricingFormula(formRes.data.pricing_formula || '');
        setFieldRules(formRes.data.field_rules || []);
        setPageBreaks(formRes.data.page_breaks || []);
        setPageRules(formRes.data.page_rules || []);
        setIntegrations(formRes.data.integrations || []);
        setHeaderImage(formRes.data.header_image || '');
        setBannerImage(formRes.data.banner_image || '');
        setSubmitButtonText(formRes.data.submit_button_text || '');
        setSectionTitle(formRes.data.section_title || '');
        setShowSectionTitle(formRes.data.show_section_title ?? true);
        setLayoutMode(formRes.data.layout_mode || 'standard');
        setFormTemplateId(formRes.data.form_template_id || '');
        setFormTheme(formRes.data.theme || null);
        setLogoSize(formRes.data.logo_size || 56);
      }
    } catch (error) {
      toast.error('Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  // ── Drag & drop: palette → canvas (add) and canvas → canvas (reorder) ──────
  const [activeDrag, setActiveDrag] = useState(null);   // {source:'palette',fieldType} | {source:'canvas',field}
  const [insertIndex, setInsertIndex] = useState(null); // ghost-slot position during a palette drag

  // Pure: where a drop lands, derived only from the `over` target (reads no React
  // state that onDragOver set, so onDragEnd and the ghost always agree).
  // 'canvas-dropzone' or no target → append.
  const computeDropIndex = (over, active) => {
    if (!over || over.id === 'canvas-dropzone') return fields.length;
    const overIndex = fields.findIndex((f) => f.id === over.id);
    if (overIndex === -1) return fields.length;
    const aRect = active?.rect?.current?.translated;
    const oRect = over.rect;
    const after = aRect && oRect ? (aRect.top + aRect.height / 2) > (oRect.top + oRect.height / 2) : false;
    return after ? overIndex + 1 : overIndex;
  };

  const handleDragStart = ({ active }) => {
    const d = active.data.current;
    if (d?.source === 'palette') setActiveDrag({ source: 'palette', fieldType: d.fieldType });
    else setActiveDrag({ source: 'canvas', field: fields.find((f) => f.id === active.id) });
  };

  const handleDragOver = ({ active, over }) => {
    setInsertIndex(active.data.current?.source === 'palette' ? computeDropIndex(over, active) : null);
  };

  const handleDragCancel = () => { setActiveDrag(null); setInsertIndex(null); };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    const d = active.data.current;
    setActiveDrag(null);
    setInsertIndex(null);
    if (!over) return;

    // (a) palette → canvas: create a NEW field at the drop index
    if (d?.source === 'palette') {
      const idx = computeDropIndex(over, active);
      const newField = createDefaultField(d.fieldType.type, campaign?.payment_gateway);
      const next = [...fields.slice(0, idx), newField, ...fields.slice(idx)]
        .map((f, i) => ({ ...f, order: i }));
      setFields(next);
      setSelectedField(newField);
      toast.success('Field added');
      return;
    }

    // (b) canvas → canvas: reorder
    if (active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = over.id === 'canvas-dropzone'
      ? fields.length - 1
      : fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setFields(arrayMove(fields, oldIndex, newIndex).map((f, i) => ({ ...f, order: i })));
  };

  // Pointer-first collision with a rect fallback: cards win when hovered, the
  // drop zone wins in the gaps / empty space.
  const collisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : rectIntersection(args);
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addField = (type) => {
    const newField = createDefaultField(type, campaign?.payment_gateway);
    newField.order = fields.length;
    setFields([...fields, newField]);
    setSelectedField(newField);
    toast.success('Field added');
  };

  const updateField = (updatedField) => {
    const newFields = fields.map(f => f.id === updatedField.id ? updatedField : f);
    setFields(newFields);
    setSelectedField(updatedField);
    // Persist this field's data to the server right away (clicking "Save Field
    // Changes" saves the field), so its content survives a reload without the
    // user having to click the top "Save" button. Pass the freshly-computed
    // fields because setFields is async and `fields` state is still stale here.
    persistForm(newFields, 'Field saved successfully!');
  };

  const deleteField = (fieldId) => {
    setFields(fields.filter(f => f.id !== fieldId));
    if (selectedField?.id === fieldId) {
      setSelectedField(null);
    }
    toast.success('Field deleted');
  };

  const duplicateField = (fieldId) => {
    const index = fields.findIndex(f => f.id === fieldId);
    if (index === -1) return;

    // Deep copy so nested config (options, name_config, …) isn't shared.
    const copy = JSON.parse(JSON.stringify(fields[index]));
    copy.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (copy.label) {
      copy.label = `${copy.label} (Copy)`;
    }

    const updatedFields = [
      ...fields.slice(0, index + 1),
      copy,
      ...fields.slice(index + 1)
    ].map((field, idx) => ({
      ...field,
      order: idx
    }));

    setFields(updatedFields);
    setSelectedField(updatedFields[index + 1]);
    toast.success('Field duplicated');
  };

  // ── Undo / redo ────────────────────────────────────────────────────────────
  // Effect-based history: every setFields (add/delete/reorder/edit) is captured
  // without touching the mutation functions. Undo/redo update the baseline ref
  // BEFORE setFields so the tracking effect sees "no new change" and doesn't
  // re-record. Local-only (matches add/delete/reorder, which don't auto-persist).
  const histUndo = React.useRef([]);
  const histRedo = React.useRef([]);
  const histPrev = React.useRef(null);   // last committed fields snapshot
  const [, setHistTick] = useState(0);
  const bumpHist = () => setHistTick((t) => t + 1);

  useEffect(() => {
    // Establish the baseline once the form has loaded.
    if (!loading && histPrev.current === null) histPrev.current = fields;
  }, [loading, fields]);

  useEffect(() => {
    if (histPrev.current === null || fields === histPrev.current) return;
    histUndo.current.push(histPrev.current);
    if (histUndo.current.length > 80) histUndo.current.shift();
    histRedo.current = [];
    histPrev.current = fields;
    bumpHist();
  }, [fields]);

  const undoFields = () => {
    if (!histUndo.current.length) return;
    histRedo.current.push(fields);
    const prev = histUndo.current.pop();
    histPrev.current = prev;            // sync baseline so the effect skips
    setFields(prev);
    setSelectedField(null);
    bumpHist();
  };
  const redoFields = () => {
    if (!histRedo.current.length) return;
    histUndo.current.push(fields);
    const next = histRedo.current.pop();
    histPrev.current = next;
    setFields(next);
    setSelectedField(null);
    bumpHist();
  };

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo (builder only,
  // and never while typing in a field so native input undo still works).
  const undoRefLatest = React.useRef(undoFields); undoRefLatest.current = undoFields;
  const redoRefLatest = React.useRef(redoFields); redoRefLatest.current = redoFields;
  useEffect(() => {
    if (isThemes) return undefined;
    const onKey = (e) => {
      const el = e.target;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redoRefLatest.current(); else undoRefLatest.current(); }
      else if (k === 'y') { e.preventDefault(); redoRefLatest.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isThemes]);

  // Helper to generate value from label
  const generateValueFromLabel = (label) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '') || `option_${Date.now()}`;
  };

  // Sanitize fields to ensure all options have valid 'value' fields
  const sanitizeFields = (fieldsToSanitize) => {
    return fieldsToSanitize.map(field => {
      if (field.options && field.options.length > 0) {
        return {
          ...field,
          options: field.options.map((opt, idx) => ({
            ...opt,
            value: opt.value || generateValueFromLabel(opt.label || `option_${idx}`)
          }))
        };
      }
      return field;
    });
  };

  // Validate fields before saving. Accepts an explicit list so callers can
  // validate a freshly-computed fields array (state updates are async).
  const validateFields = (fieldsToValidate = fields) => {
    const choiceFieldTypes = ['dropdown', 'radio', 'checkbox'];
    const errors = [];

    fieldsToValidate.forEach((field, index) => {
      if (choiceFieldTypes.includes(field.type)) {
        if (!field.options || field.options.length === 0) {
          errors.push(`"${field.label || field.type}" field requires at least one option.`);
        }
      }
    });

    return errors;
  };

  // Core persistence — writes the whole form config (including the given fields)
  // to the server. Shared by the top "Save" button and per-field "Save Field
  // Changes". Returns true on success.
  const persistForm = async (fieldsToSave, successMsg = 'Form saved successfully!') => {
    // Validate fields first
    const validationErrors = validateFields(fieldsToSave);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return false;
    }

    setSaving(true);
    try {
      // Sanitize fields before saving
      const sanitizedFields = sanitizeFields(fieldsToSave);

      // Persist the logo on the campaign (single source of truth — same field Edit Campaign uses).
      // description/event_logo are re-sent because the backend assigns them unconditionally,
      // so omitting them would null them out.
      const campResp = await api.put(`/campaigns/${campaignId}`, {
        logo_url: logoUrl || null,
        show_event_logo: showEventLogo,
        description: campaign?.description ?? null,
        event_logo: campaign?.event_logo ?? null,
      });
      setCampaign(campResp.data);

      await api.put(`/campaigns/${campaignId}/form`, {
        fields: sanitizedFields,
        base_price: parseFloat(basePrice) || 0,
        pricing_rules: pricingRules,
        pricing_formula: pricingFormula,
        field_rules: fieldRules,
        page_breaks: pageBreaks,
        page_rules: pageRules,
        integrations: integrations,
        header_image: headerImage || null,
        banner_image: bannerImage || null,
        submit_button_text: submitButtonText.trim() || null,
        section_title: sectionTitle.trim() || null,
        show_section_title: showSectionTitle,
        layout_mode: layoutMode,
        form_template_id: formTemplateId || null,
        theme: formTheme,
        logo_size: logoSize
      });
      toast.success(successMsg);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save form');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveForm = () => persistForm(fields, 'Form saved successfully!');

  // Apply a form template
  const handleApplyTemplate = (templateId) => {
    const template = FORM_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const appliedTemplate = applyTemplate(template);
    
    // Apply theme
    setFormTheme(appliedTemplate.theme);
    setFormTemplateId(templateId);
    
    // Apply sample header image if available
    if (appliedTemplate.sample_header_image) {
      setHeaderImage(appliedTemplate.sample_header_image);
    }
    
    // If no fields exist, apply sample fields
    if (fields.length === 0) {
      setFields(appliedTemplate.sample_fields);
      toast.success(`Template "${template.name}" applied with sample fields!`);
    } else {
      // Only apply theme, don't replace existing fields
      toast.success(`Template "${template.name}" theme applied!`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground font-jakarta">Loading form builder...</p>
        </div>
      </div>
    );
  }

  if (showPreview) {
    return (
      <FormPreview
        fields={fields}
        basePrice={basePrice}
        campaignName={campaign?.name}
        onClose={() => setShowPreview(false)}
        fieldRules={fieldRules}
        pricingRules={pricingRules}
        pricingFormula={pricingFormula}
        campaignId={campaignId}
        theme={formTheme ? {
          ...formTheme,
          page_background_image: toAbsUrl(formTheme.page_background_image) || undefined,
          background_image: toAbsUrl(formTheme.background_image) || undefined,
        } : formTheme}
        headerImage={toAbsUrl(headerImage)}
        submitButtonText={submitButtonText}
        layoutMode={layoutMode}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="ke-atmos flex h-screen overflow-hidden gap-3 p-3">
      {/* Left Sidebar - Field Library (form structure only; hidden in the Themes view) */}
      {!isThemes && (
      <div className="ke-card ke-scroll w-64 shrink-0 p-4 overflow-y-auto overflow-x-hidden">
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/campaigns/${campaignId}`)}
            data-testid="back-button"
            className="hover:bg-muted rounded-lg w-full justify-start mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Event
          </Button>

          <h2 className="ke-section-title text-[15px]">Field Library</h2>
          <div className="ke-rule-gold mt-2 mb-2" />
          <p className="text-xs text-muted-foreground font-jakarta mb-3">Click to add fields</p>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
              placeholder="Search fields..."
              data-testid="field-library-search"
              className="h-9 pl-8 pr-8 text-sm rounded-lg border-border focus-visible:ring-primary"
            />
            {fieldSearch && (
              <button
                type="button"
                onClick={() => setFieldSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {(() => {
            const q = fieldSearch.trim().toLowerCase();
            const matches = (f) =>
              !q ||
              f.label.toLowerCase().includes(q) ||
              f.type.toLowerCase().includes(q);

            const visibleCategories = FIELD_CATEGORIES
              .map(cat => ({
                ...cat,
                fields: FIELD_TYPES.filter(f => f.category === cat.id && matches(f))
              }))
              .filter(cat => cat.fields.length > 0);

            if (visibleCategories.length === 0) {
              return (
                <p className="text-xs text-muted-foreground font-jakarta italic px-1">
                  No fields match "{fieldSearch}"
                </p>
              );
            }

            return visibleCategories.map(category => (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-2 px-0.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: hueFor(category.id) }} />
                  <h3 className="text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wide">
                    {category.label}
                  </h3>
                  <span className="ml-auto text-[10px] font-jakarta font-semibold text-muted-foreground/70 bg-muted rounded-full px-1.5 py-0.5">
                    {category.fields.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {category.fields.map(fieldType => (
                    <PaletteFieldButton key={fieldType.type} fieldType={fieldType} onAdd={addField} />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
      )}

      {/* Field Settings — sits right after the Field Library (an extended version
          of it). Same card look + fonts as the library; the whole container glows
          (like a palette item's hover glow, held on) to signal the active field. */}
      {selectedField && activeTab === 'fields' && (
        <div
          className="ke-card ke-settings-glow ke-scroll w-80 shrink-0 overflow-y-auto"
          style={{ '--glow': hueForType(selectedField.type) }}
        >
          <FieldEditor
            field={selectedField}
            onUpdate={updateField}
            onClose={() => setSelectedField(null)}
            paymentGateway={campaign?.payment_gateway}
          />
        </div>
      )}

      {/* Center - Form Canvas with Tabs */}
      <div className="flex-1 overflow-y-auto ke-scroll">
        <div className="max-w-5xl mx-auto p-6">
          {/* Slim premium header — compact navy bar with editorial title and the
              primary gold Save CTA. Kept deliberately short so it doesn't steal
              canvas height; the full sticky Save/Preview bar remains at the bottom. */}
          <div className="ke-hero p-4 md:p-5 mb-6">
            <div className="ke-hero-grid" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">{isThemes ? 'Form Themes' : 'Form Builder'}</div>
                  {!isThemes && fields.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.12] border border-white/15 px-2 py-0.5 text-[10px] font-jakarta font-semibold text-white/80">
                      <LayoutGrid className="w-3 h-3" /> {fields.length} {fields.length === 1 ? 'field' : 'fields'}
                    </span>
                  )}
                </div>
                <h1 className="text-xl md:text-2xl font-outfit font-bold tracking-tight text-white truncate mt-0.5">
                  {campaign?.name || 'Untitled Event'}
                </h1>
                <p className="text-white/60 text-xs font-jakarta mt-1 hidden sm:block">{isThemes ? 'Pick a template, colours and header image for the registration form' : 'Design your registration form with advanced features'}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isThemes && (
                  <div className="inline-flex rounded-lg border border-white/20 bg-white/10 p-0.5 mr-0.5">
                    <button
                      type="button"
                      onClick={undoFields}
                      disabled={histUndo.current.length === 0}
                      title="Undo (Ctrl+Z)"
                      data-testid="undo-button"
                      className="p-2 rounded-md text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={redoFields}
                      disabled={histRedo.current.length === 0}
                      title="Redo (Ctrl+Shift+Z)"
                      data-testid="redo-button"
                      className="p-2 rounded-md text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(true)}
                  disabled={fields.length === 0}
                  data-testid="preview-form-button-top"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white font-jakarta rounded-lg h-10"
                >
                  <Eye className="w-4 h-4 mr-1.5" />
                  Preview
                </Button>
                <Button
                  onClick={saveForm}
                  disabled={saving}
                  data-testid="save-form-button-top"
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  {saving ? 'Saving...' : 'Save Form'}
                </Button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={isThemes ? 'design' : activeTab} onValueChange={setActiveTab} className="space-y-6">
            {!isThemes && (
            <div className="ke-card p-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="fields" className="font-jakarta">Fields</TabsTrigger>
                <TabsTrigger value="formulas" className="font-jakarta">Formulas</TabsTrigger>
                <TabsTrigger value="rules" className="font-jakarta">Field Rules</TabsTrigger>
                <TabsTrigger value="pages" className="font-jakarta">Pages</TabsTrigger>
              </TabsList>
            </div>
            )}

            {/* Design Tab - Templates & Header Image */}
            <TabsContent value="design" className="space-y-6">
              {/* Form Banner — full-width image rendered ABOVE the form header on
                  the public registration page. Aspect ratio is preserved exactly
                  as uploaded (free height). No text overlay. Optional. */}
              <Card className="ke-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="ke-section-title text-[15px]">Form Banner</h3>
                    <p className="text-sm text-muted-foreground font-jakarta">
                      Optional banner image displayed above the form header. The image is shown at its
                      original aspect ratio — no cropping, no text overlay.
                    </p>
                  </div>
                  {bannerImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBannerImage('')}
                      className="text-destructive hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>

                {bannerImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                    <img
                      src={toAbsUrl(bannerImage)}
                      alt="Form banner"
                      className="w-full h-auto block"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setBannerImage('')}
                        className="bg-white/90"
                      >
                        Change Image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ImageUploader
                    value={bannerImage}
                    onChange={setBannerImage}
                    label="Upload Banner Image"
                    aspectRatio="banner"
                  />
                )}
              </Card>

              {/* Header Image */}
              <Card className="ke-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="ke-section-title text-[15px]">Form Header Image</h3>
                    <p className="text-sm text-muted-foreground font-jakarta">Add a banner image at the top of your registration form</p>
                  </div>
                  {headerImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHeaderImage('')}
                      className="text-destructive hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
                
                {headerImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    <img
                      src={toAbsUrl(headerImage)}
                      alt="Form header"
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setHeaderImage('')}
                        className="bg-white/90"
                      >
                        Change Image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ImageUploader
                    value={headerImage}
                    onChange={setHeaderImage}
                    label="Upload Header Image"
                    aspectRatio="banner"
                  />
                )}
              </Card>

              {/* Event Logo */}
              <Card className="ke-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="ke-section-title text-[15px]">Event Logo</h3>
                    <p className="text-sm text-muted-foreground font-jakarta">Shown to the left of the event title on the registration form</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-jakarta text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showEventLogo}
                      onChange={(e) => setShowEventLogo(e.target.checked)}
                      style={{ accentColor: '#091D40', width: 16, height: 16 }}
                    />
                    Show on form
                  </label>
                </div>

                {logoUrl ? (
                  <div className="relative rounded-lg border border-border bg-muted p-4 flex items-center justify-center">
                    <img
                      src={toAbsUrl(logoUrl)}
                      alt="Event logo"
                      className="object-contain"
                      style={{ height: `${logoSize}px`, width: 'auto', maxWidth: '180px' }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setLogoUrl('')}
                      className="absolute top-2 right-2 bg-white/90 text-destructive hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <ImageUploader
                    value={logoUrl}
                    onChange={setLogoUrl}
                    label="Upload Logo"
                  />
                )}

                {/* Logo size control */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="logo-size" className="font-jakarta text-sm text-foreground">Logo Size</Label>
                    <span className="text-xs text-muted-foreground font-jakarta">{logoSize}px</span>
                  </div>
                  <input
                    id="logo-size"
                    type="range"
                    min={32}
                    max={96}
                    step={2}
                    value={logoSize}
                    onChange={(e) => setLogoSize(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: '#091D40' }}
                    data-testid="logo-size-slider"
                  />
                </div>

                {/* Live preview: logo to the left of the title */}
                <div className="mt-4 rounded-lg border border-border bg-slate-900 p-4">
                  <p className="text-xs text-muted-foreground font-jakarta mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    {showEventLogo && logoUrl ? (
                      <img
                        src={toAbsUrl(logoUrl)}
                        alt="Logo preview"
                        className="object-contain flex-shrink-0 rounded-lg bg-white/5"
                        style={{ height: `${logoSize}px`, width: 'auto', maxWidth: '180px' }}
                      />
                    ) : (
                      <div
                        className="rounded-full bg-white/10 flex items-center justify-center text-white font-outfit font-bold flex-shrink-0"
                        style={{ height: `${logoSize}px`, width: `${logoSize}px` }}
                      >
                        {(campaign?.name || 'E').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xl font-outfit font-bold text-white">{campaign?.name || 'Event Title'}</span>
                  </div>
                </div>
              </Card>

              {/* Submit Button */}
              <Card className="ke-card p-6">
                <div className="mb-4">
                  <h3 className="ke-section-title text-[15px]">Submit Button</h3>
                  <div className="ke-rule-gold mt-2 mb-2" />
                  <p className="text-sm text-muted-foreground font-jakarta">Customize the text shown on the form's submit button</p>
                </div>
                <Label htmlFor="submit-button-text" className="font-jakarta text-sm text-foreground">Submit Button Text</Label>
                <Input
                  id="submit-button-text"
                  value={submitButtonText}
                  onChange={(e) => setSubmitButtonText(e.target.value)}
                  placeholder="Continue to Payment"
                  maxLength={40}
                  className="mt-2 font-jakarta"
                  data-testid="submit-button-text-input"
                />
                <p className="text-xs text-muted-foreground font-jakarta mt-2">
                  Leave blank to use the default. On paid forms the amount is still appended automatically (e.g. "Register Now - ₹500").
                </p>
              </Card>

              {/* Form Heading — the "Registration Details" title above the fields */}
              <Card className="ke-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="ke-section-title text-[15px]">Form Heading</h3>
                    <p className="text-sm text-muted-foreground font-jakarta">The section title shown above the form fields on the registration page</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showSectionTitle}
                      onChange={(e) => setShowSectionTitle(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                      data-testid="show-section-title-toggle"
                    />
                    <span className="text-sm font-jakarta text-foreground">Show on registration form</span>
                  </label>
                </div>
                <Label htmlFor="section-title-text" className="font-jakarta text-sm text-foreground">Heading Text</Label>
                <Input
                  id="section-title-text"
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  placeholder="Registration Details"
                  maxLength={80}
                  disabled={!showSectionTitle}
                  className="mt-2 font-jakarta disabled:opacity-50"
                  data-testid="section-title-input"
                />
                <p className="text-xs text-muted-foreground font-jakarta mt-2">
                  Leave blank to use the default ("Registration Details"). Uncheck the toggle to hide the heading entirely.
                </p>
              </Card>

              {/* Form Templates */}
              <Card className="ke-card p-6">
                <div className="mb-6">
                  <h3 className="ke-section-title text-[15px]">Form Templates</h3>
                  <div className="ke-rule-gold mt-2 mb-2" />
                  <p className="text-sm text-muted-foreground font-jakarta">Choose a template to apply theme and sample fields</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {FORM_TEMPLATES.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleApplyTemplate(template.id)}
                      className={`group relative rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden ${
                        formTemplateId === template.id 
                          ? 'ring-2 ring-primary ring-offset-2 shadow-xl scale-[1.02]' 
                          : 'hover:shadow-xl hover:scale-[1.02] border border-border'
                      }`}
                    >
                      {/* Live mini-preview rendered in the template's actual design
                          language via the same [data-formstyle] engine as the public form. */}
                      <div
                        className="ke-form-root h-44 relative overflow-hidden p-3 flex items-stretch"
                        data-formstyle={template.theme.style || undefined}
                        data-formlayout="card"
                        style={{
                          background: template.theme.page_background || template.theme.gradient || '#f8fafc',
                          ...(template.theme.style ? {
                            '--fs-primary': template.theme.primary_color,
                            '--fs-accent': template.theme.accent_color || template.theme.primary_color,
                            '--fs-text': template.theme.text_color,
                            '--fs-surface': template.theme.background_color,
                            '--fs-page': template.theme.page_background,
                            '--fs-font': template.theme.font_family,
                          } : {})
                        }}
                      >
                        <div className="ke-form-card w-full p-2.5 flex flex-col" style={{ fontSize: '9px', lineHeight: 1.2 }}>
                          <div className="ke-form-header -mx-2.5 -mt-2.5 mb-2 px-2.5 py-1.5" style={{ fontSize: '10px', fontWeight: 700 }}>
                            {template.name}
                          </div>
                          <label style={{ display: 'block', marginBottom: '2px' }}>Full name</label>
                          <input disabled aria-hidden readOnly style={{ height: '16px', width: '100%', marginBottom: '5px', fontSize: '8px', padding: '0 6px' }} />
                          <label style={{ display: 'block', marginBottom: '2px' }}>Email</label>
                          <input disabled aria-hidden readOnly style={{ height: '16px', width: '100%', marginBottom: '7px', fontSize: '8px', padding: '0 6px' }} />
                          <button type="button" className="ke-form-submit" style={{ height: '19px', width: '100%', fontSize: '9px', marginTop: 'auto', pointerEvents: 'none' }}>Register</button>
                        </div>

                        {/* Selected Checkmark */}
                        {formTemplateId === template.id && (
                          <div className="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-lg z-10">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                      </div>
                      
                      {/* Template Info */}
                      <div className="p-4 bg-card">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{template.icon}</span>
                          <h4 className="font-jakarta font-semibold text-foreground text-sm">
                            {template.name}
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-3">
                          {template.description}
                        </p>
                        
                        {/* Color Palette */}
                        <div className="flex items-center gap-1.5">
                          <div 
                            className="w-5 h-5 rounded-full shadow-sm ring-1 ring-black/5"
                            style={{ backgroundColor: template.theme.primary_color }}
                            title="Primary"
                          />
                          <div 
                            className="w-5 h-5 rounded-full shadow-sm ring-1 ring-black/5"
                            style={{ backgroundColor: template.theme.secondary_color }}
                            title="Secondary"
                          />
                          <div 
                            className="w-5 h-5 rounded-full shadow-sm ring-1 ring-black/5"
                            style={{ backgroundColor: template.theme.accent_color }}
                            title="Accent"
                          />
                          <div 
                            className="w-5 h-5 rounded-full shadow-sm ring-1 ring-black/5"
                            style={{ backgroundColor: template.theme.page_background }}
                            title="Background"
                          />
                          <span className="text-[10px] text-muted-foreground ml-auto font-jakarta">
                            {template.sample_fields.length} fields
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {fields.length > 0 && (
                  <div className="mt-5 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-amber-800 font-jakarta">
                      <strong>💡 Tip:</strong> Applying a template will change the form's visual theme. 
                      To also apply sample fields, clear existing fields first or start with a new form.
                    </p>
                  </div>
                )}
              </Card>

              {/* Color Customization */}
              <Card className="ke-card p-6">
                <div className="mb-4">
                  <h3 className="ke-section-title text-[15px]">Customize Colors</h3>
                  <div className="ke-rule-gold mt-2 mb-2" />
                  <p className="text-sm text-muted-foreground font-jakarta">Fine-tune the form's color scheme</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Page Background */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Page Background</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formTheme?.page_background || '#f8fafc'}
                        onChange={(e) => setFormTheme(prev => ({ 
                          ...prev, 
                          page_background: e.target.value,
                          gradient: null  // Clear gradient when setting solid color
                        }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={formTheme?.page_background || '#f8fafc'}
                        onChange={(e) => setFormTheme(prev => ({ 
                          ...prev, 
                          page_background: e.target.value,
                          gradient: null
                        }))}
                        className="flex-1 h-10 text-xs font-mono"
                        placeholder="#f8fafc"
                      />
                    </div>
                  </div>

                  {/* Form Background */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Form Background</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formTheme?.background_color || '#ffffff'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, background_color: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={formTheme?.background_color || '#ffffff'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, background_color: e.target.value }))}
                        className="flex-1 h-10 text-xs font-mono"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>

                  {/* Text Color */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Text Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formTheme?.text_color || '#1e293b'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, text_color: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={formTheme?.text_color || '#1e293b'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, text_color: e.target.value }))}
                        className="flex-1 h-10 text-xs font-mono"
                        placeholder="#1e293b"
                      />
                    </div>
                  </div>

                  {/* Primary Color */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Primary (Buttons)</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formTheme?.primary_color || '#091D40'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, primary_color: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={formTheme?.primary_color || '#091D40'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, primary_color: e.target.value }))}
                        className="flex-1 h-10 text-xs font-mono"
                        placeholder="#091D40"
                      />
                    </div>
                  </div>

                  {/* Secondary Color */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Secondary</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formTheme?.secondary_color || '#14b8a6'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, secondary_color: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={formTheme?.secondary_color || '#14b8a6'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, secondary_color: e.target.value }))}
                        className="flex-1 h-10 text-xs font-mono"
                        placeholder="#14b8a6"
                      />
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Accent</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formTheme?.accent_color || '#091D40'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, accent_color: e.target.value }))}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={formTheme?.accent_color || '#091D40'}
                        onChange={(e) => setFormTheme(prev => ({ ...prev, accent_color: e.target.value }))}
                        className="flex-1 h-10 text-xs font-mono"
                        placeholder="#091D40"
                      />
                    </div>
                  </div>
                </div>

                {/* Reset to Default */}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormTheme({
                      primary_color: '#091D40',
                      secondary_color: '#14b8a6',
                      background_color: '#ffffff',
                      text_color: '#1e293b',
                      accent_color: '#091D40',
                      font_family: 'Libre Baskerville',
                      card_style: 'solid',
                      gradient: null,
                      page_background: '#f8fafc'
                    })}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Reset to Default
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(true)}
                    className="border-primary text-primary hover:bg-primary-subtle"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview Form
                  </Button>
                </div>
              </Card>

              {/* Background Images (optional, layered on top of the colors above) */}
              <Card className="ke-card p-6">
                <div className="mb-4">
                  <h3 className="ke-section-title text-[15px]">Background Images</h3>
                  <div className="ke-rule-gold mt-2 mb-2" />
                  <p className="text-sm text-muted-foreground font-jakarta">
                    Optional. Layer a photo behind the page or behind the form card itself, on top of the colors above.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Page Background Image */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs text-muted-foreground">Page Background Image</Label>
                      {formTheme?.page_background_image && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormTheme(prev => ({ ...prev, page_background_image: '' }))}
                          className="h-6 px-2 text-destructive hover:bg-red-500/10"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                    {formTheme?.page_background_image ? (
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img
                          src={toAbsUrl(formTheme.page_background_image)}
                          alt="Page background"
                          className="w-full h-28 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setFormTheme(prev => ({ ...prev, page_background_image: '' }))}
                            className="bg-white/90"
                          >
                            Change Image
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <ImageUploader
                        value={formTheme?.page_background_image || ''}
                        onChange={(url) => setFormTheme(prev => ({ ...prev, page_background_image: url }))}
                        label="Upload Page Background"
                        aspectRatio="banner"
                      />
                    )}
                  </div>

                  {/* Form Card Background Image */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs text-muted-foreground">Form Card Background Image</Label>
                      {formTheme?.background_image && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormTheme(prev => ({ ...prev, background_image: '' }))}
                          className="h-6 px-2 text-destructive hover:bg-red-500/10"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                    {formTheme?.background_image ? (
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img
                          src={toAbsUrl(formTheme.background_image)}
                          alt="Form card background"
                          className="w-full h-28 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setFormTheme(prev => ({ ...prev, background_image: '' }))}
                            className="bg-white/90"
                          >
                            Change Image
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <ImageUploader
                        value={formTheme?.background_image || ''}
                        onChange={(url) => setFormTheme(prev => ({ ...prev, background_image: url }))}
                        label="Upload Form Background"
                        aspectRatio="banner"
                      />
                    )}
                    <p className="text-[11px] text-muted-foreground font-jakarta mt-1">
                      The "Form Background" color above tints this image so fields stay readable.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Live Theme Preview */}
              {formTheme && (
                <Card className="ke-card overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="ke-section-title text-[15px]">Live Preview</h3>
                    <span className="text-xs text-muted-foreground font-jakarta">Changes update in real-time</span>
                  </div>
                  <div
                    className="p-8 transition-all duration-500"
                    style={{
                      background: formTheme.page_background || formTheme.gradient || '#f8fafc',
                      backgroundImage: formTheme.page_background_image ? `url(${toAbsUrl(formTheme.page_background_image)})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      minHeight: '320px'
                    }}
                  >
                    <div className="max-w-md mx-auto">
                      {/* Mini Header Image */}
                      {headerImage && (
                        <div className="mb-4 rounded-xl overflow-hidden shadow-lg">
                          <img src={toAbsUrl(headerImage)} alt="Header" className="w-full h-28 object-cover" />
                        </div>
                      )}

                      {/* Mini Form Card */}
                      <div
                        className="rounded-xl shadow-xl p-6 transition-all duration-300"
                        style={{
                          backgroundColor: formTheme.background_color || '#ffffff',
                          backgroundImage: formTheme.background_image
                            ? `linear-gradient(${hexToRgba(formTheme.background_color || '#ffffff', 0.85)}, ${hexToRgba(formTheme.background_color || '#ffffff', 0.85)}), url(${toAbsUrl(formTheme.background_image)})`
                            : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          color: formTheme.text_color || '#1e293b'
                        }}
                      >
                        {/* Form Title */}
                        <h4 
                          className="font-bold text-lg mb-4 pb-3 border-b"
                          style={{ 
                            fontFamily: formTheme.font_family,
                            borderColor: `${formTheme.text_color}15`
                          }}
                        >
                          {campaign?.name || 'Event Registration'}
                        </h4>
                        
                        {/* Sample Fields */}
                        <div className="space-y-3 mb-5">
                          <div>
                            <label className="text-xs font-medium mb-1 block opacity-70">Full Name</label>
                            <div 
                              className="h-9 rounded-lg border px-3 flex items-center text-sm opacity-50"
                              style={{ borderColor: `${formTheme.text_color}25` }}
                            >
                              John Doe
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium mb-1 block opacity-70">Email Address</label>
                            <div 
                              className="h-9 rounded-lg border px-3 flex items-center text-sm opacity-50"
                              style={{ borderColor: `${formTheme.text_color}25` }}
                            >
                              john@example.com
                            </div>
                          </div>
                        </div>
                        
                        {/* Price Display */}
                        <div 
                          className="flex items-center justify-between py-3 mb-4 border-t border-b"
                          style={{ borderColor: `${formTheme.text_color}15` }}
                        >
                          <span className="font-medium">Total Amount</span>
                          <span 
                            className="font-bold text-lg"
                            style={{ color: formTheme.primary_color }}
                          >
                            ₹{basePrice || '0'}.00
                          </span>
                        </div>
                        
                        {/* Submit Button */}
                        <button 
                          className="w-full py-3 rounded-lg text-white font-semibold shadow-lg transition-all duration-200 hover:opacity-90"
                          style={{ backgroundColor: formTheme.primary_color }}
                        >
                          Register & Pay
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* Fields Tab */}
            <TabsContent value="fields" className="space-y-6">
              {/* Form health — a friendly, at-a-glance summary of the form so far */}
              {(() => {
                const inputFields = fields.filter(f => !['section_header', 'divider', 'rich_text', 'price'].includes(f.type));
                const requiredCount = fields.filter(f => f.required).length;
                const estSec = inputFields.length * 12;
                const estLabel = inputFields.length === 0 ? '—' : (estSec < 60 ? `${estSec}s` : `~${Math.round(estSec / 60)} min`);
                const stats = [
                  { icon: LayoutGrid, hue: 'var(--primary)',     value: fields.length, label: fields.length === 1 ? 'field' : 'fields' },
                  { icon: Asterisk,   hue: 'var(--accent)',      value: requiredCount, label: 'required' },
                  { icon: Clock,      hue: 'var(--destructive)', value: estLabel,      label: 'to fill in' },
                ];
                const vibe = fields.length === 0 ? 'Add your first field to get started'
                  : fields.length < 4 ? 'Nice start — keep going'
                  : 'Looking good — your form is taking shape';
                return (
                  <Card className="ke-card p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-6 flex-wrap">
                        {stats.map((s, i) => {
                          const Ico = s.icon;
                          return (
                            <div key={i} className="flex items-center gap-2.5">
                              <span className="ke-chip w-9 h-9" style={{ '--chip': `hsl(${s.hue})` }}>
                                <Ico className="w-[18px] h-[18px]" />
                              </span>
                              <div className="leading-tight">
                                <div className="text-lg font-outfit font-bold text-foreground tabular-nums">{s.value}</div>
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-jakarta">{s.label}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-sm font-jakarta text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-accent" /> {vibe}
                      </p>
                    </div>
                  </Card>
                );
              })()}

              {/* Base Price */}
              <Card className="ke-card p-6">
                <label className="text-sm font-jakarta font-medium text-foreground mb-2 block">
                  Base Registration Price (₹)
                </label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="0"
                  data-testid="base-price-input"
                  className="h-11 w-full rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all duration-200"
                />
              </Card>

              {/* Form Fields */}
              <Card className="ke-card p-6">
                <div className="mb-4">
                  <h3 className="ke-section-title text-[15px]">Form Fields</h3>
                  <div className="ke-rule-gold mt-2 mb-2" />
                  <p className="text-sm text-muted-foreground font-jakarta">Drag a field from the left, drop it where you want it · drag a card to reorder · click to edit</p>
                </div>
                {fields.length === 0 ? (
                  <div className="grid grid-cols-12 gap-3">
                    <CanvasEmptyDropZone />
                  </div>
                ) : (
                  <div className="ke-canvas-dots grid grid-cols-12 gap-3 rounded-xl p-3">
                    <SortableContext items={fields.map(f => f.id)} strategy={rectSortingStrategy}>
                      {fields.map((field, i) => (
                        <React.Fragment key={field.id}>
                          {activeDrag?.source === 'palette' && insertIndex === i && (
                            <InsertGhost fieldType={activeDrag.fieldType} />
                          )}
                          <CanvasFieldCard
                            field={field}
                            isSelected={selectedField?.id === field.id}
                            onSelect={() => setSelectedField(field)}
                            onDelete={() => deleteField(field.id)}
                            onDuplicate={() => duplicateField(field.id)}
                          />
                        </React.Fragment>
                      ))}
                      {activeDrag?.source === 'palette' && insertIndex === fields.length && (
                        <InsertGhost fieldType={activeDrag.fieldType} />
                      )}
                      <CanvasTailDropZone />
                    </SortableContext>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Formulas Tab */}
            <TabsContent value="formulas">
              <FormulaBuilder 
                campaignId={campaignId}
                fields={fields}
                pricingRules={pricingRules}
                pricingFormula={pricingFormula}
                onSave={async (formulas) => {
                  setPricingRules(formulas.pricing_rules);
                  setPricingFormula(formulas.pricing_formula);
                  
                  // Save to database immediately
                  setSaving(true);
                  try {
                    const sanitizedFields = sanitizeFields(fields);
                    await api.put(`/campaigns/${campaignId}/form`, {
                      fields: sanitizedFields,
                      base_price: parseFloat(basePrice) || 0,
                      pricing_rules: formulas.pricing_rules,
                      pricing_formula: formulas.pricing_formula,
                      field_rules: fieldRules,
                      page_breaks: pageBreaks,
                      page_rules: pageRules,
                      integrations: integrations,
                      header_image: headerImage || null,
                      banner_image: bannerImage || null,
                      submit_button_text: submitButtonText.trim() || null,
                      section_title: sectionTitle.trim() || null,
                      show_section_title: showSectionTitle,
                      layout_mode: layoutMode,
                      form_template_id: formTemplateId || null,
                      theme: formTheme,
                      logo_size: logoSize
                    });
                    toast.success('Formulas saved to database!');
                  } catch (error) {
                    toast.error(error.response?.data?.detail || 'Failed to save formulas');
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            </TabsContent>

            {/* Field Rules Tab */}
            <TabsContent value="rules">
              <FieldRules
                fields={fields}
                fieldRules={fieldRules}
                onUpdate={setFieldRules}
                onSave={() => persistForm(fields, 'Field rules saved!')}
                saving={saving}
              />
            </TabsContent>

            {/* Pages Tab */}
            <TabsContent value="pages">
              {/* Form layout mode — opt-in one-question-per-screen flows */}
              <div className="ke-card p-5 mb-6">
                <h3 className="ke-section-title text-lg">Form Layout</h3>
                <div className="ke-rule-gold mt-2 mb-3" />
                <p className="text-sm text-muted-foreground font-jakarta mb-4">
                  How the registration form is presented to registrants.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { v: 'standard',  title: 'Standard',  desc: 'All fields on one page. Honours any manual page breaks below.' },
                    { v: 'card',      title: 'Card',      desc: 'One question per screen with Next / Previous navigation.' },
                    { v: 'spotlight', title: 'Spotlight', desc: 'One question per screen, enlarged and focused.' },
                  ].map((opt) => {
                    const active = layoutMode === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setLayoutMode(opt.v)}
                        data-testid={`layout-mode-${opt.v}`}
                        className={`text-left rounded-xl border-2 p-4 transition-all ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-jakarta font-semibold text-sm ${active ? 'text-primary' : 'text-foreground'}`}>{opt.title}</span>
                          {active && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="text-xs text-muted-foreground font-jakarta leading-snug block">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {layoutMode !== 'standard' && (
                  <p className="text-xs text-amber-600 font-jakarta mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    In {layoutMode === 'card' ? 'Card' : 'Spotlight'} mode each field becomes its own screen, so the manual page breaks and page rules below are not used. Use Preview to try the flow.
                  </p>
                )}
              </div>

              <PageRules
                fields={fields}
                pageBreaks={pageBreaks}
                pageRules={pageRules}
                onUpdateBreaks={setPageBreaks}
                onUpdateRules={setPageRules}
              />
            </TabsContent>

          </Tabs>

          {/* Action Buttons — sticky bar pinned to the bottom of the scrolling
              canvas so Save/Preview stay reachable without scrolling to the end.
              Layout only: the buttons' handlers and testids are unchanged. */}
          <div className="ke-glass sticky bottom-0 z-20 -mx-6 -mb-6 mt-6 border-t border-border px-6 py-4 shadow-[0_-4px_12px_-6px_rgba(9,29,64,0.15)]">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPreview(true)}
                data-testid="preview-form-button"
                disabled={fields.length === 0}
                className="border-border hover:bg-muted font-jakarta rounded-lg"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Form
              </Button>
              <Button
                onClick={saveForm}
                disabled={saving}
                data-testid="save-form-button"
                className="bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta font-medium rounded-lg shadow-lg shadow-primary/20 transition-all duration-200 active:scale-95"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Form'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.source === 'palette' && (() => {
          const Icon = activeDrag.fieldType.icon;
          return (
            <div className="ke-card flex items-center gap-2 p-2 shadow-lg bg-card">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-jakarta text-foreground">{activeDrag.fieldType.label}</span>
            </div>
          );
        })()}
        {activeDrag?.source === 'canvas' && activeDrag.field && (
          <div className="rounded-xl border border-accent bg-card p-4 shadow-xl opacity-95">
            <BuilderFieldPreview field={activeDrag.field} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default FormBuilder;
