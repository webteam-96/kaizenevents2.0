import React, { useState, useRef } from 'react';
import axios from 'axios';
import MarketingLayout, {
  Reveal, Eyebrow, SectionHeading, MarketingHero,
} from '../../components/marketing/MarketingLayout';
import {
  Mail, Globe, Building2, ChevronDown, Send, MapPin, ExternalLink,
  MonitorPlay, LifeBuoy, Wrench, BadgeIndianRupee, Clock, Loader2, CheckCircle,
  RefreshCw,
} from 'lucide-react';
import useMathCaptcha from '../../hooks/useMathCaptcha';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const CONTACT_EMAIL = 'events@kaizeninfotech.com';

/* ── Docx Page 4 content — verbatim ── */

const EVENT_TYPES = ['Corporate', 'Conference', 'NGO', 'Social', 'Sports', 'Government', 'Virtual', 'Other'];
const ATTENDEE_RANGES = ['Under 100', '100 to 500', '500 to 5,000', '5,000 plus'];
const HEARD_FROM = ['Google', 'Referral', 'Social Media', 'Other'];

const REACH_OUT_POINTS = [
  { icon: MonitorPlay, title: 'Free Demo, Zero Commitment', text: 'See the full platform live before making any decision. We walk you through every feature that matters to your event type.' },
  { icon: LifeBuoy, title: 'Guided Onboarding Support', text: 'Once you decide to get started, we help you set up your first event. You are never on your own.' },
  { icon: Wrench, title: 'Custom Development Available', text: 'Have a requirement that goes beyond the standard platform? Tell us. Our development team can build it.' },
  { icon: BadgeIndianRupee, title: 'Transparent Pricing', text: 'No hidden fees, no surprise charges. We walk you through the pricing model clearly so you can plan your budget accurately.' },
  { icon: Clock, title: 'Response Within 24 Hours', text: 'We take every enquiry seriously. You will hear from a real person on our team within one business day.' },
];

const FAQS = [
  { q: 'How quickly can I get my event registration page live?', a: 'For standard events, you can have a fully functional registration page live within 30 minutes of signing up. For custom workflows, white-label setups, or enterprise integrations, our team completes the configuration within 2 to 5 business days.' },
  { q: 'What payment methods do you support?', a: 'Kaizen Events supports UPI (Google Pay, PhonePe, Paytm, BHIM), Credit Cards, Debit Cards, Net Banking from all major banks, and EMI options for high-value tickets. Every transaction is processed through a PCI-DSS compliant payment gateway.' },
  { q: 'Can I get a branded mobile app for my event?', a: 'Yes. We build fully branded event mobile apps for Android and iOS with your logo, color scheme, event agenda, speaker profiles, networking features, and push notifications. Contact us for a custom app quote.' },
  { q: 'Is there a limit on the number of registrations the platform can handle?', a: 'There is no hard cap. Our platform is built on infrastructure designed for high-volume events. We have supported platforms with over three lakh active users. Whether you expect 200 or 200,000 registrations, the platform handles it without performance issues.' },
  { q: 'Do you provide support on the day of the event?', a: 'Yes. For large-scale and enterprise events, we offer dedicated on-site technical support teams who manage the check-in system, handle real-time issues, and ensure the event runs without a hitch. Remote support is available for all clients.' },
  { q: 'Can the registration form be fully customized?', a: 'Completely. Our form builder supports text fields, dropdowns, file uploads, date pickers, checkboxes, and conditional logic. If you need something more advanced, our development team can build a fully bespoke registration workflow around your specific data requirements.' },
  { q: 'We have a very specific requirement. Can you build it?', a: 'Very likely, yes. Kaizen Infotech Solutions has delivered custom digital platforms for government departments, national NGOs, and large enterprises. Share your requirement with us and we will tell you honestly what we can build and in what timeframe.' },
];

const fieldClass = 'w-full h-11 px-4 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#091D40] focus:border-[#091D40]';

