import * as XLSX from 'xlsx';
import { Worker } from '../types/index';

export const WORKER_TEMPLATE_FILENAME = 'Worker_Import_Template.xlsx';

export const WORKER_TEMPLATE_HEADERS = [
  'Worker Name',
  'Phone Number',
  'Role',
  'Monthly CTC',
  'Date of Joining',
] as const;

export interface WorkerTemplateSampleRow {
  'Worker Name': string;
  'Phone Number': string;
  Role: string;
  'Monthly CTC': number;
  'Date of Joining': string;
}

const SAMPLE_DATA_ROWS: WorkerTemplateSampleRow[] = [
  {
    'Worker Name': 'Ramesh Kumar (Sample Data)',
    'Phone Number': '9876543210',
    Role: 'CNC Operator',
    'Monthly CTC': 18000,
    'Date of Joining': '15/01/2025',
  },
];

/**
 * Generates a pre-formatted .xlsx workbook containing:
 * 1. "Workers" sheet with exact required columns & a Sample Data row
 * 2. "Read Me" sheet explaining column formats (including Date format: DD/MM/YYYY)
 */
export function buildWorkerImportWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- SHEET 1: Workers ---
  const workerSheetData: Array<Array<string | number>> = [
    [...WORKER_TEMPLATE_HEADERS],
    ...SAMPLE_DATA_ROWS.map((row) => [
      row['Worker Name'],
      row['Phone Number'],
      row.Role,
      row['Monthly CTC'],
      row['Date of Joining'],
    ]),
  ];

  const workersSheet = XLSX.utils.aoa_to_sheet(workerSheetData);

  // Set clean column widths so headers and sample values never truncate in Excel
  workersSheet['!cols'] = [
    { wch: 30 }, // Worker Name
    { wch: 18 }, // Phone Number
    { wch: 24 }, // Role
    { wch: 16 }, // Monthly CTC
    { wch: 18 }, // Date of Joining
  ];

  // Add autofilter on headers
  workersSheet['!autofilter'] = { ref: 'A1:E1' };

  // Explicitly keep Phone Number (B2) and Date of Joining (E2) as text cells
  // so Excel does not convert phone numbers to scientific notation or reformat DD/MM/YYYY
  if (workersSheet['B2']) {
    workersSheet['B2'].t = 's';
    workersSheet['B2'].z = '@';
  }
  if (workersSheet['E2']) {
    workersSheet['E2'].t = 's';
    workersSheet['E2'].z = '@';
  }
  if (workersSheet['D2']) {
    workersSheet['D2'].t = 'n';
    workersSheet['D2'].z = '#,##0';
  }

  XLSX.utils.book_append_sheet(wb, workersSheet, 'Workers');

  // --- SHEET 2: Read Me ---
  const readMeData: Array<Array<string>> = [
    ['Worker Bulk Import — Instructions & Format Guide'],
    ['Fill in your team details on the "Workers" sheet, save this file, and upload it via Bulk Import on the Workers screen.'],
    [],
    ['Column Name', 'Required?', 'Accepted Format', 'Example', 'Notes'],
    [
      'Worker Name',
      'Yes',
      'Full Name (Text)',
      'Ramesh Kumar',
      'Enter the worker\'s full legal name as per Aadhaar / PAN.',
    ],
    [
      'Phone Number',
      'Yes',
      '10-digit Mobile Number',
      '9876543210',
      'Enter 10 digits only without +91, spaces, or dashes.',
    ],
    [
      'Role',
      'Yes',
      'Job Title / Designation',
      'CNC Operator',
      'Examples: Machine Operator, Helper, Supervisor, Quality Inspector, Packer.',
    ],
    [
      'Monthly CTC',
      'Yes',
      'Number in INR (No ₹ or commas)',
      '18000',
      'Total monthly salary. Auto-split into 50% Basic, 20% HRA, and 30% Allowances (PF capped at ₹15,000 Basic).',
    ],
    [
      'Date of Joining',
      'Yes',
      'DD/MM/YYYY',
      '15/01/2025',
      'Date format: DD/MM/YYYY (e.g., 05/03/2025 for 5 March 2025).',
    ],
    [],
    ['Important Tips Before Importing'],
    ['1. Replace or delete Row 2 ("Ramesh Kumar (Sample Data)") on the "Workers" sheet before uploading.'],
    ['2. Do not rename, remove, or reorder the 5 column headers in Row 1 of the "Workers" sheet.'],
    ['3. Always enter Date of Joining in DD/MM/YYYY format (for example: 15/01/2025).'],
    ['4. Monthly CTC must meet your state minimum wage floor; enter plain numbers such as 15000 or 22500.'],
    ['5. Save the file as .xlsx (Excel Workbook) or .csv and upload it in Workers -> Bulk Import.'],
  ];

  const readMeSheet = XLSX.utils.aoa_to_sheet(readMeData);
  readMeSheet['!cols'] = [
    { wch: 22 }, // Column Name
    { wch: 12 }, // Required?
    { wch: 28 }, // Accepted Format
    { wch: 18 }, // Example
    { wch: 68 }, // Notes
  ];

  XLSX.utils.book_append_sheet(wb, readMeSheet, 'Read Me');

  return wb;
}

