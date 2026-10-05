import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Ticket, Plus, Pencil, Trash2, Loader2, Info, X, Save, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';

// Mirrors CouponCalculator.DeriveStatus on the server.
const STATUS_STYLES = {
  active:    { label: 'Active',    className: 'bg-green-100 text-green-700 border-green-200' },
  scheduled: { label: 'Scheduled', className: 'bg-primary-subtle text-primary border-primary/20' },
  expired:   { label: 'Expired',   className: 'bg-muted text-muted-foreground border-border' },
  exhausted: { label: 'Used up',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  inactive:  { label: 'Off',       className: 'bg-muted text-muted-foreground border-border' },
};

const EMPTY_FORM = {
  code: '',
  discount_type: 'percentage',
  discount_value: '',
  max_discount_amount: '',
  min_discount_amount: '',
  valid_from: '',
  valid_until: '',
  usage_limit: '',
  description: '',
  is_active: true,
};

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" with no zone; the API speaks ISO.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

const numberOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** The discount rule in words, matching what a registrant will actually get. */
const describeTerms = (c) => {
  const base = c.discount_type === 'percentage'
    ? `${c.discount_value}% off`
    : c.discount_type === 'fixed'
      ? `${inr(c.discount_value)} off`
      : 'Formula';
  const parts = [base];
  if (c.max_discount_amount) parts.push(`max ${inr(c.max_discount_amount)}`);
  if (c.min_discount_amount) parts.push(`min ${inr(c.min_discount_amount)}`);
  return parts.join(' · ');
};

const CouponCodes = ({ campaignId, campaignName }) => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);   // null = closed, 'new' = create
  const [form, setForm] = useState(EMPTY_FORM);
  const [copiedCode, setCopiedCode] = useState(null);

  const fetchCoupons = useCallback(async () => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/coupons`);
      setCoupons(res.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load coupon codes');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };

  const openEdit = (c) => {
    setForm({
      code: c.code || '',
      discount_type: c.discount_type || 'percentage',
      discount_value: c.discount_value ?? '',
      max_discount_amount: c.max_discount_amount ?? '',
      min_discount_amount: c.min_discount_amount ?? '',
      valid_from: toLocalInput(c.valid_from),
      valid_until: toLocalInput(c.valid_until),
      usage_limit: c.usage_limit ?? '',
      description: c.description || '',
      is_active: c.is_active,
    });
    setEditingId(c.id);
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Client-side checks mirror CouponCalculator.ValidateTerms so the admin gets an
  // instant, specific message. The server re-checks all of it regardless.
  const validate = () => {
    if (!form.code.trim()) return 'Enter a coupon code.';
    const value = numberOrNull(form.discount_value);
    if (value === null || value <= 0) return 'Enter a discount greater than 0.';
    if (form.discount_type === 'percentage' && value > 100) return 'A percentage discount cannot be more than 100%.';

    const cap = numberOrNull(form.max_discount_amount);
    const floor = numberOrNull(form.min_discount_amount);
    if (cap !== null && cap < 0) return 'Maximum deduction cannot be negative.';
    if (floor !== null && floor < 0) return 'Minimum deduction cannot be negative.';
    if (cap !== null && floor !== null && floor > cap)
      return 'Minimum deduction cannot be greater than maximum deduction.';

    if (form.valid_from && form.valid_until && new Date(form.valid_from) >= new Date(form.valid_until))
      return 'The start date must be before the end date.';

    const limit = numberOrNull(form.usage_limit);
    if (limit !== null && limit < 1) return 'Usage limit must be at least 1.';

    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }

    const isNew = editingId === 'new';
    const payload = {
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: numberOrNull(form.discount_value),
      max_discount_amount: numberOrNull(form.max_discount_amount),
      min_discount_amount: numberOrNull(form.min_discount_amount),
      valid_from: fromLocalInput(form.valid_from),
      valid_until: fromLocalInput(form.valid_until),
      usage_limit: numberOrNull(form.usage_limit),
      description: form.description.trim(),
      is_active: form.is_active,
    };

    // On edit, a blank box means "remove this limit" — which null alone can't say,
    // since null also means "leave unchanged" on the update endpoint.
    if (!isNew) {
      payload.clear_max_discount = numberOrNull(form.max_discount_amount) === null;
      payload.clear_min_discount = numberOrNull(form.min_discount_amount) === null;
      payload.clear_valid_from   = !form.valid_from;
      payload.clear_valid_until  = !form.valid_until;
      payload.clear_usage_limit  = numberOrNull(form.usage_limit) === null;
    }

    setSaving(true);
    try {
      if (isNew) {
        await api.post(`/campaigns/${campaignId}/coupons`, payload);
        toast.success('Coupon created');
      } else {
        await api.put(`/campaigns/${campaignId}/coupons/${editingId}`, payload);
        toast.success('Coupon updated');
      }
      closeForm();
      await fetchCoupons();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save the coupon');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon) => {
    try {
      await api.patch(`/campaigns/${campaignId}/coupons/${coupon.id}/status`, {
        is_active: !coupon.is_active,
      });
      toast.success(coupon.is_active ? 'Coupon deactivated' : 'Coupon activated');
      await fetchCoupons();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change the coupon status');
    }
  };

  const handleDelete = async (coupon) => {
    // A redeemed coupon is referenced by those registrations; deleting it loses the
    // record of why they paid less, so make that consequence explicit.
    const warning = coupon.times_used > 0
      ? `"${coupon.code}" has been used ${coupon.times_used} time(s). Deleting it will not change those registrations, but the offer's details will be lost. Delete anyway?`
      : `Delete the coupon "${coupon.code}"?`;
    // eslint-disable-next-line no-restricted-globals
    if (!window.confirm(warning)) return;

    try {
      await api.delete(`/campaigns/${campaignId}/coupons/${coupon.id}`);
      toast.success('Coupon deleted');
      await fetchCoupons();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete the coupon');
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast.error('Could not copy the code');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const isEditing = editingId !== null;
  const isPercentage = form.discount_type === 'percentage';

  return (
    <div className="ke-card p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span
            className="ke-medallion shrink-0"
            style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
          >
            <Ticket className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div>
            <h2 className="ke-section-title text-lg">Coupon Codes</h2>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-sm font-jakarta text-muted-foreground">
              Discounts for {campaignName}. Only you and super admins can see these codes.
            </p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            New Coupon
          </Button>
        )}
      </div>

      {isEditing && (
        <div className="mb-6 rounded-xl border border-border bg-muted p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-outfit font-semibold text-foreground">
              {editingId === 'new' ? 'New coupon' : `Edit ${form.code}`}
            </h3>
            <Button variant="ghost" size="sm" onClick={closeForm}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="coupon-code">Coupon code</Label>
              <Input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setField('code', e.target.value.toUpperCase())}
                placeholder="SAVE10"
                maxLength={100}
                className="mt-1 font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                What the registrant types on the registration form. Always upper case.
              </p>
            </div>

            <div>
              <Label htmlFor="coupon-type">Discount type</Label>
              <select
                id="coupon-type"
                value={form.discount_type}
                onChange={(e) => setField('discount_type', e.target.value)}
                className="mt-1 w-full h-10 rounded-md border border-border bg-card px-3 text-sm font-jakarta text-foreground"
              >
                <option value="percentage">Percentage of the total</option>
                <option value="fixed">Flat rupee amount</option>
              </select>
            </div>

            <div>
              <Label htmlFor="coupon-value">
                {isPercentage ? 'Percentage off' : 'Amount off (₹)'}
              </Label>
              <Input
                id="coupon-value"
                type="number"
                min="0"
                max={isPercentage ? '100' : undefined}
                step="0.01"
                value={form.discount_value}
                onChange={(e) => setField('discount_value', e.target.value)}
                placeholder={isPercentage ? '10' : '250'}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="coupon-max">Maximum deduction (₹)</Label>
              <Input
                id="coupon-max"
                type="number"
                min="0"
                step="0.01"
                value={form.max_discount_amount}
                onChange={(e) => setField('max_discount_amount', e.target.value)}
                placeholder="No limit"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The discount never goes above this, however large the total.
              </p>
            </div>

            <div>
              <Label htmlFor="coupon-min">Minimum deduction (₹)</Label>
              <Input
                id="coupon-min"
                type="number"
                min="0"
                step="0.01"
                value={form.min_discount_amount}
                onChange={(e) => setField('min_discount_amount', e.target.value)}
                placeholder="No minimum"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The discount is lifted to at least this, but never above the amount due.
              </p>
            </div>

            <div>
              <Label htmlFor="coupon-from">Starts</Label>
              <Input
                id="coupon-from"
                type="datetime-local"
                value={form.valid_from}
                onChange={(e) => setField('valid_from', e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to start immediately.</p>
            </div>

            <div>
              <Label htmlFor="coupon-until">Expires</Label>
              <Input
                id="coupon-until"
                type="datetime-local"
                value={form.valid_until}
                onChange={(e) => setField('valid_until', e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Stops working automatically at this moment. Blank means never.
              </p>
            </div>

            <div>
              <Label htmlFor="coupon-limit">Usage limit</Label>
              <Input
                id="coupon-limit"
                type="number"
                min="1"
                step="1"
                value={form.usage_limit}
                onChange={(e) => setField('usage_limit', e.target.value)}
                placeholder="Unlimited"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How many registrants may redeem it in total.
              </p>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="coupon-desc">Note to yourself (optional)</Label>
              <Input
                id="coupon-desc"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Early-bird offer for the mailing list"
                maxLength={255}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Never shown to registrants.</p>
            </div>

            <div className="md:col-span-2 flex items-center gap-3 pt-1">
              <Switch
                id="coupon-active"
                checked={form.is_active}
                onCheckedChange={(v) => setField('is_active', v)}
              />
              <Label htmlFor="coupon-active" className="cursor-pointer">
                Active — registrants can use this code
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />}
              {editingId === 'new' ? 'Create coupon' : 'Save changes'}
            </Button>
            <Button variant="outline" onClick={closeForm} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <Ticket className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-jakarta text-muted-foreground">No coupon codes yet.</p>
          <p className="text-sm font-jakarta text-muted-foreground mt-1">
            Create one and share the code with the people you want to give a discount to.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => {
            const status = STATUS_STYLES[c.status] || STATUS_STYLES.active;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-border p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => copyCode(c.code)}
                        title="Copy code"
                        className="font-mono font-semibold text-foreground hover:text-primary flex items-center gap-1.5"
                      >
                        {c.code}
                        {copiedCode === c.code
                          ? <Check className="w-3.5 h-3.5 text-green-600" />
                          : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      <span className={`text-xs px-2 py-0.5 rounded-sm border font-jakarta ${status.className}`}>
                        {status.label}
                      </span>
                    </div>

                    <p className="text-sm font-jakarta text-foreground mt-1">{describeTerms(c)}</p>

                    <p className="text-xs font-jakarta text-muted-foreground mt-1">
                      {c.valid_from || c.valid_until
                        ? `${formatDate(c.valid_from)} → ${formatDate(c.valid_until)}`
                        : 'No date limit'}
                      {' · '}
                      {c.usage_limit
                        ? `${c.current_usage}/${c.usage_limit} used`
                        : `${c.current_usage} used`}
                      {c.created_by_name ? ` · by ${c.created_by_name}` : ''}
                    </p>

                    {c.times_used > 0 && (
                      <p className="text-xs font-jakarta text-muted-foreground mt-1">
                        Given away {inr(c.total_discount_given)} across {c.times_used} paid
                        registration{c.times_used === 1 ? '' : 's'} · average {inr(c.average_discount)}
                        {c.lowest_discount !== null && c.highest_discount !== null
                          ? ` · from ${inr(c.lowest_discount)} to ${inr(c.highest_discount)}`
                          : ''}
                      </p>
                    )}

                    {c.description && (
                      <p className="text-xs font-jakarta text-muted-foreground mt-1 italic">{c.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={() => handleToggle(c)}
                      title={c.is_active ? 'Deactivate' : 'Activate'}
                    />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Edit">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(c)}
                      title="Delete"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-start gap-2 text-xs font-jakarta text-muted-foreground bg-muted rounded-lg p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          A coupon stops working the moment it expires, is switched off, or reaches its usage
          limit — the registrant is told which. The discounted amount is recalculated on our
          server at checkout, so the code cannot be tampered with in the browser.
        </p>
      </div>
    </div>
  );
};

export default CouponCodes;
