// src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { BrandingConfig } from '../types/index';

interface ThemeContextType {
  branding: BrandingConfig | null;
}

const ThemeContext = createContext<ThemeContextType>({ branding: null });

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [branding, setBranding] = useState<BrandingConfig | null>(null);

  useEffect(() => {
    // If no tenant is logged in, reset branding and CSS variables
    if (!profile?.tenantId) {
      setBranding(null);
      document.documentElement.style.removeProperty('--tenant-primary');
      return;
    }

    // In demo mode or unauthenticated state, avoid remote firestore calls that trigger permission-denied
    if (profile.tenantId === 'demo-tenant-id' || profile.tenantId.startsWith('demo-') || !auth.currentUser) {
      const demoBranding: BrandingConfig = {
        appName: profile.companyName || 'Apex WorkForce',
        logoUrl: '',
        primaryColor: '#2563eb'
      };
      setBranding(demoBranding);
      document.documentElement.style.setProperty('--tenant-primary', demoBranding.primaryColor);
      return;
    }

    try {
      const tenantRef = doc(db, 'tenants', profile.tenantId);
      
      // Real-time listener for instant white-label updates with error listener to prevent uncaught exceptions
      const unsubscribe = onSnapshot(
        tenantRef, 
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const tenantBranding = data.branding as BrandingConfig;
            setBranding(tenantBranding || null);

            // Inject the CSS Variable into the root document natively
            if (tenantBranding?.primaryColor) {
              document.documentElement.style.setProperty('--tenant-primary', tenantBranding.primaryColor);
            } else {
              document.documentElement.style.removeProperty('--tenant-primary');
            }
          }
        },
        (error) => {
          console.warn("Theme real-time subscription caught permission/connection notice:", error.message);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn("Could not attach theme listener:", e);
    }
  }, [profile?.tenantId, profile?.companyName]);

  return (
    <ThemeContext.Provider value={{ branding }}>
      {children}
    </ThemeContext.Provider>
  );
};