/**
 * Triggers browser download of the pre-formatted Worker Import Excel template (.xlsx).
 */
export function downloadWorkerImportTemplate(): string {
  const wb = buildWorkerImportWorkbook();
  XLSX.writeFile(wb, WORKER_TEMPLATE_FILENAME, { bookType: 'xlsx' });
  return WORKER_TEMPLATE_FILENAME;
}

/**
 * Converts a DD/MM/YYYY date string (or Excel serial number / YYYY-MM-DD) into ISO YYYY-MM-DD.
 */
export function normalizeJoiningDateToIso(rawValue: unknown): string {
  const fallback = new Date().toISOString().split('T')[0];
  if (rawValue === null || rawValue === undefined || rawValue === '') return fallback;

  // Handle Excel serial date numbers (e.g. 45672)
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    const parsed = XLSX.SSF.parse_date_code(rawValue);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const yyyy = String(parsed.y).padStart(4, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const text = String(rawValue).trim();
  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Match YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return fallback;
}

/**
 * Maps a raw row object from either the new Excel template columns
 * (Worker Name, Phone Number, Role, Monthly CTC, Date of Joining)
 * or legacy CSV headers into a compliant Partial<Worker> ready for bulk import.
 */
export function mapImportedRowToWorker(
  rawRow: Record<string, unknown>,
  tenantId: string
): Partial<Worker> | null {
  const normalized: Record<string, unknown> = {};
  Object.entries(rawRow).forEach(([k, v]) => {
    normalized[k.trim().toLowerCase().replace(/\s+/g, ' ')] = v;
  });

  const name = String(
    normalized['worker name'] ?? normalized['name'] ?? ''
  ).trim();
  if (!name) return null;

  const phoneRaw = String(
    normalized['phone number'] ?? normalized['phone'] ?? ''
  )
    .replace(/\D/g, '')
    .slice(-10);

  const role = String(
    normalized['role'] ?? normalized['designation'] ?? 'General Worker'
  ).trim();

  const rawCtcOrAmount =
    normalized['monthly ctc'] ?? normalized['monthly salary'] ?? normalized['amount'] ?? 15000;
  const cleanedNumeric = Number(String(rawCtcOrAmount).replace(/[₹,\s]/g, '')) || 15000;

  const explicitWageType = String(normalized['wagetype'] ?? normalized['wage type'] ?? '').toUpperCase();
  const isDaily = explicitWageType === 'DAILY' && normalized['monthly ctc'] === undefined;

  const joiningIso = normalizeJoiningDateToIso(
    normalized['date of joining'] ?? normalized['joining date'] ?? normalized['joineddate']
  );

  const monthlyBasic = Math.round(cleanedNumeric * 0.5);
  const monthlyHra = Math.round(cleanedNumeric * 0.2);
  const monthlySpecial = Math.max(0, cleanedNumeric - monthlyBasic - monthlyHra);
  const pfQualifyingWage = Math.min(monthlyBasic, 15000);

  return {
    tenantId,
    name,
    phone: phoneRaw,
    designation: role,
    uan: normalized['uan'] ? String(normalized['uan']).trim() : undefined,
    gender: normalized['gender'] ? (String(normalized['gender']).trim() as Worker['gender']) : undefined,
    category: (normalized['category'] ? String(normalized['category']).trim() : isDaily ? 'Daily Wage' : 'Monthly') as Worker['category'],
    status: 'ACTIVE',
    isActive: true,
    joinedDate: joiningIso,
    dateOfJoining: joiningIso,
    wageConfig: isDaily
      ? {
          type: 'DAILY',
          amount: cleanedNumeric,
          overtimeEligible: true,
          allowances: { travel: 0, food: 0, nightShift: 0 },
        }
      : {
          type: 'MONTHLY',
          amount: cleanedNumeric,
          salaryInputMode: 'ONE_NUMBER',
          basicPercentage: 50,
          monthlyBreakdown: {
            basic: monthlyBasic,
            da: 0,
            retainingAllowance: 0,
            hra: monthlyHra,
            travel: 0,
            others: monthlySpecial,
          },
          pfCapAtStatutoryCeiling: true,
          pfWageCeiling: 15000,
          pfQualifyingWage,
          overtimeEligible: true,
          allowances: { travel: 0, food: 0, nightShift: 0 },
        },
  };
}

/**
 * Parses an uploaded .xlsx, .xls, or .csv file into Worker import candidates.
 */
export async function parseWorkerSpreadsheetFile(
  file: File,
  tenantId: string
): Promise<Array<Partial<Worker>>> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Prefer the "Workers" sheet if present; otherwise fall back to the first sheet
  const targetSheetName =
    workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'workers') ||
    workbook.SheetNames[0];

  if (!targetSheetName) return [];

  const sheet = workbook.Sheets[targetSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const workers: Array<Partial<Worker>> = [];
  for (const row of rawRows) {
    const mapped = mapImportedRowToWorker(row, tenantId);
    if (mapped) {
      workers.push(mapped);
    }
  }
  return workers;
}

