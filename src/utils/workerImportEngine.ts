import * as XLSX from 'xlsx';
import { OrgSettings, Worker } from '../types/index';
import { resolveMinimumWageFloor } from '../services/minimumWageDatabase';
import { buildOneNumberWageConfig } from '../services/wageStructureValidationService';

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
