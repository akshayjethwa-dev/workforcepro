import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, CheckCircle2, XCircle, AlertTriangle, Clock, MapPin, 
  IndianRupee, ShieldAlert, Filter, RefreshCw, 
  ChevronRight, Sparkles, UserCheck, Eye, X, FileCheck,
  Calendar, ShieldCheck, ArrowUpRight, Smartphone, Navigation, Cpu, Shield, Receipt
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  InboxItem, InboxActionType, InboxUrgency, 
  InboxAuditEntry, ScreenName, ExpenseRejectionReason
} from '../types/index';
import { inboxService, ManagerDelegation } from '../services/inboxService';
import { dbService } from '../services/db';
import {
  formatPaiseAsRupees,
  getExpenseCategoryLabel,
  hasPolicyWarning,
  TeamManagerEntry,
} from '../services/expenseService';
import { ExpenseReceiptReviewModal } from '../components/ExpenseReceiptReviewModal';
import { TruncatedText } from '../components/TruncatedText';
import {
  canAccessTechnicalInboxDetails,
  formatDistanceShort,
  getSimplifiedInboxPresentation
} from '../utils/attendanceAnomalyFormatter';

interface Props {
  onNavigate?: (screen: ScreenName) => void;
}

export const InboxScreen: React.FC<Props> = ({ onNavigate }) => {
  const { profile, isImpersonating } = useAuth();
  const { toast } = useToast();

  // Role-gated access: ONLY CA or Super Admin (or impersonating Super Admin/Partner) can view raw GPS & map details
  const hasRoleTechnicalAccess = canAccessTechnicalInboxDetails(profile, isImpersonating);
  const isDemoWorkspace = profile?.tenantId === 'demo-tenant-id';
  const [demoRoleMode, setDemoRoleMode] = useState<'MANAGER' | 'CA_SUPER_ADMIN'>(
    hasRoleTechnicalAccess ? 'CA_SUPER_ADMIN' : 'MANAGER'
  );
  const canViewTechnicalDetails = isDemoWorkspace
    ? demoRoleMode === 'CA_SUPER_ADMIN'
    : hasRoleTechnicalAccess;

  const [activeTab, setActiveTab] = useState<'PENDING' | 'DONE'>('PENDING');
  const [pendingItems, setPendingItems] = useState<InboxItem[]>([]);
  const [doneItems, setDoneItems] = useState<InboxItem[]>([]);
  const [auditTrail, setAuditTrail] = useState<InboxAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');

  // Review drawer & full-screen expense receipt modal state
  const [reviewingItem, setReviewingItem] = useState<InboxItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [inspectingExpenseItem, setInspectingExpenseItem] = useState<InboxItem | null>(null);
  const [inspectingExpenseMode, setInspectingExpenseMode] = useState<'VIEW' | 'REJECT' | 'APPROVE_OVERRIDE'>('VIEW');

  // Delegation modal (E300-R Manager On Leave routing)
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [teamManagers, setTeamManagers] = useState<TeamManagerEntry[]>([]);
  const [selectedDelegateId, setSelectedDelegateId] = useState<string>('');
  const [delegateName, setDelegateName] = useState('');
  const [delegateReason, setDelegateReason] = useState('On Leave');
  const [delegateStartDate, setDelegateStartDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [delegateEndDate, setDelegateEndDate] = useState(
    () => new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );
  const [delegations, setDelegations] = useState<ManagerDelegation[]>([]);

  // Pagination for large queues (> 50 items)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const loadData = async () => {
    if (!profile?.tenantId) return;
    setLoading(true);
    try {
      const [{ pending, done }, team] = await Promise.all([
        inboxService.getInboxItems(profile.tenantId, profile),
        dbService.getTeam(profile.tenantId).catch(() => []),
      ]);
      setPendingItems(pending);
      setDoneItems(done);
      setTeamManagers(team || []);
      setAuditTrail(inboxService.getAuditTrail(profile.tenantId));
      setDelegations(inboxService.getDelegations(profile.tenantId));
    } catch (e) {
      console.error(e);
      toast.error('Failed to load pending inbox items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const onClaimsChanged = () => {
      void loadData();
    };
    window.addEventListener('expenseClaimsChanged', onClaimsChanged);
    return () => {
      window.removeEventListener('expenseClaimsChanged', onClaimsChanged);
    };
  }, [profile?.tenantId, profile?.uid, profile?.role]);

  // Low-risk items count (advances under ₹500)
  const lowRiskItems = useMemo(() => {
    return pendingItems.filter(i => i.isLowRisk && i.status === 'PENDING' && !i.isWaitingSync);
  }, [pendingItems]);

  // Filtered pending items
  const filteredPending = useMemo(() => {
    return pendingItems.filter(item => {
      if (typeFilter !== 'ALL' && item.actionType !== typeFilter) return false;
      if (urgencyFilter !== 'ALL' && item.urgency !== urgencyFilter) return false;
      return true;
    });
  }, [pendingItems, typeFilter, urgencyFilter]);

  // Paginated pending items
  const paginatedPending = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPending.slice(start, start + pageSize);
  }, [filteredPending, currentPage]);

  const totalPages = Math.ceil(filteredPending.length / pageSize);

  const openExpenseModal = (
    item: InboxItem,
    mode: 'VIEW' | 'REJECT' | 'APPROVE_OVERRIDE' = 'VIEW'
  ) => {
    setInspectingExpenseMode(mode);
    setInspectingExpenseItem(item);
  };

  // Single Approve (routes POLICY_WARNING expense claims through mandatory override note modal)
  const handleApprove = async (
    item: InboxItem,
    customNotes?: string,
    overrideNote?: string
  ) => {
    if (!profile?.tenantId) return;
    if (item.isWaitingSync) {
      toast.warning('Cannot approve while data is waiting for offline sync.');
      return;
    }

    if (
      item.actionType === 'EXPENSE_APPROVAL' &&
      hasPolicyWarning(item.details?.expenseClaim) &&
      !overrideNote?.trim()
    ) {
      openExpenseModal(item, 'APPROVE_OVERRIDE');
      return;
    }

    setActionLoadingId(item.id);
    try {
      await inboxService.resolveItem(
        item.id,
        profile.tenantId,
        'APPROVE',
        profile.name || profile.email || 'Supervisor',
        customNotes ||
          (item.actionType === 'EXPENSE_APPROVAL'
            ? 'Receipt verified and approved — moved to PENDING_FINANCE'
            : 'Approved via frontline one-tap'),
        {
          actorProfile: profile,
          overrideNote: overrideNote?.trim() || undefined,
        }
      );
      if (item.actionType === 'EXPENSE_APPROVAL' && item.details?.expenseClaim) {
        const c = item.details.expenseClaim;
        toast.success(
          overrideNote?.trim()
            ? `Approved ₹${c.amount.toLocaleString('en-IN')} ${getExpenseCategoryLabel(c.category)} claim with policy override — status changed to PENDING_FINANCE`
            : `Approved ₹${c.amount.toLocaleString('en-IN')} ${getExpenseCategoryLabel(c.category)} claim — status changed to PENDING_FINANCE`
        );
      } else {
        const simplifiedHeadline = getSimplifiedInboxPresentation(item).headline;
        toast.success(`Approved: ${simplifiedHeadline}`);
      }
      if (reviewingItem?.id === item.id) {
        setReviewingItem(null);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve item');
      await loadData();
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  // Expense Reject with mandatory dropdown reason
  const handleRejectExpense = async (
    item: InboxItem,
    reasonCategory: ExpenseRejectionReason,
    additionalNote?: string
  ) => {
    if (!profile?.tenantId) return;
    setActionLoadingId(item.id);
    try {
      const fullReason = additionalNote ? `${reasonCategory} — ${additionalNote}` : reasonCategory;
      await inboxService.resolveItem(
        item.id,
        profile.tenantId,
        'REJECT',
        profile.name || profile.email || 'Supervisor',
        fullReason,
        {
          actorProfile: profile,
          rejectionReasonCategory: reasonCategory,
        }
      );
      toast.info(`Rejected expense claim (${reasonCategory})`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject expense claim');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  // Single Reject (non-expense items; expense items route through mandatory reason dropdown)
  const handleReject = async (item: InboxItem, customNotes?: string) => {
    if (!profile?.tenantId) return;
    if (item.actionType === 'EXPENSE_APPROVAL' && !customNotes?.trim()) {
      openExpenseModal(item, 'REJECT');
      return;
    }
    setActionLoadingId(item.id);
    try {
      await inboxService.resolveItem(
        item.id,
        profile.tenantId,
        'REJECT',
        profile.name || profile.email || 'Supervisor',
        customNotes || 'Rejected by supervisor',
        { actorProfile: profile }
      );
      const simplifiedHeadline = getSimplifiedInboxPresentation(item).headline;
      toast.info(`Rejected: ${simplifiedHeadline}`);
      if (reviewingItem?.id === item.id) {
        setReviewingItem(null);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject item');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Bulk Approve Low-Risk
  const handleBulkApprove = async () => {
    if (!profile?.tenantId || lowRiskItems.length === 0) return;
    setLoading(true);
    try {
      const ids = lowRiskItems.map(i => i.id);
      const approvedCount = await inboxService.bulkApproveLowRisk(
        ids,
        profile.tenantId,
        profile.name || profile.email || 'Supervisor'
      );
      toast.success(`Successfully approved ${approvedCount} low-risk advances.`);
      await loadData();
    } catch (err: any) {
      toast.error('Bulk approval failed');
    } finally {
      setLoading(false);
    }
  };

  // Save Delegation (E300-R Manager On Leave routing)
  const handleSaveDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenantId) return;

    const pickedTeamMgr = teamManagers.find((m) => m.uid === selectedDelegateId);
    const resolvedDelegateId = pickedTeamMgr?.uid || `delegate-${Date.now()}`;
    const resolvedDelegateName = pickedTeamMgr?.name || delegateName.trim();

    if (!resolvedDelegateName) {
      toast.error('Please choose a delegated manager or enter a delegate name.');
      return;
    }

    const newDelegation: ManagerDelegation = {
      managerId: profile.uid,
      delegateId: resolvedDelegateId,
      delegateName: resolvedDelegateName,
      reason: delegateReason.trim() || 'On Leave',
      startDate: delegateStartDate || new Date().toISOString().split('T')[0],
      endDate: delegateEndDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      isActive: true
    };

    inboxService.setDelegation(profile.tenantId, newDelegation);
    setDelegations(inboxService.getDelegations(profile.tenantId));
    setShowDelegationModal(false);
    setDelegateName('');
    setSelectedDelegateId('');
    toast.success(`E300-R delegation active: claims routed to ${newDelegation.delegateName}`);
    await loadData();
  };

  const getUrgencyBadge = (urgency: InboxUrgency) => {
    switch (urgency) {
      case 'URGENT':
        return <span className="px-2.5 py-1 text-xs font-bold uppercase rounded-md bg-rose-100 text-rose-800 border border-rose-300">Urgent</span>;
      case 'HIGH':
        return <span className="px-2.5 py-1 text-xs font-bold uppercase rounded-md bg-amber-100 text-amber-800 border border-amber-300">High</span>;
      case 'NORMAL':
        return <span className="px-2.5 py-1 text-xs font-bold uppercase rounded-md bg-blue-100 text-blue-800 border border-blue-300">Normal</span>;
      case 'LOW':
        return <span className="px-2.5 py-1 text-xs font-bold uppercase rounded-md bg-slate-100 text-slate-700 border border-slate-300">Low</span>;
    }
  };

  const getActionTypeLabel = (type: InboxActionType) => {
    switch (type) {
      case 'ADVANCE_APPROVAL':
        return { label: 'Advance Request', icon: IndianRupee, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'EXPENSE_APPROVAL':
        return { label: 'Expense Claim', icon: Receipt, color: 'text-teal-700 bg-teal-50 border-teal-200' };
      case 'ATTENDANCE_EXCEPTION':
        return { label: 'Attendance Alert', icon: AlertTriangle, color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'OVERTIME_APPROVAL':
        return { label: 'Overtime Approval', icon: Clock, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
      case 'CONFLICT_RESOLUTION':
        return { label: 'Punch Conflict', icon: ShieldAlert, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'PAYROLL_SIGNOFF':
        return { label: 'Payroll Review', icon: FileCheck, color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 'LEAVE_REQUEST':
        return { label: 'Leave Request', icon: Calendar, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
      case 'FNF_DEADLINE_BREACH':
        return { label: 'Final Settlement', icon: AlertTriangle, color: 'text-rose-800 bg-rose-50 border-rose-300' };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-3 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Inbox size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-2">
                  <h1 className="text-fluid-xl font-black text-slate-900 tracking-tight break-words">
                    Action Inbox
                  </h1>
                  {pendingItems.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-fluid-2xs font-extrabold bg-rose-600 text-white shrink-0">
                      {pendingItems.length} Pending
                    </span>
                  )}
                </div>
                <p className="text-fluid-xs text-slate-500 font-medium break-words">
                  Simple attendance alerts, overtime approvals, and requests — approve or reject in one tap
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto">
              {/* Demo-only role switcher so testers can preview Manager vs CA / Super Admin access */}
              {isDemoWorkspace && (
                <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setDemoRoleMode('MANAGER');
                      setReviewingItem(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      demoRoleMode === 'MANAGER'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Manager View
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoRoleMode('CA_SUPER_ADMIN')}
                    className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                      demoRoleMode === 'CA_SUPER_ADMIN'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Shield size={12} />
                    <span>CA / Super Admin</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowDelegationModal(true)}
                className="h-10 px-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Configure leave delegation"
              >
                <UserCheck size={16} className="text-blue-600" />
                <span>Delegation</span>
                {delegations.some(d => d.isActive) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                )}
              </button>

              <button
                onClick={loadData}
                disabled={loading}
                className="h-10 px-3 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : 'text-slate-500'} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Active Delegation Warning Banner */}
          {delegations.some(d => d.isActive) && (
            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-amber-700 shrink-0" />
                <span>
                  <strong>Active Delegation:</strong> Inbox authority shared with{' '}
                  <span className="underline font-bold">{delegations.find(d => d.isActive)?.delegateName}</span>.
                </span>
              </div>
              <button
                onClick={() => {
                  if (profile?.tenantId) {
                    const active = delegations.find((d) => d.isActive);
                    inboxService.removeDelegation(profile.tenantId, active?.managerId || profile.uid);
                    setDelegations(inboxService.getDelegations(profile.tenantId));
                    toast.info('Delegation terminated. Claims returned to primary manager.');
                    void loadData();
                  }
                }}
                className="text-amber-800 hover:text-amber-950 font-bold underline px-2 py-1 cursor-pointer"
              >
                Revoke
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-4 mt-4 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`pb-3 font-bold text-sm sm:text-base border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'PENDING'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Pending Actions</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'PENDING' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'
              }`}>
                {pendingItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('DONE')}
              className={`pb-3 font-bold text-sm sm:text-base border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'DONE'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Done & Audit Trail</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                {doneItems.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">
        {activeTab === 'PENDING' && (
          <div className="space-y-4">
            {/* Low-Risk Bulk Action Bar */}
            {lowRiskItems.length > 0 && (
              <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-2 border-emerald-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-emerald-950">
                      Bulk One-Tap Approval Available
                    </h3>
                    <p className="text-xs sm:text-sm text-emerald-800">
                      <strong>{lowRiskItems.length} low-risk advances</strong> (under ₹500) match safe policy guidelines.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleBulkApprove}
                  className="min-h-[3rem] py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-fluid-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 w-full sm:w-auto sm:min-w-[12.5rem]"
                >
                  <CheckCircle2 size={18} className="shrink-0" />
                  <span className="break-words">Approve All {lowRiskItems.length} Advances</span>
                </button>
              </div>
            )}

            {/* Filters Bar */}
            <div className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-1.5 w-full sm:w-auto min-w-0">
                <span className="text-fluid-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <Filter size={14} className="shrink-0" /> Type:
                </span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'ATTENDANCE_EXCEPTION', label: 'Attendance' },
                  { id: 'OVERTIME_APPROVAL', label: 'Overtime' },
                  { id: 'EXPENSE_APPROVAL', label: 'Expenses' },
                  { id: 'ADVANCE_APPROVAL', label: 'Advances' },
                  { id: 'CONFLICT_RESOLUTION', label: 'Conflicts' },
                  { id: 'PAYROLL_SIGNOFF', label: 'Payroll' },
                  { id: 'FNF_DEADLINE_BREACH', label: 'Settlements' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => { setTypeFilter(f.id); setCurrentPage(1); }}
                    className={`min-h-[2.25rem] px-3 py-1.5 rounded-lg text-fluid-xs font-bold transition-colors ${
                      typeFilter === f.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center flex-wrap gap-1.5 w-full sm:w-auto sm:justify-end">
                <span className="text-fluid-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  Urgency:
                </span>
                {['ALL', 'URGENT', 'HIGH', 'NORMAL'].map(u => (
                  <button
                    key={u}
                    onClick={() => { setUrgencyFilter(u); setCurrentPage(1); }}
                    className={`min-h-[2.25rem] px-2.5 py-1.5 rounded-lg text-fluid-xs font-bold transition-colors ${
                      urgencyFilter === u
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Items List */}
            {loading ? (
              <div className="p-16 text-center bg-white rounded-2xl border border-slate-200">
                <RefreshCw size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Loading pending items...</p>
              </div>
            ) : filteredPending.length === 0 ? (
              /* Positive Empty State */
              <div className="p-12 sm:p-16 text-center bg-white rounded-2xl border-2 border-dashed border-emerald-200 flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                  <CheckCircle2 size={44} />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
                  All Clear! No Pending Actions
                </h3>
                <p className="text-slate-600 max-w-md text-sm mb-6 leading-relaxed">
                  You have reviewed every advance request, attendance exception, and shift conflict assigned to your queue.
                </p>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-md w-full text-left">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Today's Operational Summary
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <div className="text-2xl font-black text-emerald-600">{doneItems.length}</div>
                      <div className="text-xs font-bold text-slate-600">Actions Completed</div>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <div className="text-2xl font-black text-blue-600">0</div>
                      <div className="text-xs font-bold text-slate-600">Blocked Items</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedPending.map(item => {
                  const typeMeta = getActionTypeLabel(item.actionType);
                  const view = getSimplifiedInboxPresentation(item);
                  const isProcessing = actionLoadingId === item.id;
                  const isSecurityFlag =
                    view.anomalyKind === 'ROOTED_DEVICE' ||
                    view.anomalyKind === 'EMULATOR' ||
                    view.anomalyKind === 'MOCK_GPS' ||
                    view.anomalyKind === 'CUSTOM_ROM';
                  const isLocationFlag = view.anomalyKind === 'GEOFENCE';
                  const isOvertime = view.anomalyKind === 'OVERTIME';

                  const BadgeIcon = isSecurityFlag
                    ? ShieldAlert
                    : isLocationFlag
                    ? MapPin
                    : isOvertime
                    ? Clock
                    : typeMeta.icon;

                  const badgeStyle = isSecurityFlag
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : isLocationFlag
                    ? 'text-amber-800 bg-amber-50 border-amber-200'
                    : isOvertime
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    : typeMeta.color;

                  const isExpenseCard = item.actionType === 'EXPENSE_APPROVAL' && Boolean(item.details?.expenseClaim);
                  const expenseClaim = item.details?.expenseClaim;
                  const expensePolicyWarn = expenseClaim?.policyWarning;
                  const isExpensePolicyWarning = isExpenseCard && hasPolicyWarning(expenseClaim);

                  return (
                    <div
                      key={item.id}
                      role={isExpenseCard ? 'button' : undefined}
                      tabIndex={isExpenseCard ? 0 : undefined}
                      onClick={isExpenseCard ? () => openExpenseModal(item, 'VIEW') : undefined}
                      onKeyDown={
                        isExpenseCard
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openExpenseModal(item, 'VIEW');
                              }
                            }
                          : undefined
                      }
                      className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        isExpensePolicyWarning
                          ? 'border-rose-300 ring-1 ring-rose-200 hover:border-rose-500 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500'
                          : isExpenseCard
                          ? 'border-slate-200 hover:border-teal-400 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Left: Simple Plain-English Explanation or Structured Expense Card */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`px-2.5 py-1 text-xs font-extrabold rounded-md border flex items-center gap-1 ${badgeStyle}`}>
                            <BadgeIcon size={13} />
                            <span>{view.categoryLabel}</span>
                          </span>
                          {view.overtimeBadge && (
                            <span className="px-2.5 py-1 text-xs font-black rounded-md bg-indigo-600 text-white shadow-2xs">
                              {view.overtimeBadge}
                            </span>
                          )}
                          {(item.urgency === 'URGENT' || item.urgency === 'HIGH') && getUrgencyBadge(item.urgency)}
                          {isExpensePolicyWarning && (
                            <span className="px-2 py-0.5 text-[11px] font-black rounded-md bg-rose-600 text-white border border-rose-700 flex items-center gap-1">
                              <AlertTriangle size={11} />
                              <span>POLICY_WARNING</span>
                            </span>
                          )}
                          {isExpenseCard && item.routingRuleApplied === 'DELEGATED_ON_LEAVE' && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <UserCheck size={11} />
                              <span>Delegated from {item.delegatedFromManagerName || 'Manager'} (On Leave)</span>
                            </span>
                          )}
                          {isExpenseCard && item.routingRuleApplied === 'SELF_APPROVAL_ESCALATED_TO_ADMIN' && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-purple-50 text-purple-800 border border-purple-300 flex items-center gap-1">
                              <ShieldAlert size={11} />
                              <span>Escalated to Tenant Admin (Self-Approval Blocked)</span>
                            </span>
                          )}
                          {item.isLowRisk && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Low Risk (&lt; ₹500)
                            </span>
                          )}
                          {item.isWaitingSync && (
                            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                              Waiting for Sync
                            </span>
                          )}
                          <span className="text-xs font-medium text-slate-400 flex items-center gap-1 ml-auto sm:ml-0">
                            <Clock size={12} />
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>

                        {isExpenseCard && expenseClaim ? (
                          /* Dedicated Expense Claim Card: Worker Name, Amount, Category, Date, and Receipt Thumbnail */
                          <div className="space-y-2.5">
                            {isExpensePolicyWarning && (
                              <div
                                role="alert"
                                className="p-3 rounded-xl bg-rose-600 border border-rose-700 text-white shadow-xs space-y-1"
                              >
                                <div className="text-xs sm:text-sm font-black leading-snug">
                                  {expensePolicyWarn?.bannerMessage ||
                                    '⚠️ Warning: This claim exceeds the company daily category limit.'}
                                </div>
                                {expensePolicyWarn && (
                                  <p className="text-[11px] text-rose-100 leading-snug">
                                    Daily total on{' '}
                                    <span className="font-mono font-bold">
                                      {expensePolicyWarn.expenseDate}
                                    </span>
                                    :{' '}
                                    <strong className="font-mono text-white">
                                      {formatPaiseAsRupees(expensePolicyWarn.cumulativeDailyTotalPaise)}
                                    </strong>{' '}
                                    across {expensePolicyWarn.sameDayClaimCount} claim
                                    {expensePolicyWarn.sameDayClaimCount === 1 ? '' : 's'} (+
                                    {formatPaiseAsRupees(expensePolicyWarn.exceededByPaise)} over
                                    limit) · Mandatory override note required to approve.
                                  </p>
                                )}
                              </div>
                            )}

                            {expenseClaim.riskFlag === 'HIGH_RISK_DUPLICATE' && (
                              <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-300 flex items-start gap-2.5 text-xs text-rose-900">
                                <ShieldAlert size={16} className="text-rose-700 shrink-0 mt-0.5" />
                                <div>
                                  <div className="font-black uppercase tracking-wider text-rose-800">
                                    HIGH_RISK_DUPLICATE — Identical Receipt Detected
                                  </div>
                                  <p className="mt-0.5 leading-relaxed">
                                    Exact SHA-256 image match with a receipt already submitted by{' '}
                                    <strong>{expenseClaim.duplicateOfWorkerName || 'another worker'}</strong> on{' '}
                                    <span className="font-mono font-bold">{expenseClaim.duplicateOfExpenseDate || 'earlier'}</span>.
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-3.5 sm:gap-4">
                              {/* Receipt Photo Thumbnail */}
                              <div className="relative group shrink-0 w-20 h-24 rounded-xl overflow-hidden border-2 border-slate-200 group-hover:border-teal-400 bg-slate-100 shadow-2xs">
                                <img
                                  src={expenseClaim.receiptImageDataUrl}
                                  alt={`${expenseClaim.workerName} receipt thumbnail`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-slate-950/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold gap-0.5">
                                  <Eye size={16} />
                                  <span>View</span>
                                </div>
                              </div>

                              {/* Worker Name, Amount, Category, Date */}
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                  <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight truncate">
                                    {expenseClaim.workerName}
                                  </h4>
                                  <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums">
                                    ₹{expenseClaim.amount.toLocaleString('en-IN')}
                                  </span>
                                </div>

                                <div className="flex items-center flex-wrap gap-2 text-xs">
                                  <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-extrabold">
                                    {getExpenseCategoryLabel(expenseClaim.category)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                    <Calendar size={12} className="text-slate-400" />
                                    {expenseClaim.expenseDate}
                                  </span>
                                  {expenseClaim.workerDesignation && (
                                    <span className="text-slate-500 font-medium">
                                      • {expenseClaim.workerDesignation}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                  <span className="inline-flex items-center gap-1 font-bold text-teal-700">
                                    <Eye size={13} />
                                    <span>Tap card to view full-screen receipt</span>
                                  </span>
                                  {expenseClaim.approverName && (
                                    <span className="text-[11px] font-semibold text-slate-500">
                                      Approver: <strong className="text-slate-700">{expenseClaim.approverName}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Plain-English Headline (no raw GPS or technical codes) */}
                            <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-1 leading-snug">
                              {view.headline}
                            </h4>
                            <p className="text-xs sm:text-sm text-slate-600 mb-2.5 leading-relaxed">
                              {view.subtext}
                            </p>

                            {/* EWA Accrued-Wage & Payroll Impact Callout */}
                            {item.details?.isEwa && (
                              <div className="mb-3 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                                    <IndianRupee size={12} className="text-emerald-700" />
                                    <span>Earned Wage Access (EWA)</span>
                                  </span>
                                  {item.details.payrollImpact?.isFnF && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                                      Full & Final Settlement
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                  <div className="p-2 bg-white rounded-lg border border-emerald-100">
                                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Requested</span>
                                    <span className="text-sm font-black text-emerald-800 font-mono">₹{item.amount?.toLocaleString()}</span>
                                  </div>
                                  <div className="p-2 bg-white rounded-lg border border-emerald-100">
                                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Accrued Balance</span>
                                    <span className="text-sm font-black text-slate-800 font-mono">₹{item.details.accruedBalance?.toLocaleString()}</span>
                                  </div>
                                  <div className="p-2 bg-white rounded-lg border border-emerald-100 col-span-2 sm:col-span-1">
                                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Remaining Accrual</span>
                                    <span className="text-sm font-black text-blue-700 font-mono">₹{item.details.payrollImpact?.remainingAccrual?.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* FnF Deadline Breach Callout */}
                            {item.actionType === 'FNF_DEADLINE_BREACH' && item.details?.fnfSettlement && (
                              <div className="mb-3 p-3 bg-rose-50 border border-rose-300 rounded-xl space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="font-extrabold text-rose-900 flex items-center gap-1">
                                    <AlertTriangle size={13} className="text-rose-700" />
                                    <span>Final Settlement Overdue</span>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-rose-700 text-white font-mono text-[10px] font-bold">
                                    +{item.details.overdueDays || 1}d Overdue
                                  </span>
                                </div>
                                {onNavigate && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (typeof sessionStorage !== 'undefined') {
                                        sessionStorage.setItem('gratuity_fnf_worker_id', item.workerId);
                                      }
                                      onNavigate('GRATUITY');
                                    }}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 hover:text-rose-950 underline cursor-pointer"
                                  >
                                    <span>Open Settlement Center</span>
                                    <ArrowUpRight size={13} />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Worker Identity + Role-Gated "View technical details" Link (CA / Super Admin only) */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-fluid-xs text-slate-500 font-medium min-w-0">
                              <span className="flex items-center gap-1.5 text-slate-800 font-bold min-w-0 max-w-full">
                                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] uppercase font-bold shrink-0">
                                  {item.workerName.charAt(0)}
                                </span>
                                <TruncatedText
                                  text={item.workerName}
                                  modalTitle="Worker Details"
                                  subtitle={item.workerDesignation || view.categoryLabel}
                                  details={[
                                    ...(item.workerPhone ? [{ label: 'Phone', value: item.workerPhone, mono: true }] : []),
                                    { label: 'Category', value: view.categoryLabel },
                                  ]}
                                  className="font-bold text-slate-800 text-fluid-xs max-w-[14rem]"
                                />
                              </span>
                              {item.workerDesignation && (
                                <span className="break-words text-slate-500">• {item.workerDesignation}</span>
                              )}

                              {/* Advanced View Link — strictly visible ONLY to CA or Super Admin */}
                              {canViewTechnicalDetails && view.hasTechnicalDetails && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewNotes('');
                                    setReviewingItem(item);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer ml-auto sm:ml-1"
                                >
                                  <span>View technical details</span>
                                  <ChevronRight size={13} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Right: Two Simple Action Buttons — Reject (Red) & Approve (Green) */}
                      <div
                        className="flex items-center gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isExpenseCard) {
                              openExpenseModal(item, 'REJECT');
                            } else {
                              void handleReject(item);
                            }
                          }}
                          className="flex-1 md:flex-none min-h-[3rem] min-w-[6.5rem] px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-600 hover:text-white hover:border-rose-600 active:bg-rose-700 text-rose-700 font-bold text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <XCircle size={17} className="shrink-0" />
                          <span>Reject</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing || item.isWaitingSync}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isExpensePolicyWarning) {
                              openExpenseModal(item, 'APPROVE_OVERRIDE');
                            } else {
                              void handleApprove(item).catch(() => {});
                            }
                          }}
                          className={`flex-1 md:flex-none min-h-[3rem] min-w-[7.25rem] px-5 py-2 rounded-xl font-black text-sm text-white shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer ${
                            item.isWaitingSync
                              ? 'bg-slate-400 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                          }`}
                        >
                          {isProcessing ? (
                            <RefreshCw size={18} className="animate-spin shrink-0" />
                          ) : (
                            <>
                              <CheckCircle2 size={17} className="shrink-0" />
                              <span>{isExpensePolicyWarning ? 'Override & Approve' : 'Approve'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls (> 50 items) */}
            {totalPages > 1 && (
              <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  Page {currentPage} of {totalPages} ({filteredPending.length} items total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="h-10 px-3 text-xs font-bold rounded-lg border border-slate-300 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="h-10 px-3 text-xs font-bold rounded-lg border border-slate-300 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DONE / AUDIT TAB */}
        {activeTab === 'DONE' && (
          <div className="space-y-4">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl">
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Completed Operational Actions Audit Trail
              </h3>
              <p className="text-xs text-slate-500">
                Immutable timestamped record of approvals, rejections, and conflict decisions
              </p>
            </div>

            {auditTrail.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
                <Clock size={36} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-600">No actions recorded in audit trail yet.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                {auditTrail.map(entry => (
                  <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-[11px] font-black rounded-md ${
                          entry.action === 'APPROVE' || entry.action === 'BULK_APPROVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {entry.action}
                        </span>
                        {entry.resultingStatus === 'PENDING_FINANCE' && (
                          <span className="px-2 py-0.5 text-[11px] font-black font-mono rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                            PENDING_FINANCE
                          </span>
                        )}
                        {entry.policyOverrideNote && (
                          <span className="px-2 py-0.5 text-[11px] font-black rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                            POLICY OVERRIDE
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-800">
                          {entry.workerName}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          ({entry.actionType.replace('_', ' ')})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {entry.notes}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-700">{entry.resolvedBy}</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(entry.resolvedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Technical Details Slide-Over Drawer (CA & Super Admin Only) */}
      {canViewTechnicalDetails && reviewingItem && (() => {
        const reviewView = getSimplifiedInboxPresentation(reviewingItem);
        const baseLoc = reviewingItem.details?.baseLocation;
        const punchLoc = reviewingItem.details?.punchLocation || reviewingItem.details?.punch?.location;
        const distanceMeters = reviewingItem.details?.distanceMeters;
        const hasGpsOrMap = Boolean(reviewingItem.details?.geofenceViolation || baseLoc || punchLoc || distanceMeters);
        const hasDeviceTelemetry = Boolean(
          reviewingItem.details?.isRootedDevice ||
          reviewingItem.details?.isMockGps ||
          reviewingItem.details?.isEmulator ||
          reviewingItem.details?.isCustomRom ||
          reviewingItem.details?.deviceIntegrityFailed ||
          reviewingItem.details?.deviceModel ||
          reviewingItem.details?.deviceFingerprint ||
          reviewingItem.details?.attestationSummary
        );
        const hasOvertimeMath = Boolean(reviewingItem.details?.overtimeHours && reviewingItem.details.overtimeHours > 0);

        return (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setReviewingItem(null)}
          />

          <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                  <Eye size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white truncate">
                      Technical Details
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30 text-[10px] font-bold uppercase">
                      CA / Super Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium truncate">
                    {reviewView.headline}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setReviewingItem(null)}
                className="w-10 h-10 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Worker Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 font-black text-lg flex items-center justify-center shrink-0">
                  {reviewingItem.workerName.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">{reviewingItem.workerName}</div>
                  <div className="text-xs text-slate-600">{reviewingItem.workerDesignation || 'Field Staff'} • ID: {reviewingItem.workerId}</div>
                  {reviewingItem.workerPhone && (
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{reviewingItem.workerPhone}</div>
                  )}
                </div>
              </div>

              {/* Geofence Map & Raw GPS Coordinates */}
              {hasGpsOrMap && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                      <Navigation size={16} className="text-amber-700" />
                      <span>Site Map &amp; Raw GPS Coordinates</span>
                    </div>
                    {typeof distanceMeters === 'number' && distanceMeters > 0 && (
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono text-[11px] font-bold">
                        {formatDistanceShort(distanceMeters)} ({distanceMeters.toLocaleString('en-IN')}m)
                      </span>
                    )}
                  </div>

                  {/* Geofence Map Visualizer */}
                  <div className="h-48 bg-slate-900 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-700">
                    {/* Subtle coordinate grid */}
                    <div
                      className="absolute inset-0 opacity-15"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
                        backgroundSize: '24px 24px'
                      }}
                    />
                    {/* Authorized Site Perimeter */}
                    <div className="w-28 h-28 rounded-full border-2 border-dashed border-emerald-400 bg-emerald-500/15 flex flex-col items-center justify-center relative z-10">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 mb-1" />
                      <div className="text-[10px] text-emerald-200 font-bold text-center leading-tight px-2">
                        Site Geofence<br />({baseLoc?.radius || 100}m radius)
                      </div>
                    </div>
                    {/* Punch Marker */}
                    {reviewingItem.details?.geofenceViolation || (distanceMeters && distanceMeters > (baseLoc?.radius || 100)) ? (
                      <div className="absolute top-4 right-6 flex flex-col items-center z-10">
                        <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg font-black text-xs border-2 border-white">
                          !
                        </div>
                        <span className="text-[10px] text-rose-200 font-mono font-bold bg-slate-950/90 px-2 py-0.5 rounded mt-1 border border-rose-500/40">
                          Punch (+{formatDistanceShort(distanceMeters || 0)})
                        </span>
                      </div>
                    ) : (
                      <div className="absolute bottom-3 right-3 text-[10px] font-mono text-emerald-300 bg-slate-950/80 px-2 py-1 rounded border border-emerald-500/30 z-10">
                        Inside Site Radius
                      </div>
                    )}
                    {baseLoc?.address && (
                      <div className="absolute bottom-2.5 left-3 text-[10px] text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded max-w-[70%] truncate z-10">
                        {baseLoc.address}
                      </div>
                    )}
                  </div>

                  {/* Raw GPS Telemetry Readout */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Authorized Site GPS</span>
                      <span className="font-mono text-slate-900 font-semibold">
                        {baseLoc ? `${baseLoc.lat.toFixed(5)}° N, ${baseLoc.lng.toFixed(5)}° E` : 'Not configured'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Recorded Punch GPS</span>
                      <span className="font-mono text-slate-900 font-semibold">
                        {punchLoc ? `${punchLoc.lat.toFixed(5)}° N, ${punchLoc.lng.toFixed(5)}° E` : 'Unavailable'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">GPS Accuracy</span>
                      <span className="font-mono text-slate-900 font-semibold">
                        {typeof reviewingItem.details?.gpsAccuracyMeters === 'number'
                          ? `±${reviewingItem.details.gpsAccuracyMeters}m`
                          : '±15m'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Mock GPS Detection</span>
                      <span className={`font-mono font-bold ${reviewingItem.details?.isMockGps ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {reviewingItem.details?.isMockGps ? 'MOCK_LOCATION = TRUE' : 'MOCK_LOCATION = FALSE'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Device Integrity & Security Telemetry */}
              {hasDeviceTelemetry && (
                <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-3 border border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Smartphone size={16} className="text-rose-400" />
                      <span>Device Integrity &amp; Attestation Telemetry</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      reviewingItem.details?.deviceIntegrityFailed || reviewingItem.details?.isRootedDevice || reviewingItem.details?.isMockGps
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {reviewingItem.details?.isRootedDevice
                        ? 'ROOTED / UNSAFE'
                        : reviewingItem.details?.isMockGps
                        ? 'SPOOFED GPS'
                        : reviewingItem.details?.isEmulator
                        ? 'EMULATOR'
                        : 'CHECKED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Device Model</span>
                      <span className="font-mono text-white font-semibold">
                        {reviewingItem.details?.deviceModel || reviewingItem.details?.punch?.device || 'Unknown device'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">OS / Bootloader</span>
                      <span className="font-mono text-white font-semibold">
                        {reviewingItem.details?.deviceOs || (reviewingItem.details?.isRootedDevice ? 'Rooted / Bootloader Unlocked' : 'Standard OS')}
                      </span>
                    </div>
                    {reviewingItem.details?.deviceFingerprint && (
                      <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 sm:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Hardware Fingerprint</span>
                        <span className="font-mono text-blue-300 text-[11px] break-all">
                          {reviewingItem.details.deviceFingerprint}
                        </span>
                      </div>
                    )}
                  </div>

                  {reviewingItem.details?.attestationSummary && (
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-700 font-mono text-[11px] text-amber-300 flex items-start gap-2">
                      <Cpu size={14} className="shrink-0 mt-0.5 text-amber-400" />
                      <span>{reviewingItem.details.attestationSummary}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Overtime Calculation & Raw Punch Window */}
              {hasOvertimeMath && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-indigo-950 flex items-center gap-1.5">
                      <Clock size={16} className="text-indigo-700" />
                      <span>Overtime Raw Punch &amp; Pay Breakdown</span>
                    </span>
                    {reviewView.overtimeBadge && (
                      <span className="px-2.5 py-0.5 rounded bg-indigo-600 text-white text-xs font-black">
                        {reviewView.overtimeBadge}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-200">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Scheduled Shift End</span>
                      <span className="font-mono font-bold text-slate-900">
                        {reviewingItem.details?.shiftEndTime || '06:00 PM'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-200">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Actual Punch Out</span>
                      <span className="font-mono font-bold text-indigo-800">
                        {reviewingItem.details?.actualPunchOutTime || '08:00 PM'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-200 col-span-2">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Formula Applied</span>
                      <span className="font-mono font-bold text-slate-900">
                        {reviewingItem.details?.overtimeHours} hrs × ₹{reviewingItem.details?.overtimeHourlyRate || 100}/hr × {reviewingItem.details?.overtimeMultiplier || 1.5}x = ₹{(reviewingItem.details?.overtimePayableAmount || reviewingItem.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Late Arrival Details */}
              {reviewingItem.details?.lateMinutes && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900">Late Duration:</span>
                    <span className="text-sm font-black text-rose-600">+{reviewingItem.details.lateMinutes} Minutes</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-blue-800">
                    <span>Shift Scheduled:</span>
                    <span className="font-bold">{reviewingItem.details.shiftStartTime}</span>
                  </div>
                  {reviewingItem.details.reason && (
                    <div className="p-2 bg-white rounded border border-blue-200 text-xs text-slate-700">
                      <strong>Worker Note:</strong> {reviewingItem.details.reason}
                    </div>
                  )}
                </div>
              )}

              {/* Dedicated EWA Breakdown & 4-Stage Status Timeline */}
              {reviewingItem.details?.isEwa && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-950 font-black text-sm">
                      <IndianRupee size={16} className="text-emerald-700" />
                      <span>Earned Wage Access Financial Audit</span>
                    </div>
                    {reviewingItem.details.payrollImpact?.isFnF && (
                      <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-rose-200 text-rose-900 border border-rose-300">
                        FnF Settlement
                      </span>
                    )}
                  </div>

                  {/* Financial Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Requested Withdrawal</span>
                      <span className="text-base font-black text-emerald-800 font-mono">₹{reviewingItem.amount?.toLocaleString()}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Net Accrued Balance</span>
                      <span className="text-base font-black text-slate-900 font-mono">₹{reviewingItem.details.accruedBalance?.toLocaleString()}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Remaining Accrual</span>
                      <span className="text-sm font-bold text-blue-700 font-mono">₹{reviewingItem.details.payrollImpact?.remainingAccrual?.toLocaleString()}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Upcoming Payslip Impact</span>
                      <span className="text-sm font-bold text-amber-800 font-mono">Itemized deduction</span>
                    </div>
                  </div>

                  {/* Payroll Itemization Specification */}
                  {reviewingItem.details.payrollImpact?.deductionLineItem && (
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200 text-xs text-slate-700 space-y-1">
                      <div className="text-[11px] font-bold text-slate-900">Payslip Deduction Line Item (Distinct, never opaque):</div>
                      <code className="text-xs font-mono text-emerald-800 bg-emerald-50/80 px-2 py-1 rounded block border border-emerald-100">
                        {reviewingItem.details.payrollImpact.deductionLineItem}
                      </code>
                    </div>
                  )}

                  {/* Regulatory / Partner Provider Notice */}
                  {reviewingItem.details.ewaDetails?.providerName && (
                    <div className="p-2.5 bg-slate-900 text-slate-200 rounded-lg text-xs space-y-1">
                      <div className="text-[11px] font-bold text-emerald-400">Regulatory Partner Integration</div>
                      <div className="text-[11px] text-slate-300">
                        Disbursed through <strong>{reviewingItem.details.ewaDetails.providerName}</strong> via <em>{reviewingItem.details.ewaDetails.lenderPartnerName || 'Northern Arc Capital Ltd. (RBI Registered NBFC)'}</em>.
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Fee: ₹{reviewingItem.details.ewaDetails.feeAmount} • Net Disbursed: ₹{reviewingItem.details.ewaDetails.netDisbursalAmount}
                      </div>
                    </div>
                  )}

                  {/* 4-Step Status Timeline: Requested -> Approved -> Disbursed -> Adjusted in payslip */}
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Status Timeline
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                      {[
                        { key: 'REQUESTED', label: 'Requested' },
                        { key: 'APPROVED', label: 'Approved' },
                        { key: 'DISBURSED', label: 'Disbursed' },
                        { key: 'ADJUSTED_IN_PAYSLIP', label: 'In Payslip' }
                      ].map((step, idx) => {
                        const currentStage = reviewingItem.details?.ewaDetails?.timelineStage || 'REQUESTED';
                        const stageOrder = ['REQUESTED', 'APPROVED', 'DISBURSED', 'ADJUSTED_IN_PAYSLIP'];
                        const isCurrentOrPast = stageOrder.indexOf(currentStage) >= idx;
                        const isCurrent = currentStage === step.key;

                        return (
                          <div
                            key={step.key}
                            className={`p-2 rounded-lg border font-bold transition-colors ${
                              isCurrent
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : isCurrentOrPast
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-400 border-slate-200'
                            }`}
                          >
                            <div className="text-xs mb-0.5">{idx + 1}</div>
                            <div>{step.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* FnF Deadline Breach Audit Details */}
              {reviewingItem.actionType === 'FNF_DEADLINE_BREACH' && reviewingItem.details?.fnfSettlement && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-rose-950 flex items-center gap-1.5">
                      <AlertTriangle size={16} className="text-rose-700" />
                      <span>Section 17(2) FnF Breach Audit</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-700 text-white font-mono text-[10px] font-bold">
                      {reviewingItem.details.overdueDays || 1}d OVERDUE
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 bg-white rounded-lg border border-rose-200">
                      <span className="text-[10px] font-sans text-slate-500 uppercase font-semibold block">Schedule A Wage FnF</span>
                      <span className="text-sm font-black text-slate-900">
                        ₹{(reviewingItem.details.fnfSettlement.fnfWageNetPayable ?? reviewingItem.details.fnfSettlement.netFnfPayable).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-rose-200">
                      <span className="text-[10px] font-sans text-slate-500 uppercase font-semibold block">12% p.a. Delay Interest</span>
                      <span className="text-sm font-black text-rose-700">
                        ₹{(reviewingItem.details.interestPenalty || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-rose-200">
                      <span className="text-[10px] font-sans text-slate-500 uppercase font-semibold block">Notice Recovery</span>
                      <span className="text-sm font-bold text-amber-800">
                        -₹{(reviewingItem.details.fnfSettlement.noticePayRecovery || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-rose-200">
                      <span className="text-[10px] font-sans text-slate-500 uppercase font-semibold block">Schedule B Gratuity (30d)</span>
                      <span className="text-sm font-bold text-emerald-800">
                        ₹{(reviewingItem.details.fnfSettlement.gratuityPayable || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof sessionStorage !== 'undefined') {
                          sessionStorage.setItem('gratuity_fnf_worker_id', reviewingItem.workerId);
                        }
                        setReviewingItem(null);
                        onNavigate('GRATUITY');
                      }}
                      className="w-full py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Open FnF Statement &amp; Legal Hold Controls</span>
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Recent Punch History */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} />
                  <span>Today's Punch History</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  {reviewingItem.details?.punchHistory && reviewingItem.details.punchHistory.length > 0 ? (
                    reviewingItem.details.punchHistory.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${p.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className="font-bold text-slate-800">Punch {p.type}</span>
                          <span className="text-slate-400">({p.device})</span>
                        </div>
                        <span className="font-mono text-slate-600">
                          {new Date(p.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-2">No prior punches recorded today.</div>
                  )}
                </div>
              </div>

              {/* Notes Input for Approval/Rejection */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Supervisor Remarks / Resolution Note</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g., Verified with site manager - train delay excused or road work confirmed."
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  rows={3}
                />
              </div>
            </div>

            {/* Drawer Bottom Actions (Frontline Thumb zone, >= 56px) */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              <button
                onClick={() => handleReject(reviewingItem, reviewNotes)}
                className="flex-1 h-14 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center gap-2"
              >
                <XCircle size={18} />
                <span>Reject</span>
              </button>

              <button
                type="button"
                disabled={reviewingItem.isWaitingSync}
                onClick={() => void handleApprove(reviewingItem, reviewNotes).catch(() => {})}
                className={`flex-1 h-14 rounded-xl font-black text-sm text-white shadow-sm flex items-center justify-center gap-2 cursor-pointer ${
                  reviewingItem.isWaitingSync
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                }`}
              >
                <CheckCircle2 size={18} />
                <span>Approve</span>
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Delegation Modal (E300-R Manager On Leave Routing) */}
      {showDelegationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-black text-lg">
                <UserCheck size={22} className="text-blue-600" />
                <span>Configure Leave Delegation</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDelegationModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              When you are on leave, E300-R routing automatically forwards your pending expense claims and approvals to your delegated manager.
            </p>

            <form onSubmit={handleSaveDelegation} className="space-y-4">
              {teamManagers.filter((m) => m.uid !== profile?.uid).length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Delegated Manager
                  </label>
                  <select
                    value={selectedDelegateId}
                    onChange={(e) => {
                      const uid = e.target.value;
                      setSelectedDelegateId(uid);
                      const picked = teamManagers.find((m) => m.uid === uid);
                      if (picked?.name) {
                        setDelegateName(picked.name);
                      }
                    }}
                    className="w-full h-12 px-3 text-sm rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="">-- Choose a team manager or enter custom below --</option>
                    {teamManagers
                      .filter((m) => m.uid !== profile?.uid)
                      .map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.name} {m.branchName ? `(${m.branchName})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Delegate Supervisor Name
                </label>
                <input
                  type="text"
                  required={!selectedDelegateId}
                  placeholder="e.g., Neha Desai (Branch Manager)"
                  value={delegateName}
                  onChange={(e) => {
                    setDelegateName(e.target.value);
                    if (selectedDelegateId) setSelectedDelegateId('');
                  }}
                  className="w-full h-12 px-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Leave Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={delegateStartDate}
                    onChange={(e) => setDelegateStartDate(e.target.value)}
                    className="w-full h-11 px-3 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Leave End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={delegateStartDate}
                    value={delegateEndDate}
                    onChange={(e) => setDelegateEndDate(e.target.value)}
                    className="w-full h-11 px-3 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={delegateReason}
                  onChange={(e) => setDelegateReason(e.target.value)}
                  placeholder="e.g., On Leave / Field Travel"
                  className="w-full h-11 px-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDelegationModal(false)}
                  className="flex-1 h-12 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-sm cursor-pointer"
                >
                  Confirm Delegation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Expense Receipt Review Modal */}
      <ExpenseReceiptReviewModal
        item={inspectingExpenseItem}
        initialMode={inspectingExpenseMode}
        actorProfile={profile}
        isProcessing={Boolean(inspectingExpenseItem && actionLoadingId === inspectingExpenseItem.id)}
        onClose={() => setInspectingExpenseItem(null)}
        onApprove={async (item, notes, overrideNote) => {
          await handleApprove(item, notes, overrideNote);
        }}
        onReject={handleRejectExpense}
      />
    </div>
  );
};
