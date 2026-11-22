import { 
  Worker, 
  MonthlyPayroll, 
  OrgSettings, 
  StatutoryBreakdown, 
  StatutoryCalculationTrace, 
  EmployeeTaxDeclaration, 
  Form16Data,
  WageComplianceAudit,
  GratuityImpactProjection
} from '../types/index';
import {
  resolveWorkerWorkLocation,
  validateWorkerWageStructure,
} from './wageStructureValidationService';
import {
  calculateStateLwf,
  isWorkerContractor,
  isWorkerPtExempt,
  LwfCalculationResult,
} from './ptLwfDatabase';
import { ecrValidatorService } from './ecrValidatorService';

export const INDIAN_STATES = [
  'Maharashtra', 'Karnataka', 'Gujarat', 'Tamil Nadu', 'Andhra Pradesh', 
  'Telangana', 'West Bengal', 'Kerala', 'Madhya Pradesh', 'Odisha', 
  'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Jharkhand', 'Meghalaya', 
  'Manipur', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura', 'Delhi', 
  'Haryana', 'Uttar Pradesh', 'Rajasthan', 'Punjab', 'Himachal Pradesh', 
  'Uttarakhand', 'Chandigarh', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 
  'Andaman & Nicobar', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep'
] as const;

export type IndianStateName = typeof INDIAN_STATES[number];

export class StatutoryEngine {
  public static readonly PF_STATUTORY_CEILING = 15000;
  public static readonly ESI_STATUTORY_CEILING = 21000;
  public static readonly ESI_DISABILITY_CEILING = 25000;
  public static readonly LABOUR_CODE_EFFECTIVE_DATE = '2025-11-21';
  public static readonly LABOUR_CODE_EFFECTIVE_MONTH = '2025-11';

  /**
   * Checks whether the New Labour Codes (effective 21 November 2025) govern the payroll month.
   * Retrospective payroll runs (pre-Nov 2025) default to old rules and emit a warning.
   */
  public isLabourCodeEffective(
    monthStr: string,
    payrollRunDate?: string
  ): { isEffective: boolean; isRetrospective: boolean; warning?: string } {
    const cleanMonth = (monthStr || '').slice(0, 7);
    if (cleanMonth && cleanMonth < StatutoryEngine.LABOUR_CODE_EFFECTIVE_MONTH) {
      return {
        isEffective: false,
        isRetrospective: true,
        warning: `Retrospective Payroll (${cleanMonth} — pre-21 Nov 2025): Defaulting to legacy EPF/ESIC rules without 50% Rule excess allowance add-back. The new Labour Code 50% Rule automatically applies to current and future payroll periods.`
      };
    }
    if (
      cleanMonth === StatutoryEngine.LABOUR_CODE_EFFECTIVE_MONTH &&
      payrollRunDate &&
      payrollRunDate < StatutoryEngine.LABOUR_CODE_EFFECTIVE_DATE
    ) {
      return {
        isEffective: false,
        isRetrospective: true,
        warning: `Retrospective Payroll (${payrollRunDate} — pre-21 Nov 2025): Defaulting to legacy EPF/ESIC rules. New Labour Code 50% Rule applies from 21 Nov 2025 onwards.`
      };
    }
    return { isEffective: true, isRetrospective: false };
  }

  /**
   * Determine active state taking mid-year state transfer effective dates AND multi-state branches into account
   */
  public resolveActiveState(
    worker: Worker,
    currentMonthStr: string,
    defaultState = 'Maharashtra',
    orgSettings?: OrgSettings
  ): string {
    if (worker.stateEffectiveDate && worker.previousState) {
      const effectiveMonth = worker.stateEffectiveDate.slice(0, 7);
      if (currentMonthStr < effectiveMonth) {
        return worker.previousState;
      }
    }
    if (orgSettings) {
      return resolveWorkerWorkLocation(worker, orgSettings, currentMonthStr).state;
    }
    return worker.state || defaultState;
  }

