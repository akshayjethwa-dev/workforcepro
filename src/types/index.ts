export type SyncStatus = 'PENDING_LOCAL' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export interface OfflineQueueItem {
  id?: number;
  entityType: 'ATTENDANCE' | 'ADVANCE' | 'TASK';
  recordId: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  payload: any;
  syncStatus: SyncStatus;
  createdAt: string;
  offlineTimestamp: string;
  attempts: number;
  lastError?: string;
  conflictDetails?: {
    serverTimestamp?: string;
    serverType?: string;
    message?: string;
  };
}

export interface StorageHealth {
  isPersistent: boolean;
  persistedChecked: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isLowStorage: boolean;
  warning?: string;
}

// src/types/index.ts

export const INDIAN_STATES = [
  'Maharashtra', 'Karnataka', 'Gujarat', 'Tamil Nadu', 'Andhra Pradesh', 
  'Telangana', 'West Bengal', 'Kerala', 'Madhya Pradesh', 'Odisha', 
  'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Jharkhand', 'Meghalaya', 
  'Manipur', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura', 'Delhi', 
  'Haryana', 'Uttar Pradesh', 'Rajasthan', 'Punjab', 'Himachal Pradesh', 
  'Uttarakhand', 'Chandigarh', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 
  'Andaman & Nicobar', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep'
] as const;

export type IndianStateName = typeof INDIAN_STATES[number];

export type Role = 
  | 'SUPER_ADMIN'   // SaaS Owner
  | 'RESELLER'      // NEW: Channel Partner / Agency
  | 'FACTORY_OWNER' // Tenant Admin
  | 'SUPERVISOR'    // Manager (Changed from MANAGER to match your DB logic)
  | 'WORKER';

export type SaturdayOffType = 'NONE' | 'ALL' | 'ALTERNATE' | 'FIRST_THIRD' | 'SECOND_FOURTH';

export interface WeeklyOffConfig {
  defaultDays: number[]; // e.g., [0] for Sunday, [0, 6] for Sat/Sun
  saturdayRule: SaturdayOffType;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  isPaid: boolean;
}

export interface LeavePolicy {
  cl: number; // Casual Leaves
  sl: number; // Sick Leaves
  pl: number; // Privilege/Earned Leaves
  allowNegativeBalance: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  tenantId: string;
  companyName?: string;
  resellerId?: string;
  commissionRate?: number;
}

export type DomainVerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

export interface CustomDomainConfig {
  domain: string;
  status: DomainVerificationStatus;
  verificationToken: string;
  cnameTarget: string;
  verifiedAt?: string;
  lastCheckedAt?: string;
  errorMessage?: string;
  dnsRecords?: {
    cnameHost: string;
    cnameValue: string;
    txtHost: string;
    txtValue: string;
  };
}

export interface EmailTemplateConfig {
  senderName: string;
  replyTo: string;
  headerText: string;
  footerText: string;
  signature: string;
  bannerLogoUrl?: string;
}

export interface BrandingConfig {
  appName: string;
  logoUrl: string;             // Base64 string or image URL
  faviconUrl?: string;         // Base64 favicon or URL
  primaryColor: string;        // Hex color code (e.g. #2563eb)
  backgroundColor?: string;    // App shell background hex
  linkColor?: string;          // Accent link hex
  textColor?: string;          // Main typography hex
  customDomain?: CustomDomainConfig;
  emailTemplates?: EmailTemplateConfig;
  updatedAt?: string;
}

export * from './featureFlags';
export * from './scheduleValidation';
export * from './planCatalog';

export interface TenantProfile {
  id: string;
  name: string;
  ownerId: string;
  shifts: ShiftConfig[]; 
  plan: SubscriptionTier;
  trialEndsAt?: string; 
  overrides?: Partial<PlanLimits>; 
  featureOverrides?: Partial<Record<import('./featureFlags').FeatureFlagKey, boolean>>;
  pendingDowngrade?: import('./featureFlags').PendingDowngrade;
  branding?: BrandingConfig; // NEW
  resellerId?: string;
  billingCycleEndsAt?: string;
}

export interface ShiftConfig {
  id: string;
  name: string;      
  startTime: string; 
  endTime: string;   
  gracePeriodMins: number; 
  maxGraceAllowed: number; 
  breakDurationMins: number; 
  minHalfDayHours: number; 
  minOvertimeMins: number;
}

