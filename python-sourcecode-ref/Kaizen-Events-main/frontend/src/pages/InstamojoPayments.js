import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  ArrowLeft, Plus, Filter, Pencil, Trash2, Loader2, X,
  Wallet, Percent, ArrowDownToLine, CheckCircle2, Scale,
  Banknote, Clock, HandCoins, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { getInstamojoSession, clearInstamojoSession } from './InstamojoPasswordGate';

const PAGE_SIZE = 20;

// Brand/semantic accent bodies expressed as design-token HSL so every swatch
// re-skins in both light and dark mode. Presentation only — no values change.
const ACCENT_HSL = {
  slate:   'var(--chart-1)',   // navy
  sky:     'var(--chart-4)',   // steel-blue
  amber:   '38 92% 48%',       // warning gold
  emerald: '152 58% 40%',      // success green
  teal:    'var(--chart-4)',
  rose:    'var(--chart-3)',   // red
  indigo:  'var(--chart-1)',
  violet:  'var(--chart-1)',
  orange:  '30 90% 50%',
};
const accentBody = (name) => ACCENT_HSL[name] || 'var(--chart-1)';
const accentSolid = (name) => `hsl(${accentBody(name)})`;
const accentSoft  = (name) => `hsl(${accentBody(name)} / 0.16)`;

const fmtINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Transaction-date cells show full date+time in IST, 24-hour, e.g. "02/05/2026 16:20:46".
const DT_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone:  'Asia/Kolkata',
  day:       '2-digit',
  month:     '2-digit',
  year:      'numeric',
  hour:      '2-digit',
  minute:    '2-digit',
  second:    '2-digit',
  hour12:    false,
});
const fmtDateTime = (s) => {
  if (!s) return '—';
  const raw = String(s);
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
  const dt = new Date(hasTz ? raw : raw + 'Z');
  if (isNaN(dt.getTime())) return raw;
  return DT_FMT.format(dt).replace(', ', ' ');
};