  /**
   * Calculate Professional Tax (PT) across Indian states & UTs.
   * Supports:
   * - PT_EXEMPT (Multiple employers / previous employer PT-paid declaration)
   * - Gujarat PT: Nil up to ₹12,000/mo; ₹200/mo above ₹12,000 (₹300 in February if annual state cap is ₹2,500)
   * - Mid-month joining pro-ration based on days worked
   * - Mid-year threshold crossing (evaluates current month wages; no retrospective catch-up)
   */
  public calculateProfessionalTax(
    grossMonthly: number,
    state: string,
    gender: string = 'Male',
    monthNumber: number = new Date().getMonth() + 1,
    options: {
      ptExempt?: boolean;
      previousEmployerDeclaration?: Worker['ptPreviousEmployerDeclaration'];
      joinedDate?: string;
      currentMonthStr?: string;
      daysWorked?: number;
      totalDaysInMonth?: number;
      contractualMonthlyGross?: number;
      gujaratFeb300Adjustment?: boolean;
      maharashtraFeb300Adjustment?: boolean;
      ptMidMonthProrationEnabled?: boolean;
    } = {}
  ): {
    ptAmount: number;
    fullMonthPt: number;
    isPtExempt: boolean;
    exemptionNote?: string;
    februaryAdjustmentApplied: boolean;
    ptProratedInfo?: {
      isProrated: boolean;
      fullMonthPt: number;
      proratedPt: number;
      daysWorked: number;
      totalDaysInMonth: number;
      joiningDate?: string;
    };
    ruleApplied: string;
  } {
    const cleanState = (state || 'Maharashtra').trim();
    const isFemale = gender.toLowerCase() === 'female';
    const isFebruary = monthNumber === 2;

    if (options.ptExempt || options.previousEmployerDeclaration?.declared) {
      const prevEmp = options.previousEmployerDeclaration?.previousEmployerName;
      const certRef = options.previousEmployerDeclaration?.certificateRef;
      const detail = prevEmp
        ? `Previous employer declaration (${prevEmp}${certRef ? ` · Ref: ${certRef}` : ''})`
        : 'Admin marked employee as PT_EXEMPT (multiple employers declaration)';
      return {
        ptAmount: 0,
        fullMonthPt: 0,
        isPtExempt: true,
        exemptionNote: `PT_EXEMPT: ${detail}. PT not enforced.`,
        februaryAdjustmentApplied: false,
        ruleApplied: `PT_EXEMPT (${cleanState}): ${detail} — ₹0 deducted.`,
      };
    }

    // Determine mid-month joining context & pro-ration denominator
    const joinDateClean = (options.joinedDate || '').slice(0, 10);
    const monthPrefix = (options.currentMonthStr || '').slice(0, 7);
    const joinDay =
      joinDateClean && monthPrefix && joinDateClean.startsWith(monthPrefix)
        ? parseInt(joinDateClean.slice(8, 10), 10)
        : 1;
    const joinedMidMonth = Boolean(
      joinDateClean && monthPrefix && joinDateClean.startsWith(monthPrefix) && joinDay > 1
    );

    const parsedYear = monthPrefix ? parseInt(monthPrefix.split('-')[0], 10) : new Date().getFullYear();
    const inferredMonthDays =
      monthNumber >= 1 && monthNumber <= 12
        ? new Date(parsedYear, monthNumber, 0).getDate()
        : 30;
    const totalDaysInMonth =
      options.totalDaysInMonth && options.totalDaysInMonth > 0
        ? options.totalDaysInMonth
        : inferredMonthDays;

    const rawDaysWorked =
      typeof options.daysWorked === 'number'
        ? options.daysWorked
        : joinedMidMonth
        ? Math.max(0, totalDaysInMonth - joinDay + 1)
        : totalDaysInMonth;
    const daysWorked = Math.min(totalDaysInMonth, Math.max(0, rawDaysWorked));

    const shouldProrate =
      options.ptMidMonthProrationEnabled !== false &&
      totalDaysInMonth > 0 &&
      (joinedMidMonth ||
        (typeof options.daysWorked === 'number' && daysWorked < totalDaysInMonth)) &&
      daysWorked < totalDaysInMonth;

    // For mid-month joiners, evaluate slab against full-month contractual rate if available,
    // then pro-rate the slab amount by (daysWorked / totalDaysInMonth).
    const slabEvaluationWage =
      joinedMidMonth &&
      options.contractualMonthlyGross &&
      options.contractualMonthlyGross > grossMonthly
        ? options.contractualMonthlyGross
        : grossMonthly;

    let basePt = 0;
    let februaryAdjustmentApplied = false;
    let baseRule = '';

    if (grossMonthly <= 0 && !joinedMidMonth) {
      return {
        ptAmount: 0,
        fullMonthPt: 0,
        isPtExempt: false,
        februaryAdjustmentApplied: false,
        ruleApplied: `${cleanState} PT: ₹0 earned gross in period (Nil).`,
      };
    }

    switch (cleanState) {
      case 'Maharashtra': {
        if (isFemale && slabEvaluationWage <= 25000) {
          basePt = 0;
          baseRule = 'Maharashtra PT: Female employee earning ≤ ₹25,000 is 100% exempt from PT.';
        } else if (slabEvaluationWage <= 7500) {
          basePt = 0;
          baseRule = 'Maharashtra PT: Gross ≤ ₹7,500 (Nil)';
        } else if (slabEvaluationWage <= 10000) {
          basePt = 175;
          baseRule = 'Maharashtra PT: ₹7,501 to ₹10,000 = ₹175/mo';
        } else {
          const applyFeb300 = isFebruary && options.maharashtraFeb300Adjustment !== false;
          basePt = applyFeb300 ? 300 : 200;
          februaryAdjustmentApplied = applyFeb300;
          baseRule = applyFeb300
            ? 'Maharashtra PT: Gross > ₹10,000 (February statutory escalation = ₹300 for ₹2,500/yr cap)'
            : 'Maharashtra PT: Gross > ₹10,000 = ₹200/mo';
        }
        break;
      }

      case 'Karnataka': {
        if (slabEvaluationWage <= 15000) {
          basePt = 0;
          baseRule = 'Karnataka PT: Gross ≤ ₹15,000 (Nil)';
        } else {
          basePt = 200;
          baseRule = 'Karnataka PT: Gross > ₹15,000 = ₹200/mo';
        }
        break;
      }

      case 'Gujarat': {
        // Gujarat PT Slabs: Nil up to ₹12,000/month; ₹200/month above ₹12,000
        // Handles ₹300 February deduction when annual state cap is ₹2,500
        if (slabEvaluationWage <= 12000) {
          basePt = 0;
          baseRule = 'Gujarat PT: Monthly salary ≤ ₹12,000 (Nil)';
        } else {
          const applyFeb300 = isFebruary && options.gujaratFeb300Adjustment !== false;
          basePt = applyFeb300 ? 300 : 200;
          februaryAdjustmentApplied = applyFeb300;
          baseRule = applyFeb300
            ? 'Gujarat PT: Monthly salary > ₹12,000 — February adjustment ₹300 (annual ₹2,500 cap)'
            : 'Gujarat PT: Monthly salary > ₹12,000 = ₹200/mo';
        }
        break;
      }

      case 'Tamil Nadu': {
        if (slabEvaluationWage <= 3500) {
          basePt = 0;
          baseRule = 'Tamil Nadu PT: Gross ≤ ₹3,500 (Nil)';
        } else if (slabEvaluationWage <= 5000) {
          basePt = 23;
          baseRule = 'Tamil Nadu PT: ₹3,501 to ₹5,000 (~₹23/mo)';
        } else if (slabEvaluationWage <= 7500) {
          basePt = 53;
          baseRule = 'Tamil Nadu PT: ₹5,001 to ₹7,500 (~₹53/mo)';
        } else if (slabEvaluationWage <= 10000) {
          basePt = 115;
          baseRule = 'Tamil Nadu PT: ₹7,501 to ₹10,000 (~₹115/mo)';
        } else if (slabEvaluationWage <= 12500) {
          basePt = 171;
          baseRule = 'Tamil Nadu PT: ₹10,001 to ₹12,500 (~₹171/mo)';
        } else {
          basePt = 208;
          baseRule = 'Tamil Nadu PT: Gross > ₹12,500 (~₹208/mo, ₹1,250 half-yearly)';
        }
        break;
      }

      case 'Andhra Pradesh':
      case 'Telangana': {
        if (slabEvaluationWage <= 15000) {
          basePt = 0;
          baseRule = `${cleanState} PT: Gross ≤ ₹15,000 (Nil)`;
        } else if (slabEvaluationWage <= 20000) {
          basePt = 150;
          baseRule = `${cleanState} PT: ₹15,001 to ₹20,000 = ₹150/mo`;
        } else {
          basePt = 200;
          baseRule = `${cleanState} PT: Gross > ₹20,000 = ₹200/mo`;
        }
        break;
      }

      case 'West Bengal': {
        if (slabEvaluationWage <= 10000) {
          basePt = 0;
          baseRule = 'West Bengal PT: Gross ≤ ₹10,000 (Nil)';
        } else if (slabEvaluationWage <= 15000) {
          basePt = 110;
          baseRule = 'West Bengal PT: ₹10,001 to ₹15,000 = ₹110/mo';
        } else if (slabEvaluationWage <= 25000) {
          basePt = 130;
          baseRule = 'West Bengal PT: ₹15,001 to ₹25,000 = ₹130/mo';
        } else if (slabEvaluationWage <= 40000) {
          basePt = 150;
          baseRule = 'West Bengal PT: ₹25,001 to ₹40,000 = ₹150/mo';
        } else {
          basePt = 200;
          baseRule = 'West Bengal PT: Gross > ₹40,000 = ₹200/mo';
        }
        break;
      }

      case 'Kerala': {
        if (slabEvaluationWage < 2000) {
          basePt = 0;
          baseRule = 'Kerala PT: Gross < ₹2,000 (Nil)';
        } else if (slabEvaluationWage < 3000) {
          basePt = 20;
          baseRule = 'Kerala PT: ₹2,000 to ₹2,999 (~₹20/mo)';
        } else if (slabEvaluationWage < 5000) {
          basePt = 30;
          baseRule = 'Kerala PT: ₹3,000 to ₹4,999 (~₹30/mo)';
        } else if (slabEvaluationWage < 7500) {
          basePt = 50;
          baseRule = 'Kerala PT: ₹5,000 to ₹7,499 (~₹50/mo)';
        } else if (slabEvaluationWage < 10000) {
          basePt = 75;
          baseRule = 'Kerala PT: ₹7,500 to ₹9,999 (~₹75/mo)';
        } else if (slabEvaluationWage < 12500) {
          basePt = 100;
          baseRule = 'Kerala PT: ₹10,000 to ₹12,499 (~₹100/mo)';
        } else {
          basePt = 208;
          baseRule = 'Kerala PT: Gross ≥ ₹12,500 (~₹208/mo)';
        }
        break;
      }

      case 'Madhya Pradesh': {
        if (slabEvaluationWage <= 18750) {
          basePt = 0;
          baseRule = 'Madhya Pradesh PT: Gross ≤ ₹18,750 (Nil)';
        } else {
          basePt = isFebruary ? 212 : 208;
          februaryAdjustmentApplied = isFebruary;
          baseRule = 'Madhya Pradesh PT: Gross > ₹18,750 = ₹208/mo (₹2,500/year cap)';
        }
        break;
      }

      case 'Odisha': {
        if (slabEvaluationWage <= 13333) {
          basePt = 0;
          baseRule = 'Odisha PT: Gross ≤ ₹13,333 (Nil)';
        } else if (slabEvaluationWage <= 25000) {
          basePt = 160;
          baseRule = 'Odisha PT: ₹13,334 to ₹25,000 = ₹160/mo';
        } else {
          basePt = isFebruary ? 300 : 200;
          februaryAdjustmentApplied = isFebruary;
          baseRule = isFebruary
            ? 'Odisha PT: Gross > ₹25,000 (February ₹300 adjustment for ₹2,500/yr cap)'
            : 'Odisha PT: Gross > ₹25,000 = ₹200/mo';
        }
        break;
      }

      case 'Assam': {
        if (slabEvaluationWage <= 10000) {
          basePt = 0;
          baseRule = 'Assam PT: Gross ≤ ₹10,000 (Nil)';
        } else if (slabEvaluationWage <= 15000) {
          basePt = 150;
          baseRule = 'Assam PT: ₹10,001 to ₹15,000 = ₹150/mo';
        } else if (slabEvaluationWage <= 25000) {
          basePt = 180;
          baseRule = 'Assam PT: ₹15,001 to ₹25,000 = ₹180/mo';
        } else {
          basePt = 208;
          baseRule = 'Assam PT: Gross > ₹25,000 = ₹208/mo';
        }
        break;
      }

      case 'Bihar': {
        if (slabEvaluationWage <= 25000) {
          basePt = 0;
          baseRule = 'Bihar PT: Gross ≤ ₹25,000 (Nil)';
        } else if (slabEvaluationWage <= 41666) {
          basePt = 83;
          baseRule = 'Bihar PT: ₹25,001 to ₹41,666 (~₹83/mo)';
        } else if (slabEvaluationWage <= 83333) {
          basePt = 167;
          baseRule = 'Bihar PT: ₹41,667 to ₹83,333 (~₹167/mo)';
        } else {
          basePt = 208;
          baseRule = 'Bihar PT: Gross > ₹83,333 (~₹208/mo)';
        }
        break;
      }

      case 'Chhattisgarh': {
        if (slabEvaluationWage <= 20833) {
          basePt = 0;
          baseRule = 'Chhattisgarh PT: Gross ≤ ₹20,833 (Nil)';
        } else if (slabEvaluationWage <= 25000) {
          basePt = 150;
          baseRule = 'Chhattisgarh PT: ₹20,834 to ₹25,000 = ₹150/mo';
        } else {
          basePt = 200;
          baseRule = 'Chhattisgarh PT: Gross > ₹25,000 = ₹200/mo';
        }
        break;
      }

      case 'Goa': {
        if (slabEvaluationWage <= 15000) {
          basePt = 0;
          baseRule = 'Goa PT: Gross ≤ ₹15,000 (Nil)';
        } else if (slabEvaluationWage <= 25000) {
          basePt = 150;
          baseRule = 'Goa PT: ₹15,001 to ₹25,000 = ₹150/mo';
        } else {
          basePt = 200;
          baseRule = 'Goa PT: Gross > ₹25,000 = ₹200/mo';
        }
        break;
      }

      case 'Jharkhand': {
        if (slabEvaluationWage <= 25000) {
          basePt = 0;
          baseRule = 'Jharkhand PT: Gross ≤ ₹25,000 (Nil)';
        } else if (slabEvaluationWage <= 41666) {
          basePt = 100;
          baseRule = 'Jharkhand PT: ₹25,001 to ₹41,666 = ₹100/mo';
        } else if (slabEvaluationWage <= 66666) {
          basePt = 150;
          baseRule = 'Jharkhand PT: ₹41,667 to ₹66,666 = ₹150/mo';
        } else if (slabEvaluationWage <= 83333) {
          basePt = 175;
          baseRule = 'Jharkhand PT: ₹66,667 to ₹83,333 = ₹175/mo';
        } else {
          basePt = 208;
          baseRule = 'Jharkhand PT: Gross > ₹83,333 = ₹208/mo';
        }
        break;
      }

      case 'Meghalaya':
      case 'Tripura': {
        if (slabEvaluationWage <= 10000) {
          basePt = 0;
          baseRule = `${cleanState} PT: Gross ≤ ₹10,000 (Nil)`;
        } else if (slabEvaluationWage <= 20000) {
          basePt = 150;
          baseRule = `${cleanState} PT: ₹10,001 to ₹20,000 = ₹150/mo`;
        } else {
          basePt = 208;
          baseRule = `${cleanState} PT: Gross > ₹20,000 = ₹208/mo`;
        }
        break;
      }

      // States and UTs with NO Professional Tax legislation
      case 'Delhi':
      case 'Haryana':
      case 'Uttar Pradesh':
      case 'Rajasthan':
      case 'Punjab':
      case 'Himachal Pradesh':
      case 'Uttarakhand':
      case 'Chandigarh':
      case 'Jammu & Kashmir':
      case 'Ladakh':
      case 'Andaman & Nicobar':
      case 'Dadra & Nagar Haveli and Daman & Diu':
      case 'Lakshadweep':
      case 'Puducherry':
      default: {
        basePt = 0;
        baseRule = `${cleanState}: No Professional Tax levy under state/UT statutory code (Nil).`;
        break;
      }
    }

    if (shouldProrate && basePt > 0) {
      const proratedPt = Math.round(basePt * (daysWorked / totalDaysInMonth));
      return {
        ptAmount: proratedPt,
        fullMonthPt: basePt,
        isPtExempt: false,
        februaryAdjustmentApplied,
        ptProratedInfo: {
          isProrated: true,
          fullMonthPt: basePt,
          proratedPt,
          daysWorked,
          totalDaysInMonth,
          joiningDate: joinDateClean || undefined,
        },
        ruleApplied: `${baseRule} · Pro-rated for mid-month joining (${daysWorked}/${totalDaysInMonth} days worked → ₹${proratedPt}).`,
      };
    }

    return {
      ptAmount: basePt,
      fullMonthPt: basePt,
      isPtExempt: false,
      februaryAdjustmentApplied,
      ruleApplied: baseRule,
    };
  }

