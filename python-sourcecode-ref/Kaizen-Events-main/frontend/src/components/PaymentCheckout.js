import React, { useState, useCallback, useEffect } from 'react';
import { useRazorpay } from 'react-razorpay';
import { Button } from '../components/ui/button';
import { Loader2, CheckCircle, XCircle, CreditCard, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';

const PaymentCheckout = ({ 
  campaignId, 
  registrationId, 
  amount, 
  buyerName, 
  buyerEmail, 
  buyerPhone,
  purpose = "Event Registration",
  onPaymentSuccess,
  onPaymentFailure 
}) => {
  const { error: razorpayError, isLoading: razorpayLoading, Razorpay } = useRazorpay();
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null); // null, 'processing', 'success', 'failed'
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [initError, setInitError] = useState(null);

  // Handle Razorpay loading errors
  useEffect(() => {
    if (razorpayError) {
      setInitError('Failed to load payment gateway. Please refresh and try again.');
      console.error('Razorpay loading error:', razorpayError);
    }
  }, [razorpayError]);

  const initiatePayment = useCallback(async () => {
    // Check if Razorpay is loaded
    if (!Razorpay) {
      toast.error('Payment gateway not ready. Please wait...');
      return;
    }

    setLoading(true);
    setPaymentStatus('processing');

    try {
      // Create payment order
      const response = await api.post('/payments/create', {
        campaign_id: campaignId,
        registration_id: registrationId,
        amount: amount,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
        purpose: purpose
      });

      const paymentData = response.data;

      if (paymentData.gateway === 'razorpay') {
        // Handle Razorpay payment
        const options = {
          key: paymentData.razorpay_key_id,
          amount: paymentData.amount * 100, // Amount in paise
          currency: paymentData.currency || 'INR',
          name: 'Kaizen Events',
          description: purpose,
          order_id: paymentData.order_id,
          handler: async (response) => {
            // Verify payment on backend
            try {
              const verifyResponse = await api.post('/payments/verify/razorpay', {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                payment_id: paymentData.payment_id
              });

              if (verifyResponse.data.success) {
                setPaymentStatus('success');
                setPaymentDetails({
                  paymentId: paymentData.payment_id,
                  gatewayPaymentId: response.razorpay_payment_id,
                  amount: paymentData.amount
                });
                toast.success('Payment successful!');
                onPaymentSuccess?.(paymentData.payment_id, response.razorpay_payment_id);
              } else {
                throw new Error('Payment verification failed');
              }
            } catch (verifyError) {
              console.error('Payment verification error:', verifyError);
              setPaymentStatus('failed');
              toast.error('Payment verification failed');
              onPaymentFailure?.('verification_failed');
            }
          },
          prefill: {
            name: buyerName,
            email: buyerEmail,
            contact: buyerPhone
          },
          theme: {
            color: '#091D40'
          },
          modal: {
            ondismiss: () => {
              setPaymentStatus(null);
              setLoading(false);
            }
          }
        };

        const razorpayInstance = new Razorpay(options);
        razorpayInstance.on('payment.failed', (response) => {
          console.error('Razorpay payment failed:', response.error);
          setPaymentStatus('failed');
          toast.error(response.error.description || 'Payment failed');
          onPaymentFailure?.(response.error.code);
        });
        razorpayInstance.open();
        setLoading(false);

      } else if (paymentData.gateway === 'instamojo') {
        // Redirect to Instamojo payment page
        if (paymentData.payment_url) {
          window.location.href = paymentData.payment_url;
        } else {
          throw new Error('Payment URL not received');
        }
      } else if (paymentData.gateway === 'cashfree' && paymentData.method === 'kaizen_proxy_form_post') {
        // Kaizen-hosted Cashfree proxy (KaizenManaged + vendor splits).
        // Submit a hidden POST form to the proxy URL — user navigates away to checkout,
        // then returns to /payment-complete?order_id=...&status=...&signature=...
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = paymentData.form_action;
        form.style.display = 'none';
        Object.entries(paymentData.form_fields || {}).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type  = 'hidden';
          input.name  = name;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        // No setLoading(false) — page is navigating away
        return;

      } else if (paymentData.gateway === 'cashfree') {
        // Cashfree JS checkout
        if (!paymentData.payment_session_id) {
          throw new Error('Cashfree payment session not received');
        }

        // Load Cashfree JS SDK dynamically if not loaded
        if (!window.Cashfree) {
          const script = document.createElement('script');
          script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
          script.async = true;
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
          });
        }

        const cashfree = window.Cashfree({ mode: paymentData.cashfree_mode || 'sandbox' });
        const result = await cashfree.checkout({
          paymentSessionId: paymentData.payment_session_id,
          redirectTarget: '_modal',
        });

        if (result.error) {
          console.error('Cashfree payment error:', result.error);
          setPaymentStatus('failed');
          toast.error(result.error.message || 'Payment failed');
          onPaymentFailure?.(result.error.code);
        } else if (result.paymentDetails) {
          // Verify on backend
          try {
            const verifyResponse = await api.post('/registrations/payment/verify/cashfree', {
              registration_id: registrationId,
              order_id: paymentData.order_id,
            });

            if (verifyResponse.data.status === 'success') {
              setPaymentStatus('success');
              setPaymentDetails({
                paymentId: paymentData.payment_id,
                gatewayPaymentId: result.paymentDetails.cf_payment_id || paymentData.order_id,
                amount: paymentData.amount,
              });
              toast.success('Payment successful!');
              onPaymentSuccess?.(paymentData.payment_id, paymentData.order_id);
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (verifyError) {
            console.error('Cashfree verification error:', verifyError);
            setPaymentStatus('failed');
            toast.error('Payment verification failed');
            onPaymentFailure?.('verification_failed');
          }
        }
        setLoading(false);
      } else {
        throw new Error(`Unsupported payment gateway: ${paymentData.gateway}`);
      }

    } catch (error) {
      console.error('Payment initiation error:', error);
      setPaymentStatus('failed');
      setLoading(false);
      toast.error(error.response?.data?.detail || 'Failed to initiate payment');
      onPaymentFailure?.('initiation_failed');
    }
  }, [Razorpay, campaignId, registrationId, amount, buyerName, buyerEmail, buyerPhone, purpose, onPaymentSuccess, onPaymentFailure]);

  const resetPayment = () => {
    setPaymentStatus(null);
    setPaymentDetails(null);
  };

  // Success state
  if (paymentStatus === 'success') {
    return (
      <div className="ke-card p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-outfit font-bold text-green-600 mb-2">Payment Successful!</h3>
        <p className="text-muted-foreground mb-4">Your registration is confirmed.</p>
        {paymentDetails && (
          <div className="bg-muted rounded-lg p-4 text-left text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium tabular-nums">₹{paymentDetails.amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID:</span>
              <span className="font-mono text-xs">{paymentDetails.gatewayPaymentId}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Failed state
  if (paymentStatus === 'failed') {
    return (
      <div className="ke-card p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-xl font-outfit font-bold text-red-600 mb-2">Payment Failed</h3>
        <p className="text-muted-foreground mb-4">Something went wrong with your payment.</p>
        <Button onClick={resetPayment} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  // Initialization error state
  if (initError) {
    return (
      <div className="ke-card p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h3 className="text-xl font-outfit font-bold text-amber-600 mb-2">Payment Gateway Error</h3>
        <p className="text-muted-foreground mb-4">{initError}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Refresh Page
        </Button>
      </div>
    );
  }

  // Default/Processing state
  return (
    <div className="ke-card p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <span
          className="ke-medallion mx-auto mb-3"
          style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
        >
          <CreditCard className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />
        </span>
        <h3 className="text-lg font-outfit font-semibold">Complete Payment</h3>
        <p className="text-muted-foreground text-sm mt-1">Secure payment powered by Razorpay/Instamojo</p>
      </div>

      {razorpayLoading && (
        <div className="bg-primary-subtle text-primary text-sm p-3 rounded-lg mb-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading payment gateway...
        </div>
      )}

      <div className="bg-muted rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-muted-foreground">Registration Fee</span>
          <span className="font-semibold tabular-nums">₹{amount}</span>
        </div>
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>For</span>
          <span>{buyerName}</span>
        </div>
      </div>

      <Button 
        onClick={initiatePayment} 
        disabled={loading || paymentStatus === 'processing' || razorpayLoading || !Razorpay}
        className="w-full"
        size="lg"
      >
        {loading || paymentStatus === 'processing' ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : razorpayLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            Pay ₹{amount}
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center mt-4">
        By proceeding, you agree to our terms and conditions
      </p>
    </div>
  );
};

export default PaymentCheckout;
