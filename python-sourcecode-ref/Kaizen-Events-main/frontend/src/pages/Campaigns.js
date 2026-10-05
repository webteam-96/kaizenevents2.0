import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Plus, Search, Filter, Download, ArrowRight, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { exportRegistrationsXlsx } from '../utils/exportRegistrations';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
// Server-relative upload URLs (/api/uploads/...) must be prefixed with the API origin,
// otherwise the browser hits the frontend host and nginx strips the wrong /api segment.
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${API_BASE_URL}${url}` : (url || '');

const Campaigns = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    filterCampaigns();
  }, [campaigns, searchQuery, statusFilter]);

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get('/campaigns');
      setCampaigns(response.data);
    } catch (error) {
      setError(true);
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const filterCampaigns = () => {
    let filtered = campaigns;

    if (searchQuery) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.organization_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    setFilteredCampaigns(filtered);
  };

  // Calculate net revenue after 2.95% gateway fee
  const calculateNetRevenue = (totalRevenue) => {
    const gatewayFee = totalRevenue * 0.0295;
    return totalRevenue - gatewayFee;
  };

  // Download Excel for a campaign. Shared client-side exporter: option labels
  // (never slugs), IST times, oldest-first — independent of the backend version.
  const handleDownloadExcel = async (campaign, e) => {
    e.stopPropagation(); // Prevent card click navigation
    try {
      const count = await exportRegistrationsXlsx(campaign);
      if (count === 0) {
        toast.error('No registrations to export');
        return;
      }
      toast.success('Excel exported successfully!');
    } catch (error) {
      toast.error('No registrations to export');
    }
  };

  // Shared navy hero header (kept identical across loading / error / ready states)
  const PageHeader = () => (
    <div className="ke-hero p-6 md:p-7 mb-5">
      <div className="ke-hero-grid" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">
            Event Management
          </div>
          <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Events</h1>
          <p className="text-white/70 text-sm font-jakarta mt-1.5">
            Manage all your event registrations.
          </p>
        </div>
        {isSuperAdmin() && (
          <Button
            onClick={() => navigate('/campaigns/create')}
            data-testid="create-campaign-button"
            className="rounded-lg h-10 font-jakarta font-semibold shadow-sm transition-all duration-200 hover:brightness-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Event
          </Button>
        )}
      </div>
    </div>
  );

  // LOADING STATE — skeleton page mirroring the real layout
  if (loading) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <PageHeader />
          {/* Filter bar skeleton */}
          <div className="ke-card p-5 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <Skeleton className="h-11 flex-1 rounded-lg" />
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-11 w-20 rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          {/* Grid skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ke-card overflow-hidden">
                <Skeleton className="h-40 w-full rounded-none" />
                <div className="p-5">
                  <div className="flex gap-1.5 mb-4">
                    <Skeleton className="h-5 w-14 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                  <div className="flex items-center gap-6 mb-5">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-20 rounded" />
                      <Skeleton className="h-6 w-12 rounded" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-16 rounded" />
                      <Skeleton className="h-6 w-16 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-10 flex-1 rounded-lg" />
                    <Skeleton className="h-10 w-11 rounded-lg" />
                    <Skeleton className="h-10 w-11 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ERROR STATE — distinct, with a retry
  if (error) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <PageHeader />
          <div className="ke-card p-12 text-center">
            <div className="max-w-md mx-auto">
              <span
                className="ke-medallion mx-auto mb-4"
                style={{ background: 'linear-gradient(150deg, hsl(var(--destructive) / 0.16), transparent 85%)' }}
              >
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </span>
              <h3 className="text-xl font-outfit font-semibold text-foreground mb-2">Couldn't load events</h3>
              <p className="text-muted-foreground font-jakarta mb-6">
                Something went wrong while fetching your events. Please check your connection and try again.
              </p>
              <Button
                onClick={fetchCampaigns}
                data-testid="retry-campaigns-button"
                className="bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <PageHeader />

        {/* Filters */}
        <div className="ke-card p-5 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="search-campaigns-input"
                className="pl-10 h-11 rounded-lg border-border focus-visible:ring-ring transition-all duration-200"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'draft', 'active', 'closed'].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(status)}
                  data-testid={`filter-${status}-button`}
                  className={`capitalize font-jakarta rounded-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    statusFilter === status
                      ? 'bg-primary hover:bg-primary-hover text-primary-foreground shadow-lg shadow-primary/20 dark:bg-white dark:text-[#091D40] dark:hover:bg-white/90 dark:shadow-none'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Campaigns Grid */}
        {filteredCampaigns.length === 0 ? (
          <div className="ke-card p-12 text-center">
            <div className="max-w-md mx-auto">
              <span
                className="ke-medallion mx-auto mb-4"
                style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
              >
                <Filter className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <h3 className="text-xl font-outfit font-semibold text-foreground mb-2">No events found</h3>
              <p className="text-muted-foreground font-jakarta mb-6">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters to find what you\'re looking for.'
                  : 'Get started by creating your first event.'}
              </p>
              {isSuperAdmin() && (
                <Button
                  onClick={() => navigate('/campaigns/create')}
                  className="rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Event
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                onClick={() => navigate(`/campaigns/${campaign.id}`)}
                data-testid={`campaign-card-${campaign.id}`}
                className="ke-card ke-card-hover cursor-pointer overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {/* Media header: image + overlaid status ribbon, fund tag, and title */}
                <div className="relative h-40 bg-gradient-to-br from-primary to-secondary overflow-hidden">
                  {(campaign.logo_url || campaign.event_logo) && (
                    <img
                      src={toAbsUrl(campaign.logo_url || campaign.event_logo)}
                      alt={campaign.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.05))' }}></div>

                  {/* Status ribbon — colored chips read over the media in both themes */}
                  <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-jakarta font-semibold shadow-sm capitalize backdrop-blur-sm ${
                    campaign.status === 'active' ? 'bg-green-600/90 text-white'
                      : campaign.status === 'draft' ? 'bg-muted/95 text-foreground'
                      : 'bg-destructive/90 text-destructive-foreground'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      campaign.status === 'active' ? 'bg-white'
                        : campaign.status === 'draft' ? 'bg-muted-foreground'
                        : 'bg-white'
                    }`}></span>
                    {campaign.status}
                  </span>

                  {/* Fund-mode tag */}
                  {campaign.fund_collection_mode && (
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-sm text-[11px] font-jakarta font-medium text-white bg-black/40 backdrop-blur-sm">
                      {campaign.fund_collection_mode === 'kaizen_managed' ? 'Kaizen Managed' : 'Direct'}
                    </span>
                  )}

                  {/* Title + org over the image */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-lg font-outfit font-bold text-white leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={campaign.name}>
                      {campaign.name}
                    </h3>
                    <p className="text-xs font-jakarta text-white/80 mt-0.5 truncate">
                      {campaign.organization_name}{campaign.slug ? ` · ${campaign.slug}` : ''}
                    </p>
                  </div>
                </div>

                {/* Body */}
                <div className="p-5">
                  {/* Meta pills.
                      A free event collects nothing, so naming a gateway on it is misleading — the
                      server still stores payment_gateway (the column is non-nullable and keeps its
                      'razorpay' default), so payment_enabled is the only honest signal here. Same
                      reason the collection method is hidden: there is nothing being collected. */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {campaign.payment_enabled === false ? (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-green-500/10 text-green-700 dark:text-green-400">
                        Free
                      </span>
                    ) : (
                      <>
                        {campaign.payment_gateway && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium capitalize bg-primary-subtle text-primary">
                            {campaign.payment_gateway}
                          </span>
                        )}
                        {campaign.payment_collection_method && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium capitalize bg-muted text-muted-foreground">
                            {campaign.payment_collection_method}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-[0.08em] font-jakarta font-semibold text-muted-foreground">Registrations</p>
                      <p className="text-xl font-outfit font-bold text-foreground mt-1 tabular-nums">
                        {campaign.current_registrations}
                        {campaign.max_registrations && (
                          <span className="text-sm text-muted-foreground">/{campaign.max_registrations}</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10.5px] uppercase tracking-[0.08em] font-jakarta font-semibold text-muted-foreground">Revenue</p>
                      <p className="text-xl font-outfit font-bold text-foreground mt-1 tabular-nums">
                        ₹{calculateNetRevenue(campaign.total_revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-5">
                    <Button
                      onClick={(e) => { e.stopPropagation(); navigate(`/campaigns/${campaign.id}`); }}
                      className="flex-1 justify-center bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-white dark:text-[#091D40] dark:hover:bg-white/90"
                    >
                      Manage
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); navigate(`/campaigns/${campaign.id}/registrations`); }}
                      className="border-border hover:bg-muted rounded-lg px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title="Registrations"
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => handleDownloadExcel(campaign, e)}
                      className="border-border hover:bg-muted rounded-lg px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title="Download Excel"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Campaigns;
