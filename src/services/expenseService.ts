// src/services/expenseService.ts
import {
  Branch,
  ExpenseCategory,
  ExpenseClaim,
  ExpenseClaimStatus,
  ExpensePayrollLockStatus,
  ExpensePayoutDestination,
  ExpensePolicyConfig,
  ExpensePolicyTag,
  ExpensePolicyWarningDetails,
  ExpenseRejectionReason,
  ExpenseRoutingRule,
  ExpenseTaxClassification,
  ExpenseWorkerNotification,
  InboxItem,
  OrgSettings,
  PayslipReimbursementLineItem,
  Role,
  UserProfile,
  Worker,
} from '../types/index';
import { syncService } from './syncService';
import { inboxService, ManagerDelegation } from './inboxService';
import { dbService } from './db';

const EXPENSE_CLAIMS_STORAGE_PREFIX = 'workforce_expense_claims_v1_';
const EXPENSE_SEEDED_FLAG_PREFIX = 'workforce_expense_seeded_v2_';
const EXPENSE_FINANCE_SEEDED_FLAG_PREFIX = 'workforce_expense_finance_seeded_v1_';
const PAYROLL_MONTH_LOCK_STORAGE_PREFIX = 'workforce_payroll_month_locks_v1_';
const WORKER_EXPENSE_NOTIFS_STORAGE_PREFIX = 'workforce_expense_worker_notifs_v1_';

export const MAX_EXPENSE_PAST_DAYS = 30;
export const MAX_EXPENSE_AMOUNT_INR = 50000;

export const EXPENSE_REJECTION_REASONS: ExpenseRejectionReason[] = [
  'Receipt unclear',
  'Policy violation',
  'Not a valid expense',
  'Duplicate receipt submission',
  'Amount mismatch with receipt',
  'Expense older than 30-day policy',
];

export const EXPENSE_TAXABLE_FLAG_REASONS: string[] = [
  'Gift / Perquisite (Misclassified as Expense)',
  'Bonus / Cash Award (Taxable Income)',
  'Personal / Non-Business Expense',
  'Allowance Without Qualifying Business Receipt',
];

export const DEFAULT_EXPENSE_POLICY_CONFIG: ExpensePolicyConfig = {
  enabled: true,
  dailyLimitsPaise: {
    FOOD: 30000,   // ₹300/day
    PETROL: 50000, // ₹500/day (Fuel)
    TRAVEL: 100000, // ₹1,000/day
    OTHER: 50000,  // ₹500/day
  },
  requireOverrideNote: true,
};

export const EXPENSE_CATEGORIES: Array<{
  id: ExpenseCategory;
  label: string;
  shortHint: string;
}> = [
  { id: 'PETROL', label: 'Petrol', shortHint: 'Fuel / Bike' },
  { id: 'FOOD', label: 'Food', shortHint: 'Meals / Tea' },
  { id: 'TRAVEL', label: 'Travel', shortHint: 'Bus / Auto / Toll' },
  { id: 'OTHER', label: 'Other', shortHint: 'Site / Misc' },
];

export function getExpenseCategoryLabel(category: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === category)?.label || category;
}

/**
 * Lowercase policy category noun for human-readable warning banners
 * (e.g. "⚠️ Warning: This claim exceeds the ₹300 food limit." / "₹500 fuel limit.").
 */
export function getExpensePolicyCategoryNoun(category: ExpenseCategory): string {
  switch (category) {
    case 'FOOD':
      return 'food';
    case 'PETROL':
      return 'fuel';
    case 'TRAVEL':
      return 'travel';
    case 'OTHER':
    default:
      return 'other';
  }
}

/**
 * Converts a rupee amount (number or string) to an exact non-negative integer in paise
 * without IEEE 754 floating-point drift (e.g. "150.10" + "150.20" -> 15010 + 15020 = 30030).
 */
export function rupeesToPaise(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const raw =
    typeof value === 'number'
      ? Number.isFinite(value)
        ? value.toFixed(4)
        : ''
      : String(value).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();

  if (!raw || raw.startsWith('-')) return 0;

  const match = raw.match(/^(\d+)(?:\.(\d*))?$/);
  if (match) {
    const wholeRupees = parseInt(match[1], 10);
    const fracRaw = match[2] || '';
    const firstTwo = fracRaw.slice(0, 2).padEnd(2, '0');
    const thirdDigit = fracRaw.length >= 3 ? parseInt(fracRaw[2], 10) : 0;
    const paiseFrac = parseInt(firstTwo, 10) + (thirdDigit >= 5 ? 1 : 0);
    return Math.max(0, wholeRupees * 100 + paiseFrac);
  }

  const fallbackNum = Number(raw);
  if (!Number.isFinite(fallbackNum) || fallbackNum <= 0) return 0;
  return Math.max(0, Math.round(fallbackNum * 100));
}

export function paiseToRupees(paise: number): number {
  if (!Number.isFinite(paise) || paise <= 0) return 0;
  return Math.round(paise) / 100;
}

/**
 * Formats an integer paise value cleanly as Indian Rupees (e.g., 30000 -> "₹300", 30050 -> "₹300.50").
 */
export function formatPaiseAsRupees(paise: number): string {
  const safePaise = Math.max(0, Math.round(paise));
  const whole = Math.floor(safePaise / 100);
  const rem = safePaise % 100;
  const formattedWhole = whole.toLocaleString('en-IN');
  return rem === 0 ? `₹${formattedWhole}` : `₹${formattedWhole}.${String(rem).padStart(2, '0')}`;
}

export function getEffectiveExpensePolicy(orgSettings?: OrgSettings | null): ExpensePolicyConfig {
  const incoming = orgSettings?.expensePolicy;
  const rawLimits = incoming?.dailyLimitsPaise;
  return {
    enabled: incoming?.enabled ?? DEFAULT_EXPENSE_POLICY_CONFIG.enabled,
    requireOverrideNote:
      incoming?.requireOverrideNote ?? DEFAULT_EXPENSE_POLICY_CONFIG.requireOverrideNote,
    dailyLimitsPaise: {
      FOOD:
        typeof rawLimits?.FOOD === 'number' && Number.isFinite(rawLimits.FOOD)
          ? Math.max(0, Math.round(rawLimits.FOOD))
          : DEFAULT_EXPENSE_POLICY_CONFIG.dailyLimitsPaise.FOOD,
      PETROL:
        typeof rawLimits?.PETROL === 'number' && Number.isFinite(rawLimits.PETROL)
          ? Math.max(0, Math.round(rawLimits.PETROL))
          : DEFAULT_EXPENSE_POLICY_CONFIG.dailyLimitsPaise.PETROL,
      TRAVEL:
        typeof rawLimits?.TRAVEL === 'number' && Number.isFinite(rawLimits.TRAVEL)
          ? Math.max(0, Math.round(rawLimits.TRAVEL))
          : DEFAULT_EXPENSE_POLICY_CONFIG.dailyLimitsPaise.TRAVEL,
      OTHER:
        typeof rawLimits?.OTHER === 'number' && Number.isFinite(rawLimits.OTHER)
          ? Math.max(0, Math.round(rawLimits.OTHER))
          : DEFAULT_EXPENSE_POLICY_CONFIG.dailyLimitsPaise.OTHER,
    },
    updatedAt: incoming?.updatedAt,
    updatedBy: incoming?.updatedBy,
  };
}

export function hasPolicyWarning(
  claim?: Pick<ExpenseClaim, 'policyTags' | 'policyWarning'> | null
): boolean {
  if (!claim) return false;
  return Boolean(claim.policyWarning || claim.policyTags?.includes('POLICY_WARNING'));
}

/**
 * Automated Policy Guardrail evaluator:
 * - Aggregates all non-rejected claims for the same worker, category, and expense date.
 * - Uses strict integer paise arithmetic to prevent floating-point comparison errors.
 * - If cumulative daily total > daily limit, returns POLICY_WARNING details (claim is still created).
 */
export function evaluateExpenseDailyPolicy(params: {
  tenantId: string;
  workerId: string;
  category: ExpenseCategory;
  expenseDate: string;
  amountPaise: number;
  excludeClaimId?: string;
  createdAtIso?: string;
  existingClaims?: ExpenseClaim[];
  orgSettings?: OrgSettings | null;
}): ExpensePolicyWarningDetails | null {
  const policy = getEffectiveExpensePolicy(params.orgSettings);
  if (!policy.enabled) return null;

  const dailyLimitPaise = policy.dailyLimitsPaise[params.category];
  if (!Number.isFinite(dailyLimitPaise) || dailyLimitPaise <= 0) return null;

  const claimAmountPaise = Math.max(0, Math.round(params.amountPaise));
  const pool = params.existingClaims ?? readStoredClaims(params.tenantId);

  const targetTimeMs = params.createdAtIso ? new Date(params.createdAtIso).getTime() : null;

  const priorSameDayClaims = pool.filter((c) => {
    if (c.id === params.excludeClaimId) return false;
    if (c.status === 'REJECTED') return false;
    if (c.workerId !== params.workerId) return false;
    if (c.category !== params.category) return false;
    if (c.expenseDate !== params.expenseDate) return false;

    // When re-evaluating a stored claim chronologically, only aggregate claims submitted before it
    // so earlier within-limit claims (e.g. claims #1 & #2 of ₹150) stay clean while claim #3 flags.
    if (targetTimeMs !== null && Number.isFinite(targetTimeMs)) {
      const peerTimeMs = new Date(c.createdAt).getTime();
      if (Number.isFinite(peerTimeMs)) {
        if (peerTimeMs > targetTimeMs) return false;
        if (peerTimeMs === targetTimeMs && params.excludeClaimId && c.id > params.excludeClaimId) {
          return false;
        }
      }
    }
    return true;
  });

  const priorDailyTotalPaise = priorSameDayClaims.reduce((sum, c) => {
    const cPaise =
      typeof c.amountPaise === 'number' && Number.isFinite(c.amountPaise)
        ? Math.round(c.amountPaise)
        : rupeesToPaise(c.amount);
    return sum + cPaise;
  }, 0);

  const cumulativeDailyTotalPaise = priorDailyTotalPaise + claimAmountPaise;

  // Strict integer paise comparison (only exceeding the limit triggers POLICY_WARNING)
  if (cumulativeDailyTotalPaise <= dailyLimitPaise) {
    return null;
  }

  const exceededByPaise = cumulativeDailyTotalPaise - dailyLimitPaise;
  const formattedLimit = formatPaiseAsRupees(dailyLimitPaise);
  const categoryNoun = getExpensePolicyCategoryNoun(params.category);

  return {
    tag: 'POLICY_WARNING',
    category: params.category,
    expenseDate: params.expenseDate,
    dailyLimitPaise,
    dailyLimitRupees: paiseToRupees(dailyLimitPaise),
    priorDailyTotalPaise,
    claimAmountPaise,
    cumulativeDailyTotalPaise,
    exceededByPaise,
    sameDayClaimCount: priorSameDayClaims.length + 1,
    bannerMessage: `⚠️ Warning: This claim exceeds the ${formattedLimit} ${categoryNoun} limit.`,
  };
}

/**
 * Formats a Date into local YYYY-MM-DD so "Today" matches the worker's calendar date.
 */
export function getLocalTodayIsoDate(referenceNow: Date = new Date()): string {
  const year = referenceNow.getFullYear();
  const month = String(referenceNow.getMonth() + 1).padStart(2, '0');
  const day = String(referenceNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getOffsetIsoDate(daysAgo: number, referenceNow: Date = new Date()): string {
  const d = new Date(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate() - daysAgo
  );
  return getLocalTodayIsoDate(d);
}

/**
 * Computes the earliest allowed expense date (30 days before referenceNow).
 */
export function getMinAllowedExpenseDate(referenceNow: Date = new Date()): string {
  return getOffsetIsoDate(MAX_EXPENSE_PAST_DAYS, referenceNow);
}

/**
 * Validates expense date:
 * - Must be valid YYYY-MM-DD.
 * - Cannot be in the future.
 * - Allows up to 30 days in the past; beyond 30 days blocks submission and directs worker to HR.
 */
export function validateExpenseDate(
  expenseDate: string,
  referenceNow: Date = new Date()
): {
  valid: boolean;
  daysAgo?: number;
  errorCode?: 'INVALID_FORMAT' | 'FUTURE_DATE' | 'PAST_DATE_EXCEEDED';
  message?: string;
} {
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate.trim())) {
    return {
      valid: false,
      errorCode: 'INVALID_FORMAT',
      message: 'Please select a valid expense date.',
    };
  }

  const [y, m, d] = expenseDate.trim().split('-').map((n) => parseInt(n, 10));
  const pickedUtcMidnight = Date.UTC(y, m - 1, d);
  const pickedCheck = new Date(pickedUtcMidnight);
  if (
    pickedCheck.getUTCFullYear() !== y ||
    pickedCheck.getUTCMonth() !== m - 1 ||
    pickedCheck.getUTCDate() !== d
  ) {
    return {
      valid: false,
      errorCode: 'INVALID_FORMAT',
      message: 'Please select a valid calendar date.',
    };
  }

  const todayUtcMidnight = Date.UTC(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate()
  );

  const diffDays = Math.round((todayUtcMidnight - pickedUtcMidnight) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    return {
      valid: false,
      daysAgo: diffDays,
      errorCode: 'FUTURE_DATE',
      message: 'Expense date cannot be in the future.',
    };
  }

  if (diffDays > MAX_EXPENSE_PAST_DAYS) {
    return {
      valid: false,
      daysAgo: diffDays,
      errorCode: 'PAST_DATE_EXCEEDED',
      message: `Expenses older than ${MAX_EXPENSE_PAST_DAYS} days cannot be submitted here. Please contact HR.`,
    };
  }

  return { valid: true, daysAgo: diffDays };
}

/**
 * Validates numeric expense amount (₹).
 */
