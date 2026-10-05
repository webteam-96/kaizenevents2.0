import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import NotificationSettings from '../components/NotificationSettings';
import WhatsAppTemplates from '../components/WhatsAppTemplates';
import GoogleSheetsSettings from '../components/GoogleSheetsSettings';
import OfflinePaymentSettings from '../components/OfflinePaymentSettings';
import EventVendorsSettings from '../components/EventVendorsSettings';
import RazorpayEventVendorsSettings from '../components/RazorpayEventVendorsSettings';
import CouponCodes from '../components/CouponCodes';
import { ArrowLeft, Bell, Sheet, Settings, Banknote, Users, MessageCircle, Ticket, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const CampaignSettings = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState('notifications');

  // Kiosk volunteers cannot access event settings
  useEffect(() => {
    if (user?.role === 'kiosk_volunteer') {
      navigate('/dashboard');
      return;
    }
    fetchCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, user?.role]);

  const fetchCampaign = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get(`/campaigns/${campaignId}`);
      setCampaign(response.data);
    } catch (err) {
      toast.error('Failed to load event');
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'sheets', label: 'Google Sheets', icon: Sheet },
    { id: 'offline', label: 'Offline Payments', icon: Banknote },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'vendors', label: 'Vendors', icon: Users },
  ];

  // Shared page chrome so loading / error / content share one layout — a navy hero band
  const Header = ({ subtitle }) => (
    <div className="ke-hero p-6 md:p-7 mb-5">
      <div className="ke-hero-grid" />
      <div className="relative">
        <Button
          variant="ghost"
          onClick={() => navigate(`/campaigns/${campaignId}`)}
          className="h-8 px-2 -ml-2 mb-3 text-white/70 hover:text-white hover:bg-white/10 rounded-lg font-jakarta focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to event
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Configuration</div>
            <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1 text-white">Event Settings</h1>
            {subtitle}
          </div>
          <span
            className="ke-medallion shrink-0"
            style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.30), transparent 85%)' }}
          >
            <Settings className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
          </span>
        </div>
      </div>
    </div>
  );

  // Loading state — skeletons that mirror the header, tab bar, and content panel
  if (loading) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <Header subtitle={<Skeleton className="h-4 w-40 mt-2 bg-white/20" />} />
          <div className="ke-card p-1.5 flex space-x-1 mb-5">
            {tabs.map((tab) => (
              <Skeleton key={tab.id} className="flex-1 h-10 rounded-md" />
            ))}
          </div>
          <div className="ke-card p-5 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state — distinct, with a retry action
  if (error) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <Header subtitle={<p className="text-sm font-jakarta text-white/70 mt-1.5">Unable to load event</p>} />
          <div className="ke-card p-10 flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-lg font-outfit font-semibold tracking-tight text-foreground">Couldn't load event settings</h2>
            <p className="text-sm font-jakarta text-muted-foreground mt-1 max-w-md">
              Something went wrong while fetching this event. Check your connection and try again.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <Button
                onClick={fetchCampaign}
                className="focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/campaigns')}
                className="focus-visible:ring-2 focus-visible:ring-ring"
              >
                Back to events
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <Header subtitle={<p className="text-sm font-jakarta text-white/70 mt-1.5">{campaign?.name}</p>} />

        {/* Tabs */}
        <div className="ke-glass sticky top-4 z-10 flex flex-wrap gap-1 p-1.5 rounded-xl mb-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[9rem] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-jakarta font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'notifications' && (
          <NotificationSettings campaignId={campaignId} campaignName={campaign?.name} />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppTemplates campaignId={campaignId} campaignName={campaign?.name} />
        )}

        {activeTab === 'sheets' && (
          <GoogleSheetsSettings campaignId={campaignId} campaignName={campaign?.name} />
        )}

        {activeTab === 'offline' && (
          <OfflinePaymentSettings campaignId={campaignId} campaignName={campaign?.name} />
        )}

        {activeTab === 'coupons' && (
          <CouponCodes campaignId={campaignId} campaignName={campaign?.name} />
        )}

        {activeTab === 'vendors' && campaign?.payment_gateway === 'cashfree' && (
          <EventVendorsSettings campaignId={campaignId} campaignName={campaign?.name} />
        )}
        {activeTab === 'vendors' && campaign?.payment_gateway === 'razorpay' && (
          <RazorpayEventVendorsSettings campaignId={campaignId} campaignName={campaign?.name} />
        )}
      </div>
    </div>
  );
};

export default CampaignSettings;
