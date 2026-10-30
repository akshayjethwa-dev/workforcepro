// src/services/tenantSecurityService.ts
import { UserProfile } from '../types/index';

export class TenantSecurityError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode = 403, details?: any) {
    super(message);
    this.name = 'TenantSecurityError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface SecurityAlert {
  id: string;
  type: 'UNAUTHORIZED_RESELLER_PROBE' | 'CROSS_TENANT_ACCESS_ATTEMPT' | 'SOFT_DELETE_TAMPER' | 'PARAM_SPOOF_BLOCKED';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  message: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  targetTenantId: string;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED' | 'DISMISSED';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface TenantAuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  details?: any;
  timestamp: string;
}

export interface SoftDeletedTenant {
  tenantId: string;
  companyName: string;
  deletedAt: string;
  expiresAt: string;
  deletedBy: string;
  deletedByEmail: string;
  recoveryDaysRemaining: number;
}

// Local storage keys for state persistence
const AUDIT_LOGS_KEY = 'workforce_audit_logs';
const SECURITY_ALERTS_KEY = 'workforce_security_alerts';
const SOFT_DELETED_KEY = 'workforce_soft_deleted_tenants';

// Initial baseline seed logs for instant visibility in demo & production
const INITIAL_AUDIT_LOGS: TenantAuditLogEntry[] = [
  {
    id: 'audit-seed-1',
    tenantId: 'demo-tenant-1',
    userId: 'user-rajesh-1',
    userEmail: 'rajesh@apexeng.in',
    userRole: 'FACTORY_OWNER',
    action: 'QUERY_WORKERS',
    resource: 'workers',
    status: 'SUCCESS',
    details: { filter: { tenantId: 'demo-tenant-1', deletedAt: null }, recordCount: 5 },
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  {
    id: 'audit-seed-2',
    tenantId: 'demo-tenant-1',
    userId: 'user-rajesh-1',
    userEmail: 'rajesh@apexeng.in',
    userRole: 'FACTORY_OWNER',
    action: 'RECORD_ATTENDANCE',
    resource: 'attendance',
    status: 'SUCCESS',
    details: { workerId: 'worker-1', punchType: 'IN', verifiedBy: 'KIOSK_AI' },
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'audit-seed-3',
    tenantId: 'demo-tenant-3',
    userId: 'demo-reseller-uid',
    userEmail: 'partner@agency.demo',
    userRole: 'RESELLER',
    action: 'PROBE_UNAUTHORIZED_CLIENT',
    resource: 'tenants/demo-tenant-3',
    status: 'DENIED',
    details: { reason: 'Tenant not in assigned reseller portfolio' },
    timestamp: new Date(Date.now() - 1800000).toISOString()
  }
];

const INITIAL_ALERTS: SecurityAlert[] = [
  {
    id: 'alert-seed-1',
    type: 'UNAUTHORIZED_RESELLER_PROBE',
    severity: 'HIGH',
    message: "Reseller partner@agency.demo probed client 'demo-tenant-3' outside their assigned portfolio boundary.",
    actorId: 'demo-reseller-uid',
    actorEmail: 'partner@agency.demo',
    actorRole: 'RESELLER',
    targetTenantId: 'demo-tenant-3',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    status: 'ACTIVE'
  }
];

// Helper for local storage access
const loadStoredList = <T>(key: string, fallback: T[]): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to parse ${key}`, e);
  }
  return fallback;
};

const saveStoredList = <T>(key: string, list: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {
    console.warn(`Failed to save ${key}`, e);
  }
};

// Reseller portfolio assignments
const resellerPortfolioMap = new Map<string, Set<string>>([
  ['demo-reseller-uid', new Set(['demo-tenant-1', 'demo-tenant-2', 'reseller-holding-tenant'])],
  ['reseller-partner-1', new Set(['demo-tenant-1', 'demo-tenant-2', 'reseller-holding-tenant'])]
]);

export const tenantSecurityService = {
  /**
   * Reseller portfolio assignment management
   */
  registerResellerPortfolio: (resellerUid: string, tenantIds: string[]) => {
    resellerPortfolioMap.set(resellerUid, new Set(tenantIds));
  },

  isTenantInResellerPortfolio: (resellerUid: string, tenantId: string): boolean => {
    const portfolio = resellerPortfolioMap.get(resellerUid) || new Set(['demo-tenant-1', 'demo-tenant-2']);
    return portfolio.has(tenantId);
  },

  /**
   * Resolves the authorized tenant scope for a user request.
   * Throws TenantSecurityError (403) if cross-tenant violation occurs.
   * Logs violation & creates security alert if unauthorized.
   */
  resolveAuthorizedTenantScope: async (
    profile: UserProfile,
    requestedTenantId?: string
  ): Promise<{ tenantId: string; isSuperAdmin: boolean }> => {
    const targetTenantId = requestedTenantId || profile.tenantId || '';

    // Check soft delete status
    if (targetTenantId && (await tenantSecurityService.isTenantSoftDeleted(targetTenantId))) {
      // Only Super Admin can query a soft-deleted tenant (to inspect or restore)
      if (profile.role !== 'SUPER_ADMIN') {
        await tenantSecurityService.logTenantAccess({
          tenantId: targetTenantId,
          userId: profile.uid,
          userEmail: profile.email || 'unknown',
          userRole: profile.role,
          action: 'ACCESS_SOFT_DELETED_TENANT',
          resource: 'tenants/' + targetTenantId,
          status: 'DENIED',
          details: { error: 'Tenant is soft-deleted with active 90-day recovery window' }
        });
        throw new TenantSecurityError(
          `Tenant '${targetTenantId}' is currently deactivated or in soft-deleted state. Contact Super Admin for 90-day restoration.`,
          403
        );
      }
    }

    // 1. Super Admin: full visibility
    if (profile.role === 'SUPER_ADMIN') {
      return {
        tenantId: targetTenantId || profile.tenantId || 'system-root',
        isSuperAdmin: true
      };
    }

    // 2. Reseller: strictly restricted to assigned client portfolio
    if (profile.role === 'RESELLER') {
      if (requestedTenantId && requestedTenantId !== profile.tenantId) {
        const isAuthorized = tenantSecurityService.isTenantInResellerPortfolio(profile.uid, requestedTenantId);
        if (!isAuthorized) {
          // Log security violation
          await tenantSecurityService.logTenantAccess({
            tenantId: requestedTenantId,
            userId: profile.uid,
            userEmail: profile.email || 'unknown',
            userRole: profile.role,
            action: 'RESELLER_CROSS_PORTFOLIO_PROBE',
            resource: 'tenants/' + requestedTenantId,
            status: 'DENIED',
            details: { attemptedTenantId: requestedTenantId, portfolio: Array.from(resellerPortfolioMap.get(profile.uid) || []) }
          });

          // Dispatch critical alert to Super Admin
          await tenantSecurityService.triggerSecurityAlert({
            type: 'UNAUTHORIZED_RESELLER_PROBE',
            severity: 'HIGH',
            message: `Reseller '${profile.email || profile.uid}' attempted unauthorized access to unassigned tenant '${requestedTenantId}'. Access blocked with 403.`,
            actorId: profile.uid,
            actorEmail: profile.email || 'unknown',
            actorRole: profile.role,
            targetTenantId: requestedTenantId
          });

          throw new TenantSecurityError(
            `Access Denied (403): Reseller is strictly restricted to assigned partner client portfolio. Tenant '${requestedTenantId}' is not authorized.`,
            403
          );
        }
      }
      return {
        tenantId: targetTenantId || profile.tenantId,
        isSuperAdmin: false
      };
    }

    // 3. Regular Tenant Users (e.g. FACTORY_OWNER, SUPERVISOR, KIOSK)
    // Server-enforce: The caller's authenticated claim MUST match the target. Client-supplied parameters are untrusted.
    if (requestedTenantId && requestedTenantId !== profile.tenantId) {
      await tenantSecurityService.logTenantAccess({
        tenantId: requestedTenantId,
        userId: profile.uid,
        userEmail: profile.email || 'unknown',
        userRole: profile.role,
        action: 'CROSS_TENANT_TAMPER_ATTEMPT',
        resource: 'tenants/' + requestedTenantId,
        status: 'DENIED',
        details: { claimTenantId: profile.tenantId, attemptedTenantId: requestedTenantId }
      });

      await tenantSecurityService.triggerSecurityAlert({
        type: 'CROSS_TENANT_ACCESS_ATTEMPT',
        severity: 'CRITICAL',
        message: `Security Tampering: User '${profile.email || profile.uid}' (tenant '${profile.tenantId}') attempted to read/write records of tenant '${requestedTenantId}'.`,
        actorId: profile.uid,
        actorEmail: profile.email || 'unknown',
        actorRole: profile.role,
        targetTenantId: requestedTenantId
      });

      throw new TenantSecurityError(
        `Cross-Tenant Violation (403): Access blocked by server security boundary. Authenticated claim '${profile.tenantId}' cannot query tenant '${requestedTenantId}'.`,
        403
      );
    }

    return {
      tenantId: profile.tenantId,
      isSuperAdmin: false
    };
  },

  /**
   * Enforces and logs an access or mutation for db operations
   */
  enforceTenantAccess: async (
    profile: UserProfile | null | undefined,
    tenantId: string,
    action: string,
    resource: string,
    details?: any
  ): Promise<string> => {
    if (!profile) {
      // In kiosk pairing or anonymous token verification, permit if tenant exists and not deleted
      if (await tenantSecurityService.isTenantSoftDeleted(tenantId)) {
        throw new TenantSecurityError("Tenant is deleted", 403);
      }
      return tenantId;
    }

    const scope = await tenantSecurityService.resolveAuthorizedTenantScope(profile, tenantId);

    // Record audit trail
    await tenantSecurityService.logTenantAccess({
      tenantId: scope.tenantId,
      userId: profile.uid,
      userEmail: profile.email || 'unknown',
      userRole: profile.role,
      action,
      resource,
      status: 'SUCCESS',
      details
    });

    return scope.tenantId;
  },

  // ==========================================
  // SOFT-DELETE 90-DAY LIFECYCLE
  // ==========================================

  /**
   * Soft deletes a tenant with a 90-day recovery window.
   */
  softDeleteTenant: async (
    tenantId: string,
    companyNameOrActor: string | UserProfile,
    actorParam?: UserProfile
  ): Promise<void> => {
    let actor: UserProfile;
    let companyName = 'Tenant Organization';

    if (typeof companyNameOrActor === 'string') {
      companyName = companyNameOrActor;
      actor = actorParam!;
    } else {
      actor = companyNameOrActor;
      companyName = actor.companyName || 'Tenant Organization';
    }

    if (actor?.role !== 'SUPER_ADMIN') {
      throw new TenantSecurityError("Unauthorized: Only Super Admins can soft-delete tenants.", 403);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const record: SoftDeletedTenant = {
      tenantId,
      companyName,
      deletedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      deletedBy: actor.uid,
      deletedByEmail: actor.email || 'superadmin@workforce.pro',
      recoveryDaysRemaining: 90
    };

    const current = loadStoredList<SoftDeletedTenant>(SOFT_DELETED_KEY, []);
    const updated = [record, ...current.filter(t => t.tenantId !== tenantId)];
    saveStoredList(SOFT_DELETED_KEY, updated);

    await tenantSecurityService.logTenantAccess({
      tenantId,
      userId: actor.uid,
      userEmail: actor.email || 'superadmin',
      userRole: actor.role,
      action: 'TENANT_SOFT_DELETED',
      resource: 'tenants/' + tenantId,
      status: 'SUCCESS',
      details: { recoveryWindowDays: 90, expiresAt: expiresAt.toISOString() }
    });
  },

  /**
   * Checks if a tenant is soft deleted and still in recovery window
   */
  isTenantSoftDeleted: async (tenantId: string): Promise<boolean> => {
    const current = loadStoredList<SoftDeletedTenant>(SOFT_DELETED_KEY, []);
    const record = current.find(t => t.tenantId === tenantId);
    if (!record) return false;

    // Check if recovery window has expired
    const now = Date.now();
    const expiry = new Date(record.expiresAt).getTime();
    return now <= expiry;
  },

  /**
   * Restores a soft-deleted tenant within the 90-day recovery window.
   */
  restoreSoftDeletedTenant: async (tenantId: string, actor: UserProfile): Promise<void> => {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new TenantSecurityError("Unauthorized: Only Super Admins can restore soft-deleted tenants.", 403);
    }

    const current = loadStoredList<SoftDeletedTenant>(SOFT_DELETED_KEY, []);
    const updated = current.filter(t => t.tenantId !== tenantId);
    saveStoredList(SOFT_DELETED_KEY, updated);

    await tenantSecurityService.logTenantAccess({
      tenantId,
      userId: actor.uid,
      userEmail: actor.email || 'superadmin',
      userRole: actor.role,
      action: 'TENANT_RESTORED',
      resource: 'tenants/' + tenantId,
      status: 'SUCCESS',
      details: { restoredBy: actor.uid }
    });
  },

  /**
   * Returns all soft-deleted tenants with calculated days remaining
   */
  getSoftDeletedTenants: async (): Promise<SoftDeletedTenant[]> => {
    const list = loadStoredList<SoftDeletedTenant>(SOFT_DELETED_KEY, []);
    const now = Date.now();

    return list.map(item => {
      const exp = new Date(item.expiresAt).getTime();
      const diffMs = exp - now;
      const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      return {
        ...item,
        recoveryDaysRemaining: days
      };
    });
  },

  // ==========================================
  // AUDIT TRAIL
  // ==========================================

  /**
   * Logs an access or mutation into the append-only audit trail
   */
  logTenantAccess: async (entry: Omit<TenantAuditLogEntry, 'id' | 'timestamp'>): Promise<string> => {
    const id = 'audit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const logItem: TenantAuditLogEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString()
    };

    const current = loadStoredList<TenantAuditLogEntry>(AUDIT_LOGS_KEY, INITIAL_AUDIT_LOGS);
    saveStoredList(AUDIT_LOGS_KEY, [logItem, ...current]);
    return id;
  },

  /**
   * Returns audit logs for a specific tenant
   */
  getAuditLogs: async (tenantId: string): Promise<TenantAuditLogEntry[]> => {
    const list = loadStoredList<TenantAuditLogEntry>(AUDIT_LOGS_KEY, INITIAL_AUDIT_LOGS);
    return list.filter(l => l.tenantId === tenantId);
  },

  /**
   * Returns all audit logs with multi-field search and filters
   */
  getAllAuditLogs: async (filter?: {
    tenantId?: string;
    role?: string;
    status?: string;
    search?: string;
  }): Promise<TenantAuditLogEntry[]> => {
    let list = loadStoredList<TenantAuditLogEntry>(AUDIT_LOGS_KEY, INITIAL_AUDIT_LOGS);

    if (filter) {
      if (filter.tenantId && filter.tenantId !== 'ALL') {
        list = list.filter(l => l.tenantId === filter.tenantId);
      }
      if (filter.role && filter.role !== 'ALL') {
        list = list.filter(l => l.userRole === filter.role);
      }
      if (filter.status && filter.status !== 'ALL') {
        list = list.filter(l => l.status === filter.status);
      }
      if (filter.search && filter.search.trim()) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          l =>
            l.action.toLowerCase().includes(q) ||
            l.userEmail.toLowerCase().includes(q) ||
            l.resource.toLowerCase().includes(q) ||
            l.tenantId.toLowerCase().includes(q)
        );
      }
    }

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  // ==========================================
  // SECURITY ALERTS
  // ==========================================

  /**
   * Triggers a security incident alert
   */
  triggerSecurityAlert: async (
    alert: Omit<SecurityAlert, 'id' | 'timestamp' | 'status'>
  ): Promise<SecurityAlert> => {
    const id = 'sec-alert-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const newAlert: SecurityAlert = {
      ...alert,
      id,
      timestamp: new Date().toISOString(),
      status: 'ACTIVE'
    };

    const current = loadStoredList<SecurityAlert>(SECURITY_ALERTS_KEY, INITIAL_ALERTS);
    saveStoredList(SECURITY_ALERTS_KEY, [newAlert, ...current]);
    return newAlert;
  },

  /**
   * Retrieves security alerts for Super Admin
   */
  getSecurityAlerts: async (statusFilter?: 'ALL' | 'ACTIVE' | 'RESOLVED'): Promise<SecurityAlert[]> => {
    const list = loadStoredList<SecurityAlert>(SECURITY_ALERTS_KEY, INITIAL_ALERTS);
    if (!statusFilter || statusFilter === 'ALL') {
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    return list
      .filter(a => a.status === statusFilter)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  /**
   * Resolves a security alert
   */
  resolveSecurityAlert: async (alertId: string, resolvedBy: string): Promise<void> => {
    const list = loadStoredList<SecurityAlert>(SECURITY_ALERTS_KEY, INITIAL_ALERTS);
    const updated = list.map(a =>
      a.id === alertId
        ? {
            ...a,
            status: 'RESOLVED' as const,
            resolvedAt: new Date().toISOString(),
            resolvedBy
          }
        : a
    );
    saveStoredList(SECURITY_ALERTS_KEY, updated);
  }
};
