import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import {
  Users, DollarSign, TrendingUp, Plus, Download, RefreshCw,
  Landmark, Clock, CheckCircle2, Hourglass, Target,
  AlertTriangle, Inbox, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem } from '../components/ui/carousel';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import * as XLSX from 'xlsx';
import { richTextToPlain } from '../components/ui/RichTextInput';
import KpiTile from '../components/dashboard/KpiTile';
import TrendChart from '../components/dashboard/TrendChart';
import StatusDonut from '../components/dashboard/StatusDonut';
import TopEventsTable from '../components/dashboard/TopEventsTable';
import RecentRegistrations from '../components/dashboard/RecentRegistrations';
import MiniSplitCard from '../components/dashboard/MiniSplitCard';
import {
  filterRegistrations, computeKpis, computeStatusCounts, computeTrend,
  computeTopEvents, computeGatewaySplit, computeCollectionSplit, computeEventStatusCounts,
} from '../utils/dashboardStats';
import { parseServerDate, serverDateMs } from '../utils/serverTime';

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const RANGES = [{ k: '7d', t: '7D' }, { k: '30d', t: '30D' }, { k: '90d', t: '90D' }, { k: 'all', t: 'All' }];
// The Registrations & Revenue card is a draggable carousel of two separate 3D graphs.
const TREND_SLIDES = [
  { key: 'registrations', title: 'Registrations', mode: 'bars' },
  { key: 'revenue', title: 'Revenue', mode: 'line' },
];

// Brand + semantic KPI/chart colors expressed as design-token HSL bodies so every
// swatch resolves through the same tokens and re-skins in both light and dark mode.
// Brand: navy=chart-1, gold=chart-2, red=chart-3, steel-blue=chart-4.
// Status hues (success/warning) are kept semantic but chosen to read on both fields.
const HUE = {
  navy: 'var(--chart-1)',
  gold: 'var(--chart-2)',
  red: 'var(--chart-3)',
  steel: 'var(--chart-4)',
  success: '152 58% 40%',
  warning: '38 92% 48%',
  muted: 'var(--muted-foreground)',
};
const solid = (v) => `hsl(${v})`;
const soft = (v) => `hsl(${v} / 0.14)`;

