// src/contexts/EntitlementContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { 
  FeatureFlagKey, 
  FeatureResolution, 
  PendingDowngrade, 
  ALL_FEATURE_FLAGS 
} from '../types/featureFlags';
import { entitlementService } from '../services/entitlementService';

interface EntitlementContextType {
  isEntitled: (featureKey: FeatureFlagKey) => boolean;
  getResolution: (featureKey: FeatureFlagKey) => FeatureResolution;
  pendingDowngrade: PendingDowngrade | null;
  isInGracePeriod: boolean;
  loading: boolean;
  refreshEntitlements: (forceFresh?: boolean) => Promise<void>;
  allResolutions: Record<FeatureFlagKey, FeatureResolution>;
  allFlags: Record<FeatureFlagKey, boolean>;
}

const EntitlementContext = createContext<EntitlementContextType>({
  isEntitled: () => false,
  getResolution: (key) => ({
    key,
    enabled: false,
    source: 'FAIL_CLOSED_FALLBACK',
    resolvedAt: new Date().toISOString(),
  }),
  pendingDowngrade: null,
  isInGracePeriod: false,
  loading: true,
  refreshEntitlements: async () => {},
  allResolutions: {} as any,
  allFlags: {} as any,
});

export const useEntitlements = () => useContext(EntitlementContext);

export const EntitlementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, tenantPlan, user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [resolutions, setResolutions] = useState<Record<FeatureFlagKey, FeatureResolution>>({} as any);
  const [pendingDowngrade, setPendingDowngrade] = useState<PendingDowngrade | null>(null);
  const [isInGracePeriod, setIsInGracePeriod] = useState<boolean>(false);

  const tenantId = profile?.tenantId;
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const loadEntitlements = useCallback(async (forceFresh = false) => {
    if (!tenantId) {
      // Unauthenticated or superadmin without impersonation
      const defaultResolutions: Record<FeatureFlagKey, FeatureResolution> = {} as any;
      for (const def of ALL_FEATURE_FLAGS) {
        defaultResolutions[def.key] = {
          key: def.key,
          enabled: isSuperAdmin, // Super admins have global access
          source: isSuperAdmin ? 'TENANT_OVERRIDE' : 'FAIL_CLOSED_FALLBACK',
          resolvedAt: new Date().toISOString(),
          reason: isSuperAdmin ? 'Super Admin root entitlement.' : 'No active tenant authenticated.',
        };
      }
      setResolutions(defaultResolutions);
      setPendingDowngrade(null);
      setIsInGracePeriod(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const payload = await entitlementService.getTenantEntitlements(tenantId, tenantPlan, forceFresh);
      setResolutions(payload.resolutions);
      setPendingDowngrade(payload.pendingDowngrade || null);
      setIsInGracePeriod(payload.isInGracePeriod);
    } catch (err) {
      console.warn('Notice in EntitlementProvider resolving tenant flags (fallback applied):', err);
      // Fallback fail-closed
      const failClosedMap: Record<FeatureFlagKey, FeatureResolution> = {} as any;
      for (const def of ALL_FEATURE_FLAGS) {
        failClosedMap[def.key] = {
          key: def.key,
          enabled: false,
          source: 'FAIL_CLOSED_FALLBACK',
          resolvedAt: new Date().toISOString(),
          reason: 'Error in entitlement provider; defaulted to fail-closed.',
        };
      }
      setResolutions(failClosedMap);
    } finally {
      setLoading(false);
    }
  }, [tenantId, tenantPlan, isSuperAdmin]);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  // Listen for background invalidations or updates across tabs
  useEffect(() => {
    const handleInvalidation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail?.tenantId || customEvent.detail.tenantId === tenantId) {
        loadEntitlements(true);
      }
    };

    window.addEventListener('entitlements_invalidated', handleInvalidation);
    return () => window.removeEventListener('entitlements_invalidated', handleInvalidation);
  }, [tenantId, loadEntitlements]);

  const isEntitled = useCallback((featureKey: FeatureFlagKey): boolean => {
    if (isSuperAdmin) return true;
    const res = resolutions[featureKey];
    return Boolean(res && res.enabled);
  }, [resolutions, isSuperAdmin]);

  const getResolution = useCallback((featureKey: FeatureFlagKey): FeatureResolution => {
    if (isSuperAdmin) {
      return {
        key: featureKey,
        enabled: true,
        source: 'TENANT_OVERRIDE',
        resolvedAt: new Date().toISOString(),
        reason: 'Master Super Admin bypass.',
      };
    }
    return resolutions[featureKey] || {
      key: featureKey,
      enabled: false,
      source: 'FAIL_CLOSED_FALLBACK',
      resolvedAt: new Date().toISOString(),
      reason: 'Feature resolution not found; fail-closed.',
    };
  }, [resolutions, isSuperAdmin]);

  const allFlags = useMemo(() => {
    const map: Record<FeatureFlagKey, boolean> = {} as any;
    for (const def of ALL_FEATURE_FLAGS) {
      map[def.key] = isSuperAdmin ? true : Boolean(resolutions[def.key]?.enabled);
    }
    return map;
  }, [resolutions, isSuperAdmin]);

  return (
    <EntitlementContext.Provider
      value={{
        isEntitled,
        getResolution,
        pendingDowngrade,
        isInGracePeriod,
        loading,
        refreshEntitlements: loadEntitlements,
        allResolutions: resolutions,
        allFlags,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
};
