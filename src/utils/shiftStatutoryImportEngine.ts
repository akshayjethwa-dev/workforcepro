import * as XLSX from 'xlsx';
import { OrgSettings, ShiftConfig } from '../types/index';
import { INDIAN_STATES, IndianStateName, StatutoryEngine } from '../services/statutoryEngine';
import { MONTH_SHORT_NAMES, resolveStateLwfRule, StateLwfRule } from '../services/ptLwfDatabase';
import { dbService } from '../services/db';
import {
  SHIFT_RULES_TEMPLATE_FILENAME,
  SHIFT_RULES_TEMPLATE_HEADERS,
} from './workerExcelTemplate';

export const SHIFT_RULES_REQUIRED_HEADERS = [...SHIFT_RULES_TEMPLATE_HEADERS] as const;
export const MAX_SHIFT_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_SHIFT_IMPORT_ROWS = 100;

export type ShiftImportFatalErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'PARSE_ERROR'
  | 'EMPTY_FILE'
  | 'STATUTORY_EXCEL_BLOCKED'
  | 'INVALID_HEADERS'
  | 'TOO_MANY_ROWS';

export type ShiftImportRowStatus = 'VALID' | 'VALID_WITH_OVERLAP' | 'ERROR';

export interface ShiftOverlapPair {
  shiftAName: string;
  shiftATime: string;
  shiftBName: string;
  shiftBTime: string;
  overlapMinutes: number;
  message: string;
}

export interface ValidatedShiftRow {
  rowNumber: number;
  rawRow: Record<string, string | number>;
  shiftName: string;
  displayLabel: string; // e.g., "Morning Shift (6 AM - 2 PM)"
  startTime: string | null; // Strict HH:MM
  endTime: string | null; // Strict HH:MM
  gracePeriodMins: number | null;
  halfDayHours: number | null;
  durationHours: number | null;
  isOvernight: boolean;
  overlapsWith: string[];
  status: ShiftImportRowStatus;
  errors: string[];
  warnings: string[];
  shiftConfig?: ShiftConfig;
}

export interface ShiftRulesValidationResult {
  ok: boolean;
  fatalErrorCode?: ShiftImportFatalErrorCode;
  fatalError?: string;
  fatalDetail?: string;
  fileName: string;
  fileSizeBytes: number;
  originalHeaders: string[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  overlappingPairs: ShiftOverlapPair[];
  allRows: ValidatedShiftRow[];
  validShifts: ShiftConfig[];
  canCommit: boolean;
  blockReason?: string;
}

export interface StatePtSlabLine {
  salaryRange: string;
  monthlyTax: string;
  note?: string;
}

export interface StateStatutoryBundle {
  state: IndianStateName;
  ptApplicable: boolean;
  ptSummary: string;
  ptSlabs: StatePtSlabLine[];
  lwfRule: StateLwfRule;
  lwfDatesSummary: string;
  centralPfRules: {
    employeeRatePct: number;
    employerEpfPct: number;
    employerEpsPct: number;
    wageCeilingInr: number;
    fiftyPercentWageRule: boolean;
    summary: string;
  };
  centralEsiRules: {
    employeeRatePct: number;
    employerRatePct: number;
    wageCeilingInr: number;
    disabilityCeilingInr: number;
    summary: string;
  };
}

const STRICT_HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Formats 24-hour HH:MM into concise 12-hour human label (e.g., "06:00" -> "6 AM", "14:30" -> "2:30 PM").
 */
export function formatTime12Hour(hhmm: string): string {
  if (!STRICT_HHMM_REGEX.test(hhmm)) return hhmm;
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Builds readable shift label e.g., "Morning Shift (6 AM - 2 PM)".
 */
export function formatShiftDisplayLabel(name: string, startTime: string, endTime: string): string {
  const cleanName = name.trim();
  return `${cleanName} (${formatTime12Hour(startTime)} - ${formatTime12Hour(endTime)})`;
}

/**
 * Converts strict HH:MM to minutes from midnight [0..1439].
 */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Computes shift duration in hours (supporting overnight shifts like 22:00 -> 06:00 = 8h).
 */
export function computeShiftDurationHours(startTime: string, endTime: string): {
  durationHours: number;
  isOvernight: boolean;
} {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end > start) {
    return {
      durationHours: Math.round(((end - start) / 60) * 100) / 100,
      isOvernight: false,
    };
  }
  const overnightMins = 24 * 60 - start + end;
  return {
    durationHours: Math.round((overnightMins / 60) * 100) / 100,
    isOvernight: true,
  };
}

/**
 * Converts a shift's time window into 1 or 2 intervals within [0, 1440) minutes so overnight shifts
 * accurately test for overlap against daytime and other overnight shifts.
 */
function shiftToMinuteIntervals(startTime: string, endTime: string): Array<[number, number]> {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (e > s) {
    return [[s, e]];
  }
  // Wraps across midnight: [s, 1440) and [0, e)
  const intervals: Array<[number, number]> = [[s, 1440]];
  if (e > 0) intervals.push([0, e]);
  return intervals;
}

/**
 * Returns overlap duration in minutes between two shifts (0 if non-overlapping).
 * Boundary touching (e.g., 06:00-14:00 and 14:00-22:00) returns 0 (back-to-back, not overlapping).
 */
export function getShiftOverlapMinutes(
  a: Pick<ShiftConfig, 'startTime' | 'endTime'>,
  b: Pick<ShiftConfig, 'startTime' | 'endTime'>
): number {
  if (!STRICT_HHMM_REGEX.test(a.startTime) || !STRICT_HHMM_REGEX.test(a.endTime)) return 0;
  if (!STRICT_HHMM_REGEX.test(b.startTime) || !STRICT_HHMM_REGEX.test(b.endTime)) return 0;

  const intervalsA = shiftToMinuteIntervals(a.startTime, a.endTime);
  const intervalsB = shiftToMinuteIntervals(b.startTime, b.endTime);

  let totalOverlap = 0;
  for (const [aStart, aEnd] of intervalsA) {
    for (const [bStart, bEnd] of intervalsB) {
      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);
      if (overlapEnd > overlapStart) {
        totalOverlap += overlapEnd - overlapStart;
      }
    }
  }
  return totalOverlap;
}