export function validateExpenseAmount(rawAmount: string | number): {
  valid: boolean;
  amount: number;
  amountPaise: number;
  message?: string;
} {
  const cleaned =
    typeof rawAmount === 'number'
      ? String(rawAmount)
      : String(rawAmount || '').replace(/[^\d.]/g, '').trim();

  const amountPaise = rupeesToPaise(cleaned);
  if (!cleaned || amountPaise <= 0) {
    return {
      valid: false,
      amount: 0,
      amountPaise: 0,
      message: 'Enter a valid expense amount greater than ₹0.',
    };
  }

  const maxAmountPaise = MAX_EXPENSE_AMOUNT_INR * 100;
  const rounded = paiseToRupees(amountPaise);
  if (amountPaise > maxAmountPaise) {
    return {
      valid: false,
      amount: rounded,
      amountPaise,
      message: `Single tap claim limit is ₹${MAX_EXPENSE_AMOUNT_INR.toLocaleString('en-IN')}. Contact HR for larger bills.`,
    };
  }

  return { valid: true, amount: rounded, amountPaise };
}

/**
 * Decodes a data URL's base64 payload into raw bytes so hashing inspects exact image contents
 * regardless of minor metadata wrappers.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64Part = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  try {
    if (typeof atob === 'function') {
      const binary = atob(base64Part);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
  } catch {
    // Fall back to UTF-8 encoding of string below
  }

  return new TextEncoder().encode(base64Part);
}

/**
 * Calculates a deterministic SHA-256 image hash of the captured receipt photo.
 * Identical receipt images uploaded twice (even by different workers) yield the exact same hash.
 */
export async function computeReceiptImageHash(imageDataUrl: string): Promise<string> {
  const bytes = dataUrlToBytes(imageDataUrl.trim());
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (err) {
    console.warn('[ExpenseService] Web Crypto SHA-256 fallback engaged:', err);
  }

  // Deterministic 64-bit FNV-1a hex fallback for environments without SubtleCrypto
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i];
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `fnv_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}_${bytes.length}`;
}

export interface TeamManagerEntry {
  uid: string;
  name?: string;
  email?: string;
  role?: Role;
  branchId?: string;
  branchName?: string;
}

export interface ResolvedExpenseApprover {
  approverId: string;
  approverName: string;
  approverRole: Role;
  originalApproverId: string;
  originalApproverName: string;
  routingRuleApplied: ExpenseRoutingRule;
  routingReason: string;
  delegatedFromManagerId?: string;
  delegatedFromManagerName?: string;
  isSelfApprovalBlocked: boolean;
  isDelegated: boolean;
}

function normalizeBranchKey(branchId?: string): string {
  const raw = (branchId || 'default').trim().toLowerCase();
  if (raw === 'main' || raw === 'default' || raw === 'head-office' || raw === '') {
    return 'default';
  }
  if (raw === 'north' || raw === 'branch-anand' || raw === 'anand') {
    return 'branch-anand';
  }
  return raw;
}

function normalizeDemoManagerId(uid?: string): string {
  if (!uid) return '';
  if (uid === 'demo-sup-1') return 'demo-manager-uid';
  return uid;
}

export function getTenantAdminInfo(tenantId: string): { uid: string; name: string } {
  if (!tenantId || tenantId === 'demo-tenant-id') {
    return {
      uid: 'demo-owner-uid',
      name: 'Rajesh Patel (Tenant Admin)',
    };
  }
  return {
    uid: `tenant-admin-${tenantId}`,
    name: 'Tenant Admin',
  };
}

/**
 * Checks whether an actor profile is the claimant of an expense (self-approval guard).
 */
export function isSelfExpenseClaim(
  claim: Pick<ExpenseClaim, 'workerId' | 'submittedByUserId'>,
  actor?: Partial<UserProfile> | null
): boolean {
  if (!actor) return false;
  const actorUid = normalizeDemoManagerId(actor.uid);
  const claimWorkerId = normalizeDemoManagerId(claim.workerId);
  const claimSubmitterId = normalizeDemoManagerId(claim.submittedByUserId);

  if (actorUid && (claimWorkerId === actorUid || (claimSubmitterId && claimSubmitterId === actorUid))) {
    return true;
  }
  if (actor.workerId && claim.workerId === actor.workerId) {
    return true;
  }
  return false;
}

/**
 * E300-R Expense Routing Engine:
 * 1. Resolves assigned branch manager as default approverId.
 * 2. Edge Case 1 (Self-Approval Block): If workerId == approverId (or submittedByUserId == approverId),
 *    automatically escalates and routes the claim to the Tenant Admin.
 * 3. Edge Case 2 (Manager On Leave / E300-R Delegation): If the assigned manager has an active
 *    delegation for the current date, routes the claim to the delegated manager (and still enforces
 *    self-approval prevention if the delegate happens to be the claimant).
 */
export function resolveExpenseApproverE300R(params: {
  tenantId: string;
  workerId: string;
  workerName?: string;
  branchId?: string;
  submittedByUserId?: string;
  managerNameHint?: string;
  team?: TeamManagerEntry[];
  orgSettings?: OrgSettings | null;
  delegations?: ManagerDelegation[];
  referenceDate?: string;
}): ResolvedExpenseApprover {
  const {
    tenantId,
    workerId,
    branchId,
    submittedByUserId,
    managerNameHint,
    team = [],
    orgSettings,
    delegations = [],
    referenceDate = getLocalTodayIsoDate(),
  } = params;

  const tenantAdmin = getTenantAdminInfo(tenantId);
  const normalizedBranch = normalizeBranchKey(branchId);
  const normalizedWorkerId = normalizeDemoManagerId(workerId);
  const normalizedSubmitterId = normalizeDemoManagerId(submittedByUserId);

  // 1. Resolve default branch manager
  let baseApproverId = '';
  let baseApproverName = '';

  const branchManagerMatch = team.find(
    (m) => normalizeBranchKey(m.branchId) === normalizedBranch
  );

  if (branchManagerMatch) {
    baseApproverId = normalizeDemoManagerId(branchManagerMatch.uid);
    baseApproverName = (branchManagerMatch.name || 'Branch Manager').replace(/^Manager\s+/i, '').trim();
  } else if (orgSettings?.branches?.length && branchId) {
    const branch = orgSettings.branches.find((b) => b.id === branchId) as
      | (Branch & { managerId?: string; managerName?: string; supervisorName?: string })
      | undefined;
    if (branch?.managerId || branch?.managerName || branch?.supervisorName) {
      baseApproverId = normalizeDemoManagerId(branch.managerId || `mgr-${normalizedBranch}`);
      baseApproverName = (branch.managerName || branch.supervisorName || 'Branch Manager')
        .replace(/^Manager\s+/i, '')
        .trim();
    }
  }

  // Fallback to default Main Branch Manager or Tenant Admin
  if (!baseApproverId) {
    if (tenantId === 'demo-tenant-id') {
      if (normalizedBranch === 'branch-anand') {
        baseApproverId = 'demo-sup-2';
        baseApproverName = 'Neha Desai';
      } else {
        baseApproverId = 'demo-manager-uid';
        baseApproverName = managerNameHint?.replace(/^Manager\s+/i, '').trim() || 'Vikram Joshi';
      }
    } else if (team.length > 0) {
      baseApproverId = normalizeDemoManagerId(team[0].uid);
      baseApproverName = (team[0].name || 'Branch Manager').replace(/^Manager\s+/i, '').trim();
    } else {
      return {
        approverId: tenantAdmin.uid,
        approverName: tenantAdmin.name,
        approverRole: 'TENANT_ADMIN',
        originalApproverId: tenantAdmin.uid,
        originalApproverName: tenantAdmin.name,
        routingRuleApplied: 'TENANT_ADMIN_FALLBACK',
        routingReason: 'No branch manager configured — routed to Tenant Admin.',
        isSelfApprovalBlocked: false,
        isDelegated: false,
      };
    }
  }

  // 2. Edge Case 1: Manager tries to claim/approve their own expense -> auto-route to Tenant Admin
  const isSelfApprover =
    normalizedWorkerId === baseApproverId ||
    (Boolean(normalizedSubmitterId) && normalizedSubmitterId === baseApproverId);

  if (isSelfApprover) {
    return {
      approverId: tenantAdmin.uid,
      approverName: tenantAdmin.name,
      approverRole: 'TENANT_ADMIN',
      originalApproverId: baseApproverId,
      originalApproverName: baseApproverName,
      routingRuleApplied: 'SELF_APPROVAL_ESCALATED_TO_ADMIN',
      routingReason: `Self-approval blocked (workerId == approverId): auto-routed to ${tenantAdmin.name}.`,
      isSelfApprovalBlocked: true,
      isDelegated: false,
    };
  }

  // 3. Edge Case 2: Manager is on leave -> E300-R delegation rules route claim to delegated manager
  const activeDelegation = delegations.find((d) => {
    if (!d.isActive) return false;
    const delegationMgrId = normalizeDemoManagerId(d.managerId);
    if (delegationMgrId !== baseApproverId) return false;
    if (d.startDate && referenceDate < d.startDate) return false;
    if (d.endDate && referenceDate > d.endDate) return false;
    return true;
  });

  if (activeDelegation) {
    const delegateId = normalizeDemoManagerId(activeDelegation.delegateId);
    const delegateName = activeDelegation.delegateName || 'Delegated Manager';

    // Guard: if the delegated manager is ALSO the claimant, escalate to Tenant Admin
    if (
      normalizedWorkerId === delegateId ||
      (Boolean(normalizedSubmitterId) && normalizedSubmitterId === delegateId)
    ) {
      return {
        approverId: tenantAdmin.uid,
        approverName: tenantAdmin.name,
        approverRole: 'TENANT_ADMIN',
        originalApproverId: baseApproverId,
        originalApproverName: baseApproverName,
        delegatedFromManagerId: baseApproverId,
        delegatedFromManagerName: baseApproverName,
        routingRuleApplied: 'SELF_APPROVAL_ESCALATED_TO_ADMIN',
        routingReason: `Delegated manager ${delegateName} cannot self-approve — auto-routed to ${tenantAdmin.name}.`,
        isSelfApprovalBlocked: true,
        isDelegated: true,
      };
    }

    return {
      approverId: delegateId,
      approverName: delegateName,
      approverRole: 'MANAGER',
      originalApproverId: baseApproverId,
      originalApproverName: baseApproverName,
      delegatedFromManagerId: baseApproverId,
      delegatedFromManagerName: baseApproverName,
      routingRuleApplied: 'DELEGATED_ON_LEAVE',
      routingReason: `Manager ${baseApproverName} is on leave (${activeDelegation.reason || 'On Leave'}) — routed to ${delegateName} via E300-R.`,
      isSelfApprovalBlocked: false,
      isDelegated: true,
    };
  }

  // 4. Standard E300-R Branch Manager routing
  return {
    approverId: baseApproverId,
    approverName: baseApproverName,
    approverRole: 'MANAGER',
    originalApproverId: baseApproverId,
    originalApproverName: baseApproverName,
    routingRuleApplied: 'BRANCH_MANAGER',
    routingReason: `Routed to Branch Manager ${baseApproverName} via E300-R.`,
    isSelfApprovalBlocked: false,
    isDelegated: false,
  };
}

/**
 * Resolves the assigned Manager name for status copy ("Submitted to Manager Vikram Joshi for approval.").
 */
export function resolveAssignedManagerName(
  tenantId: string,
  worker?: Partial<Worker> | null,
  orgSettings?: OrgSettings | null
): string {
  if (orgSettings?.branches?.length && worker?.branchId) {
    const branch = orgSettings.branches.find((b) => b.id === worker.branchId) as
      | (Branch & { managerName?: string; supervisorName?: string })
      | undefined;
    const branchMgr = branch?.managerName || branch?.supervisorName;
    if (branchMgr && branchMgr.trim()) {
      return branchMgr.trim().replace(/^Manager\s+/i, '');
    }
  }

  const rawManager =
    (worker as (Partial<Worker> & { managerName?: string; supervisorName?: string }) | null)
      ?.managerName ||
    (worker as (Partial<Worker> & { managerName?: string; supervisorName?: string }) | null)
      ?.supervisorName;

  if (rawManager && rawManager.trim()) {
    return rawManager.trim().replace(/^Manager\s+/i, '');
  }

  if (tenantId === 'demo-tenant-id') {
    const normalized = normalizeBranchKey(worker?.branchId);
    return normalized === 'branch-anand' ? 'Neha Desai' : 'Vikram Joshi';
  }

  return 'Vikram Joshi';
}

/**
 * Generates crisp, realistic printed Indian thermal receipt photos as self-contained SVG data URLs
 * so seeded expense claims work offline and render with crystal clarity in full-screen inspection.
 */
