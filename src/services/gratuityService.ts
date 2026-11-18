// src/services/gratuityService.ts
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Advance,
  AttendanceRecord,
  FnfSettlementRecord,
  GratuityCalculationResult,
  GratuityEligibilityRule,
  GratuityExitReason,
  GratuityOrgProjection,
  GratuityTenureBreakdown,
  MonthlyPayroll,
  OrgSettings,
  Worker,
} from '../types/index';
import { validateWorkerWageStructure } from './wageStructureValidationService';
import { tenantSecurityService } from './tenantSecurityService';

export const GRATUITY_STATUTORY_CEILING = 2000000; // ₹20,00,000 (₹20 Lakhs)
export const NOV_2025_CODE_EFFECTIVE_DATE = '2025-11-21';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  iso: string; // YYYY-MM-DD
  utcMs: number;
}

/**
 * Parses YYYY-MM-DD, ISO timestamps, DD/MM/YYYY, or DD-MM-YYYY safely in UTC.
 */
export function parseFlexibleDate(input?: string | null): ParsedDate | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (isValidYmd(year, month, day)) {
      return buildParsedDate(year, month, day);
    }
  }

  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (isValidYmd(year, month, day)) {
      return buildParsedDate(year, month, day);
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth() + 1;
    const day = parsed.getUTCDate();
    return buildParsedDate(year, month, day);
  }

  return null;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1950 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function buildParsedDate(year: number, month: number, day: number): ParsedDate {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    year,
    month,
    day,
    iso,
    utcMs: Date.UTC(year, month - 1, day),
  };
}

