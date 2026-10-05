import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { ArrowLeft, Loader2, X, Receipt, Wallet, HandCoins, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { getInstamojoSession, clearInstamojoSession } from './InstamojoPasswordGate';

const fmtINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtCount = (n) => Number(n || 0).toLocaleString('en-IN');

export default function InstamojoAddPayment() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;

  // Form state
  const [titleId, setTitleId]     = useState(0);
  const [titleText, setTitleText] = useState('');
  const [amount, setAmount]       = useState('');
  const [remark, setRemark]       = useState('');
  const [bankId, setBankId]       = useState(0);

  // Lookups
  const [banks, setBanks]   = useState([]);
  const [summary, setSummary] = useState({
    total_transaction: 0, amount_collected: 0, paid: 0, balance: 0,
  });

  // Purpose autocomplete
  const [acOpen, setAcOpen]   = useState(false);
  const [acItems, setAcItems] = useState([]);
  const acTimer = useRef(null);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!getInstamojoSession()) navigate('/instamojo', { replace: true });
  }, [navigate]);

  // React Router doesn't reset scroll on route change — land at the top of the form.
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, []);

  // Load existing record (edit mode)
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/instamojo-archive/payments/${editId}`);
        if (cancelled) return;
        const d = res.data;
        setTitleId(Number(d.fk_title_id) || 0);
        setTitleText(d.title || '');
        setAmount(d.amount != null ? String(d.amount) : '');
        setRemark(d.remark || '');
        setBankId(d.fk_bank_details_id || 0);
      } catch (err) {
        if (err.response?.status === 403) {
          clearInstamojoSession();
          toast.error('Session expired.');
          navigate('/instamojo', { replace: true });
          return;
        }
        toast.error(err.response?.data?.detail || 'Failed to load payment.');
        navigate('/instamojo/payments', { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, editId, navigate]);

  // Whenever titleId changes, refresh summary cards + bank list.
  // Rotary's Add Payment page calls GetIntamojoPaymentDetails_Page even when
  // fk_title_id="0" — the SP returns global aggregates across all purposes.
  // We mirror that: always hit /payments/summary (omit title_id when 0/falsy
  // → backend treats absent param as "all purposes"). Banks dropdown is
  // per-purpose only, so it stays empty until a Purpose is picked.
  const refreshContext = useCallback(async (tid) => {
    try {
      const sumPromise = api.get('/instamojo-archive/payments/summary', {
        params: tid ? { title_id: tid } : {},
      });
      const banksPromise = tid
        ? api.get(`/instamojo-archive/purposes/${tid}/banks`)
        : Promise.resolve({ data: { banks: [] } });

      const [sumRes, banksRes] = await Promise.all([sumPromise, banksPromise]);
      setSummary(sumRes.data);
      setBanks(banksRes.data?.banks || []);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
      }
    }
  }, [navigate]);

  useEffect(() => { refreshContext(titleId); }, [titleId, refreshContext]);

  // ── Purpose autocomplete ─────────────────────────────────────────────────
  const onTitleChange = (e) => {
    const v = e.target.value;
    setTitleText(v);
    setTitleId(0);
    setBankId(0);
    if (acTimer.current) clearTimeout(acTimer.current);
    if (v.trim().length < 3) { setAcOpen(false); setAcItems([]); return; }
    acTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/instamojo-archive/purposes/autocomplete', {
          params: { q: v.trim(), limit: 10 },
        });
        setAcItems(res.data || []);
        setAcOpen(true);
      } catch {/* ignore */}
    }, 250);
  };
  const pickTitle = (item) => {
    setTitleText(item.title || '');
    setTitleId(item.id);
    setAcOpen(false);
  };
  const clearTitle = () => {
    setTitleText('');
    setTitleId(0);
    setBankId(0);
    setAcOpen(false);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!titleId)              { toast.error('Purpose is mandatory.'); return; }
    if (!amount || !amount.toString().trim())
                                { toast.error('Amount is mandatory.'); return; }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('Enter only numbers');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titleId,
        amount: num,
        remark: remark.trim() || null,
        bankDetailsId: bankId > 0 ? bankId : null,
      };
      if (isEdit) {
        const res = await api.patch(`/instamojo-archive/payments/${editId}`, payload);
        toast.success(res.data?.message || 'Payment Updated Successfully');
      } else {
        const res = await api.post('/instamojo-archive/payments', payload);
        toast.success(res.data?.message || 'Payment added Successfully');
      }
      navigate('/instamojo/payments', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Stat = ({ label, value, isCount = false, icon: Icon, accent = 'hsl(var(--chart-4))', accentSoft = 'hsl(var(--chart-4) / 0.16)' }) => (
    <div className="ke-card relative p-5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">{label}</div>
          <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{isCount ? fmtCount(value) : fmtINR(value)}</div>
        </div>
        {Icon && (
          <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${accentSoft}, transparent 85%)` }}>
            <Icon className="w-5 h-5" style={{ color: accent }} />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="w-full max-w-6xl mx-auto space-y-5">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/instamojo/payments')}
              className="inline-flex items-center gap-1.5 text-[12px] font-jakarta font-medium text-white/70 hover:text-white transition-colors mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Payments
            </button>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance · Instamojo</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">{isEdit ? 'Edit Payment Details' : 'Add Payment Details'}</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5">Record a payout against a purpose and its bank account.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Form */}
          <div className="ke-card p-5">
            <h3 className="ke-section-title text-[15px]">Payment Details</h3>
            <div className="ke-rule-gold mt-2 mb-4" />
            <div className="space-y-3">
              {/* Purpose autocomplete */}
              <div className="relative">
                <Label>Purpose <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Input value={titleText}
                    onChange={onTitleChange}
                    onFocus={() => acItems.length && setAcOpen(true)}
                    onBlur={() => setTimeout(() => setAcOpen(false), 150)}
                    placeholder="Enter Purpose (min 3 chars)"
                    disabled={isEdit /* match Rotary: title locked when editing */} />
                  {!isEdit && titleText && (
                    <Button variant="outline" size="icon" onClick={clearTitle} title="Clear">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {acOpen && acItems.length > 0 && (
                  <div className="absolute z-20 mt-1 w-[calc(100%-3rem)] bg-card border border-border rounded-md shadow-md max-h-64 overflow-y-auto">
                    {acItems.map((it) => (
                      <button key={it.id}
                        type="button"
                        className="block w-full text-left px-3 py-2 text-sm text-foreground hover:bg-primary-subtle transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); pickTitle(it); }}>
                        {it.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bank list */}
              <div>
                <Label>Bank list</Label>
                <select value={bankId}
                  onChange={(e) => setBankId(Number(e.target.value))}
                  className="w-full h-10 rounded-md border border-border px-2 bg-card text-foreground text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring">
                  <option value={0}>Select</option>
                  {banks.map((b) => (
                    <option key={b.pk_purposetitle_bank_details_id} value={b.pk_purposetitle_bank_details_id}>
                      {[b.account_name, b.bank_name, b.account_number].filter(Boolean).join(' | ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="0.00"
                  inputMode="decimal" />
              </div>

              {/* Remark */}
              <div>
                <Label>Remark</Label>
                <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark" />
              </div>

              <div className="text-center pt-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : (isEdit ? 'Update' : 'Save')}
                </Button>
              </div>
            </div>
          </div>

          {/* Summary cards (right column on desktop) */}
          <div className="grid grid-cols-2 gap-4 content-start">
            <Stat label="Total Transaction" value={summary.total_transaction} isCount
              icon={Receipt} accent="hsl(var(--chart-1))" accentSoft="hsl(var(--chart-1) / 0.16)" />
            <Stat label="Amount Collected"  value={summary.amount_collected}
              icon={Wallet} accent="hsl(var(--chart-4))" accentSoft="hsl(var(--chart-4) / 0.16)" />
            <Stat label="Paid"               value={summary.paid}
              icon={HandCoins} accent="hsl(152 58% 40%)" accentSoft="hsl(152 58% 40% / 0.16)" />
            <Stat label="Balance"            value={summary.balance}
              icon={Scale} accent="hsl(38 92% 48%)" accentSoft="hsl(38 92% 48% / 0.16)" />
          </div>
        </div>
      </div>
    </div>
  );
}
