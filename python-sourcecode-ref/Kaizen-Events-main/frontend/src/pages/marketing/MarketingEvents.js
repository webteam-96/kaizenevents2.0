import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import MarketingLayout, {
  Reveal, Eyebrow, SectionHeading, MarketingHero,
} from '../../components/marketing/MarketingLayout';
import {
  Search, Calendar, MapPin, Loader2, ArrowRight, CheckCircle, Star,
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1559223607-a43c990c692c?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop',
];

const getEventImage = (event, index) => {
  const img = event.logo_url || event.event_logo;
  if (!img) return PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length];
  return img.startsWith('/') ? `${API_BASE_URL}${img}` : img;
};

/* Docx filter options — verbatim */
const FILTERS = {
  category: ['All', 'Corporate', 'Conference', 'Workshop', 'Social', 'Sports', 'Virtual', 'Government', 'NGO', 'Trade Show'],
  date: ['All Dates', 'Today', 'This Week', 'This Month'],
  format: ['All Formats', 'In-Person', 'Virtual', 'Hybrid'],
  price: ['All', 'Free', 'Paid'],
};

/* Docx sort options — verbatim */
const SORT_OPTIONS = [
  'Date: Soonest First',
  'Date: Latest First',
  'Popularity: Most Registered',
  'Price: Low to High',
  'Price: High to Low',
  'Recently Added',
];

const PAGE_SIZE = 12;

const eventDate = (e) => e.start_date || e.event_date || null;

