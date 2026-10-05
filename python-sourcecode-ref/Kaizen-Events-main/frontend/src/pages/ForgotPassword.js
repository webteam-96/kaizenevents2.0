import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PasswordInput from '../components/ui/PasswordInput';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  Mail, Lock, ArrowRight, Zap, ShieldCheck,
  RefreshCw, HeadphonesIcon, KeyRound,
} from 'lucide-react';
import api from '../services/api';
import Footer from '../components/Footer';

const NAVY    = '#091D40';
const CRIMSON = '#AC1E20';
const GOLD    = '#CC9C4C';
const IVORY   = '#F7F7F5';

const FEATURES = [
  {
    icon: Zap,
    title: 'Quick & Easy',
    desc: 'Reset your password in just a few clicks.',
    iconBg: '#FEF3E2',
    iconColor: GOLD,
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Safe',
    desc: 'We go above and beyond to keep your account safe.',
    iconBg: '#EAF0FF',
    iconColor: NAVY,
  },
  {
    icon: RefreshCw,
    title: 'Get Back Instantly',
    desc: 'Access your account and continue managing events seamlessly.',
    iconBg: '#FDF2F2',
    iconColor: CRIMSON,
  },
];

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep]                       = useState(1);
  const [email, setEmail]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [code, setCode]                       = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRequestCode = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Please enter your email.'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset-request', { email: email.trim() });
      toast.success(res.data?.detail || 'If that email is registered, a reset code has been sent.');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!code.trim())                    { toast.error('Enter the code from your email.'); return; }
    if (!newPassword)                    { toast.error('Enter a new password.');            return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match.');         return; }
    setLoading(true);
    try {
      await api.post('/auth/password-reset-confirm', {
        email:        email.trim(),
        code:         code.trim(),
        new_password: newPassword,
      });
      toast.success('Password reset successfully. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>

      {/* ── Top Nav ── */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-4 bg-white shadow-sm flex-shrink-0">
        <Link to="/" className="flex items-center">
          <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-9 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-gray-500 hidden sm:block hover:text-gray-800 transition-colors">
            Back to Sign In
          </Link>
          <Link to="/login">
            <Button
              size="sm"
              className="rounded-sm px-5 text-sm font-semibold text-white"
              style={{ background: NAVY }}
            >
              Login
            </Button>
          </Link>
        </div>
      </nav>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Panel ── */}
        <div className="hidden lg:flex flex-col justify-between w-[46%] xl:w-[44%] bg-white px-10 xl:px-14 py-12 relative overflow-hidden">
          {/* Soft background circle */}
          <div
            className="absolute bottom-0 left-0 w-[420px] h-[420px] rounded-full opacity-30 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${IVORY} 0%, transparent 70%)`, transform: 'translate(-30%, 30%)' }}
          />

          <div className="relative z-10">
            <div className="mb-8">
              <h1 className="text-3xl xl:text-4xl font-extrabold text-gray-900 leading-tight mb-2">
                Forgot Password?
              </h1>
              <p className="text-xl font-bold" style={{ color: NAVY }}>
                No worries, we've got you!
              </p>
              <p className="text-sm text-gray-500 mt-3 leading-relaxed max-w-xs">
                Enter your registered email address and we'll send you a secure link to reset your password.
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-6">
              {FEATURES.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                    <Icon className="w-5 h-5" style={{ color: iconColor }} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">{title}</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lock illustration */}
          <div className="relative z-10 flex justify-center mt-10">
            <div className="relative">
              {/* Outer glow ring */}
              <div className="w-44 h-44 rounded-full flex items-center justify-center"
                style={{ background: `radial-gradient(circle, ${IVORY} 0%, #EAF0FF 100%)` }}>
                {/* Inner circle */}
                <div className="w-28 h-28 rounded-full flex items-center justify-center shadow-xl"
                  style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0D2558 100%)` }}>
                  <Lock className="w-12 h-12 text-white" />
                </div>
              </div>
              {/* Floating mail badge */}
              <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: GOLD }}>
                <Mail className="w-5 h-5 text-white" />
              </div>
              {/* Floating dots */}
              <div className="absolute top-2 -left-4 w-3 h-3 rounded-full" style={{ background: CRIMSON, opacity: 0.7 }} />
              <div className="absolute -bottom-2 left-6 w-2 h-2 rounded-full" style={{ background: NAVY, opacity: 0.5 }} />
              <div className="absolute bottom-4 -right-5 w-4 h-4 rounded-full" style={{ background: GOLD, opacity: 0.5 }} />
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-10 py-10">
          <div className="w-full max-w-md">

            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-10 w-auto" />
            </div>

            {/* Card */}
            <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/60 p-8 sm:p-10">

              {/* Icon header */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0D2558 100%)` }}>
                  {step === 1
                    ? <Mail className="w-8 h-8 text-white" />
                    : <KeyRound className="w-8 h-8 text-white" />}
                </div>
              </div>

              {step === 1 ? (
                <>
                  <div className="text-center mb-7">
                    <h2 className="text-2xl font-extrabold mb-1" style={{ color: NAVY }}>Reset Your Password</h2>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Enter the email address associated with your account and we'll send you a one-time link.
                    </p>
                  </div>

                  <form onSubmit={handleRequestCode} className="space-y-5">
                    <div>
                      <Label htmlFor="fp-email" className="text-sm font-semibold text-gray-700 mb-1.5 block">
                        Email Address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input
                          id="fp-email"
                          type="email"
                          placeholder="Enter your email address"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          autoFocus
                          required
                          className="pl-10 h-11 rounded-xl border-gray-200 text-sm"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-95"
                      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0D2558 100%)`, boxShadow: `0 8px 24px ${NAVY}40` }}
                    >
                      {loading ? 'Sending…' : <> Send Reset Link <ArrowRight className="w-4 h-4" /> </>}
                    </Button>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400 font-medium">OR</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>

                  <button
                    type="button"
                    className="w-full h-11 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-gray-50"
                    style={{ borderColor: `${NAVY}30`, color: NAVY }}
                    onClick={() => window.location.href = 'mailto:support@kaizenevents.com'}
                  >
                    <HeadphonesIcon className="w-4 h-4" />
                    Need Help? Contact Support
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center mb-7">
                    <h2 className="text-2xl font-extrabold mb-1" style={{ color: NAVY }}>Enter Reset Code</h2>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      We sent a code to{' '}
                      <span className="font-semibold text-gray-700">{email}</span>.
                      Enter it below with your new password.
                    </p>
                  </div>

                  <form onSubmit={handleConfirm} className="space-y-5">
                    <div>
                      <Label htmlFor="fp-code" className="text-sm font-semibold text-gray-700 mb-1.5 block">
                        Reset Code
                      </Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input
                          id="fp-code"
                          type="text"
                          inputMode="numeric"
                          placeholder="6-digit code"
                          value={code}
                          onChange={e => setCode(e.target.value)}
                          autoFocus
                          required
                          className="pl-10 h-11 rounded-xl border-gray-200 text-sm tracking-widest"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="fp-new" className="text-sm font-semibold text-gray-700 mb-1.5 block">
                        New Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
                        <PasswordInput
                          id="fp-new"
                          placeholder="Enter new password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          required
                          className="pl-10 h-11 rounded-xl border-gray-200 text-sm"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        At least 12 characters with upper, lower, digit and special character.
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="fp-confirm" className="text-sm font-semibold text-gray-700 mb-1.5 block">
                        Confirm New Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
                        <PasswordInput
                          id="fp-confirm"
                          placeholder="Confirm new password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          required
                          className="pl-10 h-11 rounded-xl border-gray-200 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(1)}
                        disabled={loading}
                        className="flex-1 h-11 rounded-xl font-semibold text-sm border-2"
                        style={{ borderColor: `${NAVY}30`, color: NAVY }}
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="flex-1 h-11 rounded-xl text-sm font-bold text-white transition-all duration-200 active:scale-95"
                        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0D2558 100%)`, boxShadow: `0 8px 24px ${NAVY}40` }}
                      >
                        {loading ? 'Resetting…' : 'Reset Password'}
                      </Button>
                    </div>
                  </form>
                </>
              )}

              {/* Security note */}
              <div className="mt-6 flex items-start gap-2.5 p-3.5 rounded-xl" style={{ background: IVORY, border: `1px solid ${GOLD}30` }}>
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Your security is our priority. We never share your information with anyone.
                </p>
              </div>
            </div>

            {/* Back link */}
            <p className="text-center text-sm text-gray-400 mt-6">
              <Link to="/login" className="font-semibold transition-colors hover:underline" style={{ color: NAVY }}>
                ← Back to Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
};

export default ForgotPassword;
