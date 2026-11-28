import {
  ActiveLoan,
  Advance,
  AttendanceRecord,
  MonthlyPayroll,
  OrgSettings,
  Worker,
} from '../types/index';
import { getCachedActiveLoansSync } from './db';
import { statutoryEngine } from './statutoryEngine';
import { wageService, ensureWageConfig, PayrollExpenseIntegrationOptions } from './wageService';
import { expenseService } from './expenseService';

export interface WorkerLoanRecoveryLineItem {
  loanId: string;
  description: string;
  amount: number;
  outstandingPrincipalBefore: number;
  outstandingPrincipalAfter: number;
  remainingInstallments: number;
}

export interface WorkerLoanRecoveryComputation {
  totalLoanRecovery: number;
  activeLoanCount: number;
  totalOutstandingPrincipal: number;
  lineItems: WorkerLoanRecoveryLineItem[];
  matchedLoans: ActiveLoan[];
}

export interface MonthlyLoanRecoverySummary {
  activeLoanCount: number;
  affectedWorkersCount: number;
  totalOutstandingPrincipal: number;
  totalMonthlyRecovery: number;
  summaryMessage: string;
}

const round2 = (v: number): number => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * Formats an INR amount using the Indian numbering system (e.g., 150000 -> "₹1,50,000").
 */
export function formatInrWhole(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `₹${Math.round(safe).toLocaleString('en-IN')}`;
}

/**
 * Formats the standard monthly loan recovery summary banner text:
 * "Total outstanding loan recovery to be deducted this month: ₹1,50,000."
 */
export function formatLoanRecoverySummary(totalMonthlyRecovery: number): string {
  return `Total outstanding loan recovery to be deducted this month: ${formatInrWhole(
    totalMonthlyRecovery
  )}.`;
}

/**
 * Evaluates whether an ActiveLoan record is eligible for monthly payroll EMI recovery.
 */
export function isLoanEligibleForMonth(loan: ActiveLoan, month?: string): boolean {
  if (!loan) return false;
  if (loan.status !== 'ACTIVE') return false;
  if (!Number.isFinite(loan.outstandingPrincipal) || loan.outstandingPrincipal <= 0) return false;
  if (!Number.isFinite(loan.monthlyEmi) || loan.monthlyEmi <= 0) return false;
  if (!Number.isFinite(loan.remainingInstallments) || loan.remainingInstallments <= 0) return false;
  if (month && loan.startMonth && month < loan.startMonth) return false;
  return true;
}

/**
 * Checks ActiveLoan records for a specific worker and builds automatic "Loan Recovery"
 * deduction line items for their monthly payslip.
 *
 * - Caps each EMI at the loan's remaining outstanding principal (so the final installment
 *   never over-deducts).
 * - Uses explicitly supplied activeLoans if passed, otherwise falls back to the synchronized
 *   local cache for the tenant so synchronous payroll calculations always include active loans.
 */
export function computeWorkerLoanRecoveries(
  workerId: string,
  tenantId: string,
  activeLoans?: ActiveLoan[],
  month?: string
): WorkerLoanRecoveryComputation {
  const sourceLoans =
    activeLoans !== undefined ? activeLoans : getCachedActiveLoansSync(tenantId);

  const eligibleLoans = sourceLoans.filter(
    (loan) => loan.workerId === workerId && isLoanEligibleForMonth(loan, month)
  );

  let totalLoanRecovery = 0;
  let totalOutstandingPrincipal = 0;
  const lineItems: WorkerLoanRecoveryLineItem[] = [];

  eligibleLoans.forEach((loan, idx) => {
    const recoveryAmount = round2(Math.min(loan.monthlyEmi, loan.outstandingPrincipal));
    if (recoveryAmount <= 0) return;

    const remainingAfter = round2(Math.max(0, loan.outstandingPrincipal - recoveryAmount));
    totalLoanRecovery = round2(totalLoanRecovery + recoveryAmount);
    totalOutstandingPrincipal = round2(totalOutstandingPrincipal + loan.outstandingPrincipal);

    const loanLabel = eligibleLoans.length > 1 ? ` #${idx + 1}` : '';
    const installmentSuffix =
      loan.remainingInstallments === 1
        ? 'Final EMI'
        : `${loan.remainingInstallments} EMIs left`;
    const balanceSuffix = `Bal ${formatInrWhole(loan.outstandingPrincipal)}`;

    lineItems.push({
      loanId: loan.id,
      description: `Loan Recovery${loanLabel} (${installmentSuffix} · ${balanceSuffix})`,
      amount: recoveryAmount,
      outstandingPrincipalBefore: loan.outstandingPrincipal,
      outstandingPrincipalAfter: remainingAfter,
      remainingInstallments: loan.remainingInstallments,
    });
  });

  return {
    totalLoanRecovery,
    activeLoanCount: lineItems.length,
    totalOutstandingPrincipal,
    lineItems,
    matchedLoans: eligibleLoans,
  };
}

