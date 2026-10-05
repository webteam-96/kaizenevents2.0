import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getInstamojoSession, clearInstamojoSession } from './InstamojoPasswordGate';

const emptyForm = {
  account_name: '',
  bank_name: '',
  account_number: '',
  bank_branch: '',
  ifsc_code: '',
};

export default function InstamojoPurposeBankDetails() {
  const navigate = useNavigate();
  const { titleId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [purpose, setPurpose] = useState({ id: 0, title: '' });
  const [banks, setBanks]     = useState([]);

  const [editingId, setEditingId] = useState(0);     // 0 = add, >0 = update
  const [form, setForm]           = useState(emptyForm);

  // Session check
  useEffect(() => {
    if (!getInstamojoSession()) navigate('/instamojo', { replace: true });
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/instamojo-archive/purposes/${titleId}/banks`);
      setPurpose(res.data.title || { id: Number(titleId), title: '' });
      setBanks(res.data.banks || []);
    } catch (err) {
      if (err.response?.status === 403) {
        clearInstamojoSession();
        toast.error('Session expired.');
        navigate('/instamojo', { replace: true });
        return;
      }
      if (err.response?.status === 404) {
        toast.error('Purpose not found.');
        navigate('/instamojo/purposes', { replace: true });
        return;
      }
      toast.error(err.response?.data?.detail || 'Failed to load bank details.');
    } finally {
      setLoading(false);
    }
  }, [titleId, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setField = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const handleClear = () => {
    setForm(emptyForm);
    setEditingId(0);
  };

  const handleSave = async () => {
    // Validations matching Rotary's RequiredFieldValidator set
    if (!form.account_name.trim())   { toast.error('Account Name is mandatory.');   return; }
    if (!form.account_number.trim()) { toast.error('Account Number is mandatory.'); return; }
    if (!form.ifsc_code.trim())      { toast.error('IFSC Code is mandatory.');      return; }

    const payload = {
      accountName:   form.account_name.trim(),
      bankName:      form.bank_name.trim() || null,
      accountNumber: form.account_number.trim(),
      bankBranch:    form.bank_branch.trim() || null,
      ifscCode:      form.ifsc_code.trim(),
    };

    setSaving(true);
    try {
      if (editingId > 0) {
        await api.patch(`/instamojo-archive/purposes/${titleId}/banks/${editingId}`, payload);
      } else {
        await api.post(`/instamojo-archive/purposes/${titleId}/banks`, payload);
      }
      toast.success('Record saved Successfully.');
      handleClear();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row) => {
    setEditingId(row.pk_purposetitle_bank_details_id);
    setForm({
      account_name:   row.account_name   || '',
      bank_name:      row.bank_name      || '',
      account_number: row.account_number || '',
      bank_branch:    row.bank_branch    || '',
      ifsc_code:      row.ifsc_code      || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (row) => {
    if (!window.confirm('Are you sure you want to delete?')) return;
    try {
      await api.delete(`/instamojo-archive/purposes/${titleId}/banks/${row.pk_purposetitle_bank_details_id}`);
      toast.success('Record Deleted Successfully.');
      if (editingId === row.pk_purposetitle_bank_details_id) handleClear();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed.');
    }
  };

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="w-full space-y-5">
        {/* Hero header */}
        <div className="ke-hero p-6 md:p-7">
          <div className="ke-hero-grid" />
          <div className="relative">
            <button
              onClick={() => navigate('/instamojo/purposes')}
              className="inline-flex items-center gap-1.5 text-[12px] font-jakarta font-medium text-white/70 hover:text-white transition-colors mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Purposes
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">Finance · Instamojo</div>
                <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Purpose Bank Details</h1>
                <p className="text-white/70 text-sm font-jakarta mt-1.5">
                  {purpose.title ? <>Bank accounts linked to <span className="text-white font-semibold">{purpose.title}</span>.</> : 'Bank accounts linked to this purpose.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="ke-card p-5">
          <h3 className="ke-section-title text-[15px]">{editingId > 0 ? 'Update Bank Account' : 'Add Bank Account'}</h3>
          <div className="ke-rule-gold mt-2 mb-4" />
          <div className="max-w-3xl mx-auto space-y-3">
            <div>
              <Label>Account Name <span className="text-destructive">*</span></Label>
              <Input value={form.account_name} onChange={setField('account_name')}
                placeholder="Account Name" />
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input value={form.bank_name} onChange={setField('bank_name')}
                placeholder="Bank Name" />
            </div>
            <div>
              <Label>Account Number <span className="text-destructive">*</span></Label>
              <Input value={form.account_number} onChange={setField('account_number')}
                placeholder="Account Number" />
            </div>
            <div>
              <Label>Bank Branch</Label>
              <Input value={form.bank_branch} onChange={setField('bank_branch')}
                placeholder="Bank Branch" />
            </div>
            <div>
              <Label>IFSC Code <span className="text-destructive">*</span></Label>
              <Input value={form.ifsc_code} onChange={setField('ifsc_code')}
                placeholder="IFSC Code" />
            </div>
            <div className="text-center pt-3 flex items-center justify-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (editingId > 0 ? 'Update' : 'Add')}
              </Button>
              <Button variant="outline" onClick={handleClear} disabled={saving}>Clear</Button>
            </div>
          </div>
        </div>

        {/* Table — hidden when no bank rows, matching Rotary's empty-GridView behavior */}
        {loading && (
          <div className="text-center text-muted-foreground py-4 font-jakarta">
            <Loader2 className="inline w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        )}
        {!loading && banks.length > 0 && (
          <div className="ke-card overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm table-fixed border-collapse
                           [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td]:border-b [&_td]:border-border
                           [&_tbody_tr:last-child_td]:border-b-0
                           [&_tbody_tr]:transition-colors hover:[&_tbody_tr]:bg-muted/50">
                <colgroup>
                  <col style={{ width: '8%'  }} />   {/* Sr.No. */}
                  <col style={{ width: '20%' }} />   {/* account_name */}
                  <col style={{ width: '17%' }} />   {/* Bank Name */}
                  <col style={{ width: '17%' }} />   {/* Account Number */}
                  <col style={{ width: '15%' }} />   {/* Bank Branch */}
                  <col style={{ width: '13%' }} />   {/* IFSC Code */}
                  <col style={{ width: '5%'  }} />   {/* Edit */}
                  <col style={{ width: '5%'  }} />   {/* Delete */}
                </colgroup>
                <thead className="bg-muted text-left [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:font-jakarta [&_th]:font-semibold [&_th]:text-muted-foreground">
                  <tr>
                    <th>Sr.No.</th>
                    <th>Account Name</th>
                    <th>Bank Name</th>
                    <th>Account Number</th>
                    <th>Bank Branch</th>
                    <th>IFSC Code</th>
                    <th className="!text-center">Edit</th>
                    <th className="!text-center">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {banks.map((row, i) => (
                    <tr key={row.pk_purposetitle_bank_details_id}>
                      <td className="text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="truncate font-medium text-foreground" title={row.account_name || ''}>{row.account_name || '—'}</td>
                      <td className="truncate text-foreground" title={row.bank_name || ''}>{row.bank_name || '—'}</td>
                      <td className="truncate tabular-nums text-foreground" title={row.account_number || ''}>{row.account_number || '—'}</td>
                      <td className="truncate text-foreground" title={row.bank_branch || ''}>{row.bank_branch || '—'}</td>
                      <td className="truncate tabular-nums text-foreground" title={row.ifsc_code || ''}>{row.ifsc_code || '—'}</td>
                      <td className="text-center">
                        <button type="button"
                          onClick={() => handleEdit(row)}
                          title="Edit"
                          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Pencil className="w-4 h-4 inline" />
                        </button>
                      </td>
                      <td className="text-center">
                        <button type="button"
                          onClick={() => handleDelete(row)}
                          title="Delete"
                          className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
