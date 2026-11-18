import {
  INDIAN_STATES,
  LwfSkippedReason,
  LwfTransferSplitBreakdown,
  LwfWageCeilingMode,
  PtLwfOrgConfig,
  StateLwfConfigOverride,
  Worker,
} from '../types/index';

export interface StateLwfRule {
  state: string;
  enabled: boolean;
  cycle: 'HALF_YEARLY' | 'ANNUAL' | 'MONTHLY' | 'NONE';
  frequencyLabel: 'Monthly' | 'Half-Yearly' | 'Yearly' | 'None';
  cycleLabel: string;
  months: number[]; // 1..12 (e.g. [6, 12] for June & December)
  employeeAmount: number;
  employerAmount: number;
  employeePercentageRate?: number; // e.g., 0.002 for Haryana 0.2% capped at ₹35
  employerMultiplier?: number; // e.g., 2 for Haryana employer = 2x employee capped at ₹70
  wageCeiling?: number; // State-specific monthly wage eligibility ceiling / floor
  wageCeilingMode?: LwfWageCeilingMode;
  excludesContractors: boolean;
  statutoryNote: string;
}

export const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function cycleToFrequencyLabel(
  cycle: StateLwfRule['cycle'],
  enabled: boolean
): StateLwfRule['frequencyLabel'] {
  if (!enabled || cycle === 'NONE') return 'None';
  if (cycle === 'MONTHLY') return 'Monthly';
  if (cycle === 'HALF_YEARLY') return 'Half-Yearly';
  return 'Yearly';
}

function round2(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
}

