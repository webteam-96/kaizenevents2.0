import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { AlertTriangle, Home, RefreshCw, ArrowLeft, ServerCrash, Search, Lock } from 'lucide-react';

// Generic Error Page Component
export const ErrorPage = ({ 
  code = '500', 
  title = 'Something went wrong', 
  message = 'We encountered an unexpected error. Please try again.',
  showDashboard = true,
  showRefresh = true,
  showBack = true
}) => {
  const navigate = useNavigate();

  return (
    <div className="ke-atmos min-h-screen flex items-center justify-center p-4 md:p-6">
      <div className="ke-card p-8 md:p-10 max-w-md w-full text-center relative overflow-hidden">
        {/* Watermark code */}
        <div className="pointer-events-none absolute -top-4 right-4 text-[7rem] leading-none font-outfit font-bold text-muted/60 select-none">
          {code}
        </div>

        {/* Error Icon */}
        <div className="relative mb-7">
          <span
            className="ke-medallion mx-auto mb-5"
            style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', background: 'linear-gradient(150deg, hsl(var(--destructive) / 0.18), transparent 85%)' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: 'hsl(var(--destructive))' }} />
          </span>
          <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">Error {code}</div>
        </div>

        {/* Error Message */}
        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-foreground mb-3 tracking-tight">{title}</h1>
        <div className="ke-rule-gold mx-auto mb-4" />
        <p className="text-muted-foreground font-jakarta mb-8">{message}</p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {showBack && (
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="border-border hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          )}
          {showRefresh && (
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="border-border hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
          {showDashboard && (
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-primary hover:bg-primary-hover transition-colors"
            >
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-sm text-muted-foreground">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
};

// 404 Not Found
export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="ke-atmos min-h-screen flex items-center justify-center p-4 md:p-6">
      <div className="ke-card p-8 md:p-10 max-w-md w-full text-center relative overflow-hidden">
        <div className="pointer-events-none absolute -top-4 right-4 text-[7rem] leading-none font-outfit font-bold text-muted/60 select-none">
          404
        </div>

        <div className="relative mb-7">
          <span
            className="ke-medallion mx-auto mb-5"
            style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', background: 'linear-gradient(150deg, hsl(var(--accent) / 0.20), transparent 85%)' }}
          >
            <Search className="w-9 h-9" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">Error 404</div>
        </div>

        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-foreground mb-3 tracking-tight">Page Not Found</h1>
        <div className="ke-rule-gold mx-auto mb-4" />
        <p className="text-muted-foreground font-jakarta mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate('/dashboard')}
            className="bg-primary hover:bg-primary-hover transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

// 500 Server Error
export const ServerErrorPage = () => {
  return (
    <div className="ke-atmos min-h-screen flex items-center justify-center p-4 md:p-6">
      <div className="ke-card p-8 md:p-10 max-w-md w-full text-center relative overflow-hidden">
        <div className="pointer-events-none absolute -top-4 right-4 text-[7rem] leading-none font-outfit font-bold text-muted/60 select-none">
          500
        </div>

        <div className="relative mb-7">
          <span
            className="ke-medallion mx-auto mb-5"
            style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', background: 'linear-gradient(150deg, hsl(var(--destructive) / 0.18), transparent 85%)' }}
          >
            <ServerCrash className="w-9 h-9" style={{ color: 'hsl(var(--destructive))' }} />
          </span>
          <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">Error 500</div>
        </div>

        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-foreground mb-3 tracking-tight">Server Error</h1>
        <div className="ke-rule-gold mx-auto mb-4" />
        <p className="text-muted-foreground font-jakarta mb-8">
          Our servers are experiencing issues. We&apos;re working to fix this as quickly as possible.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button
            onClick={() => window.location.href = '/dashboard'}
            className="bg-primary hover:bg-primary-hover transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
};

// 403 Forbidden / Unauthorized
export const UnauthorizedPage = () => {
  const navigate = useNavigate();

  return (
    <div className="ke-atmos min-h-screen flex items-center justify-center p-4 md:p-6">
      <div className="ke-card p-8 md:p-10 max-w-md w-full text-center relative overflow-hidden">
        <div className="pointer-events-none absolute -top-4 right-4 text-[7rem] leading-none font-outfit font-bold text-muted/60 select-none">
          403
        </div>

        <div className="relative mb-7">
          <span
            className="ke-medallion mx-auto mb-5"
            style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', background: 'linear-gradient(150deg, hsl(var(--accent) / 0.20), transparent 85%)' }}
          >
            <Lock className="w-9 h-9" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">Error 403</div>
        </div>

        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-foreground mb-3 tracking-tight">Access Denied</h1>
        <div className="ke-rule-gold mx-auto mb-4" />
        <p className="text-muted-foreground font-jakarta mb-8">
          You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate('/dashboard')}
            className="bg-primary hover:bg-primary-hover transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

// Campaign Archived/Unavailable Page (for public landing pages)
export const CampaignArchivedPage = ({ campaignName }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center">
        {/* Decorative Elements */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 bg-primary/10 rounded-full blur-3xl"></div>
          </div>
          <div className="relative">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 mb-6">
              <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-outfit font-bold text-white mb-4">
          This Event Has Ended
        </h1>
        
        {campaignName && (
          <p className="text-xl text-slate-400 mb-4">{campaignName}</p>
        )}
        
        <p className="text-slate-500 font-jakarta mb-8 max-w-sm mx-auto">
          This event page is no longer available. The event has concluded and registrations are closed.
        </p>

        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 inline-block">
          <p className="text-sm text-slate-400">
            Looking for something else? Visit our main website for upcoming events.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-slate-600">
          Powered by Kaizen Events
        </p>
      </div>
    </div>
  );
};

// Registration Closed Page (for when registration is closed or disabled)
export const RegistrationClosedPage = ({ campaignName, endDate }) => {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 mb-4">
        <Lock className="w-10 h-10 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-2xl font-outfit font-bold text-foreground mb-3 tracking-tight">Registration Closed</h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        Registration for <span className="font-semibold text-foreground">{campaignName || 'this event'}</span> is currently not available.
      </p>
      {endDate ? (
        <p className="text-sm text-muted-foreground">
          Registration period ended on {new Date(endDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Registration has been closed by the organizer.
        </p>
      )}
    </div>
  );
};

// Registration Coming Soon (countdown)
export const RegistrationComingSoon = ({ campaignName, startDate }) => {
  const [timeLeft, setTimeLeft] = React.useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  React.useEffect(() => {
    if (!startDate) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(startDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000)
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [startDate]);

  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-subtle mb-4">
        <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-xl font-outfit font-bold text-foreground mb-2 tracking-tight">Registration Opens Soon</h3>
      <p className="text-muted-foreground mb-6">
        Registration for {campaignName || 'this event'} will open on{' '}
        {new Date(startDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })}
      </p>

      {/* Countdown */}
      <div className="flex justify-center gap-4">
        {[
          { value: timeLeft.days, label: 'Days' },
          { value: timeLeft.hours, label: 'Hours' },
          { value: timeLeft.minutes, label: 'Minutes' },
          { value: timeLeft.seconds, label: 'Seconds' }
        ].map((item, idx) => (
          <div key={idx} className="text-center">
            <div className="w-16 h-16 bg-primary-subtle rounded-xl flex items-center justify-center mb-1">
              <span className="text-2xl font-outfit font-bold text-primary">
                {String(item.value).padStart(2, '0')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ErrorPage;
