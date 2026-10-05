import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MarketingLayout, {
  Eyebrow, SectionHeading,
} from '../../components/marketing/MarketingLayout';
import GridScan from '../../components/marketing/GridScan';
import {
  MReveal, MStagger, MItem, MShow, SplitText, CountUp, cardVariant, EASE,
} from '../../components/marketing/motion';
import {
  CreditCard, QrCode, BarChart3, ClipboardList,
  CalendarPlus, Ticket, Megaphone, ScanLine,
  Briefcase, GraduationCap, Landmark, MonitorPlay, Trophy, HeartHandshake, Store, PartyPopper,
  ArrowRight, Check, Star, Quote, CalendarCheck, Users, ShieldCheck, Building2,
  Zap, PlayCircle, Sparkles, BadgeCheck, ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
} from 'lucide-react';

/* Larger shared title size for this page's section headings */
const TITLE_SIZE = 'text-4xl sm:text-5xl';

/* ── Docx Page 1 content — verbatim ── */

const STATS = [
  { icon: CalendarCheck, value: '500+', label: 'Events Managed' },
  { icon: Users, value: '3 Lakh+', label: 'Attendees' },
  { icon: Building2, value: '200+', label: 'Organizations Served' },
  { icon: ShieldCheck, value: '', label: 'Trusted by NGOs, Corporates and Government Bodies' },
];

const HERO_TRUST = [
  { icon: Zap, label: 'Live in minutes' },
  { icon: CreditCard, label: 'Secure online payments' },
  { icon: QrCode, label: 'Instant QR check-in' },
];

const TRUSTED_ORGS = [
  { name: 'Rotary International', logo: '/marketing/rotary.png' },
  { name: 'JITO', logo: '/marketing/jito.jpg' },
];

const FEATURES = [
  {
    icon: ClipboardList,
    image: '/marketing/feature-registration.png',
    title: 'Event Registration and Ticketing',
    bullets: [
      'Drag-and-drop registration form builder with conditional logic and custom fields',
      'Multi-tier ticketing: Free, Early Bird, Standard, VIP, Group, and Sponsor packages',
      'Promo code and discount management for members, partners, and bulk buyers',
      'Bulk registration for corporate and institutional group bookings',
    ],
  },
  {
    icon: QrCode,
    image: '/marketing/feature-checkin.png',
    title: 'QR Code Attendance and Check-In System',
    bullets: [
      'Unique QR code issued to every attendee at the moment of registration',
      'Mobile check-in scanner app for Android and iOS, available to all venue staff',
      'Multi-gate check-in with real-time synchronization across all entry points',
      'Live headcount dashboard visible to organizers as check-ins happen',
    ],
  },
  {
    icon: CreditCard,
    image: '/marketing/feature-payments.png',
    title: 'Secure Payment Processing',
    bullets: [
      'UPI payments including GPay, PhonePe, Paytm, and BHIM',
      'Credit Cards and Debit Cards across all major networks',
      'PCI-DSS compliant payment infrastructure for complete security',
      'GST invoice generation for corporate registrations',
    ],
  },
  {
    icon: BarChart3,
    image: '/marketing/feature-analytics.png',
    title: 'Real-Time Reporting and Analytics',
    bullets: [
      'Live registration count and revenue tracking as payments come in',
      'Attendee demographics: city, profession, age group, and ticket category breakdown',
      'Exportable reports in PDF, Excel, and CSV for stakeholder sharing',
      'Custom report builder for board presentations and post-event reviews',
    ],
  },
];

const STEPS = [
  { num: '01', icon: CalendarPlus, title: 'Create Your Event', text: 'Build a professional event page in minutes.' },
  { num: '02', icon: Ticket, title: 'Set Up Tickets and Payments', text: 'Define your ticket categories, set prices, and activate your preferred payment methods.' },
  { num: '03', icon: Megaphone, title: 'Manage and Promote', text: 'Track registrations as they come in through your real-time dashboard.' },
  { num: '04', icon: ScanLine, title: 'Check In and Analyse', text: 'Use the Kaizen mobile check-in app at your venue for fast, paperless entry.' },
];