const ACTIVE_STATE_LWF_RULES: Record<string, StateLwfRule> = {
  Gujarat: {
    state: 'Gujarat',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 6,
    employerAmount: 12,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Gujarat Labour Welfare Fund Act: ₹6 Employee + ₹12 Employer deducted half-yearly in June & December (configurable; contract labour excluded when tagged CONTRACTOR).',
  },
  Haryana: {
    state: 'Haryana',
    enabled: true,
    cycle: 'MONTHLY',
    frequencyLabel: 'Monthly',
    cycleLabel: 'Monthly (0.2% capped at ₹35)',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    employeeAmount: 35,
    employerAmount: 70,
    employeePercentageRate: 0.002,
    employerMultiplier: 2,
    wageCeilingMode: 'NONE',
    excludesContractors: false,
    statutoryNote:
      'Punjab LWF Act (Haryana Amendment): Monthly deduction at 0.2% of salary capped at ₹35 Employee + 2× (up to ₹70) Employer.',
  },
  Karnataka: {
    state: 'Karnataka',
    enabled: true,
    cycle: 'ANNUAL',
    frequencyLabel: 'Yearly',
    cycleLabel: 'Yearly (December)',
    months: [12],
    employeeAmount: 20,
    employerAmount: 40,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Karnataka LWF Act: ₹20 Employee + ₹40 Employer deducted yearly in December.',
  },
  Maharashtra: {
    state: 'Maharashtra',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 25,
    employerAmount: 75,
    wageCeilingMode: 'NONE',
    excludesContractors: false,
    statutoryNote:
      'Maharashtra LWF (Amended 2024): ₹25 Employee + ₹75 Employer deducted half-yearly in June & December; applies to direct & contract labour.',
  },
  'Tamil Nadu': {
    state: 'Tamil Nadu',
    enabled: true,
    cycle: 'ANNUAL',
    frequencyLabel: 'Yearly',
    cycleLabel: 'Yearly (December)',
    months: [12],
    employeeAmount: 20,
    employerAmount: 40,
    wageCeiling: 15000,
    wageCeilingMode: 'EXEMPT_ABOVE',
    excludesContractors: true,
    statutoryNote:
      'Tamil Nadu LWF Act: ₹20 Employee + ₹40 Employer deducted yearly in December for employees earning up to ₹15,000/mo wage ceiling.',
  },
  'Andhra Pradesh': {
    state: 'Andhra Pradesh',
    enabled: true,
    cycle: 'ANNUAL',
    frequencyLabel: 'Yearly',
    cycleLabel: 'Yearly (December)',
    months: [12],
    employeeAmount: 30,
    employerAmount: 70,
    wageCeiling: 15000,
    wageCeilingMode: 'EXEMPT_ABOVE',
    excludesContractors: true,
    statutoryNote:
      'Andhra Pradesh LWF Act: ₹30 Employee + ₹70 Employer deducted yearly in December (subject to ₹15,000/mo wage ceiling).',
  },
  Telangana: {
    state: 'Telangana',
    enabled: true,
    cycle: 'ANNUAL',
    frequencyLabel: 'Yearly',
    cycleLabel: 'Yearly (December)',
    months: [12],
    employeeAmount: 2,
    employerAmount: 5,
    wageCeiling: 15000,
    wageCeilingMode: 'EXEMPT_ABOVE',
    excludesContractors: true,
    statutoryNote:
      'Telangana LWF Act: ₹2 Employee + ₹5 Employer deducted yearly in December (subject to ₹15,000/mo wage ceiling).',
  },
  Delhi: {
    state: 'Delhi',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 1,
    employerAmount: 3,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Delhi LWF Rules: Nominal half-yearly deduction in June & December (₹1 EE / ₹3 ER).',
  },
  'West Bengal': {
    state: 'West Bengal',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 3,
    employerAmount: 15,
    wageCeiling: 15000,
    wageCeilingMode: 'EXEMPT_ABOVE',
    excludesContractors: true,
    statutoryNote:
      'West Bengal LWF Act: ₹3 Employee + ₹15 Employer deducted half-yearly in June & December (₹15,000/mo ceiling).',
  },
  Kerala: {
    state: 'Kerala',
    enabled: true,
    cycle: 'MONTHLY',
    frequencyLabel: 'Monthly',
    cycleLabel: 'Monthly',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    employeeAmount: 50,
    employerAmount: 50,
    wageCeilingMode: 'NONE',
    excludesContractors: false,
    statutoryNote: 'Kerala LWF Act: ₹50 Employee + ₹50 Employer monthly contribution.',
  },
  'Madhya Pradesh': {
    state: 'Madhya Pradesh',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 10,
    employerAmount: 30,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Madhya Pradesh LWF Act: ₹10 Employee + ₹30 Employer deducted half-yearly in June & December.',
  },
  Punjab: {
    state: 'Punjab',
    enabled: true,
    cycle: 'MONTHLY',
    frequencyLabel: 'Monthly',
    cycleLabel: 'Monthly',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    employeeAmount: 5,
    employerAmount: 20,
    wageCeilingMode: 'NONE',
    excludesContractors: false,
    statutoryNote: 'Punjab LWF Act: ₹5 Employee + ₹20 Employer monthly deduction.',
  },
  Goa: {
    state: 'Goa',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 60,
    employerAmount: 180,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Goa LWF Act: ₹60 Employee + ₹180 Employer deducted half-yearly in June & December.',
  },
  Odisha: {
    state: 'Odisha',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 10,
    employerAmount: 20,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Odisha LWF Act: ₹10 Employee + ₹20 Employer deducted half-yearly in June & December.',
  },
  Chhattisgarh: {
    state: 'Chhattisgarh',
    enabled: true,
    cycle: 'HALF_YEARLY',
    frequencyLabel: 'Half-Yearly',
    cycleLabel: 'Half-Yearly (June & December)',
    months: [6, 12],
    employeeAmount: 15,
    employerAmount: 45,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote:
      'Chhattisgarh LWF Act: ₹15 Employee + ₹45 Employer deducted half-yearly in June & December.',
  },
  Chandigarh: {
    state: 'Chandigarh',
    enabled: true,
    cycle: 'MONTHLY',
    frequencyLabel: 'Monthly',
    cycleLabel: 'Monthly',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    employeeAmount: 5,
    employerAmount: 20,
    wageCeilingMode: 'NONE',
    excludesContractors: false,
    statutoryNote: 'Chandigarh (Punjab LWF Extension): ₹5 Employee + ₹20 Employer monthly deduction.',
  },
};

function buildInactiveStateLwfRule(stateName: string): StateLwfRule {
  return {
    state: stateName,
    enabled: false,
    cycle: 'NONE',
    frequencyLabel: 'None',
    cycleLabel: 'No Active LWF',
    months: [],
    employeeAmount: 0,
    employerAmount: 0,
    wageCeilingMode: 'NONE',
    excludesContractors: true,
    statutoryNote: `${stateName}: No active State Labour Welfare Fund levy (₹0 deducted).`,
  };
}

export const STATE_LWF_RULES: Record<string, StateLwfRule> = (() => {
  const map: Record<string, StateLwfRule> = { ...ACTIVE_STATE_LWF_RULES };
  for (const st of INDIAN_STATES) {
    if (!map[st]) {
      map[st] = buildInactiveStateLwfRule(st);
    }
  }
  return map;
})();

