import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { ArrowLeft, Search, Pencil, Loader2, ListTree } from 'lucide-react';
import { toast } from 'sonner';
import { getInstamojoSession, clearInstamojoSession } from './InstamojoPasswordGate';

const PAGE_SIZES = [25, 50, 100, 200];

export default function InstamojoPurposes() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [size, setSize]       = useState(50);
  const [list, setList]       = useState({ total: 0, total_pages: 0, results: [] });

  // Session check
  useEffect(() => {
    if (!getInstamojoSession()) navigate('/instamojo', { replace: true });
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/instamojo-archive/purposes', {
        params: { search: search || undefined, page, size },
      });
      setList(res.data);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      toast.error(err.response?.data?.detail || 'Failed to load purposes.');
    } finally {
      setLoading(false);
    }
  }, [search, page, size, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleActive = async (row) => {
    const willEnable = row.is_active === 0;
    const msg = willEnable
      ? 'Are you sure you want to enable the payment link?'
      : 'Are you sure you want to disable the payment link?';
    if (!window.confirm(msg)) return;
    try {
      await api.patch(`/instamojo-archive/purposes/${row.id}/active`, {
        isActive: willEnable ? 1 : 0,
      });
      toast.success(willEnable ? 'Enabled.' : 'Disabled.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update.');
    }
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
              onClick={() => navigate('/instamojo/list')}
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta text-white/70 hover:text-white transition-colors mb-3 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
              <ArrowLeft className="w-4 h-4" /> Back to Transactions
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Instamojo For Accounts</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Purpose Listing</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Enable or disable payment links and edit bank details per purpose.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="ke-card p-5">
          <h3 className="ke-section-title text-[15px]">Search</h3>
          <div className="ke-rule-gold mt-2 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <Label>Search Purpose</Label>
              <div className="flex gap-2">
                <Input value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchData())}
                  placeholder="Enter Purpose" />
                <Button onClick={() => { setPage(1); fetchData(); }}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="ke-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm table-fixed border-collapse
                         [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-foreground
                         [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-2 [&_td]:align-middle [&_td]:text-foreground
                         [&_tbody_tr:nth-child(even)]:bg-muted/50 [&_tbody_tr:hover]:bg-primary-subtle/60 [&_tbody_tr]:transition-colors">
              <colgroup>
                <col style={{ width: '8%'  }} />   {/* Sr. No. */}
                <col style={{ width: '60%' }} />   {/* Title */}
                <col style={{ width: '20%' }} />   {/* Active/Inactive */}
                <col style={{ width: '12%' }} />   {/* Edit */}
              </colgroup>
              <thead className="bg-muted text-left">
                <tr>
                  <th>Sr. No.</th>
                  <th>Title</th>
                  <th className="!text-center">Active/Inactive</th>
                  <th className="!text-center">Edit</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="!text-center !py-6 text-muted-foreground">
                    <Loader2 className="inline w-4 h-4 animate-spin mr-2" /> Loading…
                  </td></tr>
                )}
                {!loading && list.results.length === 0 && (
                  <tr><td colSpan={4} className="!text-center !py-10 text-muted-foreground">
                    <ListTree className="mx-auto mb-2 w-6 h-6 opacity-50" />
                    No purposes found.
                  </td></tr>
                )}
                {!loading && list.results.map((row, i) => (
                  <tr key={row.id}>
                    <td className="!text-muted-foreground text-center tabular-nums">{startIdx + i}</td>
                    <td className="truncate" title={row.title || ''}>{row.title || '—'}</td>
                    <td className="text-center">
                      <button type="button"
                        onClick={() => toggleActive(row)}
                        className={`text-sm font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded ${
                          row.is_active === 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                        }`}>
                        {row.is_active === 1 ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="text-center">
                      <button type="button"
                        onClick={() => navigate(`/instamojo/purpose/${row.id}/bank-details`)}
                        title="Edit Bank Details"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Pencil className="w-4 h-4 inline" />
                      </button>
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
    </div>
  );
}