export function createSampleReceiptDataUrl(spec: {
  merchant: string;
  address: string;
  gstin: string;
  billNo: string;
  date: string;
  time: string;
  categoryLabel: string;
  items: Array<{ desc: string; qty: string; total: string }>;
  subtotal: string;
  tax: string;
  grandTotal: string;
  paymentMode: string;
  accentColor: string;
}): string {
  const itemRowsSvg = spec.items
    .map(
      (item, idx) => `
      <text x="34" y="${262 + idx * 34}" font-family="monospace" font-size="13" fill="#0f172a" font-weight="600">${item.desc}</text>
      <text x="34" y="${278 + idx * 34}" font-family="monospace" font-size="11" fill="#64748b">${item.qty}</text>
      <text x="386" y="${268 + idx * 34}" text-anchor="end" font-family="monospace" font-size="13" fill="#0f172a" font-weight="700">${item.total}</text>
    `
    )
    .join('');

  const dividerY = 262 + spec.items.length * 34 + 14;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="580" viewBox="0 0 420 580">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="420" height="580" fill="url(#bg)"/>
  <g filter="url(#shadow)">
    <rect x="20" y="20" width="380" height="540" rx="8" fill="#ffffff"/>
    <rect x="20" y="20" width="380" height="10" rx="4" fill="${spec.accentColor}"/>
  </g>
  <text x="210" y="64" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="800" fill="#0f172a">${spec.merchant}</text>
  <text x="210" y="84" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#475569">${spec.address}</text>
  <text x="210" y="102" text-anchor="middle" font-family="monospace" font-size="11" fill="#64748b">GSTIN: ${spec.gstin}</text>
  <line x1="34" y1="118" x2="386" y2="118" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,4"/>
  <text x="34" y="142" font-family="monospace" font-size="12" fill="#334155">BILL NO: ${spec.billNo}</text>
  <text x="386" y="142" text-anchor="end" font-family="monospace" font-size="12" fill="#334155">${spec.date}</text>
  <text x="34" y="162" font-family="monospace" font-size="12" fill="#334155">TIME: ${spec.time}</text>
  <text x="386" y="162" text-anchor="end" font-family="monospace" font-size="12" fill="${spec.accentColor}" font-weight="700">${spec.categoryLabel.toUpperCase()}</text>
  <line x1="34" y1="180" x2="386" y2="180" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,4"/>
  <text x="34" y="204" font-family="monospace" font-size="11" font-weight="700" fill="#64748b">ITEM / DESCRIPTION</text>
  <text x="386" y="204" text-anchor="end" font-family="monospace" font-size="11" font-weight="700" fill="#64748b">AMOUNT</text>
  <line x1="34" y1="216" x2="386" y2="216" stroke="#e2e8f0" stroke-width="1"/>
  ${itemRowsSvg}
  <line x1="34" y1="${dividerY}" x2="386" y2="${dividerY}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,4"/>
  <text x="34" y="${dividerY + 28}" font-family="monospace" font-size="12" fill="#475569">Sub-Total</text>
  <text x="386" y="${dividerY + 28}" text-anchor="end" font-family="monospace" font-size="12" fill="#475569">${spec.subtotal}</text>
  <text x="34" y="${dividerY + 48}" font-family="monospace" font-size="12" fill="#475569">Taxes / Cess</text>
  <text x="386" y="${dividerY + 48}" text-anchor="end" font-family="monospace" font-size="12" fill="#475569">${spec.tax}</text>
  <rect x="34" y="${dividerY + 62}" width="352" height="44" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="48" y="${dividerY + 90}" font-family="sans-serif" font-size="15" font-weight="800" fill="#0f172a">TOTAL PAID</text>
  <text x="372" y="${dividerY + 91}" text-anchor="end" font-family="monospace" font-size="22" font-weight="800" fill="#0f172a">${spec.grandTotal}</text>
  <text x="210" y="${dividerY + 132}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="700" fill="#059669">PAID VIA ${spec.paymentMode} • VERIFIED</text>
  <text x="210" y="534" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#94a3b8">LIVE CAMERA RECEIPT CAPTURE · THANK YOU</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getStorageKey(tenantId: string): string {
  return `${EXPENSE_CLAIMS_STORAGE_PREFIX}${tenantId}`;
}

function readStoredClaims(tenantId: string): ExpenseClaim[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredClaims(tenantId: string, claims: ExpenseClaim[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(getStorageKey(tenantId), JSON.stringify(claims));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('expenseClaimsChanged', {
          detail: { tenantId, count: claims.length },
        })
      );
    }
  } catch (err) {
    console.warn('[ExpenseService] Failed to persist expense claims:', err);
  }
}

function upsertStoredClaim(claim: ExpenseClaim): void {
  const existing = readStoredClaims(claim.tenantId);
  const idx = existing.findIndex((c) => c.id === claim.id);
  if (idx >= 0) {
    existing[idx] = claim;
  } else {
    existing.unshift(claim);
  }
  writeStoredClaims(claim.tenantId, existing);
}

export interface SubmitExpenseClaimParams {
  tenantId: string;
  worker: Pick<Worker, 'id' | 'name'> & Partial<Pick<Worker, 'phone' | 'designation' | 'branchId'>>;
  orgSettings?: OrgSettings | null;
  amount: number | string;
  category: ExpenseCategory;
  expenseDate: string;
  receiptImageDataUrl: string;
  captureSource: 'CAMERA_DIRECT' | 'GALLERY_BLOCKED';
  managerName?: string;
  submittedByUserId?: string;
  forceOffline?: boolean;
  referenceNow?: Date;
}

export interface SubmitExpenseClaimResult {
  success: boolean;
  claim?: ExpenseClaim;
  queuedOffline?: boolean;
  errorCode?:
    | 'GALLERY_UPLOAD_BLOCKED'
    | 'INVALID_AMOUNT'
    | 'INVALID_DATE'
    | 'PAST_DATE_EXCEEDED'
    | 'FUTURE_DATE'
    | 'MISSING_RECEIPT';
  error?: string;
}

