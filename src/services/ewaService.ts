import { 
  Worker, 
  AttendanceRecord, 
  Advance, 
  OrgSettings, 
  EwaDetails, 
  EwaTimelineStage 
} from '../types/index';
import { dbService } from './db';
import { wageService } from './wageService';
import { inboxService } from './inboxService';
import { syncService } from './syncService';

export interface AccruedWageCalculation {
  month: string;
  confirmedAttendanceCount: number;
  grossAccrued: number;
  statutoryDeductionsEstimate: number;
  existingAdvances: number;
  netAccruedBalance: number;
  maxAllowedPercentage: number;
  maxWithdrawableAmount: number;
  hasPendingLocalPunches: boolean;
  pendingLocalCount: number;
  pendingLocalEstimatedAmount: number;
  hasSalaryRevision: boolean;
  salaryRevisionDate?: string;
  preRevisionDays: number;
  postRevisionDays: number;
  preRevisionRate: number;
  currentRate: number;
  isPayrollLocked: boolean;
  payrollLockMessage?: string;
  isFnFSettlement: boolean;
  fnfExitDate?: string;
  providerInfo: {
    isExternal: boolean;
    providerName: string;
    lenderPartnerName: string;
    feeType: 'FLAT' | 'PERCENTAGE';
    feeValue: number;
    disclosureNote: string;
  };
}

export class EwaService {
  /**
   * Default regulatory / partner provider configuration
   */
  private getDefaultProvider(orgSettings?: OrgSettings) {
    if (orgSettings?.ewaConfig?.provider) {
      return {
        isExternal: orgSettings.ewaConfig.provider.isExternal,
        providerName: orgSettings.ewaConfig.provider.providerName || 'KarmaLife Financial',
        lenderPartnerName: orgSettings.ewaConfig.provider.lenderPartnerName || 'Northern Arc Capital Ltd. (RBI Registered NBFC)',
        feeType: orgSettings.ewaConfig.provider.feeType || 'FLAT',
        feeValue: orgSettings.ewaConfig.provider.feeValue ?? 19,
        disclosureNote: orgSettings.ewaConfig.provider.disclosureNote || 
          'Disbursed via Northern Arc Capital Ltd. (RBI Registered NBFC). Fixed facilitation fee, zero monthly interest or compounding APR.'
      };
    }

    return {
      isExternal: true,
      providerName: 'KarmaLife Financial Services',
      lenderPartnerName: 'Northern Arc Capital Ltd. (RBI Registered NBFC)',
      feeType: 'FLAT' as const,
      feeValue: 19,
      disclosureNote: 'Disbursed via Northern Arc Capital Ltd. (RBI Registered NBFC). Fixed transaction fee of ₹19 per withdrawal. Zero compounding interest.'
    };
  }

  /**
   * Check if the current date falls within the payroll processing lock window
   */
  public isPayrollWindowLocked(orgSettings?: OrgSettings, date: Date = new Date()): { isLocked: boolean; message?: string } {
    if (orgSettings?.ewaConfig?.isPayrollLocked) {
      const resume = orgSettings.ewaConfig.payrollResumeDate || 'the 1st of next month';
      return {
        isLocked: true,
        message: `Payroll is being processed for this period — EWA resumes on ${resume}.`
      };
    }

    const lockWindowDays = orgSettings?.ewaConfig?.payrollLockWindowDays ?? 3;
    const currentYear = date.getFullYear();
    const currentMonth = date.getMonth(); // 0-indexed
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = date.getDate();

    // If we are within the last N days of the month (e.g. days 28-31)
    if (currentDay > (daysInCurrentMonth - lockWindowDays)) {
      const nextMonthName = new Date(currentYear, currentMonth + 1, 1).toLocaleString('default', { month: 'short' });
      const resumeDate = orgSettings?.ewaConfig?.payrollResumeDate || `1st ${nextMonthName}`;
      return {
        isLocked: true,
        message: `Payroll is being processed for this period — EWA resumes on ${resumeDate}.`
      };
    }

    return { isLocked: false };
  }

