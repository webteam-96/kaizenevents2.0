import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Banknote, Calendar, Save, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';

const OfflinePaymentSettings = ({ campaignId, campaignName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [settings, setSettings] = useState({
    allow_offline_payments: false,
    offline_payment_deadline_date: ''
  });

  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  const fetchCampaign = async () => {
    try {
      const response = await api.get(`/campaigns/${campaignId}`);
      setCampaign(response.data);
      
      // Initialize settings from payment_config
      const paymentConfig = response.data.payment_config || {};
      setSettings({
        allow_offline_payments: paymentConfig.allow_offline_payments || false,
        offline_payment_deadline_date: paymentConfig.offline_payment_deadline_date 
          ? paymentConfig.offline_payment_deadline_date.split('T')[0] // Extract date part
          : response.data.end_date 
            ? response.data.end_date.split('T')[0] 
            : ''
      });
    } catch (error) {
      toast.error('Failed to load campaign settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Format the deadline date properly
      let deadlineDate = settings.offline_payment_deadline_date;
      if (deadlineDate && !deadlineDate.includes('T')) {
        deadlineDate = `${deadlineDate}T23:59:59Z`;
      }

      await api.put(`/campaigns/${campaignId}/offline-payment-settings`, {
        allow_offline_payments:        settings.allow_offline_payments,
        offline_payment_deadline_date: settings.allow_offline_payments ? deadlineDate : null,
      });
      
      toast.success('Offline payment settings saved successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="ke-card p-6">
        <div className="flex items-start gap-4">
          <span
            className="ke-medallion shrink-0"
            style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
          >
            <Banknote className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div>
            <h2 className="ke-section-title text-xl">Offline Payments</h2>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-sm text-muted-foreground font-jakarta mt-1">
              Allow registrants to pay in cash at the event venue. Users will receive an OTP to present at the registration desk.
            </p>
          </div>
        </div>
      </div>

      {/* Settings Card */}
      <div className="ke-card p-6">
        <div className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between py-4 border-b border-border">
            <div className="flex-1">
              <Label className="text-base font-jakarta font-semibold text-foreground">
                Enable Offline Payments
              </Label>
              <p className="text-sm text-muted-foreground font-jakarta mt-1">
                When enabled, users can choose to pay in cash at the event venue
              </p>
            </div>
            <Switch
              checked={settings.allow_offline_payments}
              onCheckedChange={(checked) => setSettings(prev => ({ 
                ...prev, 
                allow_offline_payments: checked 
              }))}
            />
          </div>

          {/* Deadline Date */}
          {settings.allow_offline_payments && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Offline Payment Deadline
                  </div>
                </Label>
                <Input
                  type="date"
                  value={settings.offline_payment_deadline_date}
                  onChange={(e) => setSettings(prev => ({ 
                    ...prev, 
                    offline_payment_deadline_date: e.target.value 
                  }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-11 rounded-lg border-border focus-visible:ring-primary max-w-xs"
                />
                <p className="text-xs text-muted-foreground font-jakarta mt-2">
                  OTPs will expire on this date. Users must complete payment before this deadline.
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-primary-subtle border border-primary/20 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground">
                    <p className="font-semibold mb-1">How it works:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>User selects &quot;Pay at Venue&quot; during registration</li>
                      <li>System generates a 6-digit OTP and sends it via email</li>
                      <li>User shows OTP at the registration desk</li>
                      <li>Organizer verifies OTP and confirms cash payment</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end mt-6 pt-6 border-t border-border">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary-hover text-white font-jakarta"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OfflinePaymentSettings;
