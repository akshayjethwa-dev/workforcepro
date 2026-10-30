// src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { BrandingConfig } from '../types/index';

export interface CompleteBrandingConfig extends BrandingConfig {
  appName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  backgroundColor: string;
  linkColor: string;
  textColor: string;
}

export const DEFAULT_PLATFORM_BRANDING: CompleteBrandingConfig = {
  appName: 'WorkForce Pro',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#2563eb',
  backgroundColor: '#f8fafc',
  linkColor: '#2563eb',
  textColor: '#0f172a',
};

interface ThemeContextType {
  branding: BrandingConfig | null;
  effectiveBranding: BrandingConfig;
  isCustomBranded: boolean;
  previewBranding: BrandingConfig | null;
  setPreviewBranding: (branding: BrandingConfig | null) => void;
  resetBrandingToDefault: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  branding: null,
  effectiveBranding: DEFAULT_PLATFORM_BRANDING,
  isCustomBranded: false,
  previewBranding: null,
  setPreviewBranding: () => {},
  resetBrandingToDefault: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/**
 * Applies runtime theme styling (CSS variables, dynamic favicon, theme-color meta, and title)
 */
function applyRuntimeTheme(theme: BrandingConfig) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // 1. Inject root CSS variables for Tailwind and Capacitor/PWA themeing
  const primary: string = theme.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor;
  const background: string = theme.backgroundColor || DEFAULT_PLATFORM_BRANDING.backgroundColor;
  const link: string = theme.linkColor || primary;
  const text: string = theme.textColor || DEFAULT_PLATFORM_BRANDING.textColor;

  root.style.setProperty('--tenant-primary', primary);
  root.style.setProperty('--color-brand', primary);
  root.style.setProperty('--tenant-bg', background);
  root.style.setProperty('--tenant-link', link);
  root.style.setProperty('--tenant-text', text);

  // 2. Update favicon if custom favicon provided; fallback to standard app icon
  const faviconEl = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
  if (faviconEl) {
    if (theme.faviconUrl && theme.faviconUrl.trim().length > 0) {
      faviconEl.href = theme.faviconUrl;
    } else {
      faviconEl.href = '/icon-192x192.png';
    }
  }

  // 3. Update document title
  const appTitle = theme.appName?.trim() || DEFAULT_PLATFORM_BRANDING.appName;
  document.title = appTitle === DEFAULT_PLATFORM_BRANDING.appName
    ? 'WorkForce Pro | Industrial Workforce Management'
    : `${appTitle} | Industrial Workforce Platform`;

  // 4. Update meta theme-color for PWA & mobile browser status bar
  let metaTheme = document.querySelector("meta[name='theme-color']") as HTMLMetaElement | null;
  if (!metaTheme) {
    metaTheme = document.createElement('meta');
    metaTheme.name = 'theme-color';
    document.head.appendChild(metaTheme);
  }
  metaTheme.content = primary;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [previewBranding, setPreviewBranding] = useState<BrandingConfig | null>(null);

  // Calculate effective branding: active preview overrides stored branding, fallback to platform defaults
  const effectiveBranding = useMemo(() => {
    const active = previewBranding || branding;
    if (!active) return DEFAULT_PLATFORM_BRANDING;
    return {
      appName: active.appName || DEFAULT_PLATFORM_BRANDING.appName,
      logoUrl: active.logoUrl || '',
      faviconUrl: active.faviconUrl || '',
      primaryColor: active.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor,
      backgroundColor: active.backgroundColor || DEFAULT_PLATFORM_BRANDING.backgroundColor,
      linkColor: active.linkColor || active.primaryColor || DEFAULT_PLATFORM_BRANDING.linkColor,
      textColor: active.textColor || DEFAULT_PLATFORM_BRANDING.textColor,
      customDomain: active.customDomain,
      emailTemplates: active.emailTemplates,
      updatedAt: active.updatedAt,
    };
  }, [branding, previewBranding]);

  const isCustomBranded = useMemo(() => {
    return Boolean(
      branding?.appName !== DEFAULT_PLATFORM_BRANDING.appName ||
      branding?.logoUrl ||
      branding?.primaryColor !== DEFAULT_PLATFORM_BRANDING.primaryColor ||
      branding?.customDomain?.domain
    );
  }, [branding]);

  const resetBrandingToDefault = useCallback(() => {
    setPreviewBranding(null);
    setBranding(null);
    applyRuntimeTheme(DEFAULT_PLATFORM_BRANDING);
  }, []);

  // Sync theme changes to DOM
  useEffect(() => {
    applyRuntimeTheme(effectiveBranding);
  }, [effectiveBranding]);

  // Listen to local window broadcast updates (for instant reactivity without network delay)
  useEffect(() => {
    const handleBrandingEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.branding) {
        if (!profile?.tenantId || customEvent.detail.tenantId === profile.tenantId) {
          setBranding(customEvent.detail.branding);
        }
      }
    };

    window.addEventListener('tenant_branding_updated', handleBrandingEvent);
    return () => window.removeEventListener('tenant_branding_updated', handleBrandingEvent);
  }, [profile?.tenantId]);

  // Main listener for authenticated tenant
  useEffect(() => {
    const tenantId = profile?.tenantId;
    if (!tenantId) {
      setBranding(null);
      applyRuntimeTheme(DEFAULT_PLATFORM_BRANDING);
      return;
    }

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(`tenant_branding_${tenantId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setBranding(parsed);
      }
    } catch {}

    // Demo / unauthenticated mode handling
    if (tenantId === 'demo-tenant-id' || tenantId.startsWith('demo-') || !auth.currentUser) {
      const stored = localStorage.getItem(`tenant_branding_${tenantId}`);
      if (!stored) {
        const demoBranding: BrandingConfig = {
          appName: profile?.companyName || 'Apex WorkForce',
          logoUrl: '',
          faviconUrl: '',
          primaryColor: '#2563eb',
          backgroundColor: '#f8fafc',
          linkColor: '#2563eb',
          textColor: '#0f172a'
        };
        setBranding(demoBranding);
      }
      return;
    }

    // Real-time Firestore subscription for production tenants
    try {
      const tenantRef = doc(db, 'tenants', tenantId);
      const unsubscribe = onSnapshot(
        tenantRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const tenantBranding = (data.branding as BrandingConfig) || null;
            setBranding(tenantBranding);
            if (tenantBranding) {
              try {
                localStorage.setItem(`tenant_branding_${tenantId}`, JSON.stringify(tenantBranding));
              } catch {}
            }
          }
        },
        (error) => {
          console.warn("Theme real-time subscription caught notice:", error.message);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn("Could not attach theme listener:", e);
    }
  }, [profile?.tenantId, profile?.companyName]);

  return (
    <ThemeContext.Provider
      value={{
        branding,
        effectiveBranding,
        isCustomBranded,
        previewBranding,
        setPreviewBranding,
        resetBrandingToDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};