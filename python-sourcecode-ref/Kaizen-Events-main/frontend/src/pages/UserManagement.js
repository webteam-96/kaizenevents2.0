import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Users, Plus, Edit, Trash2, Shield, ShieldCheck, X,
  Loader2, Search, UserPlus, Eye, EyeOff, FolderKanban, Lock
} from 'lucide-react';
import { toast } from 'sonner';

const UserManagement = () => {
  const { user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Check if current user is a Director (has can_approve_transfers)
  const isDirector = user?.can_approve_transfers === true;

  // Guard: is the row currently being edited the signed-in user's own account?
  // Used to prevent self-demotion (stripping your own role / privileges).
  const isEditingSelf = !!editingUser && user?.id === editingUser.id;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'org_admin',
    campaign_access: [],
    can_approve_transfers: false
  });

  useEffect(() => {
    // Allow access if user is Super Admin OR Director
    if (!isSuperAdmin() && !isDirector) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [isSuperAdmin, isDirector, navigate]);

  const fetchData = async () => {
    try {
      const [usersRes, campaignsRes] = await Promise.all([
        api.get('/users'),
        api.get('/campaigns')
      ]);
      setUsers(usersRes.data);
      setCampaigns(campaignsRes.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'org_admin',
      campaign_access: [],
      can_approve_transfers: false
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email,
      password: '',
      role: user.role,
      campaign_access: user.campaign_access || [],
      can_approve_transfers: user.can_approve_transfers || false
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Safety net: block self-demotion. A Super Admin / Director editing their OWN
    // account must not be able to strip their own role or privileges here.
    if (editingUser && user?.id === editingUser.id) {
      const roleChanged = formData.role !== editingUser.role;
      const lostDirector = editingUser.can_approve_transfers && !formData.can_approve_transfers;
      if (roleChanged || lostDirector) {
        toast.error("You can't change your own role or remove your own access");
        return;
      }
    }

    // Validate: Org admins must have at least one campaign
    if (formData.role === 'org_admin' && formData.campaign_access.length === 0) {
      toast.error('Organisation admins must have at least one event assigned');
      return;
    }

    // Validate: Super Admins cannot create Directors
    if (!isDirector && formData.can_approve_transfers) {
      toast.error('Only Directors can create other Directors');
      return;
    }

    setSaving(true);

    try {
      if (editingUser) {
        // Update existing user
        const updateData = {
          name: formData.name,
          role: formData.role,
          campaign_access: formData.campaign_access,
          can_approve_transfers: formData.can_approve_transfers
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await api.put(`/users/${editingUser.id}`, updateData);
        toast.success('User updated successfully!');
      } else {
        // Create new user
        await api.post('/auth/register', {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          campaign_access: formData.campaign_access,
          can_approve_transfers: formData.can_approve_transfers
        });
        toast.success('User created successfully!');
      }

      setShowModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    setDeleting(userId);
    try {
      await api.delete(`/users/${userId}`);
      toast.success('User deleted successfully!');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
  };

  const toggleCampaignAccess = (campaignId) => {
    setFormData(prev => ({
      ...prev,
      campaign_access: prev.campaign_access.includes(campaignId)
        ? prev.campaign_access.filter(id => id !== campaignId)
        : [...prev.campaign_access, campaignId]
    }));
  };

  const getCampaignName = (campaignId) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    return campaign?.name || 'Unknown Event';
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground font-jakarta">Loading users...</p>
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
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Administration</div>
            <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">User Management</h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">Manage organisation admins and their event access.</p>
          </div>
          <Button
            onClick={openAddModal}
            className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105 shrink-0"
            style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add User
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="ke-card p-4 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search users by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
      </Card>

      {/* Users List */}
      <Card className="ke-card overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="ke-section-title text-[15px]">
            All Users <span className="text-muted-foreground font-normal">({filteredUsers.length})</span>
          </h3>
          <div className="ke-rule-gold mt-2" />
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center py-16 px-6">
            <span
              className="ke-medallion mx-auto mb-4"
              style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.16), transparent 85%)' }}
            >
              <Users className="w-6 h-6 text-primary" />
            </span>
            <p className="text-foreground font-jakarta font-medium">No users found</p>
            <p className="text-sm text-muted-foreground font-jakarta mt-1">
              {searchTerm ? 'Try a different search term.' : 'Add a user to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted">
                  <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">User</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">Role</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">Event Access</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((listUser) => {
                  const isSelfRow = user?.id === listUser.id;
                  return (
                  <tr key={listUser.id} className="border-t border-border hover:bg-muted/50 transition-colors align-top">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className="ke-medallion shrink-0"
                          style={{
                            width: '2.5rem',
                            height: '2.5rem',
                            background: listUser.can_approve_transfers
                              ? 'linear-gradient(150deg, hsl(var(--accent) / 0.22), transparent 85%)'
                              : listUser.role === 'super_admin'
                                ? 'linear-gradient(150deg, hsl(var(--primary) / 0.18), transparent 85%)'
                                : 'linear-gradient(150deg, hsl(var(--secondary) / 0.16), transparent 85%)'
                          }}
                        >
                          {listUser.can_approve_transfers ? (
                            <ShieldCheck className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                          ) : listUser.role === 'super_admin' ? (
                            <ShieldCheck className="w-5 h-5 text-primary" />
                          ) : (
                            <Shield className="w-5 h-5 text-secondary" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-jakarta font-medium text-foreground">
                              {listUser.name || 'Unnamed User'}
                            </p>
                            {isSelfRow && (
                              <span className="px-2 py-0.5 rounded-sm text-xs font-medium bg-muted text-muted-foreground">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">{listUser.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded-sm text-xs font-medium ${
                        listUser.can_approve_transfers
                          ? 'bg-amber-100 text-amber-700'
                          : listUser.role === 'super_admin'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary/10 text-secondary'
                      }`}>
                        {listUser.can_approve_transfers
                          ? 'Director'
                          : listUser.role === 'super_admin'
                            ? 'Super Admin'
                            : 'Org Admin'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {/* Campaign Access Tags */}
                      {listUser.role === 'org_admin' && !listUser.can_approve_transfers ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <FolderKanban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {listUser.campaign_access && listUser.campaign_access.length > 0 ? (
                            listUser.campaign_access.map(campaignId => (
                              <span
                                key={campaignId}
                                className="px-2 py-0.5 bg-muted rounded text-xs text-muted-foreground"
                              >
                                {getCampaignName(campaignId)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No events assigned</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(listUser)}
                          className="hover:bg-muted text-muted-foreground hover:text-foreground h-8 w-8 p-0 transition-colors"
                          title="Edit User"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {listUser.role !== 'super_admin' && !listUser.can_approve_transfers && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(listUser.id)}
                            disabled={deleting === listUser.id}
                            className="hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 h-8 w-8 p-0 transition-colors"
                            title="Delete User"
                          >
                            {deleting === listUser.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="ke-card text-foreground w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="ke-medallion shrink-0"
                  style={{ width: '2.5rem', height: '2.5rem', background: 'linear-gradient(150deg, hsl(var(--accent) / 0.2), transparent 85%)' }}
                >
                  <UserPlus className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                </span>
                <h2 className="text-lg font-outfit font-bold text-foreground truncate">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-foreground mb-1.5 block">Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Enter user name"
                    required
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-foreground mb-1.5 block">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="Enter email address"
                    required
                    disabled={!!editingUser}
                    className={editingUser ? 'bg-muted text-muted-foreground' : ''}
                  />
                  {editingUser && (
                    <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium text-foreground mb-1.5 block">
                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      placeholder={editingUser ? 'Enter new password (optional)' : 'Enter password'}
                      required={!editingUser}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-foreground mb-1.5 block">Role</Label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value, can_approve_transfers: false})}
                    disabled={isEditingSelf}
                    title={isEditingSelf ? "You can't change your own role" : undefined}
                    className="w-full h-10 rounded-lg border border-border bg-background text-foreground px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="org_admin">Organisation Admin (Read-Only)</option>
                    <option value="super_admin">Super Admin (Full Access)</option>
                  </select>
                  {isEditingSelf ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3 shrink-0" />
                      You can&apos;t change your own role
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.role === 'org_admin'
                        ? 'Can view assigned events and registrations but cannot edit'
                        : 'Full access to create, edit, and delete all data'
                      }
                    </p>
                  )}
                </div>

                {/* Director Access - Only visible to Directors */}
                {isDirector && formData.role === 'super_admin' && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
                    <label className={`flex items-start gap-3 ${isEditingSelf ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={formData.can_approve_transfers}
                        onChange={(e) => setFormData({...formData, can_approve_transfers: e.target.checked})}
                        disabled={isEditingSelf}
                        className="h-4 w-4 mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Grant Director Access</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-0.5">
                          Directors can approve fund transfers, view Kaizen&apos;s share, and manage all user roles including other Directors.
                        </p>
                        {isEditingSelf && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                            <Lock className="w-3 h-3 shrink-0" />
                            You can&apos;t remove your own Director access
                          </p>
                        )}
                      </div>
                    </label>
                  </div>
                )}

                {formData.role === 'org_admin' && (
                  <div>
                    <Label className="text-sm font-medium text-foreground mb-2 block">
                      Event Access
                    </Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Select which events this user can view
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                      {campaigns.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">No events available</p>
                      ) : (
                        campaigns.map(campaign => (
                          <label
                            key={campaign.id}
                            className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={formData.campaign_access.includes(campaign.id)}
                              onChange={() => toggleCampaignAccess(campaign.id)}
                              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-foreground">{campaign.name}</span>
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                campaign.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                              }`}>
                                {campaign.status}
                              </span>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formData.campaign_access.length} event(s) selected
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary hover:bg-primary-hover text-primary-foreground transition-colors"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingUser ? 'Update User' : 'Create User'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
