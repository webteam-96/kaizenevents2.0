import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const SESSION_KEY = 'instamojoArchiveSession';

export function getInstamojoSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.token || !s.expires_at) return null;
    if (Math.floor(Date.now() / 1000) >= s.expires_at) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearInstamojoSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function InstamojoPasswordGate() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Skip gate if there's a still-valid session
  useEffect(() => {
    if (getInstamojoSession()) navigate('/instamojo/list', { replace: true });
  }, [navigate]);

  const isAuthorized =
    isSuperAdmin() || (user?.role === 'org_admin' && user?.can_approve_transfers);

  if (!isAuthorized) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center p-4">
        <div className="ke-card relative max-w-md w-full p-8 text-center overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--destructive)), transparent)' }} />
          <span className="ke-medallion mx-auto mb-4" style={{ background: 'linear-gradient(150deg, hsl(var(--destructive) / 0.16), transparent 85%)' }}>
            <Lock className="w-5 h-5" style={{ color: 'hsl(var(--destructive))' }} />
          </span>
          <h1 className="text-xl font-outfit font-bold tracking-tight text-foreground mb-2">Access Denied</h1>
          <p className="text-sm text-muted-foreground font-jakarta">
            Instamojo For Accounts is restricted to Super Admins and Directors.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error('Please enter the password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/instamojo-archive/verify-password', { password });
      const session = {
        token:      res.data.token,
        expires_at: res.data.expires_at,
        ttl_min:    res.data.ttl_min,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      toast.success(`Access granted (valid for ${session.ttl_min} min).`);
      navigate('/instamojo/list', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ke-atmos min-h-screen flex items-center justify-center p-4">
      <div className="ke-card relative max-w-md w-full p-8 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), transparent)' }} />
        <span className="ke-medallion mx-auto mb-4" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.14), transparent 85%)' }}>
          <Lock className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
        </span>
        <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground text-center">Restricted Finance Area</div>
        <h1 className="text-2xl font-outfit font-bold tracking-tight text-foreground text-center mt-1 mb-1">
          Instamojo For Accounts
        </h1>
        <p className="text-sm text-muted-foreground text-center font-jakarta mb-6">
          Enter the access password to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ima-pwd">Password</Label>
            <Input
              id="ima-pwd"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Validating…' : 'Validate Password'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center font-jakarta mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Session lasts 1 hour. You may be asked again after that.
        </p>
      </div>
    </div>
  );
}
