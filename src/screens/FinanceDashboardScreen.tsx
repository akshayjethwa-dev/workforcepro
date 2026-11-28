// src/screens/FinanceDashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Eye,
  FileWarning,
  Filter,
  IndianRupee,
  Landmark,
  Lock,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Unlock,
  UserX,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ExpenseCategory,
  ExpenseClaim,
  ExpenseRejectionReason,
  ExpenseWorkerNotification,
  ScreenName,
  Worker,
} from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_REJECTION_REASONS,
  EXPENSE_TAXABLE_FLAG_REASONS,
  expenseService,
  formatPaiseAsRupees,
  formatPayrollMonthLabel,
  getCurrentPayrollMonth,
  getExpenseCategoryLabel,
  getNextPayrollMonth,
  hasPolicyWarning,
  isClaimImmutable,
  isWorkerResignedOrExited,
  rupeesToPaise,
} from '../services/expenseService';

interface FinanceDashboardScreenProps {
  onNavigate?: (screen: ScreenName) => void;
}

type FinanceTab = 'PENDING_FINANCE' | 'APPROVED' | 'PAID' | 'FNF_QUEUE' | 'REJECTED';
type FlagFilter = 'ALL' | 'POLICY_WARNING' | 'DUPLICATE' | 'RESIGNED_FNF' | 'TAXABLE';

