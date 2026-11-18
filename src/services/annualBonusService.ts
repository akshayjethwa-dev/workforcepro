// src/services/annualBonusService.ts
import * as XLSX from 'xlsx';
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
  AttendanceRecord,
  BonusAllocableSurplusInput,
  BonusEligibilityStatus,
  BonusEmployeeCalculation,
  BonusFormARegister,
  BonusFormBSetOnSetOffRow,
  BonusFormCRow,
  BonusFormDReturn,
  BonusOffCycleRun,
  BonusWindowDeadlineInfo,
  OrgSettings,
  Worker,
} from '../types/index';
import { statutoryEngine } from './statutoryEngine';
import { validateWorkerWageStructure } from './wageStructureValidationService';
import { normalizeFlexibleDateString, parseFlexibleDate } from './gratuityService';
import { tenantSecurityService } from './tenantSecurityService';

export const BONUS_ELIGIBILITY_CEILING = 21000; // ₹21,000/month under Payment of Bonus Act / Code on Wages
export const BONUS_CALCULATION_CEILING = 7000; // ₹7,000/month statutory bonus calculation ceiling
export const MIN_STATUTORY_BONUS_PCT = 8.33; // Statutory minimum bonus rate
export const MAX_STATUTORY_BONUS_PCT = 20.0; // Statutory maximum bonus rate
export const STATUTORY_PAYOUT_WINDOW_MONTHS = 8; // 8 months from end of accounting/financial year
export const MIN_WORKING_DAYS_ELIGIBILITY = 30; // Minimum 30 working days in FY to qualify

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const round2 = (v: number): number => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const round4 = (v: number): number => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;