export function normalizeFlexibleDateString(input?: string | null): string | undefined {
  return parseFlexibleDate(input)?.iso;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function diffCalendarYmd(start: ParsedDate, end: ParsedDate): {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  continuousYearsExact: number;
} {
  if (end.utcMs <= start.utcMs) {
    return { years: 0, months: 0, days: 0, totalMonths: 0, continuousYearsExact: 0 };
  }

  let years = end.year - start.year;
  let months = end.month - start.month;
  let days = end.day - start.day;

  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(Date.UTC(end.year, end.month - 1, 0)).getUTCDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  const continuousYearsExact = Number((years + months / 12 + days / 365.25).toFixed(4));

  return { years, months, days, totalMonths, continuousYearsExact };
}

/**
 * Calculates continuous service tenure, aggregating prior subsidiary service
 * when transferred without a break, and applying Payment of Gratuity Act >6 months
 * final-year round-up logic.
 */
export function calculateContinuousTenure(
  joiningDateStr: string,
  asOfOrExitDateStr?: string,
  subsidiaryTransfer?: Worker['subsidiaryTransfer']
): GratuityTenureBreakdown {
  const entityStart = parseFlexibleDate(joiningDateStr) || parseFlexibleDate(getTodayIso())!;
  const end = parseFlexibleDate(asOfOrExitDateStr) || parseFlexibleDate(getTodayIso())!;

  let effectiveStart = entityStart;
  let continuousServiceAggregated = false;
  let priorSubsidiaryMonths = 0;
  let breakInServiceDetected = false;
  let breakInServiceNote: string | undefined;

  if (subsidiaryTransfer?.transferredFromSubsidiary) {
    const prevJoin = parseFlexibleDate(subsidiaryTransfer.previousJoiningDate);
    const transferDate = parseFlexibleDate(subsidiaryTransfer.transferDate) || entityStart;

    if (subsidiaryTransfer.noBreakInService && prevJoin && prevJoin.utcMs <= entityStart.utcMs) {
      effectiveStart = prevJoin;
      continuousServiceAggregated = true;
      const priorDiff = diffCalendarYmd(prevJoin, transferDate);
      priorSubsidiaryMonths = priorDiff.totalMonths;
    } else if (!subsidiaryTransfer.noBreakInService) {
      breakInServiceDetected = true;
      breakInServiceNote =
        'Break in service occurred during subsidiary transfer — prior subsidiary tenure excluded from continuous service.';
    }
  }

  const diff = diffCalendarYmd(effectiveStart, end);

  // Payment of Gratuity Act Sec 4(2): Any period exceeding 6 months in the final year rounds up to the next whole year
  const exceedsSixMonthsInFinalYear = diff.months > 6 || (diff.months === 6 && diff.days > 0);
  const roundedServiceYears = exceedsSixMonthsInFinalYear ? diff.years + 1 : diff.years;

  const formattedTenure = `${diff.years}y ${diff.months}m ${diff.days}d`;

  return {
    entityStartDate: entityStart.iso,
    effectiveStartDate: effectiveStart.iso,
    endDate: end.iso,
    continuousServiceAggregated,
    subsidiaryName: subsidiaryTransfer?.subsidiaryName,
    priorSubsidiaryMonths,
    breakInServiceDetected,
    breakInServiceNote,
    years: diff.years,
    months: diff.months,
    days: diff.days,
    totalMonths: diff.totalMonths,
    continuousYearsExact: diff.continuousYearsExact,
    exceedsSixMonthsInFinalYear,
    roundedServiceYears,
    formattedTenure,
  };
}

/**
 * Resolves Last Drawn Basic + DA as of the evaluation/exit date.
 * Strictly uses the latest revised Basic + DA (never historical averages).
 */
export function resolveLastDrawnBasicAndDa(
  worker: Worker,
  asOfDate: string,
  orgSettings?: OrgSettings
): {
  lastDrawnBasic: number;
  lastDrawnDa: number;
  lastDrawnBasicPlusDa: number;
  previousPreRevisionBasicPlusDa?: number;
  historicalAverageBasicPlusDa?: number;
  salaryRevisionDate?: string;
} {
  const currentAudit = validateWorkerWageStructure(worker, {
    evaluationDate: asOfDate,
    orgSettings,
  });

  const lastDrawnBasic = round2(currentAudit.basicPay);
  const lastDrawnDa = round2(currentAudit.da);
  const lastDrawnBasicPlusDa = round2(lastDrawnBasic + lastDrawnDa);

  let previousPreRevisionBasicPlusDa: number | undefined;
  let historicalAverageBasicPlusDa: number | undefined;

  if (worker.previousWageConfig) {
    const prevWorker: Worker = {
      ...worker,
      wageConfig: worker.previousWageConfig,
      salaryRevisionDate: undefined,
      previousWageConfig: undefined,
    };
    const prevAudit = validateWorkerWageStructure(prevWorker, {
      evaluationDate: asOfDate,
      orgSettings,
      ignoreRevisionCutoff: true,
    });
    previousPreRevisionBasicPlusDa = round2(prevAudit.basicPay + prevAudit.da);
    if (previousPreRevisionBasicPlusDa > 0 && previousPreRevisionBasicPlusDa !== lastDrawnBasicPlusDa) {
      historicalAverageBasicPlusDa = round2((previousPreRevisionBasicPlusDa + lastDrawnBasicPlusDa) / 2);
    }
  } else if (typeof worker.previousWageAmount === 'number' && worker.previousWageAmount > 0) {
    previousPreRevisionBasicPlusDa = round2(worker.previousWageAmount * 0.5);
    historicalAverageBasicPlusDa = round2((previousPreRevisionBasicPlusDa + lastDrawnBasicPlusDa) / 2);
  }

  return {
    lastDrawnBasic,
    lastDrawnDa,
    lastDrawnBasicPlusDa,
    previousPreRevisionBasicPlusDa,
    historicalAverageBasicPlusDa,
    salaryRevisionDate: worker.salaryRevisionDate,
  };
}

export interface CalculateGratuityOptions {
  asOfDate?: string;
  exitDateOverride?: string;
  exitReasonOverride?: GratuityExitReason;
  deathInServiceOverride?: boolean;
  employmentTypeOverride?: Worker['employmentType'];
  subsidiaryTransferOverride?: Worker['subsidiaryTransfer'];
  nomineeNameOverride?: string;
  nomineeRelationOverride?: string;
  orgSettings?: OrgSettings;
}

/**
 * Core Statutory Gratuity Calculator:
 * Formula: (Last Drawn Basic + DA) × (15 / 26) × Rounded Years of Service
 * Ceiling: ₹20,00,000 (₹20 Lakh)
 * Eligibility:
 *  - DEATH_IN_SERVICE override -> Eligible immediately (no 5-year / 1-year minimum)
 *  - Fixed-Term Employment (on/after 21 Nov 2025) -> 1 completed year
 *  - Standard Permanent -> 5 years continuous service (incl. >6m round-up)
 */
export function calculateWorkerGratuity(
  worker: Worker,
  options: CalculateGratuityOptions = {}
): GratuityCalculationResult {
  const normalizedExit = normalizeFlexibleDateString(options.exitDateOverride ?? worker.dateOfExit);
  const asOfDate =
    normalizeFlexibleDateString(options.asOfDate) || normalizedExit || getTodayIso();

  const entityJoiningDate =
    normalizeFlexibleDateString(worker.dateOfJoining || worker.joinedDate) || asOfDate;

  const subsidiaryTransfer = options.subsidiaryTransferOverride ?? worker.subsidiaryTransfer;
  const tenure = calculateContinuousTenure(entityJoiningDate, asOfDate, subsidiaryTransfer);

  const exitReason = options.exitReasonOverride ?? worker.exitReason;
  const deathInService = Boolean(
    options.deathInServiceOverride ??
      worker.deathInService ??
      (exitReason === 'DEATH_IN_SERVICE')
  );

  const employmentType: Worker['employmentType'] =
    options.employmentTypeOverride ??
    worker.employmentType ??
    (worker.category === 'Daily Wage' ? 'DAILY_WAGE' : 'PERMANENT');

  const isFixedTerm = employmentType === 'FIXED_TERM';
  const isPostNov2025 = asOfDate >= NOV_2025_CODE_EFFECTIVE_DATE;

  const {
    lastDrawnBasic,
    lastDrawnDa,
    lastDrawnBasicPlusDa,
    previousPreRevisionBasicPlusDa,
    historicalAverageBasicPlusDa,
    salaryRevisionDate,
  } = resolveLastDrawnBasicAndDa(worker, asOfDate, options.orgSettings);

  let eligibilityRule: GratuityEligibilityRule = 'NOT_ELIGIBLE';
  let minimumServiceRequiredYears = 5;
  let isEligible = false;
  let isFixedTermNov2025Qualified = false;
  let eligibilityNote = '';

  if (deathInService) {
    eligibilityRule = 'DEATH_IN_SERVICE_OVERRIDE';
    minimumServiceRequiredYears = 0;
    isEligible = true;
    eligibilityNote =
      'DEATH_IN_SERVICE override active: 5-year minimum service requirement waived; payable to nominee.';
  } else if (isFixedTerm && isPostNov2025) {
    minimumServiceRequiredYears = 1;
    // Fixed-term employees qualify upon completing 1 year of continuous service under Nov 2025 Labour Codes
    if (tenure.years >= 1) {
      eligibilityRule = 'ONE_YEAR_FIXED_TERM_NOV_2025';
      isEligible = true;
      isFixedTermNov2025Qualified = true;
      eligibilityNote =
        'Eligible under Nov 2025 Labour Code Fixed-Term 1-Year rule (Code on Social Security).';
    } else {
      eligibilityRule = 'NOT_ELIGIBLE';
      isEligible = false;
      eligibilityNote = `Fixed-term employee requires 1 completed year (current: ${tenure.formattedTenure}).`;
    }
  } else {
    minimumServiceRequiredYears = 5;
    if (tenure.roundedServiceYears >= 5) {
      eligibilityRule = 'FIVE_YEAR_STANDARD';
      isEligible = true;
      eligibilityNote =
        tenure.years < 5 && tenure.exceedsSixMonthsInFinalYear
          ? `Eligible via final-year >6 months round-up (${tenure.formattedTenure} → ${tenure.roundedServiceYears} yrs).`
          : `Eligible with ${tenure.roundedServiceYears} years of continuous service.`;
    } else {
      eligibilityRule = 'NOT_ELIGIBLE';
      isEligible = false;
      eligibilityNote = `Requires 5 years continuous service (current: ${tenure.formattedTenure}, rounded: ${tenure.roundedServiceYears} yrs).`;
    }
  }

  // Effective years for statutory payout formula
  const effectiveYearsForFormula = deathInService
    ? Math.max(1, tenure.roundedServiceYears)
    : tenure.roundedServiceYears;

  const rawFormulaAmount = Math.round(
    ((lastDrawnBasicPlusDa * 15) / 26) * effectiveYearsForFormula
  );

  // Continuous pro-rata balance sheet provision for employer cash-flow planning
  const provisionalAccruedAmount = Math.min(
    Math.round(((lastDrawnBasicPlusDa * 15) / 26) * tenure.continuousYearsExact),
    GRATUITY_STATUTORY_CEILING
  );

  const ceilingApplied = isEligible && rawFormulaAmount > GRATUITY_STATUTORY_CEILING;
  const cappedExcessAmount = isEligible
    ? Math.max(0, rawFormulaAmount - GRATUITY_STATUTORY_CEILING)
    : 0;
  const payableGratuityAmount = isEligible
    ? Math.min(rawFormulaAmount, GRATUITY_STATUTORY_CEILING)
    : 0;

  const annualAccrualIncrement = Math.round((lastDrawnBasicPlusDa * 15) / 26);
  const monthlyAccrualIncrement = Math.round(annualAccrualIncrement / 12);

  const formulaText = `(₹${lastDrawnBasicPlusDa.toLocaleString('en-IN')} × 15 / 26) × ${effectiveYearsForFormula} yr${effectiveYearsForFormula === 1 ? '' : 's'} = ₹${rawFormulaAmount.toLocaleString('en-IN')}${ceilingApplied ? ` (Capped at ₹20,00,000)` : ''}`;

  return {
    workerId: worker.id,
    workerName: worker.name,
    designation: worker.designation || 'Worker',
    department: worker.department || 'General',
    employmentType,
    asOfDate,
    dateOfExit: normalizedExit,
    exitReason,
    deathInService,
    nomineeName: options.nomineeNameOverride ?? worker.nomineeName,
    nomineeRelation: options.nomineeRelationOverride ?? worker.nomineeRelation,
    nomineePhone: worker.nomineePhone,
    lastDrawnBasic,
    lastDrawnDa,
    lastDrawnBasicPlusDa,
    usedLastDrawnNotAverage: true,
    salaryRevisionDate,
    previousPreRevisionBasicPlusDa,
    historicalAverageBasicPlusDa,
    tenure,
    eligibilityRule,
    minimumServiceRequiredYears,
    isEligible,
    isFixedTermNov2025Qualified,
    eligibilityNote,
    effectiveYearsForFormula,
    rawFormulaAmount,
    provisionalAccruedAmount,
    statutoryCeiling: GRATUITY_STATUTORY_CEILING,
    ceilingApplied,
    cappedExcessAmount,
    payableGratuityAmount,
    monthlyAccrualIncrement,
    annualAccrualIncrement,
    formulaText,
  };
}

/**
 * Projects company-wide gratuity liability for cash-flow & provisioning on the dashboard.
 */
export function projectOrganizationGratuityLiability(
  workers: Worker[],
  orgSettings?: OrgSettings,
  asOfDate?: string
): GratuityOrgProjection {
  const evalDate = normalizeFlexibleDateString(asOfDate) || getTodayIso();
  const targetWorkers = workers.filter(
    (w) => w.status === 'ACTIVE' || Boolean(w.dateOfExit) || Boolean(w.deathInService)
  );

  const breakdowns = targetWorkers.map((w) =>
    calculateWorkerGratuity(w, {
      asOfDate: w.dateOfExit ? normalizeFlexibleDateString(w.dateOfExit) || evalDate : evalDate,
      orgSettings,
    })
  );

  let eligibleEmployeesCount = 0;
  let standardFiveYearEligibleCount = 0;
  let fixedTermOneYearEligibleCount = 0;
  let deathInServiceCount = 0;
  let unvestedEmployeesCount = 0;
  let ceilingCappedCount = 0;
  let vestedPayableLiability = 0;
  let unvestedAccruedReserve = 0;
  let totalProvisionalAccruedLiability = 0;
  let ceilingClippedTotal = 0;
  let monthlyAccrualRunRate = 0;
  let annualAccrualRunRate = 0;

  for (const b of breakdowns) {
    if (b.isEligible) {
      eligibleEmployeesCount++;
      vestedPayableLiability += b.payableGratuityAmount;
      if (b.eligibilityRule === 'FIVE_YEAR_STANDARD') standardFiveYearEligibleCount++;
      if (b.eligibilityRule === 'ONE_YEAR_FIXED_TERM_NOV_2025') fixedTermOneYearEligibleCount++;
      if (b.eligibilityRule === 'DEATH_IN_SERVICE_OVERRIDE') deathInServiceCount++;
      if (b.ceilingApplied) {
        ceilingCappedCount++;
        ceilingClippedTotal += b.cappedExcessAmount;
      }
    } else {
      unvestedEmployeesCount++;
      unvestedAccruedReserve += b.provisionalAccruedAmount;
    }

    totalProvisionalAccruedLiability += b.isEligible
      ? Math.max(b.payableGratuityAmount, b.provisionalAccruedAmount)
      : b.provisionalAccruedAmount;

    if (!b.dateOfExit) {
      monthlyAccrualRunRate += b.monthlyAccrualIncrement;
      annualAccrualRunRate += b.annualAccrualIncrement;
    }
  }

  return {
    asOfDate: evalDate,
    totalWorkersAnalyzed: breakdowns.length,
    eligibleEmployeesCount,
    standardFiveYearEligibleCount,
    fixedTermOneYearEligibleCount,
    deathInServiceCount,
    unvestedEmployeesCount,
    ceilingCappedCount,
    vestedPayableLiability,
    unvestedAccruedReserve,
    totalProvisionalAccruedLiability,
    ceilingClippedTotal,
    monthlyAccrualRunRate,
    annualAccrualRunRate,
    breakdowns: breakdowns.sort((a, b) => b.payableGratuityAmount - a.payableGratuityAmount || b.provisionalAccruedAmount - a.provisionalAccruedAmount),
  };
}

/**
 * Builds a Full & Final (FnF) Settlement Preview combining prorated wages, leave encashment,
 * statutory gratuity payout, and advance / EWA recoveries.
 */
export function buildFnfSettlementPreview(params: {
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
  orgSettings?: OrgSettings;
  notes?: string;
}): FnfSettlementRecord {
  const exitDateIso = normalizeFlexibleDateString(params.exitDate) || getTodayIso();
  const exitMonth = exitDateIso.slice(0, 7);
  const deathInService = Boolean(
    params.deathInService ?? (params.exitReason === 'DEATH_IN_SERVICE')
  );

  const gratuityCalc = calculateWorkerGratuity(params.worker, {
    asOfDate: exitDateIso,
    exitDateOverride: exitDateIso,
    exitReasonOverride: params.exitReason,
    deathInServiceOverride: deathInService,
    nomineeNameOverride: params.nomineeName,
    nomineeRelationOverride: params.nomineeRelation,
    orgSettings: params.orgSettings,
  });

  const payroll = params.monthlyPayrollForExitMonth;
  let pendingSalaryDays = payroll?.attendanceSummary.payableDays ?? 0;
  let pendingWagesEarned = payroll ? round2(payroll.earnings.gross) : 0;

  const attendanceInExitMonth = (params.attendanceRecords || []).filter(
    (a) => a.workerId === params.worker.id && a.date.startsWith(exitMonth) && a.date <= exitDateIso
  );
  if (attendanceInExitMonth.length === 0 && pendingWagesEarned <= 0) {
    const [yr, mo, dy] = exitDateIso.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const monthlyGross =
      params.worker.monthlySalary ||
      (params.worker.wageConfig?.type === 'MONTHLY'
        ? params.worker.wageConfig.amount
        : (params.worker.dailyWage || params.worker.wageConfig?.amount || 650) * 26);
    pendingSalaryDays = Math.max(1, dy);
    pendingWagesEarned = Math.round((monthlyGross / Math.max(1, daysInMonth)) * pendingSalaryDays);
  }

  const leaveDays = Math.max(
    0,
    Number(
      params.leaveEncashmentDays ??
        params.worker.leaveBalances?.pl ??
        params.orgSettings?.leavePolicy?.pl ??
        0
    )
  );
  const dailyBasicDaRate = gratuityCalc.lastDrawnBasicPlusDa / 26;
  const leaveEncashmentAmount = Math.round(dailyBasicDaRate * leaveDays);

  const defaultNoticeRequired =
    params.exitReason === 'RESIGNATION'
      ? params.worker.noticePeriodDays ?? (params.worker.category === 'Permanent' ? 30 : 15)
      : 0;
  const noticePeriodRequiredDays = Math.max(
    0,
    Number(params.noticePeriodRequiredDays ?? defaultNoticeRequired)
  );
  const noticePeriodServedDays = Math.min(
    noticePeriodRequiredDays,
    Math.max(0, Number(params.noticePeriodServedDays ?? 0))
  );
  const noticeShortfallDays = Math.max(0, noticePeriodRequiredDays - noticePeriodServedDays);
  const noticePayWaived = Boolean(params.noticePayWaived);
  const monthlyEqGross =
    params.worker.monthlySalary ||
    (params.worker.wageConfig?.type === 'MONTHLY'
      ? params.worker.wageConfig.amount
      : (params.worker.dailyWage || params.worker.wageConfig?.amount || 650) * 26);
  const noticePayDailyRate = round2(monthlyEqGross / 26);
  const noticePayRecovery =
    noticePayWaived || noticeShortfallDays === 0
      ? 0
      : round2(noticeShortfallDays * noticePayDailyRate);

  const unpaidAdvancesTotal = round2(
    (params.advances || [])
      .filter(
        (a) =>
          a.workerId === params.worker.id &&
          !a.repaid &&
          (a.status === 'APPROVED' || !a.status) &&
          a.date <= exitDateIso
      )
      .reduce((sum, a) => sum + a.amount, 0)
  );
  const advanceAndEwaRecovery = Math.max(
    unpaidAdvancesTotal,
    payroll ? round2(payroll.deductions.advances) : 0
  );

  const statutoryDeductions = payroll?.statutory
    ? round2(payroll.statutory.totalEmployeeStatutory)
    : 0;

  const gratuityPayable = gratuityCalc.payableGratuityAmount;
  const rawWageNet = round2(
    pendingWagesEarned +
      leaveEncashmentAmount -
      noticePayRecovery -
      advanceAndEwaRecovery -
      statutoryDeductions
  );
  const fnfWageNetPayable = Math.max(0, rawWageNet);
  const excessRecoveryCarryover = rawWageNet < 0 ? round2(Math.abs(rawWageNet)) : 0;
  const grossFnfPayable = round2(pendingWagesEarned + leaveEncashmentAmount + gratuityPayable);
  const netFnfPayable = round2(fnfWageNetPayable + gratuityPayable);

  // Compute 2-working-day deadline (skipping org weeklyOffs & holidays)
  const [ey, em, ed] = exitDateIso.split('-').map(Number);
  const deadlineCursor = new Date(ey, em - 1, ed, 23, 59, 59, 999);
  const offDays = params.orgSettings?.weeklyOffs?.defaultDays?.length
    ? params.orgSettings.weeklyOffs.defaultDays
    : [0];
  let rem = 2;
  let guard = 0;
  while (rem > 0 && guard < 30) {
    deadlineCursor.setDate(deadlineCursor.getDate() + 1);
    const iso = `${deadlineCursor.getFullYear()}-${String(deadlineCursor.getMonth() + 1).padStart(2, '0')}-${String(deadlineCursor.getDate()).padStart(2, '0')}`;
    const isHol = params.orgSettings?.holidays?.some((h) => h.date === iso);
    const isOff = offDays.includes(deadlineCursor.getDay());
    if (!isHol && !isOff) rem--;
    guard++;
  }
  const baseDeadlineAt = deadlineCursor.toISOString();
  const gratuityDeadlineAt = new Date(ey, em - 1, ed + 30, 23, 59, 59, 999).toISOString();
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
    separationStatus:
      params.exitReason === 'TERMINATION'
        ? 'TERMINATED'
        : params.exitReason === 'RESIGNATION'
        ? 'RESIGNED'
        : params.exitReason === 'RETIREMENT'
        ? 'RETIRED'
        : params.exitReason,
    triggeredAt: new Date().toISOString(),
    deathInService,
    nomineeName: params.nomineeName || params.worker.nomineeName,
    nomineeRelation: params.nomineeRelation || params.worker.nomineeRelation,
    nomineePhone: params.worker.nomineePhone,
    pendingSalaryDays,
    pendingWagesEarned,
    leaveEncashmentDays: leaveDays,
    leaveEncashmentAmount,
    noticePeriodRequiredDays,
    noticePeriodServedDays,
    noticeShortfallDays,
    noticePayDailyRate,
    noticePayRecovery,
    noticePayWaived,
    noticeRecoveryFormula:
      noticeShortfallDays > 0
        ? noticePayWaived
          ? `Waived (${noticeShortfallDays}d shortfall)`
          : `${noticeShortfallDays}d × ₹${noticePayDailyRate.toLocaleString('en-IN')}/day = ₹${noticePayRecovery.toLocaleString('en-IN')}`
        : 'No notice shortfall',
    gratuityCalculation: gratuityCalc,
    gratuityPayable,
    advanceAndEwaRecovery,
    statutoryDeductions,
    grossFnfPayable,
    fnfWageNetPayable,
    excessRecoveryCarryover,
    netFnfPayable,
    status: 'DRAFT',
    notes: params.notes,
    createdAt: new Date().toISOString(),
    deadlineTracking: {
      workingDaysLimit: 2,
      baseDeadlineAt,
      effectiveDeadlineAt: baseDeadlineAt,
      totalPausedMs: 0,
      isPaused: false,
      gratuityDeadlineAt,
      interestRateAnnualPct: 12,
    },
    paymentSchedules: {
      wageFnf: {
        id: `${fnfId}_sched_wage`,
        label: 'Schedule A · Wage & Leave FnF Settlement',
        legalBasis: 'Sec 17(2), Code on Wages (2 Working Days)',
        amount: fnfWageNetPayable,
        dueAt: baseDeadlineAt,
        status: 'PENDING',
      },
      gratuity: {
        id: `${fnfId}_sched_gratuity`,
        label: 'Schedule B · Statutory Gratuity Settlement',
        legalBasis: 'Sec 7(3), Payment of Gratuity Act (30 Calendar Days)',
        amount: gratuityPayable,
        dueAt: gratuityDeadlineAt,
        status: gratuityPayable > 0 ? 'PENDING' : 'NOT_APPLICABLE',
      },
    },
  };
}