export interface Branch {
  id: string;
  name: string;
  location?: { lat: number; lng: number; radius: number; address?: string };
  autoPunchEnabled?: boolean;
  dwellTimeMinutes?: number; // default 2 minutes
  enterRadius?: number; // meters (e.g. 100m)
  exitRadius?: number; // meters (e.g. 115m hysteresis buffer)
}

export interface EwaConfig {
  enabled: boolean;
  maxWithdrawalPercentage: number; // default 50%
  coolingPeriodDays?: number; // e.g. 1-3 days between requests
  payrollLockWindowDays?: number; // e.g. days 27-31 of month
  payrollResumeDate?: string; // e.g. "1st of next month"
  isPayrollLocked?: boolean;
  provider?: {
    isExternal: boolean;
    providerName: string; // e.g. "KarmaLife / Northern Arc"
    lenderPartnerName?: string; // e.g. "Northern Arc Capital (RBI Registered NBFC)"
    feeType: 'FLAT' | 'PERCENTAGE';
    feeValue: number; // e.g. 19 for ₹19 or 1.5 for 1.5%
    disclosureNote?: string;
  };
}

export interface OrgSettings {
  shifts: ShiftConfig[];
  enableBreakTracking: boolean; 
  strictLiveness?: boolean;
  baseLocation?: { lat: number; lng: number; radius: number; address?: string }; 
  branches?: Branch[]; 
  departments?: string[]; 
  compliance?: {
    pfRegistrationNumber?: string;
    esicCode?: string;
    capPfDeduction?: boolean; 
    dailyWagePfPercentage?: number; 
    pfContributionRate?: number; 
    epsContributionRate?: number; 
    epfWageCeiling?: number; 
    esiEnabled?: boolean;
    esiWageCeiling?: number;
  };
  weeklyOffs?: WeeklyOffConfig;
  holidays?: Holiday[];
  enableSandwichRule?: boolean;
  holidayPayMultiplier?: number; 
  leavePolicy?: LeavePolicy;
  ewaConfig?: EwaConfig;
  geofencePolicy?: 'WARN' | 'BLOCK'; // 'warn only' vs 'block' config
  maxGpsAccuracyMeters?: number; // default 50m
  allowLowAccuracy?: boolean; // allow low accuracy punch with flag
  autoPunchEnabled?: boolean;
  breadcrumbsEnabled?: boolean;
  whatsappConfig?: WhatsAppBridgeConfig;
}

export interface Punch {
  timestamp: string; 
  type: 'IN' | 'OUT';
  device: string;
  location?: { lat: number; lng: number };
  isOutOfGeofence?: boolean;
  syncStatus?: SyncStatus;
  offlineTimestamp?: string;
  punchId?: string; // Idempotent client-generated ID
  accuracy?: number; // GPS accuracy in meters
  accuracyLow?: boolean;
  mockLocationFlag?: boolean;
  rootedJailbrokenFlag?: boolean;
  batteryLevel?: number;
  batteryCharging?: boolean;
  selfieUrl?: string;
  livenessVerified?: boolean;
  selfieVerificationStatus?: 'VERIFIED' | 'VERIFICATION_PENDING' | 'FAILED';
  siteName?: string;
  deviceTimestamp?: string;
  serverTimestamp?: string;
  deviceBindingId?: string;
  geofenceViolation?: boolean;
  // Geofence Auto-Punch & WhatsApp Channel Extensions
  method?: 'MANUAL_SELFIE' | 'AUTO_PUNCH' | 'SUPERVISOR' | 'KIOSK' | 'WHATSAPP';
  channel?: 'APP' | 'WHATSAPP' | 'KIOSK' | 'AUTO_PUNCH';
  isAutoPunch?: boolean;
  isProvisional?: boolean;
  undoExpiresAt?: string;
  trustScore?: number;
}

