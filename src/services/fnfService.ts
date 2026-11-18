// src/services/fnfService.ts
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Advance,
  AttendanceRecord,
  FnfLegalHoldCategory,
  FnfSettlementRecord,
  GratuityExitReason,
  InboxItem,
  MonthlyPayroll,
  OrgSettings,
  Worker,
} from '../types/index';
import {
  calculateWorkerGratuity,
  getFnfSettlements,
  getSyncFnfSettlements,
  normalizeFlexibleDateString,
  saveFnfSettlement,
} from './gratuityService';
import { wageService } from './wageService';
import { dbService } from './db';
import { inboxService } from './inboxService';
import { validateWorkerWageStructure } from './wageStructureValidationService';

export const FNF_WORKING_DAYS_LIMIT = 2; // Section 17(2), Code on Wages
export const FNF_GRATUITY_DAYS_LIMIT = 30; // Section 7(3), Payment of Gratuity Act
export const FNF_INTEREST_PENALTY_ANNUAL_PCT = 12; // 12% p.a. delay interest

const OFFCYCLE_FNF_STORAGE_KEY = (tenantId: string) =>
  `offcycle_fnf_payrolls_${tenantId || 'demo-tenant-id'}`;

const round2 = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function getTodayLocalIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Checks whether a calendar Date (local) is a working day for the organization/worker,
 * skipping org weekly offs and configured public holidays.
 */
export function isOrgWorkingDay(
  date: Date,
  orgSettings?: OrgSettings | null,
  worker?: Worker | null
): boolean {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const iso = `${y}-${m}-${d}`;

  // Skip public holidays
  if (orgSettings?.holidays?.some((h) => h.date === iso)) {
    return false;
  }

  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (worker?.weeklyOffOverride && worker.weeklyOffOverride.length > 0) {
    return !worker.weeklyOffOverride.includes(dayOfWeek);
  }

  const weeklyOffConfig = orgSettings?.weeklyOffs;
  const defaultDays = weeklyOffConfig?.defaultDays?.length
    ? weeklyOffConfig.defaultDays
    : [0]; // Default Sunday off

  if (defaultDays.includes(dayOfWeek)) {
    if (dayOfWeek === 6 && weeklyOffConfig?.saturdayRule) {
      const occurrence = Math.ceil(date.getDate() / 7);
      switch (weeklyOffConfig.saturdayRule) {
        case 'NONE':
          return true;
        case 'ALL':
          return false;
        case 'ALTERNATE':
          return occurrence % 2 !== 0; // 2nd & 4th off
        case 'FIRST_THIRD':
          return occurrence !== 1 && occurrence !== 3;
        case 'SECOND_FOURTH':
          return occurrence !== 2 && occurrence !== 4;
        default:
          return false;
      }
    }
    return false;
  }

  return true;
}

/**
 * Computes Section 17(2) deadline: exitDate + 2 working days (end of 2nd working day at 23:59:59).
 * Example: Employee resigns on Monday -> Deadline set to Wednesday 23:59:59.
 */
export function addWorkingDaysDeadlineIso(
  exitDateIso: string,
  workingDays: number = FNF_WORKING_DAYS_LIMIT,
  orgSettings?: OrgSettings | null,
  worker?: Worker | null
): string {
  const normalized = normalizeFlexibleDateString(exitDateIso) || getTodayLocalIso();
  const [y, m, d] = normalized.split('-').map(Number);
  const cursor = new Date(y, m - 1, d, 23, 59, 59, 999);

  let remaining = Math.max(1, workingDays);
  let safetyCounter = 0;
  while (remaining > 0 && safetyCounter < 45) {
    cursor.setDate(cursor.getDate() + 1);
    if (isOrgWorkingDay(cursor, orgSettings, worker)) {
      remaining--;
    }
    safetyCounter++;
  }

  return cursor.toISOString();
}

export function addCalendarDaysDeadlineIso(
  exitDateIso: string,
  days: number = FNF_GRATUITY_DAYS_LIMIT
): string {
  const normalized = normalizeFlexibleDateString(exitDateIso) || getTodayLocalIso();
  const [y, m, d] = normalized.split('-').map(Number);
  const target = new Date(y, m - 1, d + days, 23, 59, 59, 999);
  return target.toISOString();
}

export function mapExitReasonToSeparationStatus(
  exitReason: GratuityExitReason
): FnfSettlementRecord['separationStatus'] {
  switch (exitReason) {
    case 'RESIGNATION':
      return 'RESIGNED';
    case 'TERMINATION':
      return 'TERMINATED';
    case 'RETIREMENT':
      return 'RETIRED';
    case 'END_OF_CONTRACT':
      return 'END_OF_CONTRACT';
    case 'DEATH_IN_SERVICE':
      return 'DEATH_IN_SERVICE';
    case 'PERMANENT_DISABLEMENT':
      return 'PERMANENT_DISABLEMENT';
    default:
      return 'RESIGNED';
  }
}

export function mapWorkerStatusToExitReason(
  status?: Worker['status'],
  fallback?: GratuityExitReason
): GratuityExitReason {
  if (status === 'TERMINATED') return 'TERMINATION';
  if (status === 'RESIGNED') return 'RESIGNATION';
  return fallback || 'RESIGNATION';
}