export interface FinancialYearBounds {
  financialYear: string;
  startYear: number;
  endYear: number;
  fyStartDate: string; // YYYY-04-01
  fyEndDate: string; // YYYY-03-31
  statutoryDeadlineDate: string; // YYYY-11-30 (8 months after March 31)
  totalCalendarDaysInFy: number;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getFinancialYearBounds(financialYear: string = '2025-26'): FinancialYearBounds {
  const trimmed = (financialYear || '2025-26').trim();
  const match = trimmed.match(/^(\d{4})-(\d{2,4})$/);
  let startYear = 2025;
  let endYear = 2026;
  if (match) {
    startYear = Number(match[1]);
    const endRaw = match[2];
    endYear = endRaw.length === 2 ? Math.floor(startYear / 100) * 100 + Number(endRaw) : Number(endRaw);
  }
  const normalizedFy = `${startYear}-${String(endYear).slice(-2)}`;
  const fyStartDate = `${startYear}-04-01`;
  const fyEndDate = `${endYear}-03-31`;
  // 8 months from 31 March is 30 November of the same calendar year as fyEndDate
  const statutoryDeadlineDate = `${endYear}-11-30`;

  const startParsed = parseFlexibleDate(fyStartDate)!;
  const endParsed = parseFlexibleDate(fyEndDate)!;
  const totalCalendarDaysInFy = Math.round((endParsed.utcMs - startParsed.utcMs) / MS_PER_DAY) + 1;

  return {
    financialYear: normalizedFy,
    startYear,
    endYear,
    fyStartDate,
    fyEndDate,
    statutoryDeadlineDate,
    totalCalendarDaysInFy,
  };
}

/**
 * Evaluates the statutory 8-month payout deadline window following Financial Year close.
 */
export function evaluateEightMonthWindow(
  financialYear: string = '2025-26',
  evaluationDate?: string
): BonusWindowDeadlineInfo {
  const bounds = getFinancialYearBounds(financialYear);
  const evalIso = normalizeFlexibleDateString(evaluationDate) || getTodayIso();
  const evalParsed = parseFlexibleDate(evalIso) || parseFlexibleDate(getTodayIso())!;
  const fyEndParsed = parseFlexibleDate(bounds.fyEndDate)!;
  const deadlineParsed = parseFlexibleDate(bounds.statutoryDeadlineDate)!;

  if (evalParsed.utcMs <= fyEndParsed.utcMs) {
    const daysRemaining = Math.max(0, Math.round((deadlineParsed.utcMs - evalParsed.utcMs) / MS_PER_DAY));
    return {
      financialYear: bounds.financialYear,
      fyStartDate: bounds.fyStartDate,
      fyEndDate: bounds.fyEndDate,
      statutoryDeadlineDate: bounds.statutoryDeadlineDate,
      evaluationDate: evalParsed.iso,
      daysRemaining,
      daysOverdue: 0,
      isWithinEightMonthWindow: true,
      windowStatus: 'FY_IN_PROGRESS',
      statusMessage: `FY ${bounds.financialYear} active until ${bounds.fyEndDate}. Statutory 8-month payout window closes ${bounds.statutoryDeadlineDate}.`,
    };
  }

  if (evalParsed.utcMs > deadlineParsed.utcMs) {
    const daysOverdue = Math.round((evalParsed.utcMs - deadlineParsed.utcMs) / MS_PER_DAY);
    return {
      financialYear: bounds.financialYear,
      fyStartDate: bounds.fyStartDate,
      fyEndDate: bounds.fyEndDate,
      statutoryDeadlineDate: bounds.statutoryDeadlineDate,
      evaluationDate: evalParsed.iso,
      daysRemaining: 0,
      daysOverdue,
      isWithinEightMonthWindow: false,
      windowStatus: 'OVERDUE_PENALTY_RISK',
      statusMessage: `Statutory 8-month deadline (${bounds.statutoryDeadlineDate}) exceeded by ${daysOverdue} day(s). Immediate off-cycle disbursement required to avoid penalty.`,
    };
  }

  const daysRemaining = Math.max(0, Math.round((deadlineParsed.utcMs - evalParsed.utcMs) / MS_PER_DAY));
  const isUrgent = daysRemaining <= 30;
  return {
    financialYear: bounds.financialYear,
    fyStartDate: bounds.fyStartDate,
    fyEndDate: bounds.fyEndDate,
    statutoryDeadlineDate: bounds.statutoryDeadlineDate,
    evaluationDate: evalParsed.iso,
    daysRemaining,
    daysOverdue: 0,
    isWithinEightMonthWindow: true,
    windowStatus: isUrgent ? 'URGENT_DUE_SOON' : 'WITHIN_WINDOW',
    statusMessage: isUrgent
      ? `${daysRemaining} day(s) left in the 8-month statutory window (deadline ${bounds.statutoryDeadlineDate}). Process off-cycle payout now.`
      : `${daysRemaining} day(s) remaining within the 8-month statutory window (deadline ${bounds.statutoryDeadlineDate}).`,
  };
}

/**
 * Calculates working/employment days within the Financial Year for part-year pro-ration.
 * Formula: Working Days / Calendar Days in FY.
 */
export function calculateFyWorkedDays(
  worker: Partial<Worker>,
  fyBounds: FinancialYearBounds,
  attendanceRecords?: AttendanceRecord[],
  overrideWorkedDays?: number
): {
  workedDaysInFy: number;
  totalCalendarDaysInFy: number;
  prorationRatio: number;
  isPartYearProrated: boolean;
} {
  const totalCalendarDaysInFy = fyBounds.totalCalendarDaysInFy;

  if (typeof overrideWorkedDays === 'number' && Number.isFinite(overrideWorkedDays)) {
    const clampedDays = Math.max(0, Math.min(totalCalendarDaysInFy, Math.round(overrideWorkedDays)));
    const prorationRatio = round4(clampedDays / totalCalendarDaysInFy);
    return {
      workedDaysInFy: clampedDays,
      totalCalendarDaysInFy,
      prorationRatio,
      isPartYearProrated: clampedDays < totalCalendarDaysInFy,
    };
  }

  const joinedIso =
    normalizeFlexibleDateString(worker.joinedDate || worker.dateOfJoining) || fyBounds.fyStartDate;
  const exitedIso = normalizeFlexibleDateString(worker.dateOfExit);

  const fyStartMs = parseFlexibleDate(fyBounds.fyStartDate)!.utcMs;
  const fyEndMs = parseFlexibleDate(fyBounds.fyEndDate)!.utcMs;
  const joinMs = parseFlexibleDate(joinedIso)?.utcMs ?? fyStartMs;
  const exitMs = exitedIso ? parseFlexibleDate(exitedIso)?.utcMs ?? fyEndMs : fyEndMs;

  const effectiveStartMs = Math.max(fyStartMs, joinMs);
  const effectiveEndMs = Math.min(fyEndMs, exitMs);

  let workedDaysInFy = 0;
  if (effectiveEndMs >= effectiveStartMs) {
    workedDaysInFy = Math.round((effectiveEndMs - effectiveStartMs) / MS_PER_DAY) + 1;
  }

  // If extensive attendance logs exist inside the FY (>= 20 records for this worker), use attendance-derived days when smaller
  if (attendanceRecords && attendanceRecords.length > 0 && worker.id) {
    const fyWorkerLogs = attendanceRecords.filter(
      (r) =>
        r.workerId === worker.id &&
        r.date >= fyBounds.fyStartDate &&
        r.date <= fyBounds.fyEndDate
    );
    if (fyWorkerLogs.length >= 20) {
      let counted = 0;
      fyWorkerLogs.forEach((rec) => {
        if (
          rec.status === 'PRESENT' ||
          rec.status === 'WEEKLY_OFF' ||
          rec.status === 'PUBLIC_HOLIDAY' ||
          rec.status === 'HOLIDAY_WORKED' ||
          (rec.status === 'ON_LEAVE' && rec.leaveInfo?.isPaid !== false)
        ) {
          counted += 1;
        } else if (rec.status === 'HALF_DAY') {
          counted += 0.5;
        }
      });
      workedDaysInFy = Math.min(totalCalendarDaysInFy, Math.round(counted));
    }
  }

  workedDaysInFy = Math.max(0, Math.min(totalCalendarDaysInFy, workedDaysInFy));
  const prorationRatio = round4(workedDaysInFy / totalCalendarDaysInFy);

  return {
    workedDaysInFy,
    totalCalendarDaysInFy,
    prorationRatio,
    isPartYearProrated: workedDaysInFy < totalCalendarDaysInFy,
  };
}

/**
 * Off-cycle Section 192 incremental TDS calculation for annual bonus / ex-gratia payouts.
 * PF and ESI deductions are strictly ₹0 on annual statutory bonus.
 */
export function calculateBonusIncrementalTds(
  worker: Partial<Worker>,
  bonusOrExGratiaAmount: number,
  monthlyGrossEarning: number
): {
  taxRegime: 'NEW' | 'OLD';
  normalAnnualTaxWithoutBonus: number;
  annualTaxWithBonus: number;
  bonusTdsDeduction: number;
  effectiveTdsRatePct: number;
} {
  const regime: 'NEW' | 'OLD' = worker.taxDeclarations?.regime || worker.taxRegime || 'NEW';
  const declarations = worker.taxDeclarations
    ? { ...worker.taxDeclarations, regime }
    : { regime };

  const baseTds = statutoryEngine.calculateTDS(monthlyGrossEarning, declarations);
  if (bonusOrExGratiaAmount <= 0) {
    return {
      taxRegime: regime,
      normalAnnualTaxWithoutBonus: baseTds.annualTaxPayable,
      annualTaxWithBonus: baseTds.annualTaxPayable,
      bonusTdsDeduction: 0,
      effectiveTdsRatePct: 0,
    };
  }

  const withBonusTds = statutoryEngine.calculateTDS(
    monthlyGrossEarning + bonusOrExGratiaAmount / 12,
    declarations
  );
  const bonusTdsDeduction = Math.max(0, withBonusTds.annualTaxPayable - baseTds.annualTaxPayable);
  const effectiveTdsRatePct = round2((bonusTdsDeduction / bonusOrExGratiaAmount) * 100);

  return {
    taxRegime: regime,
    normalAnnualTaxWithoutBonus: baseTds.annualTaxPayable,
    annualTaxWithBonus: withBonusTds.annualTaxPayable,
    bonusTdsDeduction,
    effectiveTdsRatePct,
  };
}

/**
 * Form A: Computation of Allocable Surplus under Section 2(4) / Payment of Bonus Rules.
 */
export function computeFormARegister(
  input: BonusAllocableSurplusInput,
  companyName: string
): BonusFormARegister {
  const grossProfit = Math.max(0, Math.round(input.grossProfit || 0));
  const lessDepreciation = Math.max(0, Math.round(input.depreciation || 0));
  const lessDirectTaxes = Math.max(0, Math.round(input.directTaxes || 0));
  const lessReturnOnCapital = Math.max(0, Math.round(input.returnOnCapital || 0));

  const availableSurplus =
    grossProfit - lessDepreciation - lessDirectTaxes - lessReturnOnCapital;
  const allocableSurplusPercentage: 60 | 67 =
    input.companyType === 'NON_DOMESTIC_67_PCT' ? 67 : 60;

  const allocableSurplus = input.isEmployerLossMaking
    ? 0
    : Math.max(0, Math.round(availableSurplus * (allocableSurplusPercentage / 100)));

  return {
    financialYear: input.financialYear,
    companyName: companyName || 'Factory Establishment',
    grossProfit,
    lessDepreciation,
    lessDirectTaxes,
    lessReturnOnCapital,
    availableSurplus,
    allocableSurplusPercentage,
    allocableSurplus,
    isEmployerLossMaking: Boolean(input.isEmployerLossMaking),
  };
}

/**
 * Form B: Set On and Set Off of Allocable Surplus (Section 15).
 */
export function computeFormBSetOnSetOff(
  input: BonusAllocableSurplusInput,
  formA: BonusFormARegister,
  totalStatutoryBonusPayable: number
): BonusFormBSetOnSetOffRow[] {
  const priorSetOn = Math.max(0, Math.round(input.priorSetOnCarriedForward || 0));
  const priorSetOff = Math.max(0, Math.round(input.priorSetOffCarriedForward || 0));
  const priorNet = priorSetOn - priorSetOff;

  const allocable = formA.allocableSurplus;
  const payable = Math.max(0, Math.round(totalStatutoryBonusPayable));

  let setOnForYear = 0;
  let setOffForYear = 0;
  let remarks = '';

  if (input.isEmployerLossMaking) {
    setOffForYear = Math.max(0, payable - allocable);
    remarks =
      'Loss-making employer: 8.33% statutory minimum paid without profit; deficiency carried forward as Set-Off (Form C exemption filing flagged).';
  } else if (allocable >= payable) {
    setOnForYear = allocable - payable;
    remarks =
      setOnForYear > 0
        ? 'Allocable surplus exceeds bonus payable; excess carried forward as Set-On.'
        : 'Allocable surplus matched bonus payout.';
  } else {
    setOffForYear = payable - allocable;
    remarks =
      'Allocable surplus below statutory minimum payout; shortfall carried forward as Set-Off.';
  }

  const netCarried = priorNet + setOnForYear - setOffForYear;

  const rows: BonusFormBSetOnSetOffRow[] = [];
  if (priorSetOn > 0 || priorSetOff > 0) {
    rows.push({
      accountingYear: 'Prior Years B/F',
      amountAllocableAsBonus: 0,
      amountPayableAsBonus: 0,
      setOnForYear: priorSetOn,
      setOffForYear: priorSetOff,
      netSetOnCarriedForward: priorSetOn,
      netSetOffCarriedForward: priorSetOff,
      remarks: 'Opening balance brought forward from preceding accounting years',
    });
  }

  rows.push({
    accountingYear: `FY ${input.financialYear}`,
    amountAllocableAsBonus: allocable,
    amountPayableAsBonus: payable,
    setOnForYear,
    setOffForYear,
    netSetOnCarriedForward: Math.max(0, netCarried),
    netSetOffCarriedForward: Math.max(0, -netCarried),
    remarks,
  });

  return rows;
}

function isAtLeast15YearsOld(dob?: string, referenceIso?: string): 'Yes' | 'No' {
  const dobParsed = parseFlexibleDate(dob);
  const refParsed = parseFlexibleDate(referenceIso) || parseFlexibleDate(getTodayIso())!;
  if (!dobParsed) return 'Yes';
  const years = (refParsed.utcMs - dobParsed.utcMs) / (365.25 * MS_PER_DAY);
  return years >= 15 ? 'Yes' : 'No';
}

export interface CalculateAnnualBonusRunParams {
  tenantId: string;
  financialYear: string;
  payoutDate: string;
  workers: Worker[];
  bonusRatePct: number;
  surplusInput: BonusAllocableSurplusInput;
  exGratiaMap?: Record<string, number>;
  workedDaysOverrideMap?: Record<string, number>;
  companyName: string;
  employerName: string;
  address: string;
  orgSettings?: OrgSettings;
  attendanceRecords?: AttendanceRecord[];
  actorEmail: string;
  evaluationDate?: string;
}

/**
 * Computes the complete Annual Statutory Bonus off-cycle run, including:
 * - ₹21,000/month eligibility check
 * - ₹7,000/month statutory bonus calculation cap: min(Basic + DA, 7000)
 * - 8.33% minimum to 20% maximum rate enforcement
 * - Part-year pro-ration (Working Days / Calendar Days)
 * - Optional Ex-Gratia for >₹21,000 employees (excluded from Form C & Form D)
 * - Loss-making 8.33% minimum override + Form C exemption flagging
 * - Section 192 incremental TDS calculation (PF = 0, ESI = 0)
 * - Form A, Form B, Form C, Form D statutory registers
 */
export function calculateAnnualBonusRun(params: CalculateAnnualBonusRunParams): BonusOffCycleRun {
  const fyBounds = getFinancialYearBounds(params.financialYear);
  const payoutDate = normalizeFlexibleDateString(params.payoutDate) || getTodayIso();
  const windowInfo = evaluateEightMonthWindow(
    fyBounds.financialYear,
    params.evaluationDate || payoutDate
  );

  // Clamp bonus rate between 8.33% and 20%
  const rawRate = Number.isFinite(params.bonusRatePct) ? params.bonusRatePct : MIN_STATUTORY_BONUS_PCT;
  const clampedRate = Math.max(MIN_STATUTORY_BONUS_PCT, Math.min(MAX_STATUTORY_BONUS_PCT, round2(rawRate)));
  // When employer is loss-making, statutory minimum 8.33% applies without positive profit requirement
  const effectiveBonusPct = params.surplusInput.isEmployerLossMaking
    ? MIN_STATUTORY_BONUS_PCT
    : clampedRate;

  const formCExemptionRequired = Boolean(params.surplusInput.isEmployerLossMaking);

  const items: BonusEmployeeCalculation[] = params.workers.map((worker) => {
    const wageAudit = validateWorkerWageStructure(worker, {
      evaluationDate: fyBounds.fyEndDate,
      orgSettings: params.orgSettings,
      ignoreRevisionCutoff: true,
    });

    const monthlyGrossEarning = Math.round(wageAudit.totalRemuneration);
    const monthlyBasicPlusDa = Math.round(wageAudit.basicPay + wageAudit.da);
    const cappedMonthlyBonusWageBase = Math.min(monthlyBasicPlusDa, BONUS_CALCULATION_CEILING);

    const workedInfo = calculateFyWorkedDays(
      worker,
      fyBounds,
      params.attendanceRecords,
      params.workedDaysOverrideMap?.[worker.id]
    );

    const annualUncappedBasicPlusDa = Math.round(
      monthlyBasicPlusDa * 12 * workedInfo.prorationRatio
    );
    const annualCappedBonusWageBase = Math.round(
      cappedMonthlyBonusWageBase * 12 * workedInfo.prorationRatio
    );

    let eligibilityStatus: BonusEligibilityStatus = 'ELIGIBLE';
    let disqualificationReason: string | undefined;

    if (monthlyGrossEarning > BONUS_ELIGIBILITY_CEILING) {
      eligibilityStatus = 'DISQUALIFIED_ABOVE_21K';
      disqualificationReason = `Monthly gross ₹${monthlyGrossEarning.toLocaleString('en-IN')} exceeds ₹${BONUS_ELIGIBILITY_CEILING.toLocaleString('en-IN')}/mo statutory ceiling.`;
    } else if (workedInfo.workedDaysInFy < MIN_WORKING_DAYS_ELIGIBILITY) {
      eligibilityStatus = 'PART_YEAR_BELOW_30_DAYS';
      disqualificationReason = `Worked ${workedInfo.workedDaysInFy} day(s) in FY ${fyBounds.financialYear} (minimum ${MIN_WORKING_DAYS_ELIGIBILITY} working days required under Sec 8).`;
    }

    const isStatutoryEligible = eligibilityStatus === 'ELIGIBLE';

    const statutoryBonusAmount = isStatutoryEligible
      ? Math.round(annualCappedBonusWageBase * (effectiveBonusPct / 100))
      : 0;

    // Optional Ex-Gratia allowed for >₹21,000 employees; excluded from statutory Form C/D registers
    const rawExGratia = !isStatutoryEligible ? Math.max(0, Math.round(params.exGratiaMap?.[worker.id] || 0)) : 0;
    const exGratiaAmount = eligibilityStatus === 'DISQUALIFIED_ABOVE_21K' ? rawExGratia : 0;

    const totalGrossBonusOrExGratia = statutoryBonusAmount + exGratiaAmount;
    const includedInStatutoryRegisters = isStatutoryEligible && statutoryBonusAmount > 0;

    const tdsCalc = calculateBonusIncrementalTds(
      worker,
      totalGrossBonusOrExGratia,
      monthlyGrossEarning
    );

    const netOffCyclePayout = Math.max(0, totalGrossBonusOrExGratia - tdsCalc.bonusTdsDeduction);

    return {
      workerId: worker.id,
      workerName: worker.name,
      fatherName: worker.fatherName,
      designation: worker.designation || 'Operator',
      department: worker.department || 'Operations',
      monthlyGrossEarning,
      monthlyBasicPlusDa,
      cappedMonthlyBonusWageBase,
      annualUncappedBasicPlusDa,
      annualCappedBonusWageBase,
      workedDaysInFy: workedInfo.workedDaysInFy,
      totalCalendarDaysInFy: workedInfo.totalCalendarDaysInFy,
      prorationRatio: workedInfo.prorationRatio,
      isPartYearProrated: workedInfo.isPartYearProrated,
      eligibilityStatus,
      isStatutoryEligible,
      disqualificationReason,
      bonusRatePct: isStatutoryEligible ? effectiveBonusPct : 0,
      statutoryBonusAmount,
      exGratiaAmount,
      totalGrossBonusOrExGratia,
      includedInStatutoryRegisters,
      taxRegime: tdsCalc.taxRegime,
      normalAnnualTaxWithoutBonus: tdsCalc.normalAnnualTaxWithoutBonus,
      annualTaxWithBonus: tdsCalc.annualTaxWithBonus,
      bonusTdsDeduction: tdsCalc.bonusTdsDeduction,
      effectiveTdsRatePct: tdsCalc.effectiveTdsRatePct,
      pfDeduction: 0,
      esiDeduction: 0,
      netOffCyclePayout,
    };
  });

  const eligibleItems = items.filter((i) => i.includedInStatutoryRegisters);
  const disqualifiedAbove21kCount = items.filter(
    (i) => i.eligibilityStatus === 'DISQUALIFIED_ABOVE_21K'
  ).length;

  const totalStatutoryBonusGross = eligibleItems.reduce((s, i) => s + i.statutoryBonusAmount, 0);
  const totalExGratiaGross = items.reduce((s, i) => s + i.exGratiaAmount, 0);
  const totalBonusTdsDeducted = items.reduce((s, i) => s + i.bonusTdsDeduction, 0);
  const totalNetOffCycleDisbursed = items.reduce((s, i) => s + i.netOffCyclePayout, 0);

  // Form A & Form B
  const formA = computeFormARegister(
    { ...params.surplusInput, financialYear: fyBounds.financialYear },
    params.companyName
  );
  const formB = computeFormBSetOnSetOff(
    { ...params.surplusInput, financialYear: fyBounds.financialYear },
    formA,
    totalStatutoryBonusGross
  );

  // Form C: Register of Bonus Paid to Employees (strictly excludes Ex-Gratia / >₹21k employees)
  const formC: BonusFormCRow[] = eligibleItems.map((item, idx) => {
    const workerObj = params.workers.find((w) => w.id === item.workerId);
    const netPay = Math.max(0, item.statutoryBonusAmount - item.bonusTdsDeduction);
    return {
      slNo: idx + 1,
      workerId: item.workerId,
      workerName: item.workerName,
      fatherOrHusbandName: item.fatherName || '-',
      completed15YearsAge: isAtLeast15YearsOld(workerObj?.dob || workerObj?.dateOfBirth, fyBounds.fyEndDate),
      designation: item.designation,
      daysWorkedInYear: item.workedDaysInFy,
      totalSalaryOrWageInYear: item.annualCappedBonusWageBase,
      statutoryBonusPayable: item.statutoryBonusAmount,
      pujaOrInterimBonusPaid: 0,
      tdsIncomeTaxDeducted: item.bonusTdsDeduction,
      totalDeductions: item.bonusTdsDeduction,
      netAmountPayable: netPay,
      actualAmountPaid: netPay,
      dateOfPayment: payoutDate,
      remarks: item.isPartYearProrated
        ? `Pro-rated (${item.workedDaysInFy}/${item.totalCalendarDaysInFy} days) @ ${effectiveBonusPct}%${formCExemptionRequired ? ' · Form C Exemption Flagged' : ''}`
        : `Full year @ ${effectiveBonusPct}%${formCExemptionRequired ? ' · Form C Exemption Flagged' : ''}`,
    };
  });

  const totalEligibleSalaryOrWage = eligibleItems.reduce(
    (s, i) => s + i.annualCappedBonusWageBase,
    0
  );
  const totalStatutoryTdsDeducted = eligibleItems.reduce((s, i) => s + i.bonusTdsDeduction, 0);

  // Form D: Annual Return Summary (statutory employees only in statutory fields)
  const formD: BonusFormDReturn = {
    financialYear: fyBounds.financialYear,
    establishmentName: params.companyName || 'Factory Establishment',
    employerName: params.employerName || 'Managing Director / Occupier',
    address: params.address || 'Registered Factory Premises, India',
    accountingYearEndedOn: fyBounds.fyEndDate,
    totalEligibleEmployees: eligibleItems.length,
    totalEligibleSalaryOrWage,
    bonusPercentageDeclared: effectiveBonusPct,
    totalStatutoryBonusPayable: totalStatutoryBonusGross,
    totalExGratiaPaidSeparately: totalExGratiaGross,
    totalStatutoryTdsDeducted,
    dateOfPayment: payoutDate,
    isEmployerLossMaking: Boolean(params.surplusInput.isEmployerLossMaking),
    formCExemptionRequired,
    formCExemptionFiledRef: params.surplusInput.formCExemptionFiledRef,
    statutoryDeadlineDate: windowInfo.statutoryDeadlineDate,
    paidWithinEightMonths: windowInfo.isWithinEightMonthWindow,
  };

  return {
    id: `bonus-run-${fyBounds.financialYear}-${Date.now()}`,
    tenantId: params.tenantId,
    financialYear: fyBounds.financialYear,
    payoutDate,
    bonusRatePct: effectiveBonusPct,
    isEmployerLossMaking: Boolean(params.surplusInput.isEmployerLossMaking),
    formCExemptionRequired,
    formCExemptionFiledRef: params.surplusInput.formCExemptionFiledRef,
    windowInfo,
    eligibleCount: eligibleItems.length,
    disqualifiedAbove21kCount,
    totalStatutoryBonusGross,
    totalExGratiaGross,
    totalBonusTdsDeducted,
    totalNetOffCycleDisbursed,
    status: 'DRAFT',
    createdBy: params.actorEmail,
    createdAt: new Date().toISOString(),
    items,
    formA,
    formB,
    formC,
    formD,
  };
}

// ==========================================
// PERSISTENCE (localStorage + Firestore)
// ==========================================

const getBonusStorageKey = (tenantId: string) =>
  `bonus_offcycle_runs_${tenantId || 'demo-tenant-id'}`;

export function getSyncBonusOffCycleRuns(tenantId: string): BonusOffCycleRun[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getBonusStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getBonusOffCycleRuns(tenantId: string): Promise<BonusOffCycleRun[]> {
  const local = getSyncBonusOffCycleRuns(tenantId);
  if (!tenantId || tenantId.startsWith('demo-')) return local;

  try {
    const q = query(collection(db, 'bonus_offcycle_runs'), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    if (snap.empty) return local;
    const remote = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BonusOffCycleRun));
    const mergedMap = new Map<string, BonusOffCycleRun>();
    local.forEach((r) => mergedMap.set(r.id, r));
    remote.forEach((r) => mergedMap.set(r.id, r));
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getBonusStorageKey(tenantId), JSON.stringify(merged));
    }
    return merged;
  } catch {
    return local;
  }
}

