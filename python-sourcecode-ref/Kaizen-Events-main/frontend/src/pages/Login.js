import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PasswordInput from '../components/ui/PasswordInput';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  Mail, Lock, ArrowRight, CalendarCheck, BarChart2,
  Users, ShieldCheck,
} from 'lucide-react';

const NAVY    = '#091D40';
const CRIMSON = '#AC1E20';
const GOLD    = '#CC9C4C';
const IVORY   = '#F7F7F5';

const FEATURES = [
  {
    icon: CalendarCheck,
    title: 'Manage Events Easily',
    desc:  'Create and manage events with powerful tools.',
    bg:    'bg-[#CC9C4C]/20',
    color: '#CC9C4C',
  },
  {
    icon: BarChart2,
    title: 'Track Registrations',
    desc:  'View registrations, analytics and attendee insights.',
    bg:    'bg-white/15',
    color: '#FFFFFF',
  },
  {
    icon: Users,
    title: 'Grow Your Community',
    desc:  'Engage members and build a stronger, more connected network.',
    bg:    'bg-[#AC1E20]/30',
    color: '#F7F7F5',
  },
];

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const { login }               = useAuth();
  const navigate                = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      toast.success('Login successful!');
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Panel ── */}
        <div
          className="hidden lg:flex flex-col justify-between w-[46%] xl:w-[42%] relative overflow-hidden p-10 xl:p-14"
          style={{ background: `linear-gradient(145deg, ${NAVY} 0%, #0D2558 60%, #071538 100%)` }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-10" style={{ background: GOLD }} />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-10" style={{ background: CRIMSON }} />
          <div className="absolute top-1/2 right-8 w-32 h-32 rounded-full opacity-5" style={{ background: GOLD }} />

          {/* Top content */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm mb-8 text-xs font-semibold tracking-wide"
              style={{ background: `${GOLD}25`, color: GOLD, border: `1px solid ${GOLD}40` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
              ADMIN PORTAL
            </div>

            <h1 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-3">
              Welcome Back!<br />
              <span style={{ color: GOLD }}>Let's continue</span><br />
              creating impact together.
            </h1>
            <p className="text-sm text-white/60 mb-10 leading-relaxed">
              Sign in to manage events, registrations,<br />and connect with your community.
            </p>

            {/* Features */}
            <div className="space-y-5">
              {FEATURES.map(({ icon: Icon, title, desc, bg, color }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <div className="text-xs text-white/50 mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Right Panel ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-10 py-10">
          <div className="w-full max-w-md">

            {/* Card. The login page is intentionally a LIGHT surface regardless of the
                app's theme, so every input sets its own light colours explicitly —
                otherwise, in dark mode, the shared <Input> inherits a near-white text
                colour and types invisibly on the white card. */}
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/10 border border-slate-100 p-8 sm:p-10">
              {/* Logo */}
              <div className="flex justify-center mb-6">
                <img
                  src="/kaizen-events-logo.png"
                  alt="Kaizen Events"
                  className="h-11 w-auto"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>

              <div className="mb-7 text-center">
                <h2 className="text-2xl font-extrabold mb-1" style={{ color: NAVY }}>Sign In</h2>
                <p className="text-sm text-gray-500">Welcome back — please sign in to continue.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
                <div>
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none z-10" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      data-testid="login-email-input"
                      className="pl-11 h-12 sm:h-12 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 shadow-none focus-visible:ring-2 focus-visible:ring-[#091D40]/20 focus-visible:border-[#091D40] text-sm transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                      Password
                    </Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-semibold transition-colors hover:underline"
                      style={{ color: CRIMSON }}
                    >
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none z-10" />
                    <PasswordInput
                      id="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      data-testid="login-password-input"
                      className="pl-11 h-12 sm:h-12 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 shadow-none focus-visible:ring-2 focus-visible:ring-[#091D40]/20 focus-visible:border-[#091D40] text-sm transition-colors"
                    />
                  </div>
                </div>

                {/* Remember me */}
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-[#091D40] cursor-pointer"
                  />
                  <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer select-none">
                    Remember me
                  </label>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="login-submit-button"
                  className="w-full h-12 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98] shadow-lg"
                  style={{ background: loading ? '#6b7280' : `linear-gradient(135deg, ${NAVY} 0%, #0D2558 100%)`, boxShadow: `0 10px 26px ${NAVY}40` }}
                >
                  {loading ? 'Signing in…' : (
                    <>Sign In <ArrowRight className="w-4 h-4" /></>
                  )}
                </Button>
              </form>

              {/* Security note */}
              <div className="mt-6 flex items-start gap-2.5 p-3.5 rounded-xl" style={{ background: IVORY, border: `1px solid ${GOLD}30` }}>
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Your information is safe with us. We never share your details with anyone.
                </p>
              </div>
            </div>

            {/* Back link */}
            <p className="text-center text-sm text-gray-500 mt-6">
              <Link to="/" className="font-semibold transition-colors hover:underline" style={{ color: NAVY }}>
                ← Back to Homepage
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
