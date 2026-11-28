// src/contexts/AuthContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  UserProfile,
  SubscriptionTier,
  PlanLimits,
  Role,
  CanonicalRole,
  DEFAULT_PLAN_CONFIG,
} from '../types/index';
import { dbService } from '../services/db';
import { tenantSecurityService } from '../services/tenantSecurityService';
import {
  BranchScope,
  clearMidSessionRoleOverride,
  getAvailableCanonicalRoles,
  getBranchScopeForUser,
  getMidSessionRoleOverride,
  normalizeRole,
  ROLE_PRIORITY,
  setMidSessionRoleOverride,
} from '../services/rbacService';

/**
 * Maximum window for catching mid-session role changes via forced token/claim refresh.
 * Real-time Firestore onSnapshot catches changes immediately (<1s), and this 5-minute
 * heartbeat guarantees token claim freshness even if a custom claim was changed server-side.
 */
export const ROLE_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVE_ROLE_STORAGE_PREFIX = 'workforce_active_role_v1_';

export interface RoleChangeEvent {
  type: 'DEMOTED' | 'UPDATED' | 'REVOKED';
  fromRole: CanonicalRole;
  toRole?: CanonicalRole;
  reason?: string;
  at: string;
}

export interface DemoLoginOptions {
  roles?: CanonicalRole[];
  branchId?: string;
  branchName?: string;
  companyName?: string;
  name?: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  activeRole: CanonicalRole;
  availableRoles: CanonicalRole[];
  branchScope: BranchScope;
  tenantPlan: SubscriptionTier;
  limits: PlanLimits | null;
  trialDaysLeft: number | null;
  loading: boolean;
  lastRoleSyncAt: string | null;
  roleChangeEvent: RoleChangeEvent | null;
  clearRoleChangeEvent: () => void;

  // Multi-Role Switcher
  switchActiveRole: (role: CanonicalRole) => boolean;

  // Mid-session Token & Role Refresh
  refreshSessionRole: (options?: { forceTokenRefresh?: boolean }) => Promise<{
    changed: boolean;
    forcedLogout: boolean;
    previousRole?: CanonicalRole;
    newRole?: CanonicalRole;
  }>;
  simulateMidSessionDemotion: (targetRole: CanonicalRole, branchId?: string, branchName?: string) => void;

  // Impersonation Methods
  isImpersonating: boolean;
  impersonateTenant: (tenantId: string, companyName: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
  loginDemo: (role?: Role, options?: DemoLoginOptions) => void;
  logout: () => Promise<void>;
  refreshTenantData: () => Promise<void>;
}

const DEFAULT_BRANCH_SCOPE: BranchScope = {
  isBranchScoped: false,
  allowedBranchIds: [],
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  activeRole: 'WORKER',
  availableRoles: ['WORKER'],
  branchScope: DEFAULT_BRANCH_SCOPE,
  tenantPlan: 'STARTER',
  limits: null,
  trialDaysLeft: null,
  loading: true,
  lastRoleSyncAt: null,
  roleChangeEvent: null,
  clearRoleChangeEvent: () => {},
  switchActiveRole: () => false,
  refreshSessionRole: async () => ({ changed: false, forcedLogout: false }),
  simulateMidSessionDemotion: () => {},
  isImpersonating: false,
  impersonateTenant: async () => {},
  stopImpersonating: async () => {},
  loginDemo: () => {},
  logout: async () => {},
  refreshTenantData: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function readSavedActiveRole(uid: string): CanonicalRole | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const val = window.sessionStorage.getItem(`${ACTIVE_ROLE_STORAGE_PREFIX}${uid}`);
    if (!val) return null;
    return normalizeRole(val);
  } catch {
    return null;
  }
}

