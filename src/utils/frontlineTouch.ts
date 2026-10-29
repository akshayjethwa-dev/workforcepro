// src/utils/frontlineTouch.ts
/**
 * Frontline Safe Touch Target & Ergonomics Specifications
 * Compliant with Industrial Glove Operation & Outdoor Glare Standards
 */

export const FRONTLINE_TOUCH = {
  /** Minimum touch target size for industrial gloves (56px x 56px) */
  MIN_TARGET_PX: 56,
  /** High-frequency primary clock confirmation target (72px) */
  HIGH_FREQUENCY_CONFIRM_PX: 72,
  /** Minimum spacing between adjacent touch targets to prevent mis-taps (12px) */
  MIN_SPACING_PX: 12,
  /** Screen wipe lock duration in milliseconds */
  WIPE_LOCK_DURATION_MS: 2800,
} as const;

/**
 * Triggers hardware haptic feedback (if supported by device and browser)
 * Uses distinct patterns for punch confirmations, light taps, and warnings
 */
export const triggerFrontlineHaptic = (type: 'confirm' | 'light' | 'alert' | 'wipe' = 'confirm'): void => {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'confirm':
        // Two crisp pulses (60ms buzz, 30ms rest, 60ms buzz)
        navigator.vibrate([60, 30, 60]);
        break;
      case 'wipe':
        // Long warning buzz (120ms) indicating lockout
        navigator.vibrate(120);
        break;
      case 'alert':
        // Three rapid pulses for geofence or rule alerts
        navigator.vibrate([100, 40, 100, 40, 100]);
        break;
      case 'light':
      default:
        // Single subtle confirmation tap
        navigator.vibrate(35);
        break;
    }
  } catch {
    // Graceful fallback if device permissions restrict vibration
  }
};
