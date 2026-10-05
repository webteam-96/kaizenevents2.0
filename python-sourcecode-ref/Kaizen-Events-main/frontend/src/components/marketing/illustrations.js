import React from 'react';
import {
  LayoutDashboard, CalendarDays, ClipboardList, CreditCard, QrCode, BarChart3,
  Search, ArrowUpRight,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   Decorative product-UI illustrations for the marketing home page.
   Pure SVG/HTML replicas styled to look like real Kaizen Events screenshots.
   No real data — visual only.
   ────────────────────────────────────────────────────────────────────────── */

const AREA_TOP = 'M0,62 C18,58 30,50 48,54 C66,58 78,30 100,38 C122,46 132,20 152,28 C172,36 184,14 200,20';

export const AreaChart = ({ stroke = '#091D40', id = 'ke-area' }) => (
  <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="w-full h-full">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={stroke} stopOpacity="0.22" />
        <stop offset="1" stopColor={stroke} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d={`${AREA_TOP} L200,80 L0,80 Z`} fill={`url(#${id})`} />
    <path d={AREA_TOP} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const Sparkline = ({ color = '#16a34a', d = 'M0,20 L10,16 L20,18 L30,10 L40,13 L50,5 L60,8' }) => (
  <svg viewBox="0 0 60 24" className="w-16 h-6">
    <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Donut = ({ size = 64 }) => (
  <div className="relative" style={{ width: size, height: size }}>
    <div
      className="w-full h-full rounded-full"
      style={{ background: 'conic-gradient(#091D40 0 126deg, #AC1E20 126deg 234deg, #CC9C4C 234deg 324deg, #cbd5e1 324deg 360deg)' }}
    />
    <div className="absolute rounded-full bg-white" style={{ inset: size * 0.16 }} />
  </div>
);

const QrGrid = ({ cells = 5, on = [], className = '' }) => (
  <div className={`grid gap-px ${className}`} style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
    {Array.from({ length: cells * cells }).map((_, i) => (
      <div key={i} className={`aspect-square ${on.includes(i) ? 'bg-[#091D40]' : 'bg-transparent'}`} />
    ))}
  </div>
);

/* QR pattern with 3 finder squares + scattered modules (looks like a real QR) */
const QR_ON = [
  0, 1, 2, 4, 5, 6, 10, 14, 16, 18, 20, 24, 28, 30,
  31, 32, 36, 40, 42, 44, 46, 48,
];

/* ── Hero / steps dashboard screenshot ── */
const SIDEBAR = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: CalendarDays, label: 'Events' },
  { icon: ClipboardList, label: 'Registrations' },
  { icon: CreditCard, label: 'Payments' },
  { icon: QrCode, label: 'Check-In' },
  { icon: BarChart3, label: 'Reports' },
];

const STAT_TILES = [
  { k: 'Registrations', v: '12,480', d: '+28%', c: 'text-[#091D40]' },
  { k: 'Revenue', v: '₹48.2L', d: '+19%', c: 'text-[#AC1E20]' },
  { k: 'Check-Ins', v: '8,732', d: '+32%', c: 'text-[#9a7126]' },
];

export const DashboardScreenshot = ({ className = '' }) => (
  <div className={`rounded-2xl bg-white border border-gray-100 shadow-2xl overflow-hidden flex ${className}`}>
    {/* sidebar */}
    <div className="hidden sm:flex flex-col w-[26%] bg-[#091D40] p-3">
      <div className="text-white font-extrabold text-[10px] tracking-tight mb-4">
        KAIZEN<span className="text-[#CC9C4C]"> EVENTS</span>
      </div>
      <div className="space-y-1.5">
        {SIDEBAR.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[8px] font-medium ${
              active ? 'bg-white/15 text-white' : 'text-white/55'
            }`}
          >
            <Icon className="w-2.5 h-2.5" />
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>
    </div>
    {/* main */}
    <div className="flex-1 p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold text-[#091D40]">Overview</span>
        <div className="flex items-center gap-1.5">
          <span className="h-4 w-10 rounded bg-gray-100" />
          <span className="h-4 w-8 rounded bg-[#CC9C4C]/30" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {STAT_TILES.map(({ k, v, d, c }) => (
          <div key={k} className="rounded-lg border border-gray-100 p-2">
            <p className="text-[7px] uppercase tracking-wide text-gray-400">{k}</p>
            <p className={`text-[12px] font-extrabold leading-tight ${c}`}>{v}</p>
            <p className="text-[7px] font-semibold text-green-600">{d} <span className="text-gray-300 font-normal">vs last 30 days</span></p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 rounded-lg border border-gray-100 p-2">
          <p className="text-[8px] font-semibold text-gray-500 mb-1">Registrations Over Time</p>
          <div className="h-16">
            <AreaChart id="ke-dash-area" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 p-2">
          <p className="text-[8px] font-semibold text-gray-500 mb-1.5">Ticket Type Distribution</p>
          <div className="flex items-center gap-2">
            <Donut size={42} />
            <div className="space-y-0.5">
              {[['#091D40', 'VIP'], ['#AC1E20', 'Regular'], ['#CC9C4C', 'Student'], ['#cbd5e1', 'Comp.']].map(([c, l]) => (
                <div key={l} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                  <span className="text-[6px] text-gray-400">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const HeroDashboard = () => (
  <div className="relative">
    <DashboardScreenshot />
    {/* floating: registrations live */}
    <div className="absolute -top-6 left-10 hidden sm:block rounded-xl bg-white shadow-xl border border-gray-100 px-4 py-2.5 animate-float">
      <p className="text-[9px] uppercase tracking-wide text-gray-400">Registrations Live</p>
      <div className="flex items-center gap-3">
        <p className="text-lg font-extrabold text-[#091D40] leading-none">12,480</p>
        <Sparkline color="#16a34a" />
      </div>
      <p className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" /> 28%</p>
    </div>
    {/* floating: revenue collected */}
    <div className="absolute -right-4 bottom-10 hidden sm:block rounded-xl bg-white shadow-xl border border-gray-100 px-4 py-2.5 animate-float-slow">
      <p className="text-[9px] uppercase tracking-wide text-gray-400">Revenue Collected</p>
      <div className="flex items-center gap-3">
        <p className="text-lg font-extrabold text-[#AC1E20] leading-none">₹48.2L</p>
        <Sparkline color="#CC9C4C" d="M0,18 L10,14 L20,16 L30,9 L40,12 L50,6 L60,3" />
      </div>
      <p className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" /> 19%</p>
    </div>
  </div>
);

/* ── Feature card illustrations ── */
const Frame = ({ children }) => (
  <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 p-3 mb-5 h-32 overflow-hidden">
    {children}
  </div>
);

export const FeatureRegistration = () => (
  <Frame>
    <div className="rounded-lg bg-white border border-gray-100 shadow-sm p-2.5 h-full">
      <div className="flex items-center gap-1.5 mb-2 rounded-md bg-gray-50 border border-gray-100 px-2 py-1">
        <Search className="w-2.5 h-2.5 text-gray-300" />
        <span className="h-1.5 w-12 rounded bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="block h-1 w-8 rounded bg-gray-300 mb-1" />
          <div className="h-4 rounded border border-gray-200 bg-white" />
        </div>
        <div>
          <span className="block h-1 w-8 rounded bg-gray-300 mb-1" />
          <div className="h-4 rounded border border-gray-200 bg-white" />
        </div>
        <div>
          <span className="block h-1 w-8 rounded bg-gray-300 mb-1" />
          <div className="h-4 rounded border border-gray-200 bg-white" />
        </div>
        <div className="flex items-end">
          <div className="h-4 w-full rounded bg-[#091D40]" />
        </div>
      </div>
    </div>
  </Frame>
);

export const FeatureCheckIn = () => (
  <Frame>
    <div className="flex items-center justify-center gap-3 h-full">
      {/* phone with QR */}
      <div className="w-14 rounded-xl bg-[#091D40] p-1.5 shadow-md">
        <div className="rounded-md bg-white p-1.5">
          <QrGrid cells={7} on={QR_ON} className="w-full" />
        </div>
        <div className="h-1 w-6 rounded bg-white/30 mx-auto mt-1" />
      </div>
      {/* badge printer */}
      <div className="relative">
        <div className="w-14 h-10 rounded-md bg-gray-200 border border-gray-300 flex items-end justify-center pb-1">
          <div className="w-9 h-1.5 rounded-full bg-gray-400" />
        </div>
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-5 rounded-sm bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center">
          <span className="block h-0.5 w-5 rounded bg-[#091D40] mb-0.5" />
          <span className="block h-0.5 w-3 rounded bg-gray-300" />
        </div>
      </div>
    </div>
  </Frame>
);

export const FeaturePayments = () => (
  <Frame>
    <div className="rounded-lg bg-white border border-gray-100 shadow-sm p-2.5 h-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="block h-1 w-10 rounded bg-gray-200 mb-1" />
          <span className="block text-[11px] font-extrabold text-[#091D40]">₹2,500</span>
        </div>
        <CreditCard className="w-4 h-4 text-[#AC1E20]" />
      </div>
      <div className="flex gap-1.5 mb-2">
        <span className="flex-1 h-4 rounded bg-[#091D40]/10 flex items-center justify-center text-[6px] font-bold text-[#091D40]">UPI</span>
        <span className="flex-1 h-4 rounded bg-[#CC9C4C]/25 flex items-center justify-center text-[6px] font-bold text-[#9a7126]">Card</span>
        <span className="flex-1 h-4 rounded bg-gray-100 flex items-center justify-center text-[6px] font-bold text-gray-400">EMI</span>
      </div>
      <div className="h-5 rounded-md bg-green-500 flex items-center justify-center text-[7px] font-bold text-white">Pay Securely</div>
    </div>
  </Frame>
);

export const FeatureAnalytics = () => (
  <Frame>
    <div className="rounded-lg bg-white border border-gray-100 shadow-sm p-2.5 h-full">
      <div className="flex items-center gap-3 mb-2">
        <div>
          <span className="block h-1 w-8 rounded bg-gray-200 mb-1" />
          <span className="block text-[11px] font-extrabold text-[#091D40]">₹48.2L</span>
        </div>
        <div>
          <span className="block h-1 w-8 rounded bg-gray-200 mb-1" />
          <span className="block text-[11px] font-extrabold text-green-600">+32%</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-1 h-12">
        {[[55, 38], [72, 50], [48, 66], [85, 44], [60, 78]].map(([a, b], i) => (
          <div key={i} className="flex-1 flex items-end gap-0.5">
            <div className="flex-1 rounded-t bg-[#091D40]" style={{ height: `${a}%` }} />
            <div className="flex-1 rounded-t bg-[#AC1E20]" style={{ height: `${b}%` }} />
          </div>
        ))}
      </div>
    </div>
  </Frame>
);

/* ── Steps section device cluster (on a navy panel) ── */
export const StepsDevices = () => (
  <div className="relative rounded-3xl bg-gradient-to-br from-[#091D40] to-[#16307a] p-8 sm:p-10 overflow-hidden">
    <div className="absolute inset-0 ke-grid opacity-50 pointer-events-none" />
    <div className="absolute -top-10 right-0 w-40 h-40 rounded-full bg-[#CC9C4C]/20 blur-3xl" />
    <div className="relative">
      {/* laptop */}
      <DashboardScreenshot className="!shadow-2xl" />
      <div className="mx-auto w-24 h-1.5 rounded-b-lg bg-black/30 mt-0.5" />
      {/* phone with QR ticket */}
      <div className="absolute -bottom-4 -left-4 w-24 rounded-2xl bg-white border-2 border-gray-200 shadow-2xl overflow-hidden animate-float">
        <div className="h-4 bg-[#091D40]" />
        <div className="p-2 flex flex-col items-center">
          <div className="rounded-md bg-white p-1 border border-gray-100">
            <QrGrid cells={7} on={QR_ON} className="w-12" />
          </div>
          <span className="block h-1 w-12 rounded bg-gray-200 mt-1.5" />
          <span className="block h-3 w-14 rounded bg-green-500/80 mt-1.5" />
        </div>
      </div>
      {/* revenue report card */}
      <div className="absolute -right-3 bottom-6 w-36 hidden sm:block rounded-xl bg-white shadow-2xl border border-gray-100 p-3 animate-float-slow">
        <p className="text-[8px] font-semibold text-gray-500 mb-1">Revenue Report</p>
        <p className="text-base font-extrabold text-[#091D40] mb-2">₹48.2L</p>
        <div className="flex items-end gap-1 h-12">
          {[40, 60, 48, 75, 55, 88, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-[#16a34a] to-[#4ade80]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  </div>
);