export interface WageConfig {
  type: 'DAILY' | 'MONTHLY';
  amount: number;
  basicPercentage?: number; 
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
  gender: 'Male' | 'Female' | 'Other' | 'MALE' | 'FEMALE'; 
  category: 'Daily Wage' | 'Monthly' | 'Contract' | 'Permanent';
  department: string;
  designation: string;
  joinedDate: string;
  shiftId: string;
  branchId?: string; 
  wageConfig: WageConfig;
  photoUrl?: string;
  faceDescriptor?: number[];
  status: 'ACTIVE' | 'INACTIVE';
  uan?: string; 
  esicIp?: string; 
  pan?: string; 
  fatherName?: string; 
  dateOfBirth?: string; 
  dateOfJoining?: string; 
  dateOfExit?: string; 
  weeklyOffOverride?: number[];
  leaveBalances?: {
    cl: number;
    sl: number;
    pl: number;
  };
  wageType?: 'DAILY' | 'HOURLY' | 'MONTHLY';
  dailyWage?: number;
  hourlyWage?: number;
  monthlySalary?: number;
  overtimeRate?: number;
  isActive?: boolean;
  faceEnrolled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // India Statutory Compliance Extensions
  state?: string;
  stateEffectiveDate?: string;
  previousState?: string;
  taxRegime?: 'NEW' | 'OLD';
  taxDeclarationLocked?: boolean;
  taxDeclarations?: EmployeeTaxDeclaration;
  pfOptOut?: boolean;
  esiOptOut?: boolean;
  salaryRevisionDate?: string;
  previousWageAmount?: number;
  // Shared-Device Quick Switch (PIN/QR)
  kioskPin?: string; // 4-6 digit quick switch PIN unique per tenant
  pinLockedUntil?: string; // ISO date string if in cooldown
  pinFailedAttempts?: number;
}

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
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'WEEKLY_OFF' | 'PUBLIC_HOLIDAY' | 'HOLIDAY_WORKED' | 'UNPAID_HOLIDAY';
  lateStatus: {
    isLate: boolean;
    lateByMins: number;
    penaltyApplied: boolean;
  };
  hours: {
    gross: number;
    net: number; 
    overtime: number;
    regular?: number;
    breakTime?: number;
  };
  leaveInfo?: {
    type: 'CL' | 'SL' | 'PL' | 'LWP';
    isPaid: boolean;
    reason: string;
  };
  inTime?: TimeRecord;
  outTime?: TimeRecord;
  checkIn?: string;
  checkOut?: string;
  punches?: Punch[];
  confidence?: number;
  calculatedHours?: AttendanceCalculations;
  syncStatus?: SyncStatus;
  offlineTimestamp?: string;
  channel?: 'APP' | 'WHATSAPP' | 'KIOSK' | 'AUTO_PUNCH';
  auditTrail?: AttendanceAuditTrailEntry[];
}

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

export interface EmployeeTaxDeclaration {
  regime: 'NEW' | 'OLD';
  regimeLocked?: boolean;
  regimeLockedDate?: string;
  section80C?: number; // PPF, ELSS, LIC, Tuition (max 1.5L)
  section80D?: number; // Health Insurance (self/parents, max 25k/50k)
  hraExemption?: number; // Rent paid minus 10% basic
  otherExemptions?: number; // NPS 80CCD, Home loan interest 24b
  effectiveFinancialYear?: string; // e.g. "2025-26"
  notes?: string;
}

export interface StatutoryCalculationTrace {
  pfRuleApplied: string;
  pfCalculation: string;
  esiRuleApplied: string;
  esiCalculation: string;
  ptRuleApplied: string;
  ptCalculation: string;
  tdsRuleApplied: string;
  tdsCalculation: string;
  employerLiabilitySummary: string;
  sourceValues: {
    basic: number;
    gross: number;
    overtime: number;
    allowances: number;
    pfQualifyingWages: number;
    esiQualifyingWages: number;
    state: string;
    gender: string;
    taxRegime: 'NEW' | 'OLD';
    annualProjectedGross: number;
    totalExemptions: number;
    taxableIncome: number;
  };
}

export interface StatutoryBreakdown {
  // Employee Deductions (Subtracted from Net Pay)
  employeePf: number;
  employeeEsi: number;
  professionalTax: number;
  tds: number;
  totalEmployeeStatutory: number;

  // Employer Contributions (Company Liability / CTC addition)
  employerEpf: number;
  employerEps: number;
  employerEdli: number;
  employerAdminCharges: number;
  totalEmployerPf: number;
  employerEsi: number;
  totalEmployerStatutory: number;

  // Wage Bases & Attributes
  pfWageBase: number;
  esiWageBase: number;
  ptGrossBase: number;
  annualTaxableIncome: number;
  taxRegime: 'NEW' | 'OLD';
  state: string;

  // Audit Flags & Notes
  esiDroppedNote?: string;
  isPfCapped: boolean;
  isEsiApplicable: boolean;
  calculationTrace: StatutoryCalculationTrace;
}

