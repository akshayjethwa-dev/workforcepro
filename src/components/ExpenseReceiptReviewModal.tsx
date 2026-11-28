// src/components/ExpenseReceiptReviewModal.tsx
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Loader2,
  Receipt,
  RotateCw,
  ShieldAlert,
  UserCheck,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ExpenseRejectionReason,
  InboxItem,
  UserProfile,
} from '../types/index';
import {
  EXPENSE_REJECTION_REASONS,
  formatPaiseAsRupees,
  getExpenseCategoryLabel,
  hasPolicyWarning,
  isSelfExpenseClaim,
} from '../services/expenseService';

interface ExpenseReceiptReviewModalProps {
  item: InboxItem | null;
  initialMode?: 'VIEW' | 'REJECT' | 'APPROVE_OVERRIDE';
  actorProfile?: UserProfile | null;
  isProcessing?: boolean;
  onClose: () => void;
  onApprove: (item: InboxItem, notes?: string, overrideNote?: string) => Promise<void>;
  onReject: (
    item: InboxItem,
    reasonCategory: ExpenseRejectionReason,
    additionalNote?: string
  ) => Promise<void>;
}

export const ExpenseReceiptReviewModal: React.FC<ExpenseReceiptReviewModalProps> = ({
  item,
  initialMode = 'VIEW',
  actorProfile,
  isProcessing = false,
  onClose,
  onApprove,
  onReject,
}) => {
  const [zoomed, setZoomed] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [decisionMode, setDecisionMode] = useState<
    'VIEW' | 'REJECT' | 'APPROVE_OVERRIDE' | 'APPROVED_FLASH'
  >(initialMode);
  const [selectedReason, setSelectedReason] = useState<ExpenseRejectionReason | ''>('');
  const [extraNote, setExtraNote] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setZoomed(false);
      setRotation(0);
      setDecisionMode(initialMode);
      setSelectedReason('');
      setExtraNote('');
      setReasonError(null);
      setOverrideNote('');
      setOverrideError(null);
    }
  }, [item, initialMode]);

  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isProcessing, onClose]);

  if (!item || !item.details?.expenseClaim) return null;

  const claim = item.details.expenseClaim;
  const categoryLabel = getExpenseCategoryLabel(claim.category);
  const isDuplicate = claim.riskFlag === 'HIGH_RISK_DUPLICATE';
  const policyWarn = claim.policyWarning;
  const isPolicyWarningActive = hasPolicyWarning(claim);
  const isAdminOrSuper =
    actorProfile?.role === 'TENANT_ADMIN' ||
    actorProfile?.role === 'FACTORY_OWNER' ||
    actorProfile?.role === 'SUPER_ADMIN';
  const isOwnExpenseBlocked = !isAdminOrSuper && isSelfExpenseClaim(claim, actorProfile);

  const handleApproveClick = async () => {
    if (isProcessing || item.isWaitingSync || isOwnExpenseBlocked) return;

    // Require mandatory override note when claim is tagged with POLICY_WARNING
    if (isPolicyWarningActive) {
      setOverrideError(null);
      setDecisionMode('APPROVE_OVERRIDE');
      return;
    }

    setDecisionMode('APPROVED_FLASH');
    try {
      await onApprove(
        item,
        `Receipt verified and approved by manager — status moved to PENDING_FINANCE.`
      );
      onClose();
    } catch {
      setDecisionMode('VIEW');
    }
  };

  const handleConfirmOverrideApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedOverride = overrideNote.trim();
    if (!cleanedOverride) {
      setOverrideError(
        'A mandatory override note is required before approving a claim that exceeds the daily limit.'
      );
      return;
    }
    setOverrideError(null);
    setDecisionMode('APPROVED_FLASH');
    try {
      await onApprove(
        item,
        `Receipt verified and approved with policy override — status moved to PENDING_FINANCE.`,
        cleanedOverride
      );
      onClose();
    } catch {
      setDecisionMode('APPROVE_OVERRIDE');
    }
  };

  const handleRejectButtonClick = () => {
    if (isProcessing) return;
    setReasonError(null);
    setDecisionMode('REJECT');
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      setReasonError('Please select a mandatory rejection reason from the dropdown.');
      return;
    }
    setReasonError(null);
    try {
      await onReject(item, selectedReason, extraNote.trim() || undefined);
      onClose();
    } catch {
      // Error toast is shown by parent handler
    }
  };

  const formattedDate = (() => {
    try {
      const [y, m, d] = claim.expenseDate.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return claim.expenseDate;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col w-screen h-dvh overflow-hidden animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Expense Receipt Review for ${claim.workerName}`}
    >
      {/* Top Full-Screen Header Bar */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900/95 border-b border-slate-800 text-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-300 flex items-center justify-center shrink-0">
            <Receipt size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-base sm:text-lg font-black text-white truncate">
                {claim.workerName}
              </h2>
              <span className="font-mono text-base sm:text-lg font-black text-emerald-400 tabular-nums">
                ₹{claim.amount.toLocaleString('en-IN')}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-200 border border-teal-400/30 text-xs font-bold">
                {categoryLabel}
              </span>
              {isPolicyWarningActive && (
                <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-black uppercase tracking-wider">
                  POLICY_WARNING
                </span>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300 mt-0.5">
              <span className="inline-flex items-center gap-1 font-mono">
                <Calendar size={12} className="text-slate-400" />
                {formattedDate} ({claim.expenseDate})
              </span>
              {claim.approverName && (
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <UserCheck size={12} className="text-blue-400" />
                  Approver: <strong className="text-white">{claim.approverName}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Receipt View Controls & Close */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            className="h-10 px-2.5 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title={zoomed ? 'Reset zoom' : 'Zoom in receipt'}
          >
            {zoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
            <span className="hidden sm:inline">{zoomed ? '1x' : '2x Zoom'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="h-10 w-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            title="Rotate receipt 90°"
            aria-label="Rotate receipt 90 degrees"
          >
            <RotateCw size={16} />
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="h-10 w-10 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close receipt viewer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Contextual Policy Guardrail, Routing & Risk Banners */}
      {(isPolicyWarningActive ||
        isDuplicate ||
        claim.routingRuleApplied === 'DELEGATED_ON_LEAVE' ||
        claim.routingRuleApplied === 'SELF_APPROVAL_ESCALATED_TO_ADMIN' ||
        isOwnExpenseBlocked) && (
        <div className="px-4 py-2.5 sm:px-6 bg-slate-900/90 border-b border-slate-800 space-y-2 shrink-0">
          {isPolicyWarningActive && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-600 border border-rose-400 text-white text-xs sm:text-sm flex items-start gap-2.5 shadow-md"
            >
              <AlertTriangle size={18} className="text-white shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-black leading-snug">
                  {policyWarn?.bannerMessage ||
                    '⚠️ Warning: This claim exceeds the company daily category limit.'}
                </div>
                {policyWarn && (
                  <p className="text-[11px] sm:text-xs text-rose-100 mt-0.5 leading-relaxed">
                    Same-day {categoryLabel} total on{' '}
                    <span className="font-mono font-bold">{policyWarn.expenseDate}</span>:{' '}
                    <strong className="font-mono text-white">
                      {formatPaiseAsRupees(policyWarn.cumulativeDailyTotalPaise)}
                    </strong>{' '}
                    across{' '}
                    <strong>
                      {policyWarn.sameDayClaimCount} claim
                      {policyWarn.sameDayClaimCount === 1 ? '' : 's'}
                    </strong>{' '}
                    (+{formatPaiseAsRupees(policyWarn.exceededByPaise)} over the{' '}
                    {formatPaiseAsRupees(policyWarn.dailyLimitPaise)}/day limit). Approval requires
                    a mandatory override note.
                  </p>
                )}
              </div>
            </div>
          )}

          {isOwnExpenseBlocked && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-100 text-xs flex items-start gap-2.5">
              <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-black uppercase tracking-wider text-rose-300">
                  Self-Approval Blocked
                </div>
                <p className="mt-0.5">
                  Managers cannot approve their own expense claims (<code>workerId == approverId</code>). This claim is routed automatically to the Tenant Admin.
                </p>
              </div>
            </div>
          )}

          {claim.routingRuleApplied === 'DELEGATED_ON_LEAVE' && (
            <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-100 text-xs flex items-center gap-2">
              <UserCheck size={15} className="text-amber-400 shrink-0" />
              <span>
                <strong>E300-R Delegation Active:</strong> Routed to you because{' '}
                <strong>{claim.delegatedFromManagerName || 'assigned manager'}</strong> is on leave.
              </span>
            </div>
          )}

          {claim.routingRuleApplied === 'SELF_APPROVAL_ESCALATED_TO_ADMIN' && (
            <div className="p-2.5 rounded-xl bg-purple-950/70 border border-purple-500/50 text-purple-100 text-xs flex items-center gap-2">
              <ShieldAlert size={15} className="text-purple-300 shrink-0" />
              <span>
                <strong>E300-R Auto-Escalation:</strong> Manager self-expense blocked (<code>workerId == approverId</code>) and routed to Tenant Admin for review.
              </span>
            </div>
          )}

          {isDuplicate && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-100 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>HIGH_RISK_DUPLICATE:</strong> Identical receipt photo hash already submitted by{' '}
                <strong>{claim.duplicateOfWorkerName || 'another worker'}</strong> on{' '}
                <span className="font-mono">{claim.duplicateOfExpenseDate || 'earlier'}</span>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Receipt Inspection Stage */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-6 bg-slate-950 relative select-none"
        onClick={() => {
          if (decisionMode === 'VIEW') {
            setZoomed((z) => !z);
          }
        }}
      >
        <div
          className={`transition-transform duration-200 ease-out flex items-center justify-center ${
            zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
          }`}
          style={{
            transform: `scale(${zoomed ? 1.75 : 1}) rotate(${rotation}deg)`,
          }}
        >
          <img
            src={claim.receiptImageDataUrl}
            alt={`Full-screen receipt photo from ${claim.workerName}`}
            className="max-h-[68dvh] max-w-[92vw] sm:max-w-[78vw] rounded-2xl shadow-2xl border border-slate-700/80 bg-white object-contain"
          />
        </div>

        {/* Subtle bottom-left helper pill */}
        <div className="pointer-events-none fixed bottom-28 left-4 sm:left-6 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/85 border border-slate-700/80 text-[11px] font-semibold text-slate-300">
          <span>Tap receipt to {zoomed ? 'reset zoom' : 'zoom in'}</span>
          <span className="text-slate-600">•</span>
          <span className="font-mono text-slate-400">Live Camera Capture</span>
        </div>
      </div>

      {/* Mandatory Policy Override Note Panel (when approving a POLICY_WARNING claim) */}
      {decisionMode === 'APPROVE_OVERRIDE' && (
        <form
          onSubmit={handleConfirmOverrideApprove}
          className="px-4 py-4 sm:px-6 bg-slate-900 border-t-2 border-amber-400/90 text-white shrink-0 animate-in slide-in-from-bottom-3 duration-150"
        >
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                <h3 className="text-sm font-black text-white">
                  Mandatory Policy Override Note Required
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDecisionMode('VIEW');
                  setOverrideError(null);
                }}
                className="text-xs font-bold text-slate-400 hover:text-white underline cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div>
              <label
                htmlFor="expense-policy-override-note"
                className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1"
              >
                Override Justification *
              </label>
              <textarea
                id="expense-policy-override-note"
                required
                rows={2}
                value={overrideNote}
                onChange={(e) => {
                  setOverrideNote(e.target.value);
                  if (overrideError) setOverrideError(null);
                }}
                placeholder="e.g., Approved extra meal for late-night client breakdown support at Shed 4"
                className="w-full p-3 rounded-xl bg-slate-800 border-2 border-amber-400/60 focus:border-amber-300 text-white placeholder-slate-400 text-sm outline-none resize-none"
              />
            </div>

            {overrideError && (
              <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{overrideError}</span>
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDecisionMode('VIEW');
                  setOverrideError(null);
                }}
                disabled={isProcessing}
                className="h-12 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isProcessing || !overrideNote.trim() || isOwnExpenseBlocked}
                className="flex-1 h-12 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                <span>
                  {overrideNote.trim()
                    ? `Approve with Override (₹${claim.amount.toLocaleString('en-IN')})`
                    : 'Enter Override Note to Approve'}
                </span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Mandatory Rejection Reason Dropdown Panel (when Reject is clicked) */}
      {decisionMode === 'REJECT' && (
        <form
          onSubmit={handleConfirmReject}
          className="px-4 py-4 sm:px-6 bg-slate-900 border-t-2 border-rose-500/80 text-white shrink-0 animate-in slide-in-from-bottom-3 duration-150"
        >
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <XCircle size={18} className="text-rose-400 shrink-0" />
                <h3 className="text-sm font-black text-white">
                  Select Mandatory Rejection Reason
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDecisionMode('VIEW');
                  setReasonError(null);
                }}
                className="text-xs font-bold text-slate-400 hover:text-white underline cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="expense-reject-reason-select"
                  className="block text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1"
                >
                  Rejection Reason *
                </label>
                <select
                  id="expense-reject-reason-select"
                  required
                  value={selectedReason}
                  onChange={(e) => {
                    setSelectedReason(e.target.value as ExpenseRejectionReason | '');
                    if (reasonError) setReasonError(null);
                  }}
                  className="w-full h-12 px-3.5 rounded-xl bg-slate-800 border-2 border-rose-500/60 focus:border-rose-400 text-white text-sm font-semibold outline-none cursor-pointer"
                >
                  <option value="" disabled>
                    -- Select a reason (required) --
                  </option>
                  {EXPENSE_REJECTION_REASONS.map((reason: ExpenseRejectionReason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="expense-reject-extra-note"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1"
                >
                  Additional Note (Optional)
                </label>
                <input
                  id="expense-reject-extra-note"
                  type="text"
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  placeholder="e.g., Bill date or total is cut off"
                  className="w-full h-12 px-3.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-slate-500 text-white placeholder-slate-400 text-sm outline-none"
                />
              </div>
            </div>

            {reasonError && (
              <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{reasonError}</span>
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDecisionMode('VIEW');
                  setReasonError(null);
                }}
                disabled={isProcessing}
                className="h-12 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isProcessing || !selectedReason}
                className="flex-1 h-12 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-sm shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <XCircle size={18} />
                )}
                <span>
                  {selectedReason
                    ? `Confirm Reject — ${selectedReason}`
                    : 'Select Reason to Reject'}
                </span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Primary Bottom Action Bar: Approve (Green) & Reject (Red) */}
      {decisionMode !== 'REJECT' && decisionMode !== 'APPROVE_OVERRIDE' && (
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-slate-900 border-t border-slate-800 shrink-0">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleRejectButtonClick}
              className="flex-1 h-14 px-5 rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-base shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <XCircle size={20} className="shrink-0" />
              <span>Reject</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || item.isWaitingSync || isOwnExpenseBlocked}
              onClick={handleApproveClick}
              className={`flex-1 h-14 px-5 rounded-2xl font-black text-base text-white shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                decisionMode === 'APPROVED_FLASH'
                  ? 'bg-emerald-500 ring-4 ring-emerald-400/40 scale-[1.01]'
                  : isOwnExpenseBlocked
                  ? 'bg-slate-700 text-slate-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 shadow-emerald-600/30'
              }`}
            >
              {isProcessing || decisionMode === 'APPROVED_FLASH' ? (
                <>
                  <Loader2 size={20} className="animate-spin shrink-0" />
                  <span>Approving → PENDING_FINANCE…</span>
                </>
              ) : isOwnExpenseBlocked ? (
                <>
                  <ShieldAlert size={19} className="shrink-0" />
                  <span>Self-Approval Blocked</span>
                </>
              ) : isPolicyWarningActive ? (
                <>
                  <CheckCircle2 size={20} className="shrink-0" />
                  <span>Override &amp; Approve ₹{claim.amount.toLocaleString('en-IN')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} className="shrink-0" />
                  <span>Approve ₹{claim.amount.toLocaleString('en-IN')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
