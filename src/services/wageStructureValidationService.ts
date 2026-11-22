import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from '../lib/firebase';
import {
  INDIAN_STATES,
  OneNumberSalaryCalculation,
  OrgSettings,
  PayrollServerValidationResult,
  SalaryStructureAuditReport,
  WageBreakdownComponents,
  WageComplianceFlag,
  WageConfig,
  WageStructureAuditResult,
  Worker,
  WorkerSkillCategory,
} from '../types/index';

import {
  DEFAULT_SCHEDULED_EMPLOYMENT,
  getDefaultZoneForState,
  getMinimumWageMatrixForState,
  getZonesForState,
  resolveMinimumWageFloor,
  resolveWorkerWorkLocation,
  SCHEDULED_EMPLOYMENT_CATEGORIES,
  SKILL_LEVEL_LABELS,
  STATE_ZONE_MINIMUM_WAGES,
} from './minimumWageDatabase';

export {
  DEFAULT_SCHEDULED_EMPLOYMENT,
  getDefaultZoneForState,
  getMinimumWageMatrixForState,
  getZonesForState,
  resolveMinimumWageFloor,
  resolveWorkerWorkLocation,
  SCHEDULED_EMPLOYMENT_CATEGORIES,
  SKILL_LEVEL_LABELS,
  STATE_ZONE_MINIMUM_WAGES,
};

export interface StateMinimumWageEntry {
  state: string;
  monthlyUnskilled: number;
  dailyUnskilled: number;
  zoneLabel: string;
  notificationDate: string;
  notificationRef: string;
}

/**
 * Statutory Minimum Wage summary index (derived from STATE_ZONE_MINIMUM_WAGES default zones).
 */
export const STATE_MINIMUM_WAGES: Record<string, StateMinimumWageEntry> = Object.fromEntries(
  Object.entries(STATE_ZONE_MINIMUM_WAGES).map(([stateKey, schedule]) => {
    const defZone =
      schedule.zones.find((z) => z.zone === schedule.defaultZone) || schedule.zones[0];
    return [
      stateKey,
      {
        state: schedule.state,
        monthlyUnskilled: defZone.rates.UNSKILLED,
        dailyUnskilled: Math.round(defZone.rates.UNSKILLED / 26),
        zoneLabel: defZone.zone,
        notificationDate: defZone.notificationDate,
        notificationRef: defZone.notificationRef,
      },
    ];
  })
);

export const FIFTY_PERCENT_RULE_WARNING =
  'Your basic pay is less than 50% of CTC. This will increase PF/Gratuity liabilities.';

export const PF_STATUTORY_CEILING = 15000;

export const ONE_NUMBER_MIN_WAGE_WARNING =
  'This is below the state minimum wage. Please increase the salary.';

export const PF_LIABILITY_SHIFT_STATEMENT =
  'I understand this may violate PF compliance.';

export interface OneNumberSalaryOptions {
  state?: string;
  wageZone?: string;
  skillCategory?: WorkerSkillCategory;
  scheduledEmployment?: string;
  evaluationDate?: string;
  orgSettings?: OrgSettings;
  branchId?: string;
}

/**
 * Deterministic "One-Number" Salary Calculator:
 * Takes a single total monthly salary and auto-computes a Code on Wages compliant
 * 50% Basic / 20% HRA / 30% Allowances split, enforces state minimum wage, and
 * caps PF math at the statutory ₹15,000 ceiling.
 */