export async function saveBonusOffCycleRun(
  run: BonusOffCycleRun,
  actorEmail: string
): Promise<BonusOffCycleRun> {
  const existing = getSyncBonusOffCycleRuns(run.tenantId);
  const idx = existing.findIndex((r) => r.id === run.id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = run;
  } else {
    next.unshift(run);
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getBonusStorageKey(run.tenantId), JSON.stringify(next));
  }

  if (run.tenantId && !run.tenantId.startsWith('demo-')) {
    try {
      await setDoc(doc(db, 'bonus_offcycle_runs', run.id), run, { merge: true });
    } catch (e) {
      console.warn('Firestore saveBonusOffCycleRun skipped/failed:', e);
    }
  }

  await tenantSecurityService.logTenantAccess({
    tenantId: run.tenantId,
    userId: actorEmail,
    userEmail: actorEmail,
    userRole: 'FACTORY_OWNER',
    action: 'ANNUAL_BONUS_OFFCYCLE_RUN',
    resource: `tenants/${run.tenantId}/bonus_offcycle_runs/${run.id}`,
    status: 'SUCCESS',
    details: {
      financialYear: run.financialYear,
      bonusRatePct: run.bonusRatePct,
      eligibleCount: run.eligibleCount,
      totalStatutoryBonusGross: run.totalStatutoryBonusGross,
      totalExGratiaGross: run.totalExGratiaGross,
      totalBonusTdsDeducted: run.totalBonusTdsDeducted,
      isEmployerLossMaking: run.isEmployerLossMaking,
      formCExemptionRequired: run.formCExemptionRequired,
      status: run.status,
    },
  });

  return run;
}