const EVENT_TYPES = [
  { icon: Briefcase, title: 'Corporate Conferences and Summits', text: 'Multi-session events with delegate tiers, speaker management, and sponsor modules.', grad: 'from-[#091D40] to-[#16307a]', ico: 'text-[#CC9C4C]' },
  { icon: GraduationCap, title: 'Educational Seminars and Workshops', text: 'Academic and professional training events with certificate generation and category-wise fees.', grad: 'from-[#AC1E20] to-[#c5303b]', ico: 'text-white' },
  { icon: PartyPopper, title: 'Social and Community Gatherings', text: 'Club meets, fundraisers, gala dinners, and annual celebrations managed with ease.', grad: 'from-[#CC9C4C] to-[#e0c281]', ico: 'text-[#091D40]' },
  { icon: MonitorPlay, title: 'Virtual and Hybrid Events', text: 'Fully online or blended events with virtual check-in, recordings access, and live engagement tools.', grad: 'from-[#091D40] to-[#16307a]', ico: 'text-[#CC9C4C]' },
  { icon: Landmark, title: 'Government and Institutional Events', text: 'High-security, high-volume events with compliance-grade data handling and multi-location coordination.', grad: 'from-[#AC1E20] to-[#c5303b]', ico: 'text-white' },
  { icon: Store, title: 'Trade Shows and Exhibitions', text: 'Exhibitor portals, lead capture tools, floor plan management, and on-site badge printing.', grad: 'from-[#CC9C4C] to-[#e0c281]', ico: 'text-[#091D40]' },
  { icon: Trophy, title: 'Sports Events and Tournaments', text: 'Participant registration, category-wise entries, result tracking, and digital certificates.', grad: 'from-[#091D40] to-[#16307a]', ico: 'text-[#CC9C4C]' },
  { icon: HeartHandshake, title: 'NGO and Membership Events', text: 'Member-only access, donation collection, group registrations, and attendance tracking for community organizations.', grad: 'from-[#AC1E20] to-[#c5303b]', ico: 'text-white' },
];

const TESTIMONIALS = [
  {
    quote: 'The platform handled over 10,000 registrations without a single glitch. Real-time reporting and QR check-in made our national conference completely seamless.',
    name: 'Conference Director',
    role: 'National Professional Association',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=160&h=160&fit=crop&crop=faces',
  },
  {
    quote: 'We needed a custom registration form with conditional fields and multi-tier ticketing. Kaizen built exactly what we needed. The team was responsive and the result was outstanding.',
    name: 'Event Manager',
    role: 'Leading Club Organization',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=faces',
  },
  {
    quote: 'UPI payment integration made fee collection incredibly simple for our 8,000-member event. I would not go back to spreadsheets and manual transfers.',
    name: 'Secretary General',
    role: 'Regional NGO',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=faces',
  },
];

const DIFF_BEFORE = [
  'Manual registration and spreadsheets',
  'Long queues and paper check-in lists',
  'Scattered, manual payment tracking',
  'Reports compiled by hand after the event',
];

const DIFF_AFTER = [
  'One unified registration dashboard',
  'Instant QR code check-in in under a second',
  'Secure payments with live reconciliation',
  'Real-time reporting and analytics',
];

/* ── Before & After Kaizen: progress-meter design values (visual only, NOT copy).
   Per-capability fill levels so the meters read as measured rather than templated. ── */
const DIFF_METERS = [
  { before: 22, after: 96 },
  { before: 16, after: 99 },
  { before: 28, after: 95 },
  { before: 20, after: 98 },
];

/* Animated progress fill — grows from 0 to `pct` when scrolled into view.
   Uses whileInView (viewport once:false) so it is StrictMode-safe and needs no
   extra hooks; lives inside an MItem variant tree but animates independently
   because it declares its own object `initial`/`whileInView` (no variant keys). */
