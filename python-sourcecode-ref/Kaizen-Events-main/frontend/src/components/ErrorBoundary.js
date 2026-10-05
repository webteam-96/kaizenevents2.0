import React from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            {/* Error Icon */}
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="w-12 h-12 text-red-500" />
              </div>
              <div className="text-8xl font-outfit font-bold text-slate-200">Oops!</div>
            </div>

            {/* Error Message */}
            <h1 className="text-2xl font-outfit font-bold text-slate-900 mb-3">
              Something Went Wrong
            </h1>
            <p className="text-slate-600 font-jakarta mb-8">
              We encountered an unexpected error. Our team has been notified and is working on a fix.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="border-slate-300 hover:bg-slate-100"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="border-slate-300 hover:bg-slate-100"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.href = '/dashboard'}
                className="bg-primary hover:bg-primary-hover"
              >
                <Home className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </div>

            {/* Footer */}
            <p className="mt-8 text-sm text-slate-400">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
