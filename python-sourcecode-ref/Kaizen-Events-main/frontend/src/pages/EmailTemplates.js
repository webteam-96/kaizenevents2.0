import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import {
  ArrowLeft, Mail, CheckCircle, AlertCircle, Loader2, Edit,
  Bell, Banknote, Hash, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

// Triggers in the order they should render. Matches the four backend constants.
const TRIGGERS = [
  {
    key:         'registration_confirmed',
    title:       'Registration Confirmed',
    description: 'Sent after a registrant pays online (Razorpay / Cashfree / Instamojo) or registers for a free event.',
    Icon:        CheckCircle,
    color:       'text-green-600',
    bg:          'bg-green-50',
    border:      'border-green-200'
  },
  {
    key:         'payment_received',
    title:       'Payment Received',
    description: 'Sent after a volunteer marks cash as collected at the venue (offline / kiosk).',
    Icon:        Banknote,
    color:       'text-emerald-600',
    bg:          'bg-emerald-50',
    border:      'border-emerald-200'
  },
  {
    key:         'payment_otp',
    title:       'Payment OTP',
    description: 'Sent immediately after a registrant chooses "Pay at Venue". Contains the 6-digit OTP.',
    Icon:        Hash,
    color:       'text-amber-600',
    bg:          'bg-amber-50',
    border:      'border-amber-200'
  },
  {
    key:         'registration_reminder',
    title:       'Registration Reminder',
    description: 'Sent when an admin clicks "Send Reminders" on the Members page (closed-group campaigns).',
    Icon:        Bell,
    color:       'text-blue-600',
    bg:          'bg-blue-50',
    border:      'border-blue-200'
  }
];

const EmailTemplates = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, tplRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/email-templates`)
      ]);
      setCampaign(campRes.data);
      setTemplates(tplRes.data || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [togglingKey, setTogglingKey] = useState(null);
  const [bulkToggling, setBulkToggling] = useState(false);

  // Map: trigger → template object (in case API returned them in any order)
  const byTrigger = templates.reduce((acc, t) => {
    acc[t.trigger] = t;
    return acc;
  }, {});

  const isActive = (t) => t?.is_active !== false;  // default ON when field is absent
  const isComplete = (t) => t && t.subject?.trim() && t.body_html?.trim();
  // A disabled template won't send, so it doesn't block activation and isn't "incomplete".
  const incompleteCount = TRIGGERS.filter(
    (trg) => isActive(byTrigger[trg.key]) && !isComplete(byTrigger[trg.key])
  ).length;

  // Master toggle reflects "are ALL templates on"; clicking it flips every template.
  const allActive = templates.length > 0 && TRIGGERS.every((trg) => isActive(byTrigger[trg.key]));

  const toggleAll = async (nextActive) => {
    if (templates.length === 0 || bulkToggling) return;
    setBulkToggling(true);
    setTemplates((prev) => prev.map((t) => ({ ...t, is_active: nextActive })));
    try {
      await Promise.all(
        templates.map((tpl) =>
          api.put(`/campaigns/${campaignId}/email-templates/${tpl.trigger}`, {
            subject:                tpl.subject || '',
            body_html:              tpl.body_html || '',
            to_override:            tpl.to_override || null,
            cc:                     tpl.cc || [],
            bcc:                    tpl.bcc || [],
            reply_to:               tpl.reply_to || null,
            email_sender_id:        tpl.email_sender_id || null,
            attach_filled_form_pdf: tpl.attach_filled_form_pdf || false,
            attachments:            tpl.attachments || [],
            is_active:              nextActive
          })
        )
      );
      toast.success(nextActive ? 'All emails turned on.' : 'All emails turned off.');
    } catch (err) {
      // A PUT may fail (e.g. turning on a blank template needs a subject/body) — resync from server.
      toast.error(err.response?.data?.detail || 'Some templates could not be updated.');
      await fetchData();
    } finally {
      setBulkToggling(false);
    }
  };

  // Flip a template's on/off state. The Update endpoint needs the full body, so we
  // re-send the template's existing fields with is_active changed (optimistic UI).
  const toggleActive = async (tpl, nextActive) => {
    if (!tpl) return;
    setTogglingKey(tpl.trigger);
    setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? { ...t, is_active: nextActive } : t)));
    try {
      await api.put(`/campaigns/${campaignId}/email-templates/${tpl.trigger}`, {
        subject:                tpl.subject || '',
        body_html:              tpl.body_html || '',
        to_override:            tpl.to_override || null,
        cc:                     tpl.cc || [],
        bcc:                    tpl.bcc || [],
        reply_to:               tpl.reply_to || null,
        email_sender_id:        tpl.email_sender_id || null,
        attach_filled_form_pdf: tpl.attach_filled_form_pdf || false,
        attachments:            tpl.attachments || [],
        is_active:              nextActive
      });
      toast.success(nextActive ? 'Email turned on.' : 'Email turned off.');
    } catch (err) {
      // Roll back on failure
      setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? { ...t, is_active: !nextActive } : t)));
      toast.error(err.response?.data?.detail || 'Failed to update.');
    } finally {
      setTogglingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <Button
              variant="ghost"
              onClick={() => navigate(`/campaigns/${campaignId}`)}
              className="mb-3 -ml-2 text-white/80 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Event
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Communications</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Email Templates</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">
                  {campaign?.name} — customize the four transactional emails sent to registrants.
                </p>
              </div>
              <div className="flex items-center gap-5">
                {/* Master on/off — flips all templates at once */}
                <div className="flex items-center gap-2 pr-5 border-r border-white/20">
                  <div className="text-right">
                    <p className="text-xs text-white/55">All emails</p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      {allActive ? 'On' : 'Off'}
                    </p>
                  </div>
                  <Switch
                    checked={allActive}
                    disabled={bulkToggling || templates.length === 0}
                    onCheckedChange={(next) => toggleAll(next)}
                    aria-label="Turn all emails on or off"
                  />
                </div>

                <div className="text-right">
                  <p className="text-xs text-white/55">Status</p>
                  {incompleteCount === 0 ? (
                    <p className="text-sm font-semibold text-green-300 flex items-center gap-1 mt-1">
                      <CheckCircle className="w-4 h-4" />
                      All 4 templates ready
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-amber-300 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-4 h-4" />
                      {incompleteCount} template{incompleteCount !== 1 ? 's' : ''} incomplete
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activation warning banner */}
        {incompleteCount > 0 && (
          <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">
                  Templates required before activating this event
                </p>
                <p className="text-sm text-amber-800 mt-1">
                  Each email that is turned <strong>ON</strong> must have a subject and body filled in.
                  Open the incomplete ones (highlighted) and click <strong>Save</strong>, or turn them
                  <strong> Off</strong> if you don&apos;t want to send them.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Helpful intro */}
        <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p>
                Each card below represents one email that this event sends automatically.
                Templates are pre-populated with defaults — you can edit subject, body, CC,
                BCC, and add images / dynamic field values.
              </p>
              <p className="mt-2">
                <strong>Placeholders</strong> like <code className="bg-blue-100 px-1 rounded">{'${name}'}</code>,{' '}
                <code className="bg-blue-100 px-1 rounded">{'${amount}'}</code>, and{' '}
                <code className="bg-blue-100 px-1 rounded">{'${field:Email}'}</code> are substituted
                with real values before sending. Use the placeholder picker in the editor to insert them.
              </p>
            </div>
          </div>
        </Card>

        {/* Template cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRIGGERS.map((trg) => {
            const tpl = byTrigger[trg.key];
            const active = isActive(tpl);
            const complete = isComplete(tpl);
            const { Icon } = trg;
            return (
              <Card
                key={trg.key}
                className={`ke-card ke-card-hover p-5 cursor-pointer ${
                  !active
                    ? 'opacity-70'
                    : complete
                    ? ''
                    : `${trg.border} ring-1 ring-amber-200`
                }`}
                onClick={() =>
                  navigate(`/campaigns/${campaignId}/email-templates/${trg.key}`)
                }
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`ke-medallion ${trg.bg}`}>
                    <Icon className={`w-5 h-5 ${trg.color}`} />
                  </span>
                  {!active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-sm">
                      Off
                    </span>
                  ) : complete ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-sm">
                      <CheckCircle className="w-3 h-3" />
                      Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-sm">
                      <AlertCircle className="w-3 h-3" />
                      Incomplete
                    </span>
                  )}
                </div>

                {/* Send on/off toggle */}
                <div
                  className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-muted border border-border"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs font-jakarta font-medium text-muted-foreground">
                    {active ? 'Sending is ON' : 'Sending is OFF'}
                  </span>
                  <Switch
                    checked={active}
                    disabled={togglingKey === trg.key}
                    onCheckedChange={(next) => toggleActive(tpl, next)}
                  />
                </div>
                <h3 className="ke-section-title text-lg">{trg.title}</h3>
                <div className="ke-rule-gold mt-1.5 mb-2" />
                <p className="text-xs text-muted-foreground font-jakarta mb-3">{trg.description}</p>

                <div className="text-xs text-muted-foreground font-jakarta border-t border-border pt-3 space-y-1">
                  <div className="flex">
                    <span className="text-muted-foreground w-16">Subject:</span>
                    <span className="font-medium truncate text-foreground">{tpl?.subject || '— Not set —'}</span>
                  </div>
                  <div className="flex">
                    <span className="text-muted-foreground w-16">CC:</span>
                    <span>{tpl?.cc?.length > 0 ? `${tpl.cc.length} recipient${tpl.cc.length !== 1 ? 's' : ''}` : 'None'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Last edited:</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {tpl?.updated_at ? formatServerDate(tpl.updated_at, 'dd MMM yyyy') : '—'}
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/campaigns/${campaignId}/email-templates/${trg.key}`);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Template
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplates;