export interface Form16Data {
  assessmentYear: string;
  financialYear: string;
  employerName: string;
  employerTan?: string;
  employerPan?: string;
  employeeName: string;
  employeePan?: string;
  employeeDesignation: string;
  periodFrom: string;
  periodTo: string;
  grossSalary: number;
  standardDeduction: number;
  section80C: number;
  section80D: number;
  otherExemptions: number;
  totalDeductions: number;
  taxableIncome: number;
  taxOnTotalIncome: number;
  rebate87A: number;
  surcharge: number;
  healthAndEduCess: number;
  totalTaxPayable: number;
  taxDeductedAtSource: number;
  regime: 'NEW' | 'OLD';
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
    weeklyOffs: number;
    publicHolidays: number;
    holidayWorkedDays: number;
    payableDays: number;
    totalRegularHours: number;
    totalOvertimeHours: number;
    paidLeaves: number;
    unpaidLeaves: number;
    notJoinedDays?: number;
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
  statutory?: StatutoryBreakdown;
  employerCostToCompany?: number;
  netPayable: number;
  carriedForwardAdvance?: number;
  status: 'DRAFT' | 'LOCKED' | 'PAID';
}

export type EwaTimelineStage = 'REQUESTED' | 'APPROVED' | 'DISBURSED' | 'ADJUSTED_IN_PAYSLIP' | 'REJECTED';

export interface EwaDetails {
  grossEarnedAccrued: number;
  statutoryDeductionsEstimate: number;
  existingAdvancesDeduction: number;
  netAccruedBalance: number;
  maxAllowedAmount: number;
  requestedAmount: number;
  feeAmount: number;
  netDisbursalAmount: number;
  providerName?: string;
  lenderPartnerName?: string;
  salaryRevisionDate?: string;
  preRevisionRate?: number;
  currentRate?: number;
  preRevisionDays?: number;
  postRevisionDays?: number;
  timelineStage: EwaTimelineStage;
  timelineHistory: {
    stage: EwaTimelineStage;
    timestamp: string;
    actor: string;
    notes?: string;
  }[];
  isFnFSettlement?: boolean;
  fnfExitDate?: string;
  payrollMonth?: string;
  payrollAdjustedDate?: string;
}

export interface Advance {
  id: string;
  tenantId: string;
  workerId: string;
  workerName?: string;
  amount: number;
  date: string;
  reason: string;
  status?: 'APPROVED' | 'PENDING' | 'REPAID' | 'REJECTED';
  repaid?: boolean;
  isEwa?: boolean;
  ewaDetails?: EwaDetails;
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

export type SubscriptionTier = 'FREE' | 'TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  maxWorkers: number;
  maxManagers: number;
  maxShifts: number;
  kioskEnabled: boolean;
  geofencingEnabled: boolean;
  multiBranchEnabled: boolean;
  livenessDetectionEnabled: boolean; 
  advancedLeavesEnabled: boolean; 
  allowancesAndDeductionsEnabled: boolean; 
  statutoryComplianceEnabled: boolean; 
  bulkImportEnabled: boolean;
  idCardEnabled: boolean; // NEW
  payslipEnabled: boolean; // NEW
  regulatePunchEnabled: boolean; // NEW
  publicHolidaysEnabled: boolean;
}

export interface KioskTerminal {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  pairingCode: string;
  adminPin: string;
  status?: 'active' | 'pending' | 'inactive';
  createdAt: string;
}

