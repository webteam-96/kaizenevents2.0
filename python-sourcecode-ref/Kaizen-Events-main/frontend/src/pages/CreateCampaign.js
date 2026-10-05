import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import ImageUploader from '../components/ui/ImageUploader';
import { ArrowLeft, CreditCard, Plus, Users, Globe, Info, DollarSign, Banknote, AlertCircle, RotateCcw, FileText, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

const CreateCampaign = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState(false);
  const DRAFT_KEY = 'create_campaign_draft';

  const defaultFormData = {
    name: '',
    slug: '',
    organization_name: '',
    description: '',
    logo_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
    campaign_type: 'open',
    payment_enabled: true,
    fund_collection_mode: '',
    payment_collection_method: 'online',
    kiosk_enabled: false,
    show_on_homepage: true,
    payment_gateway: 'razorpay',
    payment_account_id: '',
    payment_purpose: '',
    status: 'draft',
    max_registrations: '',
    registration_start_date: '',
    registration_end_date: '',
  };

  const [formData, setFormData] = useState(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      return saved ? { ...defaultFormData, ...JSON.parse(saved) } : defaultFormData;
    } catch {
      return defaultFormData;
    }
  });

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard');
      return;
    }
    fetchPaymentAccounts();
  }, [isSuperAdmin, navigate]);

  const fetchPaymentAccounts = async () => {
    setAccountsLoading(true);
    setAccountsError(false);
    try {
      const response = await api.get('/payment-accounts/list');
      setPaymentAccounts(response.data);
    } catch (error) {
      console.error('Failed to load payment accounts:', error);
      setAccountsError(true);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };

      // Auto-generate slug from name
      if (field === 'name') {
        const slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        newData.slug = slug;
      }

      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(newData));
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Fund collection mode is required for paid events only (free events collect no money).
    if (formData.payment_enabled && !formData.fund_collection_mode) {
      toast.error('Please select a fund collection mode (Kaizen Managed or Direct to Organizer).');
      return;
    }

    setLoading(true);

    try {
      // Get gateway type from selected account
      const selectedAccount = paymentAccounts.find(acc => acc.id === formData.payment_account_id);

      // Free events carry no payment wiring — send everything payment-related as null/default.
      const isFree = !formData.payment_enabled;

      const payload = {
        ...formData,
        campaign_type: formData.campaign_type,
        payment_enabled: formData.payment_enabled,
        fund_collection_mode: isFree ? null : formData.fund_collection_mode,
        payment_collection_method: isFree ? 'online' : formData.payment_collection_method,
        max_registrations: formData.max_registrations ? parseInt(formData.max_registrations) : null,
        payment_purpose: isFree ? null : (formData.payment_purpose || null),
        payment_gateway: selectedAccount?.gateway_type || formData.payment_gateway,
        payment_account_id: (isFree || formData.payment_collection_method === 'offline')
          ? null
          : (formData.payment_account_id || null),
        // datetime-local values are local wall clock; store UTC on the backend
        registration_start_date: formData.registration_start_date
          ? new Date(formData.registration_start_date).toISOString()
          : null,
        registration_end_date: formData.registration_end_date
          ? new Date(formData.registration_end_date).toISOString()
          : null,
      };

      const response = await api.post('/campaigns', payload);
      sessionStorage.removeItem(DRAFT_KEY);
      toast.success('Event created successfully!');
      navigate(`/campaigns/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  // Gradient medallion background for section icons (soft gold → transparent).
  const medallionBg = 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)';

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              type="button"
              onClick={() => navigate('/campaigns')}
              data-testid="back-button"
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta font-medium text-white/70 hover:text-white transition-colors mb-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Events
            </button>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">New Event</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Create Event</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Set up a new event registration — details, pricing and payout in one place.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => navigate('/campaigns')}
                  data-testid="cancel-button"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="create-campaign-form"
                  disabled={loading}
                  data-testid="submit-button"
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105 disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  {loading ? 'Creating...' : 'Create Event'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form id="create-campaign-form" onSubmit={handleSubmit} className="space-y-5">
          {/* Section: Event details */}
          <div className="ke-card p-5">
            <div className="flex items-center gap-3">
              <span className="ke-medallion shrink-0" style={{ background: medallionBg }}>
                <FileText className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <div>
                <h3 className="ke-section-title text-[15px]">Event Details</h3>
                <p className="text-sm font-jakarta text-muted-foreground mt-0.5">Basic information shown to your registrants.</p>
              </div>
            </div>
            <div className="ke-rule-gold mt-3 mb-5" />

            <div className="space-y-6">
              {/* Campaign Name */}
              <div>
                <Label htmlFor="name" className="text-foreground font-jakarta font-medium mb-2 block">
                  Event Name *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Annual Rotary Conference 2025"
                  required
                  data-testid="campaign-name-input"
                  className="h-11 rounded-lg border-border focus-visible:ring-ring transition-all duration-200"
                />
              </div>

              {/* Campaign Slug */}
              <div>
                <Label htmlFor="slug" className="text-foreground font-jakarta font-medium mb-2 block">
                  Event URL Slug *
                </Label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground font-jakarta whitespace-nowrap">kaizenevents.live/</span>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => handleChange('slug', e.target.value)}
                    placeholder="annual-rotary-conference-2025"
                    required
                    data-testid="campaign-slug-input"
                    className="h-11 rounded-lg border-border focus-visible:ring-ring transition-all duration-200"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-jakarta mt-1">
                  This will be used in the public registration URL
                </p>
              </div>

              {/* Organization Name */}
              <div>
                <Label htmlFor="organization_name" className="text-foreground font-jakarta font-medium mb-2 block">
                  Organization Name *
                </Label>
                <Input
                  id="organization_name"
                  value={formData.organization_name}
                  onChange={(e) => handleChange('organization_name', e.target.value)}
                  placeholder="e.g., Rotary Club of Mumbai"
                  required
                  data-testid="organization-name-input"
                  className="h-11 rounded-lg border-border focus-visible:ring-ring transition-all duration-200"
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description" className="text-foreground font-jakarta font-medium mb-2 block">
                  Description
                </Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Brief description of the event..."
                  rows={4}
                  data-testid="campaign-description-input"
                  className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200"
                />
              </div>

              {/* Campaign Logo */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Event Logo / Placeholder Image
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  This image will be displayed on the public events page and registration form. Recommended: 400×400px or 800×600px.
                </p>
                <ImageUploader
                  value={formData.logo_url}
                  onChange={(url) => handleChange('logo_url', url)}
                  label="campaign-logo"
                  aspectRatio="auto"
                  maxWidth={800}
                  maxHeight={600}
                  maxSizeKB={150}
                />
              </div>
            </div>
          </div>

          {/* Section: Registration type */}
          <div className="ke-card p-5">
            <div className="flex items-center gap-3">
              <span className="ke-medallion shrink-0" style={{ background: medallionBg }}>
                <CreditCard className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <div>
                <h3 className="ke-section-title text-[15px]">Registration &amp; Pricing</h3>
                <p className="text-sm font-jakarta text-muted-foreground mt-0.5">Decide who can register and how funds are collected.</p>
              </div>
            </div>
            <div className="ke-rule-gold mt-3 mb-5" />

            <div className="space-y-6">
              {/* Campaign Type */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Event Type *
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => handleChange('campaign_type', 'open')}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.campaign_type === 'open'
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${formData.campaign_type === 'open' ? 'bg-primary-subtle' : 'bg-muted'}`}>
                        <Globe className={`w-5 h-5 ${formData.campaign_type === 'open' ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.campaign_type === 'open' ? 'text-primary' : 'text-foreground'}`}>
                        Open Registration
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Anyone can register for this event. Standard public registration form.
                    </p>
                  </div>

                  <div
                    onClick={() => handleChange('campaign_type', 'closed_group')}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.campaign_type === 'closed_group'
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${formData.campaign_type === 'closed_group' ? 'bg-primary-subtle' : 'bg-muted'}`}>
                        <Users className={`w-5 h-5 ${formData.campaign_type === 'closed_group' ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.campaign_type === 'closed_group' ? 'text-primary' : 'text-foreground'}`}>
                        Closed Group
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Only pre-uploaded members can register. Upload member list after creation.
                    </p>
                  </div>
                </div>

                {formData.campaign_type === 'closed_group' && (
                  <div className="mt-3 p-3 bg-primary-subtle border border-primary/20 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-primary">
                      After creating the event, you&apos;ll be able to upload your member list (CSV/Excel)
                      with names, mobile numbers, and any custom fields.
                    </p>
                  </div>
                )}
              </div>

              {/* Paid vs Free Event */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Event Pricing *
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => handleChange('payment_enabled', true)}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.payment_enabled
                        ? 'border-primary bg-primary-subtle shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.payment_enabled ? 'bg-primary-subtle' : 'bg-muted'}`}>
                        <CreditCard className={`w-5 h-5 ${formData.payment_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.payment_enabled ? 'text-primary' : 'text-foreground'}`}>
                        Paid Event
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Collect a fee from registrants. Configure payment collection, fund mode and account below.
                    </p>
                  </div>
                  <div
                    onClick={() => handleChange('payment_enabled', false)}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      !formData.payment_enabled
                        ? 'border-green-500 bg-green-500/10 shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${!formData.payment_enabled ? 'bg-green-500/15' : 'bg-muted'}`}>
                        <Globe className={`w-5 h-5 ${!formData.payment_enabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${!formData.payment_enabled ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>
                        Free Event
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      No payment is collected. Registrants are confirmed instantly &mdash; no account details needed.
                    </p>
                  </div>
                </div>
                {!formData.payment_enabled && (
                  <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-green-700 dark:text-green-400">
                      <strong>Free Mode:</strong> Payment options are hidden and every registration is confirmed at &#8377;0,
                      even if the form contains priced fields.
                    </p>
                  </div>
                )}
              </div>

              {/* Payment Collection Method - Mutually Exclusive */}
              <div>
                {formData.payment_enabled && (
                <>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Payment Collection Method *
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => handleChange('payment_collection_method', 'online')}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.payment_collection_method === 'online'
                        ? 'border-primary bg-primary-subtle shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.payment_collection_method === 'online' ? 'bg-primary-subtle' : 'bg-muted'}`}>
                        <CreditCard className={`w-5 h-5 ${formData.payment_collection_method === 'online' ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.payment_collection_method === 'online' ? 'text-primary' : 'text-foreground'}`}>
                        Online Payment
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Users pay online via Razorpay/Instamojo (Card, UPI, Net Banking)
                    </p>
                  </div>
                  <div
                    onClick={() => handleChange('payment_collection_method', 'offline')}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.payment_collection_method === 'offline'
                        ? 'border-secondary bg-secondary/10 shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.payment_collection_method === 'offline' ? 'bg-secondary/15' : 'bg-muted'}`}>
                        <Banknote className={`w-5 h-5 ${formData.payment_collection_method === 'offline' ? 'text-secondary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.payment_collection_method === 'offline' ? 'text-secondary' : 'text-foreground'}`}>
                        Offline Payment (Cash at Venue)
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Users register and pay cash at the event venue. Uses Kiosk Mode.
                    </p>
                  </div>
                </div>

                {formData.payment_collection_method === 'offline' && (
                  <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      <strong>Offline Mode:</strong> Registration forms will be filled at the venue by organizers using Kiosk Mode.
                      No online payment gateway needed.
                    </p>
                  </div>
                )}

                {/* Kiosk Mode Toggle - Only show for Online payments */}
                {formData.payment_collection_method === 'online' && (
                  <div className="mt-4 p-4 bg-muted border border-border rounded-xl">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-accent-subtle">
                          <Banknote className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">Enable Kiosk Mode</h4>
                          <p className="text-sm text-muted-foreground">Allow on-site registration and cash payments alongside online payments</p>
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={formData.kiosk_enabled}
                          onChange={(e) => handleChange('kiosk_enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className={`w-11 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${formData.kiosk_enabled ? 'bg-accent' : 'bg-input'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.kiosk_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </div>
                    </label>
                  </div>
                )}
                </>
                )}

                {/* Show on Homepage Toggle */}
                <div className="mt-4 p-4 bg-muted border border-border rounded-xl">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary-subtle">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">Show on Homepage</h4>
                        <p className="text-sm text-muted-foreground">Display this event in the public event listing</p>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.show_on_homepage}
                        onChange={(e) => handleChange('show_on_homepage', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${formData.show_on_homepage ? 'bg-primary' : 'bg-input'}`}>
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.show_on_homepage ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Fund Collection Mode - required for paid events only */}
              {formData.payment_enabled && (
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Fund Collection Mode <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    onClick={() => handleChange('fund_collection_mode', 'kaizen_managed')}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.fund_collection_mode === 'kaizen_managed'
                        ? 'border-primary bg-primary-subtle shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.fund_collection_mode === 'kaizen_managed' ? 'bg-primary-subtle' : 'bg-muted'}`}>
                        <DollarSign className={`w-5 h-5 ${formData.fund_collection_mode === 'kaizen_managed' ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.fund_collection_mode === 'kaizen_managed' ? 'text-primary' : 'text-foreground'}`}>
                        Kaizen Managed
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Kaizen collects payments on your behalf and transfers funds to your bank account (2.95% platform fee)
                    </p>
                  </div>
                  <div
                    onClick={() => handleChange('fund_collection_mode', 'organizer_direct')}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.fund_collection_mode === 'organizer_direct'
                        ? 'border-green-500 bg-green-500/10 shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.fund_collection_mode === 'organizer_direct' ? 'bg-green-500/15' : 'bg-muted'}`}>
                        <CreditCard className={`w-5 h-5 ${formData.fund_collection_mode === 'organizer_direct' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                      <h3 className={`font-semibold ${formData.fund_collection_mode === 'organizer_direct' ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>
                        Direct to Organizer
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      You use your own payment gateway. Configure it in Payment Settings after creating the event.
                    </p>
                  </div>
                </div>
                {!formData.fund_collection_mode && (
                  <p className="text-sm text-destructive mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Please select a fund collection mode
                  </p>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Section: Advanced settings */}
          <div className="ke-card p-5">
            <div className="flex items-center gap-3">
              <span className="ke-medallion shrink-0" style={{ background: medallionBg }}>
                <SlidersHorizontal className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <div>
                <h3 className="ke-section-title text-[15px]">Account &amp; Limits</h3>
                <p className="text-sm font-jakarta text-muted-foreground mt-0.5">Connect a payment account and set registration limits.</p>
              </div>
            </div>
            <div className="ke-rule-gold mt-3 mb-5" />

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Payment Account - Only for paid, online payments */}
                {formData.payment_enabled && formData.payment_collection_method === 'online' && (
                <div>
                  <Label className="text-foreground font-jakarta font-medium mb-2 block">
                    Payment Account *
                  </Label>
                  {accountsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-11 w-full rounded-lg" />
                      <Skeleton className="h-3 w-40 rounded" />
                    </div>
                  ) : accountsError ? (
                    <div className="p-3 border border-destructive/40 rounded-lg bg-destructive/10">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-destructive font-jakarta">Couldn&apos;t load payment accounts.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchPaymentAccounts}
                        className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Retry
                      </Button>
                    </div>
                  ) : paymentAccounts.length > 0 ? (
                    <Select
                      value={formData.payment_account_id}
                      onValueChange={(value) => {
                        const account = paymentAccounts.find(acc => acc.id === value);
                        setFormData({
                          ...formData,
                          payment_account_id: value,
                          payment_gateway: account?.gateway_type || 'razorpay'
                        });
                      }}
                    >
                      <SelectTrigger
                        data-testid="payment-account-select"
                        className="h-11 rounded-lg border-border focus:ring-ring"
                      >
                        <SelectValue placeholder="Select payment account" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <div className="flex items-center space-x-2">
                              <CreditCard className="w-4 h-4 text-muted-foreground" />
                              <span>{account.name}</span>
                              <span className="text-xs text-muted-foreground capitalize">({account.gateway_type})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-4 border border-dashed border-border rounded-lg bg-muted text-center">
                      <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle">
                        <CreditCard className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm text-foreground font-jakarta font-medium">No payment accounts configured</p>
                      <p className="text-xs text-muted-foreground font-jakarta mt-1 mb-3">Add one to accept online payments for this event.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/payment-accounts')}
                        className="text-primary border-primary hover:bg-primary-subtle focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Payment Account
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground font-jakarta mt-1">
                    <a href="/payment-accounts" className="text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Manage payment accounts</a>
                  </p>
                </div>
                )}

                {/* Max Registrations */}
                <div>
                  <Label htmlFor="max_registrations" className="text-foreground font-jakarta font-medium mb-2 block">
                    Max Registrations
                  </Label>
                  <Input
                    id="max_registrations"
                    type="number"
                    value={formData.max_registrations}
                    onChange={(e) => handleChange('max_registrations', e.target.value)}
                    placeholder="Leave empty for unlimited"
                    data-testid="max-registrations-input"
                    className="h-11 rounded-lg border-border focus-visible:ring-ring transition-all duration-200"
                  />
                </div>
              </div>

              {/* Payment Purpose - Shows when payment account is selected and online payment */}
              {formData.payment_enabled && formData.payment_collection_method === 'online' && formData.payment_account_id && (
                <div>
                  <Label htmlFor="payment_purpose" className="text-foreground font-jakarta font-medium mb-2 block">
                    Payment Purpose {paymentAccounts.find(acc => acc.id === formData.payment_account_id)?.gateway_type === 'instamojo' && '*'}
                  </Label>
                  <Input
                    id="payment_purpose"
                    value={formData.payment_purpose}
                    onChange={(e) => handleChange('payment_purpose', e.target.value)}
                    placeholder="e.g., Discon_2026, Annual_Conference_2025"
                    required={paymentAccounts.find(acc => acc.id === formData.payment_account_id)?.gateway_type === 'instamojo'}
                    data-testid="payment-purpose-input"
                    className="h-11 rounded-lg border-border focus-visible:ring-ring transition-all duration-200"
                  />
                  <p className="text-xs text-muted-foreground font-jakarta mt-1">
                    This will be displayed on the payment gateway page (e.g., &quot;Paying to: Your_Event_Name&quot;)
                  </p>
                </div>
              )}

              {/* Status */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Initial Status *
                </Label>
                <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                  <SelectTrigger
                    data-testid="status-select"
                    className="h-11 rounded-lg border-border focus:ring-ring"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground font-jakarta mt-1">
                  You can change this later. Draft events are not visible to the public.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="ke-glass sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl px-4 py-3 shadow-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/campaigns')}
              className="border-border hover:bg-muted font-jakarta rounded-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="font-jakarta font-semibold rounded-lg shadow-sm hover:brightness-105 transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
              style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
            >
              {loading ? 'Creating...' : 'Create Event'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCampaign;
