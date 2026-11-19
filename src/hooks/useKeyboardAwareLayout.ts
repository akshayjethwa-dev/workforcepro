import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '../lib/capacitorKeyboard';

export interface KeyboardAwareState {
  keyboardHeight: number;
  isKeyboardOpen: boolean;
  isNativePlatform: boolean;
  dismissKeyboard: () => Promise<void>;
  scrollFocusedElementIntoView: (
    element: HTMLElement | null,
    scrollContainer?: HTMLElement | null
  ) => void;
  scrollToFirstError: (
    container: HTMLElement | null,
    firstFieldKey?: string
  ) => void;
  focusNextField: (
    currentElement: HTMLElement,
    container?: HTMLElement | null
  ) => boolean;
}

const FOCUSABLE_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button[data-date-picker-trigger="true"]:not([disabled])',
].join(', ');

/**
 * Finds the nearest vertically scrollable ancestor of an element.
 */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement || null;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight + 4
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Smoothly centers a target element inside the visible viewport area ABOVE the soft keyboard.
 * Includes delayed re-centering for older Android WebViews where keyboard animations settle slowly.
 */
export function scrollElementAboveKeyboard(
  element: HTMLElement | null,
  explicitContainer?: HTMLElement | null,
  keyboardHeightOverride?: number
): void {
  if (!element || typeof window === 'undefined') return;

  const performScroll = () => {
    const kbHeight =
      keyboardHeightOverride !== undefined
        ? keyboardHeightOverride
        : parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height') || '0'
          ) || 0;

    const vv = window.visualViewport;
    const visibleHeight = vv
      ? vv.height
      : Math.max(240, window.innerHeight - kbHeight);

    const scrollParent = explicitContainer || findScrollableAncestor(element);
    const rect = element.getBoundingClientRect();

    // Keep element centered in the visible space above the keyboard (accounting for ~72px top header & ~72px sticky footer)
    const safeTop = 76;
    const safeBottom = Math.max(safeTop + 80, visibleHeight - 84);
    const desiredCenterY = safeTop + (safeBottom - safeTop) * 0.45;

    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const elementCenterY = rect.top + rect.height / 2;
      const targetY = Math.min(desiredCenterY, parentRect.top + parentRect.height / 2);
      const delta = elementCenterY - targetY;

      if (Math.abs(delta) > 12) {
        scrollParent.scrollTo({
          top: Math.max(0, scrollParent.scrollTop + delta),
          behavior: 'smooth',
        });
      }
      return;
    }

    // Fallback to window scroll
    const elementCenterY = rect.top + rect.height / 2;
    const delta = elementCenterY - desiredCenterY;
    if (Math.abs(delta) > 12) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + delta),
        behavior: 'smooth',
      });
    } else if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  };

  window.requestAnimationFrame(performScroll);
  // Secondary pass for older Android devices whose IME resizes after focus fires
  window.setTimeout(performScroll, 180);
  window.setTimeout(performScroll, 360);
}

/**
 * Advances focus to the next editable field inside a form container (used for mobile "Next" / Enter key).
 * Returns true if focus moved to another field, false if current element was the last field.
 */
export function advanceToNextFormField(
  currentElement: HTMLElement,
  container?: HTMLElement | null
): boolean {
  const root = container || currentElement.closest('form') || document.body;
  const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_FIELD_SELECTOR)).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute('aria-hidden')
  );

  const currentIdx = focusables.indexOf(currentElement);
  if (currentIdx === -1 || currentIdx >= focusables.length - 1) {
    return false;
  }

  const nextEl = focusables[currentIdx + 1];
  if (nextEl) {
    nextEl.focus({ preventScroll: true });
    scrollElementAboveKeyboard(nextEl, container || undefined);
    return true;
  }
  return false;
}

/**
 * Scrolls to and focuses the first field with a validation error inside a container.
 */
export function scrollToFirstInvalidField(
  container: HTMLElement | null,
  firstFieldKey?: string
): void {
  const root = container || document.body;
  let target: HTMLElement | null = null;

  if (firstFieldKey) {
    target = root.querySelector<HTMLElement>(`[data-field="${firstFieldKey}"]`);
  }
  if (!target) {
    target = root.querySelector<HTMLElement>(
      '[data-field-error="true"], [aria-invalid="true"]'
    );
  }

  if (!target) return;

  scrollElementAboveKeyboard(target, container || undefined);

  // Focus the underlying input/select/trigger after scroll begins
  const focusable = target.matches('input, select, textarea, button')
    ? target
    : target.querySelector<HTMLElement>('input, select, textarea, button');
  if (focusable && typeof focusable.focus === 'function') {
    window.setTimeout(() => {
      focusable.focus({ preventScroll: true });
    }, 120);
  }
}

/**
 * Global/local hook that listens to @capacitor/keyboard (keyboardWillShow / keyboardWillHide)
 * on native iOS/Android AND window.visualViewport on mobile web/PWA browsers.
 * Syncs `--keyboard-height` on :root so all forms and sticky footers adjust fluidly.
 */
