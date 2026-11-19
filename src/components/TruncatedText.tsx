import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2 } from 'lucide-react';

export interface TruncatedDetailItem {
  label: string;
  value: string;
  breakAnywhere?: boolean;
  mono?: boolean;
}

interface TruncatedTextProps {
  text: string;
  /** Semantic heading/label shown at the top of the tap-to-expand modal */
  modalTitle?: string;
  /** Optional subtitle displayed below the full text in the modal */
  subtitle?: string;
  /** Optional key-value metadata shown in the tap-to-expand modal */
  details?: TruncatedDetailItem[];
  /** Tailwind classes applied to the truncated text container */
  className?: string;
  /** Whether tapping opens the full-text modal (default: true) */
  interactive?: boolean;
  /** Stop click event propagation so parent card clicks do not fire */
  stopPropagation?: boolean;
  /** Optional break-anywhere hint for emails/URLs in the modal */
  breakAnywhere?: boolean;
}

/**
 * Single-line critical text component with native desktop tooltip (`title`)
 * and an accessible tap-to-expand modal so long names (e.g., "Rajeshbhai Chimanbhai Patel"),
 * long emails, or translated strings never clip or cause horizontal overflow on 320px viewports.
 */
export const TruncatedText: React.FC<TruncatedTextProps> = ({
  text,
  modalTitle = 'Full Details',
  subtitle,
  details,
  className = '',
  interactive = true,
  stopPropagation = true,
  breakAnywhere = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const checkOverflow = () => {
      const el = textRef.current;
      if (!el) return;
      setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
    };

    checkOverflow();

    if (typeof ResizeObserver !== 'undefined' && textRef.current) {
      const observer = new ResizeObserver(checkOverflow);
      observer.observe(textRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleTrigger = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!interactive) return;
    if (stopPropagation) e.stopPropagation();
    setIsOpen(true);
  };

  if (!interactive) {
    return (
      <span
        ref={textRef}
        title={text}
        className={`block min-w-0 max-w-full truncate ${className}`}
      >
        {text}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleTrigger}
        title={`${text} — Tap to view full text`}
        aria-label={`${text}. Tap to expand full details`}
        className={`inline-flex items-center gap-1 min-w-0 max-w-full text-left bg-transparent border-0 p-0 cursor-pointer group/trunc focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm ${className}`}
      >
        <span
          ref={textRef}
          className="block min-w-0 flex-1 truncate group-hover/trunc:underline decoration-dotted underline-offset-2"
        >
          {text}
        </span>
        {isOverflowing && (
          <Maximize2
            size={11}
            aria-hidden="true"
            className="shrink-0 text-slate-400 group-hover/trunc:text-blue-600 transition-colors"
          />
        )}
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
                <span className="text-fluid-xs font-bold uppercase tracking-wider text-slate-500 min-w-0 break-words">
                  {modalTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close full details"
                  className="min-w-[2.75rem] min-h-[2.75rem] -mr-2 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition-colors shrink-0 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-3 max-h-[75dvh] overflow-y-auto">
                <div>
                  <p
                    className={`text-fluid-lg font-bold text-slate-900 leading-snug ${
                      breakAnywhere ? 'break-all [overflow-wrap:anywhere]' : 'break-words'
                    }`}
                  >
                    {text}
                  </p>
                  {subtitle && (
                    <p className="text-fluid-xs text-slate-500 mt-1 break-words leading-relaxed">
                      {subtitle}
                    </p>
                  )}
                </div>

                {details && details.length > 0 && (
                  <dl className="pt-3 border-t border-slate-100 space-y-2.5">
                    {details
                      .filter((item) => Boolean(item.value))
                      .map((item, idx) => (
                        <div key={`${item.label}-${idx}`} className="flex flex-col gap-0.5 min-w-0">
                          <dt className="text-fluid-2xs font-bold uppercase tracking-wider text-slate-400">
                            {item.label}
                          </dt>
                          <dd
                            className={`text-fluid-sm font-medium text-slate-800 ${
                              item.mono ? 'font-mono tabular-nums' : ''
                            } ${
                              item.breakAnywhere
                                ? 'break-all [overflow-wrap:anywhere]'
                                : 'break-words'
                            }`}
                          >
                            {item.value}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-full min-h-[2.75rem] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-fluid-xs transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
