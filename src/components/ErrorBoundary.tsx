// src/components/ErrorBoundary.tsx
import React from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string | number | null;
  title?: string;
  description?: string;
  onExitToLogin?: () => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected error occurred while loading this page.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Unhandled UI exception caught:', error, errorInfo?.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const heading = this.props.title || 'Something Went Wrong';
      const body =
        this.props.description ||
        'We ran into an unexpected error while displaying this screen. Please tap Retry to try again.';

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-slate-100 text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-sm">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">{heading}</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">{body}</p>

            <div className="mt-5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-500 text-left space-y-1">
              <p className="font-semibold text-slate-700">What you can do:</p>
              <p>
                Check your internet connection and tap Retry. If the link still does not open, ask your manager to send a fresh magic link.
              </p>
            </div>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Retry</span>
              </button>

              {this.props.onExitToLogin && (
                <button
                  type="button"
                  onClick={this.props.onExitToLogin}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogIn size={13} />
                  <span>Go to Manager Login</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
