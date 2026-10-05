import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Public vendor self-onboarding page.
 * URL: /vendor-onboarding/{token}
 * Vendor opens link → fills KYC form → backend sends OTP to entered email →
 * vendor enters OTP → backend creates vendor in Cashfree → confirmation.
 */
const VendorOnboarding = () => {
  const { token } = useParams();

  const [state, setState]         = useState('loading');  // loading | form | otp | success | error
  const [errorMsg, setErrorMsg]   = useState('');
  const [context, setContext]     = useState(null);       // role, campaign_id, prefill from backend
  const [form, setForm]           = useState({});
  const [confirmAccount, setConfirmAccount] = useState('');
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [otpValue, setOtpValue]   = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resultStatus, setResultStatus] = useState('');

  // ── Load onboarding context ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE_URL}/api/cashfree-kyc/onboarding/${token}`)
      .then(res => {
        setContext(res.data);
        setForm(res.data.prefill || {});
        setState('form');
      })
      .catch(err => {
        setState('error');
        setErrorMsg(err.response?.data?.detail || 'This onboarding link is invalid or has expired.');
      });
  }, [token]);

  const validate = () => {
    if (!form.name?.trim())          return 'Name is required.';
    if (!form.email?.trim())         return 'Email is required.';
    if (!form.phone?.trim())         return 'Mobile number is required.';
    if (!form.account_holder?.trim()) return 'Account holder name is required.';
    if (!form.account_number?.trim()) return 'Account number is required.';
    if (form.account_number !== confirmAccount) return 'Account numbers do not match.';
    if (!form.ifsc?.trim())          return 'IFSC is required.';
    if (!form.pan?.trim())           return 'PAN is required.';
    if (!PAN_REGEX.test(form.pan.trim().toUpperCase())) return 'Invalid PAN format. Expected: ABCDE1234F';
    return null;
  };

  // ── Send OTP ────────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSubmittingOtp(true);
    try {
      await axios.post(`${API_BASE_URL}/api/cashfree-kyc/onboarding/${token}/send-otp`, {
        email: form.email.trim()
      });
      setState('otp');
      toast.success(`OTP sent to ${form.email}.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP.');
    } finally {
      setSubmittingOtp(false);
    }
  };

  // ── Verify OTP + submit ─────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (otpValue.trim().length !== 6) { toast.error('Enter the 6-digit OTP.'); return; }
    setVerifying(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/cashfree-kyc/onboarding/${token}/submit`,
        {
          name:           form.name.trim(),
          email:          form.email.trim(),
          phone:          form.phone.trim(),
          role:           context.vendor_role,
          campaign_id:    context.campaign_id,
          account_holder: form.account_holder.trim(),
          account_number: form.account_number.trim(),
          ifsc:           form.ifsc.trim().toUpperCase(),
          pan:            form.pan.trim().toUpperCase(),
          gst:            form.gst?.trim().toUpperCase() || null,
          otp:            otpValue.trim()
        }
      );
      setResultStatus(res.data.status || 'PENDING');
      setState('success');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed. Try again.');
    } finally {
      setVerifying(false);
    }
  };

  // ── Render states ───────────────────────────────────────────────────────────

  if (state === 'loading') {
    return <CenteredCard><Loader2 className="h-10 w-10 animate-spin text-primary" /></CenteredCard>;
  }

  if (state === 'error') {
    return (
      <CenteredCard>
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Link Invalid</h1>
        <p className="text-muted-foreground">{errorMsg}</p>
      </CenteredCard>
    );
  }

  if (state === 'success') {
    const isVerified = resultStatus === 'ACTIVE';
    return (
      <CenteredCard>
        <CheckCircle className="h-14 w-14 text-emerald-500 mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">
          {isVerified ? 'KYC Verified Successfully!' : 'Submitted, Pending Verification'}
        </h1>
        <p className="text-muted-foreground max-w-md text-center">
          {isVerified
            ? 'Your bank account has been verified by Cashfree. You\'re ready to receive payments.'
            : 'Your details have been submitted to Cashfree. Verification typically completes within a few hours via penny-drop. You can close this page now.'}
        </p>
      </CenteredCard>
    );
  }

  // OTP state
  if (state === 'otp') {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center p-4">
        <div className="ke-card max-w-sm w-full p-8">
          <div className="text-center mb-6">
            <span className="ke-medallion mx-auto mb-3" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
              <ShieldCheck className="h-6 w-6" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <h1 className="text-xl font-outfit font-bold text-foreground">Verify Your Email</h1>
            <p className="text-sm text-muted-foreground mt-1">A 6-digit code was sent to <strong>{form.email}</strong></p>
          </div>
          <div className="space-y-4">
            <div>
              <Label>OTP Code</Label>
              <Input
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                maxLength={6}
                autoFocus
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <Button onClick={handleVerify} disabled={verifying || otpValue.length !== 6} className="w-full">
              {verifying ? 'Submitting...' : 'Submit & Verify'}
            </Button>
            <Button variant="ghost" onClick={() => setState('form')} className="w-full">Back to form</Button>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="ke-atmos min-h-screen py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Vendor Onboarding</div>
            <h1 className="text-2xl md:text-[28px] font-outfit font-bold tracking-tight mt-1">Vendor KYC Form</h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">
              Please fill your bank and identity details. They are submitted to Cashfree for verification.
            </p>
          </div>
        </div>

        <div className="ke-card p-8">
          <div className="space-y-4">
            <Field label="Name on PAN Card" required>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="As printed on the PAN card" />
            </Field>
            <Field label="Pan Number" required>
              <Input value={form.pan || ''} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10} />
              {form.pan && !PAN_REGEX.test(form.pan) && (
                <p className="text-destructive text-xs mt-1">Invalid PAN format. Expected: ABCDE1234F</p>
              )}
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Mobile Number" required>
              <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>

            <div className="border-t border-border pt-4 mt-6">
              <h3 className="ke-section-title text-[15px]">Bank Account</h3>
              <div className="ke-rule-gold mt-2 mb-3" />
              <Field label="Account Holder Name" required>
                <Input value={form.account_holder || ''} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} />
              </Field>
              <Field label="Account Number" required>
                <Input value={form.account_number || ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
              </Field>
              <Field label="Confirm Account Number" required>
                <Input value={confirmAccount} onChange={(e) => setConfirmAccount(e.target.value)} />
                {confirmAccount && form.account_number !== confirmAccount && (
                  <p className="text-destructive text-xs mt-1">Account numbers don't match.</p>
                )}
              </Field>
              <Field label="IFSC Code" required>
                <Input value={form.ifsc || ''} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} placeholder="SBIN0001234" />
              </Field>
            </div>

            <Button onClick={handleSendOtp} disabled={submittingOtp} className="w-full mt-4">
              {submittingOtp ? 'Sending OTP...' : 'Continue → Verify via OTP'}
            </Button>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Secured by Kaizen Events. Bank details are sent directly to Cashfree for KYC. The Vendor ID is auto-generated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, required, children }) => (
  <div className="space-y-1.5 mb-3">
    <Label className="text-sm font-medium text-foreground">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    {children}
  </div>
);

const CenteredCard = ({ children }) => (
  <div className="ke-atmos min-h-screen flex items-center justify-center p-4">
    <div className="ke-card max-w-md w-full p-10 flex flex-col items-center text-center">
      {children}
    </div>
  </div>
);

export default VendorOnboarding;
