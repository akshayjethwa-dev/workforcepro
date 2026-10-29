import { 
  Worker, 
  MonthlyPayroll, 
  OrgSettings, 
  StatutoryBreakdown, 
  StatutoryCalculationTrace, 
  EmployeeTaxDeclaration, 
  Form16Data 
} from '../types/index';

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

  /**
   * Determine active state taking mid-year state transfer effective dates into account
   */
  public resolveActiveState(worker: Worker, currentMonthStr: string, defaultState = 'Maharashtra'): string {
    const assignedState = worker.state || defaultState;
    if (worker.stateEffectiveDate && worker.previousState) {
      const effectiveMonth = worker.stateEffectiveDate.slice(0, 7);
      if (currentMonthStr < effectiveMonth) {
        return worker.previousState;
      }
    }
    return assignedState;
  }

  /**
   * Calculate Professional Tax (PT) across all 28 states & 8 UTs
   * Includes gender exemptions (Maharashtra female <= 25,000 exempt) and February adjustments
   */
  public calculateProfessionalTax(
    grossMonthly: number, 
    state: string, 
    gender: string = 'Male', 
    monthNumber: number = new Date().getMonth() + 1
  ): { ptAmount: number; ruleApplied: string } {
    const cleanState = (state || 'Maharashtra').trim();
    const isFemale = gender.toLowerCase() === 'female';
    const isFebruary = monthNumber === 2;

    switch (cleanState) {
      case 'Maharashtra': {
        // Maharashtra State Tax on Professions, Trades, Callings and Employments Act
        // Women earning <= 25,000 per month are exempt under Govt Resolution
        if (isFemale && grossMonthly <= 25000) {
          return { ptAmount: 0, ruleApplied: 'Maharashtra PT: Female employee earning ≤ ₹25,000 is 100% exempt from PT.' };
        }
        if (grossMonthly <= 7500) {
          return { ptAmount: 0, ruleApplied: 'Maharashtra PT: Gross ≤ ₹7,500 (Nil)' };
        }
        if (grossMonthly <= 10000) {
          return { ptAmount: 175, ruleApplied: 'Maharashtra PT: ₹7,501 to ₹10,000 = ₹175/mo' };
        }
        // Gross > 10,000: ₹200 for 11 months, ₹300 in February to total ₹2,500/year
        const amt = isFebruary ? 300 : 200;
        const note = isFebruary 
          ? 'Maharashtra PT: Gross > ₹10,000 (February statutory escalation = ₹300)'
          : 'Maharashtra PT: Gross > ₹10,000 = ₹200/mo (March-January)';
        return { ptAmount: amt, ruleApplied: note };
      }

      case 'Karnataka': {
        // Karnataka Tax on Professions Act: Slabs updated (Nil up to 15,000; 200 above 15,000)
        if (grossMonthly <= 15000) {
          return { ptAmount: 0, ruleApplied: 'Karnataka PT: Gross ≤ ₹15,000 (Nil)' };
        }
        return { ptAmount: 200, ruleApplied: 'Karnataka PT: Gross > ₹15,000 = ₹200/mo' };
      }

      case 'Gujarat': {
        // Gujarat Panchayats, Municipalities & State Tax on Professions Act
        if (grossMonthly < 6000) {
          return { ptAmount: 0, ruleApplied: 'Gujarat PT: Gross < ₹6,000 (Nil)' };
        }
        if (grossMonthly < 9000) {
          return { ptAmount: 80, ruleApplied: 'Gujarat PT: ₹6,000 to ₹8,999 = ₹80/mo' };
        }
        if (grossMonthly < 12000) {
          return { ptAmount: 150, ruleApplied: 'Gujarat PT: ₹9,000 to ₹11,999 = ₹150/mo' };
        }
        return { ptAmount: 200, ruleApplied: 'Gujarat PT: Gross ≥ ₹12,000 = ₹200/mo' };
      }

      case 'Tamil Nadu': {
        // Tamil Nadu Municipal Laws: Prorated monthly from half-yearly slabs
        if (grossMonthly <= 3500) return { ptAmount: 0, ruleApplied: 'Tamil Nadu PT: Gross ≤ ₹3,500 (Nil)' };
        if (grossMonthly <= 5000) return { ptAmount: 23, ruleApplied: 'Tamil Nadu PT: ₹3,501 to ₹5,000 (~₹23/mo)' };
        if (grossMonthly <= 7500) return { ptAmount: 53, ruleApplied: 'Tamil Nadu PT: ₹5,001 to ₹7,500 (~₹53/mo)' };
        if (grossMonthly <= 10000) return { ptAmount: 115, ruleApplied: 'Tamil Nadu PT: ₹7,501 to ₹10,000 (~₹115/mo)' };
        if (grossMonthly <= 12500) return { ptAmount: 171, ruleApplied: 'Tamil Nadu PT: ₹10,001 to ₹12,500 (~₹171/mo)' };
        return { ptAmount: 208, ruleApplied: 'Tamil Nadu PT: Gross > ₹12,500 (~₹208/mo, ₹1,250 half-yearly)' };
      }

      case 'Andhra Pradesh':
      case 'Telangana': {
        if (grossMonthly <= 15000) return { ptAmount: 0, ruleApplied: `${cleanState} PT: Gross ≤ ₹15,000 (Nil)` };
        if (grossMonthly <= 20000) return { ptAmount: 150, ruleApplied: `${cleanState} PT: ₹15,001 to ₹20,000 = ₹150/mo` };
        return { ptAmount: 200, ruleApplied: `${cleanState} PT: Gross > ₹20,000 = ₹200/mo` };
      }

      case 'West Bengal': {
        if (grossMonthly <= 10000) return { ptAmount: 0, ruleApplied: 'West Bengal PT: Gross ≤ ₹10,000 (Nil)' };
        if (grossMonthly <= 15000) return { ptAmount: 110, ruleApplied: 'West Bengal PT: ₹10,001 to ₹15,000 = ₹110/mo' };
        if (grossMonthly <= 25000) return { ptAmount: 130, ruleApplied: 'West Bengal PT: ₹15,001 to ₹25,000 = ₹130/mo' };
        if (grossMonthly <= 40000) return { ptAmount: 150, ruleApplied: 'West Bengal PT: ₹25,001 to ₹40,000 = ₹150/mo' };
        return { ptAmount: 200, ruleApplied: 'West Bengal PT: Gross > ₹40,000 = ₹200/mo' };
      }

      case 'Kerala': {
        if (grossMonthly < 2000) return { ptAmount: 0, ruleApplied: 'Kerala PT: Gross < ₹2,000 (Nil)' };
        if (grossMonthly < 3000) return { ptAmount: 20, ruleApplied: 'Kerala PT: ₹2,000 to ₹2,999 (~₹20/mo)' };
        if (grossMonthly < 5000) return { ptAmount: 30, ruleApplied: 'Kerala PT: ₹3,000 to ₹4,999 (~₹30/mo)' };
        if (grossMonthly < 7500) return { ptAmount: 50, ruleApplied: 'Kerala PT: ₹5,000 to ₹7,499 (~₹50/mo)' };
        if (grossMonthly < 10000) return { ptAmount: 75, ruleApplied: 'Kerala PT: ₹7,500 to ₹9,999 (~₹75/mo)' };
        if (grossMonthly < 12500) return { ptAmount: 100, ruleApplied: 'Kerala PT: ₹10,000 to ₹12,499 (~₹100/mo)' };
        return { ptAmount: 208, ruleApplied: 'Kerala PT: Gross ≥ ₹12,500 (~₹208/mo)' };
      }

      case 'Madhya Pradesh': {
        if (grossMonthly <= 18750) return { ptAmount: 0, ruleApplied: 'Madhya Pradesh PT: Gross ≤ ₹18,750 (Nil)' };
        const amt = isFebruary ? 212 : 208;
        return { ptAmount: amt, ruleApplied: 'Madhya Pradesh PT: Gross > ₹18,750 = ₹208/mo (₹2,500/year cap)' };
      }

      case 'Odisha': {
        if (grossMonthly <= 13333) return { ptAmount: 0, ruleApplied: 'Odisha PT: Gross ≤ ₹13,333 (Nil)' };
        if (grossMonthly <= 25000) return { ptAmount: 160, ruleApplied: 'Odisha PT: ₹13,334 to ₹25,000 = ₹160/mo' };
        const amt = isFebruary ? 300 : 200;
        return { ptAmount: amt, ruleApplied: 'Odisha PT: Gross > ₹25,000 = ₹200/mo' };
      }

      case 'Assam': {
        if (grossMonthly <= 10000) return { ptAmount: 0, ruleApplied: 'Assam PT: Gross ≤ ₹10,000 (Nil)' };
        if (grossMonthly <= 15000) return { ptAmount: 150, ruleApplied: 'Assam PT: ₹10,001 to ₹15,000 = ₹150/mo' };
        if (grossMonthly <= 25000) return { ptAmount: 180, ruleApplied: 'Assam PT: ₹15,001 to ₹25,000 = ₹180/mo' };
        return { ptAmount: 208, ruleApplied: 'Assam PT: Gross > ₹25,000 = ₹208/mo' };
      }

      case 'Bihar': {
        if (grossMonthly <= 25000) return { ptAmount: 0, ruleApplied: 'Bihar PT: Gross ≤ ₹25,000 (Nil)' };
        if (grossMonthly <= 41666) return { ptAmount: 83, ruleApplied: 'Bihar PT: ₹25,001 to ₹41,666 (~₹83/mo)' };
        if (grossMonthly <= 83333) return { ptAmount: 167, ruleApplied: 'Bihar PT: ₹41,667 to ₹83,333 (~₹167/mo)' };
        return { ptAmount: 208, ruleApplied: 'Bihar PT: Gross > ₹83,333 (~₹208/mo)' };
      }

      case 'Chhattisgarh': {
        if (grossMonthly <= 20833) return { ptAmount: 0, ruleApplied: 'Chhattisgarh PT: Gross ≤ ₹20,833 (Nil)' };
        if (grossMonthly <= 25000) return { ptAmount: 150, ruleApplied: 'Chhattisgarh PT: ₹20,834 to ₹25,000 = ₹150/mo' };
        return { ptAmount: 200, ruleApplied: 'Chhattisgarh PT: Gross > ₹25,000 = ₹200/mo' };
      }

      case 'Goa': {
        if (grossMonthly <= 15000) return { ptAmount: 0, ruleApplied: 'Goa PT: Gross ≤ ₹15,000 (Nil)' };
        if (grossMonthly <= 25000) return { ptAmount: 150, ruleApplied: 'Goa PT: ₹15,001 to ₹25,000 = ₹150/mo' };
        return { ptAmount: 200, ruleApplied: 'Goa PT: Gross > ₹25,000 = ₹200/mo' };
      }

      case 'Jharkhand': {
        if (grossMonthly <= 25000) return { ptAmount: 0, ruleApplied: 'Jharkhand PT: Gross ≤ ₹25,000 (Nil)' };
        if (grossMonthly <= 41666) return { ptAmount: 100, ruleApplied: 'Jharkhand PT: ₹25,001 to ₹41,666 = ₹100/mo' };
        if (grossMonthly <= 66666) return { ptAmount: 150, ruleApplied: 'Jharkhand PT: ₹41,667 to ₹66,666 = ₹150/mo' };
        if (grossMonthly <= 83333) return { ptAmount: 175, ruleApplied: 'Jharkhand PT: ₹66,667 to ₹83,333 = ₹175/mo' };
        return { ptAmount: 208, ruleApplied: 'Jharkhand PT: Gross > ₹83,333 = ₹208/mo' };
      }

      case 'Meghalaya':
      case 'Tripura': {
        if (grossMonthly <= 10000) return { ptAmount: 0, ruleApplied: `${cleanState} PT: Gross ≤ ₹10,000 (Nil)` };
        if (grossMonthly <= 20000) return { ptAmount: 150, ruleApplied: `${cleanState} PT: ₹10,001 to ₹20,000 = ₹150/mo` };
        return { ptAmount: 208, ruleApplied: `${cleanState} PT: Gross > ₹20,000 = ₹208/mo` };
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
        return { 
          ptAmount: 0, 
          ruleApplied: `${cleanState}: No Professional Tax levy under state/UT statutory code (Nil).` 
        };
      }
    }
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
   * Master Statutory Engine: Combines PF, ESI, PT, and TDS into a unified audited breakdown
   */
  public computeStatutoryDeductions(
    worker: Worker,
    basicWages: number,
    grossWages: number,
    overtimePay: number,
    allowances: number,
    currentMonthStr: string,
    orgSettings?: OrgSettings
  ): {
    statutory: StatutoryBreakdown;
    employerCostToCompany: number;
    totalEmployeeDeductions: number;
  } {
    const activeState = this.resolveActiveState(
      worker, 
      currentMonthStr, 
      orgSettings?.baseLocation?.address?.includes('Gujarat') ? 'Gujarat' : 'Maharashtra'
    );
    const monthNum = parseInt(currentMonthStr.split('-')[1] || '1', 10);
    const capPf = orgSettings?.compliance?.capPfDeduction !== false;

    // 1. Professional Tax
    const ptResult = this.calculateProfessionalTax(
      grossWages, 
      activeState, 
      worker.gender || 'Male', 
      monthNum
    );

    // 2. Provident Fund
    const pfResult = this.calculateProvidentFund(basicWages, {
      capAtStatutoryCeiling: capPf,
      isOptedOut: worker.pfOptOut,
      salaryRevisionDate: worker.salaryRevisionDate,
      currentMonthStr
    });

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

    const esiResult = this.calculateESI(grossWages, {
      isOptedOut: worker.esiOptOut,
      contractualGrossSalary: contractualGross,
      averageDailyWage: !isMonthlyWorker ? averageDailyWage : undefined,
      esiEnabled: orgSettings?.compliance?.esiEnabled !== false
    });

    // 4. TDS
    const tdsResult = this.calculateTDS(grossWages, worker.taxDeclarations);

    const totalEmployeeStatutory = pfResult.employeePf + esiResult.employeeEsi + ptResult.ptAmount + tdsResult.monthlyTds;
    const totalEmployerStatutory = pfResult.totalEmployerPf + esiResult.employerEsi;
    const employerCostToCompany = grossWages + totalEmployerStatutory;

    const calculationTrace: StatutoryCalculationTrace = {
      pfRuleApplied: pfResult.ruleApplied,
      pfCalculation: pfResult.calculationText,
      esiRuleApplied: esiResult.ruleApplied,
      esiCalculation: esiResult.calculationText,
      ptRuleApplied: ptResult.ruleApplied,
      ptCalculation: `Gross ₹${grossWages.toLocaleString()} in ${activeState} → PT Deducted: ₹${ptResult.ptAmount}`,
      tdsRuleApplied: tdsResult.ruleApplied,
      tdsCalculation: tdsResult.calculationText,
      employerLiabilitySummary: `Employer PF (13.0%) ₹${pfResult.totalEmployerPf.toLocaleString()} + Employer ESI (3.25%) ₹${esiResult.employerEsi.toLocaleString()} = ₹${totalEmployerStatutory.toLocaleString()} Total Statutory Liability added to CTC.`,
      sourceValues: {
        basic: basicWages,
        gross: grossWages,
        overtime: overtimePay,
        allowances,
        pfQualifyingWages: pfResult.pfWageBase,
        esiQualifyingWages: esiResult.esiWageBase,
        state: activeState,
        gender: worker.gender || 'Male',
        taxRegime: tdsResult.regime,
        annualProjectedGross: tdsResult.annualProjectedGross,
        totalExemptions: tdsResult.standardDeduction + tdsResult.chapterVIA,
        taxableIncome: tdsResult.annualTaxableIncome
      }
    };

    const statutory: StatutoryBreakdown = {
      employeePf: pfResult.employeePf,
      employeeEsi: esiResult.employeeEsi,
      professionalTax: ptResult.ptAmount,
      tds: tdsResult.monthlyTds,
      totalEmployeeStatutory,
      employerEpf: pfResult.employerEpf,
      employerEps: pfResult.employerEps,
      employerEdli: pfResult.employerEdli,
      employerAdminCharges: pfResult.employerAdmin,
      totalEmployerPf: pfResult.totalEmployerPf,
      employerEsi: esiResult.employerEsi,
      totalEmployerStatutory,
      pfWageBase: pfResult.pfWageBase,
      esiWageBase: esiResult.esiWageBase,
      ptGrossBase: grossWages,
      annualTaxableIncome: tdsResult.annualTaxableIncome,
      taxRegime: tdsResult.regime,
      state: activeState,
      esiDroppedNote: esiResult.droppedNote,
      isPfCapped: pfResult.isCapped,
      isEsiApplicable: esiResult.isApplicable,
      calculationTrace
    };

    return {
      statutory,
      employerCostToCompany,
      totalEmployeeDeductions: totalEmployeeStatutory
    };
  }

  /**
   * Generate official EPFO ECR Text File string (#~# delimited format)
   */
  public generateECRFileContent(payrolls: MonthlyPayroll[], workers: Worker[]): string {
    const lines: string[] = [];
    const workerMap = new Map(workers.map(w => [w.id, w]));

    for (const p of payrolls) {
      const worker = workerMap.get(p.workerId);
      const uan = (worker?.uan || '').replace(/[^0-9]/g, '');
      if (!uan || uan.length !== 12) continue; // Skip workers without 12-digit UAN

      const memberName = (p.workerName || '').toUpperCase().slice(0, 50);
      const gross = Math.round(p.earnings.gross);
      const epfWages = Math.round(p.statutory?.pfWageBase || p.earnings.basic);
      const epsWages = Math.min(epfWages, StatutoryEngine.PF_STATUTORY_CEILING);
      const edliWages = epsWages;
      const eeEpfDue = Math.round(p.statutory?.employeePf || 0);
      const epsDue = Math.round(p.statutory?.employerEps || 0);
      const erEpfDue = Math.round(p.statutory?.employerEpf || 0);
      const ncpDays = Math.max(0, p.attendanceSummary.absentDays);
      const refund = 0;

      // EPFO ECR 2.0 format: UAN#~#MEMBER_NAME#~#GROSS#~#EPF_WAGES#~#EPS_WAGES#~#EDLI_WAGES#~#EE_EPF#~#EPS_DUE#~#ER_EPF#~#NCP_DAYS#~#REFUND
      lines.push(`${uan}#~#${memberName}#~#${gross}#~#${epfWages}#~#${epsWages}#~#${edliWages}#~#${eeEpfDue}#~#${epsDue}#~#${erEpfDue}#~#${ncpDays}#~#${refund}`);
    }

    return lines.join('\r\n');
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
