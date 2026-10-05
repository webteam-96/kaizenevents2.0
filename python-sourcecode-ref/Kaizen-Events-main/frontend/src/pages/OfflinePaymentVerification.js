import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  ArrowLeft, Search, CheckCircle, User, Mail, Phone, 
  CreditCard, Loader2, AlertCircle, Receipt, Clock,
  RefreshCw, UserX, Banknote
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

const OfflinePaymentVerification = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  
  // OTP Verification State
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [verifiedRegistration, setVerifiedRegistration] = useState(null);
  
  // Payment Confirmation State
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  
  const otpInputRefs = useRef([]);

  useEffect(() => {
    fetchCampaignAndPending();
  }, [campaignId]);

  const fetchCampaignAndPending = async () => {
    try {
      const [campaignRes, pendingRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/offline-payments/pending`)
      ]);
      
      setCampaign(campaignRes.data);
      setPendingPayments(pendingRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const refreshPending = async () => {
    setLoadingPending(true);
    try {
      const response = await api.get(`/campaigns/${campaignId}/offline-payments/pending`);
      setPendingPayments(response.data);
      toast.success('List refreshed');
    } catch (error) {
      toast.error('Failed to refresh');
    } finally {
      setLoadingPending(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6);
      const newOtp = [...otp];
      digits.split('').forEach((digit, i) => {
        if (index + i < 6) newOtp[index + i] = digit;
      });
      setOtp(newOtp);
      
      // Focus on next empty or last input
      const nextIndex = Math.min(index + digits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }
    
    if (/^\d?$/.test(value)) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      
      // Auto-focus next input
      if (value && index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtp = async () => {
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    
    setVerifying(true);
    try {
      const response = await api.post('/registrations/offline/verify-otp', {
        otp: otpString,
        campaign_id: campaignId
      });
      
      setVerifiedRegistration(response.data);
      setAmountReceived(response.data.amount_due.toString());
      toast.success(`OTP verified for ${response.data.registrant_name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
      setVerifiedRegistration(null);
    } finally {
      setVerifying(false);
    }
  };

  const confirmPayment = async () => {
    if (!verifiedRegistration) return;
    
    const amount = parseFloat(amountReceived);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    setConfirmingPayment(true);
    try {
      const response = await api.post('/registrations/offline/confirm-payment', {
        registration_id: verifiedRegistration.registration_id,
        amount_received: amount,
        notes: paymentNotes || null
      });
      
      setPaymentConfirmed(true);
      setReceiptNumber(response.data.receipt_number);
      toast.success('Payment confirmed successfully!');
      
      // Refresh pending list
      refreshPending();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm payment');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const resetVerification = () => {
    setOtp(['', '', '', '', '', '']);
    setVerifiedRegistration(null);
    setAmountReceived('');
    setPaymentNotes('');
    setPaymentConfirmed(false);
    setReceiptNumber('');
    otpInputRefs.current[0]?.focus();
  };

  const markNoShow = async (registrationId) => {
    if (!confirm('Mark this registration as no-show? This action cannot be undone.')) return;
    
    try {
      await api.post(`/registrations/${registrationId}/mark-no-show`);
      toast.success('Registration marked as no-show');
      refreshPending();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark as no-show');
    }
  };

  const resendOtp = async (registrationId) => {
    try {
      const response = await api.get(`/registrations/${registrationId}/resend-otp`);
      if (response.data.email_sent) {
        toast.success('OTP email resent successfully');
      } else {
        toast.warning('Email service not configured');
      }
    } catch (error) {
      toast.error('Failed to resend OTP');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Payment Confirmed Success View
  if (paymentConfirmed) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center p-4 md:p-6 lg:p-8">
        <div className="ke-card p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>

          <h2 className="text-2xl font-outfit font-bold text-foreground mb-2">
            Payment Confirmed!
          </h2>

          <p className="text-muted-foreground font-jakarta mb-6">
            Cash payment received from {verifiedRegistration?.registrant_name}
          </p>

          <div className="bg-muted rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
              <Receipt className="w-4 h-4" />
              <span className="text-sm font-jakarta uppercase tracking-[0.14em] text-[11px] font-semibold">Receipt Number</span>
            </div>
            <p className="text-xl font-mono font-bold text-primary tabular-nums">{receiptNumber}</p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground mb-6">
            <p><strong className="text-foreground">Amount:</strong> <span className="tabular-nums">₹{amountReceived}</span></p>
            <p><strong className="text-foreground">Registrant:</strong> {verifiedRegistration?.registrant_name}</p>
          </div>

          <Button
            onClick={resetVerification}
            className="w-full bg-primary hover:bg-primary-hover"
          >
            Verify Next Registration
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      {/* Hero header */}
      <div className="ke-hero p-6 md:p-7 mb-6">
        <div className="ke-hero-grid" />
        <div className="relative">
          <button
            onClick={() => navigate(`/campaigns/${campaignId}`)}
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-jakarta mb-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to event
          </button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Offline Payments</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Payment Verification</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5">{campaign?.name}</p>
            </div>
            <Button
              onClick={refreshPending}
              disabled={loadingPending}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loadingPending ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* OTP Verification Section */}
          <div className="space-y-6">
            <div className="ke-card p-6">
              <h2 className="ke-section-title text-lg mb-1">
                Enter Registration OTP
              </h2>
              <div className="ke-rule-gold mb-4" />

              {/* OTP Input */}
              <div className="flex justify-center gap-2 mb-6">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => (otpInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-mono font-bold border-border focus-visible:ring-primary"
                    disabled={verifiedRegistration && !paymentConfirmed}
                  />
                ))}
              </div>
              
              {!verifiedRegistration ? (
                <Button
                  onClick={verifyOtp}
                  disabled={verifying || otp.join('').length !== 6}
                  className="w-full bg-primary hover:bg-primary-hover"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Verify OTP
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={resetVerification}
                  className="w-full"
                >
                  Clear & Enter New OTP
                </Button>
              )}
            </div>

            {/* Verified Registration Details */}
            {verifiedRegistration && (
              <div className="ke-card p-6 border-green-200 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-green-600 mb-4">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold font-jakarta">OTP Verified Successfully</span>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <User className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground font-jakarta">Name</p>
                      <p className="font-medium text-foreground">{verifiedRegistration.registrant_name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground font-jakarta">Email</p>
                      <p className="font-medium text-foreground">{verifiedRegistration.registrant_email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Phone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground font-jakarta">Phone</p>
                      <p className="font-medium text-foreground">{verifiedRegistration.registrant_phone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground font-jakarta">Amount Due</p>
                      <p className="text-2xl font-bold text-primary tabular-nums">₹{verifiedRegistration.amount_due.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                
                {/* Payment Confirmation */}
                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="ke-section-title text-[15px] mb-1">Confirm Cash Payment</h3>
                  <div className="ke-rule-gold mb-4" />
                  
                  <div className="space-y-4">
                    <div>
                      <Label className="text-foreground font-jakarta text-sm mb-2 block">
                        Amount Received (₹)
                      </Label>
                      <Input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="Enter amount received"
                        className="h-11"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-foreground font-jakarta text-sm mb-2 block">
                        Notes (Optional)
                      </Label>
                      <Input
                        type="text"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Any additional notes..."
                        className="h-11"
                      />
                    </div>
                    
                    <Button
                      onClick={confirmPayment}
                      disabled={confirmingPayment || !amountReceived}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {confirmingPayment ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Confirm Payment Received
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pending Payments List */}
          <div>
            <div className="ke-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between bg-muted">
                <h2 className="ke-section-title text-lg">
                  Pending Offline Payments
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshPending}
                  disabled={loadingPending}
                  className="text-muted-foreground"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingPending ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                {pendingPayments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
                    <p className="font-jakarta">No pending offline payments</p>
                  </div>
                ) : (
                  pendingPayments.map((payment) => (
                    <div key={payment.registration_id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-foreground font-jakarta">
                            {payment.registrant_name}
                          </p>
                          <p className="text-sm text-muted-foreground font-jakarta">
                            {payment.registrant_email}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm font-semibold text-primary tabular-nums">
                              ₹{payment.amount_due.toFixed(2)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-sm ${
                              payment.otp_status === 'verified' 
                                ? 'bg-green-100 text-green-700'
                                : payment.otp_status === 'expired'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {payment.otp_status === 'verified' ? 'Verified' : 
                               payment.otp_status === 'expired' ? 'Expired' : 'Pending'}
                            </span>
                          </div>
                          {payment.otp_expires_at && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Expires: {formatServerDate(payment.otp_expires_at, 'MMM dd, yyyy')}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resendOtp(payment.registration_id)}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            <Mail className="w-3 h-3 mr-1" />
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markNoShow(payment.registration_id)}
                            className="text-xs text-muted-foreground hover:text-red-600"
                          >
                            <UserX className="w-3 h-3 mr-1" />
                            No-Show
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfflinePaymentVerification;
