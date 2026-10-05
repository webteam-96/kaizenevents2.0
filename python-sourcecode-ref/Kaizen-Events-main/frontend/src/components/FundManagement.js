import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  DollarSign, Building2, Loader2, CheckCircle, Clock,
  XCircle, Send, Edit2, Plus, AlertTriangle, RefreshCw,
  ArrowRight, Info,
  Banknote, CreditCard, Wallet, Percent, ArrowDownToLine, ArrowUpFromLine
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

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

const FundManagement = ({ campaignId, campaign }) => {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fundSummary, setFundSummary] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showModeChangeModal, setShowModeChangeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bank account form
  const [bankForm, setBankForm] = useState({
    account_name: '',
    account_number: '',
    confirm_account_number: '',
    ifsc_code: '',
    bank_name: '',
    notification_email: ''
  });

  // Transfer form
  const [transferForm, setTransferForm] = useState({
    amount: '',
    notes: ''
  });

  // Mode change form
  const [modeChangeForm, setModeChangeForm] = useState({
    new_mode: '',
    reason: ''
  });

  useEffect(() => {
    if (campaign?.fund_collection_mode === 'kaizen_managed') {
      fetchFundData();
    } else {
      setLoading(false);
    }
  }, [campaignId, campaign]);

  const fetchFundData = async () => {
    try {
      setLoading(true);
      const [summaryRes, transfersRes] = await Promise.all([
        api.get(`/fund-transfers/campaign/${campaignId}/summary`),
        api.get(`/fund-transfers/campaign/${campaignId}/transfers`)
      ]);

      setFundSummary(summaryRes.data);
      setTransfers(transfersRes.data);

      // Pre-fill bank form if exists
      if (summaryRes.data.bank_account) {
        setBankForm({
          account_name: summaryRes.data.bank_account.account_name || '',
          account_number: '',
          confirm_account_number: '',
          ifsc_code: summaryRes.data.bank_account.ifsc_code || '',
          bank_name: summaryRes.data.bank_account.bank_name || '',
          notification_email: summaryRes.data.bank_account.notification_email || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch fund data:', error);
      toast.error('Failed to load fund data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBankAccount = async (e) => {
    e.preventDefault();

    if (bankForm.account_number !== bankForm.confirm_account_number) {
      toast.error('Account numbers do not match');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = fundSummary?.has_bank_account
        ? `/fund-transfers/campaign/${campaignId}/bank-account`
        : `/fund-transfers/campaign/${campaignId}/bank-account`;

      const method = fundSummary?.has_bank_account ? 'put' : 'post';

      await api[method](endpoint, {
        campaign_id: campaignId,
        account_name: bankForm.account_name,
        account_number: bankForm.account_number,
        ifsc_code: bankForm.ifsc_code,
        bank_name: bankForm.bank_name,
        notification_email: bankForm.notification_email
      });

      toast.success('Bank account request submitted for approval');
      setShowBankModal(false);
      fetchFundData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save bank account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTransfer = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    try {
      await api.post('/fund-transfers', {
        campaign_id: campaignId,
        amount: parseFloat(transferForm.amount),
        notes: transferForm.notes
      });

      toast.success('Transfer request submitted for approval');
      setShowTransferModal(false);
      setTransferForm({ amount: '', notes: '' });
      fetchFundData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleModeChange = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    try {
      await api.post('/fund-transfers/change-requests', {
        campaign_id: campaignId,
        request_type: 'fund_collection_mode',
        current_value: { fund_collection_mode: campaign.fund_collection_mode },
        new_value: { fund_collection_mode: modeChangeForm.new_mode },
        reason: modeChangeForm.reason
      });

      toast.success('Mode change request submitted for approval');
      setShowModeChangeModal(false);
      setModeChangeForm({ new_mode: '', reason: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit change request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_approval: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock, label: 'Pending Approval' },
      approved: { bg: 'bg-primary-subtle', text: 'text-primary', icon: CheckCircle, label: 'Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Rejected' },
      completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Completed' }
    };
    const badge = badges[status] || badges.pending_approval;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  // If fund collection mode is not kaizen_managed, show minimal UI
  if (campaign?.fund_collection_mode !== 'kaizen_managed') {
    return (
      <div className="space-y-6">
        <div className="ke-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${soft(HUE.success)}, transparent 85%)` }}>
              <DollarSign className="w-5 h-5" style={{ color: solid(HUE.success) }} />
            </span>
            <div>
              <h3 className="font-outfit font-semibold text-foreground">Direct to Organizer</h3>
              <p className="text-sm text-muted-foreground">Payments go directly to organizer's payment gateway</p>
            </div>
          </div>

          {isSuperAdmin() && (
            <Button
              variant="outline"
              onClick={() => {
                setModeChangeForm({ new_mode: 'kaizen_managed', reason: '' });
                setShowModeChangeModal(true);
              }}
              className="mt-4"
            >
              Switch to Kaizen Managed
            </Button>
          )}
        </div>

        {/* Mode Change Modal */}
        <Dialog open={showModeChangeModal} onOpenChange={setShowModeChangeModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Change Fund Collection Mode</DialogTitle>
              <DialogDescription>
                Switch to Kaizen Managed fund collection
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleModeChange} className="space-y-4">
              <div className="bg-primary-subtle border border-primary-subtle rounded-lg p-4">
                <p className="text-sm text-primary">
                  <strong>Kaizen Managed:</strong> Kaizen will collect payments on behalf of the organizer
                  and transfer funds to their bank account (2.95% platform fee applies).
                </p>
              </div>

              <div>
                <Label>Reason for Change *</Label>
                <Textarea
                  value={modeChangeForm.reason}
                  onChange={(e) => setModeChangeForm({ ...modeChangeForm, reason: e.target.value })}
                  placeholder="Why are you changing the fund collection mode?"
                  rows={3}
                  required
                  className="mt-1"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-700">
                  This change requires Director approval.
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setShowModeChangeModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !modeChangeForm.reason} className="flex-1">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Submit for Approval
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section heading */}
      <div>
        <h3 className="ke-section-title text-[17px]">Fund Management</h3>
        <div className="ke-rule-gold mt-2" />
      </div>

      {/* Fund Summary */}
      {fundSummary?.view_type === 'super_admin' ? (
        // Super Admin sees full breakdown with gateway fees
        <div className="space-y-4">
          {/* Row 1: Collection & Gateway */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              icon={Banknote}
              label="Total Collected"
              accent={solid(HUE.navy)}
              softBg={soft(HUE.navy)}
              value={<>₹{(fundSummary?.total_collected || 0).toLocaleString()}</>}
              sub="Amount users paid"
            />
            <StatCard
              icon={CreditCard}
              label="Gateway Fees"
              accent={solid(HUE.red)}
              softBg={soft(HUE.red)}
              value={<>₹{(fundSummary?.gateway_fees || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              sub="Payment gateway charges"
            />
            <StatCard
              icon={ArrowDownToLine}
              label="Gateway Settled"
              accent={solid(HUE.success)}
              softBg={soft(HUE.success)}
              value={<>₹{(fundSummary?.gateway_settled || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              sub="In Kaizen's account"
            />
            <StatCard
              icon={Clock}
              label="Gateway Pending"
              accent={solid(HUE.warning)}
              softBg={soft(HUE.warning)}
              value={<>₹{(fundSummary?.gateway_pending || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              sub="With payment gateway"
            />
          </div>

          {/* Row 2: Platform Fee & Transfers */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              icon={Percent}
              label="Platform Fee (2.95%)"
              accent={solid(HUE.gold)}
              softBg={soft(HUE.gold)}
              value={<>₹{(fundSummary?.platform_fee || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              /* Kaizen's Share — only visible to Directors (matches /fund-transfers page) */
              sub={user?.can_approve_transfers
                ? <>Kaizen's share: ₹{(fundSummary?.kaizen_share || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>
                : null}
            />
            <StatCard
              icon={Wallet}
              label="Net Payable"
              accent={solid(HUE.steel)}
              softBg={soft(HUE.steel)}
              value={<>₹{(fundSummary?.net_payable || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              sub="To organizer"
            />
            <StatCard
              icon={ArrowUpFromLine}
              label="Transferred"
              accent={solid(HUE.success)}
              softBg={soft(HUE.success)}
              value={<>₹{(fundSummary?.transferred || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              sub="Paid to organizer"
            />
            <StatCard
              icon={DollarSign}
              label="Pending"
              accent={solid(HUE.warning)}
              softBg={soft(HUE.warning)}
              value={<>₹{(fundSummary?.pending || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
              sub="Yet to transfer"
            />
          </div>
        </div>
      ) : (
        // Org Admin sees simplified view
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={Banknote}
            label="Total Collections"
            accent={solid(HUE.navy)}
            softBg={soft(HUE.navy)}
            value={<>₹{(fundSummary?.total_collected || 0).toLocaleString()}</>}
            sub="Gross amount collected"
          />
          <StatCard
            icon={Percent}
            label="Amount Receivable"
            accent={solid(HUE.gold)}
            softBg={soft(HUE.gold)}
            value={<>₹{(fundSummary?.amount_receivable || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
            sub="After platform charges"
          />
          <StatCard
            icon={ArrowUpFromLine}
            label="Amount Received"
            accent={solid(HUE.success)}
            softBg={soft(HUE.success)}
            value={<>₹{(fundSummary?.amount_received || 0).toLocaleString()}</>}
            sub="Transferred to your account"
          />
          <StatCard
            icon={DollarSign}
            label="Pending Transfer"
            accent={solid(HUE.warning)}
            softBg={soft(HUE.warning)}
            value={<>₹{(fundSummary?.amount_pending || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
            sub="Yet to receive"
          />
        </div>
      )}

      {/* Bank Account Section */}
      <div className="ke-card">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${soft(HUE.navy)}, transparent 85%)` }}>
              <Building2 className="w-5 h-5" style={{ color: solid(HUE.navy) }} />
            </span>
            <div>
              <h3 className="font-outfit font-semibold text-foreground">Bank Account Details</h3>
              <p className="text-sm text-muted-foreground">
                {isSuperAdmin() ? 'Account for fund transfers' : 'Contact Super Admin to update'}
              </p>
            </div>
          </div>
          {isSuperAdmin() && (
            <Button variant="outline" size="sm" onClick={() => setShowBankModal(true)}>
              {fundSummary?.has_bank_account ? <Edit2 className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {fundSummary?.has_bank_account ? 'Edit' : 'Add'} Bank Account
            </Button>
          )}
        </div>

        {fundSummary?.bank_account ? (
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Account Name</p>
                <p className="font-medium text-foreground">{fundSummary.bank_account.account_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                <p className="font-medium text-foreground">{fundSummary.bank_account.account_number_masked}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">IFSC Code</p>
                <p className="font-medium text-foreground">{fundSummary.bank_account.ifsc_code}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                <p className="font-medium text-foreground">{fundSummary.bank_account.bank_name}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1">Notification Email</p>
              <p className="font-medium text-foreground">{fundSummary.bank_account.notification_email}</p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No bank account configured</p>
            {!isSuperAdmin() && (
              <p className="text-sm text-muted-foreground">
                For transfer inquiries, contact: <a href="mailto:accounts@kaizeninfotech.com" className="text-primary hover:underline">accounts@kaizeninfotech.com</a>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transfer Actions (Super Admin Only) */}
      {isSuperAdmin() && fundSummary?.pending > 0 && fundSummary?.has_bank_account && (
        <div className="ke-hero p-6">
          <div className="ke-hero-grid" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h3 className="font-outfit font-semibold text-white">Pending Transfer</h3>
              <p className="text-sm text-white/70 tabular-nums">
                ₹{fundSummary.pending.toLocaleString(undefined, { maximumFractionDigits: 0 })} available for transfer
              </p>
            </div>
            <Button
              onClick={() => {
                setTransferForm({ amount: fundSummary.pending.toFixed(2), notes: '' });
                setShowTransferModal(true);
              }}
              className="rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105"
              style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
            >
              Create Transfer Request
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Transfer History */}
      <div className="ke-card">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="ke-section-title text-[15px]">Transfer History</h3>
            <div className="ke-rule-gold mt-2" />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchFundData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {transfers.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No transfers yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatServerDate(transfer.created_at, 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-foreground tabular-nums">
                      ₹{transfer.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {transfer.transaction_reference || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(transfer.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mode Change Option (Super Admin Only) */}
      {isSuperAdmin() && (
        <div className="ke-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Current Mode: <span className="font-medium text-foreground">Kaizen Managed</span></p>
                <p className="text-xs text-muted-foreground">2.95% platform fee on all collections</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModeChangeForm({ new_mode: 'organizer_direct', reason: '' });
                setShowModeChangeModal(true);
              }}
              disabled={fundSummary?.pending > 0}
            >
              Change to Direct
            </Button>
          </div>
          {fundSummary?.pending > 0 && (
            <p className="text-xs text-orange-500 mt-2">
              Complete all pending transfers before changing fund collection mode
            </p>
          )}
        </div>
      )}

      {/* Bank Account Modal */}
      <Dialog open={showBankModal} onOpenChange={setShowBankModal}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {fundSummary?.has_bank_account ? 'Update' : 'Add'} Bank Account
            </DialogTitle>
            <DialogDescription>
              Enter bank account details for fund transfers
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveBankAccount} className="space-y-4">
            <div>
              <Label>Account Name *</Label>
              <Input
                value={bankForm.account_name}
                onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value })}
                placeholder="Name as per bank records"
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Account Number *</Label>
                <Input
                  value={bankForm.account_number}
                  onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                  placeholder="Account number"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Confirm Account Number *</Label>
                <Input
                  value={bankForm.confirm_account_number}
                  onChange={(e) => setBankForm({ ...bankForm, confirm_account_number: e.target.value })}
                  placeholder="Re-enter account number"
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IFSC Code *</Label>
                <Input
                  value={bankForm.ifsc_code}
                  onChange={(e) => setBankForm({ ...bankForm, ifsc_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., HDFC0001234"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Bank Name *</Label>
                <Input
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                  placeholder="e.g., HDFC Bank"
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Notification Email *</Label>
              <Input
                type="email"
                value={bankForm.notification_email}
                onChange={(e) => setBankForm({ ...bankForm, notification_email: e.target.value })}
                placeholder="Email for transfer notifications"
                required
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Transfer notifications will be sent to this email</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">
                Bank account changes require Director approval before taking effect.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowBankModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Submit for Approval
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Transfer Request</DialogTitle>
            <DialogDescription>
              Transfer funds to organizer's bank account
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTransfer} className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Available for Transfer:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{(fundSummary?.pending || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

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
                placeholder="Settlement notes..."
                rows={3}
                className="mt-1"
              />
            </div>

            {fundSummary?.bank_account && (
              <div className="bg-primary-subtle rounded-lg p-4">
                <p className="text-xs font-medium text-primary mb-2">Transfer To:</p>
                <p className="text-sm text-primary">
                  {fundSummary.bank_account.account_name} | {fundSummary.bank_account.account_number_masked}
                </p>
                <p className="text-xs text-primary">{fundSummary.bank_account.bank_name}</p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">
                This request will be sent to a Director for approval.
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

      {/* Mode Change Modal */}
      <Dialog open={showModeChangeModal} onOpenChange={setShowModeChangeModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Change Fund Collection Mode</DialogTitle>
            <DialogDescription>
              Switch to {modeChangeForm.new_mode === 'kaizen_managed' ? 'Kaizen Managed' : 'Direct to Organizer'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleModeChange} className="space-y-4">
            <div className={`border rounded-lg p-4 ${modeChangeForm.new_mode === 'kaizen_managed' ? 'bg-primary-subtle border-primary-subtle' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-sm ${modeChangeForm.new_mode === 'kaizen_managed' ? 'text-primary' : 'text-green-700'}`}>
                {modeChangeForm.new_mode === 'kaizen_managed'
                  ? 'Kaizen will collect payments and transfer to organizer (2.95% fee)'
                  : 'Payments will go directly to organizer\'s payment gateway'}
              </p>
            </div>

            <div>
              <Label>Reason for Change *</Label>
              <Textarea
                value={modeChangeForm.reason}
                onChange={(e) => setModeChangeForm({ ...modeChangeForm, reason: e.target.value })}
                placeholder="Why are you changing the fund collection mode?"
                rows={3}
                required
                className="mt-1"
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">
                This change requires Director approval.
              </p>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setShowModeChangeModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !modeChangeForm.reason} className="flex-1">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Submit for Approval
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FundManagement;
