// Shared site footer — single source of truth for every public page.
// Extracted from the /events page footer so the whole site matches.
// Self-contained: the "Host Your Event" / "Contact Sales" actions link to the
// /contact-sales page (no per-page modal needed). Decorative classes
// (ke-gold-rule, ke-grid, animate-float) live in the global index.css.
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';

// Footer link with a gold underline that wipes in from the left (zero layout shift).
const FooterLink = ({ to, children }) => (
  <Link
    to={to}
    className="group/li inline-flex items-center text-gray-400 hover:text-[#CC9C4C] transition-colors duration-200 focus-visible:outline-none focus-visible:text-[#CC9C4C]"
  >
    <span className="relative after:content-[''] after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-[#CC9C4C] after:transition-[width] after:duration-300 after:ease-out group-hover/li:after:w-full group-focus-visible/li:after:w-full">
      {children}
    </span>
  </Link>
);

// Footer social orb — lifts + gold-rings on hover (plain CSS, no motion dep).
const SocialButton = ({ icon: Icon, label, href = '#' }) => (
  <a
    href={href}
    aria-label={label}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-[#CC9C4C] hover:border-[#CC9C4C]/50 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC9C4C]/60"
  >
    <Icon className="w-4 h-4" />
  </a>
);

const Footer = () => (
  <footer className="relative bg-[#171721] text-gray-300 overflow-hidden">
    <div className="absolute inset-x-0 top-0 h-px ke-gold-rule" aria-hidden="true" />
    <div className="absolute inset-0 ke-grid opacity-40 pointer-events-none" aria-hidden="true" />
    <div className="absolute -top-16 right-10 w-56 h-56 rounded-full bg-[#CC9C4C]/10 blur-3xl pointer-events-none animate-float" aria-hidden="true" />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
        <div className="sm:col-span-2">
          <div className="mb-3">
            <img src="/kaizen-events-logo.png" alt="Kaizen Events" className="h-10 w-auto" />
          </div>
          <p className="text-sm text-gray-400 max-w-xs mb-4">
            The complete event management platform for organizations. Create, manage, and grow your events effortlessly.
          </p>
          <Link
            to="/contact-sales"
            className="group/cta inline-flex items-center gap-2 bg-[#AC1E20] hover:bg-[#7A0B12] text-white rounded-sm px-5 py-2.5 text-sm font-semibold shadow-md shadow-red-900/30 transition-all hover:-translate-y-0.5"
          >
            Host Your Event
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/cta:translate-x-1" />
          </Link>
          <div className="flex items-center gap-2 mt-5">
            <SocialButton icon={Facebook} label="Facebook" />
            <SocialButton icon={Instagram} label="Instagram" />
            <SocialButton icon={Linkedin} label="LinkedIn" />
            <SocialButton icon={Twitter} label="Twitter" />
          </div>
        </div>

        <div>
          <h4 className="relative font-semibold text-white mb-4 text-sm pb-2 after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-px after:w-10 after:bg-gradient-to-r after:from-[#CC9C4C] after:to-transparent">Quick Links</h4>
          <ul className="space-y-2.5 text-sm">
            <li><FooterLink to="/home">Home</FooterLink></li>
            <li><FooterLink to="/events">Events</FooterLink></li>
            <li><FooterLink to="/solutions">Solutions</FooterLink></li>
            <li><FooterLink to="/contact">Get in Touch</FooterLink></li>
          </ul>
        </div>

        <div>
          <h4 className="relative font-semibold text-white mb-4 text-sm pb-2 after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-px after:w-10 after:bg-gradient-to-r after:from-[#CC9C4C] after:to-transparent">Legal</h4>
          <ul className="space-y-2.5 text-sm">
            <li><FooterLink to="/privacy-policy">Privacy Policy</FooterLink></li>
            <li><FooterLink to="/terms-of-service">Terms of Service</FooterLink></li>
            <li><FooterLink to="/refund-policy">Refund Policy</FooterLink></li>
          </ul>
        </div>
      </div>

      <div className="h-px ke-gold-rule opacity-70 mb-6" aria-hidden="true" />
      <div className="text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Kaizen Infotech Solutions Pvt. Ltd. All rights reserved.
      </div>
    </div>
  </footer>
);

export default Footer;
