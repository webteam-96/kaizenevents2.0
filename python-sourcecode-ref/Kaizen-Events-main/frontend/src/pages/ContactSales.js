import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, ArrowRight, Phone, Mail, User, Building2, Calendar, CheckCircle, Loader2, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import PhoneInput, { validatePhone } from '../components/ui/PhoneInput';
import Footer from '../components/Footer';
import useMathCaptcha from '../hooks/useMathCaptcha';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

const ContactSales = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [contactForm, setContactForm] = useState({
    contact_name: '',
    mobile_number: '',
    email: '',
    club_name: '',
    district: '',
    designation: '',
    purpose: '',
    estimated_registrants: '',
    event_date: ''
  });
  const captcha = useMathCaptcha();

  const handleChange = (field, value) => {
    setContactForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validatePhone(contactForm.mobile_number, contactForm._countryCode || 'IN')) {
      alert('Please enter a valid mobile number');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/api/contact-sales`, { ...contactForm, ...captcha.payload });
      setSubmitSuccess(true);
    } catch (error) {
      console.error('Failed to submit contact form:', error);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary/30">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Link to="/" className="text-gray-500 hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="text-lg font-bold text-gray-900">Kaizen Events</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Left: Info Section */}
          <div className="lg:sticky lg:top-28">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-subtle text-primary rounded-full text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              Host Your Event
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
              Let us manage your<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary">next big event</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8">
              Fill out the form and our team will get back to you within 24 hours to discuss your event needs.
            </p>

            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Custom Registration Forms</h3>
                  <p className="text-sm text-gray-500">Drag-and-drop builder with dynamic pricing, conditional fields, and coupon codes.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Integrated Payments</h3>
                  <p className="text-sm text-gray-500">Collect payments via Razorpay or Instamojo with automated reconciliation.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Landing Pages & Kiosk</h3>
                  <p className="text-sm text-gray-500">Beautiful event pages with on-site check-in mode for volunteers.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
            {submitSuccess ? (
              <div className="py-16 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Thank You!</h3>
                <p className="text-gray-500 mb-8">Our team will contact you within 24 hours.</p>
                <Link to="/">
                  <Button variant="outline" className="rounded-full">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Get in Touch</h2>
                  <p className="text-sm text-gray-500">All fields marked with * are required.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Contact Person *
                    </Label>
                    <Input
                      value={contactForm.contact_name}
                      onChange={(e) => handleChange('contact_name', e.target.value)}
                      placeholder="Enter your name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-700 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Mobile Number *
                    </Label>
                    <PhoneInput
                      value={contactForm.mobile_number}
                      onChange={(v) => handleChange('mobile_number', v)}
                      onCountryChange={(c) => handleChange('_countryCode', c)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email ID *
                  </Label>
                  <Input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Club / Organization *
                    </Label>
                    <Input
                      value={contactForm.club_name}
                      onChange={(e) => handleChange('club_name', e.target.value)}
                      placeholder="Enter club name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-700">District *</Label>
                    <Input
                      value={contactForm.district}
                      onChange={(e) => handleChange('district', e.target.value)}
                      placeholder="Enter district"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700">Designation *</Label>
                  <Input
                    value={contactForm.designation}
                    onChange={(e) => handleChange('designation', e.target.value)}
                    placeholder="e.g., President, Secretary"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700">Event Purpose *</Label>
                  <Textarea
                    value={contactForm.purpose}
                    onChange={(e) => handleChange('purpose', e.target.value)}
                    placeholder="Describe your event briefly..."
                    required
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700">Expected Attendees *</Label>
                    <Select
                      value={contactForm.estimated_registrants}
                      onValueChange={(value) => handleChange('estimated_registrants', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0-100">0 - 100</SelectItem>
                        <SelectItem value="100-500">100 - 500</SelectItem>
                        <SelectItem value="500-1000">500 - 1,000</SelectItem>
                        <SelectItem value="1000+">1,000+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-700 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Event Date *
                    </Label>
                    <Input
                      type="date"
                      value={contactForm.event_date}
                      onChange={(e) => handleChange('event_date', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700 flex items-center gap-2" htmlFor="cs-captcha">
                    <ShieldCheck className="w-4 h-4" />
                    Security Check *
                  </Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center justify-center h-[70px] w-[220px] rounded-md bg-white border border-primary-subtle overflow-hidden select-none">
                      {captcha.loading
                        ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        : captcha.image
                          ? <img src={captcha.image} alt="Type the characters shown" className="block" draggable="false" />
                          : <span className="text-base font-semibold text-primary">{captcha.question} = ?</span>}
                    </span>
                    <Input
                      id="cs-captcha"
                      type="text"
                      autoComplete="off"
                      spellCheck="false"
                      autoCapitalize="characters"
                      placeholder="Type the code"
                      value={captcha.answer}
                      onChange={(e) => captcha.setAnswer(e.target.value)}
                      required
                      className="w-40 tracking-widest uppercase"
                    />
                    <button
                      type="button"
                      onClick={captcha.refresh}
                      title="Get a new image"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${captcha.loading ? 'animate-spin' : ''}`} /> New image
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Not case sensitive. Can&apos;t read it? Click &ldquo;New image&rdquo;.</p>
                  {captcha.error && <p className="text-sm text-red-600">{captcha.error}</p>}
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !captcha.ready}
                  className="w-full bg-primary hover:bg-primary h-12 text-base rounded-xl mt-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Inquiry
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default ContactSales;