/**
 * Computes tenant-wide monthly loan recovery totals across all ActiveLoan records
 * and returns the formatted summary string.
 */
export function calculateMonthlyLoanRecoverySummary(
  activeLoans: ActiveLoan[],
  month?: string
): MonthlyLoanRecoverySummary {
  const eligible = (activeLoans || []).filter((loan) => isLoanEligibleForMonth(loan, month));
  const workerIds = new Set<string>();
  let totalOutstandingPrincipal = 0;
  let totalMonthlyRecovery = 0;

  for (const loan of eligible) {
    workerIds.add(loan.workerId);
    totalOutstandingPrincipal = round2(totalOutstandingPrincipal + loan.outstandingPrincipal);
    totalMonthlyRecovery = round2(
      totalMonthlyRecovery + Math.min(loan.monthlyEmi, loan.outstandingPrincipal)
    );
  }

  return {
    activeLoanCount: eligible.length,
    affectedWorkersCount: workerIds.size,
    totalOutstandingPrincipal,
    totalMonthlyRecovery,
    summaryMessage: formatLoanRecoverySummary(totalMonthlyRecovery),
  };
}

/**
 * Estimates a worker's monthly take-home (net) salary for the EMI-exceeds-salary guard
 * during Bulk Loan Ledger Import.
 *
 * Uses the worker's configured wage rate (Monthly salary or Daily rate * workingDaysPerMonth)
 * and subtracts estimated statutory employee deductions (EPF, ESI, PT, LWF) when statutory
 * settings are available.
 */
export function estimateWorkerMonthlyNetSalary(
  worker: Worker,
  orgSettings?: OrgSettings | null,
  referenceMonth?: string
): number {
  const config = ensureWageConfig(worker);
  const workingDays = config.workingDaysPerMonth || config.dailyMultiplier || 26;
  const estimatedGross =
    config.type === 'MONTHLY' ? config.amount : config.amount * workingDays;

  if (!Number.isFinite(estimatedGross) || estimatedGross <= 0) return 0;

  // Estimate Basic+DA wage base for statutory calculation
  let wageBase = estimatedGross;
  if (config.type === 'MONTHLY' && config.monthlyBreakdown) {
    const mb = config.monthlyBreakdown;
    const mbBase = (mb.basic || 0) + (mb.da || 0) + (mb.retainingAllowance || 0);
    const mbTotal =
      mbBase + (mb.hra || 0) + (mb.travel || 0) + (mb.medical || 0) + (mb.others || 0);
    if (mbTotal > 0) {
      wageBase = round2(estimatedGross * (mbBase / mbTotal));
    }
  } else if (
    typeof config.basicPercentage === 'number' &&
    config.basicPercentage > 0 &&
    config.basicPercentage < 100
  ) {
    wageBase = round2((estimatedGross * config.basicPercentage) / 100);
  }

  const allowances = round2(Math.max(0, estimatedGross - wageBase));
  const month = referenceMonth || new Date().toISOString().slice(0, 7);

  if (orgSettings) {
    try {
      const stat = statutoryEngine.computeStatutoryDeductions(
        worker,
        wageBase,
        estimatedGross,
        0,
        allowances,
        month,
        orgSettings
      );
      const net = round2(Math.max(0, estimatedGross - stat.totalEmployeeDeductions));
      return net;
    } catch {
      // Fall back to gross estimate if statutory config is incomplete
    }
  }

  return round2(estimatedGross);
}

