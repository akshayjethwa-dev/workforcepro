import {
  AttendanceRecord,
  EcrComputedNumbers,
  EcrValidatedWorkerRow,
  EcrValidationCheckCode,
  EcrValidationIssue,
  EcrValidationReport,
  EpfoUanStatus,
  MonthlyPayroll,
  OrgSettings,
  SupplementaryEcrPendingItem,
  Worker,
} from '../types/index';

export interface ValidateAndGenerateEcrOptions {
  tenantId?: string;
  month: string; // YYYY-MM
  mode?: 'PRIMARY' | 'SUPPLEMENTARY';
  statutoryEpfCeiling?: number; // Default 25000 per recent EPFO notifications
  capWageAtCeiling?: boolean;
  excludeWorkerIds?: string[];
  includeOnlyWorkerIds?: string[];
  forceCapWorkerIds?: string[];
  confirmHigherWageWorkerIds?: string[];
  orgSettings?: OrgSettings;
}

const DEFAULT_STATUTORY_EPF_CEILING = 25000;
const EPS_STATUTORY_CEILING = 15000;
const SUPPLEMENTARY_QUEUE_PREFIX = 'workforcepro_supplementary_ecr_';

export const normalizeMemberName = (name?: string): string => {
  return (name || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const formatEcrMemberName = (name?: string): string => {
  const cleaned = normalizeMemberName(name).slice(0, 50);
  return cleaned || 'EMPLOYEE';
};

export const normalizeDateToIso = (raw?: string): string | undefined => {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
  const yyyymmddSlash = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yyyymmddSlash) {
    return `${yyyymmddSlash[1]}-${yyyymmddSlash[2].padStart(2, '0')}-${yyyymmddSlash[3].padStart(2, '0')}`;
  }
  return undefined;
};

const computeAgeAsOfMonth = (dobRaw: string | undefined, monthStr: string): number => {
  const isoDob = normalizeDateToIso(dobRaw);
  if (!isoDob) return 30;
  const birthYear = parseInt(isoDob.slice(0, 4), 10);
  const birthMonth = parseInt(isoDob.slice(5, 7), 10);
  const [targetYear, targetMonth] = monthStr.split('-').map(n => parseInt(n, 10));
  if (!Number.isFinite(birthYear) || !Number.isFinite(targetYear)) return 30;
  let age = targetYear - birthYear;
  if (Number.isFinite(birthMonth) && Number.isFinite(targetMonth) && targetMonth < birthMonth) {
    age -= 1;
  }
  return age;
};

const deriveWorkerNumbers = (
  worker: Worker,
  payroll: MonthlyPayroll | undefined,
  attendance: AttendanceRecord[],
  month: string,
  daysInMonth: number,
  statutoryEpfCeiling: number,
  options: {
    capWageAtCeiling: boolean;
    forceCapWorkerIds: Set<string>;
    orgSettings?: OrgSettings;
  }
): EcrComputedNumbers => {
  const isAge58Plus = computeAgeAsOfMonth(worker.dob || worker.dateOfBirth, month) >= 58;
  const shouldCap = options.capWageAtCeiling || options.forceCapWorkerIds.has(worker.id);

  if (payroll) {
    const grossWages = Math.max(0, Math.round(payroll.earnings?.gross || 0));
    const ncpDays = Math.min(daysInMonth, Math.max(0, Math.round(payroll.attendanceSummary?.absentDays || 0)));

    if (grossWages <= 0) {
      return {
        grossWages: 0,
        rawEpfWages: 0,
        epfWages: 0,
        epsWages: 0,
        edliWages: 0,
        eeShare: 0,
        epsShare: 0,
        erEpfShare: 0,
        ncpDays: daysInMonth,
        refundAdvances: 0,
        isAge58Plus,
        wasWageCappedAtCeiling: false,
      };
    }

    const basePayrollPfWage = Math.max(
      0,
      Math.round(
        payroll.statutory?.pfWageBase ??
          payroll.statutory?.compliantWageBase ??
          payroll.earnings?.basic ??
          0
      )
    );

    const rawUncappedPfWage = Math.max(
      basePayrollPfWage,
      Math.round(
        payroll.statutory?.compliantWageBase ||
          payroll.statutory?.calculationTrace?.sourceValues?.pfQualifyingWages ||
          basePayrollPfWage
      )
    );

    let epfWages = basePayrollPfWage;
    let wasWageCappedAtCeiling = false;

    if (shouldCap && epfWages > statutoryEpfCeiling) {
      epfWages = statutoryEpfCeiling;
      wasWageCappedAtCeiling = true;
    }

    const pfRate = (options.orgSettings?.compliance?.pfContributionRate || 12) / 100;
    const epsRate = (options.orgSettings?.compliance?.epsContributionRate || 8.33) / 100;

    const epsWages = isAge58Plus ? 0 : Math.min(epfWages, EPS_STATUTORY_CEILING);
    const edliWages = Math.min(epfWages, EPS_STATUTORY_CEILING);

    const eeShare =
      wasWageCappedAtCeiling
        ? Math.round(epfWages * pfRate)
        : Math.round(payroll.statutory?.employeePf ?? epfWages * pfRate);

    const epsShare = isAge58Plus
      ? 0
      : wasWageCappedAtCeiling
      ? Math.min(1250, Math.round(epsWages * epsRate))
      : Math.round(payroll.statutory?.employerEps ?? Math.min(1250, epsWages * epsRate));

    const erEpfShare = wasWageCappedAtCeiling
      ? Math.max(0, eeShare - epsShare)
      : Math.round(payroll.statutory?.employerEpf ?? Math.max(0, eeShare - epsShare));

    return {
      grossWages,
      rawEpfWages: rawUncappedPfWage,
      epfWages,
      epsWages,
      edliWages,
      eeShare,
      epsShare,
      erEpfShare,
      ncpDays,
      refundAdvances: 0,
      isAge58Plus,
      wasWageCappedAtCeiling,
    };
  }

  // Fallback computation from Attendance records (used in ReportsScreen batch generation)
  const workerRecords = attendance.filter(
    r => r.workerId === worker.id && r.date && r.date.startsWith(month)
  );
  const presentDays = workerRecords.filter(r => r.status === 'PRESENT').length;
  const halfDays = workerRecords.filter(r => r.status === 'HALF_DAY').length;
  const weeklyOffs = workerRecords.filter(r => r.status === 'WEEKLY_OFF').length;
  const paidHolidays = workerRecords.filter(r => r.status === 'PUBLIC_HOLIDAY').length;
  const paidLeaves = workerRecords.filter(
    r => r.status === 'ON_LEAVE' && r.leaveInfo?.isPaid !== false
  ).length;
  const holidayWorked = workerRecords.filter(r => r.status === 'HOLIDAY_WORKED').length;

  const payableDays =
    presentDays + halfDays * 0.5 + weeklyOffs + paidHolidays + paidLeaves + holidayWorked;
  const ncpDays = Math.min(daysInMonth, Math.max(0, daysInMonth - Math.floor(payableDays)));

  const isMonthly = worker.wageConfig?.type === 'MONTHLY' || worker.wageType === 'MONTHLY' || worker.category === 'Monthly';
  const workingDays = worker.wageConfig?.workingDaysPerMonth || 26;

  let grossWages = 0;
  let rawEpfWages = 0;

  if (isMonthly) {
    const monthlyGross = worker.wageConfig?.amount || worker.monthlySalary || 0;
    const monthlyBasic =
      (worker.wageConfig?.monthlyBreakdown?.basic || Math.round(monthlyGross * 0.5)) +
      (worker.wageConfig?.monthlyBreakdown?.da || 0) +
      (worker.wageConfig?.monthlyBreakdown?.retainingAllowance || 0);
    grossWages = Math.round((monthlyGross / workingDays) * payableDays);
    rawEpfWages = Math.round((monthlyBasic / workingDays) * payableDays);
  } else {
    const dailyRate = worker.wageConfig?.amount || worker.dailyWage || 0;
    grossWages = Math.round(dailyRate * payableDays);
    const pfPct = (options.orgSettings?.compliance?.dailyWagePfPercentage || 100) / 100;
    rawEpfWages = Math.round(grossWages * pfPct);
  }

  if (grossWages <= 0) {
    return {
      grossWages: 0,
      rawEpfWages: 0,
      epfWages: 0,
      epsWages: 0,
      edliWages: 0,
      eeShare: 0,
      epsShare: 0,
      erEpfShare: 0,
      ncpDays: daysInMonth,
      refundAdvances: 0,
      isAge58Plus,
      wasWageCappedAtCeiling: false,
    };
  }

  let epfWages = rawEpfWages;
  let wasWageCappedAtCeiling = false;

  if (shouldCap && epfWages > statutoryEpfCeiling) {
    epfWages = statutoryEpfCeiling;
    wasWageCappedAtCeiling = true;
  }

  const pfRate = (options.orgSettings?.compliance?.pfContributionRate || 12) / 100;
  const epsRate = (options.orgSettings?.compliance?.epsContributionRate || 8.33) / 100;
  const epsWages = isAge58Plus ? 0 : Math.min(epfWages, EPS_STATUTORY_CEILING);
  const edliWages = Math.min(epfWages, EPS_STATUTORY_CEILING);
  const eeShare = Math.round(epfWages * pfRate);
  const epsShare = isAge58Plus ? 0 : Math.min(1250, Math.round(epsWages * epsRate));
  const erEpfShare = Math.max(0, eeShare - epsShare);

  return {
    grossWages,
    rawEpfWages,
    epfWages,
    epsWages,
    edliWages,
    eeShare,
    epsShare,
    erEpfShare,
    ncpDays,
    refundAdvances: 0,
    isAge58Plus,
    wasWageCappedAtCeiling,
  };
};

export const ecrValidatorService = {
  DEFAULT_STATUTORY_CEILING: DEFAULT_STATUTORY_EPF_CEILING,

  getSupplementaryQueue(tenantId: string, month: string): SupplementaryEcrPendingItem[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(`${SUPPLEMENTARY_QUEUE_PREFIX}${tenantId}_${month}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveSupplementaryQueue(
    tenantId: string,
    month: string,
    items: SupplementaryEcrPendingItem[]
  ): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(`${SUPPLEMENTARY_QUEUE_PREFIX}${tenantId}_${month}`, JSON.stringify(items));
    } catch {
      // Ignore storage errors in non-browser contexts
    }
  },

  addToSupplementaryQueue(
    tenantId: string,
    month: string,
    failedOrExcludedRows: EcrValidatedWorkerRow[]
  ): SupplementaryEcrPendingItem[] {
    const existing = this.getSupplementaryQueue(tenantId, month);
    const map = new Map<string, SupplementaryEcrPendingItem>(
      existing.map((item: SupplementaryEcrPendingItem) => [item.workerId, item])
    );
    const now = new Date().toISOString();

    for (const row of failedOrExcludedRows) {
      const blockingCodes = row.issues
        .filter(i => i.severity === 'BLOCK' || i.severity === 'WARNING')
        .map(i => i.code);
      map.set(row.workerId, {
        workerId: row.workerId,
        workerName: row.payrollName,
        uan: row.uan,
        month,
        excludedAt: now,
        failureCodes: blockingCodes,
        failureSummary:
          row.issues.map(i => i.title).join('; ') || 'Excluded during Primary ECR filing',
      });
    }

    const updated = Array.from(map.values());
    this.saveSupplementaryQueue(tenantId, month, updated);
    return updated;
  },

  removeWorkersFromSupplementaryQueue(
    tenantId: string,
    month: string,
    workerIds: string[]
  ): SupplementaryEcrPendingItem[] {
    const toRemove = new Set(workerIds);
    const updated = this.getSupplementaryQueue(tenantId, month).filter(
      (item: SupplementaryEcrPendingItem) => !toRemove.has(item.workerId)
    );
    this.saveSupplementaryQueue(tenantId, month, updated);
    return updated;
  },

  validateAndGenerateECR(
    workers: Worker[],
    payrolls: MonthlyPayroll[] = [],
    attendance: AttendanceRecord[] = [],
    options: ValidateAndGenerateEcrOptions
  ): EcrValidationReport {
    const month = options.month;
    const mode = options.mode || 'PRIMARY';
    const tenantId = options.tenantId || workers[0]?.tenantId || 'default-tenant';
    const statutoryEpfCeiling =
      options.statutoryEpfCeiling ??
      options.orgSettings?.compliance?.epfNotificationCeiling ??
      DEFAULT_STATUTORY_EPF_CEILING;

    const [yearStr, monthNumStr] = month.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const monthNum = parseInt(monthNumStr, 10) || new Date().getMonth() + 1;
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const excludeSet = new Set(options.excludeWorkerIds || []);
    const includeOnlySet =
      options.includeOnlyWorkerIds && options.includeOnlyWorkerIds.length > 0
        ? new Set(options.includeOnlyWorkerIds)
        : null;
    const forceCapWorkerIds = new Set(options.forceCapWorkerIds || []);
    const confirmHigherWageWorkerIds = new Set(options.confirmHigherWageWorkerIds || []);

    const payrollMap = new Map(payrolls.map(p => [p.workerId, p]));

    // Filter scoped workers if Supplementary mode specifies an explicit subset
    const scopedWorkers = includeOnlySet
      ? workers.filter(w => includeOnlySet.has(w.id))
      : workers;

    // First pass: detect duplicate UANs across active ECR candidates
    const uanOccurrences = new Map<string, Worker[]>();
    for (const w of scopedWorkers) {
      if (w.pfOptOut) continue;
      const isoExit = normalizeDateToIso(w.dateOfExit);
      const exitMonth = isoExit ? isoExit.slice(0, 7) : undefined;
      const payroll = payrollMap.get(w.id);
      const hasGrossZero = payroll ? payroll.earnings.gross <= 0 : false;
      // Prior exited & EPFO DOE marked & zero current wages => retired cleanly, skip duplicate check
      if (exitMonth && exitMonth < month && w.epfoExitMarked === true && hasGrossZero) {
        continue;
      }

      const digitsUan = (w.uan || '').trim().replace(/[^0-9]/g, '');
      if (digitsUan.length === 12) {
        const list = uanOccurrences.get(digitsUan) || [];
        list.push(w);
        uanOccurrences.set(digitsUan, list);
      }
    }

    const rows: EcrValidatedWorkerRow[] = [];

    for (const w of scopedWorkers) {
      const payroll = payrollMap.get(w.id);
      const rawUan = (w.uan || '').trim();
      const digitsUan = rawUan.replace(/[^0-9]/g, '');
      const uanStatus: EpfoUanStatus = w.epfoUanStatus || (digitsUan.length === 12 ? 'ACTIVE' : 'UNSEEDED');
      const aadhaarApproved = w.epfoKyc?.aadhaarApproved === true;
      const bankApproved = w.epfoKyc?.bankApproved === true;

      const isoExitDate = normalizeDateToIso(w.dateOfExit);
      const exitMonth = isoExitDate ? isoExitDate.slice(0, 7) : undefined;
      const epfoExitMarked = w.epfoExitMarked === true;

      const payrollNameRaw = (w.name || 'EMPLOYEE').trim();
      const epfoNameRaw = (w.epfoRegisteredName || payrollNameRaw).trim();
      const payrollNameClean = normalizeMemberName(payrollNameRaw);
      const epfoNameClean = normalizeMemberName(epfoNameRaw);
      const hasNameMismatch = Boolean(
        w.epfoRegisteredName && epfoNameClean && payrollNameClean !== epfoNameClean
      );

      let nameSource: 'PAYROLL' | 'EPFO_RECORD' | 'LEGAL_OVERRIDE' = 'PAYROLL';
      let ecrMemberNameUsed = formatEcrMemberName(payrollNameRaw);
      if (hasNameMismatch) {
        if (w.epfoNameOverrideApproved) {
          nameSource = 'LEGAL_OVERRIDE';
          ecrMemberNameUsed = formatEcrMemberName(payrollNameRaw);
        } else {
          nameSource = 'EPFO_RECORD';
          ecrMemberNameUsed = formatEcrMemberName(epfoNameRaw);
        }
      }

      const numbers = deriveWorkerNumbers(w, payroll, attendance, month, daysInMonth, statutoryEpfCeiling, {
        capWageAtCeiling: options.capWageAtCeiling ?? false,
        forceCapWorkerIds,
        orgSettings: options.orgSettings,
      });

      const emptyEcrLine = '';

      if (w.pfOptOut) {
        rows.push({
          workerId: w.id,
          payrollName: payrollNameRaw,
          epfoRegisteredName: epfoNameRaw,
          ecrMemberNameUsed,
          nameSource,
          uan: digitsUan || rawUan,
          uanStatus,
          aadhaarKycApproved: aadhaarApproved,
          bankKycApproved: bankApproved,
          dateOfExit: isoExitDate,
          epfoExitMarked,
          status: 'OPTED_OUT',
          hasBlockingError: false,
          isExcluded: true,
          willBeIncludedInFile: false,
          issues: [],
          ecrLine: emptyEcrLine,
          numbers,
        });
        continue;
      }

      // Worker cleanly exited in prior month AND EPFO Date of Exit already marked AND 0 current wages
      if (exitMonth && exitMonth < month && epfoExitMarked && numbers.grossWages <= 0) {
        rows.push({
          workerId: w.id,
          payrollName: payrollNameRaw,
          epfoRegisteredName: epfoNameRaw,
          ecrMemberNameUsed,
          nameSource,
          uan: digitsUan || rawUan,
          uanStatus,
          aadhaarKycApproved: aadhaarApproved,
          bankKycApproved: bankApproved,
          dateOfExit: isoExitDate,
          epfoExitMarked: true,
          status: 'PRIOR_EXITED',
          hasBlockingError: false,
          isExcluded: true,
          willBeIncludedInFile: false,
          issues: [],
          ecrLine: emptyEcrLine,
          numbers,
        });
        continue;
      }

      const issues: EcrValidationIssue[] = [];

      // CHECK 1: Missing / Invalid / Inactive UAN
      if (!digitsUan) {
        issues.push({
          code: 'MISSING_UAN',
          epfoPortalCode: 'EPFO-UAN-001',
          severity: 'BLOCK',
          title: 'Missing EPFO UAN',
          message: 'No 12-digit Universal Account Number (UAN) is seeded on this worker profile.',
          remediationHint: 'Seed the verified 12-digit UAN in Worker Statutory Details or exclude and file supplementary later.',
        });
      } else if (digitsUan.length !== 12) {
        issues.push({
          code: 'INVALID_UAN',
          epfoPortalCode: 'EPFO-UAN-002',
          severity: 'BLOCK',
          title: 'Invalid UAN Format',
          message: `UAN "${rawUan}" has ${digitsUan.length} digits. EPFO ECR 2.0 strictly requires exactly 12 numeric digits.`,
          remediationHint: 'Correct the 12-digit UAN before generating the ECR text file.',
        });
      } else if (uanStatus !== 'ACTIVE') {
        issues.push({
          code: 'INACTIVE_UAN',
          epfoPortalCode: 'EPFO-UAN-003',
          severity: 'BLOCK',
          title: `UAN Status is ${uanStatus}`,
          message: `UAN ${digitsUan} is marked as ${uanStatus}. Unified Portal rejects ECR uploads for unactivated or deactivated UANs.`,
          remediationHint: 'Activate UAN on EPFO Member Portal (Unified Portal -> UAN Activation) and update status to ACTIVE.',
        });
      }

      // CHECK 2: KYC Not Approved (Aadhaar or Bank)
      if (!aadhaarApproved || !bankApproved) {
        const missingKycParts: string[] = [];
        if (!aadhaarApproved) missingKycParts.push('Aadhaar KYC');
        if (!bankApproved) missingKycParts.push('Bank Account KYC');

        issues.push({
          code: 'KYC_NOT_APPROVED',
          epfoPortalCode: 'EPFO-KYC-104',
          severity: 'BLOCK',
          title: `KYC Not Approved (${missingKycParts.join(' & ')})`,
          message: `${missingKycParts.join(' and ')} not approved against UAN ${digitsUan || 'N/A'}. EPFO blocks ECR challan generation for members without employer & UIDAI/bank verification.`,
          remediationHint: 'Approve pending KYC under Member -> KYC Approval on EPFO Employer Portal, or exclude worker for Supplementary ECR.',
          canVerifyKyc: true,
        });
      }

      // CHECK 3: Duplicate UANs in batch
      if (digitsUan.length === 12) {
        const dupWorkers = uanOccurrences.get(digitsUan) || [];
        if (dupWorkers.length > 1) {
          const collidingNames = dupWorkers
            .filter(other => other.id !== w.id)
            .map(other => `${other.name} (${other.id})`)
            .join(', ');
          issues.push({
            code: 'DUPLICATE_UAN',
            epfoPortalCode: 'EPFO-ECR-201',
            severity: 'BLOCK',
            title: 'Duplicate UAN Detected in Batch',
            message: `UAN ${digitsUan} appears ${dupWorkers.length} times in this ECR batch (conflicts with: ${collidingNames}). EPFO rejects files containing duplicate UAN rows.`,
            remediationHint: 'Verify employee UAN allocation and remove duplicate entry before upload.',
          });
        }
      }

      // CHECK 4: Wage Limit Exceedance (₹25,000 updated ceiling notification)
      if (
        numbers.epfWages > statutoryEpfCeiling &&
        !confirmHigherWageWorkerIds.has(w.id)
      ) {
        issues.push({
          code: 'WAGE_CEILING_EXCEEDED',
          epfoPortalCode: 'EPFO-WAGE-301',
          severity: 'BLOCK',
          title: `EPF Wage Exceeds ₹${statutoryEpfCeiling.toLocaleString('en-IN')} Ceiling`,
          message: `Calculated EPF Wage ₹${numbers.epfWages.toLocaleString('en-IN')} exceeds the statutory EPF wage ceiling of ₹${statutoryEpfCeiling.toLocaleString('en-IN')}/month (Gap: +₹${(numbers.epfWages - statutoryEpfCeiling).toLocaleString('en-IN')}).`,
          remediationHint: `Cap EPF Wage at ₹${statutoryEpfCeiling.toLocaleString('en-IN')} for standard compliance or confirm Para 26(6) higher contribution.`,
          canAutoCapWage: true,
        });
      }

      // CHECK 5 (Edge Case 1): Employee resigned/exited without EPFO Exit (DOE) marked
      const isInactiveOrExited =
        Boolean(isoExitDate) || w.status === 'INACTIVE' || w.isActive === false;

      if (isInactiveOrExited && !epfoExitMarked) {
        const exitedInPrevMonth = Boolean(exitMonth && exitMonth < month);
        issues.push({
          code: 'EPFO_EXIT_NOT_MARKED',
          epfoPortalCode: 'EPFO-DOE-402',
          severity: exitedInPrevMonth || numbers.grossWages <= 0 ? 'BLOCK' : 'WARNING',
          title: exitedInPrevMonth
            ? 'Resigned Last Month Without EPFO Exit Mark'
            : 'EPFO Date of Exit (DOE) Pending',
          message: exitedInPrevMonth
            ? `Employee resigned/exited on ${isoExitDate} (prior month), but Date of Exit is not marked in EPFO portal. Next month ECR filings will fail validation until DOE is recorded.`
            : `Employee is marked ${isoExitDate ? `exited (${isoExitDate})` : 'INACTIVE'}, but EPFO Date of Exit (DOE) has not been marked in Unified Portal.`,
          remediationHint: 'Log into Unified Portal -> Member -> Mark Exit (DOE) with exit reason, then click "Mark DOE Done" below.',
          canMarkDoeDone: true,
        });
      }

      // CHECK 6 (Edge Case 2): Name Mismatch with UAN (Auto-resolve to exact EPFO name unless legally overridden)
      if (hasNameMismatch) {
        issues.push({
          code: 'UAN_NAME_MISMATCH',
          epfoPortalCode: 'EPFO-NAME-501',
          severity: 'INFO',
          title: w.epfoNameOverrideApproved
            ? 'UAN Name Mismatch — Legal Name Override Active'
            : 'UAN Name Mismatch — Auto-Using EPFO Record Name',
          message: w.epfoNameOverrideApproved
            ? `Using updated payroll name "${ecrMemberNameUsed}" instead of legacy EPFO name "${epfoNameRaw}" (Legal ref: ${w.epfoNameChangeLegalRef || 'Admin verified'}).`
            : `Payroll name "${payrollNameRaw}" differs from EPFO UAN record "${epfoNameRaw}". ECR row automatically uses exact EPFO name "${ecrMemberNameUsed}" so portal upload is not rejected.`,
          remediationHint: w.epfoNameOverrideApproved
            ? 'Ensure Joint Declaration / Aadhaar name change is approved on EPFO portal.'
            : 'Leave auto-resolved to EPFO name, or approve Legal Name Change Override if name changed legally.',
          canOverrideName: true,
        });
      }

      const hasBlockingError = issues.some(i => i.severity === 'BLOCK');
      const hasWarning = issues.some(i => i.severity === 'WARNING');
      const isExcluded = excludeSet.has(w.id);

      let status: EcrValidatedWorkerRow['status'] = 'PASSED';
      if (isExcluded) {
        status = 'EXCLUDED';
      } else if (hasBlockingError) {
        status = 'FAILED';
      } else if (hasWarning) {
        status = 'WARNING_ONLY';
      }

      const willBeIncludedInFile = !hasBlockingError && !isExcluded;

      const uanOut = digitsUan.length === 12 ? digitsUan : '000000000000';
      const ecrLine = willBeIncludedInFile
        ? [
            uanOut,
            ecrMemberNameUsed,
            numbers.grossWages,
            numbers.epfWages,
            numbers.epsWages,
            numbers.edliWages,
            numbers.eeShare,
            numbers.epsShare,
            numbers.erEpfShare,
            numbers.ncpDays,
            numbers.refundAdvances,
          ].join('#~#')
        : '';

      rows.push({
        workerId: w.id,
        payrollName: payrollNameRaw,
        epfoRegisteredName: epfoNameRaw,
        ecrMemberNameUsed,
        nameSource,
        legalNameChangeRef: w.epfoNameChangeLegalRef,
        uan: digitsUan || rawUan,
        uanStatus,
        aadhaarKycApproved: aadhaarApproved,
        bankKycApproved: bankApproved,
        dateOfExit: isoExitDate,
        epfoExitMarked,
        status,
        hasBlockingError,
        isExcluded,
        willBeIncludedInFile,
        issues,
        ecrLine,
        numbers,
      });
    }

    const includedRows = rows.filter(r => r.willBeIncludedInFile);
    const failedRows = rows.filter(r => r.hasBlockingError);
    const excludedRows = rows.filter(r => r.isExcluded && r.status === 'EXCLUDED');
    const optedOutOrPriorExitedRows = rows.filter(
      r => r.status === 'OPTED_OUT' || r.status === 'PRIOR_EXITED'
    );

    const eligibleRows = rows.filter(
      r => r.status !== 'OPTED_OUT' && r.status !== 'PRIOR_EXITED'
    );

    const hasCode = (r: EcrValidatedWorkerRow, codes: EcrValidationCheckCode[]) =>
      r.issues.some(i => codes.includes(i.code));

    const totalGrossWages = includedRows.reduce((s, r) => s + r.numbers.grossWages, 0);
    const totalEpfWages = includedRows.reduce((s, r) => s + r.numbers.epfWages, 0);
    const totalEdliWages = includedRows.reduce((s, r) => s + r.numbers.edliWages, 0);
    const totalEeShare = includedRows.reduce((s, r) => s + r.numbers.eeShare, 0);
    const totalEpsShare = includedRows.reduce((s, r) => s + r.numbers.epsShare, 0);
    const totalErEpfShare = includedRows.reduce((s, r) => s + r.numbers.erEpfShare, 0);

    const adminCharges =
      includedRows.length > 0 ? Math.max(500, Math.round(totalEpfWages * 0.005)) : 0;
    const edliCharges = Math.round(totalEdliWages * 0.005);
    const totalAdminAndEdliCharges = adminCharges + edliCharges;
    const totalChallanPayable =
      totalEeShare + totalEpsShare + totalErEpfShare + totalAdminAndEdliCharges;

    const ecrContent = includedRows.map(r => r.ecrLine).join('\r\n');

    const errorReportLines: string[] = [
      '========================================================================',
      `EPFO ECR 2.0 PRE-UPLOAD VALIDATION REPORT (${mode} FILING)`,
      `Period: ${month} | Statutory Ceiling: INR ${statutoryEpfCeiling.toLocaleString('en-IN')}`,
      `Generated At: ${new Date().toISOString()}`,
      '========================================================================',
      `Total Employees Evaluated : ${rows.length}`,
      `Eligible for ECR          : ${eligibleRows.length}`,
      `Passed & Included in ECR  : ${includedRows.length}`,
      `Failed Blocking Checks    : ${failedRows.length}`,
      `Manually Excluded         : ${excludedRows.length}`,
      `Opted-Out / Prior Exited  : ${optedOutOrPriorExitedRows.length}`,
      '',
    ];

    const reportRows = rows.filter(r => r.issues.length > 0 || r.isExcluded);
    if (reportRows.length === 0) {
      errorReportLines.push('ALL ELIGIBLE WORKERS PASSED PRE-UPLOAD EPFO VALIDATION.');
    } else {
      errorReportLines.push('DETAILED FINDINGS & REMEDIATION ACTIONS:');
      errorReportLines.push('------------------------------------------------------------------------');
      reportRows.forEach((row, idx) => {
        errorReportLines.push(
          `${idx + 1}. ${row.payrollName} [ID: ${row.workerId}] | UAN: ${row.uan || 'MISSING'} (${row.uanStatus}) | Status: ${row.status}`
        );
        if (row.nameSource !== 'PAYROLL') {
          errorReportLines.push(
            `   ECR Name Strategy: Using "${row.ecrMemberNameUsed}" (${row.nameSource})`
          );
        }
        row.issues.forEach(issue => {
          errorReportLines.push(
            `   - [${issue.severity}] (${issue.epfoPortalCode}) ${issue.title}: ${issue.message}`
          );
          errorReportLines.push(`     Fix: ${issue.remediationHint}`);
        });
        errorReportLines.push('');
      });
    }

    if (failedRows.length > 0 || excludedRows.length > 0) {
      errorReportLines.push(
        'NOTE: Failed or excluded members have been omitted from the clean ECR .txt output.'
      );
      errorReportLines.push(
        'Resolve KYC/UAN/DOE discrepancies and file a Supplementary ECR for excluded workers.'
      );
    }

    return {
      tenantId,
      month,
      mode,
      validatedAt: new Date().toISOString(),
      summary: {
        totalWorkersEvaluated: rows.length,
        eligibleForEcrCount: eligibleRows.length,
        passedCount: rows.filter(r => r.status === 'PASSED').length,
        failedCount: failedRows.length,
        warningOnlyCount: rows.filter(r => r.status === 'WARNING_ONLY').length,
        excludedCount: excludedRows.length,
        includedInFinalFileCount: includedRows.length,
        optedOutOrPriorExitedCount: optedOutOrPriorExitedRows.length,
        missingOrInactiveUanCount: eligibleRows.filter(r =>
          hasCode(r, ['MISSING_UAN', 'INVALID_UAN', 'INACTIVE_UAN'])
        ).length,
        kycPendingCount: eligibleRows.filter(r => hasCode(r, ['KYC_NOT_APPROVED'])).length,
        duplicateUanCount: eligibleRows.filter(r => hasCode(r, ['DUPLICATE_UAN'])).length,
        wageCeilingExceededCount: eligibleRows.filter(r =>
          hasCode(r, ['WAGE_CEILING_EXCEEDED'])
        ).length,
        exitNotMarkedCount: eligibleRows.filter(r =>
          hasCode(r, ['EPFO_EXIT_NOT_MARKED'])
        ).length,
        nameMismatchResolvedCount: eligibleRows.filter(r =>
          hasCode(r, ['UAN_NAME_MISMATCH'])
        ).length,
        statutoryCeilingApplied: statutoryEpfCeiling,
        totalGrossWages,
        totalEpfWages,
        totalEeShare,
        totalEpsShare,
        totalErEpfShare,
        totalAdminAndEdliCharges,
        totalChallanPayable,
      },
      rows,
      includedRows,
      failedRows,
      excludedRows,
      ecrContent,
      errorReportText: errorReportLines.join('\r\n'),
      canDownloadEcr: includedRows.length > 0,
    };
  },
};
