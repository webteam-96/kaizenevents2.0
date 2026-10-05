import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  History, Loader2, User, Calendar, RefreshCw, ChevronDown,
  CheckCircle, XCircle, AlertTriangle, Settings, FileText, DollarSign
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatServerDate, parseServerDate } from '../utils/serverTime';

// Event type to human-readable label mapping
const EVENT_TYPE_LABELS = {
  LOGIN_SUCCESS: { label: 'Login', icon: User, color: 'text-green-600' },
  USER_CREATED: { label: 'Created', icon: User, color: 'text-blue-600' },
  USER_UPDATED: { label: 'Updated', icon: Settings, color: 'text-yellow-600' },
  USER_DELETED: { label: 'Deleted', icon: XCircle, color: 'text-red-600' },
  CAMPAIGN_CREATED: { label: 'Created', icon: FileText, color: 'text-primary' },
  CAMPAIGN_UPDATED: { label: 'Updated', icon: Settings, color: 'text-blue-600' },
  CAMPAIGN_DELETED: { label: 'Deleted', icon: XCircle, color: 'text-red-600' },
  CAMPAIGN_ARCHIVED: { label: 'Archived', icon: FileText, color: 'text-muted-foreground' },
  TRANSFER_CREATED: { label: 'Created', icon: DollarSign, color: 'text-blue-600' },
  TRANSFER_APPROVED: { label: 'Approved', icon: CheckCircle, color: 'text-green-600' },
  TRANSFER_REJECTED: { label: 'Rejected', icon: XCircle, color: 'text-red-600' },
  TRANSFER_COMPLETED: { label: 'Completed', icon: CheckCircle, color: 'text-green-600' },
};

const EntityHistory = ({ entityType, entityId, title, collapsible = false }) => {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [entityName, setEntityName] = useState('');
  const [error, setError] = useState(null);
  // When collapsible, the panel starts closed and only fetches once first opened,
  // so it costs no space and no request until the user actually asks for it.
  const [open, setOpen] = useState(!collapsible);
  const [openedOnce, setOpenedOnce] = useState(!collapsible);

  useEffect(() => {
    if (openedOnce && entityType && entityId) {
      fetchHistory();
    }
  }, [entityType, entityId, openedOnce]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) setOpenedOnce(true);
      return next;
    });
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/activity-logs/entity/${entityType}/${entityId}?limit=50`);
      setHistory(response.data.history || []);
      setEntityName(response.data.entity_name || '');
    } catch (err) {
      console.error('Failed to fetch entity history:', err);
      if (err.response?.status === 403) {
        setError('You do not have permission to view this history.');
      } else {
        setError('Failed to load history');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      return formatServerDate(timestamp, 'MMM dd, yyyy HH:mm');
    } catch {
      return timestamp;
    }
  };

  const formatRelativeTime = (timestamp) => {
    try {
      const date = parseServerDate(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return '';
    }
  };

  const getEventTypeInfo = (eventType) => {
    return EVENT_TYPE_LABELS[eventType] || { 
      label: eventType?.replace(/_/g, ' ').toLowerCase() || 'Action',
      icon: Settings,
      color: 'text-muted-foreground'
    };
  };

  const renderActionDetails = (details) => {
    if (!details || Object.keys(details).length === 0) return null;
    
    const filteredDetails = Object.entries(details).filter(([key, value]) => {
      if (key === 'password' || value === '[REDACTED]') return false;
      if (key === 'campaign_id' || key === 'resource_id') return false; // Already shown
      return true;
    });

    if (filteredDetails.length === 0) return null;
    
    return (
      <div className="mt-1 text-xs text-muted-foreground">
        {filteredDetails.map(([key, value]) => (
          <span key={key} className="mr-3">
            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>{' '}
            {Array.isArray(value) ? value.join(', ') : String(value)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <Card className="p-6">
      <div className={`flex items-center justify-between ${open ? 'mb-4' : 'mb-0'}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 text-left transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <History className="w-5 h-5 text-primary shrink-0" />
            <h3 className="text-lg font-semibold text-foreground font-outfit">
              {title || 'Change History'}
            </h3>
            {entityName && (
              <span className="truncate text-sm text-muted-foreground">- {entityName}</span>
            )}
            <ChevronDown
              className={`ml-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground font-outfit">
              {title || 'Change History'}
            </h3>
            {entityName && (
              <span className="text-sm text-muted-foreground">- {entityName}</span>
            )}
          </div>
        )}
        {open && (
          <Button variant="ghost" size="sm" onClick={fetchHistory} className="ml-2 shrink-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {open && (
        loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No history recorded yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline */}
            <div className="relative">
              {history.map((entry, idx) => {
              const eventInfo = getEventTypeInfo(entry.event_type);
              const EventIcon = eventInfo.icon;
              const isLast = idx === history.length - 1;

              return (
                <div key={entry.id || idx} className="relative pl-8 pb-4">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-border" />
                  )}

                  {/* Timeline dot */}
                  <div className={`absolute left-0 top-1 w-6 h-6 rounded-full bg-card border-2 flex items-center justify-center ${
                    entry.status === 'success' ? 'border-green-400' :
                    entry.status === 'failure' ? 'border-red-400' : 'border-border'
                  }`}>
                    <EventIcon className={`w-3 h-3 ${eventInfo.color}`} />
                  </div>

                  {/* Content */}
                  <div className="bg-muted rounded-lg p-3 transition-colors hover:bg-accent-subtle">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={`font-medium ${eventInfo.color}`}>
                          {eventInfo.label}
                        </span>
                        {entry.user_name && (
                          <span className="text-muted-foreground text-sm ml-2">
                            by {entry.user_name}
                          </span>
                        )}
                        {renderActionDetails(entry.action_details)}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(entry.timestamp)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatRelativeTime(entry.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
          )
      )}
    </Card>
  );
};

export default EntityHistory;
