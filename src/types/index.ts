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
  state?: string;
  wageZone?: string;
  scheduledEmployment?: ScheduledEmploymentCategory | string;
  location?: { lat: number; lng: number; radius: number; address?: string };
  autoPunchEnabled?: boolean;
  dwellTimeMinutes?: number; // default 2 minutes
  enterRadius?: number; // meters (e.g. 100m)
  exitRadius?: number; // meters (e.g. 115m hysteresis buffer)
  trackingMode?: TrackingMode; // Per-site override: PUNCH_ONLY vs BREADCRUMB
  safetyCheckInConfig?: SafetyCheckInConfig;
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
    epfNotificationCeiling?: number; // Statutory EPFO ceiling notification (₹25,000)
    enforceEcrPreValidation?: boolean;
    esiEnabled?: boolean;
    esiWageCeiling?: number;
    unionizedCba?: {
      hasActiveCba: boolean;
      unionName?: string;
      agreementRef?: string;
      prohibitsUnilateralRestructure: boolean;
      lastReviewedAt?: string;
      notes?: string;
    };
    minimumWageRevisions?: MinimumWageRevisionRule[];
    ptLwfConfig?: PtLwfOrgConfig;
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
  breadcrumbsConfig?: BreadcrumbsConfig;
  safetyCheckInConfig?: SafetyCheckInConfig;
  whatsappConfig?: WhatsAppBridgeConfig;
  deviceIntegrityConfig?: DeviceIntegrityConfig;
}

export type DeviceAttestationPlatform = 'PLAY_INTEGRITY' | 'APP_ATTEST' | 'WEB_ATTESTATION' | 'LEGACY_FINGERPRINT';

export type DeviceIntegrityLevel = 
  | 'STRONG_INTEGRITY' 
  | 'DEVICE_INTEGRITY' 
  | 'BASIC_INTEGRITY' 
  | 'LOW_INTEGRITY' 
  | 'FAILED' 
  | 'EMULATOR_BLOCKED';

export interface DeviceIntegrityConfig {
  enabled: boolean;
  enforceStrongIntegrity: boolean; // block emulators
  enforceDeviceIntegrity: boolean; // block rooted / tampered devices
  allowCustomRomSupervisorOverride: boolean; // allow supervisor override for LineageOS / custom ROMs
  allowOlderDeviceFingerprintDegradation: boolean; // degrade gracefully for Android < API 23
  outageFailClosedForPunch: boolean; // fail closed on Google/Apple Play Integrity outage
  outageFailOpenForPayslip: boolean; // fail open for payslips
  simulateOutage?: boolean;
}

export interface DeviceIntegrityVerdict {
  platform: DeviceAttestationPlatform;
  token: string;
  evaluatedAt: string;
  meetsStrongIntegrity: boolean;
  meetsDeviceIntegrity: boolean;
  meetsBasicIntegrity: boolean;
  isEmulator: boolean;
  isRootedOrJailbroken: boolean;
  isCustomRom?: boolean;
  deviceRecognitionVerdict?: 'LICENSED' | 'UNLICENSED' | 'UNKNOWN';
  appLicensingVerdict?: 'LICENSED' | 'UNLICENSED' | 'UNEVALUATED';
  integrityLevel: DeviceIntegrityLevel;
  passed: boolean;
  rejectionReason?: string;
  errorCode?: 
    | 'DEVICE_INTEGRITY_FAILED' 
    | 'EMULATOR_DETECTED' 
    | 'ATTESTATION_OUTAGE_BLOCKED' 
    | 'UNVERIFIED_DEVICE_REQUIRES_OVERRIDE';
  isSupervisorOverridden?: boolean;
  supervisorOverride?: {
    approvedBy: string;
    supervisorName: string;
    reason: string;
    approvedAt: string;
    overrideCode: string;
  };
  isAttestationOutageBypass?: boolean;
  isOlderDeviceFallback?: boolean;
  attestationLatencyMs?: number;
  retryCount?: number;
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
  // Device Integrity Attestation Fields
  integrityLevel?: DeviceIntegrityLevel;
  integrityVerdict?: DeviceIntegrityVerdict;
  isSupervisorOverridden?: boolean;
  isEmulatorBlocked?: boolean;
  isAttestationOutageBypass?: boolean;
  isOlderDeviceFallback?: boolean;
}

export type WageComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT';
export type WageComplianceFlag = 'NON_COMPLIANT' | 'MINIMUM_WAGE_VIOLATION';
export type WorkerSkillCategory = 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
export type ScheduledEmploymentCategory =
  | 'Engineering & Manufacturing'
  | 'Textiles & Garments'
  | 'Construction & Infrastructure'
  | 'Shops & Commercial Establishments'
  | 'Logistics & Warehousing'
  | 'Food & Beverages';

export interface MinimumWageRevisionRule {
  id: string;
  state: string;
  zone: string;
  scheduledEmployment?: ScheduledEmploymentCategory | string;
  skillCategory: WorkerSkillCategory;
  effectiveDate: string; // YYYY-MM-DD (mid-month revision effective date)
  previousMonthlyFloor: number;
  revisedMonthlyFloor: number;
  notificationDate: string; // YYYY-MM-DD
  notificationRef: string;
}

export interface MidMonthMinWageRevisionInfo {
  isRevisedInMonth: boolean;
  revisionDate: string;
  previousMonthlyFloor: number;
  revisedMonthlyFloor: number;
  daysAtPreviousRate: number;
  daysAtRevisedRate: number;
  totalDaysInMonth: number;
  proratedMonthlyFloor: number;
}

export type PtExemptionStatus = 'NONE' | 'PT_EXEMPT';
export type PtExemptionReason =
  | 'PREVIOUS_EMPLOYER_DECLARATION'
  | 'MULTIPLE_EMPLOYER'
  | 'STATUTORY_EXEMPT'
  | 'OTHER';

export type LwfSkippedReason =
  | 'NON_DEDUCTION_MONTH'
  | 'CONTRACTOR_EXCLUDED'
  | 'STATE_NO_LWF'
  | 'DISABLED_IN_SETTINGS'
  | 'WAGE_CEILING_EXCEEDED'
  | 'BELOW_WAGE_THRESHOLD';

export type LwfWageCeilingMode = 'NONE' | 'EXEMPT_ABOVE' | 'EXEMPT_BELOW';

export interface StateLwfConfigOverride {
  enabled?: boolean;
  cycle?: 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL' | 'NONE';
  employeeAmount?: number;
  employerAmount?: number;
  employeePercentageRate?: number | null;
  months?: number[]; // e.g. [6, 12] for June & December
  excludeContractors?: boolean;
  wageCeiling?: number | null;
  wageCeilingMode?: LwfWageCeilingMode;
}

export interface LwfTransferSplitBreakdown {
  isMidYearTransfer: boolean;
  transferEffectiveDate: string;
  previousState: string;
  currentState: string;
  previousStateCycle: 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL' | 'NONE';
  currentStateCycle: 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL' | 'NONE';
  monthsWorkedInPreviousState: number;
  monthsWorkedInCurrentState: number;
  previousStateCycleMonths: number;
  currentStateCycleMonths: number;
  previousStateEmployeeLwf: number;
  previousStateEmployerLwf: number;
  currentStateEmployeeLwf: number;
  currentStateEmployerLwf: number;
  totalEmployeeLwf: number;
  totalEmployerLwf: number;
  splitSummary: string;
}

export interface PtLwfOrgConfig {
  gujaratPtFeb300Adjustment?: boolean; // default true: ₹300 in February to reach ₹2,500 annual cap
  maharashtraPtFeb300Adjustment?: boolean; // default true
  ptMidMonthProrationEnabled?: boolean; // default true
  lwfOverrides?: Record<string, StateLwfConfigOverride>;
}

