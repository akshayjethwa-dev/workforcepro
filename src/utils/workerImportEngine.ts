import * as XLSX from 'xlsx';
import {
  ActiveLoan,
  LeaveBalanceImportBatch,
  LeaveBalanceRecord,
  LoanLedgerImportBatch,
  OrgSettings,
  Worker,
} from '../types/index';
import { dbService } from '../services/db';
import { resolveMinimumWageFloor } from '../services/minimumWageDatabase';
import { buildOneNumberWageConfig } from '../services/wageStructureValidationService';
import {
  estimateWorkerMonthlyNetSalary,
  formatInrWhole,
  formatLoanRecoverySummary,
} from '../services/PayrollEngine';

export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS_PER_BATCH = 500;

export const STRICT_REQUIRED_HEADERS = [
  'Worker Name',
  'Phone Number',
  'Role',
  'Monthly CTC',
  'Date of Joining',
] as const;

export const OPTIONAL_STATUTORY_HEADERS = ['UAN', 'PAN'] as const;

const VALID_PAN_ENTITY_CODES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

export interface ImportPolicySelection {
  branchId?: string;
  branchName?: string;
  shiftId?: string;
  shiftName?: string;
  state: string;
  zone?: string;
  orgSettings?: OrgSettings | null;
}

export interface ValidatedImportRow {
  rowNumber: number; // 1-indexed spreadsheet row (Row 2 is first data row)
  rawRow: Record<string, string | number>;
  workerName: string;
  phone: string;
  role: string;
  monthlyCtc: number | null;
  dateOfJoiningRaw: string;
  dateOfJoiningIso: string | null;
  uan?: string;
  pan?: string;
  isValid: boolean;
  errors: string[];
  errorReason: string;
  workerPayload?: Partial<Worker>;
}

export type ImportFatalErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'TOO_MANY_ROWS'
  | 'INVALID_HEADERS'
  | 'PARSE_ERROR';

export interface ImportValidationResult {
  ok: boolean;
  fatalError?: string;
  fatalDetail?: string;
  fatalErrorCode?: ImportFatalErrorCode;
  fileName: string;
  fileSizeBytes: number;
  originalHeaders: string[];
  totalRows: number;
  validRows: ValidatedImportRow[];
  errorRows: ValidatedImportRow[];
  allRows: ValidatedImportRow[];
  stateUsed: string;
  minimumWageFloor: number;
}

/**
 * Strictly validates that the uploaded sheet preserves the exact downloaded template headers.
 * Optional statutory columns ("UAN", "PAN") are permitted alongside the 5 required headers.
 */
export function validateStrictHeaders(rawHeaders: string[]): {
  valid: boolean;
  cleanedHeaders: string[];
  errorMessage?: string;
  errorDetail?: string;
} {
  const cleanedHeaders = rawHeaders.map((h) => String(h ?? '').trim());
  // Trim trailing completely empty columns Excel sometimes exports
  while (cleanedHeaders.length > 0 && cleanedHeaders[cleanedHeaders.length - 1] === '') {
    cleanedHeaders.pop();
  }

  if (cleanedHeaders.length === 0) {
    return {
      valid: false,
      cleanedHeaders,
      errorMessage: 'Invalid headers. Please use the downloaded template.',
      errorDetail: 'Header row (Row 1) is empty.',
    };
  }

  const headerSet = new Set(cleanedHeaders);
  const missingRequired = STRICT_REQUIRED_HEADERS.filter((req) => !headerSet.has(req));

  const allowedSet = new Set<string>([
    ...STRICT_REQUIRED_HEADERS,
    ...OPTIONAL_STATUTORY_HEADERS,
  ]);
  const unexpectedHeaders = cleanedHeaders.filter((h) => h !== '' && !allowedSet.has(h));

  if (missingRequired.length > 0 || unexpectedHeaders.length > 0) {
    const parts: string[] = [];
    if (missingRequired.length > 0) {
      parts.push(`Missing exact header(s): ${missingRequired.join(', ')}`);
    }
    if (unexpectedHeaders.length > 0) {
      parts.push(`Unrecognized header(s): ${unexpectedHeaders.join(', ')}`);
    }
    return {
      valid: false,
      cleanedHeaders,
      errorMessage: 'Invalid headers. Please use the downloaded template.',
      errorDetail: parts.join(' · '),
    };
  }

  return { valid: true, cleanedHeaders };
}

/**
 * Validates DD/MM/YYYY string or Excel serial number and returns ISO YYYY-MM-DD (or null if invalid).
 */
function parseStrictJoiningDate(rawValue: unknown): { iso: string | null; display: string } {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
    return { iso: null, display: '' };
  }

  // Excel serial date
  if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 20000 && rawValue < 80000) {
    const parsed = XLSX.SSF.parse_date_code(rawValue);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const yyyy = String(parsed.y).padStart(4, '0');
      return { iso: `${yyyy}-${mm}-${dd}`, display: `${dd}/${mm}/${yyyy}` };
    }
  }

  const text = String(rawValue).trim();
  const dmyMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2100) {
      const candidate = new Date(y, m - 1, d);
      if (candidate.getFullYear() === y && candidate.getMonth() === m - 1 && candidate.getDate() === d) {
        const dd = String(d).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return { iso: `${y}-${mm}-${dd}`, display: text };
      }
    }
  }

  return { iso: null, display: text };
}

/**
 * Validates a 12-digit EPFO UAN number.
 */
function validateEpfoUan(raw: string): { valid: boolean; cleaned: string; reason?: string } {
  const cleaned = raw.replace(/\s+/g, '');
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, cleaned, reason: 'Invalid UAN (EPFO requires exactly 12 numeric digits)' };
  }
  if (/^(\d)\1{11}$/.test(cleaned)) {
    return { valid: false, cleaned, reason: 'Invalid UAN (placeholder digits are rejected by EPFO)' };
  }
  return { valid: true, cleaned };
}

/**
 * Validates a 10-character Indian PAN number.
 */
function validateIndianPan(raw: string): { valid: boolean; cleaned: string; reason?: string } {
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned)) {
    return { valid: false, cleaned, reason: 'Invalid PAN format (expected e.g. ABCDE1234F)' };
  }
  if (!VALID_PAN_ENTITY_CODES.has(cleaned[3])) {
    return { valid: false, cleaned, reason: 'Invalid PAN holder type code (4th letter)' };
  }
  return { valid: true, cleaned };
}