export default function InstamojoPayments() {
  const navigate = useNavigate();

  // Filter form state (what's in the inputs right now)
  const [titleId, setTitleId] = useState(0);
  const [titleText, setTitleText] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');

  // Applied filters (what the API actually sees). Purpose pick auto-applies;
  // dates only apply when the Filter button is clicked. Matches Rotary 1:1.
  const [applied, setApplied] = useState({ titleId: 0, from: '', to: '' });

  // Purpose autocomplete
  const [acOpen, setAcOpen]   = useState(false);
  const [acItems, setAcItems] = useState([]);
  const acTimer = useRef(null);

  // Dashboard + grid
  const [loading, setLoading] = useState(true);
  const [dash, setDash]       = useState(null);
  const [page, setPage]       = useState(1);
  const [grid, setGrid]       = useState({ total: 0, total_pages: 0, results: [] });

  // Show Profit
  const [profitDialogOpen, setProfitDialogOpen] = useState(false);
  const [profitPwd, setProfitPwd]               = useState('');
  const [profitVerifying, setProfitVerifying]   = useState(false);
  const [profitVisible, setProfitVisible]       = useState(false);
  const [profitValue, setProfitValue]           = useState(0);

  // OTP delete
  const [deletingRow, setDeletingRow]   = useState(null);
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpInput, setOtpInput]         = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpRecipient, setOtpRecipient]   = useState('');

  // Session check
  useEffect(() => {
    if (!getInstamojoSession()) navigate('/instamojo', { replace: true });
  }, [navigate]);

  const buildParams = useCallback(() => {
    const p = {};
    if (applied.titleId) p.title_id = applied.titleId;
    if (applied.from)    p.from = applied.from;
    if (applied.to)      p.to = applied.to;
    return p;
  }, [applied]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/instamojo-archive/payments/dashboard', { params: buildParams() });
      setDash(res.data);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      toast.error(err.response?.data?.detail || 'Failed to load dashboard.');
    }
  }, [buildParams, navigate]);

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/instamojo-archive/payments', {
        params: { ...buildParams(), page, size: PAGE_SIZE },
      });
      setGrid(res.data);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      toast.error(err.response?.data?.detail || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, navigate]);

  useEffect(() => { fetchDashboard(); fetchGrid(); }, [fetchDashboard, fetchGrid]);

  // Reset profit reveal whenever the APPLIED filter scope changes
  useEffect(() => { setProfitVisible(false); setProfitValue(0); }, [applied]);

  // ─── Purpose autocomplete ────────────────────────────────────────────────
  const onTitleChange = (e) => {
    const v = e.target.value;
    setTitleText(v);
    setTitleId(0);
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
    setPage(1);
    // Auto-apply on Purpose pick (Rotary's fncsave behavior). Carry whatever
    // dates have already been applied so we don't accidentally drop them.
    setApplied((a) => ({ ...a, titleId: item.id }));
  };
  const clearTitle = () => {
    setTitleText('');
    setTitleId(0);
    setAcOpen(false);
    setPage(1);
    setApplied((a) => ({ ...a, titleId: 0 }));
  };

  // Filter button — only point at which dates are applied.
  const applyFilter = () => {
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      toast.error('Please select both From Date and To Date.');
      return;
    }
    setPage(1);
    setApplied({ titleId, from: fromDate, to: toDate });
  };

  // ─── Show Profit ──────────────────────────────────────────────────────────
  const openProfit = () => {
    setProfitPwd('');
    setProfitDialogOpen(true);
  };
  const validateProfit = async () => {
    if (!profitPwd) { toast.error('Enter password.'); return; }
    setProfitVerifying(true);
    try {
      const res = await api.post('/instamojo-archive/show-profit', {
        password: profitPwd,
        from:     applied.from    || null,
        to:       applied.to      || null,
        title_id: applied.titleId || null,
      });
      setProfitValue(res.data.profit ?? 0);
      setProfitVisible(true);
      setProfitDialogOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Wrong Password');
    } finally {
      setProfitVerifying(false);
    }
  };

  // ─── OTP delete ───────────────────────────────────────────────────────────
  const startDelete = async (row) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    setDeletingRow(row);
    setOtpRequesting(true);
    try {
      const res = await api.post(`/instamojo-archive/payments/${row.id}/request-delete-otp`);
      setOtpRecipient(res.data?.recipient_masked || '');
      // Dev-mode only: backend may return OTP in response. Pre-fill so testing doesn't need email.
      if (res.data?.dev_otp) {
        setOtpInput(res.data.dev_otp);
        toast.info('Dev mode: OTP filled in for testing.');
      } else {
        setOtpInput('');
        if (res.data?.emailed) toast.success('OTP sent — check the configured inbox.');
        else                   toast.warning('OTP generated but email could not be sent. Check API logs.');
      }
      setOtpDialogOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP.');
      setDeletingRow(null);
    } finally {
      setOtpRequesting(false);
    }
  };
  const verifyAndDelete = async () => {
    if (!deletingRow || !otpInput.trim()) { toast.error('Enter OTP.'); return; }
    setOtpVerifying(true);
    try {
      await api.post(`/instamojo-archive/payments/${deletingRow.id}/confirm-delete`, {
        otp: otpInput.trim(),
      });
      toast.success('Payment Deleted Successfully');
      setOtpDialogOpen(false);
      setDeletingRow(null);
      setOtpInput('');
      fetchDashboard();
      fetchGrid();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid OTP');
    } finally {
      setOtpVerifying(false);
    }
  };
  const cancelOtp = () => {
    setOtpDialogOpen(false);
    setDeletingRow(null);
    setOtpInput('');
    setOtpRecipient('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const totalPages = grid.total_pages || 1;
  const startIdx = grid.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIdx   = Math.min(page * PAGE_SIZE, grid.total);

  const Stat = ({ label, value, accent = 'slate', icon: Icon }) => (
    <div className="ke-card relative p-5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accentSolid(accent)}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">{label}</div>
          <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{fmtINR(value)}</div>
        </div>
        {Icon && (
          <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${accentSoft(accent)}, transparent 85%)` }}>
            <Icon className="w-5 h-5" style={{ color: accentSolid(accent) }} />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="w-full space-y-5">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/instamojo/list')}
              className="inline-flex items-center gap-1.5 text-[12px] font-jakarta font-medium text-white/70 hover:text-white transition-colors mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Instamojo
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance · Instamojo</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Instamojo Payments</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Collections, payouts and reconciliation across every purpose.</p>
              </div>
              <Button onClick={() => navigate('/instamojo/payment/new')}
                className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}>
                <Plus className="w-4 h-4 mr-1.5" /> Add
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="ke-card p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2 relative">
              <Label>Search Purpose</Label>
              <div className="flex gap-2">
                <Input value={titleText}
                  onChange={onTitleChange}
                  onFocus={() => acItems.length && setAcOpen(true)}
                  onBlur={() => setTimeout(() => setAcOpen(false), 150)}
                  placeholder="Enter Purpose (min 3 chars)" />
                {titleText && (
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
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={applyFilter}>
              <Filter className="w-4 h-4 mr-1" /> Filter
            </Button>
          </div>
        </div>

        {/* Instamojo strip — 5 cards */}
        <div>
          <h3 className="ke-section-title text-[15px]">Instamojo</h3>
          <div className="ke-rule-gold mt-2 mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Total Collection"     value={dash?.total_collection}     accent="sky"     icon={Wallet} />
            <Stat label="Instamojo Commission" value={dash?.instamojo_commission} accent="amber"   icon={Percent} />
            <Stat label="Receivable"           value={dash?.receivable}           accent="emerald" icon={ArrowDownToLine} />
            <Stat label="Received"             value={dash?.received}             accent="teal"    icon={CheckCircle2} />
            <Stat label="Balance"              value={dash?.balance}              accent="rose"    icon={Scale} />
          </div>
        </div>

        {/* Customer Payout (left) + Kaizen (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Customer Payout — 3 stacked */}
          <div>
            <h3 className="ke-section-title text-[15px]">Customer Payout</h3>
            <div className="ke-rule-gold mt-2 mb-3" />
            <div className="space-y-4">
              <Stat label="Total Customer Payout"   value={dash?.total_customer_payout}   accent="indigo" icon={Banknote} />
              <Stat label="Settled Customer Payout" value={dash?.settled_customer_payout} accent="violet" icon={CheckCircle2} />
              <Stat label="Pending Customer Payout" value={dash?.pending_customer_payout} accent="orange" icon={Clock} />
            </div>
          </div>

          {/* Kaizen — 3 horizontal */}
          <div>
            <h3 className="ke-section-title text-[15px]">Kaizen</h3>
            <div className="ke-rule-gold mt-2 mb-3" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat label="Paid"    value={dash?.paid}           accent="emerald" icon={HandCoins} />
              <Stat label="Balance" value={dash?.kaizen_balance} accent="amber"   icon={Scale} />
              {/* Profit cell — gated by Show Profit password */}
              <div className="ke-card relative p-5 overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), transparent)' }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Profit</div>
                    {profitVisible ? (
                      <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{fmtINR(profitValue)}</div>
                    ) : (
                      <button type="button"
                        onClick={openProfit}
                        className="mt-2.5 text-sm font-semibold text-primary underline-offset-2 hover:underline font-jakarta">
                        Show Profit
                      </button>
                    )}
                  </div>
                  <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                    <TrendingUp className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="ke-card overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm table-fixed border-collapse
                         [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td]:border-b [&_td]:border-border
                         [&_tbody_tr:last-child_td]:border-b-0
                         [&_tbody_tr]:transition-colors hover:[&_tbody_tr]:bg-muted/50">
              <colgroup>
                <col style={{ width: '6%'  }} />   {/* Sr. No. */}
                <col style={{ width: '22%' }} />   {/* Title */}
                <col style={{ width: '11%' }} />   {/* Amount */}
                <col style={{ width: '14%' }} />   {/* Transaction Date */}
                <col style={{ width: '24%' }} />   {/* Bank Details */}
                <col style={{ width: '15%' }} />   {/* Remark */}
                <col style={{ width: '4%'  }} />   {/* Edit */}
                <col style={{ width: '4%'  }} />   {/* Delete */}
              </colgroup>
              <thead className="bg-muted text-left [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:font-jakarta [&_th]:font-semibold [&_th]:text-muted-foreground">
                <tr>
                  <th>Sr. No.</th>
                  <th>Title</th>
                  <th className="!text-right">Amount</th>
                  <th>Transaction Date</th>
                  <th>Bank Details</th>
                  <th>Remark</th>
                  <th className="!text-center">Edit</th>
                  <th className="!text-center">Delete</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="!text-center !py-6 text-muted-foreground">
                    <Loader2 className="inline w-4 h-4 animate-spin mr-2" /> Loading…
                  </td></tr>
                )}
                {!loading && grid.results.length === 0 && (
                  <tr><td colSpan={8} className="!text-center !py-6 text-muted-foreground">No payment records found.</td></tr>
                )}
                {!loading && grid.results.map((row, i) => (
                  <tr key={row.id}>
                    <td className="text-muted-foreground tabular-nums">{startIdx + i}</td>
                    <td className="truncate font-medium text-foreground" title={row.title || ''}>{row.title || '—'}</td>
                    <td className="text-right tabular-nums font-semibold text-foreground">{fmtINR(row.amount)}</td>
                    <td className="tabular-nums text-foreground" title={row.created_date || ''}>{fmtDateTime(row.created_date)}</td>
                    <td className="truncate text-foreground" title={row.bank_details || ''}>{row.bank_details || '—'}</td>
                    <td className="truncate text-muted-foreground" title={row.remark || ''}>{row.remark || '—'}</td>
                    <td className="text-center">
                      <button type="button"
                        onClick={() => navigate(`/instamojo/payment/${row.id}/edit`)}
                        title="Edit"
                        className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Pencil className="w-4 h-4 inline" />
                      </button>
                    </td>
                    <td className="text-center">
                      <button type="button"
                        onClick={() => startDelete(row)}
                        disabled={otpRequesting}
                        title="Delete"
                        className="p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between flex-wrap gap-2 p-3 border-t border-border bg-muted text-sm">
            <div className="text-muted-foreground">
              Showing <span className="font-medium tabular-nums text-foreground">{startIdx}</span>–<span className="font-medium tabular-nums text-foreground">{endIdx}</span> of{' '}
              <span className="font-medium tabular-nums text-foreground">{(grid.total || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</Button>
              <span className="px-2">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Show Profit password modal */}
      <Dialog open={profitDialogOpen} onOpenChange={(o) => !o && setProfitDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter Password</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input type="password" value={profitPwd}
              onChange={(e) => setProfitPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && validateProfit()}
              placeholder="Profit password" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfitDialogOpen(false)} disabled={profitVerifying}>Cancel</Button>
            <Button onClick={validateProfit} disabled={profitVerifying}>
              {profitVerifying ? 'Validating…' : 'Validate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OTP delete modal */}
      <Dialog open={otpDialogOpen} onOpenChange={(o) => { if (!o) cancelOtp(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter OTP to Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Input value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && verifyAndDelete()}
              placeholder="6-digit OTP" inputMode="numeric" maxLength={6} autoFocus />
            <div className="text-xs text-muted-foreground">
              {otpRecipient
                ? <>OTP emailed to <span className="font-medium">{otpRecipient}</span>. Valid for 10 minutes.</>
                : <>An OTP has been generated. Valid for 10 minutes.</>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelOtp} disabled={otpVerifying}>Cancel</Button>
            <Button onClick={verifyAndDelete} disabled={otpVerifying}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {otpVerifying ? 'Deleting…' : 'Verify & Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
