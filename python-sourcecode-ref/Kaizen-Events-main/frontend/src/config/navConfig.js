import {
  LayoutDashboard, FolderKanban, Wallet, ArrowLeftRight, CheckSquare,
  Landmark, CreditCard, Receipt, Users, UserCog, Settings, Plug,
  ShieldCheck, ScrollText,
} from 'lucide-react';

/**
 * Single source of truth for the admin primary navigation.
 * Grouped + role-gated. Consumed by the sidebar (desktop), the mobile drawer,
 * and the command palette — so they never drift apart.
 *
 * Every `path` here already exists as a route in App.js; this only surfaces
 * them. No routes, APIs, or workflows are changed.
 */
export function getNavGroups({ isSuperAdmin } = {}) {
  const superAdmin = typeof isSuperAdmin === 'function' ? isSuperAdmin() : !!isSuperAdmin;

  const groups = [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Campaigns',
      items: [
        { label: 'Events', path: '/campaigns', icon: FolderKanban },
      ],
    },
    {
      label: 'Finance',
      superAdmin: true,
      items: [
        { label: 'Payment Accounts', path: '/payment-accounts', icon: Wallet },
        { label: 'Fund Transfers', path: '/fund-transfers', icon: ArrowLeftRight },
        { label: 'Approvals', path: '/approvals', icon: CheckSquare },
        { label: 'Razorpay Route', path: '/razorpay-route', icon: Landmark },
        { label: 'Cashfree KYC', path: '/cashfree-kyc', icon: CreditCard },
        { label: 'Instamojo Archive', path: '/instamojo', icon: Receipt },
      ],
    },
    {
      label: 'People',
      superAdmin: true,
      items: [
        { label: 'Users', path: '/users', icon: Users },
        { label: 'Kiosk Volunteers', path: '/kiosk-volunteers', icon: UserCog },
      ],
    },
    {
      label: 'Control Panel',
      superAdmin: true,
      items: [
        { label: 'Control Panel', path: '/control-panel', icon: Settings },
        { label: 'Integrations', path: '/integrations', icon: Plug },
        { label: 'DKIM / Email', path: '/dkim', icon: ShieldCheck },
        { label: 'Activity Logs', path: '/activity-logs', icon: ScrollText },
      ],
    },
  ];

  return groups
    .filter((g) => !g.superAdmin || superAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.superAdmin || superAdmin) }))
    .filter((g) => g.items.length > 0);
}

/** Flattened list of all destinations the current user can reach (for the command palette). */
export function getNavDestinations(auth) {
  return getNavGroups(auth).flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
}