function normalizePhone10(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Parses and validates an uploaded .xlsx or .csv file against:
 * - File type & 5MB size limit
 * - Strict template headers
 * - 500-row batch cap
 * - Missing/invalid phone, state minimum wage CTC check, duplicate phone (DB & in-file),
 *   DD/MM/YYYY joining date, and optional EPFO UAN / PAN validation & deduplication.
 */
export async function parseAndValidateImportFile(params: {
  file: File;
  tenantId: string;
  existingWorkers: Worker[];
  policy: ImportPolicySelection;
}): Promise<ImportValidationResult> {
  const { file, tenantId, existingWorkers, policy } = params;
  const stateUsed = policy.state || 'Gujarat';
  const minWageResolved = resolveMinimumWageFloor({
    state: stateUsed,
    zone: policy.zone,
    skillCategory: 'SEMI_SKILLED',
    customRevisions: policy.orgSettings?.compliance?.minimumWageRevisions,
  });
  const minimumWageFloor = minWageResolved.monthlyFloor;

  const baseFailure = (
    fatalErrorCode: ImportFatalErrorCode,
    fatalError: string,
    fatalDetail?: string
  ): ImportValidationResult => ({
    ok: false,
    fatalErrorCode,
    fatalError,
    fatalDetail,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders: [],
    totalRows: 0,
    validRows: [],
    errorRows: [],
    allRows: [],
    stateUsed,
    minimumWageFloor,
  });

  // 1. Check extension (.xlsx or .csv)
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
    return baseFailure(
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file format. Please upload an .xlsx or .csv file.',
      `Uploaded file: ${file.name}`
    );
  }

  // 2. Check 5MB size limit
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return baseFailure(
      'FILE_TOO_LARGE',
      'File size exceeds the 5MB limit. Please split your file into smaller batches.',
      `Uploaded file is ${sizeMb} MB (max 5 MB).`
    );
  }

  // 3. Parse workbook
  let matrix: Array<Array<unknown>> = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const targetSheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'workers') ||
      workbook.SheetNames[0];

    if (!targetSheetName) {
      return baseFailure('EMPTY_FILE', 'The uploaded file has no worksheets.');
    }

    const sheet = workbook.Sheets[targetSheetName];
    matrix = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
  } catch (err) {
    console.error('Spreadsheet parse failed:', err);
    return baseFailure(
      'PARSE_ERROR',
      'Could not read the uploaded file. Please save it as .xlsx or .csv and try again.'
    );
  }

  if (matrix.length === 0) {
    return baseFailure('EMPTY_FILE', 'The uploaded file is empty.');
  }

  // 4. Strict Header Validation
  const headerCheck = validateStrictHeaders(matrix[0].map((c) => String(c ?? '')));
  if (!headerCheck.valid) {
    return baseFailure(
      'INVALID_HEADERS',
      headerCheck.errorMessage || 'Invalid headers. Please use the downloaded template.',
      headerCheck.errorDetail
    );
  }

  const originalHeaders = headerCheck.cleanedHeaders;
  const colIndex = new Map<string, number>();
  originalHeaders.forEach((h, i) => colIndex.set(h, i));

  // Extract non-empty data rows
  const nonEmptyDataRows: Array<{ excelRowNumber: number; cells: Array<unknown> }> = [];
  for (let r = 1; r < matrix.length; r++) {
    const rowCells = matrix[r] || [];
    const hasAnyValue = originalHeaders.some((_, idx) => String(rowCells[idx] ?? '').trim() !== '');
    if (hasAnyValue) {
      nonEmptyDataRows.push({ excelRowNumber: r + 1, cells: rowCells });
    }
  }

  if (nonEmptyDataRows.length === 0) {
    return baseFailure(
      'EMPTY_FILE',
      'No worker rows found under the header row.',
      'Add at least one worker row to the "Workers" sheet and try again.'
    );
  }

  // 5. Enforce 500-row batch limit
  if (nonEmptyDataRows.length > MAX_IMPORT_ROWS_PER_BATCH) {
    return baseFailure(
      'TOO_MANY_ROWS',
      'Please split your file into smaller batches.',
      `Detected ${nonEmptyDataRows.length.toLocaleString('en-IN')} rows. Maximum allowed is ${MAX_IMPORT_ROWS_PER_BATCH} rows per import batch.`
    );
  }

  // 6. Build lookup sets from existing DB workers for duplicate checks
  const existingPhones = new Set<string>();
  const existingUans = new Set<string>();
  const existingPans = new Set<string>();
  existingWorkers.forEach((w) => {
    const p = normalizePhone10(w.phone);
    if (p) existingPhones.add(p);
    if (w.uan) existingUans.add(w.uan.replace(/\s+/g, ''));
    if (w.pan) existingPans.add(w.pan.replace(/\s+/g, '').toUpperCase());
  });

  // Track duplicates within the uploaded file itself (value -> first Excel row number)
  const seenPhonesInFile = new Map<string, number>();
  const seenUansInFile = new Map<string, number>();
  const seenPansInFile = new Map<string, number>();

  const hasUanCol = colIndex.has('UAN');
  const hasPanCol = colIndex.has('PAN');

  const allRows: ValidatedImportRow[] = [];

  for (const { excelRowNumber, cells } of nonEmptyDataRows) {
    const rawRow: Record<string, string | number> = {};
    originalHeaders.forEach((header, idx) => {
      const val = cells[idx];
      rawRow[header] = typeof val === 'number' ? val : String(val ?? '').trim();
    });

    const errors: string[] = [];

    const workerName = String(cells[colIndex.get('Worker Name')!] ?? '').trim();
    const rawPhoneCell = cells[colIndex.get('Phone Number')!];
    const phoneDigits = normalizePhone10(rawPhoneCell);
    const role = String(cells[colIndex.get('Role')!] ?? '').trim();
    const rawCtcCell = cells[colIndex.get('Monthly CTC')!];
    const rawDojCell = cells[colIndex.get('Date of Joining')!];
    const rawUanCell = hasUanCol ? String(cells[colIndex.get('UAN')!] ?? '').trim() : '';
    const rawPanCell = hasPanCol ? String(cells[colIndex.get('PAN')!] ?? '').trim() : '';

    // Worker Name check
    if (!workerName) {
      errors.push('Missing Worker Name');
    }

    // Phone Number check (Missing + Format + DB duplicate + File duplicate)
    if (!phoneDigits) {
      errors.push('Missing Phone Number');
    } else if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
      errors.push('Invalid Phone Number (must be a valid 10-digit Indian mobile number)');
    } else {
      if (existingPhones.has(phoneDigits)) {
        errors.push('Duplicate Phone Number (already exists in database)');
      }
      const priorRow = seenPhonesInFile.get(phoneDigits);
      if (priorRow !== undefined) {
        errors.push(`Duplicate Phone Number (also appears in Row ${priorRow} of this file)`);
      } else {
        seenPhonesInFile.set(phoneDigits, excelRowNumber);
      }
    }

    // Role check
    if (!role) {
      errors.push('Missing Role');
    }

    // Monthly CTC & State Minimum Wage check
    const cleanedCtcStr = String(rawCtcCell ?? '').replace(/[₹,\s]/g, '');
    const parsedCtc = cleanedCtcStr === '' ? NaN : Number(cleanedCtcStr);
    let validMonthlyCtc: number | null = null;
    if (!Number.isFinite(parsedCtc) || parsedCtc <= 0) {
      errors.push('Invalid Monthly CTC (enter a valid positive amount in ₹)');
    } else {
      validMonthlyCtc = Math.round(parsedCtc);
      if (validMonthlyCtc < minimumWageFloor) {
        errors.push(
          `Monthly CTC (₹${validMonthlyCtc.toLocaleString('en-IN')}) is below ${stateUsed} Minimum Wage (₹${minimumWageFloor.toLocaleString('en-IN')})`
        );
      }
    }

    // Date of Joining check
    const parsedDoj = parseStrictJoiningDate(rawDojCell);
    if (!parsedDoj.iso) {
      errors.push(
        parsedDoj.display
          ? `Invalid Date of Joining "${parsedDoj.display}" (use DD/MM/YYYY)`
          : 'Missing Date of Joining (use DD/MM/YYYY)'
      );
    }

    // Optional EPFO UAN check (if provided)
    let cleanedUan: string | undefined;
    if (rawUanCell) {
      const uanCheck = validateEpfoUan(rawUanCell);
      if (!uanCheck.valid) {
        errors.push(uanCheck.reason || 'Invalid UAN');
      } else {
        cleanedUan = uanCheck.cleaned;
        if (existingUans.has(cleanedUan)) {
          errors.push('Duplicate UAN (already exists in database)');
        }
        const priorUanRow = seenUansInFile.get(cleanedUan);
        if (priorUanRow !== undefined) {
          errors.push(`Duplicate UAN (also appears in Row ${priorUanRow} of this file)`);
        } else {
          seenUansInFile.set(cleanedUan, excelRowNumber);
        }
      }
    }

    // Optional PAN check (if provided)
    let cleanedPan: string | undefined;
    if (rawPanCell) {
      const panCheck = validateIndianPan(rawPanCell);
      if (!panCheck.valid) {
        errors.push(panCheck.reason || 'Invalid PAN');
      } else {
        cleanedPan = panCheck.cleaned;
        if (existingPans.has(cleanedPan)) {
          errors.push('Duplicate PAN (already exists in database)');
        }
        const priorPanRow = seenPansInFile.get(cleanedPan);
        if (priorPanRow !== undefined) {
          errors.push(`Duplicate PAN (also appears in Row ${priorPanRow} of this file)`);
        } else {
          seenPansInFile.set(cleanedPan, excelRowNumber);
        }
      }
    }

    const isValid = errors.length === 0;
    let workerPayload: Partial<Worker> | undefined;

    if (isValid && validMonthlyCtc !== null && parsedDoj.iso) {
      const { wageConfig } = buildOneNumberWageConfig(
        validMonthlyCtc,
        { overtimeEligible: true },
        {
          state: stateUsed,
          wageZone: policy.zone,
          skillCategory: 'SEMI_SKILLED',
          orgSettings: policy.orgSettings || undefined,
          branchId: policy.branchId,
        }
      );

      workerPayload = {
        tenantId,
        name: workerName,
        phone: phoneDigits,
        designation: role,
        category: 'Monthly',
        status: 'ACTIVE',
        isActive: true,
        state: stateUsed,
        branchId: policy.branchId || 'default',
        shiftId: policy.shiftId || 'default',
        joinedDate: parsedDoj.iso,
        dateOfJoining: parsedDoj.iso,
        ...(cleanedUan ? { uan: cleanedUan } : {}),
        ...(cleanedPan ? { pan: cleanedPan } : {}),
        wageConfig,
      };
    }

    allRows.push({
      rowNumber: excelRowNumber,
      rawRow,
      workerName,
      phone: phoneDigits || String(rawPhoneCell ?? '').trim(),
      role,
      monthlyCtc: validMonthlyCtc,
      dateOfJoiningRaw: parsedDoj.display,
      dateOfJoiningIso: parsedDoj.iso,
      uan: cleanedUan || (rawUanCell || undefined),
      pan: cleanedPan || (rawPanCell || undefined),
      isValid,
      errors,
      errorReason: errors.join('; '),
      workerPayload,
    });
  }

  const validRows = allRows.filter((r) => r.isValid);
  const errorRows = allRows.filter((r) => !r.isValid);

  return {
    ok: true,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders,
    totalRows: allRows.length,
    validRows,
    errorRows,
    allRows,
    stateUsed,
    minimumWageFloor,
  };
}

/**
 * Exports a copy of the original uploaded Excel sheet with an appended "Error Reason" column.
 */
export function downloadImportErrorReport(result: ImportValidationResult): string {
  const wb = XLSX.utils.book_new();
  const headers = [...result.originalHeaders, 'Error Reason'];

  const sheetRows: Array<Array<string | number>> = [
    headers,
    ...result.allRows.map((row) => [
      ...result.originalHeaders.map((h) => row.rawRow[h] ?? ''),
      row.errorReason || '',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws['!cols'] = [
    ...result.originalHeaders.map((h) => ({
      wch: h === 'Worker Name' ? 28 : h === 'Role' ? 22 : 18,
    })),
    { wch: 64 }, // Error Reason
  ];
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: sheetRows.length - 1, c: headers.length - 1 },
    }),
  };

  XLSX.utils.book_append_sheet(wb, ws, 'Error Report');
  const baseName = result.fileName.replace(/\.(xlsx|csv)$/i, '');
  const outName = `${baseName}_Error_Report.xlsx`;
  XLSX.writeFile(wb, outName, { bookType: 'xlsx' });
  return outName;
}

/**
 * Generates an in-memory demo .xlsx File with 5 valid workers and 3 deliberate errors
 * (missing phone, below minimum wage CTC, duplicate phone) so admins can preview the engine in 1 click.
 */
