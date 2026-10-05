import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout, {
  Reveal, Eyebrow, SectionHeading, MarketingHero,
} from '../../components/marketing/MarketingLayout';
import ScrollStack, { ScrollStackItem } from '../../components/marketing/ScrollStack';
import Galaxy from '../../components/marketing/Galaxy';
import {
  ClipboardList, CreditCard, QrCode, BarChart3, Smartphone, Wrench,
  Settings2, Maximize2, Wallet, WifiOff, Code2, Building2,
  CheckCircle, ArrowRight,
} from 'lucide-react';

/* ── Docx Page 3 content — verbatim ── */

const SOLUTIONS = [
  {
    id: 'registration', num: '01', icon: ClipboardList, short: 'Registration & Ticketing',
    title: 'Event Registration and Ticketing',
    tagline: 'Your registration page is the first impression your event makes. Make it count.',
    intro: 'Kaizen Events gives you a powerful form builder and ticketing engine that lets you create a branded, professional registration experience in minutes. Collect the data you need, sell the tickets you want, and manage capacity with complete control.',
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
    id: 'payments', num: '02', icon: CreditCard, short: 'Secure Payments',
    title: 'Secure Payment Processing',
    tagline: 'Give your attendees the payment experience they expect and give yourself the financial clarity you deserve.',
    intro: 'Kaizen Events integrates with trusted payment infrastructure to support every major payment method. Payments are processed securely, confirmations are instant, and your reconciliation reports are always accurate.',
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
    id: 'checkin', num: '03', icon: QrCode, short: 'QR Check-In',
    title: 'QR Code Attendance and Check-In System',
    tagline: 'Long queues at the entrance are not just frustrating. They set the wrong tone for your entire event.',
    intro: 'Kaizen Events replaces paper-based check-in with a fast, accurate, QR-powered attendance system that works at any scale. Every attendee carries their own unique QR code, and your staff scans it in under a second.',
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
    id: 'analytics', num: '04', icon: BarChart3, short: 'Reporting & Analytics',
    title: 'Real-Time Reporting and Analytics',
    tagline: 'The best event organizers make decisions based on data, not instinct. Kaizen Events gives you the visibility to do exactly that.',
    intro: 'Your analytics dashboard updates in real time throughout the registration period and on the event day. Understand who is attending, how they are paying, when they are arriving, and how your revenue is tracking, all in one place.',
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
    id: 'mobile-app', num: '05', icon: Smartphone, short: 'Branded Mobile App',
    title: 'Branded Event Mobile App',
    tagline: 'Your event deserves its own app. Not a link to a generic platform, but a fully branded, purpose-built mobile experience that puts your identity at the centre.',
    intro: 'Available on Android and iOS, the Kaizen Events mobile app is designed around your attendees. It gives them everything they need before, during, and after the event, all in one place under your brand.',
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
    id: 'custom', num: '06', icon: Wrench, short: 'Custom Solutions',
    title: 'Custom Event Solutions',
    tagline: 'When your requirements go beyond what any off-the-shelf platform can offer, our team builds the solution from scratch.',
    intro: 'Kaizen Infotech Solutions has a dedicated software development team with a proven track record of delivering complex, enterprise-grade technology for some of the largest organizations in the country. If you can describe the requirement, we can build it.',
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

const APART = [
  { icon: Settings2, title: 'Built for Customization', text: 'Most platforms give you templates. We give you flexibility. Every field, form, workflow, and feature can be tailored to your needs.' },
  { icon: Maximize2, title: 'Designed for Scale', text: 'Our infrastructure is battle-tested at high volumes, having supported platforms with over three lakh active users.' },
  { icon: Wallet, title: 'Payments That Work Everywhere', text: 'UPI, cards, net banking, EMI. We support every payment method your attendees prefer, with instant confirmation and clean reconciliation.' },
  { icon: WifiOff, title: 'Offline-Ready Check-In', text: 'Our mobile check-in app functions even without internet. No connectivity, no problem.' },
  { icon: Code2, title: 'A Real Development Team Behind You', text: 'When you need something custom, you are speaking directly to the engineers who will build it. Not a support ticket queue.' },
  { icon: Building2, title: 'Proven at Enterprise Scale', text: 'We have delivered technology for government departments, Fortune-listed enterprises, and organizations with millions of members.' },
];

/* Per-card accent colors (icon tile / underline / numbered corner) */
const ACCENTS = [
  { icon: 'bg-[#AC1E20]/10 text-[#AC1E20]', bar: 'bg-[#AC1E20]', corner: 'from-[#AC1E20] to-[#c5303b]' },
  { icon: 'bg-[#2563EB]/10 text-[#2563EB]', bar: 'bg-[#2563EB]', corner: 'from-[#2563EB] to-[#60a5fa]' },
  { icon: 'bg-[#16A34A]/10 text-[#16A34A]', bar: 'bg-[#16A34A]', corner: 'from-[#16A34A] to-[#4ade80]' },
  { icon: 'bg-[#091D40]/10 text-[#091D40]', bar: 'bg-[#091D40]', corner: 'from-[#091D40] to-[#a78bfa]' },
  { icon: 'bg-[#EA580C]/10 text-[#EA580C]', bar: 'bg-[#EA580C]', corner: 'from-[#EA580C] to-[#fb923c]' },
  { icon: 'bg-[#0D9488]/10 text-[#0D9488]', bar: 'bg-[#0D9488]', corner: 'from-[#0D9488] to-[#2dd4bf]' },
];

/* Stacking only makes sense with room on larger screens; on mobile/tablet the
   tall cards would break the pin math, so fall back to a normal card list. */
const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => setIsDesktop(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
};

const SolutionsPage = () => {
  const isDesktop = useIsDesktop();

  const renderCard = ({ id, num, icon: Icon, title, tagline, intro, features }, idx) => (
    <div
      id={id}
      className={`group relative flex flex-col rounded-3xl border border-gray-100 overflow-hidden scroll-mt-24 ${
        isDesktop ? 'justify-center min-h-[60vh] p-8 sm:p-12 shadow-2xl' : 'p-6 sm:p-8 shadow-lg'
      } ${idx % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
    >
      {/* watermark number */}
      <span className="pointer-events-none absolute -top-6 -right-2 text-[7rem] sm:text-[9rem] font-extrabold leading-none text-[#091D40]/[0.04] select-none">{num}</span>

      <div className="relative flex items-start gap-4 mb-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#091D40] to-[#16307a] flex items-center justify-center shadow-lg shadow-[#091D40]/20 flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
          <Icon className="w-6 h-6 text-[#CC9C4C]" />
        </div>
        <div>
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-[#091D40] mb-2">{title}</h2>
          <p className="font-semibold text-[#AC1E20] leading-relaxed">{tagline}</p>
        </div>
      </div>

      <p className="relative text-gray-600 leading-relaxed mb-6 max-w-4xl">{intro}</p>

      <p className="relative text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">Key Features:</p>
      <ul className="relative grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm sm:text-base text-gray-700 leading-relaxed">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#CC9C4C]/15 flex items-center justify-center">
              <CheckCircle className="w-3.5 h-3.5 text-[#9a7126]" />
            </span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
  <MarketingLayout>
    {/* ── Hero ── */}
    <MarketingHero
      size="lg"
      background={
        <Galaxy
          mouseInteraction
          mouseRepulsion
          density={1.1}
          glowIntensity={0.35}
          saturation={0}
          hueShift={0}
          twinkleIntensity={0.4}
          rotationSpeed={0.06}
          starSpeed={0.4}
          repulsionStrength={2}
          transparent={false}
        />
      }
    >
      <div className="text-center">
        <Reveal>
          <Eyebrow tone="gold" className="mx-auto !text-[#CC9C4C] bg-white/5 border-white/15">Solutions We Provide</Eyebrow>
        </Reveal>
        <h1 className="animate-fade-up text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight mt-6">
          A Complete Event Technology Ecosystem,{' '}
          <span className="shimmer-text">Built to Perform.</span>
        </h1>
        <p className="animate-fade-up text-white/75 max-w-3xl mx-auto mt-6 leading-relaxed" style={{ animationDelay: '0.1s' }}>
          Kaizen Events is not a collection of loosely connected tools. It is a single, cohesive platform where
          every feature is designed to work in harmony, so your event runs smoothly from the first click of a
          registration form to the last scan of a QR code at the exit.
        </p>
        <p className="animate-fade-up text-white/75 max-w-3xl mx-auto mt-4 leading-relaxed" style={{ animationDelay: '0.2s' }}>
          Every solution we offer is built to be reliable at scale, secure by design, and flexible enough to
          adapt to your specific event requirements.
        </p>
      </div>
    </MarketingHero>

    {/* ── Solutions (scroll-stacked cards, page scroll) ── */}
    <section className="py-12 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {isDesktop ? (
          <ScrollStack
            useWindowScroll
            itemDistance={100}
            itemStackDistance={24}
            itemScale={0.03}
            baseScale={0.85}
            stackPosition="16%"
            scaleEndPosition="8%"
          >
            {SOLUTIONS.map((s, idx) => (
              <ScrollStackItem key={s.num}>{renderCard(s, idx)}</ScrollStackItem>
            ))}
          </ScrollStack>
        ) : (
          <div className="space-y-6">
            {SOLUTIONS.map((s, idx) => (
              <Reveal key={s.num}>{renderCard(s, idx)}</Reveal>
            ))}
          </div>
        )}
      </div>
    </section>

    {/* ── What Sets Us Apart ── */}
    <section className="relative py-20 bg-gray-50 overflow-hidden">
      <div className="absolute inset-0 ke-dots opacity-60 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow="Why Kaizen Events" title="What Sets Us Apart" className="mb-14">
            There are other event platforms out there. Here is why serious event organizers choose Kaizen
            Events instead.
          </SectionHeading>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {APART.map(({ icon: Icon, title, text }, i) => {
            const a = ACCENTS[i % ACCENTS.length];
            return (
              <Reveal key={title} delay={(i % 3) * 90}>
                <div className="group relative h-full p-7 pb-9 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
                  {/* numbered gradient corner */}
                  <div className={`pointer-events-none absolute -bottom-9 -right-9 w-24 h-24 rounded-full bg-gradient-to-tl ${a.corner}`} />
                  <span className="pointer-events-none absolute bottom-3 right-3.5 text-white font-extrabold text-sm">
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${a.icon} group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-[#091D40] text-lg mb-2.5">{title}</h3>
                  <span className={`block h-1 w-8 rounded-full mb-3 ${a.bar}`} />
                  <p className="text-sm text-gray-600 leading-relaxed pr-8">{text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="flex flex-wrap items-center justify-center gap-4 mt-14">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-sm text-sm font-semibold text-white bg-[#AC1E20] hover:bg-[#7A0B12] transition-colors duration-200 shadow-md hover:-translate-y-0.5"
          >
            Get in Touch <ArrowRight className="w-4 h-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  </MarketingLayout>
  );
};

export default SolutionsPage;
