import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import ImageUploader from '../components/ui/ImageUploader';
import PaymentSplitsSection from '../components/PaymentSplitsSection';
import RazorpayPaymentSplitsSection from '../components/RazorpayPaymentSplitsSection';
import { ArrowLeft, Save, CreditCard, Plus, Globe, Info, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const EditCampaign = () => {
  const { campaignId } = useParams();
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  // Next-number values as loaded at page open — used to detect whether the admin
  // actually changed a live ID counter. Sending an unchanged counter rewinds it.
  const [loadedRegNext, setLoadedRegNext] = useState(1);
  const [loadedInvNext, setLoadedInvNext] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    organization_name: '',
    description: '',
    logo_url: '',
    show_organization_name: true,
    show_description: true,
    show_event_logo: true,
    payment_gateway: 'razorpay',
    payment_account_id: '',
    payment_purpose: '',
    status: 'draft',
    max_registrations: '',
    payment_enabled: true,
    fund_collection_mode: '',
    registration_id_prefix: '',
    registration_next_number: '',
    invoice_prefix: '',
    invoice_next_number: '',
  });

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [campaignId, isSuperAdmin, navigate]);

  const fetchData = async () => {
    try {
      const [campaignRes, accountsRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get('/payment-accounts/list')
      ]);

      const campaign = campaignRes.data;
      setFormData({
        name: campaign.name || '',
        slug: campaign.slug || '',
        organization_name: campaign.organization_name || '',
        description: campaign.description || '',
        logo_url: campaign.logo_url || '',
        show_organization_name: campaign.show_organization_name ?? true,
        show_description: campaign.show_description ?? true,
        show_event_logo: campaign.show_event_logo ?? true,
        payment_gateway: campaign.payment_gateway || 'razorpay',
        payment_account_id: campaign.payment_account_id || '',
        payment_purpose: campaign.payment_purpose || '',
        status: campaign.status || 'draft',
        max_registrations: campaign.max_registrations || '',
        payment_enabled: campaign.payment_enabled ?? true,
        fund_collection_mode: campaign.fund_collection_mode || '',
        registration_id_prefix: campaign.registration_id_prefix || '',
        registration_next_number: campaign.registration_next_number ?? 1,
        invoice_prefix: campaign.invoice_prefix || '',
        invoice_next_number: campaign.invoice_next_number ?? 1,
      });

      // Remember the counters as loaded so we only PUT them when actually changed
      setLoadedRegNext(campaign.registration_next_number ?? 1);
      setLoadedInvNext(campaign.invoice_next_number ?? 1);

      setPaymentAccounts(accountsRes.data);
    } catch (error) {
      setError(true);
      toast.error('Failed to load event data');
      navigate('/campaigns');
    } finally {
      setLoading(false);
    }
  };

  // Re-attempt the initial load without leaving the page (drives the error-state retry).
  const handleRetry = () => {
    setError(false);
    setLoading(true);
    fetchData();
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Next-number inputs must be whole numbers >= 1 (empty = leave unchanged)
    const badNextNumber = (v) =>
      v !== '' && (!/^\d+$/.test(String(v).trim()) || parseInt(v, 10) < 1);
    if (badNextNumber(formData.registration_next_number) || badNextNumber(formData.invoice_next_number)) {
      toast.error('Next numbers must be whole numbers of 1 or more');
      return;
    }

    setSaving(true);

    try {
      const selectedAccount = paymentAccounts.find(acc => acc.id === formData.payment_account_id);

      // Only send a next-number when the admin actually changed it from its
      // page-open value. Backend treats null as "no change"; sending the loaded
      // value on every save would rewind live counters and cause duplicate IDs.
      const regNextChanged =
        String(formData.registration_next_number).trim() !== String(loadedRegNext).trim();
      const invNextChanged =
        String(formData.invoice_next_number).trim() !== String(loadedInvNext).trim();

      const payload = {
        name: formData.name,
        organization_name: formData.organization_name,
        // Empty string CLEARS these (backend treats null as "no change")
        description: (formData.description || ''),
        logo_url: (formData.logo_url || ''),
        show_organization_name: formData.show_organization_name,
        show_description: formData.show_description,
        show_event_logo: formData.show_event_logo,
        payment_gateway: selectedAccount?.gateway_type || formData.payment_gateway,
        payment_enabled: formData.payment_enabled,
        // Free events carry no payment wiring (the backend also clears these when payment is off).
        payment_account_id: formData.payment_enabled ? (formData.payment_account_id || null) : null,
        payment_purpose: formData.payment_enabled ? (formData.payment_purpose || null) : null,
        status: formData.status,
        max_registrations: formData.max_registrations ? parseInt(formData.max_registrations) : null,
        fund_collection_mode: formData.payment_enabled ? (formData.fund_collection_mode || null) : null,
        // Empty string clears a prefix (backend treats null as "no change")
        registration_id_prefix: formData.registration_id_prefix.trim(),
        invoice_prefix: formData.invoice_prefix.trim(),
        // null = no change (don't rewind); only send when changed and non-empty
        registration_next_number: (regNextChanged && formData.registration_next_number !== '')
          ? parseInt(formData.registration_next_number, 10) : null,
        invoice_next_number: (invNextChanged && formData.invoice_next_number !== '')
          ? parseInt(formData.invoice_next_number, 10) : null,
      };

      await api.put(`/campaigns/${campaignId}`, payload);
      toast.success('Event updated successfully!');
      navigate(`/campaigns/${campaignId}`);
    } catch (error) {
      // Activation gate — backend returns 400 with `redirect_to` when trying to
      // activate before all 4 email templates are filled in. Offer a one-click jump.
      const data = error.response?.data;
      if (error.response?.status === 400 && data?.redirect_to && data?.incomplete_triggers) {
        toast.error(
          (t) => (
            <div className="space-y-2">
              <p className="text-sm">{data.detail}</p>
              <p className="text-xs text-muted-foreground">
                Incomplete: {data.incomplete_triggers.join(', ')}
              </p>
              <button
                onClick={() => { toast.dismiss(t); navigate(data.redirect_to); }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Go to Email Templates →
              </button>
            </div>
          ),
          { duration: 8000 }
        );
      } else {
        toast.error(data?.detail || 'Failed to update event');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero skeleton */}
          <div className="ke-hero p-6 md:p-7 mb-5">
            <div className="ke-hero-grid" />
            <div className="relative space-y-2">
              <Skeleton className="h-3 w-24 bg-white/20" />
              <Skeleton className="h-8 w-48 bg-white/20" />
              <Skeleton className="h-4 w-64 bg-white/15" />
            </div>
          </div>

          {/* Form skeleton */}
          <Card className="ke-card p-6 md:p-7 space-y-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            ))}
            <div className="flex items-center justify-end gap-4 pt-6 border-t border-border">
              <Skeleton className="h-10 w-24 rounded-lg" />
              <Skeleton className="h-10 w-36 rounded-lg" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center p-4 md:p-6 lg:p-8">
        <Card className="ke-card p-8 max-w-md w-full text-center">
          <span
            className="ke-medallion mx-auto mb-4"
            style={{ background: 'linear-gradient(150deg, hsl(var(--destructive) / 0.16), transparent 85%)' }}
          >
            <AlertCircle className="h-6 w-6 text-destructive" />
          </span>
          <h2 className="text-lg font-outfit font-semibold text-foreground mb-1">
            Couldn't load event
          </h2>
          <p className="text-sm font-jakarta text-muted-foreground mb-6">
            Something went wrong while loading this event's details. Please try again.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/campaigns')}
              className="border-border hover:bg-muted focus-visible:ring-ring"
            >
              Back to Events
            </Button>
            <Button
              onClick={handleRetry}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta font-medium rounded-lg focus-visible:ring-ring"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              type="button"
              onClick={() => navigate(`/campaigns/${campaignId}`)}
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta font-medium text-white/70 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Event
            </button>
            <div className="flex flex-wrap items-end justify-between gap-4 mt-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Event Setup</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Edit Event</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Update this event's details, pricing and ID numbering.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => navigate(`/campaigns/${campaignId}`)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="edit-campaign-form"
                  disabled={saving}
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#091D40] mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <Card className="ke-card p-6 md:p-7">
          <form id="edit-campaign-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Section heading */}
            <div>
              <h3 className="ke-section-title text-[15px]">Event Details</h3>
              <div className="ke-rule-gold mt-2" />
            </div>

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
                className="h-11 rounded-lg border-border focus-visible:ring-ring"
              />
            </div>

            {/* Slug (read-only) */}
            <div>
              <Label htmlFor="slug" className="text-foreground font-jakarta font-medium mb-2 block">
                URL Slug
              </Label>
              <Input
                id="slug"
                value={formData.slug}
                disabled
                className="h-11 rounded-lg border-border bg-muted text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground font-jakarta mt-1">
                Slug cannot be changed after creation
              </p>
            </div>

            {/* Organization Name */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="organization_name" className="text-foreground font-jakarta font-medium">
                  Organization Name *
                </Label>
                <label className="inline-flex items-center gap-2 text-xs font-jakarta text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.show_organization_name}
                    onChange={(e) => handleChange('show_organization_name', e.target.checked)}
                    style={{ accentColor: 'hsl(var(--primary))', width: 16, height: 16 }}
                  />
                  Show on registration form
                </label>
              </div>
              <Input
                id="organization_name"
                value={formData.organization_name}
                onChange={(e) => handleChange('organization_name', e.target.value)}
                placeholder="e.g., Rotary Club of Mumbai"
                required
                className="h-11 rounded-lg border-border focus-visible:ring-ring"
              />
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="description" className="text-foreground font-jakarta font-medium">
                  Description
                </Label>
                <label className="inline-flex items-center gap-2 text-xs font-jakarta text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.show_description}
                    onChange={(e) => handleChange('show_description', e.target.checked)}
                    style={{ accentColor: 'hsl(var(--primary))', width: 16, height: 16 }}
                  />
                  Show on registration form
                </label>
              </div>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Describe your event..."
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Campaign Logo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-foreground font-jakarta font-medium">
                  Event Logo
                </Label>
                <label className="inline-flex items-center gap-2 text-xs font-jakarta text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.show_event_logo}
                    onChange={(e) => handleChange('show_event_logo', e.target.checked)}
                    style={{ accentColor: 'hsl(var(--primary))', width: 16, height: 16 }}
                  />
                  Show on registration form
                </label>
              </div>
              <ImageUploader
                value={formData.logo_url}
                onChange={(url) => handleChange('logo_url', url)}
                label="campaign-logo"
              />
              <p className="text-xs text-muted-foreground font-jakarta mt-1">
                Upload an image for your event (recommended: 400x300px)
              </p>
            </div>

            {/* Status */}
            <div>
              <Label className="text-foreground font-jakarta font-medium mb-2 block">
                Status *
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange('status', value)}
              >
                <SelectTrigger className="h-11 rounded-lg border-border focus:ring-ring">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs font-jakarta text-muted-foreground mt-1.5">
                Only <span className="font-medium">Active</span> events accept registrations.
                Paused pauses new registrations (can be resumed), Completed marks the event finished,
                and Closed permanently stops taking registrations.
              </p>
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
                      : 'border-border hover:border-primary hover:bg-muted'
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
                    Collect a fee from registrants. Configure fund mode and payment account below.
                  </p>
                </div>
                <div
                  onClick={() => handleChange('payment_enabled', false)}
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                    !formData.payment_enabled
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/40 shadow-md'
                      : 'border-border hover:border-primary hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${!formData.payment_enabled ? 'bg-green-100 dark:bg-green-900/40' : 'bg-muted'}`}>
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
                <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg flex items-start gap-2">
                  <Info className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-700 dark:text-green-400">
                    <strong>Free Mode:</strong> Payment options are hidden and every registration is confirmed at &#8377;0,
                    even if the form contains priced fields.
                  </p>
                </div>
              )}
            </div>

            {/* Fund Collection Mode */}
            {formData.payment_enabled && (
            <div>
              <Label className="text-foreground font-jakarta font-medium mb-2 block">
                Fund Collection Mode *
              </Label>
              <Select
                value={formData.fund_collection_mode}
                onValueChange={(value) => handleChange('fund_collection_mode', value)}
              >
                <SelectTrigger className="h-11 rounded-lg border-border focus:ring-ring">
                  <SelectValue placeholder="Select fund collection mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kaizen_managed">
                    <div className="flex flex-col">
                      <span className="font-medium">Kaizen Managed</span>
                      <span className="text-xs text-muted-foreground">Funds collected by Kaizen (2.95% platform fee)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="organizer_direct">
                    <div className="flex flex-col">
                      <span className="font-medium">Direct to Organizer</span>
                      <span className="text-xs text-muted-foreground">Funds go directly to organizer's account</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground font-jakarta mt-1">
                {formData.fund_collection_mode === 'kaizen_managed'
                  ? '✓ Kaizen collects funds and transfers to organizer after deducting 2.95% platform fee'
                  : formData.fund_collection_mode === 'organizer_direct'
                  ? '✓ Payments go directly to organizer\'s payment account'
                  : 'Choose how funds will be collected for this event'}
              </p>
            </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Payment Account (paid events only) */}
              {formData.payment_enabled && (
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Payment Account
                </Label>
                {paymentAccounts.length > 0 ? (
                  <Select
                    value={formData.payment_account_id}
                    onValueChange={(value) => {
                      const account = paymentAccounts.find(acc => acc.id === value);
                      setFormData(prev => ({
                        ...prev,
                        payment_account_id: value,
                        payment_gateway: account?.gateway_type || prev.payment_gateway
                      }));
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-lg border-border focus:ring-ring">
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
                    <span
                      className="ke-medallion mx-auto mb-2"
                      style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}
                    >
                      <CreditCard className="w-4 h-4" style={{ color: 'hsl(var(--accent))' }} />
                    </span>
                    <p className="text-sm font-jakarta font-medium text-foreground mb-1">No payment accounts configured</p>
                    <p className="text-xs text-muted-foreground font-jakarta mb-3">
                      Add a payment account to collect fees for this event.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/payment-accounts')}
                      className="text-primary border-primary hover:bg-primary-subtle focus-visible:ring-ring"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Payment Account
                    </Button>
                  </div>
                )}
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
                  className="h-11 rounded-lg border-border focus-visible:ring-ring"
                />
              </div>
            </div>

            {/* Payment Purpose */}
            {formData.payment_enabled && formData.payment_account_id && (
              <div>
                <Label htmlFor="payment_purpose" className="text-foreground font-jakarta font-medium mb-2 block">
                  Payment Purpose
                </Label>
                <Input
                  id="payment_purpose"
                  value={formData.payment_purpose}
                  onChange={(e) => handleChange('payment_purpose', e.target.value)}
                  placeholder="e.g., Discon_2026, Annual_Conference_2025"
                  className="h-11 rounded-lg border-border focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground font-jakarta mt-1">
                  This will be displayed on the payment gateway page
                </p>
              </div>
            )}

            {/* Payment Splits — hidden entirely for free events */}
            {formData.payment_enabled && (
              <>
                {/* Cashfree multi-vendor configuration (visible only when applicable) */}
                <PaymentSplitsSection
                  campaignId={campaignId}
                  paymentGateway={formData.payment_gateway}
                  fundCollectionMode={formData.fund_collection_mode}
                />

                {/* Razorpay Route multi-vendor configuration (visible only when applicable) */}
                <RazorpayPaymentSplitsSection
                  campaignId={campaignId}
                  paymentGateway={formData.payment_gateway}
                  fundCollectionMode={formData.fund_collection_mode}
                />
              </>
            )}

            {/* Custom IDs — per-event registration/invoice numbering */}
            <Card className="ke-card p-5 bg-muted/40">
              <h3 className="ke-section-title text-[15px]">Custom IDs</h3>
              <div className="ke-rule-gold mt-2 mb-2" />
              <p className="text-xs text-muted-foreground font-jakarta mb-4">
                Number registrations and invoices with your own prefix (e.g., RID3170). Leave empty to use system default IDs.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="registration_id_prefix" className="text-foreground font-jakarta font-medium mb-2 block">
                    Registration ID Prefix
                  </Label>
                  <Input
                    id="registration_id_prefix"
                    value={formData.registration_id_prefix}
                    onChange={(e) => handleChange('registration_id_prefix', e.target.value)}
                    placeholder="e.g., RID"
                    maxLength={20}
                    className="h-11 rounded-lg border-border focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground font-jakarta mt-1">
                    Leave empty to use system default IDs
                  </p>
                </div>
                <div>
                  <Label htmlFor="registration_next_number" className="text-foreground font-jakarta font-medium mb-2 block">
                    Next Registration Number
                  </Label>
                  <Input
                    id="registration_next_number"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.registration_next_number}
                    onChange={(e) => handleChange('registration_next_number', e.target.value)}
                    className="h-11 rounded-lg border-border focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground font-jakarta mt-1">
                    Changing this only affects future registrations
                  </p>
                </div>
                <div>
                  <Label htmlFor="invoice_prefix" className="text-foreground font-jakarta font-medium mb-2 block">
                    Invoice Prefix
                  </Label>
                  <Input
                    id="invoice_prefix"
                    value={formData.invoice_prefix}
                    onChange={(e) => handleChange('invoice_prefix', e.target.value)}
                    placeholder="e.g., INV2026-"
                    maxLength={20}
                    className="h-11 rounded-lg border-border focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground font-jakarta mt-1">
                    Leave empty to use system default IDs
                  </p>
                </div>
                <div>
                  <Label htmlFor="invoice_next_number" className="text-foreground font-jakarta font-medium mb-2 block">
                    Next Invoice Number
                  </Label>
                  <Input
                    id="invoice_next_number"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.invoice_next_number}
                    onChange={(e) => handleChange('invoice_next_number', e.target.value)}
                    className="h-11 rounded-lg border-border focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground font-jakarta mt-1">
                    Changing this only affects future registrations
                  </p>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/campaigns/${campaignId}`)}
                className="border-border hover:bg-muted focus-visible:ring-ring"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta font-medium rounded-lg focus-visible:ring-ring"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default EditCampaign;
