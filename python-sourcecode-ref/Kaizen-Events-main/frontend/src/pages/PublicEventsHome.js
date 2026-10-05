import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useSpring, useMotionTemplate, animate as fmAnimate } from 'framer-motion';
import { MReveal, MStagger, MItem, MShow, SplitText, EASE } from '../components/marketing/motion';
import { NAV_LINKS } from '../components/marketing/MarketingLayout';
import Footer from '../components/Footer';
import GridScan from '../components/marketing/GridScan';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Calendar, Search, LogIn, ArrowRight, Phone, Mail,
  Building2, User, CheckCircle, ChevronRight, Users, Map,
  PlusCircle, Star, SlidersHorizontal, ArrowUp, X, Menu,
  Briefcase, FileText, MapPin, Loader2,
  Facebook, Instagram, Linkedin, Twitter, ShieldCheck, RefreshCw,
} from 'lucide-react';
import PhoneInput, { validatePhone } from '../components/ui/PhoneInput';
import useMathCaptcha from '../hooks/useMathCaptcha';
import axios from 'axios';
import { format, parseISO } from 'date-fns';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

// Toggle the (additive) stats-band heading — set false to remove it with zero structural change.
const STATS_HEADING = true;

// Uploaded logos are stored as relative "/api/uploads/..." paths served by the
// backend. The frontend can run on a different origin, so these must be made
// absolute (against the backend) or the <img> resolves to the frontend origin
// and 404s. Mirrors the helper used across Campaigns/FormBuilder/etc.
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${API_BASE_URL}${url}` : (url || '');

const sortEvents = (events, sort) => {
  const arr = [...events];
  switch (sort) {
    case 'date_asc':  return arr.sort((a, b) => (a.start_date || '') < (b.start_date || '') ? -1 : 1);
    case 'date_desc': return arr.sort((a, b) => (a.start_date || '') > (b.start_date || '') ? -1 : 1);
    case 'name_asc':  return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'name_desc': return arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    default:          return arr;
  }
};

// ── Sub-components ────────────────────────────────────────────────────────────

// Animated counter — counts up from 0 when scrolled into view.
// Accepts values like "4,500+", "125", "12,540"; preserves commas and suffixes.
const CountUp = ({ value, duration = 1500, className }) => {
  const ref = useRef(null);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const str = String(value);
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) { setDisplay(str); return; }
    const suffix = (str.match(/[+%]+$/) || [''])[0];
    const useCommas = str.includes(',') || num >= 1000;
    let raf;
    let started = false;

    const animate = () => {
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const cur = Math.round(num * eased);
        setDisplay((useCommas ? cur.toLocaleString('en-IN') : String(cur)) + suffix);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        animate();
        obs.disconnect();
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [value, duration]);

  return <span ref={ref} className={className}>{display}</span>;
};

// Live-updating counter — re-animates on EVERY value change (search/sort),
// unlike CountUp which only fires once on inView.
const AnimatedCount = ({ value, className = '' }) => {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [disp, setDisp] = useState(value);
  useEffect(() => {
    if (reduce) { setDisp(value); return undefined; }
    const c = fmAnimate(mv, value, { duration: 0.5, ease: EASE, onUpdate: v => setDisp(Math.round(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <span className={`tabular-nums ${className}`}>{disp}</span>;
};

// Cursor-follow gold spotlight + subtle springed 3D tilt.
// The page's ONE allowed instance of this idiom — wraps the FeaturedEvent card.
const SpotlightTilt = ({ children, className = '' }) => {
  const reduce = useReducedMotion();
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const rx = useSpring(0, { stiffness: 150, damping: 18 });
  const ry = useSpring(0, { stiffness: 150, damping: 18 });
  const glow = useMotionTemplate`radial-gradient(440px circle at ${mx}% ${my}%, rgba(204,158,74,0.16), transparent 60%)`;
  const onMove = (e) => {
    if (reduce || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px * 100); my.set(py * 100);
    ry.set((px - 0.5) * 6); rx.set(-(py - 0.5) * 6);
  };
  const onLeave = () => { rx.set(0); ry.set(0); mx.set(50); my.set(50); };
  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      className={className}
    >
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 rounded-[inherit]" style={{ background: glow }} />
      {children}
    </motion.div>
  );
};

// The page's single WebGL canvas (GridScan) — mounts only when the stats band
// nears the viewport, only if no other canvas is active, never under reduced motion.
let __keWebglClaimed = false;
const LazyGridScan = () => {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (reduce || __keWebglClaimed || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !__keWebglClaimed) { __keWebglClaimed = true; setShow(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => { io.disconnect(); __keWebglClaimed = false; };
  }, [reduce]);
  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-0 opacity-50 pointer-events-none">
      {show && (
        <GridScan
          linesColor="#27407e"
          scanColor="#CC9C4C"
          scanOpacity={0.2}
          gridScale={0.08}
          lineJitter={0.06}
          scanDuration={6}
          scanDelay={1.5}
          enablePost={false}
        />
      )}
    </div>
  );
};

// Footer link with a gold underline that wipes in from the left (zero layout shift).
const FooterLink = ({ to, onClick, children }) => {
  const base = 'group/li inline-flex items-center text-gray-400 hover:text-[#CC9C4C] transition-colors duration-200 focus-visible:outline-none focus-visible:text-[#CC9C4C]';
  const inner = (
    <span className="relative after:content-[''] after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-[#CC9C4C] after:transition-[width] after:duration-300 after:ease-out group-hover/li:after:w-full group-focus-visible/li:after:w-full">
      {children}
    </span>
  );
  return to
    ? <Link to={to} className={base}>{inner}</Link>
    : <button type="button" onClick={onClick} className={base}>{inner}</button>;
};

// Footer social orb — lifts + gold-rings on hover.
const SocialButton = ({ icon: Icon, label, href = '#' }) => (
  <motion.a
    href={href}
    aria-label={label}
    target="_blank"
    rel="noopener noreferrer"
    whileHover={{ y: -3 }}
    whileTap={{ scale: 0.92 }}
    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-[#CC9C4C] hover:border-[#CC9C4C]/50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC9C4C]/60"
  >
    <Icon className="w-4 h-4" />
  </motion.a>
);

// Shimmer skeleton primitive (light default; dark variant for the navy banner).
const Sk = ({ className = '', dark = false }) => (
  <div className={(dark
    ? 'bg-white/10 animate-pulse motion-reduce:animate-none '
    : 'bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-[ke-shimmer_1.4s_linear_infinite] motion-reduce:animate-none ')
    + 'relative overflow-hidden rounded-md ' + className} />
);

const EventCardSkeleton = () => (
  <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col">
    <div className="relative h-44">
      <Sk className="absolute inset-0 !rounded-none" />
      <div className="absolute top-3 left-3"><Sk className="w-16 h-5 rounded-full" /></div>
      <div className="absolute top-3 right-3"><Sk className="w-10 h-10 rounded-xl" /></div>
    </div>
    <div className="p-4 flex flex-col flex-1">
      <Sk className="w-5/6 h-4 mb-2" />
      <Sk className="w-2/3 h-4 mb-4" />
      <div className="space-y-2 mb-3">
        <Sk className="w-full h-3" />
        <Sk className="w-4/5 h-3" />
        <Sk className="w-3/5 h-3" />
      </div>
      <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
        <Sk className="w-12 h-3" />
        <Sk className="w-16 h-3" />
      </div>
    </div>
  </div>
);

const EventsLoadingSkeleton = ({ count = 8 }) => (
  <div>
    <span className="sr-only" role="status" aria-live="polite">Loading events…</span>
    {/* featured banner placeholder */}
    <div className="mb-10 rounded-3xl p-6 sm:p-9 overflow-hidden" style={{ background: 'linear-gradient(135deg, #091D40 0%, #0D2558 55%, #071538 100%)' }}>
      <div className="max-w-lg space-y-4">
        <Sk dark className="w-32 h-6 rounded-full" />
        <Sk dark className="w-3/4 h-8" />
        <Sk dark className="w-full h-4" />
        <Sk dark className="w-40 h-10 rounded-full" />
      </div>
    </div>
    {/* header row */}
    <div className="flex items-center justify-between mb-5">
      <div className="space-y-2"><Sk className="w-44 h-6" /><Sk className="w-24 h-3" /></div>
      <Sk className="w-40 h-9 rounded-full" />
    </div>
    {/* grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: count }).map((_, i) => <EventCardSkeleton key={i} />)}
    </div>
  </div>
);


// Branded color fallback shown when an event has no usable image (none stored, or it 404s).
const BrandedPlaceholder = ({ className = '' }) => (
  <div
    className={'relative overflow-hidden ' + className}
    style={{ background: 'linear-gradient(135deg, #091D40 0%, #16307a 55%, #091D40 100%)' }}
    aria-hidden="true"
  >
    <div className="absolute inset-0 ke-grid opacity-50" />
    <div className="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-[#CC9C4C]/20 blur-2xl" />
    <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-[#AC1E20]/15 blur-2xl" />
  </div>
);

// Stock event photos used as a fallback when an event has no uploaded image,
// so every card shows a relevant photo (matches the previous site behaviour).
const FALLBACK_EVENT_IMAGES = [
  'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1200&h=600&fit=crop',
];
// Stable per-event pick so each event always gets the same fallback photo.
const pickFallbackImage = (event) => {
  const key = String(event?.id || event?.slug || event?.name || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_EVENT_IMAGES[h % FALLBACK_EVENT_IMAGES.length];
};

// Grid-card image: real upload if present, else a stock event photo.
const EventImage = ({ event, className = '' }) => {
  const logo = event.logo_url || event.event_logo;
  const src = logo ? toAbsUrl(logo) : pickFallbackImage(event);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <BrandedPlaceholder className={className} />;
  }
  return <img src={src} alt={event.name} className={className} loading="lazy" onError={() => setFailed(true)} />;
};

// Featured right-pane media: Ken-Burns real image, else the branded color placeholder.
const FeaturedImage = ({ event, reduce }) => {
  const logo = event.logo_url || event.event_logo;
  const src = logo ? toAbsUrl(logo) : pickFallbackImage(event);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <BrandedPlaceholder className="absolute inset-0" />;
  }
  return (
    <motion.img
      src={src}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setFailed(true)}
      animate={reduce ? undefined : { scale: [1, 1.08, 1], x: [0, -10, 0], y: [0, 6, 0] }}
      transition={reduce ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};


const EventCard = ({ event }) => {
  const to  = `/register/${event.slug}`;

  const dateLabel = event.start_date
    ? (() => { try {
        const s = format(parseISO(event.start_date), 'dd MMM yyyy');
        const e2 = event.end_date ? ' – ' + format(parseISO(event.end_date), 'dd MMM yyyy') : '';
        return s + e2;
      } catch { return event.start_date; } })()
    : null;

  return (
    <Link
      to={to}
      aria-label={`Register for ${event.name}`}
      className="group relative block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC9C4C] focus-visible:ring-offset-2"
    >
      {/* gold→crimson hairline border — fades in on hover */}
      <span aria-hidden="true" className="absolute -inset-px rounded-[17px] bg-[linear-gradient(135deg,#CC9C4C,#AC1E20,#CC9C4C)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* card surface */}
      <div className="relative h-full flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm group-hover:shadow-xl transition-shadow duration-300 overflow-hidden">
        {/* Image */}
        <div className="relative h-44 overflow-hidden flex-shrink-0">
          <EventImage event={event} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          {/* Gradient overlay at bottom for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

          {/* Date chip — top right */}
          {event.start_date && (() => { try {
            const mon = format(parseISO(event.start_date), 'MMM');
            const day = format(parseISO(event.start_date), 'dd');
            return (
              <div className="absolute top-3 right-3 bg-white rounded-xl overflow-hidden text-center shadow-md transition-transform duration-300 group-hover:-translate-y-0.5">
                <div className="h-0.5 bg-[linear-gradient(90deg,#CC9C4C,#AC1E20)]" />
                <div className="px-2 py-1">
                  <div className="text-[9px] font-extrabold text-[#091D40] uppercase leading-none">{mon}</div>
                  <div className="text-base font-extrabold text-gray-900 leading-tight">{day}</div>
                </div>
              </div>
            );
          } catch { return null; } })()}

        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-[#AC1E20] transition-colors mb-2">
            {event.name}
          </h3>

          <div className="space-y-1.5 mb-3">
            {dateLabel && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <div className="w-5 h-5 rounded-md bg-[#eaecf5] flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3 h-3 text-[#091D40]" />
                </div>
                <span className="line-clamp-1">{dateLabel}</span>
              </div>
            )}
            {event.organization_name && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <div className="w-5 h-5 rounded-md bg-[#fdf2f2] flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-3 h-3 text-[#AC1E20]" />
                </div>
                <span className="line-clamp-1">{event.organization_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <div className="w-5 h-5 rounded-md bg-green-50 flex items-center justify-center flex-shrink-0">
                <Users className="w-3 h-3 text-green-500" />
              </div>
              <span>Registrations open</span>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              {event.status === 'active' ? 'Active' : event.status || 'Live'}
            </span>
            <span className="relative inline-flex items-center gap-1 text-xs font-bold text-[#AC1E20]">
              Register
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              <span aria-hidden="true" className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#AC1E20] transition-all duration-300 group-hover:w-[calc(100%-1.1rem)]" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const PublicEventsHome = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const emptyContactForm = {
    contact_name: '', mobile_number: '', email: '', club_name: '',
    district: '', designation: '', purpose: '', estimated_registrants: '', event_date: '',
  };
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const captcha = useMathCaptcha();
  const [sortBy, setSortBy] = useState('date_asc');
  const [showFilters, setShowFilters] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');
  const reduce = useReducedMotion();

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/public/events`);
      setEvents(data);
    } catch (e) {
      console.error('Failed to fetch events:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.name.toLowerCase().includes(q)
      || e.organization_name?.toLowerCase().includes(q)
      || e.description?.toLowerCase().includes(q);
  });

  const handleContactFormChange = (field, value) =>
    setContactForm(p => ({ ...p, [field]: value }));

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!validatePhone(contactForm.mobile_number, contactForm._countryCode || 'IN')) {
      alert('Please enter a valid mobile number');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/api/contact-sales`, { ...contactForm, ...captcha.payload });
      setSubmitSuccess(true);
      setTimeout(() => {
        setShowContactModal(false);
        setSubmitSuccess(false);
        setContactForm(emptyContactForm);
      }, 2000);
    } catch (error) {
      // Show the server's reason for a rejected captcha rather than a blank "failed".
      alert(error.response?.status === 400 && error.response?.data?.detail
        ? error.response.data.detail
        : 'Failed to submit. Please try again.');
    } finally {
      // Single-use token — always replace it, success or failure.
      captcha.refresh();
      setSubmitting(false);
    }
  };

  const featured = filteredEvents[0] || null;
  const activeCount = events.length;
  const clubCount = new Set(events.map(e => e.organization_name).filter(Boolean)).size;
  const displayEvents = sortEvents(filteredEvents.slice(featured ? 1 : 0), sortBy);

  const [sortField, sortDir] = sortBy.split('_');
  const setSort = (f, d) => setSortBy(`${f}_${d}`);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/" className="flex items-center flex-shrink-0">
              <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-10 w-auto" />
            </Link>

            <div className="flex-1 max-w-xl hidden md:block">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search Events, clubs, activities..."
                  className="w-full pl-11 pr-4 h-10 bg-gray-50 border-gray-200 rounded-full text-sm focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                onClick={() => setShowContactModal(true)}
                className="hidden sm:flex items-center gap-2 bg-[#AC1E20] hover:bg-[#7A0B12] text-white rounded-sm px-4 shadow-md shadow-red-200 font-semibold transition-all duration-200"
              >
                <PlusCircle className="w-4 h-4" />
                Host an Event
              </Button>
              <Link to="/login">
                <Button size="sm" variant="outline" className="rounded-sm px-4 border-gray-200 text-gray-700 hover:border-[#091D40] hover:text-[#091D40] font-semibold">
                  <LogIn className="w-4 h-4 mr-1.5" />
                  Login
                </Button>
              </Link>

              {/* Hamburger — opens side drawer */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full text-gray-600 hover:text-[#091D40] hover:bg-gray-50 transition-colors duration-200"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mobile search */}
          <div className="md:hidden pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search events..."
                className="w-full pl-10 h-9 bg-gray-50 border-gray-200 rounded-full text-sm"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Slide-in side drawer (hamburger menu) ── */}
      {/* dimming overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      {/* panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white z-[70] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 flex-shrink-0">
          <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-9 w-auto" />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-500 hover:text-[#091D40] hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-[15px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#091D40] transition-colors group"
            >
              {link.label}
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#AC1E20] group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </nav>

        {/* drawer footer CTAs */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => { setMenuOpen(false); setShowContactModal(true); }}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-sm text-sm font-semibold text-white bg-[#AC1E20] hover:bg-[#7A0B12] shadow-md shadow-red-200 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Host an Event
          </button>
          <Link
            to="/login"
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-sm text-sm font-semibold text-gray-700 border border-gray-200 hover:border-[#091D40] hover:text-[#091D40] transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Login
          </Link>
        </div>
      </aside>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden min-h-[420px] sm:min-h-[460px] bg-[#091D40]">
        {/* Background image */}
        <img
          src="https://eventsexpert.in/wp-content/uploads/2026/04/Career-in-Event-Management-Corporate-event.jpeg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Dark gradient overlay — heavy on left, lighter on right so image shows */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(100deg, rgba(4,21,75,0.97) 0%, rgba(4,21,75,0.90) 42%, rgba(4,21,75,0.62) 70%, rgba(4,21,75,0.22) 100%)' }}
        />
        {/* blueprint grid, masked to the dark left */}
        <div
          className="absolute inset-0 ke-grid opacity-[0.13] pointer-events-none"
          style={{ WebkitMaskImage: 'radial-gradient(120% 100% at 18% 42%, #000 32%, transparent 80%)', maskImage: 'radial-gradient(120% 100% at 18% 42%, #000 32%, transparent 80%)' }}
          aria-hidden="true"
        />
        {/* single floating gold glow blob */}
        <div className="absolute -top-16 right-[12%] w-72 h-72 rounded-full bg-[#CC9C4C]/25 blur-3xl pointer-events-none animate-float" aria-hidden="true" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20 relative">
          <MStagger immediate className="max-w-xl" stagger={0.1}>
            {/* eyebrow */}
            <MItem>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#CC9C4C]/40 bg-[#CC9C4C]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#CC9C4C] backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  {!reduce && (
                    <motion.span
                      className="absolute inline-flex h-full w-full rounded-full bg-[#CC9C4C]"
                      animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#CC9C4C]" />
                </span>
                Live District Events
              </span>
            </MItem>

            {/* animated headline — direct child of MStagger */}
            <SplitText
              as="h1"
              by="word"
              segments={[
                { text: 'Discover Events ' },
                { text: 'Near You', className: 'shimmer-text' },
              ]}
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-[1.1] drop-shadow-lg"
              stagger={0.06}
              duration={0.5}
              amount={0.3}
              delay={0.08}
            />

            <MItem className="mt-3">
              <p className="text-white/80 text-sm sm:text-base max-w-md drop-shadow">
                Find and join district programs, sports meets, training seminars, and community events all in one place.
              </p>
            </MItem>

            {/* Stats chips — nested cascade */}
            <MStagger immediate stagger={0.08} delayChildren={0.35} className="mt-7 flex items-stretch gap-3 flex-wrap">
              {[
                { value: activeCount > 0 ? String(activeCount) : '125', label: 'Active Events', icon: Calendar },
                { value: clubCount > 0 ? String(clubCount) : '18',      label: 'Event Clubs',   icon: Building2 },
                { value: '4,500+',                                      label: 'Registrations', icon: Users },
              ].map(({ value, label, icon: Icon }) => (
                <MItem key={label} whileHover={{ y: -4 }}>
                  <div className="group relative overflow-hidden flex items-center gap-3 rounded-2xl px-4 py-3 bg-white/10 backdrop-blur-md border border-white/15 shadow-lg shadow-black/10 transition-all duration-300 hover:bg-white/15 hover:border-[#CC9C4C]/45 hover:ring-1 hover:ring-[#CC9C4C]/30">
                    <span className="absolute top-0 left-4 right-4 h-px ke-gold-rule opacity-50 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true" />
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                      style={{ background: 'rgba(204,158,74,0.22)', border: '1px solid rgba(204,158,74,0.35)' }}>
                      <Icon className="w-4 h-4" style={{ color: '#CC9C4C' }} />
                    </div>
                    <div>
                      <CountUp value={value} className="block text-xl sm:text-2xl font-extrabold text-white leading-none drop-shadow" />
                      <div className="text-[11px] text-[#CC9C4C] font-semibold mt-1 whitespace-nowrap">{label}</div>
                    </div>
                  </div>
                </MItem>
              ))}
            </MStagger>

            {/* CTA */}
            <MItem className="mt-7 flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => document.getElementById('events-main')?.scrollIntoView({ behavior: 'smooth' })}
                className="group inline-flex items-center gap-1 rounded-full border border-white/40 text-white hover:border-[#CC9C4C] hover:text-[#CC9C4C] px-6 py-2.5 font-semibold backdrop-blur-sm transition-colors"
              >
                Next Event
                <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </MItem>
          </MStagger>
        </div>

        {/* gold hairline divider */}
        <div className="absolute bottom-0 inset-x-0 h-px ke-gold-rule" aria-hidden="true" />
      </section>


      {/* ── Main Content ── */}
      <main id="events-main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {loading ? (
          <EventsLoadingSkeleton count={8} />
        ) : (
          <>
            {/* ── Featured Event ── */}
            {featured && !searchQuery && (() => {
              let mon = null, day = null, dateRange = null;
              if (featured.start_date) { try {
                mon = format(parseISO(featured.start_date), 'MMM');
                day = format(parseISO(featured.start_date), 'dd');
                const sd = format(parseISO(featured.start_date), 'dd');
                const ed = featured.end_date
                  ? format(parseISO(featured.end_date), 'dd MMM yyyy')
                  : format(parseISO(featured.start_date), 'dd MMM yyyy');
                dateRange = `${sd} – ${ed}`;
              } catch { /* ignore bad dates */ } }
              return (
              <MReveal as="section" className="mb-10">
                <div className="relative rounded-3xl p-[1.5px] overflow-hidden shadow-2xl shadow-[#091D40]/30">
                  {/* animated / static gold border */}
                  {reduce
                    ? <div aria-hidden="true" className="absolute inset-0 rounded-3xl ke-gold-rule" />
                    : <div aria-hidden="true" className="absolute -inset-[60%] ke-conic animate-spin-slow opacity-90 blur-[2px]" />}

                  <Link
                    to={`/register/${featured.slug}`}
                    aria-label={`Register for ${featured.name}`}
                    className="group relative block rounded-[calc(1.5rem-1px)] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC9C4C] focus-visible:ring-offset-2"
                  >
                    <SpotlightTilt className="relative grid md:grid-cols-[1.35fr_1fr] rounded-[inherit] overflow-hidden bg-[linear-gradient(135deg,#091D40,#0D2558_55%,#071538)]">
                      {/* LEFT pane */}
                      <div className="relative z-10 p-6 sm:p-9">
                        <div className="absolute inset-0 ke-grid opacity-60 pointer-events-none" aria-hidden="true" />
                        <div className="relative">
                          {/* shiny FEATURED badge */}
                          <span className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-[#CC9C4C] to-[#e0c281] text-[#091D40] text-xs font-bold px-3 py-1 mb-4">
                            {!reduce && (
                              <motion.span
                                aria-hidden="true"
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                                animate={{ x: ['-130%', '130%'] }}
                                transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
                              />
                            )}
                            <Star className="relative w-3 h-3" />
                            <span className="relative">FEATURED EVENT</span>
                          </span>

                          <SplitText
                            as="h2"
                            by="word"
                            text={featured.name}
                            amount={0.5}
                            stagger={0.05}
                            duration={0.5}
                            className="text-2xl sm:text-3xl font-extrabold text-white mb-2 group-hover:text-[#CC9C4C] transition-colors"
                          />

                          <p className="text-white/70 text-sm mb-4 line-clamp-2 max-w-lg">
                            {featured.description || featured.organization_name}
                          </p>

                          {/* meta chips */}
                          <MStagger stagger={0.08} className="flex flex-wrap gap-2 mb-6">
                            {featured.organization_name && (
                              <MItem whileHover={{ y: -2 }}>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                                  <Building2 className="w-3.5 h-3.5 text-[#CC9C4C]" /> {featured.organization_name}
                                </span>
                              </MItem>
                            )}
                            {dateRange && (
                              <MItem whileHover={{ y: -2 }}>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                                  <Calendar className="w-3.5 h-3.5 text-[#CC9C4C]" /> {dateRange}
                                </span>
                              </MItem>
                            )}
                            <MItem whileHover={{ y: -2 }}>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-400/25 px-3 py-1 text-xs text-green-200">
                                <span className="relative flex h-2 w-2">
                                  {!reduce && (
                                    <motion.span
                                      className="absolute inline-flex h-full w-full rounded-full bg-green-400"
                                      animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                                    />
                                  )}
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                                </span>
                                Registrations open
                              </span>
                            </MItem>
                          </MStagger>

                          {/* CTA — styled span so the whole card is one focusable link */}
                          <span className="relative inline-flex items-center gap-2 rounded-full bg-[#AC1E20] group-hover:bg-[#7A0B12] text-white px-6 py-2.5 font-semibold shadow-lg shadow-red-900/40 transition-colors">
                            Register Now
                            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                          </span>
                        </div>
                      </div>

                      {/* RIGHT pane — Ken-Burns image (or branded placeholder) + medallion */}
                      <div className="relative hidden md:block min-h-[280px] overflow-hidden">
                        <FeaturedImage event={featured} reduce={reduce} />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,#091D40,rgba(10,29,72,0.55) 35%,transparent 75%)' }} aria-hidden="true" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" aria-hidden="true" />
                        {mon && (
                          <div className="absolute top-5 right-5 bg-white/95 rounded-2xl px-3 py-2 text-center shadow-xl animate-float">
                            <div className="text-[10px] font-extrabold text-[#AC1E20] uppercase leading-none">{mon}</div>
                            <div className="text-2xl font-extrabold text-[#091D40] leading-tight">{day}</div>
                          </div>
                        )}
                      </div>
                    </SpotlightTilt>
                  </Link>
                </div>
              </MReveal>
              );
            })()}

            {/* ── Upcoming Events ── */}
            <section>
              {/* Section header + filter bar */}
              <MReveal className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
                <div>
                  {searchQuery ? (
                    <motion.h2
                      key="search-heading"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="text-xl sm:text-2xl font-bold tracking-tight ke-heading-gradient pb-[0.1em]"
                    >
                      Results for &ldquo;{searchQuery}&rdquo;
                    </motion.h2>
                  ) : (
                    <SplitText
                      as="h2"
                      by="word"
                      text="Upcoming Events"
                      wordClassName="ke-heading-gradient"
                      stagger={0.05}
                      amount={0.6}
                      className="text-xl sm:text-2xl font-bold tracking-tight pb-[0.1em]"
                    />
                  )}
                  <MShow
                    from={{ scaleX: 0 }}
                    to={{ scaleX: 1 }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
                    className="h-px ke-gold-rule mt-2 w-24 origin-left"
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    <AnimatedCount value={displayEvents.length} /> event{displayEvents.length !== 1 ? 's' : ''} found
                  </p>
                </div>

                {/* Sort + Filter controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* segmented field toggle */}
                  <div className="relative flex items-center bg-gray-100 rounded-full p-1">
                    {[{ k: 'date', label: 'Date' }, { k: 'name', label: 'Name' }].map(({ k, label }) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSort(k, sortDir)}
                        className={`relative z-10 px-3 py-1.5 text-sm font-semibold rounded-full transition-colors ${sortField === k ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        {sortField === k && (
                          <motion.span
                            layoutId="sortField"
                            className="absolute inset-0 -z-10 rounded-full bg-[#091D40]"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                          />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* direction toggle */}
                  <button
                    type="button"
                    onClick={() => setSort(sortField, sortDir === 'asc' ? 'desc' : 'asc')}
                    aria-label="Toggle sort direction"
                    className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-sm px-3 py-1.5 shadow-sm text-sm font-medium text-gray-700 hover:border-[#091D40] transition-colors"
                  >
                    <motion.span
                      animate={{ rotate: sortDir === 'asc' ? 0 : 180 }}
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 20 }}
                      className="inline-flex"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </motion.span>
                    {sortField === 'date' ? (sortDir === 'asc' ? 'Earliest' : 'Latest') : (sortDir === 'asc' ? 'A–Z' : 'Z–A')}
                  </button>

                  {/* Filter toggle */}
                  <button
                    type="button"
                    onClick={() => setShowFilters(f => !f)}
                    aria-expanded={showFilters}
                    aria-controls="filter-panel"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-sm font-medium shadow-sm transition-colors ${
                      showFilters
                        ? 'bg-[#AC1E20] border-[#AC1E20] text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-[#091D40]'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    Filter
                  </button>
                </div>
              </MReveal>

              {/* Filter panel */}
              <AnimatePresence initial={false}>
                {showFilters && (
                  <motion.div
                    id="filter-panel"
                    key="filter-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 mt-1 mb-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-[#091D40]" />
                          Filter Events
                        </span>
                        {searchQuery && (
                          <button
                            onClick={() => setShowFilters(false)}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Close
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* Registration status filter pills */}
                        {[
                          { label: 'All Events',   value: '' },
                          { label: 'Open Now',      value: 'open' },
                          { label: 'This Month',    value: 'month' },
                          { label: 'This Week',     value: 'week' },
                        ].map(f => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => setActiveFilter(f.value)}
                            className={`relative px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors ${
                              activeFilter === f.value
                                ? 'text-white border-[#091D40]'
                                : 'bg-[#eaecf5] border-[#c0c7e0] text-[#091D40] hover:bg-[#d0d5ed]'
                            }`}
                          >
                            {activeFilter === f.value && (
                              <motion.span
                                layoutId="filterPill"
                                className="absolute inset-0 rounded-full bg-[#091D40]"
                                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                              />
                            )}
                            <span className="relative z-[1]">{f.label}</span>
                          </button>
                        ))}
                        <div className="w-px bg-gray-200 mx-1" />
                        <span className="text-xs text-gray-400 self-center">Sort by date above to reorder results</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Events grid */}
              {displayEvents.length === 0 ? (
                <motion.div
                  className="text-center py-16"
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  {/* gold medallion */}
                  <div className="relative w-24 h-24 mx-auto mb-5 text-[#CC9C4C]">
                    <div className="absolute inset-0 rounded-full ke-conic animate-spin-slow opacity-60 blur-[1px]" aria-hidden="true" />
                    <div className="absolute inset-1 rounded-full bg-white ke-dots" aria-hidden="true" />
                    <div className="absolute inset-0 rounded-full pulse-ring" aria-hidden="true" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      {searchQuery
                        ? <Search className="w-9 h-9 animate-float" />
                        : <Calendar className="w-9 h-9 animate-float" />}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">No Events Found</h3>
                  <p className="text-sm text-gray-500 mb-5">
                    {searchQuery ? 'Try a different search term' : 'Check back soon for upcoming events'}
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-2 rounded-full bg-[#091D40] hover:bg-[#16307a] text-white px-5 py-2.5 text-sm font-semibold transition-colors"
                      >
                        <X className="w-4 h-4" /> Clear search
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowContactModal(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-[#AC1E20] hover:bg-[#7A0B12] text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-red-200 transition-colors"
                      >
                        <PlusCircle className="w-4 h-4" /> Host an Event
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <MStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" stagger={0.07}>
                  {displayEvents.map((event) => (
                    <MItem key={event.id} whileHover={{ y: -6 }}>
                      <EventCard event={event} />
                    </MItem>
                  ))}
                </MStagger>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── Stats Banner ── */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(90deg, #091D40 0%, #0D2558 50%, #091D40 100%)' }}>
        {/* gold seams */}
        <div className="absolute inset-x-0 top-0 h-px ke-gold-rule" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-px ke-gold-rule" aria-hidden="true" />
        {/* the page's single WebGL canvas (lazy-mounted, reduced-motion-off) */}
        <LazyGridScan />
        {/* CSS base — always present, full look under reduced motion */}
        <div className="absolute -top-24 -left-16 w-72 h-72 rounded-full opacity-15 blur-3xl pointer-events-none animate-float"
          style={{ background: 'radial-gradient(circle, #CC9C4C 0%, transparent 65%)' }} aria-hidden="true" />
        <div className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full opacity-10 blur-3xl pointer-events-none animate-float-slow"
          style={{ background: 'radial-gradient(circle, #AC1E20 0%, transparent 65%)' }} aria-hidden="true" />
        {/* dot texture */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '28px 28px' }} aria-hidden="true" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative">
          {STATS_HEADING && (
            <MReveal className="text-center mb-8">
              <div className="inline-flex items-center gap-3 text-[#CC9C4C] text-xs font-bold uppercase tracking-[0.2em] mb-3">
                <span className="w-8 h-px ke-gold-rule" aria-hidden="true" />
                Our Community
                <span className="w-8 h-px ke-gold-rule" aria-hidden="true" />
              </div>
              <SplitText
                as="h2"
                by="word"
                segments={[{ text: 'Powering events across the' }, { text: 'district', className: 'shimmer-text' }]}
                className="text-2xl sm:text-3xl font-extrabold text-white"
                stagger={0.05}
                amount={0.5}
              />
            </MReveal>
          )}
          <MStagger className="grid grid-cols-2 lg:grid-cols-4 gap-4" stagger={0.1}>
            {[
              { value: '12,540', label: 'Community Members', icon: Users },
              { value: '325',    label: 'Events Hosted',     icon: Calendar },
              { value: '128',    label: 'District Events',   icon: Map },
              { value: '42',     label: 'Clubs',             icon: Star },
            ].map(({ value, label, icon: Icon }) => (
              <MItem key={label} whileHover={{ y: -4 }}
                className="group flex flex-col items-center text-center rounded-2xl px-4 py-6 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#CC9C4C]/40 transition-all duration-300">
                <div className="relative w-12 h-12 rounded-full flex items-center justify-center mb-3 text-[#CC9C4C] pulse-ring group-hover:scale-110 transition-transform duration-300"
                  style={{ background: 'rgba(204,158,74,0.18)', border: '1px solid rgba(204,158,74,0.35)' }}>
                  <Icon className="w-5 h-5" style={{ color: '#CC9C4C' }} />
                </div>
                <CountUp value={value} className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight" />
                <div className="text-xs font-semibold mt-1" style={{ color: '#CC9C4C' }}>{label}</div>
                <MShow from={{ scaleX: 0 }} to={{ scaleX: 1 }} transition={{ duration: 0.6, ease: EASE, delay: 0.2 }} className="h-[2px] w-10 ke-gold-rule mt-2 origin-center" />
              </MItem>
            ))}
          </MStagger>
        </div>
      </section>

      {/* ── Footer (shared site footer) ── */}
      <Footer />

      {/* ── Contact / Host Event Modal ── */}
      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button:last-child]:text-white [&>button:last-child]:top-4 [&>button:last-child]:right-4">

          {/* Navy header */}
          <div className="px-6 pt-5 pb-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #091D40 0%, #0D2558 100%)' }}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2 pr-8">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(204,158,74,0.2)' }}>
                  <PlusCircle className="w-5 h-5" style={{ color: '#CC9C4C' }} />
                </div>
                Host Your Event
              </DialogTitle>
              <DialogDescription style={{ color: 'rgba(255,255,255,0.60)' }}>
                Fill out the form and our team will get back to you within 24 hours.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {submitSuccess ? (
              <div className="py-16 text-center px-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(204,158,74,0.12)' }}>
                  <CheckCircle className="w-8 h-8" style={{ color: '#CC9C4C' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#091D40' }}>Thank You!</h3>
                <p className="text-gray-500">Our team will contact you shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="px-6 py-5 space-y-4">

                {/* Row 1: Contact Person */}
                <div className="space-y-1.5">
                  <Label htmlFor="contact_name" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                    <User className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Contact Person *
                  </Label>
                  <Input id="contact_name" value={contactForm.contact_name}
                    onChange={e => handleContactFormChange('contact_name', e.target.value)}
                    placeholder="Enter your name" required
                    className="h-9 text-sm border-gray-200 focus-visible:ring-1 focus-visible:ring-[#091D40]" />
                </div>

                {/* Row 2: Mobile Number */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                    <Phone className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Mobile Number *
                  </Label>
                  <PhoneInput
                    value={contactForm.mobile_number}
                    onChange={v => handleContactFormChange('mobile_number', v)}
                    onCountryChange={c => handleContactFormChange('_countryCode', c)}
                    required
                    selectClassName="!h-9 !w-[150px] !text-sm !border-gray-200 focus:!ring-1 focus:!ring-[#091D40] focus:!border-[#091D40]"
                    inputClassName="!h-9 !text-sm !border-gray-200 focus-visible:!ring-1 focus-visible:!ring-[#091D40] focus-visible:!border-[#091D40]"
                  />
                </div>

                {/* Row 3: Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                    <Mail className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Email ID *
                  </Label>
                  <Input id="email" type="email" value={contactForm.email}
                    onChange={e => handleContactFormChange('email', e.target.value)}
                    placeholder="you@example.com" required
                    className="h-9 text-sm border-gray-200 focus-visible:ring-1 focus-visible:ring-[#091D40]" />
                </div>

                {/* Row 3: Club / Organization | District */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="club_name" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                      <Building2 className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Club / Organization *
                    </Label>
                    <Input id="club_name" value={contactForm.club_name}
                      onChange={e => handleContactFormChange('club_name', e.target.value)}
                      placeholder="Enter club name" required
                      className="h-9 text-sm border-gray-200 focus-visible:ring-1 focus-visible:ring-[#091D40]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="district" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                      <MapPin className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> District *
                    </Label>
                    <Input id="district" value={contactForm.district}
                      onChange={e => handleContactFormChange('district', e.target.value)}
                      placeholder="Enter district" required
                      className="h-9 text-sm border-gray-200 focus-visible:ring-1 focus-visible:ring-[#091D40]" />
                  </div>
                </div>

                {/* Row 4: Designation */}
                <div className="space-y-1.5">
                  <Label htmlFor="designation" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                    <Briefcase className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Designation *
                  </Label>
                  <Input id="designation" value={contactForm.designation}
                    onChange={e => handleContactFormChange('designation', e.target.value)}
                    placeholder="e.g., President, Secretary" required
                    className="h-9 text-sm border-gray-200 focus-visible:ring-1 focus-visible:ring-[#091D40]" />
                </div>

                {/* Row 5: Event Purpose */}
                <div className="space-y-1.5">
                  <Label htmlFor="purpose" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                    <FileText className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Event Purpose *
                  </Label>
                  <Textarea id="purpose" value={contactForm.purpose}
                    onChange={e => handleContactFormChange('purpose', e.target.value)}
                    placeholder="Describe your event briefly..." required rows={3}
                    className="border-gray-200 resize-none focus-visible:ring-1 focus-visible:ring-[#091D40] text-sm" />
                </div>

                {/* Row 6: Expected Attendees | Event Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                      <Users className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Expected Attendees *
                    </Label>
                    <Select value={contactForm.estimated_registrants}
                      onValueChange={v => handleContactFormChange('estimated_registrants', v)}>
                      <SelectTrigger className="h-9 text-sm border-gray-200 focus:ring-1 focus:ring-[#091D40]"><SelectValue placeholder="Select range" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0-100">0 – 100</SelectItem>
                        <SelectItem value="100-500">100 – 500</SelectItem>
                        <SelectItem value="500-1000">500 – 1,000</SelectItem>
                        <SelectItem value="1000+">1,000+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event_date" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                      <Calendar className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Event Date *
                    </Label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#AC1E20' }} />
                      <Input id="event_date" type="date" value={contactForm.event_date}
                        onChange={e => handleContactFormChange('event_date', e.target.value)}
                        required
                        className="h-9 pl-9 text-sm border-gray-200 text-gray-700 focus-visible:ring-1 focus-visible:ring-[#091D40] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100" />
                    </div>
                  </div>
                </div>

                {/* Security check */}
                <div className="space-y-1.5">
                  <Label htmlFor="ph_captcha" className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#091D40' }}>
                    <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#AC1E20' }} /> Security Check *
                  </Label>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center justify-center h-[70px] w-[220px] rounded-md bg-white border border-gray-200 overflow-hidden select-none">
                      {captcha.loading
                        ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        : captcha.image
                          ? <img src={captcha.image} alt="Type the characters shown" className="block" draggable="false" />
                          : <span className="text-sm font-semibold" style={{ color: '#091D40' }}>{captcha.question} = ?</span>}
                    </span>
                    <Input id="ph_captcha" type="text" autoComplete="off" spellCheck="false" autoCapitalize="characters"
                      placeholder="Type the code" value={captcha.answer}
                      onChange={e => captcha.setAnswer(e.target.value)}
                      required
                      className="h-9 w-36 text-sm tracking-widest uppercase border-gray-200 text-gray-700 focus-visible:ring-1 focus-visible:ring-[#091D40]" />
                    <button type="button" onClick={captcha.refresh} title="Get a new image"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-[#091D40] transition-colors">
                      <RefreshCw className={`w-3.5 h-3.5 ${captcha.loading ? 'animate-spin' : ''}`} /> New
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Not case sensitive. Can&apos;t read it? Click &ldquo;New&rdquo;.</p>
                  {captcha.error && <p className="text-sm text-[#AC1E20]">{captcha.error}</p>}
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2 border-t border-gray-100">
                  <Button type="button" variant="outline"
                    onClick={() => setShowContactModal(false)}
                    className="flex-1 border-gray-200 hover:border-[#091D40] hover:text-[#091D40] rounded-full">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting || !captcha.ready}
                    className="flex-1 rounded-full font-semibold shadow-md text-white"
                    style={{ background: '#AC1E20' }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#7A0B12'; }}
                    onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#AC1E20'; }}>
                    {submitting
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                      : <>Submit <ArrowRight className="w-4 h-4 ml-2" /></>}
                  </Button>
                </div>

              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicEventsHome;
