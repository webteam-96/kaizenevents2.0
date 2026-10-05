import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Mail, MessageSquare, Webhook, Zap, Database, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

// Canonical medallion treatment shared with the dashboard (KpiTile) and the main
// Integrations page: a soft gradient tint behind a hue-matched icon — never a solid
// fill with a white glyph. `hue` is raw HSL components so it composes into hsl(... / a).
const medallionStyle = (hue) => ({ background: `linear-gradient(150deg, hsl(${hue} / 0.16), transparent 85%)` });
const medallionIcon = (hue) => `hsl(${hue})`;

const INTEGRATION_TYPES = [
  {
    type: 'email',
    name: 'Email Notifications',
    icon: Mail,
    description: 'Send email notifications on form submission',
    hue: 'var(--chart-1)' // navy
  },
  {
    type: 'whatsapp',
    name: 'WhatsApp Messages',
    icon: MessageSquare,
    description: 'Send WhatsApp notifications via Interakt',
    hue: '152 58% 40%' // success green
  },
  {
    type: 'google_sheets',
    name: 'Google Sheets',
    icon: FileSpreadsheet,
    description: 'Sync submissions to Google Sheets',
    hue: '152 58% 40%' // success green
  },
  {
    type: 'webhook',
    name: 'Webhook',
    icon: Webhook,
    description: 'Send data to custom webhook URL',
    hue: 'var(--chart-4)' // steel
  },
  {
    type: 'zapier',
    name: 'Zapier',
    icon: Zap,
    description: 'Connect with 5000+ apps via Zapier',
    hue: '38 92% 48%' // warning amber
  },
  {
    type: 'database',
    name: 'Database',
    icon: Database,
    description: 'Export to external database',
    hue: 'var(--muted-foreground)' // neutral grey
  }
];