  /**
   * Compute real-time accrued wage balance with confirmed attendance,
   * statutory deductions pro-rata estimation, salary revision splits, and unsynced punch guards.
   */
  public calculateAccruedWageBalance(
    worker: Worker,
    attendanceRecords: AttendanceRecord[],
    advances: Advance[],
    orgSettings: OrgSettings,
    targetMonth?: string
  ): AccruedWageCalculation {
    const today = new Date();
    const month = targetMonth || today.toISOString().slice(0, 7);

    // 1. Separate confirmed vs local unsynced records
    const workerMonthRecords = attendanceRecords.filter(r => 
      r.workerId === worker.id && 
      r.date.startsWith(month)
    );

    let confirmedCount = 0;
    let pendingLocalCount = 0;
    let confirmedGrossEarned = 0;
    let pendingLocalEstimatedGross = 0;

    let preRevisionDays = 0;
    let postRevisionDays = 0;

    const hasSalaryRevision = Boolean(
      worker.salaryRevisionDate && 
      worker.salaryRevisionDate.startsWith(month) &&
      worker.previousWageAmount && 
      worker.previousWageAmount > 0
    );

    const isMonthly = worker.wageConfig?.type === 'MONTHLY' || 
                      (worker as any).wageType === 'MONTHLY' || 
                      worker.category === 'Monthly';

    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const workingDays = worker.wageConfig?.workingDaysPerMonth || daysInMonth;

    const currentDailyRate = isMonthly 
      ? (worker.wageConfig?.amount || 0) / workingDays 
      : (worker.wageConfig?.amount || 0);

    const preRevisionDailyRate = hasSalaryRevision
      ? (isMonthly ? (worker.previousWageAmount! / workingDays) : worker.previousWageAmount!)
      : currentDailyRate;

    // Check offline queue for uncommitted local items for this worker
    let queuePendingCount = 0;
    try {
      const queue = syncService.getCachedQueue();
      queuePendingCount = queue.filter(q => 
        q.workerId === worker.id && 
        q.entityType === 'ATTENDANCE' && 
        (q.syncStatus === 'PENDING_LOCAL' || q.syncStatus === 'SYNCING')
      ).length;
    } catch {}

    workerMonthRecords.forEach(record => {
      const isPendingLocal = record.syncStatus === 'PENDING_LOCAL' || record.syncStatus === 'SYNCING';
      const dailyWage = wageService.calculateDailyWage(worker, record, orgSettings);
      const earned = dailyWage.breakdown.total;

      if (isPendingLocal) {
        pendingLocalCount++;
        pendingLocalEstimatedGross += earned;
      } else {
        confirmedCount++;
        confirmedGrossEarned += earned;

        if (hasSalaryRevision) {
          if (record.date < worker.salaryRevisionDate!) {
            preRevisionDays++;
          } else {
            postRevisionDays++;
          }
        }
      }
    });

    const totalPendingLocalPunches = pendingLocalCount + queuePendingCount;
    const hasPendingLocalPunches = totalPendingLocalPunches > 0;

    // 2. Pro-rata statutory deductions estimation (EPF 12%, ESIC 0.75%, PT pro-rata)
    let statutoryDeductionsEstimate = 0;
    if (orgSettings?.compliance) {
      // EPF deduction: 12% on basic if eligible & not opted out
      const isPfEligible = !worker.pfOptOut;
      if (isPfEligible && confirmedGrossEarned > 0) {
        const estimatedBasic = confirmedGrossEarned * 0.5; // ~50% basic component
        const epfCeiling = orgSettings.compliance.epfWageCeiling || 15000;
        const cappedBasic = orgSettings.compliance.capPfDeduction 
          ? Math.min(estimatedBasic, epfCeiling * (confirmedCount / daysInMonth))
          : estimatedBasic;
        statutoryDeductionsEstimate += Math.round(cappedBasic * 0.12);
      }

      // ESIC deduction: 0.75% of gross if eligible (gross < 21000/mo)
      const isEsiEligible = !worker.esiOptOut && (worker.wageConfig?.amount || 0) <= (orgSettings.compliance.esiWageCeiling || 21000);
      if (isEsiEligible && confirmedGrossEarned > 0) {
        statutoryDeductionsEstimate += Math.round(confirmedGrossEarned * 0.0075);
      }

      // Professional Tax pro-rata (standard ~₹200 monthly in states like MH, KA, etc.)
      if (confirmedGrossEarned > 7500) {
        statutoryDeductionsEstimate += Math.min(200, Math.round(200 * (confirmedCount / daysInMonth)));
      }
    }

    // 3. Existing advances / approved or pending EWA in current month
    const monthAdvances = advances.filter(a => 
      a.workerId === worker.id && 
      a.date.startsWith(month) && 
      (a.status === 'APPROVED' || a.status === 'PENDING') &&
      !a.repaid
    );
    const existingAdvancesTotal = monthAdvances.reduce((sum, a) => sum + a.amount, 0);

    // 4. Net Accrued Balance
    const netAccruedBalance = Math.max(0, confirmedGrossEarned - statutoryDeductionsEstimate - existingAdvancesTotal);

    // 5. Configurable withdrawal percentage (default 50%)
    const maxAllowedPercentage = orgSettings?.ewaConfig?.maxWithdrawalPercentage ?? 50;
    const maxWithdrawableAmount = Math.max(0, Math.floor(netAccruedBalance * (maxAllowedPercentage / 100)));

    // 6. Check lock window
    const lockStatus = this.isPayrollWindowLocked(orgSettings, today);

    // 7. Provider configuration
    const providerInfo = this.getDefaultProvider(orgSettings);

    return {
      month,
      confirmedAttendanceCount: confirmedCount,
      grossAccrued: Math.round(confirmedGrossEarned),
      statutoryDeductionsEstimate: Math.round(statutoryDeductionsEstimate),
      existingAdvances: Math.round(existingAdvancesTotal),
      netAccruedBalance: Math.round(netAccruedBalance),
      maxAllowedPercentage,
      maxWithdrawableAmount,
      hasPendingLocalPunches,
      pendingLocalCount: totalPendingLocalPunches,
      pendingLocalEstimatedAmount: Math.round(pendingLocalEstimatedGross),
      hasSalaryRevision,
      salaryRevisionDate: worker.salaryRevisionDate,
      preRevisionDays,
      postRevisionDays,
      preRevisionRate: Math.round(preRevisionDailyRate),
      currentRate: Math.round(currentDailyRate),
      isPayrollLocked: lockStatus.isLocked,
      payrollLockMessage: lockStatus.message,
      isFnFSettlement: Boolean(worker.dateOfExit),
      fnfExitDate: worker.dateOfExit,
      providerInfo
    };
  }