/**
 * Detects all overlapping shift pairs within a shift set.
 * Overlapping shifts are ALLOWED, but admins are warned when assigning workers to both.
 */
export function detectOverlappingShiftPairs(
  shifts: Array<Pick<ShiftConfig, 'id' | 'name' | 'startTime' | 'endTime'>>
): ShiftOverlapPair[] {
  const pairs: ShiftOverlapPair[] = [];
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const a = shifts[i];
      const b = shifts[j];
      const overlapMinutes = getShiftOverlapMinutes(a, b);
      if (overlapMinutes > 0) {
        const hrs = Math.round((overlapMinutes / 60) * 10) / 10;
        const durationLabel = overlapMinutes >= 60 ? `${hrs}h` : `${overlapMinutes}m`;
        pairs.push({
          shiftAName: a.name,
          shiftATime: `${a.startTime} - ${a.endTime}`,
          shiftBName: b.name,
          shiftBTime: `${b.startTime} - ${b.endTime}`,
          overlapMinutes,
          message: `"${a.name}" (${a.startTime}–${a.endTime}) overlaps with "${b.name}" (${b.startTime}–${b.endTime}) by ${durationLabel}. Allowed, but avoid assigning the same worker to both shifts.`,
        });
      }
    }
  }
  return pairs;
}

/**
 * Checks whether a target shift overlaps with any other configured factory shifts
 * (used when assigning a worker to a shift in AddWorkerScreen or RosterScreen).
 */
export function getOverlappingShiftsForTarget(
  targetShiftId: string | undefined,
  allShifts: ShiftConfig[]
): ShiftConfig[] {
  if (!targetShiftId) return [];
  const target = allShifts.find((s) => s.id === targetShiftId);
  if (!target) return [];
  return allShifts.filter(
    (other) => other.id !== target.id && getShiftOverlapMinutes(target, other) > 0
  );
}

/**
 * Strictly parses a time cell into 24-hour HH:MM.
 * - Accepts exact "HH:MM" text (e.g. "09:00", "17:00", "22:00", "06:00").
 * - Accepts native Excel time fraction serial (number in [0, 1)) if Excel auto-formatted a valid time cell.
 * - Explicitly REJECTS free-text formats like "9 to 5", "9:00 AM", "9-17", "25:00", "9:00".
 */
export function parseStrictTimeCell(raw: unknown): {
  value: string | null;
  rawText: string;
  error?: string;
} {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 0 && raw < 1) {
      const totalMins = Math.round(raw * 24 * 60) % (24 * 60);
      const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
      const mm = String(totalMins % 60).padStart(2, '0');
      return { value: `${hh}:${mm}`, rawText: `${hh}:${mm}` };
    }
    return {
      value: null,
      rawText: String(raw),
      error: `Invalid time format "${raw}". Use strict 24-hour HH:MM format (e.g., 09:00 and 17:00).`,
    };
  }

  const rawText = String(raw ?? '').trim();
  if (!rawText) {
    return {
      value: null,
      rawText: '',
      error: 'Missing time value. Use strict 24-hour HH:MM format (e.g., 09:00).',
    };
  }

  if (!STRICT_HHMM_REGEX.test(rawText)) {
    return {
      value: null,
      rawText,
      error: `Invalid time format "${rawText}". Use strict 24-hour HH:MM format (e.g., 09:00 and 17:00) instead of free-text ranges.`,
    };
  }

  return { value: rawText, rawText };
}