export const DEFAULT_PLAN_CONFIG: Record<SubscriptionTier, PlanLimits> = {
  FREE: { 
    maxWorkers: 15, maxManagers: 0, maxShifts: 1, // Max managers 0 for Free
    kioskEnabled: false, geofencingEnabled: false, multiBranchEnabled: false,
    livenessDetectionEnabled: false, advancedLeavesEnabled: false, allowancesAndDeductionsEnabled: false, statutoryComplianceEnabled: false, bulkImportEnabled: false,
    idCardEnabled: false, payslipEnabled: false, regulatePunchEnabled: false, publicHolidaysEnabled: false
  },
  TRIAL: { 
    maxWorkers: 9999, maxManagers: 9999, maxShifts: 9999, 
    kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: true,
    livenessDetectionEnabled: true, advancedLeavesEnabled: true, allowancesAndDeductionsEnabled: true, statutoryComplianceEnabled: true, bulkImportEnabled: true,
    idCardEnabled: true, payslipEnabled: true, regulatePunchEnabled: true, publicHolidaysEnabled: true,
  },
  STARTER: { 
    maxWorkers: 50, maxManagers: 3, maxShifts: 3, 
    kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: false,
    livenessDetectionEnabled: false, advancedLeavesEnabled: false, allowancesAndDeductionsEnabled: true, statutoryComplianceEnabled: false, bulkImportEnabled: false,
    idCardEnabled: true, payslipEnabled: true, regulatePunchEnabled: true, publicHolidaysEnabled: true,
  },
  PRO: { 
    maxWorkers: 200, maxManagers: 10, maxShifts: 10, 
    kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: true,
    livenessDetectionEnabled: true, advancedLeavesEnabled: true, allowancesAndDeductionsEnabled: true, statutoryComplianceEnabled: false, bulkImportEnabled: false,
    idCardEnabled: true, payslipEnabled: true, regulatePunchEnabled: true, publicHolidaysEnabled: true,
  },
  ENTERPRISE: { 
    maxWorkers: 9999, maxManagers: 9999, maxShifts: 9999, 
    kioskEnabled: true, geofencingEnabled: true, multiBranchEnabled: true,
    livenessDetectionEnabled: true, advancedLeavesEnabled: true, allowancesAndDeductionsEnabled: true, statutoryComplianceEnabled: true, bulkImportEnabled: true,
    idCardEnabled: true, payslipEnabled: true, regulatePunchEnabled: true, publicHolidaysEnabled: true,
  }
};

export type ScreenName = 'LOGIN' | 'DASHBOARD' | 'WORKERS' | 'ADD_WORKER' | 'ATTENDANCE_KIOSK' | 'PAYROLL' | 'ATTENDANCE' | 'DAILY_LOGS' | 'TEAM' | 'SETTINGS' | 'WORKER_HISTORY' | 'SUPER_ADMIN_DASHBOARD' | 'REPORTS' | 'BILLING' | 'ID_CARDS' | 'TERMS' | 'PRIVACY' | 'RESELLER_DASHBOARD' | 'INBOX' | 'ROSTER';

export interface PunchConflict {
  id: string;
  recordId: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  payPeriod: string; // 'YYYY-MM'
  conflictReason: string;
  offlineData: {
    punchType: 'IN' | 'OUT';
    deviceTimestamp: string;
    deviceId: string;
    location?: { lat: number; lng: number };
    notes?: string;
  };
  serverData: {
    punchType: 'IN' | 'OUT';
    serverTimestamp: string;
    deviceId: string;
    location?: { lat: number; lng: number };
    notes?: string;
  };
  clockSkewMs: number;
  status: 'UNRESOLVED' | 'RESOLVED';
  resolution?: {
    strategy: 'KEEP_OFFLINE' | 'KEEP_SERVER' | 'MANUAL_MERGE' | 'FIELD_LEVEL_MERGE';
    resolvedBy: string;
    resolvedAt: string;
    finalTimestamp: string;
    finalPunchType: 'IN' | 'OUT';
    finalNotes?: string;
  };
  createdAt: string;
}

export interface ConflictAuditEntry {
  id: string;
  tenantId: string;
  entityType: 'ATTENDANCE' | 'WORKER_FIELD' | 'PREFERENCE';
  entityId: string;
  workerName?: string;
  field: string;
  strategy: 'LAST_WRITE_WINS' | 'KEEP_OFFLINE' | 'KEEP_SERVER' | 'MANUAL_MERGE' | 'FIELD_LEVEL_MERGE';
  winningValue: any;
  discardedValue: any;
  serverTimestamp: string;
  deviceTimestamp?: string;
  deviceId?: string;
  resolvedBy: string;
  resolvedAt: string;
  notes?: string;
}

export type InboxActionType = 
  | 'ADVANCE_APPROVAL' 
  | 'ATTENDANCE_EXCEPTION' 
  | 'PAYROLL_SIGNOFF' 
  | 'LEAVE_REQUEST' 
  | 'CONFLICT_RESOLUTION';

export type InboxUrgency = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

export type InboxStatus = 'PENDING' | 'WAITING_SYNC' | 'APPROVED' | 'REJECTED' | 'RESOLVED';

