/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  auditWorkerWageStructureServer,
  computeOneNumberSalaryServer,
  SERVER_MIN_WAGE_WARNING,
  ServerBranchInput,
  ServerMinWageRevisionRule,
  ServerWorkerInput,
} from "./wageValidation";

// Cashfree functions
export { createCashfreeOrder } from "./cashfree";
export { verifyCashfreePayment } from "./cashfree";
export { cashfreeWebhook } from "./cashfree";

// Razorpay functions
export { createRazorpayOrder, verifyRazorpayPayment } from "./razorpay";

// For cost control, set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({
  maxInstances: 10,
  // All v2 functions default to this region.
  region: "asia-south1",
});

/**
 * Validates a One-Number Monthly Salary input on the server:
 * - Enforces state statutory minimum wage floor (throws failed-precondition if below)
 * - Auto-computes 50% Basic / 20% HRA / 30% Allowances compliant breakdown
 * - Automatically caps PF wage base and contributions at the ₹15,000 statutory ceiling
 */
export const validateOneNumberSalary = onCall(async (request) => {
  const data = (request.data || {}) as {
    monthlySalary?: number;
    state?: string;
    wageZone?: string;
    skillCategory?: "UNSKILLED" | "SEMI_SKILLED" | "SKILLED" | "HIGHLY_SKILLED";
    scheduledEmployment?: string;
    evaluationDate?: string;
    minimumWageRevisions?: ServerMinWageRevisionRule[];
  };

  const monthlySalary = Number(data.monthlySalary || 0);
  if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) {
    throw new HttpsError("invalid-argument", "Monthly salary must be greater than ₹0.");
  }

  const result = computeOneNumberSalaryServer(monthlySalary, {
    state: data.state,
    wageZone: data.wageZone,
    skillCategory: data.skillCategory,
    scheduledEmployment: data.scheduledEmployment,
    evaluationDate: data.evaluationDate,
    minimumWageRevisions: data.minimumWageRevisions,
  });

  if (result.isBelowMinimumWage) {
    throw new HttpsError("failed-precondition", SERVER_MIN_WAGE_WARNING, result);
  }

  return result;
});

/**
 * Audits all active workers in a tenant for 50% Wage Rule & State Minimum Wage compliance.
 */
export const auditTenantSalaryStructures = onCall(async (request) => {
  const data = (request.data || {}) as {
    tenantId?: string;
    asOfDate?: string;
    workers?: ServerWorkerInput[];
    branches?: ServerBranchInput[];
    minimumWageRevisions?: ServerMinWageRevisionRule[];
    defaultState?: string;
  };

  const evalDate = data.asOfDate || new Date().toISOString().slice(0, 10);
  const activeWorkers = (data.workers || []).filter(
    (w) => w.status !== "INACTIVE" && w.isActive !== false
  );
  const results = activeWorkers.map((w) =>
    auditWorkerWageStructureServer(
      w,
      evalDate,
      data.defaultState || "Maharashtra",
      false,
      data.branches || [],
      data.minimumWageRevisions || []
    )
  );

  const nonCompliant = results.filter((r) => r.isFiftyPercentNonCompliant);
  const minWageViolations = results.filter((r) => r.isMinimumWageViolation);

  return {
    tenantId: data.tenantId || "",
    auditedAt: new Date().toISOString(),
    asOfDate: evalDate,
    verificationSource: "CLOUD_FUNCTION",
    totalWorkersAudited: results.length,
    compliantCount: results.filter((r) => !r.isFiftyPercentNonCompliant).length,
    nonCompliantCount: nonCompliant.length,
    minimumWageViolationCount: minWageViolations.length,
    totalComplianceGapMonthly: Math.round(
      nonCompliant.reduce((sum, r) => sum + r.gapAmount, 0) * 100
    ) / 100,
    estimatedExtraStatutoryLiabilityMonthly: Math.round(
      nonCompliant.reduce(
        (sum, r) => sum + r.estimatedAdditionalPfMonthly + r.estimatedAdditionalGratuityMonthly,
        0
      ) * 100
    ) / 100,
    results,
  };
});

/**
 * Pre-finalization server payroll validation gate.
 */
export const validatePayrollFinalization = onCall(async (request) => {
  const data = (request.data || {}) as {
    tenantId?: string;
    month?: string;
    asOfDate?: string;
    workers?: ServerWorkerInput[];
    branches?: ServerBranchInput[];
    minimumWageRevisions?: ServerMinWageRevisionRule[];
    defaultState?: string;
  };

  const evalDate = data.asOfDate || new Date().toISOString().slice(0, 10);
  const activeWorkers = (data.workers || []).filter(
    (w) => w.status !== "INACTIVE" && w.isActive !== false
  );
  const allResults = activeWorkers.map((w) =>
    auditWorkerWageStructureServer(
      w,
      evalDate,
      data.defaultState || "Maharashtra",
      false,
      data.branches || [],
      data.minimumWageRevisions || []
    )
  );

  const flaggedWorkers = allResults.filter((r) => r.hasAnyViolation);
  const blockingMinimumWageWorkers = allResults.filter((r) => r.isMinimumWageViolation);
  const isPayrollBlocked = blockingMinimumWageWorkers.length > 0;

  return {
    tenantId: data.tenantId || "",
    month: data.month || evalDate.slice(0, 7),
    validatedAt: new Date().toISOString(),
    verificationSource: "CLOUD_FUNCTION",
    hasFlaggedWorkers: flaggedWorkers.length > 0,
    isPayrollBlocked,
    blockingErrorCode: isPayrollBlocked ? "MINIMUM_WAGE_VIOLATION" : undefined,
    blockingReason: isPayrollBlocked
      ? `MINIMUM_WAGE_VIOLATION: ${blockingMinimumWageWorkers.length} employee(s) are below the applicable state minimum wage floor.`
      : undefined,
    nonCompliantCount: allResults.filter((r) => r.isFiftyPercentNonCompliant).length,
    minimumWageViolationCount: blockingMinimumWageWorkers.length,
    totalGapAmount: Math.round(
      allResults.reduce((sum, r) => sum + r.gapAmount, 0) * 100
    ) / 100,
    flaggedWorkers,
    blockingMinimumWageWorkers,
    allResults,
  };
});