// Date guards: a null/unparseable created_at must never crash the render or abort the export.
// parseServerDate treats the backend's naive UTC strings as UTC → local (IST) display.
const fmtExportDate = (v) => {
  const d = parseServerDate(v);
  return d ? format(d, 'yyyy-MM-dd HH:mm:ss') : '';
};
const relTime = (v) => {
  const d = parseServerDate(v);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : '';
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState('all');       // '7d' | '30d' | '90d' | 'all'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'completed' | 'pending' | 'failed'

  // Trend carousel (Registrations ↔ Revenue)
  const [chartApi, setChartApi] = useState(null);
  const [chartSlide, setChartSlide] = useState(0);
  useEffect(() => {
    if (!chartApi) return;
    const onSel = () => setChartSlide(chartApi.selectedScrollSnap());
    onSel();
    chartApi.on('select', onSel);
    chartApi.on('reInit', onSel);
    return () => { chartApi.off('select', onSel); };
  }, [chartApi]);

  // Autoplay: advance every 5s on its own; pause on hover (chartPaused) and resume at rest.
  // Skips advancing while the tab is hidden (so it doesn't jump slides on refocus) and
  // honors the user's reduced-motion preference (consistent with the rest of the app).
  const [chartPaused, setChartPaused] = useState(false);
  useEffect(() => {
    if (!chartApi || chartPaused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (!document.hidden) chartApi.scrollNext();
    }, 5000);
    return () => clearInterval(id);
  }, [chartApi, chartPaused]);

  // The form_data → display-name helper that used to live here is gone: the summary endpoint
  // resolves the name server-side, so the blob it needed never reaches the browser.

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // One request for every registration the user can see, carrying only the fields charted below.
  //
  // This used to be a loop that awaited GET /campaigns/{id}/registrations once per campaign and
  // pulled the full record, form_data included. At 50 campaigns that is 50 sequential round-trips
  // — measured at ~22s from a browser in India, nearly all of it latency — to compute sums over
  // four columns. The server now does that projection, so the cost no longer scales with the
  // number of events.
  const fetchDashboardData = async () => {
    try {
      setError(false);
      const [campaignsRes, summaryRes] = await Promise.all([
        api.get('/campaigns'),
        api.get('/dashboard/registrations-summary'),
      ]);
      setCampaigns(campaignsRes.data);

      // The splits and the top-events table key off campaign metadata, so stitch the name on
      // here rather than repeating it on every one of the thousands of summary rows.
      const nameById = Object.fromEntries(campaignsRes.data.map(c => [c.id, c.name]));
      setRegistrations(summaryRes.data.map(r => ({
        ...r,
        campaignId: r.campaign_id,
        campaignName: nameById[r.campaign_id] || '',
      })));
    } catch (error) {
      // A failed fetch must NOT masquerade as a real zeroed account: flag a distinct
      // page-level error state (rendered with a Retry) instead of falling through to KPIs of 0.
      setError(true);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    fetchDashboardData();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      // The dashboard now holds only summary rows, but a spreadsheet needs every form answer.
      // Fetching the full records here — on an explicit click that already shows a spinner —
      // keeps that cost off the page load, where it was buying nothing.
      //
      // The export must match what is on screen, so apply the SAME three filters the view uses
      // (campaign + payment-status + date-range) — not the campaign filter alone.
      const selected = filterRegistrations(registrations, {
        campaignId: selectedCampaign, status: statusFilter, range: dateRange,
      });

      if (selected.length === 0) {
        toast.error('No registrations to export');
        setExporting(false);
        return;
      }

      const distinctCampaignIds = [...new Set(selected.map(r => r.campaignId))];
      // Only the rows the current filters actually selected survive the join below, so a
      // campaign-wide fetch never widens the export.
      const wantedIds = new Set(selected.map(r => r.id));

      const fullRows = (await Promise.all(distinctCampaignIds.map(async (cid) => {
        try {
          const res = await api.get(`/campaigns/${cid}/registrations`);
          const campaignName = campaigns.find(c => c.id === cid)?.name || '';
          return res.data
            .filter(r => wantedIds.has(r.id))
            .map(r => ({ ...r, campaignId: cid, campaignName }));
        } catch {
          return [];
        }
      }))).flat();

      // Oldest first → newest on the last row.
      const filteredRegistrations = fullRows
        .sort((a, b) => serverDateMs(a.created_at) - serverDateMs(b.created_at));

      if (filteredRegistrations.length === 0) {
        toast.error('No registrations to export');
        setExporting(false);
        return;
      }

      // Build a per-campaign field_id → label map by fetching form configs
      const fieldLabelMaps = {};
      const fieldTypeMaps = {};   // cid → { field_id: type }
      const fieldOptionMaps = {}; // cid → { field_id: { optionValue: optionLabel } }
      await Promise.all(distinctCampaignIds.map(async (cid) => {
        try {
          const res = await api.get(`/campaigns/${cid}/form`);
          const fields = res.data?.fields || [];
          const map = {};
          const types = {};
          const opts = {};
          fields.forEach(f => {
            if (f.id) map[f.id] = f.label || f.id;
            if (f.id) types[f.id] = f.type;
            // Name-type fields expose _first / _last sub-keys in form_data
            if (f.type === 'name' && f.id) {
              map[`${f.id}_first`] = `${f.label || 'Name'} (First)`;
              map[`${f.id}_last`]  = `${f.label || 'Name'} (Last)`;
            }
            // Choice fields (dropdown/radio/checkbox): map stored value → label
            if (f.id && Array.isArray(f.options) && f.options.length) {
              const om = {};
              f.options.forEach(o => {
                const v = o.value ?? o.label;
                if (v !== undefined && v !== null) om[String(v)] = o.label ?? String(v);
              });
              opts[f.id] = om;
            }
          });
          fieldLabelMaps[cid] = map;
          fieldTypeMaps[cid] = types;
          fieldOptionMaps[cid] = opts;
        } catch {
          fieldLabelMaps[cid] = {};
          fieldTypeMaps[cid] = {};
          fieldOptionMaps[cid] = {};
        }
      }));

      const prettifyKey = (k) =>
        k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

      const resolveLabel = (campaignId, key) => {
        const m = fieldLabelMaps[campaignId] || {};
        return m[key] || prettifyKey(key);
      };

      // Map a choice field's stored value(s) to their option label(s).
      const resolveChoice = (campaignId, key, value) => {
        const om = (fieldOptionMaps[campaignId] || {})[key];
        if (!om) return value;
        if (Array.isArray(value)) return value.map(v => om[String(v)] ?? v).join(', ');
        return om[String(value)] ?? value;
      };

      // Prepare data for Excel
      const data = filteredRegistrations.map(reg => {
        const row = {
          'Event': reg.campaignName,
          'Invoice Number': reg.invoice_number || '',
          'Registration ID': reg.id,
          'Payment Status': reg.payment_status,
          'Total Amount': reg.total_amount,
          'Payment ID': reg.payment_id || '',
          'Created At': fmtExportDate(reg.created_at),
        };

        // Add form data fields — use field labels from form_config, and map
        // choice values → option labels / rich text → plain text.
        Object.keys(reg.form_data || {}).forEach(key => {
          const label = resolveLabel(reg.campaignId, key);
          const value = reg.form_data[key];
          const type = (fieldTypeMaps[reg.campaignId] || {})[key];
          let cell;
          if (type === 'rich_text') {
            cell = richTextToPlain(value);
          } else if ((fieldOptionMaps[reg.campaignId] || {})[key]) {
            cell = resolveChoice(reg.campaignId, key, value);
          } else if (value && typeof value === 'object') {
            // Flatten object values (e.g. file upload objects, name objects)
            cell = value.url || value.name || value.full_name || JSON.stringify(value);
          } else {
            cell = value;
          }
          row[label] = cell;
        });

        return row;
      });

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registrations');

      // Add summary sheet
      const summaryKpis = computeKpis(filteredRegistrations);
      const summaryData = [
        { Metric: 'Total Registrations', Value: summaryKpis.totalRegs },
        { Metric: 'Paid Registrations', Value: summaryKpis.paid },
        { Metric: 'Pending Registrations', Value: summaryKpis.pending },
        { Metric: 'Total Revenue', Value: `₹${summaryKpis.totalRevenue.toLocaleString()}` },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Download
      const fileName = selectedCampaign === 'all'
        ? `all_registrations_${format(new Date(), 'yyyyMMdd')}.xlsx`
        : `registrations_${campaigns.find(c => c.id === selectedCampaign)?.slug || 'campaign'}_${format(new Date(), 'yyyyMMdd')}.xlsx`;

      XLSX.writeFile(wb, fileName);
      toast.success('Excel exported successfully!');
    } catch (error) {
      toast.error('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  // Derived view-model: everything on screen recomputes from the three filters.
  const vm = useMemo(() => {
    const regs = filterRegistrations(registrations, {
      campaignId: selectedCampaign, status: statusFilter, range: dateRange,
    });
    const recent = [...regs]
      .sort((a, b) => serverDateMs(b.created_at) - serverDateMs(a.created_at))
      .slice(0, 6)
      .map((r) => ({
        id: r.id,
        name: r.name || 'Guest',   // resolved server-side; form_data no longer travels
        eventName: r.campaignName || '',
        amount: r.total_amount,
        status: r.payment_status,
        timeLabel: relTime(r.created_at),
      }));
    return {
      kpis: computeKpis(regs),
      statusCounts: computeStatusCounts(regs),
      trend: computeTrend(regs, dateRange),
      topEvents: computeTopEvents(regs, campaigns).slice(0, 5),
      gateway: computeGatewaySplit(regs, campaigns),
      collection: computeCollectionSplit(regs, campaigns),
      eventStatus: computeEventStatusCounts(
        selectedCampaign === 'all' ? campaigns : campaigns.filter((c) => c.id === selectedCampaign)
      ),
      recent,
    };
  }, [registrations, campaigns, selectedCampaign, statusFilter, dateRange]);

  // ── LOADING: skeleton scaffold that mirrors the real layout ──────────────────
  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-background">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-lg" />)}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Skeleton className="w-7 h-7 rounded-lg" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-7 w-28 mt-3" />
              <Skeleton className="h-3 w-20 mt-2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4">
            <Skeleton className="h-4 w-48 mb-3" />
            <Skeleton className="h-[240px] w-full rounded-lg" />
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-[180px] w-full rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4 space-y-3">
            <Skeleton className="h-4 w-28" />
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <Skeleton className="h-4 w-40" />
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  // ── ERROR: distinct page-level state with a Retry (NOT a zeroed dashboard) ────
  if (error) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-background flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-xl border border-border p-8 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4"
            style={{ background: soft(HUE.red) }}>
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-lg font-outfit font-bold text-foreground">Couldn't load the dashboard</h2>
          <p className="text-sm text-muted-foreground font-jakarta mt-1.5">
            Something went wrong while fetching your events and registrations. Check your connection and try again.
          </p>
          <Button onClick={handleRetry}
            className="mt-5 bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta rounded-lg h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <RefreshCw className="w-4 h-4 mr-1.5" />Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── EMPTY: fetch succeeded but the account has no events at all ───────────────
  const isEmpty = campaigns.length === 0 && registrations.length === 0;
  if (isEmpty) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-background flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-xl border border-border p-8 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4"
            style={{ background: soft(HUE.navy) }}>
            <Inbox className="w-7 h-7" style={{ color: solid(HUE.navy) }} />
          </div>
          <h2 className="text-lg font-outfit font-bold text-foreground">No events yet</h2>
          <p className="text-sm text-muted-foreground font-jakarta mt-1.5">
            Create your first event to start collecting registrations. Your revenue, conversion and
            recent-activity metrics will appear here once you do.
          </p>
          <Button onClick={() => navigate('/campaigns/create')}
            className="mt-5 bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta rounded-lg h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <Plus className="w-4 h-4 mr-1.5" />Create Event
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      {/* Hero header */}
      <div className="ke-hero p-6 md:p-7 mb-5">
        <div className="ke-hero-grid" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Overview</div>
            <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Dashboard</h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">A live view of every event, registration and rupee.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleRefresh} disabled={refreshing}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button onClick={() => navigate('/campaigns/create')}
              className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
              style={{ background: 'hsl(var(--accent))', color: '#091D40' }}>
              <Plus className="w-4 h-4 mr-1.5" />Create Event
            </Button>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => setDateRange(r.k)}
              className={`text-xs px-3 py-1.5 rounded-md font-jakarta font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dateRange === r.k ? 'bg-primary text-primary-foreground shadow-sm dark:bg-white dark:text-[#091D40]' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.t}
            </button>
          ))}
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="h-9 w-[160px] rounded-lg border-border bg-card text-foreground font-jakarta text-sm focus:ring-ring">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent className="font-jakarta max-h-72">
            <SelectItem value="all">All Events</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[135px] rounded-lg border-border bg-card text-foreground font-jakarta text-sm focus:ring-ring">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="font-jakarta">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleExportExcel} disabled={exporting} variant="outline"
          className="border-border hover:bg-muted text-foreground font-jakarta rounded-lg h-9 focus-visible:ring-2 focus-visible:ring-ring ml-auto">
          <Download className="w-4 h-4 mr-1.5" />{exporting ? 'Exporting...' : 'Export'}
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiTile icon={DollarSign} label="Total Revenue" value={inr(vm.kpis.totalRevenue)} sub="Paid registrations" accent={solid(HUE.success)} iconBg={soft(HUE.success)} />
        <KpiTile icon={Landmark} label="Net Revenue (after 2.95%)" value={inr(vm.kpis.netRevenue)} sub="Payout to organizers" accent={solid(HUE.steel)} iconBg={soft(HUE.steel)} />
        <KpiTile icon={Clock} label="Pending Revenue" value={inr(vm.kpis.pendingRevenue)} sub={`${vm.kpis.pending} unpaid`} accent={solid(HUE.warning)} iconBg={soft(HUE.warning)} />
        <KpiTile icon={Users} label="Registrations" value={vm.kpis.totalRegs} sub="Total in range" accent={solid(HUE.navy)} iconBg={soft(HUE.navy)} />
        <KpiTile icon={CheckCircle2} label="Paid" value={vm.kpis.paid} sub={`of ${vm.kpis.totalRegs} total`} accent={solid(HUE.success)} iconBg={soft(HUE.success)} />
        <KpiTile icon={Hourglass} label="Pending" value={vm.kpis.pending} sub="Awaiting payment" accent={solid(HUE.warning)} iconBg={soft(HUE.warning)} />
        <KpiTile icon={Target} label="Conversion" value={`${vm.kpis.conversion.toFixed(1)}%`} sub="Paid / total" accent={solid(HUE.gold)} iconBg={soft(HUE.gold)} />
        <KpiTile icon={TrendingUp} label="Avg. Value" value={inr(vm.kpis.avgValue)} sub="Per paid registration" accent={solid(HUE.steel)} iconBg={soft(HUE.steel)} />
      </div>

      {/* Trend + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 ke-card p-5">
          {/* Carousel header: the active graph's title + carousel controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h3 className="ke-section-title text-[15px] truncate">{TREND_SLIDES[chartSlide].title}</h3>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted rounded-sm px-2 py-0.5 tabular-nums">
                {chartSlide + 1} / {TREND_SLIDES.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* slide dots (active one elongates) */}
              <div className="flex items-center gap-1.5">
                {TREND_SLIDES.map((s, i) => (
                  <button key={s.key} type="button" onClick={() => chartApi?.scrollTo(i)} aria-label={`Show ${s.title}`}
                    className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${chartSlide === i ? 'w-5 bg-primary dark:bg-white' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground'}`} />
                ))}
              </div>
              {/* prev / next */}
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => chartApi?.scrollPrev()} aria-label="Previous chart"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => chartApi?.scrollNext()} aria-label="Next chart"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="ke-rule-gold mt-2 mb-3" />
          {/* Draggable carousel — two separate 3D graphs (bars ↔ line) */}
          <Carousel setApi={setChartApi} opts={{ align: 'start', loop: true }} className="cursor-grab active:cursor-grabbing select-none"
            onMouseEnter={() => setChartPaused(true)} onMouseLeave={() => setChartPaused(false)}>
            <CarouselContent>
              {TREND_SLIDES.map((s) => (
                <CarouselItem key={s.key}>
                  <TrendChart data={vm.trend} mode={s.mode} height={232} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className="mt-1 text-center text-[10px] font-jakarta text-muted-foreground/70">Drag or use the arrows to switch graphs</div>
        </div>
        <div className="ke-card p-5">
          <h3 className="ke-section-title text-[15px]">By Payment Status</h3>
          <div className="ke-rule-gold mt-2 mb-1.5" />
          <div className="text-[11px] text-muted-foreground mb-1 font-jakarta">{vm.kpis.totalRegs} total</div>
          <StatusDonut counts={vm.statusCounts} />
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 ke-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="ke-section-title text-[15px]">Top Events</h3>
            <button onClick={() => navigate('/campaigns')} className="text-[11px] font-jakarta font-medium text-primary hover:text-primary-hover rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View all →</button>
          </div>
          <div className="ke-rule-gold mt-2 mb-2.5" />
          <TopEventsTable rows={vm.topEvents} onRowClick={(id) => navigate(`/campaigns/${id}`)} />
        </div>
        <div className="ke-card p-5">
          <h3 className="ke-section-title text-[15px]">Recent Registrations</h3>
          <div className="ke-rule-gold mt-2 mb-2.5" />
          <RecentRegistrations items={vm.recent} />
        </div>
      </div>

      {/* Bottom strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniSplitCard title="Payment Gateway" hint="revenue split" rows={[
          { label: 'Razorpay', value: inr(vm.gateway.razorpay || 0), color: solid(HUE.navy) },
          { label: 'Instamojo', value: inr(vm.gateway.instamojo || 0), color: solid(HUE.steel) },
        ]} />
        <MiniSplitCard title="Collection Method" hint="registrations" rows={[
          { label: 'Online', value: vm.collection.online, color: solid(HUE.success) },
          { label: 'Offline / Cash', value: vm.collection.offline, color: solid(HUE.warning) },
        ]} />
        <MiniSplitCard title="Events" hint="by status" rows={[
          { label: 'Active', value: vm.eventStatus.active, color: solid(HUE.success) },
          { label: 'Draft', value: vm.eventStatus.draft, color: solid(HUE.muted) },
          { label: 'Closed', value: vm.eventStatus.closed, color: solid(HUE.red) },
        ]} />
      </div>
    </div>
  );
};

export default Dashboard;