export function resolveStateLwfRule(
  stateName: string,
  ptLwfConfig?: PtLwfOrgConfig
): StateLwfRule {
  const cleanState = (stateName || 'Maharashtra').trim();
  const baseRule: StateLwfRule =
    STATE_LWF_RULES[cleanState] || buildInactiveStateLwfRule(cleanState);

  const override: StateLwfConfigOverride | undefined = ptLwfConfig?.lwfOverrides?.[cleanState];
  if (!override) return baseRule;

  const enabled = override.enabled ?? baseRule.enabled;
  const resolvedCycle: StateLwfRule['cycle'] = override.cycle
    ? override.cycle
    : !enabled
    ? 'NONE'
    : baseRule.cycle === 'NONE' && (override.months?.length || 0) > 0
    ? override.months!.length === 12
      ? 'MONTHLY'
      : override.months!.length === 2
      ? 'HALF_YEARLY'
      : 'ANNUAL'
    : baseRule.cycle;

  const defaultMonthsForCycle =
    resolvedCycle === 'MONTHLY'
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : resolvedCycle === 'HALF_YEARLY'
      ? [6, 12]
      : resolvedCycle === 'ANNUAL'
      ? [12]
      : [];

  const months =
    override.months !== undefined
      ? [...override.months].sort((a, b) => a - b)
      : override.cycle
      ? defaultMonthsForCycle
      : baseRule.months;

  const finalCycle: StateLwfRule['cycle'] =
    !enabled || months.length === 0
      ? 'NONE'
      : override.cycle ||
        (months.length === 12
          ? 'MONTHLY'
          : months.length === 2
          ? 'HALF_YEARLY'
          : months.length === 1
          ? 'ANNUAL'
          : resolvedCycle);

  const cycleLabel = !enabled || months.length === 0
    ? 'No Active LWF'
    : months.length === 12
    ? baseRule.employeePercentageRate
      ? `Monthly (${round2(baseRule.employeePercentageRate * 100)}% capped at ₹${
          typeof override.employeeAmount === 'number'
            ? Math.max(0, override.employeeAmount)
            : baseRule.employeeAmount
        })`
      : 'Monthly'
    : months.length === 2 && months.includes(6) && months.includes(12)
    ? 'Half-Yearly (June & December)'
    : months.length === 1
    ? `Yearly (${MONTH_SHORT_NAMES[(months[0] || 1) - 1]})`
    : months.map((m) => MONTH_SHORT_NAMES[(m || 1) - 1]).join(', ');

  const wageCeiling =
    override.wageCeiling === null
      ? undefined
      : typeof override.wageCeiling === 'number'
      ? Math.max(0, override.wageCeiling)
      : baseRule.wageCeiling;

  const wageCeilingMode: LwfWageCeilingMode =
    override.wageCeilingMode ||
    (wageCeiling && wageCeiling > 0
      ? baseRule.wageCeilingMode && baseRule.wageCeilingMode !== 'NONE'
        ? baseRule.wageCeilingMode
        : 'EXEMPT_ABOVE'
      : 'NONE');

  return {
    ...baseRule,
    enabled,
    cycle: finalCycle,
    frequencyLabel: cycleToFrequencyLabel(finalCycle, enabled),
    employeeAmount:
      typeof override.employeeAmount === 'number'
        ? Math.max(0, override.employeeAmount)
        : baseRule.employeeAmount,
    employerAmount:
      typeof override.employerAmount === 'number'
        ? Math.max(0, override.employerAmount)
        : baseRule.employerAmount,
    employeePercentageRate:
      override.employeePercentageRate === null
        ? undefined
        : typeof override.employeePercentageRate === 'number'
        ? override.employeePercentageRate
        : baseRule.employeePercentageRate,
    months,
    cycleLabel,
    wageCeiling,
    wageCeilingMode,
    excludesContractors: override.excludeContractors ?? baseRule.excludesContractors,
  };
}

/**
 * Returns the complete state-wise LWF configuration matrix (active & inactive states)
 * with tenant overrides applied.
 */