export function calculateOneNumberSalaryBreakdown(
  rawMonthlySalary: number,
  options: OneNumberSalaryOptions = {}
): OneNumberSalaryCalculation {
  const monthlySalary = Number.isFinite(rawMonthlySalary) && rawMonthlySalary > 0
    ? Math.round(rawMonthlySalary)
    : 0;

  const resolvedLoc = resolveWorkerWorkLocation(
    {
      state: options.state,
      wageZone: options.wageZone,
      scheduledEmployment: options.scheduledEmployment,
      branchId: options.branchId,
    },
    options.orgSettings
  );

  const skillCategory: WorkerSkillCategory = options.skillCategory || 'UNSKILLED';
  const minWage = resolveMinimumWageFloor({
    state: resolvedLoc.state,
    zone: resolvedLoc.wageZone,
    scheduledEmployment: resolvedLoc.scheduledEmployment,
    skillCategory,
    evaluationDate: options.evaluationDate,
    customRevisions: options.orgSettings?.compliance?.minimumWageRevisions,
  });

  // 50% Basic (ceil ensures odd rupee totals never dip below 50.0%), 20% HRA, 30% Allowances
  const basic = monthlySalary > 0 ? Math.ceil(monthlySalary * 0.5) : 0;
  const hra = monthlySalary > 0 ? Math.round(monthlySalary * 0.2) : 0;
  const allowances = monthlySalary > 0 ? Math.max(0, monthlySalary - basic - hra) : 0;
  const basicPercentage = monthlySalary > 0 ? Math.round((basic / monthlySalary) * 1000) / 10 : 0;
  const isFiftyPercentCompliant = monthlySalary > 0 && basic >= monthlySalary * 0.5;

  // Minimum wage check against total monthly salary vs applicable state statutory floor
  const isBelowMinimumWage = monthlySalary > 0 && monthlySalary < minWage.monthlyFloor;
  const minimumWageShortfall = isBelowMinimumWage
    ? Math.max(0, minWage.monthlyFloor - monthlySalary)
    : 0;

  // Automatic PF statutory ceiling cap at ₹15,000
  const pfQualifyingWage = Math.min(basic, PF_STATUTORY_CEILING);
  const isPfCappedAtCeiling = basic >= PF_STATUTORY_CEILING;
  const isBasicAbovePfCeiling = basic > PF_STATUTORY_CEILING;

  const employeePfMonthly = Math.round(pfQualifyingWage * 0.12);
  const employerEpsMonthly = Math.round(pfQualifyingWage * 0.0833);
  const employerEpfMonthly = Math.max(0, employeePfMonthly - employerEpsMonthly);
  const employerEdliMonthly = Math.round(pfQualifyingWage * 0.005);
  const employerAdminMonthly = Math.round(pfQualifyingWage * 0.005);
  const employerPfTotalMonthly =
    employerEpfMonthly + employerEpsMonthly + employerEdliMonthly + employerAdminMonthly;
  const estimatedGratuityMonthly = Math.round((basic * 15) / 26 / 12);

  return {
    monthlySalary,
    basic,
    hra,
    allowances,
    basicPercentage,
    isFiftyPercentCompliant,
    state: minWage.state,
    wageZone: minWage.zone,
    skillCategory,
    scheduledEmployment: minWage.scheduledEmployment,
    stateMinimumWageMonthly: minWage.monthlyFloor,
    stateMinimumWageDaily: minWage.dailyFloor,
    notificationDate: minWage.notificationDate,
    isBelowMinimumWage,
    minimumWageShortfall,
    minimumWageWarning: isBelowMinimumWage ? ONE_NUMBER_MIN_WAGE_WARNING : undefined,
    pfStatutoryCeiling: PF_STATUTORY_CEILING,
    pfQualifyingWage,
    isPfCappedAtCeiling,
    isBasicAbovePfCeiling,
    employeePfMonthly,
    employerEpsMonthly,
    employerEpfMonthly,
    employerEdliMonthly,
    employerAdminMonthly,
    employerPfTotalMonthly,
    estimatedGratuityMonthly,
    canSave: monthlySalary > 0 && !isBelowMinimumWage,
  };
}

/**
 * Builds a complete, Code on Wages compliant WageConfig from a single monthly salary input.
 */
export function buildOneNumberWageConfig(
  monthlySalary: number,
  existingConfig?: Partial<WageConfig>,
  options: OneNumberSalaryOptions = {}
): { wageConfig: WageConfig; calculation: OneNumberSalaryCalculation } {
  const calc = calculateOneNumberSalaryBreakdown(monthlySalary, options);

  const wageConfig: WageConfig = {
    ...(existingConfig || {}),
    type: 'MONTHLY',
    salaryInputMode: 'ONE_NUMBER',
    amount: calc.monthlySalary,
    basicPercentage: 50,
    workingDaysPerMonth: existingConfig?.workingDaysPerMonth || 26,
    overtimeEligible: existingConfig?.overtimeEligible ?? false,
    overtimeRatePerHour: existingConfig?.overtimeRatePerHour,
    pfCapAtStatutoryCeiling: true,
    pfWageCeiling: calc.pfStatutoryCeiling,
    pfQualifyingWage: calc.pfQualifyingWage,
    allowances: existingConfig?.allowances || { travel: 0, food: 0, nightShift: 0 },
    monthlyBreakdown: {
      basic: calc.basic,
      da: 0,
      retainingAllowance: 0,
      hra: calc.hra,
      travel: 0,
      medical: 0,
      others: calc.allowances,
      employerPf: calc.employerEpfMonthly + calc.employerEpsMonthly,
      employerGratuity: calc.estimatedGratuityMonthly,
    },
    complianceStatus: 'COMPLIANT',
    complianceFlags: calc.isBelowMinimumWage ? ['MINIMUM_WAGE_VIOLATION'] : [],
    acknowledgedNonCompliant: false,
  };

  return { wageConfig, calculation: calc };
}

/**
 * Validates and computes One-Number salary breakdown + ₹15,000 PF ceiling math via Backend Cloud Function
 * (`validateOneNumberSalary`), with deterministic local fallback for offline/demo environments.
 */