export function createDemoValidationExcelFile(): File {
  const wb = XLSX.utils.book_new();
  const rows: Array<Array<string | number>> = [
    [...STRICT_REQUIRED_HEADERS],
    ['Kiran Solanki', '9825011221', 'CNC Operator', 18500, '15/01/2025'],
    ['Meena Parmar', '9825011222', 'Quality Checker', 16000, '01/02/2025'],
    ['Deepak Chauhan', '9825011223', 'Assembly Operator', 17500, '10/02/2025'],
    ['Hitesh Joshi', '9825011224', 'Warehouse Loader', 15000, '18/02/2025'],
    ['Neha Rathod', '9825011225', 'Line Supervisor', 24000, '01/03/2025'],
    // 3 deliberate errors:
    ['Manoj Prajapati', '', 'Helper', 15500, '05/03/2025'], // Missing Phone Number
    ['Sanjay Thakor', '9825011226', 'Helper', 8000, '06/03/2025'], // Below Minimum Wage
    ['Rakesh Gohil', '9825011221', 'Packer', 16500, '07/03/2025'], // Duplicate Phone in file
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Workers');
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new File([arrayBuffer], 'Demo_Workers_Batch.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Exports generated worker Magic Links to Excel for easy sharing / printing.
 */
export function downloadGeneratedMagicLinksExcel(
  links: Array<{ workerName: string; phone: string; role: string; magicLinkUrl: string }>
): string {
  const wb = XLSX.utils.book_new();
  const rows: Array<Array<string>> = [
    ['Worker Name', 'Phone Number', 'Role', 'Magic Link URL'],
    ...links.map((l) => [l.workerName, l.phone, l.role, l.magicLinkUrl]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 22 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Magic Links');
  const fileName = `Worker_Magic_Links_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
  return fileName;
}

// ============================================================================
// BULK LEAVE BALANCE IMPORT ENGINE
// Parses Leave_Balance_Template.xlsx, matches phone numbers to existing workers,
// enforces whole-file duplicate phone rejection, tenant negative-balance policy,
// mid-year absolute opening balance metadata, and transactional atomic commits.
// ============================================================================

export const MAX_LEAVE_IMPORT_ROWS_PER_BATCH = 499;

export const LEAVE_BALANCE_REQUIRED_HEADERS = [
  'Worker Phone Number',
  'Worker Name',
  'Earned Leave Balance',
  'Sick Leave Balance',
  'Casual Leave Balance',
] as const;

export type LeaveBalanceRowStatus =
  | 'MATCHED_VALID'
  | 'MATCHED_WITH_WARNINGS'
  | 'UNMATCHED_PHONE'
  | 'DUPLICATE_PHONE'
  | 'ERROR';

export interface LeaveBalanceDuplicatePhoneIssue {
  phone: string;
  rows: number[]; // All 1-indexed spreadsheet rows containing this phone
  message: string;
}

export interface LeaveBalanceValidatedRow {
  rowNumber: number; // 1-indexed Excel row (Row 2 is first data row)
  rawRow: Record<string, string | number>;
  rawPhone: string;
  normalizedPhone: string;
  excelWorkerName: string;
  matchedWorkerId?: string;
  matchedWorkerName?: string;
  previousBalances?: {
    earnedLeave: number;
    sickLeave: number;
    casualLeave: number;
  };
  earnedLeave: number | null;
  sickLeave: number | null;
  casualLeave: number | null;
  hasNegativeBalance: boolean;
  negativeBalanceDays: number;
  nameMismatch: boolean;
  isMatched: boolean;
  isDuplicatePhone: boolean;
  status: LeaveBalanceRowStatus;
  errors: string[]; // Blocking errors
  warnings: string[]; // Non-blocking verification warnings (name mismatch, accepted negative balance)
  errorReason: string;
}

export interface LeaveBalanceValidationResult {
  ok: boolean;
  fatalError?: string;
  fatalDetail?: string;
  fatalErrorCode?: ImportFatalErrorCode;
  fileName: string;
  fileSizeBytes: number;
  originalHeaders: string[];
  migrationDate: string; // YYYY-MM-DD
  allowNegativeBalance: boolean;
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  summaryMessage: string; // e.g., "45 workers found. 5 phone numbers do not match our records."
  hasDuplicatePhones: boolean;
  duplicatePhoneIssues: LeaveBalanceDuplicatePhoneIssue[];
  matchedRows: LeaveBalanceValidatedRow[];
  unmatchedRows: LeaveBalanceValidatedRow[];
  blockingErrorRows: LeaveBalanceValidatedRow[];
  negativeBalanceRows: LeaveBalanceValidatedRow[];
  nameMismatchRows: LeaveBalanceValidatedRow[];
  allRows: LeaveBalanceValidatedRow[];
  canCommit: boolean;
  blockReason?: string;
}

export function formatLeaveBalancePreviewSummary(
  matchedCount: number,
  unmatchedCount: number
): string {
  const workerWord = matchedCount === 1 ? 'worker' : 'workers';
  const unmatchedPhrase =
    unmatchedCount === 1
      ? '1 phone number does not match our records.'
      : `${unmatchedCount} phone numbers do not match our records.`;
  return `${matchedCount} ${workerWord} found. ${unmatchedPhrase}`;
}

/**
 * Validates that the uploaded Excel/CSV file contains all 5 required Leave Balance columns.
 */
export function validateLeaveBalanceHeaders(rawHeaders: string[]): {
  valid: boolean;
  cleanedHeaders: string[];
  columnIndexMap: Map<(typeof LEAVE_BALANCE_REQUIRED_HEADERS)[number], number>;
  errorMessage?: string;
  errorDetail?: string;
} {
  const cleanedHeaders = rawHeaders.map((h) => String(h ?? '').trim());
  while (cleanedHeaders.length > 0 && cleanedHeaders[cleanedHeaders.length - 1] === '') {
    cleanedHeaders.pop();
  }

  const columnIndexMap = new Map<(typeof LEAVE_BALANCE_REQUIRED_HEADERS)[number], number>();

  if (cleanedHeaders.length === 0) {
    return {
      valid: false,
      cleanedHeaders,
      columnIndexMap,
      errorMessage: 'Invalid headers. Please use Leave_Balance_Template.xlsx.',
      errorDetail: 'Header row (Row 1) is empty.',
    };
  }

  const normalizedLookup = new Map<string, number>();
  cleanedHeaders.forEach((h, idx) => {
    const key = h.toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedLookup.has(key)) {
      normalizedLookup.set(key, idx);
    }
  });

  const missingRequired: string[] = [];
  for (const required of LEAVE_BALANCE_REQUIRED_HEADERS) {
    const idx = normalizedLookup.get(required.toLowerCase());
    if (idx === undefined) {
      missingRequired.push(required);
    } else {
      columnIndexMap.set(required, idx);
    }
  }

  if (missingRequired.length > 0) {
    return {
      valid: false,
      cleanedHeaders,
      columnIndexMap,
      errorMessage: 'Invalid headers. Please use Leave_Balance_Template.xlsx.',
      errorDetail: `Missing required column(s): ${missingRequired.join(', ')}`,
    };
  }

  return { valid: true, cleanedHeaders, columnIndexMap };
}

function parseNumericLeaveValue(raw: unknown): { value: number | null; rawText: string } {
  const rawText = String(raw ?? '').trim();
  if (rawText === '') {
    return { value: null, rawText: '' };
  }
  const cleaned = rawText.replace(/,/g, '').replace(/\s+/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { value: null, rawText };
  }
  // Round to max 2 decimals to prevent floating-point drift (e.g. 4.5, -2, 10.25)
  const rounded = Math.round(parsed * 100) / 100;
  return { value: rounded, rawText };
}

function normalizeNameForCompare(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses and validates a Bulk Leave Balance Import file (.xlsx / .xls / .csv):
 * - Matches Worker Phone Numbers against existing tenant workers
 * - Fails the ENTIRE import with row-specific errors if duplicate phone numbers exist in the file
 * - Accepts negative balances (for next-payroll deduction) or flags as error per tenant leavePolicy
 * - Validates Worker Name against matched profile (non-blocking verification warning on mismatch)
 * - Prepares absolute Opening Balance payloads for Mid-Year Migration from migrationDate forward
 */
export async function parseAndValidateLeaveBalanceFile(params: {
  file: File;
  tenantId: string;
  existingWorkers: Worker[];
  orgSettings?: OrgSettings | null;
  migrationDate?: string; // ISO YYYY-MM-DD
}): Promise<LeaveBalanceValidationResult> {
  const { file, existingWorkers, orgSettings } = params;
  const migrationDate = params.migrationDate || new Date().toISOString().split('T')[0];
  const allowNegativeBalance = Boolean(orgSettings?.leavePolicy?.allowNegativeBalance);

  const baseFailure = (
    fatalErrorCode: ImportFatalErrorCode,
    fatalError: string,
    fatalDetail?: string
  ): LeaveBalanceValidationResult => ({
    ok: false,
    fatalErrorCode,
    fatalError,
    fatalDetail,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders: [],
    migrationDate,
    allowNegativeBalance,
    totalRows: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    summaryMessage: formatLeaveBalancePreviewSummary(0, 0),
    hasDuplicatePhones: false,
    duplicatePhoneIssues: [],
    matchedRows: [],
    unmatchedRows: [],
    blockingErrorRows: [],
    negativeBalanceRows: [],
    nameMismatchRows: [],
    allRows: [],
    canCommit: false,
    blockReason: fatalError,
  });

  // 1. Validate extension
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.csv')) {
    return baseFailure(
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file format. Please upload an .xlsx, .xls, or .csv file.',
      `Uploaded file: ${file.name}`
    );
  }

  // 2. Validate 5MB size limit
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return baseFailure(
      'FILE_TOO_LARGE',
      'File size exceeds the 5MB limit. Please split your file into smaller batches.',
      `Uploaded file is ${sizeMb} MB (max 5 MB).`
    );
  }

  // 3. Parse Excel/CSV workbook
  let matrix: Array<Array<unknown>> = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const targetSheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'leave balances') ||
      workbook.SheetNames.find((n) => n.trim().toLowerCase() !== 'read me') ||
      workbook.SheetNames[0];

    if (!targetSheetName) {
      return baseFailure('EMPTY_FILE', 'The uploaded file has no worksheets.');
    }

    const sheet = workbook.Sheets[targetSheetName];
    matrix = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
  } catch (err) {
    console.error('Leave balance spreadsheet parse failed:', err);
    return baseFailure(
      'PARSE_ERROR',
      'Could not read the uploaded file. Please save it as .xlsx or .csv and try again.'
    );
  }

  if (matrix.length === 0) {
    return baseFailure('EMPTY_FILE', 'The uploaded file is empty.');
  }

  // 4. Validate required 5 columns
  const headerCheck = validateLeaveBalanceHeaders(matrix[0].map((c) => String(c ?? '')));
  if (!headerCheck.valid) {
    return baseFailure(
      'INVALID_HEADERS',
      headerCheck.errorMessage || 'Invalid headers. Please use Leave_Balance_Template.xlsx.',
      headerCheck.errorDetail
    );
  }

  const originalHeaders = headerCheck.cleanedHeaders;
  const colIdx = headerCheck.columnIndexMap;

  // 5. Extract non-empty rows
  const nonEmptyRows: Array<{ excelRowNumber: number; cells: Array<unknown> }> = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] || [];
    const hasAnyValue = originalHeaders.some((_, idx) => String(cells[idx] ?? '').trim() !== '');
    if (hasAnyValue) {
      nonEmptyRows.push({ excelRowNumber: r + 1, cells });
    }
  }

  if (nonEmptyRows.length === 0) {
    return baseFailure(
      'EMPTY_FILE',
      'No leave balance rows found under the header row.',
      'Add at least one worker row to the "Leave Balances" sheet and upload again.'
    );
  }

  if (nonEmptyRows.length > MAX_LEAVE_IMPORT_ROWS_PER_BATCH) {
    return baseFailure(
      'TOO_MANY_ROWS',
      'File exceeds the transactional batch limit. Please split into smaller files.',
      `Detected ${nonEmptyRows.length.toLocaleString('en-IN')} rows. Maximum atomic transaction size is ${MAX_LEAVE_IMPORT_ROWS_PER_BATCH} rows.`
    );
  }

  // 6. Build lookup map of existing workers by normalized 10-digit phone number
  const workersByPhone = new Map<string, Worker>();
  for (const w of existingWorkers) {
    const p = normalizePhone10(w.phone);
    if (p && !workersByPhone.has(p)) {
      workersByPhone.set(p, w);
    }
  }

  // 7. First pass: detect ALL duplicate phone numbers across the entire file
  const phoneRowMap = new Map<string, number[]>();
  for (const { excelRowNumber, cells } of nonEmptyRows) {
    const rawPhoneCell = cells[colIdx.get('Worker Phone Number')!];
    const normPhone = normalizePhone10(rawPhoneCell);
    if (normPhone) {
      const list = phoneRowMap.get(normPhone) || [];
      list.push(excelRowNumber);
      phoneRowMap.set(normPhone, list);
    }
  }

  const duplicatePhoneIssues: LeaveBalanceDuplicatePhoneIssue[] = [];
  const duplicatePhoneSet = new Set<string>();
  phoneRowMap.forEach((rows, phone) => {
    if (rows.length > 1) {
      duplicatePhoneSet.add(phone);
      duplicatePhoneIssues.push({
        phone,
        rows,
        message: `Phone ${phone} appears ${rows.length} times (Rows ${rows.join(', ')}).`,
      });
    }
  });

  // 8. Second pass: validate every row thoroughly
  const allRows: LeaveBalanceValidatedRow[] = [];

  for (const { excelRowNumber, cells } of nonEmptyRows) {
    const rawRow: Record<string, string | number> = {};
    originalHeaders.forEach((header, idx) => {
      const val = cells[idx];
      rawRow[header] = typeof val === 'number' ? val : String(val ?? '').trim();
    });

    const rawPhoneCell = cells[colIdx.get('Worker Phone Number')!];
    const rawPhone = String(rawPhoneCell ?? '').trim();
    const normalizedPhone = normalizePhone10(rawPhoneCell);
    const excelWorkerName = String(cells[colIdx.get('Worker Name')!] ?? '').trim();

    const parsedEl = parseNumericLeaveValue(cells[colIdx.get('Earned Leave Balance')!]);
    const parsedSl = parseNumericLeaveValue(cells[colIdx.get('Sick Leave Balance')!]);
    const parsedCl = parseNumericLeaveValue(cells[colIdx.get('Casual Leave Balance')!]);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check phone presence & format
    const isDuplicatePhone = Boolean(normalizedPhone && duplicatePhoneSet.has(normalizedPhone));
    if (!normalizedPhone) {
      errors.push(`Row ${excelRowNumber}: Missing Worker Phone Number`);
    } else if (!/^\d{10}$/.test(normalizedPhone)) {
      errors.push(
        `Row ${excelRowNumber}: Invalid Worker Phone Number "${rawPhone}" (expected 10 digits)`
      );
    }

    if (isDuplicatePhone) {
      const dupRows = phoneRowMap.get(normalizedPhone) || [];
      const otherRows = dupRows.filter((r) => r !== excelRowNumber);
      errors.push(
        `Row ${excelRowNumber}: Duplicate phone number ${normalizedPhone} (also in Row${otherRows.length > 1 ? 's' : ''} ${otherRows.join(', ')})`
      );
    }

    // Match against existing workers
    const matchedWorker =
      normalizedPhone && /^\d{10}$/.test(normalizedPhone)
        ? workersByPhone.get(normalizedPhone)
        : undefined;
    const isMatched = Boolean(matchedWorker);

    // Worker Name check (required for validation)
    if (!excelWorkerName) {
      warnings.push('Worker Name is blank in Excel — verify phone match carefully');
    }

    let nameMismatch = false;
    if (matchedWorker && excelWorkerName) {
      const normExcel = normalizeNameForCompare(excelWorkerName);
      const normDb = normalizeNameForCompare(matchedWorker.name);
      if (normExcel && normDb && normExcel !== normDb) {
        nameMismatch = true;
        warnings.push(
          `Name differs from record (Excel: "${excelWorkerName}" vs Record: "${matchedWorker.name}")`
        );
      }
    }

    // Numeric leave balance checks
    if (parsedEl.value === null) {
      errors.push(
        parsedEl.rawText
          ? `Row ${excelRowNumber}: Invalid Earned Leave Balance "${parsedEl.rawText}" (must be a number)`
          : `Row ${excelRowNumber}: Missing Earned Leave Balance`
      );
    }
    if (parsedSl.value === null) {
      errors.push(
        parsedSl.rawText
          ? `Row ${excelRowNumber}: Invalid Sick Leave Balance "${parsedSl.rawText}" (must be a number)`
          : `Row ${excelRowNumber}: Missing Sick Leave Balance`
      );
    }
    if (parsedCl.value === null) {
      errors.push(
        parsedCl.rawText
          ? `Row ${excelRowNumber}: Invalid Casual Leave Balance "${parsedCl.rawText}" (must be a number)`
          : `Row ${excelRowNumber}: Missing Casual Leave Balance`
      );
    }

    // Negative balance handling based on Tenant Leave Policy
    const negativeParts: string[] = [];
    let negativeBalanceDays = 0;
    if (parsedEl.value !== null && parsedEl.value < 0) {
      negativeParts.push(`EL: ${parsedEl.value}`);
      negativeBalanceDays += Math.abs(parsedEl.value);
    }
    if (parsedSl.value !== null && parsedSl.value < 0) {
      negativeParts.push(`SL: ${parsedSl.value}`);
      negativeBalanceDays += Math.abs(parsedSl.value);
    }
    if (parsedCl.value !== null && parsedCl.value < 0) {
      negativeParts.push(`CL: ${parsedCl.value}`);
      negativeBalanceDays += Math.abs(parsedCl.value);
    }
    negativeBalanceDays = Math.round(negativeBalanceDays * 100) / 100;
    const hasNegativeBalance = negativeParts.length > 0;

    if (hasNegativeBalance) {
      if (allowNegativeBalance) {
        warnings.push(
          `Negative balance (${negativeParts.join(', ')}) accepted — ${negativeBalanceDays}d queued for deduction in next payroll`
        );
      } else {
        errors.push(
          `Row ${excelRowNumber}: Negative balance (${negativeParts.join(', ')}) is blocked by Tenant Leave Policy. Enable "Allow Negative Balances" in Settings → Leave Policy or adjust to ≥ 0.`
        );
      }
    }

    // Determine row status
    let status: LeaveBalanceRowStatus;
    if (isDuplicatePhone) {
      status = 'DUPLICATE_PHONE';
    } else if (!isMatched) {
      status = errors.length > 0 ? 'ERROR' : 'UNMATCHED_PHONE';
      if (errors.length === 0) {
        warnings.push(`Phone number ${normalizedPhone} does not match any existing worker record`);
      }
    } else if (errors.length > 0) {
      status = 'ERROR';
    } else if (warnings.length > 0) {
      status = 'MATCHED_WITH_WARNINGS';
    } else {
      status = 'MATCHED_VALID';
    }

    const combinedNotes = [...errors, ...warnings].join('; ');

    allRows.push({
      rowNumber: excelRowNumber,
      rawRow,
      rawPhone,
      normalizedPhone,
      excelWorkerName,
      matchedWorkerId: matchedWorker?.id,
      matchedWorkerName: matchedWorker?.name,
      previousBalances: matchedWorker
        ? {
            earnedLeave: matchedWorker.leaveBalances?.pl ?? orgSettings?.leavePolicy?.pl ?? 0,
            sickLeave: matchedWorker.leaveBalances?.sl ?? orgSettings?.leavePolicy?.sl ?? 0,
            casualLeave: matchedWorker.leaveBalances?.cl ?? orgSettings?.leavePolicy?.cl ?? 0,
          }
        : undefined,
      earnedLeave: parsedEl.value,
      sickLeave: parsedSl.value,
      casualLeave: parsedCl.value,
      hasNegativeBalance,
      negativeBalanceDays,
      nameMismatch,
      isMatched,
      isDuplicatePhone,
      status,
      errors,
      warnings,
      errorReason: combinedNotes,
    });
  }

  const matchedRows = allRows.filter((r) => r.isMatched);
  const unmatchedRows = allRows.filter((r) => !r.isMatched);
  const blockingErrorRows = allRows.filter((r) => r.errors.length > 0);
  const negativeBalanceRows = allRows.filter((r) => r.hasNegativeBalance);
  const nameMismatchRows = allRows.filter((r) => r.nameMismatch);
  const hasDuplicatePhones = duplicatePhoneIssues.length > 0;

  // Count distinct matched workers & unmatched phone rows for the preview summary
  const matchedCount = matchedRows.length;
  const unmatchedCount = unmatchedRows.length;
  const summaryMessage = formatLeaveBalancePreviewSummary(matchedCount, unmatchedCount);

  // Determine whether the batch can be atomically committed
  let canCommit = true;
  let blockReason: string | undefined;

  if (hasDuplicatePhones) {
    canCommit = false;
    blockReason = `Duplicate phone number(s) found in file (${duplicatePhoneIssues
      .map((d) => `${d.phone} on Rows ${d.rows.join(' & ')}`)
      .join('; ')}). Entire import is blocked until duplicates are removed.`;
  } else if (blockingErrorRows.length > 0) {
    canCommit = false;
    blockReason = `${blockingErrorRows.length} row${blockingErrorRows.length === 1 ? ' has' : 's have'} validation errors that must be resolved before committing.`;
  } else if (matchedCount === 0) {
    canCommit = false;
    blockReason = 'No phone numbers in this file matched existing workers in your directory.';
  }

  return {
    ok: true,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders,
    migrationDate,
    allowNegativeBalance,
    totalRows: allRows.length,
    matchedCount,
    unmatchedCount,
    summaryMessage,
    hasDuplicatePhones,
    duplicatePhoneIssues,
    matchedRows,
    unmatchedRows,
    blockingErrorRows,
    negativeBalanceRows,
    nameMismatchRows,
    allRows,
    canCommit,
    blockReason,
  };
}

/**
 * Commits a validated Leave Balance Import atomically via dbService.bulkUpdateLeaveBalancesTransactional.
 * Updates each matched worker's leaveBalances & leave_balance records as Opening Balances effective on
 * migrationDate, with future accruals applying strictly from migrationDate forward.
 */
export async function commitLeaveBalanceImport(params: {
  tenantId: string;
  validationResult: LeaveBalanceValidationResult;
  actorEmail: string;
  migrationDate?: string;
  timeoutMs?: number;
  simulateFailureAtIndex?: number;
}): Promise<{
  batch: LeaveBalanceImportBatch;
  updatedRecords: LeaveBalanceRecord[];
}> {
  const { tenantId, validationResult, actorEmail, timeoutMs, simulateFailureAtIndex } = params;
  const migrationDate =
    params.migrationDate ||
    validationResult.migrationDate ||
    new Date().toISOString().split('T')[0];

  if (!validationResult.ok || !validationResult.canCommit) {
    throw new Error(
      validationResult.blockReason ||
        'Cannot commit leave balance import because validation checks failed.'
    );
  }
  if (validationResult.hasDuplicatePhones) {
    throw new Error(
      'Cannot commit: Duplicate phone numbers exist in the file. Fix duplicates and re-upload.'
    );
  }

  // Target payroll cycle for any negative opening balance deductions (YYYY-MM of migration date)
  const negativeDeductionMonth = migrationDate.slice(0, 7);

  const updates = validationResult.matchedRows
    .filter(
      (r) =>
        r.isMatched &&
        r.matchedWorkerId &&
        r.earnedLeave !== null &&
        r.sickLeave !== null &&
        r.casualLeave !== null &&
        r.errors.length === 0
    )
    .map((r) => ({
      workerId: r.matchedWorkerId!,
      workerName: r.matchedWorkerName || r.excelWorkerName,
      workerPhone: r.normalizedPhone,
      earnedLeave: r.earnedLeave!,
      sickLeave: r.sickLeave!,
      casualLeave: r.casualLeave!,
      negativeBalanceDays: r.negativeBalanceDays,
      negativeBalanceDeductionMonth:
        r.hasNegativeBalance && validationResult.allowNegativeBalance
          ? negativeDeductionMonth
          : undefined,
    }));

  return dbService.bulkUpdateLeaveBalancesTransactional({
    tenantId,
    fileName: validationResult.fileName,
    migrationDate,
    actorEmail,
    allowNegativeBalancePolicy: validationResult.allowNegativeBalance,
    totalRows: validationResult.totalRows,
    unmatchedPhoneCount: validationResult.unmatchedCount,
    updates,
    timeoutMs,
    simulateFailureAtIndex,
  });
}

/**
 * Mid-Year Migration Accrual Utility:
 * Computes pro-rata accrued leaves strictly from the worker's migrationDate / accrualStartDate
 * forward (never back-calculating or double-counting leaves prior to the migration date).
 */
export function calculateAccruedLeaveSinceMigration(
  worker: Worker,
  orgSettings?: OrgSettings | null,
  asOfDateIso: string = new Date().toISOString().split('T')[0]
): {
  accrualStartDate: string | null;
  completedMonthsSinceMigration: number;
  accruedEarnedLeave: number;
  accruedSickLeave: number;
  accruedCasualLeave: number;
  projectedTotalEarnedLeave: number;
  projectedTotalSickLeave: number;
  projectedTotalCasualLeave: number;
} {
  const lb = worker.leaveBalances;
  const startIso = lb?.accrualStartDate || lb?.migrationDate || null;
  const baseEl = lb?.openingBalance?.pl ?? lb?.pl ?? orgSettings?.leavePolicy?.pl ?? 0;
  const baseSl = lb?.openingBalance?.sl ?? lb?.sl ?? orgSettings?.leavePolicy?.sl ?? 0;
  const baseCl = lb?.openingBalance?.cl ?? lb?.cl ?? orgSettings?.leavePolicy?.cl ?? 0;

  if (!startIso || asOfDateIso <= startIso) {
    return {
      accrualStartDate: startIso,
      completedMonthsSinceMigration: 0,
      accruedEarnedLeave: 0,
      accruedSickLeave: 0,
      accruedCasualLeave: 0,
      projectedTotalEarnedLeave: baseEl,
      projectedTotalSickLeave: baseSl,
      projectedTotalCasualLeave: baseCl,
    };
  }

  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${asOfDateIso}T00:00:00`);
  const rawMonths =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() >= start.getDate() ? 0 : -1);
  const completedMonths = Math.max(0, rawMonths);

  const annualPl = orgSettings?.leavePolicy?.pl ?? 15;
  const annualSl = orgSettings?.leavePolicy?.sl ?? 7;
  const annualCl = orgSettings?.leavePolicy?.cl ?? 7;

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const accruedEl = round2((annualPl / 12) * completedMonths);
  const accruedSl = round2((annualSl / 12) * completedMonths);
  const accruedCl = round2((annualCl / 12) * completedMonths);

  return {
    accrualStartDate: startIso,
    completedMonthsSinceMigration: completedMonths,
    accruedEarnedLeave: accruedEl,
    accruedSickLeave: accruedSl,
    accruedCasualLeave: accruedCl,
    projectedTotalEarnedLeave: round2(baseEl + accruedEl),
    projectedTotalSickLeave: round2(baseSl + accruedSl),
    projectedTotalCasualLeave: round2(baseCl + accruedCl),
  };
}

/**
 * Downloads an annotated Leave Balance Validation / Error Report (.xlsx)
 * with Match Status, Matched Worker Name, and Error / Warning Reason columns.
 */
export function downloadLeaveBalanceErrorReport(
  result: LeaveBalanceValidationResult
): string {
  const wb = XLSX.utils.book_new();
  const headers = [
    ...result.originalHeaders,
    'Match Status',
    'Matched Worker Record',
    'Error / Warning Reason',
  ];

  const rows: Array<Array<string | number>> = [
    headers,
    ...result.allRows.map((row) => [
      ...result.originalHeaders.map((h) => row.rawRow[h] ?? ''),
      row.status,
      row.matchedWorkerName || 'Not Found',
      row.errorReason || 'OK',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    ...result.originalHeaders.map(() => ({ wch: 22 })),
    { wch: 22 },
    { wch: 26 },
    { wch: 64 },
  ];
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length - 1, c: headers.length - 1 },
    }),
  };

  XLSX.utils.book_append_sheet(wb, ws, 'Validation Report');
  const baseName = result.fileName.replace(/\.(xlsx|xls|csv)$/i, '');
  const outName = `${baseName}_Validation_Report.xlsx`;
  XLSX.writeFile(wb, outName, { bookType: 'xlsx' });
  return outName;
}

/**
 * Generates an in-memory demo Leave Balance .xlsx File for instant HR preview testing:
 * - 'MIGRATION_SAMPLE': matches existing workers (including a -2 negative balance case) + 2 unmatched phones
 * - 'DUPLICATE_PHONE_SAMPLE': deliberately repeats a phone number across two rows to verify whole-file failure
 */
export function createDemoLeaveBalanceExcelFile(
  existingWorkers: Worker[],
  scenario: 'MIGRATION_SAMPLE' | 'DUPLICATE_PHONE_SAMPLE' = 'MIGRATION_SAMPLE'
): File {
  const wb = XLSX.utils.book_new();
  const activeWorkers = existingWorkers
    .filter((w) => w.status !== 'RESIGNED' && w.status !== 'TERMINATED' && w.status !== 'INACTIVE')
    .slice(0, 5);

  const rows: Array<Array<string | number>> = [[...LEAVE_BALANCE_REQUIRED_HEADERS]];

  if (scenario === 'DUPLICATE_PHONE_SAMPLE') {
    const first = activeWorkers[0] || { phone: '9876543210', name: 'Ramesh Sharma' };
    const second = activeWorkers[1] || { phone: '9876543211', name: 'Priya Patel' };
    rows.push([normalizePhone10(first.phone) || '9876543210', first.name, 10, 5, 4]);
    rows.push([normalizePhone10(second.phone) || '9876543211', second.name, 12, 6, 3]);
    // Deliberate duplicate phone number on Row 4
    rows.push([normalizePhone10(first.phone) || '9876543210', first.name, 8, 4, 2]);
  } else {
    const sampleBalances: Array<[number, number, number]> = [
      [10, 5, 4],
      [14.5, 6, 3],
      [8, 4, -2], // Negative Casual Leave balance (-2 days over-taken)
      [11, 3.5, 5],
      [6, 7, 2],
    ];

    if (activeWorkers.length > 0) {
      activeWorkers.forEach((w, idx) => {
        const [el, sl, cl] = sampleBalances[idx % sampleBalances.length];
        rows.push([normalizePhone10(w.phone) || `987654321${idx}`, w.name, el, sl, cl]);
      });
    } else {
      rows.push(['9876543210', 'Ramesh Sharma', 10, 5, 4]);
      rows.push(['9876543211', 'Priya Patel', 14.5, 6, 3]);
      rows.push(['9876543212', 'Amit Kumar', 8, 4, -2]);
    }
    // 2 unmatched phone numbers not in DB
    rows.push(['9911002233', 'Suresh Chauhan (Unmatched)', 9, 4, 3]);
    rows.push(['9911002244', 'Pooja Solanki (Unmatched)', 7, 5, 2]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Leave Balances');
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const fileName =
    scenario === 'DUPLICATE_PHONE_SAMPLE'
      ? 'Demo_Duplicate_Phone_Leave_Balances.xlsx'
      : 'Demo_MidYear_Leave_Balances.xlsx';

  return new File([arrayBuffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ============================================================================
// BULK ADVANCE / LOAN LEDGER IMPORT ENGINE (Loan_Ledger_Template.xlsx)
// ============================================================================

export const LOAN_LEDGER_REQUIRED_HEADERS = [
  'Worker Phone Number',
  'Total Loan Amount',
  'Outstanding Principal',
  'Monthly EMI',
  'Remaining Installments',
] as const;

export const MAX_LOAN_IMPORT_ROWS_PER_BATCH = 495;

export type LoanLedgerRowStatus =
  | 'MATCHED_ACTIVE'
  | 'MATCHED_EMI_WARNING'
  | 'SKIPPED_SETTLED'
  | 'UNMATCHED_PHONE'
  | 'ERROR';

export interface LoanLedgerHeaderCheckResult {
  valid: boolean;
  cleanedHeaders: string[];
  missingHeaders: string[];
  columnIndexMap: Map<string, number>;
  errorMessage?: string;
  errorDetail?: string;
}

export interface LoanLedgerValidatedRow {
  rowNumber: number; // 1-indexed spreadsheet row (Row 2 is first data row)
  rawRow: Record<string, string | number>;
  rawPhone: string;
  normalizedPhone: string;
  matchedWorkerId?: string;
  matchedWorkerName?: string;
  matchedWorkerDesignation?: string;
  estimatedNetSalary: number | null;
  totalLoanAmount: number | null;
  outstandingPrincipal: number | null;
  monthlyEmi: number | null;
  remainingInstallments: number | null;
  effectiveMonthlyRecovery: number;
  isMatched: boolean;
  isSettledSkipped: boolean;
  emiExceedsSalaryWarning: boolean;
  emiWarningMessage?: string;
  status: LoanLedgerRowStatus;
  errors: string[];
  warnings: string[];
  notes: string;
}

export interface LoanLedgerValidationResult {
  ok: boolean;
  fatalErrorCode?: ImportFatalErrorCode;
  fatalError?: string;
  fatalDetail?: string;
  fileName: string;
  fileSizeBytes: number;
  originalHeaders: string[];
  startMonth: string; // YYYY-MM
  totalRows: number;
  activeLoansCount: number;
  settledSkippedCount: number;
  unmatchedCount: number;
  emiWarningCount: number;
  errorCount: number;
  totalOutstandingPrincipal: number;
  totalMonthlyRecovery: number;
  summaryMessage: string; // e.g., "Total outstanding loan recovery to be deducted this month: ₹1,50,000."
  activeRows: LoanLedgerValidatedRow[];
  settledRows: LoanLedgerValidatedRow[];
  unmatchedRows: LoanLedgerValidatedRow[];
  emiWarningRows: LoanLedgerValidatedRow[];
  blockingErrorRows: LoanLedgerValidatedRow[];
  allRows: LoanLedgerValidatedRow[];
  canCommit: boolean;
  blockReason?: string;
}

export interface LoanLedgerRowOverride {
  monthlyEmi?: number;
  remainingInstallments?: number;
}

/**
 * Formats the standard EMI-exceeds-salary warning message:
 * "EMI exceeds estimated salary for Worker X. Please adjust."
 */
export function formatEmiExceedsSalaryWarning(workerName: string): string {
  return `EMI exceeds estimated salary for ${workerName}. Please adjust.`;
}

/**
 * Parses an INR/numeric spreadsheet cell (accepting commas, ₹, Rs., whitespace) into a finite number.
 */
function parseNumericCurrencyCell(raw: unknown): { value: number | null; rawText: string } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { value: null, rawText: String(raw) };
    return { value: Math.round(raw * 100) / 100, rawText: String(raw) };
  }
  const rawText = String(raw ?? '').trim();
  if (!rawText) return { value: null, rawText: '' };
  const cleaned = rawText
    .replace(/₹/g, '')
    .replace(/\b(?:inr|rs\.?)\b/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return { value: null, rawText };
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return { value: null, rawText };
  return { value: Math.round(num * 100) / 100, rawText };
}

/**
 * Validates that the uploaded Loan Ledger spreadsheet contains all 5 required columns.
 */
export function validateLoanLedgerHeaders(rawHeaders: string[]): LoanLedgerHeaderCheckResult {
  const cleanedHeaders = rawHeaders.map((h) => String(h ?? '').trim());
  const normalizedMap = new Map<string, number>();

  cleanedHeaders.forEach((h, idx) => {
    const key = h.toLowerCase().replace(/\s+/g, ' ');
    if (key && !normalizedMap.has(key)) {
      normalizedMap.set(key, idx);
    }
  });

  const columnIndexMap = new Map<string, number>();
  const missingHeaders: string[] = [];

  for (const req of LOAN_LEDGER_REQUIRED_HEADERS) {
    const idx = normalizedMap.get(req.toLowerCase());
    if (idx === undefined) {
      missingHeaders.push(req);
    } else {
      columnIndexMap.set(req, idx);
    }
  }

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      cleanedHeaders,
      missingHeaders,
      columnIndexMap,
      errorMessage: 'Invalid headers. Please use Loan_Ledger_Template.xlsx.',
      errorDetail: `Missing required column(s): ${missingHeaders.join(', ')}. Required headers: ${LOAN_LEDGER_REQUIRED_HEADERS.join(', ')}.`,
    };
  }

  return {
    valid: true,
    cleanedHeaders,
    missingHeaders: [],
    columnIndexMap,
  };
}

/**
 * Re-evaluates cumulative worker EMI warnings, totals, and the summary message across a list of
 * LoanLedgerValidatedRow items (used both during initial parsing and after inline EMI adjustments).
 */
function finalizeLoanLedgerValidationResult(params: {
  fileName: string;
  fileSizeBytes: number;
  originalHeaders: string[];
  startMonth: string;
  rows: LoanLedgerValidatedRow[];
}): LoanLedgerValidationResult {
  const { fileName, fileSizeBytes, originalHeaders, startMonth, rows } = params;

  // Track cumulative monthly EMI per worker for multi-loan EMI-vs-salary validation
  const cumulativeEmiByWorker = new Map<string, number>();
  const loanCountByWorker = new Map<string, number>();
  for (const row of rows) {
    if (
      row.isMatched &&
      row.matchedWorkerId &&
      !row.isSettledSkipped &&
      row.errors.length === 0 &&
      row.monthlyEmi !== null &&
      row.outstandingPrincipal !== null &&
      row.outstandingPrincipal > 0
    ) {
      const recovery = Math.round(Math.min(row.monthlyEmi, row.outstandingPrincipal) * 100) / 100;
      cumulativeEmiByWorker.set(
        row.matchedWorkerId,
        Math.round(((cumulativeEmiByWorker.get(row.matchedWorkerId) || 0) + recovery) * 100) / 100
      );
      loanCountByWorker.set(row.matchedWorkerId, (loanCountByWorker.get(row.matchedWorkerId) || 0) + 1);
    }
  }

  const evaluatedRows: LoanLedgerValidatedRow[] = rows.map((row) => {
    // Strip any previously computed EMI warning before re-evaluating
    const baseWarnings = row.warnings.filter(
      (w) => !w.startsWith('EMI exceeds estimated salary for ') && !w.startsWith('Combined EMI ')
    );

    if (
      !row.isMatched ||
      row.isSettledSkipped ||
      row.errors.length > 0 ||
      row.monthlyEmi === null ||
      row.outstandingPrincipal === null ||
      row.outstandingPrincipal <= 0
    ) {
      const notes = [...row.errors, ...baseWarnings].join('; ');
      return {
        ...row,
        emiExceedsSalaryWarning: false,
        emiWarningMessage: undefined,
        warnings: baseWarnings,
        notes,
      };
    }

    const effectiveMonthlyRecovery =
      Math.round(Math.min(row.monthlyEmi, row.outstandingPrincipal) * 100) / 100;
    const workerName = row.matchedWorkerName || row.normalizedPhone;
    const estimatedNet = row.estimatedNetSalary;
    const workerTotalEmi = row.matchedWorkerId
      ? cumulativeEmiByWorker.get(row.matchedWorkerId) || effectiveMonthlyRecovery
      : effectiveMonthlyRecovery;
    const workerLoanCount = row.matchedWorkerId
      ? loanCountByWorker.get(row.matchedWorkerId) || 1
      : 1;

    let emiExceedsSalaryWarning = false;
    let emiWarningMessage: string | undefined;
    const nextWarnings = [...baseWarnings];

    if (estimatedNet !== null && estimatedNet >= 0) {
      if (row.monthlyEmi > estimatedNet || workerTotalEmi > estimatedNet) {
        emiExceedsSalaryWarning = true;
        emiWarningMessage = formatEmiExceedsSalaryWarning(workerName);
        nextWarnings.push(emiWarningMessage);
        if (workerLoanCount > 1 && row.monthlyEmi <= estimatedNet && workerTotalEmi > estimatedNet) {
          nextWarnings.push(
            `Combined EMI across ${workerLoanCount} loans (${formatInrWhole(
              workerTotalEmi
            )}) exceeds estimated net salary (${formatInrWhole(estimatedNet)}).`
          );
        }
      }
    }

    const status: LoanLedgerRowStatus = emiExceedsSalaryWarning
      ? 'MATCHED_EMI_WARNING'
      : 'MATCHED_ACTIVE';

    return {
      ...row,
      effectiveMonthlyRecovery,
      emiExceedsSalaryWarning,
      emiWarningMessage,
      status,
      warnings: nextWarnings,
      notes: [...row.errors, ...nextWarnings].join('; '),
    };
  });

  const activeRows = evaluatedRows.filter(
    (r) => r.status === 'MATCHED_ACTIVE' || r.status === 'MATCHED_EMI_WARNING'
  );
  const settledRows = evaluatedRows.filter((r) => r.status === 'SKIPPED_SETTLED');
  const unmatchedRows = evaluatedRows.filter((r) => r.status === 'UNMATCHED_PHONE');
  const emiWarningRows = evaluatedRows.filter((r) => r.emiExceedsSalaryWarning);
  const blockingErrorRows = evaluatedRows.filter((r) => r.errors.length > 0);

  const totalOutstandingPrincipal =
    Math.round(
      activeRows.reduce((sum, r) => sum + (r.outstandingPrincipal || 0), 0) * 100
    ) / 100;
  const totalMonthlyRecovery =
    Math.round(
      activeRows.reduce((sum, r) => sum + r.effectiveMonthlyRecovery, 0) * 100
    ) / 100;

  const summaryMessage = formatLoanRecoverySummary(totalMonthlyRecovery);

  let canCommit = true;
  let blockReason: string | undefined;

  if (blockingErrorRows.length > 0) {
    canCommit = false;
    blockReason = `${blockingErrorRows.length} row${
      blockingErrorRows.length === 1 ? ' has' : 's have'
    } validation errors that must be corrected before importing.`;
  } else if (activeRows.length === 0) {
    canCommit = false;
    blockReason =
      settledRows.length > 0
        ? `All ${settledRows.length} matched loan(s) already have ₹0 outstanding balance (settled) — no ActiveLoan records need to be created.`
        : 'No matched workers with active outstanding loan balances were found in this file.';
  }

  return {
    ok: true,
    fileName,
    fileSizeBytes,
    originalHeaders,
    startMonth,
    totalRows: evaluatedRows.length,
    activeLoansCount: activeRows.length,
    settledSkippedCount: settledRows.length,
    unmatchedCount: unmatchedRows.length,
    emiWarningCount: emiWarningRows.length,
    errorCount: blockingErrorRows.length,
    totalOutstandingPrincipal,
    totalMonthlyRecovery,
    summaryMessage,
    activeRows,
    settledRows,
    unmatchedRows,
    emiWarningRows,
    blockingErrorRows,
    allRows: evaluatedRows,
    canCommit,
    blockReason,
  };
}

/**
 * Parses and validates a Bulk Advance / Loan Ledger Excel/CSV file (.xlsx / .xls / .csv):
 * - Validates required columns from Loan_Ledger_Template.xlsx
 * - Matches Worker Phone Number against existing tenant workers
 * - Automatically skips settled loans where Outstanding Principal === 0
 * - Flags warning "EMI exceeds estimated salary for Worker X. Please adjust." when EMI > estimated net salary
 * - Computes total monthly recovery and exact summary message:
 *   "Total outstanding loan recovery to be deducted this month: ₹1,50,000."
 */
export async function parseAndValidateLoanLedgerFile(params: {
  file: File;
  tenantId: string;
  existingWorkers: Worker[];
  orgSettings?: OrgSettings | null;
  startMonth?: string; // YYYY-MM
}): Promise<LoanLedgerValidationResult> {
  const { file, existingWorkers, orgSettings } = params;
  const startMonth = params.startMonth || new Date().toISOString().slice(0, 7);

  const baseFailure = (
    fatalErrorCode: ImportFatalErrorCode,
    fatalError: string,
    fatalDetail?: string
  ): LoanLedgerValidationResult => ({
    ok: false,
    fatalErrorCode,
    fatalError,
    fatalDetail,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders: [],
    startMonth,
    totalRows: 0,
    activeLoansCount: 0,
    settledSkippedCount: 0,
    unmatchedCount: 0,
    emiWarningCount: 0,
    errorCount: 0,
    totalOutstandingPrincipal: 0,
    totalMonthlyRecovery: 0,
    summaryMessage: formatLoanRecoverySummary(0),
    activeRows: [],
    settledRows: [],
    unmatchedRows: [],
    emiWarningRows: [],
    blockingErrorRows: [],
    allRows: [],
    canCommit: false,
    blockReason: fatalError,
  });

  // 1. Validate extension
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.csv')) {
    return baseFailure(
      'UNSUPPORTED_FILE_TYPE',
      'Unsupported file format. Please upload an .xlsx, .xls, or .csv file.',
      `Uploaded file: ${file.name}`
    );
  }

  // 2. Validate 5MB limit
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return baseFailure(
      'FILE_TOO_LARGE',
      'File size exceeds the 5MB limit. Please split your file into smaller batches.',
      `Uploaded file is ${sizeMb} MB (max 5 MB).`
    );
  }

  // 3. Parse spreadsheet
  let matrix: Array<Array<unknown>> = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const targetSheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'loan ledger') ||
      workbook.SheetNames.find((n) => n.trim().toLowerCase() !== 'read me') ||
      workbook.SheetNames[0];

    if (!targetSheetName) {
      return baseFailure('EMPTY_FILE', 'The uploaded file has no worksheets.');
    }

    const sheet = workbook.Sheets[targetSheetName];
    matrix = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
  } catch (err) {
    console.error('Loan ledger spreadsheet parse failed:', err);
    return baseFailure(
      'PARSE_ERROR',
      'Could not read the uploaded file. Please save it as .xlsx or .csv and try again.'
    );
  }

  if (matrix.length === 0) {
    return baseFailure('EMPTY_FILE', 'The uploaded file is empty.');
  }

  // 4. Validate required 5 columns
  const headerCheck = validateLoanLedgerHeaders(matrix[0].map((c) => String(c ?? '')));
  if (!headerCheck.valid) {
    return baseFailure(
      'INVALID_HEADERS',
      headerCheck.errorMessage || 'Invalid headers. Please use Loan_Ledger_Template.xlsx.',
      headerCheck.errorDetail
    );
  }

  const originalHeaders = headerCheck.cleanedHeaders;
  const colIdx = headerCheck.columnIndexMap;

  // 5. Extract non-empty data rows
  const nonEmptyRows: Array<{ excelRowNumber: number; cells: Array<unknown> }> = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] || [];
    const hasAnyValue = originalHeaders.some((_, idx) => String(cells[idx] ?? '').trim() !== '');
    if (hasAnyValue) {
      nonEmptyRows.push({ excelRowNumber: r + 1, cells });
    }
  }

  if (nonEmptyRows.length === 0) {
    return baseFailure(
      'EMPTY_FILE',
      'No loan rows found under the header row.',
      'Add at least one worker loan entry to the "Loan Ledger" sheet and upload again.'
    );
  }

  if (nonEmptyRows.length > MAX_LOAN_IMPORT_ROWS_PER_BATCH) {
    return baseFailure(
      'TOO_MANY_ROWS',
      'File exceeds the transactional batch limit. Please split into smaller files.',
      `Detected ${nonEmptyRows.length.toLocaleString('en-IN')} rows. Maximum atomic transaction size is ${MAX_LOAN_IMPORT_ROWS_PER_BATCH} rows.`
    );
  }

  // 6. Build lookup map of existing workers by normalized 10-digit phone number
  const workersByPhone = new Map<string, Worker>();
  for (const w of existingWorkers) {
    const p = normalizePhone10(w.phone);
    if (p && !workersByPhone.has(p)) {
      workersByPhone.set(p, w);
    }
  }

  // 7. Validate every row
  const parsedRows: LoanLedgerValidatedRow[] = [];

  for (const { excelRowNumber, cells } of nonEmptyRows) {
    const rawRow: Record<string, string | number> = {};
    originalHeaders.forEach((header, idx) => {
      const val = cells[idx];
      rawRow[header] = typeof val === 'number' ? val : String(val ?? '').trim();
    });

    const rawPhoneCell = cells[colIdx.get('Worker Phone Number')!];
    const rawPhone = String(rawPhoneCell ?? '').trim();
    const normalizedPhone = normalizePhone10(rawPhoneCell);

    const parsedTotalLoan = parseNumericCurrencyCell(cells[colIdx.get('Total Loan Amount')!]);
    const parsedOutstanding = parseNumericCurrencyCell(
      cells[colIdx.get('Outstanding Principal')!]
    );
    const parsedEmi = parseNumericCurrencyCell(cells[colIdx.get('Monthly EMI')!]);
    const parsedInstallments = parseNumericCurrencyCell(
      cells[colIdx.get('Remaining Installments')!]
    );

    const errors: string[] = [];
    const warnings: string[] = [];

    // Phone check
    if (!normalizedPhone) {
      errors.push(`Row ${excelRowNumber}: Missing Worker Phone Number`);
    } else if (!/^\d{10}$/.test(normalizedPhone)) {
      errors.push(
        `Row ${excelRowNumber}: Invalid Worker Phone Number "${rawPhone}" (expected 10 digits)`
      );
    }

    const matchedWorker =
      normalizedPhone && /^\d{10}$/.test(normalizedPhone)
        ? workersByPhone.get(normalizedPhone)
        : undefined;
    const isMatched = Boolean(matchedWorker);
    const estimatedNetSalary = matchedWorker
      ? estimateWorkerMonthlyNetSalary(matchedWorker, orgSettings, startMonth)
      : null;

    // Validate Outstanding Principal first to detect settled loans (0)
    if (parsedOutstanding.value === null) {
      errors.push(
        parsedOutstanding.rawText
          ? `Row ${excelRowNumber}: Invalid Outstanding Principal "${parsedOutstanding.rawText}"`
          : `Row ${excelRowNumber}: Missing Outstanding Principal`
      );
    } else if (parsedOutstanding.value < 0) {
      errors.push(
        `Row ${excelRowNumber}: Outstanding Principal cannot be negative (${parsedOutstanding.value})`
      );
    }

    const isSettledLoan = parsedOutstanding.value === 0;

    if (isSettledLoan) {
      // Edge case: Loan already settled in old system (Outstanding Principal === 0)
      // Skip creating an ActiveLoan record without requiring EMI > 0 or Remaining Installments > 0
      warnings.push(
        'Outstanding principal is ₹0 (settled in old system) — skipped, no ActiveLoan record will be created.'
      );
    } else if (parsedOutstanding.value !== null && parsedOutstanding.value > 0) {
      // Active loan validations
      if (parsedTotalLoan.value === null) {
        errors.push(
          parsedTotalLoan.rawText
            ? `Row ${excelRowNumber}: Invalid Total Loan Amount "${parsedTotalLoan.rawText}"`
            : `Row ${excelRowNumber}: Missing Total Loan Amount`
        );
      } else if (parsedTotalLoan.value <= 0) {
        errors.push(
          `Row ${excelRowNumber}: Total Loan Amount must be greater than ₹0 for active loans`
        );
      } else if (parsedOutstanding.value > parsedTotalLoan.value) {
        warnings.push(
          `Outstanding Principal (${formatInrWhole(
            parsedOutstanding.value
          )}) exceeds Total Loan Amount (${formatInrWhole(parsedTotalLoan.value)}).`
        );
      }

      if (parsedEmi.value === null) {
        errors.push(
          parsedEmi.rawText
            ? `Row ${excelRowNumber}: Invalid Monthly EMI "${parsedEmi.rawText}"`
            : `Row ${excelRowNumber}: Missing Monthly EMI`
        );
      } else if (parsedEmi.value <= 0) {
        errors.push(`Row ${excelRowNumber}: Monthly EMI must be greater than ₹0 for active loans`);
      }

      if (parsedInstallments.value === null) {
        errors.push(
          parsedInstallments.rawText
            ? `Row ${excelRowNumber}: Invalid Remaining Installments "${parsedInstallments.rawText}"`
            : `Row ${excelRowNumber}: Missing Remaining Installments`
        );
      } else if (
        parsedInstallments.value < 1 ||
        !Number.isInteger(parsedInstallments.value)
      ) {
        errors.push(
          `Row ${excelRowNumber}: Remaining Installments must be a whole number ≥ 1 (got ${parsedInstallments.rawText})`
        );
      }
    }

    let status: LoanLedgerRowStatus;
    if (errors.length > 0) {
      status = 'ERROR';
    } else if (isSettledLoan) {
      status = 'SKIPPED_SETTLED';
    } else if (!isMatched) {
      status = 'UNMATCHED_PHONE';
      warnings.push(`Phone number ${normalizedPhone} does not match any existing worker record`);
    } else {
      status = 'MATCHED_ACTIVE';
    }

    const effectiveMonthlyRecovery =
      status === 'MATCHED_ACTIVE' &&
      parsedEmi.value !== null &&
      parsedOutstanding.value !== null
        ? Math.round(Math.min(parsedEmi.value, parsedOutstanding.value) * 100) / 100
        : 0;

    parsedRows.push({
      rowNumber: excelRowNumber,
      rawRow,
      rawPhone,
      normalizedPhone,
      matchedWorkerId: matchedWorker?.id,
      matchedWorkerName: matchedWorker?.name,
      matchedWorkerDesignation: matchedWorker?.designation,
      estimatedNetSalary,
      totalLoanAmount: parsedTotalLoan.value,
      outstandingPrincipal: parsedOutstanding.value,
      monthlyEmi: parsedEmi.value,
      remainingInstallments:
        parsedInstallments.value !== null ? Math.round(parsedInstallments.value) : null,
      effectiveMonthlyRecovery,
      isMatched,
      isSettledSkipped: isSettledLoan && errors.length === 0,
      emiExceedsSalaryWarning: false,
      status,
      errors,
      warnings,
      notes: [...errors, ...warnings].join('; '),
    });
  }

  return finalizeLoanLedgerValidationResult({
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders,
    startMonth,
    rows: parsedRows,
  });
}

