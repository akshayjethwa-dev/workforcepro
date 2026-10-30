// src/utils/wcagColor.ts
/**
 * WCAG 2.1 AA Color Contrast & Accessibility Utility
 *
 * Implements relative luminance calculations and contrast ratios according to:
 * https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface ContrastAuditResult {
  ratio: number;
  formattedRatio: string;
  passesAA: boolean;       // >= 4.5:1 for normal text
  passesAALarge: boolean;  // >= 3.0:1 for large text
  passesAAA: boolean;      // >= 7.0:1 for enhanced contrast
  suggestedTextColor: '#ffffff' | '#0f172a';
  rating: 'POOR' | 'ACCEPTABLE' | 'EXCELLENT';
  message: string;
}

/**
  * Parses hex string (#rgb or #rrggbb) to RGB components [0-255].
  */
export function hexToRgb(hex: string): RgbColor | null {
  if (!hex || typeof hex !== 'string') return null;
  const cleanHex = hex.replace('#', '').trim();
  
  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16),
    };
  }
  
  if (cleanHex.length === 6) {
    return {
      r: parseInt(cleanHex.slice(0, 2), 16),
      g: parseInt(cleanHex.slice(2, 4), 16),
      b: parseInt(cleanHex.slice(4, 6), 16),
    };
  }
  
  return null;
}

/**
 * Formats RGB to #rrggbb hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculates relative luminance according to WCAG 2.1 specification:
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where each channel is linearized.
 */
export function getRelativeLuminance(rgb: RgbColor): number {
  const normalize = (val: number) => {
    const sRGB = val / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  const R = normalize(rgb.r);
  const G = normalize(rgb.g);
  const B = normalize(rgb.b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculates contrast ratio between two hex colors:
 * Ratio = (Lighter + 0.05) / (Darker + 0.05)
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1) || { r: 37, g: 99, b: 235 };
  const rgb2 = hexToRgb(hex2) || { r: 255, g: 255, b: 255 };

  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Converts RGB to HSL.
 */
export function rgbToHsl(rgb: RgbColor): HslColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Converts HSL to RGB.
 */
export function hslToRgb(hsl: HslColor): RgbColor {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Audits a color pair against WCAG 2.1 AA specifications.
 */
export function auditContrast(foregroundHex: string, backgroundHex: string = '#ffffff'): ContrastAuditResult {
  const ratio = getContrastRatio(foregroundHex, backgroundHex);
  const formattedRatio = `${ratio.toFixed(2)}:1`;
  const passesAA = ratio >= 4.5;
  const passesAALarge = ratio >= 3.0;
  const passesAAA = ratio >= 7.0;

  // Determine ideal text color (white vs dark slate) on this foreground
  const contrastOnWhite = getContrastRatio(foregroundHex, '#ffffff');
  const contrastOnDark = getContrastRatio(foregroundHex, '#0f172a');
  const suggestedTextColor = contrastOnWhite >= contrastOnDark ? '#ffffff' : '#0f172a';

  let rating: 'POOR' | 'ACCEPTABLE' | 'EXCELLENT' = 'POOR';
  let message = '';

  if (passesAAA) {
    rating = 'EXCELLENT';
    message = `Meets WCAG 2.1 AAA (Enhanced Contrast, ${formattedRatio})`;
  } else if (passesAA) {
    rating = 'EXCELLENT';
    message = `Meets WCAG 2.1 AA (${formattedRatio} ≥ 4.5:1)`;
  } else if (passesAALarge) {
    rating = 'ACCEPTABLE';
    message = `Meets WCAG 2.1 AA Large Text only (${formattedRatio} < 4.5:1)`;
  } else {
    rating = 'POOR';
    message = `Fails WCAG 2.1 AA (${formattedRatio} < 4.5:1). Low legibility for standard text.`;
  }

  return {
    ratio,
    formattedRatio,
    passesAA,
    passesAALarge,
    passesAAA,
    suggestedTextColor,
    rating,
    message
  };
}

/**
 * Automatically adjusts the lightness of `hexColor` until it satisfies WCAG 2.1 AA (>= 4.5:1)
 * against `targetBackgroundHex`, preserving the exact hue.
 */
export function autoAdjustForWCAG_AA(
  hexColor: string,
  targetBackgroundHex: string = '#ffffff',
  targetRatio: number = 4.55
): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return '#2563eb';

  const currentRatio = getContrastRatio(hexColor, targetBackgroundHex);
  if (currentRatio >= targetRatio) {
    return hexColor; // already compliant
  }

  const bgRgb = hexToRgb(targetBackgroundHex) || { r: 255, g: 255, b: 255 };
  const bgLuminance = getRelativeLuminance(bgRgb);
  const isLightBg = bgLuminance > 0.5;

  const hsl = rgbToHsl(rgb);

  // If background is light (e.g. #ffffff), darken the color (reduce L)
  // If background is dark (e.g. #0f172a), lighten the color (increase L)
  const step = isLightBg ? -1 : 1;
  let adjustedL = hsl.l;

  for (let i = 0; i < 90; i++) {
    adjustedL += step;
    if (adjustedL <= 5 || adjustedL >= 98) break;

    const testRgb = hslToRgb({ ...hsl, l: adjustedL });
    const testHex = rgbToHex(testRgb.r, testRgb.g, testRgb.b);
    const testRatio = getContrastRatio(testHex, targetBackgroundHex);

    if (testRatio >= targetRatio) {
      return testHex;
    }
  }

  // Fallback to high-contrast tone if extreme
  return isLightBg ? '#1d4ed8' : '#60a5fa';
}
