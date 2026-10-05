import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table';
import {
  MessageCircle, Loader2, Plus, X, Info, AlertTriangle, Search, RefreshCw, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  COMMON, COMMON_DETAILED, OPTIONS, COMMON_TEMPLATE_INFO,
  LEGACY_TRIGGERS, SYSTEM_PLACEHOLDERS, labelForTrigger,
} from '../constants/whatsapp';

// Every trigger a campaign can have, in the order the picker shows them — the three normal
// options first, then the older per-trigger messages (still functional, just no longer the
// default setup path — see WhatsAppTemplates.js).
const ALL_TRIGGER_KEYS = [...OPTIONS.map((o) => o.key), ...Object.keys(LEGACY_TRIGGERS)];

const blankDraft = () => ({
  template_name: '',
  body_values: [],
  language_code: 'en',
  country_code: '91',
  is_active: false,
});

const WhatsAppTemplatesManager = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [campaigns, setCampaigns] = useState([]); // [{campaign_id, campaign_name, whatsapp_enabled, templates:[{trigger,is_active,template_name,effective_template_name,body_values}]}]
  const [trigger, setTrigger] = useState(COMMON);
  const [draft, setDraft] = useState(blankDraft());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set()); // campaign_ids this apply will target

  useEffect(() => {
    if (!isSuperAdmin()) {
      toast.error('Only Super Admin can manage integrations.');
      navigate('/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await api.get('/whatsapp-templates/overview');
      setConfigured(res.data?.configured !== false);
      const rows = res.data?.campaigns || [];
      setCampaigns(rows);
      setSelected(new Set(rows.map((c) => c.campaign_id)));
    } catch (err) {
      toast.error('Failed to load WhatsApp templates');
    } finally {
      setLoading(false);
    }
  };

  // Every campaign's row for the currently-picked trigger, with a quick lookup by id.
  const rowsForTrigger = useMemo(
    () => campaigns.map((c) => ({
      ...c,
      current: c.templates.find((t) => t.trigger === trigger) || null,
    })),
    [campaigns, trigger],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rowsForTrigger;
    return rowsForTrigger.filter((r) => r.campaign_name.toLowerCase().includes(q));
  }, [rowsForTrigger, search]);

  const isCommon = trigger === COMMON || trigger === COMMON_DETAILED;

  // A common trigger's approved name is the same for every campaign — read it off any row
  // that already resolved one, rather than re-deriving server config client-side.
  const commonEffectiveName = useMemo(() => {
    const hit = rowsForTrigger.find((r) => r.current?.effective_template_name);
    return hit?.current?.effective_template_name || '';
  }, [rowsForTrigger]);

  // Switching trigger starts a fresh draft — each trigger's config is independent, and the
  // active state visible per row already shows what's live so there's nothing to "restore".
  const handleTriggerChange = (key) => {
    setTrigger(key);
    setDraft(blankDraft());
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.campaign_id));
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredRows.forEach((r) => next.delete(r.campaign_id));
      else filteredRows.forEach((r) => next.add(r.campaign_id));
      return next;
    });
  };

  const addPlaceholder = (p) => setDraft((d) => ({ ...d, body_values: [...d.body_values, p] }));
  const setBodyValue = (i, val) =>
    setDraft((d) => ({ ...d, body_values: d.body_values.map((v, idx) => (idx === i ? val : v)) }));
  const addBodyValue = () => setDraft((d) => ({ ...d, body_values: [...d.body_values, ''] }));
  const removeBodyValue = (i) =>
    setDraft((d) => ({ ...d, body_values: d.body_values.filter((_, idx) => idx !== i) }));

  const handleApply = async () => {
    if (selected.size === 0) { toast.error('Select at least one event to apply to.'); return; }
    if (draft.is_active && !isCommon && !draft.template_name.trim()) {
      toast.error('Enter the approved WhatsApp template name to turn this on.');
      return;
    }
    setApplying(true);
    try {
      const res = await api.put('/whatsapp-templates/bulk-apply', {
        trigger,
        template_name: isCommon ? '' : draft.template_name.trim(),
        body_values: isCommon ? [] : draft.body_values.filter((v) => v !== null && v !== undefined),
        language_code: draft.language_code.trim() || 'en',
        country_code: (draft.country_code || '').replace(/\D/g, '') || '91',
        is_active: draft.is_active,
        campaign_ids: Array.from(selected),
      });
      const { updated_count, failed_count, failed } = res.data;
      if (failed_count > 0) {
        toast.error(`Applied to ${updated_count} event(s), ${failed_count} failed — see console for details.`);
        // eslint-disable-next-line no-console
        console.warn('WhatsApp bulk-apply failures:', failed);
      } else {
        toast.success(`Applied "${labelForTrigger(trigger)}" to ${updated_count} event(s).`);
      }
      await fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate('/control-panel/integrations')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Integrations
        </button>

        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Integrations · WhatsApp</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">WhatsApp Templates</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5 max-w-xl">
                Configure one WhatsApp message once and push it to every event, instead of setting each one up
                individually in its own Settings → WhatsApp tab.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={fetchOverview}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
              </Button>
              <Button onClick={handleApply} disabled={applying}
                className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}>
                {applying ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Apply to {selected.size} event{selected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>

        {!configured && (
          <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            WhatsApp (Interakt) isn't configured on the server, so messages won't send even when turned on.
          </div>
        )}

        {/* Trigger picker */}
        <div className="ke-card p-5 mb-5">
          <h3 className="ke-section-title text-[15px]">Which message</h3>
          <div className="ke-rule-gold mt-2 mb-3" />
          <div className="flex flex-wrap gap-2">
            {ALL_TRIGGER_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleTriggerChange(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  trigger === key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                {labelForTrigger(key)}
              </button>
            ))}
          </div>
        </div>

        {/* Editor for the picked trigger */}
        <div className="ke-card p-5 mb-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.22), transparent 85%)' }}>
              <MessageCircle className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <div>
              <h3 className="ke-section-title text-[15px]">{labelForTrigger(trigger)}</h3>
              <div className="ke-rule-gold mt-2" />
            </div>
          </div>
          {isCommon ? (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Message</Label>
                <pre className="mt-1 p-3 rounded-lg bg-muted border border-border text-xs text-foreground whitespace-pre-wrap font-sans">
                  {COMMON_TEMPLATE_INFO[trigger].lines.join('\n')}
                </pre>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Approved template name</Label>
                <div className="mt-1 h-10 px-3 flex items-center rounded-md border border-border bg-muted text-sm font-mono text-foreground truncate">
                  {commonEffectiveName || '—'}
                </div>
                <p className={`text-[11px] mt-1 ${commonEffectiveName ? 'text-muted-foreground' : 'text-amber-600'}`}>
                  {commonEffectiveName
                    ? 'Set on the server and shared by every event.'
                    : 'Not set on the server yet — this message cannot be turned on until it is.'}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Variables (fixed)</Label>
                <div className="mt-1 space-y-1.5">
                  {COMMON_TEMPLATE_INFO[trigger].variables.map((v) => (
                    <div key={v.slot} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground w-9 shrink-0">{v.slot}</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">{v.value}</span>
                      <span className="text-muted-foreground">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Label className="text-xs text-muted-foreground">Approved template name</Label>
                  <Input
                    value={draft.template_name}
                    onChange={(e) => setDraft({ ...draft, template_name: e.target.value })}
                    placeholder="e.g. registration_confirmed"
                    className="mt-1"
                  />
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
                  {draft.body_values.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
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
                  ))}
                </div>
                <div className="mt-3">
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
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    You can also type <code className="font-mono">{'${field:Label}'}</code> for a form field —
                    it resolves per event and sends blank for any event whose form doesn't have that field.
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              Send this message
            </label>
          </div>
        </div>

        {/* Target events */}
        <div className="ke-card p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h3 className="ke-section-title text-[15px]">Apply to</h3>
              <div className="ke-rule-gold mt-2 mb-2" />
              <p className="text-[11px] text-muted-foreground">
                Every event is selected by default. Uncheck any you want to leave untouched.
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events…"
                className="pl-8 h-9 w-56"
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border border-border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="w-10">
                    <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Event</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">This message</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">WhatsApp for event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      No events match "{search}".
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map((r) => (
                  <TableRow key={r.campaign_id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.campaign_id)}
                        onCheckedChange={() => toggleRow(r.campaign_id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-foreground">{r.campaign_name}</TableCell>
                    <TableCell>
                      {r.current?.is_active ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-sm bg-green-100 text-green-700 font-medium">On</span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-sm bg-muted text-muted-foreground font-medium">Off</span>
                      )}
                      {r.current?.effective_template_name && (
                        <span className="ml-2 text-[11px] text-muted-foreground font-mono">{r.current.effective_template_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.whatsapp_enabled ? (
                        <span className="text-xs text-muted-foreground">On</span>
                      ) : (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Off — nothing sends here yet
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button onClick={handleApply} disabled={applying}
            className="rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105"
            style={{ background: 'hsl(var(--accent))', color: '#091D40' }}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Apply to {selected.size} event{selected.size === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppTemplatesManager;
