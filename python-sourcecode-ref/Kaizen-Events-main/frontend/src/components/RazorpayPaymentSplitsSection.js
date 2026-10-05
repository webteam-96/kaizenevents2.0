import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Plus, Trash2, AlertCircle, CheckCircle, ExternalLink, Loader2, Star, Split
} from 'lucide-react';
import { toast } from 'sonner';
import { SPLIT_TYPES, SPLIT_TYPE_LABEL } from '../constants/razorpay';

/**
 * Per-campaign Payment Splits editor (Razorpay Route).
 *
 *  Same semantics as the Cashfree version:
 *   - One read-only row at the top showing the Kaizen default Linked Account + global %.
 *   - 1..N editable rows below. Each row picks a Linked Account + a split_type:
 *       "percentage" → % of order amount
 *       "fixed"      → flat ₹ amount
 *       "residual"   → absorbs whatever remains (no value entered)
 *   - Exactly one row must be "residual".
 *   - Sum of percentages (event rows) + Kaizen default % must be < 100.
 *
 *  Renders whenever payment_gateway === 'razorpay'. Razorpay events are always
 *  direct-to-organizer; Route's transfers[] applies the splits at order time
 *  regardless of the campaign's fund collection mode.
 */
const PREVIEW_AMOUNT = 10000;
const GATEWAY = 'razorpay';