export const expenseService = {
  /**
   * Ensures 3 realistic initial expense claims exist (including ₹150 Petrol, ₹280 Food, ₹420 Travel)
   * on first open so managers immediately see pending claims in Action Inbox.
   */
  async ensureSeededClaims(tenantId: string, workers: Worker[] = []): Promise<ExpenseClaim[]> {
    const existing = readStoredClaims(tenantId);
    const seedFlagKey = `${EXPENSE_SEEDED_FLAG_PREFIX}${tenantId}`;
    const alreadySeeded =
      typeof localStorage !== 'undefined' && localStorage.getItem(seedFlagKey) === 'true';

    if (alreadySeeded || existing.length > 0) {
      return existing;
    }

    const todayStr = getLocalTodayIsoDate();
    const yesterdayStr = getOffsetIsoDate(1);
    const twoDaysAgoStr = getOffsetIsoDate(2);

    const ramesh =
      workers.find((w) => w.name.toLowerCase().startsWith('ramesh')) ||
      workers[0] ||
      ({
        id: 'worker-1',
        name: 'Ramesh Sharma',
        phone: '9876543210',
        designation: 'CNC Operator',
        branchId: 'default',
      } as Worker);

    const priya =
      workers.find((w) => w.name.toLowerCase().startsWith('priya')) ||
      workers[1] ||
      ({
        id: 'worker-2',
        name: 'Priya Patel',
        phone: '9876543211',
        designation: 'Quality Inspector',
        branchId: 'default',
      } as Worker);

    const vikram =
      workers.find((w) => w.name.toLowerCase().startsWith('vikram')) ||
      workers[5] ||
      ({
        id: 'worker-6',
        name: 'Vikram Desai',
        phone: '9876543215',
        designation: 'Packer & Dispatch',
        branchId: 'default',
      } as Worker);

    const team: TeamManagerEntry[] = await dbService
      .getTeam(tenantId)
      .catch((): TeamManagerEntry[] => []);
    const delegations = inboxService.getDelegations(tenantId);

    const petrolReceipt = createSampleReceiptDataUrl({
      merchant: 'INDIANOIL AUTO FUEL STATION',
      address: 'GIDC Industrial Estate, Phase II, Ahmedabad',
      gstin: '24AAACI1681G1Z5',
      billNo: 'IOCL-88412',
      date: todayStr,
      time: '09:42 AM',
      categoryLabel: 'Petrol',
      items: [
        { desc: 'XP95 Petrol (Motorbike)', qty: '1.48 Ltr @ ₹101.35/L', total: '₹150.00' },
      ],
      subtotal: '₹150.00',
      tax: 'Incl. VAT',
      grandTotal: '₹150',
      paymentMode: 'UPI (GPay)',
      accentColor: '#0d9488',
    });

    const foodReceipt = createSampleReceiptDataUrl({
      merchant: 'SHREE KRISHNA SITE CANTEEN',
      address: 'Plot 14, Near Shed 4 Gate, GIDC Ahmedabad',
      gstin: '24ABKFS9021D1Z2',
      billNo: 'SKM-4109',
      date: yesterdayStr,
      time: '01:30 PM',
      categoryLabel: 'Food',
      items: [
        { desc: 'Client Visit Working Lunch', qty: '2 x Executive Thali', total: '₹240.00' },
        { desc: 'Masala Tea & Water', qty: '2 x Combo', total: '₹40.00' },
      ],
      subtotal: '₹266.67',
      tax: 'GST 5% ₹13.33',
      grandTotal: '₹280',
      paymentMode: 'CASH',
      accentColor: '#d97706',
    });

    const travelReceipt = createSampleReceiptDataUrl({
      merchant: 'GIDC DISPATCH & TOLL RECEIPT',
      address: 'SP Ring Road & Naroda Freight Corridor',
      gstin: '24AAECG4510K1Z8',
      billNo: 'TRV-2290',
      date: twoDaysAgoStr,
      time: '05:15 PM',
      categoryLabel: 'Travel',
      items: [
        { desc: 'Urgent Spare Parts Auto Fare', qty: 'GIDC Shed 4 → Naroda Hub', total: '₹340.00' },
        { desc: 'Ring Road Express Toll', qty: '1 x Single Pass', total: '₹80.00' },
      ],
      subtotal: '₹420.00',
      tax: 'Exempt',
      grandTotal: '₹420',
      paymentMode: 'UPI (PhonePe)',
      accentColor: '#2563eb',
    });

    const nowMs = Date.now();
    const rawSeeds: Array<{
      id: string;
      worker: Pick<Worker, 'id' | 'name' | 'phone' | 'designation' | 'branchId'>;
      amount: number;
      category: ExpenseCategory;
      expenseDate: string;
      receipt: string;
      offsetMins: number;
    }> = [
      {
        id: `exp_seed_petrol_150`,
        worker: { ...ramesh, branchId: 'default' },
        amount: 150,
        category: 'PETROL',
        expenseDate: todayStr,
        receipt: petrolReceipt,
        offsetMins: 12,
      },
      {
        id: `exp_seed_food_280`,
        worker: { ...priya, branchId: 'default' },
        amount: 280,
        category: 'FOOD',
        expenseDate: yesterdayStr,
        receipt: foodReceipt,
        offsetMins: 46,
      },
      {
        id: `exp_seed_travel_420`,
        worker: { ...vikram, branchId: 'default' },
        amount: 420,
        category: 'TRAVEL',
        expenseDate: twoDaysAgoStr,
        receipt: travelReceipt,
        offsetMins: 110,
      },
    ];

    const seededClaims: ExpenseClaim[] = [];
    const orgSettings = await dbService.getOrgSettings(tenantId).catch((): OrgSettings | null => null);
    for (const seed of rawSeeds) {
      const hash = await computeReceiptImageHash(seed.receipt);
      const routing = resolveExpenseApproverE300R({
        tenantId,
        workerId: seed.worker.id,
        workerName: seed.worker.name,
        branchId: seed.worker.branchId,
        team,
        orgSettings,
        delegations,
      });
      const ts = new Date(nowMs - seed.offsetMins * 60 * 1000).toISOString();
      const amountPaise = rupeesToPaise(seed.amount);
      const policyWarning = evaluateExpenseDailyPolicy({
        tenantId,
        workerId: seed.worker.id,
        category: seed.category,
        expenseDate: seed.expenseDate,
        amountPaise,
        excludeClaimId: seed.id,
        createdAtIso: ts,
        existingClaims: seededClaims,
        orgSettings,
      });
      const policyTags: ExpensePolicyTag[] = policyWarning ? ['POLICY_WARNING'] : [];

      seededClaims.push({
        id: seed.id,
        tenantId,
        workerId: seed.worker.id,
        workerName: seed.worker.name,
        workerPhone: seed.worker.phone,
        workerDesignation: seed.worker.designation,
        branchId: seed.worker.branchId,
        amount: seed.amount,
        amountPaise,
        category: seed.category,
        expenseDate: seed.expenseDate,
        receiptImageDataUrl: seed.receipt,
        receiptImageHash: hash,
        captureSource: 'CAMERA_DIRECT',
        status: 'SUBMITTED',
        syncStatus: 'SYNCED',
        managerName: routing.approverName,
        approverId: routing.approverId,
        approverName: routing.approverName,
        approverRole: routing.approverRole,
        originalApproverId: routing.originalApproverId,
        originalApproverName: routing.originalApproverName,
        routingRuleApplied: routing.routingRuleApplied,
        routingReason: routing.routingReason,
        delegatedFromManagerId: routing.delegatedFromManagerId,
        delegatedFromManagerName: routing.delegatedFromManagerName,
        statusMessage: policyWarning
          ? `Submitted to ${routing.approverName} with POLICY_WARNING (exceeds daily limit).`
          : `Submitted to ${routing.approverName} for approval.`,
        riskFlag: 'NONE',
        policyTags,
        policyWarning: policyWarning || undefined,
        createdAt: ts,
        syncedAt: ts,
      });
    }

    writeStoredClaims(tenantId, seededClaims);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(seedFlagKey, 'true');
    }
    return seededClaims;
  },

  /**
   * Returns all expense claims for a tenant, newest first.
   */
  getClaimsForTenant(tenantId: string): ExpenseClaim[] {
    return readStoredClaims(tenantId).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Returns all expense claims for a single worker, newest first.
   */
  getClaimsForWorker(tenantId: string, workerId: string): ExpenseClaim[] {
    return this.getClaimsForTenant(tenantId).filter((c: ExpenseClaim) => c.workerId === workerId);
  },

  /**
   * Checks whether any previously synced/submitted claim in the tenant (including by ANOTHER worker)
   * already used this exact receipt image SHA-256 hash.
   */
  findDuplicateReceiptClaim(
    tenantId: string,
    receiptImageHash: string,
    excludeClaimId?: string
  ): ExpenseClaim | null {
    if (!receiptImageHash) return null;
    const allClaims = readStoredClaims(tenantId);
    const match = allClaims.find(
      (c) =>
        c.id !== excludeClaimId &&
        c.receiptImageHash === receiptImageHash &&
        c.status !== 'PENDING_LOCAL'
    );
    return match || null;
  },

  /**
   * Re-evaluates E300-R routing AND daily category policy guardrails for a submitted expense claim
   * (e.g., when delegation is toggled, self-approval escalates, or Admin updates daily limits in Settings).
   */
  async reevaluateClaimRouting(
    claim: ExpenseClaim,
    options?: { team?: TeamManagerEntry[]; orgSettings?: OrgSettings | null; delegations?: ManagerDelegation[] }
  ): Promise<ExpenseClaim> {
    if (isClaimImmutable(claim) || claim.status !== 'SUBMITTED') return claim;

    const team: TeamManagerEntry[] =
      options?.team ?? (await dbService.getTeam(claim.tenantId).catch((): TeamManagerEntry[] => []));
    const orgSettings: OrgSettings | null =
      options?.orgSettings !== undefined
        ? options.orgSettings
        : await dbService.getOrgSettings(claim.tenantId).catch((): OrgSettings | null => null);
    const delegations = options?.delegations ?? inboxService.getDelegations(claim.tenantId);

    const routing = resolveExpenseApproverE300R({
      tenantId: claim.tenantId,
      workerId: claim.workerId,
      workerName: claim.workerName,
      branchId: claim.branchId,
      submittedByUserId: claim.submittedByUserId,
      managerNameHint: claim.managerName,
      team,
      orgSettings,
      delegations,
    });

    const amountPaise =
      typeof claim.amountPaise === 'number' && Number.isFinite(claim.amountPaise)
        ? Math.round(claim.amountPaise)
        : rupeesToPaise(claim.amount);

    const policyWarning = evaluateExpenseDailyPolicy({
      tenantId: claim.tenantId,
      workerId: claim.workerId,
      category: claim.category,
      expenseDate: claim.expenseDate,
      amountPaise,
      excludeClaimId: claim.id,
      createdAtIso: claim.createdAt,
      orgSettings,
    });
    const policyTags: ExpensePolicyTag[] = policyWarning ? ['POLICY_WARNING'] : [];

    const routingChanged =
      claim.approverId !== routing.approverId ||
      claim.approverName !== routing.approverName ||
      claim.routingRuleApplied !== routing.routingRuleApplied ||
      claim.delegatedFromManagerId !== routing.delegatedFromManagerId;

    const policyChanged =
      claim.amountPaise !== amountPaise ||
      JSON.stringify(claim.policyWarning || null) !== JSON.stringify(policyWarning || null) ||
      JSON.stringify(claim.policyTags || []) !== JSON.stringify(policyTags);

    if (!routingChanged && !policyChanged) return claim;

    const updated: ExpenseClaim = {
      ...claim,
      amountPaise,
      managerName: routing.approverName,
      approverId: routing.approverId,
      approverName: routing.approverName,
      approverRole: routing.approverRole,
      originalApproverId: routing.originalApproverId,
      originalApproverName: routing.originalApproverName,
      routingRuleApplied: routing.routingRuleApplied,
      routingReason: routing.routingReason,
      delegatedFromManagerId: routing.delegatedFromManagerId,
      delegatedFromManagerName: routing.delegatedFromManagerName,
      policyTags,
      policyWarning: policyWarning || undefined,
      statusMessage: routing.isSelfApprovalBlocked
        ? `Auto-routed to ${routing.approverName} (self-approval blocked).`
        : routing.isDelegated
        ? `Delegated to ${routing.approverName} (Manager ${routing.delegatedFromManagerName} on leave).`
        : policyWarning
        ? `Submitted to Manager ${routing.approverName} with POLICY_WARNING (exceeds daily limit).`
        : `Submitted to Manager ${routing.approverName} for approval.`,
    };

    upsertStoredClaim(updated);
    return updated;
  },

  /**
   * Syncs a claim to the server store, runs cross-worker duplicate image-hash detection,
   * runs integer-paise daily policy guardrails (aggregating same-day claims per worker & category),
   * applies E300-R routing (approverId, self-approval escalation, leave delegation),
   * and routes to Manager Action Inbox (E3).
   */
  async syncExpenseClaimToServer(
    claim: ExpenseClaim,
    orgSettings?: OrgSettings | null
  ): Promise<ExpenseClaim> {
    const duplicateMatch = this.findDuplicateReceiptClaim(
      claim.tenantId,
      claim.receiptImageHash,
      claim.id
    );

    const [team, resolvedOrgSettings] = await Promise.all([
      dbService.getTeam(claim.tenantId).catch((): TeamManagerEntry[] => []),
      orgSettings !== undefined && orgSettings !== null
        ? Promise.resolve(orgSettings)
        : dbService.getOrgSettings(claim.tenantId).catch((): OrgSettings | null => null),
    ]);
    const delegations = inboxService.getDelegations(claim.tenantId);

    const routing = resolveExpenseApproverE300R({
      tenantId: claim.tenantId,
      workerId: claim.workerId,
      workerName: claim.workerName,
      branchId: claim.branchId,
      submittedByUserId: claim.submittedByUserId,
      managerNameHint: claim.managerName,
      team,
      orgSettings: resolvedOrgSettings,
      delegations,
    });

    const amountPaise =
      typeof claim.amountPaise === 'number' && Number.isFinite(claim.amountPaise)
        ? Math.round(claim.amountPaise)
        : rupeesToPaise(claim.amount);

    const policyWarning = evaluateExpenseDailyPolicy({
      tenantId: claim.tenantId,
      workerId: claim.workerId,
      category: claim.category,
      expenseDate: claim.expenseDate,
      amountPaise,
      excludeClaimId: claim.id,
      createdAtIso: claim.createdAt,
      orgSettings: resolvedOrgSettings,
    });
    const policyTags: ExpensePolicyTag[] = policyWarning ? ['POLICY_WARNING'] : [];

    const nowIso = new Date().toISOString();
    const isDuplicate = Boolean(duplicateMatch);

    const baseStatusMessage = routing.isSelfApprovalBlocked
      ? `Self-approval blocked — routed automatically to ${routing.approverName}.`
      : routing.isDelegated
      ? `Manager ${routing.delegatedFromManagerName} on leave — delegated to ${routing.approverName}.`
      : `Submitted to Manager ${routing.approverName} for approval.`;

    const statusMessage = policyWarning
      ? `${baseStatusMessage} Flagged with POLICY_WARNING (${formatPaiseAsRupees(policyWarning.cumulativeDailyTotalPaise)} vs ${formatPaiseAsRupees(policyWarning.dailyLimitPaise)}/day limit).`
      : baseStatusMessage;

    const syncedClaim: ExpenseClaim = {
      ...claim,
      amountPaise,
      status: 'SUBMITTED',
      syncStatus: 'SYNCED',
      syncedAt: nowIso,
      managerName: routing.approverName,
      approverId: routing.approverId,
      approverName: routing.approverName,
      approverRole: routing.approverRole,
      originalApproverId: routing.originalApproverId,
      originalApproverName: routing.originalApproverName,
      routingRuleApplied: routing.routingRuleApplied,
      routingReason: routing.routingReason,
      delegatedFromManagerId: routing.delegatedFromManagerId,
      delegatedFromManagerName: routing.delegatedFromManagerName,
      statusMessage,
      riskFlag: isDuplicate ? 'HIGH_RISK_DUPLICATE' : 'NONE',
      policyTags,
      policyWarning: policyWarning || undefined,
      ...(duplicateMatch
        ? {
            duplicateOfClaimId: duplicateMatch.id,
            duplicateOfWorkerId: duplicateMatch.workerId,
            duplicateOfWorkerName: duplicateMatch.workerName,
            duplicateOfExpenseDate: duplicateMatch.expenseDate,
          }
        : {}),
    };

    upsertStoredClaim(syncedClaim);

    // Route directly to E3 Action Inbox with E300-R approverId metadata & POLICY_WARNING
    const categoryLabel = getExpenseCategoryLabel(syncedClaim.category);
    const description = duplicateMatch
      ? `HIGH_RISK_DUPLICATE: Identical receipt photo hash already submitted by ${duplicateMatch.workerName} on ${duplicateMatch.expenseDate}. Inspect carefully before approving.`
      : policyWarning
      ? `${policyWarning.bannerMessage} Same-day total: ${formatPaiseAsRupees(policyWarning.cumulativeDailyTotalPaise)} across ${policyWarning.sameDayClaimCount} claim${policyWarning.sameDayClaimCount === 1 ? '' : 's'}.`
      : `${categoryLabel} receipt for ${syncedClaim.expenseDate} captured via live camera.`;

    const inboxItem: InboxItem = {
      id: `inbox-expense-${syncedClaim.id}`,
      tenantId: syncedClaim.tenantId,
      branchId: syncedClaim.branchId,
      approverId: routing.approverId,
      approverName: routing.approverName,
      assignedToRole: routing.approverRole,
      assignedToUserId: routing.approverId,
      delegateUserId: routing.isDelegated ? routing.approverId : undefined,
      delegatedFromManagerId: routing.delegatedFromManagerId,
      delegatedFromManagerName: routing.delegatedFromManagerName,
      routingRuleApplied: routing.routingRuleApplied,
      routingReason: routing.routingReason,
      actionType: 'EXPENSE_APPROVAL',
      urgency: isDuplicate
        ? 'URGENT'
        : policyWarning || syncedClaim.amount > 1000
        ? 'HIGH'
        : 'NORMAL',
      status: 'PENDING',
      workerId: syncedClaim.workerId,
      workerName: syncedClaim.workerName,
      workerPhone: syncedClaim.workerPhone,
      workerDesignation: syncedClaim.workerDesignation,
      title: `${syncedClaim.workerName} claimed ${formatPaiseAsRupees(amountPaise)} for ${categoryLabel}`,
      description,
      timestamp: nowIso,
      amount: syncedClaim.amount,
      isLowRisk: false,
      details: {
        expenseClaim: syncedClaim,
        reason: `${categoryLabel} expense on ${syncedClaim.expenseDate}`,
      },
    };

    await inboxService.createCustomItem(syncedClaim.tenantId, inboxItem);

    return syncedClaim;
  },

  /**
   * Main worker submission entry point:
   * - Enforces direct camera capture only (blocks gallery uploads).
   * - Validates amount (exact integer paise) & 30-day past date limit.
   * - Aggregates same-day claims per worker & category; if total exceeds daily limit,
   *   claim is STILL created and tagged with POLICY_WARNING.
   * - Computes SHA-256 receipt image hash.
   * - Applies E300-R routing (approverId, self-approval block -> Tenant Admin, leave delegation).
   * - Queues to E2 IndexedDB offline queue (PENDING_LOCAL) when offline, or syncs immediately when online.
   */
  async submitExpenseClaim(params: SubmitExpenseClaimParams): Promise<SubmitExpenseClaimResult> {
    const now = params.referenceNow || new Date();

    // 1. Block gallery uploads on client side
    if (params.captureSource !== 'CAMERA_DIRECT') {
      return {
        success: false,
        errorCode: 'GALLERY_UPLOAD_BLOCKED',
        error:
          'Gallery uploads are blocked to prevent fake screenshots. Please take a live receipt photo using your camera.',
      };
    }

    // 2. Validate amount (exact integer paise)
    const amountCheck = validateExpenseAmount(params.amount);
    if (!amountCheck.valid) {
      return {
        success: false,
        errorCode: 'INVALID_AMOUNT',
        error: amountCheck.message,
      };
    }

    // 3. Validate date (up to 30 days past)
    const dateCheck = validateExpenseDate(params.expenseDate, now);
    if (!dateCheck.valid) {
      return {
        success: false,
        errorCode:
          dateCheck.errorCode === 'PAST_DATE_EXCEEDED'
            ? 'PAST_DATE_EXCEEDED'
            : dateCheck.errorCode === 'FUTURE_DATE'
            ? 'FUTURE_DATE'
            : 'INVALID_DATE',
        error: dateCheck.message,
      };
    }

    // 4. Require captured receipt photo
    if (!params.receiptImageDataUrl || !params.receiptImageDataUrl.startsWith('data:image/')) {
      return {
        success: false,
        errorCode: 'MISSING_RECEIPT',
        error: 'Please capture a live camera photo of the receipt before submitting.',
      };
    }

    // 5. Resolve latest orgSettings for daily limits & compute SHA-256 hash
    const resolvedOrgSettings =
      params.orgSettings !== undefined && params.orgSettings !== null
        ? params.orgSettings
        : await dbService.getOrgSettings(params.tenantId).catch((): OrgSettings | null => null);

    const receiptImageHash = await computeReceiptImageHash(params.receiptImageDataUrl);
    const managerName =
      params.managerName?.trim().replace(/^Manager\s+/i, '') ||
      resolveAssignedManagerName(params.tenantId, params.worker, resolvedOrgSettings);

    const nowIso = now.toISOString();
    const claimId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 6. Evaluate Automated Policy Guardrails in integer paise (still creates claim if exceeded)
    const policyWarning = evaluateExpenseDailyPolicy({
      tenantId: params.tenantId,
      workerId: params.worker.id,
      category: params.category,
      expenseDate: params.expenseDate,
      amountPaise: amountCheck.amountPaise,
      excludeClaimId: claimId,
      orgSettings: resolvedOrgSettings,
    });
    const policyTags: ExpensePolicyTag[] = policyWarning ? ['POLICY_WARNING'] : [];

    const baseClaim: ExpenseClaim = {
      id: claimId,
      tenantId: params.tenantId,
      workerId: params.worker.id,
      workerName: params.worker.name,
      workerPhone: params.worker.phone,
      workerDesignation: params.worker.designation,
      branchId: params.worker.branchId,
      submittedByUserId: params.submittedByUserId,
      amount: amountCheck.amount,
      amountPaise: amountCheck.amountPaise,
      category: params.category,
      expenseDate: params.expenseDate,
      receiptImageDataUrl: params.receiptImageDataUrl,
      receiptImageHash,
      captureSource: 'CAMERA_DIRECT',
      status: 'PENDING_LOCAL',
      syncStatus: 'PENDING_LOCAL',
      managerName,
      statusMessage: policyWarning
        ? 'Saved locally (PENDING_LOCAL) with POLICY_WARNING — will sync automatically when network returns.'
        : 'Saved locally (PENDING_LOCAL) — will sync automatically when network returns.',
      riskFlag: 'NONE',
      policyTags,
      policyWarning: policyWarning || undefined,
      createdAt: nowIso,
      offlineTimestamp: nowIso,
    };

    const isOffline =
      Boolean(params.forceOffline) ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);

    if (isOffline) {
      upsertStoredClaim(baseClaim);
      await syncService.enqueueRecord(
        'EXPENSE',
        baseClaim.id,
        baseClaim.tenantId,
        baseClaim.workerId,
        baseClaim.workerName,
        baseClaim
      );
      return {
        success: true,
        claim: baseClaim,
        queuedOffline: true,
      };
    }

    try {
      const synced = await this.syncExpenseClaimToServer(baseClaim, resolvedOrgSettings);
      return {
        success: true,
        claim: synced,
        queuedOffline: false,
      };
    } catch (err) {
      console.warn('[ExpenseService] Network error during submission; falling back to E2 offline queue:', err);
      upsertStoredClaim(baseClaim);
      await syncService.enqueueRecord(
        'EXPENSE',
        baseClaim.id,
        baseClaim.tenantId,
        baseClaim.workerId,
        baseClaim.workerName,
        baseClaim
      );
      return {
        success: true,
        claim: baseClaim,
        queuedOffline: true,
      };
    }
  },

  /**
   * Escalates an expense claim directly to the Tenant Admin when a self-approval attempt is detected.
   */
  escalateSelfExpenseToTenantAdmin(tenantId: string, claimId: string): ExpenseClaim | null {
    const claims = readStoredClaims(tenantId);
    const idx = claims.findIndex((c) => c.id === claimId);
    if (idx === -1) return null;

    const existing = claims[idx];
    assertClaimMutable(existing, 're-route');
    const tenantAdmin = getTenantAdminInfo(tenantId);
    const escalated: ExpenseClaim = {
      ...existing,
      managerName: tenantAdmin.name,
      approverId: tenantAdmin.uid,
      approverName: tenantAdmin.name,
      approverRole: 'TENANT_ADMIN',
      originalApproverId: existing.originalApproverId || existing.approverId,
      originalApproverName: existing.originalApproverName || existing.approverName,
      routingRuleApplied: 'SELF_APPROVAL_ESCALATED_TO_ADMIN',
      routingReason: `Self-approval blocked (workerId == approverId): auto-routed to ${tenantAdmin.name}.`,
      statusMessage: `Self-approval blocked — routed automatically to ${tenantAdmin.name}.`,
    };

    claims[idx] = escalated;
    writeStoredClaims(tenantId, claims);
    return escalated;
  },

  /**
   * Called by Manager Action Inbox when approving (-> PENDING_FINANCE) or rejecting (-> REJECTED) an expense claim.
   * - Enforces immutability: Finance-APPROVED claims cannot be modified.
   * - Blocks self-approval (workerId == approverId) and auto-routes to Tenant Admin.
   * - Enforces mandatory override note when approving a POLICY_WARNING claim.
   * - Enforces mandatory rejection reason on REJECTED.
   */
  updateExpenseClaimResolution(
    tenantId: string,
    claimId: string,
    status: Extract<ExpenseClaimStatus, 'PENDING_FINANCE' | 'APPROVED' | 'REJECTED'>,
    resolvedBy: string,
    notes?: string,
    actorContext?: {
      actorProfile?: Partial<UserProfile> | null;
      rejectionReasonCategory?: ExpenseRejectionReason;
      overrideNote?: string;
    }
  ): ExpenseClaim | null {
    const claims = readStoredClaims(tenantId);
    const idx = claims.findIndex((c) => c.id === claimId);
    if (idx === -1) return null;

    const current = claims[idx];
    assertClaimMutable(current, 'modify');
    const actor = actorContext?.actorProfile;

    // Hard server/service-level self-approval guard:
    // If a manager attempts to approve their own expense (workerId == approverId), block & auto-route to Tenant Admin.
    if (status !== 'REJECTED' && actor) {
      const isTenantAdminOrSuper =
        actor.role === 'TENANT_ADMIN' ||
        actor.role === 'FACTORY_OWNER' ||
        actor.role === 'SUPER_ADMIN';

      if (!isTenantAdminOrSuper && isSelfExpenseClaim(current, actor)) {
        this.escalateSelfExpenseToTenantAdmin(tenantId, claimId);
        throw new Error(
          'Self-approval blocked: You cannot approve your own expense claim. This claim has been automatically routed to the Tenant Admin.'
        );
      }
    }

    // Mandatory override note enforcement for POLICY_WARNING approvals
    const cleanOverrideNote = (actorContext?.overrideNote || '').trim();
    if (status !== 'REJECTED' && hasPolicyWarning(current)) {
      if (!cleanOverrideNote) {
        throw new Error(
          'Mandatory override note required: This claim exceeds the daily category limit (POLICY_WARNING). Enter an override note before approving.'
        );
      }
    }

    // Mandatory rejection reason enforcement
    if (status === 'REJECTED') {
      const reasonText = (notes || actorContext?.rejectionReasonCategory || '').trim();
      if (!reasonText) {
        throw new Error('Please select a rejection reason from the dropdown before rejecting this expense claim.');
      }
    }

    const nowIso = new Date().toISOString();
    const approverDisplay = actor?.name || current.approverName || current.managerName || resolvedBy;

    const updated: ExpenseClaim = {
      ...current,
      status,
      resolvedBy,
      resolvedAt: nowIso,
      ...(status === 'PENDING_FINANCE'
        ? {
            managerApprovedBy: resolvedBy,
            managerApprovedAt: nowIso,
          }
        : {}),
      ...(status === 'APPROVED'
        ? {
            isImmutable: true,
            financeApprovedBy: resolvedBy,
            financeApprovedAt: nowIso,
          }
        : {}),
      overrideNote:
        status !== 'REJECTED' && cleanOverrideNote ? cleanOverrideNote : current.overrideNote,
      rejectionReasonCategory:
        status === 'REJECTED' ? actorContext?.rejectionReasonCategory : undefined,
      rejectionReason:
        status === 'REJECTED'
          ? notes?.trim() || actorContext?.rejectionReasonCategory || 'Rejected by manager'
          : undefined,
      statusMessage:
        status === 'PENDING_FINANCE'
          ? cleanOverrideNote
            ? `Approved with policy override by ${approverDisplay} ("${cleanOverrideNote}") — Forwarded to Finance (PENDING_FINANCE).`
            : `Approved by ${approverDisplay} — Forwarded to Finance (PENDING_FINANCE).`
          : status === 'APPROVED'
          ? cleanOverrideNote
            ? `Approved with policy override by ${approverDisplay} ("${cleanOverrideNote}") — Immutable & locked.`
            : `Approved by ${approverDisplay} — Immutable & locked for payroll.`
          : `Rejected by ${approverDisplay}: ${notes?.trim() || actorContext?.rejectionReasonCategory}.`,
    };

    claims[idx] = updated;
    writeStoredClaims(tenantId, claims);
    return updated;
  },

  /**
   * Attempts to edit an expense claim. Strictly blocked once Finance approves (immutable).
   */
  editExpenseClaim(
    tenantId: string,
    claimId: string,
    patch: Partial<Pick<ExpenseClaim, 'amount' | 'category' | 'expenseDate' | 'financeNotes'>>
  ): ExpenseClaim {
    const claims = readStoredClaims(tenantId);
    const idx = claims.findIndex((c) => c.id === claimId);
    if (idx === -1) {
      throw new Error('Expense claim not found.');
    }
    const existing = claims[idx];
    assertClaimMutable(existing, 'edit');

    const nextAmount =
      typeof patch.amount === 'number' && Number.isFinite(patch.amount) && patch.amount > 0
        ? patch.amount
        : existing.amount;
    const updated: ExpenseClaim = {
      ...existing,
      ...patch,
      amount: nextAmount,
      amountPaise: rupeesToPaise(nextAmount),
    };
    claims[idx] = updated;
    writeStoredClaims(tenantId, claims);
    return updated;
  },

  /**
   * Attempts to delete an expense claim. Strictly blocked once Finance approves (immutable).
   */
  deleteExpenseClaim(tenantId: string, claimId: string): void {
    const claims = readStoredClaims(tenantId);
    const existing = claims.find((c) => c.id === claimId);
    if (!existing) {
      throw new Error('Expense claim not found.');
    }
    assertClaimMutable(existing, 'delete');
    const remaining = claims.filter((c) => c.id !== claimId);
    writeStoredClaims(tenantId, remaining);
  },

  /**
   * Returns count of PENDING_FINANCE claims for Sidebar / KPI badges.
   */
  getPendingFinanceCount(tenantId: string): number {
    return readStoredClaims(tenantId).filter((c) => c.status === 'PENDING_FINANCE').length;
  },

  /**
   * Returns all claims currently awaiting Finance verification (status === 'PENDING_FINANCE').
   */
  getPendingFinanceClaims(tenantId: string): ExpenseClaim[] {
    return this.getClaimsForTenant(tenantId).filter((c) => c.status === 'PENDING_FINANCE');
  },

  /**
   * Payroll-month lock state helpers.
   */
  isPayrollMonthLocked(tenantId: string, payrollMonth: string): boolean {
    return isPayrollMonthLocked(tenantId, payrollMonth);
  },

  getPayrollMonthLockInfo(tenantId: string, payrollMonth: string): PayrollMonthLockInfo | null {
    return getPayrollMonthLockInfo(tenantId, payrollMonth);
  },

  setPayrollMonthLocked(
    tenantId: string,
    payrollMonth: string,
    locked: boolean,
    actorName: string
  ): PayrollMonthLockInfo {
    return setPayrollMonthLocked(tenantId, payrollMonth, locked, actorName);
  },

  /**
   * Finance Verification & Bulk Approval:
   * - Accessible strictly to TENANT_ADMIN (or FACTORY_OWNER / SUPER_ADMIN) and FINANCE roles.
   * - Transitions PENDING_FINANCE claims -> APPROVED and marks them permanently immutable.
   * - Edge Case 1 (Worker Resigned/Exited): Keeps claim in system and routes to Full & Final (FnF)
   *   settlement (payoutDestination = 'FNF_SETTLEMENT'), never regular payroll.
   * - Edge Case 2 (Claim Approved Mid-Payroll while payroll is already locked): Pushes claim to
   *   next month's payroll (payoutDestination = 'NEXT_MONTH_PAYROLL') and notifies the worker.
   */
  financeApproveClaims(params: {
    tenantId: string;
    claimIds: string[];
    financeActor: Partial<UserProfile> | null;
    payrollMonth: string;
    workers?: Worker[];
    notes?: string;
  }): FinanceBulkApprovalResult {
    const actorRole = String(params.financeActor?.role || '').toUpperCase();
    const canApproveFinance =
      actorRole === 'FINANCE' ||
      actorRole === 'FINANCE_ADMIN' ||
      actorRole === 'TENANT_ADMIN' ||
      actorRole === 'FACTORY_OWNER' ||
      actorRole === 'SUPER_ADMIN';

    if (!canApproveFinance) {
      throw new Error('Access denied: Only Finance Admin or Tenant Admin can verify and lock expense claims.');
    }

    const uniqueIds = Array.from(new Set(params.claimIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new Error('Select at least one PENDING_FINANCE claim to approve.');
    }

    const claims = readStoredClaims(params.tenantId);
    const workersById = new Map<string, Worker>((params.workers || []).map((w) => [w.id, w]));
    const payrollLocked = isPayrollMonthLocked(params.tenantId, params.payrollMonth);
    const nextMonth = getNextPayrollMonth(params.payrollMonth);
    const nowIso = new Date().toISOString();
    const actorDisplay =
      params.financeActor?.name || params.financeActor?.email || 'Finance Admin';

    const approvedClaims: ExpenseClaim[] = [];
    const skippedIds: string[] = [];
    const notificationsCreated: ExpenseWorkerNotification[] = [];
    let lockedForPayrollCount = 0;
    let deferredNextMonthCount = 0;
    let routedToFnfCount = 0;
    let totalApprovedAmountPaise = 0;

    for (const claimId of uniqueIds) {
      const idx = claims.findIndex((c) => c.id === claimId);
      if (idx === -1) {
        skippedIds.push(claimId);
        continue;
      }

      const current = claims[idx];
      if (isClaimImmutable(current) || current.status !== 'PENDING_FINANCE') {
        skippedIds.push(claimId);
        continue;
      }

      const matchedWorker = workersById.get(current.workerId);
      const resignedWorker =
        isWorkerResignedOrExited(matchedWorker) || Boolean(current.workerExitDate);
      const effectiveExitDate = matchedWorker?.dateOfExit || current.workerExitDate;

      let payoutDestination: ExpensePayoutDestination;
      let payrollLockStatus: ExpensePayrollLockStatus;
      let targetPayrollMonth: string | undefined;
      let deferredFromPayrollMonth: string | undefined;
      let fnfRoutingReason: string | undefined;
      let statusMessage: string;

      if (resignedWorker) {
        // Edge Case 1: Resigned worker — preserve claim and route strictly to Full & Final (FnF) settlement
        payoutDestination = 'FNF_SETTLEMENT';
        payrollLockStatus = 'ROUTED_TO_FNF';
        targetPayrollMonth = undefined;
        fnfRoutingReason = `Worker separated${
          effectiveExitDate ? ` on ${effectiveExitDate}` : ''
        } — routed to Full & Final (FnF) settlement (excluded from regular payroll).`;
        statusMessage = `Approved & Locked (Immutable) by ${actorDisplay} — Routed to Full & Final (FnF) Settlement.`;
        routedToFnfCount += 1;

        const fnfNotif = pushWorkerExpenseNotification(params.tenantId, {
          workerId: current.workerId,
          workerName: current.workerName,
          claimId: current.id,
          type: 'ROUTED_TO_FNF',
          title: 'Expense Claim Routed to Full & Final Settlement',
          message: `Your ₹${current.amount.toLocaleString('en-IN')} ${getExpenseCategoryLabel(
            current.category
          )} claim was approved by Finance and added to your Full & Final (FnF) settlement payout.`,
          amount: current.amount,
        });
        notificationsCreated.push(fnfNotif);
      } else if (payrollLocked) {
        // Edge Case 2: Payroll for current month is already locked -> push to next month & notify worker
        payoutDestination = 'NEXT_MONTH_PAYROLL';
        payrollLockStatus = 'DEFERRED_NEXT_MONTH';
        targetPayrollMonth = nextMonth;
        deferredFromPayrollMonth = params.payrollMonth;
        statusMessage = `Approved & Locked (Immutable) by ${actorDisplay} — ${formatPayrollMonthLabel(
          params.payrollMonth
        )} payroll was already locked; scheduled for ${formatPayrollMonthLabel(
          nextMonth
        )} payroll (worker notified).`;
        deferredNextMonthCount += 1;

        const deferNotif = pushWorkerExpenseNotification(params.tenantId, {
          workerId: current.workerId,
          workerName: current.workerName,
          claimId: current.id,
          type: 'DEFERRED_NEXT_MONTH_PAYROLL',
          title: `Expense Scheduled for ${formatPayrollMonthLabel(nextMonth)} Payroll`,
          message: `Your ₹${current.amount.toLocaleString('en-IN')} ${getExpenseCategoryLabel(
            current.category
          )} claim was verified by Finance after ${formatPayrollMonthLabel(
            params.payrollMonth
          )} payroll was locked. It has been queued for ${formatPayrollMonthLabel(
            nextMonth
          )} payroll.`,
          amount: current.amount,
          originalPayrollMonth: params.payrollMonth,
          targetPayrollMonth: nextMonth,
        });
        notificationsCreated.push(deferNotif);

        void dbService
          .addNotification({
            tenantId: params.tenantId,
            title: deferNotif.title,
            message: `${current.workerName}: ${deferNotif.message}`,
            type: 'INFO',
            read: false,
            createdAt: nowIso,
          })
          .catch(() => {});
      } else {
        // Normal Month-End Flow: Approved & locked for current month's payroll run
        payoutDestination = 'REGULAR_PAYROLL';
        payrollLockStatus = 'LOCKED_IN_PAYROLL';
        targetPayrollMonth = params.payrollMonth;
        statusMessage = `Approved & Locked (Immutable) by ${actorDisplay} for ${formatPayrollMonthLabel(
          params.payrollMonth
        )} Payroll.`;
        lockedForPayrollCount += 1;
      }

      const updated: ExpenseClaim = {
        ...current,
        status: 'APPROVED',
        isImmutable: true,
        financeApprovedBy: actorDisplay,
        financeApprovedAt: nowIso,
        financeNotes: params.notes?.trim() || current.financeNotes,
        resolvedBy: actorDisplay,
        resolvedAt: nowIso,
        payoutDestination,
        payrollLockStatus,
        payrollMonth: targetPayrollMonth,
        deferredFromPayrollMonth,
        lockedIntoPayrollAt: payoutDestination === 'REGULAR_PAYROLL' ? nowIso : undefined,
        lockedIntoPayrollBy: payoutDestination === 'REGULAR_PAYROLL' ? actorDisplay : undefined,
        fnfRoutingReason,
        workerExitDate: effectiveExitDate,
        statusMessage,
      };

      claims[idx] = updated;
      approvedClaims.push(updated);
      totalApprovedAmountPaise +=
        typeof updated.amountPaise === 'number'
          ? updated.amountPaise
          : rupeesToPaise(updated.amount);
    }

    if (approvedClaims.length > 0) {
      writeStoredClaims(params.tenantId, claims);
    }

    return {
      approvedClaims,
      lockedForPayrollCount,
      deferredNextMonthCount,
      routedToFnfCount,
      skippedIds,
      notificationsCreated,
      totalApprovedAmountPaise,
    };
  },

  /**
   * Rejects a specific PENDING_FINANCE claim during Finance verification.
   * Blocks rejection of immutable APPROVED claims and requires a mandatory reason.
   */
  financeRejectClaim(params: {
    tenantId: string;
    claimId: string;
    financeActor: Partial<UserProfile> | null;
    reasonCategory: ExpenseRejectionReason;
    additionalNote?: string;
  }): ExpenseClaim {
    const actorRole = String(params.financeActor?.role || '').toUpperCase();
    const canRejectFinance =
      actorRole === 'FINANCE' ||
      actorRole === 'FINANCE_ADMIN' ||
      actorRole === 'TENANT_ADMIN' ||
      actorRole === 'FACTORY_OWNER' ||
      actorRole === 'SUPER_ADMIN';

    if (!canRejectFinance) {
      throw new Error('Access denied: Only Finance Admin or Tenant Admin can reject claims in Finance Verification.');
    }

    const claims = readStoredClaims(params.tenantId);
    const idx = claims.findIndex((c) => c.id === params.claimId);
    if (idx === -1) {
      throw new Error('Expense claim not found.');
    }

    const current = claims[idx];
    assertClaimMutable(current, 'reject');
    if (current.status !== 'PENDING_FINANCE') {
      throw new Error(`Only PENDING_FINANCE claims can be rejected in Finance Dashboard (current status: ${current.status}).`);
    }

    const reasonText = params.additionalNote?.trim()
      ? `${params.reasonCategory}: ${params.additionalNote.trim()}`
      : params.reasonCategory;

    if (!reasonText.trim()) {
      throw new Error('Please select a rejection reason before rejecting this claim.');
    }

    const nowIso = new Date().toISOString();
    const actorDisplay =
      params.financeActor?.name || params.financeActor?.email || 'Finance Admin';

    const updated: ExpenseClaim = {
      ...current,
      status: 'REJECTED',
      financeRejectedBy: actorDisplay,
      financeRejectedAt: nowIso,
      resolvedBy: actorDisplay,
      resolvedAt: nowIso,
      rejectionReasonCategory: params.reasonCategory,
      rejectionReason: reasonText,
      statusMessage: `Rejected by Finance (${actorDisplay}): ${reasonText}`,
    };

    claims[idx] = updated;
    writeStoredClaims(params.tenantId, claims);

    pushWorkerExpenseNotification(params.tenantId, {
      workerId: current.workerId,
      workerName: current.workerName,
      claimId: current.id,
      type: 'FINANCE_REJECTED',
      title: 'Expense Claim Rejected by Finance',
      message: `Your ₹${current.amount.toLocaleString('en-IN')} ${getExpenseCategoryLabel(
        current.category
      )} claim was rejected during Finance audit (${reasonText}).`,
      amount: current.amount,
    });

    return updated;
  },

  /**
   * Locks Finance-APPROVED claims into a payroll run.
   * Strictly enforces AC: Claims can ONLY be locked into a payroll run if status === 'APPROVED'.
   * Resigned workers' claims are never included in regular payroll (routed to FnF instead).
   */
  lockApprovedClaimsForPayroll(
    tenantId: string,
    payrollMonth: string,
    lockedBy: string,
    options?: { claimIds?: string[]; workers?: Worker[] }
  ): {
    lockedClaims: ExpenseClaim[];
    totalLockedAmount: number;
    excludedPendingCount: number;
    excludedFnfCount: number;
  } {
    const claims = readStoredClaims(tenantId);
    const workersById = new Map<string, Worker>((options?.workers || []).map((w) => [w.id, w]));

    if (options?.claimIds && options.claimIds.length > 0) {
      for (const reqId of options.claimIds) {
        const match = claims.find((c) => c.id === reqId);
        if (!match) {
          throw new Error(`Expense claim ${reqId} does not exist.`);
        }
        if (match.status !== 'APPROVED') {
          throw new Error(
            `Cannot lock claim ${reqId} (${match.status}): Claims can only be locked into a payroll run once Finance-APPROVED.`
          );
        }
      }
    }

    const nowIso = new Date().toISOString();
    const lockedClaims: ExpenseClaim[] = [];
    let excludedPendingCount = 0;
    let excludedFnfCount = 0;
    let changed = false;

    const updatedClaims = claims.map((claim) => {
      if (options?.claimIds && !options.claimIds.includes(claim.id)) {
        return claim;
      }

      const worker = workersById.get(claim.workerId);
      const isResigned =
        claim.payoutDestination === 'FNF_SETTLEMENT' ||
        isWorkerResignedOrExited(worker) ||
        Boolean(claim.workerExitDate);

      if (claim.status !== 'APPROVED') {
        if (claim.status === 'PENDING_FINANCE' || claim.status === 'SUBMITTED') {
          excludedPendingCount += 1;
        }
        return claim;
      }

      if (isResigned) {
        excludedFnfCount += 1;
        if (claim.payoutDestination !== 'FNF_SETTLEMENT') {
          changed = true;
          return {
            ...claim,
            payoutDestination: 'FNF_SETTLEMENT' as ExpensePayoutDestination,
            payrollLockStatus: 'ROUTED_TO_FNF' as ExpensePayrollLockStatus,
            payrollMonth: undefined,
            workerExitDate: worker?.dateOfExit || claim.workerExitDate,
            fnfRoutingReason:
              claim.fnfRoutingReason ||
              'Worker resigned/exited — routed to Full & Final (FnF) settlement.',
          };
        }
        return claim;
      }

      // Only include claims scheduled for this exact payroll month (or unscheduled APPROVED claims)
      const effectiveMonth = claim.payrollMonth || payrollMonth;
      if (effectiveMonth !== payrollMonth) {
        return claim;
      }

      changed = true;
      const lockedClaim: ExpenseClaim = {
        ...claim,
        isImmutable: true,
        payoutDestination:
          claim.payoutDestination === 'NEXT_MONTH_PAYROLL'
            ? 'REGULAR_PAYROLL'
            : claim.payoutDestination || 'REGULAR_PAYROLL',
        payrollLockStatus: 'LOCKED_IN_PAYROLL',
        payrollMonth,
        lockedIntoPayrollAt: claim.lockedIntoPayrollAt || nowIso,
        lockedIntoPayrollBy: claim.lockedIntoPayrollBy || lockedBy,
      };
      lockedClaims.push(lockedClaim);
      return lockedClaim;
    });

    if (changed) {
      writeStoredClaims(tenantId, updatedClaims);
    }

    setPayrollMonthLocked(tenantId, payrollMonth, true, lockedBy);

    const totalLockedAmountPaise = lockedClaims.reduce(
      (sum, c) => sum + (typeof c.amountPaise === 'number' ? c.amountPaise : rupeesToPaise(c.amount)),
      0
    );

    return {
      lockedClaims,
      totalLockedAmount: paiseToRupees(totalLockedAmountPaise),
      excludedPendingCount,
      excludedFnfCount,
    };
  },

  /**
   * Allows Finance Admin / Tenant Admin to flag an expense claim as TAXABLE (e.g. misclassified Gift or Bonus)
   * BEFORE payroll is finalized, so PayrollEngine adds it to Gross Taxable Salary instead of Reimbursements (Tax-Free).
   * Once PAID, tax classification is permanently locked.
   */
  setExpenseTaxClassification(params: {
    tenantId: string;
    claimId: string;
    taxClassification: ExpenseTaxClassification;
    financeActor: Partial<UserProfile> | null;
    reason?: string;
  }): ExpenseClaim {
    const actorRole = String(params.financeActor?.role || '').toUpperCase();
    const canClassify =
      actorRole === 'FINANCE' ||
      actorRole === 'FINANCE_ADMIN' ||
      actorRole === 'TENANT_ADMIN' ||
      actorRole === 'FACTORY_OWNER' ||
      actorRole === 'SUPER_ADMIN';

    if (!canClassify) {
      throw new Error(
        'Access denied: Only Finance Admin or Tenant Admin can change expense tax classification.'
      );
    }

    const claims = readStoredClaims(params.tenantId);
    const idx = claims.findIndex((c) => c.id === params.claimId);
    if (idx === -1) {
      throw new Error('Expense claim not found.');
    }

    const current = claims[idx];
    if (current.status === 'PAID') {
      throw new Error(
        'Cannot change taxability: This expense claim has already been PAID in a finalized payroll run.'
      );
    }
    if (current.status === 'REJECTED') {
      throw new Error('Cannot change taxability on a rejected expense claim.');
    }

    const actorDisplay =
      params.financeActor?.name || params.financeActor?.email || 'Finance Admin';
    const nowIso = new Date().toISOString();
    const cleanReason =
      params.taxClassification === 'TAXABLE'
        ? params.reason?.trim() || EXPENSE_TAXABLE_FLAG_REASONS[0]
        : undefined;

    const updated: ExpenseClaim = {
      ...current,
      taxClassification: params.taxClassification,
      taxableFlaggedBy: params.taxClassification === 'TAXABLE' ? actorDisplay : undefined,
      taxableFlaggedAt: params.taxClassification === 'TAXABLE' ? nowIso : undefined,
      taxableFlagReason: cleanReason,
      statusMessage:
        params.taxClassification === 'TAXABLE'
          ? `${current.status === 'APPROVED' ? 'Approved (Immutable)' : current.status} — Flagged TAXABLE by ${actorDisplay} (${cleanReason}); will be added to Gross Taxable Salary.`
          : current.status === 'APPROVED'
          ? `Approved & Locked (Immutable) by ${current.financeApprovedBy || actorDisplay} — Tax-Free Reimbursement.`
          : current.statusMessage,
    };

    claims[idx] = updated;
    writeStoredClaims(params.tenantId, claims);
    return updated;
  },

  /**
   * Authoritative PayrollEngine query: returns all APPROVED expense claims for a specific worker
   * and pay period (YYYY-MM), split cleanly into:
   *  - taxFreeClaims: added AFTER Net Salary under "Reimbursements (Tax-Free)" (excluded from Gross Taxable Salary)
   *  - taxableClaims: Finance-flagged TAXABLE items (e.g. Gift/Bonus) added into Gross Taxable Salary before tax computation.
   * Also excludes resigned workers' FnF claims and claims deferred to a different payroll month.
   */
  queryApprovedExpenseClaimsForPayroll(
    tenantId: string,
    workerId: string,
    payrollMonth: string,
    worker?: Partial<Worker> | null
  ): {
    allClaims: ExpenseClaim[];
    taxFreeClaims: ExpenseClaim[];
    taxableClaims: ExpenseClaim[];
    taxFreeTotal: number;
    taxableTotal: number;
    taxFreeLineItems: PayslipReimbursementLineItem[];
    taxableLineItems: PayslipReimbursementLineItem[];
  } {
    const claims = readStoredClaims(tenantId);
    const isResigned = isWorkerResignedOrExited(worker);

    const eligible = claims.filter((claim) => {
      if (claim.workerId !== workerId) return false;
      if (claim.status !== 'APPROVED') return false;
      if (claim.payoutDestination === 'FNF_SETTLEMENT') return false;
      if (isResigned || Boolean(claim.workerExitDate)) return false;
      const targetMonth = claim.payrollMonth || payrollMonth;
      return targetMonth === payrollMonth;
    });

    const taxFreeClaims: ExpenseClaim[] = [];
    const taxableClaims: ExpenseClaim[] = [];
    let taxFreePaise = 0;
    let taxablePaise = 0;

    for (const claim of eligible) {
      const paise =
        typeof claim.amountPaise === 'number' ? claim.amountPaise : rupeesToPaise(claim.amount);
      if (claim.taxClassification === 'TAXABLE') {
        taxableClaims.push(claim);
        taxablePaise += paise;
      } else {
        taxFreeClaims.push(claim);
        taxFreePaise += paise;
      }
    }

    const toLineItem = (c: ExpenseClaim): PayslipReimbursementLineItem => {
      const catLabel = getExpenseCategoryLabel(c.category);
      const isTaxable = c.taxClassification === 'TAXABLE';
      return {
        claimId: c.id,
        category: c.category,
        categoryLabel: catLabel,
        expenseDate: c.expenseDate,
        amount: paiseToRupees(
          typeof c.amountPaise === 'number' ? c.amountPaise : rupeesToPaise(c.amount)
        ),
        description: isTaxable
          ? `${catLabel} Claim (${c.expenseDate}) — Flagged Taxable: ${
              c.taxableFlagReason || 'Taxable Perquisite'
            }`
          : `${catLabel} Reimbursement (${c.expenseDate})`,
        status: c.status,
        taxClassification: isTaxable ? 'TAXABLE' : 'TAX_FREE',
        taxableFlagReason: c.taxableFlagReason,
      };
    };

    return {
      allClaims: eligible,
      taxFreeClaims,
      taxableClaims,
      taxFreeTotal: paiseToRupees(taxFreePaise),
      taxableTotal: paiseToRupees(taxablePaise),
      taxFreeLineItems: taxFreeClaims.map(toLineItem),
      taxableLineItems: taxableClaims.map(toLineItem),
    };
  },

  /**
   * Automatically updates all APPROVED claims included in a finalized payroll run from APPROVED -> PAID.
   * Preserves immutability and marks the payroll month locked.
   */
  markApprovedClaimsAsPaid(
    tenantId: string,
    payrollMonth: string,
    paidBy: string,
    options?: {
      workerIds?: string[];
      payrollIdByWorker?: Record<string, string>;
      workers?: Worker[];
    }
  ): {
    paidClaims: ExpenseClaim[];
    totalPaidTaxFreeAmount: number;
    totalPaidTaxableAmount: number;
  } {
    const claims = readStoredClaims(tenantId);
    const workersById = new Map<string, Worker>((options?.workers || []).map((w) => [w.id, w]));
    const allowedWorkerIds =
      options?.workerIds && options.workerIds.length > 0 ? new Set(options.workerIds) : null;

    const nowIso = new Date().toISOString();
    const paidClaims: ExpenseClaim[] = [];
    let taxFreePaise = 0;
    let taxablePaise = 0;
    let changed = false;

    const updatedClaims = claims.map((claim) => {
      if (claim.status !== 'APPROVED') return claim;
      if (allowedWorkerIds && !allowedWorkerIds.has(claim.workerId)) return claim;

      const w = workersById.get(claim.workerId);
      const isResigned =
        claim.payoutDestination === 'FNF_SETTLEMENT' ||
        isWorkerResignedOrExited(w) ||
        Boolean(claim.workerExitDate);
      if (isResigned) return claim;

      const effectiveMonth = claim.payrollMonth || payrollMonth;
      if (effectiveMonth !== payrollMonth) return claim;

      changed = true;
      const isTaxable = claim.taxClassification === 'TAXABLE';
      const paise =
        typeof claim.amountPaise === 'number' ? claim.amountPaise : rupeesToPaise(claim.amount);
      if (isTaxable) {
        taxablePaise += paise;
      } else {
        taxFreePaise += paise;
      }

      const paidClaim: ExpenseClaim = {
        ...claim,
        status: 'PAID',
        isImmutable: true,
        payoutDestination: 'REGULAR_PAYROLL',
        payrollLockStatus: 'LOCKED_IN_PAYROLL',
        payrollMonth,
        lockedIntoPayrollAt: claim.lockedIntoPayrollAt || nowIso,
        lockedIntoPayrollBy: claim.lockedIntoPayrollBy || paidBy,
        paidAt: nowIso,
        paidBy,
        paidInPayrollId:
          options?.payrollIdByWorker?.[claim.workerId] || `payroll_${claim.workerId}_${payrollMonth}`,
        paidInPayrollMonth: payrollMonth,
        statusMessage: isTaxable
          ? `Paid in ${formatPayrollMonthLabel(payrollMonth)} Payroll (Added to Gross Taxable Salary — Flagged Taxable).`
          : `Paid in ${formatPayrollMonthLabel(payrollMonth)} Payroll (Tax-Free Reimbursement).`,
      };
      paidClaims.push(paidClaim);
      return paidClaim;
    });

    if (changed) {
      writeStoredClaims(tenantId, updatedClaims);
    }

    setPayrollMonthLocked(tenantId, payrollMonth, true, paidBy);

    return {
      paidClaims,
      totalPaidTaxFreeAmount: paiseToRupees(taxFreePaise),
      totalPaidTaxableAmount: paiseToRupees(taxablePaise),
    };
  },

  /**
   * Returns Finance-APPROVED regular-payroll reimbursements grouped by workerId for a given YYYY-MM.
   * Strictly excludes PENDING_FINANCE, SUBMITTED, REJECTED, FnF-routed, and future-month claims.
   */
  getApprovedPayrollReimbursementsByWorker(
    tenantId: string,
    payrollMonth: string,
    workers?: Worker[]
  ): Map<
    string,
    {
      totalAmount: number;
      taxFreeTotal: number;
      taxableTotal: number;
      claims: ExpenseClaim[];
      taxFreeClaims: ExpenseClaim[];
      taxableClaims: ExpenseClaim[];
    }
  > {
    const claims = readStoredClaims(tenantId);
    const workersById = new Map<string, Worker>((workers || []).map((w) => [w.id, w]));
    const result = new Map<
      string,
      {
        totalAmount: number;
        taxFreeTotal: number;
        taxableTotal: number;
        claims: ExpenseClaim[];
        taxFreeClaims: ExpenseClaim[];
        taxableClaims: ExpenseClaim[];
      }
    >();

    for (const claim of claims) {
      if (claim.status !== 'APPROVED') continue;
      if (claim.payoutDestination === 'FNF_SETTLEMENT') continue;
      const w = workersById.get(claim.workerId);
      if (isWorkerResignedOrExited(w) || Boolean(claim.workerExitDate)) continue;
      if ((claim.payrollMonth || payrollMonth) !== payrollMonth) continue;

      const existing = result.get(claim.workerId) || {
        totalAmount: 0,
        taxFreeTotal: 0,
        taxableTotal: 0,
        claims: [],
        taxFreeClaims: [],
        taxableClaims: [],
      };
      const claimPaise =
        typeof claim.amountPaise === 'number' ? claim.amountPaise : rupeesToPaise(claim.amount);
      existing.totalAmount = paiseToRupees(rupeesToPaise(existing.totalAmount) + claimPaise);
      existing.claims.push(claim);
      if (claim.taxClassification === 'TAXABLE') {
        existing.taxableTotal = paiseToRupees(rupeesToPaise(existing.taxableTotal) + claimPaise);
        existing.taxableClaims.push(claim);
      } else {
        existing.taxFreeTotal = paiseToRupees(rupeesToPaise(existing.taxFreeTotal) + claimPaise);
        existing.taxFreeClaims.push(claim);
      }
      result.set(claim.workerId, existing);
    }

    return result;
  },

  /**
   * Returns all expense claims for an exited/resigned worker routed to (or held for) FnF settlement.
   * Never drops pending claims when a worker resigns.
   */
  getFnfExpenseClaimsForWorker(
    tenantId: string,
    workerId: string,
    worker?: Partial<Worker> | null
  ): {
    approvedForFnf: ExpenseClaim[];
    pendingForFnf: ExpenseClaim[];
    totalApprovedAmount: number;
    totalPendingAmount: number;
  } {
    const claims = this.getClaimsForWorker(tenantId, workerId);
    const isExited = isWorkerResignedOrExited(worker);

    const approvedForFnf = claims.filter(
      (c) =>
        c.status === 'APPROVED' &&
        (c.payoutDestination === 'FNF_SETTLEMENT' || isExited || Boolean(c.workerExitDate))
    );
    const pendingForFnf = claims.filter(
      (c) =>
        (c.status === 'PENDING_FINANCE' || c.status === 'SUBMITTED' || c.status === 'PENDING_LOCAL') &&
        (c.payoutDestination === 'FNF_SETTLEMENT' || isExited || Boolean(c.workerExitDate))
    );

    const sumPaise = (list: ExpenseClaim[]) =>
      list.reduce(
        (sum, c) => sum + (typeof c.amountPaise === 'number' ? c.amountPaise : rupeesToPaise(c.amount)),
        0
      );

    return {
      approvedForFnf,
      pendingForFnf,
      totalApprovedAmount: paiseToRupees(sumPaise(approvedForFnf)),
      totalPendingAmount: paiseToRupees(sumPaise(pendingForFnf)),
    };
  },

  /**
   * Worker Notification helpers (used when claims approved mid-payroll are deferred to next month).
   */
  getWorkerExpenseNotifications(tenantId: string, workerId?: string): ExpenseWorkerNotification[] {
    const list = readWorkerExpenseNotifications(tenantId);
    if (!workerId) return list;
    return list.filter((n) => n.workerId === workerId);
  },

  markWorkerExpenseNotificationRead(tenantId: string, notificationId: string): void {
    const list = readWorkerExpenseNotifications(tenantId);
    const updated = list.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
    writeWorkerExpenseNotifications(tenantId, updated);
  },

  /**
   * Seeds realistic manager-approved PENDING_FINANCE claims for Finance Dashboard demo & verification
   * (without altering the 3 SUBMITTED claims used by Manager Action Inbox).
   * Includes a policy-override claim and a resigned worker claim (Edge Case 1: FnF routing).
   */
  async ensureSeededFinanceClaims(tenantId: string, workers: Worker[] = []): Promise<ExpenseClaim[]> {
    const existing = readStoredClaims(tenantId);
    const flagKey = `${EXPENSE_FINANCE_SEEDED_FLAG_PREFIX}${tenantId}`;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey) === 'true') {
      return existing;
    }

    // Ensure base manager-inbox seeds exist first
    if (existing.length === 0) {
      await this.ensureSeededClaims(tenantId);
    }
    const baseClaims = readStoredClaims(tenantId);
    if (baseClaims.some((c) => c.status === 'PENDING_FINANCE')) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(flagKey, 'true');
      return baseClaims;
    }

    const fetchedWorkers =
      workers.length > 0
        ? workers
        : await dbService.getWorkers(tenantId).catch((): Worker[] => []);

    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = fmt(now);
    const d1 = fmt(new Date(now.getTime() - 1 * 86400000));
    const d2 = fmt(new Date(now.getTime() - 2 * 86400000));
    const d3 = fmt(new Date(now.getTime() - 3 * 86400000));
    const d4 = fmt(new Date(now.getTime() - 4 * 86400000));

    const w1 = fetchedWorkers[0] || ({ id: 'worker-1', name: 'Ramesh Sharma', designation: 'CNC Operator', branchId: 'default' } as Worker);
    const w2 = fetchedWorkers[1] || ({ id: 'worker-2', name: 'Suresh Yadav', designation: 'Floor Technician', branchId: 'default' } as Worker);
    const w3 = fetchedWorkers[2] || ({ id: 'worker-3', name: 'Priya Nair', designation: 'Quality Inspector', branchId: 'default' } as Worker);
    const w4 = fetchedWorkers[3] || ({ id: 'worker-4', name: 'Amit Kumar', designation: 'Dispatch Executive', branchId: 'default' } as Worker);
    const exitedWorker =
      fetchedWorkers.find((w) => isWorkerResignedOrExited(w)) ||
      ({
        id: 'worker-resigned-fnf',
        name: 'Karan Malhotra',
        phone: '9876501122',
        designation: 'Senior Welder (Resigned)',
        branchId: 'default',
        status: 'RESIGNED',
        dateOfExit: d2,
      } as Worker);

    const r1 = createSampleReceiptDataUrl({
      merchant: 'BPCL HIGHWAY FUEL MART',
      address: 'SG Highway, Near Makarba Crossing, Ahmedabad',
      gstin: '24AABCB2901K1Z1',
      billNo: 'BPCL-71024',
      date: d1,
      time: '10:15 AM',
      categoryLabel: 'Petrol',
      items: [{ desc: 'Unleaded Petrol (Client Delivery)', qty: '4.73 Ltr @ ₹101.48/L', total: '₹480.00' }],
      subtotal: '₹480.00',
      tax: 'Incl. VAT',
      grandTotal: '₹480',
      paymentMode: 'UPI (GPay)',
      accentColor: '#0f766e',
    });

    const r2 = createSampleReceiptDataUrl({
      merchant: 'ANNAPURNA INDUSTRIAL CANTEEN',
      address: 'GIDC Phase III, Vatva, Ahmedabad',
      gstin: '24AAFCA4412M1Z9',
      billNo: 'AIC-3308',
      date: d2,
      time: '02:05 PM',
      categoryLabel: 'Food',
      items: [{ desc: 'Vendor Audit Team Working Lunch', qty: '3 x Executive Meals', total: '₹360.00' }],
      subtotal: '₹342.86',
      tax: 'GST 5% ₹17.14',
      grandTotal: '₹360',
      paymentMode: 'UPI (PhonePe)',
      accentColor: '#b45309',
    });

    const r3 = createSampleReceiptDataUrl({
      merchant: 'GUJARAT EXPRESS LOGISTICS & TOLL',
      address: 'Ahmedabad - Vadodara Express Corridor',
      gstin: '24AADCG9104P1Z4',
      billNo: 'GEL-5521',
      date: d3,
      time: '04:40 PM',
      categoryLabel: 'Travel',
      items: [
        { desc: 'Inter-plant Spare Transfer Cab', qty: 'Round Trip 42 km', total: '₹720.00' },
        { desc: 'Expressway Toll Receipt', qty: '2 x Passes', total: '₹130.00' },
      ],
      subtotal: '₹850.00',
      tax: 'Exempt',
      grandTotal: '₹850',
      paymentMode: 'UPI (Paytm)',
      accentColor: '#1d4ed8',
    });

    const r4 = createSampleReceiptDataUrl({
      merchant: 'PATEL INDUSTRIAL HARDWARE & TOOLS',
      address: 'Odhav Industrial Estate, Ahmedabad',
      gstin: '24AAKFP6188Q1Z2',
      billNo: 'PIH-9043',
      date: d4,
      time: '11:25 AM',
      categoryLabel: 'Other',
      items: [{ desc: 'Emergency V-Belt & Fastener Kit', qty: '1 x Kit (Line 2)', total: '₹490.00' }],
      subtotal: '₹415.25',
      tax: 'GST 18% ₹74.75',
      grandTotal: '₹490',
      paymentMode: 'CASH',
      accentColor: '#4338ca',
    });

    const r5 = createSampleReceiptDataUrl({
      merchant: 'HPCL INDUSTRIAL FUEL POINT',
      address: 'Naroda GIDC Main Gate, Ahmedabad',
      gstin: '24AAACH1118B1Z0',
      billNo: 'HPCL-60918',
      date: d2,
      time: '06:05 PM',
      categoryLabel: 'Petrol',
      items: [{ desc: 'Final Handover Site Visit Fuel', qty: '4.43 Ltr @ ₹101.58/L', total: '₹450.00' }],
      subtotal: '₹450.00',
      tax: 'Incl. VAT',
      grandTotal: '₹450',
      paymentMode: 'UPI (GPay)',
      accentColor: '#9333ea',
    });

    const nowMs = Date.now();
    const financeSeeds: ExpenseClaim[] = [
      {
        id: 'exp_fin_seed_petrol_480',
        tenantId,
        workerId: w2.id,
        workerName: w2.name,
        workerPhone: w2.phone,
        workerDesignation: w2.designation || 'Floor Technician',
        branchId: w2.branchId || 'default',
        amount: 480,
        amountPaise: 48000,
        category: 'PETROL',
        expenseDate: d1,
        receiptImageDataUrl: r1,
        receiptImageHash: await computeReceiptImageHash(r1),
        captureSource: 'CAMERA_DIRECT',
        status: 'PENDING_FINANCE',
        syncStatus: 'SYNCED',
        managerName: 'Vikram Joshi',
        approverId: 'demo-manager-uid',
        approverName: 'Vikram Joshi',
        approverRole: 'MANAGER',
        statusMessage: 'Approved by Vikram Joshi — Forwarded to Finance (PENDING_FINANCE).',
        riskFlag: 'NONE',
        policyTags: [],
        createdAt: new Date(nowMs - 16 * 3600000).toISOString(),
        syncedAt: new Date(nowMs - 16 * 3600000).toISOString(),
        managerApprovedBy: 'Vikram Joshi',
        managerApprovedAt: new Date(nowMs - 10 * 3600000).toISOString(),
        resolvedBy: 'Vikram Joshi',
        resolvedAt: new Date(nowMs - 10 * 3600000).toISOString(),
      },
      {
        id: 'exp_fin_seed_food_override_360',
        tenantId,
        workerId: w3.id,
        workerName: w3.name,
        workerPhone: w3.phone,
        workerDesignation: w3.designation || 'Quality Inspector',
        branchId: w3.branchId || 'default',
        amount: 360,
        amountPaise: 36000,
        category: 'FOOD',
        expenseDate: d2,
        receiptImageDataUrl: r2,
        receiptImageHash: await computeReceiptImageHash(r2),
        captureSource: 'CAMERA_DIRECT',
        status: 'PENDING_FINANCE',
        syncStatus: 'SYNCED',
        managerName: 'Vikram Joshi',
        approverId: 'demo-manager-uid',
        approverName: 'Vikram Joshi',
        approverRole: 'MANAGER',
        statusMessage:
          'Approved with policy override by Vikram Joshi ("Client audit team lunch pre-approved") — Forwarded to Finance (PENDING_FINANCE).',
        riskFlag: 'NONE',
        policyTags: ['POLICY_WARNING'],
        policyWarning: {
          tag: 'POLICY_WARNING',
          category: 'FOOD',
          expenseDate: d2,
          dailyLimitPaise: 30000,
          dailyLimitRupees: 300,
          priorDailyTotalPaise: 0,
          claimAmountPaise: 36000,
          cumulativeDailyTotalPaise: 36000,
          exceededByPaise: 6000,
          sameDayClaimCount: 1,
          bannerMessage: '⚠️ Warning: This claim exceeds the ₹300 food limit.',
        },
        overrideNote: 'Client audit team lunch pre-approved by plant head',
        createdAt: new Date(nowMs - 26 * 3600000).toISOString(),
        syncedAt: new Date(nowMs - 26 * 3600000).toISOString(),
        managerApprovedBy: 'Vikram Joshi',
        managerApprovedAt: new Date(nowMs - 14 * 3600000).toISOString(),
        resolvedBy: 'Vikram Joshi',
        resolvedAt: new Date(nowMs - 14 * 3600000).toISOString(),
      },
      {
        id: 'exp_fin_seed_travel_850',
        tenantId,
        workerId: w4.id,
        workerName: w4.name,
        workerPhone: w4.phone,
        workerDesignation: w4.designation || 'Dispatch Executive',
        branchId: w4.branchId || 'default',
        amount: 850,
        amountPaise: 85000,
        category: 'TRAVEL',
        expenseDate: d3,
        receiptImageDataUrl: r3,
        receiptImageHash: await computeReceiptImageHash(r3),
        captureSource: 'CAMERA_DIRECT',
        status: 'PENDING_FINANCE',
        syncStatus: 'SYNCED',
        managerName: 'Vikram Joshi',
        approverId: 'demo-manager-uid',
        approverName: 'Vikram Joshi',
        approverRole: 'MANAGER',
        statusMessage: 'Approved by Vikram Joshi — Forwarded to Finance (PENDING_FINANCE).',
        riskFlag: 'NONE',
        policyTags: [],
        createdAt: new Date(nowMs - 38 * 3600000).toISOString(),
        syncedAt: new Date(nowMs - 38 * 3600000).toISOString(),
        managerApprovedBy: 'Vikram Joshi',
        managerApprovedAt: new Date(nowMs - 22 * 3600000).toISOString(),
        resolvedBy: 'Vikram Joshi',
        resolvedAt: new Date(nowMs - 22 * 3600000).toISOString(),
      },
      {
        id: 'exp_fin_seed_other_490',
        tenantId,
        workerId: w1.id,
        workerName: w1.name,
        workerPhone: w1.phone,
        workerDesignation: w1.designation || 'CNC Operator',
        branchId: w1.branchId || 'default',
        amount: 490,
        amountPaise: 49000,
        category: 'OTHER',
        expenseDate: d4,
        receiptImageDataUrl: r4,
        receiptImageHash: await computeReceiptImageHash(r4),
        captureSource: 'CAMERA_DIRECT',
        status: 'PENDING_FINANCE',
        syncStatus: 'SYNCED',
        managerName: 'Rajesh Patel',
        approverId: 'demo-owner-uid',
        approverName: 'Rajesh Patel',
        approverRole: 'TENANT_ADMIN',
        statusMessage: 'Approved by Rajesh Patel — Forwarded to Finance (PENDING_FINANCE).',
        riskFlag: 'NONE',
        policyTags: [],
        createdAt: new Date(nowMs - 52 * 3600000).toISOString(),
        syncedAt: new Date(nowMs - 52 * 3600000).toISOString(),
        managerApprovedBy: 'Rajesh Patel',
        managerApprovedAt: new Date(nowMs - 30 * 3600000).toISOString(),
        resolvedBy: 'Rajesh Patel',
        resolvedAt: new Date(nowMs - 30 * 3600000).toISOString(),
      },
      {
        id: 'exp_fin_seed_resigned_fnf_450',
        tenantId,
        workerId: exitedWorker.id,
        workerName: exitedWorker.name,
        workerPhone: exitedWorker.phone,
        workerDesignation: exitedWorker.designation || 'Senior Welder (Resigned)',
        branchId: exitedWorker.branchId || 'default',
        amount: 450,
        amountPaise: 45000,
        category: 'PETROL',
        expenseDate: d2,
        receiptImageDataUrl: r5,
        receiptImageHash: await computeReceiptImageHash(r5),
        captureSource: 'CAMERA_DIRECT',
        status: 'PENDING_FINANCE',
        syncStatus: 'SYNCED',
        managerName: 'Vikram Joshi',
        approverId: 'demo-manager-uid',
        approverName: 'Vikram Joshi',
        approverRole: 'MANAGER',
        statusMessage:
          'Approved by Vikram Joshi — Worker resigned; pending Finance approval to route to Full & Final (FnF) Settlement.',
        riskFlag: 'NONE',
        policyTags: [],
        payoutDestination: 'FNF_SETTLEMENT',
        payrollLockStatus: 'ROUTED_TO_FNF',
        workerExitDate: exitedWorker.dateOfExit || todayStr,
        fnfRoutingReason: `Worker resigned on ${exitedWorker.dateOfExit || d2} — claim retained and routed to Full & Final (FnF) settlement.`,
        createdAt: new Date(nowMs - 20 * 3600000).toISOString(),
        syncedAt: new Date(nowMs - 20 * 3600000).toISOString(),
        managerApprovedBy: 'Vikram Joshi',
        managerApprovedAt: new Date(nowMs - 8 * 3600000).toISOString(),
        resolvedBy: 'Vikram Joshi',
        resolvedAt: new Date(nowMs - 8 * 3600000).toISOString(),
      },
    ];

    const merged = [...baseClaims, ...financeSeeds];
    writeStoredClaims(tenantId, merged);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(flagKey, 'true');
    }
    return merged;
  },
};