// ============================================================================
// BULK LEAVE BALANCE IMPORT TEMPLATE (Leave_Balance_Template.xlsx)
// ============================================================================

export const LEAVE_BALANCE_TEMPLATE_FILENAME = 'Leave_Balance_Template.xlsx';

export const LEAVE_BALANCE_TEMPLATE_HEADERS = [
  'Worker Phone Number',
  'Worker Name',
  'Earned Leave Balance',
  'Sick Leave Balance',
  'Casual Leave Balance',
] as const;

export interface LeaveBalanceTemplateSampleRow {
  'Worker Phone Number': string;
  'Worker Name': string;
  'Earned Leave Balance': number;
  'Sick Leave Balance': number;
  'Casual Leave Balance': number;
}

const LEAVE_BALANCE_DEFAULT_SAMPLES: LeaveBalanceTemplateSampleRow[] = [
  {
    'Worker Phone Number': '9876543210',
    'Worker Name': 'Ramesh Sharma (Sample Data)',
    'Earned Leave Balance': 10,
    'Sick Leave Balance': 5,
    'Casual Leave Balance': 4,
  },
  {
    'Worker Phone Number': '9876543211',
    'Worker Name': 'Priya Patel (Sample Data)',
    'Earned Leave Balance': 12.5,
    'Sick Leave Balance': 6,
    'Casual Leave Balance': 3,
  },
];

/**
 * Generates a pre-formatted Leave_Balance_Template.xlsx workbook containing:
 * 1. "Leave Balances" sheet with exact required columns:
 *    Worker Phone Number | Worker Name | Earned Leave Balance | Sick Leave Balance | Casual Leave Balance
 *    When existingWorkers are provided (active workers), pre-populates their phone numbers & names
 *    with their current balances so HR admins can quickly paste opening balances from legacy software.
 * 2. "Read Me" sheet explaining formatting, mid-year opening balance behavior, negative balance policy,
 *    and duplicate phone number protection.
 */
