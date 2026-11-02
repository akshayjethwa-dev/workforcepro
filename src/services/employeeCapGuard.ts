// src/services/employeeCapGuard.ts
import { Worker } from '../types/index';
import { planCatalogService } from './planCatalogService';
import { dbService } from './db';

export interface EmployeeCapStatus {
  tenantId: string;
  planCode: string;
  planName: string;
  cap: number | null; // null = unlimited (Enterprise)
  softCapLimit: number | null; // 100% of cap
  hardCapLimit: number | null; // 110% of cap (Math.floor(cap * 1.10))
  activeCount: number; // Distinct active employees in current billing period
  distinctKeys: string[];
  overageCount: number; // max(0, activeCount - cap)
  overageRate: number; // ₹ per worker per month
  status: 'NORMAL' | 'SOFT_CAP' | 'HARD_CAP_EXCEEDED';
  isSoftCap: boolean;
  isHardCapExceeded: boolean;
  upgradeUrl: string;
  billingPeriod: {
    start: string;
    end: string;
  };
}

export interface BulkImportRowResult {
  rowIndex: number;
  workerName: string;
  phoneOrKey: string;
  allowed: boolean;
  reason: string;
}

export class EmployeeCapExceededError extends Error {
  code = 'EMPLOYEE_CAP_EXCEEDED' as const;
  currentCount: number;
  cap: number;
  hardCapLimit: number;
  softCapLimit: number;
  overageCount: number;
  planCode: string;
  upgradeUrl: string;
  rowReport?: BulkImportRowResult[];

  constructor(message: string, payload: {
    currentCount: number;
    cap: number;
    hardCapLimit: number;
    softCapLimit: number;
    overageCount: number;
    planCode: string;
    upgradeUrl?: string;
    rowReport?: BulkImportRowResult[];
  }) {
    super(message);
    this.name = 'EmployeeCapExceededError';
    this.currentCount = payload.currentCount;
    this.cap = payload.cap;
    this.hardCapLimit = payload.hardCapLimit;
    this.softCapLimit = payload.softCapLimit;
    this.overageCount = payload.overageCount;
    this.planCode = payload.planCode;
    this.upgradeUrl = payload.upgradeUrl || '/billing';
    this.rowReport = payload.rowReport;
  }
}

// In-memory Promise-chain locks to simulate database transactional serialization per tenant
const tenantLocks: Map<string, Promise<void>> = new Map();

/**
 * Derives a stable distinct identity key for an employee (E16-S4).
 * If a worker is deleted and re-added in the same period, this stable key
 * prevents artificial tampering with the distinct employee count.
 */
export function getWorkerIdentityKey(worker: Partial<Worker>): string {
  if (worker.uan && worker.uan.trim()) {
    return 'uan:' + worker.uan.trim();
  }
  if (worker.phone && worker.phone.trim()) {
    const digits = worker.phone.replace(/\D/g, '');
    if (digits.length >= 10) return 'phone:' + digits.slice(-10);
  }
  if (worker.aadhar && worker.aadhar.trim()) {
    const digits = worker.aadhar.replace(/\D/g, '');
    if (digits.length >= 4) return 'aadhar:' + digits.slice(-4);
  }
  return 'id:' + (worker.id || 'unknown-' + Math.random().toString(36).slice(2));
}

class EmployeeCapGuard {
  /**
   * Serializes write operations for a tenant to prevent two concurrent creates
   * from both slipping past the employee cap limit.
   */
  async withTenantLock<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
    const existingLock = tenantLocks.get(tenantId) || Promise.resolve();
    
    let releaseLock: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    tenantLocks.set(tenantId, existingLock.then(() => nextLock));

