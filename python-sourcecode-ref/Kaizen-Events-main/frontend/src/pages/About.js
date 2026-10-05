import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import Footer from '../components/Footer';
import {
  CreditCard, FileText, ArrowRight, Check, LogIn,
  Wallet, Smartphone, ShieldCheck, Share2,
  Calculator, RefreshCw, TrendingUp, Users, Calendar,
  CheckCircle2, Sparkles,
  Layers, Maximize2, SlidersHorizontal, QrCode, BarChart3, Palette, Globe,
  Briefcase, GraduationCap, PartyPopper, Video, Landmark, Store, Trophy, HeartHandshake,
  Ticket, Wrench, Award, WifiOff, Code2, Quote, ChevronDown,
} from 'lucide-react';

const NAVY     = '#091D40';
const CRIMSON  = '#AC1E20';
const GOLD     = '#CC9C4C';
const OBSIDIAN = '#171721';

// ── Animation helpers ─────────────────────────────────────────────────────────

// Reveal-on-scroll wrapper. Toggles the .is-visible class (defined in index.css)
// when the element enters the viewport. `delay` (ms) staggers grids of cards.
const Reveal = ({ children, delay = 0, className = '', as: Tag = 'div' }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.classList.add('is-visible');
        obs.disconnect();
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
};

// Animated counter — counts up from 0 when scrolled into view.
// Preserves suffixes like "+" / "%" and comma grouping ("3 Lakh+" passes through as-is).
const CountUp = ({ value, duration = 1500, className, style }) => {
  const ref = useRef(null);
  const [display, setDisplay] = useState(String(value));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const str = String(value);
    const m = str.match(/^([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) { setDisplay(str); return; }
    const num = parseFloat(m[1].replace(/,/g, ''));
    const suffix = m[2];
    const useCommas = m[1].includes(',');
    setDisplay('0' + suffix);
    let raf;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const cur = num % 1 === 0 ? Math.round(num * eased) : (num * eased).toFixed(1);
        setDisplay((useCommas ? Number(cur).toLocaleString('en-IN') : String(cur)) + suffix);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [value, duration]);
  return <span ref={ref} className={className} style={style}>{display}</span>;
};

const PAYMENT_BENEFITS = [
  { icon: CreditCard,  text: 'Manage the payment collection for any scale of events hosted by clubs.' },
  { icon: Wallet,      text: 'Collect money using different modes — Credit Cards, Debit Cards, Wallets, NEFT & UPI.' },
  { icon: Smartphone,  text: 'A smooth user experience for making payments on any device.' },
  { icon: ShieldCheck, text: 'No periodic bank reconciliation required. No huge suspense accounts.' },
  { icon: Share2,      text: 'Plug the payment link into your club website; share it on WhatsApp and email.' },
];

const FORM_BENEFITS = [
  'Capture mandatory data like Name, Mobile, Email ID and Club name, plus optional fields like T-shirt size and food preferences.',
  'The form automatically calculates the amount payable based on the preference combination selected by the participant.',
  'Automated, customised receipt / acknowledgement emails sent to participants on successful payment.',
  'Real-time auto-update on Google Sheets with all the details of every payment received.',
];

const STATS = [
  { icon: Calendar,    value: '500+',    label: 'Events Managed' },
  { icon: Users,       value: '3 Lakh+', label: 'Attendees' },
  { icon: TrendingUp,  value: '99.9%',   label: 'Uptime' },
  { icon: ShieldCheck, value: '',        label: 'Trusted by NGOs, Corporates and Government Bodies' },
];

// ── Why Kaizen Events ─────────────────────────────────────────────────────────
const WHY_CARDS = [
  { n: '01', icon: Layers,            t: 'One Platform, Zero Chaos',     d: 'Registrations, payments, attendance, and reports all live in a single, unified dashboard. No juggling between tools.' },
  { n: '02', icon: Maximize2,         t: 'Scales to Any Size',           d: 'Whether you are expecting 50 guests or 50,000 delegates, the platform scales effortlessly without compromising on speed or reliability.' },
  { n: '03', icon: SlidersHorizontal, t: 'Built to Be Customized',       d: 'Every event is unique. Customize registration forms, ticket categories, branding, workflows, and data fields to match your exact requirements.' },
  { n: '04', icon: CreditCard,        t: 'Secure Payment Processing',    d: 'Accept payments via UPI, Credit Cards, Debit Cards, Net Banking, and EMI options. Funds are settled securely, on time, every time.' },
  { n: '05', icon: QrCode,            t: 'Instant QR Code Check-In',     d: 'Say goodbye to paper lists and long queues. Every attendee receives a unique QR code. Your team scans it at the gate in under a second.' },
  { n: '06', icon: BarChart3,         t: 'Live Data, Live Decisions',    d: 'Access real-time attendance counts, revenue figures, and registration trends as they happen. Make informed decisions on the spot.' },
  { n: '07', icon: Palette,           t: 'Your Brand, Front and Centre', d: 'Fully white-labeled registration pages and event apps that carry your logo, colors, and identity. Attendees see your brand, not ours.' },
  { n: '08', icon: Globe,             t: 'Any Event, Any Format',        d: 'In-person, virtual, hybrid, ticketed, free, invite-only, public. Our platform handles every format with equal confidence.' },
];

// ── How It Works ──────────────────────────────────────────────────────────────
const STEPS = [
  { n: '1', t: 'Create Your Event',           d: 'Build a professional event page in minutes. Add your event name, date, venue or virtual link, agenda, speaker bios, and custom registration form. No design skills required.' },
  { n: '2', t: 'Set Up Tickets and Payments', d: 'Define your ticket categories, set prices, and activate your preferred payment methods. Attendees receive an instant confirmation email with their QR-coded ticket attached.' },
  { n: '3', t: 'Manage and Promote',          d: 'Track registrations as they come in through your real-time dashboard. Send automated reminders, manage your attendee list, and monitor revenue, all from one place.' },
  { n: '4', t: 'Check In and Analyse',        d: 'Use the Kaizen mobile check-in app at your venue for fast, paperless entry. Once the event wraps, access detailed analytics on attendance, engagement, and revenue to sharpen your next event.' },
];

// ── Events We Power ───────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { icon: Briefcase,      t: 'Corporate Conferences and Summits',   d: 'Multi-session events with delegate tiers, speaker management, and sponsor modules.' },
  { icon: GraduationCap,  t: 'Educational Seminars and Workshops',  d: 'Academic and professional training events with certificate generation and category-wise fees.' },
  { icon: PartyPopper,    t: 'Social and Community Gatherings',     d: 'Club meets, fundraisers, gala dinners, and annual celebrations managed with ease.' },
  { icon: Video,          t: 'Virtual and Hybrid Events',          d: 'Fully online or blended events with virtual check-in, recordings access, and live engagement tools.' },
  { icon: Landmark,       t: 'Government and Institutional Events', d: 'High-security, high-volume events with compliance-grade data handling and multi-location coordination.' },
  { icon: Store,          t: 'Trade Shows and Exhibitions',        d: 'Exhibitor portals, lead capture tools, floor plan management, and on-site badge printing.' },
  { icon: Trophy,         t: 'Sports Events and Tournaments',      d: 'Participant registration, category-wise entries, result tracking, and digital certificates.' },
  { icon: HeartHandshake, t: 'NGO and Membership Events',          d: 'Member-only access, donation collection, group registrations, and attendance tracking for community organizations.' },
];

