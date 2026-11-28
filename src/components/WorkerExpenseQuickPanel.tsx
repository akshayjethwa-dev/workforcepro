// src/components/WorkerExpenseQuickPanel.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  ShieldAlert,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { ExpenseClaim, ExpenseWorkerNotification, OrgSettings, Worker } from '../types/index';
import {
  expenseService,
  formatPayrollMonthLabel,
  getExpenseCategoryLabel,
  hasPolicyWarning,
  isClaimImmutable,
} from '../services/expenseService';
import { syncService } from '../services/syncService';
import { OneTapExpenseModal } from './OneTapExpenseModal';

interface WorkerExpenseQuickPanelProps {
  tenantId: string;
  worker: Pick<Worker, 'id' | 'name'> &
    Partial<Pick<Worker, 'phone' | 'designation' | 'branchId'>>;
  orgSettings?: OrgSettings | null;
  compact?: boolean;
}

export const WorkerExpenseQuickPanel: React.FC<WorkerExpenseQuickPanelProps> = ({
  tenantId,
  worker,
  orgSettings,
  compact = false,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [notifications, setNotifications] = useState<ExpenseWorkerNotification[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const loadClaims = useCallback(() => {
    setClaims(expenseService.getClaimsForWorker(tenantId, worker.id));
    setNotifications(
      expenseService.getWorkerExpenseNotifications(tenantId, worker.id).filter((n) => !n.read)
    );
  }, [tenantId, worker.id]);

  useEffect(() => {
    loadClaims();
    const onClaimsChanged = () => loadClaims();
    const onQueueChanged = () => loadClaims();
    const onOnline = () => {
      setIsOnline(true);
      void syncService.syncPendingData().then(() => loadClaims());
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('expenseClaimsChanged', onClaimsChanged);
    window.addEventListener('expenseWorkerNotificationsChanged', onClaimsChanged);
    window.addEventListener('offlineQueueChanged', onQueueChanged);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('expenseClaimsChanged', onClaimsChanged);
      window.removeEventListener('expenseWorkerNotificationsChanged', onClaimsChanged);
      window.removeEventListener('offlineQueueChanged', onQueueChanged);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadClaims]);

  const pendingLocalCount = claims.filter((c) => c.status === 'PENDING_LOCAL').length;

  const handleManualSync = async () => {
    if (!isOnline) return;
    setSyncing(true);
    try {
      await syncService.syncPendingData();
      loadClaims();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-3 print:hidden">
      {/* Prominent One-Tap "Add Expense" Home Screen Card */}
      <div
        className={`rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-sm ${
          compact ? 'p-3.5' : 'p-4 sm:p-5'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Camera size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black leading-tight">
                  Quick Expense Reimbursement
                </h3>
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/40 text-[10px] font-bold text-amber-100">
                    <WifiOff size={10} /> Offline Queue Active
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-50/90 mt-0.5 leading-snug">
                Enter amount, pick category, snap live receipt photo — done in 10 seconds.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-h-12 px-5 py-2.5 rounded-xl bg-white hover:bg-emerald-50 active:scale-[0.98] text-emerald-800 font-black text-sm shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Plus size={18} />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Unread Worker Expense Payout Notifications (e.g. Mid-Payroll Deferral to Next Month) */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.slice(0, 3).map((notif) => (
            <div
              key={notif.id}
              className={`rounded-2xl border p-3.5 flex items-start justify-between gap-3 ${
                notif.type === 'DEFERRED_NEXT_MONTH_PAYROLL'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : notif.type === 'ROUTED_TO_FNF'
                  ? 'bg-purple-50 border-purple-200 text-purple-950'
                  : notif.type === 'FINANCE_REJECTED'
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <Bell size={15} className="shrink-0 mt-0.5" />
                <div className="text-xs min-w-0">
                  <div className="font-extrabold">{notif.title}</div>
                  <p className="mt-0.5 leading-snug opacity-90">{notif.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  expenseService.markWorkerExpenseNotificationRead(tenantId, notif.id);
                  loadClaims();
                }}
                aria-label="Dismiss notification"
                className="p-1 rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Live Expense Claim Status Feed */}
      {claims.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-emerald-600" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                My Expense Claims ({claims.length})
              </h4>
            </div>
            {pendingLocalCount > 0 && isOnline && (
              <button
                type="button"
                onClick={() => void handleManualSync()}
                disabled={syncing}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
                <span>Sync {pendingLocalCount} Local</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {claims.slice(0, 5).map((claim) => (
              <div
                key={claim.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={claim.receiptImageDataUrl}
                    alt="Receipt thumbnail"
                    className="w-10 h-12 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-50"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black font-mono text-slate-900">
                        ₹{claim.amount.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {getExpenseCategoryLabel(claim.category)}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {claim.expenseDate}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 truncate" title={claim.statusMessage}>
                      {claim.statusMessage}
                    </p>
                    {hasPolicyWarning(claim) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 mt-0.5 mr-2">
                        <AlertTriangle size={11} />
                        POLICY_WARNING: {claim.policyWarning?.bannerMessage || 'Exceeds daily limit'}
                      </span>
                    )}
                    {claim.taxClassification === 'TAXABLE' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 mt-0.5 mr-2">
                        <AlertTriangle size={11} />
                        Flagged Taxable (Added to Gross Salary)
                      </span>
                    )}
                    {claim.payoutDestination === 'NEXT_MONTH_PAYROLL' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 mt-0.5 mr-2">
                        <Bell size={11} />
                        Scheduled for {formatPayrollMonthLabel(claim.payrollMonth || '')} Payroll
                      </span>
                    )}
                    {claim.payoutDestination === 'FNF_SETTLEMENT' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-800 mt-0.5 mr-2">
                        <Lock size={11} />
                        Routed to Full &amp; Final (FnF) Settlement
                      </span>
                    )}
                    {claim.riskFlag === 'HIGH_RISK_DUPLICATE' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 mt-0.5">
                        <ShieldAlert size={11} />
                        Duplicate receipt flagged for review
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                    claim.status === 'PENDING_LOCAL'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : claim.status === 'PENDING_FINANCE'
                      ? 'bg-teal-50 text-teal-800 border-teal-300'
                      : claim.status === 'PAID'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : claim.status === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : claim.status === 'REJECTED'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {claim.status === 'PENDING_LOCAL' ? (
                    <>
                      <Clock size={10} />
                      <span>PENDING_LOCAL</span>
                    </>
                  ) : claim.status === 'PENDING_FINANCE' ? (
                    <>
                      <CheckCircle2 size={10} />
                      <span>PENDING_FINANCE</span>
                    </>
                  ) : claim.status === 'PAID' ? (
                    <>
                      <CheckCircle2 size={10} />
                      <span>Paid</span>
                    </>
                  ) : claim.status === 'APPROVED' ? (
                    <>
                      {isClaimImmutable(claim) ? <Lock size={10} /> : <CheckCircle2 size={10} />}
                      <span>{isClaimImmutable(claim) ? 'Approved · Locked' : 'Approved'}</span>
                    </>
                  ) : claim.status === 'REJECTED' ? (
                    <>
                      <XCircle size={10} />
                      <span>Rejected</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={10} />
                      <span>Submitted</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <OneTapExpenseModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantId={tenantId}
        worker={worker}
        orgSettings={orgSettings}
        onSubmitted={() => loadClaims()}
      />
    </div>
  );
};