  /**
   * Calculate State Labour Welfare Fund (LWF) deduction & employer contribution
   */
  public calculateLWF(
    state: string,
    monthNumber: number = new Date().getMonth() + 1,
    options: {
      isContractor?: boolean;
      ptLwfConfig?: OrgSettings['compliance'] extends infer C
        ? C extends { ptLwfConfig?: infer P }
          ? P
          : never
        : never;
      hasEarnedWages?: boolean;
      grossSalary?: number;
      monthlySalary?: number;
      previousState?: string;
      stateEffectiveDate?: string;
      currentMonthStr?: string;
      joinedDate?: string;
    } = {}
  ): LwfCalculationResult {
    return calculateStateLwf(state, monthNumber, {
      isContractor: options.isContractor,
      ptLwfConfig: options.ptLwfConfig as any,
      hasEarnedWages: options.hasEarnedWages,
      grossSalary: options.grossSalary,
      monthlySalary: options.monthlySalary,
      previousState: options.previousState,
      stateEffectiveDate: options.stateEffectiveDate,
      currentMonthStr: options.currentMonthStr,
      joinedDate: options.joinedDate,
    });
  }

  /**
   * Calculate Provident Fund (PF) with statutory ceiling option, employer split (EPF + EPS), and age check
   */
  public calculateProvidentFund(
    basicSalary: number, 
    options: {
      capAtStatutoryCeiling?: boolean;
      workerAge?: number;
      isOptedOut?: boolean;
      salaryRevisionDate?: string;
      currentMonthStr?: string;
    } = {}
  ): {
    employeePf: number;
    employerEpf: number;
    employerEps: number;
    employerEdli: number;
    employerAdmin: number;
    totalEmployerPf: number;
    pfWageBase: number;
    isCapped: boolean;
    ruleApplied: string;
    calculationText: string;
  } {
    if (options.isOptedOut) {
      return {
        employeePf: 0,
        employerEpf: 0,
        employerEps: 0,
        employerEdli: 0,
        employerAdmin: 0,
        totalEmployerPf: 0,
        pfWageBase: 0,
        isCapped: false,
        ruleApplied: 'PF Excluded: Worker opted out under Form 11 (Non-applicable).',
        calculationText: '0 (Opted Out)'
      };
    }

    const isCapped = options.capAtStatutoryCeiling !== false;
    const pfWageBase = isCapped 
      ? Math.min(basicSalary, StatutoryEngine.PF_STATUTORY_CEILING)
      : basicSalary;

    // Employee Contribution: 12% of PF Qualifying Basic Wages
    const employeePf = Math.round(pfWageBase * 0.12);

    // Employer Contribution: 12% split into EPS (8.33% capped at ₹1,250 on ₹15k) and EPF (3.67%)
    // Age check: If worker is 58 or older, EPS stops and entire 12% goes into EPF
    const isOver58 = (options.workerAge || 30) >= 58;
    
    let employerEps = 0;
    let employerEpf = 0;

    if (isOver58) {
      employerEps = 0;
      employerEpf = Math.round(pfWageBase * 0.12);
    } else {
      // EPS is 8.33% of PF wages capped at ₹15,000 (i.e. Max ₹1,250)
      const epsBase = Math.min(pfWageBase, StatutoryEngine.PF_STATUTORY_CEILING);
      employerEps = Math.round(epsBase * 0.0833);
      // EPF is the balancing difference from 12% (approx 3.67%)
      employerEpf = Math.max(0, employeePf - employerEps);
    }

    // EDLI: 0.5% (Capped at ₹15,000 = ₹75)
    const edliBase = Math.min(pfWageBase, StatutoryEngine.PF_STATUTORY_CEILING);
    const employerEdli = Math.round(edliBase * 0.005);

    // Admin Charges: 0.5% (EPFO Account 2)
    const employerAdmin = Math.round(pfWageBase * 0.005);

    const totalEmployerPf = employerEpf + employerEps + employerEdli + employerAdmin;

    const ceilingNote = isCapped && basicSalary > StatutoryEngine.PF_STATUTORY_CEILING
      ? `Capped at statutory wage ceiling ₹${StatutoryEngine.PF_STATUTORY_CEILING.toLocaleString()} (Actual Basic: ₹${basicSalary.toLocaleString()})`
      : `Actual Basic Wages ₹${basicSalary.toLocaleString()}`;

    const ruleApplied = `EPFO Statutory Rule (EPF Act 1952): Employee 12%, Employer 12% (EPF 3.67% + EPS 8.33% max ₹1,250), EDLI 0.5%, Admin 0.5%. ${ceilingNote}.`;
    const calculationText = `Employee: 12% of ₹${pfWageBase.toLocaleString()} = ₹${employeePf.toLocaleString()} | Employer: EPF(3.67%) ₹${employerEpf.toLocaleString()} + EPS(8.33%) ₹${employerEps.toLocaleString()} + EDLI ₹${employerEdli} + Admin ₹${employerAdmin} = ₹${totalEmployerPf.toLocaleString()}`;

    return {
      employeePf,
      employerEpf,
      employerEps,
      employerEdli,
      employerAdmin,
      totalEmployerPf,
      pfWageBase,
      isCapped,
      ruleApplied,
      calculationText
    };
  }

