import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import {
  Mail, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  Copy, RefreshCw, Shield, Eye, EyeOff, X, ExternalLink, Globe, Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

const DKIMRegistration = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState([]);
  const [senders, setSenders] = useState([]);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddSender, setShowAddSender] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [newDomain, setNewDomain] = useState({ domain: '' });
  const [newSender, setNewSender] = useState({ name: '', email: '', dkim_domain_id: '', is_default: false });
  // Sender being edited: { id, name, email, is_default } or null when the modal is closed
  const [editSender, setEditSender] = useState(null);

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [isSuperAdmin, navigate]);

  const fetchData = async () => {
    try {
      const [domainsRes, sendersRes] = await Promise.all([
        api.get('/dkim/domains'),
        api.get('/dkim/senders')
      ]);
      setDomains(domainsRes.data);
      setSenders(sendersRes.data);
    } catch (error) {
      console.error('Failed to fetch DKIM data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newDomain.domain) {
      toast.error('Please enter a domain');
      return;
    }

    setSaving(true);
    try {
      await api.post('/dkim/domains', newDomain);
      toast.success('Domain registered! Configure DNS records to verify.');
      setShowAddDomain(false);
      setNewDomain({ domain: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to register domain');
    } finally {
      setSaving(false);
    }
  };

  // Toggle the DNS-records panel. On open, pull fresh records from Brevo via the
  // single-domain GET (which self-heals records that weren't captured at creation).
  const handleToggleRecords = async (domain) => {
    if (selectedDomain === domain.id) {
      setSelectedDomain(null);
      return;
    }
    setSelectedDomain(domain.id);
    if (!domain.records || domain.records.length === 0) {
      setLoadingRecords(domain.id);
      try {
        const res = await api.get(`/dkim/domains/${domain.id}`);
        setDomains((prev) => prev.map((d) => (d.id === domain.id ? { ...d, ...res.data } : d)));
      } catch (error) {
        toast.error('Could not load DNS records from Brevo');
      } finally {
        setLoadingRecords(null);
      }
    }
  };

  const handleVerifyDomain = async (domainId) => {
    setVerifying(domainId);
    try {
      const response = await api.post(`/dkim/domains/${domainId}/verify`);
      toast.success(response.data.message);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Verification failed');
    } finally {
      setVerifying(null);
    }
  };

  const handleDeleteDomain = async (domainId) => {
    if (!confirm('Are you sure you want to delete this domain?')) return;

    try {
      await api.delete(`/dkim/domains/${domainId}`);
      toast.success('Domain deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete domain');
    }
  };

  const handleAddSender = async (e) => {
    e.preventDefault();
    if (!newSender.name || !newSender.email || !newSender.dkim_domain_id) {
      toast.error('Please fill in all fields');
      return;
    }

    setSaving(true);
    try {
      await api.post('/dkim/senders', newSender);
      toast.success('Email sender created!');
      setShowAddSender(false);
      setNewSender({ name: '', email: '', dkim_domain_id: '', is_default: false });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create sender');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSender = async (e) => {
    e.preventDefault();
    if (!editSender?.name?.trim()) {
      toast.error('Please enter a sender name');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/dkim/senders/${editSender.id}`, {
        name: editSender.name.trim(),
        is_default: editSender.is_default
      });
      toast.success('Sender updated!');
      setEditSender(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update sender');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSender = async (senderId) => {
    if (!confirm('Are you sure you want to delete this sender?')) return;

    try {
      await api.delete(`/dkim/senders/${senderId}`);
      toast.success('Sender deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete sender');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'verified':
        return <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-sm"><CheckCircle className="w-3 h-3" /> Verified</span>;
      case 'pending':
        return <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-100 px-2 py-1 rounded-sm"><AlertCircle className="w-3 h-3" /> Pending</span>;
      default:
        return <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded-sm"><AlertCircle className="w-3 h-3" /> {status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-6">
          <div className="ke-hero-grid" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Email Authentication</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">DKIM Registration</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5">Manage email domains and sender addresses for verified email delivery.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowAddSender(true)}
                disabled={domains.length === 0}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta disabled:opacity-40"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add Sender
              </Button>
              <Button
                onClick={() => setShowAddDomain(true)}
                className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add Domain
              </Button>
            </div>
          </div>
        </div>

        {/* Domains Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="ke-section-title text-[15px]">Registered Domains</h2>
              <div className="ke-rule-gold mt-2" />
            </div>
            <Button
              onClick={() => setShowAddDomain(true)}
              className="bg-primary hover:bg-primary-hover rounded-lg h-9 font-jakarta"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Domain
            </Button>
          </div>

          {domains.length === 0 ? (
            <div className="ke-card p-8 text-center">
              <span className="ke-medallion mx-auto mb-4" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
                <Globe className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <h3 className="text-lg font-outfit font-semibold text-foreground mb-2">No domains registered</h3>
              <p className="text-sm text-muted-foreground mb-4">Register a domain to start sending emails with DKIM authentication</p>
              <Button onClick={() => setShowAddDomain(true)} variant="outline" className="rounded-lg">
                <Plus className="w-4 h-4 mr-2" /> Register Domain
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => (
                <div key={domain.id} className="ke-card p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="ke-medallion"
                        style={{ background: domain.status === 'verified'
                          ? 'linear-gradient(150deg, hsl(152 58% 40% / 0.16), transparent 85%)'
                          : 'linear-gradient(150deg, hsl(38 92% 48% / 0.16), transparent 85%)' }}
                      >
                        <Globe className={`w-5 h-5 ${domain.status === 'verified' ? 'text-green-600' : 'text-yellow-600'}`} />
                      </span>
                      <div>
                        <h3 className="font-outfit font-semibold text-foreground">{domain.domain}</h3>
                        <p className="text-sm text-muted-foreground">Added {formatServerDate(domain.created_at, 'dd MMM yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(domain.status)}
                      {domain.status !== 'verified' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerifyDomain(domain.id)}
                          disabled={verifying === domain.id}
                        >
                          {verifying === domain.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><RefreshCw className="w-4 h-4 mr-1" /> Verify</>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleRecords(domain)}
                      >
                        {selectedDomain === domain.id ? 'Hide Records' : 'DNS Records'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDomain(domain.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* DNS Records */}
                  {selectedDomain === domain.id && (
                    <div className="mt-4 pt-4 border-t border-border">
                      {loadingRecords === domain.id ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading DNS records…
                        </div>
                      ) : domain.records && domain.records.length > 0 ? (
                        <>
                      <h4 className="text-sm font-medium text-foreground mb-3">Add these DNS records to verify your domain:</h4>
                      <div className="space-y-3">
                        {domain.records.map((record, idx) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{record.type} Record</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(record.value)}
                                className="h-6 text-xs"
                              >
                                <Copy className="w-3 h-3 mr-1" /> Copy
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Name:</span>
                                <code className="ml-2 bg-border/60 text-foreground px-2 py-0.5 rounded text-xs">{record.name}</code>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Value:</span>
                                <code className="ml-2 bg-border/60 text-foreground px-2 py-0.5 rounded text-xs break-all">{record.value}</code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No DNS records returned by Brevo for this domain. Try <strong>Verify</strong>, or check the domain in your Brevo dashboard.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Senders Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="ke-section-title text-[15px]">Email Senders</h2>
              <div className="ke-rule-gold mt-2" />
            </div>
            <Button
              onClick={() => setShowAddSender(true)}
              variant="outline"
              disabled={domains.length === 0}
              className="rounded-lg h-9"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Sender
            </Button>
          </div>

          {senders.length === 0 ? (
            <div className="ke-card p-8 text-center">
              <span className="ke-medallion mx-auto mb-4" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}>
                <Mail className="w-6 h-6" style={{ color: 'hsl(var(--primary))' }} />
              </span>
              <h3 className="text-lg font-outfit font-semibold text-foreground mb-2">No email senders</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {domains.length === 0
                  ? 'Register a domain first to create email senders'
                  : 'Create email sender addresses for your campaigns'
                }
              </p>
              {domains.length > 0 && (
                <Button onClick={() => setShowAddSender(true)} variant="outline" className="rounded-lg">
                  <Plus className="w-4 h-4 mr-2" /> Add Sender
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {senders.map((sender) => (
                <div key={sender.id} className="ke-card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="ke-medallion"
                        style={{ background: sender.is_verified
                          ? 'linear-gradient(150deg, hsl(152 58% 40% / 0.16), transparent 85%)'
                          : 'linear-gradient(150deg, hsl(var(--muted-foreground) / 0.14), transparent 85%)' }}
                      >
                        <Mail className={`w-5 h-5 ${sender.is_verified ? 'text-green-600' : 'text-muted-foreground'}`} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-outfit font-medium text-foreground">{sender.name}</h3>
                          {sender.is_default && (
                            <span className="text-xs bg-primary-subtle text-primary px-2 py-0.5 rounded">Default</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{sender.email}</p>
                        <p className="text-xs text-muted-foreground">Domain: {sender.domain}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditSender({
                          id: sender.id,
                          name: sender.name,
                          email: sender.email,
                          is_default: sender.is_default
                        })}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Edit sender name"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSender(sender.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Domain Modal */}
      {showAddDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-outfit font-bold text-foreground">Register DKIM Domain</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddDomain(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleAddDomain} className="p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">Domain Name</Label>
                  <Input
                    value={newDomain.domain}
                    onChange={(e) => setNewDomain({ ...newDomain, domain: e.target.value })}
                    placeholder="events.example.com"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    The domain will be registered with Brevo (configured on the server). After registration you'll get DNS records (DKIM, SPF, Brevo verification) to add in your DNS provider.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowAddDomain(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary-hover">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Register Domain
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Add Sender Modal */}
      {showAddSender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-outfit font-bold text-foreground">Add Email Sender</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddSender(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleAddSender} className="p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">Sender Name</Label>
                  <Input
                    value={newSender.name}
                    onChange={(e) => setNewSender({ ...newSender, name: e.target.value })}
                    placeholder="Kaizen Events"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Select Domain</Label>
                  <select
                    value={newSender.dkim_domain_id}
                    onChange={(e) => setNewSender({ ...newSender, dkim_domain_id: e.target.value, email: '' })}
                    className="w-full mt-1 h-10 rounded-lg border border-border bg-background text-foreground px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  >
                    <option value="">Select a domain...</option>
                    {domains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.domain} {domain.status === 'verified' ? '✓' : '(pending)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Email Address</Label>
                  <Input
                    type="email"
                    value={newSender.email}
                    onChange={(e) => setNewSender({ ...newSender, email: e.target.value })}
                    placeholder={newSender.dkim_domain_id ? `noreply@${domains.find(d => d.id === newSender.dkim_domain_id)?.domain || 'domain.com'}` : 'Select a domain first'}
                    className="mt-1"
                    disabled={!newSender.dkim_domain_id}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <Label className="text-sm font-medium text-foreground">Set as Default</Label>
                    <p className="text-xs text-muted-foreground">Use this sender by default</p>
                  </div>
                  <Switch
                    checked={newSender.is_default}
                    onCheckedChange={(checked) => setNewSender({ ...newSender, is_default: checked })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowAddSender(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary-hover">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Add Sender
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit Sender Modal */}
      {editSender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-outfit font-bold text-foreground">Edit Email Sender</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditSender(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleUpdateSender} className="p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">Sender Name</Label>
                  <Input
                    value={editSender.name}
                    onChange={(e) => setEditSender({ ...editSender, name: e.target.value })}
                    placeholder="Kaizen Events"
                    className="mt-1"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    This is the "From" name recipients see in their inbox next to {editSender.email}.
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Email Address</Label>
                  <Input value={editSender.email} className="mt-1" disabled />
                  <p className="text-xs text-muted-foreground mt-2">
                    The email address can't be changed — delete this sender and add a new one instead.
                  </p>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <Label className="text-sm font-medium text-foreground">Set as Default</Label>
                    <p className="text-xs text-muted-foreground">Use this sender by default</p>
                  </div>
                  <Switch
                    checked={editSender.is_default}
                    onCheckedChange={(checked) => setEditSender({ ...editSender, is_default: checked })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="outline" onClick={() => setEditSender(null)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary-hover">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DKIMRegistration;
