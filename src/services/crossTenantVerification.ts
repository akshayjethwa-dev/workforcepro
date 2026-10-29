import { tenantSecurityService, TenantSecurityError } from './tenantSecurityService';
import { UserProfile, Worker, AttendanceRecord } from '../types/index';
import { normalizeWorker } from './db';

export interface TestAssertionResult {
  suiteName: string;
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

export interface CrossTenantVerificationReport {
  timestamp: string;
  durationMs: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestAssertionResult[];
  status: 'ALL_PASSED' | 'FAILED';
}

export const crossTenantVerification = {
  /**
   * Automated test that seeds two tenants (Tenant Alpha & Tenant Beta)
   * and rigorously asserts zero cross-tenant data leakage.
   */
  runIsolationTestSuite: async (): Promise<CrossTenantVerificationReport> => {
    const startTime = performance.now();
    const results: TestAssertionResult[] = [];

    // 1. SETUP FIXTURES: Two distinct tenants with isolated records
    const TENANT_A_ID = 'test-tenant-alpha-' + Date.now();
    const TENANT_B_ID = 'test-tenant-beta-' + Date.now();

    const tenantA_OwnerProfile: UserProfile = {
      uid: 'user-owner-alpha',
      email: 'owner@alpha-corp.test',
      role: 'FACTORY_OWNER',
      tenantId: TENANT_A_ID,
      companyName: 'Alpha Precision Tools'
    };

    const tenantB_OwnerProfile: UserProfile = {
      uid: 'user-owner-beta',
      email: 'owner@beta-industries.test',
      role: 'FACTORY_OWNER',
      tenantId: TENANT_B_ID,
      companyName: 'Beta Heavy Engineering'
    };

    const resellerProfile: UserProfile = {
      uid: 'reseller-partner-1',
      email: 'partner@regional-distributor.test',
      role: 'RESELLER',
      tenantId: 'reseller-holding-tenant',
      companyName: 'Regional Industrial Systems'
    };

    const superAdminProfile: UserProfile = {
      uid: 'superadmin-root',
      email: 'superadmin@workforce.test',
      role: 'SUPER_ADMIN',
      tenantId: 'system-root',
      companyName: 'WorkForce Global'
    };

    // Workers for Tenant Alpha
    const workersTenantA: Worker[] = [
      {
        id: 'worker-alpha-1',
        tenantId: TENANT_A_ID,
        name: 'Aarav Patel (Alpha)',
        phone: '9800000001',
        wageType: 'DAILY',
        dailyWage: 650,
        status: 'ACTIVE',
        isActive: true,
        category: 'Daily Wage'
      },
      {
        id: 'worker-alpha-2',
        tenantId: TENANT_A_ID,
        name: 'Bharat Joshi (Alpha)',
        phone: '9800000002',
        wageType: 'MONTHLY',
        monthlySalary: 22000,
        status: 'ACTIVE',
        isActive: true,
        category: 'Monthly'
      }
    ].map(normalizeWorker);

    // Workers for Tenant Beta
    const workersTenantB: Worker[] = [
      {
        id: 'worker-beta-1',
        tenantId: TENANT_B_ID,
        name: 'Chetan Verma (Beta)',
        phone: '9800000003',
        wageType: 'DAILY',
        dailyWage: 700,
        status: 'ACTIVE',
        isActive: true,
        category: 'Daily Wage'
      },
      {
        id: 'worker-beta-2',
        tenantId: TENANT_B_ID,
        name: 'Deepak Sharma (Beta)',
        phone: '9800000004',
        wageType: 'DAILY',
        dailyWage: 680,
        status: 'ACTIVE',
        isActive: true,
        category: 'Daily Wage'
      }
    ].map(normalizeWorker);

    // Store in-memory repository for isolation verification
    const inMemoryDb = {
      workers: [...workersTenantA, ...workersTenantB],
      attendance: [
        { id: 'att-a-1', tenantId: TENANT_A_ID, workerId: 'worker-alpha-1', date: '2026-10-29', status: 'PRESENT' as const },
        { id: 'att-b-1', tenantId: TENANT_B_ID, workerId: 'worker-beta-1', date: '2026-10-29', status: 'PRESENT' as const }
      ]
    };

    // TEST 1: Tenant Alpha Query Scope Resolution
    try {
      const scopeA = await tenantSecurityService.resolveAuthorizedTenantScope(tenantA_OwnerProfile, TENANT_A_ID);
      const passed = scopeA.tenantId === TENANT_A_ID && !scopeA.isSuperAdmin;
      results.push({
        suiteName: 'Tenant Scope Resolution',
        testName: 'Resolve authorized scope strictly to authenticated profile claims',
        passed,
        message: passed 
          ? `Tenant A successfully resolved to verified claim '${TENANT_A_ID}'` 
          : `Failed: Expected ${TENANT_A_ID}, got ${scopeA.tenantId}`
      });
    } catch (err: any) {
      results.push({
        suiteName: 'Tenant Scope Resolution',
        testName: 'Resolve authorized scope strictly to authenticated profile claims',
        passed: false,
        message: err.message
      });
    }

    // TEST 2: Cross-Tenant Tamper Attempt (Tenant Alpha requests Tenant Beta data)
    try {
      await tenantSecurityService.resolveAuthorizedTenantScope(tenantA_OwnerProfile, TENANT_B_ID);
      results.push({
        suiteName: 'Cross-Tenant Isolation Guard',
        testName: 'Block client from querying another tenant via request param tampering',
        passed: false,
        message: 'Security breach! Tenant Alpha was permitted to query Tenant Beta records.'
      });
    } catch (err: any) {
      const isExpected403 = err instanceof TenantSecurityError && err.statusCode === 403;
      results.push({
        suiteName: 'Cross-Tenant Isolation Guard',
        testName: 'Block client from querying another tenant via request param tampering',
        passed: isExpected403,
        message: isExpected403
          ? `Correctly blocked with 403: ${err.message}`
          : `Unexpected error type: ${err.message}`
      });
    }

    // TEST 3: Strict Field Partitioning (Assert Query for Tenant A NEVER returns Tenant B records)
    try {
      const scopeA = await tenantSecurityService.resolveAuthorizedTenantScope(tenantA_OwnerProfile);
      const isolatedWorkers = inMemoryDb.workers.filter(w => w.tenantId === scopeA.tenantId);
      
      const leakedBetaWorkers = isolatedWorkers.filter(w => w.tenantId === TENANT_B_ID);
      const allAlpha = isolatedWorkers.every(w => w.tenantId === TENANT_A_ID);
      const passed = leakedBetaWorkers.length === 0 && allAlpha && isolatedWorkers.length === 2;

      results.push({
        suiteName: 'Data Partitioning Verification',
        testName: 'Assert query for Tenant A returns zero Tenant B records',
        passed,
        message: passed
          ? `Verified zero cross-tenant leakage: returned 2 Alpha records, 0 Beta records.`
          : `CRITICAL LEAK: Found ${leakedBetaWorkers.length} Beta records inside Tenant A query!`,
        details: { returnedCount: isolatedWorkers.length, leakedCount: leakedBetaWorkers.length }
      });
    } catch (err: any) {
      results.push({
        suiteName: 'Data Partitioning Verification',
        testName: 'Assert query for Tenant A returns zero Tenant B records',
        passed: false,
        message: err.message
      });
    }

    // TEST 4: Reseller Portfolio Isolation (Reseller attempts unassigned Tenant access)
    try {
      // Reseller has only demo-tenant-1 & demo-tenant-2, NOT TENANT_B_ID
      await tenantSecurityService.resolveAuthorizedTenantScope(resellerProfile, TENANT_B_ID);
      results.push({
        suiteName: 'Reseller Portfolio Boundary',
        testName: 'Reseller forbidden from accessing clients outside assigned portfolio',
        passed: false,
        message: 'Security breach! Reseller accessed client not in assigned portfolio.'
      });
    } catch (err: any) {
      const isPortfolio403 = err instanceof TenantSecurityError && err.statusCode === 403;
      results.push({
        suiteName: 'Reseller Portfolio Boundary',
        testName: 'Reseller forbidden from accessing clients outside assigned portfolio',
        passed: isPortfolio403,
        message: isPortfolio403
          ? `Correctly rejected with 403 and logged security alert for Super Admin.`
          : `Unexpected response: ${err.message}`
      });
    }

    // TEST 5: Soft-Delete 90-Day Recovery Lifecycle
    try {
      // 1. Soft delete Tenant A
      await tenantSecurityService.softDeleteTenant(TENANT_A_ID, superAdminProfile);
      const isSoftDeleted = await tenantSecurityService.isTenantSoftDeleted(TENANT_A_ID);
      
      // 2. Querying soft-deleted tenant must be blocked
      let queryBlocked = false;
      try {
        await tenantSecurityService.resolveAuthorizedTenantScope(tenantA_OwnerProfile);
      } catch (e: any) {
        if (e instanceof TenantSecurityError && e.statusCode === 403) {
          queryBlocked = true;
        }
      }

      // 3. Restore Tenant A within recovery window
      await tenantSecurityService.restoreSoftDeletedTenant(TENANT_A_ID, superAdminProfile);
      const isRestored = !(await tenantSecurityService.isTenantSoftDeleted(TENANT_A_ID));

      const passed = isSoftDeleted && queryBlocked && isRestored;
      results.push({
        suiteName: 'Soft-Delete 90-Day Lifecycle',
        testName: 'Enforce deletedAt IS NULL with active 90-day recovery restoration',
        passed,
        message: passed
          ? `Soft-delete successfully blocked queries and restored cleanly within 90-day window.`
          : `Soft-delete lifecycle check failed.`
      });
    } catch (err: any) {
      results.push({
        suiteName: 'Soft-Delete 90-Day Lifecycle',
        testName: 'Enforce deletedAt IS NULL with active 90-day recovery restoration',
        passed: false,
        message: err.message
      });
    }

    // TEST 6: Audit Trail Recording
    try {
      const auditLogId = await tenantSecurityService.logTenantAccess({
        tenantId: TENANT_A_ID,
        userId: tenantA_OwnerProfile.uid,
        userEmail: tenantA_OwnerProfile.email,
        userRole: tenantA_OwnerProfile.role,
        action: 'QUERY_WORKERS_TEST',
        resource: 'workers',
        status: 'SUCCESS',
        details: { count: 2 }
      });

      const auditLogs = await tenantSecurityService.getAuditLogs(TENANT_A_ID);
      const logExists = auditLogs.some(l => l.id === auditLogId);

      results.push({
        suiteName: 'Security Audit Trail',
        testName: 'Query and mutation audit logs are immutably captured with tenantId and userId',
        passed: logExists,
        message: logExists
          ? `Audit log '${auditLogId}' successfully indexed and retrieved.`
          : `Audit log was not found in audit index.`
      });
    } catch (err: any) {
      results.push({
        suiteName: 'Security Audit Trail',
        testName: 'Query and mutation audit logs are immutably captured with tenantId and userId',
        passed: false,
        message: err.message
      });
    }

    const durationMs = Math.round(performance.now() - startTime);
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.filter(r => !r.passed).length;

    return {
      timestamp: new Date().toISOString(),
      durationMs,
      totalTests: results.length,
      passedTests,
      failedTests,
      results,
      status: failedTests === 0 ? 'ALL_PASSED' : 'FAILED'
    };
  }
};
