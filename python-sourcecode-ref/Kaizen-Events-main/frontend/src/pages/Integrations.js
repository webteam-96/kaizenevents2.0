import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Mail, FileSpreadsheet, MessageCircle, CheckCircle, XCircle,
  Loader2, Send, RefreshCw, Copy, Info, ArrowRight, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

// Status-aware medallion styling: green when an integration is live, gold otherwise.
// Kept semantic so the configured/not-configured cue survives the premium restyle.
const medallionStyle = (configured) => ({
  background: configured
    ? 'linear-gradient(150deg, hsl(152 58% 40% / 0.20), transparent 85%)'
    : 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)',
});
const medallionIcon = (configured) => (configured ? 'hsl(152 58% 40%)' : 'hsl(var(--accent))');

const Integrations = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Super-admin only — block any non-super-admin who reaches this page via direct URL
  useEffect(() => {
    if (!isSuperAdmin()) {
      toast.error('Only Super Admin can manage integrations.');
      navigate('/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WhatsApp test state - DISABLED
  // const [whatsappTest, setWhatsappTest] = useState({...});
  // const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Email test state
  const [emailTest, setEmailTest] = useState({ to_email: '', to_name: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  // Google Sheets service account email (read from backend config)
  const [serviceEmail, setServiceEmail] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await api.get('/integrations/status');
      setStatus(response.data);

      // Try to get service email if sheets is configured
      if (response.data.google_sheets?.configured) {
        try {
          const emailRes = await api.get('/integrations/sheets/service-email');
          setServiceEmail(emailRes.data.service_email);
        } catch (e) {
          // Ignore
        }
      }
    } catch (error) {
      toast.error('Failed to load integration status');
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp test function - DISABLED
  /*
  const testWhatsApp = async () => {
    // Function disabled
  };
  */

  const testEmail = async () => {
    if (!emailTest.to_email) {
      toast.error('Please enter an email address');
      return;
    }

    setSendingEmail(true);
    try {
      await api.post('/integrations/email/test', {
        ...emailTest,
        to_name: emailTest.to_name || 'Test User',
        event_name: 'Test Event'
      });
      toast.success('Test email sent successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send test email');
    } finally {
      setSendingEmail(false);
    }
  };

  const copyServiceEmail = () => {
    navigator.clipboard.writeText(serviceEmail);
    toast.success('Service email copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-6">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/control-panel')}
              className="inline-flex items-center gap-1.5 text-sm font-jakarta text-white/70 hover:text-white transition-colors mb-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Control Panel
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Platform</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Integrations</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Configure third-party integrations for notifications and data sync.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={fetchStatus}
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Refresh Status
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Integration Cards */}
        <div className="space-y-6">

          {/* WhatsApp Integration */}
          <div className="ke-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="ke-medallion" style={medallionStyle(status?.whatsapp?.configured)}>
                  <MessageCircle className="w-5 h-5" style={{ color: medallionIcon(status?.whatsapp?.configured) }} />
                </span>
                <div>
                  <h2 className="text-lg font-outfit font-semibold text-foreground">WhatsApp (Interakt)</h2>
                  <p className="text-sm text-muted-foreground">Confirm registrations and payments over WhatsApp</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status?.whatsapp?.configured ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground text-sm">
                    <XCircle className="w-4 h-4" /> Not Configured
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              {!status?.whatsapp?.configured && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Interakt is not configured. Contact your system administrator to set the secret key in
                      the server configuration — templates can still be set up below, they just won't send yet.
                    </p>
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-3">
                Every event has its own WhatsApp message settings (Settings → WhatsApp). Manage them all from
                one place instead of visiting each event individually.
              </p>
              <Button size="sm" onClick={() => navigate('/control-panel/integrations/whatsapp-templates')}>
                Manage Templates for All Events
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Email Integration */}
          <div className="ke-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="ke-medallion" style={medallionStyle(status?.email?.configured)}>
                  <Mail className="w-5 h-5" style={{ color: medallionIcon(status?.email?.configured) }} />
                </span>
                <div>
                  <h2 className="text-lg font-outfit font-semibold text-foreground">Email (Brevo/Sendinblue)</h2>
                  <p className="text-sm text-muted-foreground">Send registration confirmation emails</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status?.email?.configured ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground text-sm">
                    <XCircle className="w-4 h-4" /> Not Configured
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              {!status?.email?.configured && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Email service is not configured. Contact your system administrator to set the Brevo API key in the server configuration.
                    </p>
                  </div>
                </div>
              )}
              {status?.email?.configured && (
                <>
                  <h3 className="ke-section-title text-[15px]">Send Test Email</h3>
                  <div className="ke-rule-gold mt-2 mb-4" />
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label className="text-xs">Email Address</Label>
                      <Input
                        type="email"
                        placeholder="test@example.com"
                        value={emailTest.to_email}
                        onChange={(e) => setEmailTest({...emailTest, to_email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input
                        placeholder="Test User"
                        value={emailTest.to_name}
                        onChange={(e) => setEmailTest({...emailTest, to_name: e.target.value})}
                      />
                    </div>
                  </div>
                  <Button onClick={testEmail} disabled={sendingEmail} size="sm">
                    {sendingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Send Test Email
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Google Sheets Integration */}
          <div className="ke-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="ke-medallion" style={medallionStyle(status?.google_sheets?.configured)}>
                  <FileSpreadsheet className="w-5 h-5" style={{ color: medallionIcon(status?.google_sheets?.configured) }} />
                </span>
                <div>
                  <h2 className="text-lg font-outfit font-semibold text-foreground">Google Sheets</h2>
                  <p className="text-sm text-muted-foreground">Auto-sync registrations to Google Sheets</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status?.google_sheets?.configured ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground text-sm">
                    <XCircle className="w-4 h-4" /> Not Configured
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              {!status?.google_sheets?.configured ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Google Sheets integration is not configured. Contact your system administrator to set up the service account credentials on the server.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="ke-section-title text-[15px]">Service Account Email</h3>
                  <div className="ke-rule-gold mt-2 mb-2" />
                  <p className="text-xs text-muted-foreground mb-2">
                    If you want to sync to an existing Google Sheet, share it with this service email (Editor access):
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all">{serviceEmail || 'Loading…'}</code>
                    <Button variant="outline" size="sm" onClick={copyServiceEmail} disabled={!serviceEmail}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Or let the platform auto-create a new sheet per event via Settings → Integrations.
                  </p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Integrations;
