import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Skeleton } from '../components/ui/skeleton';
import { 
  ArrowLeft, Edit, FormInput, Globe, DollarSign, Users,
  Settings, Layout, TrendingUp, Calendar, Link2, Copy, ExternalLink,
  BarChart3, Download, X, Loader2, UserPlus, Shield, Bell,
  Archive, RotateCcw, AlertTriangle, CheckCircle, FileText, XCircle,
  ChevronDown, ChevronUp, Mail, Phone, Upload, Banknote,
  Clock, CalendarDays, Infinity as InfinityIcon, Palette
} from 'lucide-react';
import { toast } from 'sonner';
import TrendChart from '../components/dashboard/TrendChart';
import StatusDonut from '../components/dashboard/StatusDonut';
import { format, parseISO } from 'date-fns';
import { formatServerDate, parseServerDate } from '../utils/serverTime';
import { exportRegistrationsXlsx } from '../utils/exportRegistrations';
import { TeamMemberModal } from '../components/CampaignModals';
import FundManagement from '../components/FundManagement';
import EntityHistory from '../components/EntityHistory';
import ShareQr from '../components/ShareQr';

const CampaignDetail = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  
  // Team member modal state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  
  // Short URLs state
  const [shortUrls, setShortUrls] = useState({});

  useEffect(() => {
    fetchCampaignData();
  }, [campaignId]);

  useEffect(() => {
    if (campaign?.id) {
      fetchShortUrls();
    }
  }, [campaign?.id]);

  const fetchShortUrls = async () => {
    try {
      const response = await api.get(`/short-urls/campaign/${campaignId}`);
      setShortUrls(response.data);
    } catch (error) {
      // Short URLs not found is fine
    }
  };

  const generateShortUrl = async (urlType, { silent = false } = {}) => {
    try {
      const originalUrl = urlType === 'registration'
        ? `${window.location.origin}/register/${campaign.slug}`
        : `${window.location.origin}/kiosk/${campaign.id}`;

      const response = await api.post('/short-urls', {
        original_url: originalUrl,
        campaign_id: campaignId,
        url_type: urlType
      });

      setShortUrls(prev => ({
        ...prev,
        [urlType]: response.data
      }));

      if (!silent) toast.success('Short link generated!');
      return response.data;
    } catch (error) {
      if (!silent) toast.error('Failed to generate short link');
      return null;
    }
  };

  // Every form should carry a QR code, so ensure a registration short link (the
  // QR token) always exists — auto-create it silently the first time the campaign
  // is opened. The endpoint is idempotent, so repeat views just reuse it.
  useEffect(() => {
    if (campaign?.id && campaign?.slug && !shortUrls?.registration) {
      generateShortUrl('registration', { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, campaign?.slug, shortUrls?.registration]);

  const fetchCampaignData = async () => {
    try {
      const [campaignRes, analyticsRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/analytics`).catch(() => null)
      ]);
      
      setCampaign(campaignRes.data);
      setSelectedPaymentAccount(campaignRes.data.payment_account_id || '');
      if (analyticsRes) {
        setAnalytics(analyticsRes.data);
      }
      
      // Fetch team members (users with access to this campaign)
      try {
        const usersRes = await api.get('/users');
        const members = usersRes.data.filter(u => 
          u.role === 'org_admin' && u.campaign_access?.includes(campaignId)
        );
        setTeamMembers(members);
      } catch (e) {
        // Ignore if not super admin
      }
    } catch (error) {
      toast.error('Failed to load campaign data');
    } finally {
      setLoading(false);
    }
  };

  const [selectedGateway, setSelectedGateway] = useState('');

  const openPaymentModal = async () => {
    try {
      const response = await api.get('/payment-accounts');
      setPaymentAccounts(response.data);
      setSelectedGateway(campaign.payment_gateway || 'razorpay');
      setShowPaymentModal(true);
    } catch (error) {
      toast.error('Failed to load payment accounts');
    }
  };

  // Filter accounts by selected gateway
  const filteredAccounts = paymentAccounts.filter(
    account => account.gateway_type === selectedGateway
  );

  const savePaymentSettings = async () => {
    setSavingPayment(true);
    try {
      await api.put(`/campaigns/${campaignId}`, {
        payment_account_id: selectedPaymentAccount || null,
        payment_gateway: selectedGateway || 'none'
      });
      
      // Refresh campaign data
      const res = await api.get(`/campaigns/${campaignId}`);
      setCampaign(res.data);
      
      setShowPaymentModal(false);
      toast.success('Payment settings updated!');
    } catch (error) {
      toast.error('Failed to update payment settings');
    } finally {
      setSavingPayment(false);
    }
  };

  const openTeamModal = () => {
    setShowTeamModal(true);
  };

  const fetchTeamMembers = async () => {
    try {
      const usersRes = await api.get('/users');
      const members = usersRes.data.filter(u => 
        u.role === 'org_admin' && u.campaign_access?.includes(campaignId)
      );
      setTeamMembers(members);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    }
  };

  const copyPublicUrl = () => {
    const url = `${window.location.origin}/register/${campaign.slug}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard!');
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await api.post(`/campaigns/${campaignId}/archive`);
      toast.success('Event archived successfully');
      setShowArchiveModal(false);
      fetchCampaignData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to archive event');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    setArchiving(true);
    try {
      await api.post(`/campaigns/${campaignId}/unarchive`);
      toast.success('Event restored successfully');
      fetchCampaignData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to restore event');
    } finally {
      setArchiving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await api.put(`/campaigns/${campaignId}`, { status: 'active' });
      toast.success('Event activated successfully');
      fetchCampaignData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to activate event');
    } finally {
      setActivating(false);
    }
  };

  const handleToggleLandingPage = async (enabled) => {
    try {
      await api.put(`/campaigns/${campaignId}`, { has_landing_page: enabled });
      toast.success(enabled ? 'Landing page enabled' : 'Landing page disabled - visitors will go directly to registration form');
      fetchCampaignData();
    } catch (error) {
      toast.error('Failed to update landing page setting');
    }
  };

  const getPublicUrl = () => {
    if (campaign?.has_landing_page) {
      return `/event/${campaign.slug}`;
    }
    return `/register/${campaign.slug}`;
  };

  // Payment-status hues, theme-aware: Paid=success green, Pending=gold accent
  // token, Failed=destructive token — all expressed as CSS colors so they flip
  // with the theme (recharts resolves var() in fill/backgroundColor).
  const COLORS = ['hsl(142 60% 40%)', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

  const paymentStatusData = analytics ? [
    { name: 'Paid', value: analytics.paid_registrations || 0 },
    { name: 'Pending', value: analytics.pending_registrations || 0 },
    { name: 'Failed', value: analytics.failed_registrations || 0 }
  ].filter(d => d.value > 0) : [];

  const chartData = analytics?.registration_by_date?.map(item => ({
    date: format(parseISO(item.date), 'MMM dd'),
    count: item.count
  })) || [];

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
        {/* Hero skeleton */}
        <div className="ke-hero p-6 md:p-7 mb-6">
          <div className="ke-hero-grid" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-28 bg-white/20" />
              <Skeleton className="h-8 w-64 bg-white/20" />
              <Skeleton className="h-4 w-40 bg-white/20" />
            </div>
            <Skeleton className="h-10 w-24 rounded-lg bg-white/20" />
          </div>
        </div>
        {/* Content skeleton */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="ke-card p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="w-11 h-11 rounded-[0.85rem]" />
                </div>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <Card className="ke-card p-6 lg:col-span-2">
              <Skeleton className="h-5 w-40 mb-4" />
              <Skeleton className="h-52 w-full rounded-lg" />
            </Card>
            <Card className="ke-card p-6">
              <Skeleton className="h-5 w-32 mb-4" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </Card>
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="ke-atmos flex items-center justify-center min-h-screen px-6">
        <Card className="ke-card p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-lg font-outfit font-semibold text-foreground mb-1">Event not found</h2>
          <p className="text-sm text-muted-foreground font-jakarta mb-6">
            We couldn't load this event. It may have been removed, or there was a problem reaching the server.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => { setLoading(true); fetchCampaignData(); }}
              className="focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            <Button
              onClick={() => navigate('/campaigns')}
              className="bg-primary hover:bg-primary-hover text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back to Events
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
      {/* Hero header */}
      <div className="ke-hero p-6 md:p-7 mb-6">
        <div className="ke-hero-grid" />
        <div className="relative">
          <button
            onClick={() => navigate('/campaigns')}
            data-testid="back-button"
            className="inline-flex items-center gap-1.5 text-[13px] font-jakarta font-medium text-white/60 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Event Overview</div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight">{campaign.name}</h1>
                <span className={`px-3 py-1 rounded-sm text-xs font-jakarta font-medium capitalize border ${
                  campaign.status === 'active'
                    ? 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30'
                    : campaign.status === 'draft'
                    ? 'bg-white/10 text-white/70 border-white/20'
                    : 'bg-red-400/15 text-red-200 border-red-300/30'
                }`}>
                  {campaign.status}
                </span>
                {campaign.fund_collection_mode && (
                  <span className={`px-3 py-1 rounded-sm text-xs font-jakarta font-medium border ${
                    campaign.fund_collection_mode === 'kaizen_managed'
                      ? 'bg-white/10 text-white/85 border-white/20'
                      : 'bg-accent/20 text-white border-accent/40'
                  }`}>
                    {campaign.fund_collection_mode === 'kaizen_managed'
                      ? '💰 Kaizen Managed'
                      : '🏦 Direct to Organizer'}
                  </span>
                )}
              </div>
              {campaign.organization_name && (
                <p className="text-white/70 text-sm font-jakarta mt-2">{campaign.organization_name}</p>
              )}
            </div>
            {isSuperAdmin() && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => navigate(`/campaigns/${campaignId}/edit`)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  onClick={() => navigate(`/campaigns/${campaignId}/form-builder`)}
                  data-testid="form-builder-button"
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <FormInput className="w-4 h-4 mr-2" />
                  Form Builder
                </Button>
                <Button
                  onClick={() => navigate(`/campaigns/${campaignId}/themes`)}
                  data-testid="form-themes-button"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <Palette className="w-4 h-4 mr-2" />
                  Themes
                </Button>
                <Button
                  onClick={() => navigate(`/campaigns/${campaignId}/email-templates`)}
                  data-testid="email-templates-button"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email Templates
                </Button>
                {campaign.campaign_type === 'closed_group' && (
                  <Button
                    onClick={() => navigate(`/campaigns/${campaignId}/members`)}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Manage Members
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="ke-card relative p-5 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), transparent)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Registrations</p>
                <h3 className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums">
                  {campaign.current_registrations}
                </h3>
                {campaign.max_registrations && (
                  <div className="mt-3">
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (campaign.current_registrations / campaign.max_registrations) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-jakarta text-muted-foreground mt-1.5">
                      {campaign.max_registrations - campaign.current_registrations} spots left
                    </p>
                  </div>
                )}
              </div>
              <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}>
                <Users className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
              </span>
            </div>
          </div>

          <div className="ke-card relative p-5 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), transparent)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Revenue</p>
                <h3 className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">
                  ₹{(campaign.total_revenue * 0.9705).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </h3>
                {analytics && analytics.average_registration_value > 0 && (
                  <p className="text-[11px] font-jakarta text-muted-foreground mt-1.5">
                    Avg: ₹{(analytics.average_registration_value * 0.9705).toFixed(0)}
                  </p>
                )}
              </div>
              <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                <DollarSign className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
              </span>
            </div>
          </div>

          <div className="ke-card relative p-5 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(142 60% 40%), transparent)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Paid</p>
                <h3 className="text-[28px] leading-none font-outfit font-bold text-emerald-600 dark:text-emerald-400 mt-2.5 tabular-nums">
                  {analytics?.paid_registrations || 0}
                </h3>
                <p className="text-[11px] font-jakarta text-muted-foreground mt-1.5">
                  {analytics?.pending_registrations || 0} pending, {analytics?.failed_registrations || 0} failed
                </p>
              </div>
              <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(142 60% 40% / 0.16), transparent 85%)' }}>
                <TrendingUp className="w-5 h-5" style={{ color: 'hsl(142 60% 40%)' }} />
              </span>
            </div>
          </div>

          {/* Payment Gateway Card - Super Admin Only */}
          {isSuperAdmin() && (
            <div
              className="ke-card ke-card-hover relative p-5 overflow-hidden cursor-pointer"
              onClick={openPaymentModal}
            >
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Payment Gateway</p>
                  <h3 className="text-xl font-outfit font-bold text-foreground capitalize mt-2.5">
                    {campaign.payment_gateway || 'Not Set'}
                  </h3>
                  {campaign.payment_purpose && (
                    <p className="text-[11px] font-jakarta text-muted-foreground mt-1.5">
                      {campaign.payment_purpose}
                    </p>
                  )}
                  <p className="text-[11px] font-jakarta font-medium text-primary mt-1.5">Click to configure →</p>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                  <Settings className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                </span>
              </div>
            </div>
          )}

          {/* View Registrations Card - For Org Admin (when Payment Gateway is hidden) */}
          {!isSuperAdmin() && (
            <div
              className="ke-card ke-card-hover relative p-5 overflow-hidden cursor-pointer"
              onClick={() => navigate(`/campaigns/${campaignId}/registrations`)}
            >
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">View All</p>
                  <h3 className="text-xl font-outfit font-bold text-foreground mt-2.5">
                    Registrations
                  </h3>
                  <p className="text-[11px] font-jakarta font-medium text-primary mt-1.5">Click to view →</p>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}>
                  <FileText className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Registration Trend */}
          <Card className="ke-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="ke-section-title text-[15px]">Registration Trend</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/campaigns/${campaignId}/registrations`)}
                className="text-xs focus-visible:ring-2 focus-visible:ring-ring"
              >
                View All →
              </Button>
            </div>
            <div className="ke-rule-gold mt-2 mb-4" />
            {/* 3D registration-trend chart (shared design + hover) */}
            <TrendChart
              data={chartData.map((d) => ({ label: d.date, registrations: d.count }))}
              height={208}
            />
          </Card>

          {/* Payment Status */}
          <Card className="ke-card p-6">
            <h3 className="ke-section-title text-[15px]">Payment Status</h3>
            <div className="ke-rule-gold mt-2 mb-4" />
            {/* 3D payment-status pie (shared design + hover) */}
            <StatusDonut counts={{
              paid: analytics?.paid_registrations || 0,
              pending: analytics?.pending_registrations || 0,
              failed: analytics?.failed_registrations || 0,
              other: 0,
            }} />
          </Card>
        </div>

        {/* Details & Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Campaign Details */}
          <Card className="ke-card p-6 lg:col-span-2">
            <h3 className="ke-section-title text-[15px]">Event Details</h3>
            <div className="ke-rule-gold mt-2 mb-5" />

            {/* Public URL */}
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <p className="text-sm font-jakarta font-medium text-muted-foreground mb-2">Public Registration URL</p>

              {/* Original URL */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border overflow-hidden">
                  <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-mono text-foreground truncate block">
                    {`${window.location.origin}/register/${campaign.slug}`}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/register/${campaign.slug}`);
                    toast.success('URL copied!');
                  }}
                  className="shrink-0"
                  title="Copy URL"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/register/${campaign.slug}`, '_blank')}
                  className="shrink-0"
                  title="Open URL"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>

              {/* Short URL - Separate Line */}
              {shortUrls?.registration ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20 overflow-hidden">
                    <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-mono text-primary font-medium truncate block">
                      {shortUrls.registration.short_url}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(shortUrls.registration.short_url);
                      toast.success('Short URL copied!');
                    }}
                    className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                    title="Copy Short URL"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => generateShortUrl('registration')}
                  className="text-xs text-primary p-0 h-auto"
                >
                  Generate short link
                </Button>
              )}

              {/* Shareable QR code — encodes the backend qr_token (tracked short URL) */}
              <ShareQr
                accent="primary"
                label="Registration"
                value={
                  shortUrls?.registration?.qr_token
                  || shortUrls?.registration?.short_url
                  || `${window.location.origin}/register/${campaign.slug}`
                }
              />
            </div>

            {/* Kiosk Mode URL - Show for offline payment campaigns, kiosk_enabled online campaigns, or legacy offline payments config */}
            {(campaign.payment_collection_method === 'offline' || campaign.kiosk_enabled || campaign.payment_config?.allow_offline_payments) && (
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <p className="text-sm font-jakarta font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
                  Kiosk Mode URL
                  {campaign.payment_collection_method === 'online' && campaign.kiosk_enabled && (
                    <span className="text-xs bg-accent-subtle text-accent-foreground px-2 py-0.5 rounded-sm">Hybrid Mode</span>
                  )}
                </p>

                {/* Original URL */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border overflow-hidden">
                    <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-mono text-foreground truncate block">
                      {`${window.location.origin}/kiosk/${campaign.id}`}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/kiosk/${campaign.id}`);
                      toast.success('Kiosk URL copied!');
                    }}
                    className="shrink-0"
                    title="Copy URL"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/kiosk/${campaign.id}`, '_blank')}
                    className="shrink-0"
                    title="Open Kiosk Mode"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>

                {/* Short URL - Separate Line */}
                {shortUrls?.kiosk ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-secondary/5 rounded-lg border border-secondary/20 overflow-hidden">
                      <Link2 className="w-4 h-4 text-secondary flex-shrink-0" />
                      <span className="text-sm font-mono text-secondary font-medium truncate block">
                        {shortUrls.kiosk.short_url}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(shortUrls.kiosk.short_url);
                        toast.success('Short URL copied!');
                      }}
                      className="shrink-0 border-secondary/30 text-secondary hover:bg-secondary/10"
                      title="Copy Short URL"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => generateShortUrl('kiosk')}
                    className="text-xs text-secondary p-0 h-auto"
                  >
                    Generate short link
                  </Button>
                )}

                {/* Shareable QR code for the kiosk link (shown once a short link exists) */}
                {shortUrls?.kiosk && (
                  <ShareQr
                    accent="secondary"
                    label="Kiosk"
                    value={
                      shortUrls.kiosk.qr_token
                      || shortUrls.kiosk.short_url
                      || `${window.location.origin}/kiosk/${campaign.id}`
                    }
                  />
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  For on-site registration desk. Requires login.
                </p>
              </div>
            )}

            {/* Registration Window */}
            {isSuperAdmin() && (
              <RegistrationWindowEditor 
                campaign={campaign} 
                onUpdate={fetchCampaignData}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              {campaign.description && (
                <div className="col-span-2">
                  <p className="text-sm font-jakarta font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-base font-jakarta text-foreground">{campaign.description}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-jakarta font-medium text-muted-foreground mb-1">Created</p>
                <p className="text-base font-jakarta text-foreground">
                  {formatServerDate(campaign.created_at, 'MMMM dd, yyyy')}
                </p>
              </div>

              {campaign.start_date && (
                <div>
                  <p className="text-sm font-jakarta font-medium text-muted-foreground mb-1">Start Date</p>
                  <p className="text-base font-jakarta text-foreground">
                    {format(parseISO(campaign.start_date), 'MMMM dd, yyyy')}
                  </p>
                </div>
              )}

              {campaign.end_date && (
                <div>
                  <p className="text-sm font-jakarta font-medium text-muted-foreground mb-1">End Date</p>
                  <p className="text-base font-jakarta text-foreground">
                    {format(parseISO(campaign.end_date), 'MMMM dd, yyyy')}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm font-jakarta font-medium text-muted-foreground mb-1">Registration Limit</p>
                <p className="text-base font-jakarta text-foreground">
                  {campaign.max_registrations ? `${campaign.max_registrations} max` : 'Unlimited'}
                </p>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          {isSuperAdmin() && (
            <Card className="ke-card p-6">
              <h3 className="ke-section-title text-[15px]">Quick Actions</h3>
              <div className="ke-rule-gold mt-2 mb-5" />

              {/* ========== FORM & PAGES SECTION ========== */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layout className="w-3.5 h-3.5" />
                  Form & Pages
                </h3>
                <div className="space-y-2">
                  {/* Landing Page Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/70 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Layout className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Landing Page</p>
                        <p className="text-xs text-muted-foreground">
                          {campaign.has_landing_page !== false
                            ? 'Visitors see landing page first'
                            : 'Visitors go directly to form'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={campaign.has_landing_page !== false}
                      onCheckedChange={handleToggleLandingPage}
                    />
                  </div>

                  {/* Form Type Toggle */}
                  <FormTypeEditor 
                    campaign={campaign} 
                    onUpdate={fetchCampaignData}
                    onNavigateToBuilder={() => navigate(`/campaigns/${campaignId}/form-builder`)}
                  />

                  {/* Registration Status Toggle */}
                  <RegistrationStatusToggle
                    campaign={campaign}
                    onUpdate={fetchCampaignData}
                  />

                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/campaigns/${campaignId}/registrations`)}
                    data-testid="view-registrations-button"
                    className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    View Registrations
                  </Button>
                </div>
              </div>

              {/* ========== KIOSK & PAYMENTS SECTION ========== */}
              {(campaign.payment_collection_method === 'offline' || campaign.kiosk_enabled || campaign.payment_config?.allow_offline_payments || campaign.payment_collection_method === 'online') && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Banknote className="w-3.5 h-3.5" />
                    Kiosk & Payments
                  </h3>
                  <div className="space-y-2">
                    {/* Kiosk Mode - Show for offline payment collection campaigns or kiosk_enabled */}
                    {(campaign.payment_collection_method === 'offline' || campaign.kiosk_enabled) && (
                      <Button
                        onClick={() => navigate(`/kiosk/${campaignId}`)}
                        className="w-full justify-start bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Banknote className="w-4 h-4 mr-2" />
                        Open Kiosk Mode
                      </Button>
                    )}

                    {/* Offline Payment Verification - Show when offline payments are enabled */}
                    {campaign.payment_config?.allow_offline_payments && (
                      <Button
                        variant="ghost"
                        onClick={() => navigate(`/campaigns/${campaignId}/offline-payments`)}
                        className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Banknote className="w-4 h-4 mr-2" />
                        Verify Offline Payments
                      </Button>
                    )}

                    {/* Kiosk Mode Toggle - Only for online payment campaigns */}
                    {campaign.payment_collection_method === 'online' && (
                      <div className="flex items-center justify-between p-3 bg-muted/70 rounded-lg border border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Banknote className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Enable Kiosk Mode</p>
                            <p className="text-xs text-muted-foreground">Allow on-site cash registration</p>
                          </div>
                        </div>
                        <Switch
                          checked={campaign.kiosk_enabled || false}
                          onCheckedChange={async (checked) => {
                            try {
                              await api.put(`/campaigns/${campaignId}`, { kiosk_enabled: checked });
                              fetchCampaignData();
                              toast.success(checked ? 'Kiosk Mode enabled' : 'Kiosk Mode disabled');
                            } catch (err) {
                              toast.error('Failed to update setting');
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ========== SETTINGS SECTION ========== */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Edit className="w-3.5 h-3.5" />
                  Settings
                </h3>
                <div className="space-y-2">
                  {/* Show on Homepage Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/70 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Show on Homepage</p>
                        <p className="text-xs text-muted-foreground">Display in public event listing</p>
                      </div>
                    </div>
                    <Switch
                      checked={campaign.show_on_homepage !== false}
                      onCheckedChange={async (checked) => {
                        try {
                          await api.put(`/campaigns/${campaignId}`, { show_on_homepage: checked });
                          fetchCampaignData();
                          toast.success(checked ? 'Event visible on homepage' : 'Event hidden from homepage');
                        } catch (err) {
                          toast.error('Failed to update setting');
                        }
                      }}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    onClick={openTeamModal}
                    className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Team Member
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/campaigns/${campaignId}/settings`)}
                    className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Notifications & Integrations
                  </Button>
                </div>
              </div>

              {/* ========== EXPORT & MORE SECTION ========== */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Download className="w-3.5 h-3.5" />
                  Export & More
                </h3>
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    onClick={() => window.open(getPublicUrl(), '_blank')}
                    className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Globe className="w-4 h-4 mr-2" />
                    View Public Page
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={async () => {
                      // Shared client-side exporter — option labels (never slugs),
                      // IST times, oldest-first. Same output as every other export.
                      try {
                        const count = await exportRegistrationsXlsx(campaign);
                        if (count === 0) toast.error('No registrations to export');
                        else toast.success('Excel exported!');
                      } catch (e) {
                        toast.error('No registrations to export');
                      }
                    }}
                    className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Registrations
                  </Button>

                  {/* Archive/Unarchive/Activate Buttons */}
                  {isSuperAdmin() && (
                    <div className="pt-3 mt-3 border-t border-border">
                      {campaign.status === 'archived' ? (
                        <Button
                          variant="ghost"
                          onClick={handleUnarchive}
                          disabled={archiving}
                          className="w-full justify-start text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {archiving ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                          )}
                          Restore Event
                        </Button>
                      ) : campaign.status === 'active' ? (
                        <Button
                          variant="ghost"
                          onClick={() => setShowArchiveModal(true)}
                          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Archive className="w-4 h-4 mr-2" />
                          Archive Event
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={handleActivate}
                          disabled={activating}
                          className="w-full justify-start text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {activating ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-2" />
                          )}
                          Activate Event
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Team Members Section */}
              {teamMembers.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground mb-3">Team Members</h3>
                  <div className="space-y-2">
                    {teamMembers.map(member => (
                      <div key={member.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <Shield className="w-4 h-4 text-secondary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Org Admin entry to Event Settings (Vendors tab, etc.) */}
          {!isSuperAdmin() && (
            <Card className="ke-card p-6">
              <h3 className="ke-section-title text-[15px]">Event Settings</h3>
              <div className="ke-rule-gold mt-2 mb-4" />
              <Button
                variant="outline"
                onClick={() => navigate(`/campaigns/${campaignId}/settings`)}
                className="w-full justify-start"
              >
                <Settings className="w-4 h-4 mr-2" />
                Notifications, Sheets & Vendors
              </Button>
            </Card>
          )}
        </div>

        {/* Fund Management Section - Only for Kaizen Managed campaigns */}
        {campaign.fund_collection_mode === 'kaizen_managed' && (
          <div className="mt-8">
            <FundManagement 
              campaignId={campaignId} 
              campaign={campaign}
            />
          </div>
        )}

        {/* Campaign History Section - Only for Super Admins and Directors */}
        {(isSuperAdmin() || campaign.can_view_history) && (
          <div className="mt-8">
            <EntityHistory
              entityType="campaign"
              entityId={campaignId}
              title="Event History"
              collapsible
            />
          </div>
        )}
      </div>
      </div>

      {/* Payment Settings Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-outfit font-bold text-foreground">Payment Settings</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowPaymentModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-6">
              {/* Gateway Type Selector */}
              <div className="mb-5">
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  Payment Gateway
                </Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedGateway('razorpay');
                      setSelectedPaymentAccount('');
                    }}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selectedGateway === 'razorpay'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    Razorpay
                  </button>
                  <button
                    onClick={() => {
                      setSelectedGateway('instamojo');
                      setSelectedPaymentAccount('');
                    }}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selectedGateway === 'instamojo'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    Instamojo
                  </button>
                  <button
                    onClick={() => {
                      setSelectedGateway('cashfree');
                      setSelectedPaymentAccount('');
                    }}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selectedGateway === 'cashfree'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    Cashfree
                  </button>
                </div>
              </div>

              {/* Payment Account Selector */}
              <div className="mb-5">
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  Select {selectedGateway === 'razorpay' ? 'Razorpay' : selectedGateway === 'cashfree' ? 'Cashfree' : 'Instamojo'} Account
                </Label>
                <select
                  value={selectedPaymentAccount}
                  onChange={(e) => setSelectedPaymentAccount(e.target.value)}
                  className="w-full h-11 rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">No Payment (Free Registration)</option>
                  {filteredAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.is_active ? '' : ' - Inactive'}
                    </option>
                  ))}
                </select>
                {filteredAccounts.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    No {selectedGateway} accounts found. Add one in Payment Accounts.
                  </p>
                )}
              </div>

              {selectedPaymentAccount && (
                <div className="mb-5 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium text-foreground mb-2">Selected Account Details</p>
                  {filteredAccounts.filter(a => a.id === selectedPaymentAccount).map(account => (
                    <div key={account.id} className="text-sm text-muted-foreground">
                      <p><span className="font-medium">Name:</span> {account.name}</p>
                      <p><span className="font-medium">Gateway:</span> {account.gateway_type}</p>
                      <p><span className="font-medium">Status:</span> {account.is_active ?
                        <span className="text-emerald-600 dark:text-emerald-400">Active</span> :
                        <span className="text-destructive">Inactive</span>
                      }</p>
                    </div>
                  ))}
                </div>
              )}

              {paymentAccounts.length === 0 && (
                <div className="mb-5 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-center">
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">No payment accounts configured</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowPaymentModal(false);
                      navigate('/payment-accounts');
                    }}
                  >
                    Go to Payment Accounts →
                  </Button>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={savePaymentSettings}
                  disabled={savingPayment}
                  className="flex-1 bg-primary hover:bg-primary-hover"
                >
                  {savingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Settings'
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Add Team Member Modal */}
      <TeamMemberModal
        isOpen={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        campaignId={campaignId}
        onSave={fetchTeamMembers}
      />

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-xl font-outfit font-bold text-foreground mb-2">Archive Event</h2>
              <p className="text-muted-foreground mb-6">
                Are you sure you want to archive <strong>{campaign?.name}</strong>? 
                The public landing page will be disabled, but all data will be preserved. 
                You can restore it later.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowArchiveModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {archiving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Archiving...
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 mr-2" />
                      Archive
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// Registration Window Editor Component
//
// Three window modes, all mapped onto the EXISTING backend fields (no backend change):
//   • always   → no dates (clear_registration_dates); open until disabled / event closed
//   • dates    → registration_start_date @ 00:00 local, registration_end_date @ 23:59 local
//   • datetime → full datetime window (minute granularity) — the original behaviour
// Plus an Enable/Disable control writing the existing registration_enabled flag.
const RWIN_ALWAYS = 'always';
const RWIN_DATES = 'dates';
const RWIN_DATETIME = 'datetime';

// Derive which mode a stored window represents. A date-only window is recognised by its
// sentinel times (opens 00:00, closes 23:59); anything else (incl. legacy data) is datetime.
const deriveWindowMode = (startStr, endStr) => {
  if (!startStr && !endStr) return RWIN_ALWAYS;
  const s = parseServerDate(startStr);
  const e = parseServerDate(endStr);
  const startAtMidnight = s && s.getHours() === 0 && s.getMinutes() === 0 && s.getSeconds() === 0;
  const endAtDayEnd = e && e.getHours() === 23 && e.getMinutes() === 59;
  if (startStr && endStr && startAtMidnight && endAtDayEnd) return RWIN_DATES;
  return RWIN_DATETIME;
};

const RegistrationWindowEditor = ({ campaign, onUpdate }) => {
  // Stored dates are UTC (naive strings from the backend); the inputs work in the admin's
  // LOCAL wall clock. Convert on the way in (parseServerDate -> local getters) and out
  // (new Date(local) -> toISOString) so open -> save without edits never shifts the time.
  const toLocalDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = parseServerDate(dateStr);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // Today in the admin's local wall clock — used as a fallback date if a time is
  // entered before a date in "Between dates & time" mode, so the time never dead-ends.
  const todayLocal = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(campaign.registration_enabled !== false);
  const [mode, setMode] = useState(() =>
    deriveWindowMode(campaign.registration_start_date, campaign.registration_end_date));
  // Canonical local 'yyyy-MM-ddTHH:mm' strings; the date-only inputs edit the date part
  // while pinning the time to 00:00 (open) / 23:59 (close).
  const [startDT, setStartDT] = useState(() => toLocalDateTime(campaign.registration_start_date));
  const [endDT, setEndDT] = useState(() => toLocalDateTime(campaign.registration_end_date));

  // Re-sync all editor state from the latest campaign values (on open / cancel)
  const resyncFromCampaign = () => {
    setEnabled(campaign.registration_enabled !== false);
    setMode(deriveWindowMode(campaign.registration_start_date, campaign.registration_end_date));
    setStartDT(toLocalDateTime(campaign.registration_start_date));
    setEndDT(toLocalDateTime(campaign.registration_end_date));
  };

  const switchMode = (next) => {
    // Snap existing times to the date-only sentinels when moving to "between dates"
    if (next === RWIN_DATES) {
      if (startDT) setStartDT(`${startDT.slice(0, 10)}T00:00`);
      if (endDT) setEndDT(`${endDT.slice(0, 10)}T23:59`);
    }
    setMode(next);
  };

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return 'Not set';
    return formatServerDate(dateStr, 'MMM dd, yyyy h:mm a') || 'Invalid date';
  };
  const formatDayForDisplay = (dateStr) => {
    if (!dateStr) return 'Not set';
    return formatServerDate(dateStr, 'MMM dd, yyyy') || 'Invalid date';
  };

  const handleSave = async () => {
    // registration_enabled is always sent; the window fields depend on the chosen mode.
    const payload = { registration_enabled: enabled };

    if (mode === RWIN_ALWAYS) {
      // Clear the window entirely (backend ignores plain nulls, so use the flag)
      payload.clear_registration_dates = true;
    } else {
      const granularity = mode === RWIN_DATES ? 'dates' : 'date & time';
      if (!startDT || !endDT) {
        toast.error(`Set both the open and close ${granularity}`);
        return;
      }
      // Guard: a window must open strictly before it closes
      if (new Date(startDT) >= new Date(endDT)) {
        toast.error('Registration must open before it closes');
        return;
      }
      // new Date('yyyy-MM-ddTHH:mm') parses as local time — correct here
      payload.registration_start_date = new Date(startDT).toISOString();
      payload.registration_end_date = new Date(endDT).toISOString();
    }

    setSaving(true);
    try {
      await api.put(`/campaigns/${campaign.id}`, payload);
      toast.success('Registration window updated');
      setEditing(false);
      onUpdate();
    } catch (error) {
      toast.error('Failed to update registration window');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const displayMode = deriveWindowMode(campaign.registration_start_date, campaign.registration_end_date);
    const regEnabled = campaign.registration_enabled !== false;
    return (
      <div className="mb-6 p-4 bg-primary-subtle rounded-lg border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-primary">Registration Window</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { resyncFromCampaign(); setEditing(true); }}
            className="text-primary hover:text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
        </div>

        {/* Enabled / disabled status */}
        <div className="mb-3">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
            regEnabled
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
              : 'bg-destructive/10 text-destructive'
          }`}>
            {regEnabled ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {regEnabled ? 'Registration enabled' : 'Registration disabled'}
          </span>
        </div>

        {/* Window summary — shape depends on the mode */}
        {displayMode === RWIN_ALWAYS ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <InfinityIcon className="w-4 h-4 text-primary" />
            <span>Always open</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-primary mb-1">Opens</p>
              <p className="text-sm font-medium text-foreground">
                {displayMode === RWIN_DATES
                  ? formatDayForDisplay(campaign.registration_start_date)
                  : formatDateForDisplay(campaign.registration_start_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-primary mb-1">Closes</p>
              <p className="text-sm font-medium text-foreground">
                {displayMode === RWIN_DATES
                  ? formatDayForDisplay(campaign.registration_end_date)
                  : formatDateForDisplay(campaign.registration_end_date)}
              </p>
            </div>
          </div>
        )}
        {displayMode === RWIN_ALWAYS && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            Registration stays open until you disable it or close the event
          </p>
        )}
      </div>
    );
  }

  const segBase = 'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const modeOptions = [
    { key: RWIN_ALWAYS, label: 'Always', icon: InfinityIcon },
    { key: RWIN_DATES, label: 'Between dates', icon: CalendarDays },
    { key: RWIN_DATETIME, label: 'Between dates & time', icon: Clock },
  ];

  return (
    <div className="mb-6 p-4 bg-primary-subtle rounded-lg border border-primary/20">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-semibold text-primary">Edit Registration Window</h3>
      </div>

      {/* Enable / Disable */}
      <div className="mb-4">
        <Label className="text-xs text-primary mb-1.5 block">Registration</Label>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className={`${segBase} ${enabled ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Enabled
          </button>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            className={`${segBase} ${!enabled ? 'bg-destructive text-destructive-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Disabled
          </button>
        </div>
        {!enabled && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Visitors see the registration-closed page. The window below applies once re-enabled.
          </p>
        )}
      </div>

      {/* Window mode */}
      <div className="mb-4">
        <Label className="text-xs text-primary mb-1.5 block">When is registration open?</Label>
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {modeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = mode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => switchMode(opt.key)}
                className={`${segBase} inline-flex items-center gap-1.5 ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date inputs per mode */}
      {mode === RWIN_ALWAYS && (
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
          <InfinityIcon className="w-4 h-4 text-primary" />
          Registration is open indefinitely until you disable it or close the event.
        </p>
      )}

      {mode === RWIN_DATES && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs text-primary mb-1 block">Opens on</Label>
            <Input
              type="date"
              value={startDT ? startDT.slice(0, 10) : ''}
              onChange={(e) => setStartDT(e.target.value ? `${e.target.value}T00:00` : '')}
              className="h-10 text-sm bg-card"
            />
          </div>
          <div>
            <Label className="text-xs text-primary mb-1 block">Closes on</Label>
            <Input
              type="date"
              value={endDT ? endDT.slice(0, 10) : ''}
              onChange={(e) => setEndDT(e.target.value ? `${e.target.value}T23:59` : '')}
              className="h-10 text-sm bg-card"
            />
          </div>
        </div>
      )}

      {mode === RWIN_DATETIME && (
        // Split into an explicit date field + time field per side, so the time always
        // has its own visible input + placeholder (never hidden inside a datetime-local).
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs text-primary mb-1 block">Registration Opens</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                aria-label="Opens date"
                value={startDT ? startDT.slice(0, 10) : ''}
                onChange={(e) => setStartDT(e.target.value ? `${e.target.value}T${startDT.slice(11, 16) || '00:00'}` : '')}
                className="h-10 text-sm bg-card flex-1 min-w-0"
              />
              <Input
                type="time"
                aria-label="Opens time"
                value={startDT ? startDT.slice(11, 16) : ''}
                onChange={(e) => setStartDT(`${startDT.slice(0, 10) || todayLocal()}T${e.target.value || '00:00'}`)}
                className="h-10 text-sm bg-card w-[8.5rem] shrink-0"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-primary mb-1 block">Registration Closes</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                aria-label="Closes date"
                value={endDT ? endDT.slice(0, 10) : ''}
                onChange={(e) => setEndDT(e.target.value ? `${e.target.value}T${endDT.slice(11, 16) || '23:59'}` : '')}
                className="h-10 text-sm bg-card flex-1 min-w-0"
              />
              <Input
                type="time"
                aria-label="Closes time"
                value={endDT ? endDT.slice(11, 16) : ''}
                onChange={(e) => setEndDT(`${endDT.slice(0, 10) || todayLocal()}T${e.target.value || '23:59'}`)}
                className="h-10 text-sm bg-card w-[8.5rem] shrink-0"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary-hover text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { resyncFromCampaign(); setEditing(false); }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

// Form Type Editor Component - Choose between built form or external link
const FormTypeEditor = ({ campaign, onUpdate, onNavigateToBuilder }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [useExternalForm, setUseExternalForm] = useState(campaign.use_external_form || false);
  const [externalUrl, setExternalUrl] = useState(campaign.external_form_url || '');

  const handleSave = async () => {
    if (useExternalForm && !externalUrl.trim()) {
      toast.error('Please enter an external form URL');
      return;
    }
    
    if (useExternalForm && !externalUrl.startsWith('http')) {
      toast.error('Please enter a valid URL starting with http:// or https://');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/campaigns/${campaign.id}`, {
        use_external_form: useExternalForm,
        external_form_url: useExternalForm ? externalUrl.trim() : null
      });
      toast.success(useExternalForm ? 'External form link saved' : 'Using built-in form');
      setEditing(false);
      onUpdate();
    } catch (error) {
      toast.error('Failed to update form settings');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between p-3 bg-muted/70 rounded-lg border border-border mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Registration Form</p>
            <p className="text-xs text-muted-foreground">
              {campaign.use_external_form
                ? 'Using external form link'
                : 'Using built-in form builder'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          className="text-primary hover:text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Edit className="w-4 h-4 mr-1" />
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted rounded-lg border border-border mb-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Registration Form Type</h3>
      </div>

      {/* Form Type Selection */}
      <div className="space-y-3 mb-4">
        <label className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border cursor-pointer hover:border-primary/50 transition-colors focus-within:ring-2 focus-within:ring-ring">
          <input
            type="radio"
            name="formType"
            checked={!useExternalForm}
            onChange={() => setUseExternalForm(false)}
            className="w-4 h-4 text-primary accent-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Build Form</p>
            <p className="text-xs text-muted-foreground">Use the built-in form builder to create your registration form</p>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border cursor-pointer hover:border-primary/50 transition-colors focus-within:ring-2 focus-within:ring-ring">
          <input
            type="radio"
            name="formType"
            checked={useExternalForm}
            onChange={() => setUseExternalForm(true)}
            className="w-4 h-4 text-primary accent-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div>
            <p className="text-sm font-medium text-foreground">External Form Link</p>
            <p className="text-xs text-muted-foreground">Use an external form (Google Forms, Typeform, etc.) - opens in new tab</p>
          </div>
        </label>
      </div>

      {/* External URL Input */}
      {useExternalForm && (
        <div className="mb-4">
          <Label className="text-xs text-muted-foreground mb-1 block">External Form URL</Label>
          <Input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://forms.google.com/..."
            className="h-10 text-sm bg-card"
          />

          {/* Webhook URL for External Payments */}
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
              <Bell className="w-3 h-3" />
              Payment Webhook URL (for Instamojo)
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              Add this URL to your Instamojo payment link to auto-capture registrations:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-card px-2 py-1.5 rounded border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 overflow-x-auto">
                {`${process.env.REACT_APP_BACKEND_URL}/api/payments/webhook/instamojo/external/${campaign.slug}`}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${process.env.REACT_APP_BACKEND_URL}/api/payments/webhook/instamojo/external/${campaign.slug}`
                  );
                  toast.success('Webhook URL copied!');
                }}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setUseExternalForm(campaign.use_external_form || false);
            setExternalUrl(campaign.external_form_url || '');
            setEditing(false);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

// Registration Status Toggle Component
const RegistrationStatusToggle = ({ campaign, onUpdate }) => {
  const [saving, setSaving] = useState(false);

  const handleToggle = async (enabled) => {
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaign.id}`, {
        registration_enabled: enabled
      });
      toast.success(enabled ? 'Registration enabled' : 'Registration disabled - visitors will see registration closed message');
      onUpdate();
    } catch (error) {
      toast.error('Failed to update registration status');
    } finally {
      setSaving(false);
    }
  };

  const isEnabled = campaign.registration_enabled !== false;

  return (
    <div className="flex items-center justify-between p-3 bg-muted/70 rounded-lg border border-border mb-2">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-destructive/10'}`}>
          {isEnabled ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-destructive" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Registration</p>
          <p className={`text-xs ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {isEnabled 
              ? 'Open for registrations' 
              : 'Closed - visitors see registration closed page'}
          </p>
        </div>
      </div>
      <Switch
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={saving}
      />
    </div>
  );
};

export default CampaignDetail;
