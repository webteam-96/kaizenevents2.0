import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { RichTextView } from '../components/ui/RichTextInput';
import {
  Search, CheckCircle, User, Mail, Phone,
  CreditCard, Loader2, Receipt, UserPlus,
  RefreshCw, Banknote, LogOut, Home,
  Users, DollarSign, Clock, ChevronLeft, Lock, Star
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
// Server-relative upload URLs need API origin prefix (nginx /api strip workaround).
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${API_BASE_URL}${url}` : (url || '');

// custom_amount contribution to the total: empty/non-numeric input counts as 0,
// otherwise the typed value as-is — NOT clamped to min_value/max_value, matching
// the public form (PublicRegistration/PublicLandingPage). Clamping here used to
// silently round e.g. an optional field's deliberate 0 up to the gateway floor.
const safeCustomAmount = (raw) => {
  if (raw === undefined || raw === null || raw === '') return 0;
  const amount = parseFloat(raw);
  return isNaN(amount) ? 0 : amount;
};

// file_upload accept attribute by configured accept_types (default: any file)
const ACCEPT_ATTRS = { audio: 'audio/*', video: 'video/*', audio_video: 'audio/*,video/*' };

const KioskMode = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Selected Registration
  const [selectedResult, setSelectedResult] = useState(null);

  // New Registration State
  const [showNewRegistration, setShowNewRegistration] = useState(false);
  const [newRegFormData, setNewRegFormData] = useState({});
  const [submittingNewReg, setSubmittingNewReg] = useState(false);

  // OTP Verification State
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendingOtp, setResendingOtp] = useState(false);

  // Payment Confirmation State
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Success State
  const [showSuccess, setShowSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const searchInputRef = useRef(null);

  useEffect(() => {
    fetchCampaignInfo();
    fetchStats();

    // Auto-refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  // Live search with debounce
  useEffect(() => {
    // Clear results if search query is empty
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    // Only search if query has at least 1 character
    if (searchQuery.trim().length < 1) {
      return;
    }

    // Debounce the search
    const debounceTimer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await api.post('/kiosk/search', {
          query: searchQuery.trim(),
          campaign_id: campaignId
        });
        setSearchResults(response.data);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, campaignId]);

  const fetchCampaignInfo = async () => {
    try {
      const response = await api.get(`/kiosk/campaigns/${campaignId}/info`);
      setCampaign(response.data);
    } catch (error) {
      toast.error('Failed to load campaign info');
      if (error.response?.status === 403) {
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get(`/kiosk/campaigns/${campaignId}/stats`);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSelectedResult(null);

    try {
      const response = await api.post('/kiosk/search', {
        query: searchQuery.trim(),
        campaign_id: campaignId
      });
      setSearchResults(response.data);

      if (response.data.length === 0) {
        toast.info('No results found');
      }
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (result) => {
    setSelectedResult(result);
    setAmountReceived(result.amount_due.toString());
    setShowNewRegistration(false);
    setPaymentMethod('cash');
    setPaymentNotes('');
    // Reset OTP state when selecting a new result
    setEnteredOtp('');
    setOtpVerified(false);
    setOtpError('');
  };

  // Verify OTP entered by volunteer
  const verifyOtp = async () => {
    if (!enteredOtp.trim()) {
      setOtpError('Please enter the OTP');
      return;
    }

    // First, try direct comparison with the OTP we have from search results
    if (selectedResult.otp && enteredOtp.trim().toUpperCase() === selectedResult.otp.toUpperCase()) {
      setOtpVerified(true);
      setOtpError('');
      toast.success('OTP verified successfully!');
      return;
    }

    // If direct comparison fails, try backend verification
    try {
      const response = await api.post('/verify-otp', {
        registration_id: selectedResult.registration_id,
        otp: enteredOtp.trim()
      });

      if (response.data.valid) {
        setOtpVerified(true);
        setOtpError('');
        toast.success('OTP verified successfully!');
      } else {
        setOtpError('The OTP entered is incorrect. Please try again.');
        toast.error('Invalid OTP');
      }
    } catch (error) {
      // If we have the OTP locally, compare again as fallback
      if (selectedResult.otp) {
        if (enteredOtp.trim().toUpperCase() === selectedResult.otp.toUpperCase()) {
          setOtpVerified(true);
          setOtpError('');
          toast.success('OTP verified successfully!');
        } else {
          setOtpError('The OTP entered is incorrect. Please try again.');
          toast.error('Invalid OTP');
        }
      } else {
        setOtpError('The OTP entered is incorrect. Please try again.');
        toast.error('Invalid OTP');
      }
    }
  };

  // Resend OTP to registrant
  const resendOtp = async () => {
    if (!selectedResult?.registration_id) return;

    setResendingOtp(true);
    try {
      await api.get(`/registrations/${selectedResult.registration_id}/resend-otp`);
      toast.success('OTP has been resent to the registrant\'s email');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resend OTP');
    } finally {
      setResendingOtp(false);
    }
  };

  // Calculate total based on form data and form fields
  const calculateTotal = () => {
    let total = parseFloat(campaign?.base_price) || 0;
    const fields = campaign?.form_fields || [];

    fields.forEach((field) => {
      // custom_amount adds the registrant-entered value (clamped to min/max),
      // mirroring how option modifiers are summed here.
      if (field.type === 'custom_amount') {
        total += safeCustomAmount(newRegFormData[field.id]);
        return;
      }
      if (field.options && newRegFormData[field.id]) {
        const selectedValues = Array.isArray(newRegFormData[field.id])
          ? newRegFormData[field.id]
          : [newRegFormData[field.id]];

        field.options.forEach((option) => {
          if (selectedValues.includes(option.value)) {
            total += parseFloat(option.price_modifier) || 0;
          }
        });
      }
    });

    return total;
  };

  const startNewRegistration = () => {
    setSelectedResult({ is_new: true, amount_due: campaign?.base_price || 0, name: '', email: '', phone: '' });
    setNewRegFormData({});
    setShowNewRegistration(true);
  };

  const handleFormChange = (fieldId, value) => {
    setNewRegFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const createNewRegistration = async () => {
    // Validate required fields
    const fields = campaign?.form_fields || [];
    for (const field of fields) {
      if (field.required) {
        if (field.type === 'name') {
          const firstName = newRegFormData[`${field.id}_first`];
          if (!firstName?.trim()) {
            toast.error(`Please fill in ${field.label}`);
            return;
          }
        } else if (!newRegFormData[field.id]) {
          toast.error(`Please fill in ${field.label}`);
          return;
        } else if ((field.type === 'custom_amount' || field.type === 'currency') &&
                   isNaN(parseFloat(newRegFormData[field.id]))) {
          // Money fields must be numeric, not just non-empty
          toast.error(`Please enter a valid amount for ${field.label}`);
          return;
        }
      } else if (field.type === 'custom_amount' || field.type === 'currency') {
        // Even when optional, a money field that has a value must be numeric —
        // gives an inline hint instead of a submit-time 400.
        const v = newRegFormData[field.id];
        if (v !== undefined && v !== null && v !== '' && isNaN(parseFloat(v))) {
          toast.error(`Please enter a valid amount for ${field.label}`);
          return;
        }
      }
    }

    // If no form fields, validate basic fields
    if (fields.length === 0 && !newRegFormData.name?.trim()) {
      toast.error('Please enter a name');
      return;
    }

    setSubmittingNewReg(true);

    try {
      const totalAmount = calculateTotal();
      const response = await api.post('/kiosk/register', {
        campaign_id: campaignId,
        form_data: newRegFormData,
        total_amount: totalAmount,
        member_id: selectedResult?.member_id || null
      });

      toast.success('Registration created!');

      // Update selected result with new registration ID + the backend-resolved
      // name/email/phone (form fields are keyed by id, so the frontend can't
      // easily extract them from newRegFormData on its own).
      setSelectedResult({
        ...selectedResult,
        registration_id: response.data.registration_id,
        is_new: false,
        status: 'pending',
        amount_due: totalAmount,
        name:  response.data.registrant_name  || selectedResult?.name  || '',
        email: response.data.registrant_email || selectedResult?.email || '',
        phone: response.data.registrant_phone || selectedResult?.phone || ''
      });
      setAmountReceived(totalAmount.toString());
      setShowNewRegistration(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create registration');
    } finally {
      setSubmittingNewReg(false);
    }
  };

  const confirmPayment = async () => {
    if (!selectedResult?.registration_id) {
      toast.error('No registration selected');
      return;
    }

    const amount = parseFloat(amountReceived);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setConfirmingPayment(true);

    try {
      const response = await api.post('/kiosk/confirm-payment', {
        registration_id: selectedResult.registration_id,
        amount_received: amount,
        payment_method: paymentMethod,
        notes: paymentNotes || null
      });

      setReceiptData(response.data);
      setShowSuccess(true);
      fetchStats();

      toast.success('Payment confirmed!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm payment');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const resetKiosk = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedResult(null);
    setShowNewRegistration(false);
    setNewRegFormData({});
    setAmountReceived('');
    setPaymentMethod('cash');
    setPaymentNotes('');
    setShowSuccess(false);
    setReceiptData(null);
    searchInputRef.current?.focus();
  };

  // Render form field based on type
  const renderFormField = (field) => {
    if (field.type === 'section_header') {
      return (
        <div key={field.id} className="col-span-2 mt-4 mb-2">
          <h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
          {field.help_text && <p className="text-sm text-muted-foreground">{field.help_text}</p>}
        </div>
      );
    }

    if (field.type === 'name') {
      const nameConfig = field.name_config || {};
      return (
        <div key={field.id} className="col-span-2">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {nameConfig.show_first_name !== false && (
              <Input
                type="text"
                value={newRegFormData[`${field.id}_first`] || ''}
                onChange={(e) => handleFormChange(`${field.id}_first`, e.target.value)}
                placeholder="First Name"
                required={field.required}
                className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            {nameConfig.show_last_name !== false && (
              <Input
                type="text"
                value={newRegFormData[`${field.id}_last`] || ''}
                onChange={(e) => handleFormChange(`${field.id}_last`, e.target.value)}
                placeholder="Last Name"
                className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </div>
        </div>
      );
    }

    if (field.type === 'dropdown') {
      return (
        <div key={field.id} className="col-span-2 sm:col-span-1">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <SearchableSelect
            id={field.id}
            value={newRegFormData[field.id] || ''}
            onChange={(v) => handleFormChange(field.id, v)}
            options={(field.options || []).map((opt) => ({ value: opt.value, label: opt.label }))}
            required={field.required}
            theme="dark"
            className="w-full h-12 bg-muted border border-border text-foreground rounded-xl pl-3 pr-10 flex items-center focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.id} className="col-span-2">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <textarea
            value={newRegFormData[field.id] || ''}
            onChange={(e) => handleFormChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            rows={3}
            className="w-full bg-muted border border-border text-foreground rounded-xl px-3 py-2 placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
      );
    }

    if (field.type === 'rich_text') {
      return (
        <div key={field.id} className="col-span-2">
          {field.label && (
            <Label className="text-muted-foreground mb-2 block">
              {field.label}
            </Label>
          )}
          <div className="rounded-lg bg-white/95 px-3 py-2 text-slate-800">
            <RichTextView
              html={field.content || ''}
              bgColor={field.content_bg_color}
              borderColor={field.content_border_color}
            />
          </div>
        </div>
      );
    }

    if (field.type === 'checkbox' && field.options) {
      return (
        <div key={field.id} className="col-span-2">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {field.options?.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 p-3 bg-muted rounded-xl cursor-pointer hover:bg-accent-subtle transition-colors">
                <input
                  type="checkbox"
                  checked={(newRegFormData[field.id] || []).includes(opt.value)}
                  onChange={(e) => {
                    const current = newRegFormData[field.id] || [];
                    const newValue = e.target.checked
                      ? [...current, opt.value]
                      : current.filter(v => v !== opt.value);
                    handleFormChange(field.id, newValue);
                  }}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-primary bg-muted"
                />
                <span className="text-foreground text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === 'radio') {
      return (
        <div key={field.id} className="col-span-2">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {field.options?.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 p-3 bg-muted rounded-xl cursor-pointer hover:bg-accent-subtle transition-colors">
                <input
                  type="radio"
                  name={field.id}
                  value={opt.value}
                  checked={newRegFormData[field.id] === opt.value}
                  onChange={(e) => handleFormChange(field.id, e.target.value)}
                  required={field.required}
                  className="w-5 h-5 border-border text-primary focus:ring-primary bg-muted"
                />
                <span className="text-foreground text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    // Single checkbox (no options) — also handles terms_checkbox
    if ((field.type === 'checkbox' && !field.options) || field.type === 'terms_checkbox') {
      return (
        <div key={field.id} className="col-span-2">
          <label htmlFor={field.id} className="flex items-start gap-3 p-3 bg-muted rounded-xl cursor-pointer hover:bg-accent-subtle transition-colors">
            <input
              id={field.id}
              type="checkbox"
              checked={newRegFormData[field.id] || false}
              onChange={(e) => handleFormChange(field.id, e.target.checked)}
              required={field.required}
              style={{ accentColor: '#091D40', width: 20, height: 20, appearance: 'auto', marginTop: 2 }}
            />
            <span className="text-foreground text-sm">
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </span>
          </label>
        </div>
      );
    }

    // File upload — full width, matches the terms checkbox layout
    if (field.type === 'file_upload') {
      const selectedFile = newRegFormData[field.id];
      const fileName = selectedFile instanceof File ? selectedFile.name : null;
      return (
        <div key={field.id} className="col-span-2">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="flex items-center gap-3 p-2 bg-muted border border-border rounded-xl w-full">
            <label
              htmlFor={`kiosk-file-${field.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg cursor-pointer hover:bg-primary-hover text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {fileName ? 'Change' : 'Choose file'}
            </label>
            <input
              id={`kiosk-file-${field.id}`}
              type="file"
              accept={ACCEPT_ATTRS[field.accept_types]}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                // Same client-side cap as the public form: 25MB for audio/video
                // fields, 5MB otherwise; max_file_size_mb may lower but not raise.
                const capMb = ['audio', 'video', 'audio_video'].includes(field.accept_types) ? 25 : 5;
                const maxMb = Math.min(field.max_file_size_mb || capMb, capMb);
                if (file.size > maxMb * 1024 * 1024) {
                  toast.error(`"${file.name}" is too large. Maximum file size is ${maxMb} MB.`);
                  e.target.value = '';
                  return;
                }
                handleFormChange(field.id, file);
              }}
              required={field.required && !fileName}
              className="hidden"
            />
            <span className="text-sm text-muted-foreground truncate flex-1 min-w-0">
              {fileName || 'No file chosen'}
            </span>
          </div>
        </div>
      );
    }

    // Phone / tel — digits only, no length restriction here (platform-wide PhoneInput handles country codes elsewhere)
    if (field.type === 'phone' || field.type === 'tel') {
      return (
        <div key={field.id} className="col-span-2 sm:col-span-1">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={newRegFormData[field.id] || ''}
            onChange={(e) => handleFormChange(field.id, e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={field.placeholder || 'Enter phone number'}
            required={field.required}
            className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      );
    }

    // Money inputs — custom_amount feeds the running total (see calculateTotal);
    // currency is plain data and never auto-added to the price.
    if (field.type === 'custom_amount' || field.type === 'currency') {
      return (
        <div key={field.id} className="col-span-2 sm:col-span-1">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">₹</span>
            <Input
              type="text"
              inputMode="decimal"
              value={newRegFormData[field.id] || ''}
              onChange={(e) => handleFormChange(field.id, e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
              placeholder={field.placeholder || '0.00'}
              required={field.required}
              className="h-12 pl-8 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      );
    }

    if (field.type === 'rating') {
      const maxRating = parseInt(field.max_rating, 10) || 5;
      const selectedRating = parseInt(newRegFormData[field.id], 10) || 0;
      return (
        <div key={field.id} className="col-span-2">
          <Label className="text-muted-foreground mb-2 block">
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <div className="flex items-center gap-1">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleFormChange(field.id, value)}
                aria-label={`Rate ${value} out of ${maxRating}`}
                className="p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Star className={`w-8 h-8 transition-colors ${value <= selectedRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Default input field (text, email, number, date)
    return (
      <div key={field.id} className="col-span-2 sm:col-span-1">
        <Label className="text-muted-foreground mb-2 block">
          {field.label} {field.required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          type={field.type}
          value={newRegFormData[field.id] || ''}
          onChange={(e) => handleFormChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  // Success Screen
  if (showSuccess && receiptData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-6">
        <Card className="ke-card rounded-3xl p-10 max-w-lg w-full text-center">
          <span className="ke-medallion mx-auto mb-6" style={{ width: '6rem', height: '6rem', borderRadius: '9999px', background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.18), transparent 85%)' }}>
            <CheckCircle className="w-14 h-14" style={{ color: 'hsl(152 58% 40%)' }} />
          </span>

          <h1 className="text-3xl font-outfit font-bold text-foreground mb-2">
            Payment Confirmed!
          </h1>

          <p className="text-xl text-muted-foreground font-jakarta mb-6">
            {receiptData.registrant_name}
          </p>

          <div className="bg-muted rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
              <Receipt className="w-5 h-5" />
              <span className="font-jakarta">Receipt Number</span>
            </div>
            <p className="text-2xl font-mono font-bold text-primary">{receiptData.receipt_number}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-2xl font-bold text-green-600">₹{receiptData.amount_received}</p>
            </div>
            <div className="bg-primary-subtle rounded-xl p-4">
              <p className="text-sm text-muted-foreground">Method</p>
              <p className="text-2xl font-bold text-primary capitalize">{receiptData.payment_method}</p>
            </div>
          </div>

          <Button
            onClick={resetKiosk}
            className="w-full h-16 text-xl bg-primary hover:bg-primary-hover rounded-xl"
          >
            <UserPlus className="w-6 h-6 mr-3" />
            Next Registration
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {campaign?.logo_url && (
                <img src={toAbsUrl(campaign.logo_url)} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/15 shadow-sm" />
              )}
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">On-site Check-in</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1 text-white">{campaign?.name}</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">{campaign?.organization_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate('/dashboard')}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta"
              >
                <Home className="w-5 h-5 mr-1.5" />
                Dashboard
              </Button>
              <Button
                onClick={logout}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta"
              >
                <LogOut className="w-5 h-5 mr-1.5" />
                Sign out
              </Button>
            </div>
          </div>
        </div>

        {/* Live stat cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(152 58% 40%), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Paid Check-ins</div>
                  <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{stats.completed_payments}</div>
                  <div className="text-[11px] mt-1.5 font-jakarta text-muted-foreground">Completed payments</div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.16), transparent 85%)' }}>
                  <Users className="w-5 h-5" style={{ color: 'hsl(152 58% 40%)' }} />
                </span>
              </div>
            </div>
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(38 92% 48%), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Pending</div>
                  <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{stats.pending_payment}</div>
                  <div className="text-[11px] mt-1.5 font-jakarta text-muted-foreground">Awaiting payment</div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(38 92% 48% / 0.16), transparent 85%)' }}>
                  <Clock className="w-5 h-5" style={{ color: 'hsl(38 92% 48%)' }} />
                </span>
              </div>
            </div>
            <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Kiosk Revenue</div>
                  <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">₹{stats.kiosk_revenue?.toLocaleString()}</div>
                  <div className="text-[11px] mt-1.5 font-jakarta text-muted-foreground">Collected on-site</div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                  <DollarSign className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Search */}
          <div className="space-y-6">
            {/* Search Box */}
            <Card className="ke-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                  <Search className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                </span>
                <div>
                  <h3 className="ke-section-title text-[15px]">Find Registrant</h3>
                  <div className="ke-rule-gold mt-2" />
                </div>
              </div>

              <div className="relative">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Start typing name, email, or phone..."
                      className="h-14 text-lg bg-muted border-border text-foreground placeholder:text-muted-foreground rounded-xl pr-12 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      autoFocus
                    />
                    {searching && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="h-14 px-6 bg-primary hover:bg-primary-hover rounded-xl"
                  >
                    <Search className="w-5 h-5" />
                  </Button>
                </div>

                {/* Live Search Results Dropdown */}
                {searchQuery.trim() && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 max-h-[350px] overflow-y-auto">
                    <div className="p-2 border-b border-border">
                      <span className="text-xs text-muted-foreground font-medium">
                        {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''} found
                      </span>
                    </div>
                    {searchResults.map((result) => (
                      <div
                        key={result.registration_id || result.member_id}
                        onClick={() => {
                          selectResult(result);
                          setSearchQuery(''); // Clear search after selection
                        }}
                        className={`p-4 cursor-pointer transition-colors hover:bg-accent-subtle border-b border-border last:border-b-0 ${
                          selectedResult?.registration_id === result.registration_id ||
                          selectedResult?.member_id === result.member_id
                            ? 'bg-primary-subtle'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-foreground font-semibold">{result.name}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {result.email && <span>{result.email}</span>}
                              {result.phone && <span>• {result.phone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-sm text-xs font-semibold ${
                              result.status === 'completed'
                                ? 'bg-green-500/20 text-green-400'
                                : result.is_new
                                ? 'bg-primary-subtle text-primary'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {result.status === 'completed' ? 'Paid' : result.is_new ? 'New' : 'Pending'}
                            </span>
                            {result.amount_due > 0 && result.status !== 'completed' && (
                              <span className="text-primary font-bold">₹{result.amount_due}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No Results Message */}
                {searchQuery.trim() && !searching && searchResults.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 p-6 text-center">
                    <p className="text-muted-foreground">No registrants found matching &quot;{searchQuery}&quot;</p>
                    <Button
                      onClick={startNewRegistration}
                      className="mt-4 bg-primary hover:bg-primary-hover"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create New Registration
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Selected Result Card - Shows after clicking a result from dropdown */}
            {selectedResult && !showNewRegistration && !searchQuery.trim() && (
              <Card className="ke-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-foreground font-semibold text-lg">{selectedResult.name}</p>
                    <p className="text-muted-foreground text-sm">{selectedResult.email}</p>
                    {selectedResult.phone && <p className="text-muted-foreground text-sm">{selectedResult.phone}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-3 py-1 rounded-sm text-xs font-semibold ${
                      selectedResult.status === 'completed'
                        ? 'bg-green-500/20 text-green-400'
                        : selectedResult.is_new
                        ? 'bg-primary-subtle text-primary'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {selectedResult.status === 'completed' ? 'Paid' : selectedResult.is_new ? 'New' : 'Pending'}
                    </span>
                    {selectedResult.amount_due > 0 && selectedResult.status !== 'completed' && (
                      <p className="text-primary font-bold text-xl mt-2">₹{selectedResult.amount_due}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* New Walk-in Registration Button */}
            <Button
              onClick={startNewRegistration}
              className="w-full h-14 bg-secondary hover:bg-secondary/90 text-white rounded-xl text-lg"
            >
              <UserPlus className="w-6 h-6 mr-3" />
              New Walk-in Registration
            </Button>
          </div>

          {/* Right Panel - Details & Actions */}
          <div className="space-y-6">
            {selectedResult ? (
              showNewRegistration ? (
                /* New Registration Form */
                <Card className="ke-card p-5 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--secondary) / 0.16), transparent 85%)' }}>
                        <UserPlus className="w-5 h-5" style={{ color: 'hsl(var(--secondary))' }} />
                      </span>
                      <div>
                        <h3 className="ke-section-title text-[15px]">New Registration</h3>
                        <div className="ke-rule-gold mt-2" />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowNewRegistration(false);
                        setSelectedResult(null);
                      }}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <ChevronLeft className="w-5 h-5 mr-1" />
                      Back
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {campaign?.form_fields && campaign.form_fields.length > 0 ? (
                      campaign.form_fields.map((field) => renderFormField(field))
                    ) : (
                      /* Default basic fields if no form configured */
                      <>
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-muted-foreground mb-2 block">Name <span className="text-destructive">*</span></Label>
                          <Input
                            value={newRegFormData.name || ''}
                            onChange={(e) => handleFormChange('name', e.target.value)}
                            placeholder="Full Name"
                            className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-muted-foreground mb-2 block">Email</Label>
                          <Input
                            type="email"
                            value={newRegFormData.email || ''}
                            onChange={(e) => handleFormChange('email', e.target.value)}
                            placeholder="email@example.com"
                            className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-muted-foreground mb-2 block">Phone</Label>
                          <Input
                            type="tel"
                            value={newRegFormData.phone || ''}
                            onChange={(e) => handleFormChange('phone', e.target.value)}
                            placeholder="Mobile Number"
                            className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Price Summary */}
                  {(campaign?.base_price > 0 || calculateTotal() > 0) && (
                    <div className="mt-6 pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-lg text-muted-foreground">Total Amount</span>
                        <span className="text-3xl font-bold text-primary">₹{calculateTotal()}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowNewRegistration(false);
                        setSelectedResult(null);
                      }}
                      className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={createNewRegistration}
                      disabled={submittingNewReg}
                      className="flex-1 h-12 bg-secondary hover:bg-secondary/90 rounded-xl"
                    >
                      {submittingNewReg ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Create & Continue
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              ) : (
                /* Registration Details & Payment */
                <Card className="ke-card p-5">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}>
                      <User className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
                    </span>
                    <div>
                      <h3 className="ke-section-title text-[15px]">Registration Details</h3>
                      <div className="ke-rule-gold mt-2" />
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-center gap-3 p-4 bg-muted rounded-xl">
                      <User className="w-6 h-6 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-lg font-semibold text-foreground">{selectedResult.name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted rounded-xl">
                      <Mail className="w-6 h-6 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-foreground">{selectedResult.email || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted rounded-xl">
                      <Phone className="w-6 h-6 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="text-foreground">{selectedResult.phone || 'N/A'}</p>
                      </div>
                    </div>

                    {selectedResult.status !== 'completed' && (
                      <div className="flex items-center gap-3 p-4 bg-primary-subtle border border-primary/30 rounded-xl">
                        <CreditCard className="w-6 h-6 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Amount Due</p>
                          <p className="text-3xl font-bold text-primary">₹{selectedResult.amount_due}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedResult.status === 'completed' ? (
                    <div className="text-center py-6">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                      <p className="text-xl font-semibold text-green-400">Payment Already Received</p>
                      <p className="text-muted-foreground mt-2">This registration has been completed.</p>
                    </div>
                  ) : (
                    <>
                      {/* Step 1: OTP Verification (only for offline registrations with OTP) */}
                      {!selectedResult.is_new && selectedResult.otp && !otpVerified && (
                        <div className="space-y-4 pt-6 border-t border-border">
                          <h3 className="ke-section-title text-[15px] flex items-center gap-2">
                            <Lock className="w-5 h-5 text-amber-400" />
                            Step 1: Verify Registration OTP
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Ask the registrant for their OTP received via email
                          </p>

                          <div>
                            <Label className="text-muted-foreground mb-2 block">Enter OTP</Label>
                            <Input
                              type="text"
                              value={enteredOtp}
                              onChange={(e) => {
                                setEnteredOtp(e.target.value.toUpperCase());
                                setOtpError('');
                              }}
                              placeholder="Enter 6-character OTP"
                              className="h-14 text-2xl font-mono font-bold tracking-widest bg-muted border-border text-foreground rounded-xl text-center uppercase focus-visible:ring-2 focus-visible:ring-ring"
                              maxLength={6}
                            />
                            {otpError && (
                              <p className="text-destructive text-sm mt-2">{otpError}</p>
                            )}
                          </div>

                          <div className="flex gap-3">
                            <Button
                              onClick={verifyOtp}
                              disabled={!enteredOtp.trim()}
                              className="flex-1 h-12 bg-amber-600 hover:bg-amber-700 text-white rounded-xl"
                            >
                              <Lock className="w-5 h-5 mr-2" />
                              Verify OTP
                            </Button>
                            <Button
                              onClick={resendOtp}
                              disabled={resendingOtp}
                              variant="outline"
                              className="h-12 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl"
                            >
                              {resendingOtp ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Resend OTP
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Payment Confirmation (after OTP verified, for new registrations, or for registrations without OTP) */}
                      {(otpVerified || selectedResult.is_new || !selectedResult.otp) && (
                        <div className="space-y-4 pt-6 border-t border-border">
                          {!selectedResult.is_new && selectedResult.otp && (
                            <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-600/30 rounded-xl mb-4">
                              <CheckCircle className="w-5 h-5 text-green-400" />
                              <span className="text-green-400 font-medium">OTP Verified</span>
                            </div>
                          )}

                          <h3 className="ke-section-title text-[15px] flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-green-400" />
                            {selectedResult.is_new ? 'Collect Payment' : 'Mark Payment as Received'}
                          </h3>

                          <div>
                            <Label className="text-muted-foreground mb-2 block">Amount Received (₹)</Label>
                            <Input
                              type="number"
                              value={amountReceived}
                              onChange={(e) => setAmountReceived(e.target.value)}
                              className="h-14 text-2xl font-bold bg-muted border-border text-foreground rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
                            />
                          </div>

                          <div>
                            <Label className="text-muted-foreground mb-2 block">Payment Method</Label>
                            <div className="grid grid-cols-3 gap-3">
                              {['cash', 'card', 'upi'].map((method) => (
                                <button
                                  key={method}
                                  onClick={() => setPaymentMethod(method)}
                                  className={`p-4 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    paymentMethod === method
                                      ? 'border-primary bg-primary-subtle text-primary'
                                      : 'border-border text-muted-foreground hover:border-primary'
                                  }`}
                                >
                                  <Banknote className="w-6 h-6 mx-auto mb-1" />
                                  <span className="text-sm capitalize">{method}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label className="text-muted-foreground mb-2 block">Notes (Optional)</Label>
                            <Input
                              value={paymentNotes}
                              onChange={(e) => setPaymentNotes(e.target.value)}
                              placeholder="Any additional notes..."
                              className="h-12 bg-muted border-border text-foreground rounded-xl placeholder:text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                            />
                          </div>

                          <Button
                            onClick={confirmPayment}
                            disabled={confirmingPayment || !amountReceived}
                            className="w-full h-16 bg-green-600 hover:bg-green-700 text-white text-xl rounded-xl"
                          >
                            {confirmingPayment ? (
                              <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-6 h-6 mr-3" />
                                Confirm Payment Received
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              )
            ) : (
              /* Empty State */
              <Card className="ke-card p-12 text-center">
                <span className="ke-medallion mx-auto mb-6" style={{ width: '6rem', height: '6rem', borderRadius: '9999px', background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                  <Search className="w-10 h-10" style={{ color: 'hsl(var(--accent))' }} />
                </span>
                <h3 className="text-xl font-semibold text-foreground mb-2">Search for a Registrant</h3>
                <p className="text-muted-foreground">
                  Enter a name, email, or phone number to find existing registrations,
                  or click &quot;New Walk-in Registration&quot; for first-time attendees.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KioskMode;
