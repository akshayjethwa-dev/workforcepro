import React from 'react';
import { AlertCircle } from 'lucide-react';

interface InlineFieldErrorProps {
  message?: string;
  id?: string;
  className?: string;
}

/**
 * Renders a non-overlapping, flow-participating inline validation error message.
 * Pushes subsequent form fields down cleanly rather than positioning absolutely over labels or inputs.
 */
export const InlineFieldError: React.FC<InlineFieldErrorProps> = ({
  message,
  id,
  className = '',
}) => {
  if (!message) return null;

  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      data-field-error="true"
      className={`mt-1.5 flex items-start gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-fluid-xs font-semibold text-rose-700 leading-snug break-words ${className}`}
    >
      <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
    </div>
  );
};