export function buildLeaveBalanceImportWorkbook(options?: {
  existingWorkers?: Worker[];
  prefillExistingWorkers?: boolean;
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const activeWorkers = (options?.existingWorkers || []).filter(
    (w) => w.status !== 'RESIGNED' && w.status !== 'TERMINATED' && w.status !== 'INACTIVE' && w.isActive !== false
  );

  const shouldPrefill = options?.prefillExistingWorkers !== false && activeWorkers.length > 0;

  const dataRows: Array<Array<string | number>> = shouldPrefill
    ? activeWorkers.map((w) => [
        String(w.phone || '').replace(/\D/g, '').slice(-10),
        w.name || '',
        w.leaveBalances?.pl ?? 0,
        w.leaveBalances?.sl ?? 0,
        w.leaveBalances?.cl ?? 0,
      ])
    : LEAVE_BALANCE_DEFAULT_SAMPLES.map((row) => [
        row['Worker Phone Number'],
        row['Worker Name'],
        row['Earned Leave Balance'],
        row['Sick Leave Balance'],
        row['Casual Leave Balance'],
      ]);

  const sheetMatrix: Array<Array<string | number>> = [
    [...LEAVE_BALANCE_TEMPLATE_HEADERS],
    ...dataRows,
  ];

  const balancesSheet = XLSX.utils.aoa_to_sheet(sheetMatrix);

  balancesSheet['!cols'] = [
    { wch: 24 }, // Worker Phone Number
    { wch: 30 }, // Worker Name
    { wch: 24 }, // Earned Leave Balance
    { wch: 22 }, // Sick Leave Balance
    { wch: 24 }, // Casual Leave Balance
  ];

  balancesSheet['!autofilter'] = {
    ref: `A1:E${Math.max(2, sheetMatrix.length)}`,
  };

  // Keep phone column strictly formatted as text (@) and leave balances as decimal numbers
  for (let rowIdx = 2; rowIdx <= sheetMatrix.length; rowIdx++) {
    const phoneCell = balancesSheet[`A${rowIdx}`];
    if (phoneCell) {
      phoneCell.t = 's';
      phoneCell.z = '@';
    }
    for (const colLetter of ['C', 'D', 'E'] as const) {
      const numCell = balancesSheet[`${colLetter}${rowIdx}`];
      if (numCell) {
        numCell.t = 'n';
        numCell.z = '0.##';
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, balancesSheet, 'Leave Balances');

  // --- SHEET 2: Read Me ---
  const readMeData: Array<Array<string>> = [
    ['Bulk Leave Balance Import — Instructions & Migration Guide'],
    ['Use this template to migrate workers\' accrued leave balances from your previous HR / payroll software into WorkforcePro.'],
    [],
    ['Column Name', 'Required?', 'Accepted Format', 'Example', 'Notes'],
    [
      'Worker Phone Number',
      'Yes',
      '10-digit Mobile Number',
      '9876543210',
      'Primary matching key against existing worker records. Duplicate phone numbers in the same file will fail the entire import.',
    ],
    [
      'Worker Name',
      'Yes',
      'Full Name (Text)',
      'Ramesh Sharma',
      'Used for cross-check validation against the matched worker profile (mismatches are highlighted in preview).',
    ],
    [
      'Earned Leave Balance',
      'Yes',
      'Number (days, e.g. 10 or 12.5)',
      '10',
      'Mapped to Earned / Privilege Leave (EL / PL). Stored as an absolute Opening Balance as of the Migration Date.',
    ],
    [
      'Sick Leave Balance',
      'Yes',
      'Number (days, e.g. 5 or 3.5)',
      '5',
      'Mapped to Sick Leave (SL). Supports half-day decimals (e.g. 4.5).',
    ],
    [
      'Casual Leave Balance',
      'Yes',
      'Number (days, e.g. 4 or -2)',
      '4',
      'Mapped to Casual Leave (CL). Negative values (e.g. -2) are accepted only if "Allow Negative Balances" is enabled in Leave Policy settings.',
    ],
    [],
    ['Important Migration Rules'],
    ['1. Do not rename or remove the 5 required column headers in Row 1 of the "Leave Balances" sheet.'],
    ['2. Mid-Year Migration: Values are imported as Absolute Opening Balances on your chosen Migration Effective Date. Future accruals apply strictly from the migration date forward without double-deducting leaves already taken.'],
    ['3. Negative Balances: If a worker has over-taken leave (e.g. -2), it is queued as a payroll deduction when "Allow Negative Balances" is ON in Settings -> Leave Policy, or flagged as a validation error when OFF.'],
    ['4. Duplicate Phone Numbers: Each Worker Phone Number must appear only once. Duplicate phone numbers block the entire import with row-specific errors.'],
    ['5. Transactional Commit: All matched balances are updated in a single atomic transaction — if a database error or timeout occurs mid-import, zero balances are modified.'],
  ];

  const readMeSheet = XLSX.utils.aoa_to_sheet(readMeData);
  readMeSheet['!cols'] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 28 },
    { wch: 18 },
    { wch: 74 },
  ];

  XLSX.utils.book_append_sheet(wb, readMeSheet, 'Read Me');

  return wb;
}

/**
 * Triggers browser download of Leave_Balance_Template.xlsx.
 */
export function downloadLeaveBalanceTemplate(options?: {
  existingWorkers?: Worker[];
  prefillExistingWorkers?: boolean;
}): string {
  const wb = buildLeaveBalanceImportWorkbook(options);
  XLSX.writeFile(wb, LEAVE_BALANCE_TEMPLATE_FILENAME, { bookType: 'xlsx' });
  return LEAVE_BALANCE_TEMPLATE_FILENAME;
}

// ============================================================================
// BULK ADVANCE / LOAN LEDGER IMPORT TEMPLATE (Loan_Ledger_Template.xlsx)
// ============================================================================

export const LOAN_LEDGER_TEMPLATE_FILENAME = 'Loan_Ledger_Template.xlsx';

export const LOAN_LEDGER_TEMPLATE_HEADERS = [
  'Worker Phone Number',
  'Total Loan Amount',
  'Outstanding Principal',
  'Monthly EMI',
  'Remaining Installments',
] as const;

export interface LoanLedgerTemplateSampleRow {
  'Worker Phone Number': string;
  'Total Loan Amount': number;
  'Outstanding Principal': number;
  'Monthly EMI': number;
  'Remaining Installments': number;
}

const LOAN_LEDGER_DEFAULT_SAMPLES: LoanLedgerTemplateSampleRow[] = [
  {
    'Worker Phone Number': '9876543210',
    'Total Loan Amount': 50000,
    'Outstanding Principal': 30000,
    'Monthly EMI': 5000,
    'Remaining Installments': 6,
  },
  {
    'Worker Phone Number': '9876543211',
    'Total Loan Amount': 24000,
    'Outstanding Principal': 12000,
    'Monthly EMI': 3000,
    'Remaining Installments': 4,
  },
  {
    'Worker Phone Number': '9876543212',
    'Total Loan Amount': 15000,
    'Outstanding Principal': 0,
    'Monthly EMI': 0,
    'Remaining Installments': 0,
  },
];

/**
 * Generates a pre-formatted Loan_Ledger_Template.xlsx workbook containing:
 * 1. "Loan Ledger" sheet with exact required columns:
 *    Worker Phone Number | Total Loan Amount | Outstanding Principal | Monthly EMI | Remaining Installments
 *    When existingWorkers are provided (and prefillExistingWorkers is true), pre-populates active workers'
 *    10-digit phone numbers with zeroed defaults so SMB owners can quickly fill in active loan balances.
 * 2. "Read Me" sheet explaining columns, settled loan (0 outstanding) auto-skip behavior,
 *    EMI-exceeds-salary warning check, and automatic PayrollEngine payslip deduction.
 */
export function buildLoanLedgerImportWorkbook(options?: {
  existingWorkers?: Worker[];
  prefillExistingWorkers?: boolean;
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const activeWorkers = (options?.existingWorkers || []).filter(
    (w) =>
      w.status !== 'RESIGNED' &&
      w.status !== 'TERMINATED' &&
      w.status !== 'INACTIVE' &&
      w.isActive !== false
  );

  const shouldPrefill = options?.prefillExistingWorkers === true && activeWorkers.length > 0;

  const dataRows: Array<Array<string | number>> = shouldPrefill
    ? activeWorkers.map((w) => [
        String(w.phone || '').replace(/\D/g, '').slice(-10),
        0,
        0,
        0,
        0,
      ])
    : LOAN_LEDGER_DEFAULT_SAMPLES.map((row) => [
        row['Worker Phone Number'],
        row['Total Loan Amount'],
        row['Outstanding Principal'],
        row['Monthly EMI'],
        row['Remaining Installments'],
      ]);

  const sheetMatrix: Array<Array<string | number>> = [
    [...LOAN_LEDGER_TEMPLATE_HEADERS],
    ...dataRows,
  ];

  const loanSheet = XLSX.utils.aoa_to_sheet(sheetMatrix);

  loanSheet['!cols'] = [
    { wch: 24 }, // Worker Phone Number
    { wch: 22 }, // Total Loan Amount
    { wch: 24 }, // Outstanding Principal
    { wch: 18 }, // Monthly EMI
    { wch: 24 }, // Remaining Installments
  ];

  loanSheet['!autofilter'] = {
    ref: `A1:E${Math.max(2, sheetMatrix.length)}`,
  };

  // Format phone column strictly as text (@), currency columns as INR #,##0, and installments as integer 0
  for (let rowIdx = 2; rowIdx <= sheetMatrix.length; rowIdx++) {
    const phoneCell = loanSheet[`A${rowIdx}`];
    if (phoneCell) {
      phoneCell.t = 's';
      phoneCell.z = '@';
    }
    for (const colLetter of ['B', 'C', 'D'] as const) {
      const moneyCell = loanSheet[`${colLetter}${rowIdx}`];
      if (moneyCell) {
        moneyCell.t = 'n';
        moneyCell.z = '#,##0';
      }
    }
    const instCell = loanSheet[`E${rowIdx}`];
    if (instCell) {
      instCell.t = 'n';
      instCell.z = '0';
    }
  }

  XLSX.utils.book_append_sheet(wb, loanSheet, 'Loan Ledger');

  // --- SHEET 2: Read Me ---
  const readMeData: Array<Array<string>> = [
    ['Bulk Advance / Loan Ledger Import — Instructions & Payroll Recovery Guide'],
    [
      'Upload workers\' outstanding loans and salary advances from your previous payroll register so WorkforcePro automatically deducts the monthly EMI on upcoming payslips.',
    ],
    [],
    ['Column Name', 'Required?', 'Accepted Format', 'Example', 'Notes'],
    [
      'Worker Phone Number',
      'Yes',
      '10-digit Mobile Number',
      '9876543210',
      'Matched against existing workers in your directory. Keep formatted as text (no spaces/symbols needed).',
    ],
    [
      'Total Loan Amount',
      'Yes',
      'Amount in ₹ (Number)',
      '50000',
      'Original principal amount disbursed to the worker (used for audit & payslip reference).',
    ],
    [
      'Outstanding Principal',
      'Yes',
      'Amount in ₹ (Number >= 0)',
      '30000',
      'Remaining unpaid balance. If Outstanding Principal is 0 (settled in old system), WorkforcePro automatically skips creating an ActiveLoan record.',
    ],
    [
      'Monthly EMI',
      'Yes',
      'Amount in ₹ (Number)',
      '5000',
      'Fixed monthly recovery amount deducted automatically as "Loan Recovery" on the worker\'s payslip. Capped at remaining principal on final installment.',
    ],
    [
      'Remaining Installments',
      'Yes',
      'Whole Number (Months)',
      '6',
      'Number of monthly payroll cycles remaining for full loan recovery (0 allowed if Outstanding Principal is 0).',
    ],
    [],
    ['Important Validation & Payroll Rules'],
    [
      '1. Do not rename or remove the 5 required column headers in Row 1 of the "Loan Ledger" sheet.',
    ],
    [
      '2. Settled Loans (Outstanding Principal = 0): Rows with ₹0 outstanding balance are automatically skipped during import — no ActiveLoan record will be created.',
    ],
    [
      '3. EMI Exceeds Salary Guard: If a worker\'s Monthly EMI exceeds their estimated monthly net salary, WorkforcePro flags a warning ("EMI exceeds estimated salary for Worker X. Please adjust.") and lets you adjust the EMI directly in the preview table before committing.',
    ],
    [
      '4. Automatic Payslip Deduction: Once imported, PayrollEngine automatically checks ActiveLoan records for each worker and adds a "Loan Recovery" deduction line on their monthly payslip.',
    ],
    [
      '5. Transactional Import: All ActiveLoan records in a batch are written atomically — if a database timeout or error occurs mid-import, zero loan records are created.',
    ],
  ];

  const readMeSheet = XLSX.utils.aoa_to_sheet(readMeData);
  readMeSheet['!cols'] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 26 },
    { wch: 16 },
    { wch: 78 },
  ];

  XLSX.utils.book_append_sheet(wb, readMeSheet, 'Read Me');

  return wb;
}