export async function validateOneNumberSalaryOnServer(
  tenantId: string,
  monthlySalary: number,
  options: OneNumberSalaryOptions = {}
): Promise<OneNumberSalaryCalculation> {
  const localCalc = calculateOneNumberSalaryBreakdown(monthlySalary, options);

  if (tenantId && tenantId !== 'demo-tenant-id' && auth.currentUser) {
    try {
      const functions = getFunctions(app, 'asia-south1');
      const validateFn = httpsCallable(functions, 'validateOneNumberSalary');
      const response = await validateFn({
        tenantId,
        monthlySalary,
        state: localCalc.state,
        wageZone: localCalc.wageZone,
        skillCategory: localCalc.skillCategory,
        scheduledEmployment: localCalc.scheduledEmployment,
        minimumWageRevisions: options.orgSettings?.compliance?.minimumWageRevisions,
      });
      const data = response.data as Partial<OneNumberSalaryCalculation> | undefined;
      if (data && typeof data.basic === 'number' && typeof data.pfQualifyingWage === 'number') {
        return { ...localCalc, ...data };
      }
    } catch (err: any) {
      // If backend explicitly rejected for minimum wage violation, rethrow so caller blocks save
      if (err?.code === 'functions/failed-precondition' || String(err?.message || '').includes('minimum wage')) {
        throw new Error(ONE_NUMBER_MIN_WAGE_WARNING);
      }
      console.warn('[OneNumberSalary] Cloud Function fallback to deterministic engine:', err);
    }
  }

  return localCalc;
}

export function getStateMinimumWage(
  stateName?: string,
  skillCategory: WorkerSkillCategory = 'UNSKILLED',
  wageZone?: string,
  scheduledEmployment?: string,
  evaluationDate?: string,
  customRevisions?: OrgSettings['compliance'] extends infer C
    ? C extends { minimumWageRevisions?: infer R }
      ? R
      : never
    : never
): { monthlyFloor: number; dailyFloor: number; entry: StateMinimumWageEntry } {
  const resolved = resolveMinimumWageFloor({
    state: stateName,
    zone: wageZone,
    scheduledEmployment,
    skillCategory,
    evaluationDate,
    customRevisions: customRevisions as any,
  });

  return {
    monthlyFloor: resolved.monthlyFloor,
    dailyFloor: resolved.dailyFloor,
    entry: {
      state: resolved.state,
      monthlyUnskilled: resolved.monthlyFloor,
      dailyUnskilled: resolved.dailyFloor,
      zoneLabel: resolved.zone,
      notificationDate: resolved.notificationDate,
      notificationRef: resolved.notificationRef,
    },
  };
}

export function resolveWorkerDefaultState(worker: Partial<Worker>, orgSettings?: OrgSettings): string {
  return resolveWorkerWorkLocation(worker, orgSettings).state;
}

export interface ValidateWageOptions {
  evaluationDate?: string; // YYYY-MM-DD (used for mid-year salary revision cutoff)
  ignoreRevisionCutoff?: boolean; // True when editing/previewing the new structure directly
  orgSettings?: OrgSettings;
  verificationSource?: 'CLOUD_FUNCTION' | 'CLIENT_ENGINE';
}

function round2(val: number): number {
  return Math.round((Number.isFinite(val) ? val : 0) * 100) / 100;
}

/**
 * Core deterministic 50% Rule & Minimum Wage validator.
 * Explicitly implements:
 *  - WageBase = Basic Pay + DA + Retaining Allowance
 *  - ExcludedComponents = HRA + Travel + Medical + Other Allowances
 *  - Employer PF & Gratuity excluded from Total Remuneration denominator
 *  - Daily wage monthly equivalent (Daily Rate × 26 or 30)
 *  - State statutory minimum wage check against Basic Pay
 *  - Mid-year salary revision effective date resolution
 */
