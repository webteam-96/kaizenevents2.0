import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { ArrowLeft, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getInstamojoSession, clearInstamojoSession } from './InstamojoPasswordGate';

// Trigger a browser download from a Blob with a server-provided filename
// (or a fallback name if the server didn't include Content-Disposition).
function downloadBlob(blob, fallbackName, headers) {
  const cd = headers?.['content-disposition'] || '';
  const m = cd.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)/i);
  const filename = (m && decodeURIComponent(m[1])) || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

export default function InstamojoReports() {
  const navigate = useNavigate();

  const [titleId, setTitleId]     = useState(0);
  const [titleText, setTitleText] = useState('');
  const [paidPwd, setPaidPwd]     = useState('');
  const [paidWithDatePwd, setPaidWithDatePwd] = useState('');

  // Autocomplete
  const [acOpen, setAcOpen]   = useState(false);
  const [acItems, setAcItems] = useState([]);
  const acTimer = useRef(null);

  // Per-tile loading flags
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    if (!getInstamojoSession()) navigate('/instamojo', { replace: true });
  }, [navigate]);

  // ── Purpose autocomplete ─────────────────────────────────────────────────
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
  };
  const clearTitle = () => {
    setTitleText('');
    setTitleId(0);
    setAcOpen(false);
  };

  // ── Downloads ────────────────────────────────────────────────────────────
  const baseParams = () => titleId ? { title_id: titleId } : {};

  const doGet = async (key, path, fallbackName) => {
    setDownloading(key);
    try {
      const res = await api.get(`/instamojo-archive/${path}`, {
        params: baseParams(),
        responseType: 'blob',
      });
      downloadBlob(res.data, fallbackName, res.headers);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      // Blob responses for errors: parse the JSON body if we can.
      let detail = 'Download failed.';
      try {
        const txt = await err.response?.data?.text?.();
        if (txt) detail = JSON.parse(txt)?.detail || detail;
      } catch {/* ignore */}
      toast.error(detail);
    } finally {
      setDownloading('');
    }
  };

  const doPaidToCustomer = async () => {
    if (!paidPwd.trim()) { toast.error('Enter password.'); return; }
    setDownloading('paid');
    try {
      const res = await api.post(
        '/instamojo-archive/reports/paid-to-customer',
        { password: paidPwd },
        { params: baseParams(), responseType: 'blob' },
      );
      downloadBlob(res.data, 'Instamojo_Paid_to_customer_Report.xlsx', res.headers);
      setPaidPwd('');
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      let detail = 'Wrong password!!';
      try {
        const txt = await err.response?.data?.text?.();
        if (txt) detail = JSON.parse(txt)?.detail || detail;
      } catch {/* ignore */}
      toast.error(detail);
    } finally {
      setDownloading('');
    }
  };

  // "Paid to customer Report with transaction date" — same password as the
  // standard Paid report (matches Rotary: both use AppSettings.Paid_to_customer_Report_pass).
  const doPaidWithDate = async () => {
    if (!paidWithDatePwd.trim()) { toast.error('Enter password.'); return; }
    setDownloading('paid-with-date');
    try {
      const res = await api.post(
        '/instamojo-archive/reports/paid-with-date',
        { password: paidWithDatePwd },
        { params: baseParams(), responseType: 'blob' },
      );
      downloadBlob(res.data, 'Instamojo_Paid_to_customer_Report_with_transaction_date.xlsx', res.headers);
      setPaidWithDatePwd('');
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      let detail = 'Wrong password!!';
      try {
        const txt = await err.response?.data?.text?.();
        if (txt) detail = JSON.parse(txt)?.detail || detail;
      } catch {/* ignore */}
      toast.error(detail);
    } finally {
      setDownloading('');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const Tile = ({ id, label, onClick, disabled = false, children }) => (
    <div className="ke-card ke-card-hover p-5 flex flex-col items-center text-center gap-3">
      <div className="text-sm font-semibold text-foreground font-jakarta">{label}</div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || !!downloading}
        title={disabled ? `${label} — not implemented yet` : `Download ${label}`}
        className="ke-medallion disabled:opacity-50 disabled:cursor-not-allowed transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
        {downloading === id
          ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'hsl(var(--accent))' }} />
          : <FileSpreadsheet className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />}
      </button>
      {children}
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
              onClick={() => navigate('/instamojo/list')}
              className="inline-flex items-center gap-1.5 text-[12px] font-jakarta font-medium text-white/70 hover:text-white transition-colors mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Instamojo
            </button>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance · Instamojo</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Instamojo Reports</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5">Export collection, payout and reconciliation spreadsheets.</p>
            </div>
          </div>
        </div>

        {/* Purpose filter */}
        <div className="ke-card p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2 relative">
              <Label>Purpose</Label>
              <div className="flex gap-2">
                <Input value={titleText}
                  onChange={onTitleChange}
                  onFocus={() => acItems.length && setAcOpen(true)}
                  onBlur={() => setTimeout(() => setAcOpen(false), 150)}
                  placeholder="Enter Purpose (min 3 chars; leave blank for all)" />
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
            <div className="text-sm text-muted-foreground self-end pb-2">
              {titleId
                ? <>Filtering by <span className="font-medium">{titleText}</span></>
                : <>No Purpose selected — exports run for <span className="font-medium">all</span> purposes.</>}
            </div>
          </div>
        </div>

        {/* Two cards: Instamojo Reports + Payout Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="ke-card p-5">
            <h3 className="ke-section-title text-[15px]">Instamojo Reports</h3>
            <div className="ke-rule-gold mt-2 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Tile
                id="customer"
                label="Instamojo Report Customer"
                onClick={() => doGet('customer', 'reports/instamojo-customer', 'InstamojoReport.xlsx')} />
              <Tile
                id="summary"
                label="Customer Payment Report"
                onClick={() => doGet('summary', 'reports/customer-payment', 'Instamojo_paymentSummary_details.xlsx')} />
            </div>
          </div>

          <div className="ke-card p-5">
            <h3 className="ke-section-title text-[15px]">Payout Reports</h3>
            <div className="ke-rule-gold mt-2 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Tile
                id="pending"
                label="Pending Customer Payout"
                onClick={() => doGet('pending', 'reports/pending-payout', 'Pendingpayout.xlsx')} />
              <Tile
                id="paid"
                label="Paid to customer Report"
                onClick={doPaidToCustomer}>
                <Input
                  type="password"
                  value={paidPwd}
                  onChange={(e) => setPaidPwd(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doPaidToCustomer()}
                  placeholder="Password"
                  className="w-full" />
              </Tile>
              <Tile
                id="paid-with-date"
                label="Paid to customer Report with transaction date"
                onClick={doPaidWithDate}>
                <Input
                  type="password"
                  value={paidWithDatePwd}
                  onChange={(e) => setPaidWithDatePwd(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doPaidWithDate()}
                  placeholder="Password"
                  className="w-full" />
              </Tile>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
