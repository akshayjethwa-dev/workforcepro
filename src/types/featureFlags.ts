// src/types/featureFlags.ts
import { SubscriptionTier } from './index';

export type FeatureFlagKey = 
  | 'ADVANCED_PAYROLL'
  | 'AI_CHAT'
  | 'WHITE_LABEL'
  | 'KIOSK_MODE'
  | 'GEOFENCING'
  | 'LIVENESS_DETECTION'
  | 'DIGITAL_ID_CARDS'
  | 'REGULATE_PUNCH'
  | 'BULK_IMPORT'
  | 'MULTI_BRANCH'
  | 'AUDIT_EXPORT';

export type FeatureCategory = 'CORE' | 'ATTENDANCE' | 'PAYROLL' | 'ENTERPRISE' | 'AI_AND_ANALYTICS';

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  label: string;
  description: string;
  category: FeatureCategory;
  globalDefault: boolean; // Level 1 platform fallback
  minRecommendedTier: SubscriptionTier;
  isSensitiveGated: boolean;
}

export const ALL_FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'ADVANCED_PAYROLL',
    label: 'Advanced Payroll & Statutory',
    description: 'Statutory compliance (PF, ESI, PT), Form 16 generator, CTC breakdown, and advance salary deduction engine.',
    category: 'PAYROLL',
    globalDefault: true,
    minRecommendedTier: 'PRO',
    isSensitiveGated: true,
  },
  {
    key: 'AI_CHAT',
    label: 'AI Labor Insights & Chat',
    description: 'Natural language labor queries, anomaly detection for punch fraud, and predictive wage projections.',
    category: 'AI_AND_ANALYTICS',
    globalDefault: false,
    minRecommendedTier: 'ENTERPRISE',
    isSensitiveGated: true,
  },
  {
    key: 'WHITE_LABEL',
    label: 'White-Label & Custom Domain',
    description: 'Custom brand identity (logo, favicon, CSS theme vars), CNAME custom domain verification, and custom email templates.',
    category: 'ENTERPRISE',
    globalDefault: false,
    minRecommendedTier: 'PRO',
    isSensitiveGated: true,
  },
  {
    key: 'KIOSK_MODE',
    label: 'Face Attendance Kiosk Terminal',
    description: 'Dedicated tablet/desktop attendance scanner with face recognition & PIN punch verification.',
    category: 'ATTENDANCE',
    globalDefault: true,
    minRecommendedTier: 'STARTER',
    isSensitiveGated: true,
  },
  {
    key: 'GEOFENCING',
    label: 'GPS Geofencing Validation',
    description: 'Restricts mobile attendance punches to calibrated geographic boundaries with coordinate auditing.',
    category: 'ATTENDANCE',
    globalDefault: true,
    minRecommendedTier: 'STARTER',
    isSensitiveGated: true,
  },
  {
    key: 'LIVENESS_DETECTION',
    label: 'Face Anti-Spoofing Liveness',
    description: 'Active 3D blink/smile detection to prevent photographic or screen punch spoofing.',
    category: 'ATTENDANCE',
    globalDefault: false,
    minRecommendedTier: 'PRO',
    isSensitiveGated: true,
  },
  {
    key: 'DIGITAL_ID_CARDS',
    label: 'Digital Worker ID Cards',
    description: 'Printable photo identification badges with unique scannable QR tokens.',
    category: 'CORE',
    globalDefault: true,
    minRecommendedTier: 'STARTER',
    isSensitiveGated: true,
  },
  {
    key: 'REGULATE_PUNCH',
    label: 'Punch Regularization Workflow',
    description: 'Manager approval workflows for missed check-ins, clock corrections, and attendance exceptions.',
    category: 'ATTENDANCE',
    globalDefault: true,
    minRecommendedTier: 'STARTER',
    isSensitiveGated: true,
  },
  {
    key: 'BULK_IMPORT',
    label: 'Bulk Worker Import (CSV)',
    description: 'Batch upload employee directories, initial face enrollment references, and salary structures.',
    category: 'CORE',
    globalDefault: false,
    minRecommendedTier: 'PRO',
    isSensitiveGated: true,
  },
  {
    key: 'MULTI_BRANCH',
    label: 'Multi-Branch & Locations',
    description: 'Operate multiple distinct production plants, warehouses, and branch-specific geofences.',
    category: 'ENTERPRISE',
    globalDefault: false,
    minRecommendedTier: 'PRO',
    isSensitiveGated: true,
  },
  {
    key: 'AUDIT_EXPORT',
    label: 'Audit Trail & Compliance Export',
    description: 'Export immutable tenant activity logs, punch dispute resolutions, and financial reconciliation reports.',
    category: 'ENTERPRISE',
    globalDefault: false,
    minRecommendedTier: 'ENTERPRISE',
    isSensitiveGated: true,
  },
];

