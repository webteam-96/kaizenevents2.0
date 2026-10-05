import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  ArrowLeft, Plus, Pencil, Trash2, Eye, RefreshCw, CreditCard, MoreHorizontal,
  Loader2, Search, Link as LinkIcon, Copy, Star, StarOff
} from 'lucide-react';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const getStatusVariant = (status) => {
  switch (status) {
    case 'ACTIVE':                return 'default';
    case 'BANK_VALIDATION_FAILED':
    case 'REJECTED':               return 'destructive';
    case 'PENDING':
    case 'IN_VERIFICATION':
    case 'IN_BANK_VALIDATION':
    case 'IN_BENE_CREATION':       return 'outline';
    default:                       return 'secondary';
  }
};

export default function CashfreeKyc() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isSuperAdmin } = useAuth();

  const [items, setItems]                       = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [searchQuery, setSearchQuery]           = useState('');
  // (Removed) campaigns state — vendors are no longer linked to events on this page.

  // Form state
  const [formDialogOpen, setFormDialogOpen]     = useState(false);
  const [editingItem, setEditingItem]           = useState(null);
  const [formData, setFormData]                 = useState({});
  const [confirmAccount, setConfirmAccount]     = useState('');
  const [formSending, setFormSending]           = useState(false);

  // OTP state
  const [otpDialogOpen, setOtpDialogOpen]       = useState(false);
  const [otpValue, setOtpValue]                 = useState('');
  const [otpVerifying, setOtpVerifying]         = useState(false);

  // View state
  const [viewDialogOpen, setViewDialogOpen]     = useState(false);
  const [viewDetail, setViewDetail]             = useState(null);
  const [viewLoading, setViewLoading]           = useState(false);

  // Delete + share-link state
  const [deleteTarget, setDeleteTarget]         = useState(null);
  const [refreshingAll, setRefreshingAll]       = useState(false);
  const [refreshingId, setRefreshingId]         = useState(null);
  const [togglingId, setTogglingId]             = useState(null);
  const [shareLinkUrl, setShareLinkUrl]         = useState(null);

  // Kaizen-default dialog state
  const [defaultTarget, setDefaultTarget]       = useState(null);   // vendor row being marked default
  const [defaultPercentage, setDefaultPercentage] = useState('');
  const [defaultSaving, setDefaultSaving]       = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cashfree-kyc');
      setItems(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load Cashfree KYC records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Open Add dialog pre-filled when arriving via /cashfree-kyc?prefill_campaign=...&prefill_role=...
  // Open Edit dialog pre-filled when arriving via /cashfree-kyc?edit_id=...
  // Ref guard ensures it only runs once per mount, even when items refresh after submit.
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current) return;

    const prefillCampaign = searchParams.get('prefill_campaign');
    const prefillRole     = searchParams.get('prefill_role');
    const editId          = searchParams.get('edit_id');

    if (editId) {
      if (items.length === 0) return; // wait for items to load
      const target = items.find(i => i.id === editId);
      if (target) openEditDialog(target);
      prefillAppliedRef.current = true;
      setSearchParams({}, { replace: true });
      return;
    }

    if (prefillCampaign) {
      setEditingItem(null);
      setFormData({
        ...emptyForm(),
        campaign_id: prefillCampaign,
        role: prefillRole || (isSuperAdmin() ? 'commission' : 'settlement'),
      });
      setConfirmAccount('');
      setFormDialogOpen(true);
      prefillAppliedRef.current = true;
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  const emptyForm = () => ({
    role:           isSuperAdmin() ? 'commission' : 'settlement',
    name:           '',
    email:          '',
    phone:          '',
    account_holder: '',
    account_number: '',
    ifsc:           '',
    pan:            '',
    campaign_id:    '',
  });

  const openAddDialog = () => {
    setEditingItem(null);
    setFormData(emptyForm());
    setConfirmAccount('');
    setFormDialogOpen(true);
  };

  const openEditDialog = (item) => {
    setEditingItem(item);
    setFormData({
      role:           item.role,
      name:           item.name,
      email:          item.email,
      phone:          item.phone,
      account_holder: item.account_holder,
      account_number: '',                    // leave blank — admin must re-enter to change
      ifsc:           item.ifsc,
      pan:            item.pan,
      campaign_id:    item.campaign_id || '',
    });
    setConfirmAccount('');
    setFormDialogOpen(true);
  };

  const validate = () => {
    const f = formData;
    // Vendors are a global registry; event-linking happens in the Edit Campaign
    // page's "Payment Splits" section, not here.
    if (!f.name?.trim())          return 'Name is required.';
    if (!f.email?.trim())         return 'Email is required.';
    if (!f.phone?.trim())         return 'Mobile number is required.';
    if (!f.account_holder?.trim()) return 'Account holder name is required.';
    if (!f.account_number?.trim()) return 'Account number is required.';
    if (f.account_number !== confirmAccount) return 'Account numbers do not match.';
    if (!f.ifsc?.trim())          return 'IFSC code is required.';
    if (!f.pan?.trim())           return 'PAN is required.';
    if (!PAN_REGEX.test(f.pan.trim().toUpperCase())) return 'Invalid PAN format. Expected: ABCDE1234F';
    return null;
  };

  const handleSendOtp = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setFormSending(true);
    try {
      const vendorEmail = formData.email.trim();
      await api.post('/cashfree-kyc/send-otp', { email: vendorEmail });
      setOtpValue('');
      setOtpDialogOpen(true);
      toast.success(`OTP sent to ${vendorEmail}.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP.');
    } finally {
      setFormSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpValue.trim().length !== 6) { toast.error('Enter the 6-digit OTP.'); return; }
    setOtpVerifying(true);
    try {
      await api.post('/cashfree-kyc', {
        kyc_id:         editingItem?.id || null,
        vendor_id:      editingItem?.vendor_id || null,    // null on create → backend auto-generates from event slug + role
        campaign_id:    formData.campaign_id || null,
        role:           formData.role,
        name:           formData.name.trim(),
        email:          formData.email.trim(),
        phone:          formData.phone.trim(),
        account_holder: formData.account_holder.trim(),
        account_number: formData.account_number.trim(),
        ifsc:           formData.ifsc.trim().toUpperCase(),
        pan:            formData.pan.trim().toUpperCase(),
        gst:            null,
        otp:            otpValue.trim(),
      });
      setOtpDialogOpen(false);
      setFormDialogOpen(false);
      toast.success(editingItem ? 'Vendor KYC updated.' : 'Vendor KYC submitted.');
      fetchItems();

      // If the admin came here from "Add new vendor" on a campaign's Payment Splits
      // section, send them back so they can finish wiring the vendor into the split.
      const returnTo = searchParams.get('return_to');
      if (returnTo) {
        setTimeout(() => navigate(returnTo), 500);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'OTP verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  // ── View detail ─────────────────────────────────────────────────────────────
  const handleView = async (item) => {
    setViewLoading(true);
    setViewDialogOpen(true);
    setViewDetail(null);
    try {
      const res = await api.get(`/cashfree-kyc/${item.id}`);
      setViewDetail(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load detail.');
      setViewDialogOpen(false);
    } finally {
      setViewLoading(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/cashfree-kyc/${deleteTarget.id}`);
      setDeleteTarget(null);
      toast.success('Vendor KYC deleted.');
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete.');
    }
  };

  // ── Toggle active ───────────────────────────────────────────────────────────
  const handleToggleActive = async (item) => {
    setTogglingId(item.id);
    try {
      await api.patch(`/cashfree-kyc/${item.id}/toggle-active`);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle.');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Refresh ─────────────────────────────────────────────────────────────────
  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      const res = await api.post('/cashfree-kyc/refresh-all');
      toast.success(res.data?.message || `Refreshed ${res.data?.updatedCount || 0} vendor(s).`);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Refresh failed.');
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleRefreshSingle = async (item) => {
    setRefreshingId(item.id);
    try {
      const res = await api.post(`/cashfree-kyc/${item.id}/refresh`);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: res.data.status } : i));
      toast.success('Vendor status refreshed.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Refresh failed.');
    } finally {
      setRefreshingId(null);
    }
  };

  // ── Generate share link for vendor self-onboarding ──────────────────────────
  const handleGenerateShareLink = async (item) => {
    try {
      const res = await api.post(`/cashfree-kyc/${item.id}/share-link`);
      setShareLinkUrl(res.data.url);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to generate link.');
    }
  };

  const copyShareLink = () => {
    if (!shareLinkUrl) return;
    navigator.clipboard.writeText(shareLinkUrl);
    toast.success('Share link copied to clipboard.');
  };

  // ── Kaizen default vendor ───────────────────────────────────────────────────
  const openDefaultDialog = (item) => {
    setDefaultTarget(item);
    setDefaultPercentage(item.is_default_kaizen_vendor && item.default_percentage != null
      ? String(item.default_percentage)
      : '2.95');
  };

  const handleSaveDefault = async () => {
    const pct = parseFloat(defaultPercentage);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      toast.error('Default percentage must be between 0 and 100 (exclusive).');
      return;
    }
    setDefaultSaving(true);
    try {
      await api.put(`/cashfree-kyc/${defaultTarget.id}/set-default`, { default_percentage: pct });
      toast.success(`${defaultTarget.name} is now the Kaizen default vendor at ${pct}%.`);
      setDefaultTarget(null);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to set default vendor.');
    } finally {
      setDefaultSaving(false);
    }
  };

  const handleClearDefault = async () => {
    if (!window.confirm('Remove the current Kaizen default vendor? Cashfree payments will fail until a new default is set.')) return;
    try {
      await api.delete('/cashfree-kyc/default');
      toast.success('Kaizen default vendor cleared.');
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to clear default.');
    }
  };

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return [item.vendor_id, item.name, item.email, item.phone, item.pan, item.ifsc, item.status]
      .some(v => v?.toLowerCase().includes(q));
  });

  // Kiosk volunteers cannot manage vendors; Org Admins can manage settlement vendors only.
  if (user?.role === 'kiosk_volunteer' || !user?.role) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h3 className="text-lg font-semibold text-foreground">Access Denied</h3>
        <p className="text-muted-foreground mt-2">You do not have permission to manage Cashfree KYC.</p>
      </div>
    );
  }
  const canEditCommission = isSuperAdmin();

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-jakarta mb-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Payments · Cashfree Easy Split</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Cashfree KYC Management</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">Manage vendor KYC records for Cashfree Easy Split</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleRefreshAll} disabled={refreshingAll}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta">
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshingAll ? 'animate-spin' : ''}`} />
                  {refreshingAll ? 'Refreshing...' : 'Refresh All'}
                </Button>
                <Button onClick={openAddDialog}
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Vendor
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="ke-card p-12 text-center">
            <span className="ke-medallion mx-auto mb-4" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
              <CreditCard className="h-6 w-6" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <h3 className="text-lg font-outfit font-semibold text-foreground">No KYC records yet</h3>
            <p className="text-muted-foreground mt-2">Click &ldquo;Add Vendor&rdquo; to create your first vendor.</p>
          </div>
        )}

        {/* Table */}
        {!loading && items.length > 0 && (
          <>
            <div className="flex items-center gap-2 max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by vendor ID, name, email, status..."
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No results for &ldquo;{searchQuery}&rdquo;</p>
            ) : (
              <div className="ke-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted uppercase text-[11px] tracking-wider text-muted-foreground">
                      <TableHead>#</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>PAN</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>IFSC</TableHead>
                      <TableHead className="text-center">KYC Status</TableHead>
                      <TableHead className="text-center">In Use / Active</TableHead>
                      <TableHead className="text-center">Kaizen Default</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item, i) => (
                      <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.vendor_id}</TableCell>
                        <TableCell className="capitalize">{item.role}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-sm">{item.email}</TableCell>
                        <TableCell className="font-mono text-xs">{item.pan}</TableCell>
                        <TableCell className="font-mono text-xs">{item.account_number}</TableCell>
                        <TableCell className="font-mono text-xs">{item.ifsc}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={item.is_active}
                            disabled={togglingId === item.id || (!canEditCommission && item.role !== 'settlement')}
                            onCheckedChange={() => handleToggleActive(item)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {item.is_default_kaizen_vendor ? (
                            <Badge className="bg-primary hover:bg-primary tabular-nums">
                              <Star className="h-3 w-3 mr-1" />
                              {item.default_percentage != null ? `${item.default_percentage}%` : 'Default'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleView(item)}>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </DropdownMenuItem>
                              {(canEditCommission || item.role === 'settlement') && (
                                <>
                                  <DropdownMenuItem onClick={() => openEditDialog(item)}>
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleGenerateShareLink(item)}>
                                    <LinkIcon className="mr-2 h-4 w-4" /> Generate share link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleRefreshSingle(item)}
                                    disabled={item.status === 'ACTIVE' || refreshingId === item.id}
                                  >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshingId === item.id ? 'animate-spin' : ''}`} />
                                    Refresh
                                  </DropdownMenuItem>
                                  {isSuperAdmin() && (
                                    item.is_default_kaizen_vendor ? (
                                      <>
                                        <DropdownMenuItem onClick={() => openDefaultDialog(item)}>
                                          <Pencil className="mr-2 h-4 w-4" /> Edit default %
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleClearDefault} className="text-amber-600">
                                          <StarOff className="mr-2 h-4 w-4" /> Remove as default
                                        </DropdownMenuItem>
                                      </>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => openDefaultDialog(item)}
                                        disabled={item.status !== 'ACTIVE' || !item.is_active}
                                      >
                                        <Star className="mr-2 h-4 w-4" /> Set as Kaizen default
                                      </DropdownMenuItem>
                                    )
                                  )}
                                  <DropdownMenuItem
                                    disabled={item.is_active}
                                    onClick={() => !item.is_active && setDeleteTarget(item)}
                                    className={item.is_active ? 'opacity-50' : 'text-destructive'}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {item.is_active ? 'Deactivate first' : 'Delete'}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Vendor KYC' : 'Add Vendor KYC'}</DialogTitle>
              <DialogDescription>
                Enter vendor KYC details. An OTP will be emailed to you for verification before submission to Cashfree.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Event field intentionally removed — vendors are now a global registry.
                  Per-event assignments happen on the Edit Campaign page's "Payment Splits" section. */}
              {canEditCommission && (
                <div>
                  <Label>Role <span className="text-destructive">*</span></Label>
                  <select
                    value={formData.role || ''}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full h-10 rounded-md border border-border bg-background text-foreground px-3"
                    disabled={!!editingItem}
                  >
                    <option value="commission">Commission</option>
                    <option value="settlement">Settlement</option>
                  </select>
                </div>
              )}
              <div>
                <Label>Name on PAN Card <span className="text-destructive">*</span></Label>
                <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="As printed on the PAN card" />
              </div>
              <div>
                <Label>Pan Number <span className="text-destructive">*</span></Label>
                <Input value={formData.pan || ''} onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10} />
                {formData.pan && !PAN_REGEX.test(formData.pan) && (
                  <p className="text-destructive text-sm mt-1">Invalid PAN format. Expected: ABCDE1234F</p>
                )}
              </div>
              <div>
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="vendor@example.com" />
              </div>
              <div>
                <Label>Mobile <span className="text-destructive">*</span></Label>
                <Input value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="9876543210" />
              </div>
              <div>
                <Label>Account Holder Name <span className="text-destructive">*</span></Label>
                <Input value={formData.account_holder || ''} onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })} />
              </div>
              <div>
                <Label>Account Number <span className="text-destructive">*</span></Label>
                <Input value={formData.account_number || ''} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} />
              </div>
              <div>
                <Label>Confirm Account Number <span className="text-destructive">*</span></Label>
                <Input value={confirmAccount} onChange={(e) => setConfirmAccount(e.target.value)} />
                {confirmAccount && formData.account_number !== confirmAccount && (
                  <p className="text-destructive text-sm mt-1">Account numbers do not match.</p>
                )}
              </div>
              <div>
                <Label>IFSC Code <span className="text-destructive">*</span></Label>
                <Input value={formData.ifsc || ''} onChange={(e) => setFormData({ ...formData, ifsc: e.target.value.toUpperCase() })} placeholder="SBIN0001234" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormDialogOpen(false)} disabled={formSending}>Cancel</Button>
              <Button onClick={handleSendOtp} disabled={formSending}>
                {formSending ? 'Sending OTP...' : 'Send OTP & Verify'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* OTP Dialog */}
        <Dialog open={otpDialogOpen} onOpenChange={setOtpDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Verify OTP</DialogTitle>
              <DialogDescription>OTP sent to {formData.email}. Enter the 6-digit code below.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label>OTP <span className="text-destructive">*</span></Label>
              <Input
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                maxLength={6}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOtpDialogOpen(false)} disabled={otpVerifying}>Cancel</Button>
              <Button onClick={handleVerifyOtp} disabled={otpVerifying || otpValue.length !== 6}>
                {otpVerifying ? 'Verifying...' : 'Verify & Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Detail Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Vendor KYC Details</DialogTitle>
            </DialogHeader>
            {viewLoading && <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
            {!viewLoading && viewDetail && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Field label="Vendor ID" value={viewDetail.vendor_id} mono />
                  <Field label="Role" value={viewDetail.role} />
                  <Field label="Name" value={viewDetail.name} />
                  <Field label="Email" value={viewDetail.email} />
                  <Field label="Phone" value={viewDetail.phone} />
                  <Field label="Account Holder" value={viewDetail.account_holder} />
                  <Field label="Account #" value={viewDetail.account_number} mono />
                  <Field label="IFSC" value={viewDetail.ifsc} mono />
                  <Field label="PAN" value={viewDetail.pan} mono />
                  <Field label="GST" value={viewDetail.gst || '—'} mono />
                  <div>
                    <p className="text-muted-foreground text-xs">Status</p>
                    <Badge variant={getStatusVariant(viewDetail.status)}>{viewDetail.status}</Badge>
                  </div>
                </div>
                {viewDetail.cashfree_json && (
                  <div>
                    <p className="text-muted-foreground text-xs font-medium mb-1">Cashfree API Response</p>
                    <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto max-h-60 whitespace-pre-wrap">
                      {(() => {
                        try { return JSON.stringify(JSON.parse(viewDetail.cashfree_json), null, 2); }
                        catch { return viewDetail.cashfree_json; }
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Vendor KYC</AlertDialogTitle>
              <AlertDialogDescription>
                Delete vendor <strong className="text-foreground">{deleteTarget?.vendor_id}</strong>? This cannot be undone.
                The vendor in Cashfree will NOT be deleted automatically — manage that in Cashfree dashboard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Kaizen Default Vendor Dialog */}
        <Dialog open={!!defaultTarget} onOpenChange={(o) => !o && setDefaultTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {defaultTarget?.is_default_kaizen_vendor ? 'Edit Kaizen Default %' : 'Set as Kaizen Default Vendor'}
              </DialogTitle>
              <DialogDescription>
                <strong>{defaultTarget?.name}</strong> will receive this percentage of every Cashfree event's order amount.
                The remaining amount is split among the per-event vendors configured in each campaign.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label>Default percentage (%) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max="99.99"
                value={defaultPercentage}
                onChange={(e) => setDefaultPercentage(e.target.value)}
                placeholder="2.95"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                Must be between 0 and 100 (exclusive). This vendor will be auto-applied to every Cashfree event;
                it cannot also be selected as a per-event split.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDefaultTarget(null)} disabled={defaultSaving}>Cancel</Button>
              <Button onClick={handleSaveDefault} disabled={defaultSaving}>
                {defaultSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Star className="h-4 w-4 mr-2" />}
                {defaultTarget?.is_default_kaizen_vendor ? 'Update' : 'Set as default'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share Link Dialog */}
        <Dialog open={!!shareLinkUrl} onOpenChange={(o) => !o && setShareLinkUrl(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Vendor Onboarding Link</DialogTitle>
              <DialogDescription>
                Share this link with the vendor. They'll fill in their bank details + verify via OTP.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Input value={shareLinkUrl || ''} readOnly className="font-mono text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShareLinkUrl(null)}>Close</Button>
              <Button onClick={copyShareLink}><Copy className="mr-2 h-4 w-4" /> Copy Link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

const Field = ({ label, value, mono }) => (
  <div>
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className={`font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
  </div>
);
