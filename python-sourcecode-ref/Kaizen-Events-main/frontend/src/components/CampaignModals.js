import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

// Payment Settings Modal
export const PaymentSettingsModal = ({ 
  isOpen, 
  onClose, 
  campaignId, 
  currentAccountId, 
  currentGateway,
  onSave 
}) => {
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [selectedGateway, setSelectedGateway] = useState(currentGateway || 'razorpay');
  const [selectedAccount, setSelectedAccount] = useState(currentAccountId || '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchPaymentAccounts();
      setSelectedGateway(currentGateway || 'razorpay');
      setSelectedAccount(currentAccountId || '');
    }
  }, [isOpen, currentAccountId, currentGateway]);

  const fetchPaymentAccounts = async () => {
    try {
      const response = await api.get('/payment-accounts');
      setPaymentAccounts(response.data);
    } catch (error) {
      toast.error('Failed to load payment accounts');
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = paymentAccounts.filter(
    account => account.gateway_type === selectedGateway
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}`, {
        payment_account_id: selectedAccount || null,
        payment_gateway: selectedGateway || 'none'
      });
      onSave && onSave();
      onClose();
      toast.success('Payment settings updated!');
    } catch (error) {
      toast.error('Failed to update payment settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-outfit font-bold">Payment Settings</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-6">
          {/* Gateway Type Selector */}
          <div className="mb-5">
            <Label className="text-sm font-medium text-slate-700 mb-2 block">
              Payment Gateway
            </Label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedGateway('razorpay');
                  setSelectedAccount('');
                }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  selectedGateway === 'razorpay'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Razorpay
              </button>
              <button
                onClick={() => {
                  setSelectedGateway('instamojo');
                  setSelectedAccount('');
                }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  selectedGateway === 'instamojo'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Instamojo
              </button>
              <button
                onClick={() => {
                  setSelectedGateway('cashfree');
                  setSelectedAccount('');
                }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  selectedGateway === 'cashfree'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Cashfree
              </button>
            </div>
          </div>

          {/* Payment Account Selector */}
          <div className="mb-5">
            <Label className="text-sm font-medium text-slate-700 mb-2 block">
              Select {selectedGateway === 'razorpay' ? 'Razorpay' : selectedGateway === 'cashfree' ? 'Cashfree' : 'Instamojo'} Account
            </Label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">No Payment (Free Registration)</option>
              {filteredAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.is_active ? '' : ' - Inactive'}
                </option>
              ))}
            </select>
            {filteredAccounts.length === 0 && (
              <p className="text-xs text-yellow-600 mt-2">
                No {selectedGateway} accounts found. Add one in Payment Accounts.
              </p>
            )}
          </div>

          {selectedAccount && (
            <div className="mb-5 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">Selected Account Details</p>
              {filteredAccounts.filter(a => a.id === selectedAccount).map(account => (
                <div key={account.id} className="text-sm text-slate-600">
                  <p><span className="font-medium">Name:</span> {account.name}</p>
                  <p><span className="font-medium">Gateway:</span> {account.gateway_type}</p>
                  <p><span className="font-medium">Status:</span> {account.is_active ? 
                    <span className="text-green-600">Active</span> : 
                    <span className="text-red-500">Inactive</span>
                  }</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary-hover"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Team Member Modal
export const TeamMemberModal = ({ 
  isOpen, 
  onClose, 
  campaignId, 
  onSave 
}) => {
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [member, setMember] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (isOpen) {
      setMember({ name: '', email: '', password: '' });
      setShowPassword(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await api.post('/auth/register', {
        name: member.name,
        email: member.email,
        password: member.password,
        role: 'org_admin',
        campaign_access: [campaignId]
      });
      
      toast.success('Team member added successfully!');
      onSave && onSave();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add team member');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-outfit font-bold">Add Team Member</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Add a new organisation admin with access to this campaign only.
          </p>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Name</Label>
              <Input
                value={member.name}
                onChange={(e) => setMember({...member, name: e.target.value})}
                placeholder="Enter name"
                required
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Email</Label>
              <Input
                type="email"
                value={member.email}
                onChange={(e) => setMember({...member, email: e.target.value})}
                placeholder="Enter email address"
                required
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={member.password}
                  onChange={(e) => setMember({...member, password: e.target.value})}
                  placeholder="Enter password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 mt-6">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary-hover"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Member'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default { PaymentSettingsModal, TeamMemberModal };