/**
 * Triggers browser download of Loan_Ledger_Template.xlsx.
 */
export function downloadLoanLedgerTemplate(options?: {
  existingWorkers?: Worker[];
  prefillExistingWorkers?: boolean;
}): string {
  const wb = buildLoanLedgerImportWorkbook(options);
  XLSX.writeFile(wb, LOAN_LEDGER_TEMPLATE_FILENAME, { bookType: 'xlsx' });
  return LOAN_LEDGER_TEMPLATE_FILENAME;
}

// ============================================================================
// SHIFT RULE IMPORT TEMPLATE (Shift_Rules_Template.xlsx)
// ============================================================================

export const SHIFT_RULES_TEMPLATE_FILENAME = 'Shift_Rules_Template.xlsx';

export const SHIFT_RULES_TEMPLATE_HEADERS = [
  'Shift Name',
  'Start Time',
  'End Time',
  'Grace Period (Mins)',
  'Half-Day Hours',
] as const;

export interface ShiftRuleTemplateSampleRow {
  'Shift Name': string;
  'Start Time': string;
  'End Time': string;
  'Grace Period (Mins)': number;
  'Half-Day Hours': number;
}

const SHIFT_RULES_DEFAULT_SAMPLES: ShiftRuleTemplateSampleRow[] = [
  {
    'Shift Name': 'Morning Shift',
    'Start Time': '06:00',
    'End Time': '14:00',
    'Grace Period (Mins)': 15,
    'Half-Day Hours': 4,
  },
  {
    'Shift Name': 'Afternoon Shift',
    'Start Time': '14:00',
    'End Time': '22:00',
    'Grace Period (Mins)': 15,
    'Half-Day Hours': 4,
  },
  {
    'Shift Name': 'Night Shift',
    'Start Time': '22:00',
    'End Time': '06:00',
    'Grace Period (Mins)': 15,
    'Half-Day Hours': 4,
  },
];