export async function updateBonusRunStatus(
  tenantId: string,
  runId: string,
  status: BonusOffCycleRun['status'],
  actorEmail: string
): Promise<BonusOffCycleRun[]> {
  const list = getSyncBonusOffCycleRuns(tenantId);
  const nowIso = new Date().toISOString();
  const next = list.map((item) =>
    item.id === runId
      ? {
          ...item,
          status,
          disbursedAt: status === 'DISBURSED' ? nowIso : item.disbursedAt,
        }
      : item
  );

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getBonusStorageKey(tenantId), JSON.stringify(next));
  }

  if (tenantId && !tenantId.startsWith('demo-')) {
    try {
      await updateDoc(doc(db, 'bonus_offcycle_runs', runId), {
        status,
        ...(status === 'DISBURSED' ? { disbursedAt: nowIso } : {}),
      });
    } catch (e) {
      console.warn('Firestore updateBonusRunStatus skipped/failed:', e);
    }
  }

  await tenantSecurityService.logTenantAccess({
    tenantId,
    userId: actorEmail,
    userEmail: actorEmail,
    userRole: 'FACTORY_OWNER',
    action: 'ANNUAL_BONUS_STATUS_UPDATE',
    resource: `tenants/${tenantId}/bonus_offcycle_runs/${runId}`,
    status: 'SUCCESS',
    details: { status },
  });

  return next;
}

