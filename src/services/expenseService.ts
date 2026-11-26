// src/services/expenseService.ts
import {
  Branch,
  ExpenseCategory,
  ExpenseClaim,
  ExpenseClaimStatus,
  InboxItem,
  OrgSettings,
  Worker,
} from '../types/index';
import { syncService } from './syncService';
import { inboxService } from './inboxService';

const EXPENSE_CLAIMS_STORAGE_PREFIX = 'workforce_expense_claims_v1_';

export const MAX_EXPENSE_PAST_DAYS = 30;
export const MAX_EXPENSE_AMOUNT_INR = 50000;

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
 * Formats a Date into local YYYY-MM-DD so "Today" matches the worker's calendar date.
 */
export function getLocalTodayIsoDate(referenceNow: Date = new Date()): string {
  const year = referenceNow.getFullYear();
  const month = String(referenceNow.getMonth() + 1).padStart(2, '0');
  const day = String(referenceNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the earliest allowed expense date (30 days before referenceNow).
 */
export function getMinAllowedExpenseDate(referenceNow: Date = new Date()): string {
  const minDate = new Date(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate() - MAX_EXPENSE_PAST_DAYS
  );
  return getLocalTodayIsoDate(minDate);
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
  message?: string;
} {
  const cleaned =
    typeof rawAmount === 'number'
      ? String(rawAmount)
      : String(rawAmount || '').replace(/[^\d.]/g, '').trim();

  const parsed = Number(cleaned);
  if (!cleaned || !Number.isFinite(parsed) || parsed <= 0) {
    return {
      valid: false,
      amount: 0,
      message: 'Enter a valid expense amount greater than ₹0.',
    };
  }

  const rounded = Math.round(parsed * 100) / 100;
  if (rounded > MAX_EXPENSE_AMOUNT_INR) {
    return {
      valid: false,
      amount: rounded,
      message: `Single tap claim limit is ₹${MAX_EXPENSE_AMOUNT_INR.toLocaleString('en-IN')}. Contact HR for larger bills.`,
    };
  }

  return { valid: true, amount: rounded };
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

/**
 * Resolves the assigned Manager name for status copy ("Submitted to Manager Suresh for approval.").
 */
export function resolveAssignedManagerName(
  _tenantId: string,
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

  const rawManager = (worker as (Partial<Worker> & { managerName?: string; supervisorName?: string }) | null)
    ?.managerName ||
    (worker as (Partial<Worker> & { managerName?: string; supervisorName?: string }) | null)
      ?.supervisorName;

  if (rawManager && rawManager.trim()) {
    return rawManager.trim().replace(/^Manager\s+/i, '');
  }

  return 'Suresh';
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
    return this.getClaimsForTenant(tenantId).filter((c) => c.workerId === workerId);
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
   * Syncs a claim to the server store, runs cross-worker duplicate image-hash detection,
   * sets status to "Submitted to Manager <Name> for approval.", and routes to Manager Action Inbox.
   */
  async syncExpenseClaimToServer(claim: ExpenseClaim): Promise<ExpenseClaim> {
    const duplicateMatch = this.findDuplicateReceiptClaim(
      claim.tenantId,
      claim.receiptImageHash,
      claim.id
    );

    const nowIso = new Date().toISOString();
    const isDuplicate = Boolean(duplicateMatch);

    const syncedClaim: ExpenseClaim = {
      ...claim,
      status: 'SUBMITTED',
      syncStatus: 'SYNCED',
      syncedAt: nowIso,
      statusMessage: `Submitted to Manager ${claim.managerName} for approval.`,
      riskFlag: isDuplicate ? 'HIGH_RISK_DUPLICATE' : 'NONE',
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

    // Route directly to Manager Approval Inbox (E3)
    const categoryLabel = getExpenseCategoryLabel(syncedClaim.category);
    const duplicateDescription = duplicateMatch
      ? `HIGH_RISK_DUPLICATE: Identical receipt photo hash already submitted by ${duplicateMatch.workerName} on ${duplicateMatch.expenseDate}. Inspect carefully before approving.`
      : `${categoryLabel} receipt for ${syncedClaim.expenseDate} captured via live camera. Inspect receipt clarity and approve or reject.`;

    const inboxItem: InboxItem = {
      id: `inbox-expense-${syncedClaim.id}`,
      tenantId: syncedClaim.tenantId,
      branchId: syncedClaim.branchId,
      actionType: 'EXPENSE_APPROVAL',
      urgency: isDuplicate ? 'URGENT' : syncedClaim.amount > 1000 ? 'HIGH' : 'NORMAL',
      status: 'PENDING',
      workerId: syncedClaim.workerId,
      workerName: syncedClaim.workerName,
      workerPhone: syncedClaim.workerPhone,
      workerDesignation: syncedClaim.workerDesignation,
      title: `${syncedClaim.workerName.split(' ')[0]} claimed ₹${syncedClaim.amount.toLocaleString('en-IN')} for ${categoryLabel}`,
      description: duplicateDescription,
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
   * - Validates amount & 30-day past date limit.
   * - Computes SHA-256 receipt image hash.
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

    // 2. Validate amount
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

    // 5. Compute SHA-256 hash of the receipt image
    const receiptImageHash = await computeReceiptImageHash(params.receiptImageDataUrl);
    const managerName =
      params.managerName?.trim().replace(/^Manager\s+/i, '') ||
      resolveAssignedManagerName(params.tenantId, params.worker, params.orgSettings);

    const nowIso = now.toISOString();
    const claimId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const baseClaim: ExpenseClaim = {
      id: claimId,
      tenantId: params.tenantId,
      workerId: params.worker.id,
      workerName: params.worker.name,
      workerPhone: params.worker.phone,
      workerDesignation: params.worker.designation,
      branchId: params.worker.branchId,
      amount: amountCheck.amount,
      category: params.category,
      expenseDate: params.expenseDate,
      receiptImageDataUrl: params.receiptImageDataUrl,
      receiptImageHash,
      captureSource: 'CAMERA_DIRECT',
      status: 'PENDING_LOCAL',
      syncStatus: 'PENDING_LOCAL',
      managerName,
      statusMessage: 'Saved locally (PENDING_LOCAL) — will sync automatically when network returns.',
      riskFlag: 'NONE',
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
      const synced = await this.syncExpenseClaimToServer(baseClaim);
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
   * Called by Manager Approval Inbox when approving or rejecting an expense claim
   * (e.g., rejecting a blurry or unreadable receipt, or a duplicate claim).
   */
  updateExpenseClaimResolution(
    tenantId: string,
    claimId: string,
    status: Extract<ExpenseClaimStatus, 'APPROVED' | 'REJECTED'>,
    resolvedBy: string,
    notes?: string
  ): ExpenseClaim | null {
    const claims = readStoredClaims(tenantId);
    const idx = claims.findIndex((c) => c.id === claimId);
    if (idx === -1) return null;

    const nowIso = new Date().toISOString();
    const updated: ExpenseClaim = {
      ...claims[idx],
      status,
      resolvedBy,
      resolvedAt: nowIso,
      rejectionReason: status === 'REJECTED' ? notes || 'Rejected by manager' : undefined,
      statusMessage:
        status === 'APPROVED'
          ? `Approved by Manager ${claims[idx].managerName} for reimbursement.`
          : `Rejected by Manager ${claims[idx].managerName}${notes ? `: ${notes}` : '.'}`,
    };

    claims[idx] = updated;
    writeStoredClaims(tenantId, claims);
    return updated;
  },
};