const matchesDateFilter = (e, filter) => {
  if (filter === 'All Dates') return true;
  const d = eventDate(e);
  if (!d) return false;
  const date = parseISO(d);
  const now = new Date();
  if (filter === 'Today') return date.toDateString() === now.toDateString();
  if (filter === 'This Week') {
    const week = new Date(now);
    week.setDate(now.getDate() + 7);
    return date >= now && date <= week;
  }
  if (filter === 'This Month') {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  return true;
};

const FilterRow = ({ label, options, value, onChange }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 w-20 flex-shrink-0">{label}</span>
    {options.map((opt) => (
      <button
        key={opt}
        type="button"
        onClick={() => onChange(opt)}
        className={`px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors duration-200 ${
          value === opt
            ? 'bg-[#091D40] text-white border-[#091D40]'
            : 'bg-white text-gray-600 border-gray-200 hover:border-[#091D40]/40 hover:text-[#091D40]'
        }`}
      >
        {opt}
      </button>
    ))}
  </div>
);

const EventCard = ({ event, index }) => (
  <Link
    to={`/register/${event.slug}`}
    className="group block rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
  >
    <div className="aspect-[3/2] overflow-hidden bg-gray-100">
      <img
        src={getEventImage(event, index)}
        alt={event.name}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
      />
    </div>
    <div className="p-5">
      <span className="inline-block px-2.5 py-1 rounded-sm bg-[#AC1E20]/5 text-[#AC1E20] text-xs font-semibold mb-3">
        {event.organization_name || 'Event'}
      </span>
      <h3 className="font-bold text-[#091D40] leading-snug line-clamp-2 group-hover:text-[#AC1E20] transition-colors duration-200">
        {event.name}
      </h3>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        {eventDate(event) && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#CC9C4C]" />
            {format(parseISO(eventDate(event)), 'dd MMM yyyy')}
          </span>
        )}
        {event.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-[#CC9C4C]" />
            {event.location}
          </span>
        )}
      </div>
      <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-[#AC1E20]">
        Register <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
      </span>
    </div>
  </Link>
);

const ORGANIZER_TRUST_POINTS = [
  'Free to list your event',
  'Live within minutes',
  'Secure payments from day one',
  'Real-time registration dashboard',
];

const MarketingEvents = () => {
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);
  const [category, setCategory] = useState('All');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [fmt, setFmt] = useState('All Formats');
  const [price, setPrice] = useState('All');
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearch(q);
    setQuery(q);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/public/events`);
        setEvents(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to fetch events:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = events.filter((e) => {
      if (query) {
        const q = query.toLowerCase();
        const hit =
          (e.name || '').toLowerCase().includes(q) ||
          (e.organization_name || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (!matchesDateFilter(e, dateFilter)) return false;
      // Category / format / price metadata is not exposed by the public events
      // API, so those chips act as visual filters only when set to "All".
      return true;
    });
    switch (sort) {
      case 'Date: Soonest First':
        list = [...list].sort((a, b) => ((eventDate(a) || a.created_at || '') < (eventDate(b) || b.created_at || '') ? -1 : 1));
        break;
      case 'Date: Latest First':
        list = [...list].sort((a, b) => ((eventDate(a) || a.created_at || '') > (eventDate(b) || b.created_at || '') ? -1 : 1));
        break;
      case 'Recently Added':
        list = [...list].sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1));
        break;
      default:
        break;
    }
    return list;
  }, [events, query, dateFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEvents = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setSearch('');
    setQuery('');
    setCategory('All');
    setDateFilter('All Dates');
    setFmt('All Formats');
    setPrice('All');
    setPage(1);
  };

  const runSearch = () => {
    setQuery(search.trim());
    setPage(1);
  };

  return (
    <MarketingLayout>
      {/* ── Page Hero ── */}
      <MarketingHero className="pb-28 sm:pb-32">
        <div className="text-center">
          <Reveal>
            <Eyebrow tone="gold" className="mx-auto !text-[#CC9C4C] bg-white/5 border-white/15">Browse Live Events</Eyebrow>
          </Reveal>
          <h1 className="animate-fade-up text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white max-w-3xl mx-auto leading-tight mt-6">
            Discover and Register for Events Happening Now.
          </h1>
          <p className="animate-fade-up text-white/75 max-w-2xl mx-auto mt-5 leading-relaxed" style={{ animationDelay: '0.1s' }}>
            Browse live, upcoming, and featured events powered by Kaizen Events. Find the event that is right
            for you, register in minutes, and receive your confirmation instantly.
          </p>
        </div>
      </MarketingHero>

      {/* ── Search and Filter Bar (overlaps hero) ── */}
      <section className="bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
          <Reveal>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-xl p-6 sm:p-7">
              <h2 className="text-lg font-bold text-[#091D40] mb-4">Find Your Event</h2>
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    placeholder="Search events by name, organizer, or keyword..."
                    className="w-full h-11 pl-10 pr-4 rounded-full border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-1 focus:ring-[#091D40] focus:border-[#091D40] focus:bg-white transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={runSearch}
                  className="h-11 px-6 rounded-full text-sm font-semibold text-white bg-[#AC1E20] hover:bg-[#7A0B12] transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
                >
                  Search Events
                </button>
              </div>
              <div className="space-y-3">
                <FilterRow label="Category" options={FILTERS.category} value={category} onChange={setCategory} />
                <FilterRow label="Date" options={FILTERS.date} value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }} />
                <FilterRow label="Format" options={FILTERS.format} value={fmt} onChange={setFmt} />
                <FilterRow label="Price" options={FILTERS.price} value={price} onChange={setPrice} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Featured Events ── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <Eyebrow tone="gold" className="mb-3"><Star className="w-3 h-3" /> Featured Events</Eyebrow>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#091D40] mb-6">
              Events You Should Not Miss
            </h2>
            <div className="p-10 rounded-2xl bg-white border border-dashed border-gray-200 text-center">
              <div className="w-12 h-12 rounded-full bg-[#CC9C4C]/10 flex items-center justify-center mx-auto mb-3">
                <Star className="w-5 h-5 text-[#CC9C4C]" />
              </div>
              <p className="text-gray-500 text-sm">
                No featured events at the moment. Check back soon or browse all upcoming events below.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Upcoming Events Grid ── */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#091D40]">Upcoming Events</h2>
                {!loading && (
                  <p className="text-sm text-gray-500 mt-1">Showing {filtered.length} events</p>
                )}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-10 px-4 rounded-full border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#091D40]"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </Reveal>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#AC1E20] animate-spin" />
            </div>
          ) : pageEvents.length > 0 ? (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {pageEvents.map((event, i) => (
                  <Reveal key={event.id} delay={(i % 3) * 80}>
                    <EventCard event={event} index={i} />
                  </Reveal>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-4 py-2 rounded-sm text-sm font-semibold border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:border-[#091D40]/40"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={`w-9 h-9 rounded-full text-sm font-semibold border transition-colors ${
                        n === page
                          ? 'bg-[#091D40] text-white border-[#091D40]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#091D40]/40'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 rounded-sm text-sm font-semibold border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:border-[#091D40]/40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ── No Results State (docx verbatim) ── */
            <div className="text-center py-16 max-w-xl mx-auto">
              <h3 className="text-xl font-bold text-[#091D40] mb-3">No events found for your search.</h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                Try adjusting your filters or search terms. New events are added regularly. You can also reach
                out to us if you are looking for a specific type of event.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-6 py-2.5 rounded-sm text-sm font-semibold border border-gray-200 bg-white text-[#091D40] hover:border-[#091D40]/40"
                >
                  Clear Filters
                </button>
                <Link
                  to="/contact"
                  className="px-6 py-2.5 rounded-sm text-sm font-semibold text-white bg-[#AC1E20] hover:bg-[#7A0B12] transition-colors"
                >
                  Get in Touch
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Organizer CTA Strip ── */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="animated-gradient relative overflow-hidden rounded-3xl px-8 py-12 text-center shadow-2xl">
              <h2 className="relative text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Are You an Event Organizer?
              </h2>
              <p className="relative text-white/75 mt-4 max-w-3xl mx-auto leading-relaxed">
                List your event on Kaizen Events and reach a wider audience. Our platform handles your
                registrations, payments, and check-ins end to end, so you can focus entirely on delivering a
                great experience.
              </p>
              <div className="relative flex flex-wrap items-center justify-center gap-3 mt-7">
                <Link
                  to="/"
                  className="px-7 py-3 rounded-sm text-sm font-semibold text-[#091D40] bg-[#CC9C4C] hover:bg-[#b88c3f] transition-colors shadow-lg"
                >
                  List Your Event
                </Link>
                <Link
                  to="/contact"
                  className="px-7 py-3 rounded-sm text-sm font-semibold text-white border border-white/30 hover:bg-white/10 transition-colors"
                >
                  Get in Touch
                </Link>
              </div>
              <div className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-8">
                {ORGANIZER_TRUST_POINTS.map((point) => (
                  <span key={point} className="inline-flex items-center gap-1.5 text-xs text-white/80">
                    <CheckCircle className="w-3.5 h-3.5 text-[#CC9C4C]" />
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SEO Content Block ── */}
      <section className="pb-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 leading-relaxed">
            Kaizen Events is a trusted event registration and management platform hosting events across
            categories including corporate conferences, educational seminars, community gatherings, sports
            tournaments, trade shows, virtual events, and more. Every event listed here is powered by our
            secure registration and ticketing infrastructure. Attendees can register in minutes, pay using
            their preferred method, and receive an instant confirmation with their QR-coded ticket. Organizers
            benefit from real-time dashboards, QR-based check-in, and detailed post-event analytics. Whether
            you are looking for an upcoming conference to attend or a platform to host your next event, Kaizen
            Events is the right place to start.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingEvents;
