// src/services/entitlementService.ts
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  FeatureFlagKey, 
  FeatureResolution, 
  ResolutionSource, 
  ALL_FEATURE_FLAGS, 
  DEFAULT_PLAN_FEATURE_FLAGS,
  PendingDowngrade,
  CachedEntitlementPayload
} from '../types/featureFlags';
import { SubscriptionTier, TenantProfile } from '../types/index';
import { tenantSecurityService } from './tenantSecurityService';

export class EntitlementError extends Error {
  public readonly code = 'FEATURE_NOT_ENTITLED';
  public readonly featureKey: FeatureFlagKey;
  public readonly tenantId: string;
  public readonly resolution: FeatureResolution;

  constructor(featureKey: FeatureFlagKey, tenantId: string, resolution: FeatureResolution) {
    super(`Access Denied: Tenant '${tenantId}' is not entitled to feature '${featureKey}'. [Resolution: ${resolution.source}]`);
    this.name = 'EntitlementError';
    this.featureKey = featureKey;
    this.tenantId = tenantId;
    this.resolution = resolution;
  }
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL
const IN_MEMORY_CACHE = new Map<string, CachedEntitlementPayload>();

export const entitlementService = {
  /**
   * Retrieves global feature flag defaults (Level 1 in precedence)
   */
  getGlobalFeatureFlags: async (): Promise<Record<FeatureFlagKey, boolean>> => {
    try {
      const docRef = doc(db, 'system_settings', 'feature_flags');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Record<string, boolean>;
        const merged: Record<FeatureFlagKey, boolean> = {} as any;
        for (const def of ALL_FEATURE_FLAGS) {
          merged[def.key] = typeof data[def.key] === 'boolean' ? data[def.key] : def.globalDefault;
        }
        return merged;
      }
    } catch (err) {
      console.warn('Failed to load global feature flags from Firestore, using fallbacks:', err);
    }
    // Fail-safe fallbacks
    const fallback: Record<FeatureFlagKey, boolean> = {} as any;
    for (const def of ALL_FEATURE_FLAGS) {
      fallback[def.key] = def.globalDefault;
    }
    return fallback;
  },

  /**
   * Updates global feature flag defaults (Super Admin only)
   */
  updateGlobalFeatureFlags: async (flags: Partial<Record<FeatureFlagKey, boolean>>): Promise<void> => {
    const docRef = doc(db, 'system_settings', 'feature_flags');
    await setDoc(docRef, { ...flags, updatedAt: new Date().toISOString() }, { merge: true });
    entitlementService.invalidateCache();
  },