function persistActiveRole(uid: string, role: CanonicalRole): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    window.sessionStorage.setItem(`${ACTIVE_ROLE_STORAGE_PREFIX}${uid}`, role);
  } catch {
    // Ignore storage errors
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const [availableRoles, setAvailableRoles] = useState<CanonicalRole[]>(['WORKER']);
  const [activeRole, setActiveRole] = useState<CanonicalRole>('WORKER');
  const [lastRoleSyncAt, setLastRoleSyncAt] = useState<string | null>(null);
  const [roleChangeEvent, setRoleChangeEvent] = useState<RoleChangeEvent | null>(null);

  const [tenantPlan, setTenantPlan] = useState<SubscriptionTier>('FREE');
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const activeRoleRef = useRef<CanonicalRole>(activeRole);
  const availableRolesRef = useRef<CanonicalRole[]>(availableRoles);
  const profileRef = useRef<UserProfile | null>(profile);
  const isImpersonatingRef = useRef<boolean>(isImpersonating);
  const lastSyncTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    activeRoleRef.current = activeRole;
  }, [activeRole]);

  useEffect(() => {
    availableRolesRef.current = availableRoles;
  }, [availableRoles]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    isImpersonatingRef.current = isImpersonating;
  }, [isImpersonating]);

  const clearRoleChangeEvent = useCallback(() => {
    setRoleChangeEvent(null);
  }, []);

  // Extracted tenant loading logic into a reusable function
  const loadTenantData = useCallback(async (tenantId: string) => {
    if (!tenantId || tenantId === 'demo-tenant-id') {
      setTenantPlan('ENTERPRISE');
      setLimits(DEFAULT_PLAN_CONFIG.ENTERPRISE);
      setTrialDaysLeft(14);
      return;
    }
    try {
      const tenantRef = doc(db, 'tenants', tenantId);
      const [tenantSnap, globalPlans] = await Promise.all([
        getDoc(tenantRef),
        dbService.getGlobalPlanConfig(),
      ]);

      if (tenantSnap.exists()) {
        const tenantData = tenantSnap.data();
        let currentPlan = (tenantData.plan as SubscriptionTier) || 'FREE';
        let daysLeft: number | null = null;

        if (currentPlan === 'TRIAL' && tenantData.trialEndsAt) {
          const endDate = new Date(tenantData.trialEndsAt);
          endDate.setHours(0, 0, 0, 0);

          const now = new Date();
          now.setHours(0, 0, 0, 0);

          const diffTime = endDate.getTime() - now.getTime();
          const calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          daysLeft = Math.min(calculatedDays, 7);

          if (daysLeft <= 0) {
            currentPlan = 'FREE';
            daysLeft = 0;
            try {
              await updateDoc(tenantRef, { plan: 'FREE' });
            } catch (error) {
              console.error('Failed to auto-downgrade plan in DB:', error);
            }
          }
        }

        setTenantPlan(currentPlan);
        const baseLimits = globalPlans?.[currentPlan] || {};
        const overrides = tenantData.overrides || {};
        setLimits({ ...baseLimits, ...overrides } as PlanLimits);
        setTrialDaysLeft(daysLeft);
      }
    } catch (error) {
      console.warn('Notice: Unable to fetch remote tenant data, running offline:', error);
    }
  }, []);

  const refreshTenantData = useCallback(async () => {
    if (profileRef.current?.tenantId) {
      await loadTenantData(profileRef.current.tenantId);
    }
  }, [loadTenantData]);

  const logout = useCallback(async () => {
    localStorage.removeItem('workforce_demo_session');
    if (profileRef.current?.uid) {
      try {
        window.sessionStorage.removeItem(`${ACTIVE_ROLE_STORAGE_PREFIX}${profileRef.current.uid}`);
      } catch {
        // Ignore
      }
    }
    try {
      await auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    setUser(null);
    setProfile(null);
    setOriginalProfile(null);
    setIsImpersonating(false);
    setAvailableRoles(['WORKER']);
    setActiveRole('WORKER');
    setTenantPlan('FREE');
    setLimits(null);
    setTrialDaysLeft(null);
  }, []);

  /**
   * Applies resolved profile + token claims into Auth state and detects mid-session
   * role changes (demotion, revocation, or permission update).
   */
  const applyResolvedProfile = useCallback(
    async (
      nextProfile: UserProfile,
      tokenClaims?: Record<string, any> | null,
      options?: { isInitialLoad?: boolean }
    ): Promise<{
      changed: boolean;
      forcedLogout: boolean;
      previousRole?: CanonicalRole;
      newRole?: CanonicalRole;
    }> => {
      const nowIso = new Date().toISOString();
      setLastRoleSyncAt(nowIso);
      lastSyncTimestampRef.current = Date.now();

      // Check account deactivation / revocation
      if (nextProfile.isActive === false) {
        const prevRole = activeRoleRef.current;
        setRoleChangeEvent({
          type: 'REVOKED',
          fromRole: prevRole,
          reason: 'Your account access was revoked by an administrator.',
          at: nowIso,
        });
        await logout();
        return { changed: true, forcedLogout: true, previousRole: prevRole };
      }

      const nextAvailable = getAvailableCanonicalRoles(nextProfile, tokenClaims);
      const prevRole = activeRoleRef.current;
      const prevAvailable = availableRolesRef.current;
      const primaryCanonical = normalizeRole(nextProfile.activeRole || nextProfile.role);

      let nextActive: CanonicalRole;
      if (options?.isInitialLoad) {
        const saved = readSavedActiveRole(nextProfile.uid);
        if (saved && nextAvailable.includes(saved)) {
          nextActive = saved;
        } else if (nextAvailable.includes(primaryCanonical)) {
          nextActive = primaryCanonical;
        } else {
          nextActive = nextAvailable[0];
        }
      } else {
        // Mid-session sync: preserve activeRole ONLY if it is still granted!
        if (nextAvailable.includes(prevRole)) {
          nextActive = prevRole;
        } else {
          nextActive = nextAvailable.includes(primaryCanonical)
            ? primaryCanonical
            : nextAvailable[0];
        }
      }

      const hydratedProfile: UserProfile = {
        ...nextProfile,
        role: nextActive,
        roles: nextAvailable,
        activeRole: nextActive,
      };

      const rolesChanged =
        !options?.isInitialLoad &&
        (prevRole !== nextActive ||
          prevAvailable.length !== nextAvailable.length ||
          prevAvailable.some((r, idx) => r !== nextAvailable[idx]));

      setOriginalProfile(hydratedProfile);
      if (!isImpersonatingRef.current) {
        setProfile(hydratedProfile);
        setAvailableRoles(nextAvailable);
        setActiveRole(nextActive);
        persistActiveRole(hydratedProfile.uid, nextActive);
      }

      // If in demo session, keep localStorage synchronized
      const savedDemo = localStorage.getItem('workforce_demo_session');
      if (savedDemo && hydratedProfile.uid.startsWith('demo-')) {
        try {
          const parsed = JSON.parse(savedDemo);
          localStorage.setItem(
            'workforce_demo_session',
            JSON.stringify({ ...parsed, profile: hydratedProfile })
          );
        } catch {
          // Ignore
        }
      }

      if (rolesChanged) {
        const isDemotion = ROLE_PRIORITY[nextActive] < ROLE_PRIORITY[prevRole];
        const eventType = isDemotion ? 'DEMOTED' : 'UPDATED';
        setRoleChangeEvent({
          type: eventType,
          fromRole: prevRole,
          toRole: nextActive,
          reason: isDemotion
            ? `Your role was changed from ${prevRole} to ${nextActive}. Session token and permissions have been refreshed.`
            : `Your workspace roles were updated to ${nextAvailable.join(', ')}.`,
          at: nowIso,
        });

        // Log audit entry for compliance trace
        tenantSecurityService
          .logTenantAccess({
            tenantId: hydratedProfile.tenantId || 'system',
            userId: hydratedProfile.uid,
            userEmail: hydratedProfile.email || 'unknown',
            userRole: nextActive,
            action: isDemotion ? 'MID_SESSION_ROLE_DEMOTION_SYNC' : 'MID_SESSION_ROLE_UPDATE_SYNC',
            resource: `users/${hydratedProfile.uid}`,
            status: 'SUCCESS',
            details: { previousRole: prevRole, newRole: nextActive, availableRoles: nextAvailable },
          })
          .catch(() => {});

        return {
          changed: true,
          forcedLogout: false,
          previousRole: prevRole,
          newRole: nextActive,
        };
      }

      return { changed: false, forcedLogout: false, previousRole: prevRole, newRole: nextActive };
    },
    [logout]
  );

  /**
   * Forces a token claim + Firestore user document check (called every 5 minutes,
   * on window focus, and manually when needed).
   */
  const refreshSessionRole = useCallback(
    async (options?: { forceTokenRefresh?: boolean }) => {
      const currentProfile = profileRef.current;
      if (!currentProfile) {
        return { changed: false, forcedLogout: false };
      }

      // 1. Demo / sandbox session check (supports cross-tab Super Admin demotion simulation)
      if (currentProfile.uid.startsWith('demo-')) {
        const override = getMidSessionRoleOverride(currentProfile.uid);
        if (override) {
          const updatedProfile: UserProfile = {
            ...currentProfile,
            role: override.role,
            roles: override.roles || [override.role],
            activeRole: override.role,
            branchId: override.branchId ?? currentProfile.branchId,
            branchName: override.branchName ?? currentProfile.branchName,
            isActive: override.isActive ?? true,
            roleVersion: override.roleVersion,
            roleUpdatedAt: override.updatedAt,
          };
          return applyResolvedProfile(updatedProfile, null, { isInitialLoad: false });
        }
        setLastRoleSyncAt(new Date().toISOString());
        lastSyncTimestampRef.current = Date.now();
        return { changed: false, forcedLogout: false };
      }

      // 2. Real Firebase Auth user: force ID token refresh to pull updated custom claims + re-read Firestore
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        return { changed: false, forcedLogout: false };
      }

      try {
        const forceRefresh = options?.forceTokenRefresh !== false;
        const tokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
        const docSnap = await getDoc(doc(db, 'users', firebaseUser.uid));

        if (!docSnap.exists()) {
          // User document deleted mid-session -> force logout
          const prevRole = activeRoleRef.current;
          setRoleChangeEvent({
            type: 'REVOKED',
            fromRole: prevRole,
            reason: 'User profile was removed. Signed out for security.',
            at: new Date().toISOString(),
          });
          await logout();
          return { changed: true, forcedLogout: true, previousRole: prevRole };
        }

        const remoteData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          ...(docSnap.data() as Partial<UserProfile>),
        } as UserProfile;

        return await applyResolvedProfile(remoteData, tokenResult.claims, {
          isInitialLoad: false,
        });
      } catch (err) {
        console.warn('Notice during periodic role sync:', err);
        return { changed: false, forcedLogout: false };
      }
    },
    [applyResolvedProfile, logout]
  );

  /**
   * Switches active role for users with multiple assigned roles (e.g. TENANT_ADMIN + RESELLER).
   * Strictly rejects switching to any role not present in the user's authorized availableRoles.
   */
  const switchActiveRole = useCallback((targetRole: CanonicalRole): boolean => {
    const normalized = normalizeRole(targetRole);
    if (!availableRolesRef.current.includes(normalized)) {
      console.warn(`Blocked unauthorized role switch attempt to ${normalized}`);
      return false;
    }

    const current = profileRef.current;
    if (!current) return false;

    setActiveRole(normalized);
    persistActiveRole(current.uid, normalized);

    const updatedProfile: UserProfile = {
      ...current,
      role: normalized,
      activeRole: normalized,
    };
    setProfile(updatedProfile);

    // Sync demo localStorage if in demo mode
    const savedDemo = localStorage.getItem('workforce_demo_session');
    if (savedDemo && current.uid.startsWith('demo-')) {
      try {
        const parsed = JSON.parse(savedDemo);
        localStorage.setItem(
          'workforce_demo_session',
          JSON.stringify({ ...parsed, profile: updatedProfile })
        );
      } catch {
        // Ignore
      }
    }

    return true;
  }, []);

  /**
   * Allows testing or triggering a live mid-session demotion (e.g. Super Admin demoting
   * a TENANT_ADMIN to MANAGER while logged in).
   */
  const simulateMidSessionDemotion = useCallback(
    (targetRole: CanonicalRole, branchId = 'default', branchName = 'Main Branch (Head Office)') => {
      const current = profileRef.current;
      if (!current) return;
      const override = {
        uid: current.uid,
        role: targetRole,
        roles: [targetRole],
        branchId: targetRole === 'MANAGER' ? branchId : undefined,
        branchName: targetRole === 'MANAGER' ? branchName : undefined,
        isActive: true,
        roleVersion: (current.roleVersion || 1) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'superadmin@workforce.demo',
      };
      setMidSessionRoleOverride(override);
      void refreshSessionRole({ forceTokenRefresh: true });
    },
    [refreshSessionRole]
  );

  const loginDemo = useCallback(
    (role: Role = 'TENANT_ADMIN', options?: DemoLoginOptions) => {
      const canonical = normalizeRole(role);
      const rolesList: CanonicalRole[] =
        options?.roles && options.roles.length > 0
          ? Array.from(new Set(options.roles.map((r) => normalizeRole(r))))
          : [canonical];

      const isMultiRole = rolesList.length > 1;
      const demoUid = isMultiRole
        ? 'demo-multirole-uid'
        : canonical === 'SUPER_ADMIN'
        ? 'demo-superadmin-uid'
        : canonical === 'RESELLER'
        ? 'demo-reseller-uid'
        : canonical === 'FINANCE'
        ? 'demo-finance-uid'
        : canonical === 'MANAGER'
        ? 'demo-manager-uid'
        : canonical === 'WORKER'
        ? 'demo-worker-uid'
        : 'demo-owner-uid';

      // Clear any stale mid-session demotion override for a clean demo login
      clearMidSessionRoleOverride(demoUid);

      const demoEmail =
        options?.email ||
        (isMultiRole
          ? 'ca.owner@apexpartners.demo'
          : canonical === 'SUPER_ADMIN'
          ? 'superadmin@workforce.demo'
          : canonical === 'RESELLER'
          ? 'partner@agency.demo'
          : canonical === 'FINANCE'
          ? 'finance@factory.demo'
          : canonical === 'MANAGER'
          ? 'manager.main@factory.demo'
          : canonical === 'WORKER'
          ? 'ramesh.sharma@factory.demo'
          : 'admin@factory.demo');

      const demoName =
        options?.name ||
        (isMultiRole
          ? 'CA Meera Shah (Owner & Partner)'
          : canonical === 'SUPER_ADMIN'
          ? 'Super Admin'
          : canonical === 'RESELLER'
          ? 'Apex Industrial Partners'
          : canonical === 'FINANCE'
          ? 'Ananya Mehta (Finance Admin)'
          : canonical === 'MANAGER'
          ? 'Vikram Joshi (Branch Manager)'
          : canonical === 'WORKER'
          ? 'Ramesh Sharma'
          : 'Rajesh Patel (Tenant Admin)');

      const demoCompany =
        options?.companyName ||
        (canonical === 'SUPER_ADMIN'
          ? 'WorkForce Pro Global'
          : canonical === 'RESELLER' && !isMultiRole
          ? 'Apex Industrial Partners'
          : 'Apex Engineering Ltd.');

      const assignedBranchId =
        options?.branchId || (canonical === 'MANAGER' ? 'default' : undefined);
      const assignedBranchName =
        options?.branchName ||
        (assignedBranchId === 'branch-anand'
          ? 'Anand Manufacturing Unit'
          : assignedBranchId === 'default'
          ? 'Main Branch (Head Office)'
          : undefined);

      const demoUser = {
        uid: demoUid,
        email: demoEmail,
        displayName: demoName,
      } as unknown as User;

      const demoProfile: UserProfile = {
        uid: demoUid,
        email: demoEmail,
        name: demoName,
        role: canonical,
        roles: rolesList,
        activeRole: canonical,
        tenantId: 'demo-tenant-id',
        companyName: demoCompany,
        commissionRate: rolesList.includes('RESELLER') ? 150 : undefined,
        branchId: assignedBranchId,
        assignedBranchIds: assignedBranchId ? [assignedBranchId] : undefined,
        branchName: assignedBranchName,
        workerId: canonical === 'WORKER' ? 'worker-1' : undefined,
        isActive: true,
        roleVersion: 1,
        roleUpdatedAt: new Date().toISOString(),
      };

      localStorage.setItem(
        'workforce_demo_session',
        JSON.stringify({ user: demoUser, profile: demoProfile })
      );
      persistActiveRole(demoUid, canonical);

      setUser(demoUser);
      setProfile(demoProfile);
      setOriginalProfile(demoProfile);
      setAvailableRoles(rolesList);
      setActiveRole(canonical);
      setIsImpersonating(false);
      setTenantPlan('ENTERPRISE');
      setLimits(DEFAULT_PLAN_CONFIG.ENTERPRISE);
      setTrialDaysLeft(14);
      setLastRoleSyncAt(new Date().toISOString());
      setRoleChangeEvent(null);
      setLoading(false);
    },
    []
  );

  // Initial auth & demo hydration + Firebase Auth state listener + real-time Firestore role watcher
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    // 1. Check for existing demo session first
    const savedDemo = localStorage.getItem('workforce_demo_session');
    if (savedDemo) {
      try {
        const parsed = JSON.parse(savedDemo);
        if (parsed?.user && parsed?.profile) {
          const restoredProfile = parsed.profile as UserProfile;
          const override = getMidSessionRoleOverride(restoredProfile.uid);
          const effectiveProfile: UserProfile = override
            ? {
                ...restoredProfile,
                role: override.role,
                roles: override.roles || [override.role],
                activeRole: override.role,
                branchId: override.branchId ?? restoredProfile.branchId,
                branchName: override.branchName ?? restoredProfile.branchName,
                isActive: override.isActive ?? true,
              }
            : restoredProfile;

          const resolvedRoles = getAvailableCanonicalRoles(effectiveProfile, null);
          const savedActive = readSavedActiveRole(effectiveProfile.uid);
          const initialActive =
            savedActive && resolvedRoles.includes(savedActive)
              ? savedActive
              : normalizeRole(effectiveProfile.activeRole || effectiveProfile.role);

          setUser(parsed.user);
          setProfile({ ...effectiveProfile, role: initialActive, roles: resolvedRoles, activeRole: initialActive });
          setOriginalProfile({ ...effectiveProfile, role: initialActive, roles: resolvedRoles, activeRole: initialActive });
          setAvailableRoles(resolvedRoles);
          setActiveRole(initialActive);
          setTenantPlan('ENTERPRISE');
          setLimits(DEFAULT_PLAN_CONFIG.ENTERPRISE);
          setTrialDaysLeft(14);
          setLastRoleSyncAt(new Date().toISOString());
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to parse saved demo session', e);
      }
    }

    // 2. Firebase Auth state listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          localStorage.removeItem('workforce_demo_session');

          // Fetch role from Auth token claims + Firestore user profile
          const [tokenResult, docSnap] = await Promise.all([
            firebaseUser.getIdTokenResult().catch(() => null),
            getDoc(doc(db, 'users', firebaseUser.uid)),
          ]);

          if (docSnap.exists()) {
            const userData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              ...(docSnap.data() as Partial<UserProfile>),
            } as UserProfile;

            await applyResolvedProfile(userData, tokenResult?.claims || null, {
              isInitialLoad: true,
            });

            if (userData.tenantId) {
              await loadTenantData(userData.tenantId);
            }
          } else if (tokenResult?.claims?.role) {
            const fallbackProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || undefined,
              role: normalizeRole(String(tokenResult.claims.role)),
              tenantId: String(tokenResult.claims.tenantId || ''),
            };
            await applyResolvedProfile(fallbackProfile, tokenResult.claims, {
              isInitialLoad: true,
            });
          }

          // Real-time Firestore listener for immediate mid-session role change detection
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let isFirstSnapshot = true;
          unsubscribeUserDoc = onSnapshot(
            userDocRef,
            async (snap) => {
              if (isFirstSnapshot) {
                isFirstSnapshot = false;
                return;
              }
              if (!snap.exists()) {
                await refreshSessionRole({ forceTokenRefresh: true });
                return;
              }
              const updatedData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                ...(snap.data() as Partial<UserProfile>),
              } as UserProfile;

              // Force Firebase ID token refresh whenever user role doc changes
              let freshClaims: Record<string, any> | null = null;
              try {
                const refreshed = await firebaseUser.getIdTokenResult(true);
                freshClaims = refreshed.claims;
              } catch {
                // Continue with Firestore source of truth if offline
              }

              await applyResolvedProfile(updatedData, freshClaims, { isInitialLoad: false });
            },
            (err) => {
              console.warn('User role snapshot listener offline notice:', err);
            }
          );
        } else {
          if (!localStorage.getItem('workforce_demo_session')) {
            setUser(null);
            setProfile(null);
            setOriginalProfile(null);
            setAvailableRoles(['WORKER']);
            setActiveRole('WORKER');
            setTenantPlan('FREE');
            setLimits(null);
            setTrialDaysLeft(null);
          }
        }
      } catch (error) {
        console.warn('Notice in auth state resolution (running offline):', error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, [applyResolvedProfile, loadTenantData, refreshSessionRole]);

  // 5-minute periodic token & role heartbeat + visibility/cross-tab listener
  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      void refreshSessionRole({ forceTokenRefresh: true });
    }, ROLE_SYNC_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastSyncTimestampRef.current;
        if (elapsed >= 60_000) {
          void refreshSessionRole({ forceTokenRefresh: true });
        }
      }
    };

    const handleCrossTabRoleUpdate = (e: StorageEvent) => {
      if (e.key === 'workforce_mid_session_role_overrides_v1') {
        void refreshSessionRole({ forceTokenRefresh: true });
      }
    };

    const handleCustomRoleEvent = () => {
      void refreshSessionRole({ forceTokenRefresh: true });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleCrossTabRoleUpdate);
    window.addEventListener('workforce:role-override-changed', handleCustomRoleEvent);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleCrossTabRoleUpdate);
      window.removeEventListener('workforce:role-override-changed', handleCustomRoleEvent);
    };
  }, [user, refreshSessionRole]);

  // Temporarily scope local state to view exactly what the tenant sees
  const impersonateTenant = useCallback(
    async (tenantId: string, companyName: string) => {
      if (!originalProfile) return;

      // Server-enforced scope boundary: Validate that caller possesses claim or reseller portfolio authority
      await tenantSecurityService.resolveAuthorizedTenantScope(originalProfile, tenantId);

      setIsImpersonating(true);
      setActiveRole('TENANT_ADMIN');
      setProfile({
        ...originalProfile,
        role: 'TENANT_ADMIN',
        activeRole: 'TENANT_ADMIN',
        tenantId,
        companyName,
      });
      await loadTenantData(tenantId);
    },
    [originalProfile, loadTenantData]
  );

  // Restore original state
  const stopImpersonating = useCallback(async () => {
    setIsImpersonating(false);
    setProfile(originalProfile);
    if (originalProfile) {
      const restoredRoles = getAvailableCanonicalRoles(originalProfile, null);
      const restoredActive = normalizeRole(originalProfile.activeRole || originalProfile.role);
      setAvailableRoles(restoredRoles);
      setActiveRole(restoredRoles.includes(restoredActive) ? restoredActive : restoredRoles[0]);
    }
    if (originalProfile?.tenantId) {
      await loadTenantData(originalProfile.tenantId);
    } else {
      setTenantPlan('FREE');
      setLimits(null);
      setTrialDaysLeft(null);
    }
  }, [originalProfile, loadTenantData]);

  const branchScope = getBranchScopeForUser(profile, activeRole);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        activeRole,
        availableRoles,
        branchScope,
        tenantPlan,
        limits,
        trialDaysLeft,
        loading,
        lastRoleSyncAt,
        roleChangeEvent,
        clearRoleChangeEvent,
        switchActiveRole,
        refreshSessionRole,
        simulateMidSessionDemotion,
        isImpersonating,
        impersonateTenant,
        stopImpersonating,
        loginDemo,
        logout,
        refreshTenantData,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};