const MeterFill = ({ pct, gradient, delay = 0 }) => (
  <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
    <motion.div
      className="absolute inset-y-0 left-0 rounded-full"
      style={{ backgroundImage: gradient }}
      initial={{ width: 0 }}
      whileInView={{ width: `${pct}%` }}
      viewport={{ once: false, amount: 0.5 }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
    />
  </div>
);

/* One capability transforming Before -> After as paired progress meters.
   Root element is an <MItem/>, so it staggers correctly as a direct child of
   <MStagger/>. The crimson "before" bar fills low; the green "after" bar fills
   high — both stay visible at rest so the contrast survives after animation. */
const TransformRow = ({ before, after, beforePct, afterPct, delay = 0 }) => (
  <MItem
    className="group rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm transition-shadow hover:shadow-lg"
    y={16}
    whileHover={{ y: -4 }}
  >
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
      {/* Before */}
      <div className="sm:flex-1 min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#AC1E20]">
            <TrendingDown className="h-3.5 w-3.5" />
            Before Kaizen
          </span>
          <span className="text-xs font-bold tabular-nums text-[#AC1E20]/70">{beforePct}%</span>
        </div>
        <MeterFill pct={beforePct} gradient="linear-gradient(90deg, #AC1E20 0%, #c2161f 100%)" delay={delay} />
        <p className="mt-2.5 text-sm leading-snug text-gray-500">{before}</p>
      </div>

      {/* Connector — gold node bridges the two sides (right arrow on desktop, down arrow on mobile) */}
      <div className="flex-shrink-0 self-center">
        <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#CC9C4C] to-[#9a7126] shadow-md ring-4 ring-white">
          <ArrowRight className="h-4 w-4 text-white" />
        </span>
        <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#CC9C4C] to-[#9a7126] shadow-md ring-4 ring-white sm:hidden">
          <ArrowRight className="h-4 w-4 rotate-90 text-white" />
        </span>
      </div>

      {/* After */}
      <div className="sm:flex-1 min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-green-700">
            <TrendingUp className="h-3.5 w-3.5" />
            After Kaizen
          </span>
          <span className="text-xs font-bold tabular-nums text-green-700">{afterPct}%</span>
        </div>
        <MeterFill pct={afterPct} gradient="linear-gradient(90deg, #22c55e 0%, #16a34a 100%)" delay={delay + 0.15} />
        <p className="mt-2.5 text-sm font-semibold leading-snug text-[#091D40]">{after}</p>
      </div>
    </div>
  </MItem>
);

/* ── Testimonials showcase — a featured "blue box" testimonial driven by an
   active index. The right rail lists the OTHER testimonials; clicking one
   opens it in the blue box. The blue box also carries dot + prev/next slider
   controls. Scales to any number of testimonials (rail scrolls when long). ── */
const TestimonialShowcase = () => {
  const [active, setActive] = useState(0);
  const count = TESTIMONIALS.length;
  const t = TESTIMONIALS[active];
  const go = (next) => setActive((next + count) % count);

  return (
    <div className="grid lg:grid-cols-5 gap-6 lg:gap-8 items-stretch">
      {/* Featured testimonial — the "blue box" */}
      <div className="lg:col-span-3">
        <div
          className="relative h-full min-h-[24rem] overflow-hidden rounded-3xl p-8 sm:p-10 flex flex-col shadow-2xl"
          style={{ backgroundImage: 'linear-gradient(135deg, #091D40 0%, #16307a 55%, #091D40 100%)' }}
        >
          <div className="absolute inset-0 ke-grid opacity-50 pointer-events-none" />
          <div className="absolute -top-12 -left-8 w-44 h-44 rounded-full bg-[#CC9C4C]/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 right-0 w-52 h-52 rounded-full bg-[#AC1E20]/25 blur-3xl pointer-events-none" />
          <Quote className="relative w-14 h-14 text-[#CC9C4C] mb-4" aria-hidden="true" />

          <AnimatePresence mode="wait">
            <motion.figure
              key={active}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="relative flex-1 flex flex-col"
            >
              <div className="flex gap-1 mb-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#CC9C4C] text-[#CC9C4C]" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="text-2xl sm:text-3xl font-semibold leading-snug text-white flex-1">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="flex items-center gap-4 mt-8 pt-6 border-t border-white/15">
                <div className="min-w-0">
                  <p className="font-bold text-white text-base flex items-center gap-1.5">
                    <span className="truncate">{t.name}</span>
                    <BadgeCheck className="w-5 h-5 text-[#CC9C4C] shrink-0" aria-hidden="true" />
                  </p>
                  <p className="text-sm text-blue-100/80">{t.role}</p>
                </div>
              </figcaption>
            </motion.figure>
          </AnimatePresence>

          {/* slider controls — dots + prev/next */}
          <div className="relative flex items-center justify-between mt-6 pt-6 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show testimonial ${i + 1}`}
                  onClick={() => setActive(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${i === active ? 'w-6 bg-[#CC9C4C]' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" aria-label="Previous testimonial" onClick={() => go(active - 1)} className="w-9 h-9 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" aria-label="Next testimonial" onClick={() => go(active + 1)} className="w-9 h-9 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right rail — the other testimonials; click to open one in the blue box */}
      <div className="lg:col-span-2 flex flex-col gap-4 lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1">
        {TESTIMONIALS.map((item, i) => (
          i === active ? null : (
            <button
              key={item.name}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Read the testimonial from ${item.name}`}
              className="group text-left relative flex flex-col p-5 rounded-2xl bg-gradient-to-br from-white to-[#CC9C4C]/[0.05] border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#CC9C4C]/40 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
            >
              <span className="absolute left-0 top-5 bottom-5 w-1 rounded-full bg-gradient-to-b from-[#CC9C4C] to-[#AC1E20]" aria-hidden="true" />
              <div className="flex gap-0.5 mb-2 pl-3">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="w-3.5 h-3.5 fill-[#CC9C4C] text-[#CC9C4C]" aria-hidden="true" />
                ))}
              </div>
              <p className="pl-3 text-sm leading-relaxed text-gray-600 line-clamp-3">&ldquo;{item.quote}&rdquo;</p>
              <div className="flex items-center justify-between gap-2 mt-3 pl-3">
                <div className="min-w-0">
                  <p className="font-bold text-[#091D40] text-sm leading-tight flex items-center gap-1">
                    <span className="truncate">{item.name}</span>
                    <BadgeCheck className="w-4 h-4 text-[#CC9C4C] shrink-0" aria-hidden="true" />
                  </p>
                  <p className="text-xs text-gray-500 truncate">{item.role}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#AC1E20] shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </div>
            </button>
          )
        ))}
      </div>
    </div>
  );
};

const MarketingHome = () => (
  <MarketingLayout>
    {/* ── Hero (dark navy, two-column) ── */}
    <section className="relative overflow-hidden bg-[#091D40] py-20 sm:py-28">
      <div className="absolute inset-0">
        <GridScan
          sensitivity={0.5}
          lineThickness={1}
          linesColor="#27407e"
          gridScale={0.08}
          lineJitter={0.06}
          scanColor="#CC9C4C"
          scanOpacity={0.55}
          scanDirection="pingpong"
          scanDuration={2.6}
          scanDelay={1.2}
          enablePost
          bloomIntensity={0.75}
          chromaticAberration={0.0015}
          noiseIntensity={0.012}
        />
      </div>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[36rem] h-[36rem] rounded-full bg-gradient-to-bl from-[#CC9C4C]/25 via-[#AC1E20]/15 to-transparent blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-[#16307a]/35 blur-3xl" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
          <MStagger stagger={0.12} amount={0.3}>
            <MItem>
              <Eyebrow tone="light">The Complete Event Management and Registration Platform</Eyebrow>
            </MItem>
            <SplitText
              as="h1"
              by="char"
              segments={[
                { text: 'Run Every Event Flawlessly, From the First Registration to the' },
                { text: 'Final Applause.', className: 'text-[#e7637a]' },
              ]}
              className="mt-6 text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-white leading-[1.08]"
              stagger={0.016}
              duration={0.5}
              amount={0.3}
              delay={0.1}
            />
            <MItem className="mt-6">
              <p className="text-lg text-white/70 max-w-xl leading-relaxed">
                Kaizen Events is a powerful, fully customizable event management and registration platform built
                for organizers who refuse to settle for ordinary. Handle registrations, ticketing, payments,
                QR-based check-ins, and real-time reporting, all from a single dashboard.
              </p>
            </MItem>
            <MItem className="mt-8">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-sm text-base font-semibold text-[#091D40] bg-[#CC9C4C] hover:bg-[#b88c3f] transition-all duration-200 shadow-lg shadow-[#CC9C4C]/30 hover:-translate-y-0.5"
                >
                  Get in Touch <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/events"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-sm text-base font-semibold text-white border border-white/25 hover:bg-white/10 transition-all duration-200"
                >
                  <PlayCircle className="w-5 h-5" /> Browse Events
                </Link>
              </div>
            </MItem>
            <MItem className="mt-8">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {HERO_TRUST.map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-2 text-sm text-white/70">
                    <Icon className="w-4 h-4 text-[#CC9C4C]" />
                    {label}
                  </span>
                ))}
              </div>
            </MItem>
          </MStagger>

          <MShow
            from={{ opacity: 0, scale: 0.9, y: 24 }}
            to={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
            amount={0.2}
          >
            <motion.img
              src="/marketing/banner-dashboard.png"
              alt="Kaizen Events dashboard — registrations, revenue and check-in analytics"
              className="w-full h-auto drop-shadow-2xl"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </MShow>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 h-px ke-gold-rule" />
    </section>

    {/* ── Stats band (white floating card) ── */}
    <section className="relative bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <MStagger
          className="-mt-12 relative z-10 rounded-2xl bg-white border border-gray-100 shadow-xl grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100"
          stagger={0.12}
          amount={0.4}
        >
          {STATS.map(({ icon: Icon, value, label }) => (
            <MItem key={label} className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-[#091D40]/5 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-[#AC1E20]" />
              </div>
              <div>
                {value && <CountUp value={value} className="block text-2xl font-extrabold text-[#091D40] leading-none" />}
                <p className={`text-gray-500 leading-snug ${value ? 'text-sm mt-1' : 'text-xs font-semibold text-[#091D40]'}`}>{label}</p>
              </div>
            </MItem>
          ))}
        </MStagger>
      </div>
    </section>

    {/* ── Trusted-by logo row ── */}
    <section className="py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MReveal>
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-7">
            Organizations That Trust Kaizen
          </p>
        </MReveal>
        <MStagger className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4" stagger={0.07} amount={0.4}>
          {TRUSTED_ORGS.map((org) => (
            <MItem key={org.name} whileHover={{ scale: 1.06 }}>
              {org.logo ? (
                <img
                  src={org.logo}
                  alt={org.name}
                  className="h-32 w-auto object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-base font-bold uppercase tracking-wide text-gray-300 hover:text-[#091D40] transition-colors duration-300">
                  {org.name}
                </span>
              )}
            </MItem>
          ))}
        </MStagger>
      </div>
    </section>

    {/* ── Powerful Features (4 illustrated cards) ── */}
    <section className="relative py-20 sm:py-24 bg-gray-50 overflow-hidden">
      <div className="absolute inset-0 ke-dots opacity-50 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MReveal>
          <SectionHeading eyebrow="Features" title="Everything Your Event Needs. Nothing You Don't." titleClassName={TITLE_SIZE} className="mb-14">
            Great events do not happen by accident. They are built with the right tools, the right workflows,
            and the right team behind them. Kaizen Events gives you all three in one place.
          </SectionHeading>
        </MReveal>
        <MStagger className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-7" stagger={0.12}>
          {FEATURES.map(({ icon: Icon, image, title, bullets }) => (
            <motion.div
              key={title}
              variants={cardVariant}
              whileHover={{ y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group relative h-full flex flex-col rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-2xl hover:border-[#CC9C4C]/40 transition-all duration-300 overflow-hidden"
            >
              {/* gold accent bar grows across the top on hover */}
              <span className="absolute top-0 left-0 h-1 w-0 group-hover:w-full bg-gradient-to-r from-[#CC9C4C] to-[#AC1E20] transition-all duration-500 ease-out z-10" />

              <div className="relative overflow-hidden">
                <img
                  src={image}
                  alt={title}
                  className="block w-full aspect-[3/2] object-cover group-hover:scale-[1.05] transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#091D40]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              <div className="flex-1 flex flex-col p-6">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#091D40] to-[#16307a] flex items-center justify-center shadow-md shadow-[#091D40]/20 flex-shrink-0 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300">
                    <Icon className="w-5 h-5 text-[#CC9C4C]" strokeWidth={1.9} />
                  </div>
                  <h3 className="pt-0.5 font-bold text-[#091D40] text-xl sm:text-2xl leading-snug tracking-tight">{title}</h3>
                </div>

                <span className="mb-4 h-px w-12 bg-gradient-to-r from-[#CC9C4C] to-transparent group-hover:w-24 transition-all duration-300" />

                <ul className="space-y-2.5">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[15px] text-gray-600 leading-relaxed">
                      <Check className="w-5 h-5 text-[#CC9C4C] mt-0.5 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </MStagger>
      </div>
    </section>

    {/* ── How It Works (steps + device cluster) ── */}
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <MReveal>
            <Eyebrow tone="crimson" className="mb-4">How It Works</Eyebrow>
            <SplitText
              as="h2"
              text="From Setup to Success in Four Steps"
              className={`${TITLE_SIZE} font-bold tracking-tight leading-[1.3] pb-[0.25em] mb-4`}
              wordClassName="ke-heading-gradient"
            />
            <p className="text-gray-600 leading-relaxed mb-8">
              Getting your event live on Kaizen Events takes minutes, not days. Here is how the process works.
            </p>
            <MStagger className="grid sm:grid-cols-2 gap-5" stagger={0.1}>
              {STEPS.map(({ icon: Icon, title, text }) => (
                <motion.div
                  key={title}
                  variants={cardVariant}
                  whileHover={{ y: -6 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  className="relative p-6 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md transition-colors duration-300"
                >
                  <div className="w-12 h-12 rounded-full bg-[#091D40] flex items-center justify-center shadow-md shadow-[#091D40]/20 mb-4">
                    <Icon className="w-6 h-6 text-[#CC9C4C]" />
                  </div>
                  <h3 className="font-bold text-[#091D40] text-lg mb-2">{title}</h3>
                  <p className="text-[15px] text-gray-600 leading-relaxed">{text}</p>
                </motion.div>
              ))}
            </MStagger>
            <Link to="/solutions" className="inline-flex items-center gap-2 mt-7 text-sm font-semibold text-[#AC1E20] hover:gap-3 transition-all">
              Explore All Features <ArrowRight className="w-4 h-4" />
            </Link>
          </MReveal>
          <MShow
            from={{ opacity: 0, x: 40 }}
            to={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            amount={0.2}
          >
            <motion.img
              src="/marketing/how-it-works.png"
              alt="Kaizen Events on laptop, mobile check-in app and revenue report"
              className="w-full h-auto rounded-2xl shadow-2xl"
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </MShow>
        </div>
      </div>
    </section>

    {/* ── Built for Every Type of Event ── */}
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MReveal>
          <SectionHeading eyebrow="Events We Power" title="Built for Every Type of Event" titleClassName={TITLE_SIZE} className="mb-14">
            From boardrooms to stadiums, from intimate workshops to national-level conferences, Kaizen Events
            is the platform that fits.
          </SectionHeading>
        </MReveal>
        <MStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" stagger={0.08}>
          {EVENT_TYPES.map(({ icon: Icon, title, text, grad, ico }) => (
            <motion.div
              key={title}
              variants={cardVariant}
              whileHover={{ y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group h-full flex flex-col items-center text-center p-7 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#CC9C4C]/40 transition-colors duration-300"
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-gradient-to-br ${grad} shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300`}>
                <Icon className={`w-8 h-8 ${ico}`} strokeWidth={1.75} />
              </div>
              <h3 className="font-bold text-[#091D40] text-lg sm:text-xl leading-snug mb-2">{title}</h3>
              <p className="text-[15px] text-gray-500 leading-relaxed">{text}</p>
            </motion.div>
          ))}
        </MStagger>
      </div>
    </section>

    {/* ── Before & After Kaizen — paired progress meters (full-width) ── */}
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MReveal>
          <SectionHeading
            eyebrow="Before & After Kaizen"
            title="See the Difference"
            tone="gold"
            titleClassName={TITLE_SIZE}
            className="mb-12"
          />
        </MReveal>

        <MReveal delay={0.1}>
          <div className="relative rounded-3xl border border-gray-100 bg-gradient-to-b from-[#091D40]/[0.03] via-white to-green-50/40 p-5 sm:p-8 shadow-xl shadow-[#091D40]/5">
            <MStagger className="space-y-4" stagger={0.12} delayChildren={0.1} amount={0.2}>
              {DIFF_AFTER.map((after, i) => (
                <TransformRow
                  key={after}
                  before={DIFF_BEFORE[i]}
                  after={after}
                  beforePct={DIFF_METERS[i].before}
                  afterPct={DIFF_METERS[i].after}
                  delay={0.1}
                />
              ))}
            </MStagger>
          </div>
        </MReveal>
      </div>
    </section>

    {/* ── Testimonials (featured + rail, full-width) ── */}
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MReveal>
          <SectionHeading
            eyebrow="What Clients Say"
            title="Loved by Event Organizers"
            tone="crimson"
            titleClassName={TITLE_SIZE}
            className="mb-12"
          />
        </MReveal>
        <MReveal delay={0.05}>
          <TestimonialShowcase />
        </MReveal>
      </div>
    </section>

    {/* ── CTA Banner (dark) ── */}
    <section className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <MReveal>
          <div className="animated-gradient relative overflow-hidden rounded-3xl px-8 py-12 sm:px-12 shadow-2xl" style={{ backgroundImage: 'linear-gradient(120deg, #091D40 0%, #16307a 50%, #091D40 100%)' }}>
            <div className="absolute inset-0 ke-grid opacity-60 pointer-events-none" />
            <div className="absolute -top-10 -left-6 w-32 h-32 rounded-full bg-[#CC9C4C]/20 blur-2xl animate-float" />
            <div className="absolute -bottom-12 right-10 w-36 h-36 rounded-full bg-[#AC1E20]/30 blur-2xl animate-float-slow" />
            <div className="relative grid lg:grid-cols-2 gap-8 items-center">
              <div className="hidden lg:flex justify-center">
                <motion.div
                  className="relative w-44 h-44 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center"
                  animate={{ y: [0, -14, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="ke-conic absolute inset-3 rounded-2xl blur-xl opacity-50 animate-spin-slow" />
                  <CalendarCheck className="relative w-20 h-20 text-[#CC9C4C]" />
                  <Sparkles className="absolute top-3 right-3 w-6 h-6 text-white/70" />
                </motion.div>
              </div>
              <div className="text-center lg:text-left">
                <SplitText
                  as="h2"
                  text="Ready to Run Your Best Event Yet?"
                  className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight"
                  amount={0.5}
                />
                <p className="text-white/75 mt-4 leading-relaxed">
                  Join hundreds of event organizers who have moved from chaos to clarity with Kaizen Events.
                  Reach out to our team and we will walk you through everything.
                </p>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mt-7">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-sm text-base font-semibold text-[#091D40] bg-[#CC9C4C] hover:bg-[#b88c3f] transition-all duration-200 shadow-lg hover:-translate-y-0.5"
                  >
                    Get in Touch <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    to="/events"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-sm text-base font-semibold text-white border border-white/30 hover:bg-white/10 transition-all duration-200"
                  >
                    Browse Events
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </MReveal>
      </div>
    </section>
  </MarketingLayout>
);

export default MarketingHome;
