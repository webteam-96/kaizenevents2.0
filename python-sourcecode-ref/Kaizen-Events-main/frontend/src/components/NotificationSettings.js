import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Switch } from './ui/switch';
import { Mail, MessageCircle, Send, CheckCircle, Loader2, Eye, EyeOff, Plus, X, Users } from 'lucide-react';
import { toast } from 'sonner';

const NotificationSettings = ({ campaignId, campaignName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [emailSenders, setEmailSenders] = useState([]);
  const [settings, setSettings] = useState({
    email_enabled: false,
    whatsapp_enabled: false,
    email_sender_id: '',
    email_subject: 'Registration Confirmation - {event_name}',
    email_template: '',
    email_cc: [],
    email_bcc: [],
    whatsapp_template_name: 'event_registration_confirmation',
    interakt_api_key: '',
    sender_email: ''
  });
  const [testEmail, setTestEmail] = useState('');
  const [showApiKeys, setShowApiKeys] = useState({ interakt: false });
  const [newCc, setNewCc] = useState('');
  const [newBcc, setNewBcc] = useState('');

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  const fetchData = async () => {
    try {
      const [settingsRes, sendersRes] = await Promise.all([
        api.get(`/notifications/settings/${campaignId}`),
        api.get('/dkim/senders').catch(() => ({ data: [] }))
      ]);

      setSettings({
        ...settings,
        ...settingsRes.data,
        email_cc: settingsRes.data.email_cc || [],
        email_bcc: settingsRes.data.email_bcc || [],
        interakt_api_key: ''
      });
      setEmailSenders(sendersRes.data || []);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...settings, campaign_id: campaignId };

      // Only include API keys if they were changed
      if (!payload.interakt_api_key) delete payload.interakt_api_key;
      // Resend is no longer used — ensure it's never sent
      delete payload.resend_api_key;

      await api.put(`/notifications/settings/${campaignId}`, payload);
      toast.success('Notification settings saved!');
      fetchData();
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }

    setTesting(true);
    try {
      await api.post(`/notifications/test-email?campaign_id=${campaignId}&test_email=${encodeURIComponent(testEmail)}`);
      toast.success(`Test email sent to ${testEmail}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const addCc = () => {
    if (newCc && !settings.email_cc.includes(newCc)) {
      setSettings({ ...settings, email_cc: [...settings.email_cc, newCc] });
      setNewCc('');
    }
  };

  const removeCc = (email) => {
    setSettings({ ...settings, email_cc: settings.email_cc.filter(e => e !== email) });
  };

  const addBcc = () => {
    if (newBcc && !settings.email_bcc.includes(newBcc)) {
      setSettings({ ...settings, email_bcc: [...settings.email_bcc, newBcc] });
      setNewBcc('');
    }
  };

  const removeBcc = (email) => {
    setSettings({ ...settings, email_bcc: settings.email_bcc.filter(e => e !== email) });
  };

  const selectedSender = emailSenders.find(s => s.id === settings.email_sender_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="ke-hero p-6 md:p-7">
        <div className="ke-hero-grid" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Notifications</div>
            <h1 className="text-2xl md:text-[28px] font-outfit font-bold tracking-tight mt-1">Notification Settings</h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">
              {campaignName ? `Confirmation emails for ${campaignName}` : 'Send confirmation emails to registrants'}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
            style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="ke-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}>
              <Mail className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
            </span>
            <div>
              <h3 className="ke-section-title text-[15px]">Email Notifications</h3>
              <div className="ke-rule-gold mt-2 mb-1" />
              <p className="text-sm text-muted-foreground">Send confirmation emails to registrants</p>
            </div>
          </div>
          <Switch
            checked={settings.email_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, email_enabled: checked })}
          />
        </div>

        {settings.email_enabled && (
          <div className="space-y-4 mt-4 pt-4 border-t border-border">
            {/* Sender Selection */}
            <div>
              <Label className="text-sm font-medium text-foreground">Sender Email (From)</Label>
              {emailSenders.length > 0 ? (
                <div className="mt-1">
                  <select
                    value={settings.email_sender_id}
                    onChange={(e) => setSettings({ ...settings, email_sender_id: e.target.value })}
                    className="w-full h-10 rounded-lg border border-border bg-background text-foreground px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Select a registered sender...</option>
                    {emailSenders.map((sender) => (
                      <option key={sender.id} value={sender.id}>
                        {sender.name} &lt;{sender.email}&gt; {sender.is_verified ? '✓' : '(unverified)'}
                      </option>
                    ))}
                  </select>
                  {selectedSender && (
                    <div className="mt-2 p-2 bg-muted rounded-lg text-sm">
                      <span className="text-muted-foreground">Selected: </span>
                      <span className="font-medium text-foreground">{selectedSender.name} &lt;{selectedSender.email}&gt;</span>
                      {selectedSender.is_verified ? (
                        <span className="ml-2 text-green-600 text-xs">✓ DKIM Verified</span>
                      ) : (
                        <span className="ml-2 text-yellow-600 text-xs">⚠ Pending verification</span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    <a href="/dkim" className="text-primary hover:underline">Manage DKIM Senders →</a>
                  </p>
                </div>
              ) : (
                <div className="mt-1 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 mb-2">No DKIM senders registered</p>
                  <a href="/dkim" className="text-sm text-primary hover:underline font-medium">
                    Register a DKIM domain first →
                  </a>
                </div>
              )}
            </div>

            {/* Email sending is handled by the platform Brevo integration (server-configured). */}
            {!settings.email_sender_id && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Emails will be sent using the platform's default sender. To send from your own verified domain, register a DKIM domain and select a sender above.
                </p>
              </div>
            )}

            {/* CC Recipients */}
            <div>
              <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> CC Recipients
              </Label>
              <p className="text-xs text-muted-foreground mb-2">These addresses will receive a copy of every notification email</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={newCc}
                  onChange={(e) => setNewCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCc())}
                />
                <Button type="button" variant="outline" onClick={addCc}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {settings.email_cc.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.email_cc.map((email) => (
                    <span key={email} className="flex items-center gap-1 bg-muted text-foreground px-2 py-1 rounded-sm text-sm">
                      {email}
                      <button onClick={() => removeCc(email)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* BCC Recipients */}
            <div>
              <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> BCC Recipients
              </Label>
              <p className="text-xs text-muted-foreground mb-2">Hidden copy - recipients won&apos;t see these addresses</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={newBcc}
                  onChange={(e) => setNewBcc(e.target.value)}
                  placeholder="bcc@example.com"
                  className="flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addBcc())}
                />
                <Button type="button" variant="outline" onClick={addBcc}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {settings.email_bcc.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.email_bcc.map((email) => (
                    <span key={email} className="flex items-center gap-1 bg-muted text-foreground px-2 py-1 rounded-sm text-sm">
                      {email}
                      <button onClick={() => removeBcc(email)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Email Subject */}
            <div>
              <Label className="text-sm font-medium text-foreground">Email Subject</Label>
              <Input
                value={settings.email_subject}
                onChange={(e) => setSettings({ ...settings, email_subject: e.target.value })}
                placeholder="Registration Confirmation - {event_name}"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {'{event_name}'} as placeholder for campaign name
              </p>
            </div>

            {/* Test Email */}
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-sm font-medium text-foreground">Send Test Email</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1"
                />
                <Button
                  onClick={handleTestEmail}
                  disabled={testing || (!settings.email_sender_id && !settings.has_resend_key)}
                  variant="outline"
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {!settings.email_sender_id && !settings.has_resend_key && (
                <p className="text-xs text-yellow-600 mt-2">Select a sender or add API key first</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Notifications - DISABLED
      <Card className="p-6 opacity-50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100">
              <MessageCircle className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-outfit font-semibold text-slate-900">WhatsApp Notifications</h3>
              <p className="text-sm text-slate-500">Integration disabled - Contact support to enable</p>
            </div>
          </div>
        </div>
      </Card>
      */}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary-hover"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default NotificationSettings;
