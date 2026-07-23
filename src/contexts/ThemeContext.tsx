// src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
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

    const tenantRef = doc(db, 'tenants', profile.tenantId);
    
    // Real-time listener for instant white-label updates
    const unsubscribe = onSnapshot(tenantRef, (docSnap) => {
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
    });

    return () => unsubscribe();
  }, [profile?.tenantId]);

  return (
    <ThemeContext.Provider value={{ branding }}>
      {children}
    </ThemeContext.Provider>
  );
};