export interface InboxItem {
  id: string;
  tenantId: string;
  branchId?: string;
  assignedToRole?: Role;
  assignedToUserId?: string;
  delegateUserId?: string;
  actionType: InboxActionType;
  urgency: InboxUrgency;
  status: InboxStatus;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  workerDesignation?: string;
  workerPhotoUrl?: string;
  title: string;
  description: string;
  timestamp: string;
  amount?: number;
  isLowRisk?: boolean;
  isWaitingSync?: boolean;
  details: {
    punch?: Punch;
    attendanceRecord?: AttendanceRecord;
    advance?: Advance;
    conflict?: PunchConflict;
    payrollMonth?: string;
    geofenceViolation?: boolean;
    distanceMeters?: number;
    baseLocation?: { lat: number; lng: number; radius: number; address?: string };
    punchLocation?: { lat: number; lng: number };
    punchHistory?: Punch[];
    shiftName?: string;
    shiftStartTime?: string;
    lateMinutes?: number;
    reason?: string;
    leaveType?: string;
    isEwa?: boolean;
    ewaDetails?: EwaDetails;
    accruedBalance?: number;
    payrollImpact?: {
      currentNetAccrual: number;
      withdrawalAmount: number;
      remainingAccrual: number;
      estimatedUpcomingPayslipNet: number;
      deductionLineItem: string;
      isFnF?: boolean;
    };
    withdrawnPurposes?: string[];
    dpdpAction?: string;
    ticketId?: string;
  };
  resolution?: {
    action: 'APPROVE' | 'REJECT' | 'RESOLVE';
    resolvedBy: string;
    resolvedAt: string;
    notes?: string;
  };
}

export interface InboxAuditEntry {
  id: string;
  itemId: string;
  actionType: InboxActionType;
  workerName: string;
  action: 'APPROVE' | 'REJECT' | 'RESOLVE' | 'BULK_APPROVE';
  resolvedBy: string;
  resolvedAt: string;
  notes?: string;
}

// ==========================================
// MANAGER-INITIATED MAGIC LINK (SCOPED TOKENS)
// ==========================================

export type MagicLinkScope = 'PAYSLIP' | 'SCHEDULE' | 'ATTENDANCE_SUMMARY' | 'PUNCH' | 'punch';
export type MagicLinkChannel = 'WHATSAPP' | 'SMS' | 'COPY_LINK';

export interface DeviceAccessEntry {
  deviceFingerprint: string;
  userAgent: string;
  timestamp: string;
  ip?: string;
  deviceModel?: string;
}

export interface WorkerAccessToken {
  id?: string;
  token: string;
  tokenHash: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  scope: MagicLinkScope;
  channel: MagicLinkChannel;
  issuedBy: string;
  issuedAt: string;
  sentAt?: string;
  expiresAt: string;
  ttlHours: number;
  targetMonth?: string;
  shiftId?: string;
  accessLog: DeviceAccessEntry[];
  deviceAccessHistory?: DeviceAccessEntry[];
  revoked?: boolean;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: RevocationReason;
  lastUsedAt?: string;
  flaggedMultiDevice?: boolean;
  flaggedReason?: string;
  deliveryStatus?: 'DELIVERED' | 'FAILED' | 'PENDING';
}

export type RevocationReason = 'lost phone' | 'worker exit' | 'suspicious access' | 'shared link' | 'other';

export interface BoundDevice {
  id: string;
  workerId: string;
  workerName: string;
  tenantId: string;
  deviceModel: string;
  deviceFingerprint: string;
  boundAt: string;
  lastPunchAt: string;
  expiresAt?: string; // 30 days validity, auto-renewed on each successful punch
  registeredPhone?: string;
  platform?: string;
  userAgent?: string;
  status: 'BOUND' | 'UNBOUND';
  unboundAt?: string;
  unboundBy?: string;
  unboundReason?: string;
}

export interface DeviceBindingOtpState {
  phone: string;
  workerId: string;
  otpCode: string; // 6-digit code
  sentAt: number;
  expiresAt: number; // 10 minutes validity
  attempts: number; // max 5 attempts per code
  requestTimestamps: number[]; // timestamps in ms for rolling 1h limit (max 3)
  lockUntil?: number; // 30-minute lock on 5 failed attempts
  lastRequestTime: number;
}

