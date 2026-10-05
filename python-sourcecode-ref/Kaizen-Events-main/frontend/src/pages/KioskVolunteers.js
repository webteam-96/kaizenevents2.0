import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select';
import { 
  ArrowLeft, Plus, Users, Mail, Phone, Calendar,
  Edit, Trash2, Key, Copy, Check, Loader2,
  Building, Shield, XCircle, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

const KioskVolunteers = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  
  const [volunteers, setVolunteers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    campaign_ids: []
  });
  const [submitting, setSubmitting] = useState(false);
  
  // Password Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  
  // Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingVolunteer, setDeletingVolunteer] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [volunteersRes, campaignsRes] = await Promise.all([
        api.get('/kiosk-volunteers'),
        api.get('/campaigns')
      ]);
      setVolunteers(volunteersRes.data);
      setCampaigns(campaignsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingVolunteer(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      campaign_ids: []
    });
    setShowModal(true);
  };

  const openEditModal = (volunteer) => {
    setEditingVolunteer(volunteer);
    setFormData({
      name: volunteer.name,
      email: volunteer.email,
      phone: volunteer.phone || '',
      campaign_ids: volunteer.campaign_ids || []
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (formData.phone && formData.phone.replace(/\D/g, '').length < 7) {
      toast.error('Please enter a valid phone number');
      return;
    }
    
    setSubmitting(true);
    try {
      if (editingVolunteer) {
        // Update existing volunteer
        await api.put(`/kiosk-volunteers/${editingVolunteer.id}`, {
          name: formData.name,
          phone: formData.phone || null,
          campaign_ids: formData.campaign_ids
        });
        toast.success('Volunteer updated successfully');
      } else {
        // Create new volunteer
        const response = await api.post('/kiosk-volunteers', formData);
        setTempPassword(response.data.temporary_password);
        setShowPasswordModal(true);
        toast.success('Volunteer created successfully');
      }
      
      setShowModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingVolunteer) return;
    
    setDeleting(true);
    try {
      await api.delete(`/kiosk-volunteers/${deletingVolunteer.id}`);
      toast.success('Volunteer deleted successfully');
      setShowDeleteModal(false);
      setDeletingVolunteer(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to delete volunteer');
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async (volunteer) => {
    try {
      const response = await api.post(`/kiosk-volunteers/${volunteer.id}/reset-password`);
      setTempPassword(response.data.temporary_password);
      setShowPasswordModal(true);
      toast.success('Password reset successfully');
    } catch (error) {
      toast.error('Failed to reset password');
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
    toast.success('Password copied to clipboard');
  };

  const toggleCampaign = (campaignId) => {
    setFormData(prev => ({
      ...prev,
      campaign_ids: prev.campaign_ids.includes(campaignId)
        ? prev.campaign_ids.filter(id => id !== campaignId)
        : [...prev.campaign_ids, campaignId]
    }));
  };

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero skeleton */}
          <div className="ke-hero p-6 md:p-7 mb-5">
            <div className="ke-hero-grid" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2.5">
                <Skeleton className="h-3 w-28 bg-white/20" />
                <Skeleton className="h-8 w-56 bg-white/20" />
                <Skeleton className="h-4 w-80 bg-white/15" />
              </div>
              <Skeleton className="h-10 w-36 rounded-lg bg-white/20" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-2xl mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="ke-card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeCount = volunteers.filter((v) => v.is_active).length;
  const assignedEvents = volunteers.reduce(
    (sum, v) => sum + (v.campaign_ids?.length || 0),
    0
  );
  const statTiles = [
    { label: 'Total Volunteers', value: volunteers.length, icon: Users, hue: 'var(--chart-1)' },
    { label: 'Active', value: activeCount, icon: CheckCircle, hue: '152 58% 40%' },
    { label: 'Assigned Events', value: assignedEvents, icon: Building, hue: 'var(--accent)' },
  ];

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta text-white/70 hover:text-white transition-colors mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">
                  On-Site Access
                </div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">
                  Kiosk Volunteers
                </h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">
                  Manage volunteers who can access Kiosk Mode for on-site registrations.
                </p>
              </div>
              <Button
                onClick={openCreateModal}
                className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Volunteer
              </Button>
            </div>
          </div>
        </div>

        {/* Access info panel */}
        <div className="ke-card p-5 mb-5">
          <div className="flex items-start gap-3">
            <span
              className="ke-medallion flex-shrink-0"
              style={{ background: 'linear-gradient(150deg, hsl(var(--destructive) / 0.16), transparent 85%)' }}
            >
              <Shield className="w-5 h-5 text-destructive" />
            </span>
            <div>
              <p className="font-semibold text-foreground font-jakarta">Kiosk Volunteer Access</p>
              <p className="text-sm text-muted-foreground font-jakarta">
                Kiosk volunteers can only access the Kiosk Mode for assigned events.
                They cannot access the admin dashboard or modify event settings.
              </p>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        {volunteers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            {statTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div key={tile.label} className="ke-card relative overflow-hidden p-5">
                  <div
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: `linear-gradient(90deg, hsl(${tile.hue}), hsl(${tile.hue} / 0))` }}
                  />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] font-jakarta font-semibold text-muted-foreground">
                        {tile.label}
                      </p>
                      <p className="text-[28px] font-outfit font-bold text-foreground mt-1.5 tabular-nums leading-none">
                        {tile.value}
                      </p>
                    </div>
                    <span
                      className="ke-medallion"
                      style={{ background: `linear-gradient(150deg, hsl(${tile.hue} / 0.16), transparent 85%)` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: `hsl(${tile.hue})` }} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Section title */}
        <h3 className="ke-section-title text-[15px]">Volunteer Accounts</h3>
        <div className="ke-rule-gold mt-2 mb-4" />

        {/* Volunteers List */}
        {volunteers.length === 0 ? (
          <div className="ke-card p-12 text-center">
            <div className="max-w-md mx-auto">
              <span
                className="ke-medallion mx-auto mb-4"
                style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}
              >
                <Users className="w-6 h-6 text-primary" />
              </span>
              <h3 className="text-xl font-outfit font-semibold text-foreground mb-2">No Volunteers Yet</h3>
              <p className="text-muted-foreground font-jakarta mb-6">
                Create kiosk volunteer accounts for your on-site registration desk staff.
              </p>
              <Button
                onClick={openCreateModal}
                className="rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Volunteer
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {volunteers.map((volunteer) => (
              <Card
                key={volunteer.id}
                className={`ke-card p-5 ${
                  !volunteer.is_active ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary-subtle rounded-full flex items-center justify-center">
                      <span className="text-lg font-bold text-primary">
                        {volunteer.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                    <h3 className="font-semibold text-foreground font-jakarta">{volunteer.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-sm ${
                      volunteer.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                    }`}>
                      {volunteer.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(volunteer)}
                    className="text-muted-foreground hover:text-primary hover:bg-primary-subtle focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResetPassword(volunteer)}
                    className="text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 focus-visible:ring-2 focus-visible:ring-ring"
                    title="Reset Password"
                  >
                    <Key className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeletingVolunteer(volunteer);
                      setShowDeleteModal(true);
                    }}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{volunteer.email}</span>
                </div>
                {volunteer.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{volunteer.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>Created {volunteer.created_at ? formatServerDate(volunteer.created_at, 'MMM dd, yyyy') : 'N/A'}</span>
                </div>
              </div>
              
              {/* Assigned Campaigns */}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground font-jakarta mb-2 flex items-center gap-1">
                  <Building className="w-3 h-3" />
                  Assigned Events ({volunteer.campaign_names?.length || 0})
                </p>
                {volunteer.campaign_names?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {volunteer.campaign_names.slice(0, 3).map((name, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-muted text-foreground rounded-full"
                      >
                        {name}
                      </span>
                    ))}
                    {volunteer.campaign_names.length > 3 && (
                      <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full">
                        +{volunteer.campaign_names.length - 3} more
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No events assigned</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-outfit">
              {editingVolunteer ? 'Edit Volunteer' : 'Add New Volunteer'}
            </DialogTitle>
            <DialogDescription>
              {editingVolunteer
                ? 'Update volunteer details and event assignments.'
                : 'Create a new kiosk volunteer account. A temporary password will be generated.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-foreground font-jakarta">Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter volunteer name"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label className="text-foreground font-jakarta">Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="volunteer@example.com"
                disabled={!!editingVolunteer}
                className="mt-1"
              />
              {editingVolunteer && (
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              )}
            </div>
            
            <div>
              <Label className="text-foreground font-jakarta">Phone</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="Enter phone number"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label className="text-foreground font-jakarta mb-2 block">
                Assign to Campaigns
              </Label>
              <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                {campaigns.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No campaigns available</p>
                ) : (
                  campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      onClick={() => toggleCampaign(campaign.id)}
                      className={`flex items-center justify-between p-3 cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted ${
                        formData.campaign_ids.includes(campaign.id) ? 'bg-primary-subtle' : ''
                      }`}
                    >
                      <div>
                        <p className="font-medium text-foreground text-sm">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">{campaign.organization_name}</p>
                      </div>
                      {formData.campaign_ids.includes(campaign.id) ? (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-border rounded-full" />
                      )}
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Selected: {formData.campaign_ids.length} campaign(s)
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-primary hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingVolunteer ? (
                'Save Changes'
              ) : (
                'Create Volunteer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-outfit">Temporary Password</DialogTitle>
            <DialogDescription>
              Share this password securely with the volunteer. They will need it to log in.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="bg-muted rounded-xl p-4 flex items-center justify-between">
              <span className="font-mono text-xl font-bold text-foreground">{tempPassword}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyPassword}
                className="text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                {passwordCopied ? (
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-3 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
              This password will only be shown once. Make sure to copy it now.
            </p>
          </div>
          
          <DialogFooter>
            <Button
              onClick={() => setShowPasswordModal(false)}
              className="bg-primary hover:bg-primary-hover w-full focus-visible:ring-2 focus-visible:ring-ring"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-outfit text-destructive">Delete Volunteer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this volunteer account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {deletingVolunteer && (
            <div className="py-4">
              <div className="bg-destructive/10 rounded-xl p-4">
                <p className="font-semibold text-foreground">{deletingVolunteer.name}</p>
                <p className="text-sm text-muted-foreground">{deletingVolunteer.email}</p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Delete Volunteer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default KioskVolunteers;
