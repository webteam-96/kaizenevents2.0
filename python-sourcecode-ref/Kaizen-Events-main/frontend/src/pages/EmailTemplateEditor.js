import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import {
  ArrowLeft, Save, Eye, Send, Plus, X, Loader2, Mail,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Link as LinkIcon, Image as ImageIcon, ImagePlus,
  List as ListIcon, ListOrdered,
  Code, Quote, Paperclip
} from 'lucide-react';
import { toast } from 'sonner';

import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import './EmailTemplateEditor.css';

// FontSize / FontFamily — both implemented as Extensions that add attributes to
// the shared TextStyle mark (same pattern as @tiptap/extension-color). All three
// styling attributes coexist on a single <span style="...">, e.g.:
//   <span style="font-family: Arial; font-size: 18px; color: #ff0000">...</span>
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize?.replace(/['"]+/g, '') || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
        }
      }
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});

const FontFamily = Extension.create({
  name: 'fontFamily',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontFamily: {
          default: null,
          parseHTML: (el) => el.style.fontFamily?.replace(/['"]+/g, '') || null,
          renderHTML: (attrs) => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {}
        }
      }
    }];
  },
  addCommands() {
    return {
      setFontFamily: (family) => ({ chain }) =>
        chain().setMark('textStyle', { fontFamily: family }).run(),
      unsetFontFamily: () => ({ chain }) =>
        chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run()
    };
  }
});

// Email-safe font choices (render reliably in major email clients).
// The empty-value entry shows the editor's actual default (sans-serif) so the
// dropdown always reads as what the text actually looks like — never "Default".
const FONT_FAMILIES = [
  { label: 'Sans-serif (default)', value: '' },
  { label: 'Arial',                value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica',            value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana',              value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma',               value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS',         value: '"Trebuchet MS", sans-serif' },
  { label: 'Times New Roman',      value: '"Times New Roman", Times, serif' },
  { label: 'Georgia',              value: 'Georgia, serif' },
  { label: 'Garamond',             value: 'Garamond, serif' },
  { label: 'Courier New',          value: '"Courier New", Courier, monospace' }
];

const FONT_SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'];
const DEFAULT_FONT_SIZE = '14px';   // matches the editor's CSS body size

// Custom-attachment limits — mirror the server-side rules (Brevo caps messages at
// ~10MB and base64 inflates ~33%, so raw files stay at 5MB total / 2MB each / 5 files).
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const formatFileSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Trigger metadata used for header rendering
const TRIGGER_META = {
  registration_confirmed: { title: 'Registration Confirmed',  hint: 'Sent after online payment is verified or for free events.' },
  payment_received:       { title: 'Payment Received',        hint: 'Sent after a volunteer marks cash as collected at the venue.' },
  payment_otp:            { title: 'Payment OTP',             hint: 'Sent immediately after a registrant chooses "Pay at Venue".' },
  registration_reminder:  { title: 'Registration Reminder',   hint: 'Sent when admin clicks "Send Reminders" on Members page.' }
};

// Placeholders available everywhere. `otp` only shows for payment_otp, `receipt_number`
// only for payment_received, `payment_id` for registration_confirmed and payment_received
// (the two triggers that fire once a payment — online or offline — has been recorded;
// it resolves blank for a cash/offline registration, which never has a gateway transaction).
const SYSTEM_PLACEHOLDERS = [
  { token: '${name}',             label: 'Registrant name',          appliesTo: 'all' },
  { token: '${email}',            label: 'Registrant email',         appliesTo: 'all' },
  { token: '${phone}',            label: 'Registrant phone',         appliesTo: 'all' },
  { token: '${event_name}',       label: 'Event name',               appliesTo: 'all' },
  { token: '${organization}',     label: 'Organization name',        appliesTo: 'all' },
  { token: '${amount}',           label: 'Amount (Rs. X,XXX.XX)',    appliesTo: 'all' },
  { token: '${invoice_number}',   label: 'Invoice number',           appliesTo: 'all' },
  { token: '${registration_id}',  label: 'Short registration ID',    appliesTo: 'all' },
  { token: '${registration_date}',label: 'Registration date + time', appliesTo: 'all' },
  { token: '${payment_status}',   label: 'Payment status',           appliesTo: 'all' },
  { token: '${event_date}',       label: 'Event start date',         appliesTo: 'all' },
  { token: '${payment_id}',       label: 'Gateway payment/transaction ID', appliesTo: ['registration_confirmed', 'payment_received'] },
  { token: '${otp}',              label: 'OTP code (6 digits)',      appliesTo: 'payment_otp' },
  { token: '${receipt_number}',   label: 'Receipt number (offline)', appliesTo: 'payment_received' }
];