export interface FieldPunchPayload {
  punchId: string; // Idempotent client-generated ID
  tenantId: string;
  workerId: string;
  deviceFingerprint: string;
  deviceBindingId?: string;
  deviceModel: string;
  punchType: 'IN' | 'OUT';
  deviceTimestamp: string;
  gps: {
    lat: number;
    lng: number;
    accuracy: number;
    address?: string;
  };
  selfieUrl?: string;
  livenessVerified?: boolean;
  selfieVerificationStatus?: 'VERIFIED' | 'VERIFICATION_PENDING' | 'FAILED';
  selfieUnavailableRetries?: number;
  mockLocationFlag: boolean;
  rootedJailbrokenFlag: boolean;
  batteryLevel?: number;
  batteryCharging?: boolean;
  token?: string;
  recentDwellTimestamp?: number;
  bypassAccuracyWarning?: boolean;
  isOffline?: boolean;
}

export interface BoundDevicePunchResult {
  success: boolean;
  error?: string;
  errorCode?: 
    | 'WORKER_INACTIVE' 
    | 'DEVICE_UNREGISTERED' 
    | 'DEVICE_LIMIT_REACHED' 
    | 'OTP_REQUIRED' 
    | 'RATE_LIMITED'
    | 'MOCK_LOCATION_BLOCKED'
    | 'GEOFENCE_BLOCKED'
    | 'ACCURACY_TOO_LOW';
  record?: AttendanceRecord;
  punchType?: 'IN' | 'OUT';
  punchTime?: string;
  boundDevice?: BoundDevice;
  requiresOtp?: boolean;
  canNotifyManager?: boolean;
  isOfflineQueued?: boolean;
  geofenceViolation?: boolean;
  accuracyLow?: boolean;
  siteName?: string;
  serverTimestamp?: string;
  deviceTimestamp?: string;
  tokenRenewedUntil?: string;
}

export interface DpdpSubjectAccessReport {
  generatedAt: string;
  workerId: string;
  workerName: string;
  tenantId: string;
  phone: string;
  aadharMasked?: string;
  activeTokensCount: number;
  revokedTokensCount: number;
  boundDevicesCount: number;
  punchRecordsCount: number;
  tokens: WorkerAccessToken[];
  boundDevices: BoundDevice[];
  auditLogs: any[];
}

// ==========================================
// DPDP LOCATION CONSENT & TRANSPARENCY
// ==========================================

export type WorkerLanguage = 'en' | 'hi' | 'gu';
export type ConsentPurposeKey = 'attendance_location' | 'safety_location';

export interface ConsentPurposes {
  attendance_location: boolean;
  safety_location: boolean;
}

export interface ConsentRecord {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  policyVersion: string;
  capturedInBindingId: string;
  channel: 'PUNCH_VIEW' | 'WHATSAPP_BOT' | 'SMS' | 'MANAGER_ASSISTED';
  language: WorkerLanguage;
  timestamp: string;
  purposes: ConsentPurposes;
  active: boolean;
  withdrawnAt?: string;
  withdrawnPurposes?: ConsentPurposeKey[];
  withdrawalChannel?: string;
}

export interface LocationBreadcrumbLog {
  timestamp: string;
  activityType: 'PUNCH_IN' | 'PUNCH_OUT' | 'SHIFT_BREADCRUMB';
  purpose: ConsentPurposeKey;
  status: 'VERIFIED' | 'WITHDRAWN_MODE';
  deviceModel?: string;
}

export interface LocationAuditViewEntry {
  timestamp: string;
  viewerName: string;
  viewerRole: string;
  purpose: string;
}

export interface LocationDataSummary {
  workerId: string;
  workerName: string;
  generatedAt: string;
  retentionDays: number;
  activeConsent: ConsentRecord | null;
  consentHistory: ConsentRecord[];
  breadcrumbs: LocationBreadcrumbLog[];
  auditViews: LocationAuditViewEntry[];
  activeLegalHold?: boolean;
  legalHoldReason?: string;
}

export interface LocationDeletionRequest {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  requestedAt: string;
  dueByDate: string; // 30-day statutory DPDP deadline
  channel: string;
  status: 'PENDING' | 'UNDER_LEGAL_HOLD' | 'PROCESSED' | 'REJECTED';
  legalHoldApplied?: boolean;
  legalHoldReason?: string;
  resolvedAt?: string;
  notes?: string;
}

// ==========================================
// GEOFENCE AUTO-PUNCH & TRANSITION EVENTS
// ==========================================

export type GeofenceTransitionType = 'ENTER' | 'DWELL' | 'EXIT' | 'RE_ENTRY';

