# Kaizen Events — Design System

> The single source of truth for the redesign. All agents/pages consume these tokens; no page introduces its own colors, radii, shadows, or motion. Implemented on the existing **shadcn/ui + Tailwind** foundation, so the token layer re-skins every component.

## Brand palette

| Role | Hex | Usage |
|---|---|---|
| **Navy** | `#091D40` | Primary / structural — headers, primary CTAs, key text |
| **Gold** | `#CC9C4C` | Accent / highlights, focus ring, selected states |
| **Red** | `#AC1E20` | Attention / destructive / secondary emphasis |
| **White** | `#FFFFFF` | Light surfaces |
| **Off-white** | `#F7F7F5` | Light app background / muted surfaces |

No purple, blue-neon, or generic-SaaS palettes. (582 legacy purple/near-miss values were normalized out in Phase 2.)

## Token layer (`src/index.css`)

Colors are HSL triples on `:root` (light) and `.dark` (dark), consumed by `tailwind.config.js` via `hsl(var(--token))`. Semantic mapping preserved from the existing app so no page breaks:

- `--primary` = **navy** (light `218 75% 14%`, dark lifts to royal-navy `214 66% 52%` for contrast on the navy field) + `--primary-hover`, `--primary-subtle`
- `--accent` = **gold** (`38 56% 55%` / dark `38 60% 58%`) + `--accent-subtle`
- `--secondary` = `--destructive` = **red** (`359 70% 40%`)
- `--background` light = white; dark = deep navy `220 55% 8%`. `--card` dark = `220 48% 11%`
- `--foreground` light = navy ink `220 60% 12%`; dark = off-white `60 11% 96%`
- `--muted` = off-white / dark navy-grey; `--border`/`--input` = soft navy-grey
- `--ring` = **gold** (premium on-brand focus ring)
- `--chart-1..5` = brand-derived (navy, gold, red, steel-blue, light-gold) — **not** a rainbow
- `--radius` = `0.75rem`

## Theming

- `next-themes` `ThemeProvider` wired in `src/index.js` (`attribute="class"`, `defaultTheme="light"`, `storageKey="kaizen-theme"`, `disableTransitionOnChange`).
- Toggle: `src/components/ui/ThemeToggle.js` (in the shell top bar). Presentational only — no app state touched.
- **Rule for every redesigned page:** use semantic classes (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`, `bg-primary-subtle`, `bg-accent`, `text-destructive`). Do **not** hardcode hex or use `slate-*`/`white` for themed surfaces, or dark mode breaks.

## Typography

- Headings: **Outfit** (`font-outfit`), `-0.02em` tracking. Body: **Plus Jakarta Sans** (`font-jakarta`). Mono: **JetBrains Mono**. (Google Fonts, already loaded.)

## Components (shadcn/ui — reuse, don't reinvent)

`src/components/ui/` provides button, card, dialog, drawer/sheet, table, tabs, select, input, textarea, checkbox, radio, switch, badge, avatar, tooltip, dropdown-menu, popover, command (palette), toast/sonner, skeleton, breadcrumb, pagination, calendar, accordion, progress, separator, and more. All consume the tokens above. New shared components live here and are owned by the design system; feature pages consume them.

## Motion

- Prefer `transform`/`opacity` (GPU-friendly). Keep durations 150–300ms, restrained.
- Respect `prefers-reduced-motion` — already honored in `index.css` for the `ke-*` animations; new motion must too.

## Premium design language v2 (REQUIRED on every page)

The v1 token rebrand kept the original generic layouts. v2 elevates every page to a premium, distinctive look using reusable primitives in `src/index.css`. Apply these on **all** admin pages:

- **Page root:** wrap the page in `ke-atmos` and use generous padding (`p-4 md:p-6 lg:p-8`). This adds a calm navy/gold atmospheric field behind content.
- **Page header:** replace the plain title row with a **navy hero band** — `<div class="ke-hero p-6 md:p-7 mb-5"><div class="ke-hero-grid" />…</div>`. Inside (wrap content in `relative`): a small uppercase tracked eyebrow (`text-white/55`), an editorial `h1` (`text-3xl md:text-[34px] font-outfit font-bold tracking-tight`), a `text-white/70` subtitle, and the page's primary action(s) on the right (gold CTA via `style={{background:'hsl(var(--accent))',color:'#091D40'}}`, secondary as `bg-white/10 border border-white/20 text-white`). Back-links sit above/in the hero.
- **Cards/panels:** use `ke-card` (elevated surface) instead of `bg-card rounded-xl border border-border`; add `ke-card-hover` to clickable cards. Pad `p-5`.
- **Section titles:** `<h3 class="ke-section-title text-[15px]">…</h3>` followed by `<div class="ke-rule-gold mt-2 mb-2" />` (gold hairline).
- **Icon medallions:** for stat/feature icons use `<span class="ke-medallion" style={{background:'linear-gradient(150deg, <soft-accent>, transparent 85%)'}}><Icon style={{color:'<accent>'}} /></span>`.
- **KPI/stat cards:** elevated `ke-card` with an accent top-hairline (`absolute inset-x-0 top-0 h-[3px]` gradient), uppercase tracked label, large `text-[28px] font-outfit` value, medallion. (See `components/dashboard/KpiTile.js` as the reference.)
- **Tables:** wrap in `ke-card`; header row `bg-muted` with uppercase tracked `text-muted-foreground` labels; `hover:bg-muted/50 transition-colors` rows; right-align + `tabular-nums` for money.
- **Glass** (`ke-glass`) only on sticky toolbars/bars. Keep motion restrained (hover lift only); honor `prefers-reduced-motion`.

The **Dashboard** (`pages/Dashboard.js`) is the canonical reference implementation — match its hero, KPI cards, and card framing.

## Do / Don't

- ✅ `bg-primary-subtle` for light navy tints (opacity modifiers on token colors are unreliable — the tokens lack the `<alpha-value>` slot).
- ✅ Status colors: green=success, amber=warning, red=error/destructive (keep semantic status hues; only the purple family was removed).
- ❌ No new hardcoded brand hex in JS. ❌ No `slate-*`/`bg-white` on themed admin surfaces.
