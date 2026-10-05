import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';

/**
 * Landing page for the user when they return from the Kaizen-hosted Cashfree proxy.
 * URL: /payment-complete?order_id=...&status=...&signature=...
 *
 * Flow:
 *   1. Read order_id, status, signature from query params
 *   2. POST to /api/payments/cashfree/return — backend verifies signature + double-checks with Cashfree
 *   3. Show success / failed / cancelled UI based on backend response
 */
const PaymentComplete = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState]               = useState('loading'); // loading | success | failed | error
  const [errorMessage, setErrorMessage] = useState('');
  const [registrationId, setRegistrationId] = useState(null);
  const [registrationNumber, setRegistrationNumber] = useState(null);

  useEffect(() => {
    const orderId   = (searchParams.get('order_id')  || '').trim();
    const status    = (searchParams.get('status')    || '').trim().toUpperCase();
    const signature = (searchParams.get('signature') || '').trim();

    if (!orderId || !status || !signature) {
      setState('error');
      setErrorMessage('Missing payment details in the URL. Please return to the registration page.');
      return;
    }

    api.post('/payments/cashfree/return', {
      order_id:  orderId,
      status:    status,
      signature: signature,
    })
      .then((res) => {
        const backendStatus = (res.data?.status || '').toLowerCase();
        if (backendStatus === 'completed') {
          setState('success');
          setRegistrationId(res.data?.registration_id || null);
          setRegistrationNumber(res.data?.registration_number || null);
        } else if (backendStatus === 'failed') {
          setState('failed');
        } else {
          setState('failed');
          setErrorMessage(`Gateway status: ${res.data?.gateway_status || backendStatus || 'unknown'}`);
        }
      })
      .catch((err) => {
        setState('error');
        setErrorMessage(err.response?.data?.detail || 'Could not verify payment. Contact support if money was deducted.');
      });
  }, [searchParams]);

  const renderIcon = () => {
    if (state === 'loading') return <Loader2 className="w-16 h-16 text-primary animate-spin" />;
    if (state === 'success') return <CheckCircle className="w-16 h-16 text-emerald-600" />;
    if (state === 'failed')  return <XCircle    className="w-16 h-16 text-red-600" />;
    return <AlertCircle className="w-16 h-16 text-amber-600" />;
  };

  const title = {
    loading: 'Verifying payment…',
    success: 'Payment successful!',
    failed:  'Payment was not completed',
    error:   'Verification error',
  }[state];

  const message = {
    loading: 'Please wait while we confirm your transaction with the payment gateway.',
    success: 'Your registration is now confirmed. A confirmation email is on its way.',
    failed:  errorMessage || 'The payment was cancelled or declined. You can try again anytime.',
    error:   errorMessage,
  }[state];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-10 text-center">
        <div className="flex justify-center mb-5">{renderIcon()}</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">{title}</h1>
        <p className="text-slate-600 mb-6 leading-relaxed">{message}</p>

        {state === 'success' && registrationId && (
          <p className="text-xs text-slate-400 font-mono mb-6">
            Registration ID: {registrationNumber || registrationId.slice(0, 8).toUpperCase()}
          </p>
        )}

        {state !== 'loading' && (
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary transition"
          >
            Go to Home
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentComplete;
