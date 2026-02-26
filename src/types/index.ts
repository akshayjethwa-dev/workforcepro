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
  plan: SubscriptionTier;
  trialEndsAt?: string; // ISO string
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
  minOvertimeMins: number;
}

export interface Branch {
  id: string;
  name: string;
  location?: { lat: number; lng: number; radius: number; address?: string };
}

export interface OrgSettings {
  shifts: ShiftConfig[];
  enableBreakTracking: boolean; // Toggle for "Advanced Logic"
  strictLiveness?: boolean;
  baseLocation?: { lat: number; lng: number; radius: number; address?: string }; // Legacy
  branches?: Branch[]; // NEW: Multi-branch support
  departments?: string[]; // NEW: Dynamic departments
  compliance?: {
    pfRegistrationNumber: string;
    esicCode: string;
    capPfDeduction: boolean; // Cap at ₹15,000 basic
    dailyWagePfPercentage: number; // e.g., 50 or 100
  };
}

export interface Punch {
  timestamp: string; // ISO String
  type: 'IN' | 'OUT';
  device: string;
  location?: { lat: number; lng: number };
  isOutOfGeofence?: boolean;
}

// --- WORKER & WAGE CONFIG ---
export interface WageConfig {
  type: 'DAILY' | 'MONTHLY';
  amount: number;
  basicPercentage?: number; // e.g., 50% of monthly amount is Basic+DA
  monthlyBreakdown?: {
    basic: number;
    hra: number;
    others: number;
  };
  overtimeEligible: boolean;
  overtimeRatePerHour?: number;
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
  branchId?: string; // NEW: Assigned Branch
  wageConfig: WageConfig;
  photoUrl?: string;
  faceDescriptor?: number[];
  status: 'ACTIVE' | 'INACTIVE';
  uan?: string;
  esicIp?: string;
  pan?: string;
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
  shiftId: string; 
  
  timeline: Punch[]; 
  
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';
  lateStatus: {
    isLate: boolean;
    lateByMins: number;
    penaltyApplied: boolean;
  };
  hours: {
    gross: number;
    net: number; 
    overtime: number;
  };

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
  carriedForwardAdvance?: number;
  status: 'DRAFT' | 'LOCKED' | 'PAID';
}

export interface Advance {
  id: string;
  tenantId: string;
  workerId: string;
  amount: number;
  date: string;
  reason: string;
  status: 'APPROVED' | 'PENDING' | 'REPAID';
}

export interface AppNotification {
  id: string;
  tenantId: string;
  title: string;
  message: string;
  imageUrl?: string;
  type: 'INFO' | 'WARNING' | 'ALERT';
  createdAt: string;
  read: boolean;
}

export type SubscriptionTier = 'TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  maxWorkers: number;
  maxManagers: number;
  maxShifts: number;
  kioskEnabled: boolean;
  geofencingEnabled: boolean;
  multiBranchEnabled: boolean;
}

export const PLAN_CONFIG: Record<SubscriptionTier, PlanLimits> = {
  TRIAL: { maxWorkers: 100, maxManagers: 5, maxShifts: 5, kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: true },
  STARTER: { maxWorkers: 25, maxManagers: 1, maxShifts: 1, kioskEnabled: false, geofencingEnabled: false, multiBranchEnabled: false },
  PRO: { maxWorkers: 100, maxManagers: 5, maxShifts: 5, kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: false },
  ENTERPRISE: { maxWorkers: 250, maxManagers: 9999, maxShifts: 9999, kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: true }
};

export type ScreenName = 'LOGIN' | 'DASHBOARD' | 'WORKERS' | 'ADD_WORKER' | 'ATTENDANCE_KIOSK' | 'PAYROLL' | 'ATTENDANCE' | 'DAILY_LOGS' | 'TEAM' | 'SETTINGS' | 'WORKER_HISTORY' | 'SUPER_ADMIN_DASHBOARD' | 'REPORTS' | 'BILLING' ;