// ==========================================
// PERSISTENCE HELPERS (localStorage + Firestore)
// ==========================================

const getFnfStorageKey = (tenantId: string) => `fnf_settlements_${tenantId || 'demo-tenant-id'}`;

export function getSyncFnfSettlements(tenantId: string): FnfSettlementRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getFnfStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSyncFnfSettlementForWorkerMonth(
  tenantId: string,
  workerId: string,
  month: string
): FnfSettlementRecord | null {
  const list = getSyncFnfSettlements(tenantId);
  const match = list.find(
    (rec) =>
      rec.workerId === workerId &&
      rec.exitDate.startsWith(month) &&
      (rec.status === 'APPROVED' ||
        rec.status === 'SETTLED' ||
        rec.status === 'DRAFT' ||
        rec.status === 'LEGAL_HOLD')
  );
  return match || null;
}

export async function getFnfSettlements(tenantId: string): Promise<FnfSettlementRecord[]> {
  const local = getSyncFnfSettlements(tenantId);
  if (!tenantId || tenantId.startsWith('demo-')) return local;

  try {
    const q = query(collection(db, 'fnf_settlements'), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    if (snap.empty) return local;
    const remote = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FnfSettlementRecord));
    const mergedMap = new Map<string, FnfSettlementRecord>();
    local.forEach((item) => mergedMap.set(item.id, item));
    remote.forEach((item) => mergedMap.set(item.id, item));
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.exitDate.localeCompare(a.exitDate)
    );
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getFnfStorageKey(tenantId), JSON.stringify(merged));
    }
    return merged;
  } catch {
    return local;
  }
}

