import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';

const LegalLayout = ({ title, children }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
  <div className="min-h-screen bg-white">
    {/* Header */}
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
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

    {/* Content */}
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{title}</h1>
      <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed space-y-6">
        {children}
      </div>
    </main>

    {/* Footer */}
    <Footer />
  </div>
  );
};

// ── Privacy Policy ───────────────────────────────────────────────────────────
export const PrivacyPolicy = () => (
  <LegalLayout title="Privacy Policy">
    <p className="text-sm text-gray-400">Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Introduction</h2>
      <p>Kaizen Events ("we", "our", "us"), operated by Kaizen Infotech Solutions Pvt. Ltd., is committed to protecting the privacy of our users. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our event management platform.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Information We Collect</h2>
      <p>We collect the following types of information:</p>
      <ul className="list-disc pl-6 space-y-2 mt-2">
        <li><strong>Account Information:</strong> Name, email address, phone number, and password when you create an admin account.</li>
        <li><strong>Registration Data:</strong> Information submitted through event registration forms, which may include name, email, phone, address, and other fields configured by the event organizer.</li>
        <li><strong>Payment Information:</strong> Payment details processed securely through third-party gateways (Razorpay, Instamojo). We do not store full card numbers or CVV on our servers.</li>
        <li><strong>Usage Data:</strong> IP address, browser type, device information, and activity logs for security and analytics purposes.</li>
        <li><strong>Organization Data:</strong> Campaign/event details, form configurations, and landing page content created by event organizers.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. How We Use Your Information</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>To process event registrations and payments.</li>
        <li>To communicate registration confirmations, payment receipts, and event updates.</li>
        <li>To provide event organizers with registration data and analytics for their campaigns.</li>
        <li>To generate invoices and financial reports.</li>
        <li>To detect fraud, prevent abuse, and maintain platform security.</li>
        <li>To improve our platform and services.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Data Sharing</h2>
      <p>We do not sell your personal information. We share data only in these cases:</p>
      <ul className="list-disc pl-6 space-y-2 mt-2">
        <li><strong>Event Organizers:</strong> Registration and payment data is shared with the organizer of the event you registered for.</li>
        <li><strong>Payment Gateways:</strong> Payment details are shared with Razorpay or Instamojo to process transactions.</li>
        <li><strong>Service Providers:</strong> Email delivery (Resend/Brevo), WhatsApp notifications (Interakt), and Google Sheets sync — only as configured by the event organizer.</li>
        <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Data Security</h2>
      <p>We implement industry-standard security measures including:</p>
      <ul className="list-disc pl-6 space-y-2 mt-2">
        <li>AES encryption for sensitive data (payment credentials, account numbers).</li>
        <li>Bcrypt password hashing with salt.</li>
        <li>JWT-based authentication with token blacklisting.</li>
        <li>Rate limiting and suspicious activity detection.</li>
        <li>Tamper-evident audit logs with hash-chain integrity.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Data Retention</h2>
      <p>Registration and payment data is retained for as long as needed to fulfill our services and comply with legal obligations. Audit logs are retained for 2 years. You may request deletion of your personal data by contacting us.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul className="list-disc pl-6 space-y-2 mt-2">
        <li>Access the personal data we hold about you.</li>
        <li>Request correction of inaccurate data.</li>
        <li>Request deletion of your data (subject to legal retention requirements).</li>
        <li>Withdraw consent for optional communications.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Contact Us</h2>
      <p>For privacy-related inquiries, contact us at:</p>
      <p className="mt-2"><strong>Kaizen Infotech Solutions Pvt. Ltd.</strong><br />Email: privacy@kaizeninfotech.com</p>
    </section>
  </LegalLayout>
);

