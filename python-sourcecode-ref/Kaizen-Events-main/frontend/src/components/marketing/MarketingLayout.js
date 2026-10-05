import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu, X, LogIn, PlusCircle,
} from 'lucide-react';
import { SplitText } from './motion';
import PillNav from './PillNav';
import Footer from '../Footer';

export const NAVY = '#091D40';
export const CRIMSON = '#AC1E20';
export const GOLD = '#CC9C4C';

export const NAV_LINKS = [
  { label: 'Home', to: '/home' },
  { label: 'Events', to: '/events' },
  { label: 'Solutions', to: '/solutions' },
  { label: 'Get in Touch', to: '/contact' },
];

/* Scroll reveal — toggles .is-visible on the existing .reveal class from index.css */
export const Reveal = ({ children, delay = 0, className = '', as: Tag = 'div' }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('is-visible');
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
};

/* Small pill label used above section headings */
export const Eyebrow = ({ children, tone = 'crimson', className = '' }) => {
  const tones = {
    crimson: 'bg-[#AC1E20]/8 text-[#AC1E20] border-[#AC1E20]/15',
    gold: 'bg-[#CC9C4C]/12 text-[#9a7126] border-[#CC9C4C]/30',
    light: 'bg-white/10 text-white/85 border-white/15',
  };
  return (
    <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm border text-xs font-bold uppercase tracking-widest ${tones[tone]} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
};

/* Centered section heading block for light sections */
export const SectionHeading = ({ eyebrow, title, children, tone = 'crimson', className = '', titleClassName = 'text-3xl sm:text-4xl' }) => (
  <div className={`text-center max-w-3xl mx-auto ${className}`}>
    {eyebrow && <Eyebrow tone={tone} className="mb-4">{eyebrow}</Eyebrow>}
    {typeof title === 'string' ? (
      <SplitText
        as="h2"
        text={title}
        className={`${titleClassName} font-bold tracking-tight leading-[1.3] pb-[0.25em]`}
        wordClassName="ke-heading-gradient"
      />
    ) : (
      <h2 className={`${titleClassName} font-bold tracking-tight ke-heading-gradient leading-[1.3] pb-[0.25em]`}>{title}</h2>
    )}
    {children && <p className="text-gray-600 mt-4 leading-relaxed">{children}</p>}
  </div>
);

/* Shared dark hero shell — layered grid + glow orbs + gold hairline at the base */
export const MarketingHero = ({ children, className = '', size = 'md', background = null }) => {
  const pad = size === 'lg' ? 'py-20 sm:py-28' : 'py-16 sm:py-24';
  return (
    <section className={`relative overflow-hidden ${background ? 'bg-black' : 'bg-[#091D40]'} ${className}`}>
      {background ? (
        /* full-bleed custom background slot (e.g. WebGL Galaxy) — replaces the
           default navy grid + glow decorations entirely */
        <div className="absolute inset-0">{background}</div>
      ) : (
        <>
          <div className="absolute inset-0 ke-grid pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-[#CC9C4C]/15 blur-3xl" />
            <div className="absolute -bottom-40 -left-24 w-[28rem] h-[28rem] rounded-full bg-[#AC1E20]/25 blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-[#16307a]/30 blur-3xl" />
          </div>
        </>
      )}
      <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${pad}`}>{children}</div>
      <div className="absolute bottom-0 inset-x-0 h-px ke-gold-rule" />
    </section>
  );
};


const MarketingLayout = ({ children }) => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-jakarta">
      {/* ── Header (white floating pill; nav links use React Bits PillNav) ── */}
      {/* sticky so it pins on scroll; negative margin lets the hero sit
          underneath the transparent gutter so the pill floats over it */}
      <header className="sticky top-0 z-50 -mb-[72px] pointer-events-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="pointer-events-auto flex items-center justify-between h-14 gap-4 pl-5 pr-3 rounded-full bg-white/90 backdrop-blur-md border border-black/5 shadow-xl shadow-black/10">
            <Link to="/home" className="flex items-center flex-shrink-0">
              <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-9 w-auto" />
            </Link>

            {/* nav links — React Bits PillNav (animation only; no logo / no mobile) */}
            <div className="hidden md:block">
              <PillNav
                items={NAV_LINKS.map((l) => ({ label: l.label, href: l.to }))}
                activeHref={location.pathname}
                className="ke-embed"
                baseColor="#AC1E20"
                pillColor="transparent"
                pillTextColor="#374151"
                hoveredPillTextColor="#ffffff"
                showLogo={false}
                showMobileMenu={false}
                initialLoadAnimation={false}
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                to="/contact"
                className="hidden sm:inline-flex items-center gap-2 bg-[#AC1E20] hover:bg-[#7A0B12] text-white rounded-sm px-4 py-2 shadow-md shadow-red-200 font-semibold text-sm transition-all duration-200"
              >
                <PlusCircle className="w-4 h-4" />
                Host an Event
              </Link>
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center rounded-sm px-4 py-2 border border-gray-200 text-gray-700 hover:border-[#091D40] hover:text-[#091D40] font-semibold text-sm transition-colors"
              >
                <LogIn className="w-4 h-4 mr-1.5" />
                Login
              </Link>
              <button
                type="button"
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Toggle menu"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu (floating panel under the pill) */}
        {menuOpen && (
          <div className="md:hidden pointer-events-auto max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-2">
            <div className="rounded-2xl bg-white shadow-xl border border-black/5 px-3 py-3 space-y-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-4 py-2.5 rounded-lg text-sm font-semibold ${
                    location.pathname === link.to ? 'text-[#AC1E20] bg-[#AC1E20]/5' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/contact"
                onClick={() => setMenuOpen(false)}
                className="block mt-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-center text-white bg-[#AC1E20]"
              >
                Host an Event
              </Link>
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm font-semibold text-center text-gray-700 border border-gray-200"
              >
                Login
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>{children}</main>

      {/* ── Footer (shared site footer) ── */}
      <Footer />
    </div>
  );
};

export default MarketingLayout;
