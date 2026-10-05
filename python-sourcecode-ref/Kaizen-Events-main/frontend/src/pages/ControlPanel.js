import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import {
  Users, Shield, Plug, ChevronRight, Settings, Activity, UserCheck, CreditCard, CheckSquare, FileBadge, Archive, Banknote
} from 'lucide-react';

// Brand/semantic accent HSL bodies for the feature medallions — all resolve through the
// design tokens so the icons re-skin in light and dark. Navy/gold/red/steel are brand;
// success/warning stay semantic. Presentation-only.
const ACCENT = {
  navy: 'var(--chart-1)',
  gold: 'var(--chart-2)',
  red: 'var(--chart-3)',
  steel: 'var(--chart-4)',
  success: '152 58% 40%',
  warning: '38 92% 48%',
};

const ControlPanel = () => {
  const { user, isSuperAdmin } = useAuth();

  // Check if user can view activity logs (Directors or Super Admins)
  const canViewActivityLogs = isSuperAdmin() || user?.can_approve_transfers;

  const controlItems = [
    {
      title: 'User Management',
      description: 'Manage users, roles, and permissions',
      icon: Users,
      path: '/control-panel/users',
      accent: ACCENT.navy,
      group: 'Access & People'
    },
    {
      title: 'Payment Accounts',
      description: 'Manage payment gateway accounts and credentials',
      icon: CreditCard,
      path: '/payment-accounts',
      accent: ACCENT.success,
      group: 'Payments & Finance'
    },
    // Cashfree KYC - hidden from kiosk volunteers
    ...(user?.role !== 'kiosk_volunteer' ? [{
      title: 'Cashfree KYC',
      description: 'Manage Cashfree vendor KYC for Easy Split (commission + settlement)',
      icon: FileBadge,
      path: '/cashfree-kyc',
      accent: ACCENT.gold,
      group: 'Payments & Finance'
    }] : []),
    // Razorpay Route Accounts - hidden from kiosk volunteers
    ...(user?.role !== 'kiosk_volunteer' ? [{
      title: 'Razorpay Route Accounts',
      description: 'Manage Razorpay Linked Accounts for per-event payment splits',
      icon: Banknote,
      path: '/razorpay-route',
      accent: ACCENT.navy,
      group: 'Payments & Finance'
    }] : []),
    // Approvals - only for users with approval permission
    ...(user?.can_approve_transfers ? [{
      title: 'Approvals',
      description: 'Review and approve pending fund transfers',
      icon: CheckSquare,
      path: '/approvals',
      accent: ACCENT.warning,
      group: 'Payments & Finance'
    }] : []),
    {
      title: 'Kiosk Volunteers',
      description: 'Manage volunteers for on-site kiosk registration',
      icon: UserCheck,
      path: '/kiosk-volunteers',
      accent: ACCENT.steel,
      group: 'Access & People'
    },
    // Platform-wide integrations + DKIM are Super-Admin only
    ...(isSuperAdmin() ? [
      {
        title: 'Integrations',
        description: 'Configure Email, Google Sheets, and WhatsApp templates for every event',
        icon: Plug,
        path: '/control-panel/integrations',
        accent: ACCENT.navy,
        group: 'Platform & Security'
      },
      {
        title: 'DKIM Registration',
        description: 'Manage email domains and sender verification',
        icon: Shield,
        path: '/control-panel/dkim',
        accent: ACCENT.success,
        group: 'Platform & Security'
      },
    ] : []),
    // Instamojo For Accounts — Director / Super Admin only (password-gated on entry)
    ...(canViewActivityLogs ? [{
      title: 'Instamojo For Accounts',
      description: 'Finance view of Instamojo transactions, payouts, and reports',
      icon: Archive,
      path: '/instamojo',
      accent: ACCENT.navy,
      group: 'Payments & Finance'
    }] : []),
    // Activity Logs - only for Directors and Super Admins
    ...(canViewActivityLogs ? [{
      title: 'Activity Logs',
      description: 'View all system changes and audit trail',
      icon: Activity,
      path: '/activity-logs',
      accent: ACCENT.warning,
      group: 'Platform & Security'
    }] : [])
  ];

  // Presentation-only grouping: fixed section order for discoverability.
  const sectionOrder = ['Access & People', 'Payments & Finance', 'Platform & Security'];
  const sections = sectionOrder
    .map((name) => ({ name, items: controlItems.filter((item) => item.group === name) }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="ke-atmos min-h-screen p-4 md:p-6 lg:p-8">
      {/* Hero header */}
      <div className="ke-hero p-6 md:p-7 mb-5">
        <div className="ke-hero-grid" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-white/55">System</div>
            <h1 className="text-3xl md:text-[34px] font-outfit font-bold tracking-tight mt-1">Control Panel</h1>
            <p className="text-white/70 text-sm font-jakarta mt-1.5">Settings, access and integrations for the whole platform.</p>
          </div>
          <span className="hidden sm:flex w-12 h-12 rounded-2xl items-center justify-center bg-white/10 border border-white/20">
            <Settings className="w-6 h-6 text-white" />
          </span>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="ke-card flex flex-col items-center justify-center py-16 text-center">
          <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(var(--chart-1) / 0.16), transparent 85%)' }}>
            <Settings className="w-6 h-6" style={{ color: 'hsl(var(--chart-1))' }} />
          </span>
          <h3 className="text-lg font-outfit font-semibold text-foreground mt-4">No settings available</h3>
          <p className="text-sm text-muted-foreground font-jakarta mt-1 max-w-sm">
            You don't have access to any control panel sections yet. Contact an administrator if you need access.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.name}>
              <h3 className="ke-section-title text-[15px]">{section.name}</h3>
              <div className="ke-rule-gold mt-2 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {section.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Card className="ke-card ke-card-hover border-0 p-5 cursor-pointer group h-full">
                      <div className="flex items-start justify-between">
                        <span className="ke-medallion" style={{ background: `linear-gradient(150deg, hsl(${item.accent} / 0.16), transparent 85%)` }}>
                          <item.icon className="w-6 h-6" style={{ color: `hsl(${item.accent})` }} />
                        </span>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                      </div>
                      <h3 className="text-lg font-outfit font-semibold text-foreground mt-4">{item.title}</h3>
                      <p className="text-sm text-muted-foreground font-jakarta mt-1">{item.description}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default ControlPanel;