export interface WageBreakdownComponents {
  basic: number;
  da?: number;
  retainingAllowance?: number;
  hra: number;
  travel?: number;
  medical?: number;
  others: number;
  employerPf?: number;
  employerGratuity?: number;
}

export interface WageStructureAuditResult {
  workerId?: string;
  workerName?: string;
  workerCategory?: string;
  wageType: 'DAILY' | 'MONTHLY';
  dailyMultiplier?: 26 | 30;
  state: string;
  skillCategory: WorkerSkillCategory;
  evaluationDate: string;
  effectiveRevisionDate?: string;
  revisionApplied: boolean;

  // Core 50% Rule Components (Monthly Equivalents for Daily Wage)
  basicPay: number;
  da: number;
  retainingAllowance: number;
  wageBase: number; // Basic Pay + DA + Retaining Allowance

  hra: number;
  travelAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  excludedComponents: number; // HRA + Travel + Medical + Other Allowances

  // Employer Contributions (Explicitly excluded from Total Remuneration denominator)
  employerPf: number;
  employerGratuity: number;
  employerContributionsExcluded: number;

  // Denominators & Thresholds
  totalRemuneration: number; // WageBase + ExcludedComponents (50% Rule Denominator)
  totalCtcWithEmployer: number; // TotalRemuneration + EmployerContributions
  fiftyPercentThreshold: number; // totalRemuneration * 0.50

  wageBasePercentage: number;
  excludedPercentage: number;

  // 50% Rule Verdict
  isFiftyPercentNonCompliant: boolean;
  status: WageComplianceStatus;
  gapAmount: number; // ExcludedComponents - (TotalRemuneration * 0.50), or 0
  deemedWageAddBack: number;
  compliantWageBase?: number; // WageBase + deemedWageAddBack
  estimatedAdditionalPfMonthly: number;
  estimatedAdditionalGratuityMonthly: number;
  estimatedAdditionalGratuityAnnual?: number;
  warningMessage?: string;

  // State Minimum Wage Check
  wageZone: string;
  scheduledEmployment: string;
  minimumWageNotificationDate: string;
  minimumWageNotificationRef: string;
  workLocationSource: 'WORKER_LOCATION' | 'BRANCH_LOCATION' | 'HEAD_OFFICE_FALLBACK';
  isOnProbation: boolean;
  probationExemptionBlockedNote?: string;
  midMonthRevisionInfo?: MidMonthMinWageRevisionInfo;
  statutoryMinimumWageMonthly: number;
  statutoryMinimumWageDaily: number;
  isMinimumWageViolation: boolean;
  minimumWageGap: number;
  minimumWageWarning?: string;
  blockingErrorCode?: 'MINIMUM_WAGE_VIOLATION';

  complianceFlags: WageComplianceFlag[];
  hasAnyViolation: boolean;
  verificationSource?: 'CLOUD_FUNCTION' | 'CLIENT_ENGINE';
}

export interface SalaryStructureAuditReport {
  tenantId: string;
  auditedAt: string;
  asOfDate: string;
  verificationSource: 'CLOUD_FUNCTION' | 'CLIENT_ENGINE';
  totalWorkersAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  minimumWageViolationCount: number;
  totalComplianceGapMonthly: number;
  estimatedExtraStatutoryLiabilityMonthly: number;
  results: WageStructureAuditResult[];
}

export interface PayrollServerValidationResult {
  tenantId: string;
  month: string;
  validatedAt: string;
  verificationSource: 'CLOUD_FUNCTION' | 'CLIENT_ENGINE';
  hasFlaggedWorkers: boolean;
  isPayrollBlocked?: boolean;
  blockingErrorCode?: 'MINIMUM_WAGE_VIOLATION';
  blockingReason?: string;
  nonCompliantCount: number;
  minimumWageViolationCount: number;
  totalGapAmount: number;
  flaggedWorkers: WageStructureAuditResult[];
  blockingMinimumWageWorkers?: WageStructureAuditResult[];
  allResults: WageStructureAuditResult[];
}

export interface WageConfig {
  type: 'DAILY' | 'MONTHLY';
  amount: number;
  basicPercentage?: number; 
  dailyMultiplier?: 26 | 30;
  monthlyBreakdown?: WageBreakdownComponents;
  dailyBreakdown?: WageBreakdownComponents;
  overtimeEligible: boolean;
  overtimeRatePerHour?: number;
  workingDaysPerMonth?: number;
  allowances: {
    travel: number;
    food: number;
    nightShift: number;
  };
  complianceStatus?: WageComplianceStatus;
  complianceFlags?: WageComplianceFlag[];
  wageAuditSummary?: WageStructureAuditResult;
  acknowledgedNonCompliant?: boolean;
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
  status: 'ACTIVE' | 'INACTIVE' | 'RESIGNED' | 'TERMINATED';
  noticePeriodDays?: number;
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
  wageZone?: string;
  scheduledEmployment?: ScheduledEmploymentCategory | string;
  workLocationAddress?: string;
  stateEffectiveDate?: string;
  previousState?: string;
  taxRegime?: 'NEW' | 'OLD';
  taxDeclarationLocked?: boolean;
  taxDeclarations?: EmployeeTaxDeclaration;
  pfOptOut?: boolean;
  esiOptOut?: boolean;
  salaryRevisionDate?: string;
  previousWageAmount?: number;
  previousWageConfig?: WageConfig;
  skillCategory?: WorkerSkillCategory;
  isOnProbation?: boolean;
  probationEndDate?: string;
  // Shared-Device Quick Switch (PIN/QR)
  kioskPin?: string; // 4-6 digit quick switch PIN unique per tenant
  pinLockedUntil?: string; // ISO date string if in cooldown
  pinFailedAttempts?: number;
  // Task 4: Gratuity, Tenure, Subsidiary Transfer, Nominee & Exit Metadata
  employmentType?: 'PERMANENT' | 'FIXED_TERM' | 'CONTRACT' | 'CONTRACTOR' | 'DAILY_WAGE';
  isContractor?: boolean;
  contractDurationMonths?: number;
  // Task 7: PT Exemption (Multiple Employers / Declaration)
  ptExempt?: boolean;
  ptExemptionStatus?: PtExemptionStatus;
  ptExemptionReason?: PtExemptionReason;
  ptPreviousEmployerDeclaration?: {
    declared: boolean;
    previousEmployerName?: string;
    certificateRef?: string;
    declaredDate?: string;
  };
  exitReason?: GratuityExitReason;
  deathInService?: boolean;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  subsidiaryTransfer?: {
    transferredFromSubsidiary: boolean;
    subsidiaryName?: string;
    previousJoiningDate?: string;
    transferDate?: string;
    noBreakInService: boolean;
  };
  // Task 8: EPFO UAN, KYC & Pre-Upload ECR Master Metadata
  epfoUanStatus?: EpfoUanStatus;
  epfoRegisteredName?: string;
  epfoNameOverrideApproved?: boolean;
  epfoNameChangeLegalRef?: string;
  epfoKyc?: EpfoKycStatus;
  epfoExitMarked?: boolean;
  epfoExitMarkedDate?: string;
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
  lwfRuleApplied?: string;
  lwfCalculation?: string;
  tdsRuleApplied: string;
  tdsCalculation: string;
  employerLiabilitySummary: string;
  excessAllowanceAddBackSummary?: string;
  sourceValues: {
    basic: number;
    gross: number;
    overtime: number;
    allowances: number;
    originalWageBase?: number;
    notionalWageAddition?: number;
    compliantWageBase?: number;
    pfQualifyingWages: number;
    esiQualifyingWages: number;
    state: string;
    gender: string;
    taxRegime: 'NEW' | 'OLD';
    annualProjectedGross: number;
    totalExemptions: number;
    taxableIncome: number;
    isPtExempt?: boolean;
    isPtProrated?: boolean;
    ptDaysWorked?: number;
    ptTotalDaysInMonth?: number;
    isContractor?: boolean;
    lwfApplicableMonth?: boolean;
    lwfWorkLocationSource?: 'WORKER_LOCATION' | 'BRANCH_LOCATION' | 'HEAD_OFFICE_FALLBACK';
    lwfWageCeiling?: number;
    monthNumber?: number;
  };
}