const Integrations = ({ integrations, onUpdate, campaignId, whatsappEnabled, onWhatsappChange }) => {
  const [activeIntegrations, setActiveIntegrations] = useState(integrations || []);
  // WhatsApp is a real, campaign-wide setting (shared with Event Settings → WhatsApp),
  // not a form-config flag like the other cards. It reads/writes campaign.whatsapp_enabled.
  const [waOn, setWaOn] = useState(!!whatsappEnabled);
  const [waSaving, setWaSaving] = useState(false);

  useEffect(() => { setWaOn(!!whatsappEnabled); }, [whatsappEnabled]);

  const toggleWhatsapp = async (next) => {
    if (!campaignId) { toast.error('Save the event first, then toggle WhatsApp.'); return; }
    setWaSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}`, { whatsapp_enabled: next });
      setWaOn(next);
      onWhatsappChange?.(next);
      toast.success(next ? 'WhatsApp turned on for this event' : 'WhatsApp turned off for this event');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update WhatsApp setting');
    } finally {
      setWaSaving(false);
    }
  };

  const toggleIntegration = (type) => {
    const exists = activeIntegrations.find(i => i.type === type);
    
    if (exists) {
      const updated = activeIntegrations.filter(i => i.type !== type);
      setActiveIntegrations(updated);
      onUpdate(updated);
      toast.success('Integration disabled');
    } else {
      const newIntegration = {
        type,
        enabled: true,
        config: {},
        trigger: 'on_submit'
      };
      const updated = [...activeIntegrations, newIntegration];
      setActiveIntegrations(updated);
      onUpdate(updated);
      toast.success('Integration enabled');
    }
  };

  const updateIntegrationConfig = (type, config) => {
    const updated = activeIntegrations.map(i => 
      i.type === type ? { ...i, config: { ...i.config, ...config } } : i
    );
    setActiveIntegrations(updated);
    onUpdate(updated);
  };

  const isEnabled = (type) => {
    if (type === 'whatsapp') return waOn;
    return activeIntegrations.some(i => i.type === type && i.enabled);
  };

  const getConfig = (type) => {
    return activeIntegrations.find(i => i.type === type)?.config || {};
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="ke-section-title text-[15px]">Integrations</h3>
        <div className="ke-rule-gold mt-2 mb-2" />
        <p className="text-sm text-muted-foreground font-jakarta">
          Connect your form with external services to automate workflows
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATION_TYPES.map((integration) => {
          const Icon = integration.icon;
          const enabled = isEnabled(integration.type);
          const config = getConfig(integration.type);

          return (
            <Card
              key={integration.type}
              className={`ke-card ke-card-hover ${
                enabled
                  ? 'border-primary bg-primary-subtle'
                  : ''
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3">
                    <span className="ke-medallion" style={medallionStyle(integration.hue)}>
                      <Icon className="w-5 h-5" style={{ color: medallionIcon(integration.hue) }} />
                    </span>
                    <div>
                      <h4 className="font-outfit font-semibold text-foreground">{integration.name}</h4>
                      <p className="text-xs text-muted-foreground font-jakarta mt-1">
                        {integration.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={integration.type === 'whatsapp' && waSaving}
                    onCheckedChange={(v) =>
                      integration.type === 'whatsapp'
                        ? toggleWhatsapp(v)
                        : toggleIntegration(integration.type)
                    }
                  />
                </div>

                {enabled && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {integration.type === 'email' && (
                      <>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Recipients</Label>
                          <Input
                            value={config.recipients || ''}
                            onChange={(e) => updateIntegrationConfig('email', { recipients: e.target.value })}
                            placeholder="email@example.com, email2@example.com"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Subject</Label>
                          <Input
                            value={config.subject || ''}
                            onChange={(e) => updateIntegrationConfig('email', { subject: e.target.value })}
                            placeholder="New form submission"
                            className="text-sm"
                          />
                        </div>
                      </>
                    )}

                    {integration.type === 'whatsapp' && (
                      <div className="text-xs text-muted-foreground font-jakarta leading-relaxed">
                        WhatsApp is <strong>on</strong> for this event. Choose which messages send
                        (confirmation, payment, OTP, reminder) and set their approved Interakt templates in{' '}
                        {campaignId ? (
                          <Link to={`/campaigns/${campaignId}/settings`} className="text-primary font-medium hover:underline">
                            Event Settings → WhatsApp
                          </Link>
                        ) : (
                          <span className="font-medium">Event Settings → WhatsApp</span>
                        )}
                        . This master switch is the same setting shown there.
                      </div>
                    )}

                    {integration.type === 'google_sheets' && (
                      <>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Spreadsheet ID</Label>
                          <Input
                            value={config.spreadsheet_id || ''}
                            onChange={(e) => updateIntegrationConfig('google_sheets', { spreadsheet_id: e.target.value })}
                            placeholder="Google Sheets ID"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Sheet Name</Label>
                          <Input
                            value={config.sheet_name || ''}
                            onChange={(e) => updateIntegrationConfig('google_sheets', { sheet_name: e.target.value })}
                            placeholder="Sheet1"
                            className="text-sm"
                          />
                        </div>
                      </>
                    )}

                    {integration.type === 'webhook' && (
                      <>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Webhook URL</Label>
                          <Input
                            value={config.url || ''}
                            onChange={(e) => updateIntegrationConfig('webhook', { url: e.target.value })}
                            placeholder="https://your-webhook-url.com"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Method</Label>
                          <select
                            value={config.method || 'POST'}
                            onChange={(e) => updateIntegrationConfig('webhook', { method: e.target.value })}
                            className="w-full h-9 rounded-lg border border-border bg-background text-foreground px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                          </select>
                        </div>
                      </>
                    )}

                    {integration.type === 'zapier' && (
                      <div>
                        <Label className="text-xs text-foreground font-jakarta mb-1 block">Zapier Webhook URL</Label>
                        <Input
                          value={config.webhook_url || ''}
                          onChange={(e) => updateIntegrationConfig('zapier', { webhook_url: e.target.value })}
                          placeholder="https://hooks.zapier.com/..."
                          className="text-sm"
                        />
                      </div>
                    )}

                    {integration.type === 'database' && (
                      <>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Database Type</Label>
                          <select
                            value={config.db_type || 'postgresql'}
                            onChange={(e) => updateIntegrationConfig('database', { db_type: e.target.value })}
                            className="w-full h-9 rounded-lg border border-border bg-background text-foreground px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="postgresql">PostgreSQL</option>
                            <option value="mysql">MySQL</option>
                            <option value="mongodb">MongoDB</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-foreground font-jakarta mb-1 block">Connection String</Label>
                          <Input
                            type="password"
                            value={config.connection_string || ''}
                            onChange={(e) => updateIntegrationConfig('database', { connection_string: e.target.value })}
                            placeholder="Database connection string"
                            className="text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Integrations;
