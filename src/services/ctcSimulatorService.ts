import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CtcBulkRestructureAuditLog,
  CtcSimulationInput,
  CtcSimulationResult,
  CtcSimulationWorkerPlan,
  EmployeeRestructureConsentRecord,
  MagicLinkRestructureSummary,
  OrgSettings,
  WageBreakdownComponents,
  WageConfig,
  Worker,
  WorkerSkillCategory,
} from '../types/index';
import { dbService } from './db';
import { formatMagicMessage, magicLinkService, validateWorkerPhone } from './magicLinkService';
import { statutoryEngine } from './statutoryEngine';
import { tenantSecurityService } from './tenantSecurityService';
import {
  getStateMinimumWage,
  resolveWorkerDefaultState,
  validateWorkerWageStructure,
} from './wageStructureValidationService';

const CONSENT_STORAGE_PREFIX = 'workforce_restructure_consents_';
const AUDIT_STORAGE_PREFIX = 'workforce_ctc_bulk_audits_';

function round2(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
}

function safeInt(v: number): number {
  return Math.round(Number.isFinite(v) ? v : 0);
}

function loadLocal<T>(key: string): T[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal<T>(key: string, items: T[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Core What-If CTC Simulator calculation.
 * Shifts exact rupee amounts from Excluded Allowances (Others -> HRA -> Medical -> Travel)
 * into Basic Pay without inflating Total Remuneration.
 * Enforces State Minimum Wage floors and computes exact PF (EE + ER), Gratuity (15/26), and Take-Home deltas.
 */
export function simulateSingleCtc(input: CtcSimulationInput): CtcSimulationResult {
  const currentBasic = Math.max(0, round2(input.currentBasic));
  const da = Math.max(0, round2(input.da || 0));
  const retaining = Math.max(0, round2(input.retainingAllowance || 0));
  const hra = Math.max(0, round2(input.hra));
  const travel = Math.max(0, round2(input.travel));
  const medical = Math.max(0, round2(input.medical));
  const others = Math.max(0, round2(input.others));

  const currentWageBase = round2(currentBasic + da + retaining);
  const currentExcluded = round2(hra + travel + medical + others);
  const componentSum = round2(currentWageBase + currentExcluded);
  const totalRemuneration =
    input.totalCtcMonthly > 0 && Math.abs(input.totalCtcMonthly - componentSum) > 1
      ? round2(input.totalCtcMonthly)
      : componentSum;

  // Normalize "others" if caller adjusted totalCtcMonthly independently
  const normalizedOthers =
    totalRemuneration > componentSum
      ? round2(others + (totalRemuneration - componentSum))
      : others;
  const effectiveExcluded = round2(hra + travel + medical + normalizedOthers);
  const effectiveTotal = round2(currentWageBase + effectiveExcluded);

  const currentBasicPct =
    effectiveTotal > 0 ? Math.round((currentWageBase / effectiveTotal) * 1000) / 10 : 0;
  const required50PctBasic = Math.ceil(effectiveTotal * 0.5);
  const isCurrentlyCompliant = effectiveTotal > 0 && effectiveExcluded <= effectiveTotal * 0.5;

  const targetBasicPercentage = Math.max(10, Math.min(100, round2(input.targetBasicPercentage)));
  const targetWageBase = Math.min(
    effectiveTotal,
    Math.round((effectiveTotal * targetBasicPercentage) / 100)
  );
  const targetBasic = Math.max(0, round2(targetWageBase - da - retaining));
  const actualTargetWageBase = round2(targetBasic + da + retaining);

  const shiftAmount = round2(targetBasic - currentBasic);

  let nextHra = hra;
  let nextTravel = travel;
  let nextMedical = medical;
  let nextOthers = normalizedOthers;

  if (shiftAmount > 0) {
    // Shift from Others -> HRA -> Medical -> Travel to preserve zero budget inflation
    let remaining = shiftAmount;

    const trimOthers = Math.min(nextOthers, remaining);
    nextOthers = round2(nextOthers - trimOthers);
    remaining = round2(remaining - trimOthers);

    const trimHra = Math.min(nextHra, remaining);
    nextHra = round2(nextHra - trimHra);
    remaining = round2(remaining - trimHra);

    const trimMedical = Math.min(nextMedical, remaining);
    nextMedical = round2(nextMedical - trimMedical);
    remaining = round2(remaining - trimMedical);

    const trimTravel = Math.min(nextTravel, remaining);
    nextTravel = round2(nextTravel - trimTravel);
  } else if (shiftAmount < 0) {
    // Lowering Basic shifts difference back into HRA (still guarded by min-wage & 50% rule below)
    nextHra = round2(nextHra + Math.abs(shiftAmount));
  }

  const targetExcluded = round2(nextHra + nextTravel + nextMedical + nextOthers);
  const willBeCompliant = effectiveTotal > 0 && targetExcluded <= effectiveTotal * 0.5 + 0.01;

  // Minimum wage validation (Edge Case 2: simulator MUST NOT allow Basic below state min wage)
  const { monthlyFloor } = getStateMinimumWage(input.state, input.skillCategory);
  const violatesMinimumWage = effectiveTotal > 0 && targetBasic < monthlyFloor;
  const requiresCtcTopUp = effectiveTotal > 0 && effectiveTotal < monthlyFloor;
  const shortfallFromMinWage = violatesMinimumWage ? round2(monthlyFloor - targetBasic) : 0;

  let minimumWageBlockReason: string | undefined;
  if (violatesMinimumWage) {
    if (requiresCtcTopUp) {
      minimumWageBlockReason = `Total CTC (₹${effectiveTotal.toLocaleString('en-IN')}) is below ${input.state} statutory minimum wage floor (₹${monthlyFloor.toLocaleString('en-IN')}/mo for ${input.skillCategory.replace('_', ' ')}). A CTC increment of at least ₹${Math.round(monthlyFloor - effectiveTotal).toLocaleString('en-IN')}/mo is required instead of allowance shifting.`;
    } else {
      minimumWageBlockReason = `Target Basic Pay (₹${targetBasic.toLocaleString('en-IN')}) cannot be set below the ${input.state} statutory minimum wage floor of ₹${monthlyFloor.toLocaleString('en-IN')}/mo (Shortfall: ₹${shortfallFromMinWage.toLocaleString('en-IN')}/mo). Increase target Basic % or top up CTC.`;
    }
  }

  // Statutory Financial Impact using statutoryEngine
  const pfBefore = statutoryEngine.calculateProvidentFund(currentWageBase, {
    capAtStatutoryCeiling: input.capPfAt15k,
  });
  const pfAfter = statutoryEngine.calculateProvidentFund(actualTargetWageBase, {
    capAtStatutoryCeiling: input.capPfAt15k,
  });

  const pfEmployeeDeltaMonthly = pfAfter.employeePf - pfBefore.employeePf;
  const pfEmployerDeltaMonthly = pfAfter.totalEmployerPf - pfBefore.totalEmployerPf;
  const pfTotalDeltaMonthly = pfEmployeeDeltaMonthly + pfEmployerDeltaMonthly;

  const gratuityMonthlyBefore = Math.round((currentWageBase * 15) / 26 / 12);
  const gratuityMonthlyAfter = Math.round((actualTargetWageBase * 15) / 26 / 12);
  const gratuityMonthlyDelta = gratuityMonthlyAfter - gratuityMonthlyBefore;

  const gratuityAnnualBefore = Math.round((currentWageBase * 15) / 26);
  const gratuityAnnualAfter = Math.round((actualTargetWageBase * 15) / 26);
  const gratuityAnnualDelta = gratuityAnnualAfter - gratuityAnnualBefore;

  const esiBefore = statutoryEngine.calculateESI(effectiveTotal, {
    contractualGrossSalary: effectiveTotal,
    esiEnabled: input.esiEnabled,
  });
  const esiAfter = statutoryEngine.calculateESI(effectiveTotal, {
    contractualGrossSalary: effectiveTotal,
    esiEnabled: input.esiEnabled,
  });
  const esiEmployerDeltaMonthly = esiAfter.employerEsi - esiBefore.employerEsi;

  const employerCostDeltaMonthly = pfEmployerDeltaMonthly + esiEmployerDeltaMonthly + gratuityMonthlyDelta;
  const takeHomeBefore = Math.max(0, Math.round(effectiveTotal - pfBefore.employeePf - esiBefore.employeeEsi));
  const takeHomeAfter = Math.max(0, Math.round(effectiveTotal - pfAfter.employeePf - esiAfter.employeeEsi));
  const takeHomeDeltaMonthly = takeHomeAfter - takeHomeBefore;

  const pfDeltaDisplay = pfEmployerDeltaMonthly >= 0
    ? `+₹${pfEmployerDeltaMonthly.toLocaleString('en-IN')}`
    : `-₹${Math.abs(pfEmployerDeltaMonthly).toLocaleString('en-IN')}`;
  const gratDeltaDisplay = gratuityMonthlyDelta >= 0
    ? `+₹${gratuityMonthlyDelta.toLocaleString('en-IN')}`
    : `-₹${Math.abs(gratuityMonthlyDelta).toLocaleString('en-IN')}`;

  const ceilingNote =
    input.capPfAt15k && currentWageBase >= 15000 && actualTargetWageBase >= 15000
      ? ' (Employer PF unchanged due to ₹15,000 EPFO wage cap)'
      : input.capPfAt15k && actualTargetWageBase > 15000
      ? ' (EPF capped at ₹15,000 ceiling)'
      : ' (Uncapped PF on actual Basic)';

  const impactNarrative =
    shiftAmount >= 0
      ? `If you increase Basic to ₹${safeInt(targetBasic).toLocaleString('en-IN')}, your PF liability will change by ${pfDeltaDisplay}/mo (Employer)${ceilingNote}, and your Gratuity liability will increase by ${gratDeltaDisplay}/mo (₹${gratuityAnnualDelta.toLocaleString('en-IN')}/yr).`
      : `Setting Basic to ₹${safeInt(targetBasic).toLocaleString('en-IN')} shifts ₹${Math.abs(safeInt(shiftAmount)).toLocaleString('en-IN')} into allowances, altering Employer PF by ${pfDeltaDisplay}/mo and Gratuity by ${gratDeltaDisplay}/mo.`;

  return {
    totalRemuneration: effectiveTotal,
    currentBasic,
    currentWageBase,
    currentExcluded: effectiveExcluded,
    currentBasicPct,
    required50PctBasic,
    targetBasicPercentage,
    targetBasic,
    targetWageBase: actualTargetWageBase,
    targetExcluded,
    shiftAmount,
    breakdownBefore: {
      basic: currentBasic,
      da,
      retaining,
      hra,
      travel,
      medical,
      others: normalizedOthers,
    },
    breakdownAfter: {
      basic: targetBasic,
      da,
      retaining,
      hra: nextHra,
      travel: nextTravel,
      medical: nextMedical,
      others: nextOthers,
    },
    employeePfBefore: pfBefore.employeePf,
    employeePfAfter: pfAfter.employeePf,
    pfEmployeeDeltaMonthly,
    employerPfBefore: pfBefore.totalEmployerPf,
    employerPfAfter: pfAfter.totalEmployerPf,
    pfEmployerDeltaMonthly,
    pfTotalDeltaMonthly,
    gratuityMonthlyBefore,
    gratuityMonthlyAfter,
    gratuityMonthlyDelta,
    gratuityAnnualBefore,
    gratuityAnnualAfter,
    gratuityAnnualDelta,
    esiEmployerBefore: esiBefore.employerEsi,
    esiEmployerAfter: esiAfter.employerEsi,
    esiEmployerDeltaMonthly,
    employerCostDeltaMonthly,
    takeHomeBefore,
    takeHomeAfter,
    takeHomeDeltaMonthly,
    isCurrentlyCompliant,
    willBeCompliant,
    state: input.state,
    skillCategory: input.skillCategory,
    stateMinimumWageMonthly: monthlyFloor,
    violatesMinimumWage,
    requiresCtcTopUp,
    shortfallFromMinWage,
    minimumWageBlockReason,
    impactNarrative,
  };
}

/**
 * Generates a full before/after simulation & proposed WageConfig for an existing Worker.
 */
export function simulateWorkerRestructure(
  worker: Worker,
  targetBasicPercentage: number,
  orgSettings?: OrgSettings | null
): CtcSimulationWorkerPlan {
  const audit = validateWorkerWageStructure(worker, {
    ignoreRevisionCutoff: true,
    orgSettings: orgSettings || undefined,
  });

  const activeState = resolveWorkerDefaultState(worker, orgSettings || undefined);
  const skillCategory: WorkerSkillCategory = worker.skillCategory || 'UNSKILLED';
  const capPfAt15k = orgSettings?.compliance?.capPfDeduction !== false;
  const esiEnabled = orgSettings?.compliance?.esiEnabled !== false;

  const simulation = simulateSingleCtc({
    totalCtcMonthly: audit.totalRemuneration,
    currentBasic: audit.basicPay,
    da: audit.da,
    retainingAllowance: audit.retainingAllowance,
    hra: audit.hra,
    travel: audit.travelAllowance,
    medical: audit.medicalAllowance,
    others: audit.otherAllowances,
    targetBasicPercentage,
    state: activeState,
    skillCategory,
    capPfAt15k,
    esiEnabled,
  });

  const multiplier = audit.dailyMultiplier || 26;
  const currentConfig = worker.wageConfig || {
    type: audit.wageType,
    amount: audit.wageType === 'MONTHLY' ? audit.totalRemuneration : Math.round(audit.totalRemuneration / multiplier),
    overtimeEligible: true,
    allowances: { travel: 0, food: 0, nightShift: 0 },
  };

  let proposedWageConfig: WageConfig;
  if (audit.wageType === 'MONTHLY') {
    const newMonthlyBreakdown: WageBreakdownComponents = {
      basic: Math.round(simulation.breakdownAfter.basic),
      da: Math.round(simulation.breakdownAfter.da),
      retainingAllowance: Math.round(simulation.breakdownAfter.retaining),
      hra: Math.round(simulation.breakdownAfter.hra),
      travel: Math.round(simulation.breakdownAfter.travel),
      medical: Math.round(simulation.breakdownAfter.medical),
      others: Math.round(simulation.breakdownAfter.others),
      employerPf: currentConfig.monthlyBreakdown?.employerPf || 0,
      employerGratuity: currentConfig.monthlyBreakdown?.employerGratuity || 0,
    };

    const revisedTotal =
      newMonthlyBreakdown.basic +
      (newMonthlyBreakdown.da || 0) +
      (newMonthlyBreakdown.retainingAllowance || 0) +
      newMonthlyBreakdown.hra +
      (newMonthlyBreakdown.travel || 0) +
      (newMonthlyBreakdown.medical || 0) +
      newMonthlyBreakdown.others;

    proposedWageConfig = {
      ...currentConfig,
      type: 'MONTHLY',
      amount: revisedTotal,
      basicPercentage:
        revisedTotal > 0
          ? Math.round(
              ((newMonthlyBreakdown.basic +
                (newMonthlyBreakdown.da || 0) +
                (newMonthlyBreakdown.retainingAllowance || 0)) /
                revisedTotal) *
                100
            )
          : targetBasicPercentage,
      monthlyBreakdown: newMonthlyBreakdown,
      allowances: { travel: 0, food: 0, nightShift: 0 },
      complianceStatus: simulation.willBeCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceFlags: [
        ...(simulation.willBeCompliant ? [] : (['NON_COMPLIANT'] as const)),
        ...(simulation.violatesMinimumWage ? (['MINIMUM_WAGE_VIOLATION'] as const) : []),
      ],
      acknowledgedNonCompliant: !simulation.willBeCompliant,
    };
  } else {
    const newDailyBreakdown: WageBreakdownComponents = {
      basic: round2(simulation.breakdownAfter.basic / multiplier),
      da: round2(simulation.breakdownAfter.da / multiplier),
      retainingAllowance: round2(simulation.breakdownAfter.retaining / multiplier),
      hra: round2(simulation.breakdownAfter.hra / multiplier),
      travel: round2(simulation.breakdownAfter.travel / multiplier),
      medical: round2(simulation.breakdownAfter.medical / multiplier),
      others: round2(simulation.breakdownAfter.others / multiplier),
      employerPf: currentConfig.dailyBreakdown?.employerPf || 0,
      employerGratuity: currentConfig.dailyBreakdown?.employerGratuity || 0,
    };

    const dailyTotal = round2(
      newDailyBreakdown.basic +
        (newDailyBreakdown.da || 0) +
        (newDailyBreakdown.retainingAllowance || 0) +
        newDailyBreakdown.hra +
        (newDailyBreakdown.travel || 0) +
        (newDailyBreakdown.medical || 0) +
        newDailyBreakdown.others
    );

    proposedWageConfig = {
      ...currentConfig,
      type: 'DAILY',
      dailyMultiplier: multiplier,
      workingDaysPerMonth: multiplier,
      amount: dailyTotal,
      basicPercentage:
        dailyTotal > 0
          ? Math.round(
              ((newDailyBreakdown.basic +
                (newDailyBreakdown.da || 0) +
                (newDailyBreakdown.retainingAllowance || 0)) /
                dailyTotal) *
                100
            )
          : targetBasicPercentage,
      dailyBreakdown: newDailyBreakdown,
      allowances: { travel: 0, food: 0, nightShift: 0 },
      complianceStatus: simulation.willBeCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceFlags: [
        ...(simulation.willBeCompliant ? [] : (['NON_COMPLIANT'] as const)),
        ...(simulation.violatesMinimumWage ? (['MINIMUM_WAGE_VIOLATION'] as const) : []),
      ],
      acknowledgedNonCompliant: !simulation.willBeCompliant,
    };
  }

  let canApply = true;
  let blockedReason: string | undefined;

  if (simulation.violatesMinimumWage) {
    canApply = false;
    blockedReason = simulation.minimumWageBlockReason;
  } else if (!simulation.willBeCompliant) {
    canApply = false;
    blockedReason = `Target ${targetBasicPercentage}% leaves Basic below the mandatory 50% threshold.`;
  }

  return {
    workerId: worker.id,
    workerName: worker.name,
    workerPhone: worker.phone,
    designation: worker.designation,
    department: worker.department,
    wageType: audit.wageType,
    dailyMultiplier: multiplier,
    state: activeState,
    skillCategory,
    isCurrentlyCompliant: !audit.isFiftyPercentNonCompliant,
    canApply,
    blockedReason,
    simulation,
    proposedWageConfig,
  };
}

/**
 * Generates formal print-ready Salary Revision Letter text for an affected employee.
 */
export function generateSalaryRevisionLetterText(params: {
  companyName: string;
  plan: CtcSimulationWorkerPlan;
  effectiveDate: string;
  templateLabel: string;
  cbaOverrideRef?: string;
}): string {
  const { companyName, plan, effectiveDate, templateLabel, cbaOverrideRef } = params;
  const s = plan.simulation;
  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return [
    `${companyName.toUpperCase()}`,
    `SALARY STRUCTURE REVISION NOTICE (CODE ON WAGES 50% RULE ALIGNMENT)`,
    `Date: ${todayStr}`,
    ``,
    `To,`,
    `${plan.workerName}`,
    `${plan.designation} · ${plan.department} Department`,
    `Work State: ${plan.state} (${plan.wageType === 'DAILY' ? `Daily Wage × ${plan.dailyMultiplier} eq.` : 'Monthly Salaried'})`,
    ``,
    `Subject: Revision of Compensation Breakup Effective ${effectiveDate} (${templateLabel})`,
    ``,
    `Dear ${plan.workerName},`,
    ``,
    `In compliance with the New Labour Codes (Code on Wages, 2019 — 50% Wage Rule effective 21 Nov 2025), your compensation breakup is being re-aligned effective ${effectiveDate} while keeping your Total Monthly Remuneration unchanged at ₹${Math.round(s.totalRemuneration).toLocaleString('en-IN')}.`,
    ``,
    `COMPENSATION BREAKUP COMPARISON (MONTHLY EQUIVALENT):`,
    `----------------------------------------------------------------`,
    `Component                | Current (₹)     | Revised (₹)`,
    `----------------------------------------------------------------`,
    `Basic Pay                | ₹${Math.round(s.breakdownBefore.basic).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.basic).toLocaleString('en-IN')}`,
    `Dearness Allowance (DA)  | ₹${Math.round(s.breakdownBefore.da).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.da).toLocaleString('en-IN')}`,
    `Retaining Allowance      | ₹${Math.round(s.breakdownBefore.retaining).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.retaining).toLocaleString('en-IN')}`,
    `HRA                      | ₹${Math.round(s.breakdownBefore.hra).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.hra).toLocaleString('en-IN')}`,
    `Travel / Conveyance      | ₹${Math.round(s.breakdownBefore.travel).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.travel).toLocaleString('en-IN')}`,
    `Medical Allowance        | ₹${Math.round(s.breakdownBefore.medical).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.medical).toLocaleString('en-IN')}`,
    `Other Allowances         | ₹${Math.round(s.breakdownBefore.others).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.breakdownAfter.others).toLocaleString('en-IN')}`,
    `----------------------------------------------------------------`,
    `Total Gross Remuneration | ₹${Math.round(s.totalRemuneration).toLocaleString('en-IN').padEnd(14)} | ₹${Math.round(s.totalRemuneration).toLocaleString('en-IN')}`,
    `WageBase Share (% CTC)   | ${s.currentBasicPct}%             | ${s.targetBasicPercentage}%`,
    `----------------------------------------------------------------`,
    ``,
    `STATUTORY & TAKE-HOME SUMMARY:`,
    `- Reallocated from Allowances to Basic Pay: ₹${Math.round(s.shiftAmount).toLocaleString('en-IN')}/month`,
    `- Employee EPF Deduction: ₹${s.employeePfBefore.toLocaleString('en-IN')} -> ₹${s.employeePfAfter.toLocaleString('en-IN')}/mo (${s.pfEmployeeDeltaMonthly >= 0 ? '+' : ''}₹${s.pfEmployeeDeltaMonthly.toLocaleString('en-IN')})`,
    `- Employer PF Contribution: ₹${s.employerPfBefore.toLocaleString('en-IN')} -> ₹${s.employerPfAfter.toLocaleString('en-IN')}/mo (${s.pfEmployerDeltaMonthly >= 0 ? '+' : ''}₹${s.pfEmployerDeltaMonthly.toLocaleString('en-IN')})`,
    `- Projected Annual Gratuity Accrual: ₹${s.gratuityAnnualBefore.toLocaleString('en-IN')} -> ₹${s.gratuityAnnualAfter.toLocaleString('en-IN')}/yr (+₹${s.gratuityAnnualDelta.toLocaleString('en-IN')}/yr)`,
    `- Estimated Monthly Take-Home: ₹${s.takeHomeBefore.toLocaleString('en-IN')} -> ₹${s.takeHomeAfter.toLocaleString('en-IN')}/mo`,
    `- State Minimum Wage Verification (${plan.state}): Verified ≥ ₹${s.stateMinimumWageMonthly.toLocaleString('en-IN')}/mo statutory floor.`,
    ...(cbaOverrideRef
      ? [`- Collective Bargaining Agreement Settlement Ref: ${cbaOverrideRef}`]
      : []),
    ``,
    `Please acknowledge receipt of this salary structure revision via the WhatsApp acknowledgement link sent to your registered mobile number.`,
    ``,
    `Authorized Signatory`,
    `HR & Payroll Compliance Desk`,
    `${companyName}`,
  ].join('\n');
}

export const ctcSimulatorService = {
  simulateSingleCtc,
  simulateWorkerRestructure,
  generateSalaryRevisionLetterText,

  getConsentRecords: async (tenantId: string): Promise<EmployeeRestructureConsentRecord[]> => {
    const key = `${CONSENT_STORAGE_PREFIX}${tenantId}`;
    const local = loadLocal<EmployeeRestructureConsentRecord>(key);

    if (tenantId === 'demo-tenant-id') {
      return local;
    }

    try {
      const q = query(
        collection(db, 'restructure_consents'),
        where('tenantId', '==', tenantId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EmployeeRestructureConsentRecord[];
        const mergedMap = new Map<string, EmployeeRestructureConsentRecord>();
        [...local, ...remote].forEach((r) => mergedMap.set(r.id, r));
        return Array.from(mergedMap.values()).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      }
    } catch (e) {
      console.warn('getConsentRecords firestore fallback:', e);
    }
    return local;
  },

  saveConsentRecord: async (record: EmployeeRestructureConsentRecord): Promise<void> => {
    const key = `${CONSENT_STORAGE_PREFIX}${record.tenantId}`;
    const existing = loadLocal<EmployeeRestructureConsentRecord>(key);
    const next = [record, ...existing.filter((r) => r.id !== record.id)];
    saveLocal(key, next);

    if (record.tenantId !== 'demo-tenant-id') {
      try {
        await setDoc(doc(db, 'restructure_consents', record.id), record, { merge: true });
      } catch (e) {
        console.warn('saveConsentRecord firestore fallback:', e);
      }
    }
  },

  getBulkAuditLogs: async (tenantId: string): Promise<CtcBulkRestructureAuditLog[]> => {
    const key = `${AUDIT_STORAGE_PREFIX}${tenantId}`;
    const local = loadLocal<CtcBulkRestructureAuditLog>(key);

    if (tenantId === 'demo-tenant-id') {
      return local;
    }

    try {
      const q = query(
        collection(db, 'ctc_restructure_audits'),
        where('tenantId', '==', tenantId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CtcBulkRestructureAuditLog[];
        const merged = new Map<string, CtcBulkRestructureAuditLog>();
        [...local, ...remote].forEach((r) => merged.set(r.id, r));
        return Array.from(merged.values()).sort((a, b) => b.executedAt.localeCompare(a.executedAt));
      }
    } catch (e) {
      console.warn('getBulkAuditLogs firestore fallback:', e);
    }
    return local;
  },

  /**
   * Bulk-applies a selected restructuring template to the selected workers.
   * Enforces:
   *  1. Unionized Workforce / Collective Bargaining Agreement (CBA) guard
   *  2. State Minimum Wage floor (cannot apply if Basic < statutory minimum wage)
   *  3. Mid-year revision tracking (salaryRevisionDate + previousWageConfig)
   *  4. Employee consent tracking records + persistent audit log
   */
  applyBulkRestructure: async (params: {
    tenantId: string;
    workers: Worker[];
    plans: CtcSimulationWorkerPlan[];
    orgSettings?: OrgSettings | null;
    effectiveDate: string;
    templateLabel: string;
    targetBasicPercentage: number;
    executedBy: string;
    cbaCheckAcknowledged?: boolean;
    cbaOverrideRef?: string;
  }): Promise<{
    auditLog: CtcBulkRestructureAuditLog;
    updatedWorkers: Worker[];
    skippedWorkers: { workerId: string; workerName: string; reason: string }[];
    consentRecords: EmployeeRestructureConsentRecord[];
  }> => {
    const cba = params.orgSettings?.compliance?.unionizedCba;
    if (cba?.hasActiveCba && cba.prohibitsUnilateralRestructure && !params.cbaCheckAcknowledged) {
      throw new Error(
        `CBA_BLOCKED: Tenant has an active Collective Bargaining Agreement (${cba.unionName || 'Recognized Labour Union'}, Ref: ${cba.agreementRef || 'On File'}) prohibiting unilateral salary restructuring. Obtain Union settlement reference & confirm authorization before bulk applying.`
      );
    }

    const updatedWorkers: Worker[] = [];
    const skippedWorkers: { workerId: string; workerName: string; reason: string }[] = [];
    const consentRecords: EmployeeRestructureConsentRecord[] = [];
    const nowIso = new Date().toISOString();

    let totalShiftedMonthly = 0;
    let totalEmployerPfDeltaMonthly = 0;
    let totalGratuityDeltaAnnual = 0;

    for (const plan of params.plans) {
      const worker = params.workers.find((w) => w.id === plan.workerId);
      if (!worker) continue;

      // Edge Case 2: Never allow Basic below state minimum wage
      if (plan.simulation.violatesMinimumWage || !plan.canApply) {
        skippedWorkers.push({
          workerId: worker.id,
          workerName: worker.name,
          reason:
            plan.blockedReason ||
            plan.simulation.minimumWageBlockReason ||
            'Minimum wage or 50% rule floor validation failed.',
        });
        continue;
      }

      const updatePayload: Partial<Worker> = {
        wageConfig: plan.proposedWageConfig,
        salaryRevisionDate: params.effectiveDate,
        previousWageConfig: worker.wageConfig,
        previousWageAmount: worker.wageConfig?.amount,
      };

      await dbService.updateWorker(worker.id, updatePayload);
      const updatedWorker: Worker = { ...worker, ...updatePayload };
      updatedWorkers.push(updatedWorker);

      totalShiftedMonthly += Math.max(0, Math.round(plan.simulation.shiftAmount));
      totalEmployerPfDeltaMonthly += plan.simulation.pfEmployerDeltaMonthly;
      totalGratuityDeltaAnnual += plan.simulation.gratuityAnnualDelta;

      const consentRecord: EmployeeRestructureConsentRecord = {
        id: `consent_${worker.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        workerPhone: worker.phone,
        appliedAt: nowIso,
        effectiveDate: params.effectiveDate,
        templateLabel: params.templateLabel,
        oldBasic: Math.round(plan.simulation.breakdownBefore.basic),
        newBasic: Math.round(plan.simulation.breakdownAfter.basic),
        oldExcluded: Math.round(plan.simulation.currentExcluded),
        newExcluded: Math.round(plan.simulation.targetExcluded),
        totalRemuneration: Math.round(plan.simulation.totalRemuneration),
        shiftAmount: Math.round(plan.simulation.shiftAmount),
        pfEmployerDeltaMonthly: plan.simulation.pfEmployerDeltaMonthly,
        gratuityAnnualDelta: plan.simulation.gratuityAnnualDelta,
        status: 'NOT_SENT',
        channel: 'WHATSAPP',
      };

      await ctcSimulatorService.saveConsentRecord(consentRecord);
      consentRecords.push(consentRecord);
    }

    const auditLog: CtcBulkRestructureAuditLog = {
      id: `ctc_audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tenantId: params.tenantId,
      executedAt: nowIso,
      executedBy: params.executedBy,
      effectiveDate: params.effectiveDate,
      templateLabel: params.templateLabel,
      targetBasicPercentage: params.targetBasicPercentage,
      workersUpdatedCount: updatedWorkers.length,
      skippedCount: skippedWorkers.length,
      workerIds: updatedWorkers.map((w) => w.id),
      workerNames: updatedWorkers.map((w) => w.name),
      totalShiftedMonthly,
      totalEmployerPfDeltaMonthly,
      totalGratuityDeltaAnnual,
      cbaActive: Boolean(cba?.hasActiveCba),
      cbaOverrideRef: params.cbaOverrideRef,
      revisionLettersPrepared: updatedWorkers.length,
    };

    const auditKey = `${AUDIT_STORAGE_PREFIX}${params.tenantId}`;
    const prevAudits = loadLocal<CtcBulkRestructureAuditLog>(auditKey);
    saveLocal(auditKey, [auditLog, ...prevAudits]);

    if (params.tenantId !== 'demo-tenant-id') {
      try {
        await setDoc(doc(db, 'ctc_restructure_audits', auditLog.id), auditLog, { merge: true });
      } catch (e) {
        console.warn('save audit log firestore fallback:', e);
      }
    }

    await tenantSecurityService.logTenantAccess({
      tenantId: params.tenantId,
      userId: params.executedBy,
      userEmail: params.executedBy,
      userRole: 'FACTORY_OWNER',
      action: 'BULK_CTC_RESTRUCTURE',
      resource: `tenants/${params.tenantId}/workers/wageConfig`,
      status: 'SUCCESS',
      details: {
        templateLabel: params.templateLabel,
        targetBasicPercentage: params.targetBasicPercentage,
        effectiveDate: params.effectiveDate,
        workersUpdatedCount: updatedWorkers.length,
        skippedCount: skippedWorkers.length,
        totalShiftedMonthly,
        cbaActive: Boolean(cba?.hasActiveCba),
        cbaOverrideRef: params.cbaOverrideRef || null,
      },
    });

    return {
      auditLog,
      updatedWorkers,
      skippedWorkers,
      consentRecords,
    };
  },

  /**
   * Generates a scoped SALARY_RESTRUCTURE WhatsApp acknowledgement link for an employee
   * and marks their consent record as SENT_WHATSAPP.
   */
  sendRestructureWhatsAppNotice: async (params: {
    tenantId: string;
    worker: Worker;
    consentRecord: EmployeeRestructureConsentRecord;
    issuedBy: string;
  }): Promise<{
    consentRecord: EmployeeRestructureConsentRecord;
    whatsappUrl: string;
    localUrl: string;
    token: string;
    messageText: string;
  }> => {
    const summary: MagicLinkRestructureSummary = {
      effectiveDate: params.consentRecord.effectiveDate,
      templateLabel: params.consentRecord.templateLabel,
      wageType: params.worker.wageConfig?.type || 'MONTHLY',
      oldBasic: params.consentRecord.oldBasic,
      newBasic: params.consentRecord.newBasic,
      oldExcluded: params.consentRecord.oldExcluded,
      newExcluded: params.consentRecord.newExcluded,
      totalRemuneration: params.consentRecord.totalRemuneration,
      shiftAmount: params.consentRecord.shiftAmount,
      pfDeltaMonthly: params.consentRecord.pfEmployerDeltaMonthly,
      gratuityDeltaAnnual: params.consentRecord.gratuityAnnualDelta,
      consentStatus: 'SENT_WHATSAPP',
    };

    const linkResult = await magicLinkService.createWorkerMagicLink({
      tenantId: params.tenantId,
      worker: params.worker,
      scope: 'SALARY_RESTRUCTURE',
      channel: 'WHATSAPP',
      issuedBy: params.issuedBy,
      ttlHours: 168, // 7 days for worker review & acknowledgement
      restructureSummary: summary,
    });

    const phoneInfo = validateWorkerPhone(params.worker.phone);
    const messageText = formatMagicMessage(
      params.worker,
      'SALARY_RESTRUCTURE',
      linkResult.universalUrl,
      168,
      params.consentRecord.effectiveDate.slice(0, 7),
      summary
    );
    const whatsappUrl = phoneInfo.isValid
      ? `https://wa.me/${phoneInfo.cleanPhone}?text=${encodeURIComponent(messageText)}`
      : linkResult.whatsappUrl;

    const updatedRecord: EmployeeRestructureConsentRecord = {
      ...params.consentRecord,
      status: 'SENT_WHATSAPP',
      sentAt: new Date().toISOString(),
      magicToken: linkResult.token,
      whatsappUrl,
      portalUrl: linkResult.localUrl,
      messagePreview: messageText,
    };

    await ctcSimulatorService.saveConsentRecord(updatedRecord);

    return {
      consentRecord: updatedRecord,
      whatsappUrl,
      localUrl: linkResult.localUrl,
      token: linkResult.token,
      messageText,
    };
  },

  /**
   * Records worker consent acknowledgement or review request from the scoped WhatsApp link portal.
   */
  acknowledgeRestructureConsent: async (params: {
    token: string;
    decision: 'ACKNOWLEDGED' | 'DISPUTED';
    workerNote?: string;
  }): Promise<{
    success: boolean;
    consentRecord?: EmployeeRestructureConsentRecord;
  }> => {
    const respondedAt = new Date().toISOString();

    // 1. Update token record in localStorage store
    const tokenRes = await magicLinkService.updateRestructureTokenConsent(
      params.token,
      params.decision,
      respondedAt,
      params.workerNote
    );

    if (!tokenRes.tokenRecord) {
      return { success: false };
    }

    const tRec = tokenRes.tokenRecord;
    const records = await ctcSimulatorService.getConsentRecords(tRec.tenantId);
    let target = records.find((r) => r.magicToken === params.token)
      || records.find((r) => r.workerId === tRec.workerId);

    if (target) {
      target = {
        ...target,
        status: params.decision,
        acknowledgedAt: respondedAt,
        workerNote: params.workerNote,
      };
      await ctcSimulatorService.saveConsentRecord(target);
    }

    await tenantSecurityService.logTenantAccess({
      tenantId: tRec.tenantId,
      userId: tRec.workerId,
      userEmail: tRec.workerName,
      userRole: 'WORKER',
      action:
        params.decision === 'ACKNOWLEDGED'
          ? 'WORKER_RESTRUCTURE_ACKNOWLEDGED'
          : 'WORKER_RESTRUCTURE_REVIEW_REQUESTED',
      resource: `workers/${tRec.workerId}/restructure_consent`,
      status: 'SUCCESS',
      details: {
        tokenHash: tRec.tokenHash,
        decision: params.decision,
        workerNote: params.workerNote || null,
        respondedAt,
      },
    });

    return {
      success: true,
      consentRecord: target,
    };
  },
};
