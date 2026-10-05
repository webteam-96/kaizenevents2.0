import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  Activity, Search, Filter, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  User, Calendar, Clock, FileText, DollarSign, Settings, Shield, Eye,
  AlertTriangle, CheckCircle, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { parseISO, formatDistanceToNow } from 'date-fns';

// Event type to human-readable label mapping
const EVENT_TYPE_LABELS = {
  // Authentication
  LOGIN_SUCCESS:   { label: 'Login',              icon: User,          color: 'text-green-600 bg-green-100' },
  LOGIN_FAILED:    { label: 'Failed Login',       icon: AlertTriangle, color: 'text-red-600 bg-red-100' },
  LOGOUT:          { label: 'Logout',             icon: User,          color: 'text-muted-foreground bg-muted' },
  TOKEN_REFRESH:   { label: 'Token Refresh',      icon: Shield,        color: 'text-primary bg-primary-subtle' },
  PASSWORD_CHANGED:{ label: 'Password Changed',   icon: Shield,        color: 'text-amber-600 bg-amber-100' },
  PASSWORD_RESET:  { label: 'Password Reset',     icon: Shield,        color: 'text-amber-600 bg-amber-100' },

  // User Management
  USER_CREATED:       { label: 'User Created',       icon: User,     color: 'text-primary bg-primary-subtle' },
  USER_UPDATED:       { label: 'User Updated',       icon: Settings, color: 'text-amber-600 bg-amber-100' },
  USER_DELETED:       { label: 'User Deleted',       icon: XCircle,  color: 'text-red-600 bg-red-100' },
  USER_ACCESS_CHANGED:{ label: 'User Access Changed', icon: Shield,  color: 'text-primary bg-primary-subtle' },

  // Campaign Management
  CAMPAIGN_CREATED:    { label: 'Event Created',    icon: FileText, color: 'text-primary bg-primary-subtle' },
  CAMPAIGN_UPDATED:    { label: 'Event Updated',    icon: FileText, color: 'text-primary bg-primary-subtle' },
  CAMPAIGN_DELETED:    { label: 'Event Deleted',    icon: XCircle,  color: 'text-red-600 bg-red-100' },
  CAMPAIGN_ARCHIVED:   { label: 'Event Archived',   icon: FileText, color: 'text-muted-foreground bg-muted' },
  CAMPAIGN_UNARCHIVED: { label: 'Event Unarchived', icon: FileText, color: 'text-green-600 bg-green-100' },

  // Landing Page
  LANDING_PAGE_CREATED:  { label: 'Landing Page Created',   icon: FileText,   color: 'text-primary bg-primary-subtle' },
  LANDING_PAGE_UPDATED:  { label: 'Landing Page Updated',   icon: FileText,   color: 'text-primary bg-primary-subtle' },
  LANDING_PAGE_PUBLISHED:{ label: 'Landing Page Published', icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  LANDING_PAGE_DELETED:  { label: 'Landing Page Deleted',   icon: XCircle,    color: 'text-red-600 bg-red-100' },

  // Registrations
  REGISTRATION_CREATED:  { label: 'Registration Created',   icon: User,     color: 'text-green-600 bg-green-100' },
  REGISTRATION_UPDATED:  { label: 'Registration Updated',   icon: Settings, color: 'text-primary bg-primary-subtle' },
  REGISTRATION_CANCELLED:{ label: 'Registration Cancelled', icon: XCircle,  color: 'text-red-600 bg-red-100' },

  // Payments
  PAYMENT_INITIATED: { label: 'Payment Initiated', icon: DollarSign,  color: 'text-primary bg-primary-subtle' },
  PAYMENT_VERIFIED:  { label: 'Payment Verified',  icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  PAYMENT_FAILED:    { label: 'Payment Failed',    icon: XCircle,     color: 'text-red-600 bg-red-100' },
  PAYMENT_WEBHOOK:   { label: 'Payment Webhook',   icon: DollarSign,  color: 'text-primary bg-primary-subtle' },
  REFUND_INITIATED:  { label: 'Refund Initiated',  icon: DollarSign,  color: 'text-amber-600 bg-amber-100' },
  REFUND_COMPLETED:  { label: 'Refund Completed',  icon: DollarSign,  color: 'text-green-600 bg-green-100' },

  // Fund Transfers (backend uses FUND_TRANSFER_* constants)
  FUND_TRANSFER_REQUESTED: { label: 'Transfer Requested', icon: DollarSign,  color: 'text-primary bg-primary-subtle' },
  FUND_TRANSFER_APPROVED:  { label: 'Transfer Approved',  icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  FUND_TRANSFER_REJECTED:  { label: 'Transfer Rejected',  icon: XCircle,     color: 'text-red-600 bg-red-100' },
  FUND_TRANSFER_COMPLETED: { label: 'Transfer Completed', icon: DollarSign,  color: 'text-green-600 bg-green-100' },

  // Offline Payments / Kiosk
  OFFLINE_REGISTRATION: { label: 'Offline Registration', icon: User,        color: 'text-primary bg-primary-subtle' },
  OTP_VERIFIED:         { label: 'OTP Verified',         icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  CASH_CONFIRMED:       { label: 'Cash Confirmed',       icon: DollarSign,  color: 'text-green-600 bg-green-100' },
  NO_SHOW:              { label: 'No Show',              icon: XCircle,     color: 'text-red-600 bg-red-100' },
  KIOSK_CHECK_IN:       { label: 'Kiosk Check-in',      icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  KIOSK_REGISTER:       { label: 'Kiosk Registration',  icon: User,        color: 'text-primary bg-primary-subtle' },

  // Data Operations
  DATA_EXPORTED:    { label: 'Data Exported',     icon: FileText, color: 'text-primary bg-primary-subtle' },
  MEMBERS_UPLOADED: { label: 'Members Imported',  icon: FileText, color: 'text-primary bg-primary-subtle' },

  // Form & Settings
  FORM_UPDATED:     { label: 'Form Updated',      icon: FileText, color: 'text-primary bg-primary-subtle' },
  SYSTEM_CONFIG:    { label: 'System Config',     icon: Settings, color: 'text-muted-foreground bg-muted' },

  // Change Requests
  CHANGE_REQUEST_CREATED:  { label: 'Change Request Created',  icon: FileText,   color: 'text-primary bg-primary-subtle' },
  CHANGE_REQUEST_APPROVED: { label: 'Change Request Approved', icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  CHANGE_REQUEST_REJECTED: { label: 'Change Request Rejected', icon: XCircle,     color: 'text-red-600 bg-red-100' },

  // Security
  UNAUTHORIZED_ACCESS: { label: 'Unauthorized Access', icon: Shield, color: 'text-red-600 bg-red-100' },
};

const ActivityLogs = () => {
  const { user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [eventTypes, setEventTypes] = useState([]);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  
  // Filters
  const [filters, setFilters] = useState({
    event_type: '',
    resource_type: '',
    user_id: '',
    start_date: '',
    end_date: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 50;

  // Check if user has access (Director or Super Admin)
  const hasAccess = isSuperAdmin() || user?.can_approve_transfers;

  useEffect(() => {
    if (!hasAccess) {
      toast.error('Access denied. Directors and Super Admins only.');
      navigate('/dashboard');
      return;
    }
    
    fetchEventTypes();
    fetchStats();
    fetchUsers();
  }, [hasAccess, navigate]);

  useEffect(() => {
    if (hasAccess) {
      fetchLogs();
    }
  }, [page, hasAccess]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchEventTypes = async () => {
    try {
      const response = await api.get('/activity-logs/event-types');
      setEventTypes(response.data.event_types || []);
    } catch (error) {
      console.error('Failed to fetch event types:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/activity-logs/stats?days=7');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', pageSize.toString());
      
      if (filters.event_type) params.append('event_type', filters.event_type);
      if (filters.resource_type) params.append('resource_type', filters.resource_type);
      if (filters.user_id) params.append('user_id', filters.user_id);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      
      const response = await api.get(`/activity-logs?${params.toString()}`);
      setLogs(response.data.logs || []);
      setTotalLogs(response.data.total);
      setHasMore(response.data.has_more);
    } catch (error) {
      console.error('Failed to fetch activity logs:', error);
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setFilters({
      event_type: '',
      resource_type: '',
      user_id: '',
      start_date: '',
      end_date: ''
    });
    setPage(1);
    setTimeout(fetchLogs, 100);
  };

  // Backend stores audit timestamps as UTC. With the AppDbContext UTC converter
  // in place, the JSON now carries the 'Z' suffix so JS treats it as UTC. But
  // we still want to *display* IST regardless of the viewer's browser timezone
  // (audit logs are shared across teams in different locations).
  //
  // Use Intl.DateTimeFormat with Asia/Kolkata explicitly so the wall-clock
  // value users see matches the value an auditor in India would see.
  const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
    timeZone:    'Asia/Kolkata',
    day:         '2-digit',
    month:       'short',
    year:        'numeric',
    hour:        '2-digit',
    minute:      '2-digit',
    second:      '2-digit',
    hour12:      false,
  });

  // Coerce strings without a 'Z' to UTC, then format.
  const toDateUtcSafe = (raw) => {
    if (!raw) return null;
    // If the string lacks tz info (no 'Z' / '+hh:mm'), treat as UTC.
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
    return parseISO(hasTz ? raw : raw + 'Z');
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = toDateUtcSafe(timestamp);
      return date ? `${IST_FORMATTER.format(date)} IST` : timestamp;
    } catch {
      return timestamp;
    }
  };

  const formatRelativeTime = (timestamp) => {
    try {
      const date = toDateUtcSafe(timestamp);
      return date ? formatDistanceToNow(date, { addSuffix: true }) : '';
    } catch {
      return '';
    }
  };

  const getEventTypeInfo = (eventType) => {
    return EVENT_TYPE_LABELS[eventType] || {
      label: eventType?.replace(/_/g, ' ') || 'Unknown',
      icon: Activity,
      color: 'text-muted-foreground bg-muted'
    };
  };

  const renderActionDetails = (details) => {
    if (!details || Object.keys(details).length === 0) return null;
    
    return (
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(details).map(([key, value]) => {
          if (key === 'password' || value === '[REDACTED]') return null;
          return (
            <span key={key} className="inline-flex items-center gap-1">
              <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>{' '}
              <span className="font-medium text-foreground">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
            </span>
          );
        })}
      </div>
    );
  };

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7 mb-5">
          <div className="ke-hero-grid" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Audit Trail</div>
              <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Activity Logs</h1>
              <p className="text-white/70 text-sm font-jakarta mt-1.5">Track every change and action across the system.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowFilters(!showFilters)}
                className={`rounded-lg h-10 font-jakarta border text-white ${showFilters ? 'bg-white/20 border-white/30' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
              >
                <Filter className="w-4 h-4 mr-1.5" />
                Filters
              </Button>
              <Button
                onClick={() => { setPage(1); fetchLogs(); fetchStats(); }}
                className="rounded-lg h-10 font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="ke-card ke-card-hover p-5 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">Events (Last 7 days)</div>
                  <div className="text-[28px] font-outfit font-bold text-foreground mt-1.5 tabular-nums">{stats.total_events}</div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--primary) / 0.18), transparent 85%)' }}>
                  <Activity className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
                </span>
              </div>
            </div>
            <div className="ke-card ke-card-hover p-5 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(152 58% 40%), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">Successful Logins</div>
                  <div className="text-[28px] font-outfit font-bold text-foreground mt-1.5 tabular-nums">
                    {stats.by_event_type?.find(e => e.event_type === 'LOGIN_SUCCESS')?.count || 0}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.18), transparent 85%)' }}>
                  <CheckCircle className="w-5 h-5" style={{ color: 'hsl(152 58% 40%)' }} />
                </span>
              </div>
            </div>
            <div className="ke-card ke-card-hover p-5 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">Event Actions</div>
                  <div className="text-[28px] font-outfit font-bold text-foreground mt-1.5 tabular-nums">
                    {(stats.by_event_type?.filter(e => e.event_type?.includes('CAMPAIGN'))?.reduce((a, b) => a + b.count, 0)) || 0}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}>
                  <FileText className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
                </span>
              </div>
            </div>
            <div className="ke-card ke-card-hover p-5 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, hsl(var(--chart-4)), transparent)' }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] font-jakarta font-semibold text-muted-foreground">Transfer Actions</div>
                  <div className="text-[28px] font-outfit font-bold text-foreground mt-1.5 tabular-nums">
                    {(stats.by_event_type?.filter(e => e.event_type?.includes('TRANSFER'))?.reduce((a, b) => a + b.count, 0)) || 0}
                  </div>
                </div>
                <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--chart-4) / 0.18), transparent 85%)' }}>
                  <DollarSign className="w-5 h-5" style={{ color: 'hsl(var(--chart-4))' }} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="ke-card p-5 mb-5">
            <h3 className="ke-section-title text-[15px] flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              Filter logs
            </h3>
            <div className="ke-rule-gold mt-2 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label className="text-xs">Event Type</Label>
                <Select value={filters.event_type || "all"} onValueChange={(v) => setFilters({...filters, event_type: v === "all" ? "" : v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All events" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All events</SelectItem>
                    {eventTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Resource Type</Label>
                <Select value={filters.resource_type || "all"} onValueChange={(v) => setFilters({...filters, resource_type: v === "all" ? "" : v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All resources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All resources</SelectItem>
                    <SelectItem value="campaign">Event</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="fund_transfer">Fund Transfer</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem>
                    <SelectItem value="landing_page">Landing Page</SelectItem>
                    <SelectItem value="registration">Registration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">User</Label>
                <Select value={filters.user_id || "all"} onValueChange={(v) => setFilters({...filters, user_id: v === "all" ? "" : v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input 
                  type="date" 
                  value={filters.start_date}
                  onChange={(e) => setFilters({...filters, start_date: e.target.value})}
                />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input 
                  type="date" 
                  value={filters.end_date}
                  onChange={(e) => setFilters({...filters, end_date: e.target.value})}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear
              </Button>
              <Button size="sm" onClick={handleApplyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>
        )}

        {/* Logs Table */}
        <h3 className="ke-section-title text-[15px]">Log Entries</h3>
        <div className="ke-rule-gold mt-2 mb-3" />
        <div className="ke-card overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading activity logs…</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
                  <Activity className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No activity logs found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or refresh to load recent activity.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Event Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Resource
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log, idx) => {
                    const eventInfo = getEventTypeInfo(log.event_type);
                    const EventIcon = eventInfo.icon;
                    
                    return (
                      <tr key={log.id || idx} className="transition-colors hover:bg-muted/50">
                        {/* Event Type */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${eventInfo.color}`}>
                              <EventIcon className="w-4 h-4" />
                            </div>
                            <div className="font-medium text-foreground text-sm">
                              {eventInfo.label}
                            </div>
                          </div>
                        </td>
                        {/* User (name + email) */}
                        <td className="px-4 py-3">
                          <div className="text-sm text-foreground">
                            {log.user_name || log.user_email || '-'}
                          </div>
                          {log.user_email && log.user_name && (
                            <div className="text-xs text-muted-foreground">{log.user_email}</div>
                          )}
                        </td>
                        {/* Resource */}
                        <td className="px-4 py-3">
                          {log.resource_type ? (
                            <div>
                              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                                {log.resource_type}
                              </div>
                              <div className="text-sm text-foreground">
                                {log.resource_name || log.resource_id?.slice(0, 8) || '-'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        {/* Details */}
                        <td className="px-4 py-3">
                          {renderActionDetails(log.action_details)}
                        </td>
                        {/* Timestamp */}
                        <td className="px-4 py-3">
                          <div className="text-sm text-foreground whitespace-nowrap">
                            {formatTimestamp(log.timestamp)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(log.timestamp)}
                          </div>
                        </td>
                        {/* IP Address */}
                        <td className="px-4 py-3">
                          <div className="text-xs font-mono text-muted-foreground">{log.ip_address || '-'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ${
                            log.status === 'success'
                              ? 'bg-green-100 text-green-700'
                              : (log.status === 'failed' || log.status === 'failure' || log.status === 'blocked')
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Pagination */}
          {!loading && logs.length > 0 && (
            <div className="border-t border-border px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalLogs)} of {totalLogs} logs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Page {page}</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasMore}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityLogs;
