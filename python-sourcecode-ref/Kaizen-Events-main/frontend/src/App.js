import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import ScrollToTop from "./components/ScrollToTop";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import CreateCampaign from "./pages/CreateCampaign";
import EditCampaign from "./pages/EditCampaign";
import CampaignDetail from "./pages/CampaignDetail";
import CampaignMembers from "./pages/CampaignMembers";
import FormBuilder from "./pages/FormBuilder";
import LandingPageBuilder from "./pages/LandingPageBuilder";
import CampaignRegistrations from "./pages/CampaignRegistrations";
import PublicRegistration from "./pages/PublicRegistration";
import PublicLandingPage from "./pages/PublicLandingPage";
import PublicEventsHome from "./pages/PublicEventsHome";
import About from "./pages/About";
import MarketingHome from "./pages/marketing/MarketingHome";
import SolutionsPage from "./pages/marketing/SolutionsPage";
import GetInTouch from "./pages/marketing/GetInTouch";
import PaymentAccounts from "./pages/PaymentAccounts";
import UserManagement from "./pages/UserManagement";
import CampaignSettings from "./pages/CampaignSettings";
import EmailTemplates from "./pages/EmailTemplates";
import EmailTemplateEditor from "./pages/EmailTemplateEditor";
import DKIMRegistration from "./pages/DKIMRegistration";
import Integrations from "./pages/Integrations";
import WhatsAppTemplatesManager from "./pages/WhatsAppTemplatesManager";
import FundTransfers from "./pages/FundTransfers";
import DirectorApprovals from "./pages/DirectorApprovals";
import ControlPanel from "./pages/ControlPanel";
import ActivityLogs from "./pages/ActivityLogs";
import OfflinePaymentVerification from "./pages/OfflinePaymentVerification";
import KioskMode from "./pages/KioskMode";
import KioskVolunteers from "./pages/KioskVolunteers";
import { PaymentSuccess, PaymentFailed, PaymentStatus } from "./pages/PaymentPages";
import { ErrorPage, NotFoundPage, ServerErrorPage, UnauthorizedPage } from "./pages/ErrorPages";
import { PrivacyPolicy, TermsOfService, RefundPolicy } from "./pages/LegalPages";
import ContactSales from "./pages/ContactSales";
import ResumePayment from "./pages/ResumePayment";
import PaymentComplete from "./pages/PaymentComplete";
import CashfreeKyc from "./pages/CashfreeKyc";
import RazorpayRouteAccounts from "./pages/RazorpayRouteAccounts";
import VendorOnboarding from "./pages/VendorOnboarding";
import InstamojoPasswordGate from "./pages/InstamojoPasswordGate";
import InstamojoList from "./pages/InstamojoList";
import InstamojoPurposes from "./pages/InstamojoPurposes";
import InstamojoPurposeBankDetails from "./pages/InstamojoPurposeBankDetails";
import InstamojoPayments from "./pages/InstamojoPayments";
import InstamojoAddPayment from "./pages/InstamojoAddPayment";
import InstamojoReports from "./pages/InstamojoReports";
import "./App.css";