export const FinanceDashboardScreen: React.FC<FinanceDashboardScreenProps> = ({
  onNavigate,
}) => {
  const { profile, activeRole } = useAuth();
  const { toast } = useToast();

  const tenantId = profile?.tenantId || 'demo-tenant-id';
  const actorName = profile?.name || profile?.email || 'Finance Admin';

  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerNotifications, setWorkerNotifications] = useState<ExpenseWorkerNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const [payrollMonth, setPayrollMonth] = useState<string>(getCurrentPayrollMonth());
  const [payrollLocked, setPayrollLocked] = useState<boolean>(false);
  const [payrollLockMeta, setPayrollLockMeta] = useState<{ lockedAt?: string; lockedBy?: string } | null>(null);

  const [activeTab, setActiveTab] = useState<FinanceTab>('PENDING_FINANCE');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ExpenseCategory>('ALL');
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('ALL');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Full-screen receipt inspection modal
  const [inspectClaim, setInspectClaim] = useState<ExpenseClaim | null>(null);
  const [receiptZoom, setReceiptZoom] = useState(1);

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<ExpenseClaim | null>(null);
  const [rejectReasonCategory, setRejectReasonCategory] = useState<ExpenseRejectionReason | ''>('');
  const [rejectAdditionalNote, setRejectAdditionalNote] = useState('');
  const [rejectError, setRejectError] = useState('');

  // Taxability modal state (Finance Admin can flag Gift/Bonus as TAXABLE before payroll)
  const [taxableTarget, setTaxableTarget] = useState<ExpenseClaim | null>(null);
  const [taxableReason, setTaxableReason] = useState<string>(EXPENSE_TAXABLE_FLAG_REASONS[0]);
  const [taxableCustomNote, setTaxableCustomNote] = useState<string>('');

  // Recent batch outcome banner
  const [lastBatchSummary, setLastBatchSummary] = useState<{
    totalApproved: number;
    totalRupees: string;
    lockedForPayrollCount: number;
    deferredNextMonthCount: number;
    routedToFnfCount: number;
    targetMonth: string;
    nextMonth: string;
  } | null>(null);

  const workersById = useMemo(
    () => new Map<string, Worker>(workers.map((w) => [w.id, w])),
    [workers]
  );

  const isClaimForResignedWorker = useCallback(
    (claim: ExpenseClaim): boolean => {
      const matched = workersById.get(claim.workerId);
      return (
        claim.payoutDestination === 'FNF_SETTLEMENT' ||
        isWorkerResignedOrExited(matched) ||
        Boolean(claim.workerExitDate)
      );
    },
    [workersById]
  );

  const syncLockState = useCallback(
    async (tId: string, month: string) => {
      const registryInfo = expenseService.getPayrollMonthLockInfo(tId, month);
      if (registryInfo) {
        setPayrollLocked(registryInfo.locked);
        setPayrollLockMeta({
          lockedAt: registryInfo.lockedAt,
          lockedBy: registryInfo.lockedBy,
        });
        return;
      }

      // Also inspect saved monthly payrolls in DB for lock synchronization
      try {
        const savedPayrolls = await dbService.getPayrollsByMonth(tId, month);
        const hasLockedPayroll = savedPayrolls.some(
          (p) => p.status === 'LOCKED' || p.status === 'PAID'
        );
        if (hasLockedPayroll) {
          const info = expenseService.setPayrollMonthLocked(
            tId,
            month,
            true,
            'Payroll Run'
          );
          setPayrollLocked(true);
          setPayrollLockMeta({ lockedAt: info.lockedAt, lockedBy: info.lockedBy });
        } else {
          setPayrollLocked(false);
          setPayrollLockMeta(null);
        }
      } catch {
        setPayrollLocked(false);
        setPayrollLockMeta(null);
      }
    },
    []
  );

  const loadFinanceData = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedWorkers = await dbService.getWorkers(tenantId).catch((): Worker[] => []);
      setWorkers(fetchedWorkers);

      await expenseService.ensureSeededFinanceClaims(tenantId, fetchedWorkers);
      setClaims(expenseService.getClaimsForTenant(tenantId));
      setWorkerNotifications(expenseService.getWorkerExpenseNotifications(tenantId));
      await syncLockState(tenantId, payrollMonth);
    } catch (err) {
      console.error('[FinanceDashboard] Failed to load finance claims:', err);
      toast.error('Failed to load expense verification queue.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, payrollMonth, syncLockState, toast]);

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  useEffect(() => {
    const onClaimsChanged = () => {
      setClaims(expenseService.getClaimsForTenant(tenantId));
      setWorkerNotifications(expenseService.getWorkerExpenseNotifications(tenantId));
    };
    const onLockChanged = () => {
      void syncLockState(tenantId, payrollMonth);
    };
    window.addEventListener('expenseClaimsChanged', onClaimsChanged);
    window.addEventListener('expenseWorkerNotificationsChanged', onClaimsChanged);
    window.addEventListener('payrollLockStatusChanged', onLockChanged);
    return () => {
      window.removeEventListener('expenseClaimsChanged', onClaimsChanged);
      window.removeEventListener('expenseWorkerNotificationsChanged', onClaimsChanged);
      window.removeEventListener('payrollLockStatusChanged', onLockChanged);
    };
  }, [tenantId, payrollMonth, syncLockState]);

  // Clear selection when switching tabs
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  // Computed buckets & KPIs
  const pendingFinanceClaims = useMemo(
    () => claims.filter((c) => c.status === 'PENDING_FINANCE'),
    [claims]
  );

  const approvedClaims = useMemo(
    () => claims.filter((c) => c.status === 'APPROVED'),
    [claims]
  );

  const paidClaims = useMemo(
    () => claims.filter((c) => c.status === 'PAID'),
    [claims]
  );

  const rejectedClaims = useMemo(
    () => claims.filter((c) => c.status === 'REJECTED'),
    [claims]
  );

  const fnfQueueClaims = useMemo(
    () =>
      claims.filter(
        (c) =>
          (c.status === 'PENDING_FINANCE' || c.status === 'APPROVED') &&
          isClaimForResignedWorker(c)
      ),
    [claims, isClaimForResignedWorker]
  );

  const approvedReadyForCurrentPayroll = useMemo(
    () =>
      approvedClaims.filter(
        (c) =>
          !isClaimForResignedWorker(c) &&
          c.payoutDestination !== 'FNF_SETTLEMENT' &&
          (c.payrollMonth || payrollMonth) === payrollMonth
      ),
    [approvedClaims, isClaimForResignedWorker, payrollMonth]
  );

  const deferredNextMonthClaims = useMemo(
    () =>
      approvedClaims.filter(
        (c) =>
          c.payoutDestination === 'NEXT_MONTH_PAYROLL' ||
          c.payrollLockStatus === 'DEFERRED_NEXT_MONTH'
      ),
    [approvedClaims]
  );

  const sumPaise = (list: ExpenseClaim[]) =>
    list.reduce(
      (sum, c) => sum + (typeof c.amountPaise === 'number' ? c.amountPaise : rupeesToPaise(c.amount)),
      0
    );

  const kpis = useMemo(
    () => ({
      pendingCount: pendingFinanceClaims.length,
      pendingTotal: formatPaiseAsRupees(sumPaise(pendingFinanceClaims)),
      approvedForMonthCount: approvedReadyForCurrentPayroll.length,
      approvedForMonthTotal: formatPaiseAsRupees(sumPaise(approvedReadyForCurrentPayroll)),
      fnfCount: fnfQueueClaims.length,
      fnfTotal: formatPaiseAsRupees(sumPaise(fnfQueueClaims)),
      deferredCount: deferredNextMonthClaims.length,
      deferredTotal: formatPaiseAsRupees(sumPaise(deferredNextMonthClaims)),
    }),
    [
      pendingFinanceClaims,
      approvedReadyForCurrentPayroll,
      fnfQueueClaims,
      deferredNextMonthClaims,
    ]
  );

  // Filtered list for active tab
  const visibleClaims = useMemo(() => {
    const base =
      activeTab === 'PENDING_FINANCE'
        ? pendingFinanceClaims
        : activeTab === 'APPROVED'
        ? approvedClaims
        : activeTab === 'PAID'
        ? paidClaims
        : activeTab === 'FNF_QUEUE'
        ? fnfQueueClaims
        : rejectedClaims;

    const q = searchQuery.trim().toLowerCase();
    return base.filter((c) => {
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (flagFilter === 'POLICY_WARNING' && !hasPolicyWarning(c)) return false;
      if (flagFilter === 'DUPLICATE' && c.riskFlag !== 'HIGH_RISK_DUPLICATE') return false;
      if (flagFilter === 'RESIGNED_FNF' && !isClaimForResignedWorker(c)) return false;
      if (flagFilter === 'TAXABLE' && c.taxClassification !== 'TAXABLE') return false;
      if (q) {
        const hay = `${c.workerName} ${c.workerDesignation || ''} ${c.category} ${c.managerApprovedBy || c.managerName} ${c.overrideNote || ''} ${c.taxableFlagReason || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    activeTab,
    pendingFinanceClaims,
    approvedClaims,
    paidClaims,
    fnfQueueClaims,
    rejectedClaims,
    categoryFilter,
    flagFilter,
    searchQuery,
    isClaimForResignedWorker,
  ]);

  const selectableVisibleClaims = useMemo(
    () => visibleClaims.filter((c) => c.status === 'PENDING_FINANCE' && !isClaimImmutable(c)),
    [visibleClaims]
  );

  const allSelectableChecked =
    selectableVisibleClaims.length > 0 &&
    selectableVisibleClaims.every((c) => selectedIds.has(c.id));

  const selectedClaimsList = useMemo(
    () => selectableVisibleClaims.filter((c) => selectedIds.has(c.id)),
    [selectableVisibleClaims, selectedIds]
  );

  const selectedTotalLabel = useMemo(
    () => formatPaiseAsRupees(sumPaise(selectedClaimsList)),
    [selectedClaimsList]
  );

  const toggleSelectAll = () => {
    if (allSelectableChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableVisibleClaims.map((c) => c.id)));
    }
  };

  const toggleSelectOne = (claimId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(claimId)) {
        next.delete(claimId);
      } else {
        next.add(claimId);
      }
      return next;
    });
  };

  const handleTogglePayrollMonthLock = () => {
    const nextLocked = !payrollLocked;
    const info = expenseService.setPayrollMonthLocked(
      tenantId,
      payrollMonth,
      nextLocked,
      actorName
    );
    setPayrollLocked(info.locked);
    setPayrollLockMeta({ lockedAt: info.lockedAt, lockedBy: info.lockedBy });
    if (nextLocked) {
      toast.warning(
        `${formatPayrollMonthLabel(payrollMonth)} payroll marked LOCKED. Any claim approved now will auto-defer to ${formatPayrollMonthLabel(
          getNextPayrollMonth(payrollMonth)
        )} and notify the worker.`
      );
    } else {
      toast.info(
        `${formatPayrollMonthLabel(payrollMonth)} payroll re-opened for regular expense payout locking.`
      );
    }
  };

  const runFinanceApproval = (claimIds: string[]) => {
    if (claimIds.length === 0) return;
    setIsProcessingBulk(true);
    try {
      const actorProfile = {
        ...profile,
        role: activeRole,
      };
      const result = expenseService.financeApproveClaims({
        tenantId,
        claimIds,
        financeActor: actorProfile,
        payrollMonth,
        workers,
      });

      const nextMonth = getNextPayrollMonth(payrollMonth);
      setClaims(expenseService.getClaimsForTenant(tenantId));
      setWorkerNotifications(expenseService.getWorkerExpenseNotifications(tenantId));
      setSelectedIds(new Set());

      if (inspectClaim && claimIds.includes(inspectClaim.id)) {
        const updated = result.approvedClaims.find((c) => c.id === inspectClaim.id) || null;
        setInspectClaim(updated);
      }

      const formattedTotal = formatPaiseAsRupees(result.totalApprovedAmountPaise);
      setLastBatchSummary({
        totalApproved: result.approvedClaims.length,
        totalRupees: formattedTotal,
        lockedForPayrollCount: result.lockedForPayrollCount,
        deferredNextMonthCount: result.deferredNextMonthCount,
        routedToFnfCount: result.routedToFnfCount,
        targetMonth: payrollMonth,
        nextMonth,
      });

      const summaryParts: string[] = [];
      if (result.lockedForPayrollCount > 0) {
        summaryParts.push(
          `${result.lockedForPayrollCount} locked for ${formatPayrollMonthLabel(payrollMonth)} payroll`
        );
      }
      if (result.routedToFnfCount > 0) {
        summaryParts.push(`${result.routedToFnfCount} routed to FnF settlement`);
      }
      if (result.deferredNextMonthCount > 0) {
        summaryParts.push(
          `${result.deferredNextMonthCount} pushed to ${formatPayrollMonthLabel(nextMonth)} payroll (worker notified)`
        );
      }

      toast.success(
        `Approved & locked ${result.approvedClaims.length} claim${
          result.approvedClaims.length === 1 ? '' : 's'
        } (${formattedTotal}) — ${summaryParts.join(' · ')}.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve selected claims.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const openRejectModal = (claim: ExpenseClaim) => {
    if (isClaimImmutable(claim)) {
      toast.error('Immutable claim: Approved claims cannot be edited, rejected, or deleted.');
      return;
    }
    setRejectTarget(claim);
    setRejectReasonCategory('');
    setRejectAdditionalNote('');
    setRejectError('');
  };

  const handleConfirmReject = () => {
    if (!rejectTarget) return;
    if (!rejectReasonCategory) {
      setRejectError('Please choose a rejection reason from the dropdown.');
      return;
    }

    try {
      const actorProfile = {
        ...profile,
        role: activeRole,
      };
      expenseService.financeRejectClaim({
        tenantId,
        claimId: rejectTarget.id,
        financeActor: actorProfile,
        reasonCategory: rejectReasonCategory,
        additionalNote: rejectAdditionalNote,
      });
      setClaims(expenseService.getClaimsForTenant(tenantId));
      setWorkerNotifications(expenseService.getWorkerExpenseNotifications(tenantId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(rejectTarget.id);
        return next;
      });
      if (inspectClaim?.id === rejectTarget.id) {
        setInspectClaim(null);
      }
      toast.warning(
        `Rejected ₹${rejectTarget.amount.toLocaleString('en-IN')} claim for ${rejectTarget.workerName} (${rejectReasonCategory}).`
      );
      setRejectTarget(null);
    } catch (err: any) {
      setRejectError(err?.message || 'Could not reject claim.');
    }
  };

  const openTaxableModal = (claim: ExpenseClaim) => {
    if (claim.status === 'PAID') {
      toast.error('Cannot change taxability after the claim has been PAID in payroll.');
      return;
    }
    setTaxableTarget(claim);
    setTaxableReason(claim.taxableFlagReason || EXPENSE_TAXABLE_FLAG_REASONS[0]);
    setTaxableCustomNote('');
  };

  const handleConfirmFlagTaxable = () => {
    if (!taxableTarget) return;
    try {
      const actorProfile = {
        ...profile,
        role: activeRole,
      };
      const fullReason = taxableCustomNote.trim()
        ? `${taxableReason} — ${taxableCustomNote.trim()}`
        : taxableReason;
      const updated = expenseService.setExpenseTaxClassification({
        tenantId,
        claimId: taxableTarget.id,
        taxClassification: 'TAXABLE',
        financeActor: actorProfile,
        reason: fullReason,
      });
      setClaims(expenseService.getClaimsForTenant(tenantId));
      if (inspectClaim?.id === updated.id) {
        setInspectClaim(updated);
      }
      toast.warning(
        `Flagged ₹${updated.amount.toLocaleString('en-IN')} claim for ${updated.workerName} as TAXABLE — will be added to Gross Taxable Salary instead of Tax-Free Reimbursements.`
      );
      setTaxableTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not flag claim as taxable.');
    }
  };

  const handleResetToTaxFree = (claim: ExpenseClaim) => {
    try {
      const actorProfile = {
        ...profile,
        role: activeRole,
      };
      const updated = expenseService.setExpenseTaxClassification({
        tenantId,
        claimId: claim.id,
        taxClassification: 'TAX_FREE',
        financeActor: actorProfile,
      });
      setClaims(expenseService.getClaimsForTenant(tenantId));
      if (inspectClaim?.id === updated.id) {
        setInspectClaim(updated);
      }
      toast.success(
        `Restored ₹${updated.amount.toLocaleString('en-IN')} claim for ${updated.workerName} to Tax-Free Reimbursement.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset tax classification.');
    }
  };

  const handleProceedToPayroll = () => {
    try {
      const lockSummary = expenseService.lockApprovedClaimsForPayroll(
        tenantId,
        payrollMonth,
        actorName,
        { workers }
      );
      setClaims(expenseService.getClaimsForTenant(tenantId));
      setPayrollLocked(true);
      setPayrollLockMeta({ lockedAt: new Date().toISOString(), lockedBy: actorName });

      if (lockSummary.lockedClaims.length > 0) {
        toast.success(
          `Locked ${lockSummary.lockedClaims.length} Finance-APPROVED claim${
            lockSummary.lockedClaims.length === 1 ? '' : 's'
          } (₹${lockSummary.totalLockedAmount.toLocaleString('en-IN')}) into ${formatPayrollMonthLabel(
            payrollMonth
          )} payroll.${
            lockSummary.excludedPendingCount > 0
              ? ` ${lockSummary.excludedPendingCount} unapproved claim(s) excluded.`
              : ''
          }`
        );
      } else {
        toast.info(
          `Proceeding to ${formatPayrollMonthLabel(payrollMonth)} Payroll. Only Finance-APPROVED claims are eligible for payout.`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not lock claims for payroll.');
      return;
    }

    if (onNavigate) {
      onNavigate('PAYROLL');
    }
  };

  const nextMonthLabel = formatPayrollMonthLabel(getNextPayrollMonth(payrollMonth));
  const currentMonthLabel = formatPayrollMonthLabel(payrollMonth);

  return (
    <div className="space-y-5 pb-14">
      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Landmark size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-fluid-xl font-black tracking-tight text-slate-900">
                  Finance Verification &amp; Lock
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                  <ShieldCheck size={12} />
                  {activeRole === 'FINANCE' ? 'Finance Admin' : 'Tenant Admin Audit'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit manager-approved claims, lock immutable payouts for payroll, and route resigned workers to FnF settlement.
              </p>
            </div>
          </div>
        </div>

        {/* Month Selector + Payroll Lock Status + Proceed to Payroll */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <Calendar size={14} className="text-slate-500 shrink-0" />
            <input
              type="month"
              value={payrollMonth}
              onChange={(e) => {
                if (e.target.value) setPayrollMonth(e.target.value);
              }}
              aria-label="Target payroll month"
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleTogglePayrollMonthLock}
            title={
              payrollLocked
                ? `Payroll is locked for ${currentMonthLabel}. Mid-payroll approvals auto-defer to ${nextMonthLabel}. Click to re-open.`
                : `Payroll is open for ${currentMonthLabel}. Click to lock payroll run.`
            }
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              payrollLocked
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
            }`}
          >
            {payrollLocked ? <Lock size={13} /> : <Unlock size={13} />}
            <span>
              {payrollLocked
                ? `${currentMonthLabel} Payroll LOCKED`
                : `${currentMonthLabel} Payroll OPEN`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleProceedToPayroll}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <IndianRupee size={14} />
            <span>
              Run Payroll ({kpis.approvedForMonthCount} Ready)
            </span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* MID-PAYROLL LOCK NOTICE BANNER (Edge Case 2 visibility) */}
      {payrollLocked && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <Lock size={16} />
            </div>
            <div className="text-xs text-amber-950">
              <div className="font-extrabold">
                {currentMonthLabel} Payroll Is Already Locked
                {payrollLockMeta?.lockedBy ? ` (by ${payrollLockMeta.lockedBy})` : ''}
              </div>
              <p className="text-amber-900/90 mt-0.5 leading-relaxed">
                Any active worker&apos;s claim approved right now will still become{' '}
                <span className="font-bold">APPROVED &amp; Immutable</span>, but will automatically
                be pushed to <span className="font-bold">{nextMonthLabel} payroll</span> with an
                instant notification sent to the worker.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTogglePayrollMonthLock}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold shrink-0 cursor-pointer"
          >
            Re-open {currentMonthLabel}
          </button>
        </div>
      )}

      {/* LAST BATCH APPROVAL OUTCOME BANNER */}
      {lastBatchSummary && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-950">
              <div className="font-extrabold">
                {lastBatchSummary.totalApproved} claim
                {lastBatchSummary.totalApproved === 1 ? '' : 's'} ({lastBatchSummary.totalRupees})
                verified, marked APPROVED &amp; permanently locked (immutable).
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-emerald-800 font-medium">
                {lastBatchSummary.lockedForPayrollCount > 0 && (
                  <span>
                    • {lastBatchSummary.lockedForPayrollCount} locked for{' '}
                    {formatPayrollMonthLabel(lastBatchSummary.targetMonth)} payroll
                  </span>
                )}
                {lastBatchSummary.routedToFnfCount > 0 && (
                  <span>
                    • {lastBatchSummary.routedToFnfCount} routed to Full &amp; Final (FnF) settlement
                  </span>
                )}
                {lastBatchSummary.deferredNextMonthCount > 0 && (
                  <span>
                    • {lastBatchSummary.deferredNextMonthCount} deferred to{' '}
                    {formatPayrollMonthLabel(lastBatchSummary.nextMonth)} payroll (worker notified)
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigate && (
              <button
                type="button"
                onClick={handleProceedToPayroll}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Proceed to Payroll</span>
                <ArrowRight size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastBatchSummary(null)}
              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              aria-label="Dismiss summary"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => setActiveTab('PENDING_FINANCE')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'PENDING_FINANCE'
              ? 'bg-teal-50/70 border-teal-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Pending Finance Verification</span>
            <Receipt size={15} className="text-teal-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-slate-900">
              {kpis.pendingCount}
            </span>
            <span className="text-sm font-black font-mono tabular-nums text-teal-700">
              {kpis.pendingTotal}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Manager-approved · Awaiting audit &amp; lock
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('APPROVED')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'APPROVED'
              ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Locked for {currentMonthLabel} Payroll</span>
            <Lock size={15} className="text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-slate-900">
              {kpis.approvedForMonthCount}
            </span>
            <span className="text-sm font-black font-mono tabular-nums text-emerald-700">
              {kpis.approvedForMonthTotal}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Immutable APPROVED claims ready for payout
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('FNF_QUEUE')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'FNF_QUEUE'
              ? 'bg-purple-50/70 border-purple-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>FnF Settlement Queue</span>
            <UserX size={15} className="text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-slate-900">
              {kpis.fnfCount}
            </span>
            <span className="text-sm font-black font-mono tabular-nums text-purple-700">
              {kpis.fnfTotal}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Resigned workers · Excluded from regular payroll
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('APPROVED')}
          className="text-left p-4 rounded-2xl border bg-white border-slate-200 hover:border-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Deferred to Next Month</span>
            <Bell size={15} className="text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-slate-900">
              {kpis.deferredCount}
            </span>
            <span className="text-sm font-black font-mono tabular-nums text-amber-700">
              {kpis.deferredTotal}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Approved mid-payroll · Worker notified
          </div>
        </button>
      </div>

      {/* MAIN VERIFICATION PANEL */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Tabs + Filters */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  {
                    id: 'PENDING_FINANCE',
                    label: 'Pending Verification',
                    count: pendingFinanceClaims.length,
                  },
                  {
                    id: 'APPROVED',
                    label: 'Approved & Immutable',
                    count: approvedClaims.length,
                  },
                  {
                    id: 'PAID',
                    label: 'Paid in Payroll',
                    count: paidClaims.length,
                  },
                  {
                    id: 'FNF_QUEUE',
                    label: 'FnF Settlement Queue',
                    count: fnfQueueClaims.length,
                  },
                  {
                    id: 'REJECTED',
                    label: 'Rejected',
                    count: rejectedClaims.length,
                  },
                ] as Array<{ id: FinanceTab; label: string; count: number }>
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        active ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {onNavigate && fnfQueueClaims.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('GRATUITY')}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <UserX size={13} />
                  <span>Open FnF Center</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadFinanceData()}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                title="Refresh claims"
                aria-label="Refresh claims"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Search & Filter Row */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search worker, manager, category, or override note..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-teal-600 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | ExpenseCategory)}
                  aria-label="Filter by expense category"
                  className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={flagFilter}
                onChange={(e) => setFlagFilter(e.target.value as FlagFilter)}
                aria-label="Filter by audit flag"
                className="px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              >
                <option value="ALL">All Audit Flags</option>
                <option value="POLICY_WARNING">Policy Warning / Overrides</option>
                <option value="DUPLICATE">Duplicate Receipt Risk</option>
                <option value="RESIGNED_FNF">Resigned Workers (FnF)</option>
                <option value="TAXABLE">Flagged TAXABLE (Gift / Bonus)</option>
              </select>
            </div>
          </div>
        </div>

        {/* BULK SELECTION BAR (Shown when selectable PENDING_FINANCE claims exist) */}
        {selectableVisibleClaims.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-teal-700 cursor-pointer"
              >
                {allSelectableChecked ? (
                  <CheckSquare size={17} className="text-teal-600" />
                ) : (
                  <Square size={17} className="text-slate-400" />
                )}
                <span>
                  {allSelectableChecked
                    ? `Deselect All (${selectableVisibleClaims.length})`
                    : `Select All Pending (${selectableVisibleClaims.length})`}
                </span>
              </button>

              {selectedClaimsList.length > 0 && (
                <span className="text-xs font-semibold text-slate-600">
                  Selected:{' '}
                  <strong className="text-slate-900 font-mono">
                    {selectedClaimsList.length} claim{selectedClaimsList.length === 1 ? '' : 's'} ·{' '}
                    {selectedTotalLabel}
                  </strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedClaimsList.length === 0 || isProcessingBulk}
                onClick={() => runFinanceApproval(selectedClaimsList.map((c) => c.id))}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-extrabold shadow-xs flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
              >
                <Lock size={14} />
                <span>
                  {selectedClaimsList.length > 0
                    ? `Bulk Approve & Lock (${selectedClaimsList.length} · ${selectedTotalLabel})`
                    : 'Bulk Approve Selected'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* CLAIMS LIST */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Loading Finance verification queue...
          </div>
        ) : visibleClaims.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              {activeTab === 'PENDING_FINANCE'
                ? 'All caught up — no claims awaiting Finance verification'
                : activeTab === 'APPROVED'
                ? 'No Finance-approved claims yet'
                : activeTab === 'PAID'
                ? 'No claims marked PAID yet'
                : activeTab === 'FNF_QUEUE'
                ? 'No resigned worker claims in the FnF queue'
                : 'No rejected claims'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {activeTab === 'PENDING_FINANCE'
                ? 'Manager-approved expense claims from Action Inbox will appear here automatically for month-end audit and payroll lock.'
                : 'Adjust your search or filter criteria to view other expense records.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleClaims.map((claim) => {
              const immutable = isClaimImmutable(claim);
              const isPendingFinance = claim.status === 'PENDING_FINANCE';
              const isSelected = selectedIds.has(claim.id);
              const isResigned = isClaimForResignedWorker(claim);
              const policyWarn = hasPolicyWarning(claim);
              const isDeferred =
                claim.payoutDestination === 'NEXT_MONTH_PAYROLL' ||
                claim.payrollLockStatus === 'DEFERRED_NEXT_MONTH';

              return (
                <div
                  key={claim.id}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                    isSelected
                      ? 'bg-teal-50/50'
                      : isResigned
                      ? 'bg-purple-50/20 hover:bg-purple-50/40'
                      : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Left: Checkbox / Lock + Receipt Thumb + Details */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="pt-1 shrink-0">
                      {isPendingFinance && !immutable ? (
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(claim.id)}
                          aria-label={`Select claim for ${claim.workerName}`}
                          className="p-0.5 text-slate-400 hover:text-teal-600 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-teal-600" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      ) : (
                        <div
                          title={
                            immutable
                              ? 'Immutable — Finance Approved & Locked'
                              : `Status: ${claim.status}`
                          }
                          className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                            immutable
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {immutable ? <Lock size={13} /> : <XCircle size={13} />}
                        </div>
                      )}
                    </div>

                    {/* Receipt Thumbnail */}
                    <button
                      type="button"
                      onClick={() => {
                        setInspectClaim(claim);
                        setReceiptZoom(1);
                      }}
                      className="relative group w-14 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 cursor-pointer"
                      title="Inspect full receipt photo"
                    >
                      <img
                        src={claim.receiptImageDataUrl}
                        alt={`Receipt for ${claim.workerName}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye size={15} className="text-white" />
                      </div>
                    </button>

                    {/* Primary Meta */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-900 truncate">
                          {claim.workerName}
                        </span>
                        {claim.workerDesignation && (
                          <span className="text-[11px] text-slate-500">
                            {claim.workerDesignation}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {getExpenseCategoryLabel(claim.category)}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {claim.expenseDate}
                        </span>
                      </div>

                      {/* Audit Trail Line */}
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>
                          Manager Approved by{' '}
                          <strong className="text-slate-800">
                            {claim.managerApprovedBy || claim.approverName || claim.managerName}
                          </strong>
                        </span>
                        {claim.financeApprovedBy && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-emerald-700 font-semibold">
                              Finance Locked by {claim.financeApprovedBy}
                            </span>
                          </>
                        )}
                        {claim.rejectionReason && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-rose-700 font-semibold">
                              Rejected: {claim.rejectionReason}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Contextual Audit & Edge-Case Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {policyWarn && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
                            <AlertTriangle size={11} />
                            <span>
                              POLICY_WARNING
                              {claim.overrideNote ? ` · Manager Note: "${claim.overrideNote}"` : ''}
                            </span>
                          </span>
                        )}

                        {claim.riskFlag === 'HIGH_RISK_DUPLICATE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-900 text-[11px] font-extrabold">
                            <ShieldAlert size={11} />
                            <span>HIGH_RISK_DUPLICATE Receipt</span>
                          </span>
                        )}

                        {isResigned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 border border-purple-200 text-purple-900 text-[11px] font-bold">
                            <UserX size={11} />
                            <span>
                              Resigned Worker → Routes to Full &amp; Final (FnF) Settlement
                              {claim.workerExitDate ? ` (Exit ${claim.workerExitDate})` : ''}
                            </span>
                          </span>
                        )}

                        {isDeferred && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold">
                            <Bell size={11} />
                            <span>
                              Deferred to {formatPayrollMonthLabel(claim.payrollMonth || nextMonthLabel)} Payroll · Worker Notified
                            </span>
                          </span>
                        )}

                        {claim.taxClassification === 'TAXABLE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-950 text-[11px] font-extrabold">
                            <AlertTriangle size={11} />
                            <span>
                              TAXABLE → Added to Gross Taxable Salary
                              {claim.taxableFlagReason ? ` (${claim.taxableFlagReason})` : ''}
                            </span>
                          </span>
                        ) : claim.status !== 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold">
                            <ShieldCheck size={11} />
                            <span>Tax-Free Reimbursement (0% Tax)</span>
                          </span>
                        ) : null}

                        {claim.status === 'PAID' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 border border-indigo-200 text-indigo-900 text-[11px] font-extrabold">
                            <CheckCircle2 size={11} />
                            <span>
                              PAID in {formatPayrollMonthLabel(claim.paidInPayrollMonth || claim.payrollMonth || payrollMonth)} Payroll
                            </span>
                          </span>
                        )}

                        {immutable && claim.status !== 'PAID' && !isResigned && !isDeferred && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                            <Lock size={11} />
                            <span>
                              Immutable · Locked for{' '}
                              {formatPayrollMonthLabel(claim.payrollMonth || payrollMonth)} Payroll
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount + Action Buttons */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <div className="text-left lg:text-right">
                      <div className="text-lg font-black font-mono tabular-nums text-slate-900">
                        {formatPaiseAsRupees(
                          typeof claim.amountPaise === 'number'
                            ? claim.amountPaise
                            : rupeesToPaise(claim.amount)
                        )}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {claim.status}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectClaim(claim);
                          setReceiptZoom(1);
                        }}
                        className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>Receipt</span>
                      </button>

                      {(claim.status === 'PENDING_FINANCE' || claim.status === 'APPROVED') && (
                        claim.taxClassification === 'TAXABLE' ? (
                          <button
                            type="button"
                            onClick={() => handleResetToTaxFree(claim)}
                            title="Restore to Tax-Free Reimbursement before payroll"
                            className="px-2.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <AlertTriangle size={12} />
                            <span>Taxable</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openTaxableModal(claim)}
                            title="Flag Gift/Bonus or non-qualifying expense as TAXABLE so it is added to Gross Salary before payroll"
                            className="px-2.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <AlertTriangle size={12} />
                            <span>Flag Taxable</span>
                          </button>
                        )
                      )}

                      {isPendingFinance && !immutable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => runFinanceApproval([claim.id])}
                            disabled={isProcessingBulk}
                            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-60"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openRejectModal(claim)}
                            disabled={isProcessingBulk}
                            className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : claim.status === 'PAID' ? (
                        <span className="px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-extrabold inline-flex items-center gap-1.5 select-none">
                          <CheckCircle2 size={12} />
                          <span>PAID</span>
                        </span>
                      ) : immutable ? (
                        <span
                          title="Finance-approved claims are immutable and cannot be edited or deleted."
                          className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5 select-none"
                        >
                          <Lock size={12} className="text-emerald-600" />
                          <span>Immutable</span>
                        </span>
                      ) : (
                        <span className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                          Rejected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RECENT WORKER NOTIFICATIONS DISPATCHED (Mid-Payroll Deferrals & FnF Routing) */}
      {workerNotifications.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-amber-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Worker Payout Notifications Dispatched ({workerNotifications.length})
              </h3>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {workerNotifications.slice(0, 6).map((n) => (
              <div key={n.id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900">
                    {n.workerName} — {n.title}
                  </div>
                  <p className="text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">
                  {new Date(n.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FULL-SCREEN RECEIPT INSPECTION MODAL */}
      {inspectClaim && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setInspectClaim(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col lg:flex-row border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Receipt Photo Viewer */}
            <div className="lg:w-3/5 bg-slate-900 relative flex flex-col min-h-[280px] max-h-[50vh] lg:max-h-none">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-white">
                <span className="text-xs font-bold truncate">
                  Receipt Audit · {inspectClaim.workerName}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReceiptZoom((z) => Math.max(0.75, z - 0.25))}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    aria-label="Zoom out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-[11px] font-mono px-1.5">
                    {Math.round(receiptZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setReceiptZoom((z) => Math.min(2.5, z + 0.25))}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    aria-label="Zoom in"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                <img
                  src={inspectClaim.receiptImageDataUrl}
                  alt={`Receipt for ${inspectClaim.workerName}`}
                  style={{ transform: `scale(${receiptZoom})`, transformOrigin: 'center' }}
                  className="max-w-full max-h-[65vh] rounded-xl shadow-lg transition-transform bg-white"
                />
              </div>
            </div>

            {/* Right Audit Details Panel */}
            <div className="lg:w-2/5 flex flex-col max-h-[45vh] lg:max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                    Finance Audit Detail
                  </div>
                  <h3 className="text-base font-black text-slate-900">
                    {formatPaiseAsRupees(
                      typeof inspectClaim.amountPaise === 'number'
                        ? inspectClaim.amountPaise
                        : rupeesToPaise(inspectClaim.amount)
                    )}{' '}
                    · {getExpenseCategoryLabel(inspectClaim.category)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectClaim(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-3.5 text-xs flex-1">
                <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Worker</div>
                    <div className="font-bold text-slate-900 mt-0.5">{inspectClaim.workerName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Expense Date</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {inspectClaim.expenseDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                      Manager Approved
                    </div>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {inspectClaim.managerApprovedBy || inspectClaim.managerName}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Status</div>
                    <div className="font-extrabold text-teal-700 mt-0.5">{inspectClaim.status}</div>
                  </div>
                </div>

                {hasPolicyWarning(inspectClaim) && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
                    <div className="font-extrabold flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      <span>{inspectClaim.policyWarning?.bannerMessage || 'Policy Limit Exceeded'}</span>
                    </div>
                    {inspectClaim.overrideNote && (
                      <div className="text-[11px] text-rose-800">
                        Manager Override Note: &ldquo;{inspectClaim.overrideNote}&rdquo;
                      </div>
                    )}
                  </div>
                )}

                {isClaimForResignedWorker(inspectClaim) && (
                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950">
                    <div className="font-extrabold flex items-center gap-1.5">
                      <UserX size={14} />
                      <span>Resigned Worker — Full &amp; Final (FnF) Routing</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug">
                      This worker has resigned. Approving this claim locks it immutably and routes payout strictly to Full &amp; Final (FnF) settlement instead of regular monthly payroll.
                    </p>
                  </div>
                )}

                {!isClaimForResignedWorker(inspectClaim) &&
                  inspectClaim.status === 'PENDING_FINANCE' &&
                  payrollLocked && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950">
                      <div className="font-extrabold flex items-center gap-1.5">
                        <Lock size={14} />
                        <span>{currentMonthLabel} Payroll Already Locked</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug">
                        Approving now will lock this claim and schedule payout for{' '}
                        <strong>{nextMonthLabel} payroll</strong> with an automatic notification to{' '}
                        {inspectClaim.workerName}.
                      </p>
                    </div>
                  )}

                {inspectClaim.taxClassification === 'TAXABLE' ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950">
                    <div className="font-extrabold flex items-center justify-between gap-2">
                      <span>Tax Classification: TAXABLE (Gross Salary)</span>
                      {inspectClaim.status !== 'PAID' && inspectClaim.status !== 'REJECTED' && (
                        <button
                          type="button"
                          onClick={() => handleResetToTaxFree(inspectClaim)}
                          className="text-[10px] font-bold underline text-amber-800 hover:text-amber-950 cursor-pointer"
                        >
                          Revert to Tax-Free
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug">
                      Added to <strong>Gross Taxable Salary</strong> before statutory tax calculation instead of Tax-Free Reimbursements.
                      {inspectClaim.taxableFlagReason ? ` Reason: ${inspectClaim.taxableFlagReason}` : ''}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-950">
                    <div className="font-extrabold flex items-center justify-between gap-2">
                      <span>Tax Classification: Tax-Free Reimbursement</span>
                      {(inspectClaim.status === 'PENDING_FINANCE' || inspectClaim.status === 'APPROVED') && (
                        <button
                          type="button"
                          onClick={() => openTaxableModal(inspectClaim)}
                          className="text-[10px] font-bold underline text-amber-700 hover:text-amber-900 cursor-pointer"
                        >
                          Flag Taxable
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug">
                      Excluded from Gross Taxable Salary; paid as a separate tax-free line item after Net Pay.
                    </p>
                  </div>
                )}

                {isClaimImmutable(inspectClaim) && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950">
                    <div className="font-extrabold flex items-center gap-1.5">
                      <Lock size={14} />
                      <span>
                        {inspectClaim.status === 'PAID'
                          ? 'Paid & Permanently Settled'
                          : 'Immutable Finance-Approved Record'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug">{inspectClaim.statusMessage}</p>
                    <p className="mt-1 text-[10px] text-emerald-800 font-semibold">
                      Audit protection active: This claim cannot be edited or deleted.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
                {inspectClaim.status === 'PENDING_FINANCE' && !isClaimImmutable(inspectClaim) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => runFinanceApproval([inspectClaim.id])}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={15} />
                      <span>Approve &amp; Lock</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openRejectModal(inspectClaim)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <XCircle size={15} />
                      <span>Reject Claim</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInspectClaim(null)}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Close Audit View
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FINANCE REJECT REASON MODAL */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <FileWarning size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Reject Expense Claim</h3>
                  <p className="text-xs text-slate-500">
                    {rejectTarget.workerName} · ₹{rejectTarget.amount.toLocaleString('en-IN')} (
                    {getExpenseCategoryLabel(rejectTarget.category)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mandatory Rejection Reason <span className="text-rose-600">*</span>
                </label>
                <select
                  value={rejectReasonCategory}
                  onChange={(e) => {
                    setRejectReasonCategory(e.target.value as ExpenseRejectionReason | '');
                    setRejectError('');
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:border-rose-500 outline-none"
                >
                  <option value="">-- Select a finance audit rejection reason --</option>
                  {EXPENSE_REJECTION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Additional Audit Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={rejectAdditionalNote}
                  onChange={(e) => setRejectAdditionalNote(e.target.value)}
                  placeholder="e.g., GST invoice missing or bill amount does not match claim..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:border-rose-500 outline-none resize-none"
                />
              </div>

              {rejectError && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">
                  {rejectError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLAG AS TAXABLE MODAL (Gift / Bonus -> Gross Taxable Salary instead of Reimbursements) */}
      {taxableTarget && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setTaxableTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Flag Expense as TAXABLE</h3>
                  <p className="text-xs text-slate-500">
                    {taxableTarget.workerName} · ₹{taxableTarget.amount.toLocaleString('en-IN')} (
                    {getExpenseCategoryLabel(taxableTarget.category)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTaxableTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
              Flagging this claim as <strong>TAXABLE</strong> moves it out of{' '}
              <strong>Reimbursements (Tax-Free)</strong> and adds it directly into{' '}
              <strong>Gross Taxable Salary</strong> so applicable statutory taxes (TDS/PT/EPF/ESI)
              are computed accurately on payroll.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Taxability Classification Reason
                </label>
                <select
                  value={taxableReason}
                  onChange={(e) => setTaxableReason(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:border-amber-500 outline-none"
                >
                  {EXPENSE_TAXABLE_FLAG_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Audit Note (Optional)
                </label>
                <input
                  type="text"
                  value={taxableCustomNote}
                  onChange={(e) => setTaxableCustomNote(e.target.value)}
                  placeholder="e.g., Festive gift voucher submitted under Other expense"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTaxableTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFlagTaxable}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Flag as TAXABLE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
