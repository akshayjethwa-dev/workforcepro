export type Role = 
  | 'SUPER_ADMIN'   // You (SaaS Owner)
  | 'FACTORY_OWNER' // Tenant Admin
  | 'SUPERVISOR'    // Manager (Changed from MANAGER to match your DB logic)
  | 'WORKER';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  tenantId: string;
  companyName?: string;
}

// NEW: Stores factory settings
export interface TenantProfile {
  id: string;
  name: string;
  ownerId: string;
  shifts: ShiftConfig[]; // Array of configured shifts
}

export interface ShiftConfig {
  id: string;
  name: string;      // e.g. "General Shift"
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
  gracePeriodMins: number; // 15
  maxGraceAllowed: number; // 3 (times per month)
  breakDurationMins: number; // 60 (deducted if they don't punch out, optional)
  minHalfDayHours: number; // 4 (if worked less than this, mark absent/half day)
}

export interface OrgSettings {
  shifts: ShiftConfig[];
  enableBreakTracking: boolean; // Toggle for "Advanced Logic"
}

export interface Punch {
  timestamp: string; // ISO String
  type: 'IN' | 'OUT';
  device: string;
}

// --- WORKER & WAGE CONFIG ---
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
  tenantId: string;
  name: string;
  phone: string;
  aadhar?: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  category: 'Daily Wage' | 'Monthly' | 'Contract' | 'Permanent';
  department: string;
  designation: string;
  joinedDate: string;
  shiftId: string;
  wageConfig: WageConfig;
  photoUrl?: string;
  faceDescriptor?: number[];
  status: 'ACTIVE' | 'INACTIVE';
}

// --- ATTENDANCE ---
export interface TimeRecord {
  timestamp: string;
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
  tenantId: string;
  workerId: string;
  workerName: string;
  date: string;
  shiftId: string; // Changed from 'shift object' to just ID for cleaner DB
  
  // The Timeline tracks every movement
  timeline: Punch[]; 
  
  // Computed Status (The "Result")
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';
  lateStatus: {
    isLate: boolean;
    lateByMins: number;
    penaltyApplied: boolean; // True if this caused a Half Day
  };
  hours: {
    gross: number;
    net: number; // Actual worked hours (excluding breaks)
    overtime: number;
  };

  // Legacy fields (kept for compatibility, but you should migrate to timeline/hours)
  inTime?: TimeRecord;
  outTime?: TimeRecord;
  calculatedHours?: AttendanceCalculations;
}

// --- PAYROLL & WAGE RECORDS ---

export interface DailyWageRecord {
  id: string;
  tenantId: string;
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
    rateUsed: number;
    hoursWorked: number;
    overtimeHours: number;
    isOvertimeLimitExceeded: boolean;
  };
}

export interface MonthlyPayroll {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  workerDesignation: string;
  workerDepartment: string;
  month: string;
  attendanceSummary: {
    totalDays: number;
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

export interface Advance {
  id: string;
  workerId: string;
  amount: number;
  date: string;
  reason: string;
  status: 'APPROVED' | 'PENDING' | 'REPAID';
}

// --- NAVIGATION ---
export type ScreenName = 'LOGIN' | 'DASHBOARD' | 'WORKERS' | 'ADD_WORKER' | 'ATTENDANCE_KIOSK' | 'PAYROLL' | 'ATTENDANCE' | 'DAILY_LOGS' | 'TEAM' | 'SETTINGS' | 'WORKER_HISTORY' | 'SUPER_ADMIN_DASHBOARD' ;