/**
 * Applies inline Monthly EMI / Remaining Installments overrides from the Validation Preview
 * and returns an updated LoanLedgerValidationResult with live recalculated warnings and
 * monthly recovery summary.
 */
export function applyLoanLedgerEmiOverrides(
  result: LoanLedgerValidationResult,
  overrides: Record<number, LoanLedgerRowOverride>
): LoanLedgerValidationResult {
  if (!result.ok || !overrides || Object.keys(overrides).length === 0) {
    return result;
  }

  const updatedRows = result.allRows.map((row) => {
    const ov = overrides[row.rowNumber];
    if (!ov || !row.isMatched || row.isSettledSkipped || row.outstandingPrincipal === null) {
      return row;
    }

    const nextEmi =
      typeof ov.monthlyEmi === 'number' && Number.isFinite(ov.monthlyEmi) && ov.monthlyEmi > 0
        ? Math.round(ov.monthlyEmi * 100) / 100
        : row.monthlyEmi;

    const autoInstallments =
      nextEmi && nextEmi > 0
        ? Math.max(1, Math.ceil(row.outstandingPrincipal / nextEmi))
        : row.remainingInstallments;

    const nextInstallments =
      typeof ov.remainingInstallments === 'number' &&
      Number.isFinite(ov.remainingInstallments) &&
      ov.remainingInstallments >= 1
        ? Math.round(ov.remainingInstallments)
        : autoInstallments;

    const nextEffective =
      nextEmi !== null
        ? Math.round(Math.min(nextEmi, row.outstandingPrincipal) * 100) / 100
        : row.effectiveMonthlyRecovery;

    return {
      ...row,
      monthlyEmi: nextEmi,
      remainingInstallments: nextInstallments,
      effectiveMonthlyRecovery: nextEffective,
    };
  });

  return finalizeLoanLedgerValidationResult({
    fileName: result.fileName,
    fileSizeBytes: result.fileSizeBytes,
    originalHeaders: result.originalHeaders,
    startMonth: result.startMonth,
    rows: updatedRows,
  });
}