const FaqItem = ({ q, a, open, onToggle }) => (
  <div className={`rounded-2xl border transition-colors duration-300 ${open ? 'border-[#CC9C4C] bg-white shadow-sm' : 'border-gray-100 bg-white'}`}>
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
    >
      <span className={`font-semibold transition-colors duration-300 ${open ? 'text-[#AC1E20]' : 'text-[#091D40]'}`}>{q}</span>
      <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${open ? 'bg-[#AC1E20] rotate-180' : 'bg-gray-100'}`}>
        <ChevronDown className={`w-4 h-4 ${open ? 'text-white' : 'text-gray-500'}`} />
      </span>
    </button>
    <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
      <div className="overflow-hidden">
        <p className="px-6 pb-5 text-sm text-gray-600 leading-relaxed">{a}</p>
      </div>
    </div>
  </div>
);

const EMPTY_FORM = {
  fullName: '', organization: '', email: '', phone: '', cityCountry: '',
  eventType: '', attendees: '', eventDate: '', requirement: '', heardFrom: '',
};

const GetInTouch = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [openFaq, setOpenFaq] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const formRef = useRef(null);
  const captcha = useMathCaptcha();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    // Fold the fields that have no dedicated column into Purpose so nothing is lost.
    const purpose = [
      form.requirement,
      form.eventType ? `Event Type: ${form.eventType}` : '',
      form.heardFrom ? `Heard about us: ${form.heardFrom}` : '',
    ].filter(Boolean).join('\n');
    const payload = {
      contact_name: form.fullName,
      mobile_number: form.phone,
      email: form.email,
      club_name: form.organization,
      district: form.cityCountry,
      designation: '',
      purpose,
      estimated_registrants: form.attendees,
      event_date: form.eventDate,
      ...captcha.payload,
    };
    try {
      await axios.post(`${API_BASE_URL}/api/contact-sales`, payload);
      setSubmitSuccess(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      // A wrong or expired sum gets the server's own wording; anything else falls
      // back to the generic message with our email address.
      setSubmitError(err.response?.status === 400 && err.response?.data?.detail
        ? err.response.data.detail
        : `Something went wrong. Please try again, or email us directly at ${CONTACT_EMAIL}.`);
    } finally {
      // Tokens are single-use either way, so always hand over a new question.
      captcha.refresh();
      setSubmitting(false);
    }
  };

  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <MarketingHero>
        <div className="text-center">
          <Reveal>
            <Eyebrow tone="gold" className="mx-auto !text-[#CC9C4C] bg-white/5 border-white/15">Get in Touch</Eyebrow>
          </Reveal>
          <h1 className="animate-fade-up text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight mt-6">
            Let's Talk About Your Next Event.
          </h1>
          <p className="animate-fade-up text-white/75 max-w-3xl mx-auto mt-5 leading-relaxed" style={{ animationDelay: '0.1s' }}>
            Whether you are planning your first event or your five-hundredth, we would love to show you what
            Kaizen Events can do for you. No pressure, no sales scripts, just a real conversation about your
            requirements and a live walkthrough of the platform.
          </p>
        </div>
      </MarketingHero>

      {/* ── Contact Form + Contact Details ── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-10">
          <Reveal className="lg:col-span-2">
            <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm">
              {submitSuccess ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-[#CC9C4C]/12 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-[#CC9C4C]" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-[#091D40] mb-2">Thank You!</h2>
                  <p className="text-sm text-gray-600 max-w-md mx-auto mb-6 leading-relaxed">
                    We&apos;ve received your enquiry. A member of our team will be in touch within 24 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitSuccess(false)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-sm text-sm font-semibold text-[#091D40] border border-gray-200 hover:border-[#091D40] transition-colors"
                  >
                    Send another enquiry
                  </button>
                </div>
              ) : (
              <>
              <h2 className="text-2xl font-bold tracking-tight text-[#091D40] mb-2">Tell Us About Your Event</h2>
              <p className="text-sm text-gray-600 mb-7 leading-relaxed">
                Fill in the details below and a member of our team will be in touch within 24 hours. If you
                would rather talk right away, give us a call or drop us an email.
              </p>
              <form ref={formRef} onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                  <input type="text" required value={form.fullName} onChange={set('fullName')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Organization Name</label>
                  <input type="text" value={form.organization} onChange={set('organization')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input type="email" required value={form.email} onChange={set('email')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
                  <input type="tel" required value={form.phone} onChange={set('phone')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">City and Country</label>
                  <input type="text" value={form.cityCountry} onChange={set('cityCountry')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Event Type</label>
                  <select value={form.eventType} onChange={set('eventType')} className={fieldClass}>
                    <option value="">Select event type</option>
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Expected Number of Attendees</label>
                  <select value={form.attendees} onChange={set('attendees')} className={fieldClass}>
                    <option value="">Select range</option>
                    {ATTENDEE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Approximate Event Date</label>
                  <input type="date" value={form.eventDate} onChange={set('eventDate')} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tell Us About Your Event or Requirement</label>
                  <textarea rows={4} value={form.requirement} onChange={set('requirement')} className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#091D40] focus:border-[#091D40]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">How did you hear about us?</label>
                  <select value={form.heardFrom} onChange={set('heardFrom')} className={fieldClass}>
                    <option value="">Select an option</option>
                    {HEARD_FROM.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="git-captcha">
                    Security Check
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center justify-center h-[70px] w-[220px] rounded-lg bg-white border border-gray-200 overflow-hidden select-none">
                      {captcha.loading
                        ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        : captcha.image
                          ? <img src={captcha.image} alt="Type the characters shown" className="block" draggable="false" />
                          : <span className="text-base font-semibold text-[#091D40]">{captcha.question} = ?</span>}
                    </span>
                    <input
                      id="git-captcha"
                      type="text"
                      required
                      autoComplete="off"
                      spellCheck="false"
                      autoCapitalize="characters"
                      placeholder="Type the code"
                      value={captcha.answer}
                      onChange={(e) => captcha.setAnswer(e.target.value)}
                      className={`${fieldClass} !w-40 tracking-widest uppercase`}
                    />
                    <button
                      type="button"
                      onClick={captcha.refresh}
                      title="Get a new image"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-[#091D40] transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${captcha.loading ? 'animate-spin' : ''}`} /> New image
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    Not case sensitive. Can&apos;t read it? Click &ldquo;New image&rdquo;.
                  </p>
                  {captcha.error && (
                    <p className="mt-1.5 text-sm text-[#AC1E20]">{captcha.error}</p>
                  )}
                </div>
                {submitError && (
                  <div className="sm:col-span-2 rounded-lg bg-[#AC1E20]/5 border border-[#AC1E20]/20 px-4 py-3 text-sm text-[#AC1E20]">
                    {submitError}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={submitting || !captcha.ready}
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-sm text-base font-semibold text-white bg-[#AC1E20] hover:bg-[#7A0B12] transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                      : <><Send className="w-4 h-4" /> Send My Request</>}
                  </button>
                </div>
              </form>
              </>
              )}
            </div>
          </Reveal>

          {/* ── Reach Us Directly ── */}
          <Reveal delay={120}>
            <div className="p-8 rounded-3xl bg-[#091D40] text-white shadow-lg sticky top-24">
              <h2 className="text-xl font-bold tracking-tight mb-6">Reach Us Directly</h2>
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-[#CC9C4C]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/50 mb-0.5">Email</p>
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm font-semibold hover:text-[#CC9C4C] transition-colors">
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4 text-[#CC9C4C]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/50 mb-0.5">Website</p>
                    <a href="https://www.kaizenevents.live" target="_blank" rel="noreferrer" className="text-sm font-semibold hover:text-[#CC9C4C] transition-colors">
                      www.kaizenevents.live
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-[#CC9C4C]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/50 mb-0.5">Address</p>
                    <p className="text-sm font-semibold leading-relaxed">
                      A-406, Centrum Business Square, Plot D1, Road Number 16, Wagle Industrial Estate, Thane West, 400604
                    </p>
                    <a
                      href="https://maps.app.goo.gl/eGgSaT7tr8VB6wDH8"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#CC9C4C] hover:underline"
                    >
                      View on Google Maps
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-[#CC9C4C]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/50 mb-0.5">Powered by</p>
                    <p className="text-sm font-semibold">Kaizen Infotech Solutions Pvt. Ltd.</p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── What Happens When You Reach Out ── */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Why Get in Touch" title="What Happens When You Reach Out" className="mb-12">
              When you contact Kaizen Events, you are speaking directly with the technology team that built the
              platform. We do not route you through a call centre. We do not give you a generic product tour.
              We take the time to understand your specific event, and we show you exactly how the platform
              addresses it.
            </SectionHeading>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {REACH_OUT_POINTS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 90}>
                <div className="h-full p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#CC9C4C]/50 transition-all duration-300">
                  <div className="w-10 h-10 rounded-xl bg-[#AC1E20]/5 flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 text-[#AC1E20]" />
                  </div>
                  <h3 className="font-bold text-[#091D40] text-sm mb-1.5">{title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Frequently Asked Questions" title="Questions We Hear Most Often" className="mb-10" />
          </Reveal>
          <div className="space-y-3">
            {FAQS.map(({ q, a }, i) => (
              <Reveal key={q} delay={i * 60}>
                <FaqItem q={q} a={a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? -1 : i)} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default GetInTouch;
