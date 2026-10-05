// Rich-text answer field — a full TipTap WYSIWYG editor used as a form INPUT
// (registrants type formatted answers). TinyMCE-style toolbar: formats, font
// family/size, bold/italic/underline/strike, alignment, lists, indent, blockquote,
// undo/redo, link, colour, highlight, sub/super-script, clear formatting, rule,
// table and special characters — plus a word/character counter.
// Also exports RichTextView: a SANITIZED read-only renderer for admin screens.
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List as ListIcon, ListOrdered, IndentIncrease, IndentDecrease,
  Quote, Undo2, Redo2, Link as LinkIcon, Unlink,
  Subscript as SubIcon, Superscript as SupIcon,
  Eraser, Minus, Table as TableIcon,
} from 'lucide-react';
import './RichTextInput.css';

// ── Custom extensions (font size / family via the shared TextStyle mark; indent
//    via a margin-left attribute on blocks). Same pattern as EmailTemplateEditor. ──
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
          renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
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
          renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontFamily: (family) => ({ chain }) => chain().setMark('textStyle', { fontFamily: family }).run(),
      unsetFontFamily: () => ({ chain }) => chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

const INDENT_STEP = 30;
const INDENT_MAX = 300;
const Indent = Extension.create({
  name: 'indent',
  addOptions() { return { types: ['paragraph', 'heading'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => parseInt(el.style.marginLeft, 10) || 0,
          renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent}px` } : {}),
        },
      },
    }];
  },
  addCommands() {
    const apply = (delta) => ({ editor, chain }) => {
      if (editor.isActive('listItem')) {
        return delta > 0
          ? chain().sinkListItem('listItem').run()
          : chain().liftListItem('listItem').run();
      }
      const cur = editor.getAttributes('paragraph').indent || editor.getAttributes('heading').indent || 0;
      const next = Math.max(0, Math.min(INDENT_MAX, cur + delta));
      return chain()
        .updateAttributes('paragraph', { indent: next })
        .updateAttributes('heading', { indent: next })
        .run();
    };
    return { indent: () => apply(INDENT_STEP), outdent: () => apply(-INDENT_STEP) };
  },
});

const FONT_FAMILIES = [
  { label: 'Font', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
];
const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px', '48px'];
const SPECIAL_CHARS = [
  '©', '®', '™', '°', '±', '×', '÷', '≈', '≠', '≤', '≥', 'µ', 'π', 'Ω', '∞', '√',
  '∑', '€', '£', '¥', '₹', '¢', '§', '¶', '†', '‡', '•', '…', '′', '″', '—', '–',
  '«', '»', '“', '”', '‘', '’', '¿', '¡', '→', '←', '↑', '↓', '★', '☆', '✓', '✗',
];

// ── Sanitization (registrant HTML is untrusted; always sanitize before render) ──
const SANITIZE_OPTS = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'ul', 'ol', 'li',
    'blockquote', 'a', 'span', 'mark', 'h1', 'h2', 'h3', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'colspan', 'rowspan', 'colwidth', 'align'],
  ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:|#)/i,
};
// Harden DOMPurify once (module load): keep only a safe CSS-property allowlist on
// inline styles (blocks position/width/z-index overlay clickjacking + url() tracking
// from raw-API-submitted HTML), and force rel=noopener on target=_blank links.
const SAFE_CSS_PROPS = ['color', 'background-color', 'font-size', 'font-family',
  'text-align', 'text-decoration', 'vertical-align', 'margin-left'];
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style') return;
  data.attrValue = String(data.attrValue)
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return false;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).toLowerCase();
      return SAFE_CSS_PROPS.includes(prop) && !val.includes('url(') && !val.includes('expression');
    })
    .join('; ');
});
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export const sanitizeRichText = (html) => DOMPurify.sanitize(String(html || ''), SANITIZE_OPTS);
export const richTextToPlain = (html) =>
  String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export const RichTextView = ({ html, className = '', bgColor = '', borderColor = '' }) => {
  if (!html || !richTextToPlain(html)) return <span className="text-slate-400">—</span>;
  // Optional background / border box around the content (configured per field).
  const boxed = Boolean(bgColor || borderColor);
  const style = boxed
    ? {
        background: bgColor || undefined,
        border: borderColor ? `1px solid ${borderColor}` : undefined,
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
      }
    : undefined;
  return (
    <div
      className={`rte-view ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
};

const Toolbar = ({ editor }) => {
  const [menu, setMenu] = useState(null); // 'chars' | 'table' | null
  if (!editor) return null;

  const btn = (active) =>
    `p-1.5 rounded hover:bg-slate-200 transition-colors ${active ? 'bg-slate-200 text-primary' : 'text-slate-600'}`;
  const sel = 'h-7 text-xs border border-slate-200 rounded px-1 bg-white text-slate-700';
  const sep = <span className="w-px h-5 bg-slate-200 mx-1" />;
  const item = 'block w-full text-left px-2 py-1 rounded hover:bg-slate-100 text-slate-700';

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Enter URL', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    const { empty } = editor.state.selection;
    if (empty) {
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const currentBlock = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';

  return (
    <div className="border-b border-slate-200 bg-slate-50 relative">
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}

      {/* Row 1 — formats, fonts, basic marks, alignment */}
      <div className="p-1.5 flex flex-wrap items-center gap-1 border-b border-slate-100">
        <select className={sel} title="Format" value={currentBlock}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: Number(v[1]) }).run();
          }}>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <select className={sel} title="Font family" value={editor.getAttributes('textStyle').fontFamily || ''}
          onChange={(e) => { const v = e.target.value; v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run(); }}>
          {FONT_FAMILIES.map((f) => (<option key={f.label} value={f.value} style={{ fontFamily: f.value || undefined }}>{f.label}</option>))}
        </select>
        <select className={sel} title="Font size" value={editor.getAttributes('textStyle').fontSize || ''}
          onChange={(e) => { const v = e.target.value; v ? editor.chain().focus().setFontSize(v).run() : editor.chain().focus().unsetFontSize().run(); }}>
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (<option key={s} value={s}>{s.replace('px', '')}</option>))}
        </select>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}      className={btn(editor.isActive('bold'))}       title="Bold"><Bold className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}    className={btn(editor.isActive('italic'))}     title="Italic"><Italic className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))}  title="Underline"><UnderlineIcon className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}    className={btn(editor.isActive('strike'))}     title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()}    className={btn(editor.isActive({ textAlign: 'left' }))}    title="Align left"><AlignLeft className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()}  className={btn(editor.isActive({ textAlign: 'center' }))}  title="Align center"><AlignCenter className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()}   className={btn(editor.isActive({ textAlign: 'right' }))}   title="Align right"><AlignRight className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={btn(editor.isActive({ textAlign: 'justify' }))} title="Justify"><AlignJustify className="w-4 h-4" /></button>
      </div>

      {/* Row 2 — lists, indent, blocks, history, link, colour, scripts, tools */}
      <div className="p-1.5 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}  className={btn(editor.isActive('bulletList'))}  title="Bullet list"><ListIcon className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Numbered list"><ListOrdered className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().outdent().run()} className={btn(false)} title="Decrease indent"><IndentDecrease className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().indent().run()}  className={btn(false)} title="Increase indent"><IndentIncrease className="w-4 h-4" /></button>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))} title="Quote"><Quote className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Horizontal line"><Minus className="w-4 h-4" /></button>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} title="Undo"><Undo2 className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} title="Redo"><Redo2 className="w-4 h-4" /></button>
        {sep}
        <button type="button" onClick={setLink} className={btn(editor.isActive('link'))} title="Insert link"><LinkIcon className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().unsetLink().run()} className={btn(false)} title="Remove link"><Unlink className="w-4 h-4" /></button>
        {sep}
        <label className={btn(false) + ' relative cursor-pointer flex items-center gap-1'} title="Text colour">
          <span className="text-xs font-bold">A</span>
          <span className="w-3 h-3 border border-slate-300 rounded-sm" style={{ background: editor.getAttributes('textStyle').color || '#000000' }} />
          {/* Kept in-layout (not display:none) but invisible, so the native colour
              popup anchors to this button instead of the viewport's top-left. */}
          <input type="color" value={editor.getAttributes('textStyle').color || '#000000'} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Text colour" />
        </label>
        <label className={btn(false) + ' relative cursor-pointer flex items-center gap-1'} title="Highlight">
          <span className="text-xs font-bold">H</span>
          <span className="w-3 h-3 border border-slate-300 rounded-sm" style={{ background: editor.getAttributes('highlight').color || '#fde68a' }} />
          <input type="color" value={editor.getAttributes('highlight').color || '#fde68a'} onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Highlight colour" />
        </label>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().toggleSubscript().run()}   className={btn(editor.isActive('subscript'))}   title="Subscript"><SubIcon className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleSuperscript().run()} className={btn(editor.isActive('superscript'))} title="Superscript"><SupIcon className="w-4 h-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().updateAttributes('paragraph', { indent: 0 }).updateAttributes('heading', { indent: 0 }).run()} className={btn(false)} title="Clear formatting"><Eraser className="w-4 h-4" /></button>
        {sep}
        {/* Special characters */}
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === 'chars' ? null : 'chars')} className={btn(menu === 'chars')} title="Special character"><span className="text-sm leading-none">Ω</span></button>
          {menu === 'chars' && (
            <div className="absolute z-20 top-9 left-0 bg-white border border-slate-200 rounded-md shadow-lg p-2 grid grid-cols-8 gap-1 w-64 max-h-48 overflow-y-auto">
              {SPECIAL_CHARS.map((c) => (
                <button key={c} type="button" onClick={() => { editor.chain().focus().insertContent(c).run(); setMenu(null); }} className="w-7 h-7 hover:bg-slate-100 rounded text-base">{c}</button>
              ))}
            </div>
          )}
        </div>
        {/* Table */}
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === 'table' ? null : 'table')} className={btn(editor.isActive('table'))} title="Table"><TableIcon className="w-4 h-4" /></button>
          {menu === 'table' && (
            <div className="absolute z-20 top-9 left-0 bg-white border border-slate-200 rounded-md shadow-lg p-1 w-44 text-sm">
              <button type="button" className={item} onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setMenu(null); }}>Insert table (3×3)</button>
              {editor.isActive('table') && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" className={item} onClick={() => editor.chain().focus().addRowAfter().run()}>Add row</button>
                  <button type="button" className={item} onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column</button>
                  <button type="button" className={item} onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</button>
                  <button type="button" className={item} onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</button>
                  <button type="button" className={item} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Toggle header row</button>
                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" className={item + ' text-red-600'} onClick={() => { editor.chain().focus().deleteTable().run(); setMenu(null); }}>Delete table</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RichTextInput = ({ value = '', onChange, placeholder = '', disabled = false }) => {
  // Keep onChange in a ref — TipTap binds the update handler once, so a plain
  // closure would freeze on the first render's onChange.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      FontSize,
      FontFamily,
      Color.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Indent,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || 'Type your answer…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const cb = onChangeRef.current;
      if (cb) cb(editor.isEmpty ? '' : editor.getHTML());
    },
  });

  // Sync when the external value changes (form reset / switching records).
  // Skip while focused so a parent that normalises the value can't yank the caret.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if ((value || '') !== current) editor.commands.setContent(value || '', false);
  }, [value, editor]);

  useEffect(() => { if (editor) editor.setEditable(!disabled); }, [disabled, editor]);

  const text = editor ? editor.getText() : '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const block = !editor ? 'p'
    : editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3'
    : editor.isActive('bulletList') || editor.isActive('orderedList') ? 'li' : 'p';

  return (
    <div className={`rte-input rounded-lg border border-slate-300 bg-white overflow-hidden ${disabled ? 'opacity-60' : ''}`}>
      {!disabled && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {!disabled && (
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-1 bg-slate-50 text-[11px] text-slate-400 font-jakarta">
          <span>{block}</span>
          <span>Words: {words} &nbsp;·&nbsp; Characters: {text.length}</span>
        </div>
      )}
    </div>
  );
};

export default RichTextInput;