/**
 * Commits a validated Bulk Advance / Loan Ledger Import atomically via
 * dbService.bulkCreateActiveLoansTransactional, creating an ActiveLoan record for each
 * matched worker with Outstanding Principal > 0 and skipping settled (0) loans.
 */
export async function commitLoanLedgerImport(params: {
  tenantId: string;
  validationResult: LoanLedgerValidationResult;
  actorEmail: string;
  startMonth?: string;
  emiOverrides?: Record<number, LoanLedgerRowOverride>;
  timeoutMs?: number;
  simulateFailureAtIndex?: number;
}): Promise<{
  batch: LoanLedgerImportBatch;
  createdLoans: ActiveLoan[];
  effectiveResult: LoanLedgerValidationResult;
}> {
  const { tenantId, actorEmail, emiOverrides, timeoutMs, simulateFailureAtIndex } = params;
  const effectiveResult = emiOverrides
    ? applyLoanLedgerEmiOverrides(params.validationResult, emiOverrides)
    : params.validationResult;

  if (!effectiveResult.ok || !effectiveResult.canCommit) {
    throw new Error(
      effectiveResult.blockReason ||
        'Cannot commit loan ledger import because validation checks failed.'
    );
  }

  const startMonth =
    params.startMonth || effectiveResult.startMonth || new Date().toISOString().slice(0, 7);

  const loansToCreate = effectiveResult.activeRows
    .filter(
      (r) =>
        r.isMatched &&
        r.matchedWorkerId &&
        !r.isSettledSkipped &&
        r.errors.length === 0 &&
        r.totalLoanAmount !== null &&
        r.outstandingPrincipal !== null &&
        r.outstandingPrincipal > 0 &&
        r.monthlyEmi !== null &&
        r.monthlyEmi > 0 &&
        r.remainingInstallments !== null &&
        r.remainingInstallments >= 1
    )
    .map((r) => ({
      workerId: r.matchedWorkerId!,
      workerName: r.matchedWorkerName || r.normalizedPhone,
      workerPhone: r.normalizedPhone,
      totalLoanAmount: r.totalLoanAmount!,
      outstandingPrincipal: r.outstandingPrincipal!,
      monthlyEmi: r.monthlyEmi!,
      remainingInstallments: r.remainingInstallments!,
      startMonth,
      emiExceedsSalaryWarning: r.emiExceedsSalaryWarning,
      estimatedNetSalaryAtImport: r.estimatedNetSalary ?? undefined,
    }));

  if (loansToCreate.length === 0) {
    throw new Error('No active loans with outstanding balance > ₹0 found to import.');
  }

  const { batch, createdLoans } = await dbService.bulkCreateActiveLoansTransactional({
    tenantId,
    fileName: effectiveResult.fileName,
    actorEmail,
    totalRows: effectiveResult.totalRows,
    settledSkippedCount: effectiveResult.settledSkippedCount,
    unmatchedPhoneCount: effectiveResult.unmatchedCount,
    emiWarningCount: effectiveResult.emiWarningCount,
    loans: loansToCreate,
    timeoutMs,
    simulateFailureAtIndex,
  });

  return { batch, createdLoans, effectiveResult };
}