  /**
   * Calculate Employee State Insurance (ESI)
   * Section 2(9) Wage Ceiling: Evaluated against contractual monthly gross structure (₹21,000/mo ceiling).
   * If contractual wage structure exceeds ₹21,000, employee is permanently outside ESI coverage.
   * Absence / LWP dropping earned wages below ₹21,000 does NOT attract ESI coverage.
   */
  public calculateESI(
    grossSalary: number,
    options: {
      isOptedOut?: boolean;
      hasDisability?: boolean;
      contractualGrossSalary?: number;
      averageDailyWage?: number;
      esiEnabled?: boolean;
    } = {}
  ): {
    employeeEsi: number;
    employerEsi: number;
    totalEsi: number;
    esiWageBase: number;
    isApplicable: boolean;
    droppedNote?: string;
    ruleApplied: string;
    calculationText: string;
  } {
    if (options.esiEnabled === false) {
      return {
        employeeEsi: 0,
        employerEsi: 0,
        totalEsi: 0,
        esiWageBase: 0,
        isApplicable: false,
        ruleApplied: 'ESI Disabled: Organization compliance settings have ESI turned off.',
        calculationText: '0 (ESI Disabled for Organization)'
      };
    }

    if (options.isOptedOut) {
      return {
        employeeEsi: 0,
        employerEsi: 0,
        totalEsi: 0,
        esiWageBase: 0,
        isApplicable: false,
        ruleApplied: 'ESI Excluded: Worker opted out under ESIC registration.',
        calculationText: '0 (Not Applicable - Opted Out)'
      };
    }

    const ceiling = options.hasDisability 
      ? StatutoryEngine.ESI_DISABILITY_CEILING 
      : StatutoryEngine.ESI_STATUTORY_CEILING;

    // RULE 1: Contractual Gross Salary Check (ESIC Section 2(9))
    // Eligibility is determined by the contractual/normal wage structure, NOT by earned wages reduced by absence/LWP.
    const contractualWage = options.contractualGrossSalary ?? grossSalary;
    if (contractualWage > ceiling) {
      const note = `ESI Exempt: Contractual monthly salary (₹${contractualWage.toLocaleString()}) exceeds the statutory ceiling of ₹${ceiling.toLocaleString()}/mo. Absence/LWP reducing earned wages to ₹${grossSalary.toLocaleString()} does not attract ESI.`;
      return {
        employeeEsi: 0,
        employerEsi: 0,
        totalEsi: 0,
        esiWageBase: grossSalary,
        isApplicable: false,
        droppedNote: note,
        ruleApplied: `ESIC Section 2(9) Ceiling: Contractual salary ₹${contractualWage.toLocaleString()} > ₹${ceiling.toLocaleString()} (Exempt)`,
        calculationText: `Contractual ₹${contractualWage.toLocaleString()} > ₹${ceiling.toLocaleString()} → Exempt from ESI (₹0 deducted)`
      };
    }

    // RULE 2: If grossSalary is 0 (e.g. absent all month), no ESI contribution
    if (grossSalary <= 0) {
      return {
        employeeEsi: 0,
        employerEsi: 0,
        totalEsi: 0,
        esiWageBase: 0,
        isApplicable: true,
        ruleApplied: `ESIC Rule: Gross earned is ₹0 (No contribution payable).`,
        calculationText: `Gross ₹0 → ESI ₹0`
      };
    }

    // RULE 3: Low Daily Wage Exemption (Rule 52 of ESI Central Rules)
    // Employees whose average daily wage is up to ₹176 are exempt from employee contribution.
    const isExemptDailyWage = options.averageDailyWage && options.averageDailyWage <= 176;

    // Standard ESI: Employee 0.75%, Employer 3.25% of actual Gross Wages earned
    const employeeEsi = isExemptDailyWage ? 0 : Math.ceil(grossSalary * 0.0075);
    const employerEsi = Math.ceil(grossSalary * 0.0325);
    const totalEsi = employeeEsi + employerEsi;

    const ruleApplied = isExemptDailyWage 
      ? `ESIC Rule 52: Daily wage ≤ ₹176 (Employee Exempt ₹0, Employer 3.25% = ₹${employerEsi})`
      : `ESIC Statutory Rule: Employee 0.75% and Employer 3.25% of earned Gross Wages (Contractual: ₹${contractualWage.toLocaleString()} ≤ ₹${ceiling.toLocaleString()}).`;

    const calculationText = `Employee: ${isExemptDailyWage ? '0% (Exempt ≤₹176/day)' : '0.75% of ₹' + grossSalary.toLocaleString()} = ₹${employeeEsi} | Employer: 3.25% of ₹${grossSalary.toLocaleString()} = ₹${employerEsi} | Total ESIC: ₹${totalEsi}`;

    return {
      employeeEsi,
      employerEsi,
      totalEsi,
      esiWageBase: grossSalary,
      isApplicable: true,
      ruleApplied,
      calculationText
    };
  }

