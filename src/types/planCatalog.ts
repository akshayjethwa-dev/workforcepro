// src/types/planCatalog.ts

export type PlanCategory = 'STANDARD' | 'REGIONAL' | 'PROMO' | 'CUSTOM';

export interface PlanFeatureFlagDefinition {
  code: string;
  label: string;
  description: string;
  category: 'CORE' | 'PAYROLL' | 'ATTENDANCE' | 'SCALE' | 'ENTERPRISE';
}

export const CATALOG_FEATURE_FLAGS: PlanFeatureFlagDefinition[] = [
  { code: 'attendance', label: 'Attendance & Time Tracking', description: 'Real-time check-in, check-out, and shift logs', category: 'CORE' },
  { code: 'reports_basic', label: 'Basic Reports & Exports', description: 'Daily attendance reports and standard CSV download', category: 'CORE' },
  { code: 'kiosk', label: 'Biometric Face Kiosk', description: 'Tablet & desktop automated face scanning attendance terminal', category: 'ATTENDANCE' },
  { code: 'payroll_basic', label: 'Basic Payroll & Slips', description: 'Auto wage calculation and downloadable wage slips', category: 'PAYROLL' },
  { code: 'advances', label: 'Salary Advances & Loans', description: 'Advance request, approval, and auto-deduction ledger', category: 'PAYROLL' },
  { code: 'scheduling', label: 'Shift Roster & Scheduling', description: 'Multi-shift roster planning and rotation calendar', category: 'ATTENDANCE' },
  { code: 'exports', label: 'Advanced Data Exports', description: 'Detailed wage registers, muster rolls, and audit logs', category: 'CORE' },
  { code: 'payroll_statutory', label: 'Statutory Returns (PF/ESIC/PT)', description: 'ECR file generation, Form 16, and EPFO/ESIC calculations', category: 'PAYROLL' },
  { code: 'multi_branch', label: 'Multi-Branch & Locations', description: 'Manage multiple physical factories or job sites', category: 'SCALE' },
  { code: 'anomaly_detection', label: 'AI Anomaly & Fraud Detection', description: 'Buddy punching detection and suspicious clock-in alerts', category: 'ATTENDANCE' },
  { code: 'whatsapp', label: 'WhatsApp Alerts & Receipts', description: 'Automated shift notifications and payslips sent to workers', category: 'SCALE' },
  { code: 'action_inbox', label: 'Supervisor Action Inbox', description: 'Centralized queue for approvals, disputes, and regularizations', category: 'SCALE' },
  { code: 'api_access', label: 'REST API & Webhooks', description: 'Direct ERP and biometric hardware integration endpoints', category: 'ENTERPRISE' },
  { code: 'sso', label: 'Single Sign-On (SAML/Okta)', description: 'Enterprise identity provider authentication', category: 'ENTERPRISE' },
  { code: 'white_label', label: 'White-Label Branding', description: 'Custom domain, branded login, and custom notifications', category: 'ENTERPRISE' },
  { code: 'custom_sla', label: 'Custom SLA & 24/7 Dedicated AM', description: 'Guaranteed 99.9% uptime SLA with dedicated account manager', category: 'ENTERPRISE' },
];

export interface PlanVersion {
  version: number;
  effectiveFrom: string; // ISO string
  effectiveTo: string | null; // null if active
  monthlyPrice: number | null; // null for custom quote (ENTERPRISE)
  annualPrice: number | null; // null for custom quote
  employeeCap: number | null; // null for unlimited
  overageRate: number | null; // ₹ per employee above cap per month
  gstRate: number; // e.g., 18 (18%)
  featureFlags: string[];
  changeNotes?: string;
  createdBy: string;
}

export interface Plan {
  id: string;
  code: string; // Immutable unique identifier (e.g. FREE, GROWTH, PRO, ENTERPRISE, REGIONAL_MUMBAI)
  name: string;
  description: string;
  category: PlanCategory;
  currency: 'INR' | 'USD';
  isPublic: boolean; // if true AND isActive, visible on pricing page
  isActive: boolean; // if false, hidden from public pricing but existing subscribers stay on it
  isDeleted: boolean; // soft-delete flag
  deletedAt?: string | null;
  currentVersion: number;
  versions: PlanVersion[];
  badge?: string; // e.g. "Most Popular", "Best Value", "Pilot Ready"
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  planCode: string;
  planVersion: number;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  priceLockedAt: {
    monthlyPrice: number | null;
    annualPrice: number | null;
    gstRate: number;
    overageRate: number | null;
    employeeCap: number | null;
    lockedAt: string;
  };
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  isGrandfathered: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanMutationAuditLog {
  id: string;
  planId: string;
  planCode: string;
  versionNumber?: number;
  action: 
    | 'PLAN_CREATED' 
    | 'PLAN_VERSION_CREATED' 
    | 'PLAN_UPDATED' 
    | 'PLAN_ACTIVATED' 
    | 'PLAN_DEACTIVATED' 
    | 'PLAN_SOFT_DELETED' 
    | 'TENANT_GRANDFATHERED_MIGRATION';
  actorId: string;
  actorEmail: string;
  actorRole: string;
  beforeState: any | null;
  afterState: any;
  summary: string;
  reason?: string;
  timestamp: string;
}

export interface InvoiceCalculationResult {
  baseAmount: number;
  overageCount: number;
  overageAmount: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  isQuote: boolean;
}