// ── Terms of Service ─────────────────────────────────────────────────────────
export const TermsOfService = () => (
  <LegalLayout title="Terms of Service">
    <p className="text-sm text-gray-400">Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Acceptance of Terms</h2>
      <p>By accessing or using Kaizen Events ("Platform"), operated by Kaizen Infotech Solutions Pvt. Ltd., you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Platform Description</h2>
      <p>Kaizen Events is an event registration and management platform that allows organizations ("Event Organizers") to create events, build registration forms, collect payments, and manage attendees. Individuals ("Registrants") can discover events, register, and make payments through the Platform.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. User Accounts</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>You must provide accurate and complete information when creating an account.</li>
        <li>You are responsible for maintaining the security of your account credentials.</li>
        <li>You must not share your account or allow unauthorized access.</li>
        <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Event Organizer Responsibilities</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Organizers are responsible for the accuracy of their event information, pricing, and registration forms.</li>
        <li>Organizers must comply with all applicable laws and regulations for their events.</li>
        <li>Organizers are responsible for fulfilling their obligations to registrants (event delivery, communications, etc.).</li>
        <li>Organizers must handle registrant data in compliance with applicable privacy laws.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Payments & Fees</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Payments are processed through third-party gateways (Razorpay, Instamojo).</li>
        <li>A platform fee of 2.95% is charged on collected funds (after gateway charges) for Kaizen-managed fund collection.</li>
        <li>Gateway processing fees are borne as per the organizer's agreement with the payment gateway.</li>
        <li>All amounts are in Indian Rupees (INR) unless stated otherwise.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Intellectual Property</h2>
      <p>All Platform content, features, and functionality (excluding user-generated content) are owned by Kaizen Infotech Solutions Pvt. Ltd. Event Organizers retain ownership of their event content, form configurations, and landing page content.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Prohibited Activities</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Using the Platform for illegal, fraudulent, or unauthorized purposes.</li>
        <li>Attempting to access other users' accounts or data without authorization.</li>
        <li>Submitting false or misleading event information.</li>
        <li>Interfering with the Platform's operation or security.</li>
        <li>Scraping, crawling, or automated data collection without permission.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Limitation of Liability</h2>
      <p>The Platform is provided "as is" without warranties of any kind. Kaizen Infotech Solutions Pvt. Ltd. shall not be liable for any indirect, incidental, or consequential damages arising from use of the Platform. Our total liability shall not exceed the fees paid by you in the preceding 12 months.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Governing Law</h2>
      <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Pune, Maharashtra.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Changes to Terms</h2>
      <p>We may update these terms from time to time. Continued use of the Platform after changes constitutes acceptance of the updated terms.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">11. Contact</h2>
      <p>For questions about these terms, contact us at:</p>
      <p className="mt-2"><strong>Kaizen Infotech Solutions Pvt. Ltd.</strong><br />Email: legal@kaizeninfotech.com</p>
    </section>
  </LegalLayout>
);

// ── Refund Policy ────────────────────────────────────────────────────────────
export const RefundPolicy = () => (
  <LegalLayout title="Refund Policy">
    <p className="text-sm text-gray-400">Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Overview</h2>
      <p>This Refund Policy applies to payments made through Kaizen Events for event registrations. Since each event is organized independently, refund eligibility may vary based on the event organizer's specific refund terms.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. General Refund Guidelines</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>Full refund:</strong> Available if cancellation is requested more than 14 days before the event date.</li>
        <li><strong>50% refund:</strong> Available if cancellation is requested 7–14 days before the event date.</li>
        <li><strong>No refund:</strong> Cancellations within 7 days of the event date are generally not eligible for refunds.</li>
      </ul>
      <p className="mt-3 text-sm">Note: Individual event organizers may have their own refund policies that supersede these guidelines. Please check the event's registration page for specific terms.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. How to Request a Refund</h2>
      <ol className="list-decimal pl-6 space-y-2">
        <li>Contact the event organizer directly using the contact details provided on the event page.</li>
        <li>Provide your registration ID and reason for cancellation.</li>
        <li>The event organizer will review and process eligible refunds through the Platform.</li>
      </ol>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Refund Processing</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Approved refunds are processed through the original payment method (Razorpay or Instamojo).</li>
        <li>Refunds typically take 5–10 business days to reflect in your account, depending on your bank.</li>
        <li>Payment gateway processing fees may be non-refundable.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Event Cancellation by Organizer</h2>
      <p>If an event is cancelled by the organizer, all registrants are eligible for a full refund. The organizer is responsible for initiating refunds through the Platform.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Free Registrations</h2>
      <p>Registrations with no payment (free events) do not involve any financial transaction and therefore no refund is applicable. You may cancel your registration by contacting the event organizer.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Disputes</h2>
      <p>If you are unable to resolve a refund request with the event organizer, you may contact us at:</p>
      <p className="mt-2"><strong>Kaizen Infotech Solutions Pvt. Ltd.</strong><br />Email: support@kaizeninfotech.com</p>
      <p className="mt-2">We will mediate between the registrant and organizer to reach a fair resolution.</p>
    </section>

    <section>
      <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Platform Fees</h2>
      <p>Platform fees (2.95%) charged to event organizers are non-refundable, even if the underlying registration is refunded.</p>
    </section>
  </LegalLayout>
);

export default PrivacyPolicy;