// ── Solutions We Provide ──────────────────────────────────────────────────────
const SOLUTIONS = [
  {
    icon: Ticket, n: 'Solution 01', t: 'Event Registration and Ticketing',
    lead: 'Your registration page is the first impression your event makes. Make it count.',
    body: 'Kaizen Events gives you a powerful form builder and ticketing engine that lets you create a branded, professional registration experience in minutes. Collect the data you need, sell the tickets you want, and manage capacity with complete control.',
    features: [
      'Drag-and-drop registration form builder with conditional logic and custom fields',
      'Multi-tier ticketing: Free, Early Bird, Standard, VIP, Group, and Sponsor packages',
      'Promo code and discount management for members, partners, and bulk buyers',
      'Capacity management with automated waitlist activation',
      'Instant email confirmation with QR-coded e-ticket attached',
      'Bulk registration for corporate and institutional group bookings',
      'Multi-language form support for events with diverse attendee bases',
      'Custom registration workflows for complex, multi-stage data collection',
    ],
  },
  {
    icon: CreditCard, n: 'Solution 02', t: 'Secure Payment Processing',
    lead: 'Give your attendees the payment experience they expect and give yourself the financial clarity you deserve.',
    body: 'Kaizen Events integrates with trusted payment infrastructure to support every major payment method. Payments are processed securely, confirmations are instant, and your reconciliation reports are always accurate.',
    features: [
      'UPI payments including GPay, PhonePe, Paytm, and BHIM',
      'Credit Cards and Debit Cards across all major networks',
      'Net Banking for all major banks',
      'EMI options for premium and high-value event tickets',
      'PCI-DSS compliant payment infrastructure for complete security',
      'Instant payment confirmation and automated receipt generation',
      'Automated refund processing for cancellations within your defined policy',
      'Real-time payment reconciliation dashboard for your finance team',
      'GST invoice generation for corporate registrations',
    ],
  },
  {
    icon: QrCode, n: 'Solution 03', t: 'QR Code Attendance and Check-In System',
    lead: 'Long queues at the entrance are not just frustrating. They set the wrong tone for your entire event.',
    body: 'Kaizen Events replaces paper-based check-in with a fast, accurate, QR-powered attendance system that works at any scale. Every attendee carries their own unique QR code, and your staff scans it in under a second.',
    features: [
      'Unique QR code issued to every attendee at the moment of registration',
      'Mobile check-in scanner app for Android and iOS, available to all venue staff',
      'Multi-gate check-in with real-time synchronization across all entry points',
      'Offline mode for venues with limited or unreliable internet connectivity',
      'Instant duplicate entry detection with automated alerts',
      'Session-wise attendance tracking for multi-track conferences and workshops',
      'Live headcount dashboard visible to organizers as check-ins happen',
      'Post-event attendance export in Excel and CSV format',
    ],
  },
  {
    icon: BarChart3, n: 'Solution 04', t: 'Real-Time Reporting and Analytics',
    lead: 'The best event organizers make decisions based on data, not instinct. Kaizen Events gives you the visibility to do exactly that.',
    body: 'Your analytics dashboard updates in real time throughout the registration period and on the event day. Understand who is attending, how they are paying, when they are arriving, and how your revenue is tracking, all in one place.',
    features: [
      'Live registration count and revenue tracking as payments come in',
      'Attendee demographics: city, profession, age group, and ticket category breakdown',
      'Ticket category performance comparison to optimize future pricing',
      'Payment channel distribution reports',
      'Check-in velocity charts showing arrivals per hour on event day',
      'No-show analysis and final attendance rate calculations',
      'Exportable reports in PDF, Excel, and CSV for stakeholder sharing',
      'Custom report builder for board presentations and post-event reviews',
    ],
  },
  {
    icon: Smartphone, n: 'Solution 05', t: 'Branded Event Mobile App',
    lead: 'Your event deserves its own app. Not a link to a generic platform, but a fully branded, purpose-built mobile experience that puts your identity at the centre.',
    body: 'Available on Android and iOS, the Kaizen Events mobile app is designed around your attendees. It gives them everything they need before, during, and after the event, all in one place under your brand.',
    features: [
      'Full custom branding: your logo, colors, typography, and event identity',
      'Event agenda, session schedule, and speaker profiles with bios',
      'Interactive venue maps and floor plans for large, multi-hall events',
      'Push notifications for schedule updates, announcements, and room changes',
      'In-app networking: attendee directory, profile visibility, and direct messaging',
      'Live polls, Q and A sessions, and audience engagement tools',
      'Digital resource library: slide decks, brochures, and sponsor materials',
      'In-app feedback and session rating forms',
      'Post-event content access: recordings, certificates, and summary reports',
    ],
  },
  {
    icon: Wrench, n: 'Solution 06', t: 'Custom Event Solutions',
    lead: 'When your requirements go beyond what any off-the-shelf platform can offer, our team builds the solution from scratch.',
    body: 'Kaizen Infotech Solutions has a dedicated software development team with a proven track record of delivering complex, enterprise-grade technology for some of the largest organizations in the country. If you can describe the requirement, we can build it.',
    features: [
      'Custom registration portals with member authentication and role-based access',
      'White-label event platforms hosted under your own brand and domain',
      'CRM, ERP, and HRMS integration for seamless data flow within your organization',
      'Custom badge design and on-site badge printing with access control integration',
      'Multi-event management portals for organizations running recurring event series',
      'Membership card and physical access control system integration',
      'Custom API development for connecting with third-party tools and services',
      'Dedicated account manager and on-site technical support for critical events',
    ],
  },
];