export function validateWorkerWageStructure(
  worker: Partial<Worker>,
  options: ValidateWageOptions = {}
): WageStructureAuditResult {
  const evaluationDate = options.evaluationDate || new Date().toISOString().slice(0, 10);
  const evaluationMonth = evaluationDate.slice(0, 7);

  // Mid-year salary revision resolution:
  // If evaluationDate is strictly before worker.salaryRevisionDate and previous structure exists, validate previous structure.
  // From salaryRevisionDate onwards (or when previewing new structure), validate the revised wageConfig.
  let activeWageConfig: WageConfig | undefined = worker.wageConfig;
  let revisionApplied = Boolean(worker.salaryRevisionDate);

  if (
    !options.ignoreRevisionCutoff &&
    worker.salaryRevisionDate &&
    evaluationDate < worker.salaryRevisionDate
  ) {
    revisionApplied = false;
    if (worker.previousWageConfig) {
      activeWageConfig = worker.previousWageConfig;
    } else if (typeof worker.previousWageAmount === 'number' && worker.previousWageAmount > 0 && worker.wageConfig) {
      activeWageConfig = {
        ...worker.wageConfig,
        amount: worker.previousWageAmount,
        monthlyBreakdown: undefined,
        dailyBreakdown: undefined,
      };
    }
  }

  // Resolve active work location (prioritizes employee work location / assigned branch over tenant HQ)
  const resolvedLocation = resolveWorkerWorkLocation(
    worker,
    options.orgSettings,
    evaluationMonth
  );
  const activeState = resolvedLocation.state;
  const activeZone = resolvedLocation.wageZone;
  const scheduledEmployment = resolvedLocation.scheduledEmployment;
  const workLocationSource = resolvedLocation.source;

  const skillCategory: WorkerSkillCategory = worker.skillCategory || 'UNSKILLED';
  const minWageResolved = resolveMinimumWageFloor({
    state: activeState,
    zone: activeZone,
    scheduledEmployment,
    skillCategory,
    evaluationDate,
    customRevisions: options.orgSettings?.compliance?.minimumWageRevisions,
  });
  const monthlyFloor = minWageResolved.monthlyFloor;
  const dailyFloor = minWageResolved.dailyFloor;

  const isMonthly =
    activeWageConfig?.type === 'MONTHLY' ||
    (!activeWageConfig?.type &&
      (worker.wageType === 'MONTHLY' || worker.category === 'Monthly'));

  const wageType: 'DAILY' | 'MONTHLY' = isMonthly ? 'MONTHLY' : 'DAILY';
  const dailyMultiplier: 26 | 30 =
    activeWageConfig?.dailyMultiplier === 30 || activeWageConfig?.workingDaysPerMonth === 30
      ? 30
      : 26;

  let basicPay = 0;
  let da = 0;
  let retainingAllowance = 0;
  let hra = 0;
  let travelAllowance = 0;
  let medicalAllowance = 0;
  let otherAllowances = 0;
  let employerPf = 0;
  let employerGratuity = 0;

  if (wageType === 'MONTHLY') {
    const mb: Partial<WageBreakdownComponents> = activeWageConfig?.monthlyBreakdown || {};
    const totalEntered =
      (mb.basic || 0) +
      (mb.da || 0) +
      (mb.retainingAllowance || 0) +
      (mb.hra || 0) +
      (mb.travel || 0) +
      (mb.medical || 0) +
      (mb.others || 0);

    if (totalEntered > 0) {
      basicPay = mb.basic || 0;
      da = mb.da || 0;
      retainingAllowance = mb.retainingAllowance || 0;
      hra = mb.hra || 0;
      travelAllowance = mb.travel ?? (activeWageConfig?.allowances?.travel || 0);
      medicalAllowance = mb.medical || 0;
      otherAllowances =
        (mb.others || 0) +
        (activeWageConfig?.allowances?.food || 0) +
        (activeWageConfig?.allowances?.nightShift || 0);
      employerPf = mb.employerPf || 0;
      employerGratuity = mb.employerGratuity || 0;
    } else {
      // Legacy monthly worker with only lump-sum amount / basicPercentage
      const grossMonthly = activeWageConfig?.amount || worker.monthlySalary || 0;
      const pct = activeWageConfig?.basicPercentage ?? 50;
      basicPay = round2((grossMonthly * pct) / 100);
      otherAllowances =
        round2(grossMonthly - basicPay) +
        (activeWageConfig?.allowances?.food || 0) +
        (activeWageConfig?.allowances?.nightShift || 0);
      travelAllowance = activeWageConfig?.allowances?.travel || 0;
    }
  } else {
    // DAILY WAGE WORKER: Monthly Equivalent = Daily Rate × (26 or 30)
    const db = activeWageConfig?.dailyBreakdown;
    const dailyAllowanceTravel = activeWageConfig?.allowances?.travel || 0;
    const dailyAllowanceFood = activeWageConfig?.allowances?.food || 0;
    const dailyAllowanceNight = activeWageConfig?.allowances?.nightShift || 0;

    if (
      db &&
      (db.basic || 0) +
        (db.da || 0) +
        (db.retainingAllowance || 0) +
        (db.hra || 0) +
        (db.travel || 0) +
        (db.medical || 0) +
        (db.others || 0) >
        0
    ) {
      basicPay = round2((db.basic || 0) * dailyMultiplier);
      da = round2((db.da || 0) * dailyMultiplier);
      retainingAllowance = round2((db.retainingAllowance || 0) * dailyMultiplier);
      hra = round2((db.hra || 0) * dailyMultiplier);
      travelAllowance = round2((db.travel ?? dailyAllowanceTravel) * dailyMultiplier);
      medicalAllowance = round2((db.medical || 0) * dailyMultiplier);
      otherAllowances = round2(
        ((db.others || 0) + dailyAllowanceFood + dailyAllowanceNight) * dailyMultiplier
      );
      employerPf = round2((db.employerPf || 0) * dailyMultiplier);
      employerGratuity = round2((db.employerGratuity || 0) * dailyMultiplier);
    } else {
      const dailyRate = activeWageConfig?.amount || worker.dailyWage || 0;
      const monthlyEquivalentRate = round2(dailyRate * dailyMultiplier);
      const pct = activeWageConfig?.basicPercentage ?? 100;
      basicPay = round2((monthlyEquivalentRate * pct) / 100);
      const dailyRemainder = round2(monthlyEquivalentRate - basicPay);
      travelAllowance = round2(dailyAllowanceTravel * dailyMultiplier);
      otherAllowances = round2(
        dailyRemainder + (dailyAllowanceFood + dailyAllowanceNight) * dailyMultiplier
      );
    }
  }

  // AC1: WageBase = Basic Pay + DA + Retaining Allowance
  const wageBase = round2(basicPay + da + retainingAllowance);

  // AC2: ExcludedComponents = HRA + Travel + Medical + Other Allowances
  const excludedComponents = round2(
    hra + travelAllowance + medicalAllowance + otherAllowances
  );

  // Edge Case 4: Employer contributions (PF/Gratuity) are EXPLICITLY excluded from Total Remuneration denominator
  const employerContributionsExcluded = round2(employerPf + employerGratuity);
  const totalRemuneration = round2(wageBase + excludedComponents);
  const totalCtcWithEmployer = round2(totalRemuneration + employerContributionsExcluded);

  const fiftyPercentThreshold = round2(totalRemuneration * 0.5);

  // AC3: If ExcludedComponents > (Total Remuneration * 0.50), flag as NON_COMPLIANT
  const isFiftyPercentNonCompliant =
    totalRemuneration > 0 && excludedComponents > fiftyPercentThreshold;
  const status = isFiftyPercentNonCompliant ? 'NON_COMPLIANT' : 'COMPLIANT';

  const gapAmount = isFiftyPercentNonCompliant
    ? round2(excludedComponents - fiftyPercentThreshold)
    : 0;

  const wageBasePercentage =
    totalRemuneration > 0 ? Math.round((wageBase / totalRemuneration) * 1000) / 10 : 0;
  const excludedPercentage =
    totalRemuneration > 0 ? Math.round((excludedComponents / totalRemuneration) * 1000) / 10 : 0;

  // Under Code on Wages 2019, excess excluded allowances > 50% are deemed back into wages
  const deemedWageAddBack = gapAmount;
  const compliantWageBase = round2(wageBase + deemedWageAddBack);
  const estimatedAdditionalPfMonthly = isFiftyPercentNonCompliant
    ? Math.round(deemedWageAddBack * 0.12)
    : 0;
  const estimatedAdditionalGratuityAnnual = isFiftyPercentNonCompliant
    ? Math.round((deemedWageAddBack * 15) / 26)
    : 0;
  const estimatedAdditionalGratuityMonthly = isFiftyPercentNonCompliant
    ? Math.round(estimatedAdditionalGratuityAnnual / 12)
    : 0;

  // State Statutory Minimum Wage Check
  // For One-Number auto-split salaries (50% Basic / 20% HRA / 30% Allowances), compare total monthly salary
  // against the applicable state statutory minimum wage floor; for custom manual breakdowns, compare Basic Pay.
  // Probation employees are strictly NOT exempt from minimum wage enforcement.
  const isOnProbation = Boolean(worker.isOnProbation);
  const probationExemptionBlockedNote = isOnProbation
    ? 'Employee is on probation — statutory minimum wage applies without exemption.'
    : undefined;

  const usesMonthlyTotalMinWageFloor =
    wageType === 'MONTHLY' &&
    (activeWageConfig?.salaryInputMode === 'ONE_NUMBER' ||
      activeWageConfig?.salaryInputMode === 'CUSTOM_BREAKDOWN');
  const minWageComparableAmount = usesMonthlyTotalMinWageFloor ? totalRemuneration : basicPay;
  const isMinimumWageViolation = totalRemuneration > 0 && minWageComparableAmount < monthlyFloor;
  const minimumWageGap = isMinimumWageViolation ? round2(monthlyFloor - minWageComparableAmount) : 0;

  const complianceFlags: WageComplianceFlag[] = [];
  if (isFiftyPercentNonCompliant) complianceFlags.push('NON_COMPLIANT');
  if (isMinimumWageViolation) complianceFlags.push('MINIMUM_WAGE_VIOLATION');

  const warningMessage = isFiftyPercentNonCompliant ? FIFTY_PERCENT_RULE_WARNING : undefined;
  const revisionTag = minWageResolved.midMonthRevisionInfo?.isRevisedInMonth
    ? ` [Pro-rated mid-month revision eff. ${minWageResolved.midMonthRevisionInfo.revisionDate}: ${minWageResolved.midMonthRevisionInfo.daysAtPreviousRate}d @ ₹${minWageResolved.midMonthRevisionInfo.previousMonthlyFloor.toLocaleString('en-IN')} + ${minWageResolved.midMonthRevisionInfo.daysAtRevisedRate}d @ ₹${minWageResolved.midMonthRevisionInfo.revisedMonthlyFloor.toLocaleString('en-IN')}]`
    : '';
  const probationTag = isOnProbation ? ' (Probation active — no exemption)' : '';
  const minimumWageWarning = isMinimumWageViolation
    ? usesMonthlyTotalMinWageFloor
      ? `${ONE_NUMBER_MIN_WAGE_WARNING} (Monthly Salary ₹${totalRemuneration.toLocaleString('en-IN')}/mo is below ${activeState} · ${minWageResolved.zone} floor of ₹${monthlyFloor.toLocaleString('en-IN')}/mo).`
      : `MINIMUM_WAGE_VIOLATION: Basic Pay (₹${basicPay.toLocaleString('en-IN')}/mo) is below ${activeState} · ${minWageResolved.zone} (${scheduledEmployment}, ${SKILL_LEVEL_LABELS[skillCategory]}) floor of ₹${monthlyFloor.toLocaleString('en-IN')}/mo. Shortfall: ₹${minimumWageGap.toLocaleString('en-IN')}/mo · Notification Date: ${minWageResolved.notificationDate}.${revisionTag}${probationTag}`
    : undefined;

  return {
    workerId: worker.id,
    workerName: worker.name,
    workerCategory: worker.category,
    wageType,
    dailyMultiplier: wageType === 'DAILY' ? dailyMultiplier : undefined,
    state: activeState,
    wageZone: minWageResolved.zone,
    scheduledEmployment,
    minimumWageNotificationDate: minWageResolved.notificationDate,
    minimumWageNotificationRef: minWageResolved.notificationRef,
    workLocationSource,
    isOnProbation,
    probationExemptionBlockedNote,
    midMonthRevisionInfo: minWageResolved.midMonthRevisionInfo,
    skillCategory,
    evaluationDate,
    effectiveRevisionDate: worker.salaryRevisionDate,
    revisionApplied,
    basicPay,
    da,
    retainingAllowance,
    wageBase,
    hra,
    travelAllowance,
    medicalAllowance,
    otherAllowances,
    excludedComponents,
    employerPf,
    employerGratuity,
    employerContributionsExcluded,
    totalRemuneration,
    totalCtcWithEmployer,
    fiftyPercentThreshold,
    wageBasePercentage,
    excludedPercentage,
    isFiftyPercentNonCompliant,
    status,
    gapAmount,
    deemedWageAddBack,
    compliantWageBase,
    estimatedAdditionalPfMonthly,
    estimatedAdditionalGratuityMonthly,
    estimatedAdditionalGratuityAnnual,
    warningMessage,
    statutoryMinimumWageMonthly: monthlyFloor,
    statutoryMinimumWageDaily: dailyFloor,
    isMinimumWageViolation,
    minimumWageGap,
    minimumWageWarning,
    blockingErrorCode: isMinimumWageViolation ? 'MINIMUM_WAGE_VIOLATION' : undefined,
    complianceFlags,
    hasAnyViolation: isFiftyPercentNonCompliant || isMinimumWageViolation,
    verificationSource: options.verificationSource || 'CLIENT_ENGINE',
  };
}