function parseNumericCell(raw: unknown): { value: number | null; rawText: string } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { value: null, rawText: String(raw) };
    return { value: Math.round(raw * 100) / 100, rawText: String(raw) };
  }
  const rawText = String(raw ?? '').trim();
  if (!rawText) return { value: null, rawText: '' };
  if (!/^-?\d+(?:\.\d+)?$/.test(rawText)) {
    return { value: null, rawText };
  }
  const num = Number(rawText);
  return Number.isFinite(num) ? { value: Math.round(num * 100) / 100, rawText } : { value: null, rawText };
}

/**
 * Detects whether the user mistakenly attempted to upload statutory slabs (PT/LWF/PF/ESI rates)
 * via Excel — explicitly forbidden by compliance policy.
 */
function hasStatutorySlabHeaders(headers: string[]): boolean {
  const joined = headers.map((h) => h.toLowerCase()).join(' | ');
  return /\b(pt slab|professional tax|lwf|pf rate|epf rate|esi rate|statutory slab|tax slab)\b/i.test(
    joined
  );
}

/**
 * Parses and validates Shift_Rules_Template.xlsx (.xlsx / .xls / .csv).
 * - Blocks statutory slab Excel uploads (enforces strict dropdown selector).
 * - Fails with a clear format error if time cells are not strict HH:MM (e.g., "9 to 5").
 * - Allows overlapping shifts while surfacing explicit overlap warnings for worker assignment.
 */