// ── What Sets Us Apart ────────────────────────────────────────────────────────
const APART = [
  { icon: SlidersHorizontal, t: 'Built for Customization',           d: 'Most platforms give you templates. We give you flexibility. Every field, form, workflow, and feature can be tailored to your needs.' },
  { icon: Maximize2,         t: 'Designed for Scale',                d: 'Our infrastructure is battle-tested at high volumes, having supported platforms with over three lakh active users.' },
  { icon: CreditCard,        t: 'Payments That Work Everywhere',     d: 'UPI, cards, net banking, EMI. We support every payment method your attendees prefer, with instant confirmation and clean reconciliation.' },
  { icon: WifiOff,           t: 'Offline-Ready Check-In',            d: 'Our mobile check-in app functions even without internet. No connectivity, no problem.' },
  { icon: Code2,             t: 'A Real Development Team Behind You', d: 'When you need something custom, you are speaking directly to the engineers who will build it. Not a support ticket queue.' },
  { icon: Award,             t: 'Proven at Enterprise Scale',        d: 'We have delivered technology for government departments, Fortune-listed enterprises, and organizations with millions of members.' },
];

// ── Trusted By ────────────────────────────────────────────────────────────────
const TRUSTED_ORGS = [
  'Rotary International Zones 4, 5, 6 and 7',
  'Jain International Trade Organisation (JITO)',
  'Income Tax Department of India (Aaykar Kumbh App)',
  'Mumbai Port Trust',
  'ONGC',
  'Mangalore Refinery and Petrochemicals Limited (MRPL)',
];

