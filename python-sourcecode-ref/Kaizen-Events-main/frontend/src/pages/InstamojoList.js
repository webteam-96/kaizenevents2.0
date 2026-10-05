import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  ArrowLeft, RefreshCw, Search, Filter, FileBarChart, ListTree, IndianRupee,
  EyeOff, Loader2, Wallet, CalendarClock, Percent, Landmark, Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { getInstamojoSession, clearInstamojoSession } from './InstamojoPasswordGate';

// Quick range dropdown — exact values + order from Rotary's ddl_month_number
const QUICK_RANGES = [
  { value: '1D', text: '1 Day',     days: 1   },
  { value: '10', text: '10 Days',   days: 10  },
  { value: '15', text: '15 Days',   days: 15  },  // default per Rotary
  { value: '20', text: '20 Days',   days: 20  },
  { value: '25', text: '25 Days',   days: 25  },
  { value: '1M', text: '1 Month',   days: 30  },
  { value: '2',  text: '2 Months',  days: 60  },
  { value: '3',  text: '3 Months',  days: 90  },
  { value: '4',  text: '4 Months',  days: 120 },
  { value: '5',  text: '5 Months',  days: 150 },
  { value: '6',  text: '6 Months',  days: 180 },
];

const PAGE_SIZES = [25, 50, 100, 200];

const fmt0 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmt2 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const raw = String(d);
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
  const dt = new Date(hasTz ? raw : raw + 'Z');
  if (isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
};

// Transaction-date cells show full date+time in IST, 24-hour, e.g. "02/05/2026 16:20:46".
// Uses Intl with Asia/Kolkata so the wall-clock value is identical no matter
// where the viewer's browser is set (matches the IST treatment in Activity Logs).
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
const fmtDateTime = (d) => {
  if (!d) return '—';
  const raw = String(d);
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
  const dt = new Date(hasTz ? raw : raw + 'Z');
  if (isNaN(dt.getTime())) return raw;
  // DateTimeFormat returns "02/05/2026, 16:20:46" — strip the comma.
  return DT_FMT.format(dt).replace(', ', ' ');
};