// Wrapper component for protected routes with layout
const ProtectedWithLayout = ({ children }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <div className="App">
            <Routes>
              {/* Public Homepage — marketing home is the landing page */}
              <Route path="/" element={<MarketingHome />} />
              <Route path="/about" element={<About />} />

              {/* Marketing pages (from Website Content docx) */}
              <Route path="/home" element={<MarketingHome />} />
              {/* Live events listing (real backend data) */}
              <Route path="/events" element={<PublicEventsHome />} />
              <Route path="/solutions" element={<SolutionsPage />} />
              <Route path="/contact" element={<GetInTouch />} />
              
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route
                path="/change-password"
                element={
                  <ProtectedWithLayout>
                    <ChangePassword />
                  </ProtectedWithLayout>
                }
              />
              <Route path="/event/:slug" element={<PublicLandingPage />} />
              <Route path="/register/:slug" element={<PublicRegistration />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/payment-failed" element={<PaymentFailed />} />
              <Route path="/payment-status" element={<PaymentStatus />} />
              <Route path="/payment-callback" element={<PaymentStatus />} />
              <Route path="/error" element={<ErrorPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/contact-sales" element={<ContactSales />} />
              <Route path="/pay/:registrationId" element={<ResumePayment />} />
              <Route path="/payment-complete" element={<PaymentComplete />} />
              <Route path="/vendor-onboarding/:token" element={<VendorOnboarding />} />

              {/* Protected Routes with Navigation Layout */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedWithLayout>
                    <Dashboard />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns"
                element={
                  <ProtectedWithLayout>
                    <Campaigns />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/create"
                element={
                  <ProtectedWithLayout>
                    <CreateCampaign />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/edit"
                element={
                  <ProtectedWithLayout>
                    <EditCampaign />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId"
                element={
                  <ProtectedWithLayout>
                    <CampaignDetail />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/form-builder"
                element={
                  <ProtectedWithLayout>
                    <FormBuilder />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/themes"
                element={
                  <ProtectedWithLayout>
                    <FormBuilder view="themes" />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/landing-page"
                element={
                  <ProtectedWithLayout>
                    <LandingPageBuilder />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/registrations"
                element={
                  <ProtectedWithLayout>
                    <CampaignRegistrations />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/members"
                element={
                  <ProtectedWithLayout>
                    <CampaignMembers />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/settings"
                element={
                  <ProtectedWithLayout>
                    <CampaignSettings />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/email-templates"
                element={
                  <ProtectedWithLayout>
                    <EmailTemplates />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/email-templates/:trigger"
                element={
                  <ProtectedWithLayout>
                    <EmailTemplateEditor />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/campaigns/:campaignId/offline-payments"
                element={
                  <ProtectedWithLayout>
                    <OfflinePaymentVerification />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/kiosk/:campaignId"
                element={
                  <ProtectedRoute>
                    <KioskMode />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kiosk-volunteers"
                element={
                  <ProtectedWithLayout>
                    <KioskVolunteers />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/payment-accounts"
                element={
                  <ProtectedWithLayout>
                    <PaymentAccounts />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/cashfree-kyc"
                element={
                  <ProtectedWithLayout>
                    <CashfreeKyc />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/razorpay-route"
                element={
                  <ProtectedWithLayout>
                    <RazorpayRouteAccounts />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo"
                element={
                  <ProtectedWithLayout>
                    <InstamojoPasswordGate />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/list"
                element={
                  <ProtectedWithLayout>
                    <InstamojoList />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/purposes"
                element={
                  <ProtectedWithLayout>
                    <InstamojoPurposes />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/purpose/:titleId/bank-details"
                element={
                  <ProtectedWithLayout>
                    <InstamojoPurposeBankDetails />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/payments"
                element={
                  <ProtectedWithLayout>
                    <InstamojoPayments />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/payment/new"
                element={
                  <ProtectedWithLayout>
                    <InstamojoAddPayment />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/payment/:id/edit"
                element={
                  <ProtectedWithLayout>
                    <InstamojoAddPayment />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/instamojo/reports"
                element={
                  <ProtectedWithLayout>
                    <InstamojoReports />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedWithLayout>
                    <UserManagement />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/dkim"
                element={
                  <ProtectedWithLayout>
                    <DKIMRegistration />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/integrations"
                element={
                  <ProtectedWithLayout>
                    <Integrations />
                  </ProtectedWithLayout>
                }
              />
              {/* Control Panel Routes */}
              <Route
                path="/control-panel"
                element={
                  <ProtectedWithLayout>
                    <ControlPanel />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/control-panel/users"
                element={
                  <ProtectedWithLayout>
                    <UserManagement />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/control-panel/dkim"
                element={
                  <ProtectedWithLayout>
                    <DKIMRegistration />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/control-panel/integrations"
                element={
                  <ProtectedWithLayout>
                    <Integrations />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/control-panel/integrations/whatsapp-templates"
                element={
                  <ProtectedWithLayout>
                    <WhatsAppTemplatesManager />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/fund-transfers"
                element={
                  <ProtectedWithLayout>
                    <FundTransfers />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/approvals"
                element={
                  <ProtectedWithLayout>
                    <DirectorApprovals />
                  </ProtectedWithLayout>
                }
              />
              <Route
                path="/activity-logs"
                element={
                  <ProtectedWithLayout>
                    <ActivityLogs />
                  </ProtectedWithLayout>
                }
              />
              {/* Error Pages */}
              <Route path="/error" element={<ErrorPage />} />
              <Route path="/error/500" element={<ServerErrorPage />} />
              <Route path="/error/403" element={<UnauthorizedPage />} />
              <Route path="/404" element={<NotFoundPage />} />
              
              {/* Catch-all 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <Toaster position="top-right" closeButton richColors />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
