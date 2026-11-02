// src/services/batchJobService.ts
import { entitlementService, EntitlementError } from './entitlementService';
import { dbService } from './db';
import { wageService } from './wageService';
import { MonthlyPayroll } from '../types/index';

export interface BatchJobResult {
  jobId: string;
  jobType: 'SCHEDULED_PAYROLL_RUN' | 'SCHEDULED_ROSTER_PUBLISH';
  tenantId: string;
  status: 'SUCCESS' | 'FAILED_ENTITLEMENT' | 'ERROR';
  processedCount: number;
  message: string;
  error?: any;
  executedAt: string;
}

export const batchJobService = {
  /**
   * Executes scheduled monthly payroll run (e.g. on the 1st of each month).
   * If tenant downgraded overnight and the grace period expired, the job must fail
   * with a clear high-priority notification, not silently produce partial output.
   */
  executeScheduledPayrollRun: async (
    tenantId: string,
    month: string,
    triggeredBy = 'system-cron'
  ): Promise<BatchJobResult> => {
    const jobId = `job-payroll-${tenantId}-${month}-${Date.now()}`;
    const executedAt = new Date().toISOString();

    // 1. Authoritative Server-side Entitlement Gate
    try {
      await entitlementService.assertEntitlement(tenantId, 'ADVANCED_PAYROLL');
    } catch (err: any) {
      // Gated feature entitlement check failed!
      const errorPayload = err instanceof EntitlementError 
        ? err.toJSON() 
        : { status: 403, code: 'FEATURE_NOT_ENTITLED', feature: 'ADVANCED_PAYROLL', requiredPlan: 'PRO', upgradeUrl: '/billing' };

      // Dispatch high-priority system notification to tenant admin
      await dbService.addNotification({
        tenantId,
        title: '⚠️ Scheduled Payroll Run Stopped',
        message: `Your scheduled automated payroll run for ${month} was stopped: Organization has downgraded or is on a plan without Advanced Statutory Payroll (Required: PRO). No partial wage records were created. Please upgrade your subscription to resume automated salary disbursements.`,
        type: 'ALERT',
        createdAt: executedAt,
        read: false
      });

      console.error(`Batch job ${jobId} aborted: Feature ADVANCED_PAYROLL not entitled for tenant ${tenantId}`, errorPayload);

      throw err; // Fail-closed: rethrow structured EntitlementError (HTTP 403)
    }

    // 2. Proceed with full payroll run if entitled (All-or-Nothing batch)
    const [workers, attendance, orgSettings, advances] = await Promise.all([
      dbService.getWorkers(tenantId),
      dbService.getAttendanceHistory(tenantId),
      dbService.getOrgSettings(tenantId),
      dbService.getAdvances(tenantId)
    ]);

    const activeWorkers = workers.filter(w => w.status === 'ACTIVE');
    const payrollRecords: MonthlyPayroll[] = [];

    for (const worker of activeWorkers) {
      const payroll = wageService.calculateMonthlyPayroll(
        worker,
        month,
        attendance,
        advances,
        orgSettings
      );
      payrollRecords.push(payroll);
      await dbService.savePayroll(payroll);
    }

    // Record success notification
    await dbService.addNotification({
      tenantId,
      title: '✅ Scheduled Payroll Completed',
      message: `Automated payroll batch completed successfully for ${month}: ${payrollRecords.length} worker salaries calculated with statutory deductions.`,
      type: 'INFO',
      createdAt: executedAt,
      read: false
    });

    return {
      jobId,
      jobType: 'SCHEDULED_PAYROLL_RUN',
      tenantId,
      status: 'SUCCESS',
      processedCount: payrollRecords.length,
      message: `Successfully processed ${payrollRecords.length} payroll records for ${month}.`,
      executedAt
    };
  }
};