const EmailTemplateEditor = () => {
  const { campaignId, trigger } = useParams();
  const navigate = useNavigate();
  const meta = TRIGGER_META[trigger] || { title: trigger, hint: '' };

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [previewing, setPrev]   = useState(false);
  const [showPreview, setShowP] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [sendingTest, setST]    = useState(false);

  const [campaign, setCampaign] = useState(null);
  const [template, setTemplate] = useState(null);
  const [formFields, setFields] = useState([]);   // for ${field:Label} picker

  // Editor state
  const [subject, setSubject] = useState('');
  const [toOverride, setToOverride] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [newCc, setNewCc] = useState('');
  const [newBcc, setNewBcc] = useState('');
  const [attachPdf, setAttachPdf] = useState(false);
  const [isActive, setIsActive] = useState(true);   // whether this email is sent at all
  const [emailSenderId, setEmailSenderId] = useState('');
  const [emailSenders, setEmailSenders] = useState([]);
  const [attachments, setAttachments] = useState([]);       // [{name, path, size, content_type}]
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const attFileRef = useRef(null);

  // Preview state
  const [previewData, setPreviewData] = useState(null);
  const [testEmail, setTestEmail] = useState('');

  // Refs to track which input has focus (so the placeholder picker knows where to insert)
  const focusedFieldRef = useRef(null); // 'subject' | 'toOverride' | 'replyTo' | 'newCc' | 'newBcc' | null (body uses editor)

  // ── Initialize TipTap editor ───────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      // Keep Heading enabled so pasted/seeded <h1>/<h2>/<h3> still parses, but
      // the toolbar uses inline TextStyle marks instead (so size/color/font
      // changes affect only the selection and don't auto-bold).
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,                                   // base for inline span styling
      FontSize,                                    // adds fontSize attr to TextStyle
      FontFamily,                                  // adds fontFamily attr to TextStyle
      Color.configure({ types: ['textStyle'] }),   // adds color attr to TextStyle
      Highlight.configure({ multicolor: true }),   // background highlight as a separate <mark> mark
      Link.configure({
        openOnClick: false,
        autolink: true,                            // turn typed http://... into links automatically
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
      }),
      Image,
      Placeholder.configure({ placeholder: 'Compose your email here — click placeholders on the right to insert' })
    ],
    content: ''
    // Styling lives in EmailTemplateEditor.css under `.email-tpl-editor .ProseMirror`.
  });

  // ── Load template + campaign ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, tplRes, formRes, sendersRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/email-templates/${trigger}`),
        // Form config lives behind its own endpoint — the campaign GET doesn't embed it.
        api.get(`/campaigns/${campaignId}/form`).catch(() => ({ data: null })),
        // Verified DKIM senders for the per-template "From" selector.
        api.get('/dkim/senders').catch(() => ({ data: [] }))
      ]);
      setCampaign(campRes.data);
      const t = tplRes.data;
      setTemplate(t);
      setSubject(t.subject || '');
      setToOverride(t.to_override || '');
      setReplyTo(t.reply_to || '');
      setCc(t.cc || []);
      setBcc(t.bcc || []);
      setAttachPdf(t.attach_filled_form_pdf || false);
      setIsActive(t.is_active ?? true);
      setEmailSenderId(t.email_sender_id || '');
      setEmailSenders(sendersRes.data || []);
      setAttachments(t.attachments || []);

      // Extract this campaign's form-field labels for the field-placeholder picker.
      // The form config comes from /campaigns/{id}/form (the campaign GET omits it).
      const fields = formRes.data?.fields || [];
      setFields(
        fields
          .filter((f) => f.label && f.type !== 'section_header')
          .map((f) => ({ id: f.id, label: f.label, type: f.type }))
      );

      if (editor) editor.commands.setContent(t.body_html || '', false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [campaignId, trigger, editor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Insert placeholder at cursor in whichever field has focus ───────────────
  const insertPlaceholder = (token) => {
    const target = focusedFieldRef.current;
    if (target === 'subject')      return setSubject((s) => s + token);
    if (target === 'toOverride')   return setToOverride((s) => s + token);
    if (target === 'replyTo')      return setReplyTo((s) => s + token);
    if (target === 'newCc')        return setNewCc((s) => s + token);
    if (target === 'newBcc')       return setNewBcc((s) => s + token);
    // Default: insert into body editor
    if (editor) editor.chain().focus().insertContent(token).run();
  };

  // ── Filter system placeholders by trigger ──────────────────────────────────
  // appliesTo is either 'all', a single trigger, or an array of triggers.
  const systemPlaceholders = useMemo(
    () => SYSTEM_PLACEHOLDERS.filter((p) =>
      p.appliesTo === 'all' ||
      (Array.isArray(p.appliesTo) ? p.appliesTo.includes(trigger) : p.appliesTo === trigger)
    ),
    [trigger]
  );

  // ── CC / BCC chip helpers ──────────────────────────────────────────────────
  const addCc = () => {
    const v = newCc.trim();
    if (v && !cc.includes(v)) setCc([...cc, v]);
    setNewCc('');
  };
  const addBcc = () => {
    const v = newBcc.trim();
    if (v && !bcc.includes(v)) setBcc([...bcc, v]);
    setNewBcc('');
  };

  // ── Custom attachments ─────────────────────────────────────────────────────
  const handleAttachmentUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments per template.`);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('File too large. Max 2MB per attachment.');
      return;
    }
    const total = attachments.reduce((s, a) => s + (a.size || 0), 0) + file.size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      toast.error('Attachments exceed the 5MB combined limit for one email.');
      return;
    }

    setUploadingAtt(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/uploads/email-attachment', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAttachments((prev) => [
        ...prev,
        { name: res.data.name, path: res.data.path, size: res.data.size, content_type: res.data.content_type }
      ]);
      toast.success('Attachment uploaded — save the template to apply.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Attachment upload failed.');
    } finally {
      setUploadingAtt(false);
    }
  };

  const removeAttachment = (path) =>
    setAttachments((prev) => prev.filter((a) => a.path !== path));

  // ── Save / Preview / Send Test ─────────────────────────────────────────────
  const handleSave = async () => {
    const html = editor?.getHTML() || '';
    // Subject/body are only required when the email will actually send.
    if (isActive) {
      if (!subject.trim()) { toast.error('Subject is required.'); return; }
      if (!html.trim() || html === '<p></p>') { toast.error('Body is required.'); return; }
    }

    setSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}/email-templates/${trigger}`, {
        subject:                subject.trim(),
        body_html:              html,
        to_override:            toOverride.trim() || null,
        cc,
        bcc,
        reply_to:               replyTo.trim() || null,
        email_sender_id:        emailSenderId || null,
        attach_filled_form_pdf: attachPdf,
        attachments,
        is_active:              isActive
      });
      toast.success('Template saved.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPrev(true);
    try {
      const res = await api.post(`/campaigns/${campaignId}/email-templates/${trigger}/preview`);
      setPreviewData(res.data);
      setShowP(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Preview failed.');
    } finally {
      setPrev(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) { toast.error('Enter an email address.'); return; }
    setST(true);
    try {
      const res = await api.post(
        `/campaigns/${campaignId}/email-templates/${trigger}/send-test`,
        { to_email: testEmail.trim() }
      );
      if (res.data?.sent) {
        toast.success(`Test email sent to ${testEmail.trim()}`);
        setShowTest(false);
        setTestEmail('');
      } else {
        toast.error('Email service did not accept the message.');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Test send failed.');
    } finally {
      setST(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Slim premium header/toolbar — compact so it doesn't steal editor height */}
        <div className="ke-card p-4 md:px-5 mb-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/campaigns/${campaignId}/email-templates`)}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Templates
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="ke-medallion flex-shrink-0"
                style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
              >
                <Mail className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">Email Template</div>
                <h1 className="text-xl md:text-2xl font-outfit font-bold text-foreground tracking-tight">{meta.title}</h1>
                <p className="text-sm text-muted-foreground font-jakarta mt-0.5">{meta.hint}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview} disabled={previewing}>
                {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                Preview
              </Button>
              <Button variant="outline" onClick={() => setShowTest(true)}>
                <Send className="w-4 h-4 mr-2" />
                Send Test
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* ── Left column: editor form ────────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Send toggle — when off, this email is never sent */}
            <Card className={`ke-card p-4 ${isActive ? 'bg-green-50 border-green-200' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground font-jakarta font-semibold">
                    {isActive ? 'This email is ON' : 'This email is OFF'}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isActive
                      ? 'Registrants will receive this email when it is triggered.'
                      : 'This email will not be sent. It is also exempt from the “subject + body required” check for activating the event.'}
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </Card>

            {/* Subject */}
            <Card className="ke-card p-4">
              <Label className="text-foreground font-jakarta font-medium mb-2 block">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => (focusedFieldRef.current = 'subject')}
                placeholder="e.g. Registration Confirmed — ${event_name}"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground mt-1">Tip: click a placeholder on the right to insert at cursor.</p>
            </Card>

            {/* To / CC / BCC / Reply-To */}
            <Card className="ke-card p-4 space-y-4">
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">
                  To (override)
                </Label>
                <Input
                  value={toOverride}
                  onChange={(e) => setToOverride(e.target.value)}
                  onFocus={() => (focusedFieldRef.current = 'toOverride')}
                  placeholder="Leave empty to send to the registrant's email"
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Override the recipient. Supports placeholders like <code>{'${email}'}</code>. Most templates leave this blank.
                </p>
              </div>

              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">CC</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {cc.map((e) => (
                    <span key={e} className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm text-foreground">
                      {e}
                      <button onClick={() => setCc(cc.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newCc}
                    onChange={(e) => setNewCc(e.target.value)}
                    onFocus={() => (focusedFieldRef.current = 'newCc')}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCc())}
                    placeholder="email@example.com"
                    className="h-10 flex-1"
                  />
                  <Button onClick={addCc} variant="outline" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">BCC</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {bcc.map((e) => (
                    <span key={e} className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm text-foreground">
                      {e}
                      <button onClick={() => setBcc(bcc.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newBcc}
                    onChange={(e) => setNewBcc(e.target.value)}
                    onFocus={() => (focusedFieldRef.current = 'newBcc')}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBcc())}
                    placeholder="email@example.com"
                    className="h-10 flex-1"
                  />
                  <Button onClick={addBcc} variant="outline" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">Reply-To (optional)</Label>
                <Input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  onFocus={() => (focusedFieldRef.current = 'replyTo')}
                  placeholder="support@yourorg.com"
                  className="h-11"
                />
              </div>

              {/* Sender Email (From) — per-template override of the verified DKIM sender */}
              <div>
                <Label className="text-foreground font-jakarta font-medium mb-2 block">Sender Email (From)</Label>
                <select
                  value={emailSenderId}
                  onChange={(e) => setEmailSenderId(e.target.value)}
                  className="w-full h-11 rounded-lg border border-border bg-background text-foreground px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">Use campaign default sender</option>
                  {emailSenders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} &lt;{s.email}&gt; {s.is_verified ? '✓' : '(unverified)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  This email goes out from the selected verified sender. Leave as default to use the
                  campaign's Notification Settings sender (or the platform default).{' '}
                  <a href="/dkim" className="text-primary hover:underline">Manage DKIM Senders →</a>
                </p>
              </div>
            </Card>

            {/* Body — TipTap editor */}
            <Card className="ke-card p-0 overflow-hidden">
              <EditorToolbar editor={editor} />
              <div
                className="email-tpl-editor"
                onClick={() => (focusedFieldRef.current = null)}
              >
                <EditorContent editor={editor} />
              </div>
            </Card>

            {/* Attach PDF toggle */}
            <Card className="ke-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground font-jakarta font-medium">Attach Filled Form as PDF</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Attaches a PDF of the registrant's submitted answers to this email.
                  </p>
                </div>
                <Switch checked={attachPdf} onCheckedChange={setAttachPdf} />
              </div>

              {/* Custom attachments */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Label className="text-foreground font-jakarta font-medium">Attachments</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Files attached to every email sent from this template. Max {MAX_ATTACHMENTS} files,
                      2MB each, 5MB total. Images, PDF, Word, Excel, CSV, TXT.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => attFileRef.current?.click()}
                    disabled={uploadingAtt || attachments.length >= MAX_ATTACHMENTS}
                  >
                    {uploadingAtt
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Paperclip className="w-4 h-4 mr-2" />}
                    {uploadingAtt ? 'Uploading…' : 'Add File'}
                  </Button>
                  <input
                    ref={attFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={handleAttachmentUpload}
                    className="hidden"
                  />
                </div>
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {attachments.map((a) => (
                      <span
                        key={a.path}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted rounded text-sm text-foreground"
                        title={a.name}
                      >
                        <Paperclip className="w-3 h-3 text-muted-foreground" />
                        <span className="max-w-[220px] truncate">{a.name}</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(a.size || 0)}</span>
                        <button
                          onClick={() => removeAttachment(a.path)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove attachment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── Right column: placeholder picker ────────────────────────────── */}
          <div className="col-span-12 lg:col-span-4">
            <Card className="ke-card p-4 sticky top-4">
              <h3 className="ke-section-title text-[15px]">Placeholders</h3>
              <div className="ke-rule-gold mt-2 mb-2" />
              <p className="text-xs text-muted-foreground font-jakarta mb-4">
                Click any item to insert it into the focused field (or the body if no field is focused).
              </p>

              <h4 className="text-xs font-jakarta font-semibold text-muted-foreground uppercase mb-2">System</h4>
              <div className="space-y-1 mb-5">
                {systemPlaceholders.map((p) => (
                  <button
                    key={p.token}
                    type="button"
                    onClick={() => insertPlaceholder(p.token)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-primary/10 text-sm group"
                  >
                    <code className="bg-muted px-1.5 py-0.5 rounded text-primary group-hover:bg-primary/20">{p.token}</code>
                    <span className="ml-2 text-xs text-muted-foreground">{p.label}</span>
                  </button>
                ))}
              </div>

              <h4 className="text-xs font-jakarta font-semibold text-muted-foreground uppercase mb-2">
                Form Fields ({formFields.length})
              </h4>
              {formFields.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-2">
                  No fields on this campaign's form yet. Add fields in the Form Builder to use them as placeholders.
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {formFields.map((f) => {
                    const token = `\${field:${f.label}}`;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => insertPlaceholder(token)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-primary/10 text-sm group"
                      >
                        <code className="bg-muted px-1.5 py-0.5 rounded text-primary group-hover:bg-primary/20 text-xs">
                          {token}
                        </code>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Sticky action bar — mirrors the header actions so Save stays reachable
            from the bottom of this long editor canvas. Same handlers, layout only. */}
        <div className="sticky bottom-0 z-30 mt-4 flex items-center justify-end gap-2 rounded-xl ke-glass px-4 py-3 shadow-lg">
          <Button variant="outline" onClick={handlePreview} disabled={previewing}>
            {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
            Preview
          </Button>
          <Button variant="outline" onClick={() => setShowTest(true)}>
            <Send className="w-4 h-4 mr-2" />
            Send Test
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="font-jakarta font-semibold shadow-sm hover:brightness-105"
            style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowP(false)}>
          <Card className="ke-card bg-card max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-border p-4 flex justify-between items-start">
              <div>
                <h3 className="font-outfit font-semibold text-lg text-foreground">Preview</h3>
                <p className="text-xs text-muted-foreground mt-1">Rendered against the most-recent registration (or sample data).</p>
              </div>
              <button onClick={() => setShowP(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div><span className="text-muted-foreground font-jakarta">Subject:</span> <strong>{previewData.subject}</strong></div>
              <div><span className="text-muted-foreground font-jakarta">To:</span> {previewData.to_name} &lt;{previewData.to_email}&gt;</div>
              {previewData.cc?.length > 0 && (
                <div><span className="text-muted-foreground font-jakarta">CC:</span> {previewData.cc.join(', ')}</div>
              )}
              {previewData.bcc?.length > 0 && (
                <div><span className="text-muted-foreground font-jakarta">BCC:</span> {previewData.bcc.join(', ')}</div>
              )}
              {previewData.reply_to && (
                <div><span className="text-muted-foreground font-jakarta">Reply-To:</span> {previewData.reply_to}</div>
              )}
              {previewData.attach_filled_form_pdf && (
                <div className="text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-1 flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" />
                  A PDF of the registrant's filled form will be attached to this email.
                </div>
              )}
              {previewData.attachments?.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-1">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Paperclip className="w-3 h-3" /> Attachments:
                  </span>{' '}
                  {previewData.attachments.map((a) => a.name).join(', ')}
                </div>
              )}
              <hr className="border-border" />
              <div className="bg-muted rounded p-4">
                <div dangerouslySetInnerHTML={{ __html: previewData.body_html }} />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Send Test Dialog */}
      {showTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowTest(false)}>
          <Card className="ke-card bg-card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-outfit font-semibold text-lg text-foreground">Send Test Email</h3>
                <p className="text-xs text-muted-foreground mt-1">Renders the template against sample data and sends it to the address below.</p>
              </div>
              <button onClick={() => setShowTest(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Label className="text-foreground font-jakarta mb-2 block">Test recipient</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="h-11 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTest(false)}>Cancel</Button>
              <Button onClick={handleSendTest} disabled={sendingTest || !testEmail.trim()}>
                {sendingTest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// ── TipTap toolbar ─────────────────────────────────────────────────────────
const EditorToolbar = ({ editor }) => {
  // Hooks must run unconditionally — keep them above the early return.
  const [uploadingImg, setUploadingImg] = useState(false);
  const imgFileRef = useRef(null);

  if (!editor) return null;

  const btn = (active) =>
    `p-1.5 rounded hover:bg-muted transition-colors ${active ? 'bg-muted text-primary' : 'text-muted-foreground'}`;

  // Link handler — works whether or not text is selected.
  // - With selection: wraps the selected text in <a>.
  // - Without selection: inserts the URL as a new linked text segment.
  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Enter URL', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const { empty } = editor.state.selection;
    if (empty) {
      // No selection — type the URL as the link text
      editor.chain().focus()
        .insertContent({
          type: 'text',
          text: url,
          marks: [{ type: 'link', attrs: { href: url } }]
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const setImage = () => {
    const url = window.prompt('Image URL');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  // Upload an image and insert it with an ABSOLUTE url — recipients' mail clients
  // can't resolve a relative /api/... path, so prefix the backend origin.
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploadingImg(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const absoluteUrl = `${process.env.REACT_APP_BACKEND_URL || ''}${res.data.url}`;
      editor.chain().focus().setImage({ src: absoluteUrl }).run();
      toast.success('Image uploaded.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Image upload failed.');
    } finally {
      setUploadingImg(false);
    }
  };

  return (
    <div className="border-b border-border p-2 flex flex-wrap gap-1 bg-muted">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}      className={btn(editor.isActive('bold'))}       title="Bold"><Bold className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}    className={btn(editor.isActive('italic'))}     title="Italic"><Italic className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))}  title="Underline"><UnderlineIcon className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}    className={btn(editor.isActive('strike'))}     title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
      <span className="w-px bg-border mx-1" />
      {/* Font family */}
      <select
        value={editor.getAttributes('textStyle').fontFamily || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="h-7 text-xs border border-border rounded px-1 bg-card text-foreground"
        title="Font family (applies to selection)"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value} style={{ fontFamily: f.value || undefined }}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <select
        value={editor.getAttributes('textStyle').fontSize || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontSize(v).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
        className="h-7 text-xs border border-border rounded px-1 bg-card text-foreground"
        title="Font size (applies to selection)"
      >
        <option value="">{DEFAULT_FONT_SIZE} (default)</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Text colour */}
      <label className={btn(false) + ' cursor-pointer flex items-center gap-1'} title="Text colour">
        <span className="text-xs font-bold">A</span>
        <span
          className="w-3 h-3 border border-border rounded-sm"
          style={{ background: editor.getAttributes('textStyle').color || '#000000' }}
        />
        <input
          type="color"
          value={editor.getAttributes('textStyle').color || '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="hidden"
        />
      </label>
      <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className={btn(false)} title="Clear text colour">
        <span className="text-xs">A↺</span>
      </button>

      {/* Highlight (background) colour */}
      <label className={btn(false) + ' cursor-pointer flex items-center gap-1'} title="Background highlight">
        <span className="text-xs font-bold">H</span>
        <span
          className="w-3 h-3 border border-border rounded-sm"
          style={{ background: editor.getAttributes('highlight').color || '#fde68a' }}
        />
        <input
          type="color"
          value={editor.getAttributes('highlight').color || '#fde68a'}
          onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
          className="hidden"
        />
      </label>
      <button type="button" onClick={() => editor.chain().focus().unsetHighlight().run()} className={btn(false)} title="Clear highlight">
        <span className="text-xs">H↺</span>
      </button>
      <span className="w-px bg-border mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}   className={btn(editor.isActive('bulletList'))}  title="Bullet List"><ListIcon className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}  className={btn(editor.isActive('orderedList'))} title="Numbered List"><ListOrdered className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}   className={btn(editor.isActive('blockquote'))}  title="Quote"><Quote className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}    className={btn(editor.isActive('codeBlock'))}   title="Code Block"><Code className="w-4 h-4" /></button>
      <span className="w-px bg-border mx-1" />
      <button type="button" onClick={setLink}   className={btn(editor.isActive('link'))} title="Insert Link"><LinkIcon className="w-4 h-4" /></button>
      <button type="button" onClick={setImage}  className={btn(false)}                    title="Insert Image from URL"><ImageIcon className="w-4 h-4" /></button>
      <button
        type="button"
        onClick={() => imgFileRef.current?.click()}
        className={btn(false)}
        title="Upload Image"
        disabled={uploadingImg}
      >
        {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      </button>
      <input
        ref={imgFileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
};

export default EmailTemplateEditor;