export function formatDurationMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(clamped / 86400);
  const hours = Math.floor((clamped % 86400) / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, '0')}h`);
  parts.push(`${String(mins).padStart(2, '0')}m`);
  parts.push(`${String(secs).padStart(2, '0')}s`);
  return parts.join(' ');
}

export type FnfDeadlineState =
  | 'ON_TRACK'
  | 'URGENT_DUE_SOON'
  | 'BREACHED'
  | 'PAUSED_HOLD'
  | 'DEADLINE_MET'
  | 'SETTLED_LATE';

export interface FnfDeadlineEvaluation {
  state: FnfDeadlineState;
  isBreached: boolean;
  isPaused: boolean;
  isWageSettled: boolean;
  baseDeadlineIso: string;
  effectiveDeadlineIso: string;
  effectiveDeadlineLabel: string;
  gratuityDeadlineIso: string;
  gratuityDeadlineLabel: string;
  remainingMs: number;
  overdueMs: number;
  overdueDaysExact: number;
  overdueWholeDays: number;
  countdownText: string;
  principalForPenalty: number;
  dailyInterestCost: number;
  accruedInterestPenalty: number;
  interestRateAnnualPct: number;
  gratuityDaysRemaining: number;
  gratuityOverdueDays: number;
  isGratuityBreached: boolean;
}

/**
 * Evaluates live countdown, breach state, paused LEGAL_HOLD offset, and 12% p.a. interest penalty.
 */
export function evaluateFnfDeadline(
  record: FnfSettlementRecord,
  nowMs: number = Date.now(),
  orgSettings?: OrgSettings | null
): FnfDeadlineEvaluation {
  const tracking = record.deadlineTracking;
  const baseDeadlineIso =
    tracking?.baseDeadlineAt ||
    addWorkingDaysDeadlineIso(record.exitDate, FNF_WORKING_DAYS_LIMIT, orgSettings);
  const effectiveDeadlineIso = tracking?.effectiveDeadlineAt || baseDeadlineIso;
  const gratuityDeadlineIso =
    tracking?.gratuityDeadlineAt ||
    addCalendarDaysDeadlineIso(record.exitDate, FNF_GRATUITY_DAYS_LIMIT);

  const effectiveDeadlineMs = new Date(effectiveDeadlineIso).getTime();
  const gratuityDeadlineMs = new Date(gratuityDeadlineIso).getTime();

  const wageSchedule = record.paymentSchedules?.wageFnf;
  const gratuitySchedule = record.paymentSchedules?.gratuity;

  const isWageSettled =
    wageSchedule?.status === 'PAID' || record.status === 'SETTLED';
  const wageSettledMs = wageSchedule?.paidAt
    ? new Date(wageSchedule.paidAt).getTime()
    : record.settledAt
    ? new Date(record.settledAt).getTime()
    : undefined;

  const isPaused = Boolean(
    !isWageSettled && (record.status === 'LEGAL_HOLD' || tracking?.isPaused || record.legalHold?.active)
  );
  const pauseAnchorMs = tracking?.holdStartedAt
    ? new Date(tracking.holdStartedAt).getTime()
    : nowMs;

  const evalPointMs = isWageSettled && wageSettledMs
    ? wageSettledMs
    : isPaused
    ? pauseAnchorMs
    : nowMs;

  const diffMs = effectiveDeadlineMs - evalPointMs;
  const remainingMs = Math.max(0, diffMs);
  const overdueMs = Math.max(0, -diffMs);

  const overdueDaysExact = overdueMs / (1000 * 60 * 60 * 24);
  const overdueWholeDays = overdueMs > 0 ? Math.max(1, Math.ceil(overdueDaysExact)) : 0;

  const principalForPenalty = Math.max(
    0,
    round2(record.fnfWageNetPayable ?? record.netFnfPayable ?? 0)
  );
  const interestRateAnnualPct =
    tracking?.interestRateAnnualPct ?? FNF_INTEREST_PENALTY_ANNUAL_PCT;
  const dailyInterestCost = round2(
    (principalForPenalty * (interestRateAnnualPct / 100)) / 365
  );
  const accruedInterestPenalty =
    overdueWholeDays > 0
      ? round2(
          principalForPenalty *
            (interestRateAnnualPct / 100) *
            (overdueWholeDays / 365)
        )
      : 0;

  let state: FnfDeadlineState = 'ON_TRACK';
  let countdownText = '';

  if (isWageSettled) {
    if (overdueMs > 0) {
      state = 'SETTLED_LATE';
      countdownText = `Settled ${overdueWholeDays}d after deadline`;
    } else {
      state = 'DEADLINE_MET';
      countdownText = 'Settled within 2 working days';
    }
  } else if (isPaused) {
    state = 'PAUSED_HOLD';
    countdownText =
      diffMs >= 0
        ? `PAUSED (${formatDurationMs(diffMs)} left)`
        : `PAUSED (Hold on overdue)`;
  } else if (diffMs < 0) {
    state = 'BREACHED';
    countdownText = `BREACHED by ${formatDurationMs(overdueMs)}`;
  } else if (diffMs <= 24 * 60 * 60 * 1000) {
    state = 'URGENT_DUE_SOON';
    countdownText = `${formatDurationMs(diffMs)} left`;
  } else {
    state = 'ON_TRACK';
    countdownText = `${formatDurationMs(diffMs)} left`;
  }

  const isGratuitySettled =
    gratuitySchedule?.status === 'PAID' ||
    record.gratuityPayable <= 0 ||
    record.status === 'SETTLED';
  const gratDiffMs = gratuityDeadlineMs - nowMs;
  const gratuityDaysRemaining = Math.max(0, Math.ceil(gratDiffMs / 86400000));
  const gratuityOverdueDays =
    !isGratuitySettled && gratDiffMs < 0
      ? Math.max(1, Math.ceil(-gratDiffMs / 86400000))
      : 0;

  const formatDt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  return {
    state,
    isBreached: state === 'BREACHED',
    isPaused,
    isWageSettled,
    baseDeadlineIso,
    effectiveDeadlineIso,
    effectiveDeadlineLabel: formatDt(effectiveDeadlineIso),
    gratuityDeadlineIso,
    gratuityDeadlineLabel: formatDt(gratuityDeadlineIso),
    remainingMs,
    overdueMs,
    overdueDaysExact: round2(overdueDaysExact),
    overdueWholeDays,
    countdownText,
    principalForPenalty,
    dailyInterestCost,
    accruedInterestPenalty,
    interestRateAnnualPct,
    gratuityDaysRemaining,
    gratuityOverdueDays,
    isGratuityBreached: gratuityOverdueDays > 0,
  };
}

export interface BuildAutomatedFnfParams {
  tenantId: string;
  worker: Worker;
  exitDate: string;
  exitReason: GratuityExitReason;
  deathInService?: boolean;
  nomineeName?: string;
  nomineeRelation?: string;
  leaveEncashmentDays?: number;
  noticePeriodRequiredDays?: number;
  noticePeriodServedDays?: number;
  noticePayWaived?: boolean;
  monthlyPayrollForExitMonth?: MonthlyPayroll;
  attendanceRecords?: AttendanceRecord[];
  advances?: Advance[];
  orgSettings?: OrgSettings | null;
  notes?: string;
  existingRecord?: FnfSettlementRecord | null;
}

/**
 * Pure builder for a comprehensive FnF Statement covering:
 * - Pending Salary (attendance-backed OR prorated calendar fallback when no exit-month punches logged)
 * - Earned Leave Encashment
 * - Statutory Gratuity (separated into 30-day Schedule B)
 * - Notice Pay Recovery (shortfall days × daily wage rate)
 * - All unpaid Advance / Loan / EWA Recoveries
 * - Section 17(2) 2-Working-Day Deadline Tracking + 30-Day Gratuity Schedule
 */
export function computeFnfSettlementStatement(
  params: BuildAutomatedFnfParams
): FnfSettlementRecord {
  const exitDateIso =
    normalizeFlexibleDateString(params.exitDate) || getTodayLocalIso();
  const exitMonth = exitDateIso.slice(0, 7);
  const deathInService = Boolean(
    params.deathInService ?? params.exitReason === 'DEATH_IN_SERVICE'
  );

  const workerForCalc: Worker = {
    ...params.worker,
    dateOfExit: exitDateIso,
    exitReason: params.exitReason,
    deathInService,
    nomineeName: params.nomineeName || params.worker.nomineeName,
    nomineeRelation: params.nomineeRelation || params.worker.nomineeRelation,
  };

  const gratuityCalc = calculateWorkerGratuity(workerForCalc, {
    asOfDate: exitDateIso,
    exitDateOverride: exitDateIso,
    exitReasonOverride: params.exitReason,
    deathInServiceOverride: deathInService,
    nomineeNameOverride: params.nomineeName,
    nomineeRelationOverride: params.nomineeRelation,
    orgSettings: params.orgSettings || undefined,
  });

  const structAudit = validateWorkerWageStructure(workerForCalc, {
    evaluationDate: exitDateIso,
    orgSettings: params.orgSettings || undefined,
  });

  // 1. Pending Salary (from attendance-backed payroll OR prorated calendar days up to exitDate)
  const attendanceInExitMonth = (params.attendanceRecords || []).filter(
    (a) =>
      a.workerId === params.worker.id &&
      a.date.startsWith(exitMonth) &&
      a.date <= exitDateIso
  );

  const payroll =
    params.monthlyPayrollForExitMonth ||
    (params.orgSettings
      ? wageService.generateMonthlyPayroll(
          workerForCalc,
          exitMonth,
          params.attendanceRecords || [],
          params.advances || [],
          params.orgSettings
        )
      : undefined);

  let pendingSalaryDays = payroll?.attendanceSummary.payableDays ?? 0;
  let pendingWagesEarned = payroll ? round2(payroll.earnings.gross) : 0;
  let pendingSalaryNote: string | undefined;

  if (attendanceInExitMonth.length === 0 && pendingWagesEarned <= 0) {
    // Fallback prorated wages up to exit date when monthly employee exits before biometric sync
    const [yr, mo, dy] = exitDateIso.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const joinedIso = normalizeFlexibleDateString(
      params.worker.dateOfJoining || params.worker.joinedDate
    );
    let startDay = 1;
    if (joinedIso && joinedIso.startsWith(exitMonth)) {
      startDay = Math.max(1, Number(joinedIso.split('-')[2]));
    }
    const proratedDays = Math.max(1, dy - startDay + 1);
    const monthlyGross =
      structAudit.totalRemuneration > 0
        ? structAudit.totalRemuneration
        : params.worker.wageConfig?.type === 'MONTHLY'
        ? params.worker.wageConfig.amount
        : (params.worker.dailyWage || params.worker.wageConfig?.amount || 650) *
          26;
    const dailyProratedRate = monthlyGross / Math.max(1, daysInMonth);
    pendingSalaryDays = proratedDays;
    pendingWagesEarned = Math.round(dailyProratedRate * proratedDays);
    pendingSalaryNote = `Prorated ${proratedDays}/${daysInMonth} calendar days (no biometric punches logged in ${exitMonth})`;
  } else if (attendanceInExitMonth.length > 0) {
    pendingSalaryNote = `Verified from ${attendanceInExitMonth.length} attendance log(s) up to ${exitDateIso}`;
  }

  // 2. Earned Leave Encashment
  const defaultLeaveDays = Math.max(
    0,
    Number(
      params.leaveEncashmentDays ??
        params.worker.leaveBalances?.pl ??
        params.orgSettings?.leavePolicy?.pl ??
        0
    )
  );
  const dailyBasicDaRate =
    gratuityCalc.lastDrawnBasicPlusDa > 0
      ? gratuityCalc.lastDrawnBasicPlusDa / 26
      : structAudit.totalRemuneration / 26;
  const leaveEncashmentAmount = Math.round(dailyBasicDaRate * defaultLeaveDays);

  // 3. Notice Period & Unserved Notice Pay Recovery
  const defaultRequiredNoticeDays =
    params.exitReason === 'RESIGNATION'
      ? params.worker.noticePeriodDays ??
        (params.worker.employmentType === 'PERMANENT' ||
        params.worker.category === 'Permanent'
          ? 30
          : 15)
      : 0;
  const noticePeriodRequiredDays = Math.max(
    0,
    Number(params.noticePeriodRequiredDays ?? defaultRequiredNoticeDays)
  );
  const noticePeriodServedDays = Math.min(
    noticePeriodRequiredDays,
    Math.max(0, Number(params.noticePeriodServedDays ?? 0))
  );
  const noticeShortfallDays = Math.max(
    0,
    noticePeriodRequiredDays - noticePeriodServedDays
  );
  const noticePayWaived = Boolean(params.noticePayWaived);

  const monthlyEquivalentGross =
    structAudit.totalRemuneration > 0
      ? structAudit.totalRemuneration
      : params.worker.monthlySalary ||
        (params.worker.wageConfig?.type === 'MONTHLY'
          ? params.worker.wageConfig.amount
          : (params.worker.dailyWage || params.worker.wageConfig?.amount || 650) *
            26);
  const noticePayDailyRate = round2(monthlyEquivalentGross / 26);
  const noticePayRecovery =
    noticePayWaived || noticeShortfallDays === 0
      ? 0
      : round2(noticeShortfallDays * noticePayDailyRate);
  const noticeRecoveryFormula =
    noticeShortfallDays > 0
      ? noticePayWaived
        ? `Waived (${noticeShortfallDays} shortfall day(s) × ₹${noticePayDailyRate.toLocaleString('en-IN')}/day)`
        : `${noticeShortfallDays} unserved day(s) × ₹${noticePayDailyRate.toLocaleString('en-IN')}/day = ₹${noticePayRecovery.toLocaleString('en-IN')}`
      : noticePeriodRequiredDays > 0
      ? `Full notice served (${noticePeriodServedDays}/${noticePeriodRequiredDays} days)`
      : 'No notice recovery applicable';

  // 4. Advance / Loan / Kharchi / EWA Recovery (all unpaid APPROVED advances up to exit)
  const unpaidWorkerAdvances = (params.advances || []).filter(
    (a) =>
      a.workerId === params.worker.id &&
      !a.repaid &&
      (a.status === 'APPROVED' || !a.status) &&
      a.date <= exitDateIso
  );
  const allUnpaidSum = round2(
    unpaidWorkerAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  );
  const advanceAndEwaRecovery = Math.max(
    allUnpaidSum,
    payroll ? round2(payroll.deductions.advances) : 0
  );

  // 5. Statutory deductions on pending salary
  const statutoryDeductions = payroll?.statutory
    ? round2(payroll.statutory.totalEmployeeStatutory)
    : 0;

  // 6. Separate Schedule A (Wages/Leave/Recoveries - 2 Working Days) vs Schedule B (Gratuity - 30 Calendar Days)
  const gratuityPayable = gratuityCalc.payableGratuityAmount;
  const wageFnfGross = round2(pendingWagesEarned + leaveEncashmentAmount);
  const wageFnfTotalDeductions = round2(
    noticePayRecovery + advanceAndEwaRecovery + statutoryDeductions
  );
  const rawWageNet = round2(wageFnfGross - wageFnfTotalDeductions);
  const fnfWageNetPayable = Math.max(0, rawWageNet);
  const excessRecoveryCarryover = rawWageNet < 0 ? round2(Math.abs(rawWageNet)) : 0;

  const grossFnfPayable = round2(wageFnfGross + gratuityPayable);
  const netFnfPayable = round2(fnfWageNetPayable + gratuityPayable);

  // 7. Deadline Tracking (Section 17(2) 2 working days + Gratuity Sec 7(3) 30 calendar days)
  const existing = params.existingRecord;
  const triggeredAt = existing?.triggeredAt || new Date().toISOString();
  const baseDeadlineAt = addWorkingDaysDeadlineIso(
    exitDateIso,
    FNF_WORKING_DAYS_LIMIT,
    params.orgSettings,
    params.worker
  );
  const totalPausedMs = existing?.deadlineTracking?.totalPausedMs || 0;
  const effectiveDeadlineAt = existing?.deadlineTracking?.effectiveDeadlineAt
    ? new Date(
        new Date(baseDeadlineAt).getTime() + totalPausedMs
      ).toISOString()
    : baseDeadlineAt;
  const gratuityDeadlineAt = addCalendarDaysDeadlineIso(
    exitDateIso,
    FNF_GRATUITY_DAYS_LIMIT
  );

  const fnfId = `fnf_${params.worker.id}_${exitDateIso}`;

  return {
    id: fnfId,
    tenantId: params.tenantId,
    workerId: params.worker.id,
    workerName: params.worker.name,
    designation: params.worker.designation || 'Worker',
    department: params.worker.department || 'General',
    exitDate: exitDateIso,
    exitReason: params.exitReason,
    separationStatus: mapExitReasonToSeparationStatus(params.exitReason),
    triggeredAt,
    deathInService,
    nomineeName: params.nomineeName || params.worker.nomineeName,
    nomineeRelation: params.nomineeRelation || params.worker.nomineeRelation,
    nomineePhone: params.worker.nomineePhone,
    pendingSalaryDays,
    pendingWagesEarned,
    pendingSalaryNote,
    leaveEncashmentDays: defaultLeaveDays,
    leaveEncashmentAmount,
    noticePeriodRequiredDays,
    noticePeriodServedDays,
    noticeShortfallDays,
    noticePayDailyRate,
    noticePayRecovery,
    noticePayWaived,
    noticeRecoveryFormula,
    gratuityCalculation: gratuityCalc,
    gratuityPayable,
    advanceAndEwaRecovery,
    statutoryDeductions,
    grossFnfPayable,
    fnfWageNetPayable,
    excessRecoveryCarryover,
    netFnfPayable,
    status: existing?.status || 'DRAFT',
    previousStatusBeforeHold: existing?.previousStatusBeforeHold,
    approvedAt: existing?.approvedAt,
    approvedBy: existing?.approvedBy,
    settledAt: existing?.settledAt,
    settledBy: existing?.settledBy,
    notes: params.notes ?? existing?.notes,
    createdAt: existing?.createdAt || triggeredAt,
    deadlineTracking: {
      workingDaysLimit: FNF_WORKING_DAYS_LIMIT,
      baseDeadlineAt,
      effectiveDeadlineAt,
      totalPausedMs,
      holdStartedAt: existing?.deadlineTracking?.holdStartedAt,
      isPaused: Boolean(existing?.deadlineTracking?.isPaused),
      gratuityDeadlineAt,
      interestRateAnnualPct: FNF_INTEREST_PENALTY_ANNUAL_PCT,
      breachNotifiedAt: existing?.deadlineTracking?.breachNotifiedAt,
    },
    legalHold: existing?.legalHold,
    paymentSchedules: {
      wageFnf: {
        id: `${fnfId}_sched_wage`,
        label: 'Schedule A · Wage & Leave FnF Settlement',
        legalBasis: 'Sec 17(2), Code on Wages (2 Working Days)',
        amount: fnfWageNetPayable,
        dueAt: effectiveDeadlineAt,
        status: existing?.paymentSchedules?.wageFnf?.status || 'PENDING',
        paidAt: existing?.paymentSchedules?.wageFnf?.paidAt,
        paidBy: existing?.paymentSchedules?.wageFnf?.paidBy,
        interestPenaltyPaid:
          existing?.paymentSchedules?.wageFnf?.interestPenaltyPaid,
        offCyclePayrollId: existing?.paymentSchedules?.wageFnf?.offCyclePayrollId,
      },
      gratuity: {
        id: `${fnfId}_sched_gratuity`,
        label: 'Schedule B · Statutory Gratuity Settlement',
        legalBasis: 'Sec 7(3), Payment of Gratuity Act (30 Calendar Days)',
        amount: gratuityPayable,
        dueAt: gratuityDeadlineAt,
        status:
          gratuityPayable > 0
            ? existing?.paymentSchedules?.gratuity?.status &&
              existing.paymentSchedules.gratuity.status !== 'NOT_APPLICABLE'
              ? existing.paymentSchedules.gratuity.status
              : 'PENDING'
            : 'NOT_APPLICABLE',
        paidAt: existing?.paymentSchedules?.gratuity?.paidAt,
        paidBy: existing?.paymentSchedules?.gratuity?.paidBy,
        offCyclePayrollId:
          existing?.paymentSchedules?.gratuity?.offCyclePayrollId,
      },
    },
  };
}

/**
 * Automatically triggers & persists a DRAFT FnF Statement when an employee is marked RESIGNED or TERMINATED.
 */
export async function triggerAutomatedDraftFnf(params: {
  tenantId: string;
  worker: Worker;
  exitDate: string;
  exitReason: GratuityExitReason;
  actorEmail: string;
  deathInService?: boolean;
  nomineeName?: string;
  nomineeRelation?: string;
  leaveEncashmentDays?: number;
  noticePeriodRequiredDays?: number;
  noticePeriodServedDays?: number;
  noticePayWaived?: boolean;
  attendanceRecords?: AttendanceRecord[];
  advances?: Advance[];
  orgSettings?: OrgSettings | null;
  notes?: string;
}): Promise<FnfSettlementRecord> {
  const existingList = await getFnfSettlements(params.tenantId);
  const targetId = `fnf_${params.worker.id}_${normalizeFlexibleDateString(params.exitDate) || getTodayLocalIso()}`;
  const existing = existingList.find((r) => r.id === targetId) || null;

  const [att, adv, settings] = await Promise.all([
    params.attendanceRecords
      ? Promise.resolve(params.attendanceRecords)
      : dbService.getAttendanceHistory(params.tenantId),
    params.advances
      ? Promise.resolve(params.advances)
      : dbService.getAdvances(params.tenantId),
    params.orgSettings !== undefined
      ? Promise.resolve(params.orgSettings)
      : dbService.getOrgSettings(params.tenantId),
  ]);

  const draft = computeFnfSettlementStatement({
    tenantId: params.tenantId,
    worker: params.worker,
    exitDate: params.exitDate,
    exitReason: params.exitReason,
    deathInService: params.deathInService,
    nomineeName: params.nomineeName,
    nomineeRelation: params.nomineeRelation,
    leaveEncashmentDays: params.leaveEncashmentDays,
    noticePeriodRequiredDays: params.noticePeriodRequiredDays,
    noticePeriodServedDays: params.noticePeriodServedDays,
    noticePayWaived: params.noticePayWaived,
    attendanceRecords: att,
    advances: adv,
    orgSettings: settings,
    notes:
      params.notes ||
      `Auto-triggered DRAFT FnF upon ${mapExitReasonToSeparationStatus(params.exitReason)} (${params.exitDate})`,
    existingRecord: existing,
  });

  // Always start as DRAFT unless already approved/settled
  const recordToSave: FnfSettlementRecord = {
    ...draft,
    status: existing && existing.status !== 'DRAFT' ? existing.status : 'DRAFT',
  };

  await saveFnfSettlement(recordToSave, params.actorEmail);
  await syncFnfBreachAlerts(params.tenantId, params.actorEmail, settings);
  return recordToSave;
}

export async function approveFnfSettlement(
  tenantId: string,
  fnfId: string,
  actorEmail: string
): Promise<FnfSettlementRecord | null> {
  const list = await getFnfSettlements(tenantId);
  const target = list.find((r) => r.id === fnfId);
  if (!target) return null;
  if (target.status === 'LEGAL_HOLD') {
    throw new Error('Release LEGAL_HOLD before approving this FnF settlement.');
  }
  const nowIso = new Date().toISOString();
  const updated: FnfSettlementRecord = {
    ...target,
    status: target.status === 'SETTLED' ? 'SETTLED' : 'APPROVED',
    approvedAt: target.approvedAt || nowIso,
    approvedBy: target.approvedBy || actorEmail,
  };
  await saveFnfSettlement(updated, actorEmail);
  return updated;
}

export async function placeLegalHold(
  tenantId: string,
  fnfId: string,
  category: FnfLegalHoldCategory,
  reason: string,
  actorEmail: string,
  orgSettings?: OrgSettings | null
): Promise<FnfSettlementRecord | null> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A legal hold reason is required (e.g., Employee absconded or company property not returned).');
  }
  const list = await getFnfSettlements(tenantId);
  const target = list.find((r) => r.id === fnfId);
  if (!target) return null;
  if (target.status === 'SETTLED') {
    throw new Error('Cannot place a legal hold on an already settled FnF.');
  }

  const nowIso = new Date().toISOString();
  const baseDeadline =
    target.deadlineTracking?.baseDeadlineAt ||
    addWorkingDaysDeadlineIso(target.exitDate, FNF_WORKING_DAYS_LIMIT, orgSettings);
  const effectiveDeadline =
    target.deadlineTracking?.effectiveDeadlineAt || baseDeadline;
  const gratuityDeadline =
    target.deadlineTracking?.gratuityDeadlineAt ||
    addCalendarDaysDeadlineIso(target.exitDate, FNF_GRATUITY_DAYS_LIMIT);

  const prevStatus: 'DRAFT' | 'APPROVED' =
    target.status === 'APPROVED' ? 'APPROVED' : 'DRAFT';

  const prevHistory = target.legalHold?.history || [];
  const updated: FnfSettlementRecord = {
    ...target,
    status: 'LEGAL_HOLD',
    previousStatusBeforeHold: prevStatus,
    deadlineTracking: {
      workingDaysLimit: target.deadlineTracking?.workingDaysLimit || FNF_WORKING_DAYS_LIMIT,
      baseDeadlineAt: baseDeadline,
      effectiveDeadlineAt: effectiveDeadline,
      totalPausedMs: target.deadlineTracking?.totalPausedMs || 0,
      holdStartedAt: target.deadlineTracking?.isPaused
        ? target.deadlineTracking.holdStartedAt || nowIso
        : nowIso,
      isPaused: true,
      gratuityDeadlineAt: gratuityDeadline,
      interestRateAnnualPct:
        target.deadlineTracking?.interestRateAnnualPct ||
        FNF_INTEREST_PENALTY_ANNUAL_PCT,
      breachNotifiedAt: target.deadlineTracking?.breachNotifiedAt,
    },
    legalHold: {
      active: true,
      category,
      reason: cleanReason,
      placedAt: nowIso,
      placedBy: actorEmail,
      history: [
        ...prevHistory,
        {
          action: 'PLACED',
          category,
          reason: cleanReason,
          actor: actorEmail,
          at: nowIso,
        },
      ],
    },
    paymentSchedules: target.paymentSchedules
      ? {
          ...target.paymentSchedules,
          wageFnf: {
            ...target.paymentSchedules.wageFnf,
            status:
              target.paymentSchedules.wageFnf.status === 'PAID'
                ? 'PAID'
                : 'PAUSED_HOLD',
          },
        }
      : undefined,
  };

  await saveFnfSettlement(updated, actorEmail);
  return updated;
}

export async function releaseLegalHold(
  tenantId: string,
  fnfId: string,
  actorEmail: string,
  releaseNote?: string
): Promise<FnfSettlementRecord | null> {
  const list = await getFnfSettlements(tenantId);
  const target = list.find((r) => r.id === fnfId);
  if (!target) return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const holdStartMs = target.deadlineTracking?.holdStartedAt
    ? new Date(target.deadlineTracking.holdStartedAt).getTime()
    : nowMs;
  const pausedDeltaMs = Math.max(0, nowMs - holdStartMs);
  const prevPausedMs = target.deadlineTracking?.totalPausedMs || 0;
  const nextTotalPausedMs = prevPausedMs + pausedDeltaMs;

  const prevEffectiveMs = target.deadlineTracking?.effectiveDeadlineAt
    ? new Date(target.deadlineTracking.effectiveDeadlineAt).getTime()
    : nowMs;
  const nextEffectiveDeadlineAt = new Date(
    prevEffectiveMs + pausedDeltaMs
  ).toISOString();

  const restoredStatus = target.previousStatusBeforeHold || 'APPROVED';
  const prevHistory = target.legalHold?.history || [];

  const updated: FnfSettlementRecord = {
    ...target,
    status: restoredStatus,
    previousStatusBeforeHold: undefined,
    deadlineTracking: target.deadlineTracking
      ? {
          ...target.deadlineTracking,
          effectiveDeadlineAt: nextEffectiveDeadlineAt,
          totalPausedMs: nextTotalPausedMs,
          holdStartedAt: undefined,
          isPaused: false,
        }
      : undefined,
    legalHold: target.legalHold
      ? {
          ...target.legalHold,
          active: false,
          releasedAt: nowIso,
          releasedBy: actorEmail,
          history: [
            ...prevHistory,
            {
              action: 'RELEASED',
              reason: releaseNote?.trim() || 'Clearance completed / legal hold lifted',
              actor: actorEmail,
              at: nowIso,
            },
          ],
        }
      : undefined,
    paymentSchedules: target.paymentSchedules
      ? {
          ...target.paymentSchedules,
          wageFnf: {
            ...target.paymentSchedules.wageFnf,
            dueAt: nextEffectiveDeadlineAt,
            status:
              target.paymentSchedules.wageFnf.status === 'PAID'
                ? 'PAID'
                : 'PENDING',
          },
        }
      : undefined,
  };

  await saveFnfSettlement(updated, actorEmail);
  return updated;
}

// ==========================================
// OFF-CYCLE FNF PAYROLL & SEPARATE PAYSLIP
// ==========================================

export function getSyncOffCycleFnfPayrolls(tenantId: string): MonthlyPayroll[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(OFFCYCLE_FNF_STORAGE_KEY(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getOffCycleFnfPayrolls(
  tenantId: string
): Promise<MonthlyPayroll[]> {
  const local = getSyncOffCycleFnfPayrolls(tenantId);
  if (!tenantId || tenantId.startsWith('demo-')) return local;

  try {
    const q = query(
      collection(db, 'fnf_offcycle_payrolls'),
      where('tenantId', '==', tenantId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return local;
    const remote = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as MonthlyPayroll)
    );
    const map = new Map<string, MonthlyPayroll>();
    local.forEach((p) => map.set(p.id, p));
    remote.forEach((p) => map.set(p.id, p));
    const merged = Array.from(map.values()).sort((a, b) =>
      (b.paidAt || b.month).localeCompare(a.paidAt || a.month)
    );
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        OFFCYCLE_FNF_STORAGE_KEY(tenantId),
        JSON.stringify(merged)
      );
    }
    return merged;
  } catch {
    return local;
  }
}

async function saveOffCycleFnfPayroll(
  payroll: MonthlyPayroll
): Promise<MonthlyPayroll> {
  const existing = getSyncOffCycleFnfPayrolls(payroll.tenantId);
  const idx = existing.findIndex((p) => p.id === payroll.id);
  const next = [...existing];
  if (idx >= 0) next[idx] = payroll;
  else next.unshift(payroll);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      OFFCYCLE_FNF_STORAGE_KEY(payroll.tenantId),
      JSON.stringify(next)
    );
  }

  if (payroll.tenantId && !payroll.tenantId.startsWith('demo-')) {
    try {
      await setDoc(
        doc(db, 'fnf_offcycle_payrolls', payroll.id),
        payroll,
        { merge: true }
      );
    } catch (e) {
      console.warn('Firestore saveOffCycleFnfPayroll skipped/failed:', e);
    }
  }
  return payroll;
}

/**
 * Builds a dedicated Off-Cycle FnF Payslip object from an FnfSettlementRecord,
 * usable both for preview before payment and after off-cycle disbursement.
 */
export function buildOffCycleFnfPayslip(params: {
  record: FnfSettlementRecord;
  scheduleTarget: 'WAGE_FNF' | 'GRATUITY' | 'BOTH';
  worker?: Worker | null;
  monthlyPayrollForExitMonth?: MonthlyPayroll;
  evaluationTimeMs?: number;
  orgSettings?: OrgSettings | null;
  includeInterestPenalty?: boolean;
  isPaid?: boolean;
  paidAtIso?: string;
}): MonthlyPayroll {
  const { record, scheduleTarget } = params;
  const evalInfo = evaluateFnfDeadline(
    record,
    params.evaluationTimeMs ?? Date.now(),
    params.orgSettings
  );
  const exitMonth = record.exitDate.slice(0, 7);
  const basePayroll = params.monthlyPayrollForExitMonth;

  const includeWage = scheduleTarget === 'WAGE_FNF' || scheduleTarget === 'BOTH';
  const includeGratuity =
    (scheduleTarget === 'GRATUITY' || scheduleTarget === 'BOTH') &&
    record.gratuityPayable > 0;

  const includeInterest = Boolean(
    includeWage &&
      (params.includeInterestPenalty ?? evalInfo.accruedInterestPenalty > 0)
  );
  const interestAmount = includeInterest ? evalInfo.accruedInterestPenalty : 0;

  const pendingWages = includeWage ? record.pendingWagesEarned : 0;
  const leaveEncashment = includeWage ? record.leaveEncashmentAmount : 0;
  const overtimePay = includeWage ? basePayroll?.earnings.overtime || 0 : 0;
  const otherAllowances = includeWage
    ? round2((basePayroll?.earnings.allowances.other || 0) + leaveEncashment)
    : 0;
  const basicOrWages = includeWage
    ? round2(
        Math.max(
          0,
          pendingWages -
            overtimePay -
            (basePayroll?.earnings.allowances.other || 0)
        )
      )
    : 0;

  const gross = round2(pendingWages + leaveEncashment + interestAmount);

  const noticeRecovery = includeWage ? record.noticePayRecovery || 0 : 0;
  const advanceRecovery = includeWage ? record.advanceAndEwaRecovery || 0 : 0;
  const statutoryDed = includeWage ? record.statutoryDeductions || 0 : 0;

  const deductionDetails: { description: string; amount: number }[] = [];
  if (noticeRecovery > 0) {
    deductionDetails.push({
      description: `Notice Pay Recovery (${record.noticeShortfallDays || 0} unserved days × ₹${(record.noticePayDailyRate || 0).toLocaleString('en-IN')}/day)`,
      amount: noticeRecovery,
    });
  }
  if (advanceRecovery > 0) {
    deductionDetails.push({
      description: 'Advance / Loan / Kharchi & EWA Recovery (FnF)',
      amount: advanceRecovery,
    });
  }
  if (includeWage && basePayroll?.deductions?.details) {
    basePayroll.deductions.details.forEach((d) => {
      if (
        !d.description.toLowerCase().includes('advance') &&
        !d.description.toLowerCase().includes('kharchi') &&
        !d.description.toLowerCase().includes('ewa')
      ) {
        deductionDetails.push(d);
      }
    });
  } else if (statutoryDed > 0) {
    deductionDetails.push({
      description: 'Statutory Deductions (EPF / ESI / PT / TDS)',
      amount: statutoryDed,
    });
  }

  const totalDeductions = round2(
    noticeRecovery + advanceRecovery + statutoryDed
  );
  const wageNetPay = includeWage
    ? Math.max(0, round2(gross - totalDeductions))
    : 0;
  const gratuityAmt = includeGratuity ? record.gratuityPayable : 0;
  const netPayable = round2(wageNetPay + gratuityAmt);

  const scheduleLabel =
    scheduleTarget === 'WAGE_FNF'
      ? 'Off-Cycle Schedule A · Wages & Leave FnF (Sec 17(2) · 2 Working Days)'
      : scheduleTarget === 'GRATUITY'
      ? 'Off-Cycle Schedule B · Statutory Gratuity (Sec 7(3) · 30 Days)'
      : 'Off-Cycle Combined Full & Final Settlement';

  return {
    id: `offcycle_${record.id}_${scheduleTarget}`,
    tenantId: record.tenantId,
    workerId: record.workerId,
    workerName: record.workerName,
    workerDesignation: record.designation,
    workerDepartment: record.department,
    month: exitMonth,
    isOffCycleFnf: true,
    offCycleType:
      scheduleTarget === 'WAGE_FNF'
        ? 'WAGE_FNF'
        : scheduleTarget === 'GRATUITY'
        ? 'GRATUITY_SETTLEMENT'
        : 'COMBINED_FNF',
    paidAt: params.isPaid ? params.paidAtIso || new Date().toISOString() : undefined,
    attendanceSummary: basePayroll?.attendanceSummary || {
      totalDays: record.pendingSalaryDays,
      presentDays: record.pendingSalaryDays,
      absentDays: 0,
      halfDays: 0,
      weeklyOffs: 0,
      publicHolidays: 0,
      holidayWorkedDays: 0,
      payableDays: record.pendingSalaryDays,
      totalRegularHours: record.pendingSalaryDays * 8,
      totalOvertimeHours: 0,
      paidLeaves: record.leaveEncashmentDays,
      unpaidLeaves: 0,
    },
    earnings: {
      basic: basicOrWages,
      overtime: overtimePay,
      allowances: {
        travel: 0,
        food: 0,
        other: otherAllowances,
      },
      gross,
    },
    deductions: {
      advances: advanceRecovery,
      processingFee: noticeRecovery,
      canteen: 0,
      total: totalDeductions,
      details: deductionDetails,
    },
    statutory: includeWage ? basePayroll?.statutory : undefined,
    ...(gratuityAmt > 0 ? { gratuitySettlement: gratuityAmt } : {}),
    fnfSummary: {
      isFnF: true,
      exitDate: record.exitDate,
      exitReason: record.exitReason,
      separationStatus: record.separationStatus,
      deathInService: record.deathInService,
      gratuityPayable: record.gratuityPayable,
      roundedYears: record.gratuityCalculation.effectiveYearsForFormula,
      lastDrawnBasicPlusDa: record.gratuityCalculation.lastDrawnBasicPlusDa,
      nomineeName: record.nomineeName,
      nomineeRelation: record.nomineeRelation,
      ceilingApplied: record.gratuityCalculation.ceilingApplied,
      fnfRecordId: record.id,
      pendingSalaryDays: record.pendingSalaryDays,
      pendingWagesEarned: record.pendingWagesEarned,
      leaveEncashmentDays: record.leaveEncashmentDays,
      leaveEncashmentAmount: record.leaveEncashmentAmount,
      noticePeriodRequiredDays: record.noticePeriodRequiredDays,
      noticePeriodServedDays: record.noticePeriodServedDays,
      noticeShortfallDays: record.noticeShortfallDays,
      noticePayDailyRate: record.noticePayDailyRate,
      noticePayRecovery: record.noticePayRecovery,
      noticePayWaived: record.noticePayWaived,
      advanceAndEwaRecovery: record.advanceAndEwaRecovery,
      statutoryDeductions: record.statutoryDeductions,
      interestPenaltyAmount: interestAmount,
      interestRateAnnualPct: evalInfo.interestRateAnnualPct,
      overdueDays: evalInfo.overdueWholeDays,
      wageDeadlineAt: evalInfo.effectiveDeadlineIso,
      gratuityDeadlineAt: evalInfo.gratuityDeadlineIso,
      deadlineMet: evalInfo.overdueMs <= 0,
      legalHoldActive: evalInfo.isPaused,
      legalHoldReason: record.legalHold?.reason,
      scheduleLabel,
      wageFnfNetPayable: record.fnfWageNetPayable,
    },
    netPayable,
    carriedForwardAdvance: record.excessRecoveryCarryover || 0,
    status: params.isPaid ? 'PAID' : 'DRAFT',
  };
}

/**
 * Processes an FnF payout as an Off-Cycle Payroll run and generates a separate FnF Payslip.
 */
export async function processOffCycleFnfPayout(params: {
  tenantId: string;
  fnfId: string;
  scheduleTarget: 'WAGE_FNF' | 'GRATUITY' | 'BOTH';
  actorEmail: string;
  workers?: Worker[];
  attendanceRecords?: AttendanceRecord[];
  advances?: Advance[];
  orgSettings?: OrgSettings | null;
  processedAtIso?: string;
  includeInterestPenalty?: boolean;
}): Promise<{
  record: FnfSettlementRecord;
  offCyclePayroll: MonthlyPayroll;
}> {
  const list = await getFnfSettlements(params.tenantId);
  const existing = list.find((r) => r.id === params.fnfId);
  if (!existing) {
    throw new Error('FnF settlement record not found.');
  }
  if (existing.status === 'LEGAL_HOLD') {
    throw new Error('Release LEGAL_HOLD before processing off-cycle FnF payout.');
  }
  if (existing.status === 'DRAFT') {
    throw new Error('Admin must approve the Draft FnF statement before processing off-cycle payment.');
  }

  const paidAtIso = params.processedAtIso || new Date().toISOString();
  const evalMs = new Date(paidAtIso).getTime();

  const [workers, att, adv, settings] = await Promise.all([
    params.workers
      ? Promise.resolve(params.workers)
      : dbService.getWorkers(params.tenantId),
    params.attendanceRecords
      ? Promise.resolve(params.attendanceRecords)
      : dbService.getAttendanceHistory(params.tenantId),
    params.advances
      ? Promise.resolve(params.advances)
      : dbService.getAdvances(params.tenantId),
    params.orgSettings !== undefined
      ? Promise.resolve(params.orgSettings)
      : dbService.getOrgSettings(params.tenantId),
  ]);

  const worker = workers.find((w) => w.id === existing.workerId) || null;
  const monthlyPayroll =
    worker && settings
      ? wageService.generateMonthlyPayroll(
          worker,
          existing.exitDate.slice(0, 7),
          att,
          adv,
          settings
        )
      : undefined;

  const offCyclePayroll = buildOffCycleFnfPayslip({
    record: existing,
    scheduleTarget: params.scheduleTarget,
    worker,
    monthlyPayrollForExitMonth: monthlyPayroll,
    evaluationTimeMs: evalMs,
    orgSettings: settings,
    includeInterestPenalty: params.includeInterestPenalty,
    isPaid: true,
    paidAtIso,
  });

  await saveOffCycleFnfPayroll(offCyclePayroll);

  const wagePaid =
    params.scheduleTarget === 'WAGE_FNF' ||
    params.scheduleTarget === 'BOTH' ||
    existing.paymentSchedules?.wageFnf.status === 'PAID';
  const gratApplicable = existing.gratuityPayable > 0;
  const gratPaid =
    !gratApplicable ||
    params.scheduleTarget === 'GRATUITY' ||
    params.scheduleTarget === 'BOTH' ||
    existing.paymentSchedules?.gratuity.status === 'PAID';

  const evalRes = evaluateFnfDeadline(existing, evalMs, settings);

  const updatedRecord: FnfSettlementRecord = {
    ...existing,
    status: wagePaid && gratPaid ? 'SETTLED' : 'APPROVED',
    settledAt: wagePaid && gratPaid ? paidAtIso : existing.settledAt,
    settledBy: wagePaid && gratPaid ? params.actorEmail : existing.settledBy,
    paymentSchedules: existing.paymentSchedules
      ? {
          wageFnf:
            params.scheduleTarget === 'WAGE_FNF' ||
            params.scheduleTarget === 'BOTH'
              ? {
                  ...existing.paymentSchedules.wageFnf,
                  status: 'PAID',
                  paidAt: paidAtIso,
                  paidBy: params.actorEmail,
                  interestPenaltyPaid:
                    offCyclePayroll.fnfSummary?.interestPenaltyAmount || 0,
                  offCyclePayrollId: offCyclePayroll.id,
                }
              : existing.paymentSchedules.wageFnf,
          gratuity:
            gratApplicable &&
            (params.scheduleTarget === 'GRATUITY' ||
              params.scheduleTarget === 'BOTH')
              ? {
                  ...existing.paymentSchedules.gratuity,
                  status: 'PAID',
                  paidAt: paidAtIso,
                  paidBy: params.actorEmail,
                  offCyclePayrollId: offCyclePayroll.id,
                }
              : existing.paymentSchedules.gratuity,
        }
      : undefined,
  };

  await saveFnfSettlement(updatedRecord, params.actorEmail);

  // Mark unpaid advances/loans recovered when Wage FnF schedule is disbursed
  if (
    params.scheduleTarget === 'WAGE_FNF' ||
    params.scheduleTarget === 'BOTH'
  ) {
    const unpaid = adv.filter(
      (a) =>
        a.workerId === existing.workerId &&
        !a.repaid &&
        (a.status === 'APPROVED' || !a.status) &&
        a.date <= existing.exitDate
    );
    for (const a of unpaid) {
      try {
        await dbService.updateAdvanceRecord({
          ...a,
          repaid: true,
          status: 'REPAID',
        });
      } catch {
        // ignore demo storage edge cases
      }
    }
  }

  await dbService.addNotification({
    tenantId: params.tenantId,
    title: `Off-Cycle FnF Paid · ${existing.workerName}`,
    message: `${offCyclePayroll.fnfSummary?.scheduleLabel || 'FnF Settlement'} of ₹${offCyclePayroll.netPayable.toLocaleString('en-IN')} processed (${evalRes.overdueMs <= 0 ? 'Section 17(2) Deadline Met' : `${evalRes.overdueWholeDays}d overdue`}).`,
    type: evalRes.overdueMs <= 0 ? 'INFO' : 'WARNING',
    createdAt: paidAtIso,
    read: false,
  });

  return { record: updatedRecord, offCyclePayroll };
}

/**
 * Scans FnF settlements for Section 17(2) 2-working-day breaches, flags overdue items,
 * and pushes an URGENT alert into the Admin Action Inbox + Notification feed once per breach.
 */
export async function syncFnfBreachAlerts(
  tenantId: string,
  _actorEmail: string = 'system@workforcepro.in',
  orgSettings?: OrgSettings | null
): Promise<FnfSettlementRecord[]> {
  if (!tenantId) return [];
  const records = await getFnfSettlements(tenantId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let changed = false;

  const updatedRecords: FnfSettlementRecord[] = [];

  for (const rec of records) {
    const ev = evaluateFnfDeadline(rec, nowMs, orgSettings);
    if (ev.isBreached && !rec.deadlineTracking?.breachNotifiedAt) {
      const inboxItem: InboxItem = {
        id: `fnf-breach-${rec.id}`,
        tenantId,
        actionType: 'FNF_DEADLINE_BREACH',
        urgency: 'URGENT',
        status: 'PENDING',
        workerId: rec.workerId,
        workerName: rec.workerName,
        workerDesignation: rec.designation,
        title: `URGENT: FnF 2-Working-Day Deadline Breached (${rec.workerName})`,
        description: `Sec 17(2) Code on Wages deadline (${ev.effectiveDeadlineLabel}) missed by ${ev.overdueWholeDays} day(s). Accrued 12% p.a. interest penalty: ₹${ev.accruedInterestPenalty.toLocaleString('en-IN')} (+₹${ev.dailyInterestCost.toLocaleString('en-IN')}/day).`,
        timestamp: nowIso,
        amount: Math.round(
          (rec.fnfWageNetPayable ?? rec.netFnfPayable) + ev.accruedInterestPenalty
        ),
        isLowRisk: false,
        details: {
          fnfSettlement: rec,
          overdueDays: ev.overdueWholeDays,
          interestPenalty: ev.accruedInterestPenalty,
          reason: `Exited ${rec.exitDate} (${rec.separationStatus || rec.exitReason})`,
        },
      };

      await inboxService.createCustomItem(tenantId, inboxItem);
      await dbService.addNotification({
        tenantId,
        title: `Sec 17(2) FnF Breach: ${rec.workerName}`,
        message: `2-working-day settlement deadline breached by ${ev.overdueWholeDays}d. 12% p.a. interest cost: ₹${ev.accruedInterestPenalty.toLocaleString('en-IN')}.`,
        type: 'WARNING',
        createdAt: nowIso,
        read: false,
      });

      const stamped: FnfSettlementRecord = {
        ...rec,
        deadlineTracking: {
          workingDaysLimit:
            rec.deadlineTracking?.workingDaysLimit || FNF_WORKING_DAYS_LIMIT,
          baseDeadlineAt: ev.baseDeadlineIso,
          effectiveDeadlineAt: ev.effectiveDeadlineIso,
          totalPausedMs: rec.deadlineTracking?.totalPausedMs || 0,
          holdStartedAt: rec.deadlineTracking?.holdStartedAt,
          isPaused: ev.isPaused,
          gratuityDeadlineAt: ev.gratuityDeadlineIso,
          interestRateAnnualPct: ev.interestRateAnnualPct,
          breachNotifiedAt: nowIso,
        },
      };
      changed = true;
      updatedRecords.push(stamped);
    } else {
      updatedRecords.push(rec);
    }
  }

  if (changed && typeof localStorage !== 'undefined') {
    localStorage.setItem(
      `fnf_settlements_${tenantId || 'demo-tenant-id'}`,
      JSON.stringify(updatedRecords)
    );
  }

  return updatedRecords;
}

export function getSyncFnfSettlementForWorker(
  tenantId: string,
  workerId: string
): FnfSettlementRecord | null {
  const list = getSyncFnfSettlements(tenantId);
  const matches = list
    .filter((r) => r.workerId === workerId)
    .sort((a, b) => b.exitDate.localeCompare(a.exitDate));
  return matches[0] || null;
}

export const fnfService = {
  FNF_WORKING_DAYS_LIMIT,
  FNF_GRATUITY_DAYS_LIMIT,
  FNF_INTEREST_PENALTY_ANNUAL_PCT,
  isOrgWorkingDay,
  addWorkingDaysDeadlineIso,
  addCalendarDaysDeadlineIso,
  mapExitReasonToSeparationStatus,
  mapWorkerStatusToExitReason,
  formatDurationMs,
  evaluateFnfDeadline,
  computeFnfSettlementStatement,
  triggerAutomatedDraftFnf,
  approveFnfSettlement,
  placeLegalHold,
  releaseLegalHold,
  getSyncOffCycleFnfPayrolls,
  getOffCycleFnfPayrolls,
  buildOffCycleFnfPayslip,
  processOffCycleFnfPayout,
  syncFnfBreachAlerts,
  getSyncFnfSettlementForWorker,
};