// ============================================================================
// Finance Verification, Immutability, Payroll Month Lock & Worker Notifications
// ============================================================================

export interface PayrollMonthLockInfo {
  payrollMonth: string;
  locked: boolean;
  lockedAt?: string;
  lockedBy?: string;
}

export interface FinanceBulkApprovalResult {
  approvedClaims: ExpenseClaim[];
  lockedForPayrollCount: number;
  deferredNextMonthCount: number;
  routedToFnfCount: number;
  skippedIds: string[];
  notificationsCreated: ExpenseWorkerNotification[];
  totalApprovedAmountPaise: number;
}

export function isClaimImmutable(claim?: Partial<ExpenseClaim> | null): boolean {
  if (!claim) return false;
  return claim.status === 'APPROVED' || claim.status === 'PAID' || Boolean(claim.isImmutable);
}

export function assertClaimMutable(claim: ExpenseClaim, action: string = 'modify'): void {
  if (isClaimImmutable(claim)) {
    throw new Error(
      `Immutable claim: Cannot ${action} claim ${claim.id} because it has already been Finance-APPROVED and permanently locked for payroll audit.`
    );
  }
}

export function isWorkerResignedOrExited(worker?: Partial<Worker> | null): boolean {
  if (!worker) return false;
  return (
    worker.status === 'RESIGNED' ||
    worker.status === 'TERMINATED' ||
    Boolean(worker.dateOfExit && worker.dateOfExit.trim().length > 0)
  );
}

