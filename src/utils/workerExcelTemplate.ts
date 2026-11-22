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