  /**
   * Calculate TDS (Section 192 Tax Withholding) supporting Old and New Tax Regimes (Section 115BAC)
   */
  public calculateTDS(
    grossMonthly: number,
    declarations?: EmployeeTaxDeclaration
  ): {
    monthlyTds: number;
    annualProjectedGross: number;
    annualTaxableIncome: number;
    annualTaxPayable: number;
    regime: 'NEW' | 'OLD';
    standardDeduction: number;
    chapterVIA: number;
    rebate87A: number;
    cess: number;
    ruleApplied: string;
    calculationText: string;
  } {
    const regime = declarations?.regime || 'NEW';
    const annualProjectedGross = Math.round(grossMonthly * 12);

    let standardDeduction = 0;
    let chapterVIA = 0;
    let taxableIncome = 0;
    let taxBeforeRebate = 0;
    let rebate87A = 0;

    if (regime === 'NEW') {
      // New Tax Regime (Section 115BAC) for FY 2024-25/2025-26:
      // Standard deduction: ₹75,000 for salaried employees
      standardDeduction = Math.min(annualProjectedGross, 75000);
      taxableIncome = Math.max(0, annualProjectedGross - standardDeduction);

      // Slabs:
      // 0 to 3,00,000: Nil
      // 3,00,001 to 7,00,000: 5%
      // 7,00,001 to 10,00,000: 10%
      // 10,00,001 to 12,00,000: 15%
      // 12,00,001 to 15,00,000: 20%
      // Above 15,00,000: 30%
      let rem = taxableIncome;
      if (rem > 300000) {
        const slab1 = Math.min(rem - 300000, 400000); // 3L to 7L
        taxBeforeRebate += slab1 * 0.05;
      }
      if (rem > 700000) {
        const slab2 = Math.min(rem - 700000, 300000); // 7L to 10L
        taxBeforeRebate += slab2 * 0.10;
      }
      if (rem > 1000000) {
        const slab3 = Math.min(rem - 1000000, 200000); // 10L to 12L
        taxBeforeRebate += slab3 * 0.15;
      }
      if (rem > 1200000) {
        const slab4 = Math.min(rem - 1200000, 300000); // 12L to 15L
        taxBeforeRebate += slab4 * 0.20;
      }
      if (rem > 1500000) {
        const slab5 = rem - 1500000;
        taxBeforeRebate += slab5 * 0.30;
      }

      // Section 87A rebate: If taxable income <= ₹7,00,000, rebate of 100% tax (up to ₹25,000)
      if (taxableIncome <= 700000) {
        rebate87A = taxBeforeRebate;
        taxBeforeRebate = 0;
      }

    } else {
      // Old Tax Regime:
      // Standard deduction: ₹50,000
      standardDeduction = Math.min(annualProjectedGross, 50000);

      const sec80C = Math.min(declarations?.section80C || 0, 150000);
      const sec80D = Math.min(declarations?.section80D || 0, 50000);
      const hra = declarations?.hraExemption || 0;
      const other = declarations?.otherExemptions || 0;
      chapterVIA = sec80C + sec80D + hra + other;

      taxableIncome = Math.max(0, annualProjectedGross - standardDeduction - chapterVIA);

      // Old Slabs:
      // 0 to 2,50,000: Nil
      // 2,50,001 to 5,00,000: 5%
      // 5,00,001 to 10,00,000: 20%
      // Above 10,00,000: 30%
      let rem = taxableIncome;
      if (rem > 250000) {
        const slab1 = Math.min(rem - 250000, 250000);
        taxBeforeRebate += slab1 * 0.05;
      }
      if (rem > 500000) {
        const slab2 = Math.min(rem - 500000, 500000);
        taxBeforeRebate += slab2 * 0.20;
      }
      if (rem > 1000000) {
        const slab3 = rem - 1000000;
        taxBeforeRebate += slab3 * 0.30;
      }

      // Section 87A rebate under old regime: If taxable income <= ₹5,00,000, rebate up to ₹12,500
      if (taxableIncome <= 500000) {
        rebate87A = taxBeforeRebate;
        taxBeforeRebate = 0;
      }
    }

    // Health & Education Cess: 4% on tax after rebate
    const cess = Math.round(taxBeforeRebate * 0.04);
    const annualTaxPayable = Math.round(taxBeforeRebate + cess);
    const monthlyTds = Math.round(annualTaxPayable / 12);

    const ruleApplied = regime === 'NEW'
      ? `New Tax Regime (Section 115BAC): Standard deduction ₹${standardDeduction.toLocaleString()}, Sec 87A rebate for income ≤ ₹7,00,000 + 4% cess.`
      : `Old Tax Regime: Standard deduction ₹${standardDeduction.toLocaleString()}, Chapter VI-A (80C/80D/HRA) ₹${chapterVIA.toLocaleString()}, Sec 87A rebate for income ≤ ₹5,00,000 + 4% cess.`;

    const calculationText = `Projected Annual: ₹${annualProjectedGross.toLocaleString()} | Taxable: ₹${taxableIncome.toLocaleString()} | Annual Tax: ₹${annualTaxPayable.toLocaleString()} (Incl. Cess ₹${cess}) → Monthly TDS: ₹${monthlyTds.toLocaleString()}`;

    return {
      monthlyTds,
      annualProjectedGross,
      annualTaxableIncome: taxableIncome,
      annualTaxPayable,
      regime,
      standardDeduction,
      chapterVIA,
      rebate87A,
      cess,
      ruleApplied,
      calculationText
    };
  }

