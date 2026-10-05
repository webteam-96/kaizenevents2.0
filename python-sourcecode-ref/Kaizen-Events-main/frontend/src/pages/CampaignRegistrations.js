import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  ArrowLeft, Download, Mail, MessageSquare, FileText, 
  Search, Filter, Calendar, TrendingUp, Users, DollarSign,
  FileSpreadsheet, RefreshCw, ChevronDown, Eye, Edit, AlertTriangle, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import TrendChart from '../components/dashboard/TrendChart';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { RichTextView, richTextToPlain } from '../components/ui/RichTextInput';
import { parseServerDate, serverDateMs, formatServerDate } from '../utils/serverTime';
import { humanizeOptionValue } from '../utils/optionLabels';
import { applyFileHyperlinks } from '../utils/exportRegistrations';
import { resolveRegistrantContact } from '../utils/registrantContact';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;
// Upload URLs are stored server-relative (/api/uploads/...) — prefix with the API
// origin so links work from the admin UI and exported sheets.
const toAbsUrl = (url) => (typeof url === 'string' && url.startsWith('/api/') ? `${API_BASE_URL}${url}` : (url || ''));

const CampaignRegistrations = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  // The form's fields as authored, kept whole so the registrant's name can be resolved the
  // way the server resolves it (see utils/registrantContact).
  const [formFields, setFormFields] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const [editingRegistration, setEditingRegistration] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editAmount, setEditAmount] = useState(0);
  const [editRegNumber, setEditRegNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldLabels, setFieldLabels] = useState({});
  const [fieldTypes, setFieldTypes] = useState({});
  // fieldId → { optionValue: optionLabel } for choice fields (dropdown/radio/checkbox),
  // so reports display the human label instead of the stored "value_abc" key.
  const [fieldOptions, setFieldOptions] = useState({});

  // Build field ID → label map from form config
  const getFieldLabel = (fieldId) => {
    return fieldLabels[fieldId] || fieldId.replace(/_/g, ' ');
  };

  // Field ID → type lookup (so rich-text answers render formatted, not as raw HTML)
  const getFieldType = (fieldId) => fieldTypes[fieldId];

  // Map a choice field's stored value(s) to their display label(s).
  // No exact option match (option edited/deleted after registration) → humanize the slug.
  const resolveChoiceLabel = (fieldId, value) => {
    const m = fieldOptions[fieldId];
    if (!m) return value;
    if (Array.isArray(value)) return value.map(v => m[String(v)] ?? humanizeOptionValue(v));
    return m[String(value)] ?? humanizeOptionValue(value);
  };

  // Format any form-data value for display (handles files, arrays, objects).
  // Pass fieldId so choice fields show their label instead of the "value_abc" key.
  const formatFieldValue = (value, fieldId) => {
    if (fieldId && fieldOptions[fieldId]) value = resolveChoiceLabel(fieldId, value);
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ');
    if (typeof value === 'object') {
      // File upload submitted from browser — File objects become {} after JSON
      // If the backend stored something with a url/name, show it nicely
      if (value.url) {
        return <a href={toAbsUrl(value.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{value.name || 'View file'}</a>;
      }
      if (value.name) return value.name;
      // Empty object (e.g. unserialized File) → fallback
      return Object.keys(value).length === 0 ? '(file)' : JSON.stringify(value);
    }
    return String(value);
  };

  // Check whether a form-data entry is editable as plain text in the Edit popup
  const isEditableValue = (value) =>
    value === null || value === undefined || typeof value === 'string' ||
    typeof value === 'number' || typeof value === 'boolean';

  // Extract the registrant's name from form_data.
  //
  // Ranked off form_config the same way the server ranks it, so this list, the receipt and
  // the confirmation email name the same person. The guesses below it are the old behaviour,
  // kept for a registration whose campaign has no form config to rank against — on a real
  // Form Builder form the keys are random ids (`field_abc123`), so `formData.name` is never
  // populated and every row here read "N/A".
  const getRegistrantName = (formData) => {
    if (!formData || typeof formData !== 'object') return 'N/A';

    const resolved = resolveRegistrantContact(formFields, formData).name;
    if (resolved) return resolved;

    if (formData.name) return formData.name;
    if (formData.full_name) return formData.full_name;

    // Look for name type field (has _first, _last suffixes)
    const keys = Object.keys(formData);
    const firstNameKey = keys.find(k => k.endsWith('_first'));
    const lastNameKey = keys.find(k => k.endsWith('_last'));

    if (firstNameKey || lastNameKey) {
      const firstName = formData[firstNameKey] || '';
      const lastName = formData[lastNameKey] || '';
      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName) return fullName;
    }

    // Look for a field value that's an object with first_name/last_name
    for (const key of keys) {
      const value = formData[key];
      if (value && typeof value === 'object' && (value.first_name || value.full_name)) {
        if (value.full_name) return value.full_name;
        const fn = value.first_name || '';
        const ln = value.last_name || '';
        return `${fn} ${ln}`.trim() || 'N/A';
      }
    }

    return 'N/A';
  };

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  useEffect(() => {
    filterRegistrations();
  }, [registrations, searchTerm, statusFilter, dateFilter]);

  const fetchData = async () => {
    try {
      const [campaignRes, registrationsRes, analyticsRes, formRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/registrations`),
        api.get(`/campaigns/${campaignId}/analytics`),
        api.get(`/campaigns/${campaignId}/form`).catch(() => ({ data: null }))
      ]);

      setCampaign(campaignRes.data);
      setRegistrations(registrationsRes.data);
      setAnalytics(analyticsRes.data);

      // Build field ID → label lookup from form config
      if (formRes.data?.fields) {
        const labels = {};
        const types = {};
        const options = {};
        formRes.data.fields.forEach(f => {
          if (f.id && f.label) labels[f.id] = f.label;
          if (f.id) types[f.id] = f.type;
          // Map each option's stored value → its display label
          if (f.id && Array.isArray(f.options) && f.options.length) {
            const m = {};
            f.options.forEach(o => {
              const v = o.value ?? o.label;
              if (v !== undefined && v !== null) m[String(v)] = o.label ?? String(v);
            });
            options[f.id] = m;
          }
        });
        setFieldLabels(labels);
        setFieldTypes(types);
        setFieldOptions(options);
        setFormFields(formRes.data.fields);
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const filterRegistrations = () => {
    let filtered = [...registrations];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(reg => {
        // Search in invoice number
        if (reg.invoice_number?.toLowerCase().includes(term)) return true;
        
        // Search in extracted name
        const name = getRegistrantName(reg.form_data);
        if (name.toLowerCase().includes(term)) return true;
        
        // Search in all form_data values (catches email, phone, etc.)
        const formValues = Object.values(reg.form_data || {});
        return formValues.some(v => 
          typeof v === 'string' && v.toLowerCase().includes(term)
        );
      });
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(reg => reg.payment_status === statusFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(reg => {
        const regDate = parseServerDate(reg.created_at) || new Date(0);
        switch (dateFilter) {
          case 'today':
            return regDate.toDateString() === now.toDateString();
          case 'week':
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            return regDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            return regDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    // Oldest first → the latest registration is always the last row (matches the exports).
    filtered.sort((a, b) => serverDateMs(a.created_at) - serverDateMs(b.created_at));

    setFilteredRegistrations(filtered);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const response = await api.get(`/campaigns/${campaignId}/export/csv`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `registrations_${campaign.slug}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('CSV exported successfully!');
    } catch (error) {
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      // Prepare data for Excel — oldest first so the newest registration is the last row.
      const fileLinks = [];
      const data = [...filteredRegistrations]
        .sort((a, b) => serverDateMs(a.created_at) - serverDateMs(b.created_at))
        .map((reg, rowIndex) => {
        const row = {
          'Invoice Number': reg.invoice_number || '',
          'Registration No': reg.registration_number || (reg.id ? reg.id.slice(0, 8).toUpperCase() : ''),
          'Registration ID': reg.id,
          'Payment Status': reg.payment_status,
          'Registration Status': reg.registration_status,
          'Total Amount': reg.total_amount,
          'Payment ID': reg.payment_id || '',
          // parseServerDate treats the naive UTC string as UTC → renders local (IST) time
          'Created At': parseServerDate(reg.created_at) ? format(parseServerDate(reg.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
        };

        // Add form data fields with proper labels. Choice fields export their
        // option label(s); rich-text exports plain text.
        Object.keys(reg.form_data || {}).forEach(key => {
          const raw = reg.form_data[key];
          let cell;
          if (getFieldType(key) === 'rich_text') {
            cell = richTextToPlain(raw);
          } else if (fieldOptions[key]) {
            const mapped = resolveChoiceLabel(key, raw);
            cell = Array.isArray(mapped) ? mapped.join(', ') : mapped;
          } else if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.url) {
            // file_upload → a real clickable hyperlink (filename as display text, file
            // as target). Plain value is a fallback; applyFileHyperlinks() upgrades it.
            const abs = toAbsUrl(raw.url);
            cell = raw.name || abs;
            fileLinks.push({ rowIndex, header: getFieldLabel(key), url: abs, text: cell });
          } else if (typeof raw === 'boolean') {
            // terms_checkbox etc. → readable instead of TRUE/FALSE
            cell = raw ? 'Yes' : '';
          } else {
            cell = raw;
          }
          row[getFieldLabel(key)] = cell;
        });

        return row;
      });

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(data);
      applyFileHyperlinks(ws, fileLinks);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registrations');

      // Add analytics sheet
      const analyticsData = [
        { Metric: 'Total Registrations', Value: analytics?.total_registrations || 0 },
        { Metric: 'Paid Registrations', Value: analytics?.paid_registrations || 0 },
        { Metric: 'Pending Registrations', Value: analytics?.pending_registrations || 0 },
        { Metric: 'Total Revenue', Value: `₹${analytics?.total_revenue || 0}` },
        { Metric: 'Average Value', Value: `₹${(analytics?.average_registration_value || 0).toFixed(2)}` },
      ];
      const wsAnalytics = XLSX.utils.json_to_sheet(analyticsData);
      XLSX.utils.book_append_sheet(wb, wsAnalytics, 'Summary');

      // Download
      XLSX.writeFile(wb, `registrations_${campaign.slug}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
      toast.success('Excel exported successfully!');
    } catch (error) {
      toast.error('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleResendReceipt = async (registrationId) => {
    try {
      await api.post(`/registrations/${registrationId}/resend-receipt`, {
        registration_id: registrationId
      });
      toast.success('Receipt resent successfully!');
    } catch (error) {
      toast.error('Failed to resend receipt');
    }
  };

  const handleSendWhatsApp = async (registrationId) => {
    try {
      await api.post(`/registrations/${registrationId}/send-whatsapp`);
      toast.success('WhatsApp notification sent!');
    } catch (error) {
      toast.error('Failed to send WhatsApp');
    }
  };

  // Handle Edit Registration
  const handleEditClick = (reg) => {
    setEditingRegistration(reg);
    setEditFormData({ ...reg.form_data });
    setEditAmount(reg.total_amount);
    setEditRegNumber(reg.registration_number || '');
  };

  const handleEditFormChange = (key, value) => {
    setEditFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingRegistration) return;
    
    setSaving(true);
    try {
      const response = await api.put(`/registrations/${editingRegistration.id}`, {
        form_data: editFormData,
        total_amount: parseFloat(editAmount),
        registration_number: editRegNumber
      });
      
      const result = response.data;
      
      // Show appropriate message based on payment adjustment
      if (result.refund_required) {
        toast.warning(
          `Registration updated. Refund of ₹${result.refund_amount.toFixed(2)} required. Super Admins and Directors have been notified.`,
          { duration: 6000 }
        );
      } else if (result.payment_link) {
        toast.success(
          `Registration updated. Additional payment link generated.`,
          { duration: 6000 }
        );
        // Optionally copy payment link to clipboard
        navigator.clipboard?.writeText(result.payment_link);
      } else {
        toast.success('Registration updated successfully');
      }
      
      // Refresh data
      await fetchData();
      setEditingRegistration(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update registration');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRefund = async (registrationId) => {
    try {
      await api.post(`/registrations/${registrationId}/confirm-refund`);
      toast.success('Refund confirmed successfully');
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm refund');
    }
  };

  // Prepare chart data from analytics
  const chartData = analytics?.registration_by_date?.map(item => ({
    date: format(parseISO(item.date), 'MMM dd'),
    count: item.count
  })) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header skeleton */}
        <div className="bg-card border-b border-border sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
                <div className="space-y-2">
                  <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
                  <div className="h-4 w-56 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-20 rounded-lg bg-muted animate-pulse" />
                <div className="h-10 w-32 rounded-lg bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        {/* Content skeleton */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border shadow-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                    <div className="h-6 w-16 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="h-5 w-40 rounded bg-muted animate-pulse" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-52 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                  <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate(`/campaigns/${campaignId}`)}
              data-testid="back-button"
              className="inline-flex items-center gap-1.5 text-[12px] font-jakarta font-medium text-white/70 hover:text-white transition-colors mb-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to campaign
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Campaign</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Registrations</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">{campaign?.name || 'Every attendee and their payment status.'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleExportCSV}
                  disabled={exporting || filteredRegistrations.length === 0}
                  data-testid="export-csv-button"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-jakarta font-medium rounded-lg h-10"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button
                  onClick={handleExportExcel}
                  disabled={exporting || filteredRegistrations.length === 0}
                  data-testid="export-excel-button"
                  className="font-jakarta font-semibold rounded-lg h-10 shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {exporting ? 'Exporting...' : 'Export Excel'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div>
        {/* Analytics Cards */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
            {/* Total */}
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--chart-1)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Total</div>
                  <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">
                    {analytics.total_registrations}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--chart-1) / 0.14), transparent 85%)' }}>
                  <Users className="w-5 h-5" style={{ color: 'hsl(var(--chart-1))' }} />
                </span>
              </div>
            </div>
            {/* Paid */}
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(152 58% 40%), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Paid</div>
                  <div className="text-[28px] leading-none font-outfit font-bold mt-2.5 tabular-nums truncate" style={{ color: 'hsl(152 58% 40%)' }}>
                    {analytics.paid_registrations}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.14), transparent 85%)' }}>
                  <TrendingUp className="w-5 h-5" style={{ color: 'hsl(152 58% 40%)' }} />
                </span>
              </div>
            </div>
            {/* Pending */}
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(38 92% 48%), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Pending</div>
                  <div className="text-[28px] leading-none font-outfit font-bold mt-2.5 tabular-nums truncate" style={{ color: 'hsl(38 92% 48%)' }}>
                    {analytics.pending_registrations}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(38 92% 48% / 0.14), transparent 85%)' }}>
                  <Calendar className="w-5 h-5" style={{ color: 'hsl(38 92% 48%)' }} />
                </span>
              </div>
            </div>
            {/* Revenue */}
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--chart-2)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Revenue</div>
                  <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">
                    ₹{(analytics.total_revenue * 0.9705).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--chart-2) / 0.16), transparent 85%)' }}>
                  <DollarSign className="w-5 h-5" style={{ color: 'hsl(var(--chart-2))' }} />
                </span>
              </div>
            </div>
            {/* Avg Value */}
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--chart-4)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Avg Value</div>
                  <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">
                    ₹{analytics.average_registration_value.toFixed(0)}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--chart-4) / 0.14), transparent 85%)' }}>
                  <TrendingUp className="w-5 h-5" style={{ color: 'hsl(var(--chart-4))' }} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <Card className="ke-card p-5 mb-5">
            <h3 className="ke-section-title text-[15px]">Registration Trend</h3>
            <div className="ke-rule-gold mt-2 mb-3" />
            {/* 3D registration-trend chart (shared design + hover) */}
            <TrendChart
              data={chartData.map((d) => ({ label: d.date, registrations: d.count }))}
              height={192}
            />
          </Card>
        )}

        {/* Filters */}
        <Card className="ke-card p-5 mb-5">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border">
            <span className="text-sm font-medium text-muted-foreground mr-2">Filter:</span>
            {[
              { value: 'all', label: 'All', count: registrations.length },
              { value: 'completed', label: 'Paid', count: registrations.filter(r => r.payment_status === 'completed').length, color: 'green' },
              { value: 'pending', label: 'Pending', count: registrations.filter(r => r.payment_status === 'pending').length, color: 'yellow' },
              { value: 'failed', label: 'Failed', count: registrations.filter(r => r.payment_status === 'failed').length, color: 'red' }
            ].map(filter => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
                  statusFilter === filter.value
                    ? filter.color === 'green'
                      ? 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30'
                      : filter.color === 'yellow'
                      ? 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30'
                      : filter.color === 'red'
                      ? 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30'
                      : 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent-subtle border border-border'
                }`}
              >
                {filter.label}
                <span className={`ml-2 px-2 py-0.5 rounded-sm text-xs ${
                  statusFilter === filter.value
                    ? 'bg-white/30'
                    : 'bg-border'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search and Date Filter */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, phone, invoice..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
            <div className="text-sm text-muted-foreground">
              Showing {filteredRegistrations.length} of {registrations.length}
            </div>
          </div>
        </Card>

        {/* Registrations Table */}
        <Card className="ke-card overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="ke-section-title text-[15px]">All Registrations</h3>
            <div className="ke-rule-gold mt-2" />
          </div>

          {filteredRegistrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-4">
              <div className="p-4 rounded-full bg-muted mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-base font-outfit font-semibold text-foreground">
                {registrations.length === 0 ? 'No registrations yet' : 'No matching registrations'}
              </p>
              <p className="text-sm font-jakarta text-muted-foreground mt-1 max-w-sm">
                {registrations.length === 0
                  ? 'Registrations will appear here as soon as attendees sign up for this campaign.'
                  : 'Try adjusting your search term or filters to find what you are looking for.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-jakarta font-semibold text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRegistrations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono font-medium text-foreground">{reg.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{reg.registration_number || `${reg.id.slice(0, 8).toUpperCase()}...`}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-jakarta font-medium text-foreground">
                            {getRegistrantName(reg.form_data)}
                          </p>
                          <p className="text-xs font-jakarta text-muted-foreground">
                            {reg.form_data?.email || Object.values(reg.form_data || {}).find(v => typeof v === 'string' && v.includes('@')) || ''}
                          </p>
                          {(reg.form_data?.phone || Object.values(reg.form_data || {}).find(v => typeof v === 'string' && /^\d{10,}$/.test(v))) && (
                            <p className="text-xs font-jakarta text-muted-foreground">
                              {reg.form_data?.phone || Object.values(reg.form_data || {}).find(v => typeof v === 'string' && /^\d{10,}$/.test(v))}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-jakarta font-semibold text-foreground tabular-nums">
                          ₹{reg.total_amount.toFixed(2)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-jakarta font-medium ${
                            reg.payment_status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                              : reg.payment_status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400'
                              : 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                          }`}
                        >
                          {reg.payment_status === 'completed' ? 'Paid' : reg.payment_status === 'pending' ? 'Pending' : 'Failed'}
                        </span>
                        {reg.refund_pending && (
                          <span className="ml-1 px-2 py-1 rounded-sm text-xs font-jakarta font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                            Refund Pending
                          </span>
                        )}
                        {reg.additional_payment_required && (
                          <span className="ml-1 px-2 py-1 rounded-sm text-xs font-jakarta font-medium bg-primary-subtle text-primary">
                            +₹{reg.additional_payment_amount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-jakarta text-muted-foreground">
                          {formatServerDate(reg.created_at, 'MMM dd, yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatServerDate(reg.created_at, 'hh:mm a')}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRegistration(reg)}
                            className="hover:bg-muted rounded-lg h-8 w-8 p-0"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(reg)}
                            className="hover:bg-primary-subtle rounded-lg h-8 w-8 p-0"
                            title="Edit Registration"
                          >
                            <Edit className="w-4 h-4 text-primary" />
                          </Button>
                          {reg.refund_pending && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConfirmRefund(reg.id)}
                              className="hover:bg-green-100 dark:hover:bg-green-500/15 rounded-lg h-8 w-8 p-0"
                              title="Confirm Refund"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                            </Button>
                          )}
                          {reg.payment_status === 'completed' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResendReceipt(reg.id)}
                                className="hover:bg-muted rounded-lg h-8 w-8 p-0"
                                title="Resend Receipt"
                              >
                                <Mail className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/registrations/${reg.id}/invoice`, '_blank')}
                                className="hover:bg-muted rounded-lg h-8 w-8 p-0"
                                title="Download Invoice"
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </div>
      </div>

      {/* Registration Detail Modal */}
      {selectedRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-outfit font-bold text-foreground">Registration Details</h2>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRegistration(null)} className="hover:bg-muted rounded-lg">
                ✕
              </Button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-muted-foreground">Registration ID</p>
                    <p className="font-mono font-semibold text-foreground">
                      {selectedRegistration.registration_number || selectedRegistration.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Invoice Number</p>
                    <p className="font-mono font-semibold text-foreground">{selectedRegistration.invoice_number}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-sm text-xs font-medium ${
                    selectedRegistration.payment_status === 'completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400'
                  }`}>
                    {selectedRegistration.payment_status === 'completed' ? 'Paid' : 'Pending'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-semibold text-lg text-foreground tabular-nums">₹{selectedRegistration.total_amount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium text-foreground">{formatServerDate(selectedRegistration.created_at, 'MMM dd, yyyy hh:mm a')}</p>
                  </div>
                </div>

                {selectedRegistration.payment_id && (
                  <div>
                    <p className="text-xs text-muted-foreground">Payment ID</p>
                    <p className="font-mono text-sm text-foreground">{selectedRegistration.payment_id}</p>
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <p className="text-sm font-semibold mb-3 text-foreground">Form Data</p>
                  <div className="space-y-2">
                    {Object.entries(selectedRegistration.form_data || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between py-1 border-b border-border gap-4">
                        <span className="text-sm text-muted-foreground">{getFieldLabel(key)}</span>
                        <div className="text-sm font-medium text-right break-words max-w-[60%] text-foreground">
                          {getFieldType(key) === 'rich_text'
                            ? <RichTextView html={value} className="text-left" />
                            : formatFieldValue(value, key)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedRegistration(null)}>
                Close
              </Button>
              <Button onClick={() => {
                handleEditClick(selectedRegistration);
                setSelectedRegistration(null);
              }}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Registration Modal */}
      {editingRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-lg font-outfit font-bold text-foreground">Edit Registration</h2>
                <p className="text-sm text-muted-foreground">Invoice: {editingRegistration.invoice_number}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditingRegistration(null)} className="hover:bg-muted rounded-lg">
                ✕
              </Button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Warning about payment changes */}
              {editingRegistration.payment_status === 'completed' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 dark:bg-amber-500/10 dark:border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      <p className="font-medium">Payment Already Completed</p>
                      <p className="text-xs mt-1">
                        If you change the amount:
                        <br />• <strong>Increase:</strong> A payment link for the difference will be generated
                        <br />• <strong>Decrease:</strong> Super Admins will be notified for refund
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Registration ID (editable) */}
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <Label className="text-sm font-medium text-foreground">Registration ID</Label>
                <Input
                  value={editRegNumber}
                  onChange={(e) => setEditRegNumber(e.target.value)}
                  placeholder={`${editingRegistration.id.slice(0, 8).toUpperCase()} (auto)`}
                  className="mt-1 font-mono"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Shown to registrants in confirmation emails and invoices. Leave blank to use the
                  auto-generated ID (<span className="font-mono">{editingRegistration.id.slice(0, 8).toUpperCase()}</span>).
                  Must be unique within this campaign.
                </p>
              </div>

              {/* Amount Field */}
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <Label className="text-sm font-medium text-foreground">Total Amount (₹)</Label>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="mt-1 text-lg font-semibold"
                />
                {parseFloat(editAmount) !== editingRegistration.total_amount && (
                  <p className={`text-sm mt-2 ${parseFloat(editAmount) > editingRegistration.total_amount ? 'text-primary' : 'text-amber-600 dark:text-amber-400'}`}>
                    {parseFloat(editAmount) > editingRegistration.total_amount
                      ? `Additional payment of ₹${(parseFloat(editAmount) - editingRegistration.total_amount).toFixed(2)} will be required`
                      : `Refund of ₹${(editingRegistration.total_amount - parseFloat(editAmount)).toFixed(2)} will be required`
                    }
                  </p>
                )}
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <p className="text-sm font-semibold text-foreground">Form Data</p>
                {Object.entries(editFormData).map(([key, value]) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground">{getFieldLabel(key)}</Label>
                    {isEditableValue(value) && getFieldType(key) !== 'rich_text' ? (
                      <Input
                        value={value ?? ''}
                        onChange={(e) => handleEditFormChange(key, e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <div className="mt-1 px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground">
                        {getFieldType(key) === 'rich_text'
                          ? <RichTextView html={value} />
                          : formatFieldValue(value, key)}
                        <span className="text-xs text-muted-foreground ml-2">(read-only)</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingRegistration(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CampaignRegistrations;
