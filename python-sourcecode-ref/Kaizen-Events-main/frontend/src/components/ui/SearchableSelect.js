import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Drop-in replacement for a native <select> that lets the user type to filter.
 *
 * Built for choice lists that outgrew a plain dropdown — club/member rosters run to
 * several hundred entries, where scrolling to find "AJAY MADAN (3080 DG 2021 - 22)"
 * is the whole problem. Every dropdown gets the search box, short ones included, so
 * registrants meet one consistent control and never have to work out which fields
 * they can type into. Raise SEARCH_THRESHOLD to hide it below a given option count.
 *
 * Deliberately hand-rolled rather than built on cmdk/Radix: it has to render inside
 * four unrelated hosts (public form, landing page, builder preview, dark-themed kiosk)
 * and each passes its own trigger classes.
 *
 * No hidden <select> is mirrored underneath because no host relies on native form
 * validation — every form here is noValidate and checks its own fields in JS. If a
 * form that DOES use browser validation ever renders this, it needs that mirror added.
 */

// Options needed before a search box appears. 0 = always show it.
const SEARCH_THRESHOLD = 0;

// Cap on rendered matches. Guards the DOM against a pathologically long roster;
// the user narrows the query rather than scrolling past a thousand rows.
const MAX_RENDERED = 200;

const THEMES = {
  light: {
    panel:       'bg-white border-slate-200 shadow-lg',
    searchWrap:  'border-slate-100',
    searchInput: 'text-slate-900 placeholder:text-slate-400',
    searchIcon:  'text-slate-400',
    option:      'text-slate-700',
    optionHover: 'bg-slate-100 text-slate-900',
    optionOn:    'text-primary font-medium',
    empty:       'text-slate-400',
    hint:        'text-slate-400 border-slate-100',
  },
  dark: {
    panel:       'bg-slate-800 border-slate-600 shadow-xl',
    searchWrap:  'border-slate-700',
    searchInput: 'text-white placeholder:text-slate-400',
    searchIcon:  'text-slate-400',
    option:      'text-slate-200',
    optionHover: 'bg-slate-700 text-white',
    optionOn:    'text-primary font-medium',
    empty:       'text-slate-400',
    hint:        'text-slate-400 border-slate-700',
  },
};

/**
 * Match on every whitespace-separated token independently, anywhere in the label.
 * Lets "madan 3080" find "AJAY MADAN (3080 DG 2021 - 22)" — with a plain substring
 * test that query finds nothing, which is exactly how people type a half-remembered name.
 */
const matches = (label, tokens) => {
  const haystack = label.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
};

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  searchPlaceholder = 'Type to search…',
  emptyText = 'No matches',
  disabled = false,
  required = false,
  className = '',
  theme = 'light',
  id,
  name,
  searchThreshold = SEARCH_THRESHOLD,
}) {
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [dropUp, setDropUp]       = useState(false);
  const [panelPos, setPanelPos]   = useState(null);

  const rootRef    = useRef(null);
  const triggerRef = useRef(null);
  const panelRef   = useRef(null);
  const inputRef   = useRef(null);
  const listRef    = useRef(null);

  const t = THEMES[theme] || THEMES.light;
  const showSearch = options.length >= searchThreshold;

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return options;
    return options.filter((o) => matches(String(o.label ?? ''), tokens));
  }, [options, query]);

  const visible  = filtered.slice(0, MAX_RENDERED);
  const overflow = filtered.length - visible.length;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
    setPanelPos(null);
  }, []);

  // Panel renders through a portal to <body> (see render below) so it's never
  // clipped by a host's own overflow:hidden card — it positions itself in
  // viewport coordinates from the trigger's rect instead of relying on normal
  // DOM flow. Open downward unless it would run off the bottom of the viewport —
  // these forms are long, so a field near the fold would otherwise open offscreen.
  const computePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const shouldDropUp = below < 280 && rect.top > below;
    setDropUp(shouldDropUp);
    setPanelPos({
      left: rect.left,
      width: rect.width,
      top: shouldDropUp ? undefined : rect.bottom + 4,
      bottom: shouldDropUp ? window.innerHeight - rect.top + 4 : undefined,
    });
  }, []);

  const openPanel = useCallback(() => {
    if (disabled) return;
    computePosition();
    setOpen(true);
    setActiveIdx(-1);
  }, [disabled, computePosition]);

  // Close on outside click / Escape. The panel lives in a portal outside
  // rootRef's subtree, so it needs its own "is this click inside" check.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Keep the panel anchored to the trigger as the page (or any scrollable
  // ancestor — capture:true catches those too) scrolls, or the viewport resizes.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', computePosition, true);
    window.addEventListener('resize', computePosition);
    return () => {
      window.removeEventListener('scroll', computePosition, true);
      window.removeEventListener('resize', computePosition);
    };
  }, [open, computePosition]);

  // Focus the search box on open so the user can just start typing.
  useEffect(() => {
    if (open && showSearch) inputRef.current?.focus();
  }, [open, showSearch]);

  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const pick = (opt) => {
    onChange?.(opt.value);
    close();
    triggerRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); openPanel(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, visible.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIdx >= 0 && visible[activeIdx]) pick(visible[activeIdx]);
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  const listboxId = id ? `${id}-listbox` : undefined;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onKeyDown}
        className={cn('text-left', className)}
      >
        <span className={cn('block truncate', !selected && 'text-slate-400')}>
          {selected ? selected.label : (value || placeholder)}
        </span>
      </button>

      {/* The trigger carries each host's own classes, so the caret is drawn here
          rather than as a background-image those classes would have to include. */}
      <ChevronDown
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-transform',
          theme === 'dark' ? 'text-slate-400' : 'text-slate-500',
          open && 'rotate-180'
        )}
        aria-hidden="true"
      />

      {/* Mirrors the value for anything that scrapes the DOM (autofill, e2e tests). */}
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      {open && panelPos && ReactDOM.createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: panelPos.left,
            width: panelPos.width,
            top: panelPos.top,
            bottom: panelPos.bottom,
          }}
          className={cn('z-[9999] rounded-lg border overflow-hidden', t.panel)}
        >
          {showSearch && (
            <div className={cn('flex items-center gap-2 px-3 border-b', t.searchWrap)}>
              <Search className={cn('h-4 w-4 shrink-0', t.searchIcon)} aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                className={cn(
                  'w-full h-11 bg-transparent text-sm font-jakarta focus:outline-none',
                  t.searchInput
                )}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className={cn('shrink-0 rounded p-0.5', t.searchIcon)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {visible.length === 0 && (
              <li className={cn('px-3 py-3 text-sm font-jakarta', t.empty)}>{emptyText}</li>
            )}

            {visible.map((opt, i) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <li key={`${opt.value}-${i}`}>
                  <button
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(opt)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn(
                      'w-full flex items-start gap-2 px-3 py-2 text-left text-sm font-jakarta',
                      t.option,
                      i === activeIdx && t.optionHover,
                      isSelected && t.optionOn
                    )}
                  >
                    <Check
                      className={cn('h-4 w-4 mt-0.5 shrink-0', !isSelected && 'opacity-0')}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{opt.label}</span>
                  </button>
                </li>
              );
            })}

            {overflow > 0 && (
              <li className={cn('px-3 py-2 text-xs font-jakarta border-t', t.hint)}>
                +{overflow} more — keep typing to narrow
              </li>
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
