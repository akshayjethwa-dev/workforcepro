import React, { useRef } from 'react';
import {
  advanceToNextFormField,
  scrollElementAboveKeyboard,
  useKeyboardAwareLayout,
} from '../hooks/useKeyboardAwareLayout';

export interface KeyboardAwareFormContainerProps {
  children: React.ReactNode;
  /** Optional footer anchored cleanly above the open keyboard on mobile/native, and at bottom on desktop */
  stickyFooter?: React.ReactNode;
  /** Optional ref to access the scrollable form container (e.g. for scrollToFirstError) */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Optional form submission handler; when provided renders a <form> element */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  /** Called when user presses Enter / Next on the final field in the form */
  onFinalFieldSubmit?: () => void;
  /** Extra base padding-bottom (px) in addition to dynamic keyboard height (default: 96) */
  extraBottomPadding?: number;
  /** Enable automatic Enter -> Next field focus progression (default: true) */
  enableEnterToNext?: boolean;
  /** Additional classes for the scrollable body */
  className?: string;
  /** Additional classes for the sticky footer wrapper */
  footerClassName?: string;
  /** Whether the sticky footer should be fixed at bottom of viewport rising above keyboard (default: false -> sticky inside container) */
  fixedBottomFooter?: boolean;
}

/**
 * Keyboard-aware scrollable form container:
 * - Enforces overflow-y-auto and dynamic padding-bottom accounting for soft keyboard height
 * - Auto-scrolls any focused input/select/textarea smoothly to the center of the visible viewport
 * - Supports mobile "Next" / Enter key progression between fields with proper inputMode transitions
 * - Supports a sticky or fixed-bottom Save/Submit bar that rises cleanly above the keyboard
 */
export const KeyboardAwareFormContainer: React.FC<KeyboardAwareFormContainerProps> = ({
  children,
  stickyFooter,
  containerRef,
  onSubmit,
  onFinalFieldSubmit,
  extraBottomPadding = 96,
  enableEnterToNext = true,
  className = '',
  footerClassName = '',
  fixedBottomFooter = false,
}) => {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const resolvedRef = containerRef || internalRef;
  const { keyboardHeight, isKeyboardOpen } = useKeyboardAwareLayout();

  const handleFocusCapture = (e: React.FocusEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      scrollElementAboveKeyboard(target, resolvedRef.current, keyboardHeight);
    }
  };

  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!enableEnterToNext || e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Allow multiline textareas & explicit buttons to keep default Enter behavior
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;

    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      const hint = target.getAttribute('enterkeyhint');
      if (hint === 'done' || hint === 'go' || hint === 'send') {
        if (onFinalFieldSubmit && !onSubmit) {
          e.preventDefault();
          onFinalFieldSubmit();
        }
        return;
      }

      // Attempt to advance to the next editable field
      const moved = advanceToNextFormField(target, resolvedRef.current);
      if (moved) {
        e.preventDefault();
      } else if (onFinalFieldSubmit && !onSubmit) {
        e.preventDefault();
        onFinalFieldSubmit();
      }
    }
  };

  const dynamicBottomPadding = `calc(${extraBottomPadding}px + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px))`;

  const bodyContent = (
    <div
      ref={resolvedRef}
      onFocusCapture={handleFocusCapture}
      onKeyDownCapture={handleKeyDownCapture}
      className={`overflow-y-auto overscroll-y-contain min-w-0 w-full ${className}`}
      style={{ paddingBottom: dynamicBottomPadding }}
    >
      {children}
    </div>
  );

  const renderedFooter = stickyFooter ? (
    fixedBottomFooter ? (
      <div
        className={`fixed left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-lg transition-[bottom] duration-200 ease-out ${footerClassName}`}
        style={{
          bottom: isKeyboardOpen
            ? `${keyboardHeight}px`
            : '0px',
          paddingBottom: isKeyboardOpen
            ? '0.5rem'
            : 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {stickyFooter}
      </div>
    ) : (
      <div
        className={`sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200/90 transition-all duration-200 ${footerClassName}`}
        style={{
          paddingBottom: isKeyboardOpen
            ? '0.5rem'
            : 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {stickyFooter}
      </div>
    )
  ) : null;

  if (onSubmit) {
    return (
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col flex-1 min-h-0 min-w-0 w-full"
      >
        {bodyContent}
        {renderedFooter}
      </form>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full">
      {bodyContent}
      {renderedFooter}
    </div>
  );
};
