import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle, XCircle, Loader2, ArrowLeft, Home } from 'lucide-react';
import api from '../services/api';
import { formatServerDate } from '../utils/serverTime';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState(null);

  const paymentId = searchParams.get('payment_id');
  const registrationId = searchParams.get('registration_id');

  useEffect(() => {
    const fetchPaymentDetails = async () => {
      if (!paymentId) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/payments/status/${paymentId}`);
        setPaymentDetails(response.data);
      } catch (error) {
        console.error('Error fetching payment details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentDetails();
  }, [paymentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-slate-600">Loading payment details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-green-600 mb-2">Payment Successful!</h1>
        <p className="text-slate-600 mb-6">Your registration has been confirmed.</p>

        {paymentDetails && (
          <div className="bg-slate-50 rounded-xl p-5 text-left mb-6">
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wider mb-3">
              Payment Details
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid</span>
                <span className="font-semibold text-lg">₹{paymentDetails.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium bg-green-100 text-green-700">
                  {paymentDetails.status}
                </span>
              </div>
              {paymentDetails.gateway_payment_id && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction ID</span>
                  <span className="font-mono text-xs">{paymentDetails.gateway_payment_id}</span>
                </div>
              )}
              {paymentDetails.paid_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid At</span>
                  <span className="text-sm">{formatServerDate(paymentDetails.paid_at, 'dd MMM yyyy, hh:mm a')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            A confirmation email has been sent to your registered email address.
          </p>
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => navigate('/campaigns')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaigns
            </Button>
            <Button 
              className="flex-1"
              onClick={() => navigate('/')}
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const PaymentFailed = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const error = searchParams.get('error');

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'missing_id':
        return 'Payment information is missing.';
      case 'not_found':
        return 'Payment record not found.';
      case 'verification_failed':
        return 'Payment verification failed.';
      default:
        return 'Something went wrong with your payment.';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-red-600 mb-2">Payment Failed</h1>
        <p className="text-slate-600 mb-6">{getErrorMessage(error)}</p>

        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Don't worry, no amount has been deducted from your account.
            Please try again or contact support if the issue persists.
          </p>
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button 
              className="flex-1"
              onClick={() => navigate('/campaigns')}
            >
              Try Again
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const PaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState(null);

  const paymentId = searchParams.get('payment_id');

  useEffect(() => {
    const fetchPaymentStatus = async () => {
      if (!paymentId) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/payments/status/${paymentId}`);
        setPaymentDetails(response.data);

        // Redirect based on status
        if (response.data.status === 'completed') {
          navigate(`/payment-success?payment_id=${paymentId}`, { replace: true });
        }
      } catch (error) {
        console.error('Error fetching payment status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentStatus();

    // Poll for status updates every 3 seconds
    const interval = setInterval(fetchPaymentStatus, 3000);

    return () => clearInterval(interval);
  }, [paymentId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-slate-600">Checking payment status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-6">
          <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
        </div>
        
        <h1 className="text-2xl font-bold text-yellow-600 mb-2">Payment Processing</h1>
        <p className="text-slate-600 mb-6">
          Your payment is being processed. Please wait...
        </p>

        {paymentDetails && (
          <div className="bg-slate-50 rounded-xl p-5 text-left mb-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold">₹{paymentDetails.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium bg-yellow-100 text-yellow-700">
                  {paymentDetails.status}
                </span>
              </div>
            </div>
          </div>
        )}

        <p className="text-sm text-slate-500">
          This page will automatically update when payment is confirmed.
        </p>
      </Card>
    </div>
  );
};

export { PaymentSuccess, PaymentFailed, PaymentStatus };
