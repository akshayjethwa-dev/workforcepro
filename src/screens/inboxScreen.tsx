import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, CheckCircle2, XCircle, AlertTriangle, Clock, MapPin, 
  IndianRupee, ShieldAlert, ArrowRight, Filter, RefreshCw, 
  ChevronRight, Sparkles, UserCheck, Eye, X, Check, FileCheck,
  Calendar, Phone, ExternalLink, ShieldCheck, UserX, ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  InboxItem, InboxActionType, InboxUrgency, 
  InboxAuditEntry, ScreenName 
} from '../types/index';
import { inboxService, ManagerDelegation } from '../services/inboxService';

interface Props {
  onNavigate?: (screen: ScreenName) => void;
}

export const InboxScreen: React.FC<Props> = ({ onNavigate }) => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'PENDING' | 'DONE'>('PENDING');
  const [pendingItems, setPendingItems] = useState<InboxItem[]>([]);
  const [doneItems, setDoneItems] = useState<InboxItem[]>([]);
  const [auditTrail, setAuditTrail] = useState<InboxAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');

  // Review drawer state
  const [reviewingItem, setReviewingItem] = useState<InboxItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Delegation modal
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegateName, setDelegateName] = useState('');
  const [delegations, setDelegations] = useState<ManagerDelegation[]>([]);

  // Pagination for large queues (> 50 items)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const loadData = async () => {
    if (!profile?.tenantId) return;
    setLoading(true);
    try {
      const { pending, done } = await inboxService.getInboxItems(profile.tenantId, profile);
      setPendingItems(pending);
      setDoneItems(done);
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
  }, [profile?.tenantId]);

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

  // Single Approve
  const handleApprove = async (item: InboxItem, customNotes?: string) => {
    if (!profile?.tenantId) return;
    if (item.isWaitingSync) {
      toast.warning('Cannot approve while data is waiting for offline sync.');
      return;
    }

    setActionLoadingId(item.id);
    try {
      await inboxService.resolveItem(
        item.id,
        profile.tenantId,
        'APPROVE',
        profile.email || 'Supervisor',
        customNotes || 'Approved via frontline one-tap'
      );
      toast.success(`Approved ${item.title}`);
      if (reviewingItem?.id === item.id) {
        setReviewingItem(null);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve item');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Single Reject
  const handleReject = async (item: InboxItem, customNotes?: string) => {
    if (!profile?.tenantId) return;
    setActionLoadingId(item.id);
    try {
      await inboxService.resolveItem(
        item.id,
        profile.tenantId,
        'REJECT',
        profile.email || 'Supervisor',
        customNotes || 'Rejected by supervisor'
      );
      toast.info(`Rejected ${item.title}`);
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
        profile.email || 'Supervisor'
      );
      toast.success(`Successfully approved ${approvedCount} low-risk advances.`);
      await loadData();
    } catch (err: any) {
      toast.error('Bulk approval failed');
    } finally {
      setLoading(false);
    }
  };

  // Save Delegation
  const handleSaveDelegation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenantId || !delegateName.trim()) return;

    const newDelegation: ManagerDelegation = {
      managerId: profile.uid,
      delegateId: `delegate-${Date.now()}`,
      delegateName: delegateName.trim(),
      reason: 'On Field Leave / Duty Travel',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      isActive: true
    };

    inboxService.setDelegation(profile.tenantId, newDelegation);
    setDelegations(inboxService.getDelegations(profile.tenantId));
    setShowDelegationModal(false);
    setDelegateName('');
    toast.success(`Inbox authority delegated to ${newDelegation.delegateName}`);
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
        return { label: 'Kharchi / Advance', icon: IndianRupee, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'ATTENDANCE_EXCEPTION':
        return { label: 'Attendance Exception', icon: AlertTriangle, color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'CONFLICT_RESOLUTION':
        return { label: 'Sync Conflict', icon: ShieldAlert, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'PAYROLL_SIGNOFF':
        return { label: 'Payroll Sign-off', icon: FileCheck, color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 'LEAVE_REQUEST':
        return { label: 'Leave Request', icon: Calendar, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Inbox size={26} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Unified Action Inbox
                  </h1>
                  {pendingItems.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-600 text-white animate-pulse">
                      {pendingItems.length} Pending
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  One-tap approvals, attendance exceptions, and shift escalations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setShowDelegationModal(true)}
                className="h-10 px-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors"
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
                className="h-10 px-3 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors"
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
                    inboxService.removeDelegation(profile.tenantId, profile.uid);
                    setDelegations(inboxService.getDelegations(profile.tenantId));
                    toast.info('Delegation terminated.');
                  }
                }}
                className="text-amber-800 hover:text-amber-950 font-bold underline px-2 py-1"
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
                  className="h-14 sm:h-12 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 shrink-0 min-w-[200px]"
                >
                  <CheckCircle2 size={18} />
                  <span>Approve All {lowRiskItems.length} Advances</span>
                </button>
              </div>
            )}

            {/* Filters Bar */}
            <div className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <Filter size={14} /> Type:
                </span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'ADVANCE_APPROVAL', label: 'Advances' },
                  { id: 'ATTENDANCE_EXCEPTION', label: 'Exceptions' },
                  { id: 'CONFLICT_RESOLUTION', label: 'Conflicts' },
                  { id: 'PAYROLL_SIGNOFF', label: 'Payroll' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => { setTypeFilter(f.id); setCurrentPage(1); }}
                    className={`h-9 px-3 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                      typeFilter === f.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  Urgency:
                </span>
                {['ALL', 'URGENT', 'HIGH', 'NORMAL'].map(u => (
                  <button
                    key={u}
                    onClick={() => { setUrgencyFilter(u); setCurrentPage(1); }}
                    className={`h-9 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
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
                  const Icon = typeMeta.icon;
                  const isProcessing = actionLoadingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      {/* Left Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`px-2.5 py-1 text-xs font-extrabold rounded-md border flex items-center gap-1 ${typeMeta.color}`}>
                            <Icon size={14} />
                            <span>{typeMeta.label}</span>
                          </span>
                          {getUrgencyBadge(item.urgency)}
                          {item.isLowRisk && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Low Risk (&lt; ₹500)
                            </span>
                          )}
                          {item.isWaitingSync && (
                            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                              ⏳ Waiting for Sync
                            </span>
                          )}
                          <span className="text-xs font-medium text-slate-400 flex items-center gap-1 ml-auto sm:ml-0">
                            <Clock size={12} />
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Title and Worker Info */}
                        <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-1 leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-600 mb-3 leading-relaxed">
                          {item.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                          <span className="flex items-center gap-1 text-slate-800 font-bold">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] uppercase font-bold">
                              {item.workerName.charAt(0)}
                            </span>
                            {item.workerName}
                          </span>
                          {item.workerDesignation && (
                            <span>• {item.workerDesignation}</span>
                          )}
                          {item.workerPhone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} className="text-slate-400" />
                              {item.workerPhone}
                            </span>
                          )}
                          {item.details?.distanceMeters && (
                            <span className="flex items-center gap-1 text-amber-700 font-bold">
                              <MapPin size={12} />
                              {item.details.distanceMeters}m outside geofence
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action Buttons (Anchored, >= 56px touch target) */}
                      <div className="flex items-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                        {/* Review Button */}
                        <button
                          onClick={() => setReviewingItem(item)}
                          className="h-14 min-w-[56px] px-4 rounded-xl border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
                          title="Open detailed side inspection drawer"
                        >
                          <Eye size={18} className="text-slate-600" />
                          <span>Review</span>
                        </button>

                        {/* Reject Button */}
                        <button
                          disabled={isProcessing}
                          onClick={() => handleReject(item)}
                          className="h-14 min-w-[56px] px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <XCircle size={18} />
                          <span>Reject</span>
                        </button>

                        {/* Primary Approve Button (>= 56px, high-contrast) */}
                        <button
                          disabled={isProcessing || item.isWaitingSync}
                          onClick={() => handleApprove(item)}
                          className={`h-14 min-w-[110px] px-5 rounded-xl font-black text-sm text-white shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-98 ${
                            item.isWaitingSync
                              ? 'bg-slate-400 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                          }`}
                        >
                          {isProcessing ? (
                            <RefreshCw size={18} className="animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 size={18} />
                              <span>Approve</span>
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-[11px] font-black rounded-md ${
                          entry.action === 'APPROVE' || entry.action === 'BULK_APPROVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {entry.action}
                        </span>
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

      {/* Slide-Over Review Drawer */}
      {reviewingItem && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setReviewingItem(null)}
          />

          <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Eye size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Inspection: {reviewingItem.workerName}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {reviewingItem.title}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setReviewingItem(null)}
                className="w-10 h-10 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
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

              {/* Geofence Map / Distance Section if Geofence Exception */}
              {reviewingItem.details?.geofenceViolation && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <MapPin size={18} className="text-amber-700" />
                    <span>Geofence Boundary Violation</span>
                  </div>
                  <div className="text-xs text-amber-800 leading-relaxed">
                    Worker recorded punch at <strong>{reviewingItem.details.distanceMeters} meters</strong> away from the authorized factory perimeter.
                  </div>

                  {/* Geofence Visualizer Canvas / Map Mock */}
                  <div className="h-44 bg-slate-900 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-700">
                    {/* Simulated Factory Perimeter */}
                    <div className="w-32 h-32 rounded-full border-2 border-dashed border-emerald-400 bg-emerald-500/10 flex items-center justify-center">
                      <div className="text-[10px] text-emerald-300 font-bold text-center">
                        Factory Zone<br/>(100m Radius)
                      </div>
                    </div>
                    {/* Punch Out-of-bounds marker */}
                    <div className="absolute top-4 right-8 flex flex-col items-center animate-bounce">
                      <div className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg font-bold text-xs">
                        !
                      </div>
                      <span className="text-[10px] text-rose-300 font-bold bg-slate-950/80 px-1.5 py-0.5 rounded mt-1">
                        Punch (+145m)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-white rounded border border-amber-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Authorized Center</span>
                      <span className="font-mono text-slate-800">19.0760° N, 72.8777° E</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-amber-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Punch Location</span>
                      <span className="font-mono text-slate-800">19.0772° N, 72.8785° E</span>
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
                disabled={reviewingItem.isWaitingSync}
                onClick={() => handleApprove(reviewingItem, reviewNotes)}
                className={`flex-1 h-14 rounded-xl font-black text-sm text-white shadow-sm flex items-center justify-center gap-2 ${
                  reviewingItem.isWaitingSync
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                }`}
              >
                <CheckCircle2 size={18} />
                <span>Approve & Settle</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delegation Modal */}
      {showDelegationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-black text-lg">
                <UserCheck size={22} className="text-blue-600" />
                <span>Configure Leave Delegation</span>
              </div>
              <button onClick={() => setShowDelegationModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              When you are away or on leave, your pending approvals and exceptions will automatically route to your assigned delegate.
            </p>

            <form onSubmit={handleSaveDelegation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Delegate Supervisor Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Rajesh Sharma (Assistant Supervisor)"
                  value={delegateName}
                  onChange={(e) => setDelegateName(e.target.value)}
                  className="w-full h-12 px-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDelegationModal(false)}
                  className="flex-1 h-12 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-sm"
                >
                  Confirm Delegation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