// Level 2: Default Plan-Level Overrides Matrix
export const DEFAULT_PLAN_FEATURE_FLAGS: Record<SubscriptionTier, Record<FeatureFlagKey, boolean>> = {
  FREE: {
    ADVANCED_PAYROLL: false,
    AI_CHAT: false,
    WHITE_LABEL: false,
    KIOSK_MODE: false,
    GEOFENCING: false,
    LIVENESS_DETECTION: false,
    DIGITAL_ID_CARDS: false,
    REGULATE_PUNCH: false,
    BULK_IMPORT: false,
    MULTI_BRANCH: false,
    AUDIT_EXPORT: false,
  },
  TRIAL: {
    ADVANCED_PAYROLL: true,
    AI_CHAT: true,
    WHITE_LABEL: true,
    KIOSK_MODE: true,
    GEOFENCING: true,
    LIVENESS_DETECTION: true,
    DIGITAL_ID_CARDS: true,
    REGULATE_PUNCH: true,
    BULK_IMPORT: true,
    MULTI_BRANCH: true,
    AUDIT_EXPORT: true,
  },
  STARTER: {
    ADVANCED_PAYROLL: false,
    AI_CHAT: false,
    WHITE_LABEL: false,
    KIOSK_MODE: true,
    GEOFENCING: true,
    LIVENESS_DETECTION: false,
    DIGITAL_ID_CARDS: true,
    REGULATE_PUNCH: true,
    BULK_IMPORT: false,
    MULTI_BRANCH: false,
    AUDIT_EXPORT: false,
  },
  PRO: {
    ADVANCED_PAYROLL: true,
    AI_CHAT: false,
    WHITE_LABEL: true,
    KIOSK_MODE: true,
    GEOFENCING: true,
    LIVENESS_DETECTION: true,
    DIGITAL_ID_CARDS: true,
    REGULATE_PUNCH: true,
    BULK_IMPORT: true,
    MULTI_BRANCH: true,
    AUDIT_EXPORT: false,
  },
  ENTERPRISE: {
    ADVANCED_PAYROLL: true,
    AI_CHAT: true,
    WHITE_LABEL: true,
    KIOSK_MODE: true,
    GEOFENCING: true,
    LIVENESS_DETECTION: true,
    DIGITAL_ID_CARDS: true,
    REGULATE_PUNCH: true,
    BULK_IMPORT: true,
    MULTI_BRANCH: true,
    AUDIT_EXPORT: true,
  },
};

export type ResolutionSource = 
  | 'TENANT_OVERRIDE'       // Level 3 (Highest precedence)
  | 'PLAN_OVERRIDE'         // Level 2
  | 'GLOBAL_DEFAULT'        // Level 1
  | 'FAIL_CLOSED_FALLBACK'; // Safety default when error / unresolvable

export interface FeatureResolution {
  key: FeatureFlagKey;
  enabled: boolean;
  source: ResolutionSource;
  resolvedAt: string;
  reason?: string;
}

export interface PendingDowngrade {
  targetPlan: SubscriptionTier;
  currentPlan: SubscriptionTier;
  scheduledAt: string;     // ISO timestamp
  effectiveDate: string;   // ISO timestamp of next billing cycle
  scheduledBy: string;     // User ID or Super Admin
  reason?: string;
}

export interface TenantFeatureFlagsConfig {
  tenantId: string;
  overrides: Partial<Record<FeatureFlagKey, boolean>>;
  pendingDowngrade?: PendingDowngrade;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CachedEntitlementPayload {
  tenantId: string;
  plan: SubscriptionTier;
  timestamp: number;
  ttlMs: number;
  resolutions: Record<FeatureFlagKey, FeatureResolution>;
  pendingDowngrade?: PendingDowngrade | null;
  isInGracePeriod: boolean;
}
