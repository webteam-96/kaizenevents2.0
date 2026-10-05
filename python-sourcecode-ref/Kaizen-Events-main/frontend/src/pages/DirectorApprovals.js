import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  DollarSign, Loader2, Building2, 
  CheckCircle, XCircle, Clock, RefreshCw,
  AlertTriangle, CreditCard, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

const DirectorApprovals = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState({ transfers: [], change_requests: [], total_pending: 0 });
  const [selectedItem, setSelectedItem] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    try {
      setLoading(true);
      const response = await api.get('/fund-transfers/pending-approvals');
      setPendingApprovals(response.data);
    } catch (error) {
      console.error('Failed to fetch pending approvals:', error);
      if (error.response?.status === 403) {
        toast.error('You do not have approval permissions');
      } else {
        toast.error('Failed to load approvals');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedItem) return;
    
    setSubmitting(true);
    try {
      const endpoint = selectedItem.type === 'fund_transfer' 
        ? `/fund-transfers/${selectedItem.id}/approve`
        : `/fund-transfers/change-requests/${selectedItem.id}/approve`;
      
      await api.put(endpoint, { notes: approvalNotes });
      
      toast.success('Request approved successfully');
      setShowApproveModal(false);
      setApprovalNotes('');
      fetchPendingApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    
    setSubmitting(true);
    try {
      const endpoint = selectedItem.type === 'fund_transfer' 
        ? `/fund-transfers/${selectedItem.id}/reject`
        : `/fund-transfers/change-requests/${selectedItem.id}/reject`;
      
      await api.put(endpoint, { reason: rejectionReason });
      
      toast.success('Request rejected');
      setShowRejectModal(false);
      setRejectionReason('');
      fetchPendingApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject request');
    } finally {
      setSubmitting(false);
    }
  };

  const openApproveModal = (item) => {
    setSelectedItem(item);
    setApprovalNotes('');
    setShowApproveModal(true);
  };

  const openRejectModal = (item) => {
    setSelectedItem(item);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const getRequestTypeLabel = (type) => {
    const labels = {
      fund_transfer: 'Fund Transfer',
      bank_account: 'Bank Account Change',
      payment_gateway: 'Payment Gateway Change',
      fund_collection_mode: 'Fund Collection Mode Change'
    };
    return labels[type] || type;
  };

  const getRequestTypeIcon = (type) => {
    const icons = {
      fund_transfer: DollarSign,
      bank_account: Building2,
      payment_gateway: CreditCard,
      fund_collection_mode: Settings
    };
    const Icon = icons[type] || Clock;
    return <Icon className="w-5 h-5" />;
  };

  // Format fund collection mode value for display
  const formatFundCollectionMode = (mode) => {
    const modeLabels = {
      'kaizen_managed': 'Kaizen Managed',
      'organizer_direct': 'Direct to Organizer'
    };
    return modeLabels[mode] || mode;
  };

  // Render human-readable change request values
  const renderChangeValue = (requestType, value, isCurrentValue = false) => {
    if (!value) return null;

    if (requestType === 'fund_collection_mode') {
      const mode = value.fund_collection_mode;
      return (
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-sm text-sm font-medium ${
            mode === 'kaizen_managed'
              ? 'bg-primary-subtle text-primary'
              : 'bg-muted text-foreground'
          }`}>
            {formatFundCollectionMode(mode)}
          </span>
          {mode === 'kaizen_managed' && (
            <span className="text-xs text-muted-foreground">2.95% platform fee</span>
          )}
          {mode === 'organizer_direct' && (
            <span className="text-xs text-muted-foreground">No platform fee</span>
          )}
        </div>
      );
    }

    if (requestType === 'bank_account') {
      return (
        <div className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Account:</span> {value.account_name}</p>
          <p><span className="text-muted-foreground">Number:</span> {value.account_number_masked || value.account_number}</p>
          <p><span className="text-muted-foreground">Bank:</span> {value.bank_name}</p>
          <p><span className="text-muted-foreground">IFSC:</span> {value.ifsc_code}</p>
        </div>
      );
    }

    if (requestType === 'payment_gateway') {
      return (
        <div className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Gateway:</span> {value.gateway_type || value.payment_gateway}</p>
          {value.account_id && <p><span className="text-muted-foreground">Account:</span> {value.account_id}</p>}
        </div>
      );
    }

    // Fallback for unknown types
    return (
      <pre className="text-xs whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading approvals…</p>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      {/* Hero header */}
      <div className="ke-hero p-6 md:p-7 mb-5">
        <div className="ke-hero-grid" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Governance</div>
            <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Director Approvals</h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">Review and approve pending fund transfers and change requests.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 h-10 px-4 rounded-lg bg-white/10 border border-white/20 text-white font-jakarta text-sm">
              <Clock className="w-4 h-4" />
              <span><span className="font-semibold tabular-nums">{pendingApprovals.total_pending}</span> Pending</span>
            </div>
            <Button
              onClick={fetchPendingApprovals}
              className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
              style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div>
        {pendingApprovals.total_pending === 0 ? (
          <div className="ke-card p-12 text-center max-w-lg mx-auto">
            <span
              className="ke-medallion mx-auto mb-4"
              style={{ background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.18), transparent 85%)' }}
            >
              <CheckCircle className="w-6 h-6" style={{ color: 'hsl(152 58% 40%)' }} />
            </span>
            <h3 className="text-xl font-outfit font-bold text-foreground mb-2">All Caught Up!</h3>
            <p className="text-muted-foreground font-jakarta">No pending approvals at the moment.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Fund Transfer Requests */}
            {pendingApprovals.transfers.length > 0 && (
              <div>
                <h3 className="ke-section-title text-[15px]">
                  Fund Transfer Requests ({pendingApprovals.transfers.length})
                </h3>
                <div className="ke-rule-gold mt-2 mb-3" />
                <div className="space-y-4">
                  {pendingApprovals.transfers.map((transfer) => (
                    <div key={transfer.id} className="ke-card p-5 overflow-hidden">
                      <div>
                        <div className="flex items-start justify-between mb-4 gap-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="ke-medallion shrink-0"
                              style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
                            >
                              <DollarSign className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                            </span>
                            <div>
                              <p className="font-semibold text-foreground">{transfer.campaign_name}</p>
                              <p className="text-sm text-muted-foreground">{transfer.organization_name}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[28px] leading-none font-outfit font-bold text-foreground tabular-nums">₹{transfer.amount.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground mt-1.5">Request #{transfer.request_number}</p>
                          </div>
                        </div>

                        {transfer.bank_account_snapshot && (
                          <div className="bg-muted rounded-lg p-4 mb-4">
                            <p className="text-sm font-medium text-foreground mb-2">Transfer To:</p>
                            <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2">
                              <p><span className="text-muted-foreground/70">Account:</span> {transfer.bank_account_snapshot.account_name}</p>
                              <p><span className="text-muted-foreground/70">Number:</span> {transfer.bank_account_snapshot.account_number_masked}</p>
                              <p><span className="text-muted-foreground/70">Bank:</span> {transfer.bank_account_snapshot.bank_name}</p>
                              <p><span className="text-muted-foreground/70">IFSC:</span> {transfer.bank_account_snapshot.ifsc_code}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-sm text-muted-foreground gap-4">
                          <p>Requested by {transfer.created_by_name} on {formatServerDate(transfer.created_at, 'dd MMM yyyy, h:mm a')}</p>
                          {transfer.notes && <p className="italic">"{transfer.notes}"</p>}
                        </div>

                        <div className="flex gap-3 mt-4 pt-4 border-t border-border">
                          <Button
                            onClick={() => openRejectModal({ ...transfer, type: 'fund_transfer' })}
                            variant="outline"
                            className="flex-1 rounded-lg text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            onClick={() => openApproveModal({ ...transfer, type: 'fund_transfer' })}
                            className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve Transfer
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Requests */}
            {pendingApprovals.change_requests.length > 0 && (
              <div>
                <h3 className="ke-section-title text-[15px]">
                  Change Requests ({pendingApprovals.change_requests.length})
                </h3>
                <div className="ke-rule-gold mt-2 mb-3" />
                <div className="space-y-4">
                  {pendingApprovals.change_requests.map((request) => (
                    <div key={request.id} className="ke-card p-5 overflow-hidden">
                      <div>
                        <div className="flex items-start justify-between mb-4 gap-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="ke-medallion shrink-0"
                              style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)', color: 'hsl(var(--primary))' }}
                            >
                              {getRequestTypeIcon(request.request_type)}
                            </span>
                            <div>
                              <p className="font-semibold text-foreground">{getRequestTypeLabel(request.request_type)}</p>
                              <p className="text-sm text-muted-foreground">{request.campaign_name} - {request.organization_name}</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground shrink-0">Request #{request.request_number}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {request.current_value && (
                            <div className="bg-red-50 dark:bg-red-500/10 rounded-lg p-4 border border-red-100 dark:border-red-500/20">
                              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-3 uppercase tracking-wide">Current</p>
                              <div className="text-foreground">
                                {renderChangeValue(request.request_type, request.current_value, true)}
                              </div>
                            </div>
                          )}
                          <div className="bg-green-50 dark:bg-green-500/10 rounded-lg p-4 border border-green-100 dark:border-green-500/20">
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-3 uppercase tracking-wide">New</p>
                            <div className="text-foreground">
                              {renderChangeValue(request.request_type, request.new_value, false)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm text-muted-foreground gap-4">
                          <p>Requested by {request.created_by_name} on {formatServerDate(request.created_at, 'dd MMM yyyy, h:mm a')}</p>
                          <p className="italic">Reason: "{request.reason}"</p>
                        </div>

                        <div className="flex gap-3 mt-4 pt-4 border-t border-border">
                          <Button
                            onClick={() => openRejectModal({ ...request, type: request.request_type })}
                            variant="outline"
                            className="flex-1 rounded-lg text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            onClick={() => openApproveModal({ ...request, type: request.request_type })}
                            className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve Change
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approve Modal */}
      <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              Approve Request
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this request?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Approval Notes (Optional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add any notes..."
                rows={3}
                className="mt-1"
              />
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowApproveModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm Approval
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="w-5 h-5" />
              Reject Request
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this request.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter the reason for rejection..."
                rows={3}
                className="mt-1"
                required
              />
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowRejectModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={submitting || !rejectionReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DirectorApprovals;