export interface GratuityImpactProjection {
  applicable: boolean;
  originalMonthlyAccrual: number;
  recalculatedMonthlyAccrual: number;
  monthlyIncrease: number;
  annualIncrease: number;
  reason?: string;
}

export interface WageComplianceAudit {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  payrollMonth: string; // YYYY-MM
  auditedAt: string;
  labourCodeEffectiveDate: string; // '2025-11-21'
  isLabourCodeEffective: boolean;
  isRetrospectivePeriod: boolean;
  retrospectiveWarning?: string;
  complianceStatus: WageComplianceStatus;
  addBackApplied: boolean;

  // Component breakdown for the payroll run
  basicPay: number;
  da: number;
  retainingAllowance: number;
  originalWageBase: number;
  excludedComponents: number;
  totalRemunerationForRule: number;
  fiftyPercentThreshold: number;
  rawExcessAllowance: number; // Excluded - (0.50 * TotalRemuneration), can be <= 0
  notionalWageAddition: number; // max(0, rawExcessAllowance)
  recalculatedWageBase: number; // CompliantWageBase

  // PF & ESI Wage Bases & Contribution Deltas
  originalPfWageBase: number;
  recalculatedPfWageBase: number;
  originalEsiWageBase: number;
  recalculatedEsiWageBase: number;
  originalEmployeePf: number;
  recalculatedEmployeePf: number;
  pfDeltaEmployee: number;
  originalEmployerPf: number;
  recalculatedEmployerPf: number;
  pfDeltaEmployer: number;
  originalEmployeeEsi: number;
  recalculatedEmployeeEsi: number;
  esiDeltaEmployee: number;
  originalEmployerEsi: number;
  recalculatedEmployerEsi: number;
  esiDeltaEmployer: number;

  // Gratuity Impact Projection
  gratuityImpact: GratuityImpactProjection;
  formulaText: string;
}

export interface StatutoryBreakdown {
  // Employee Deductions (Subtracted from Net Pay)
  employeePf: number;
  employeeEsi: number;
  professionalTax: number;
  employeeLwf: number;
  tds: number;
  totalEmployeeStatutory: number;

  // Employer Contributions (Company Liability / CTC addition)
  employerEpf: number;
  employerEps: number;
  employerEdli: number;
  employerAdminCharges: number;
  totalEmployerPf: number;
  employerEsi: number;
  employerLwf: number;
  totalEmployerStatutory: number;

  // Wage Bases & Attributes
  pfWageBase: number;
  esiWageBase: number;
  originalPfWageBase?: number;
  originalEsiWageBase?: number;
  notionalWageAddition?: number;
  compliantWageBase?: number;
  originalWageBase?: number;
  isLabourCodeEffective?: boolean;
  isRetrospectivePeriod?: boolean;
  retrospectiveWarning?: string;
  gratuityImpact?: GratuityImpactProjection;
  ptGrossBase: number;
  annualTaxableIncome: number;
  taxRegime: 'NEW' | 'OLD';
  state: string;