export default function InstamojoList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Filters
  const [from, setFrom]               = useState('');
  const [to, setTo]                   = useState('');
  const [titleId, setTitleId]         = useState('');
  const [titleQuery, setTitleQuery]   = useState('');
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [titleOpen, setTitleOpen]     = useState(false);
  const [payoutFlag, setPayoutFlag]   = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [search, setSearch]           = useState('');
  const [quickRange, setQuickRange]   = useState('15');   // default = "15 Days" per Rotary

  // Payment Type options pulled from DB (Payout Flag is fixed True/False — hard-coded in JSX)
  const [paymentTypeOptions, setPaymentTypeOptions] = useState([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);

  // Data
  const [summary, setSummary] = useState(null);
  const [list, setList]       = useState({ total: 0, total_pages: 0, results: [] });

  // Show Profit modal
  const [showProfitDialog, setShowProfitDialog] = useState(false);
  const [profitPwd, setProfitPwd]               = useState('');
  const [profitData, setProfitData]             = useState(null);
  const [profitLoading, setProfitLoading]       = useState(false);

  // Session check — redirect to gate if no token
  useEffect(() => {
    if (!getInstamojoSession()) {
      navigate('/instamojo', { replace: true });
    }
  }, [navigate]);

  // Load Payment Type values from DB (DISTINCT payment_instrument)
  useEffect(() => {
    api.get('/instamojo-archive/dropdowns')
      .then((res) => {
        setPaymentTypeOptions(res.data?.payment_types || []);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Apply default quick range "15 Days" on mount
  useEffect(() => {
    applyQuickRange('15');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (from)        params.from         = from;
      if (to)          params.to           = to;
      if (titleId)     params.title_id     = titleId;
      if (payoutFlag !== '') params.payout_flag = payoutFlag;
      if (paymentType) params.payment_type = paymentType;
      if (search)      params.search       = search;
      params.page = page;
      params.size = size;

      const [sumRes, listRes] = await Promise.all([
        api.get('/instamojo-archive/summary', { params: { from, to, title_id: titleId || undefined } }),
        api.get('/instamojo-archive/list',    { params }),
      ]);
      setSummary(sumRes.data);
      setList(listRes.data);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired. Please re-enter the password.');
        navigate('/instamojo', { replace: true });
        return;
      }
      toast.error(err.response?.data?.detail || 'Failed to load archive.');
    } finally {
      setLoading(false);
    }
  }, [from, to, titleId, payoutFlag, paymentType, search, page, size, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Title autocomplete (debounced)
  const titleTimer = useRef(null);
  const handleTitleQuery = (val) => {
    setTitleQuery(val);
    if (titleId) setTitleId('');                       // clear lock if user types again
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      if (val.trim().length < 1) { setTitleSuggestions([]); return; }
      try {
        const res = await api.get('/instamojo-archive/purposes/autocomplete', { params: { q: val.trim() } });
        setTitleSuggestions(res.data || []);
        setTitleOpen(true);
      } catch { /* ignore */ }
    }, 250);
  };

  const pickTitle = (t) => {
    setTitleQuery(t.title);
    setTitleId(t.id);
    setTitleOpen(false);
    setPage(1);
  };
  const clearTitle = () => {
    setTitleQuery(''); setTitleId(''); setTitleSuggestions([]); setPage(1);
  };

  const applyQuickRange = (value) => {
    setQuickRange(value);
    const r = QUICK_RANGES.find((x) => x.value === value);
    if (!r) return;
    const today = new Date();
    const past = new Date(today.getTime() - r.days * 24 * 60 * 60 * 1000);
    setFrom(past.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
    setPage(1);
  };

  const handleFilterApply = () => { setPage(1); fetchData(); };

  // Month wise Refresh — re-pulls Instamojo data for the selected period (1D … 6 months).
  // Backend currently returns 501 (sync not yet implemented); button is wired so the UX
  // matches Rotary the moment the API is ready.
  const [monthRefreshing, setMonthRefreshing] = useState(false);
  const handleMonthWiseRefresh = async () => {
    if (!window.confirm(`Refresh Instamojo data for the selected range (${
      QUICK_RANGES.find(r => r.value === quickRange)?.text || quickRange
    })? This pulls fresh transactions from Instamojo and may take a minute or two.`)) return;
    setMonthRefreshing(true);
    try {
      const res = await api.post(
        '/instamojo-archive/refresh-period',
        { range: quickRange },
        { timeout: 6 * 60 * 1000 },   // 6 minutes — backend caps itself at 5
      );
      const d = res.data || {};
      const summary = `Transaction Updated. ${d.inserted ?? 0} new, ${d.updated ?? 0} refreshed`
                    + (d.new_titles ? `, ${d.new_titles} new purpose${d.new_titles === 1 ? '' : 's'}` : '')
                    + '.';
      toast.success(summary);
      fetchData();
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        toast.error('Refresh timed out — sync is still running on the server. Try Refresh again in a minute.');
      } else if (err.response?.status === 501) {
        toast.warning('Month wise Refresh — backend sync pending.');
      } else {
        toast.error(err.response?.data?.detail || 'Refresh failed.');
      }
    } finally {
      setMonthRefreshing(false);
    }
  };

  const refreshRow = async (paymentId) => {
    try {
      await api.post(`/instamojo-archive/${paymentId}/refresh`);
      toast.success('Row refreshed from Instamojo.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Refresh failed.');
    }
  };

  const handleShowProfit = async () => {
    if (!profitPwd.trim()) { toast.error('Enter the profit password.'); return; }
    setProfitLoading(true);
    try {
      const res = await api.post('/instamojo-archive/show-profit', {
        password: profitPwd,
        from: from || null, to: to || null, titleId: titleId || null,
      });
      setProfitData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect password.');
    } finally {
      setProfitLoading(false);
    }
  };
  const closeProfitDialog = () => {
    setShowProfitDialog(false); setProfitPwd(''); setProfitData(null);
  };

  const totalPages = list.total_pages || 1;
  const startIdx = list.total === 0 ? 0 : (page - 1) * size + 1;
  const endIdx   = Math.min(page * size, list.total);

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="w-full space-y-4">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/control-panel')}
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta text-white/70 hover:text-white transition-colors mb-3 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
              <ArrowLeft className="w-4 h-4" /> Back to Control Panel
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance Archive</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Instamojo For Accounts</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Transactions, settlements and payout reconciliation.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => navigate('/instamojo/purposes')}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta">
                  <ListTree className="w-4 h-4 mr-2" /> Purpose List
                </Button>
                <Button onClick={() => navigate('/instamojo/payments')}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta">
                  <Wallet className="w-4 h-4 mr-2" /> Add
                </Button>
                <Button onClick={() => navigate('/instamojo/reports')}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta">
                  <FileBarChart className="w-4 h-4 mr-2" /> Reports
                </Button>
                <Button onClick={fetchData} disabled={loading}
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Top counters — Rotary labels: Total Transaction, Total Events, Updated On + Month wise Refresh */}
        <div className="ke-card p-4">
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">Total Transaction:</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {Number(summary?.total_transaction ?? summary?.total_count ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">Total Events:</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {Number(summary?.total_events ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">Updated On:</span>
              <span className="text-sm text-muted-foreground">{fmtDate(summary?.updated_on)}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select value={quickRange} onChange={(e) => applyQuickRange(e.target.value)}
                className="h-9 rounded-md border border-border bg-card text-foreground px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {QUICK_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.text}</option>
                ))}
              </select>
              <Button variant="outline" onClick={handleMonthWiseRefresh} disabled={monthRefreshing}>
                <CalendarClock className={`w-4 h-4 mr-2 ${monthRefreshing ? 'animate-spin' : ''}`} />
                Month wise Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total Collection"     value={fmt0(summary?.total_collection)}     loading={loading} icon={IndianRupee} accent="hsl(var(--primary))"     iconBg="hsl(var(--primary) / 0.14)" />
          <SummaryCard label="Instamojo Commission" value={fmt0(summary?.instamojo_commission)} loading={loading} icon={Percent}     accent="hsl(var(--destructive))" iconBg="hsl(var(--destructive) / 0.14)" />
          <SummaryCard label="Receivable"           value={fmt0(summary?.receivable)}           loading={loading} icon={Landmark}    accent="hsl(var(--accent))"      iconBg="hsl(var(--accent) / 0.16)" />
          <SummaryCard label="Received"             value={fmt0(summary?.received)}             loading={loading} icon={Wallet}      accent="hsl(var(--chart-4))"     iconBg="hsl(var(--chart-4) / 0.16)" />
          <SummaryCard label="Balance"              value={fmt0(summary?.balance)}              loading={loading} icon={Scale}       accent="hsl(152 58% 40%)"        iconBg="hsl(152 58% 40% / 0.16)" highlight />
        </div>

        {/* Single "kaizen-container" box — Rotary layout: Customer Payout trio on
            the left (no heading), Kaizen panel with "Kaizen" subheading on the right. */}
        <div className="ke-card p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Customer Payout trio */}
            <div>
              <h3 className="ke-section-title text-[15px]">Customer Payout</h3>
              <div className="ke-rule-gold mt-2 mb-3" />
              <div className="space-y-3">
                <Stat label="Total Customer Payout"   value={summary?.total_customer_payout}   accent="primary" />
                <Stat label="Settled Customer Payout" value={summary?.settled_customer_payout} accent="emerald" />
                <Stat label="Pending Customer Payout" value={summary?.pending_customer_payout} accent="amber" />
              </div>
            </div>

            {/* Right: Kaizen heading + Paid / Balance / Show Profit */}
            <div>
              <h3 className="ke-section-title text-[15px]">Kaizen</h3>
              <div className="ke-rule-gold mt-2 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Stat label="Paid"    value={summary?.paid}           accent="emerald" />
                <Stat label="Balance" value={summary?.kaizen_balance} accent="amber" />
                <div className="ke-card p-3 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profit</div>
                  {profitData?.profit != null ? (
                    <div className="mt-1 text-xl font-bold text-primary tabular-nums">{fmt2(profitData.profit)}</div>
                  ) : (
                    <button type="button"
                      onClick={() => setShowProfitDialog(true)}
                      className="mt-1 text-sm font-semibold text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                      Show Profit
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="ke-card p-5">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <h3 className="ke-section-title text-[15px]">Filters</h3>
          </div>
          <div className="ke-rule-gold mt-1 mb-3" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="relative">
              <Label>Purpose / Title</Label>
              <div className="relative">
                <Input value={titleQuery}
                  onChange={(e) => handleTitleQuery(e.target.value)}
                  onFocus={() => titleSuggestions.length > 0 && setTitleOpen(true)}
                  placeholder="Type to search…" />
                {titleId && (
                  <button type="button" onClick={clearTitle}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">✕</button>
                )}
              </div>
              {titleOpen && titleSuggestions.length > 0 && (
                <div className="absolute z-20 w-full bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                  {titleSuggestions.map((t) => (
                    <button key={t.id}
                      type="button"
                      onClick={() => pickTitle(t)}
                      className="block w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                      {t.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Payout Flag</Label>
              <select value={payoutFlag} onChange={(e) => setPayoutFlag(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-card text-foreground px-3 focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">-Select Payout-</option>
                <option value="1">True</option>
                <option value="0">False</option>
              </select>
            </div>
            <div>
              <Label>Payment Type</Label>
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-card text-foreground px-3 focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">-Select Payment Type-</option>
                {paymentTypeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-2">
              <Label>Search (Buyer name / email / phone / Payment ID)</Label>
              <div className="flex gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFilterApply()}
                  placeholder="Search…" />
                <Button onClick={handleFilterApply}><Search className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={handleFilterApply}>
                <Filter className="w-4 h-4 mr-2" /> Apply
              </Button>
            </div>
          </div>
        </div>

        {/* Table — Rotary parity: bordered + striped + hover, exact column order */}
        <div className="ke-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm table-fixed border-collapse
                         [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-foreground
                         [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-2 [&_td]:align-middle [&_td]:text-foreground
                         [&_tbody_tr:nth-child(even)]:bg-muted/50 [&_tbody_tr:hover]:bg-primary-subtle/60 [&_tbody_tr]:transition-colors">
              <colgroup>
                <col style={{ width: '4%'  }} />   {/* Sr. No. */}
                <col style={{ width: '11%' }} />   {/* Payment Id */}
                <col style={{ width: '9%'  }} />   {/* Transaction Date */}
                <col style={{ width: '13%' }} />   {/* Title */}
                <col style={{ width: '11%' }} />   {/* Name */}
                <col style={{ width: '8%'  }} />   {/* Mobile Number */}
                <col style={{ width: '13%' }} />   {/* Email Id */}
                <col style={{ width: '8%'  }} />   {/* Collected Amount */}
                <col style={{ width: '7%'  }} />   {/* Payout Flag */}
                <col style={{ width: '7%'  }} />   {/* Payment Type */}
                <col style={{ width: '5%'  }} />   {/* Refresh */}
                <col style={{ width: '4%'  }} />   {/* Refund */}
              </colgroup>
              {/*
                Header text wraps naturally (no whitespace-nowrap) so multi-word labels like
                "Collected Amount" / "Mobile Number" / "Transaction Date" can break to a second
                line at high zoom levels rather than overflowing into the next column.
              */}
              <thead className="bg-muted text-left align-bottom">
                <tr>
                  <th>Sr. No.</th>
                  <th>Payment Id</th>
                  <th>Transaction Date</th>
                  <th>Title</th>
                  <th>Name</th>
                  <th>Mobile Number</th>
                  <th>Email Id</th>
                  <th className="!text-right">Collected Amount</th>
                  <th className="!text-center">Payout Flag</th>
                  <th>Payment Type</th>
                  <th className="!text-center">Refresh</th>
                  <th className="!text-center">Refund</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={12} className="!text-center !py-6 text-muted-foreground">
                    <Loader2 className="inline w-4 h-4 animate-spin mr-2" /> Loading…
                  </td></tr>
                )}
                {!loading && list.results.length === 0 && (
                  <tr><td colSpan={12} className="!text-center !py-10 text-muted-foreground">
                    <EyeOff className="mx-auto mb-2 w-6 h-6 opacity-50" />
                    No transactions match these filters.
                  </td></tr>
                )}
                {!loading && list.results.map((row, i) => (
                  <tr key={row.id}>
                    <td className="!text-muted-foreground text-center tabular-nums">{startIdx + i}</td>
                    <td className="truncate" title={row.payment_id || ''}>{row.payment_id || '—'}</td>
                    <td className="truncate" title={row.transaction_date || ''}>{fmtDateTime(row.transaction_date)}</td>
                    <td className="truncate" title={row.title || ''}>{row.title || '—'}</td>
                    <td className="truncate" title={row.buyer_name || ''}>{row.buyer_name || '—'}</td>
                    <td className="truncate" title={row.buyer_phone || ''}>{row.buyer_phone || '—'}</td>
                    <td className="truncate text-xs" title={row.buyer_email || ''}>{row.buyer_email || '—'}</td>
                    <td className="text-right tabular-nums">{fmt2(row.sale_amount)}</td>
                    <td className="text-center">
                      <span className={`font-medium ${
                        row.payout_flag === 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-500'
                      }`}>
                        {row.payout_flag === 1 ? 'True' : 'False'}
                      </span>
                    </td>
                    <td className="truncate text-xs" title={row.payment_instrument || row.payment_type || ''}>{row.payment_instrument || row.payment_type || '—'}</td>
                    <td className="text-center">
                      <button type="button"
                        onClick={() => refreshRow(row.payment_id)}
                        title="Refresh from Instamojo"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <RefreshCw className="w-4 h-4 inline" />
                      </button>
                    </td>
                    {/*
                      Refund column: read-only checkbox indicator (matches Rotary's
                      Enabled="false" behavior). Cannot be toggled from the listing.
                      To change state, use the per-purpose detail page.
                    */}
                    <td className="text-center">
                      <input type="checkbox"
                        checked={row.payout_flag === 1}
                        disabled
                        readOnly
                        title={row.payout_flag === 1 ? 'Settled' : 'Pending'}
                        className="w-4 h-4 cursor-not-allowed" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between flex-wrap gap-2 p-3 border-t border-border bg-muted text-sm">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground tabular-nums">{startIdx}</span>–<span className="font-medium text-foreground tabular-nums">{endIdx}</span> of{' '}
              <span className="font-medium text-foreground tabular-nums">{list.total.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Per page:</span>
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-md border border-border bg-card text-foreground px-2 focus:outline-none focus:ring-2 focus:ring-ring">
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</Button>
              <span className="px-2">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Show Profit Dialog */}
      <Dialog open={showProfitDialog} onOpenChange={(o) => !o && closeProfitDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4" /> Show Profit
            </DialogTitle>
            <DialogDescription>
              {profitData ? 'Profit breakdown for the current filters:' : 'Enter the profit password to view.'}
            </DialogDescription>
          </DialogHeader>

          {!profitData ? (
            <div className="space-y-3">
              <Input type="password" autoFocus value={profitPwd}
                onChange={(e) => setProfitPwd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleShowProfit()}
                placeholder="Profit password" />
              <Button onClick={handleShowProfit} disabled={profitLoading} className="w-full">
                {profitLoading ? 'Validating…' : 'Show Profit'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <ProfitRow label="Total Collection"     val={profitData.total_collection} />
              <ProfitRow label="Commission (2.95%)"   val={profitData.commission} />
              <ProfitRow label="Receivable"           val={profitData.receivable} />
              <ProfitRow label="Paid to Customer"     val={profitData.paid_to_customer} />
              <ProfitRow label="Gateway Fees"         val={profitData.gateway_fees} />
              <ProfitRow label="Tax"                  val={profitData.tax} />
              <div className="border-t border-border pt-2 flex justify-between font-bold text-emerald-700 dark:text-emerald-400">
                <span>Profit</span>
                <span className="tabular-nums">{fmt2(profitData.profit)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeProfitDialog}>
              <EyeOff className="w-4 h-4 mr-2" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SummaryCard = ({ label, value, loading, highlight, icon: Icon, accent = 'hsl(var(--primary))', iconBg = 'hsl(var(--primary) / 0.14)' }) => (
  <div className="ke-card ke-card-hover relative p-5 overflow-hidden">
    <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">{label}</div>
        <div className={`text-[28px] leading-none font-outfit font-bold mt-2.5 tabular-nums truncate ${highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'}`}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : value}
        </div>
      </div>
      {Icon && (
        <span className="ke-medallion shrink-0" style={{ background: `linear-gradient(150deg, ${iconBg}, transparent 85%)` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </span>
      )}
    </div>
  </div>
);

// Customer Payout / Kaizen panel mini-card. Same shape as InstamojoPayments.js
// so the dashboard layout matches Rotary across both pages. Accent names map to
// static token classes (below) so dark mode resolves and no runtime-built
// Tailwind class is needed.
const STAT_ACCENTS = {
  primary: { border: 'border-primary-subtle', text: 'text-primary' },
  emerald: { border: 'border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-400' },
  amber:   { border: 'border-amber-500/30',   text: 'text-amber-700 dark:text-amber-500' },
  slate:   { border: 'border-border',         text: 'text-foreground' },
};
const Stat = ({ label, value, accent = 'slate' }) => {
  const a = STAT_ACCENTS[accent] || STAT_ACCENTS.slate;
  return (
    <div className={`ke-card p-3 text-center ${a.border}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${a.text}`}>
        ₹{Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
};

const ProfitRow = ({ label, val }) => (
  <div className="flex justify-between text-foreground">
    <span>{label}</span>
    <span className="font-mono tabular-nums">{fmt2(val)}</span>
  </div>
);