  /**
   * Retrieves plan-level feature flag overrides matrix (Level 2 in precedence)
   */
  getPlanFeatureFlags: async (): Promise<Record<SubscriptionTier, Record<FeatureFlagKey, boolean>>> => {
    try {
      const docRef = doc(db, 'system_settings', 'plan_features');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          FREE: { ...DEFAULT_PLAN_FEATURE_FLAGS.FREE, ...(data.FREE || {}) },
          TRIAL: { ...DEFAULT_PLAN_FEATURE_FLAGS.TRIAL, ...(data.TRIAL || {}) },
          STARTER: { ...DEFAULT_PLAN_FEATURE_FLAGS.STARTER, ...(data.STARTER || {}) },
          PRO: { ...DEFAULT_PLAN_FEATURE_FLAGS.PRO, ...(data.PRO || {}) },
          ENTERPRISE: { ...DEFAULT_PLAN_FEATURE_FLAGS.ENTERPRISE, ...(data.ENTERPRISE || {}) },
        };
      }
    } catch (err) {
      console.warn('Failed to load plan feature flags from Firestore, using defaults:', err);
    }
    return DEFAULT_PLAN_FEATURE_FLAGS;
  },

  /**
   * Updates plan-level feature matrix for a specific subscription tier
   */
  updatePlanFeatureFlags: async (
    tier: SubscriptionTier, 
    flags: Record<FeatureFlagKey, boolean>
  ): Promise<void> => {
    const docRef = doc(db, 'system_settings', 'plan_features');
    await setDoc(docRef, { [tier]: flags, updatedAt: new Date().toISOString() }, { merge: true });
    entitlementService.invalidateCache();
  },

  /**
   * Invalidates client-side cached entitlements
   */
  invalidateCache: (tenantId?: string): void => {
    if (tenantId) {
      IN_MEMORY_CACHE.delete(tenantId);
      try {
        sessionStorage.removeItem(`workforce_entitlements_${tenantId}`);
      } catch {}
    } else {
      IN_MEMORY_CACHE.clear();
      try {
        const keys = Object.keys(sessionStorage);
        for (const k of keys) {
          if (k.startsWith('workforce_entitlements_')) {
            sessionStorage.removeItem(k);
          }
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('entitlements_invalidated', { detail: { tenantId } }));
    }
  },

  /**
   * Resolves a single feature flag with clear precedence hierarchy:
   * Level 3: Tenant-specific override (highest)
   * Level 2: Plan-level override
   * Level 1: Global default
   * Fallback: Fail-closed (false)
   */
  resolveFeatureFlag: (
    key: FeatureFlagKey,
    tenantOverrides: Partial<Record<FeatureFlagKey, boolean>> | undefined,
    planFlags: Record<FeatureFlagKey, boolean>,
    globalFlags: Record<FeatureFlagKey, boolean>
  ): FeatureResolution => {
    const now = new Date().toISOString();

    // 1. Check Level 3: Tenant-Specific Override
    if (tenantOverrides && typeof tenantOverrides[key] === 'boolean') {
      return {
        key,
        enabled: tenantOverrides[key] as boolean,
        source: 'TENANT_OVERRIDE',
        resolvedAt: now,
        reason: `Explicit override applied for this tenant (${tenantOverrides[key] ? 'ENABLED' : 'REVOKED'}).`,
      };
    }

    // 2. Check Level 2: Plan-Level Override
    if (planFlags && typeof planFlags[key] === 'boolean') {
      return {
        key,
        enabled: planFlags[key],
        source: 'PLAN_OVERRIDE',
        resolvedAt: now,
        reason: `Entitlement derived from tenant plan tier (${planFlags[key] ? 'INCLUDED' : 'NOT INCLUDED'}).`,
      };
    }

    // 3. Check Level 1: Global Default
    if (globalFlags && typeof globalFlags[key] === 'boolean') {
      return {
        key,
        enabled: globalFlags[key],
        source: 'GLOBAL_DEFAULT',
        resolvedAt: now,
        reason: `Fallback to platform-wide global default.`,
      };
    }

    // 4. Fail-closed safety fallback: never grant access on unresolvable state
    return {
      key,
      enabled: false,
      source: 'FAIL_CLOSED_FALLBACK',
      resolvedAt: now,
      reason: 'Failed to resolve flag configuration; fail-closed access denial applied.',
    };
  },

  /**
   * Full client-side cached resolution for a tenant with mid-cycle downgrade grace-period detection
   */
  getTenantEntitlements: async (
    tenantId: string, 
    fallbackPlan: SubscriptionTier = 'FREE',
    forceFresh = false
  ): Promise<CachedEntitlementPayload> => {
    // 1. Check In-Memory / Session Cache unless fresh fetch requested
    if (!forceFresh) {
      const memoryCached = IN_MEMORY_CACHE.get(tenantId);
      const nowMs = Date.now();
      if (memoryCached && (nowMs - memoryCached.timestamp < memoryCached.ttlMs)) {
        return memoryCached;
      }

      try {
        const sessionItem = sessionStorage.getItem(`workforce_entitlements_${tenantId}`);
        if (sessionItem) {
          const parsed: CachedEntitlementPayload = JSON.parse(sessionItem);
          if (nowMs - parsed.timestamp < parsed.ttlMs) {
            IN_MEMORY_CACHE.set(tenantId, parsed);
            return parsed;
          }
        }
      } catch {}
    }

    // 2. Fetch dependencies safely (fail-closed if critical error)
    try {
      // Demo tenant bypass for realistic testing in dev environment
      if (tenantId === 'demo-tenant-id' || tenantId.startsWith('demo-')) {
        const globalFlags = await entitlementService.getGlobalFeatureFlags();
        const planFlags = (await entitlementService.getPlanFeatureFlags()).ENTERPRISE;
        const resolutions: Record<FeatureFlagKey, FeatureResolution> = {} as any;
        for (const def of ALL_FEATURE_FLAGS) {
          resolutions[def.key] = {
            key: def.key,
            enabled: true,
            source: 'PLAN_OVERRIDE',
            resolvedAt: new Date().toISOString(),
            reason: 'Demo enterprise session entitlement.',
          };
        }
        const demoPayload: CachedEntitlementPayload = {
          tenantId,
          plan: 'ENTERPRISE',
          timestamp: Date.now(),
          ttlMs: DEFAULT_TTL_MS,
          resolutions,
          pendingDowngrade: null,
          isInGracePeriod: false,
        };
        IN_MEMORY_CACHE.set(tenantId, demoPayload);
        return demoPayload;
      }

      const tenantRef = doc(db, 'tenants', tenantId);
      const [tenantSnap, globalFlags, planMatrix] = await Promise.all([
        getDoc(tenantRef),
        entitlementService.getGlobalFeatureFlags(),
        entitlementService.getPlanFeatureFlags(),
      ]);

      let tenantPlan = fallbackPlan;
      let tenantOverrides: Partial<Record<FeatureFlagKey, boolean>> | undefined = undefined;
      let pendingDowngrade: PendingDowngrade | null = null;
      let isInGracePeriod = false;

      if (tenantSnap.exists()) {
        const tData = tenantSnap.data() as Partial<TenantProfile>;
        tenantPlan = tData.plan || fallbackPlan;
        tenantOverrides = tData.featureOverrides;

        // Check for mid-cycle downgrade
        if (tData.pendingDowngrade) {
          const now = new Date();
          const effectiveDate = new Date(tData.pendingDowngrade.effectiveDate);

          if (now < effectiveDate) {
            // Tenant is in Grace Period: retain existing higher tier features until cycle ends!
            isInGracePeriod = true;
            pendingDowngrade = tData.pendingDowngrade;
            tenantPlan = tData.pendingDowngrade.currentPlan || tenantPlan;
          } else {
            // Downgrade date has passed: execute permanent transition in DB
            tenantPlan = tData.pendingDowngrade.targetPlan;
            try {
              await updateDoc(tenantRef, {
                plan: tData.pendingDowngrade.targetPlan,
                pendingDowngrade: deleteField(),
                updatedAt: new Date().toISOString()
              });
            } catch (downgradeErr) {
              console.warn('Failed to clean up expired pending downgrade:', downgradeErr);
            }
          }
        }
      }

      const tierFlags = planMatrix[tenantPlan] || DEFAULT_PLAN_FEATURE_FLAGS[tenantPlan] || DEFAULT_PLAN_FEATURE_FLAGS.FREE;
      const resolutions: Record<FeatureFlagKey, FeatureResolution> = {} as any;

      for (const def of ALL_FEATURE_FLAGS) {
        resolutions[def.key] = entitlementService.resolveFeatureFlag(
          def.key,
          tenantOverrides,
          tierFlags,
          globalFlags
        );
      }

      const payload: CachedEntitlementPayload = {
        tenantId,
        plan: tenantPlan,
        timestamp: Date.now(),
        ttlMs: DEFAULT_TTL_MS,
        resolutions,
        pendingDowngrade,
        isInGracePeriod,
      };

      // Store in caches
      IN_MEMORY_CACHE.set(tenantId, payload);
      try {
        sessionStorage.setItem(`workforce_entitlements_${tenantId}`, JSON.stringify(payload));
      } catch {}

      return payload;
    } catch (err) {
      console.warn('Notice: offline fallback resolving tenant entitlements, applying fail-closed defaults:', err);
      // FAIL-CLOSED DEFAULT: Never grant access on network or parsing failure
      const failClosedResolutions: Record<FeatureFlagKey, FeatureResolution> = {} as any;
      const now = new Date().toISOString();
      for (const def of ALL_FEATURE_FLAGS) {
        failClosedResolutions[def.key] = {
          key: def.key,
          enabled: false,
          source: 'FAIL_CLOSED_FALLBACK',
          resolvedAt: now,
          reason: 'Entitlement service encountered an error; access strictly denied (fail-closed).',
        };
      }
      return {
        tenantId,
        plan: fallbackPlan,
        timestamp: Date.now(),
        ttlMs: 30000, // Short TTL on failure so recovery can happen quickly
        resolutions: failClosedResolutions,
        pendingDowngrade: null,
        isInGracePeriod: false,
      };
    }
  },

  /**
   * Programmatic API assertion: Throws EntitlementError if feature is not entitled
   * Gated features MUST call this before executing sensitive operations (e.g. Form 16, white-label update, kiosk register)
   */
  assertEntitlement: async (
    tenantId: string, 
    featureKey: FeatureFlagKey,
    callerRole?: string
  ): Promise<boolean> => {
    // Super Admins bypass gating for administrative testing
    if (callerRole === 'SUPER_ADMIN') {
      return true;
    }

    const entitlements = await entitlementService.getTenantEntitlements(tenantId);
    const resolution = entitlements.resolutions[featureKey];

    if (!resolution || !resolution.enabled) {
      // Log breach attempt to audit trail and security service
      await tenantSecurityService.logTenantAccess({
        tenantId,
        userId: 'system-gating',
        userEmail: 'system@workforce.internal',
        userRole: callerRole || 'SYSTEM_GATING',
        action: `GATED_FEATURE_ACCESS_DENIED:${featureKey}`,
        resource: `features/${featureKey}`,
        status: 'DENIED',
        details: {
          featureKey,
          resolutionSource: resolution?.source || 'FAIL_CLOSED_FALLBACK',
          tenantPlan: entitlements.plan,
        }
      });

      throw new EntitlementError(
        featureKey, 
        tenantId, 
        resolution || {
          key: featureKey,
          enabled: false,
          source: 'FAIL_CLOSED_FALLBACK',
          resolvedAt: new Date().toISOString()
        }
      );
    }

    return true;
  },

  /**
   * Sets or updates tenant-specific feature flag overrides (Level 3 in precedence)
   */
  updateTenantFeatureOverrides: async (
    tenantId: string,
    overrides: Partial<Record<FeatureFlagKey, boolean>>
  ): Promise<void> => {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
      featureOverrides: overrides,
      updatedAt: new Date().toISOString()
    });
    entitlementService.invalidateCache(tenantId);
  },

  /**
   * Schedules a mid-cycle downgrade with a guaranteed grace period until next billing cycle
   */
  scheduleDowngrade: async (
    tenantId: string,
    currentPlan: SubscriptionTier,
    targetPlan: SubscriptionTier,
    cycleEndDate: string,
    scheduledBy: string,
    reason?: string
  ): Promise<PendingDowngrade> => {
    const pending: PendingDowngrade = {
      targetPlan,
      currentPlan,
      scheduledAt: new Date().toISOString(),
      effectiveDate: cycleEndDate,
      scheduledBy,
      reason: reason || 'Scheduled plan tier change by administrator.',
    };

    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
      pendingDowngrade: pending,
      updatedAt: new Date().toISOString()
    });

    entitlementService.invalidateCache(tenantId);
    return pending;
  },

  /**
   * Cancels a scheduled mid-cycle downgrade
   */
  cancelDowngrade: async (tenantId: string): Promise<void> => {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
      pendingDowngrade: deleteField(),
      updatedAt: new Date().toISOString()
    });
    entitlementService.invalidateCache(tenantId);
  }
};
