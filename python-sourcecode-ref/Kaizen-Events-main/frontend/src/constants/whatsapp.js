// Shared trigger metadata for both the per-campaign editor (components/WhatsAppTemplates.js) and
// the cross-campaign manager (pages/WhatsAppTemplatesManager.js), so the two never drift on what
// a trigger is called or what its standard wording/variables are.

// The three ways to send the registration confirmation. Exactly one can be on at a time per
// campaign — the backend switches the others off — and all off means no WhatsApp is sent.
export const COMMON = 'common_confirmation';
export const COMMON_DETAILED = 'common_confirmation_detailed';
export const CUSTOM = 'registration_confirmed';

export const OPTIONS = [
  {
    key: COMMON,
    label: 'Standard confirmation',
    desc: 'The same approved message for every event. Nothing to map — just turn it on.',
  },
  {
    key: COMMON_DETAILED,
    label: 'Standard confirmation (detailed)',
    desc: 'Same as above, plus registration type and amount paid. Events with no registration type just send that line blank.',
  },
  {
    key: CUSTOM,
    label: 'Custom template',
    desc: "Your own approved template, with variables mapped to each event's form fields.",
  },
];

// Both standard options' wording, fixed by what Meta approved. Shown so the admin can see
// exactly what goes out; their variables are not editable for the same reason.
export const COMMON_TEMPLATE_INFO = {
  [COMMON]: {
    lines: [
      'Hello {{1}},',
      '',
      '✅ Your registration for {{2}} has been successfully confirmed.',
      '',
      '📧 A confirmation receipt has been sent to your registered email address: {{3}}.',
      '',
      'Thank you for your registration.',
    ],
    variables: [
      { slot: '{{1}}', value: '${name}', label: "Registrant's name" },
      { slot: '{{2}}', value: '${event_name}', label: 'Event name' },
      { slot: '{{3}}', value: '${email}', label: "Registrant's email address" },
    ],
  },
  [COMMON_DETAILED]: {
    lines: [
      'Hello {{1}},',
      '',
      '✅ Your registration for {{2}} has been successfully confirmed.',
      '',
      '📋 Registration Details',
      '',
      'Name: {{1}}',
      'Email: {{3}}',
      'Registration Type: {{4}}',
      '',
      'Amount Paid: {{5}}',
      '',
      '📧 A confirmation receipt has been sent to your registered email address {{3}}.',
      '',
      'Thank you for registering for {{2}}.',
      'We look forward to your participation.',
    ],
    variables: [
      { slot: '{{1}}', value: '${name}', label: "Registrant's name" },
      { slot: '{{2}}', value: '${event_name}', label: 'Event name' },
      { slot: '{{3}}', value: '${email}', label: "Registrant's email address" },
      { slot: '{{4}}', value: '${field:Registration Type}', label: 'Registration type — sends blank if this event has no such field' },
      { slot: '{{5}}', value: '${amount}', label: 'Amount paid' },
    ],
  },
};

// Still wired up in the backend and still sent if switched on, but no longer part of the normal
// setup. Surfaced only while one is actually active, so nothing sends unseen.
export const LEGACY_TRIGGERS = {
  payment_received: 'Payment Received',
  payment_otp: 'Payment OTP',
  registration_reminder: 'Registration Reminder',
};

// Event/payment values the backend resolves from the campaign + registration itself. These exist
// for every campaign regardless of how the form is built. Each maps to one WhatsApp variable
// ({{1}}, {{2}}, …) in the order listed in a template's body values.
export const SYSTEM_PLACEHOLDERS = [
  '${name}', '${event_name}', '${amount}', '${registration_id}', '${invoice_number}',
  '${organization}', '${otp}', '${receipt_number}', '${phone}', '${email}',
  '${registration_date}', '${event_date}', '${payment_status}',
];

export const labelForTrigger = (key) =>
  OPTIONS.find((t) => t.key === key)?.label || LEGACY_TRIGGERS[key] || key;