export interface GeofenceEvent {
  id: string;
  tenantId: string;
  workerId: string;
  workerName?: string;
  siteId: string;
  siteName: string;
  type: GeofenceTransitionType;
  timestamp: string;
  location: { lat: number; lng: number };
  accuracy: number;
  shiftId?: string;
  actionTaken?: 'AUTO_PUNCH_TRIGGERED' | 'DISCARDED_MANUAL_PUNCH_EXISTS' | 'DISCARDED_UNBOUND' | 'DISCARDED_NO_CONSENT' | 'RE_ENTRY_LOGGED';
  details?: string;
}

export interface AutoPunchSession {
  id: string;
  punchId: string;
  workerId: string;
  workerName: string;
  tenantId: string;
  siteId: string;
  siteName: string;
  punchType: 'IN' | 'OUT';
  triggeredAt: string;
  undoExpiresAt: string; // 5 min ISO
  status: 'PENDING_UNDO' | 'FINALIZED' | 'UNDONE';
  recordId: string;
  location: { lat: number; lng: number };
  accuracy: number;
  mockFlag: boolean;
  deviceBindingId: string;
  isOffline: boolean;
  trustScore: number;
}

export interface SiteDistanceInfo {
  siteId: string;
  siteName: string;
  distanceMeters: number;
  radius: number;
  enterRadius: number;
  exitRadius: number;
  isInsideEnter: boolean;
  isInsideExit: boolean;
  address?: string;
  autoPunchEnabled: boolean;
  dwellTimeMinutes: number;
}

export interface DisambiguationChoice {
  selectedSiteId: string;
  selectedSiteName: string;
  workerId: string;
  timestamp: string;
}

// ==========================================
// E11: WHATSAPP ATTENDANCE & BOT BRIDGE
// ==========================================

export interface AttendanceAuditTrailEntry {
  id?: string;
  channel: 'APP' | 'WHATSAPP' | 'KIOSK' | 'AUTO_PUNCH';
  source: string;
  timestamp: string;
  ipOrPhone?: string;
  action: 'PUNCH_IN' | 'PUNCH_OUT' | 'DUPLICATE_SUPPRESSED' | 'ANOMALY_FLAGGED' | 'OPT_OUT' | 'OPT_IN';
  notes?: string;
}

export interface WhatsAppBridgeConfig {
  enabled: boolean;
  wabaPhoneNumberId?: string;
  displayPhoneNumber?: string; // e.g., +91 98200 12345
  webhookVerifyToken?: string;
  defaultLanguage: WorkerLanguage;
  enableProactiveNotifications: boolean;
  enableShiftReminders: boolean;
  enableAdvanceApprovals: boolean;
  enablePayslipReady: boolean;
  enableMissingPunchOut: boolean;
  requireSelfieForPunch: boolean;
  requireLocationForPunch: boolean;
  rateLimitPerHour?: number; // default 10
}

export interface WhatsAppMessage {
  id: string;
  tenantId: string;
  workerId?: string;
  workerName?: string;
  fromPhone: string;
  direction: 'INBOUND' | 'OUTBOUND';
  content: string;
  timestamp: string;
  type: 'TEXT' | 'LOCATION' | 'IMAGE' | 'TEMPLATE' | 'INTERACTIVE_MENU';
  status?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  location?: { lat: number; lng: number; address?: string };
  mediaUrl?: string;
  commandRecognized?: string;
  scopedLinkUrl?: string;
  channel: 'WHATSAPP';
  isAnomaly?: boolean;
  anomalyReason?: string;
}

export interface WhatsAppOptOutRecord {
  phone: string;
  optedOutAt: string;
  channel: 'WHATSAPP';
  scope: 'NON_ESSENTIAL'; // punch commands remain allowed
}

export interface WhatsAppRateLimitRecord {
  workerId: string;
  phone: string;
  timestamps: number[];
}

export interface WhatsAppSharedPhoneBinding {
  phone: string;
  boundWorkerId: string;
  boundWorkerName: string;
  tenantId: string;
  boundAt: string;
  status: 'BOUND' | 'REJECTED_SHARED';
}

export type WhatsAppCommandKey = 
  | 'PUNCH_IN' 
  | 'PUNCH_OUT' 
  | 'PAYSLIP' 
  | 'SCHEDULE' 
  | 'ATTENDANCE' 
  | 'BALANCE_ADVANCE' 
  | 'LEAVE' 
  | 'OPT_OUT_STOP' 
  | 'OPT_IN_START' 
  | 'HELP_MENU'
  | 'UNKNOWN';



