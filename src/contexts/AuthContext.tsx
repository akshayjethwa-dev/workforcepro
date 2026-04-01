// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore'; 
import { UserProfile, SubscriptionTier, PlanLimits } from '../types/index';
import { dbService } from '../services/db';

interface AuthContextType {
  user: User | null;         
  profile: UserProfile | null; 
  tenantPlan: SubscriptionTier;
  limits: PlanLimits | null;
  trialDaysLeft: number | null;
  loading: boolean;
  
  // Impersonation Methods
  isImpersonating: boolean;
  impersonateTenant: (tenantId: string, companyName: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
    user: null, 
    profile: null, 
    tenantPlan: 'STARTER', 
    limits: null, 
    trialDaysLeft: null,
    loading: true,
    isImpersonating: false, 
    impersonateTenant: async () => {}, 
    stopImpersonating: async () => {} 
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null); // For Impersonation
  const [isImpersonating, setIsImpersonating] = useState(false);
  
  const [tenantPlan, setTenantPlan] = useState<SubscriptionTier>('FREE'); // Default to FREE
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Extracted tenant loading logic into a reusable function
  const loadTenantData = async (tenantId: string) => {
    try {
        const tenantRef = doc(db, 'tenants', tenantId);
        
        // Fetch both Tenant Data and Global Plan Data simultaneously from Firestore
        const [tenantSnap, globalPlans] = await Promise.all([
            getDoc(tenantRef),
            dbService.getGlobalPlanConfig()
        ]);
        
        if (tenantSnap.exists()) {
            const tenantData = tenantSnap.data();
            let currentPlan = (tenantData.plan as SubscriptionTier) || 'FREE';
            let daysLeft = null;

            // Check Trial Status
            if (currentPlan === 'TRIAL' && tenantData.trialEndsAt) {
                // Normalize end date to midnight
                const endDate = new Date(tenantData.trialEndsAt);
                endDate.setHours(0, 0, 0, 0); 
                
                // Normalize current date to midnight
                const now = new Date();
                now.setHours(0, 0, 0, 0); 
                
                // Calculate pure day difference
                const diffTime = endDate.getTime() - now.getTime();
                daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (daysLeft <= 0) {
                    currentPlan = 'FREE'; // Auto-downgrade to FREE
                    daysLeft = 0;
                    
                    // Update Firestore so the downgrade is permanent
                    try {
                      await updateDoc(tenantRef, { plan: 'FREE' });
                    } catch (error) {
                      console.error("Failed to auto-downgrade plan in DB:", error);
                    }
                }
            }

            setTenantPlan(currentPlan);
            
            // Safe fallback in case global plan is missing/undefined due to network issues
            const baseLimits = globalPlans?.[currentPlan] || {};
            const overrides = tenantData.overrides || {};
            
            // Merge the global plan limits with the tenant's specific overrides
            setLimits({ ...baseLimits, ...overrides } as PlanLimits);
            
            setTrialDaysLeft(daysLeft);
        }
    } catch (error) {
        console.error("Error fetching tenant data:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
          setUser(firebaseUser);
          
          if (firebaseUser) {
            const docRef = doc(db, 'users', firebaseUser.uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
              const userData = docSnap.data() as UserProfile;
              setProfile(userData);
              setOriginalProfile(userData); // Save real profile for impersonation restoration

              // FETCH TENANT SUBSCRIPTION INFO
              if (userData.tenantId) {
                 await loadTenantData(userData.tenantId);
              }
            }
          } else {
            // Reset states when logged out
            setProfile(null);
            setOriginalProfile(null);
            setTenantPlan('FREE');
            setLimits(null);
            setTrialDaysLeft(null);
          }
      } catch (error) {
          console.error("Critical error in auth state resolution:", error);
      } finally {
          // Guaranteed to run, preventing the infinite loading spinner issue on poor networks
          setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Temporarily fake the local state to view exactly what the tenant sees
  const impersonateTenant = async (tenantId: string, companyName: string) => {
    if (!originalProfile) return;
    setIsImpersonating(true);
    setProfile({
        ...originalProfile,
        role: 'FACTORY_OWNER', // Downgrade local role to view as a factory owner
        tenantId: tenantId,
        companyName: companyName
    });
    await loadTenantData(tenantId);
  };

  // Restore original state
  const stopImpersonating = async () => {
    setIsImpersonating(false);
    setProfile(originalProfile);
    if (originalProfile?.tenantId) {
        await loadTenantData(originalProfile.tenantId);
    } else {
        setTenantPlan('FREE');
        setLimits(null);
        setTrialDaysLeft(null);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, profile, tenantPlan, limits, trialDaysLeft, loading, 
      isImpersonating, impersonateTenant, stopImpersonating 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};