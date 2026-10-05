import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import PasswordInput from '../components/ui/PasswordInput';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';
import api from '../services/api';

// Change password for a signed-in user.
//   - Requires current password (re-auth)
//   - New password must meet PasswordValidator rules (12+ chars, mixed classes,
//     no sequential runs, not in weak list) — server enforces, error string
//     shows verbatim in the toast
//   - On success the backend revokes all tokens for this user → we log out
//     locally and bounce to /login so the new credentials get a fresh JWT.

const ChangePassword = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [current, setCurrent]       = useState('');
  const [next, setNext]             = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [loading, setLoading]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!current)                  { toast.error('Enter your current password.');             return; }
    if (!next)                     { toast.error('Enter a new password.');                    return; }
    if (next !== confirmNext)      { toast.error('New passwords do not match.');              return; }
    if (next === current)          { toast.error('New password must differ from current.');   return; }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: current,
        new_password:     next,
      });
      toast.success('Password changed. Please sign in again.');
      // Backend revokes all tokens for this user → existing JWT is now invalid.
      // Clear local session so the next request doesn't 401 in the background.
      logout();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not change password.');
      setLoading(false);
    }
  };

  const mismatch = confirmNext.length > 0 && next !== confirmNext;
  const sameAsCurrent = next.length > 0 && current.length > 0 && next === current;

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="w-full max-w-xl mx-auto">
        {/* Back link (above the hero) */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 mb-3 text-sm font-jakarta font-medium text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Navy hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">
              Account Security
            </div>
            <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">
              Change Password
            </h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">
              Update the password for your account and refresh every active session.
            </p>
          </div>
        </div>

        {/* Centered form card */}
        <div className="ke-card p-6 md:p-7">
          {/* Gold medallion crest */}
          <div className="flex flex-col items-center text-center mb-6">
            <span
              className="ke-medallion"
              style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.22), transparent 85%)' }}
            >
              <KeyRound className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <h2 className="mt-3 text-lg font-outfit font-bold tracking-tight text-foreground">
              Set a new password
            </h2>
            <p className="mt-1 text-sm text-muted-foreground font-jakarta max-w-sm">
              Choose a strong password you don't use anywhere else.
            </p>
          </div>

          {/* Sign-out notice */}
          <div className="flex items-start gap-3 mb-6 rounded-xl border border-border bg-muted p-3.5">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary"
              style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}
            >
              <ShieldCheck className="w-4 h-4" />
            </span>
            <p className="text-sm text-muted-foreground font-jakarta">
              You'll be signed out of all sessions after a successful change, and
              will need to sign in again with your new password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current credentials */}
            <div>
              <h3 className="ke-section-title text-[15px]">Verify it's you</h3>
              <div className="ke-rule-gold mt-2 mb-4" />
              <div className="space-y-1.5">
                <Label htmlFor="cp-current" className="text-foreground">Current Password</Label>
                <PasswordInput
                  id="cp-current"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* New credentials */}
            <div className="border-t border-border pt-6">
              <h3 className="ke-section-title text-[15px]">New password</h3>
              <div className="ke-rule-gold mt-2 mb-4" />
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-new" className="text-foreground">New Password</Label>
                  <PasswordInput
                    id="cp-new"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <p className="text-xs text-muted-foreground font-jakarta mt-1.5">
                    At least 12 characters with upper, lower, digit, and special.
                    Cannot reuse the current password.
                  </p>
                  {sameAsCurrent && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive font-jakarta mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      New password must differ from your current password.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cp-confirm" className="text-foreground">Confirm New Password</Label>
                  <PasswordInput
                    id="cp-confirm"
                    value={confirmNext}
                    onChange={(e) => setConfirmNext(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  {mismatch && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive font-jakarta mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Passwords do not match.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-5 border-t border-border">
              <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                {loading ? 'Updating…' : 'Change Password'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