const RazorpayPaymentSplitsSection = ({ campaignId, paymentGateway }) => {
  const navigate = useNavigate();
  const isApplicable = paymentGateway === 'razorpay';

  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [vendors, setVendors]               = useState([]);
  const [kaizenDefault, setKaizenDefault]   = useState(null);
  const [rows, setRows]                     = useState([]);

  const fetchData = useCallback(async () => {
    if (!isApplicable) { setLoading(false); return; }
    setLoading(true);
    try {
      const [existingRes, vendorsRes, defaultRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}/vendor-splits?gateway=${GATEWAY}`),
        api.get(`/campaigns/${campaignId}/vendor-splits/available-vendors?gateway=${GATEWAY}`),
        api.get(`/campaigns/${campaignId}/vendor-splits/kaizen-default?gateway=${GATEWAY}`)
      ]);
      setVendors(vendorsRes.data || []);
      setKaizenDefault(defaultRes.data || { configured: false });

      const existing = existingRes.data || [];
      if (existing.length === 0) {
        setRows([{ vendor_id: '', split_type: SPLIT_TYPES.RESIDUAL, value: '' }]);
      } else {
        setRows(existing.map(r => ({
          vendor_id:  r.vendor_id,
          split_type: r.split_type,
          value:      r.value != null ? String(r.value) : ''
        })));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load vendor splits');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isApplicable]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isApplicable) return null;

  // ── Derived values ────────────────────────────────────────────────────────
  const defaultPct      = kaizenDefault?.configured ? Number(kaizenDefault.default_percentage || 0) : 0;
  const defaultAmount   = Math.round(PREVIEW_AMOUNT * defaultPct) / 100;

  const percentRows = rows.filter(r => r.split_type === SPLIT_TYPES.PERCENTAGE);
  const fixedRows   = rows.filter(r => r.split_type === SPLIT_TYPES.FIXED);
  const residualRows= rows.filter(r => r.split_type === SPLIT_TYPES.RESIDUAL);

  const sumPctValue    = percentRows.reduce((a, r) => a + (parseFloat(r.value) || 0), 0);
  const sumFixedValue  = fixedRows.reduce((a, r) => a + (parseFloat(r.value) || 0), 0);
  const previewPctAmt  = Math.round(PREVIEW_AMOUNT * sumPctValue) / 100;
  const previewResidual= Math.max(0, PREVIEW_AMOUNT - defaultAmount - previewPctAmt - sumFixedValue);

  // ── Validation ────────────────────────────────────────────────────────────
  const errors = [];
  if (!kaizenDefault?.configured)
    errors.push('Set a Kaizen default Linked Account on the Razorpay Route Accounts page first.');
  if (residualRows.length !== 1)
    errors.push('Exactly one row must be marked as Residual.');
  if (rows.some(r => !r.vendor_id))
    errors.push('Pick a Linked Account for every row.');
  rows.forEach(r => {
    if (r.split_type === SPLIT_TYPES.PERCENTAGE) {
      const v = parseFloat(r.value);
      if (!Number.isFinite(v) || v <= 0 || v >= 100) errors.push('Percentage rows need a value between 0 and 100.');
    } else if (r.split_type === SPLIT_TYPES.FIXED) {
      const v = parseFloat(r.value);
      if (!Number.isFinite(v) || v <= 0) errors.push('Fixed rows need an amount greater than zero.');
    }
  });
  if (kaizenDefault?.configured && sumPctValue + defaultPct >= 100)
    errors.push(`Sum of percentage splits (${sumPctValue.toFixed(2)}%) + Kaizen default (${defaultPct.toFixed(2)}%) must be less than 100%.`);

  const uniqueErrors = Array.from(new Set(errors));
  const canSave = uniqueErrors.length === 0 && !saving;

  // ── Row helpers ───────────────────────────────────────────────────────────
  const updateRow = (idx, patch) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const setRowType = (idx, newType) => {
    setRows(rs => rs.map((r, i) => {
      if (i !== idx) return r;
      return { ...r, split_type: newType, value: newType === SPLIT_TYPES.RESIDUAL ? '' : r.value };
    }));
  };

  const addRow = () => {
    setRows(rs => [...rs, { vendor_id: '', split_type: SPLIT_TYPES.PERCENTAGE, value: '' }]);
  };

  const removeRow = (idx) => {
    setRows(rs => rs.filter((_, i) => i !== idx));
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) {
      toast.error(uniqueErrors[0]);
      return;
    }
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}/vendor-splits`, {
        gateway: GATEWAY,
        splits: rows.map(r => ({
          vendor_id:  r.vendor_id,
          split_type: r.split_type,
          value:      r.split_type === SPLIT_TYPES.RESIDUAL ? null : parseFloat(r.value)
        }))
      });
      toast.success('Payment splits saved.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save splits');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="ke-card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}>
            <Split className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div>
            <h3 className="ke-section-title text-lg">Payment Splits (Razorpay Route)</h3>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Kaizen default Linked Account takes a fixed % on every event. Add per-event vendors below — mix percentages and fixed ₹ amounts.
              One row must be the residual; it absorbs whatever's left.
            </p>
          </div>
        </div>
        <a
          href={`/razorpay-route?return_to=/campaigns/${campaignId}/edit`}
          onClick={(e) => { e.preventDefault(); navigate(`/razorpay-route?return_to=/campaigns/${campaignId}/edit`); }}
          className="text-xs text-primary hover:underline flex items-center gap-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage vendors <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Kaizen default — locked row */}
          {kaizenDefault?.configured ? (
            <div className="border border-primary-subtle bg-primary-subtle rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 text-primary" />
                <Label className="text-xs text-primary font-semibold uppercase">
                  Kaizen Default (auto-applied to every event)
                </Label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">{kaizenDefault.label}</span>
                <span className="text-sm font-mono font-semibold text-primary tabular-nums text-right">
                  {defaultPct.toFixed(2)}% (≈ ₹{defaultAmount.toFixed(2)} of ₹{PREVIEW_AMOUNT})
                </span>
              </div>
              <p className="text-[11px] text-primary mt-1">
                Configure on the Razorpay Route Accounts page. This Linked Account cannot be added as a per-event split.
              </p>
            </div>
          ) : (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-xs text-amber-800">
                <strong>No Kaizen default Linked Account configured.</strong> Set a Kaizen default Linked Account on the Razorpay Route Accounts page —
                pick a Linked Account's action menu → "Set as Kaizen default", and set its global percentage. Razorpay payments will fail
                on this event until then.
              </div>
            </div>
          )}

          {/* Per-event vendor rows */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <Label className="text-xs text-foreground font-semibold uppercase">Event Vendors</Label>
            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No vendors yet. Add at least one row (with one residual).</p>
            )}
            {rows.map((r, idx) => {
              const isResidual = r.split_type === SPLIT_TYPES.RESIDUAL;
              const preview =
                r.split_type === SPLIT_TYPES.PERCENTAGE && Number.isFinite(parseFloat(r.value))
                  ? `≈ ₹${(PREVIEW_AMOUNT * parseFloat(r.value) / 100).toFixed(2)}`
                  : r.split_type === SPLIT_TYPES.FIXED && Number.isFinite(parseFloat(r.value))
                    ? `= ₹${parseFloat(r.value).toFixed(2)}`
                    : isResidual ? `≈ ₹${previewResidual.toFixed(2)}` : '';
              return (
                <div key={idx} className="flex flex-wrap gap-2 items-center">
                  <select
                    value={r.vendor_id || ''}
                    onChange={(e) => updateRow(idx, { vendor_id: e.target.value })}
                    className="flex-1 min-w-[180px] h-9 text-sm border border-border rounded px-2 bg-background text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  >
                    <option value="">— Select Linked Account —</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                  <select
                    value={r.split_type}
                    onChange={(e) => setRowType(idx, e.target.value)}
                    className="h-9 text-sm border border-border rounded px-2 bg-background text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  >
                    {Object.values(SPLIT_TYPES).map(t => (
                      <option key={t} value={t}>{SPLIT_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.value}
                    onChange={(e) => updateRow(idx, { value: e.target.value })}
                    disabled={isResidual}
                    placeholder={isResidual ? 'auto' : (r.split_type === SPLIT_TYPES.PERCENTAGE ? '%' : '₹')}
                    className="w-24 h-9 text-sm text-right tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground w-32 text-right tabular-nums">{preview}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                    className="text-red-500 hover:bg-red-50 h-9 px-2"
                    title="Remove this vendor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add vendor row
            </Button>
            {vendors.length === 0 && (
              <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                No active Linked Accounts available. Add and activate Linked Accounts on the Razorpay Route Accounts page.
              </p>
            )}
          </div>

          {/* Summary panel */}
          <div className={`flex items-start justify-between border rounded-lg p-3 ${uniqueErrors.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-start gap-2 text-xs">
              {uniqueErrors.length === 0 ? (
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              )}
              <div className={uniqueErrors.length === 0 ? 'text-green-800' : 'text-amber-800'}>
                <div className="font-medium tabular-nums">
                  Preview at ₹{PREVIEW_AMOUNT.toLocaleString()}: Kaizen ₹{defaultAmount.toFixed(2)}
                  + %-rows ₹{previewPctAmt.toFixed(2)}
                  + fixed ₹{sumFixedValue.toFixed(2)}
                  + residual ₹{previewResidual.toFixed(2)}
                </div>
                {uniqueErrors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {uniqueErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="bg-primary hover:bg-primary-hover"
              size="sm"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Splits
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};

export default RazorpayPaymentSplitsSection;
