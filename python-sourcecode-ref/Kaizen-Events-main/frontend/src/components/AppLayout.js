import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, X, Search, User, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import ThemeToggle from './ui/ThemeToggle';
import CommandPalette from './shell/CommandPalette';
import { getNavGroups } from '../config/navConfig';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from './ui/dropdown-menu';

// The nav panel is a fixed deep-navy surface in BOTH themes (brand "navy structural"),
// with gold accents — the marked flight-dashboard composition, on-brand.
const NAVY_BG = 'linear-gradient(180deg, #0c2350 0%, #07132e 100%)';
const GOLD = '#CC9C4C';
const NAVY = '#091D40';
const CREAM = '#F4F5F2';

const initialsOf = (u) => {
  const src = (u?.name || u?.email || 'U').trim();
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
};

const RoleLabel = { super_admin: 'Super Admin', org_admin: 'Org Admin', kiosk_volunteer: 'Kiosk Volunteer' };

// Decorative dotted "flight map" (brand flourish; not data).
const DottedMap = () => {
  const dots = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 20; c++) {
      if ((r === 0 && (c < 2 || c > 17)) || (r === 4 && (c < 1 || c > 18))) continue;
      dots.push([8 + c * 10.4, 12 + r * 14]);
    }
  }
  return (
    <svg viewBox="0 0 216 88" className="w-full h-auto" aria-hidden="true">
      {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.25" fill="#fff" fillOpacity="0.16" />)}
      <path d="M22,58 Q84,8 150,44" fill="none" stroke={GOLD} strokeWidth="1.5" strokeOpacity="0.9" />
      <path d="M58,66 Q120,28 192,54" fill="none" stroke={GOLD} strokeWidth="1.5" strokeOpacity="0.65" />
      {[[22, 58], [150, 44], [58, 66], [192, 54]].map(([x, y], i) => (
        <circle key={`e${i}`} cx={x} cy={y} r="2.4" fill={GOLD} />
      ))}
    </svg>
  );
};

const AppLayout = ({ children }) => {
  const { user, logout, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const navGroups = getNavGroups({ isSuperAdmin });
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((o) => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // ── Sidebar body (shared by desktop rail + mobile drawer) ──────────────────
  const SidebarBody = ({ onNavigate, onClose }) => (
    <div className="flex h-full flex-col text-white" style={{ background: NAVY_BG }}>
      {/* Profile */}
      <div className="relative shrink-0 px-5 pt-6 pb-5 text-center">
        {onClose && (
          <button onClick={onClose} aria-label="Close menu"
            className="absolute right-3 top-3 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="relative mx-auto h-[76px] w-[76px]">
          <svg className="absolute inset-0" viewBox="0 0 76 76" aria-hidden="true">
            <circle cx="38" cy="38" r="35" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="2" />
            <circle cx="38" cy="38" r="35" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray="158 220" transform="rotate(-90 38 38)" />
          </svg>
          <div className="absolute inset-[7px] grid place-items-center rounded-full text-lg font-bold tracking-wide text-white"
            style={{ background: 'linear-gradient(145deg, #14356e, #0a1c3f)' }}>
            {initialsOf(user)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="mx-auto mt-3 flex flex-col items-center rounded-lg px-3 py-1 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:#CC9C4C]">
              <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-white">
                {user?.name || user?.email?.split('@')[0] || 'Account'}
                <ChevronDown className="h-3.5 w-3.5 text-white/50" />
              </span>
              <span className="mt-0.5 max-w-[12rem] truncate text-[11px] text-white/55">{user?.email}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-52">
            {user?.role && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{RoleLabel[user.role] || user.role}</span>
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/change-password" className="cursor-pointer gap-2"><KeyRound className="h-4 w-4" /> Change Password</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav */}
      <nav className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 pb-2 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: GOLD, opacity: 0.9 }}>
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link key={item.path} to={item.path} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 py-2 pl-2 pr-3 font-jakarta text-sm font-medium transition-colors ${active ? 'ke-nav-active font-semibold' : 'rounded-xl text-white/85 hover:bg-white/[0.07]'}`}>
                    <span className={`relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'ke-nav-active-chip' : ''}`}
                      style={active ? { color: GOLD } : { background: 'rgba(255,255,255,0.06)', color: GOLD, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="relative z-[1] truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Active users (decorative brand flourish) */}
      <div className="shrink-0 border-t border-white/10 px-5 py-4">
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: GOLD, opacity: 0.9 }}>Active Users</p>
        <div className="flex items-center">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="-ml-2 grid h-8 w-8 place-items-center rounded-full ring-2 first:ml-0"
              style={{ background: `linear-gradient(145deg, #17408a, #0a1c3f)`, boxShadow: '0 0 0 2px #0b2350' }}>
              <User className="h-3.5 w-3.5 text-white/70" />
            </span>
          ))}
          <span className="-ml-2 grid h-8 w-8 place-items-center rounded-full text-sm font-bold ring-2"
            style={{ background: GOLD, color: NAVY, boxShadow: '0 0 0 2px #0b2350' }}>+</span>
        </div>
      </div>

      {/* Dotted flight map */}
      <div className="shrink-0 px-4 pb-5 pt-1">
        <DottedMap />
      </div>
    </div>
  );

  const Logo = ({ className = '' }) => (
    <Link to="/dashboard" className={`flex items-center ${className}`}>
      <img src="/kaizen-events-logo.png" alt="Kaizen Events"
        className="h-9 w-auto rounded-md dark:bg-white/95 dark:p-1 dark:shadow-sm" />
    </Link>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarBody />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarBody onNavigate={() => setSidebarOpen(false)} onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Content column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-3 sm:px-6">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"
            className="rounded-lg p-2 text-foreground hover:bg-muted lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <Logo />

          <button type="button" onClick={() => setCmdOpen(true)}
            className="ml-2 hidden sm:flex w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">
            <Search className="h-4 w-4" />
            <span>Search…</span>
            <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setCmdOpen(true)} aria-label="Search"
              className="sm:hidden rounded-lg p-2 text-foreground hover:bg-muted">
              <Search className="h-5 w-5" />
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main>{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
};

export default AppLayout;