  /**
   * Master Statutory Engine: Combines PF, ESI, PT, and TDS into a unified audited breakdown,
   * automatically applying the New Labour Code 50% Rule Excess Allowance Add-Back from 21 Nov 2025.
   */
  public computeStatutoryDeductions(
    worker: Worker,
    basicWages: number,
    grossWages: number,
    overtimePay: number,
    allowances: number,
    currentMonthStr: string,
    orgSettings?: OrgSettings,
    payrollRunDate?: string,
    ptContext?: {
      midMonthJoiningDaysWorked?: number;
      totalDaysInMonth?: number;
      contractualMonthlyGross?: number;
    }
  ): {
    statutory: StatutoryBreakdown;
    employerCostToCompany: number;
    totalEmployeeDeductions: number;
    wageComplianceAudit: WageComplianceAudit;
  } {
    const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

    const resolvedWorkLocation = resolveWorkerWorkLocation(
      worker,
      orgSettings,
      currentMonthStr
    );
    const activeState = this.resolveActiveState(
      worker,
      currentMonthStr,
      orgSettings?.baseLocation?.address?.includes('Gujarat') ? 'Gujarat' : 'Maharashtra',
      orgSettings
    );
    const lwfWorkLocationSource = resolvedWorkLocation.source;
    const monthNum = parseInt(currentMonthStr.split('-')[1] || '1', 10);
    const [yStr, mStr] = (currentMonthStr || new Date().toISOString().slice(0, 7)).split('-');
    const lastDay = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate() || 28;
    const evalDate = `${currentMonthStr}-${String(lastDay).padStart(2, '0')}`;
    const capPf =
      worker.wageConfig?.pfCapAtStatutoryCeiling === true
        ? true
        : orgSettings?.compliance?.capPfDeduction !== false;

    // 0. Evaluate Labour Code Effective Date & 50% Rule Excess Allowance Add-Back
    const effectiveCheck = this.isLabourCodeEffective(currentMonthStr, payrollRunDate);
    const structAudit = validateWorkerWageStructure(worker, {
      evaluationDate: evalDate,
      orgSettings
    });

    const earnedExclOvertime = Math.max(0, round2(grossWages - overtimePay));
    let originalBasicPay = basicWages;
    let originalDa = 0;
    let originalRetaining = 0;
    let originalWageBase = basicWages;
    let excludedComponents = allowances;

    // Derive proportional split from worker's salary structure when caller passes lumped basicWages
    const callerAlreadySplit = allowances > 0 || (earnedExclOvertime > 0 && basicWages < earnedExclOvertime - 0.01);
    if (callerAlreadySplit) {
      originalWageBase = round2(basicWages);
      excludedComponents = allowances > 0 ? round2(allowances) : round2(Math.max(0, earnedExclOvertime - basicWages));
      if (structAudit.wageBase > 0) {
        originalBasicPay = round2(originalWageBase * (structAudit.basicPay / structAudit.wageBase));
        originalDa = round2(originalWageBase * (structAudit.da / structAudit.wageBase));
        originalRetaining = round2(originalWageBase - originalBasicPay - originalDa);
      } else {
        originalBasicPay = originalWageBase;
      }
    } else if (structAudit.totalRemuneration > 0 && structAudit.excludedComponents > 0) {
      const ratio = earnedExclOvertime / structAudit.totalRemuneration;
      originalBasicPay = round2(structAudit.basicPay * ratio);
      originalDa = round2(structAudit.da * ratio);
      originalRetaining = round2(structAudit.retainingAllowance * ratio);
      originalWageBase = round2(originalBasicPay + originalDa + originalRetaining);
      excludedComponents = round2(Math.max(0, earnedExclOvertime - originalWageBase));
    }

    const totalRemunerationForRule = round2(originalWageBase + excludedComponents);
    const fiftyPercentThreshold = round2(totalRemunerationForRule * 0.50);
    const rawExcessAllowance = round2(excludedComponents - fiftyPercentThreshold);
    // Edge Case: Negative or zero excess allowance => add-back is 0 and structure is COMPLIANT
    const notionalWageAddition = rawExcessAllowance > 0 ? rawExcessAllowance : 0;
    const isStructureNonCompliant = totalRemunerationForRule > 0 && notionalWageAddition > 0;
    const addBackApplied = effectiveCheck.isEffective && isStructureNonCompliant;

    // AC2: CompliantWageBase = Basic + DA + Retaining Allowance + (Excluded Components - (Total CTC × 0.50))
    const compliantWageBase = addBackApplied
      ? round2(originalWageBase + notionalWageAddition)
      : originalWageBase;

    // 1. Professional Tax (supports Gujarat <= ₹12,000 Nil, Feb ₹300 cap adjustment, PT_EXEMPT & mid-month pro-rating)
    const ptLwfCfg = orgSettings?.compliance?.ptLwfConfig;
    const workerIsPtExempt = isWorkerPtExempt(worker);
    const workerIsContractor = isWorkerContractor(worker);
    const isMonthlyForContractual =
      worker.wageType === 'MONTHLY' ||
      worker.wageConfig?.type === 'MONTHLY' ||
      worker.category === 'Monthly';
    const activeMonthlyRate = isMonthlyForContractual
      ? (worker.salaryRevisionDate &&
          evalDate < worker.salaryRevisionDate &&
          worker.previousWageAmount &&
          worker.previousWageAmount > 0
          ? worker.previousWageAmount
          : worker.wageConfig?.amount || worker.monthlySalary || 0)
      : (worker.wageConfig?.amount || worker.dailyWage || 0) *
        (worker.wageConfig?.workingDaysPerMonth || 26);

    const ptResult = this.calculateProfessionalTax(
      grossWages,
      activeState,
      worker.gender || 'Male',
      monthNum,
      {
        ptExempt: workerIsPtExempt,
        previousEmployerDeclaration: worker.ptPreviousEmployerDeclaration,
        joinedDate: worker.joinedDate || worker.dateOfJoining,
        currentMonthStr,
        daysWorked: ptContext?.midMonthJoiningDaysWorked,
        totalDaysInMonth: ptContext?.totalDaysInMonth ?? lastDay,
        contractualMonthlyGross: ptContext?.contractualMonthlyGross ?? activeMonthlyRate,
        gujaratFeb300Adjustment: ptLwfCfg?.gujaratPtFeb300Adjustment,
        maharashtraFeb300Adjustment: ptLwfCfg?.maharashtraPtFeb300Adjustment,
        ptMidMonthProrationEnabled: ptLwfCfg?.ptMidMonthProrationEnabled,
      }
    );

    // 1b. State Labour Welfare Fund (LWF — work location state, cycle-aware, wage-ceiling & mid-year transfer split)
    const lwfResult = this.calculateLWF(activeState, monthNum, {
      isContractor: workerIsContractor,
      ptLwfConfig: ptLwfCfg,
      hasEarnedWages: grossWages > 0,
      grossSalary: grossWages,
      monthlySalary: activeMonthlyRate || grossWages,
      previousState: worker.previousState,
      stateEffectiveDate: worker.stateEffectiveDate,
      currentMonthStr,
      joinedDate: worker.joinedDate || worker.dateOfJoining,
    });

    // 2. Provident Fund (Original vs Recalculated CompliantWageBase)
    const originalPfResult = this.calculateProvidentFund(originalWageBase, {
      capAtStatutoryCeiling: capPf,
      isOptedOut: worker.pfOptOut,
      salaryRevisionDate: worker.salaryRevisionDate,
      currentMonthStr
    });

    const pfResult = addBackApplied
      ? this.calculateProvidentFund(compliantWageBase, {
          capAtStatutoryCeiling: capPf,
          isOptedOut: worker.pfOptOut,
          salaryRevisionDate: worker.salaryRevisionDate,
          currentMonthStr
        })
      : originalPfResult;

    if (addBackApplied && !worker.pfOptOut) {
      pfResult.ruleApplied = `${pfResult.ruleApplied} [50% Rule Add-Back Applied: Original WageBase ₹${originalWageBase.toLocaleString('en-IN')} + Notional Wage Addition ₹${notionalWageAddition.toLocaleString('en-IN')} = CompliantWageBase ₹${compliantWageBase.toLocaleString('en-IN')}]`;
      pfResult.calculationText = `Notional Add-Back +₹${notionalWageAddition.toLocaleString('en-IN')} → New Wage Base ₹${compliantWageBase.toLocaleString('en-IN')} | ${pfResult.calculationText}`;
    }

    // 3. Employee State Insurance (ESIC Section 2(9) Contractual Wage Structure Check)
    const isMonthlyWorker = worker.wageType === 'MONTHLY' || 
                            worker.wageConfig?.type === 'MONTHLY' || 
                            worker.category === 'Monthly';

    let contractualGross = 0;
    let averageDailyWage = 0;

    if (isMonthlyWorker) {
      contractualGross = (worker.wageConfig && typeof worker.wageConfig.amount === 'number' && worker.wageConfig.amount > 0)
        ? worker.wageConfig.amount
        : (worker.monthlySalary || (worker as any).amount || 25000);
    } else {
      const dailyRate = (worker.wageConfig && typeof worker.wageConfig.amount === 'number' && worker.wageConfig.amount > 0)
        ? worker.wageConfig.amount
        : (worker.dailyWage || 650);
      averageDailyWage = dailyRate;
      contractualGross = dailyRate * (worker.wageConfig?.workingDaysPerMonth || 26);
    }

    const originalEsiResult = this.calculateESI(grossWages, {
      isOptedOut: worker.esiOptOut,
      contractualGrossSalary: contractualGross,
      averageDailyWage: !isMonthlyWorker ? averageDailyWage : undefined,
      esiEnabled: orgSettings?.compliance?.esiEnabled !== false
    });

    const esiResult = addBackApplied
      ? this.calculateESI(compliantWageBase, {
          isOptedOut: worker.esiOptOut,
          contractualGrossSalary: contractualGross,
          averageDailyWage: !isMonthlyWorker ? averageDailyWage : undefined,
          esiEnabled: orgSettings?.compliance?.esiEnabled !== false
        })
      : originalEsiResult;

    if (addBackApplied && esiResult.isApplicable && !worker.esiOptOut) {
      esiResult.ruleApplied = `${esiResult.ruleApplied} [50% Rule Recalculated ESI Wage Base: CompliantWageBase ₹${compliantWageBase.toLocaleString('en-IN')}]`;
    }

    // 4. TDS
    const tdsResult = this.calculateTDS(grossWages, worker.taxDeclarations);

    const totalEmployeeStatutory =
      pfResult.employeePf +
      esiResult.employeeEsi +
      ptResult.ptAmount +
      lwfResult.employeeLwf +
      tdsResult.monthlyTds;
    const totalEmployerStatutory =
      pfResult.totalEmployerPf + esiResult.employerEsi + lwfResult.employerLwf;
    const employerCostToCompany = grossWages + totalEmployerStatutory;

    // 5. Gratuity Liability Impact Projection (Payment of Gratuity Act: 15/26 × Wage per year)
    const gratuityApplicable = totalRemunerationForRule > 0;
    const originalGratuityMonthlyAccrual = gratuityApplicable
      ? Math.round((originalWageBase * 15) / 26 / 12)
      : 0;
    const recalculatedGratuityMonthlyAccrual = gratuityApplicable
      ? Math.round((compliantWageBase * 15) / 26 / 12)
      : 0;
    const gratuityIncreaseMonthly = Math.max(
      0,
      recalculatedGratuityMonthlyAccrual - originalGratuityMonthlyAccrual
    );
    const gratuityIncreaseAnnual = addBackApplied
      ? Math.round((notionalWageAddition * 15) / 26)
      : 0;

    const gratuityImpact: GratuityImpactProjection = {
      applicable: gratuityApplicable,
      originalMonthlyAccrual: originalGratuityMonthlyAccrual,
      recalculatedMonthlyAccrual: recalculatedGratuityMonthlyAccrual,
      monthlyIncrease: gratuityIncreaseMonthly,
      annualIncrease: gratuityIncreaseAnnual,
      reason: gratuityApplicable
        ? '15/26 days wages per completed year (Code on Social Security)'
        : 'Zero qualifying remuneration in period'
    };

    const formulaText = addBackApplied
      ? `CompliantWageBase = ₹${originalWageBase.toLocaleString('en-IN')} + (₹${excludedComponents.toLocaleString('en-IN')} - ₹${fiftyPercentThreshold.toLocaleString('en-IN')}) = ₹${compliantWageBase.toLocaleString('en-IN')}`
      : isStructureNonCompliant && effectiveCheck.isRetrospective
      ? `Retrospective Pre-Nov 2025 Run: Legacy WageBase ₹${originalWageBase.toLocaleString('en-IN')} retained (Add-back ₹${notionalWageAddition.toLocaleString('en-IN')} deferred to periods ≥ Nov 2025)`
      : `Compliant Structure: WageBase ₹${originalWageBase.toLocaleString('en-IN')} ≥ 50% threshold (₹${fiftyPercentThreshold.toLocaleString('en-IN')}); Add-back = ₹0`;

    const wageComplianceAudit: WageComplianceAudit = {
      id: `wca_${worker.id}_${currentMonthStr}`,
      tenantId: worker.tenantId || '',
      workerId: worker.id,
      workerName: worker.name,
      payrollMonth: currentMonthStr,
      auditedAt: new Date().toISOString(),
      labourCodeEffectiveDate: StatutoryEngine.LABOUR_CODE_EFFECTIVE_DATE,
      isLabourCodeEffective: effectiveCheck.isEffective,
      isRetrospectivePeriod: effectiveCheck.isRetrospective,
      retrospectiveWarning: effectiveCheck.warning,
      complianceStatus: isStructureNonCompliant ? 'NON_COMPLIANT' : 'COMPLIANT',
      addBackApplied,
      basicPay: originalBasicPay,
      da: originalDa,
      retainingAllowance: originalRetaining,
      originalWageBase,
      excludedComponents,
      totalRemunerationForRule,
      fiftyPercentThreshold,
      rawExcessAllowance,
      notionalWageAddition: addBackApplied ? notionalWageAddition : 0,
      recalculatedWageBase: compliantWageBase,
      originalPfWageBase: originalPfResult.pfWageBase,
      recalculatedPfWageBase: pfResult.pfWageBase,
      originalEsiWageBase: originalEsiResult.esiWageBase,
      recalculatedEsiWageBase: esiResult.esiWageBase,
      originalEmployeePf: originalPfResult.employeePf,
      recalculatedEmployeePf: pfResult.employeePf,
      pfDeltaEmployee: pfResult.employeePf - originalPfResult.employeePf,
      originalEmployerPf: originalPfResult.totalEmployerPf,
      recalculatedEmployerPf: pfResult.totalEmployerPf,
      pfDeltaEmployer: pfResult.totalEmployerPf - originalPfResult.totalEmployerPf,
      originalEmployeeEsi: originalEsiResult.employeeEsi,
      recalculatedEmployeeEsi: esiResult.employeeEsi,
      esiDeltaEmployee: esiResult.employeeEsi - originalEsiResult.employeeEsi,
      originalEmployerEsi: originalEsiResult.employerEsi,
      recalculatedEmployerEsi: esiResult.employerEsi,
      esiDeltaEmployer: esiResult.employerEsi - originalEsiResult.employerEsi,
      gratuityImpact,
      formulaText
    };

    const calculationTrace: StatutoryCalculationTrace = {
      pfRuleApplied: pfResult.ruleApplied,
      pfCalculation: pfResult.calculationText,
      esiRuleApplied: esiResult.ruleApplied,
      esiCalculation: esiResult.calculationText,
      ptRuleApplied: ptResult.ruleApplied,
      ptCalculation: ptResult.isPtExempt
        ? `PT_EXEMPT in ${activeState} → PT Deducted: ₹0`
        : ptResult.ptProratedInfo?.isProrated
        ? `Full-month PT ₹${ptResult.fullMonthPt} × (${ptResult.ptProratedInfo.daysWorked}/${ptResult.ptProratedInfo.totalDaysInMonth} days) → PT Deducted: ₹${ptResult.ptAmount}`
        : `Gross ₹${grossWages.toLocaleString()} in ${activeState} (Month ${monthNum}) → PT Deducted: ₹${ptResult.ptAmount}`,
      lwfRuleApplied: lwfResult.ruleApplied,
      lwfCalculation: lwfResult.calculationText,
      tdsRuleApplied: tdsResult.ruleApplied,
      tdsCalculation: tdsResult.calculationText,
      employerLiabilitySummary: `Employer PF (13.0%) ₹${pfResult.totalEmployerPf.toLocaleString()} + Employer ESI (3.25%) ₹${esiResult.employerEsi.toLocaleString()}${lwfResult.employerLwf > 0 ? ` + Employer LWF ₹${lwfResult.employerLwf}` : ''} = ₹${totalEmployerStatutory.toLocaleString()} Total Statutory Liability added to CTC.`,
      excessAllowanceAddBackSummary: formulaText,
      sourceValues: {
        basic: originalWageBase,
        gross: grossWages,
        overtime: overtimePay,
        allowances: excludedComponents,
        originalWageBase,
        notionalWageAddition: addBackApplied ? notionalWageAddition : 0,
        compliantWageBase,
        pfQualifyingWages: pfResult.pfWageBase,
        esiQualifyingWages: esiResult.esiWageBase,
        state: activeState,
        gender: worker.gender || 'Male',
        taxRegime: tdsResult.regime,
        annualProjectedGross: tdsResult.annualProjectedGross,
        totalExemptions: tdsResult.standardDeduction + tdsResult.chapterVIA,
        taxableIncome: tdsResult.annualTaxableIncome,
        isPtExempt: ptResult.isPtExempt,
        isPtProrated: Boolean(ptResult.ptProratedInfo?.isProrated),
        ptDaysWorked: ptResult.ptProratedInfo?.daysWorked,
        ptTotalDaysInMonth: ptResult.ptProratedInfo?.totalDaysInMonth,
        isContractor: workerIsContractor,
        lwfApplicableMonth: lwfResult.isLwfApplicableMonth,
        lwfWorkLocationSource,
        lwfWageCeiling: lwfResult.wageCeilingApplied,
        monthNumber: monthNum
      }
    };

    const statutory: StatutoryBreakdown = {
      employeePf: pfResult.employeePf,
      employeeEsi: esiResult.employeeEsi,
      professionalTax: ptResult.ptAmount,
      employeeLwf: lwfResult.employeeLwf,
      tds: tdsResult.monthlyTds,
      totalEmployeeStatutory,
      employerEpf: pfResult.employerEpf,
      employerEps: pfResult.employerEps,
      employerEdli: pfResult.employerEdli,
      employerAdminCharges: pfResult.employerAdmin,
      totalEmployerPf: pfResult.totalEmployerPf,
      employerEsi: esiResult.employerEsi,
      employerLwf: lwfResult.employerLwf,
      totalEmployerStatutory,
      pfWageBase: pfResult.pfWageBase,
      esiWageBase: esiResult.esiWageBase,
      originalPfWageBase: originalPfResult.pfWageBase,
      originalEsiWageBase: originalEsiResult.esiWageBase,
      originalWageBase,
      notionalWageAddition: addBackApplied ? notionalWageAddition : 0,
      compliantWageBase,
      isLabourCodeEffective: effectiveCheck.isEffective,
      isRetrospectivePeriod: effectiveCheck.isRetrospective,
      retrospectiveWarning: effectiveCheck.warning,
      gratuityImpact,
      ptGrossBase: grossWages,
      annualTaxableIncome: tdsResult.annualTaxableIncome,
      taxRegime: tdsResult.regime,
      state: activeState,
      isPtExempt: ptResult.isPtExempt,
      ptExemptionStatus: ptResult.isPtExempt ? 'PT_EXEMPT' : 'NONE',
      ptExemptionNote: ptResult.exemptionNote,
      ptFebruaryAdjustmentApplied: ptResult.februaryAdjustmentApplied,
      ptProratedInfo: ptResult.ptProratedInfo,
      isLwfApplicableMonth: lwfResult.isLwfApplicableMonth,
      lwfCycleLabel: lwfResult.cycleLabel,
      lwfSkippedReason: lwfResult.skippedReason,
      isContractorExcludedFromLwf: lwfResult.isContractorExcluded,
      lwfWorkLocationSource,
      lwfWageCeilingApplied: lwfResult.wageCeilingApplied,
      lwfWageCeilingMode: lwfResult.wageCeilingMode,
      lwfTransferSplit: lwfResult.transferSplit,
      esiDroppedNote: esiResult.droppedNote,
      isPfCapped: pfResult.isCapped,
      isEsiApplicable: esiResult.isApplicable,
      calculationTrace
    };

    return {
      statutory,
      employerCostToCompany,
      totalEmployeeDeductions: totalEmployeeStatutory,
      wageComplianceAudit
    };
  }