const TESTIMONIALS = [
  { q: 'The platform handled over 10,000 registrations without a single glitch. Real-time reporting and QR check-in made our national conference completely seamless.', a: 'Conference Director, National Professional Association' },
  { q: 'We needed a custom registration form with conditional fields and multi-tier ticketing. Kaizen built exactly what we needed. The team was responsive and the result was outstanding.', a: 'Event Manager, Leading Club Organization' },
  { q: 'UPI payment integration made fee collection incredibly simple for our 8,000-member event. I would not go back to spreadsheets and manual transfers.', a: 'Secretary General, Regional NGO' },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'How quickly can I get my event registration page live?', a: 'For standard events, you can have a fully functional registration page live within 30 minutes of signing up. For custom workflows, white-label setups, or enterprise integrations, our team completes the configuration within 2 to 5 business days.' },
  { q: 'What payment methods do you support?', a: 'Kaizen Events supports UPI (Google Pay, PhonePe, Paytm, BHIM), Credit Cards, Debit Cards, Net Banking from all major banks, and EMI options for high-value tickets. Every transaction is processed through a PCI-DSS compliant payment gateway.' },
  { q: 'Can I get a branded mobile app for my event?', a: 'Yes. We build fully branded event mobile apps for Android and iOS with your logo, color scheme, event agenda, speaker profiles, networking features, and push notifications. Contact us for a custom app quote.' },
  { q: 'Is there a limit on the number of registrations the platform can handle?', a: 'There is no hard cap. Our platform is built on infrastructure designed for high-volume events. We have supported platforms with over three lakh active users. Whether you expect 200 or 200,000 registrations, the platform handles it without performance issues.' },
  { q: 'Do you provide support on the day of the event?', a: 'Yes. For large-scale and enterprise events, we offer dedicated on-site technical support teams who manage the check-in system, handle real-time issues, and ensure the event runs without a hitch. Remote support is available for all clients.' },
  { q: 'Can the registration form be fully customized?', a: 'Completely. Our form builder supports text fields, dropdowns, file uploads, date pickers, checkboxes, and conditional logic. If you need something more advanced, our development team can build a fully bespoke registration workflow around your specific data requirements.' },
  { q: 'We have a very specific requirement. Can you build it?', a: 'Very likely, yes. Kaizen Infotech Solutions has delivered custom digital platforms for government departments, national NGOs, and large enterprises. Share your requirement with us and we will tell you honestly what we can build and in what timeframe.' },
];

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-xl bg-white overflow-hidden transition-all duration-300 ${open ? 'border-[#CC9C4C]/50 shadow-md shadow-amber-100/50' : 'border-gray-100 hover:border-[#CC9C4C]/30 hover:shadow-sm'}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 text-left px-5 py-4">
        <span className={`text-[15px] font-semibold transition-colors duration-300 ${open ? 'text-[#AC1E20]' : 'text-gray-900'}`}>{q}</span>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${open ? 'rotate-180 bg-[#AC1E20]' : 'bg-gray-100'}`}>
          <ChevronDown className="w-4 h-4 transition-colors duration-300" style={{ color: open ? '#fff' : CRIMSON }} />
        </span>
      </button>
      {/* grid-rows trick: animates open/close height smoothly without JS measuring */}
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-[15px] text-gray-600 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
};

// ── Light "Events" product mockup (hero) ──────────────────────────────────────
const TABLE_ROWS = [
  { n: 'Priya Sharma',   e: 'Charity Gala',  a: '₹2,500', s: 'Paid',    c: '#16a34a' },
  { n: 'Rahul Mehta',    e: 'Sports Meet',   a: '₹1,200', s: 'Paid',    c: '#16a34a' },
  { n: 'Anjali Verma',   e: 'Charity Gala',  a: '₹2,500', s: 'Pending', c: '#d97706' },
  { n: 'Vikram Singh',   e: 'Training Camp', a: '₹3,000', s: 'Paid',    c: '#16a34a' },
  { n: 'Neha Gupta',     e: 'Sports Meet',   a: '₹1,200', s: 'Paid',    c: '#16a34a' },
];

const HeroMockup = () => (
  <div className="relative lg:-mr-24 xl:-mr-44">
    {/* soft glow */}
    <div className="absolute -inset-8 rounded-[2.5rem] opacity-40 blur-3xl pointer-events-none"
      style={{ background: `radial-gradient(circle at 55% 45%, ${GOLD}3d, transparent 65%)` }} />

    {/* Main dashboard panel (landscape) */}
    <div className="relative flex bg-white rounded-2xl shadow-2xl shadow-black/40 border border-white/20 overflow-hidden">

      {/* thin dark sidebar */}
      <div className="w-12 flex-shrink-0 flex flex-col items-center py-4 gap-5" style={{ background: NAVY }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: GOLD }}>
          <span className="text-[11px] font-extrabold" style={{ color: NAVY }}>K</span>
        </div>
        {[Calendar, Users, CreditCard, FileText].map((Icon, i) => (
          <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-white/15' : ''}`}>
            <Icon className="w-4 h-4" style={{ color: i === 0 ? GOLD : 'rgba(255,255,255,0.5)' }} />
          </div>
        ))}
      </div>

      {/* main content */}
      <div className="flex-1 min-w-0">
        {/* top bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <div className="text-sm font-bold text-gray-900">Events Dashboard</div>
            <div className="text-[10px] text-gray-400">Welcome back, Admin</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold px-2.5 py-1 rounded-sm" style={{ background: `${GOLD}1f`, color: '#7a5e1e' }}>This month</div>
            <div className="w-7 h-7 rounded-full" style={{ background: `${NAVY}12` }} />
          </div>
        </div>

        <div className="p-5">
          {/* revenue stat cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { k: 'Total Revenue', v: '₹5,42,800', up: '+18.2%', c: NAVY },
              { k: 'Registrations', v: '1,284',      up: '+9.4%',  c: CRIMSON },
              { k: 'Active Events', v: '32',          up: '+4',     c: '#7a5e1e' },
            ].map(t => (
              <div key={t.k} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-3">
                <div className="text-[10px] text-gray-400 mb-1">{t.k}</div>
                <div className="text-lg font-extrabold leading-none" style={{ color: t.c }}>{t.v}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <TrendingUp className="w-3 h-3" style={{ color: '#16a34a' }} />
                  <span className="text-[9px] font-bold" style={{ color: '#16a34a' }}>{t.up}</span>
                </div>
              </div>
            ))}
          </div>

          {/* registrations table */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {/* table header */}
            <div className="flex items-center px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
              <span className="text-[10px] font-bold text-gray-500 flex-1">Participant</span>
              <span className="text-[10px] font-bold text-gray-500 w-24 hidden sm:block">Event</span>
              <span className="text-[10px] font-bold text-gray-500 w-16 text-right">Amount</span>
              <span className="text-[10px] font-bold text-gray-500 w-16 text-right">Status</span>
            </div>
            {/* rows */}
            {TABLE_ROWS.map((r, i) => (
              <div key={i} className={`flex items-center px-4 py-2.5 ${i !== TABLE_ROWS.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: i % 2 ? CRIMSON : NAVY }}>
                    {r.n.charAt(0)}
                  </div>
                  <span className="text-[11px] font-semibold text-gray-800 truncate">{r.n}</span>
                </div>
                <span className="text-[10px] text-gray-500 w-24 hidden sm:block truncate">{r.e}</span>
                <span className="text-[11px] font-bold text-gray-800 w-16 text-right">{r.a}</span>
                <div className="w-16 flex justify-end">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-sm" style={{ background: `${r.c}18`, color: r.c }}>{r.s}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Register Now panel — overlapping on the right */}
    <div className="absolute top-12 -right-3 lg:-right-6 w-44 bg-white rounded-2xl shadow-2xl shadow-black/40 border border-gray-100 p-4 hidden md:block">
      <div className="text-xs font-bold text-gray-900 mb-0.5">Register Now</div>
      <div className="text-[10px] text-gray-400 mb-3">Annual Charity Gala</div>
      <div className="space-y-2 mb-3">
        <div className="h-7 rounded-lg bg-gray-100" />
        <div className="h-7 rounded-lg bg-gray-100" />
        <div className="flex items-center justify-between rounded-lg px-2.5 py-2" style={{ background: `${NAVY}08` }}>
          <span className="text-[9px] text-gray-500">Amount</span>
          <span className="text-xs font-extrabold" style={{ color: NAVY }}>₹2,500</span>
        </div>
      </div>
      <div className="h-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white" style={{ background: CRIMSON }}>
        Pay &amp; Register
      </div>
      <div className="flex items-center justify-center gap-1 mt-2.5">
        <ShieldCheck className="w-3 h-3" style={{ color: GOLD }} />
        <span className="text-[8px] text-gray-400">Secured by UPI · Cards</span>
      </div>
    </div>

    {/* floating payment chip — bottom left */}
    <div className="absolute -bottom-5 -left-4 sm:-left-6 bg-white rounded-xl shadow-2xl shadow-black/30 border border-gray-100 px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#16a34a18' }}>
        <CheckCircle2 className="w-5 h-5" style={{ color: '#16a34a' }} />
      </div>
      <div>
        <div className="text-[10px] text-gray-400 leading-none">Payment received</div>
        <div className="text-xs font-bold" style={{ color: NAVY }}>₹2,500 · UPI</div>
      </div>
    </div>
  </div>
);

// ── Dark analytics dashboard mockup (data-form section) ───────────────────────
const DarkDashboardMockup = () => (
  <div className="relative">
    <div className="absolute -inset-6 rounded-[2rem] opacity-30 blur-2xl"
      style={{ background: `radial-gradient(circle at 70% 30%, ${CRIMSON}44, transparent 60%)` }} />

    <div className="relative rounded-2xl shadow-2xl overflow-hidden border border-white/10"
      style={{ background: `linear-gradient(160deg, #0d1f52 0%, ${NAVY} 60%, ${OBSIDIAN} 100%)` }}>
      {/* bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="text-sm font-bold text-white">Registration analytics</div>
          <span className="text-[10px] font-semibold px-2 py-1 rounded-sm" style={{ background: `${GOLD}22`, color: GOLD }}>Real-time</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* big bar chart */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 col-span-2 sm:col-span-1">
            <div className="text-[10px] text-white/40 mb-3">Weekly sign-ups</div>
            <div className="flex items-end gap-2 h-24">
              {[45, 70, 55, 85, 65, 95, 75].map((h, i) => (
                <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 5 ? GOLD : 'rgba(255,255,255,0.25)' }} />
              ))}
            </div>
          </div>

          {/* donut */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col items-center justify-center">
            <div className="text-[10px] text-white/40 mb-3 self-start">Payment split</div>
            <div className="relative w-24 h-24 rounded-full"
              style={{ background: `conic-gradient(${GOLD} 0% 55%, ${CRIMSON} 55% 78%, rgba(255,255,255,0.25) 78% 100%)` }}>
              <div className="absolute inset-[22%] rounded-full flex items-center justify-center" style={{ background: NAVY }}>
                <span className="text-sm font-extrabold text-white">98%</span>
              </div>
            </div>
          </div>
        </div>

        {/* metric rows */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { k: 'Collected', v: '₹6.4L', icon: TrendingUp },
            { k: 'Members', v: '3,920', icon: Users },
            { k: 'Synced', v: '100%', icon: RefreshCw },
          ].map(m => (
            <div key={m.k} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <m.icon className="w-4 h-4 mb-1.5" style={{ color: GOLD }} />
              <div className="text-sm font-extrabold text-white">{m.v}</div>
              <div className="text-[10px] text-white/40">{m.k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const About = () => {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50" style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/" className="flex items-center flex-shrink-0 bg-white rounded-lg px-2.5 py-1.5">
              <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-7 w-auto" />
            </Link>

            <nav className="hidden md:flex items-center gap-9 text-sm font-medium text-white/70">
              <Link to="/"        className="hover:text-white transition-colors">Home</Link>
              <Link to="/about"   className="text-white">About</Link>
            </nav>

            <div className="flex items-center gap-3 flex-shrink-0">
              <Link to="/login" className="hidden sm:inline-flex items-center text-sm font-medium text-white/80 hover:text-white transition-colors">
                <LogIn className="w-4 h-4 mr-1.5" />
                Login
              </Link>
              <Link to="/">
                <Button size="sm" className="rounded-lg px-4 font-semibold text-white" style={{ background: CRIMSON }}>
                  Create Events
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden animated-gradient"
        style={{ background: `linear-gradient(125deg, ${NAVY} 0%, #16205e 42%, #3a1a5c 78%, #4a1550 100%)`, backgroundSize: '200% 200%' }}>
        {/* animated glows */}
        <div className="absolute top-[-6rem] right-[-6rem] w-[40rem] h-[40rem] rounded-full opacity-25 blur-3xl pointer-events-none animate-float-slow"
          style={{ background: `radial-gradient(circle, #7a2e8f 0%, transparent 65%)` }} />
        <div className="absolute -bottom-32 -left-20 w-[32rem] h-[32rem] rounded-full opacity-10 blur-3xl pointer-events-none animate-float"
          style={{ background: `radial-gradient(circle, ${GOLD} 0%, transparent 65%)` }} />
        <div className="absolute top-1/3 left-1/4 w-[24rem] h-[24rem] rounded-full opacity-[0.08] blur-3xl pointer-events-none animate-bob"
          style={{ background: `radial-gradient(circle, ${CRIMSON} 0%, transparent 65%)` }} />

        {/* dot texture */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '34px 34px' }} />

        {/* floating particles / shapes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <span className="absolute top-[18%] left-[12%] w-3 h-3 rounded-full animate-float" style={{ background: GOLD, opacity: 0.5 }} />
          <span className="absolute top-[64%] left-[8%] w-2 h-2 rounded-full animate-float-slow" style={{ background: '#fff', opacity: 0.35 }} />
          <span className="absolute top-[28%] right-[40%] w-2.5 h-2.5 rounded-full animate-bob" style={{ background: GOLD, opacity: 0.4 }} />
          <span className="absolute top-[12%] right-[18%] w-2 h-2 rounded-full animate-float-slow" style={{ background: '#fff', opacity: 0.3 }} />
          <span className="absolute bottom-[16%] right-[28%] w-3 h-3 rounded-full animate-float" style={{ background: CRIMSON, opacity: 0.5 }} />
          <span className="absolute bottom-[28%] left-[44%] w-1.5 h-1.5 rounded-full animate-bob" style={{ background: '#fff', opacity: 0.4 }} />
          {/* rotating ring */}
          <span className="absolute top-[20%] right-[8%] w-20 h-20 rounded-full border animate-float-slow" style={{ borderColor: `${GOLD}33` }} />
          <span className="absolute bottom-[12%] left-[20%] w-14 h-14 rounded-xl border animate-float" style={{ borderColor: 'rgba(255,255,255,0.12)', transform: 'rotate(20deg)' }} />
        </div>

        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 lg:py-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-14 items-center">
            {/* copy */}
            <div>
              <span className="animate-fade-up inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase mb-6 px-3 py-1.5 rounded-sm"
                style={{ background: `${GOLD}1f`, color: GOLD, border: `1px solid ${GOLD}33` }}>
                <Sparkles className="w-3.5 h-3.5" />
                The Complete Event Management and Registration Platform
              </span>
              <h1 className="animate-fade-up text-4xl sm:text-5xl lg:text-[3.2rem] font-bold tracking-tight text-white leading-[1.1] mb-5"
                style={{ animationDelay: '0.1s' }}>
                Run Every Event Flawlessly, From the First Registration to the{' '}
                <span className="relative inline-block">
                  <span className="shimmer-text">
                    Final Applause.
                  </span>
                  <span className="absolute left-0 -bottom-1 h-1 w-full rounded-full" style={{ background: GOLD }} />
                </span>
              </h1>
              <p className="animate-fade-up text-lg text-white/65 leading-relaxed max-w-xl mb-8"
                style={{ animationDelay: '0.2s' }}>
                Kaizen Events is a powerful, fully customizable event management and registration platform built for organizers who refuse to settle for ordinary. Handle registrations, ticketing, payments, QR-based check-ins, and real-time reporting, all from a single dashboard.
              </p>
              <div className="animate-fade-up flex flex-wrap items-center gap-3 mb-8" style={{ animationDelay: '0.3s' }}>
                <a href="#contact">
                  <Button className="rounded-lg px-6 h-12 font-semibold shadow-lg transition-transform duration-200 hover:scale-[1.04] active:scale-95" style={{ background: GOLD, color: NAVY, boxShadow: `0 10px 30px ${GOLD}40` }}>
                    Get in Touch
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </a>
                <a href="#features">
                  <Button variant="outline" className="rounded-lg px-6 h-12 font-semibold border-white/25 text-white hover:bg-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 hover:scale-[1.04]">
                    Explore features
                  </Button>
                </a>
              </div>

              {/* trust row */}
              <div className="animate-fade-up flex items-center gap-2.5" style={{ animationDelay: '0.4s' }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${GOLD}33` }}>
                  <Check className="w-2.5 h-2.5" strokeWidth={3} style={{ color: GOLD }} />
                </span>
                <span className="text-sm font-medium text-white/75">Trusted by NGOs, Corporates and Government Bodies</span>
              </div>
            </div>

            {/* mockup */}
            <div className="lg:pl-6 animate-scale-in" style={{ animationDelay: '0.25s' }}>
              <HeroMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats (floating card) ── */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 -mt-10 relative z-10">
        <Reveal>
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/70 border border-gray-100 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
            {STATS.map(({ icon: Icon, value, label }) => (
              <div key={label} className="group px-5 py-7 text-center flex flex-col items-center justify-center">
                <div className="w-11 h-11 rounded-full mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: `${GOLD}1a` }}>
                  <Icon className="w-5 h-5" style={{ color: GOLD }} />
                </div>
                {value && <CountUp value={value} className="text-2xl font-bold tracking-tight" style={{ color: NAVY }} />}
                <div className={`text-xs text-gray-500 ${value ? 'mt-1' : 'font-semibold leading-snug'}`} style={value ? undefined : { color: NAVY }}>{label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Payment Gateway ── */}
      <section id="features" className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-6" style={{ background: `${GOLD}1a` }}>
              <CreditCard className="w-6 h-6" style={{ color: '#7a5e1e' }} />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#091D40] mb-4">
              Benefits of the payment gateway
            </h2>
            <p className="text-gray-500 leading-relaxed mb-8">
              Everything your club needs to collect money online — secure, instant and effortless.
            </p>

            <ul className="space-y-5">
              {PAYMENT_BENEFITS.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${GOLD}1a` }}>
                    <Icon className="w-[18px] h-[18px]" style={{ color: GOLD }} />
                  </div>
                  <p className="text-[15px] text-gray-600 leading-relaxed pt-1.5">{text}</p>
                </li>
              ))}
            </ul>

            <Link to="/" className="inline-block mt-9">
              <Button className="rounded-lg px-6 h-11 font-medium text-white transition-transform duration-200 hover:scale-[1.04]" style={{ background: NAVY }}>
                Buy now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </Reveal>

          <Reveal delay={120}>
            <img
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=820&fit=crop"
              alt="Payment collection"
              className="w-full h-[440px] object-cover rounded-2xl shadow-lg hover:shadow-2xl transition-shadow duration-300"
            />
          </Reveal>
        </div>
      </section>

      {/* ── Data Collection Form ── */}
      <section className="bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <Reveal delay={120} className="order-2 lg:order-1">
              <DarkDashboardMockup />
            </Reveal>

            <Reveal className="order-1 lg:order-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-6" style={{ background: `${CRIMSON}0d` }}>
                <FileText className="w-6 h-6" style={{ color: CRIMSON }} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#091D40] mb-4">
                Benefits of the data collection form
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8">
                Gather and manage complicated participant-data combinations without any manual intervention.
              </p>

              <ul className="space-y-5">
                {FORM_BENEFITS.map((text, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: NAVY }}>
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </div>
                    <p className="text-[15px] text-gray-600 leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>

              <Link to="/" className="inline-block mt-9">
                <Button className="rounded-lg px-6 h-11 font-medium text-white transition-transform duration-200 hover:scale-[1.04]" style={{ background: CRIMSON }}>
                  Buy now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Why Kaizen Events ── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: CRIMSON }}>Why Kaizen Events</span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#091D40] mb-4">
            Everything Your Event Needs. Nothing You Don't.
          </h2>
          <p className="text-gray-500 leading-relaxed">
            Great events do not happen by accident. They are built with the right tools, the right workflows, and the right team behind them. Kaizen Events gives you all three in one place.
          </p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {WHY_CARDS.map(({ n, icon: Icon, t, d }, i) => (
            <Reveal key={n} delay={i % 4 * 80}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-white p-6 hover:shadow-xl hover:-translate-y-1.5 hover:border-[#CC9C4C]/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ background: `${GOLD}1a` }}>
                    <Icon className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <span className="text-2xl font-extrabold text-gray-200 transition-colors duration-300 group-hover:text-[#CC9C4C]/60">{n}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{t}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>How It Works</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
              From Setup to Success in Four Steps
            </h2>
            <p className="text-white/60 leading-relaxed">
              Getting your event live on Kaizen Events takes minutes, not days. Here is how the process works.
            </p>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(({ n, t, d }, i) => (
              <Reveal key={n} delay={i * 120}>
                <div className="group h-full rounded-2xl p-6 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#CC9C4C]/40 hover:-translate-y-1.5 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-lg font-extrabold shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" style={{ background: GOLD, color: NAVY, boxShadow: `0 8px 20px ${GOLD}33` }}>{n}</div>
                  <h3 className="text-white font-bold mb-2">Step {n}: {t}</h3>
                  <p className="text-sm text-white/55 leading-relaxed">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions We Provide ── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <Reveal className="max-w-3xl mb-16">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: CRIMSON }}>Solutions We Provide</span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#091D40] mb-5">
            A Complete Event Technology Ecosystem, Built to Perform.
          </h2>
          <p className="text-gray-500 leading-relaxed mb-4">
            Kaizen Events is not a collection of loosely connected tools. It is a single, cohesive platform where every feature is designed to work in harmony, so your event runs smoothly from the first click of a registration form to the last scan of a QR code at the exit.
          </p>
          <p className="text-gray-500 leading-relaxed">
            Every solution we offer is built to be reliable at scale, secure by design, and flexible enough to adapt to your specific event requirements.
          </p>
        </Reveal>
        <div className="space-y-6">
          {SOLUTIONS.map(({ icon: Icon, n, t, lead, body, features }) => (
            <Reveal key={n}>
              <div className="group rounded-2xl border border-gray-100 bg-white p-7 lg:p-8 hover:shadow-xl hover:border-[#CC9C4C]/40 transition-all duration-300">
              <div className="flex flex-col sm:flex-row items-start gap-5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ background: `${GOLD}1a` }}>
                  <Icon className="w-6 h-6" style={{ color: GOLD }} />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: CRIMSON }}>{n}</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">{t}</h3>
                  <p className="font-semibold text-gray-700 mb-2">{lead}</p>
                  <p className="text-gray-500 leading-relaxed mb-5">{body}</p>
                  <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${NAVY}0d` }}>
                          <Check className="w-3 h-3" strokeWidth={3} style={{ color: NAVY }} />
                        </span>
                        <span className="text-sm text-gray-600 leading-relaxed">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Events We Power ── */}
      <section className="bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: CRIMSON }}>Events We Power</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#091D40] mb-4">
              Built for Every Type of Event
            </h2>
            <p className="text-gray-500 leading-relaxed">
              From boardrooms to stadiums, from intimate workshops to national-level conferences, Kaizen Events is the platform that fits.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {EVENT_TYPES.map(({ icon: Icon, t, d }, i) => (
              <Reveal key={t} delay={i % 4 * 80}>
                <div className="group h-full rounded-2xl border border-gray-100 bg-white p-6 hover:shadow-xl hover:-translate-y-1.5 hover:border-[#AC1E20]/30 transition-all duration-300">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" style={{ background: `${CRIMSON}0d` }}>
                    <Icon className="w-5 h-5" style={{ color: CRIMSON }} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5 leading-snug">{t}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Sets Us Apart ── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: CRIMSON }}>Why Kaizen Events</span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#091D40] mb-4">
            What Sets Us Apart
          </h2>
          <p className="text-gray-500 leading-relaxed">
            There are other event platforms out there. Here is why serious event organizers choose Kaizen Events instead.
          </p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {APART.map(({ icon: Icon, t, d }, i) => (
            <Reveal key={t} delay={i % 3 * 90}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-white p-6 hover:shadow-xl hover:-translate-y-1.5 hover:border-[#CC9C4C]/50 transition-all duration-300">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ background: `${GOLD}1a` }}>
                  <Icon className="w-5 h-5" style={{ color: GOLD }} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{t}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Trusted By ── */}
      <section style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
          <Reveal className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>Trusted By</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
              Organizations That Trust Kaizen
            </h2>
            <p className="text-white/60 leading-relaxed">
              Kaizen Infotech Solutions has built and delivered digital platforms for some of the most respected organizations, supporting over three lakh users across its platforms.
            </p>
          </Reveal>

          <div className="flex flex-wrap justify-center gap-3 mb-16">
            {TRUSTED_ORGS.map((o, i) => (
              <Reveal key={o} delay={i * 60} as="span">
                <span className="inline-block px-4 py-2 rounded-sm border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10 hover:border-[#CC9C4C]/40 hover:-translate-y-0.5 transition-all duration-300">{o}</span>
              </Reveal>
            ))}
          </div>

          <Reveal className="text-center mb-8">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase" style={{ color: GOLD }}>Client Testimonials</span>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ q, a }, i) => (
              <Reveal key={a} delay={i * 120}>
                <div className="group h-full rounded-2xl bg-white/5 border border-white/10 p-6 flex flex-col hover:bg-white/10 hover:border-[#CC9C4C]/40 hover:-translate-y-1.5 transition-all duration-300">
                  <Quote className="w-8 h-8 mb-4 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" style={{ color: GOLD }} />
                  <p className="text-white/80 leading-relaxed mb-5 flex-1">{q}</p>
                  <p className="text-sm font-semibold" style={{ color: GOLD }}>{a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-24">
          <Reveal className="text-center mb-12">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: CRIMSON }}>Frequently Asked Questions</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#091D40]">
              Questions We Hear Most Often
            </h2>
          </Reveal>
          <div className="space-y-3">
            {FAQS.map(({ q, a }, i) => (
              <Reveal key={q} delay={i * 60}>
                <FaqItem q={q} a={a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <Reveal>
        <div className="relative rounded-2xl overflow-hidden px-8 py-14 animated-gradient" style={{ background: `linear-gradient(120deg, ${NAVY} 0%, #16205e 55%, ${NAVY} 100%)`, backgroundSize: '200% 200%' }}>
          <div className="absolute -top-16 -right-12 w-56 h-56 rounded-full opacity-10 animate-float-slow" style={{ background: GOLD }} />
          <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full opacity-[0.07] animate-float" style={{ background: CRIMSON }} />
          <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12">
            {/* icon badge */}
            <div className="flex-shrink-0">
              <div className="pulse-ring relative w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}25`, border: `1px solid ${GOLD}40`, color: `${GOLD}66` }}>
                <ShieldCheck className="w-10 h-10" style={{ color: GOLD }} />
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
                Ready to Run Your Best Event Yet?
              </h2>
              <p className="text-white/60 leading-relaxed max-w-xl">
                Join hundreds of event organizers who have moved from chaos to clarity with Kaizen Events. Reach out to our team and we will walk you through everything.
              </p>
            </div>
            <a href="#contact" className="flex-shrink-0">
              <Button className="rounded-lg px-7 h-12 font-semibold whitespace-nowrap transition-transform duration-200 hover:scale-[1.05] active:scale-95" style={{ background: GOLD, color: NAVY, boxShadow: `0 10px 30px ${GOLD}40` }}>
                Get in Touch
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <div id="contact">
        <Footer />
      </div>
    </div>
  );
};

export default About;