export async function saveFnfSettlement(
  record: FnfSettlementRecord,
  actorEmail: string
): Promise<FnfSettlementRecord> {
  const existing = getSyncFnfSettlements(record.tenantId);
  const idx = existing.findIndex((r) => r.id === record.id);
  const updatedList = [...existing];
  if (idx >= 0) {
    updatedList[idx] = record;
  } else {
    updatedList.unshift(record);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getFnfStorageKey(record.tenantId), JSON.stringify(updatedList));
  }

  if (record.tenantId && !record.tenantId.startsWith('demo-')) {
    try {
      await setDoc(doc(db, 'fnf_settlements', record.id), record, { merge: true });
    } catch (e) {
      console.warn('Firestore saveFnfSettlement skipped/failed:', e);
    }
  }

  await tenantSecurityService.logTenantAccess({
    tenantId: record.tenantId,
    userId: actorEmail,
    userEmail: actorEmail,
    userRole: 'FACTORY_OWNER',
    action: 'FNF_GRATUITY_SETTLEMENT',
    resource: `tenants/${record.tenantId}/fnf_settlements/${record.id}`,
    status: 'SUCCESS',
    details: {
      workerId: record.workerId,
      workerName: record.workerName,
      exitDate: record.exitDate,
      exitReason: record.exitReason,
      deathInService: record.deathInService,
      gratuityPayable: record.gratuityPayable,
      netFnfPayable: record.netFnfPayable,
      status: record.status,
    },
  });

  return record;
}

