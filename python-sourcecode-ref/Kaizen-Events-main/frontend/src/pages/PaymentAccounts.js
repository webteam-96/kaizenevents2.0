import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  CreditCard, Plus, Edit2, Trash2, Eye, EyeOff,
  Building2, CheckCircle, XCircle, ArrowLeft,
  IndianRupee, TrendingUp, Clock
} from 'lucide-react';
import { toast } from 'sonner';

// Brand hues expressed as design-token HSL bodies so medallions/hairlines
// resolve through the same tokens and re-skin in both light and dark mode.
const GATEWAY_HUE = {
  instamojo: 'var(--chart-1)', // navy
  razorpay: 'var(--chart-4)',  // steel-blue
  cashfree: 'var(--chart-2)',  // gold
};
const gatewayHue = (t) => GATEWAY_HUE[t] || 'var(--chart-1)';
const solid = (v) => `hsl(${v})`;
const soft = (v) => `hsl(${v} / 0.14)`;

const PaymentAccounts = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showCredentials, setShowCredentials] = useState({});

  const [formData, setFormData] = useState({
    name: '',
    gateway_type: 'instamojo',
    description: '',
    is_active: true,
    // Instamojo
    instamojo_api_key: '',
    instamojo_auth_token: '',
    instamojo_salt: '',
    instamojo_mode: 'sandbox',
    // Razorpay
    razorpay_key_id: '',
    razorpay_key_secret: '',
    razorpay_mode: 'test',
    razorpay_settlement_mode: 'route',
    // Cashfree
    cashfree_app_id: '',
    cashfree_secret_key: '',
    cashfree_mode: 'sandbox',
  });

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard');
      return;
    }
    fetchAccounts();
  }, [isSuperAdmin, navigate]);

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/payment-accounts');
      setAccounts(response.data);
    } catch (error) {
      toast.error('Failed to load payment accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await api.put(`/payment-accounts/${editingAccount.id}`, formData);
        toast.success('Payment account updated successfully');
      } else {
        await api.post('/payment-accounts', formData);
        toast.success('Payment account created successfully');
      }
      setShowModal(false);
      setEditingAccount(null);
      resetForm();
      fetchAccounts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save payment account');
    }
  };

  const handleDelete = async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this payment account?')) {
      return;
    }
    try {
      await api.delete(`/payment-accounts/${accountId}`);
      toast.success('Payment account deleted');
      fetchAccounts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete payment account');
    }
  };

  const openEditModal = (account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      gateway_type: account.gateway_type,
      description: account.description || '',
      is_active: account.is_active,
      instamojo_api_key: '',
      instamojo_auth_token: '',
      instamojo_salt: '',
      instamojo_mode: account.instamojo_mode || 'sandbox',
      razorpay_key_id: '',
      razorpay_key_secret: '',
      razorpay_mode: account.razorpay_mode || 'test',
      razorpay_settlement_mode: account.razorpay_settlement_mode || 'route',
      cashfree_app_id: '',
      cashfree_secret_key: '',
      cashfree_mode: account.cashfree_mode || 'sandbox',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      gateway_type: 'instamojo',
      description: '',
      is_active: true,
      instamojo_api_key: '',
      instamojo_auth_token: '',
      instamojo_salt: '',
      instamojo_mode: 'sandbox',
      razorpay_key_id: '',
      razorpay_key_secret: '',
      razorpay_mode: 'test',
      razorpay_settlement_mode: 'route',
      cashfree_app_id: '',
      cashfree_secret_key: '',
      cashfree_mode: 'sandbox',
    });
  };

  const toggleCredentials = (accountId) => {
    setShowCredentials(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm font-jakarta text-muted-foreground">Loading payment accounts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-6">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta font-medium text-white/70 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance Configuration</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Payment Accounts</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">
                  Manage your Instamojo, Razorpay and Cashfree gateway credentials.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingAccount(null);
                  resetForm();
                  setShowModal(true);
                }}
                className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Account
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        {accounts.length === 0 ? (
          <div className="ke-card p-12 text-center">
            <span className="ke-medallion mx-auto mb-4" style={{ background: `linear-gradient(150deg, ${soft('var(--chart-1)')}, transparent 85%)` }}>
              <CreditCard className="w-6 h-6" style={{ color: solid('var(--chart-1)') }} />
            </span>
            <h3 className="text-xl font-outfit font-semibold text-foreground mb-2">
              No Payment Accounts Yet
            </h3>
            <p className="text-muted-foreground font-jakarta mb-6 max-w-md mx-auto">
              Add your first Instamojo, Razorpay or Cashfree account to start accepting payments.
            </p>
            <Button
              onClick={() => setShowModal(true)}
              className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
              style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Payment Account
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h3 className="ke-section-title text-[15px]">Connected Accounts</h3>
              <div className="ke-rule-gold mt-2" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => (
                <div key={account.id} className="ke-card ke-card-hover relative overflow-hidden p-6">
                  {/* Accent top-hairline (gateway-tinted) */}
                  <div
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: `linear-gradient(90deg, ${solid(gatewayHue(account.gateway_type))}, ${solid(`${gatewayHue(account.gateway_type)} / 0`)})` }}
                  />
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span
                        className="ke-medallion"
                        style={{ background: `linear-gradient(150deg, ${soft(gatewayHue(account.gateway_type))}, transparent 85%)` }}
                      >
                        <CreditCard className="w-6 h-6" style={{ color: solid(gatewayHue(account.gateway_type)) }} />
                      </span>
                      <div>
                        <h3 className="font-outfit font-semibold text-foreground">{account.name}</h3>
                        <p className="text-xs font-jakarta text-muted-foreground capitalize">
                          {account.gateway_type}
                        </p>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-sm text-xs font-jakarta font-medium ${
                      account.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </div>
                  </div>

                  {account.description && (
                    <p className="text-sm font-jakarta text-muted-foreground mb-4">{account.description}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl border border-border bg-muted/50 p-3.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-[0.12em] font-jakarta font-semibold text-muted-foreground">Transactions</span>
                      </div>
                      <p className="text-[28px] leading-none font-outfit font-bold text-foreground tabular-nums">
                        {account.total_transactions}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/50 p-3.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <IndianRupee className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-[0.12em] font-jakarta font-semibold text-muted-foreground">Collected</span>
                      </div>
                      <p className="text-[28px] leading-none font-outfit font-bold text-foreground tabular-nums">
                        ₹{account.total_amount_collected?.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>

                  {/* Credentials Status */}
                  <div className="flex items-center justify-between text-sm font-jakarta mb-3 p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Credentials</span>
                    <div className="flex items-center space-x-1">
                      {(
                        account.gateway_type === 'instamojo' ? account.has_instamojo_credentials :
                        account.gateway_type === 'cashfree'  ? account.has_cashfree_credentials  :
                                                                account.has_razorpay_credentials
                      ) ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-green-600">Configured</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-amber-500" />
                          <span className="text-amber-600">Not Set</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mode Badge */}
                  {(() => {
                    const mode =
                      account.gateway_type === 'instamojo' ? account.instamojo_mode :
                      account.gateway_type === 'cashfree'  ? account.cashfree_mode  :
                                                              account.razorpay_mode;
                    const isTest = mode === 'sandbox' || mode === 'test';
                    const label =
                      mode === 'sandbox'    ? 'Sandbox'    :
                      mode === 'test'       ? 'Test'       :
                      mode === 'production' ? 'Production' :
                      mode === 'live'       ? 'Live'       :
                                              (mode || '—');
                    return (
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-jakarta text-muted-foreground">Mode</span>
                        <span className={`px-2 py-1 rounded text-xs font-jakarta font-medium ${isTest ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {label}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex items-center justify-end space-x-2 pt-4 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(account)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(account.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-card rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-border shadow-xl">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-outfit font-bold text-foreground">
                {editingAccount ? 'Edit Payment Account' : 'Add Payment Account'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Account Name */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Account Name *
                </Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Rotary Main Account"
                  required
                  className="h-11 rounded-lg border-border"
                />
              </div>

              {/* Gateway Type */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Payment Gateway *
                </Label>
                <Select
                  value={formData.gateway_type}
                  onValueChange={(value) => setFormData({ ...formData, gateway_type: value })}
                  disabled={!!editingAccount}
                >
                  <SelectTrigger className="h-11 rounded-lg border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instamojo">Instamojo</SelectItem>
                    <SelectItem value="razorpay">Razorpay</SelectItem>
                    <SelectItem value="cashfree">Cashfree</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  Description
                </Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  className="h-11 rounded-lg border-border"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <Label className="text-foreground font-jakarta font-medium">Active</Label>
                  <p className="text-xs text-muted-foreground font-jakarta">Enable this account for events</p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>

              {/* Instamojo Credentials */}
              {formData.gateway_type === 'instamojo' && (
                <div className="space-y-4 p-4 border border-primary-subtle rounded-lg bg-primary-subtle">
                  <h4 className="font-jakarta font-semibold text-primary">Instamojo Credentials</h4>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">API Key</Label>
                    <Input
                      type="password"
                      value={formData.instamojo_api_key}
                      onChange={(e) => setFormData({ ...formData, instamojo_api_key: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter API Key'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Auth Token</Label>
                    <Input
                      type="password"
                      value={formData.instamojo_auth_token}
                      onChange={(e) => setFormData({ ...formData, instamojo_auth_token: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter Auth Token'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Salt (for webhooks)</Label>
                    <Input
                      type="password"
                      value={formData.instamojo_salt}
                      onChange={(e) => setFormData({ ...formData, instamojo_salt: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter Salt'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Mode</Label>
                    <Select
                      value={formData.instamojo_mode}
                      onValueChange={(value) => setFormData({ ...formData, instamojo_mode: value })}
                    >
                      <SelectTrigger className="h-10 rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                        <SelectItem value="production">Production (Live)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Razorpay Credentials */}
              {formData.gateway_type === 'razorpay' && (
                <div className="space-y-4 p-4 border border-primary-subtle rounded-lg bg-primary-subtle">
                  <h4 className="font-jakarta font-semibold text-primary">Razorpay Credentials</h4>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Key ID</Label>
                    <Input
                      type="password"
                      value={formData.razorpay_key_id}
                      onChange={(e) => setFormData({ ...formData, razorpay_key_id: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter Key ID'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Key Secret</Label>
                    <Input
                      type="password"
                      value={formData.razorpay_key_secret}
                      onChange={(e) => setFormData({ ...formData, razorpay_key_secret: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter Key Secret'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Mode</Label>
                    <Select
                      value={formData.razorpay_mode}
                      onValueChange={(value) => setFormData({ ...formData, razorpay_mode: value })}
                    >
                      <SelectTrigger className="h-10 rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="test">Test Mode</SelectItem>
                        <SelectItem value="live">Live Mode</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Settlement Mode</Label>
                    <Select
                      value={formData.razorpay_settlement_mode}
                      onValueChange={(value) => setFormData({ ...formData, razorpay_settlement_mode: value })}
                    >
                      <SelectTrigger className="h-10 rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="route">Route (split across vendors)</SelectItem>
                        <SelectItem value="single_account">Single Account (Kaizen-managed payout)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Single Account: no Razorpay Route transfers; Kaizen holds the full amount and pays out via Fund Transfers. Campaigns using this account are automatically set to "Kaizen Managed".
                    </p>
                  </div>
                </div>
              )}

              {/* Cashfree Credentials */}
              {formData.gateway_type === 'cashfree' && (
                <div className="space-y-4 p-4 border border-green-200 rounded-lg bg-green-50">
                  <h4 className="font-jakarta font-semibold text-green-900">Cashfree Credentials</h4>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">App ID</Label>
                    <Input
                      type="password"
                      value={formData.cashfree_app_id}
                      onChange={(e) => setFormData({ ...formData, cashfree_app_id: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter App ID'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Secret Key</Label>
                    <Input
                      type="password"
                      value={formData.cashfree_secret_key}
                      onChange={(e) => setFormData({ ...formData, cashfree_secret_key: e.target.value })}
                      placeholder={editingAccount ? '••••••••' : 'Enter Secret Key'}
                      className="h-10 rounded-lg border-border"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-1 block">Mode</Label>
                    <Select
                      value={formData.cashfree_mode}
                      onValueChange={(value) => setFormData({ ...formData, cashfree_mode: value })}
                    >
                      <SelectTrigger className="h-10 rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                        <SelectItem value="production">Production (Live)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {editingAccount && (
                <p className="text-xs text-muted-foreground font-jakarta">
                  Leave credential fields empty to keep existing values.
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    setEditingAccount(null);
                    resetForm();
                  }}
                  className="border-border"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary-hover text-primary-foreground"
                >
                  {editingAccount ? 'Update Account' : 'Create Account'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PaymentAccounts;