/**
 * Auto-rebalances a WageConfig so WageBase reaches 50% of Total Remuneration
 * without inflating Total Remuneration (shifts the Gap Amount from excluded allowances into Basic Pay).
 */
export function rebalanceWageConfigTo50Percent(
  worker: Partial<Worker>,
  orgSettings?: OrgSettings
): WageConfig {
  const audit = validateWorkerWageStructure(worker, {
    ignoreRevisionCutoff: true,
    orgSettings,
  });

  const currentConfig: WageConfig = worker.wageConfig || {
    type: audit.wageType,
    amount: audit.totalRemuneration,
    overtimeEligible: true,
    allowances: { travel: 0, food: 0, nightShift: 0 },
  };

  if (!audit.isFiftyPercentNonCompliant || audit.gapAmount <= 0) {
    return currentConfig;
  }

  if (audit.wageType === 'MONTHLY') {
    let remainingToShift = audit.gapAmount;
    const currentBasic = audit.basicPay;
    let hra = audit.hra;
    let others = currentConfig.monthlyBreakdown?.others ?? audit.otherAllowances;
    let travel = currentConfig.monthlyBreakdown?.travel ?? audit.travelAllowance;
    let medical = audit.medicalAllowance;

    // Trim Others first, then HRA, then Medical, then Travel
    const trimOthers = Math.min(others, remainingToShift);
    others = round2(others - trimOthers);
    remainingToShift = round2(remainingToShift - trimOthers);

    const trimHra = Math.min(hra, remainingToShift);
    hra = round2(hra - trimHra);
    remainingToShift = round2(remainingToShift - trimHra);

    const trimMedical = Math.min(medical, remainingToShift);
    medical = round2(medical - trimMedical);
    remainingToShift = round2(remainingToShift - trimMedical);

    const trimTravel = Math.min(travel, remainingToShift);
    travel = round2(travel - trimTravel);
    remainingToShift = round2(remainingToShift - trimTravel);

    const newBasic = round2(currentBasic + audit.gapAmount);
    const da = audit.da;
    const retainingAllowance = audit.retainingAllowance;
    const newTotal = round2(newBasic + da + retainingAllowance + hra + travel + medical + others);

    return {
      ...currentConfig,
      type: 'MONTHLY',
      amount: newTotal,
      basicPercentage:
        newTotal > 0 ? Math.round(((newBasic + da + retainingAllowance) / newTotal) * 100) : 50,
      monthlyBreakdown: {
        basic: newBasic,
        da,
        retainingAllowance,
        hra,
        travel,
        medical,
        others,
        employerPf: audit.employerPf,
        employerGratuity: audit.employerGratuity,
      },
      allowances: {
        travel: 0,
        food: 0,
        nightShift: 0,
      },
      complianceStatus: 'COMPLIANT',
      acknowledgedNonCompliant: false,
    };
  } else {
    // Daily wage rebalance
    const mult = audit.dailyMultiplier || 26;
    const dailyShift = round2(audit.gapAmount / mult);
    let remainingDaily = dailyShift;

    const currentDailyBasic = round2(audit.basicPay / mult);
    const dailyDa = round2(audit.da / mult);
    const dailyRetaining = round2(audit.retainingAllowance / mult);
    let dailyHra = round2(audit.hra / mult);
    let dailyTravel = round2(audit.travelAllowance / mult);
    let dailyMedical = round2(audit.medicalAllowance / mult);
    let dailyOthers = round2(audit.otherAllowances / mult);

    const trimOthers = Math.min(dailyOthers, remainingDaily);
    dailyOthers = round2(dailyOthers - trimOthers);
    remainingDaily = round2(remainingDaily - trimOthers);

    const trimHra = Math.min(dailyHra, remainingDaily);
    dailyHra = round2(dailyHra - trimHra);
    remainingDaily = round2(remainingDaily - trimHra);

    const trimMedical = Math.min(dailyMedical, remainingDaily);
    dailyMedical = round2(dailyMedical - trimMedical);
    remainingDaily = round2(remainingDaily - trimMedical);

    const trimTravel = Math.min(dailyTravel, remainingDaily);
    dailyTravel = round2(dailyTravel - trimTravel);

    const newDailyBasic = round2(currentDailyBasic + dailyShift);
    const newDailyTotal = round2(
      newDailyBasic + dailyDa + dailyRetaining + dailyHra + dailyTravel + dailyMedical + dailyOthers
    );

    return {
      ...currentConfig,
      type: 'DAILY',
      amount: newDailyTotal,
      dailyMultiplier: mult,
      workingDaysPerMonth: mult,
      basicPercentage:
        newDailyTotal > 0
          ? Math.round(((newDailyBasic + dailyDa + dailyRetaining) / newDailyTotal) * 100)
          : 50,
      dailyBreakdown: {
        basic: newDailyBasic,
        da: dailyDa,
        retainingAllowance: dailyRetaining,
        hra: dailyHra,
        travel: dailyTravel,
        medical: dailyMedical,
        others: dailyOthers,
        employerPf: round2(audit.employerPf / mult),
        employerGratuity: round2(audit.employerGratuity / mult),
      },
      allowances: {
        travel: 0,
        food: 0,
        nightShift: 0,
      },
      complianceStatus: 'COMPLIANT',
      acknowledgedNonCompliant: false,
    };
  }
}