export function getAllStateLwfConfigRows(ptLwfConfig?: PtLwfOrgConfig): StateLwfRule[] {
  const priorityStates = [
    'Gujarat',
    'Haryana',
    'Karnataka',
    'Maharashtra',
    'Tamil Nadu',
    'Delhi',
    'Andhra Pradesh',
    'Telangana',
    'West Bengal',
    'Uttar Pradesh',
    'Bihar',
    'Rajasthan',
  ];
  const seen = new Set<string>();
  const orderedStates: string[] = [];

  for (const st of priorityStates) {
    if (STATE_LWF_RULES[st] && !seen.has(st)) {
      seen.add(st);
      orderedStates.push(st);
    }
  }
  for (const st of Object.keys(STATE_LWF_RULES)) {
    if (!seen.has(st)) {
      seen.add(st);
      orderedStates.push(st);
    }
  }

  return orderedStates.map((st) => resolveStateLwfRule(st, ptLwfConfig));
}

export function isWorkerContractor(worker?: Partial<Worker> | null): boolean {
  if (!worker) return false;
  if (worker.isContractor === true) return true;
  if (worker.employmentType === 'CONTRACTOR' || worker.employmentType === 'CONTRACT') return true;
  if (!worker.employmentType && worker.category === 'Contract') return true;
  return false;
}

export function isWorkerPtExempt(worker?: Partial<Worker> | null): boolean {
  if (!worker) return false;
  if (worker.ptExempt === true) return true;
  if (worker.ptExemptionStatus === 'PT_EXEMPT') return true;
  if (worker.ptPreviousEmployerDeclaration?.declared === true) return true;
  return false;
}

export interface LwfCalculationResult {
  employeeLwf: number;
  employerLwf: number;
  isLwfApplicableMonth: boolean;
  cycleLabel: string;
  frequencyLabel: StateLwfRule['frequencyLabel'];
  excludesContractors: boolean;
  skippedReason?: LwfSkippedReason;
  isContractorExcluded: boolean;
  wageCeilingApplied?: number;
  wageCeilingMode?: LwfWageCeilingMode;
  transferSplit?: LwfTransferSplitBreakdown;
  ruleApplied: string;
  calculationText: string;
}

function checkWageCeilingEligibility(
  rule: StateLwfRule,
  salaryForCheck?: number
): { passed: boolean; skippedReason?: LwfSkippedReason; note?: string } {
  if (
    !rule.wageCeiling ||
    rule.wageCeiling <= 0 ||
    !rule.wageCeilingMode ||
    rule.wageCeilingMode === 'NONE' ||
    typeof salaryForCheck !== 'number' ||
    salaryForCheck <= 0
  ) {
    return { passed: true };
  }

  if (rule.wageCeilingMode === 'EXEMPT_ABOVE' && salaryForCheck > rule.wageCeiling) {
    return {
      passed: false,
      skippedReason: 'WAGE_CEILING_EXCEEDED',
      note: `Wage ₹${salaryForCheck.toLocaleString('en-IN')} exceeds ${rule.state} LWF wage ceiling of ₹${rule.wageCeiling.toLocaleString('en-IN')}/mo → Exempt (₹0).`,
    };
  }

  if (rule.wageCeilingMode === 'EXEMPT_BELOW' && salaryForCheck < rule.wageCeiling) {
    return {
      passed: false,
      skippedReason: 'BELOW_WAGE_THRESHOLD',
      note: `Wage ₹${salaryForCheck.toLocaleString('en-IN')} is below ${rule.state} LWF minimum threshold of ₹${rule.wageCeiling.toLocaleString('en-IN')}/mo → Exempt (₹0).`,
    };
  }

  return {
    passed: true,
    note: `Wage ₹${salaryForCheck.toLocaleString('en-IN')} satisfies ${rule.state} LWF ceiling ₹${rule.wageCeiling.toLocaleString('en-IN')}.`,
  };
}