export function getCurrentPayrollMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getNextPayrollMonth(payrollMonth: string): string {
  const match = String(payrollMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  const year = parseInt(match[1], 10);
  const monthIdx = parseInt(match[2], 10) - 1;
  const next = new Date(year, monthIdx + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

export function formatPayrollMonthLabel(payrollMonth: string): string {
  const match = String(payrollMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return payrollMonth || 'Current Month';
  const d = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function readPayrollMonthLocks(tenantId: string): Record<string, PayrollMonthLockInfo> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${PAYROLL_MONTH_LOCK_STORAGE_PREFIX}${tenantId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPayrollMonthLockInfo(
  tenantId: string,
  payrollMonth: string
): PayrollMonthLockInfo | null {
  const locks = readPayrollMonthLocks(tenantId);
  return locks[payrollMonth] || null;
}

export function isPayrollMonthLocked(tenantId: string, payrollMonth: string): boolean {
  return Boolean(getPayrollMonthLockInfo(tenantId, payrollMonth)?.locked);
}

export function setPayrollMonthLocked(
  tenantId: string,
  payrollMonth: string,
  locked: boolean,
  actorName: string
): PayrollMonthLockInfo {
  const locks = readPayrollMonthLocks(tenantId);
  const info: PayrollMonthLockInfo = {
    payrollMonth,
    locked,
    lockedAt: locked ? new Date().toISOString() : undefined,
    lockedBy: locked ? actorName : undefined,
  };
  locks[payrollMonth] = info;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`${PAYROLL_MONTH_LOCK_STORAGE_PREFIX}${tenantId}`, JSON.stringify(locks));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('payrollLockStatusChanged', {
        detail: { tenantId, payrollMonth, locked },
      })
    );
  }
  return info;
}

function readWorkerExpenseNotifications(tenantId: string): ExpenseWorkerNotification[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${WORKER_EXPENSE_NOTIFS_STORAGE_PREFIX}${tenantId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkerExpenseNotifications(
  tenantId: string,
  notifications: ExpenseWorkerNotification[]
): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      `${WORKER_EXPENSE_NOTIFS_STORAGE_PREFIX}${tenantId}`,
      JSON.stringify(notifications)
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('expenseWorkerNotificationsChanged', { detail: { tenantId } })
    );
  }
}

export function pushWorkerExpenseNotification(
  tenantId: string,
  payload: Omit<ExpenseWorkerNotification, 'id' | 'tenantId' | 'read' | 'createdAt'>
): ExpenseWorkerNotification {
  const existing = readWorkerExpenseNotifications(tenantId);
  const created: ExpenseWorkerNotification = {
    ...payload,
    id: `exp_notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tenantId,
    read: false,
    createdAt: new Date().toISOString(),
  };
  writeWorkerExpenseNotifications(tenantId, [created, ...existing].slice(0, 100));
  return created;
}