/**
 * Generates a full Salary Structure Audit Report locally (used both directly and as fallback)
 */
export function buildSalaryStructureAuditReport(
  tenantId: string,
  workers: Worker[],
  orgSettings?: OrgSettings,
  asOfDate?: string,
  verificationSource: 'CLOUD_FUNCTION' | 'CLIENT_ENGINE' = 'CLIENT_ENGINE'
): SalaryStructureAuditReport {
  const evalDate = asOfDate || new Date().toISOString().slice(0, 10);
  const activeWorkers = workers.filter(w => w.status !== 'INACTIVE' && w.isActive !== false);
  const results = activeWorkers.map(w =>
    validateWorkerWageStructure(w, {
      evaluationDate: evalDate,
      orgSettings,
      verificationSource,
    })
  );

  const nonCompliant = results.filter(r => r.isFiftyPercentNonCompliant);
  const minWageViolations = results.filter(r => r.isMinimumWageViolation);

  return {
    tenantId,
    auditedAt: new Date().toISOString(),
    asOfDate: evalDate,
    verificationSource,
    totalWorkersAudited: results.length,
    compliantCount: results.filter(r => !r.isFiftyPercentNonCompliant).length,
    nonCompliantCount: nonCompliant.length,
    minimumWageViolationCount: minWageViolations.length,
    totalComplianceGapMonthly: round2(
      nonCompliant.reduce((sum, r) => sum + r.gapAmount, 0)
    ),
    estimatedExtraStatutoryLiabilityMonthly: round2(
      nonCompliant.reduce(
        (sum, r) => sum + r.estimatedAdditionalPfMonthly + r.estimatedAdditionalGratuityMonthly,
        0
      )
    ),
    results,
  };
}