function computeRuleSingleCycleAmounts(
  rule: StateLwfRule,
  salaryForPercentage?: number
): { employeeAmount: number; employerAmount: number; formulaNote: string } {
  if (!rule.enabled || rule.months.length === 0) {
    return { employeeAmount: 0, employerAmount: 0, formulaNote: 'No active LWF' };
  }

  if (rule.employeePercentageRate && rule.employeePercentageRate > 0) {
    if (typeof salaryForPercentage === 'number' && salaryForPercentage > 0) {
      const rawEmployee = Math.round(salaryForPercentage * rule.employeePercentageRate);
      const cappedEmployee = Math.min(rule.employeeAmount, rawEmployee);
      const rawEmployer = rule.employerMultiplier
        ? Math.min(rule.employerAmount, cappedEmployee * rule.employerMultiplier)
        : rule.employerAmount;
      const pctLabel = round2(rule.employeePercentageRate * 100);
      const capTag =
        rawEmployee > rule.employeeAmount
          ? ` (capped at ₹${rule.employeeAmount})`
          : '';
      return {
        employeeAmount: cappedEmployee,
        employerAmount: rawEmployer,
        formulaNote: `${pctLabel}% of ₹${salaryForPercentage.toLocaleString('en-IN')} = ₹${rawEmployee}${capTag} → EE ₹${cappedEmployee}, ER ₹${rawEmployer}`,
      };
    }
    return {
      employeeAmount: rule.employeeAmount,
      employerAmount: rule.employerAmount,
      formulaNote: `Cap ₹${rule.employeeAmount} EE / ₹${rule.employerAmount} ER`,
    };
  }

  return {
    employeeAmount: rule.employeeAmount,
    employerAmount: rule.employerAmount,
    formulaNote: `Fixed EE ₹${rule.employeeAmount} / ER ₹${rule.employerAmount}`,
  };
}

function getCycleWindowForMonth(
  rule: StateLwfRule,
  monthIdx: number
): { windowStart: number; windowEnd: number; cycleMonthsCount: number } {
  if (rule.cycle === 'MONTHLY') {
    return { windowStart: monthIdx, windowEnd: monthIdx, cycleMonthsCount: 1 };
  }
  if (rule.cycle === 'ANNUAL') {
    return { windowStart: 1, windowEnd: 12, cycleMonthsCount: 12 };
  }
  if (rule.cycle === 'HALF_YEARLY') {
    if (monthIdx <= 6) {
      return { windowStart: 1, windowEnd: 6, cycleMonthsCount: 6 };
    }
    return { windowStart: 7, windowEnd: 12, cycleMonthsCount: 6 };
  }
  return { windowStart: monthIdx, windowEnd: monthIdx, cycleMonthsCount: 1 };
}

function countStateMonthsInWindow(params: {
  windowStart: number;
  windowEnd: number;
  evalYear: number;
  transferYear: number;
  transferMonth: number;
  transferDay: number;
  joinYear?: number;
  joinMonth?: number;
  role: 'PREVIOUS' | 'CURRENT';
}): number {
  const {
    windowStart,
    windowEnd,
    evalYear,
    transferYear,
    transferMonth,
    transferDay,
    joinYear,
    joinMonth,
    role,
  } = params;

  let monthsCount = 0;

  for (let m = windowStart; m <= windowEnd; m++) {
    if (joinYear && joinMonth && evalYear === joinYear && m < joinMonth) {
      continue;
    }

    if (evalYear < transferYear) {
      if (role === 'PREVIOUS') monthsCount += 1;
    } else if (evalYear > transferYear) {
      if (role === 'CURRENT') monthsCount += 1;
    } else {
      // Same calendar year as transfer
      if (m < transferMonth) {
        if (role === 'PREVIOUS') monthsCount += 1;
      } else if (m > transferMonth) {
        if (role === 'CURRENT') monthsCount += 1;
      } else {
        // Transfer occurs within month m
        if (transferDay <= 1) {
          if (role === 'CURRENT') monthsCount += 1;
        } else {
          const daysInM = new Date(evalYear, m, 0).getDate() || 30;
          const prevFrac = round2((transferDay - 1) / daysInM);
          const currFrac = round2(1 - prevFrac);
          monthsCount += role === 'PREVIOUS' ? prevFrac : currFrac;
        }
      }
    }
  }

  return round2(monthsCount);
}