export async function updateFnfSettlementStatus(
  tenantId: string,
  id: string,
  status: FnfSettlementRecord['status'],
  actorEmail: string
): Promise<void> {
  const list = getSyncFnfSettlements(tenantId);
  const nowIso = new Date().toISOString();
  const next = list.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          settledAt: status === 'SETTLED' ? nowIso : item.settledAt,
          settledBy: status === 'SETTLED' ? actorEmail : item.settledBy,
        }
      : item
  );
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getFnfStorageKey(tenantId), JSON.stringify(next));
  }
  if (tenantId && !tenantId.startsWith('demo-')) {
    try {
      await updateDoc(doc(db, 'fnf_settlements', id), {
        status,
        ...(status === 'SETTLED' ? { settledAt: nowIso, settledBy: actorEmail } : {}),
      });
    } catch (e) {
      console.warn('Firestore updateFnfSettlementStatus failed:', e);
    }
  }
}

export const gratuityService = {
  GRATUITY_STATUTORY_CEILING,
  NOV_2025_CODE_EFFECTIVE_DATE,
  parseFlexibleDate,
  normalizeFlexibleDateString,
  calculateContinuousTenure,
  resolveLastDrawnBasicAndDa,
  calculateWorkerGratuity,
  projectOrganizationGratuityLiability,
  buildFnfSettlementPreview,
  getSyncFnfSettlements,
  getSyncFnfSettlementForWorkerMonth,
  getFnfSettlements,
  saveFnfSettlement,
  updateFnfSettlementStatus,
};
