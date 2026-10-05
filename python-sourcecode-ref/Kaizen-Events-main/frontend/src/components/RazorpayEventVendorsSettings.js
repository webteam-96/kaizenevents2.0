import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, Star, Pencil, ExternalLink, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from 'sonner';
import { SPLIT_TYPES } from '../constants/razorpay';

const splitTypeLabel = (t, v) => {
  if (t === SPLIT_TYPES.PERCENTAGE) return `${Number(v).toFixed(2)}%`;
  if (t === SPLIT_TYPES.FIXED)      return `₹${Number(v).toFixed(2)}`;
  if (t === SPLIT_TYPES.RESIDUAL)   return 'Residual (auto)';
  return '—';
};

// Razorpay Linked Account activation states.
const getStatusVariant = (status) => {
  switch (status) {
    case 'activated':            return 'default';
    case 'rejected':
    case 'suspended':
    case 'needs_clarification':  return 'destructive';
    case 'created':
    case 'under_review':         return 'outline';
    default:                     return 'secondary';
  }
};

/**
 * Read-only summary of the campaign's Razorpay Route vendor splits, plus the
 * global Kaizen default Linked Account. For editing, link to the EditCampaign
 * page's RazorpayPaymentSplitsSection.
 */
const RazorpayEventVendorsSettings = ({ campaignId, campaignName }) => {
  const navigate = useNavigate();
  const [loading, setLoading]               = useState(true);
  const [splits, setSplits]                 = useState([]);
  const [kaizenDefault, setKaizenDefault]   = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [splitsRes, defaultRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}/vendor-splits?gateway=razorpay`),
        api.get(`/campaigns/${campaignId}/vendor-splits/kaizen-default?gateway=razorpay`)
      ]);
      setSplits(splitsRes.data || []);
      setKaizenDefault(defaultRes.data || { configured: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load vendor splits.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { if (campaignId) fetch(); }, [campaignId, fetch]);

  if (loading) {
    return (
      <Card className="ke-card p-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Kaizen default */}
      <Card className="p-5 bg-primary-subtle border-primary-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <span className="ke-medallion shrink-0" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}>
              <Star className="h-5 w-5" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-primary">Razorpay Route Vendors — Kaizen Default</p>
              {kaizenDefault?.configured ? (
                <>
                  <p className="text-sm text-foreground font-medium">{kaizenDefault.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-applied to every Razorpay event at <strong className="tabular-nums">{Number(kaizenDefault.default_percentage).toFixed(2)}%</strong>.
                  </p>
                </>
              ) : (
                <p className="text-sm text-amber-700">Not configured — set one on the Razorpay Route Accounts page.</p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/razorpay-route')}>
            Manage on Route Accounts page <ExternalLink className="ml-2 h-3 w-3" />
          </Button>
        </div>
      </Card>

      {/* Per-event splits */}
      <Card className="ke-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="ke-section-title text-[15px]">Razorpay Route Vendors ({campaignName})</h3>
          <Button variant="outline" size="sm" onClick={() => navigate(`/campaigns/${campaignId}/edit`)}>
            <Pencil className="mr-2 h-3 w-3" /> Edit splits
          </Button>
        </div>
        <div className="ke-rule-gold mt-2 mb-3" />

        {splits.length === 0 ? (
          <div className="flex items-start gap-2 py-3 text-amber-700 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>No per-event vendor splits configured. Open Edit Campaign → Payment Splits to add some.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {splits.map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-border rounded-md p-2 transition-colors hover:bg-muted/50">
                <div>
                  <p className="text-sm text-foreground">{s.vendor_label || s.vendor_id}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {s.vendor_status && (
                      <Badge variant={getStatusVariant(s.vendor_status)} className="text-[10px]">{s.vendor_status}</Badge>
                    )}
                    {s.vendor_is_active === false && (
                      <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                    )}
                  </div>
                </div>
                <span className="text-sm font-mono text-foreground tabular-nums text-right">{splitTypeLabel(s.split_type, s.value)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default RazorpayEventVendorsSettings;