  /**
   * Request an Earned Wage Access withdrawal.
   * Validates against confirmed accrued balances, lock windows, and creates
   * an Advance record + an E3 Action Inbox item with full payroll impact details.
   */
  public async requestEwaWithdrawal(params: {
    tenantId: string;
    worker: Worker;
    amount: number;
    reason: string;
    userRole?: string;
    attendanceRecords: AttendanceRecord[];
    advances: Advance[];
    orgSettings: OrgSettings;
  }): Promise<{ success: boolean; advance?: Advance; error?: string }> {
    const { tenantId, worker, amount, reason, attendanceRecords, advances, orgSettings } = params;

    // Check 1: Payroll lock window
    const lockCheck = this.isPayrollWindowLocked(orgSettings);
    if (lockCheck.isLocked) {
      return {
        success: false,
        error: lockCheck.message || 'Payroll processing in progress. EWA requests are currently locked.'
      };
    }

    // Check 2: Balance calculations
    const balance = this.calculateAccruedWageBalance(worker, attendanceRecords, advances, orgSettings);

    if (amount <= 0) {
      return { success: false, error: 'Withdrawal amount must be greater than ₹0.' };
    }

    // Check 3: Insufficient confirmed balance due to unsynced attendance
    if (amount > balance.maxWithdrawableAmount) {
      if (balance.hasPendingLocalPunches) {
        return {
          success: false,
          error: `Insufficient confirmed accrued balance. You have ${balance.pendingLocalCount} attendance record(s) pending sync. Balance may increase after sync.`
        };
      }
      return {
        success: false,
        error: `Requested amount ₹${amount} exceeds max allowable limit of ₹${balance.maxWithdrawableAmount} (${balance.maxAllowedPercentage}% of accrued wages).`
      };
    }

    // Calculate provider fee & net disbursal
    const provider = balance.providerInfo;
    let feeAmount = 0;
    if (provider.feeType === 'FLAT') {
      feeAmount = provider.feeValue;
    } else {
      feeAmount = Math.round((amount * provider.feeValue) / 100);
    }
    const netDisbursalAmount = Math.max(0, amount - feeAmount);

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);
    const advanceId = `ewa-${Date.now()}`;

    const timelineHistory: EwaDetails['timelineHistory'] = [
      {
        stage: 'REQUESTED',
        timestamp: nowIso,
        actor: worker.name,
        notes: reason || 'Worker requested Earned Wage Access withdrawal via mobile self-service'
      }
    ];

    const ewaDetails: EwaDetails = {
      grossEarnedAccrued: balance.grossAccrued,
      statutoryDeductionsEstimate: balance.statutoryDeductionsEstimate,
      existingAdvancesDeduction: balance.existingAdvances,
      netAccruedBalance: balance.netAccruedBalance,
      maxAllowedAmount: balance.maxWithdrawableAmount,
      requestedAmount: amount,
      feeAmount,
      netDisbursalAmount,
      providerName: provider.providerName,
      lenderPartnerName: provider.lenderPartnerName,
      salaryRevisionDate: worker.salaryRevisionDate,
      preRevisionRate: balance.preRevisionRate,
      currentRate: balance.currentRate,
      preRevisionDays: balance.preRevisionDays,
      postRevisionDays: balance.postRevisionDays,
      timelineStage: 'REQUESTED',
      timelineHistory,
      isFnFSettlement: balance.isFnFSettlement,
      fnfExitDate: worker.dateOfExit,
      payrollMonth: balance.month
    };

