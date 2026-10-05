import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  ArrowLeft, Upload, Plus, Search, Filter, Users, UserCheck, UserX,
  Mail, MessageSquare, Trash2, Edit, MoreVertical, Download, RefreshCw,
  CheckCircle, XCircle, Loader2, AlertTriangle, FileSpreadsheet, X,
  ChevronLeft, ChevronRight, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { formatServerDate } from '../utils/serverTime';

const CampaignMembers = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  
  // Campaign state
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Members state
  const [members, setMembers] = useState([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [unregisteredCount, setUnregisteredCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  
  // Selection state
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  // Modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  
  // Upload state
  const [uploadStep, setUploadStep] = useState(1); // 1: select file, 2: map columns, 3: results
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [columnMapping, setColumnMapping] = useState({
    name_column: '',
    mobile_column: '',
    email_column: '',
    custom_columns: {}
  });
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Reminder state
  const [sendingReminders, setSendingReminders] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderChannels, setReminderChannels] = useState({ email: true, whatsapp: true });
  const [reminderTargetCount, setReminderTargetCount] = useState(0);

  // Fetch campaign details
  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  // Fetch members when filters change
  useEffect(() => {
    if (campaign) {
      fetchMembers();
    }
  }, [campaign, page, statusFilter, searchQuery]);

  const fetchCampaign = async () => {
    try {
      const response = await api.get(`/campaigns/${campaignId}`);
      setCampaign(response.data);
      
      if (response.data.campaign_type !== 'closed_group') {
        toast.error('This is not a closed group event');
        navigate(`/campaigns/${campaignId}`);
      }
    } catch (error) {
      toast.error('Failed to load event');
      navigate('/campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: '50'
      });
      
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      const response = await api.get(`/campaigns/${campaignId}/members?${params}`);
      setMembers(response.data.members);
      setTotalMembers(response.data.total);
      setTotalPages(response.data.total_pages);
      setRegisteredCount(response.data.registered_count);
      setUnregisteredCount(response.data.unregistered_count);
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  // File upload handlers
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const isValid = validTypes.some(type => file.name.toLowerCase().endsWith(type));
    
    if (!isValid) {
      toast.error('Please upload a CSV or Excel file');
      return;
    }
    
    setUploadFile(file);
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post(
        `/campaigns/${campaignId}/members/upload/preview`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setUploadPreview(response.data);
      
      // Auto-detect column mapping
      const columns = response.data.columns;
      const autoMapping = {
        name_column: columns.find(c => /name/i.test(c)) || '',
        mobile_column: columns.find(c => /mobile|phone|contact/i.test(c)) || '',
        email_column: columns.find(c => /email/i.test(c)) || '',
        custom_columns: {}
      };
      
      // Add remaining columns as custom
      columns.forEach(col => {
        if (col !== autoMapping.name_column && 
            col !== autoMapping.mobile_column && 
            col !== autoMapping.email_column) {
          // Use column name as field name (cleaned)
          const fieldName = col.toLowerCase().replace(/[^a-z0-9]/g, '_');
          autoMapping.custom_columns[fieldName] = col;
        }
      });
      
      setColumnMapping(autoMapping);
      setUploadStep(2);
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!columnMapping.name_column || !columnMapping.mobile_column) {
      toast.error('Name and Mobile columns are required');
      return;
    }
    
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      
      const params = new URLSearchParams({
        name_column: columnMapping.name_column,
        mobile_column: columnMapping.mobile_column
      });
      
      if (columnMapping.email_column) {
        params.append('email_column', columnMapping.email_column);
      }
      
      if (Object.keys(columnMapping.custom_columns).length > 0) {
        params.append('custom_columns', JSON.stringify(columnMapping.custom_columns));
      }
      
      const response = await api.post(
        `/campaigns/${campaignId}/members/upload?${params}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setUploadResult(response.data);
      setUploadStep(3);
      
      if (response.data.added > 0) {
        toast.success(`Added ${response.data.added} members`);
        fetchMembers();
      }
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setUploadStep(1);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadResult(null);
    setColumnMapping({
      name_column: '',
      mobile_column: '',
      email_column: '',
      custom_columns: {}
    });
  };

  const downloadTemplate = () => {
    // Create CSV content with sample data
    const csvContent = `name,mobile,email,company,designation
John Doe,+919876543210,john@example.com,ABC Corp,Manager
Jane Smith,+919876543211,jane@example.com,XYZ Ltd,Developer
Mike Johnson,+919876543212,mike@example.com,Tech Inc,Designer`;
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'member_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadErrorReport = (errors) => {
    if (!errors || errors.length === 0) return;
    
    // Create CSV content for error report
    const header = 'Row Number,Error Message,Data\n';
    const rows = errors.map(err => 
      `${err.row},"${err.error.replace(/"/g, '""')}","${err.data ? JSON.stringify(err.data).replace(/"/g, '""') : ''}"`
    ).join('\n');
    
    const csvContent = header + rows;
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `upload_errors_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Member CRUD handlers
  const handleAddMember = async (memberData) => {
    try {
      await api.post(`/campaigns/${campaignId}/members`, memberData);
      toast.success('Member added successfully');
      setShowAddMemberModal(false);
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add member');
    }
  };

  const handleUpdateMember = async (memberId, memberData) => {
    try {
      await api.put(`/campaigns/${campaignId}/members/${memberId}`, memberData);
      toast.success('Member updated successfully');
      setShowEditMemberModal(false);
      setEditingMember(null);
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update member');
    }
  };

  const handleDeleteMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to delete this member?')) return;
    
    try {
      await api.delete(`/campaigns/${campaignId}/members/${memberId}`);
      toast.success('Member deleted');
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete member');
    }
  };

  // Reminder handlers
  const handleSendReminders = async (memberIds = [], channels = ['email', 'whatsapp']) => {
    setSendingReminders(true);
    
    try {
      const response = await api.post(`/campaigns/${campaignId}/members/reminders`, {
        member_ids: memberIds,
        channels
      });
      
      const { email_sent, whatsapp_sent, total } = response.data;
      toast.success(`Sent reminders to ${total} members (Email: ${email_sent}, WhatsApp: ${whatsapp_sent})`);
      setSelectedMembers([]);
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send reminders');
    } finally {
      setSendingReminders(false);
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(members.filter(m => m.status === 'unregistered').map(m => m.id));
    }
    setSelectAll(!selectAll);
  };

  const toggleSelectMember = (memberId) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
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
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate(`/campaigns/${campaignId}`)}
              className="inline-flex items-center gap-1.5 text-[13px] font-jakarta text-white/70 hover:text-white transition-colors mb-3 focus-visible:outline-none"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Event
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">
                  Closed Group
                </div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Members</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">
                  {campaign?.name}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowAddMemberModal(true)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg h-10 font-jakarta"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
                <Button
                  onClick={() => setShowUploadModal(true)}
                  className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                  style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Members
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div
            className={`ke-card ke-card-hover relative p-5 overflow-hidden cursor-pointer ${statusFilter === null ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter(null)}
          >
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), transparent)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Total Members</div>
                <div className="text-[28px] leading-none font-outfit font-bold text-foreground mt-2.5 tabular-nums truncate">{totalMembers}</div>
              </div>
              <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.14), transparent 85%)' }}>
                <Users className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
              </span>
            </div>
          </div>

          <div
            className={`ke-card ke-card-hover relative p-5 overflow-hidden cursor-pointer ${statusFilter === 'registered' ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'registered' ? null : 'registered')}
          >
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(152 58% 40%), transparent)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Registered</div>
                <div className="text-[28px] leading-none font-outfit font-bold text-green-600 dark:text-green-400 mt-2.5 tabular-nums truncate">{registeredCount}</div>
              </div>
              <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.16), transparent 85%)' }}>
                <UserCheck className="w-5 h-5" style={{ color: 'hsl(152 58% 40%)' }} />
              </span>
            </div>
          </div>

          <div
            className={`ke-card ke-card-hover relative p-5 overflow-hidden cursor-pointer ${statusFilter === 'unregistered' ? 'ring-2 ring-amber-500' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'unregistered' ? null : 'unregistered')}
          >
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(38 92% 48%), transparent)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-jakarta font-semibold">Unregistered</div>
                <div className="text-[28px] leading-none font-outfit font-bold text-amber-600 dark:text-amber-400 mt-2.5 tabular-nums truncate">{unregisteredCount}</div>
              </div>
              <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(38 92% 48% / 0.16), transparent 85%)' }}>
                <UserX className="w-5 h-5" style={{ color: 'hsl(38 92% 48%)' }} />
              </span>
            </div>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="ke-card p-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name, mobile, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {selectedMembers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {selectedMembers.length} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendReminders(selectedMembers, ['email'])}
                  disabled={sendingReminders}
                  title="Send email only"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendReminders(selectedMembers, ['whatsapp'])}
                  disabled={sendingReminders}
                  title="Send WhatsApp only"
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  WhatsApp
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowReminderModal(true)}
                  disabled={sendingReminders}
                  className="bg-primary hover:bg-primary-hover"
                  title="Choose channels"
                >
                  {sendingReminders ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Send Reminders
                </Button>
              </div>
            )}
            
            {statusFilter === 'unregistered' && selectedMembers.length === 0 && (
              <Button
                variant="outline"
                onClick={() => setShowReminderModal(true)}
                disabled={sendingReminders || unregisteredCount === 0}
              >
                <Mail className="w-4 h-4 mr-2" />
                Remind All ({unregisteredCount})
              </Button>
            )}
          </div>
        </div>

        {/* Members Table */}
        <div className="ke-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={toggleSelectAll}
                      className="rounded border-input"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mobile</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Reminder</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingMembers ? (
                  [...Array(6)].map((_, idx) => (
                    <tr key={`skeleton-${idx}`}>
                      <td className="px-4 py-3">
                        <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-6 w-24 rounded-full bg-muted animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-6 w-28 rounded bg-muted animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 rounded-full bg-muted">
                          <Users className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">No members found</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Upload a member list to get started.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(member.id)}
                          onChange={() => toggleSelectMember(member.id)}
                          disabled={member.status === 'registered'}
                          className="rounded border-input disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{member.name}</div>
                        {member.custom_fields && Object.keys(member.custom_fields).length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {Object.entries(member.custom_fields).map(([key, value]) => (
                              <span key={key} className="mr-2">{key}: {value}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{member.mobile}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{member.email || '-'}</td>
                      <td className="px-4 py-3">
                        {member.status === 'registered' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Registered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium bg-amber-100 text-amber-700">
                            <XCircle className="w-3 h-3" />
                            Unregistered
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {member.last_reminder_at ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{formatServerDate(member.last_reminder_at, 'dd MMM yyyy')}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/70">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {member.status === 'unregistered' && (
                            <>
                              {/* Individual Reminder Buttons */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSendReminders([member.id], ['email'])}
                                disabled={sendingReminders || !member.email}
                                title={member.email ? `Send email reminder to ${member.email}` : 'No email address'}
                                className="text-primary hover:text-primary hover:bg-primary-subtle"
                              >
                                <Mail className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSendReminders([member.id], ['whatsapp'])}
                                disabled={sendingReminders}
                                title={`Send WhatsApp reminder to ${member.mobile}`}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <div className="w-px h-4 bg-border mx-1" />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingMember(member);
                                  setShowEditMemberModal(true);
                                }}
                                title="Edit member"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteMember(member.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Delete member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {member.status === 'registered' && (
                            <span className="text-xs text-muted-foreground">Registered</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="ke-card w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-outfit font-bold tracking-tight text-foreground">Upload Members</h2>
                <Button variant="ghost" size="sm" onClick={() => { setShowUploadModal(false); resetUpload(); }}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Step 1: File Selection */}
              {uploadStep === 1 && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/40">
                    <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Upload a CSV or Excel file with your member list
                    </p>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload">
                      <Button asChild disabled={uploading}>
                        {uploading ? (
                          <span><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</span>
                        ) : (
                          <span><Upload className="w-4 h-4 mr-2" />Select File</span>
                        )}
                      </Button>
                    </label>
                  </div>
                  
                  {/* Download Template Section */}
                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Need a template? Download our sample CSV file with the required columns.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadTemplate}
                      className="w-full sm:w-auto"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download CSV Template
                    </Button>
                  </div>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    Supported formats: CSV, XLSX, XLS. Max 10,000 rows.
                  </p>
                </div>
              )}

              {/* Step 2: Column Mapping */}
              {uploadStep === 2 && uploadPreview && (
                <div className="space-y-6">
                  <div className="bg-primary-subtle border border-border rounded-lg p-4">
                    <p className="text-sm text-primary">
                      Found <strong>{uploadPreview.total_rows}</strong> rows in your file. Map the columns below to import your members.
                    </p>
                  </div>

                  {/* Required Fields */}
                  <div>
                    <h3 className="ke-section-title text-[15px]">Required Fields</h3>
                    <div className="ke-rule-gold mt-2 mb-3" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium flex items-center gap-1">
                          Name Column <span className="text-destructive">*</span>
                        </Label>
                        <select
                          value={columnMapping.name_column}
                          onChange={(e) => setColumnMapping(prev => ({ ...prev, name_column: e.target.value }))}
                          className="w-full mt-1 rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          <option value="">Select column</option>
                          {uploadPreview.columns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">Full name of the member</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium flex items-center gap-1">
                          Mobile Column <span className="text-destructive">*</span>
                        </Label>
                        <select
                          value={columnMapping.mobile_column}
                          onChange={(e) => setColumnMapping(prev => ({ ...prev, mobile_column: e.target.value }))}
                          className="w-full mt-1 rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          <option value="">Select column</option>
                          {uploadPreview.columns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">Mobile number (with country code)</p>
                      </div>
                    </div>
                  </div>

                  {/* Optional Fields */}
                  <div>
                    <h3 className="ke-section-title text-[15px]">Optional Fields</h3>
                    <div className="ke-rule-gold mt-2 mb-3" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Email Column</Label>
                        <select
                          value={columnMapping.email_column}
                          onChange={(e) => setColumnMapping(prev => ({ ...prev, email_column: e.target.value }))}
                          className="w-full mt-1 rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          <option value="">None (skip)</option>
                          {uploadPreview.columns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">Email address for notifications</p>
                      </div>
                    </div>
                  </div>

                  {/* Custom Fields Mapping */}
                  {uploadPreview.columns.filter(col => 
                    col !== columnMapping.name_column && 
                    col !== columnMapping.mobile_column && 
                    col !== columnMapping.email_column
                  ).length > 0 && (
                    <div>
                      <h3 className="ke-section-title text-[15px]">
                        Additional Fields
                        <span className="text-xs font-normal text-muted-foreground ml-2">
                          (These will be stored as custom data)
                        </span>
                      </h3>
                      <div className="ke-rule-gold mt-2 mb-3" />
                      <div className="bg-muted rounded-lg p-4 space-y-2">
                        {uploadPreview.columns
                          .filter(col => 
                            col !== columnMapping.name_column && 
                            col !== columnMapping.mobile_column && 
                            col !== columnMapping.email_column
                          )
                          .map(col => (
                            <label key={col} className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={columnMapping.custom_columns[col] === col}
                                onChange={(e) => {
                                  setColumnMapping(prev => ({
                                    ...prev,
                                    custom_columns: e.target.checked 
                                      ? { ...prev.custom_columns, [col]: col }
                                      : Object.fromEntries(
                                          Object.entries(prev.custom_columns).filter(([k]) => k !== col)
                                        )
                                  }));
                                }}
                                className="rounded border-input text-primary focus:ring-primary"
                              />
                              <span className="text-sm text-foreground">{col}</span>
                            </label>
                          ))
                        }
                        <p className="text-xs text-muted-foreground mt-2">
                          Selected columns will be imported as additional member data.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Preview Table */}
                  <div>
                    <h3 className="ke-section-title text-[15px]">Preview (first 5 rows)</h3>
                    <div className="ke-rule-gold mt-2 mb-3" />
                    <div className="border border-border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            {uploadPreview.columns.map(col => (
                              <th key={col} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                                col === columnMapping.name_column ? 'text-accent bg-accent-subtle' :
                                col === columnMapping.mobile_column ? 'text-green-700 bg-green-50' :
                                col === columnMapping.email_column ? 'text-primary bg-primary-subtle' :
                                columnMapping.custom_columns[col] ? 'text-amber-700 bg-amber-50' :
                                'text-foreground'
                              }`}>
                                {col}
                                {col === columnMapping.name_column && <span className="ml-1 text-xs">(Name)</span>}
                                {col === columnMapping.mobile_column && <span className="ml-1 text-xs">(Mobile)</span>}
                                {col === columnMapping.email_column && <span className="ml-1 text-xs">(Email)</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {uploadPreview.sample_rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-muted/50 transition-colors">
                              {uploadPreview.columns.map(col => (
                                <td key={col} className={`px-3 py-2 whitespace-nowrap ${
                                  col === columnMapping.name_column ? 'text-accent font-medium' :
                                  col === columnMapping.mobile_column ? 'text-green-700' :
                                  col === columnMapping.email_column ? 'text-primary' :
                                  'text-muted-foreground'
                                }`}>
                                  {row[col] || <span className="text-muted-foreground/40">-</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={resetUpload}>
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                    <Button 
                      onClick={handleUpload} 
                      disabled={uploading || !columnMapping.name_column || !columnMapping.mobile_column}
                      className="bg-primary hover:bg-primary-hover"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload {uploadPreview.total_rows} Members
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Results */}
              {uploadStep === 3 && uploadResult && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    {uploadResult.added > 0 ? (
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    ) : (
                      <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                    )}
                    <h3 className="text-xl font-semibold mb-2">Upload Complete</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600 tabular-nums">{uploadResult.added}</p>
                      <p className="text-sm text-green-700">Added</p>
                    </div>
                    <div className="bg-muted rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-foreground tabular-nums">{uploadResult.skipped}</p>
                      <p className="text-sm text-muted-foreground">Skipped (Existing)</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-red-600 tabular-nums">{uploadResult.errors}</p>
                      <p className="text-sm text-red-700">Errors</p>
                    </div>
                  </div>

                  {uploadResult.error_details && uploadResult.error_details.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium text-red-700">Error Details</Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => downloadErrorReport(uploadResult.error_details)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download Report
                        </Button>
                      </div>
                      <div className="border border-red-200 rounded-lg max-h-48 overflow-y-auto">
                        {uploadResult.error_details.map((err, idx) => (
                          <div key={idx} className="px-3 py-2 border-b border-red-100 text-sm">
                            <span className="font-medium text-red-600">Row {err.row}:</span>{' '}
                            <span className="text-red-700">{err.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={resetUpload}>
                      Upload More
                    </Button>
                    <Button onClick={() => { setShowUploadModal(false); resetUpload(); }} className="bg-primary hover:bg-primary-hover">
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <MemberFormModal
          title="Add Member"
          onClose={() => setShowAddMemberModal(false)}
          onSubmit={handleAddMember}
        />
      )}

      {/* Edit Member Modal */}
      {showEditMemberModal && editingMember && (
        <MemberFormModal
          title="Edit Member"
          member={editingMember}
          onClose={() => { setShowEditMemberModal(false); setEditingMember(null); }}
          onSubmit={(data) => handleUpdateMember(editingMember.id, data)}
        />
      )}

      {/* Bulk Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="ke-card w-full max-w-md m-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-outfit font-bold tracking-tight text-foreground">Send Reminders</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowReminderModal(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-6">
                <div className="bg-primary-subtle border border-border rounded-lg p-4">
                  <p className="text-sm text-primary">
                    <strong>{selectedMembers.length > 0 ? selectedMembers.length : unregisteredCount}</strong> unregistered member{(selectedMembers.length > 0 ? selectedMembers.length : unregisteredCount) !== 1 ? 's' : ''} will receive reminders.
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-3 block">Select Channels</Label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer transition-colors hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={reminderChannels.email}
                        onChange={(e) => setReminderChannels(prev => ({ ...prev, email: e.target.checked }))}
                        className="rounded border-input"
                      />
                      <Mail className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Email</p>
                        <p className="text-xs text-muted-foreground">Send via Brevo (configured)</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer transition-colors hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={reminderChannels.whatsapp}
                        onChange={(e) => setReminderChannels(prev => ({ ...prev, whatsapp: e.target.checked }))}
                        className="rounded border-input"
                      />
                      <MessageSquare className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-foreground">WhatsApp</p>
                        <p className="text-xs text-muted-foreground">Send via Interakt (requires template)</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700">
                    <strong>Note:</strong> WhatsApp requires the &quot;payment_reminder&quot; template to be approved in your Interakt dashboard.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowReminderModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      const channels = [];
                      if (reminderChannels.email) channels.push('email');
                      if (reminderChannels.whatsapp) channels.push('whatsapp');
                      
                      if (channels.length === 0) {
                        toast.error('Please select at least one channel');
                        return;
                      }
                      
                      await handleSendReminders(selectedMembers, channels);
                      setShowReminderModal(false);
                    }}
                    disabled={sendingReminders || (!reminderChannels.email && !reminderChannels.whatsapp)}
                    className="bg-primary hover:bg-primary-hover"
                  >
                    {sendingReminders ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                    ) : (
                      <>Send Reminders</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Member Form Modal Component
const MemberFormModal = ({ title, member, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: member?.name || '',
    mobile: member?.mobile || '',
    email: member?.email || '',
    custom_fields: member?.custom_fields || {}
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.mobile) {
      toast.error('Name and mobile are required');
      return;
    }
    if (!formData.mobile || formData.mobile.replace(/\D/g, '').length < 7) {
      toast.error('Please enter a valid mobile number');
      return;
    }
    setLoading(true);
    await onSubmit(formData);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="ke-card w-full max-w-md m-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-outfit font-bold tracking-tight text-foreground">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter name"
                required
              />
            </div>
            
            <div>
              <Label>Mobile *</Label>
              <Input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData(prev => ({ ...prev, mobile: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder="Enter mobile number"
                required
              />
            </div>
            
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter email (optional)"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary-hover">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {member ? 'Update' : 'Add'} Member
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CampaignMembers;