/**
 * Generates and downloads a multi-sheet Excel (.xlsx) workbook containing
 * Form A, Form B, Form C, and Form D under Payment of Bonus Rules / Code on Wages.
 */
export function exportBonusRegistersWorkbook(run: BonusOffCycleRun): string {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Form A (Computation of Allocable Surplus)
  const formARows = [
    {
      'Particulars (Form A - Allocable Surplus)': 'Establishment Name',
      'Amount / Value': run.formA.companyName,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Financial Year',
      'Amount / Value': run.formA.financialYear,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Gross Profit (Section 4)',
      'Amount / Value': run.formA.grossProfit,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Less: Depreciation (Sec 6(a))',
      'Amount / Value': run.formA.lessDepreciation,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Less: Direct Taxes (Sec 6(c))',
      'Amount / Value': run.formA.lessDirectTaxes,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Less: Return on Capital & Reserves (Sec 6(d))',
      'Amount / Value': run.formA.lessReturnOnCapital,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Available Surplus (Sec 5)',
      'Amount / Value': run.formA.availableSurplus,
    },
    {
      'Particulars (Form A - Allocable Surplus)': `Allocable Surplus (${run.formA.allocableSurplusPercentage}%)`,
      'Amount / Value': run.formA.allocableSurplus,
    },
    {
      'Particulars (Form A - Allocable Surplus)': 'Employer Loss-Making Mode',
      'Amount / Value': run.formA.isEmployerLossMaking ? 'Yes (8.33% Min + Form C Exemption)' : 'No',
    },
  ];
  const wsA = XLSX.utils.json_to_sheet(formARows);
  XLSX.utils.book_append_sheet(wb, wsA, 'Form A - Allocable Surplus');

  // Sheet 2: Form B (Set On & Set Off)
  const formBRows = run.formB.map((r) => ({
    'Accounting Year': r.accountingYear,
    'Amount Allocable as Bonus (₹)': r.amountAllocableAsBonus,
    'Amount Payable as Bonus (₹)': r.amountPayableAsBonus,
    'Set On for Year (₹)': r.setOnForYear,
    'Set Off for Year (₹)': r.setOffForYear,
    'Total Set On C/F (₹)': r.netSetOnCarriedForward,
    'Total Set Off C/F (₹)': r.netSetOffCarriedForward,
    Remarks: r.remarks,
  }));
  const wsB = XLSX.utils.json_to_sheet(formBRows);
  XLSX.utils.book_append_sheet(wb, wsB, 'Form B - Set On Set Off');

  // Sheet 3: Form C (Register of Bonus Paid to Employees - Excludes Ex-Gratia)
  const formCRows =
    run.formC.length > 0
      ? run.formC.map((r) => ({
          'Sl. No.': r.slNo,
          'Employee ID': r.workerId,
          'Name of Employee': r.workerName,
          "Father's / Husband's Name": r.fatherOrHusbandName,
          'Completed 15 Years Age': r.completed15YearsAge,
          Designation: r.designation,
          'Days Worked in Year': r.daysWorkedInYear,
          'Total Qualifying Wages (Capped ₹7,000/mo)': r.totalSalaryOrWageInYear,
          'Statutory Bonus Payable (₹)': r.statutoryBonusPayable,
          'Puja / Interim Bonus Paid (₹)': r.pujaOrInterimBonusPaid,
          'TDS Income Tax Deducted (₹)': r.tdsIncomeTaxDeducted,
          'Total Deductions (₹)': r.totalDeductions,
          'Net Bonus Payable (₹)': r.netAmountPayable,
          'Actual Amount Paid (₹)': r.actualAmountPaid,
          'Date of Payment': r.dateOfPayment,
          Remarks: r.remarks,
        }))
      : [
          {
            'Sl. No.': '-',
            Note: 'No employees qualified for statutory bonus register (<= ₹21,000/mo & >= 30 days).',
          },
        ];
  const wsC = XLSX.utils.json_to_sheet(formCRows);
  XLSX.utils.book_append_sheet(wb, wsC, 'Form C - Bonus Register');

  // Sheet 4: Form D (Annual Return)
  const formDRows = [
    { 'Form D Field': 'Name of Establishment', Value: run.formD.establishmentName },
    { 'Form D Field': 'Name of Employer / Occupier', Value: run.formD.employerName },
    { 'Form D Field': 'Address', Value: run.formD.address },
    { 'Form D Field': 'Financial Year', Value: run.formD.financialYear },
    { 'Form D Field': 'Accounting Year Ended On', Value: run.formD.accountingYearEndedOn },
    { 'Form D Field': 'Total Eligible Employees (<= ₹21,000/mo)', Value: run.formD.totalEligibleEmployees },
    { 'Form D Field': 'Total Qualifying Wages Paid (₹)', Value: run.formD.totalEligibleSalaryOrWage },
    { 'Form D Field': 'Bonus Percentage Declared (%)', Value: `${run.formD.bonusPercentageDeclared}%` },
    { 'Form D Field': 'Total Statutory Bonus Payable (₹)', Value: run.formD.totalStatutoryBonusPayable },
    { 'Form D Field': 'Statutory TDS Deducted (Sec 192) (₹)', Value: run.formD.totalStatutoryTdsDeducted },
    { 'Form D Field': 'Date of Payment', Value: run.formD.dateOfPayment },
    { 'Form D Field': '8-Month Statutory Window Deadline', Value: run.formD.statutoryDeadlineDate },
    { 'Form D Field': 'Paid Within 8-Month Window', Value: run.formD.paidWithinEightMonths ? 'Yes' : 'No (Overdue)' },
    { 'Form D Field': 'Employer Loss-Making', Value: run.formD.isEmployerLossMaking ? 'Yes' : 'No' },
    {
      'Form D Field': 'Statutory Exemption Form (Form C) Required',
      Value: run.formD.formCExemptionRequired ? 'YES - FILING REQUIRED' : 'No',
    },
    {
      'Form D Field': 'Form C Exemption Filing Ref',
      Value: run.formD.formCExemptionFiledRef || 'Pending Filing',
    },
    {
      'Form D Field': 'Non-Statutory Ex-Gratia Paid Separately (>₹21k, Excluded from Form C/D)',
      Value: run.formD.totalExGratiaPaidSeparately,
    },
  ];
  const wsD = XLSX.utils.json_to_sheet(formDRows);
  XLSX.utils.book_append_sheet(wb, wsD, 'Form D - Annual Return');

  const fileName = `Statutory_Bonus_Forms_ABCD_FY_${run.financialYear.replace('-', '_')}.xlsx`;
  if (typeof document !== 'undefined') {
    XLSX.writeFile(wb, fileName);
  }
  return fileName;
}

export const annualBonusService = {
  BONUS_ELIGIBILITY_CEILING,
  BONUS_CALCULATION_CEILING,
  MIN_STATUTORY_BONUS_PCT,
  MAX_STATUTORY_BONUS_PCT,
  STATUTORY_PAYOUT_WINDOW_MONTHS,
  MIN_WORKING_DAYS_ELIGIBILITY,
  getFinancialYearBounds,
  evaluateEightMonthWindow,
  calculateFyWorkedDays,
  calculateBonusIncrementalTds,
  computeFormARegister,
  computeFormBSetOnSetOff,
  calculateAnnualBonusRun,
  getSyncBonusOffCycleRuns,
  getBonusOffCycleRuns,
  saveBonusOffCycleRun,
  updateBonusRunStatus,
  exportBonusRegistersWorkbook,
};
