import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { MessageCircle, Send, Loader2, Plus, X, ChevronDown, ChevronUp, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  COMMON, COMMON_DETAILED, OPTIONS, COMMON_TEMPLATE_INFO,
  LEGACY_TRIGGERS, SYSTEM_PLACEHOLDERS, labelForTrigger,
} from '../constants/whatsapp';

// Form field types that carry no submitted value, so they are never a usable variable.
const NON_DATA_FIELD_TYPES = new Set(['section_header']);

const labelFor = labelForTrigger;

const WhatsAppTemplates = ({ campaignId }) => {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  const [draft, setDraft] = useState(null);          // editable copy of the open template
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [masterOn, setMasterOn] = useState(false);      // campaign-wide WhatsApp master switch
  const [masterSaving, setMasterSaving] = useState(false);
  const [formFields, setFormFields] = useState([]);     // this campaign's registration form fields

  const byTrigger = (key) => templates.find((t) => t.trigger === key);

  // Legacy messages left switched on from before this panel was simplified.
  const activeLegacy = templates.filter((t) => LEGACY_TRIGGERS[t.trigger] && t.is_active);

  // Suggestions built from the campaign's own form, already written in the exact
  // ${field:Label} shape the backend matches on — so clicking one can't produce a typo.
  const fieldPlaceholders = useMemo(() => {
    const seen = new Set();
    return formFields
      .filter((f) => f?.label && !NON_DATA_FIELD_TYPES.has(f.type))
      .map((f) => `\${field:${String(f.label).trim()}}`)
      .filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  }, [formFields]);

  // Everything a ${field:...} reference is allowed to name. The backend registers each
  // field under both its label and its id, so accept either.
  const knownFieldRefs = useMemo(() => {
    const refs = new Set();
    formFields.forEach((f) => {
      if (f?.label) refs.add(String(f.label).trim().toLowerCase());
      if (f?.id) refs.add(String(f.id).trim().toLowerCase());
    });
    return refs;
  }, [formFields]);

  // Flags a ${field:X} that names nothing in this form — it would silently send blank.
  const fieldRefWarning = (value) => {
    const match = /^\$\{field:(.+)\}$/.exec(String(value || '').trim());
    if (!match || formFields.length === 0) return null;
    const ref = match[1].trim();
    return knownFieldRefs.has(ref.toLowerCase())
      ? null
      : `No field named "${ref}" in this form — this variable would send empty.`;
  };

  const addPlaceholder = (p) =>
    setDraft((d) => ({ ...d, body_values: [...d.body_values, p] }));

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const [tplRes, campRes, formRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}/whatsapp-templates`),
        api.get(`/campaigns/${campaignId}`),
        // A campaign may not have a form built yet — that must not break this panel.
        api.get(`/campaigns/${campaignId}/form`).catch(() => ({ data: null })),
      ]);
      setConfigured(tplRes.data?.configured !== false);
      setTemplates(tplRes.data?.templates || []);
      setMasterOn(!!campRes.data?.whatsapp_enabled);
      setFormFields(Array.isArray(formRes.data?.fields) ? formRes.data.fields : []);
    } catch (err) {
      toast.error('Failed to load WhatsApp templates');
    } finally {
      setLoading(false);
    }
  };

  // Turning one option on turns the other off server-side, so re-read the whole list rather
  // than patching the single row the PUT returned.
  const refreshTemplates = async () => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/whatsapp-templates`);
      setTemplates(res.data?.templates || []);
    } catch (err) {
      /* keep the optimistic state — the next full load will reconcile */
    }
  };

  // Campaign-wide master switch. Shared with the Form Builder → Integrations "WhatsApp
  // Messages" toggle (both read/write campaign.whatsapp_enabled). When off, nothing sends.
  const handleMasterToggle = async (next) => {
    setMasterSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}`, { whatsapp_enabled: next });
      setMasterOn(next);
      toast.success(next ? 'WhatsApp turned on for this event' : 'WhatsApp turned off for this event');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update WhatsApp setting');
    } finally {
      setMasterSaving(false);
    }
  };

  const openEditor = (t) => {
    if (openKey === t.trigger) { setOpenKey(null); setDraft(null); return; }
    setOpenKey(t.trigger);
    setDraft({
      template_name: t.template_name || '',
      language_code: t.language_code || 'en',
      country_code: t.country_code || '91',
      body_values: [...(t.body_values || [])],
      is_active: !!t.is_active,
    });
  };

  // Persists a template. `patch` overrides the current persisted values for that trigger.
  const save = async (trigger, patch) => {
    const current = byTrigger(trigger) || {};
    const payload = {
      template_name: patch.template_name ?? current.template_name ?? '',
      body_values: patch.body_values ?? current.body_values ?? [],
      language_code: patch.language_code ?? current.language_code ?? 'en',
      country_code: patch.country_code ?? current.country_code ?? '91',
      is_active: patch.is_active ?? current.is_active ?? false,
    };
    const res = await api.put(`/campaigns/${campaignId}/whatsapp-templates/${trigger}`, payload);
    setTemplates((prev) => prev.map((t) => (t.trigger === trigger ? res.data : t)));
    await refreshTemplates();
    return res.data;
  };

  const handleToggle = async (t, next) => {
    // Enabling needs an approved template name — send them to the editor instead of a 400.
    if (next && !t.effective_template_name) {
      openEditor(t);
      toast.error('Add your approved WhatsApp template name first, then turn it on.');
      return;
    }
    try {
      await save(t.trigger, { is_active: next });
      toast.success(next ? `${labelFor(t.trigger)} turned on` : `${labelFor(t.trigger)} turned off`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
    }
  };

  const handleSaveDraft = async () => {
    if (!openKey || !draft) return;
    const t = byTrigger(openKey) || {};
    // A blank name on the standard option is fine when the server supplies one.
    const willHaveName = draft.template_name.trim() || (openKey === COMMON && t.effective_template_name);
    if (draft.is_active && !willHaveName) {
      toast.error('Enter your approved WhatsApp template name to keep this message on.');
      return;
    }
    setSaving(true);
    try {
      await save(openKey, {
        template_name: draft.template_name.trim(),
        language_code: draft.language_code.trim() || 'en',
        country_code: (draft.country_code || '').replace(/\D/g, '') || '91',
        body_values: draft.body_values.map((v) => v).filter((v) => v !== null && v !== undefined),
        is_active: draft.is_active,
      });
      toast.success(`${labelFor(openKey)} saved`);
      setOpenKey(null);
      setDraft(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!openKey) return;
    if (!testPhone.trim()) { toast.error('Enter a phone number to send the test to'); return; }
    setTesting(true);
    try {
      // Save first so the test uses the latest values.
      await handleSaveDraftSilently();
      const res = await api.post(`/campaigns/${campaignId}/whatsapp-templates/${openKey}/send-test`, {
        to_phone: testPhone.trim(),
        country_code: (draft?.country_code || '91').replace(/\D/g, '') || '91',
      });
      if (res.data?.sent) toast.success(`Test WhatsApp sent to ${testPhone}`);
      else toast.error(res.data?.error || 'WhatsApp not sent — check the template name/approval in Interakt.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send test');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveDraftSilently = async () => {
    if (!openKey || !draft) return;
    await save(openKey, {
      template_name: draft.template_name.trim(),
      language_code: draft.language_code.trim() || 'en',
      country_code: (draft.country_code || '').replace(/\D/g, '') || '91',
      body_values: draft.body_values,
      is_active: draft.is_active,
    });
  };

  // ── draft body-value helpers ──
  const setBodyValue = (i, val) =>
    setDraft((d) => ({ ...d, body_values: d.body_values.map((v, idx) => (idx === i ? val : v)) }));
  const addBodyValue = () => setDraft((d) => ({ ...d, body_values: [...d.body_values, ''] }));
  const removeBodyValue = (i) =>
    setDraft((d) => ({ ...d, body_values: d.body_values.filter((_, idx) => idx !== i) }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  // Shared by both options: name / language / dialing code.
  const renderNameRow = (isCommon) => {
    const t = byTrigger(openKey) || {};
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Approved template name</Label>
          {isCommon ? (
            // Read-only and filled in, never a placeholder: the standard template is one
            // approved template shared by every event, so there is nothing to type here and a
            // greyed-out hint would read as "empty, needs filling in".
            <>
              <div className="mt-1 h-10 px-3 flex items-center rounded-md border border-border bg-muted text-sm font-mono text-foreground truncate">
                {t.effective_template_name || '—'}
              </div>
              <p className={`text-[11px] mt-1 ${t.effective_template_name ? 'text-muted-foreground' : 'text-amber-600'}`}>
                {t.effective_template_name
                  ? 'Set on the server and shared by every event.'
                  : 'Not set on the server yet — this message cannot be turned on until it is.'}
              </p>
            </>
          ) : (
            <Input
              value={draft.template_name}
              onChange={(e) => setDraft({ ...draft, template_name: e.target.value })}
              placeholder="e.g. registration_confirmed"
              className="mt-1"
            />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Language code</Label>
          <Input
            value={draft.language_code}
            onChange={(e) => setDraft({ ...draft, language_code: e.target.value })}
            placeholder="en"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Dialing code</Label>
          <Input
            value={draft.country_code}
            onChange={(e) => setDraft({ ...draft, country_code: e.target.value })}
            placeholder="91"
            className="mt-1"
          />
        </div>
      </div>
    );
  };

  const renderFooter = () => (
    <>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
          Send this message
        </label>
        <Button onClick={handleSaveDraft} disabled={saving} className="bg-primary text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>

      <div className="pt-3 border-t border-border">
        <Label className="text-xs text-muted-foreground">Send a test to a phone number</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="9876543210"
            className="max-w-[220px]"
          />
          <Button variant="outline" size="sm" onClick={handleSendTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
            Send test
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="ke-card p-5 md:p-6">
      <div className="flex items-start gap-3 mb-5">
        <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.22), transparent 85%)' }}>
          <MessageCircle className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
        </span>
        <div>
          <h2 className="ke-section-title text-lg">WhatsApp Messages</h2>
          <div className="ke-rule-gold mt-2 mb-2" />
          <p className="text-sm text-muted-foreground">
            Confirm registrations over WhatsApp — powered by your approved Interakt templates.
          </p>
        </div>
      </div>

      {/* Campaign-wide master switch — same flag as the Form Builder → Integrations toggle */}
      <div className={`mb-5 p-4 rounded-lg border flex items-center justify-between gap-4 ${
        masterOn ? 'bg-green-50 border-green-200' : 'bg-muted border-border'
      }`}>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${masterOn ? 'text-green-900' : 'text-foreground'}`}>WhatsApp for this event</p>
          <p className={`text-xs mt-0.5 ${masterOn ? 'text-green-700' : 'text-muted-foreground'}`}>
            Master switch. When off, no WhatsApp is sent no matter which option below is chosen.
            (Same setting as the Form Builder → Integrations “WhatsApp Messages” toggle.)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {masterSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Switch checked={masterOn} disabled={masterSaving} onCheckedChange={handleMasterToggle} />
        </div>
      </div>

      {!configured && (
        <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          WhatsApp (Interakt) isn't configured on the server, so messages won't send even when turned on.
        </div>
      )}

      {!masterOn && (
        <div className="mb-5 p-3 rounded-lg bg-muted border border-border text-sm text-muted-foreground">
          WhatsApp is currently <strong>off</strong> for this event. Turn on the master switch above to start
          sending — the option you pick below is saved but won't fire until then.
        </div>
      )}

      <div className="mb-5 p-3 rounded-lg bg-muted border border-border text-xs text-muted-foreground flex gap-2">
        <Info className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
        <span>
          Pick <strong>one</strong> of the options below — turning one on turns the others off. Leave all
          off to send no WhatsApp for this event. The recipient is the registrant's phone from the form.
        </span>
      </div>

      <div className="space-y-3">
        {OPTIONS.map((opt) => {
          const t = byTrigger(opt.key);
          if (!t) return null;
          const isOpen = openKey === opt.key;
          const isCommon = opt.key === COMMON || opt.key === COMMON_DETAILED;
          return (
            <div
              key={opt.key}
              className={`ke-card overflow-hidden ${t.is_active ? 'border-green-300' : ''}`}
            >
              <div className="flex items-center justify-between p-4 bg-muted">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                    {t.is_active
                      ? <span className="text-[11px] px-2 py-0.5 rounded-sm bg-green-100 text-green-700 font-medium">On</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded-sm bg-muted text-muted-foreground font-medium">Off</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  {t.effective_template_name && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{t.effective_template_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={!!t.is_active} onCheckedChange={(v) => handleToggle(t, v)} />
                  <Button variant="outline" size="sm" onClick={() => openEditor(t)}>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span className="ml-1">Configure</span>
                  </Button>
                </div>
              </div>

              {isOpen && draft && isCommon && (
                <div className="p-4 border-t border-border space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Message</Label>
                    <pre className="mt-1 p-3 rounded-lg bg-muted border border-border text-xs text-foreground whitespace-pre-wrap font-sans">
                      {COMMON_TEMPLATE_INFO[opt.key].lines.join('\n')}
                    </pre>
                  </div>

                  {renderNameRow(true)}

                  <div>
                    <Label className="text-xs text-muted-foreground">Variables (fixed)</Label>
                    <div className="mt-1 space-y-1.5">
                      {COMMON_TEMPLATE_INFO[opt.key].variables.map((v) => (
                        <div key={v.slot} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground w-9 shrink-0">{v.slot}</span>
                          <span className="font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">{v.value}</span>
                          <span className="text-muted-foreground">{v.label}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      These match the approved wording above and can't be changed. Need different values?
                      Use the custom template option instead.
                    </p>
                  </div>

                  {renderFooter()}
                </div>
              )}

              {isOpen && draft && !isCommon && (
                <div className="p-4 border-t border-border space-y-4">
                  {renderNameRow(false)}

                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Template variables (in order)</Label>
                      <Button variant="ghost" size="sm" onClick={addBodyValue} className="h-7 text-primary">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add variable
                      </Button>
                    </div>
                    <div className="space-y-2 mt-1">
                      {draft.body_values.length === 0 && (
                        <p className="text-xs text-muted-foreground">No variables — the template will send with no dynamic values.</p>
                      )}
                      {draft.body_values.map((v, i) => {
                        const warning = fieldRefWarning(v);
                        return (
                          <div key={i}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground w-9 shrink-0">{`{{${i + 1}}}`}</span>
                              <Input
                                value={v}
                                onChange={(e) => setBodyValue(i, e.target.value)}
                                placeholder="${name}"
                                className="font-mono text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeBodyValue(i)}
                                className="p-1.5 text-muted-foreground hover:text-red-500"
                                title="Remove"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            {warning && (
                              <p className="text-[11px] text-amber-600 mt-1 ml-11">{warning}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">
                          {fieldPlaceholders.length > 0
                            ? "This form's fields — click to add in the right format"
                            : 'This form has no fields yet — build the form to get field suggestions here.'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {fieldPlaceholders.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => addPlaceholder(p)}
                              className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                              title="Add as a variable"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Event &amp; payment values</p>
                        <div className="flex flex-wrap gap-1.5">
                          {SYSTEM_PLACEHOLDERS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => addPlaceholder(p)}
                              className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              title="Add as a variable"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {renderFooter()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Anything left switched on from the older per-trigger setup. Shown only while active so
          no message can keep sending with nowhere to turn it off. */}
      {activeLegacy.length > 0 && (
        <div className="mt-5 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 w-full">
              <p className="text-sm font-semibold text-amber-900">Other messages still switched on</p>
              <p className="text-xs text-amber-800 mt-0.5">
                These were set up before this panel was simplified and are still being sent. Turn them off
                here if you no longer want them.
              </p>
              <div className="mt-3 space-y-2">
                {activeLegacy.map((t) => (
                  <div key={t.trigger} className="flex items-center justify-between gap-3 bg-card/70 rounded-md px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-amber-900">{LEGACY_TRIGGERS[t.trigger]}</p>
                      {t.effective_template_name && (
                        <p className="text-[11px] text-amber-700 font-mono truncate">{t.effective_template_name}</p>
                      )}
                    </div>
                    <Switch checked onCheckedChange={() => handleToggle(t, false)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppTemplates;