export function useKeyboardAwareLayout(): KeyboardAwareState {
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
  const isNativePlatform = Capacitor.isNativePlatform();

  const applyKeyboardHeight = useCallback((heightPx: number) => {
    const clamped = Math.max(0, Math.round(heightPx));
    setKeyboardHeight(clamped);

    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--keyboard-height', `${clamped}px`);
      document.documentElement.dataset.keyboardOpen = clamped > 0 ? 'true' : 'false';
    }

    // Re-center whichever input is currently focused when keyboard opens (critical for older Android)
    if (clamped > 0 && typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT')
      ) {
        scrollElementAboveKeyboard(active, undefined, clamped);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cleanupFns: Array<() => void> = [];

    // 1. Native Capacitor Keyboard Plugin listeners (essential for older Android & iOS native shells)
    if (isNativePlatform) {
      let active = true;
      const listenerHandles: Array<{ remove: () => Promise<void> }> = [];

      const registerNativeListeners = async () => {
        try {
          const willShow = await Keyboard.addListener(
            'keyboardWillShow',
            (info: KeyboardInfo) => {
              if (!active) return;
              applyKeyboardHeight(info.keyboardHeight || 0);
            }
          );
          const didShow = await Keyboard.addListener(
            'keyboardDidShow',
            (info: KeyboardInfo) => {
              if (!active) return;
              applyKeyboardHeight(info.keyboardHeight || 0);
            }
          );
          const willHide = await Keyboard.addListener('keyboardWillHide', () => {
            if (!active) return;
            applyKeyboardHeight(0);
          });
          const didHide = await Keyboard.addListener('keyboardDidHide', () => {
            if (!active) return;
            applyKeyboardHeight(0);
          });

          if (!active) {
            await Promise.all([
              willShow.remove(),
              didShow.remove(),
              willHide.remove(),
              didHide.remove(),
            ]);
          } else {
            listenerHandles.push(willShow, didShow, willHide, didHide);
          }
        } catch {
          // Graceful fallback to VisualViewport below if plugin unavailable
        }
      };

      registerNativeListeners();

      cleanupFns.push(() => {
        active = false;
        listenerHandles.forEach((h) => {
          h.remove().catch(() => {});
        });
      });
    }

    // 2. Web / Mobile Browser / PWA VisualViewport fallback (and dual-sync on Android WebViews)
    const vv = window.visualViewport;
    if (vv) {
      let baselineHeight = Math.max(window.innerHeight, vv.height);

      const handleViewportChange = () => {
        // Update baseline if screen rotated or resized without an active input
        const activeTag = document.activeElement?.tagName;
        const isInputFocused =
          activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

        if (!isInputFocused && vv.height > baselineHeight * 0.9) {
          baselineHeight = Math.max(window.innerHeight, vv.height);
        }

        const heightDiff = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        // Treat height drops > 110px as soft keyboard appearance (ignores browser address bar jitter)
        if (heightDiff > 110 && isInputFocused) {
          applyKeyboardHeight(heightDiff);
        } else if (heightDiff <= 60) {
          applyKeyboardHeight(0);
        }
      };

      vv.addEventListener('resize', handleViewportChange, { passive: true });
      vv.addEventListener('scroll', handleViewportChange, { passive: true });

      cleanupFns.push(() => {
        vv.removeEventListener('resize', handleViewportChange);
        vv.removeEventListener('scroll', handleViewportChange);
      });
    }

    // 3. Reset keyboard height when all inputs blur cleanly on web
    const handleFocusOut = () => {
      window.setTimeout(() => {
        const activeTag = document.activeElement?.tagName;
        const stillEditing =
          activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
        if (!stillEditing && !isNativePlatform) {
          applyKeyboardHeight(0);
        }
      }, 120);
    };

    window.addEventListener('focusout', handleFocusOut, { passive: true });
    cleanupFns.push(() => window.removeEventListener('focusout', handleFocusOut));

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
  }, [isNativePlatform, applyKeyboardHeight]);

  const dismissKeyboard = useCallback(async () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (isNativePlatform) {
      try {
        await Keyboard.hide();
      } catch {
        // Ignore if already hidden
      }
    }
    applyKeyboardHeight(0);
  }, [isNativePlatform, applyKeyboardHeight]);

  const scrollFocusedElementIntoView = useCallback(
    (element: HTMLElement | null, scrollContainer?: HTMLElement | null) => {
      scrollElementAboveKeyboard(element, scrollContainer, keyboardHeight);
    },
    [keyboardHeight]
  );

  const scrollToFirstError = useCallback(
    (container: HTMLElement | null, firstFieldKey?: string) => {
      scrollToFirstInvalidField(container, firstFieldKey);
    },
    []
  );

  const focusNextField = useCallback(
    (currentElement: HTMLElement, container?: HTMLElement | null) => {
      return advanceToNextFormField(currentElement, container);
    },
    []
  );

  return {
    keyboardHeight,
    isKeyboardOpen: keyboardHeight > 0,
    isNativePlatform,
    dismissKeyboard,
    scrollFocusedElementIntoView,
    scrollToFirstError,
    focusNextField,
  };
}