/**
 * Downloads an annotated Loan Ledger Validation Report (.xlsx) detailing matched workers,
 * estimated net salary, EMI warnings, skipped settled loans, and unmatched phone numbers.
 */
export function downloadLoanLedgerValidationReport(result: LoanLedgerValidationResult): string {
  const wb = XLSX.utils.book_new();
  const headers = [
    ...result.originalHeaders,
    'Matched Worker',
    'Estimated Monthly Net Salary (₹)',
    'This Month Recovery (₹)',
    'Import Status',
    'Warnings / Errors',
  ];

  const rows: Array<Array<string | number>> = [
    headers,
    ...result.allRows.map((row) => [
      ...result.originalHeaders.map((h) => row.rawRow[h] ?? ''),
      row.matchedWorkerName || 'Not Found',
      row.estimatedNetSalary !== null ? Math.round(row.estimatedNetSalary) : '',
      Math.round(row.effectiveMonthlyRecovery),
      row.status,
      row.notes || 'OK',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    ...result.originalHeaders.map(() => ({ wch: 22 })),
    { wch: 24 },
    { wch: 26 },
    { wch: 22 },
    { wch: 22 },
    { wch: 64 },
  ];
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length - 1, c: headers.length - 1 },
    }),
  };

  XLSX.utils.book_append_sheet(wb, ws, 'Loan Validation Report');
  const baseName = result.fileName.replace(/\.(xlsx|xls|csv)$/i, '');
  const outName = `${baseName}_Validation_Report.xlsx`;
  XLSX.writeFile(wb, outName, { bookType: 'xlsx' });
  return outName;
}