  /**
   * Generate official EPFO ECR Text File string (#~# delimited format)
   * Enforces pre-upload validation checks, EPFO registered name preference,
   * duplicate UAN blocking, and omission of failed/excluded employees.
   */
  public generateECRFileContent(
    payrolls: MonthlyPayroll[],
    workers: Worker[],
    options?: {
      month?: string;
      orgSettings?: OrgSettings;
      excludeWorkerIds?: string[];
      includeOnlyWorkerIds?: string[];
      capWageAtCeiling?: boolean;
      statutoryEpfCeiling?: number;
    }
  ): string {
    const inferredMonth =
      options?.month ||
      payrolls[0]?.month ||
      new Date().toISOString().slice(0, 7);

    const report = ecrValidatorService.validateAndGenerateECR(workers, payrolls, [], {
      month: inferredMonth,
      orgSettings: options?.orgSettings,
      excludeWorkerIds: options?.excludeWorkerIds,
      includeOnlyWorkerIds: options?.includeOnlyWorkerIds,
      capWageAtCeiling: options?.capWageAtCeiling,
      statutoryEpfCeiling: options?.statutoryEpfCeiling,
    });

    return report.ecrContent;
  }

  /**
   * Generate Form 16 Part B structured data for tax filing
   */
  public generateForm16(worker: Worker, payrolls: MonthlyPayroll[], employerName: string): Form16Data {
    const workerPayrolls = payrolls.filter(p => p.workerId === worker.id);
    const totalGross = workerPayrolls.reduce((sum, p) => sum + p.earnings.gross, 0);
    const totalTds = workerPayrolls.reduce((sum, p) => sum + (p.statutory?.tds || 0), 0);
    const annualProjectedGross = totalGross > 0 ? (totalGross / Math.max(1, workerPayrolls.length)) * 12 : 360000;

    const tdsResult = this.calculateTDS(annualProjectedGross / 12, worker.taxDeclarations);

    const now = new Date();
    const currentYear = now.getFullYear();
    const assessmentYear = `${currentYear + 1}-${(currentYear + 2).toString().slice(2)}`;
    const financialYear = `${currentYear}-${(currentYear + 1).toString().slice(2)}`;

    return {
      assessmentYear,
      financialYear,
      employerName,
      employerTan: 'MUMB12345E',
      employerPan: 'AAACM1234F',
      employeeName: worker.name,
      employeePan: worker.pan || 'ABCDE1234F',
      employeeDesignation: worker.designation || 'Staff',
      periodFrom: `01/04/${currentYear}`,
      periodTo: `31/03/${currentYear + 1}`,
      grossSalary: Math.round(annualProjectedGross),
      standardDeduction: tdsResult.standardDeduction,
      section80C: worker.taxDeclarations?.section80C || 0,
      section80D: worker.taxDeclarations?.section80D || 0,
      otherExemptions: (worker.taxDeclarations?.hraExemption || 0) + (worker.taxDeclarations?.otherExemptions || 0),
      totalDeductions: tdsResult.standardDeduction + tdsResult.chapterVIA,
      taxableIncome: tdsResult.annualTaxableIncome,
      taxOnTotalIncome: tdsResult.annualTaxPayable - tdsResult.cess,
      rebate87A: tdsResult.rebate87A,
      surcharge: 0,
      healthAndEduCess: tdsResult.cess,
      totalTaxPayable: tdsResult.annualTaxPayable,
      taxDeductedAtSource: Math.round(totalTds > 0 ? totalTds : tdsResult.monthlyTds * workerPayrolls.length),
      regime: tdsResult.regime
    };
  }
}

export const statutoryEngine = new StatutoryEngine();