export function calculateStateLwf(
  stateName: string,
  monthNumber: number,
  options: {
    isContractor?: boolean;
    ptLwfConfig?: PtLwfOrgConfig;
    hasEarnedWages?: boolean;
    grossSalary?: number;
    monthlySalary?: number;
    previousState?: string;
    stateEffectiveDate?: string;
    currentMonthStr?: string;
    joinedDate?: string;
  } = {}
): LwfCalculationResult {
  const rule = resolveStateLwfRule(stateName, options.ptLwfConfig);
  const monthIdx = Math.min(12, Math.max(1, monthNumber || 1));
  const monthLabel = MONTH_SHORT_NAMES[monthIdx - 1];
  const salaryForCheck =
    typeof options.monthlySalary === 'number' && options.monthlySalary > 0
      ? options.monthlySalary
      : typeof options.grossSalary === 'number' && options.grossSalary > 0
      ? options.grossSalary
      : undefined;

  const evalYear = options.currentMonthStr
    ? parseInt(options.currentMonthStr.split('-')[0] || String(new Date().getFullYear()), 10)
    : new Date().getFullYear();

  // Check if a valid mid-year transfer applies on or before the evaluated month
  const cleanEffDate = (options.stateEffectiveDate || '').slice(0, 10);
  const cleanPrevState = (options.previousState || '').trim();
  const transferYear = cleanEffDate ? parseInt(cleanEffDate.slice(0, 4), 10) : 0;
  const transferMonth = cleanEffDate ? parseInt(cleanEffDate.slice(5, 7), 10) : 0;
  const transferDay = cleanEffDate ? parseInt(cleanEffDate.slice(8, 10) || '1', 10) : 1;

  const isMidYearTransferActive = Boolean(
    cleanPrevState &&
      cleanEffDate &&
      transferYear === evalYear &&
      transferMonth >= 1 &&
      transferMonth <= 12 &&
      monthIdx >= transferMonth &&
      cleanPrevState.toLowerCase() !== rule.state.toLowerCase()
  );

  if (isMidYearTransferActive) {
    const prevRule = resolveStateLwfRule(cleanPrevState, options.ptLwfConfig);
    const joinClean = (options.joinedDate || '').slice(0, 10);
    const joinYear = joinClean ? parseInt(joinClean.slice(0, 4), 10) : undefined;
    const joinMonth = joinClean ? parseInt(joinClean.slice(5, 7), 10) : undefined;

    const prevTriggeredInMonth =
      prevRule.enabled &&
      prevRule.months.includes(monthIdx) &&
      !(options.isContractor && prevRule.excludesContractors) &&
      checkWageCeilingEligibility(prevRule, salaryForCheck).passed;

    const currTriggeredInMonth =
      rule.enabled &&
      rule.months.includes(monthIdx) &&
      !(options.isContractor && rule.excludesContractors) &&
      checkWageCeilingEligibility(rule, salaryForCheck).passed;

    const prevWindow = getCycleWindowForMonth(prevRule, monthIdx);
    const currWindow = getCycleWindowForMonth(rule, monthIdx);

    const prevMonthsWorked = countStateMonthsInWindow({
      windowStart: prevWindow.windowStart,
      windowEnd: prevWindow.windowEnd,
      evalYear,
      transferYear,
      transferMonth,
      transferDay,
      joinYear,
      joinMonth,
      role: 'PREVIOUS',
    });

    const currMonthsWorked = countStateMonthsInWindow({
      windowStart: currWindow.windowStart,
      windowEnd: currWindow.windowEnd,
      evalYear,
      transferYear,
      transferMonth,
      transferDay,
      joinYear,
      joinMonth,
      role: 'CURRENT',
    });

    if (options.hasEarnedWages === false) {
      return {
        employeeLwf: 0,
        employerLwf: 0,
        isLwfApplicableMonth: currTriggeredInMonth || prevTriggeredInMonth,
        cycleLabel: rule.cycleLabel,
        frequencyLabel: rule.frequencyLabel,
        excludesContractors: rule.excludesContractors,
        skippedReason: 'NON_DEDUCTION_MONTH',
        isContractorExcluded: false,
        wageCeilingApplied: rule.wageCeiling,
        wageCeilingMode: rule.wageCeilingMode,
        ruleApplied: `${rule.state} LWF (${rule.cycleLabel}): Zero earned wages in ${monthLabel} — LWF ₹0.`,
        calculationText: `Zero earned wages in ${monthLabel} → LWF ₹0`,
      };
    }

    const prevFull = computeRuleSingleCycleAmounts(prevRule, salaryForCheck);
    const currFull = computeRuleSingleCycleAmounts(rule, salaryForCheck);

    const prevEmployeeShare =
      prevTriggeredInMonth && prevMonthsWorked > 0
        ? round2((prevFull.employeeAmount * prevMonthsWorked) / prevWindow.cycleMonthsCount)
        : 0;
    const prevEmployerShare =
      prevTriggeredInMonth && prevMonthsWorked > 0
        ? round2((prevFull.employerAmount * prevMonthsWorked) / prevWindow.cycleMonthsCount)
        : 0;

    const currEmployeeShare =
      currTriggeredInMonth && currMonthsWorked > 0
        ? round2((currFull.employeeAmount * currMonthsWorked) / currWindow.cycleMonthsCount)
        : 0;
    const currEmployerShare =
      currTriggeredInMonth && currMonthsWorked > 0
        ? round2((currFull.employerAmount * currMonthsWorked) / currWindow.cycleMonthsCount)
        : 0;

    const totalEmployeeLwf = round2(prevEmployeeShare + currEmployeeShare);
    const totalEmployerLwf = round2(prevEmployerShare + currEmployerShare);

    const splitSummary =
      `Mid-year transfer (${prevRule.state} → ${rule.state} on ${cleanEffDate}): ` +
      `${prevRule.state} (${prevMonthsWorked}/${prevWindow.cycleMonthsCount}m = ₹${prevEmployeeShare} EE / ₹${prevEmployerShare} ER) + ` +
      `${rule.state} (${currMonthsWorked}/${currWindow.cycleMonthsCount}m = ₹${currEmployeeShare} EE / ₹${currEmployerShare} ER)`;

    const transferSplit: LwfTransferSplitBreakdown = {
      isMidYearTransfer: true,
      transferEffectiveDate: cleanEffDate,
      previousState: prevRule.state,
      currentState: rule.state,
      previousStateCycle: prevRule.cycle,
      currentStateCycle: rule.cycle,
      monthsWorkedInPreviousState: prevMonthsWorked,
      monthsWorkedInCurrentState: currMonthsWorked,
      previousStateCycleMonths: prevWindow.cycleMonthsCount,
      currentStateCycleMonths: currWindow.cycleMonthsCount,
      previousStateEmployeeLwf: prevEmployeeShare,
      previousStateEmployerLwf: prevEmployerShare,
      currentStateEmployeeLwf: currEmployeeShare,
      currentStateEmployerLwf: currEmployerShare,
      totalEmployeeLwf,
      totalEmployerLwf,
      splitSummary,
    };

    const ceilingCheckCurr = checkWageCeilingEligibility(rule, salaryForCheck);
    let skippedReason: LwfSkippedReason | undefined;
    if (totalEmployeeLwf === 0 && totalEmployerLwf === 0) {
      if (options.isContractor && rule.excludesContractors) {
        skippedReason = 'CONTRACTOR_EXCLUDED';
      } else if (!ceilingCheckCurr.passed) {
        skippedReason = ceilingCheckCurr.skippedReason;
      } else if (!rule.enabled && !prevRule.enabled) {
        skippedReason = 'STATE_NO_LWF';
      } else {
        skippedReason = 'NON_DEDUCTION_MONTH';
      }
    }

    return {
      employeeLwf: totalEmployeeLwf,
      employerLwf: totalEmployerLwf,
      isLwfApplicableMonth: currTriggeredInMonth || prevTriggeredInMonth,
      cycleLabel: rule.cycleLabel,
      frequencyLabel: rule.frequencyLabel,
      excludesContractors: rule.excludesContractors,
      skippedReason,
      isContractorExcluded: Boolean(options.isContractor && rule.excludesContractors && !prevTriggeredInMonth),
      wageCeilingApplied: rule.wageCeiling,
      wageCeilingMode: rule.wageCeilingMode,
      transferSplit,
      ruleApplied: splitSummary,
      calculationText:
        totalEmployeeLwf > 0 || totalEmployerLwf > 0
          ? `${monthLabel} Transfer Split → EE ₹${totalEmployeeLwf} (${prevRule.state} ₹${prevEmployeeShare} + ${rule.state} ₹${currEmployeeShare}) | ER ₹${totalEmployerLwf}`
          : `${monthLabel}: Outside cycle / no active LWF across ${prevRule.state} → ${rule.state} → ₹0`,
    };
  }

  // Standard single-state LWF evaluation (using employee work location state)
  if (!rule.enabled || rule.months.length === 0) {
    const hasBaseRule = Boolean(STATE_LWF_RULES[rule.state] && STATE_LWF_RULES[rule.state].enabled);
    return {
      employeeLwf: 0,
      employerLwf: 0,
      isLwfApplicableMonth: false,
      cycleLabel: rule.cycleLabel,
      frequencyLabel: rule.frequencyLabel,
      excludesContractors: rule.excludesContractors,
      skippedReason: hasBaseRule ? 'DISABLED_IN_SETTINGS' : 'STATE_NO_LWF',
      isContractorExcluded: false,
      wageCeilingApplied: rule.wageCeiling,
      wageCeilingMode: rule.wageCeilingMode,
      ruleApplied: rule.statutoryNote,
      calculationText: `${rule.state} LWF: Not applicable / Disabled → ₹0`,
    };
  }

  const isScheduledMonth = rule.months.includes(monthIdx);

  if (options.isContractor && rule.excludesContractors) {
    return {
      employeeLwf: 0,
      employerLwf: 0,
      isLwfApplicableMonth: isScheduledMonth,
      cycleLabel: rule.cycleLabel,
      frequencyLabel: rule.frequencyLabel,
      excludesContractors: true,
      skippedReason: 'CONTRACTOR_EXCLUDED',
      isContractorExcluded: true,
      wageCeilingApplied: rule.wageCeiling,
      wageCeilingMode: rule.wageCeilingMode,
      ruleApplied: `${rule.state} LWF (${rule.cycleLabel}): Worker tagged as CONTRACTOR — LWF skipped under state contract labour exclusion rules.`,
      calculationText: `CONTRACTOR exempt in ${rule.state} → Employee LWF: ₹0 | Employer LWF: ₹0`,
    };
  }

  if (!isScheduledMonth) {
    const dueMonths = rule.months.map((m) => MONTH_SHORT_NAMES[m - 1]).join(' & ');
    return {
      employeeLwf: 0,
      employerLwf: 0,
      isLwfApplicableMonth: false,
      cycleLabel: rule.cycleLabel,
      frequencyLabel: rule.frequencyLabel,
      excludesContractors: rule.excludesContractors,
      skippedReason: 'NON_DEDUCTION_MONTH',
      isContractorExcluded: false,
      wageCeilingApplied: rule.wageCeiling,
      wageCeilingMode: rule.wageCeilingMode,
      ruleApplied: `${rule.state} LWF (${rule.cycleLabel}): Applies only in ${dueMonths}. No deduction in ${monthLabel}.`,
      calculationText: `${monthLabel} is outside LWF cycle (${dueMonths}) → Employee LWF: ₹0 | Employer LWF: ₹0`,
    };
  }

  const ceilingCheck = checkWageCeilingEligibility(rule, salaryForCheck);
  if (!ceilingCheck.passed) {
    return {
      employeeLwf: 0,
      employerLwf: 0,
      isLwfApplicableMonth: true,
      cycleLabel: rule.cycleLabel,
      frequencyLabel: rule.frequencyLabel,
      excludesContractors: rule.excludesContractors,
      skippedReason: ceilingCheck.skippedReason,
      isContractorExcluded: false,
      wageCeilingApplied: rule.wageCeiling,
      wageCeilingMode: rule.wageCeilingMode,
      ruleApplied: `${rule.state} LWF (${rule.cycleLabel}): ${ceilingCheck.note}`,
      calculationText: ceilingCheck.note || `Exempt due to ${rule.state} LWF wage ceiling → ₹0`,
    };
  }

  if (options.hasEarnedWages === false) {
    return {
      employeeLwf: 0,
      employerLwf: 0,
      isLwfApplicableMonth: true,
      cycleLabel: rule.cycleLabel,
      frequencyLabel: rule.frequencyLabel,
      excludesContractors: rule.excludesContractors,
      skippedReason: 'NON_DEDUCTION_MONTH',
      isContractorExcluded: false,
      wageCeilingApplied: rule.wageCeiling,
      wageCeilingMode: rule.wageCeilingMode,
      ruleApplied: `${rule.state} LWF (${rule.cycleLabel}): Zero earned wages in ${monthLabel} — LWF ₹0.`,
      calculationText: `Zero earned wages in ${monthLabel} → LWF ₹0`,
    };
  }

  const amounts = computeRuleSingleCycleAmounts(rule, salaryForCheck);
  const ceilingSuffix = ceilingCheck.note ? ` [${ceilingCheck.note}]` : '';

  return {
    employeeLwf: amounts.employeeAmount,
    employerLwf: amounts.employerAmount,
    isLwfApplicableMonth: true,
    cycleLabel: rule.cycleLabel,
    frequencyLabel: rule.frequencyLabel,
    excludesContractors: rule.excludesContractors,
    isContractorExcluded: false,
    wageCeilingApplied: rule.wageCeiling,
    wageCeilingMode: rule.wageCeilingMode,
    ruleApplied: `${rule.state} LWF (${rule.cycleLabel}): Employee ₹${amounts.employeeAmount} + Employer ₹${amounts.employerAmount} applied in ${monthLabel}.${ceilingSuffix}`,
    calculationText: `${monthLabel} (${rule.cycleLabel}) · ${amounts.formulaNote}`,
  };
}
