import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  FileSpreadsheet, CheckCircle, AlertCircle, Loader2, ExternalLink,
  Trash2, RefreshCw, Plus, Info, Undo2
} from 'lucide-react';
import { toast } from 'sonner';

const GoogleSheetsSettings = ({ campaignId, campaignName }) => {
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [sheetConfig, setSheetConfig] = useState(null);
  const [customSheetName, setCustomSheetName] = useState(`${campaignName} - Registrations`);
  const [autoSync, setAutoSync] = useState(true);

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  useEffect(() => {
    setCustomSheetName(`${campaignName} - Registrations`);
  }, [campaignName]);

  const fetchData = async () => {
    try {
      const [statusRes, configRes] = await Promise.all([
        api.get('/integrations/status'),
        api.get(`/integrations/sheets/config/${campaignId}`)
      ]);

      setIntegrationStatus(statusRes.data.google_sheets);
      setSheetConfig(configRes.data);
    } catch (error) {
      console.error('Failed to load sheets settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSheet = async () => {
    if (!customSheetName.trim()) {
      toast.error('Please enter a name for the spreadsheet');
      return;
    }

    setCreating(true);
    try {
      const response = await api.post('/integrations/sheets/create-campaign-sheet', {
        campaign_id: campaignId,
        sheet_name: customSheetName,
        auto_sync: autoSync
      });

      toast.success('Google Sheet created successfully! Check your email for access.');
      setSheetConfig({
        configured: true,
        spreadsheet_id: response.data.spreadsheet_id,
        spreadsheet_url: response.data.spreadsheet_url,
        spreadsheet_title: customSheetName,
        auto_sync: autoSync
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create sheet');
    } finally {
      setCreating(false);
    }
  };

  const handleDisableSync = async () => {
    if (!window.confirm('Are you sure you want to disable Google Sheets sync? The sheet will not be deleted.')) {
      return;
    }

    setDisabling(true);
    try {
      await api.delete(`/integrations/sheets/campaign/${campaignId}`);
      toast.success('Google Sheets sync disabled');
      setSheetConfig({ configured: false });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to disable sync');
    } finally {
      setDisabling(false);
    }
  };

  // force_full = false: rows you deleted in the sheet stay deleted.
  // force_full = true:  undo every past deletion and push all registrations back.
  const runSync = async (forceFull) => {
    if (!sheetConfig?.spreadsheet_id) {
      toast.error('No spreadsheet configured');
      return;
    }

    const setBusy = forceFull ? setRestoring : setSyncing;
    setBusy(true);
    try {
      const response = await api.post('/integrations/sheets/sync', {
        campaign_id: campaignId,
        spreadsheet_id: sheetConfig.spreadsheet_id,
        sheet_name: 'Registrations',
        force_full: forceFull
      });

      toast.success(`Synced ${response.data.synced}/${response.data.total} registrations`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncAll = () => runSync(false);

  const handleRestoreDeleted = () => {
    if (!window.confirm(
      'Put every registration back into the sheet, including rows you deleted there?\n\n' +
      'Use this if a row went missing by mistake. Rows you deleted on purpose will come back.'
    )) return;
    runSync(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Check if Google Sheets is configured globally
  if (!integrationStatus?.configured) {
    return (
      <div className="ke-card p-6">
        <div className="flex items-start gap-3">
          <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(38 92% 48% / 0.18), transparent 85%)' }}>
            <AlertCircle className="w-5 h-5" style={{ color: 'hsl(38 92% 40%)' }} />
          </span>
          <div>
            <h3 className="ke-section-title text-[15px]">Google Sheets Not Configured</h3>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-sm text-muted-foreground mt-1">
              Google Sheets integration needs to be set up first by a Super Admin.
            </p>
            {isSuperAdmin() && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.href = '/integrations'}
              >
                Go to Integrations Settings
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Sheet is configured for this campaign
  if (sheetConfig?.configured && sheetConfig?.spreadsheet_id) {
    return (
      <div className="space-y-6">
        {/* Connected Status */}
        <div className="ke-card p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(152 58% 40% / 0.20), transparent 85%)' }}>
                <FileSpreadsheet className="w-5 h-5" style={{ color: 'hsl(152 58% 40%)' }} />
              </span>
              <div>
                <h3 className="text-lg font-outfit font-semibold text-foreground">
                  Google Sheets Connected
                </h3>
                <p className="text-sm text-muted-foreground">
                  {sheetConfig.sheet_name || 'Registrations'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Active
            </div>
          </div>

          {/* Sheet Info */}
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Spreadsheet Name</p>
                <p className="font-medium text-foreground">
                  {sheetConfig.spreadsheet_name || sheetConfig.sheet_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Auto-sync</p>
                <p className="font-medium text-foreground">
                  {sheetConfig.auto_sync ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mt-4">
            <Button
              onClick={() => window.open(sheetConfig.spreadsheet_url, '_blank')}
              className="bg-primary hover:bg-primary-hover"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Spreadsheet
            </Button>

            <Button
              variant="outline"
              onClick={handleSyncAll}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sync All Registrations
            </Button>

            <Button
              variant="outline"
              onClick={handleRestoreDeleted}
              disabled={restoring}
            >
              {restoring ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Undo2 className="w-4 h-4 mr-2" />
              )}
              Restore Deleted Rows
            </Button>

            <Button
              variant="outline"
              onClick={handleDisableSync}
              disabled={disabling}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              {disabling ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Disable Sync
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-2xl border border-border bg-primary-subtle p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5" />
            <div className="text-sm text-foreground">
              <p className="font-medium">How it works:</p>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                <li>New registrations are automatically added to the sheet</li>
                <li>Use "Sync All" to refresh existing registrations</li>
                <li>
                  <span className="font-medium">Deleting a row in the sheet is permanent</span> — it
                  won't come back on the next sync. The registration itself stays in your reports.
                  "Restore Deleted Rows" undoes this.
                </li>
                <li>
                  <span className="font-medium">Add your own columns to the right</span> of the
                  generated ones (notes, attendance, follow-ups). They stay with their registration
                  and survive every sync.
                </li>
                <li>
                  Edits <span className="font-medium">inside</span> the generated columns are
                  overwritten on the next sync — those come from the registration data itself.
                </li>
                <li>The sheet has been shared with your email</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No sheet configured - show setup form
  return (
    <div className="space-y-6">
      <div className="ke-card p-6">
        <div className="flex items-start gap-3 mb-6">
          <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}>
            <FileSpreadsheet className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div>
            <h3 className="ke-section-title text-[15px]">
              Setup Google Sheets Sync
            </h3>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-sm text-muted-foreground">
              Create a Google Sheet to automatically sync registrations
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Spreadsheet Name</Label>
            <Input
              value={customSheetName}
              onChange={(e) => setCustomSheetName(e.target.value)}
              placeholder="Enter spreadsheet name"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This will be the name of the Google Sheet created for this campaign
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label className="text-sm font-medium text-foreground">Auto-sync New Registrations</Label>
              <p className="text-xs text-muted-foreground">Automatically add new registrations to the sheet</p>
            </div>
            <Switch
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
          </div>
        </div>

        <Button
          onClick={handleCreateSheet}
          disabled={creating || !customSheetName.trim()}
          className="mt-6 bg-primary hover:bg-primary-hover"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Create & Connect Sheet
        </Button>
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
          <div className="text-sm text-green-800">
            <p className="font-medium">What happens when you click "Create":</p>
            <ul className="mt-1 space-y-1 list-disc list-inside">
              <li>A new Google Sheet will be created with your custom name</li>
              <li>The sheet will be automatically shared with your email</li>
              <li>Headers will be added for registration data</li>
              <li>New registrations will auto-sync (if enabled)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleSheetsSettings;
