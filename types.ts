export type Role = 'ADMIN' | 'SUPERVISOR';

export interface Shift {
  id: string;
  name: string;
  startTime: string; // "09:00"
  endTime: string; // "18:00"
}

export interface WageConfig {
  type: 'DAILY' | 'MONTHLY';
  amount: number;
  overtimeEligible: boolean;
  workingDaysPerMonth?: number;
  allowances: {
    travel: number;
    food: number;
    nightShift: number;
  };
}

export interface Worker {
  id: string;
  name: string;
  phone: string;
  aadhar?: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  
  // Employment
  category: 'Daily Wage' | 'Monthly' | 'Contract' | 'Permanent';
  department: 'Production' | 'Packaging' | 'Quality' | 'Loading' | 'Maintenance';
  designation: string;
  joinedDate: string;
  shiftId: string; // Link to Shift
  
  // Wage
  wageConfig: WageConfig;
  
  // Face Data
  photoUrl?: string;
  faceTemplates: string[]; // Encrypted vector strings
  
  status: 'ACTIVE' | 'INACTIVE';
}

export interface TimeRecord {
  timestamp: string; // ISO String
  geoLocation: { lat: number; lng: number };
  facePhotoUrl?: string;
  deviceInfo: string;
  markedBy: 'self' | 'supervisor';
}

export interface AttendanceCalculations {
  grossHours: number;
  breakDeduction: number;
  netWorkingHours: number;
  regularHours: number;
  overtimeHours: number;
  isLate: boolean;
  lateByMinutes: number;
}

export interface AttendanceRecord {
  id: string;
  attendanceId: string;
  workerId: string;
  workerName: string; // Denormalized for easier display
  companyId: string;
  date: string; // YYYY-MM-DD
  
  shift: {
    shiftId: string;
    expectedInTime: string;
    expectedOutTime: string;
  };
  
  inTime: TimeRecord;
  outTime?: TimeRecord;
  
  calculatedHours?: AttendanceCalculations;
  
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';
}

export interface Advance {
  id: string;
  workerId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  reason: string;
  status: 'APPROVED' | 'PENDING' | 'REPAID';
}

// --- NEW WAGE TYPES ---

export interface DailyWageRecord {
  id: string;
  workerId: string;
  date: string;
  attendanceId: string;
  
  breakdown: {
    baseWage: number;
    overtimeWage: number;
    allowances: number;
    total: number;
  };
  
  meta: {
    rateUsed: number; // Daily rate used for calc
    hoursWorked: number;
    overtimeHours: number;
    isOvertimeLimitExceeded: boolean;
  };
}

export interface MonthlyPayroll {
  id: string;
  workerId: string;
  workerName: string;
  workerDesignation: string;
  workerDepartment: string;
  month: string; // YYYY-MM
  
  attendanceSummary: {
    totalDays: number; // usually 26 or calendar days
    presentDays: number;
    absentDays: number;
    halfDays: number;
    totalRegularHours: number;
    totalOvertimeHours: number;
  };
  
  earnings: {
    basic: number;
    overtime: number;
    allowances: {
      travel: number;
      food: number;
      other: number;
    };
    gross: number;
  };
  
  deductions: {
    advances: number;
    processingFee: number;
    canteen: number;
    total: number;
    details: { description: string; amount: number }[];
  };
  
  netPayable: number;
  status: 'DRAFT' | 'LOCKED' | 'PAID';
}

export interface ComplianceReport {
  compliant: boolean;
  violations: string[];
  recommendation?: string;
}

export interface User {
  id: string;
  phone: string;
  role: Role;
  name: string;
}

export type ScreenName = 'LOGIN' | 'DASHBOARD' | 'WORKERS' | 'ADD_WORKER' | 'ATTENDANCE_KIOSK' | 'PAYROLL' | 'ATTENDANCE' | 'DAILY_LOGS';