export async function parseAndValidateShiftRulesFile(params: {
  file: File;
  existingShifts?: ShiftConfig[];
}): Promise<ShiftRulesValidationResult> {
  const { file, existingShifts = [] } = params;

  const baseFailure = (
    fatalErrorCode: ShiftImportFatalErrorCode,
    fatalError: string,
    fatalDetail?: string
  ): ShiftRulesValidationResult => ({
    ok: false,
    fatalErrorCode,
    fatalError,
    fatalDetail,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders: [],
    totalRows: 0,
    validCount: 0,
    errorCount: 0,
    overlappingPairs: [],
    allRows: [],
    validShifts: [],
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

  // 2. Validate size
  if (file.size > MAX_SHIFT_IMPORT_FILE_SIZE_BYTES) {
    return baseFailure(
      'FILE_TOO_LARGE',
      'File size exceeds the 5MB limit.',
      `Uploaded file: ${(file.size / (1024 * 1024)).toFixed(2)} MB`
    );
  }

  // 3. Parse workbook
  let matrix: Array<Array<unknown>> = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const targetSheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'shift rules') ||
      workbook.SheetNames.find((n) => n.trim().toLowerCase() !== 'read me') ||
      workbook.SheetNames[0];

    if (!targetSheetName) {
      return baseFailure('EMPTY_FILE', 'The uploaded workbook contains no worksheets.');
    }

    const sheet = workbook.Sheets[targetSheetName];
    matrix = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
  } catch (err) {
    console.error('Shift rules spreadsheet parse failed:', err);
    return baseFailure(
      'PARSE_ERROR',
      'Could not read the uploaded file. Please save it as .xlsx or .csv and try again.'
    );
  }

  if (matrix.length === 0) {
    return baseFailure('EMPTY_FILE', 'The uploaded file is empty.');
  }

  const cleanedHeaders = matrix[0].map((c) => String(c ?? '').trim());

  // 4. Explicitly block Excel import of statutory slabs
  if (hasStatutorySlabHeaders(cleanedHeaders)) {
    return baseFailure(
      'STATUTORY_EXCEL_BLOCKED',
      'Excel import is not allowed for statutory slabs (PT, LWF, PF, ESI).',
      'Statutory slabs are too error-prone for spreadsheet upload. Upload only Shift Rules here, then select your Primary State from the strict dropdown in Step 2.'
    );
  }

  // 5. Validate required 5 shift columns
  const normalizedMap = new Map<string, number>();
  cleanedHeaders.forEach((h, idx) => {
    const k = h.toLowerCase().replace(/\s+/g, ' ');
    if (k && !normalizedMap.has(k)) normalizedMap.set(k, idx);
  });

  const colIdx = new Map<string, number>();
  const missingHeaders: string[] = [];
  for (const req of SHIFT_RULES_REQUIRED_HEADERS) {
    const idx = normalizedMap.get(req.toLowerCase());
    if (idx === undefined) {
      missingHeaders.push(req);
    } else {
      colIdx.set(req, idx);
    }
  }

  if (missingHeaders.length > 0) {
    return baseFailure(
      'INVALID_HEADERS',
      `Invalid headers. Please use ${SHIFT_RULES_TEMPLATE_FILENAME}.`,
      `Missing required column(s): ${missingHeaders.join(', ')}. Required columns: ${SHIFT_RULES_REQUIRED_HEADERS.join(', ')}.`
    );
  }

  // 6. Extract non-empty rows
  const nonEmptyRows: Array<{ excelRowNumber: number; cells: Array<unknown> }> = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] || [];
    const hasAnyValue = cleanedHeaders.some((_, idx) => String(cells[idx] ?? '').trim() !== '');
    if (hasAnyValue) {
      nonEmptyRows.push({ excelRowNumber: r + 1, cells });
    }
  }

  if (nonEmptyRows.length === 0) {
    return baseFailure(
      'EMPTY_FILE',
      'No shift rows found under the header row.',
      'Add at least one shift row to the "Shift Rules" sheet and upload again.'
    );
  }

  if (nonEmptyRows.length > MAX_SHIFT_IMPORT_ROWS) {
    return baseFailure(
      'TOO_MANY_ROWS',
      `Too many shifts in a single file (max ${MAX_SHIFT_IMPORT_ROWS} shift rules).`
    );
  }

  // 7. Validate each shift row
  const seenNames = new Map<string, number>();
  const validatedRows: ValidatedShiftRow[] = [];
  const baseStamp = Date.now();

  for (let i = 0; i < nonEmptyRows.length; i++) {
    const { excelRowNumber, cells } = nonEmptyRows[i];
    const rawRow: Record<string, string | number> = {};
    cleanedHeaders.forEach((header, idx) => {
      const val = cells[idx];
      rawRow[header] = typeof val === 'number' ? val : String(val ?? '').trim();
    });

    const shiftName = String(cells[colIdx.get('Shift Name')!] ?? '').trim();
    const startParsed = parseStrictTimeCell(cells[colIdx.get('Start Time')!]);
    const endParsed = parseStrictTimeCell(cells[colIdx.get('End Time')!]);
    const graceParsed = parseNumericCell(cells[colIdx.get('Grace Period (Mins)')!]);
    const halfDayParsed = parseNumericCell(cells[colIdx.get('Half-Day Hours')!]);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!shiftName) {
      errors.push(`Row ${excelRowNumber}: Missing Shift Name.`);
    } else {
      const key = shiftName.toLowerCase();
      if (seenNames.has(key)) {
        errors.push(
          `Row ${excelRowNumber}: Duplicate Shift Name "${shiftName}" (already defined in Row ${seenNames.get(
            key
          )}).`
        );
      } else {
        seenNames.set(key, excelRowNumber);
      }
    }

    if (startParsed.error) {
      errors.push(`Row ${excelRowNumber} (Start Time): ${startParsed.error}`);
    }
    if (endParsed.error) {
      errors.push(`Row ${excelRowNumber} (End Time): ${endParsed.error}`);
    }

    let durationHours: number | null = null;
    let isOvernight = false;

    if (startParsed.value && endParsed.value) {
      if (startParsed.value === endParsed.value) {
        errors.push(
          `Row ${excelRowNumber}: Start Time and End Time cannot be identical (${startParsed.value}).`
        );
      } else {
        const dur = computeShiftDurationHours(startParsed.value, endParsed.value);
        durationHours = dur.durationHours;
        isOvernight = dur.isOvernight;
        if (isOvernight) {
          warnings.push(`Overnight shift (${startParsed.value} → ${endParsed.value} next day, ${durationHours}h).`);
        }
      }
    }

    if (graceParsed.value === null) {
      errors.push(
        graceParsed.rawText
          ? `Row ${excelRowNumber}: Invalid Grace Period (Mins) "${graceParsed.rawText}" (expected whole number 0–180).`
          : `Row ${excelRowNumber}: Missing Grace Period (Mins).`
      );
    } else if (graceParsed.value < 0 || graceParsed.value > 180) {
      errors.push(
        `Row ${excelRowNumber}: Grace Period (Mins) must be between 0 and 180 (got ${graceParsed.value}).`
      );
    }

    if (halfDayParsed.value === null) {
      errors.push(
        halfDayParsed.rawText
          ? `Row ${excelRowNumber}: Invalid Half-Day Hours "${halfDayParsed.rawText}" (expected positive number).`
          : `Row ${excelRowNumber}: Missing Half-Day Hours.`
      );
    } else if (halfDayParsed.value <= 0) {
      errors.push(
        `Row ${excelRowNumber}: Half-Day Hours must be greater than 0 (got ${halfDayParsed.value}).`
      );
    } else if (durationHours !== null && halfDayParsed.value >= durationHours) {
      errors.push(
        `Row ${excelRowNumber}: Half-Day Hours (${halfDayParsed.value}h) must be less than full shift duration (${durationHours}h).`
      );
    }

    const slug = shiftName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 24);

    const shiftConfig: ShiftConfig | undefined =
      errors.length === 0 &&
      startParsed.value &&
      endParsed.value &&
      graceParsed.value !== null &&
      halfDayParsed.value !== null
        ? {
            id: `shift_${slug || 'rule'}_${baseStamp}_${i}`,
            name: shiftName,
            startTime: startParsed.value,
            endTime: endParsed.value,
            gracePeriodMins: Math.round(graceParsed.value),
            maxGraceAllowed: 3,
            breakDurationMins: 30,
            minHalfDayHours: halfDayParsed.value,
            minOvertimeMins: 30,
          }
        : undefined;

    const displayLabel =
      shiftName && startParsed.value && endParsed.value
        ? formatShiftDisplayLabel(shiftName, startParsed.value, endParsed.value)
        : shiftName || `Row ${excelRowNumber}`;

    validatedRows.push({
      rowNumber: excelRowNumber,
      rawRow,
      shiftName,
      displayLabel,
      startTime: startParsed.value,
      endTime: endParsed.value,
      gracePeriodMins: graceParsed.value !== null ? Math.round(graceParsed.value) : null,
      halfDayHours: halfDayParsed.value,
      durationHours,
      isOvernight,
      overlapsWith: [],
      status: errors.length > 0 ? 'ERROR' : 'VALID',
      errors,
      warnings,
      shiftConfig,
    });
  }

  // 8. Detect overlapping shifts (among imported shifts AND against existing shifts)
  // Overlapping shifts are ALLOWED, but flagged with explicit non-blocking warnings.
  const validShifts = validatedRows
    .map((r) => r.shiftConfig)
    .filter((s): s is ShiftConfig => Boolean(s));

  const importedNameSet = new Set(validShifts.map((s) => s.name.trim().toLowerCase()));
  const nonReplacedExisting = existingShifts.filter(
    (s) => !importedNameSet.has(s.name.trim().toLowerCase())
  );

  const overlappingPairs = detectOverlappingShiftPairs([...validShifts, ...nonReplacedExisting]);

  if (overlappingPairs.length > 0) {
    for (const row of validatedRows) {
      if (!row.shiftConfig) continue;
      const matches: string[] = [];
      for (const pair of overlappingPairs) {
        if (pair.shiftAName === row.shiftConfig.name) {
          matches.push(`${pair.shiftBName} (${pair.shiftBTime})`);
        } else if (pair.shiftBName === row.shiftConfig.name) {
          matches.push(`${pair.shiftAName} (${pair.shiftATime})`);
        }
      }
      if (matches.length > 0) {
        row.overlapsWith = matches;
        row.status = 'VALID_WITH_OVERLAP';
        row.warnings.push(
          `Overlaps with ${matches.join(', ')} — allowed, but avoid assigning the same worker to both shifts.`
        );
      }
    }
  }

  const errorCount = validatedRows.filter((r) => r.errors.length > 0).length;
  const validCount = validShifts.length;
  const canCommit = errorCount === 0 && validCount > 0;
  const blockReason =
    errorCount > 0
      ? `${errorCount} shift row${errorCount === 1 ? ' has' : 's have'} format or validation errors. Fix time formatting (strict HH:MM) and re-upload.`
      : validCount === 0
      ? 'No valid shift rows found.'
      : undefined;

  return {
    ok: true,
    fileName: file.name,
    fileSizeBytes: file.size,
    originalHeaders: cleanedHeaders,
    totalRows: validatedRows.length,
    validCount,
    errorCount,
    overlappingPairs,
    allRows: validatedRows,
    validShifts,
    canCommit,
    blockReason,
  };
}