  // PT & LWF Audit Metadata
  isPtExempt?: boolean;
  ptExemptionStatus?: PtExemptionStatus;
  ptExemptionNote?: string;
  ptFebruaryAdjustmentApplied?: boolean;
  ptProratedInfo?: {
    isProrated: boolean;
    fullMonthPt: number;
    proratedPt: number;
    daysWorked: number;
    totalDaysInMonth: number;
    joiningDate?: string;
  };
  isLwfApplicableMonth?: boolean;
  lwfCycleLabel?: string;
  lwfSkippedReason?: LwfSkippedReason;
  isContractorExcludedFromLwf?: boolean;
  lwfWorkLocationSource?: 'WORKER_LOCATION' | 'BRANCH_LOCATION' | 'HEAD_OFFICE_FALLBACK';
  lwfWageCeilingApplied?: number;
  lwfWageCeilingMode?: LwfWageCeilingMode;
  lwfTransferSplit?: LwfTransferSplitBreakdown;

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
  notionalWageAddition?: number;
  wageStructureAudit?: WageStructureAuditResult;
  wageComplianceAudit?: WageComplianceAudit;
  gratuitySettlement?: number;
  isOffCycleFnf?: boolean;
  offCycleType?: 'WAGE_FNF' | 'GRATUITY_SETTLEMENT' | 'COMBINED_FNF';
  paidAt?: string;
  fnfSummary?: {
    isFnF: boolean;
    exitDate: string;
    exitReason?: GratuityExitReason;
    separationStatus?: 'RESIGNED' | 'TERMINATED' | 'RETIRED' | 'END_OF_CONTRACT' | 'DEATH_IN_SERVICE' | 'PERMANENT_DISABLEMENT';
    deathInService?: boolean;
    gratuityPayable: number;
    roundedYears: number;
    lastDrawnBasicPlusDa: number;
    nomineeName?: string;
    nomineeRelation?: string;
    ceilingApplied: boolean;
    fnfRecordId?: string;
    pendingSalaryDays?: number;
    pendingWagesEarned?: number;
    leaveEncashmentDays?: number;
    leaveEncashmentAmount?: number;
    noticePeriodRequiredDays?: number;
    noticePeriodServedDays?: number;
    noticeShortfallDays?: number;
    noticePayDailyRate?: number;
    noticePayRecovery?: number;
    noticePayWaived?: boolean;
    advanceAndEwaRecovery?: number;
    statutoryDeductions?: number;
    interestPenaltyAmount?: number;
    interestRateAnnualPct?: number;
    overdueDays?: number;
    wageDeadlineAt?: string;
    gratuityDeadlineAt?: string;
    deadlineMet?: boolean;
    legalHoldActive?: boolean;
    legalHoldReason?: string;
    scheduleLabel?: string;
    wageFnfNetPayable?: number;
  };
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

export type ScreenName = 'LOGIN' | 'DASHBOARD' | 'WORKERS' | 'ADD_WORKER' | 'ATTENDANCE_KIOSK' | 'PAYROLL' | 'ATTENDANCE' | 'DAILY_LOGS' | 'TEAM' | 'SETTINGS' | 'WORKER_HISTORY' | 'SUPER_ADMIN_DASHBOARD' | 'REPORTS' | 'BILLING' | 'ID_CARDS' | 'TERMS' | 'PRIVACY' | 'RESELLER_DASHBOARD' | 'INBOX' | 'ROSTER' | 'CTC_SIMULATOR' | 'GRATUITY' | 'ANNUAL_BONUS' | 'POSH_ICC';

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
  | 'CONFLICT_RESOLUTION'
  | 'FNF_DEADLINE_BREACH';

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
    fnfSettlement?: FnfSettlementRecord;
    overdueDays?: number;
    interestPenalty?: number;
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
    safetyAlert?: any;
    panicAlert?: any;
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

export type MagicLinkScope = 'PAYSLIP' | 'SCHEDULE' | 'ATTENDANCE_SUMMARY' | 'PUNCH' | 'punch' | 'SALARY_RESTRUCTURE' | 'POSH_COMPLAINT';
export type MagicLinkChannel = 'WHATSAPP' | 'SMS' | 'COPY_LINK';

export interface DeviceAccessEntry {
  deviceFingerprint: string;
  userAgent: string;
  timestamp: string;
  ip?: string;
  deviceModel?: string;
}

export interface MagicLinkRestructureSummary {
  effectiveDate: string;
  templateLabel: string;
  wageType: 'DAILY' | 'MONTHLY';
  oldBasic: number;
  newBasic: number;
  oldExcluded: number;
  newExcluded: number;
  totalRemuneration: number;
  shiftAmount: number;
  pfDeltaMonthly: number;
  gratuityDeltaAnnual: number;
  consentStatus?: 'SENT_WHATSAPP' | 'ACKNOWLEDGED' | 'DISPUTED';
  respondedAt?: string;
  workerNote?: string;
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
  restructureSummary?: MagicLinkRestructureSummary;
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
  // Device Integrity Attestation Fields
  integrityToken?: string;
  attestationPlatform?: DeviceAttestationPlatform;
  integrityVerdict?: DeviceIntegrityVerdict;
  supervisorOverride?: {
    approvedBy: string;
    supervisorName: string;
    reason: string;
    approvedAt: string;
    overrideCode: string;
  };
  attestationRetryCount?: number;
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
    | 'ACCURACY_TOO_LOW'
    | 'DEVICE_INTEGRITY_FAILED'
    | 'EMULATOR_DETECTED'
    | 'ATTESTATION_OUTAGE_BLOCKED'
    | 'UNVERIFIED_DEVICE_REQUIRES_OVERRIDE';
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
  integrityVerdict?: DeviceIntegrityVerdict;
  canRequestSupervisorOverride?: boolean;
  requiresSupervisorOverride?: boolean;
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
// SHIFT-SCOPED BREADCRUMBS & FIELD ROUTE TRACKING
// ==========================================

export type TrackingMode = 'PUNCH_ONLY' | 'BREADCRUMB';

export interface BreadcrumbsConfig {
  enabled: boolean;
  trackingMode: TrackingMode; // Default PUNCH_ONLY on Growth; BREADCRUMB on Pro/Enterprise or via tenant override
  movingIntervalMinutes: number; // default: 8
  stationaryIntervalMinutes: number; // default: 30
  hardCapIntervalMinutes?: number; // Battery protection floor (min 5 min)
  privacyPauseDurationsMinutes?: number[]; // [15, 30, 60]
  retentionDays?: number; // 30 days
}

export type FieldShiftStatus = 
  | 'ACTIVE' 
  | 'COMPLETED' 
  | 'PAUSED_BREAK' 
  | 'PAUSED_PRIVACY' 
  | 'TIMED_OUT' 
  | 'CONSENT_WITHDRAWN';

export interface ShiftPauseRecord {
  type: 'BREAK' | 'PRIVACY';
  startedAt: string;
  resumedAt?: string;
  durationMinutes?: number;
  reason?: string;
}

export interface FieldShiftSession {
  id: string; // "shift-sess-workerId-timestamp"
  tenantId: string;
  siteId: string;
  siteName: string;
  workerId: string;
  workerName: string;
  deviceBindingId: string;
  deviceFingerprint: string;
  startedAt: string; // ISO
  endedAt?: string; // ISO
  status: FieldShiftStatus;
  pauseHistory: ShiftPauseRecord[];
  lastBreadcrumbAt?: string;
  lastMotionStatus?: 'MOVING' | 'STATIONARY';
  totalBreadcrumbsCount: number;
  mockedDetectedCount: number;
  trackingMode: TrackingMode;
  degradedReason?: 'OEM_BATTERY_DECLINED' | 'PWA_BROWSER' | 'PERMISSION_REVOKED' | 'CONSENT_WITHDRAWN';
  // Lone Worker Safety Extensions
  safetyStatus?: 'OPTED_IN' | 'DECLINED' | 'DISABLED';
  safetyDeclinedAt?: string;
  nextCheckInDueAt?: string;
  activePanicId?: string;
  activeCheckInId?: string;
}

// ==========================================
// LONE WORKER SAFETY CHECK-IN & PANIC SOS
// ==========================================

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  role: 'SUPERVISOR' | 'BRANCH_MANAGER' | 'FALLBACK_DISPATCH' | 'SAFETY_OFFICER';
  isFallback?: boolean; // Guarantees no single point of failure
  email?: string;
}

export interface EscalationLadderConfig {
  workerReNotifyMinutes: number; // default 5 (T+5)
  supervisorNotifyMinutes: number; // default 15 (T+15)
  branchManagerNotifyMinutes: number; // default 30 (T+30)
}

export interface SafetyCheckInConfig {
  enabled: boolean; // Off by default. Opt-in per tenant/site
  intervalMinutes: number; // default 60 min for remote sites
  gracePeriodMinutes: number; // default 5
  escalationLadder: EscalationLadderConfig;
  emergencyContacts: EmergencyContact[];
  channels: ('IN_APP' | 'WHATSAPP' | 'SMS')[];
  allowDeclineWithoutInsubordination: boolean; // default true
  requireVoiceNoteOption?: boolean;
}

export type SafetyCheckInStatus = 
  | 'SCHEDULED' 
  | 'DUE' 
  | 'RESPONDED_OK' 
  | 'MISSED_ESCALATING' 
  | 'ESCALATED' 
  | 'RESOLVED_LATE' 
  | 'DECLINED_BY_WORKER' 
  | 'EXPIRED_SHIFT_CLOSED';

export type SafetyResponseChannel = 'IN_APP' | 'WHATSAPP' | 'SMS';

export interface SafetyCheckInRecord {
  id: string;
  sessionId: string; // Strictly FieldShiftSession.id
  tenantId: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  siteId: string;
  siteName: string;
  scheduledAt: string; // ISO
  dueAt: string; // ISO
  respondedAt?: string; // ISO
  status: SafetyCheckInStatus;
  responseChannel?: SafetyResponseChannel;
  voiceNoteSnippet?: string; // Audio snippet data URL or transcript
  voiceNoteDurationSec?: number;
  escalationLevel?: 'NONE' | 'WORKER_T5' | 'SUPERVISOR_T15' | 'BRANCH_MANAGER_T30';
  escalationLogs?: {
    at: string;
    target: string;
    channel: string;
    note: string;
  }[];
  lastKnownLocation?: {
    lat: number;
    lng: number;
    accuracy: number;
    address?: string;
    isOffline?: boolean;
    lastSeenAt: string;
  };
  batteryPct?: number;
  rejectionReason?: string;
  lateReason?: string;
  notes?: string;
}

export interface PanicAlertRecord {
  id: string;
  sessionId?: string; // FieldShiftSession.id if during active shift
  tenantId: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  workerPhotoUrl?: string;
  siteId?: string;
  siteName?: string;
  triggeredAt: string; // ISO
  resolvedAt?: string; // ISO
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
    address?: string;
  };
  batteryPct?: number;
  shiftContext?: {
    shiftName?: string;
    startTime?: string;
    elapsedMinutes?: number;
  };
  contactsNotified: {
    name: string;
    phone: string;
    role: string;
    channel: string;
    timestamp: string;
  }[];
  resolvedBy?: string;
  resolutionNotes?: string;
}

export type BreadcrumbSource = 'GPS' | 'NETWORK' | 'CELL' | 'OFFLINE_BUFFER';