/**
 * Generates a pre-formatted Shift_Rules_Template.xlsx workbook containing:
 * 1. "Shift Rules" sheet with exact columns:
 *    Shift Name | Start Time | End Time | Grace Period (Mins) | Half-Day Hours
 *    Start Time and End Time are explicitly formatted as Text (@) in 24-hour HH:MM format.
 * 2. "Read Me" sheet explaining 24-hour HH:MM validation, overnight shifts, overlapping shifts,
 *    and why state statutory slabs (PT/LWF/PF/ESI) are locked via the in-app dropdown instead of Excel.
 */
export function buildShiftRulesImportWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const sheetMatrix: Array<Array<string | number>> = [
    [...SHIFT_RULES_TEMPLATE_HEADERS],
    ...SHIFT_RULES_DEFAULT_SAMPLES.map((row) => [
      row['Shift Name'],
      row['Start Time'],
      row['End Time'],
      row['Grace Period (Mins)'],
      row['Half-Day Hours'],
    ]),
  ];

  const shiftSheet = XLSX.utils.aoa_to_sheet(sheetMatrix);

  shiftSheet['!cols'] = [
    { wch: 26 }, // Shift Name
    { wch: 16 }, // Start Time
    { wch: 16 }, // End Time
    { wch: 22 }, // Grace Period (Mins)
    { wch: 18 }, // Half-Day Hours
  ];

  shiftSheet['!autofilter'] = {
    ref: `A1:E${Math.max(2, sheetMatrix.length)}`,
  };

  for (let rowIdx = 2; rowIdx <= sheetMatrix.length; rowIdx++) {
    for (const timeCol of ['B', 'C'] as const) {
      const cell = shiftSheet[`${timeCol}${rowIdx}`];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
      }
    }
    const graceCell = shiftSheet[`D${rowIdx}`];
    if (graceCell) {
      graceCell.t = 'n';
      graceCell.z = '0';
    }
    const halfDayCell = shiftSheet[`E${rowIdx}`];
    if (halfDayCell) {
      halfDayCell.t = 'n';
      halfDayCell.z = '0.##';
    }
  }

  XLSX.utils.book_append_sheet(wb, shiftSheet, 'Shift Rules');

  // --- SHEET 2: Read Me ---
  const readMeData: Array<Array<string>> = [
    ['Shift Rules Import Template — Formatting & Compliance Guide'],
    [
      'Upload your factory shift timings using this template, then select your Primary State in WorkforcePro to auto-apply and lock state PT slabs, LWF dates, and Central PF/ESI rules.',
    ],
    [],
    ['Column Name', 'Required?', 'Accepted Format', 'Example', 'Notes'],
    [
      'Shift Name',
      'Yes',
      'Text (Unique)',
      'Morning Shift',
      'Clear label for the shift (e.g., Morning Shift, Night Shift, General Shift).',
    ],
    [
      'Start Time',
      'Yes',
      'Strict 24-hour HH:MM',
      '06:00',
      'Must be strict 24-hour HH:MM (00:00 to 23:59). Free-text like "9 to 5" or "6 AM" will fail validation.',
    ],
    [
      'End Time',
      'Yes',
      'Strict 24-hour HH:MM',
      '14:00',
      'Must be strict 24-hour HH:MM. Overnight shifts (e.g., 22:00 to 06:00) are supported automatically.',
    ],
    [
      'Grace Period (Mins)',
      'Yes',
      'Whole Number (0 - 180)',
      '15',
      'Late arrival buffer in minutes before marking late.',
    ],
    [
      'Half-Day Hours',
      'Yes',
      'Number (Hours > 0)',
      '4',
      'Minimum hours worked to qualify for Half-Day pay (must be less than total shift duration).',
    ],
    [],
    ['Important Rules'],
    [
      '1. Strict Time Format: Always enter Start Time and End Time as HH:MM (e.g., 09:00 and 17:00). Typing "9 to 5" fails import with a format error.',
    ],
    [
      '2. Overlapping Shifts: Overlapping shifts (e.g., Shift A and Shift B both starting at 09:00) are allowed, and WorkforcePro will warn you whenever a worker is assigned across overlapping shifts.',
    ],
    [
      '3. No Excel Import for Statutory Slabs: Professional Tax (PT), Labour Welfare Fund (LWF), EPF, and ESIC rules cannot be uploaded via Excel. Select your Primary State from the in-app dropdown to auto-apply and lock verified statutory settings.',
    ],
  ];

  const readMeSheet = XLSX.utils.aoa_to_sheet(readMeData);
  readMeSheet['!cols'] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 24 },
    { wch: 16 },
    { wch: 78 },
  ];

  XLSX.utils.book_append_sheet(wb, readMeSheet, 'Read Me');

  return wb;
}

/**
 * Triggers browser download of Shift_Rules_Template.xlsx.
 */
export function downloadShiftRulesTemplate(): string {
  const wb = buildShiftRulesImportWorkbook();
  XLSX.writeFile(wb, SHIFT_RULES_TEMPLATE_FILENAME, { bookType: 'xlsx' });
  return SHIFT_RULES_TEMPLATE_FILENAME;
}
