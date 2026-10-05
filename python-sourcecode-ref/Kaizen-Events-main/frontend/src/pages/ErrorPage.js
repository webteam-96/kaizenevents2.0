import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';

const ErrorPage = () => {
  return (
    <div className="ke-atmos min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="ke-card p-8 md:p-10 text-center relative overflow-hidden">
          <div className="pointer-events-none absolute -top-6 right-4 text-[7rem] leading-none font-outfit font-bold text-muted/60 select-none">
            !
          </div>

          <span
            className="ke-medallion mx-auto mb-6"
            style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', background: 'linear-gradient(150deg, hsl(var(--accent) / 0.20), transparent 85%)' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: 'hsl(var(--accent))' }} />
          </span>

          <div className="text-[11px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground mb-3">Unexpected Error</div>

          <h1 className="text-3xl md:text-4xl font-outfit font-bold text-foreground mb-2 tracking-tight">
            Oops!
          </h1>

          <h2 className="text-xl md:text-2xl font-outfit font-semibold text-foreground/90 mb-3">
            Something Went Wrong
          </h2>
          <div className="ke-rule-gold mx-auto mb-4" />

          <p className="text-muted-foreground font-jakarta mb-6">
            We encountered an unexpected error. Our team is fixing it as we speak.
          </p>

          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-foreground font-jakarta">
              Don't worry, your data is safe. Please try again in a moment.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => window.location.reload()}
              className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-jakarta font-medium rounded-lg h-12 shadow-lg shadow-primary/20 transition-colors"
            >
              Try Again
            </Button>

            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="w-full border-border hover:bg-muted font-jakarta rounded-lg h-12 transition-colors"
            >
              Go to Home
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground font-jakarta">
              Error ID: {Date.now().toString(36).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