// ============================================================================
// STATE STATUTORY MAPPING ENGINE (STRICT DROPDOWN — NO EXCEL IMPORT)
// ============================================================================

const STATE_PT_SLAB_CATALOG: Record<string, { applicable: boolean; summary: string; slabs: StatePtSlabLine[] }> = {
  Gujarat: {
    applicable: true,
    summary: 'Gujarat PT: Nil up to ₹12,000/mo; ₹200/mo above ₹12,000 (₹300 in Feb for ₹2,500/yr cap).',
    slabs: [
      { salaryRange: 'Up to ₹12,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: 'Above ₹12,000 / month', monthlyTax: '₹200 / month', note: '₹300 in Feb (₹2,500 annual cap)' },
    ],
  },
  Maharashtra: {
    applicable: true,
    summary: 'Maharashtra PT: ₹0 (≤ ₹7,500), ₹175 (₹7,501–₹10,000), ₹200 (> ₹10,000; ₹300 in Feb). Women ≤ ₹25,000 exempt.',
    slabs: [
      { salaryRange: 'Up to ₹7,500 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹7,501 – ₹10,000 / month', monthlyTax: '₹175 / month' },
      { salaryRange: 'Above ₹10,000 / month', monthlyTax: '₹200 / month', note: '₹300 in Feb; Women ≤ ₹25,000 exempt' },
    ],
  },
  Karnataka: {
    applicable: true,
    summary: 'Karnataka PT: Nil up to ₹15,000/mo; ₹200/mo above ₹15,000.',
    slabs: [
      { salaryRange: 'Up to ₹15,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: 'Above ₹15,000 / month', monthlyTax: '₹200 / month' },
    ],
  },
  'Tamil Nadu': {
    applicable: true,
    summary: 'Tamil Nadu PT: Half-yearly slab schedule (Nil ≤ ₹3,500/mo up to ~₹208/mo above ₹12,500/mo).',
    slabs: [
      { salaryRange: 'Up to ₹3,500 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹3,501 – ₹12,500 / month', monthlyTax: '₹23 – ₹171 / month (tiered)' },
      { salaryRange: 'Above ₹12,500 / month', monthlyTax: '₹208 / month', note: '₹1,250 half-yearly' },
    ],
  },
  'Andhra Pradesh': {
    applicable: true,
    summary: 'Andhra Pradesh PT: Nil ≤ ₹15,000; ₹150 (₹15,001–₹20,000); ₹200 (> ₹20,000).',
    slabs: [
      { salaryRange: 'Up to ₹15,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹15,001 – ₹20,000 / month', monthlyTax: '₹150 / month' },
      { salaryRange: 'Above ₹20,000 / month', monthlyTax: '₹200 / month' },
    ],
  },
  Telangana: {
    applicable: true,
    summary: 'Telangana PT: Nil ≤ ₹15,000; ₹150 (₹15,001–₹20,000); ₹200 (> ₹20,000).',
    slabs: [
      { salaryRange: 'Up to ₹15,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹15,001 – ₹20,000 / month', monthlyTax: '₹150 / month' },
      { salaryRange: 'Above ₹20,000 / month', monthlyTax: '₹200 / month' },
    ],
  },
  'West Bengal': {
    applicable: true,
    summary: 'West Bengal PT: Nil ≤ ₹10,000; ₹110–₹150 (₹10,001–₹40,000); ₹200 (> ₹40,000).',
    slabs: [
      { salaryRange: 'Up to ₹10,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹10,001 – ₹15,000 / month', monthlyTax: '₹110 / month' },
      { salaryRange: '₹15,001 – ₹25,000 / month', monthlyTax: '₹130 / month' },
      { salaryRange: '₹25,001 – ₹40,000 / month', monthlyTax: '₹150 / month' },
      { salaryRange: 'Above ₹40,000 / month', monthlyTax: '₹200 / month' },
    ],
  },
  Kerala: {
    applicable: true,
    summary: 'Kerala PT: Half-yearly tiered schedule (Nil < ₹2,000/mo up to ₹208/mo ≥ ₹12,500/mo).',
    slabs: [
      { salaryRange: 'Below ₹2,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹2,000 – ₹12,499 / month', monthlyTax: '₹20 – ₹100 / month (tiered)' },
      { salaryRange: '₹12,500 & above / month', monthlyTax: '₹208 / month', note: '₹1,250 half-yearly' },
    ],
  },
  'Madhya Pradesh': {
    applicable: true,
    summary: 'Madhya Pradesh PT: Nil ≤ ₹18,750/mo; ₹208/mo above ₹18,750 (₹212 in Feb).',
    slabs: [
      { salaryRange: 'Up to ₹18,750 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: 'Above ₹18,750 / month', monthlyTax: '₹208 / month', note: '₹212 in Feb (₹2,500 annual cap)' },
    ],
  },
  Odisha: {
    applicable: true,
    summary: 'Odisha PT: Nil ≤ ₹13,304/mo; ₹125 (₹13,305–₹25,000); ₹200 (> ₹25,000; ₹300 in Feb).',
    slabs: [
      { salaryRange: 'Up to ₹13,304 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹13,305 – ₹25,000 / month', monthlyTax: '₹125 / month' },
      { salaryRange: 'Above ₹25,000 / month', monthlyTax: '₹200 / month', note: '₹300 in Feb' },
    ],
  },
  Assam: {
    applicable: true,
    summary: 'Assam PT: Nil ≤ ₹10,000/mo; ₹150 (₹10,001–₹15,000); ₹180 (₹15,001–₹25,000); ₹208 (> ₹25,000).',
    slabs: [
      { salaryRange: 'Up to ₹10,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: '₹10,001 – ₹25,000 / month', monthlyTax: '₹150 – ₹180 / month' },
      { salaryRange: 'Above ₹25,000 / month', monthlyTax: '₹208 / month' },
    ],
  },
  Bihar: {
    applicable: true,
    summary: 'Bihar PT: Annualized slab (Nil ≤ ₹25,000/mo; ₹83–₹208/mo above ₹25,000/mo).',
    slabs: [
      { salaryRange: 'Up to ₹25,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: 'Above ₹25,000 / month', monthlyTax: '₹83 – ₹208 / month (tiered)' },
    ],
  },
  Jharkhand: {
    applicable: true,
    summary: 'Jharkhand PT: Nil ≤ ₹25,000/mo; ₹100–₹208/mo above ₹25,000/mo.',
    slabs: [
      { salaryRange: 'Up to ₹25,000 / month', monthlyTax: 'Nil (₹0)' },
      { salaryRange: 'Above ₹25,000 / month', monthlyTax: '₹100 – ₹208 / month (tiered)' },
    ],
  },
};

/**
 * Returns the complete verified statutory bundle (State PT slabs, State LWF dates & rates,
 * and Central EPF/ESIC rules) for any Indian state/UT selected from the strict dropdown.
 */
export function getStateStatutoryBundle(state: IndianStateName | string): StateStatutoryBundle {
  const validState = (INDIAN_STATES.find((s) => s === state) || 'Gujarat') as IndianStateName;
  const ptEntry = STATE_PT_SLAB_CATALOG[validState];
  const lwfRule = resolveStateLwfRule(validState);

  const lwfMonthLabels =
    lwfRule.enabled && lwfRule.months.length > 0
      ? lwfRule.months.length === 12
        ? 'Every Month (Jan–Dec)'
        : lwfRule.months.map((m) => MONTH_SHORT_NAMES[m - 1]).join(' & ')
      : 'Not Applicable';

  const lwfDatesSummary = lwfRule.enabled
    ? `${lwfRule.cycleLabel} · Deduction Months: ${lwfMonthLabels} · Employee ₹${lwfRule.employeeAmount} / Employer ₹${lwfRule.employerAmount}`
    : `No active State LWF levy in ${validState} (₹0 deducted).`;

  return {
    state: validState,
    ptApplicable: ptEntry ? ptEntry.applicable : false,
    ptSummary: ptEntry
      ? ptEntry.summary
      : `${validState} PT: No State Professional Tax levy applicable (₹0/month).`,
    ptSlabs: ptEntry
      ? ptEntry.slabs
      : [{ salaryRange: 'All salary slabs', monthlyTax: 'Nil (₹0)', note: 'PT not levied in this state/UT' }],
    lwfRule,
    lwfDatesSummary,
    centralPfRules: {
      employeeRatePct: 12,
      employerEpfPct: 3.67,
      employerEpsPct: 8.33,
      wageCeilingInr: StatutoryEngine.PF_STATUTORY_CEILING,
      fiftyPercentWageRule: true,
      summary: `Central EPF: 12% Employee + 12% Employer (8.33% EPS + 3.67% EPF) on ₹${StatutoryEngine.PF_STATUTORY_CEILING.toLocaleString(
        'en-IN'
      )} wage ceiling + Labour Code 50% Wage Rule.`,
    },
    centralEsiRules: {
      employeeRatePct: 0.75,
      employerRatePct: 3.25,
      wageCeilingInr: StatutoryEngine.ESI_STATUTORY_CEILING,
      disabilityCeilingInr: StatutoryEngine.ESI_DISABILITY_CEILING,
      summary: `Central ESIC: 0.75% Employee + 3.25% Employer for gross wages ≤ ₹${StatutoryEngine.ESI_STATUTORY_CEILING.toLocaleString(
        'en-IN'
      )}/mo (₹${StatutoryEngine.ESI_DISABILITY_CEILING.toLocaleString('en-IN')} PwD).`,
    },
  };
}

/**
 * Applies imported Shift records AND locks the selected Primary State's statutory settings
 * (PT slabs, LWF dates & rates, and Central PF/ESI rules) into OrgSettings.
 */
export async function applyShiftAndStatutoryMapping(params: {
  tenantId: string;
  currentSettings: OrgSettings;
  importedShifts: ShiftConfig[];
  mergeMode?: 'MERGE' | 'REPLACE';
  primaryState: IndianStateName | string;
  actorEmail: string;
}): Promise<{
  updatedSettings: OrgSettings;
  createdShiftCount: number;
  overlappingPairs: ShiftOverlapPair[];
  statutoryBundle: StateStatutoryBundle;
}> {
  const {
    tenantId,
    currentSettings,
    importedShifts,
    mergeMode = 'MERGE',
    primaryState,
    actorEmail,
  } = params;

  const bundle = getStateStatutoryBundle(primaryState);
  const now = new Date().toISOString();
  const batchId = `shf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 1. Merge or replace shifts cleanly
  let nextShifts: ShiftConfig[] = [...(currentSettings.shifts || [])];
  if (importedShifts.length > 0) {
    if (mergeMode === 'REPLACE') {
      const defaultShift = nextShifts.find((s) => s.id === 'default');
      const importedHasDefault = importedShifts.some(
        (s) => s.name.trim().toLowerCase() === (defaultShift?.name || '').trim().toLowerCase()
      );
      nextShifts =
        defaultShift && !importedHasDefault
          ? [defaultShift, ...importedShifts]
          : [...importedShifts];
    } else {
      const byLowerName = new Map<string, number>();
      nextShifts.forEach((s, idx) => byLowerName.set(s.name.trim().toLowerCase(), idx));
      for (const imp of importedShifts) {
        const key = imp.name.trim().toLowerCase();
        if (byLowerName.has(key)) {
          const idx = byLowerName.get(key)!;
          // Preserve existing shift id so workers already assigned stay linked
          nextShifts[idx] = {
            ...imp,
            id: nextShifts[idx].id,
          };
        } else {
          nextShifts.push(imp);
          byLowerName.set(key, nextShifts.length - 1);
        }
      }
    }
  }

  // 2. Sync default/primary branch state to Primary State
  const nextBranches = (currentSettings.branches || []).map((b, idx) =>
    b.id === 'default' || idx === 0 ? { ...b, state: bundle.state } : b
  );

  // 3. Auto-apply State PT slabs, State LWF dates, and Central PF/ESI rules & lock statutory settings
  const existingPtLwf = currentSettings.compliance?.ptLwfConfig;
  const nextSettings: OrgSettings = {
    ...currentSettings,
    shifts: nextShifts,
    ...(nextBranches.length > 0 ? { branches: nextBranches } : {}),
    enforceFiftyPercentWageRule: true,
    overtimeMultiplier: currentSettings.overtimeMultiplier ?? 2.0,
    compliance: {
      ...(currentSettings.compliance || {}),
      capPfDeduction: true,
      pfContributionRate: bundle.centralPfRules.employeeRatePct,
      epsContributionRate: bundle.centralPfRules.employerEpsPct,
      epfWageCeiling: bundle.centralPfRules.wageCeilingInr,
      esiEnabled: true,
      esiWageCeiling: bundle.centralEsiRules.wageCeilingInr,
      ptLwfConfig: {
        ptMidMonthProrationEnabled: existingPtLwf?.ptMidMonthProrationEnabled ?? true,
        gujaratPtFeb300Adjustment:
          bundle.state === 'Gujarat' ? true : (existingPtLwf?.gujaratPtFeb300Adjustment ?? true),
        maharashtraPtFeb300Adjustment:
          bundle.state === 'Maharashtra'
            ? true
            : (existingPtLwf?.maharashtraPtFeb300Adjustment ?? true),
        lwfOverrides: {
          ...(existingPtLwf?.lwfOverrides || {}),
          [bundle.state]: {
            enabled: bundle.lwfRule.enabled,
            cycle: bundle.lwfRule.cycle,
            months: [...bundle.lwfRule.months],
            employeeAmount: bundle.lwfRule.employeeAmount,
            employerAmount: bundle.lwfRule.employerAmount,
            ...(bundle.lwfRule.employeePercentageRate !== undefined
              ? { employeePercentageRate: bundle.lwfRule.employeePercentageRate }
              : {}),
            ...(bundle.lwfRule.wageCeiling !== undefined
              ? { wageCeiling: bundle.lwfRule.wageCeiling }
              : {}),
            ...(bundle.lwfRule.wageCeilingMode
              ? { wageCeilingMode: bundle.lwfRule.wageCeilingMode }
              : {}),
            excludeContractors: bundle.lwfRule.excludesContractors,
          },
        },
      },
      statutoryMapping: {
        primaryState: bundle.state,
        locked: true,
        lockedAt: now,
        lockedBy: actorEmail,
        ptSummary: bundle.ptSummary,
        lwfScheduleLabel: bundle.lwfDatesSummary,
        centralPfEsiApplied: true,
        ...(importedShifts.length > 0 ? { shiftImportBatchId: batchId } : {}),
      },
    },
  };

  await dbService.saveOrgSettings(tenantId, nextSettings);

  return {
    updatedSettings: nextSettings,
    createdShiftCount: importedShifts.length,
    overlappingPairs: detectOverlappingShiftPairs(nextShifts),
    statutoryBundle: bundle,
  };
}

/**
 * Creates an in-memory demo Shift Rules .xlsx File for quick testing:
 * - 'FACTORY_SAMPLE': Morning Shift (06:00–14:00), Night Shift (22:00–06:00), plus two overlapping
 *   day shifts (Shift A 09:00–17:00 & Shift B 09:00–18:00) demonstrating overlap warning while allowed.
 * - 'INVALID_TIME_SAMPLE': Contains "9 to 5" instead of "09:00" / "17:00" demonstrating format failure.
 */
export function createDemoShiftRulesExcelFile(
  scenario: 'FACTORY_SAMPLE' | 'INVALID_TIME_SAMPLE' = 'FACTORY_SAMPLE'
): File {
  const wb = XLSX.utils.book_new();
  const rows: Array<Array<string | number>> = [[...SHIFT_RULES_REQUIRED_HEADERS]];

  if (scenario === 'INVALID_TIME_SAMPLE') {
    rows.push(['Morning Shift', '06:00', '14:00', 15, 4]);
    rows.push(['General Shift', '9 to 5', '17:00', 10, 4]);
  } else {
    rows.push(['Morning Shift', '06:00', '14:00', 15, 4]);
    rows.push(['Night Shift', '22:00', '06:00', 15, 4]);
    rows.push(['Shift A (Assembly)', '09:00', '17:00', 10, 4]);
    rows.push(['Shift B (Packing)', '09:00', '18:00', 10, 4.5]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Shift Rules');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const fileName =
    scenario === 'INVALID_TIME_SAMPLE'
      ? 'Demo_Invalid_Time_Format_Shifts.xlsx'
      : 'Demo_Factory_Shift_Rules.xlsx';

  return new File([buf], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
