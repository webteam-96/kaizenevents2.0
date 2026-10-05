// Shared client-side registrations exporter (.xlsx). Used by the Events page
// card button AND Campaign Detail → "Export & More" → Export Registrations,
// so every download shows the same thing regardless of backend version:
//   - choice fields (dropdown/radio/checkbox) show the option LABEL, not the slug
//   - orphaned values (option edited/deleted after registration) are humanized
//   - Created At is real local (IST) time, parsed from the backend's naive-UTC string
//   - rows are oldest-first → the newest registration is the last row
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import api from '../services/api';
import { richTextToPlain } from '../components/ui/RichTextInput';
import { parseServerDate, serverDateMs } from './serverTime';
import { humanizeOptionValue } from './optionLabels';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;
// Upload URLs are stored server-relative (/api/uploads/...) — prefix with the API
// origin so the exported cell is a working link, not a dead relative path.
const toAbsUrl = (url) => (typeof url === 'string' && url.startsWith('/api/') ? `${API_BASE_URL}${url}` : (url || ''));

// Upgrade plain string cells into real, clickable Excel hyperlinks (SheetJS `l` cell
// prop) so a file upload opens on click instead of reading as dead "filename — url"
// text. `links` items: { rowIndex, header, url, text }. Header is matched against the
// sheet's header row (row 0); data rows start at row 1.
export function applyFileHyperlinks(ws, links) {
  if (!ws || !ws['!ref'] || !links || !links.length) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const headerToCol = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (h && h.v != null) headerToCol[String(h.v)] = c;
  }
  links.forEach(({ rowIndex, header, url, text }) => {
    const c = headerToCol[header];
    if (c === undefined || !url) return;
    const addr = XLSX.utils.encode_cell({ r: range.s.r + 1 + rowIndex, c });
    ws[addr] = { t: 's', v: text || url, l: { Target: url } };
  });
}

/**
 * Fetches a campaign's registrations + form config and downloads an .xlsx.
 * Returns the number of exported rows (0 = nothing to export, no file written).
 * Throws on network/API failure — callers decide how to toast.
 */
export async function exportRegistrationsXlsx(campaign) {
  const [regRes, formRes] = await Promise.all([
    api.get(`/campaigns/${campaign.id}/registrations`),
    api.get(`/campaigns/${campaign.id}/form`).catch(() => ({ data: null })),
  ]);
  // Oldest first → newest registration ends up on the last row.
  const registrations = (regRes.data || []).slice().sort(
    (a, b) => serverDateMs(a.created_at) - serverDateMs(b.created_at)
  );
  if (!registrations.length) return 0;

  // Build field ID → label / type / {optionValue: optionLabel} from form config
  const fieldLabels = {};
  const fieldTypes = {};
  const fieldOptions = {};
  if (formRes.data?.fields) {
    formRes.data.fields.forEach((f) => {
      if (f.id && f.label) fieldLabels[f.id] = f.label;
      if (f.id) fieldTypes[f.id] = f.type;
      if (f.id && Array.isArray(f.options) && f.options.length) {
        const m = {};
        f.options.forEach((o) => {
          const v = o.value ?? o.label;
          if (v !== undefined && v !== null) m[String(v)] = o.label ?? String(v);
        });
        fieldOptions[f.id] = m;
      }
    });
  }
  const getFieldLabel = (id) => fieldLabels[id] || id.replace(/_/g, ' ');
  // No exact option match (option edited/deleted after registration) → humanize the slug.
  const resolveChoiceLabel = (id, value) => {
    const m = fieldOptions[id];
    if (!m) return value;
    if (Array.isArray(value)) return value.map((v) => m[String(v)] ?? humanizeOptionValue(v));
    return m[String(value)] ?? humanizeOptionValue(value);
  };

  const fileLinks = [];
  const data = registrations.map((reg, rowIndex) => {
    const row = {
      'Invoice Number': reg.invoice_number || '',
      // Custom per-event number when configured, else the familiar 8-char short id
      'Registration No': reg.registration_number || reg.id.slice(0, 8).toUpperCase(),
      'Registration ID': reg.id,
      'Payment Status': reg.payment_status,
      'Registration Status': reg.registration_status,
      'Total Amount': reg.total_amount,
      'Payment ID': reg.payment_id || '',
      // parseServerDate treats the naive UTC string as UTC → renders local (IST) time
      'Created At': parseServerDate(reg.created_at) ? format(parseServerDate(reg.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
    };
    Object.keys(reg.form_data || {}).forEach((key) => {
      const raw = reg.form_data[key];
      let cell;
      if (fieldTypes[key] === 'rich_text') {
        cell = richTextToPlain(raw);
      } else if (fieldOptions[key]) {
        const mapped = resolveChoiceLabel(key, raw);
        cell = Array.isArray(mapped) ? mapped.join(', ') : mapped;
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.url) {
        // file_upload → a real clickable hyperlink (filename as display text, file as
        // target). This plain value is a fallback; applyFileHyperlinks() upgrades the
        // cell to a hyperlink after the sheet is built.
        const abs = toAbsUrl(raw.url);
        cell = raw.name || abs;
        fileLinks.push({ rowIndex, header: getFieldLabel(key), url: abs, text: cell });
      } else if (typeof raw === 'boolean') {
        // terms_checkbox etc. → readable instead of TRUE/FALSE
        cell = raw ? 'Yes' : '';
      } else {
        cell = raw;
      }
      row[getFieldLabel(key)] = cell;
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  applyFileHyperlinks(ws, fileLinks);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
  XLSX.writeFile(wb, `${campaign.slug}_registrations_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  return registrations.length;
}
