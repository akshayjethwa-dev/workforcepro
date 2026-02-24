// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile, SubscriptionTier, PlanLimits, PLAN_CONFIG } from '../types/index';

interface AuthContextType {
  user: User | null;         
  profile: UserProfile | null; 
  tenantPlan: SubscriptionTier;
  limits: PlanLimits | null;
  trialDaysLeft: number | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ 
    user: null, 
    profile: null, 
    tenantPlan: 'STARTER', 
    limits: null, 
    trialDaysLeft: null,
    loading: true 
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenantPlan, setTenantPlan] = useState<SubscriptionTier>('STARTER');
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const userData = docSnap.data() as UserProfile;
          setProfile(userData);

          // FETCH TENANT SUBSCRIPTION INFO
          if (userData.tenantId) {
             const tenantSnap = await getDoc(doc(db, 'tenants', userData.tenantId));
             if (tenantSnap.exists()) {
                 const tenantData = tenantSnap.data();
                 let currentPlan = (tenantData.plan as SubscriptionTier) || 'STARTER';
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
                         currentPlan = 'STARTER'; // Trial Expired! Auto-downgrade.
                         daysLeft = 0;
                     }
                 }

                 setTenantPlan(currentPlan);
                 setLimits(PLAN_CONFIG[currentPlan]);
                 setTrialDaysLeft(daysLeft);
             }
          }
        }
      } else {
        setProfile(null);
        setTenantPlan('STARTER');
        setLimits(null);
        setTrialDaysLeft(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, tenantPlan, limits, trialDaysLeft, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};