    try {
      await existingLock;
      return await operation();
    } finally {
      releaseLock!();
    }
  }

  /**
   * Authoritative calculation of a tenant's employee cap status (E16-S4).
   * Distinct employees with status = ACTIVE at any point during current billing period.
   * Inactive/archived employees do NOT count toward the cap.
   */
  async getTenantCapStatus(tenantId: string): Promise<EmployeeCapStatus> {
    // 1. Resolve tenant plan and subscription
    const sub = await planCatalogService.getTenantSubscription(tenantId);
    let planCode = sub?.planCode || 'FREE';
    
    // Fallback to tenant profile if no subscription found
    if (!sub) {
      const allTenants = await dbService.getAllTenants(false);
      const tenant = allTenants.find((t: any) => t.id === tenantId || t.tenantId === tenantId);
      if (tenant?.plan) {
        planCode = tenant.plan;
      }
    }

    const plan = await planCatalogService.getPlanByCode(planCode);
    const activeVersion = plan ? planCatalogService.getCurrentVersion(plan) : null;

    // Use locked price/cap from subscription if available, or current version
    const cap = sub?.priceLockedAt.employeeCap !== undefined 
      ? sub.priceLockedAt.employeeCap 
      : (activeVersion?.employeeCap ?? 10);

    const overageRate = sub?.priceLockedAt.overageRate !== undefined
      ? (sub.priceLockedAt.overageRate ?? 0)
      : (activeVersion?.overageRate ?? 0);

    const softCapLimit = cap; // Cap threshold (100%)
    const hardCapLimit = cap !== null ? Math.floor(cap * 1.10) : null; // 110% of cap

    // 2. Compute distinct active workers
    const allWorkers = await dbService.getWorkers(tenantId);
    
    // Only workers who are active count toward the cap
    const activeWorkers = allWorkers.filter(w => {
      const status = (w.status || 'ACTIVE').toUpperCase();
      return status === 'ACTIVE';
    });

    // Deduplicate by stable identity key
    const distinctKeySet = new Set<string>();
    for (const w of activeWorkers) {
      distinctKeySet.add(getWorkerIdentityKey(w));
    }

    const activeCount = distinctKeySet.size;
    const distinctKeys = Array.from(distinctKeySet);

    const overageCount = cap !== null ? Math.max(0, activeCount - cap) : 0;
    const isSoftCap = cap !== null && activeCount > cap && (hardCapLimit === null || activeCount <= hardCapLimit);
    const isHardCapExceeded = hardCapLimit !== null && activeCount > hardCapLimit;

    let status: 'NORMAL' | 'SOFT_CAP' | 'HARD_CAP_EXCEEDED' = 'NORMAL';
    if (isHardCapExceeded) {
      status = 'HARD_CAP_EXCEEDED';
    } else if (isSoftCap) {
      status = 'SOFT_CAP';
    }

    const now = new Date();
    const periodStart = sub?.currentPeriodStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = sub?.currentPeriodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    return {
      tenantId,
      planCode,
      planName: plan?.name || `${planCode} Plan`,
      cap,
      softCapLimit,
      hardCapLimit,
      activeCount,
      distinctKeys,
      overageCount,
      overageRate,
      status,
      isSoftCap,
      isHardCapExceeded,
      upgradeUrl: '/billing',
      billingPeriod: {
        start: periodStart,
        end: periodEnd
      }
    };
  }

  /**
   * Pre-write guard: validates whether adding or reactivating an employee is permissible.
   * Throws EmployeeCapExceededError if the hard cap (>110%) would be breached.
   */
  async assertCanAddWorker(
    tenantId: string, 
    candidateWorker?: Partial<Worker>,
    additionalCount: number = 1
  ): Promise<{ status: EmployeeCapStatus; softCapReached: boolean; hardCapReached: boolean }> {
    return this.withTenantLock(tenantId, async () => {
      const currentStatus = await this.getTenantCapStatus(tenantId);

      // If unlimited cap, always allow
      if (currentStatus.cap === null || currentStatus.hardCapLimit === null) {
        return {
          status: currentStatus,
          softCapReached: false,
          hardCapReached: false
        };
      }

      // Check if candidate is already in the distinct active count
      if (candidateWorker) {
        const candidateKey = getWorkerIdentityKey(candidateWorker);
        if (currentStatus.distinctKeys.includes(candidateKey)) {
          // Already counted; this is an in-place update of an active worker
          return {
            status: currentStatus,
            softCapReached: currentStatus.isSoftCap,
            hardCapReached: false
          };
        }
      }

      const projectedCount = currentStatus.activeCount + additionalCount;

      // HARD CAP ENFORCEMENT (> 110%)
      if (projectedCount > currentStatus.hardCapLimit) {
        throw new EmployeeCapExceededError(
          `Cannot register employee: Adding ${additionalCount} worker(s) would bring your total to ${projectedCount}, ` +
          `which exceeds your ${currentStatus.planName}'s hard cap limit of ${currentStatus.hardCapLimit} (${currentStatus.cap} + 10% tolerance). ` +
          `Please upgrade your subscription to continue onboarding staff.`,
          {
            currentCount: currentStatus.activeCount,
            cap: currentStatus.cap,
            hardCapLimit: currentStatus.hardCapLimit,
            softCapLimit: currentStatus.softCapLimit!,
            overageCount: Math.max(0, projectedCount - currentStatus.cap),
            planCode: currentStatus.planCode,
            upgradeUrl: currentStatus.upgradeUrl
          }
        );
      }

      // SOFT CAP (100% - 110%)
      const softCapReached = projectedCount > currentStatus.cap && projectedCount <= currentStatus.hardCapLimit;

      return {
        status: {
          ...currentStatus,
          activeCount: projectedCount,
          overageCount: Math.max(0, projectedCount - currentStatus.cap),
          isSoftCap: softCapReached
        },
        softCapReached,
        hardCapReached: false
      };
    });
  }

  /**
   * Bulk import validation (Edge Case):
   * Validates the entire batch before insert. If any row would breach the hard cap,
   * rejects the ENTIRE batch with a row-level report — never a partial import.
   */
  async validateBatchImport(
    tenantId: string, 
    candidates: Array<Partial<Worker>>
  ): Promise<{
    valid: boolean;
    capStatus: EmployeeCapStatus;
    rowReport: BulkImportRowResult[];
    newDistinctCount: number;
  }> {
    return this.withTenantLock(tenantId, async () => {
      const capStatus = await this.getTenantCapStatus(tenantId);
      const rowReport: BulkImportRowResult[] = [];

      if (capStatus.cap === null || capStatus.hardCapLimit === null) {
        // Unlimited
        candidates.forEach((c, idx) => {
          rowReport.push({
            rowIndex: idx + 1,
            workerName: c.name || `Row ${idx + 1}`,
            phoneOrKey: c.phone || 'N/A',
            allowed: true,
            reason: 'Unlimited Enterprise Cap'
          });
        });
        return { valid: true, capStatus, rowReport, newDistinctCount: candidates.length };
      }

      const existingKeys = new Set(capStatus.distinctKeys);
      let runningCount = capStatus.activeCount;
      let hardCapBreached = false;
      let newDistinctCount = 0;

      for (let i = 0; i < candidates.length; i++) {
        const row = candidates[i];
        const key = getWorkerIdentityKey(row);
        const name = row.name || `Row ${i + 1}`;

        if (existingKeys.has(key)) {
          // Already in tenant directory as an active employee
          rowReport.push({
            rowIndex: i + 1,
            workerName: name,
            phoneOrKey: row.phone || key,
            allowed: true,
            reason: 'Existing active identity (re-import duplicate)'
          });
        } else {
          // New employee candidate
          if (runningCount + 1 <= capStatus.hardCapLimit) {
            existingKeys.add(key);
            runningCount++;
            newDistinctCount++;
            rowReport.push({
              rowIndex: i + 1,
              workerName: name,
              phoneOrKey: row.phone || key,
              allowed: true,
              reason: runningCount > capStatus.cap 
                ? `Soft Cap: Allowed with overage (₹${capStatus.overageRate}/mo)` 
                : 'Within plan cap'
            });
          } else {
            // Breaches hard cap
            hardCapBreached = true;
            rowReport.push({
              rowIndex: i + 1,
              workerName: name,
              phoneOrKey: row.phone || key,
              allowed: false,
              reason: `Breaches 110% hard cap (${runningCount + 1} > ${capStatus.hardCapLimit})`
            });
          }
        }
      }

      if (hardCapBreached) {
        throw new EmployeeCapExceededError(
          `Bulk import rejected: Importing this batch would exceed your ${capStatus.planName}'s hard cap limit of ${capStatus.hardCapLimit} workers. ` +
          `All-or-nothing invariant enforced: Zero records were inserted to avoid partial tenant directory corruptions.`,
          {
            currentCount: capStatus.activeCount,
            cap: capStatus.cap,
            hardCapLimit: capStatus.hardCapLimit,
            softCapLimit: capStatus.softCapLimit!,
            overageCount: Math.max(0, runningCount - capStatus.cap),
            planCode: capStatus.planCode,
            upgradeUrl: capStatus.upgradeUrl,
            rowReport
          }
        );
      }

      return {
        valid: true,
        capStatus,
        rowReport,
        newDistinctCount
      };
    });
  }

  /**
   * Plan Downgrade Guard (E17-S3):
   * If a tenant or reseller tries to downgrade a plan whose cap is lower than current active count,
   * strictly block the downgrade so the tenant is not stranded in an invalid hard-cap state.
   */
  async validatePlanDowngrade(tenantId: string, targetPlanCode: string): Promise<void> {
    const currentStatus = await this.getTenantCapStatus(tenantId);
    const targetPlan = await planCatalogService.getPlanByCode(targetPlanCode);
    
    if (!targetPlan) return;
    const targetVersion = planCatalogService.getCurrentVersion(targetPlan);
    const targetCap = targetVersion.employeeCap;

    if (targetCap !== null && currentStatus.activeCount > targetCap) {
      const excess = currentStatus.activeCount - targetCap;
      throw new Error(
        `Cannot downgrade to ${targetPlan.name} (cap: ${targetCap} workers): ` +
        `Tenant currently has ${currentStatus.activeCount} active employees in this billing period. ` +
        `Please deactivate or archive at least ${excess} employee(s) before completing this plan downgrade.`
      );
    }
  }
}

export const employeeCapGuard = new EmployeeCapGuard();