    const newAdvance: Advance = {
      id: advanceId,
      tenantId,
      workerId: worker.id,
      workerName: worker.name,
      amount,
      date: todayStr,
      reason: reason || 'Earned Wage Access emergency withdrawal',
      status: 'PENDING',
      repaid: false,
      isEwa: true,
      ewaDetails
    };

    // Save advance to DB
    await dbService.addAdvance(newAdvance);

    // Create E3 Action Inbox Item for one-tap approval
    const inboxItemId = `inbox-ewa-${advanceId}`;
    const refCode = advanceId.slice(-6).toUpperCase();
    const isFnF = Boolean(worker.dateOfExit);

    const deductionLabel = isFnF
      ? `Full & Final Settlement: EWA Recovery (${todayStr}) [Ref: ${refCode}]`
      : `Earned Wage Access (${todayStr}) [Ref: ${refCode}]`;

    const remainingAccrual = Math.max(0, balance.netAccruedBalance - amount);

    await inboxService.createCustomItem(tenantId, {
      id: inboxItemId,
      tenantId,
      branchId: worker.branchId,
      actionType: 'ADVANCE_APPROVAL',
      urgency: amount > 3000 ? 'HIGH' : 'NORMAL',
      status: 'PENDING',
      workerId: worker.id,
      workerName: worker.name,
      workerPhone: worker.phone,
      workerDesignation: worker.designation,
      title: `EWA Withdrawal Request: ₹${amount.toLocaleString()}`,
      description: isFnF
        ? `[Full & Final Settlement Worker] Requested ₹${amount} against ₹${balance.netAccruedBalance} accrued wages.`
        : `Requested ₹${amount} (${Math.round((amount / balance.netAccruedBalance) * 100)}% of ₹${balance.netAccruedBalance} accrued balance).`,
      timestamp: nowIso,
      amount,
      isLowRisk: amount <= 500,
      details: {
        isEwa: true,
        advance: newAdvance,
        ewaDetails,
        accruedBalance: balance.netAccruedBalance,
        reason: reason || 'Earned Wage Access withdrawal',
        payrollImpact: {
          currentNetAccrual: balance.netAccruedBalance,
          withdrawalAmount: amount,
          remainingAccrual,
          estimatedUpcomingPayslipNet: remainingAccrual,
          deductionLineItem: deductionLabel,
          isFnF
        }
      }
    });

    return { success: true, advance: newAdvance };
  }

  /**
   * Advance the EWA Timeline stage:
   * REQUESTED -> APPROVED -> DISBURSED -> ADJUSTED_IN_PAYSLIP
   */
  public async updateEwaTimelineStage(
    tenantId: string,
    advanceId: string,
    newStage: EwaTimelineStage,
    actor: string,
    notes?: string
  ): Promise<Advance | null> {
    const advances = await dbService.getAdvances(tenantId);
    const adv = advances.find(a => a.id === advanceId);
    if (!adv || !adv.isEwa) return null;

    const nowIso = new Date().toISOString();
    const currentDetails: EwaDetails = adv.ewaDetails || {
      grossEarnedAccrued: 0,
      statutoryDeductionsEstimate: 0,
      existingAdvancesDeduction: 0,
      netAccruedBalance: 0,
      maxAllowedAmount: adv.amount,
      requestedAmount: adv.amount,
      feeAmount: 0,
      netDisbursalAmount: adv.amount,
      timelineStage: 'REQUESTED',
      timelineHistory: []
    };

    const updatedHistory = [
      ...currentDetails.timelineHistory,
      {
        stage: newStage,
        timestamp: nowIso,
        actor,
        notes: notes || `Moved to ${newStage} by ${actor}`
      }
    ];

    const updatedDetails: EwaDetails = {
      ...currentDetails,
      timelineStage: newStage,
      timelineHistory: updatedHistory,
      ...(newStage === 'ADJUSTED_IN_PAYSLIP' ? { payrollAdjustedDate: nowIso } : {})
    };

    adv.ewaDetails = updatedDetails;
    if (newStage === 'APPROVED') {
      adv.status = 'APPROVED';
    } else if (newStage === 'DISBURSED') {
      adv.status = 'APPROVED';
    } else if (newStage === 'ADJUSTED_IN_PAYSLIP') {
      adv.status = 'APPROVED';
      adv.repaid = true;
    } else if (newStage === 'REJECTED') {
      adv.status = 'REJECTED';
    }

    // Persist to DB
    await dbService.updateAdvanceRecord(adv);

    return adv;
  }
}

export const ewaService = new EwaService();