export type BreadcrumbEventType = 
  | 'POINT' 
  | 'BREAK_PAUSE' 
  | 'BREAK_RESUME' 
  | 'PRIVACY_PAUSE' 
  | 'PRIVACY_RESUME' 
  | 'GAP_MARKER';

export interface ShiftBreadcrumb {
  id: string;
  sessionId: string; // FieldShiftSession.id
  tenantId: string;
  workerId: string;
  siteId: string;
  lat: number;
  lng: number;
  accuracy: number; // in meters
  capturedAt: string; // ISO
  source: BreadcrumbSource;
  isMocked: boolean;
  batteryPct: number;
  isMoving: boolean;
  speedMps?: number;
  eventType: BreadcrumbEventType;
  gapDetails?: {
    startAt: string;
    endAt: string;
    reason: string; // e.g. "No signal 10:12–10:48"
  };
}

export interface RoutePlaybackAudit {
  id: string;
  tenantId: string;
  sessionId: string;
  workerId: string;
  workerName: string;
  viewedAt: string;
  viewerId: string;
  viewerName: string;
  viewerRole: string;
  date: string;
  source: 'MANAGER_MAP' | 'HISTORICAL_PLAYBACK';
}

export interface OemBatteryOptState {
  deviceId: string;
  osType: 'XIAOMI' | 'OPPO_REALME' | 'VIVO' | 'SAMSUNG' | 'STOCK_ANDROID' | 'OTHER';
  walkthroughCompleted: boolean;
  declined: boolean;
  timestamp: string;
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

// ==========================================
// TASK 3: EMPLOYER CTC RESTRUCTURING SIMULATOR & CONSENT
// ==========================================

export type CtcRestructureTemplateId = 'BASIC_50' | 'BASIC_55' | 'BASIC_60' | 'CUSTOM';

export interface CtcSimulationInput {
  totalCtcMonthly: number;
  currentBasic: number;
  da?: number;
  retainingAllowance?: number;
  hra: number;
  travel: number;
  medical: number;
  others: number;
  targetBasicPercentage: number; // e.g., 50, 55, 60
  state: string;
  skillCategory: WorkerSkillCategory;
  capPfAt15k: boolean;
  esiEnabled: boolean;
}

export interface CtcSimulationResult {
  totalRemuneration: number;
  currentBasic: number;
  currentWageBase: number;
  currentExcluded: number;
  currentBasicPct: number;
  required50PctBasic: number;
  targetBasicPercentage: number;
  targetBasic: number;
  targetWageBase: number;
  targetExcluded: number;
  shiftAmount: number;
  breakdownBefore: {
    basic: number;
    da: number;
    retaining: number;
    hra: number;
    travel: number;
    medical: number;
    others: number;
  };
  breakdownAfter: {
    basic: number;
    da: number;
    retaining: number;
    hra: number;
    travel: number;
    medical: number;
    others: number;
  };
  // Financial Impact
  employeePfBefore: number;
  employeePfAfter: number;
  pfEmployeeDeltaMonthly: number;
  employerPfBefore: number;
  employerPfAfter: number;
  pfEmployerDeltaMonthly: number;
  pfTotalDeltaMonthly: number;
  gratuityMonthlyBefore: number;
  gratuityMonthlyAfter: number;
  gratuityMonthlyDelta: number;
  gratuityAnnualBefore: number;
  gratuityAnnualAfter: number;
  gratuityAnnualDelta: number;
  esiEmployerBefore: number;
  esiEmployerAfter: number;
  esiEmployerDeltaMonthly: number;
  employerCostDeltaMonthly: number;
  takeHomeBefore: number;
  takeHomeAfter: number;
  takeHomeDeltaMonthly: number;
  // Compliance & Minimum Wage Guard
  isCurrentlyCompliant: boolean;
  willBeCompliant: boolean;
  state: string;
  skillCategory: WorkerSkillCategory;
  stateMinimumWageMonthly: number;
  violatesMinimumWage: boolean;
  requiresCtcTopUp: boolean;
  shortfallFromMinWage: number;
  minimumWageBlockReason?: string;
  impactNarrative: string;
}

export interface CtcSimulationWorkerPlan {
  workerId: string;
  workerName: string;
  workerPhone?: string;
  designation: string;
  department: string;
  wageType: 'DAILY' | 'MONTHLY';
  dailyMultiplier: 26 | 30;
  state: string;
  skillCategory: WorkerSkillCategory;
  isCurrentlyCompliant: boolean;
  canApply: boolean;
  blockedReason?: string;
  simulation: CtcSimulationResult;
  proposedWageConfig: WageConfig;
}

export type EmployeeRestructureConsentStatus =
  | 'NOT_SENT'
  | 'SENT_WHATSAPP'
  | 'ACKNOWLEDGED'
  | 'DISPUTED';

export interface EmployeeRestructureConsentRecord {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  appliedAt: string;
  effectiveDate: string;
  templateLabel: string;
  oldBasic: number;
  newBasic: number;
  oldExcluded: number;
  newExcluded: number;
  totalRemuneration: number;
  shiftAmount: number;
  pfEmployerDeltaMonthly: number;
  gratuityAnnualDelta: number;
  status: EmployeeRestructureConsentStatus;
  channel: 'WHATSAPP';
  magicToken?: string;
  whatsappUrl?: string;
  portalUrl?: string;
  messagePreview?: string;
  sentAt?: string;
  acknowledgedAt?: string;
  workerNote?: string;
}

export interface CtcBulkRestructureAuditLog {
  id: string;
  tenantId: string;
  executedAt: string;
  executedBy: string;
  effectiveDate: string;
  templateLabel: string;
  targetBasicPercentage: number;
  workersUpdatedCount: number;
  skippedCount: number;
  workerIds: string[];
  workerNames: string[];
  totalShiftedMonthly: number;
  totalEmployerPfDeltaMonthly: number;
  totalGratuityDeltaAnnual: number;
  cbaActive: boolean;
  cbaOverrideRef?: string;
  revisionLettersPrepared: number;
}

// ==========================================
// TASK 4: GRATUITY ACCRUAL & FNF SETTLEMENT
// ==========================================

export type GratuityExitReason =
  | 'RESIGNATION'
  | 'RETIREMENT'
  | 'TERMINATION'
  | 'END_OF_CONTRACT'
  | 'DEATH_IN_SERVICE'
  | 'PERMANENT_DISABLEMENT';

export type GratuityEligibilityRule =
  | 'FIVE_YEAR_STANDARD'
  | 'ONE_YEAR_FIXED_TERM_NOV_2025'
  | 'DEATH_IN_SERVICE_OVERRIDE'
  | 'NOT_ELIGIBLE';

export interface GratuityTenureBreakdown {
  entityStartDate: string; // YYYY-MM-DD
  effectiveStartDate: string; // YYYY-MM-DD (uses previousJoiningDate if no-break subsidiary transfer)
  endDate: string; // YYYY-MM-DD
  continuousServiceAggregated: boolean;
  subsidiaryName?: string;
  priorSubsidiaryMonths: number;
  breakInServiceDetected: boolean;
  breakInServiceNote?: string;
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  continuousYearsExact: number;
  exceedsSixMonthsInFinalYear: boolean;
  roundedServiceYears: number;
  formattedTenure: string;
}

export interface GratuityCalculationResult {
  workerId: string;
  workerName: string;
  designation: string;
  department: string;
  employmentType: 'PERMANENT' | 'FIXED_TERM' | 'CONTRACT' | 'CONTRACTOR' | 'DAILY_WAGE';
  asOfDate: string;
  dateOfExit?: string;
  exitReason?: GratuityExitReason;
  deathInService: boolean;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  // Last Drawn Basic + DA (Never historical average)
  lastDrawnBasic: number;
  lastDrawnDa: number;
  lastDrawnBasicPlusDa: number;
  usedLastDrawnNotAverage: boolean;
  salaryRevisionDate?: string;
  previousPreRevisionBasicPlusDa?: number;
  historicalAverageBasicPlusDa?: number;
  // Tenure & Round-up
  tenure: GratuityTenureBreakdown;
  // Eligibility
  eligibilityRule: GratuityEligibilityRule;
  minimumServiceRequiredYears: number;
  isEligible: boolean;
  isFixedTermNov2025Qualified: boolean;
  eligibilityNote: string;
  // Statutory Formula & ₹20 Lakh Ceiling
  effectiveYearsForFormula: number;
  rawFormulaAmount: number; // (lastDrawnBasicPlusDa * 15 / 26) * effectiveYearsForFormula
  provisionalAccruedAmount: number; // Pro-rata balance-sheet accrual for cash-flow planning
  statutoryCeiling: number; // 2000000 (₹20,00,000)
  ceilingApplied: boolean;
  cappedExcessAmount: number;
  payableGratuityAmount: number; // 0 if ineligible, else min(rawFormulaAmount, 2000000)
  monthlyAccrualIncrement: number; // (lastDrawnBasicPlusDa * 15 / 26) / 12
  annualAccrualIncrement: number; // lastDrawnBasicPlusDa * 15 / 26
  formulaText: string;
}

export interface GratuityOrgProjection {
  asOfDate: string;
  totalWorkersAnalyzed: number;
  eligibleEmployeesCount: number;
  standardFiveYearEligibleCount: number;
  fixedTermOneYearEligibleCount: number;
  deathInServiceCount: number;
  unvestedEmployeesCount: number;
  ceilingCappedCount: number;
  vestedPayableLiability: number;
  unvestedAccruedReserve: number;
  totalProvisionalAccruedLiability: number;
  ceilingClippedTotal: number;
  monthlyAccrualRunRate: number;
  annualAccrualRunRate: number;
  breakdowns: GratuityCalculationResult[];
}

export type FnfLegalHoldCategory =
  | 'ABSCONDING'
  | 'ASSET_NOT_RETURNED'
  | 'NOTICE_DISPUTE'
  | 'DISCIPLINARY_INQUIRY'
  | 'OTHER';

export interface FnfSettlementRecord {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  designation: string;
  department: string;
  exitDate: string; // YYYY-MM-DD
  exitReason: GratuityExitReason;
  separationStatus?:
    | 'RESIGNED'
    | 'TERMINATED'
    | 'RETIRED'
    | 'END_OF_CONTRACT'
    | 'DEATH_IN_SERVICE'
    | 'PERMANENT_DISABLEMENT';
  triggeredAt?: string; // ISO timestamp when exit was marked
  deathInService: boolean;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  pendingSalaryDays: number;
  pendingWagesEarned: number;
  pendingSalaryNote?: string;
  leaveEncashmentDays: number;
  leaveEncashmentAmount: number;
  // Notice Period & Recovery (Sec 17(2) & contract terms)
  noticePeriodRequiredDays?: number;
  noticePeriodServedDays?: number;
  noticeShortfallDays?: number;
  noticePayDailyRate?: number;
  noticePayRecovery?: number;
  noticePayWaived?: boolean;
  noticeRecoveryFormula?: string;
  // Gratuity (30-day statutory schedule under Payment of Gratuity Act Sec 7(3))
  gratuityCalculation: GratuityCalculationResult;
  gratuityPayable: number;
  // Recoveries & Statutory Deductions
  advanceAndEwaRecovery: number;
  statutoryDeductions: number;
  // Totals
  grossFnfPayable: number;
  fnfWageNetPayable?: number; // Schedule A: Pending Salary + Leave Encashment - Notice Recovery - Advances - Statutory
  excessRecoveryCarryover?: number; // Excess recovery if deductions exceed Schedule A earnings
  netFnfPayable: number; // Combined (Schedule A Wage FnF + Schedule B Gratuity)
  status: 'DRAFT' | 'APPROVED' | 'LEGAL_HOLD' | 'SETTLED';
  previousStatusBeforeHold?: 'DRAFT' | 'APPROVED';
  approvedAt?: string;
  approvedBy?: string;
  notes?: string;
  createdAt: string;
  settledAt?: string;
  settledBy?: string;
  // Section 17(2) Code on Wages (2 working days) + Gratuity Sec 7(3) (30 days) Deadline Tracking
  deadlineTracking?: {
    workingDaysLimit: number; // 2 working days
    baseDeadlineAt: string; // ISO
    effectiveDeadlineAt: string; // ISO shifted forward when LEGAL_HOLD is released
    totalPausedMs: number;
    holdStartedAt?: string; // ISO when current pause started
    isPaused: boolean;
    gratuityDeadlineAt: string; // ISO (30 calendar days from exitDate)
    interestRateAnnualPct: number; // 12% p.a.
    breachNotifiedAt?: string; // ISO once admin alert created
  };
  legalHold?: {
    active: boolean;
    category: FnfLegalHoldCategory;
    reason: string;
    placedAt: string;
    placedBy: string;
    releasedAt?: string;
    releasedBy?: string;
    history: {
      action: 'PLACED' | 'RELEASED';
      category?: FnfLegalHoldCategory;
      reason: string;
      actor: string;
      at: string;
    }[];
  };
  paymentSchedules?: {
    wageFnf: {
      id: string;
      label: string;
      legalBasis: string;
      amount: number;
      dueAt: string;
      status: 'PENDING' | 'PAUSED_HOLD' | 'PAID';
      paidAt?: string;
      paidBy?: string;
      interestPenaltyPaid?: number;
      offCyclePayrollId?: string;
    };
    gratuity: {
      id: string;
      label: string;
      legalBasis: string;
      amount: number;
      dueAt: string;
      status: 'NOT_APPLICABLE' | 'PENDING' | 'PAID';
      paidAt?: string;
      paidBy?: string;
      offCyclePayrollId?: string;
    };
  };
}

// ==========================================
// TASK 5: ANNUAL STATUTORY BONUS ENGINE
// ==========================================

export type BonusEligibilityStatus =
  | 'ELIGIBLE'
  | 'DISQUALIFIED_ABOVE_21K'
  | 'PART_YEAR_BELOW_30_DAYS';

export type BonusWindowStatus =
  | 'WITHIN_WINDOW'
  | 'URGENT_DUE_SOON'
  | 'OVERDUE_PENALTY_RISK'
  | 'FY_IN_PROGRESS';

export interface BonusWindowDeadlineInfo {
  financialYear: string; // e.g. '2025-26'
  fyStartDate: string; // '2025-04-01'
  fyEndDate: string; // '2026-03-31'
  statutoryDeadlineDate: string; // '2026-11-30' (8 months from FY end)
  evaluationDate: string;
  daysRemaining: number;
  daysOverdue: number;
  isWithinEightMonthWindow: boolean;
  windowStatus: BonusWindowStatus;
  statusMessage: string;
}

export interface BonusAllocableSurplusInput {
  financialYear: string;
  companyType: 'DOMESTIC_60_PCT' | 'NON_DOMESTIC_67_PCT';
  grossProfit: number;
  depreciation: number;
  directTaxes: number;
  returnOnCapital: number;
  priorSetOnCarriedForward: number;
  priorSetOffCarriedForward: number;
  isEmployerLossMaking: boolean;
  formCExemptionFiledRef?: string;
}

export interface BonusFormARegister {
  financialYear: string;
  companyName: string;
  grossProfit: number;
  lessDepreciation: number;
  lessDirectTaxes: number;
  lessReturnOnCapital: number;
  availableSurplus: number;
  allocableSurplusPercentage: 60 | 67;
  allocableSurplus: number;
  isEmployerLossMaking: boolean;
}

export interface BonusFormBSetOnSetOffRow {
  accountingYear: string;
  amountAllocableAsBonus: number;
  amountPayableAsBonus: number;
  setOnForYear: number;
  setOffForYear: number;
  netSetOnCarriedForward: number;
  netSetOffCarriedForward: number;
  remarks: string;
}

export interface BonusEmployeeCalculation {
  workerId: string;
  workerName: string;
  fatherName?: string;
  designation: string;
  department: string;
  monthlyGrossEarning: number; // Used for ₹21,000 eligibility ceiling
  monthlyBasicPlusDa: number;
  cappedMonthlyBonusWageBase: number; // min(Basic + DA, 7000)
  annualUncappedBasicPlusDa: number;
  annualCappedBonusWageBase: number; // cappedMonthly * 12 * prorationRatio
  workedDaysInFy: number;
  totalCalendarDaysInFy: number;
  prorationRatio: number; // workedDaysInFy / totalCalendarDaysInFy
  isPartYearProrated: boolean;
  eligibilityStatus: BonusEligibilityStatus;
  isStatutoryEligible: boolean;
  disqualificationReason?: string;
  bonusRatePct: number; // 8.33 to 20.00
  statutoryBonusAmount: number;
  // Ex-gratia support for > ₹21,000/month employees (excluded from statutory registers)
  exGratiaAmount: number;
  totalGrossBonusOrExGratia: number;
  includedInStatutoryRegisters: boolean;
  // Off-cycle TDS treatment (Sec 192 marginal tax computation)
  taxRegime: 'NEW' | 'OLD';
  normalAnnualTaxWithoutBonus: number;
  annualTaxWithBonus: number;
  bonusTdsDeduction: number;
  effectiveTdsRatePct: number;
  pfDeduction: number; // Always 0 on statutory annual bonus
  esiDeduction: number; // Always 0 on annual bonus
  netOffCyclePayout: number;
}

export interface BonusFormCRow {
  slNo: number;
  workerId: string;
  workerName: string;
  fatherOrHusbandName: string;
  completed15YearsAge: 'Yes' | 'No';
  designation: string;
  daysWorkedInYear: number;
  totalSalaryOrWageInYear: number;
  statutoryBonusPayable: number;
  pujaOrInterimBonusPaid: number;
  tdsIncomeTaxDeducted: number;
  totalDeductions: number;
  netAmountPayable: number;
  actualAmountPaid: number;
  dateOfPayment: string;
  remarks: string;
}

export interface BonusFormDReturn {
  financialYear: string;
  establishmentName: string;
  employerName: string;
  address: string;
  accountingYearEndedOn: string;
  totalEligibleEmployees: number;
  totalEligibleSalaryOrWage: number;
  bonusPercentageDeclared: number;
  totalStatutoryBonusPayable: number;
  totalExGratiaPaidSeparately: number;
  totalStatutoryTdsDeducted: number;
  dateOfPayment: string;
  isEmployerLossMaking: boolean;
  formCExemptionRequired: boolean;
  formCExemptionFiledRef?: string;
  statutoryDeadlineDate: string;
  paidWithinEightMonths: boolean;
}

export interface BonusOffCycleRun {
  id: string;
  tenantId: string;
  financialYear: string;
  payoutDate: string;
  bonusRatePct: number;
  isEmployerLossMaking: boolean;
  formCExemptionRequired: boolean;
  formCExemptionFiledRef?: string;
  windowInfo: BonusWindowDeadlineInfo;
  eligibleCount: number;
  disqualifiedAbove21kCount: number;
  totalStatutoryBonusGross: number;
  totalExGratiaGross: number;
  totalBonusTdsDeducted: number;
  totalNetOffCycleDisbursed: number;
  status: 'DRAFT' | 'APPROVED' | 'DISBURSED';
  createdBy: string;
  createdAt: string;
  disbursedAt?: string;
  items: BonusEmployeeCalculation[];
  formA: BonusFormARegister;
  formB: BonusFormBSetOnSetOffRow[];
  formC: BonusFormCRow[];
  formD: BonusFormDReturn;
}

// ==========================================
// TASK 8: PRE-UPLOAD EPFO ECR VALIDATOR
// ==========================================

export type EpfoUanStatus = 'ACTIVE' | 'INACTIVE' | 'UNSEEDED' | 'DEACTIVATED';

export interface EpfoKycStatus {
  aadhaarApproved: boolean;
  bankApproved: boolean;
  panApproved?: boolean;
  verifiedAt?: string;
}

export type EcrValidationCheckCode =
  | 'MISSING_UAN'
  | 'INVALID_UAN'
  | 'INACTIVE_UAN'
  | 'KYC_NOT_APPROVED'
  | 'DUPLICATE_UAN'
  | 'WAGE_CEILING_EXCEEDED'
  | 'EPFO_EXIT_NOT_MARKED'
  | 'UAN_NAME_MISMATCH';

export type EcrIssueSeverity = 'BLOCK' | 'WARNING' | 'INFO';

export interface EcrValidationIssue {
  code: EcrValidationCheckCode;
  epfoPortalCode: string;
  severity: EcrIssueSeverity;
  title: string;
  message: string;
  remediationHint: string;
  canAutoCapWage?: boolean;
  canOverrideName?: boolean;
  canMarkDoeDone?: boolean;
  canVerifyKyc?: boolean;
}

export interface EcrComputedNumbers {
  grossWages: number;
  rawEpfWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  eeShare: number;
  epsShare: number;
  erEpfShare: number;
  ncpDays: number;
  refundAdvances: number;
  isAge58Plus: boolean;
  wasWageCappedAtCeiling: boolean;
}

export interface EcrValidatedWorkerRow {
  workerId: string;
  payrollName: string;
  epfoRegisteredName: string;
  ecrMemberNameUsed: string;
  nameSource: 'PAYROLL' | 'EPFO_RECORD' | 'LEGAL_OVERRIDE';
  legalNameChangeRef?: string;
  uan: string;
  uanStatus: EpfoUanStatus;
  aadhaarKycApproved: boolean;
  bankKycApproved: boolean;
  dateOfExit?: string;
  epfoExitMarked: boolean;
  status: 'PASSED' | 'FAILED' | 'WARNING_ONLY' | 'EXCLUDED' | 'OPTED_OUT' | 'PRIOR_EXITED';
  hasBlockingError: boolean;
  isExcluded: boolean;
  willBeIncludedInFile: boolean;
  issues: EcrValidationIssue[];
  ecrLine: string;
  numbers: EcrComputedNumbers;
}

export interface EcrValidationSummary {
  totalWorkersEvaluated: number;
  eligibleForEcrCount: number;
  passedCount: number;
  failedCount: number;
  warningOnlyCount: number;
  excludedCount: number;
  includedInFinalFileCount: number;
  optedOutOrPriorExitedCount: number;
  missingOrInactiveUanCount: number;
  kycPendingCount: number;
  duplicateUanCount: number;
  wageCeilingExceededCount: number;
  exitNotMarkedCount: number;
  nameMismatchResolvedCount: number;
  statutoryCeilingApplied: number;
  totalGrossWages: number;
  totalEpfWages: number;
  totalEeShare: number;
  totalEpsShare: number;
  totalErEpfShare: number;
  totalAdminAndEdliCharges: number;
  totalChallanPayable: number;
}

export interface EcrValidationReport {
  tenantId: string;
  month: string; // YYYY-MM
  mode: 'PRIMARY' | 'SUPPLEMENTARY';
  validatedAt: string;
  summary: EcrValidationSummary;
  rows: EcrValidatedWorkerRow[];
  includedRows: EcrValidatedWorkerRow[];
  failedRows: EcrValidatedWorkerRow[];
  excludedRows: EcrValidatedWorkerRow[];
  ecrContent: string;
  errorReportText: string;
  canDownloadEcr: boolean;
}

export interface SupplementaryEcrPendingItem {
  workerId: string;
  workerName: string;
  uan?: string;
  month: string;
  excludedAt: string;
  failureCodes: EcrValidationCheckCode[];
  failureSummary: string;
}

// ==========================================
// TASK 9: DIGITAL INTERNAL COMMITTEE (ICC) & POSH ACT COMPLIANCE
// ==========================================

export type IccMemberRole = 'PRESIDING_OFFICER' | 'INTERNAL_MEMBER' | 'EXTERNAL_MEMBER';

export interface IccMember {
  id: string;
  role: IccMemberRole;
  name: string;
  designation: string;
  department?: string;
  email?: string;
  phone?: string;
  workerId?: string;
  organization?: string; // NGO / legal qualification for external member
  appointedDate: string; // YYYY-MM-DD
  isWoman?: boolean;
  isActive: boolean;
}

export interface IccCommitteeConfig {
  tenantId: string;
  presidingOfficer: IccMember | null;
  internalMembers: IccMember[];
  externalMember: IccMember | null;
  allowAnonymousComplaints: boolean;
  localCommitteeDistrict: string;
  localCommitteeEmail?: string;
  autoRemindDay60: boolean;
  autoRemindDay80: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface PoshThresholdEvaluation {
  activeEmployeeCount: number;
  thresholdLimit: 10;
  formalIccMandatory: boolean;
  isIccValid: boolean;
  hasPresidingOfficer: boolean;
  internalMembersCount: number;
  hasExternalMember: boolean;
  missingRequirements: string[];
  advisoryNote: string;
}

export interface EncryptedComplaintPayload {
  algorithm: 'AES-GCM-256';
  keyId: string;
  iv: string;
  ciphertext: string;
  encryptedAt: string;
}

export interface PoshConfidentialDetails {
  complainantName?: string;
  complainantWorkerId?: string;
  complainantDepartment?: string;
  complainantPhone?: string;
  respondentName: string;
  respondentWorkerId?: string;
  respondentRoleOrDept?: string;
  incidentDate: string;
  incidentLocation: string;
  incidentDescription: string;
  witnessDetails?: string;
  evidenceNotes?: string;
  conciliationRequested?: boolean;
}

export type PoshComplaintStatus =
  | 'FILED'
  | 'INQUIRY_IN_PROGRESS'
  | 'REPORT_SUBMITTED'
  | 'ACTION_TAKEN'
  | 'CLOSED'
  | 'REFERRED_TO_LOCAL_COMMITTEE';

export type PoshFindingOutcome =
  | 'PENDING'
  | 'SUBSTANTIATED'
  | 'UNSUBSTANTIATED'
  | 'CONCILIATED'
  | 'MALICIOUS_FALSE';

export interface PoshInquiryEntry {
  id: string;
  loggedAt: string;
  loggedByMemberId: string;
  loggedByName: string;
  loggedByRole: IccMemberRole | 'SYSTEM';
  entryType:
    | 'ACKNOWLEDGEMENT'
    | 'CONFLICT_REASSIGNMENT'
    | 'CONCILIATION'
    | 'HEARING'
    | 'EVIDENCE_REVIEW'
    | 'REPORT_SUBMISSION'
    | 'EMPLOYER_ACTION'
    | 'LOCAL_COMMITTEE_REFERRAL';
  summary: string;
}

export interface PoshTimelineStatus {
  filedDate: string;
  daysElapsed: number;
  inquiryDeadlineAt: string;
  inquiryDaysRemaining: number;
  isDay60ReminderDue: boolean;
  isDay80EscalationDue: boolean;
  isInquiryOverdue: boolean;
  isPendingOver90Days: boolean;
  inquiryCompletedAt?: string;
  reportDeadlineAt?: string;
  reportSubmittedAt?: string;
  reportDaysRemaining?: number;
  isReportOverdue: boolean;
  employerActionDeadlineAt?: string;
  slaStage:
    | 'ON_TRACK'
    | 'DAY_60_REMINDER'
    | 'DAY_80_URGENT'
    | 'INQUIRY_OVERDUE_90D'
    | 'REPORT_10D_DUE'
    | 'REPORT_OVERDUE'
    | 'COMPLETED';
}

export interface PoshComplaintRecord {
  id: string;
  caseCode: string;
  tenantId: string;
  filedAt: string;
  filedVia: 'WEB_PORTAL' | 'WORKER_PWA' | 'MAGIC_LINK';
  status: PoshComplaintStatus;
  isAnonymous: boolean;
  maskedComplainantAlias: string;
  respondentIsIccMember: boolean;
  conflictOfInterest: boolean;
  recusedMemberIds: string[];
  routedToExternalMember: boolean;
  assignedHandlerRole: IccMemberRole | 'LOCAL_COMMITTEE';
  assignedHandlerName: string;
  encryptedPayload: EncryptedComplaintPayload;
  inquiryStartedAt?: string;
  inquiryCompletedAt?: string;
  reportSubmittedAt?: string;
  findingOutcome: PoshFindingOutcome;
  employerActionTaken?: string;
  employerActionDate?: string;
  reminder60SentAt?: string;
  reminder80SentAt?: string;
  inquiryTimeline: PoshInquiryEntry[];
  thresholdAtFiling: {
    activeEmployeeCount: number;
    formalIccMandatory: boolean;
  };
}

export interface PoshActorContext {
  actorType: 'GENERAL_ADMIN' | 'ICC_MEMBER' | 'WORKER';
  userId?: string;
  workerId?: string;
  email?: string;
  name?: string;
  iccMemberId?: string;
  iccRole?: IccMemberRole;
}

export interface PoshComplaintView {
  record: PoshComplaintRecord;
  timeline: PoshTimelineStatus;
  canViewDetails: boolean;
  redactionReason?: 'NON_ICC_ADMIN_STATUS_ONLY' | 'CONFLICT_OF_INTEREST_RECUSED' | 'ACCUSED_ANONYMOUS_MASKED';
  decryptedDetails: PoshConfidentialDetails | null;
  visibleComplainantLabel: string;
  visibleRespondentLabel: string;
}

export interface PoshWorkshopRecord {
  id: string;
  tenantId: string;
  date: string; // YYYY-MM-DD
  title: string;
  trainerName: string;
  attendeesCount: number;
  mode: 'IN_PERSON' | 'ONLINE' | 'FLOOR_ORIENTATION';
  notes?: string;
}

export interface AnnualPoshDistrictReport {
  year: number;
  tenantId: string;
  companyName: string;
  districtOfficerJurisdiction: string;
  generatedAt: string;
  activeEmployeeCount: number;
  formalIccMandatory: boolean;
  iccConstituted: boolean;
  presidingOfficerName: string;
  externalMemberName: string;
  complaintsReceivedCount: number;
  complaintsDisposedCount: number;
  complaintsPendingOver90DaysCount: number;
  complaintsPendingUnder90DaysCount: number;
  workshopsConductedCount: number;
  workshopParticipantsTotal: number;
  natureOfActionsSummary: { action: string; count: number }[];
  reportText: string;
}