/**
 * Queries all Finance-APPROVED expense claims for a worker & pay period (YYYY-MM)
 * and prepares them for PayrollEngine:
 * - Tax-Free claims: excluded from Gross Taxable Salary; added AFTER Net Pay under "Reimbursements (Tax-Free)".
 * - Finance-flagged TAXABLE claims (e.g., Gift/Bonus): added to Gross Taxable Salary before tax computation.
 */
export function buildWorkerPayrollExpenseOptions(
  worker: Worker,
  month: string
): PayrollExpenseIntegrationOptions {
  if (!worker?.tenantId || !worker?.id) {
    return {};
  }
  const queried = expenseService.queryApprovedExpenseClaimsForPayroll(
    worker.tenantId,
    worker.id,
    month,
    worker
  );
  if (queried.allClaims.length === 0) {
    return {};
  }
  return {
    taxableExpenseAdditions: queried.taxableTotal,
    taxableExpenseItems: queried.taxableLineItems,
    taxFreeReimbursements: queried.taxFreeTotal,
    reimbursementItems: queried.taxFreeLineItems,
    expenseClaimIds: queried.allClaims.map((c) => c.id),
  };
}

/**
 * PayrollEngine — Authoritative monthly payroll orchestrator integrating
 * earnings, statutory compliance, advances, negative leave deductions,
 * automatic ActiveLoan "Loan Recovery" deductions, and APPROVED expense claims
 * (Tax-Free Reimbursements added after Net Pay; Finance-flagged Taxable expenses added to Gross Salary).
 */
export const PayrollEngine = {
  generateMonthlyPayroll: (
    worker: Worker,
    month: string,
    attendanceRecords: AttendanceRecord[],
    advances: Advance[],
    orgSettings: OrgSettings,
    activeLoans?: ActiveLoan[]
  ): MonthlyPayroll => {
    const expenseOptions = buildWorkerPayrollExpenseOptions(worker, month);
    return wageService.generateMonthlyPayroll(
      worker,
      month,
      attendanceRecords,
      advances,
      orgSettings,
      activeLoans,
      expenseOptions
    );
  },

  calculateMonthlyPayroll: (
    worker: Worker,
    month: string,
    attendanceRecords: AttendanceRecord[],
    advances: Advance[],
    orgSettings: OrgSettings,
    activeLoans?: ActiveLoan[]
  ): MonthlyPayroll => {
    const expenseOptions = buildWorkerPayrollExpenseOptions(worker, month);
    return wageService.calculateMonthlyPayroll(
      worker,
      month,
      attendanceRecords,
      advances,
      orgSettings,
      activeLoans,
      expenseOptions
    );
  },

  /**
   * Transitions all APPROVED expense claims included in a finalized payroll run to PAID automatically.
   */
  finalizePayrollExpenseClaims: (
    tenantId: string,
    payrollMonth: string,
    paidBy: string,
    options?: {
      workerIds?: string[];
      payrollIdByWorker?: Record<string, string>;
      workers?: Worker[];
    }
  ) => {
    return expenseService.markApprovedClaimsAsPaid(tenantId, payrollMonth, paidBy, options);
  },

  buildWorkerPayrollExpenseOptions,
  computeWorkerLoanRecoveries,
  calculateMonthlyLoanRecoverySummary,
  formatLoanRecoverySummary,
  estimateWorkerMonthlyNetSalary,
  isLoanEligibleForMonth,
};
