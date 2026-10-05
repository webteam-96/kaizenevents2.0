import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import {
  DollarSign, Loader2, Building2,
  CheckCircle, XCircle, Send,
  AlertTriangle, RefreshCw, ChevronsUpDown, Check,
  Banknote, CreditCard, ArrowDownToLine, ArrowUpFromLine, Percent, Wallet, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatServerDate } from '../utils/serverTime';
import { cn } from '../lib/utils';

// Brand + semantic colors expressed as design-token HSL bodies so every swatch
// resolves through the same tokens and re-skins in both light and dark mode.
const HUE = {
  navy: 'var(--chart-1)',
  gold: 'var(--accent)',
  red: 'var(--chart-3)',
  steel: 'var(--chart-4)',
  success: '152 58% 40%',
  warning: '38 92% 48%',
};
const solid = (v) => `hsl(${v})`;
const soft = (v) => `hsl(${v} / 0.14)`;

// Premium financial stat card: accent top-hairline, medallion, uppercase label, 28px value.
// Presentational only — `value` is passed as-is so the underlying number/format is untouched.
const StatCard = ({ icon: Icon, label, value, sub, accent, softBg }) => (
  <div className="ke-card relative p-5 overflow-hidden">
    <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">{label}</div>
        <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{value}</div>
        {sub && <div className="text-[11px] mt-1.5 font-jakarta text-muted-foreground">{sub}</div>}
      </div>
      {Icon && (
        <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${softBg}, transparent 85%)` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </span>
      )}
    </div>
  </div>
);

const FundTransfers = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [campaignsPending, setCampaignsPending] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Campaign filter with search
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);

  // Transfer form
  const [transferForm, setTransferForm] = useState({
    amount: '',
    notes: ''
  });

  // Complete form
  const [completeForm, setCompleteForm] = useState({
    transaction_reference: '',
    transfer_date: '',
    send_notification: true
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch stats when campaign filter changes
  useEffect(() => {
    if (!loading) {
      fetchStats();
    }
  }, [campaignFilter]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [statsRes, campaignsRes, transfersRes, allCampaignsRes] = await Promise.all([
        api.get('/fund-transfers/stats'),
        api.get('/fund-transfers/campaigns-pending'),
        api.get('/fund-transfers'),
        api.get('/campaigns')
      ]);

      setStats(statsRes.data);
      setCampaignsPending(campaignsRes.data);
      setTransfers(transfersRes.data);
      // Filter only kaizen_managed campaigns for the filter dropdown
      const kaizenCampaigns = allCampaignsRes.data.filter(c => c.fund_collection_mode === 'kaizen_managed');
      setAllCampaigns(kaizenCampaigns);
    } catch (error) {
      console.error('Failed to fetch fund transfer data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const params = campaignFilter !== 'all' ? { campaign_id: campaignFilter } : {};
      const statsRes = await api.get('/fund-transfers/stats', { params });
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const refreshData = async () => {
    await fetchInitialData();
    toast.success('Data refreshed');
  };

  // Filter transfers based on selected campaign
  const filteredTransfers = useMemo(() => {
    if (campaignFilter === 'all') {
      return transfers;
    }
    return transfers.filter(t => t.campaign_id === campaignFilter);
  }, [campaignFilter, transfers]);

  // Get selected campaign name for display
  const selectedCampaignName = useMemo(() => {
    if (campaignFilter === 'all') return 'All Events';
    const campaign = allCampaigns.find(c => c.id === campaignFilter);
    return campaign?.name || 'Select Event';
  }, [campaignFilter, allCampaigns]);

  const openTransferModal = (campaign) => {
    setSelectedCampaign(campaign);
    setTransferForm({
      amount: campaign.pending.toFixed(2),
      notes: ''
    });
    setShowTransferModal(true);
  };

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    if (!selectedCampaign) return;

    setSubmitting(true);
    try {
      await api.post('/fund-transfers', {
        campaign_id: selectedCampaign.campaign_id,
        amount: parseFloat(transferForm.amount),
        notes: transferForm.notes
      });

      toast.success('Transfer request submitted for approval');
      setShowTransferModal(false);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create transfer request');
    } finally {
      setSubmitting(false);
    }
  };

  const openCompleteModal = (transfer) => {
    setSelectedTransfer(transfer);
    setCompleteForm({
      transaction_reference: '',
      transfer_date: format(new Date(), 'yyyy-MM-dd'),
      send_notification: true
    });
    setShowCompleteModal(true);
  };

  const handleCompleteTransfer = async (e) => {
    e.preventDefault();
    if (!selectedTransfer) return;

    setSubmitting(true);
    try {
      await api.put(`/fund-transfers/${selectedTransfer.id}/complete`, {
        transaction_reference: completeForm.transaction_reference,
        transfer_date: completeForm.transfer_date,
        send_notification: completeForm.send_notification
      });

      toast.success('Transfer marked as completed');
      setShowCompleteModal(false);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNotification = async (transfer) => {
    try {
      await api.post(`/fund-transfers/${transfer.id}/send-notification`);
      toast.success(`Notification sent to ${transfer.notification_email}`);
      refreshData();
    } catch (error) {
      toast.error('Failed to send notification');
    }
  };

  const [syncing, setSyncing] = useState(false);

  const syncSettlements = async () => {
    try {
      setSyncing(true);
      await api.post('/fund-transfers/sync-all-settlements');
      toast.success('Settlement data synced from payment gateways');
      await fetchInitialData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to sync settlements');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_approval: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending Approval' },
      approved: { bg: 'bg-primary-subtle', text: 'text-primary', label: 'Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
      completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' }
    };
    const badge = badges[status] || badges.pending_approval;
    return (
      <span className={`px-2 py-1 rounded-sm text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-6">
          <div className="ke-hero-grid" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Fund Transfers</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5">Gateway fees are synced automatically when payments are verified</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={syncSettlements}
                disabled={syncing}
                title="Manually sync settlement data for old payments"
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta"
              >
                {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowDownToLine className="w-4 h-4 mr-2" />}
                Re-sync
              </Button>
              <Button
                onClick={refreshData}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Campaign Filter with Search */}
        <div className="mb-6">
          <Label className="text-sm text-muted-foreground mb-2 block">Filter by Event</Label>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={filterOpen}
                className="w-full md:w-[400px] justify-between bg-card"
              >
                <span className="truncate">{selectedCampaignName}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full md:w-[400px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search events..." />
                <CommandList>
                  <CommandEmpty>No event found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => {
                        setCampaignFilter('all');
                        setFilterOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          campaignFilter === 'all' ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-medium">All Events</span>
                    </CommandItem>
                    {allCampaigns.map((campaign) => (
                      <CommandItem
                        key={campaign.id}
                        value={campaign.name}
                        onSelect={() => {
                          setCampaignFilter(campaign.id);
                          setFilterOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            campaignFilter === campaign.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{campaign.name}</span>
                          <span className="text-xs text-muted-foreground">{campaign.organization_name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Stats Cards - financial stat cards with medallions */}
        {stats && (
          <div className="space-y-4 mb-8">
            {/* Row 1: Payment Collection & Gateway */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                icon={Banknote}
                label="Total Collected"
                accent={solid(HUE.navy)}
                softBg={soft(HUE.navy)}
                value={<>₹{stats.total_collected?.toLocaleString() || 0}</>}
                sub="Amount users paid"
              />
              <StatCard
                icon={CreditCard}
                label="Gateway Charges"
                accent={solid(HUE.red)}
                softBg={soft(HUE.red)}
                value={<>₹{stats.gateway_charges?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                sub="Payment gateway fee"
              />
              <StatCard
                icon={ArrowDownToLine}
                label="Gateway Settled"
                accent={solid(HUE.success)}
                softBg={soft(HUE.success)}
                value={<>₹{stats.gateway_settled?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                sub="Received in Kaizen's account"
              />
              <StatCard
                icon={Clock}
                label="Gateway Pending"
                accent={solid(HUE.warning)}
                softBg={soft(HUE.warning)}
                value={<>₹{stats.gateway_pending?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                sub="Yet to be settled by gateway"
              />
            </div>

            {/* Row 2: Platform Fee & Organizer Payments */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                icon={Percent}
                label="Platform Fee (2.95%)"
                accent={solid(HUE.gold)}
                softBg={soft(HUE.gold)}
                value={<>₹{stats.platform_fee?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                sub="Kaizen platform charges"
              />

              {/* Kaizen's Share - Only visible to Directors */}
              {user?.can_approve_transfers && (
                <StatCard
                  icon={Building2}
                  label="Kaizen's Share"
                  accent={solid(HUE.navy)}
                  softBg={soft(HUE.navy)}
                  value={<>₹{stats.kaizen_share?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                  sub="Platform fee - Gateway charges"
                />
              )}

              <StatCard
                icon={Wallet}
                label="Net Payable"
                accent={solid(HUE.steel)}
                softBg={soft(HUE.steel)}
                value={<>₹{stats.net_payable?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                sub="Settled - Kaizen's share"
              />

              <StatCard
                icon={ArrowUpFromLine}
                label="Paid to Organizer"
                accent={solid(HUE.success)}
                softBg={soft(HUE.success)}
                value={<>₹{stats.total_transferred?.toLocaleString() || 0}</>}
                sub="Transferred to organizer"
              />

              <StatCard
                icon={DollarSign}
                label="Pending to Organizer"
                accent={solid(HUE.warning)}
                softBg={soft(HUE.warning)}
                value={<>₹{stats.pending_transfer?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}</>}
                sub="Yet to transfer"
              />
            </div>
          </div>
        )}

        {/* Campaigns with Pending Transfers */}
        <div className="ke-card mb-8">
          <div className="p-6 border-b border-border">
            <h2 className="ke-section-title text-[17px]">Events with Pending Transfers</h2>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-sm text-muted-foreground">Events using Kaizen-managed fund collection</p>
          </div>

          {campaignsPending.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-muted-foreground">All transfers are up to date!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Event</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Collected</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Gateway Settled</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Platform Fee</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Payable</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaignsPending.map((campaign) => (
                    <tr key={campaign.campaign_id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-foreground">{campaign.campaign_name}</p>
                          <p className="text-sm text-muted-foreground">{campaign.organization_name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-foreground tabular-nums">
                        ₹{campaign.collected.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-green-600 tabular-nums">
                        ₹{(campaign.gateway_settled || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-primary tabular-nums">
                        ₹{campaign.platform_fee.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-foreground tabular-nums">
                        ₹{campaign.net_payable.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-green-600 tabular-nums">
                        ₹{campaign.transferred.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-orange-600 tabular-nums">
                        ₹{campaign.pending.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button
                          size="sm"
                          onClick={() => openTransferModal(campaign)}
                          className="rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105"
                          style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                        >
                          Create Transfer
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Transfers */}
        <div className="ke-card">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="ke-section-title text-[17px]">Transfer History</h2>
                <div className="ke-rule-gold mt-2 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {campaignFilter === 'all'
                    ? 'All transfer requests and their status'
                    : `Transfers for ${selectedCampaignName}`}
                </p>
              </div>
              {stats?.pending_approval_count > 0 && (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                  {stats.pending_approval_count} pending approval
                </span>
              )}
            </div>
          </div>

          {filteredTransfers.length === 0 ? (
            <div className="p-8 text-center">
              <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {campaignFilter === 'all' ? 'No transfers yet' : 'No transfers for selected event'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Request #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Event</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTransfers.map((transfer) => (
                    <tr key={transfer.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-muted-foreground">
                        {transfer.request_number}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-foreground text-sm">{transfer.campaign_name}</p>
                          <p className="text-xs text-muted-foreground">{transfer.organization_name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-foreground tabular-nums">
                        ₹{transfer.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(transfer.status)}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {transfer.transaction_reference || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {formatServerDate(transfer.created_at, 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {transfer.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openCompleteModal(transfer)}
                              className="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Complete
                            </Button>
                          )}
                          {transfer.status === 'completed' && !transfer.notification_sent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendNotification(transfer)}
                              className="text-primary border-primary-subtle hover:bg-primary-subtle"
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Notify
                            </Button>
                          )}
                          {transfer.status === 'rejected' && (
                            <span className="text-xs text-red-500">{transfer.rejection_reason}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Transfer Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Transfer Request</DialogTitle>
            <DialogDescription>
              {selectedCampaign && (
                <span>{selectedCampaign.campaign_name} - {selectedCampaign.organization_name}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTransfer} className="space-y-4">
            {selectedCampaign && (
              <div className="bg-muted rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Available for Transfer:</span>
                  <span className="font-semibold text-foreground tabular-nums">₹{selectedCampaign.pending.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Transfer Amount *</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  step="0.01"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="pl-8"
                  required
                />
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                placeholder="Settlement for registrations till..."
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">
                This request will be sent to a Director for approval before processing.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowTransferModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-primary hover:bg-primary">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Submit for Approval
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Complete Transfer Modal */}
      <Dialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Complete Transfer</DialogTitle>
            <DialogDescription>
              {selectedTransfer && (
                <span>Request #{selectedTransfer.request_number} - ₹{selectedTransfer.amount.toLocaleString()}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCompleteTransfer} className="space-y-4">
            {selectedTransfer?.bank_account_snapshot && (
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm font-medium text-foreground mb-2">Transfer To:</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{selectedTransfer.bank_account_snapshot.account_name}</p>
                  <p>{selectedTransfer.bank_account_snapshot.account_number_masked} | {selectedTransfer.bank_account_snapshot.bank_name}</p>
                  <p>IFSC: {selectedTransfer.bank_account_snapshot.ifsc_code}</p>
                </div>
              </div>
            )}

            <div>
              <Label>Transaction Reference *</Label>
              <Input
                value={completeForm.transaction_reference}
                onChange={(e) => setCompleteForm({ ...completeForm, transaction_reference: e.target.value })}
                placeholder="NEFT/IMPS/UPI Reference Number"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label>Transfer Date *</Label>
              <Input
                type="date"
                value={completeForm.transfer_date}
                onChange={(e) => setCompleteForm({ ...completeForm, transfer_date: e.target.value })}
                className="mt-1"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="send_notification"
                checked={completeForm.send_notification}
                onChange={(e) => setCompleteForm({ ...completeForm, send_notification: e.target.checked })}
                className="rounded border-border"
              />
              <Label htmlFor="send_notification" className="text-sm text-muted-foreground cursor-pointer">
                Send email notification to organizer ({selectedTransfer?.notification_email})
              </Label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCompleteModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Mark Completed
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FundTransfers;