/**
 * Runs the Tenant Salary Structure Audit via Server Cloud Functions (`auditTenantSalaryStructures`)
 * with deterministic fallback for offline/demo environments.
 */
export async function runServerSalaryStructureAudit(
  tenantId: string,
  workers: Worker[],
  orgSettings?: OrgSettings,
  asOfDate?: string
): Promise<SalaryStructureAuditReport> {
  const evalDate = asOfDate || new Date().toISOString().slice(0, 10);

  if (tenantId !== 'demo-tenant-id' && auth.currentUser) {
    try {
      const functions = getFunctions(app, 'asia-south1');
      const auditFn = httpsCallable(functions, 'auditTenantSalaryStructures');
      const response = await auditFn({
        tenantId,
        asOfDate: evalDate,
        workers,
        branches: orgSettings?.branches,
        minimumWageRevisions: orgSettings?.compliance?.minimumWageRevisions,
        defaultState: resolveWorkerWorkLocation({}, orgSettings).state,
      });
      const data = response.data as any;
      if (data && Array.isArray(data.results)) {
        return {
          ...data,
          verificationSource: 'CLOUD_FUNCTION',
        } as SalaryStructureAuditReport;
      }
    } catch (err) {
      console.warn('[WageAudit] Cloud Function fallback to deterministic engine:', err);
    }
  }

  return buildSalaryStructureAuditReport(tenantId, workers, orgSettings, evalDate, 'CLIENT_ENGINE');
}