/**
 * Generates an in-memory demo Loan Ledger .xlsx File for 1-click preview testing:
 * - Active loans matching existing workers
 * - An EMI-exceeds-salary warning row so SMB owners can see & test inline EMI adjustment
 * - A settled loan row (Outstanding Principal = 0) demonstrating automatic skip
 * - An unmatched phone number row
 */
export function createDemoLoanLedgerExcelFile(existingWorkers: Worker[]): File {
  const wb = XLSX.utils.book_new();
  const activeWorkers = existingWorkers
    .filter((w) => w.status !== 'RESIGNED' && w.status !== 'TERMINATED' && w.status !== 'INACTIVE')
    .slice(0, 4);

  const rows: Array<Array<string | number>> = [[...LOAN_LEDGER_REQUIRED_HEADERS]];

  if (activeWorkers.length >= 3) {
    // Worker 1: Healthy active loan
    rows.push([normalizePhone10(activeWorkers[0].phone) || '9876543210', 60000, 35000, 5000, 7]);
    // Worker 2: EMI exceeds estimated monthly salary (triggers warning for inline adjustment)
    const w2Est = estimateWorkerMonthlyNetSalary(activeWorkers[1]);
    const excessiveEmi = Math.max(10000, Math.round((w2Est + 5000) / 500) * 500);
    rows.push([
      normalizePhone10(activeWorkers[1].phone) || '9876543211',
      excessiveEmi * 4,
      excessiveEmi * 3,
      excessiveEmi,
      3,
    ]);
    // Worker 3: Settled in old system (Outstanding Principal = 0 -> skipped!)
    rows.push([normalizePhone10(activeWorkers[2].phone) || '9876543212', 20000, 0, 0, 0]);
    if (activeWorkers[3]) {
      rows.push([normalizePhone10(activeWorkers[3].phone) || '9876543213', 36000, 18000, 3000, 6]);
    }
  } else if (activeWorkers.length > 0) {
    activeWorkers.forEach((w, idx) => {
      if (idx === 0) {
        rows.push([normalizePhone10(w.phone) || '9876543210', 50000, 30000, 5000, 6]);
      } else {
        rows.push([normalizePhone10(w.phone) || `987654321${idx}`, 15000, 0, 0, 0]);
      }
    });
  } else {
    rows.push(['9876543210', 60000, 35000, 5000, 7]);
    rows.push(['9876543211', 40000, 30000, 10000, 3]);
    rows.push(['9876543212', 20000, 0, 0, 0]);
  }

  // Unmatched phone number
  rows.push(['9900112233', 25000, 10000, 2500, 4]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Loan Ledger');
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  return new File([arrayBuffer], 'Demo_Worker_Loan_Ledger.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
