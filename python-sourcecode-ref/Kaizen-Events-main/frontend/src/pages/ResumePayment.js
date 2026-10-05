import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Loader2, CheckCircle, AlertCircle, CreditCard, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import PaymentCheckout from '../components/PaymentCheckout';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Public page for completing a pending payment via a token-protected link.
 * URL: /pay/:registrationId?token=XXX
 */
const ResumePayment = () => {
  const { registrationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [reg, setReg]             = useState(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const fetchPending = async () => {
      if (!token) {
        setError('Missing or invalid payment link.');
        setLoading(false);
        return;
      }
      try {
        const resp = await axios.get(
          `${API_BASE_URL}/api/registrations/pending/${registrationId}`,
          { params: { token } }
        );
        if (resp.data?.already_paid) {
          setAlreadyPaid(true);
        } else {
          setReg(resp.data);
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'This payment link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };
    fetchPending();
  }, [registrationId, token]);

  const handlePaymentSuccess = () => {
    setCompleted(true);
    toast.success('Payment successful! Registration confirmed.');
  };

  const handlePaymentFailure = () => {
    toast.error('Payment failed. Please try again.');
  };

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Error (bad token / not found) ───────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Link Invalid</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button onClick={() => navigate('/')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  // ── Already paid ─────────────────────────────────────────────────
  if (alreadyPaid || completed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Payment Complete</h1>
          <p className="text-slate-600 mb-6">Your registration is confirmed. A receipt has been sent to your email.</p>
          <Button onClick={() => navigate('/')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  // ── Payment checkout (user clicked button) ───────────────────────
  if (showCheckout && reg) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <PaymentCheckout
            campaignId={reg.campaign_id}
            registrationId={reg.registration_id}
            amount={reg.total_amount}
            buyerName={reg.buyer_name}
            buyerEmail={reg.buyer_email}
            buyerPhone={reg.buyer_phone}
            purpose={`Registration for ${reg.campaign_name}`}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentFailure={handlePaymentFailure}
          />
        </div>
      </div>
    );
  }

  // ── Summary (initial view) ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary-subtle flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Complete Your Payment</h1>
          <p className="text-slate-600 text-sm">Your registration is pending payment. Click below to complete.</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-5 mb-6 space-y-3">
          <div className="flex justify-between items-start gap-4">
            <span className="text-sm text-slate-500">Event</span>
            <span className="text-sm font-medium text-right">{reg.campaign_name}</span>
          </div>
          {reg.organization_name && (
            <div className="flex justify-between items-start gap-4">
              <span className="text-sm text-slate-500">Organizer</span>
              <span className="text-sm font-medium text-right">{reg.organization_name}</span>
            </div>
          )}
          <div className="flex justify-between items-start gap-4">
            <span className="text-sm text-slate-500">Registrant</span>
            <span className="text-sm font-medium text-right">{reg.buyer_name}</span>
          </div>
          {reg.invoice_number && (
            <div className="flex justify-between items-start gap-4">
              <span className="text-sm text-slate-500">Invoice</span>
              <span className="text-xs font-mono text-right">{reg.invoice_number}</span>
            </div>
          )}
          <div className="flex justify-between items-start gap-4 pt-3 border-t border-slate-200">
            <span className="text-base font-semibold text-slate-900">Total Amount</span>
            <span className="text-xl font-bold text-primary">₹{Number(reg.total_amount).toFixed(2)}</span>
          </div>
        </div>

        <Button
          onClick={() => setShowCheckout(true)}
          className="w-full h-12 bg-primary hover:bg-primary text-base"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          Pay ₹{Number(reg.total_amount).toFixed(2)}
        </Button>

        <p className="text-xs text-slate-400 text-center mt-4">
          Secure payment powered by Razorpay / Cashfree / Instamojo
        </p>
      </Card>
    </div>
  );
};

export default ResumePayment;