/**
 * Runs Server-Side Pre-Finalization Payroll Validation via Cloud Functions (`validatePayrollFinalization`)
 * before a monthly payroll run is finalized.
 */
export async function runServerPrePayrollValidation(
  tenantId: string,
  month: string,
  workers: Worker[],
  orgSettings?: OrgSettings
): Promise<PayrollServerValidationResult> {
  // Evaluate as of the end of the payroll month so mid-year revisions & mid-month state revisions apply
  const [yStr, mStr] = month.split('-');
  const lastDay = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
  const evalDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  if (tenantId !== 'demo-tenant-id' && auth.currentUser) {
    try {
      const functions = getFunctions(app, 'asia-south1');
      const validatePayrollFn = httpsCallable(functions, 'validatePayrollFinalization');
      const response = await validatePayrollFn({
        tenantId,
        month,
        asOfDate: evalDate,
        workers,
        branches: orgSettings?.branches,
        minimumWageRevisions: orgSettings?.compliance?.minimumWageRevisions,
        defaultState: resolveWorkerWorkLocation({}, orgSettings).state,
      });
      const data = response.data as any;
      if (data && Array.isArray(data.allResults)) {
        const minWageWorkers: WageStructureAuditResult[] =
          data.blockingMinimumWageWorkers ||
          data.allResults.filter((r: WageStructureAuditResult) => r.isMinimumWageViolation);
        const isBlocked = minWageWorkers.length > 0;
        return {
          ...data,
          isPayrollBlocked: isBlocked,
          blockingErrorCode: isBlocked ? 'MINIMUM_WAGE_VIOLATION' : undefined,
          blockingReason:
            data.blockingReason ||
            (isBlocked
              ? `MINIMUM_WAGE_VIOLATION: ${minWageWorkers.length} employee(s) have Basic Pay below applicable state minimum wage.`
              : undefined),
          blockingMinimumWageWorkers: minWageWorkers,
          verificationSource: 'CLOUD_FUNCTION',
        } as PayrollServerValidationResult;
      }
    } catch (err) {
      console.warn('[PrePayrollValidation] Cloud Function fallback to deterministic engine:', err);
    }
  }

  const report = buildSalaryStructureAuditReport(
    tenantId,
    workers,
    orgSettings,
    evalDate,
    'CLIENT_ENGINE'
  );
  const flaggedWorkers = report.results.filter((r) => r.hasAnyViolation);
  const blockingMinimumWageWorkers = report.results.filter((r) => r.isMinimumWageViolation);
  const isPayrollBlocked = blockingMinimumWageWorkers.length > 0;

  return {
    tenantId,
    month,
    validatedAt: new Date().toISOString(),
    verificationSource: 'CLIENT_ENGINE',
    hasFlaggedWorkers: flaggedWorkers.length > 0,
    isPayrollBlocked,
    blockingErrorCode: isPayrollBlocked ? 'MINIMUM_WAGE_VIOLATION' : undefined,
    blockingReason: isPayrollBlocked
      ? `MINIMUM_WAGE_VIOLATION: Payroll blocked for ${blockingMinimumWageWorkers.length} employee(s) whose Basic Pay falls below the applicable state minimum wage floor.`
      : undefined,
    nonCompliantCount: report.nonCompliantCount,
    minimumWageViolationCount: report.minimumWageViolationCount,
    totalGapAmount: report.totalComplianceGapMonthly,
    flaggedWorkers,
    blockingMinimumWageWorkers,
    allResults: report.results,
  };
}
