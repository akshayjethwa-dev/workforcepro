import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, AlertTriangle, X, IndianRupee, Save, Lock, 
  UserCheck, Camera, Phone, MapPin, Building, Sparkles, Filter, Upload, Download,
  Calendar, Clock, Send, Key, UserX, Shield, CheckCircle2, RotateCcw, Smartphone
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { Worker, OrgSettings, Advance, AttendanceRecord, MagicLinkScope } from '../types/index';
import { EmployeeCapBanner } from '../components/EmployeeCapBanner';
import { UpgradePaywallModal } from '../components/UpgradePaywallModal';
import { BulkImportModal } from '../components/BulkImportModal';
import { employeeCapGuard, EmployeeCapExceededError } from '../services/employeeCapGuard';
import { WorkerEwaModal } from '../components/WorkerEwaModal';
import { SendMagicLinkModal } from '../components/SendMagicLinkModal';
import { WorkerAccessModal } from '../components/WorkerAccessModal';
import { magicLinkService } from '../services/magicLinkService';
import { validateWorkerWageStructure } from '../services/wageStructureValidationService';
import { WageStructureEditorModal } from '../components/WageStructureEditorModal';
import { WorkerCard } from '../components/WorkerCard';
import {
  calculateWorkerGratuity,
  getFnfSettlements,
} from '../services/gratuityService';
import {
  computeFnfSettlementStatement,
  evaluateFnfDeadline,
  triggerAutomatedDraftFnf,
} from '../services/fnfService';
import { FnfSettlementRecord, GratuityExitReason } from '../types/index';
import { downloadWorkerImportTemplate } from '../utils/workerExcelTemplate';

interface Props {
  onAddWorker: () => void;
  onEditWorker: (worker: Worker) => void;
  onNavigateToBilling?: () => void;
  onOpenFnfGratuity?: (workerId: string) => void;
}

export const WorkersScreen: React.FC<Props> = ({ onAddWorker, onEditWorker, onNavigateToBilling, onOpenFnfGratuity }) => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [ewaModalWorker, setEwaModalWorker] = useState<Worker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);

  // Cap Enforcement Modals
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [paywallError, setPaywallError] = useState<any>(null);
  const [showBulkImport, setShowBulkImport] = useState<boolean>(false);
  
  // State for deletion modal
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for Worker-Exit Auto-Revocation & FnF Gratuity confirmation
  const [workerToExit, setWorkerToExit] = useState<Worker | null>(null);
  const [isProcessingExit, setIsProcessingExit] = useState(false);
  const [exitDateInput, setExitDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [exitReasonInput, setExitReasonInput] = useState<GratuityExitReason>('RESIGNATION');
  const [exitDeathOverride, setExitDeathOverride] = useState<boolean>(false);
  const [exitNomineeName, setExitNomineeName] = useState<string>('');
  const [exitNoticeRequiredDays, setExitNoticeRequiredDays] = useState<string>('30');
  const [exitNoticeServedDays, setExitNoticeServedDays] = useState<string>('0');
  const [exitNoticeWaived, setExitNoticeWaived] = useState<boolean>(false);
  const [exitLeaveDays, setExitLeaveDays] = useState<string>('0');
  const [fnfRecords, setFnfRecords] = useState<FnfSettlementRecord[]>([]);

  // State for Manager-Initiated Magic Links (One-Tap Scoped Links)
  const [magicLinkWorker, setMagicLinkWorker] = useState<{ worker: Worker; scope: MagicLinkScope } | null>(null);

  // State for Worker Access & DPDP Audit Modal
  const [workerAccessTarget, setWorkerAccessTarget] = useState<Worker | null>(null);

  // State for Inline Wage Structure Editor Modal
  const [wageStructureWorker, setWageStructureWorker] = useState<Worker | null>(null);

  // State for Advance (Kharchi) Modal
  const [advanceModal, setAdvanceModal] = useState({
    isOpen: false,
    worker: null as Worker | null,
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reason: 'Kharchi',
    earned: 0,
    existingAdvances: 0,
    isSaving: false
  });

  const loadWorkersAndSettings = async () => {
    const tenantId = profile?.tenantId;
    if (tenantId) {
      try {
        const [workersData, settingsData, attendanceData, advancesData, fnfData] = await Promise.all([
            dbService.getWorkers(tenantId),
            dbService.getOrgSettings(tenantId),
            dbService.getAttendanceHistory(tenantId),
            dbService.getAdvances(tenantId),
            getFnfSettlements(tenantId)
        ]);
        setWorkers(workersData);
        setSettings(settingsData);
        setAttendanceRecords(attendanceData);
        setAdvances(advancesData);
        setFnfRecords(fnfData);
      } catch (error) {
        console.error("Failed to load workers data", error);
        toast.error("Failed to load workers directory");
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => { loadWorkersAndSettings(); }, [profile]);

  // Custom deletion logic handled via modal
  const confirmDelete = async () => {
    const tenantId = profile?.tenantId;
    if (!workerToDelete || !tenantId) return;
    setIsDeleting(true);
    
    try {
      await dbService.deleteWorker(tenantId, workerToDelete.id);
      setWorkers(prev => prev.filter(w => w.id !== workerToDelete.id)); 
      toast.success(`Removed ${workerToDelete.name} from records`);
      setWorkerToDelete(null);
    } catch (e) {
      console.error("Deletion failed:", e);
      toast.error("Failed to delete worker. Please check network connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Worker-Exit Auto-Revocation + Automated DRAFT FnF Trigger (Section 17(2) Code on Wages):
  // Marking RESIGNED / TERMINATED immediately generates a DRAFT FnF statement with 2-working-day deadline
  const handleConfirmWorkerExit = async () => {
    if (!workerToExit) return;
    const tenantId = profile?.tenantId || 'demo-tenant-id';
    const managerEmail = profile?.email || 'manager@factory.in';
    setIsProcessingExit(true);

    try {
      const effectiveDeath = exitDeathOverride || exitReasonInput === 'DEATH_IN_SERVICE';
      const nomineeToSave = exitNomineeName.trim() || workerToExit.nomineeName;
      const nextStatus: Worker['status'] =
        exitReasonInput === 'RESIGNATION'
          ? 'RESIGNED'
          : exitReasonInput === 'TERMINATION'
          ? 'TERMINATED'
          : 'INACTIVE';

      const exitUpdates: Partial<Worker> = {
        status: nextStatus,
        isActive: false,
        dateOfExit: exitDateInput,
        exitReason: exitReasonInput,
        deathInService: effectiveDeath,
        noticePeriodDays: Math.max(0, Number(exitNoticeRequiredDays || 0)),
        ...(nomineeToSave ? { nomineeName: nomineeToSave } : {}),
      };

      // 1. Update worker record in DB / storage with RESIGNED / TERMINATED / INACTIVE + exit fields
      await dbService.updateWorker(workerToExit.id, exitUpdates);

      // 2. Immediately generate & persist DRAFT FnF Statement with 2-working-day Section 17(2) deadline
      const updatedWorker: Worker = { ...workerToExit, ...exitUpdates };
      const fnfRecord = await triggerAutomatedDraftFnf({
        tenantId,
        worker: updatedWorker,
        exitDate: exitDateInput,
        exitReason: exitReasonInput,
        actorEmail: managerEmail,
        deathInService: effectiveDeath,
        nomineeName: nomineeToSave,
        nomineeRelation: updatedWorker.nomineeRelation || 'Nominee',
        leaveEncashmentDays: Math.max(0, Number(exitLeaveDays || 0)),
        noticePeriodRequiredDays: Math.max(0, Number(exitNoticeRequiredDays || 0)),
        noticePeriodServedDays: Math.max(0, Number(exitNoticeServedDays || 0)),
        noticePayWaived: exitNoticeWaived,
        attendanceRecords,
        advances,
        orgSettings: settings || undefined,
      });

      const deadlineEval = evaluateFnfDeadline(fnfRecord, Date.now(), settings);

      // 3. Auto-revoke all active magic tokens and unbind devices within 60 seconds
      const { revokedTokensCount, unboundDevicesCount } = await magicLinkService.revokeAllForWorker(
        workerToExit.id,
        tenantId,
        managerEmail,
        'worker exit'
      );

      // 4. Update local state
      setWorkers(prev => prev.map(w => w.id === workerToExit.id ? { ...w, ...exitUpdates } : w));
      setFnfRecords(await getFnfSettlements(tenantId));

      toast.success(
        `${workerToExit.name} marked ${nextStatus} (${exitDateInput}). DRAFT FnF created — Sec 17(2) Deadline: ${deadlineEval.effectiveDeadlineLabel}. Revoked ${revokedTokensCount} link(s) & unbound ${unboundDevicesCount} device(s).`
      );
      setWorkerToExit(null);
      setExitDeathOverride(false);
      setExitNomineeName('');
    } catch (err: any) {
      console.error('Failed to complete worker exit:', err);
      toast.error('Failed to mark worker exited.');
    } finally {
      setIsProcessingExit(false);
    }
  };

  const handleReactivateWorker = async (worker: Worker) => {
    try {
      await dbService.updateWorker(worker.id, {
        status: 'ACTIVE',
        isActive: true
      });
      setWorkers(prev => prev.map(w => w.id === worker.id ? { ...w, status: 'ACTIVE', isActive: true } : w));
      toast.success(`${worker.name} reactivated.`);
    } catch (err) {
      toast.error('Failed to reactivate worker.');
    }
  };

  const handleAddWorkerClick = async () => {
    const tenantId = profile?.tenantId || 'demo-tenant-id';
    try {
      // Pre-flight check against authoritative server-side cap guard
      await employeeCapGuard.assertCanAddWorker(tenantId, undefined, 1);
      onAddWorker();
    } catch (err: any) {
      if (err instanceof EmployeeCapExceededError || err?.code === 'EMPLOYEE_CAP_EXCEEDED') {
        setPaywallError(err);
        setShowPaywall(true);
      } else {
        toast.error(err.message || 'Cannot add worker');
      }
    }
  };

  // Quick Action Logic for Advances
  const handleOpenAdvance = async (worker: Worker) => {
    const tenantId = profile?.tenantId;
    if (!tenantId) return;
    if (!limits?.allowancesAndDeductionsEnabled) {
        toast.info("Advance/Kharchi tracking is available on Pro & Enterprise plans.");
        return;
    }
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    try {
      const [attendance, advances] = await Promise.all([
        dbService.getAttendanceHistory(tenantId),
        dbService.getAdvances(tenantId)
      ]);
      
      const earned = wageService.calculateCurrentEarnings(worker, currentMonth, attendance, settings || { shifts: [], enableBreakTracking: false });
      const existingAdvances = advances
          .filter(a => a.workerId === worker.id && a.date.startsWith(currentMonth))
          .reduce((sum, a) => sum + a.amount, 0);

      setAdvanceModal({ 
          isOpen: true, 
          worker, 
          amount: '', 
          date: new Date().toISOString().split('T')[0], 
          reason: 'Kharchi', 
          earned, 
          existingAdvances, 
          isSaving: false 
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load worker advance records");
    }
  };

  const handleSaveAdvance = async () => {
    const tenantId = profile?.tenantId;
    if (!tenantId || !advanceModal.worker || !advanceModal.amount) return;
    setAdvanceModal(prev => ({ ...prev, isSaving: true }));
    try {
      await dbService.addAdvance({
        tenantId: tenantId,
        workerId: advanceModal.worker.id,
        amount: parseFloat(advanceModal.amount),
        date: advanceModal.date,
        reason: advanceModal.reason || 'Kharchi',
        status: 'APPROVED'
      });
      toast.success(`Recorded ₹${parseFloat(advanceModal.amount).toLocaleString()} advance for ${advanceModal.worker.name}`);
      setAdvanceModal(prev => ({ ...prev, isOpen: false, isSaving: false }));
    } catch (e) {
      console.error(e);
      toast.error("Error saving worker advance.");
      setAdvanceModal(prev => ({ ...prev, isSaving: false }));
    }
  };

  const isWorkerExited = (w: Worker) =>
    w.status === 'INACTIVE' || w.status === 'RESIGNED' || w.status === 'TERMINATED' || w.isActive === false;

  const filteredWorkers = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.phone.includes(searchTerm) ||
                          (w.designation && w.designation.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesBranch = selectedBranch === 'ALL' || (w.branchId || 'default') === selectedBranch;
    const isInactive = isWorkerExited(w);
    const matchesStatus = statusFilter === 'ALL' 
      ? true 
      : statusFilter === 'ACTIVE' 
      ? !isInactive 
      : isInactive;
    return matchesSearch && matchesBranch && matchesStatus;
  });

  const willOverBorrow = (Number(advanceModal.amount || 0) + advanceModal.existingAdvances) > advanceModal.earned;

  return (
    <div className="space-y-6 pb-12">
      
      {/* TOOLBAR HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-fluid-xl font-bold tracking-tight text-slate-900 break-words">Workers Directory</h1>
          <div className="text-fluid-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            <span>Manage factory personnel &amp; pay rates</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{filteredWorkers.length} of {workers.length} listed</span>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto max-w-full">
          <button
            type="button"
            onClick={() => {
              try {
                const fileName = downloadWorkerImportTemplate();
                toast.success(`Downloaded ${fileName} (includes Sample Data & Read Me guide).`);
              } catch (err) {
                console.error('Template download failed:', err);
                toast.error('Unable to generate Excel template. Please try again.');
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 min-h-[2.5rem] px-3.5 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-xl font-semibold text-fluid-xs shadow-xs transition-all active:scale-95 min-w-0 cursor-pointer"
            title="Download pre-formatted Excel template (.xlsx) with Sample Data and Read Me guide"
          >
            <Download size={15} className="shrink-0" />
            <span className="break-words">Download Template</span>
          </button>
          <button 
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[2.5rem] px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-fluid-xs shadow-xs transition-all active:scale-95 min-w-0 cursor-pointer"
            title="Import workers in bulk via Excel or CSV"
          >
            <Upload size={15} className="shrink-0" />
            <span className="break-words">Bulk Import</span>
          </button>
          <button 
            type="button"
            onClick={handleAddWorkerClick}
            className="inline-flex items-center justify-center gap-2 min-h-[2.5rem] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-fluid-xs shadow-xs transition-all active:scale-95 min-w-0 cursor-pointer"
          >
            <Plus size={16} className="shrink-0" />
            <span className="break-words">Add New Worker</span>
          </button>
        </div>
      </div>

      {/* PERSISTENT EMPLOYEE CAP BANNER (SOFT CAP WARNING & HARD CAP PAYWALL) */}
      <EmployeeCapBanner 
        tenantId={profile?.tenantId || 'demo-tenant-id'} 
        onNavigateToBilling={onNavigateToBilling || (() => {})} 
      />

      {/* FILTER & SEARCH ROW */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 min-w-0">
        <div className="flex-1 min-w-0 sm:min-w-[14rem] relative">
          <Search className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" size={17} />
          <input 
            type="text" 
            placeholder="Search by worker name, phone number, or role..." 
            className="w-full min-h-[2.75rem] pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-fluid-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* STATUS FILTER SEGMENTED CONTROL: wraps gracefully on 320px & 200% zoom */}
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 text-fluid-xs font-semibold gap-1 max-w-full">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all min-w-0 ${statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            All ({workers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all min-w-0 ${statusFilter === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Active ({workers.filter(w => !isWorkerExited(w)).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all min-w-0 ${statusFilter === 'INACTIVE' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Exited ({workers.filter(w => isWorkerExited(w)).length})
          </button>
        </div>

        {settings?.branches && settings.branches.length > 1 && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="w-full sm:w-auto min-h-[2.75rem] bg-white border border-slate-200 text-fluid-xs font-semibold text-slate-700 py-2.5 px-3 rounded-xl shadow-xs outline-none hover:border-slate-300 transition-colors"
          >
            <option value="ALL">All Branches</option>
            {settings.branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* LOADING STATE */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-200 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-8 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        /* RESPONSIVE DUAL-VIEWPORT WORKER GRID: 1 column on phone, 2 cols on tablet, 3 cols on desktop */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 min-w-0">
          {filteredWorkers.map(worker => {
            const isInactive = isWorkerExited(worker);
            const workerTokens = magicLinkService.getTokensForWorker(worker.id);
            const activeTokensCount = workerTokens.active.length;
            const wageAudit = !isInactive
              ? validateWorkerWageStructure(worker, { orgSettings: settings || undefined })
              : null;
            const latestFnf = fnfRecords
              .filter((r) => r.workerId === worker.id)
              .sort((a, b) => b.exitDate.localeCompare(a.exitDate))[0];

            return (
              <WorkerCard
                key={worker.id}
                worker={worker}
                settings={settings}
                latestFnf={latestFnf}
                wageAudit={wageAudit}
                activeTokensCount={activeTokensCount}
                isInactive={isInactive}
                isOwner={profile?.role === 'TENANT_ADMIN' || profile?.role === 'FACTORY_OWNER'}
                allowancesEnabled={Boolean(limits?.allowancesAndDeductionsEnabled)}
                onEdit={onEditWorker}
                onExit={(w) => {
                  const initReason = w.exitReason || 'RESIGNATION';
                  setExitDateInput(w.dateOfExit || new Date().toISOString().split('T')[0]);
                  setExitReasonInput(initReason);
                  setExitDeathOverride(Boolean(w.deathInService || initReason === 'DEATH_IN_SERVICE'));
                  setExitNomineeName(w.nomineeName || '');
                  setExitNoticeRequiredDays(String(w.noticePeriodDays ?? (initReason === 'RESIGNATION' ? (w.category === 'Permanent' ? 30 : 15) : 0)));
                  setExitNoticeServedDays('0');
                  setExitNoticeWaived(false);
                  setExitLeaveDays(String(w.leaveBalances?.pl ?? settings?.leavePolicy?.pl ?? 0));
                  setWorkerToExit(w);
                }}
                onReactivate={handleReactivateWorker}
                onDelete={(w) => setWorkerToDelete(w)}
                onOpenEwa={(w) => setEwaModalWorker(w)}
                onOpenAdvance={handleOpenAdvance}
                onOpenMagicLink={(w, scope) => setMagicLinkWorker({ worker: w, scope })}
                onOpenAccess={(w) => setWorkerAccessTarget(w)}
                onOpenWageStructure={(w) => setWageStructureWorker(w)}
                onOpenFnfGratuity={onOpenFnfGratuity}
              />
            );
          })}
        </div>
      )}

      {/* EMPTY STATE */}
      {filteredWorkers.length === 0 && !loading && (
        <div className="text-center p-12 bg-white rounded-2xl border border-dashed border-slate-200 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Search size={22} />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">No matching workers found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm 
              ? `No workers match "${searchTerm}". Try a different name or clear the search filter.`
              : 'Add your factory operators and staff to begin tracking attendance and running payroll.'}
          </p>
          <button 
            onClick={handleAddWorkerClick}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-colors"
          >
            <Plus size={15} />
            <span>Add First Worker</span>
          </button>
        </div>
      )}

      {/* ADVANCE (KHARCHI) MODAL */}
      {advanceModal.isOpen && advanceModal.worker && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden border border-slate-100">
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <IndianRupee size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Issue Advance (Kharchi)</h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{advanceModal.worker.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setAdvanceModal(prev => ({ ...prev, isOpen: false }))} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-500 block text-[11px]">Earned this month</span>
                  <span className="font-bold text-slate-900 font-mono tabular-nums">
                    ₹{advanceModal.earned.toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[11px]">Advances Taken</span>
                  <span className="font-bold text-rose-600 font-mono tabular-nums">
                    ₹{advanceModal.existingAdvances.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Advance Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">₹</span>
                  <input 
                    type="number" 
                    placeholder="e.g. 1000"
                    autoFocus
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-mono tabular-nums text-base font-bold text-slate-900"
                    value={advanceModal.amount}
                    onChange={(e) => setAdvanceModal(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                {willOverBorrow && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>Amount exceeds total earnings accrued this month.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Date of Advance</label>
                <input 
                  type="date" 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-600 text-xs font-mono tabular-nums text-slate-800"
                  value={advanceModal.date}
                  onChange={(e) => setAdvanceModal(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Reason / Note</label>
                <input 
                  type="text" 
                  placeholder="Kharchi, festival advance, medical expense..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-600 text-xs text-slate-800"
                  value={advanceModal.reason}
                  onChange={(e) => setAdvanceModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setAdvanceModal(prev => ({ ...prev, isOpen: false }))} 
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveAdvance} 
                  disabled={advanceModal.isSaving || !advanceModal.amount}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-xs transition-colors"
                >
                  {advanceModal.isSaving ? 'Recording...' : 'Confirm Advance'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETION MODAL */}
      {workerToDelete && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            
            <h2 className="text-base font-bold text-center text-slate-900 mb-1">Remove Worker?</h2>
            <p className="text-xs text-slate-500 text-center mb-5">
              Are you sure you want to remove <strong>{workerToDelete.name}</strong>? Their historical attendance records and wage ledger will be permanently deleted.
            </p>

            <div className="flex gap-2">
              <button 
                onClick={() => setWorkerToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-colors"
              >
                {isDeleting ? 'Removing...' : 'Delete Worker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HARD CAP UPGRADE PAYWALL */}
      <UpgradePaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onNavigateToBilling={() => {
          setShowPaywall(false);
          if (onNavigateToBilling) onNavigateToBilling();
        }}
        errorPayload={paywallError}
      />

      {/* BULK EXCEL / CSV WORKER IMPORT & VALIDATION ENGINE */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        tenantId={profile?.tenantId || 'demo-tenant-id'}
        orgSettings={settings}
        existingWorkers={workers}
        actorEmail={profile?.email || 'admin@factory.in'}
        onSuccess={() => {
          loadWorkersAndSettings();
        }}
        onPaywallTrigger={(err) => {
          setPaywallError(err);
          setShowPaywall(true);
        }}
      />

      {/* EARNED WAGE ACCESS (EWA) MODAL */}
      {ewaModalWorker && profile?.tenantId && settings && (
        <WorkerEwaModal
          isOpen={Boolean(ewaModalWorker)}
          onClose={() => setEwaModalWorker(null)}
          worker={ewaModalWorker}
          tenantId={profile.tenantId}
          attendanceRecords={attendanceRecords}
          advances={advances}
          orgSettings={settings}
          onAdvanceCreated={(newAdv) => setAdvances(prev => [...prev, newAdv])}
        />
      )}

      {/* ONE-TAP MAGIC LINK DELIVERY MODAL */}
      {magicLinkWorker && (
        <SendMagicLinkModal
          worker={magicLinkWorker.worker}
          initialScope={magicLinkWorker.scope}
          tenantId={profile?.tenantId || 'demo-tenant-id'}
          issuedByEmail={profile?.email || 'manager@factory.in'}
          onClose={() => setMagicLinkWorker(null)}
          onEditWorker={(w) => {
            setMagicLinkWorker(null);
            onEditWorker(w);
          }}
        />
      )}

      {/* WORKER-EXIT AUTO-REVOCATION & AUTOMATED DRAFT FNF TRIGGER MODAL */}
      {workerToExit && (() => {
        const previewFnf = computeFnfSettlementStatement({
          tenantId: profile?.tenantId || 'demo-tenant-id',
          worker: workerToExit,
          exitDate: exitDateInput,
          exitReason: exitReasonInput,
          deathInService: exitDeathOverride || exitReasonInput === 'DEATH_IN_SERVICE',
          nomineeName: exitNomineeName || workerToExit.nomineeName,
          leaveEncashmentDays: Math.max(0, Number(exitLeaveDays || 0)),
          noticePeriodRequiredDays: Math.max(0, Number(exitNoticeRequiredDays || 0)),
          noticePeriodServedDays: Math.max(0, Number(exitNoticeServedDays || 0)),
          noticePayWaived: exitNoticeWaived,
          attendanceRecords,
          advances,
          orgSettings: settings,
        });
        const previewDeadline = evaluateFnfDeadline(previewFnf, Date.now(), settings);
        return (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 max-h-[90dvh] overflow-y-auto">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200">
                <UserX size={24} />
              </div>

              <h2 className="text-base font-bold text-center text-slate-900 mb-1">
                Mark Separation &amp; Trigger Automated FnF Draft
              </h2>
              <p className="text-xs text-slate-600 text-center mb-4">
                Marking <strong>{workerToExit.name}</strong> as RESIGNED / TERMINATED auto-generates a <strong>DRAFT FnF</strong> with a 2-working-day Section 17(2) deadline and revokes access.
              </p>

              <div className="space-y-3 mb-4 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Exit / Last Working Date</label>
                    <input
                      type="date"
                      value={exitDateInput}
                      onChange={(e) => setExitDateInput(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Separation Type</label>
                    <select
                      value={exitReasonInput}
                      onChange={(e) => {
                        const r = e.target.value as GratuityExitReason;
                        setExitReasonInput(r);
                        if (r === 'DEATH_IN_SERVICE') setExitDeathOverride(true);
                        if (r === 'RESIGNATION') {
                          setExitNoticeRequiredDays(String(workerToExit.noticePeriodDays ?? (workerToExit.category === 'Permanent' ? 30 : 15)));
                        } else {
                          setExitNoticeRequiredDays('0');
                          setExitNoticeServedDays('0');
                        }
                      }}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-semibold text-xs text-slate-900"
                    >
                      <option value="RESIGNATION">RESIGNED (Resignation)</option>
                      <option value="TERMINATION">TERMINATED (Termination)</option>
                      <option value="RETIREMENT">Retirement</option>
                      <option value="END_OF_CONTRACT">End of Contract</option>
                      <option value="DEATH_IN_SERVICE">Death in Service</option>
                      <option value="PERMANENT_DISABLEMENT">Permanent Disablement</option>
                    </select>
                  </div>
                </div>

                {/* Notice Period & Leave Encashment Controls */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Notice Req. (Days)</label>
                    <input
                      type="number"
                      min={0}
                      value={exitNoticeRequiredDays}
                      onChange={(e) => setExitNoticeRequiredDays(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Notice Served</label>
                    <input
                      type="number"
                      min={0}
                      value={exitNoticeServedDays}
                      onChange={(e) => setExitNoticeServedDays(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Leave Encash (Days)</label>
                    <input
                      type="number"
                      min={0}
                      value={exitLeaveDays}
                      onChange={(e) => setExitLeaveDays(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
                    />
                  </div>
                </div>

                {Number(exitNoticeRequiredDays || 0) > Number(exitNoticeServedDays || 0) && (
                  <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Waive Notice Pay Recovery ({previewFnf.noticeShortfallDays}d shortfall)
                    </span>
                    <input
                      type="checkbox"
                      checked={exitNoticeWaived}
                      onChange={(e) => setExitNoticeWaived(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                )}

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-rose-200 bg-rose-50/70 cursor-pointer">
                  <div>
                    <span className="font-bold text-rose-950 block text-[11px]">DEATH_IN_SERVICE Override</span>
                    <span className="text-[10px] text-rose-800">Waives 5-year threshold; pays nominee</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={exitDeathOverride}
                    onChange={(e) => {
                      setExitDeathOverride(e.target.checked);
                      if (e.target.checked) setExitReasonInput('DEATH_IN_SERVICE');
                    }}
                    className="w-4 h-4 accent-rose-600"
                  />
                </label>

                {(exitDeathOverride || exitReasonInput === 'DEATH_IN_SERVICE') && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nominee Name</label>
                    <input
                      type="text"
                      placeholder={workerToExit.nomineeName || 'Enter beneficiary nominee name'}
                      value={exitNomineeName}
                      onChange={(e) => setExitNomineeName(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                )}

                {/* Live Draft FnF Breakdown Preview */}
                <div className="p-3 bg-slate-900 text-white rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                      Draft FnF Preview (Sec 17(2))
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-600/30 text-blue-200 border border-blue-400/30 font-mono text-[10px]">
                      Due {previewDeadline.effectiveDeadlineLabel} (2 Working Days)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Pending Salary ({previewFnf.pendingSalaryDays}d):</span>
                    <span className="text-right text-emerald-300">+₹{previewFnf.pendingWagesEarned.toLocaleString('en-IN')}</span>
                    <span className="text-slate-400">Leave Encash ({previewFnf.leaveEncashmentDays}d):</span>
                    <span className="text-right text-emerald-300">+₹{previewFnf.leaveEncashmentAmount.toLocaleString('en-IN')}</span>
                    {(previewFnf.noticePayRecovery || 0) > 0 && (
                      <>
                        <span className="text-rose-300">Notice Recovery ({previewFnf.noticeShortfallDays}d):</span>
                        <span className="text-right text-rose-300">-₹{(previewFnf.noticePayRecovery || 0).toLocaleString('en-IN')}</span>
                      </>
                    )}
                    {previewFnf.advanceAndEwaRecovery > 0 && (
                      <>
                        <span className="text-rose-300">Advance / Loan Recovery:</span>
                        <span className="text-right text-rose-300">-₹{previewFnf.advanceAndEwaRecovery.toLocaleString('en-IN')}</span>
                      </>
                    )}
                    <span className="text-white font-bold pt-1 border-t border-slate-800">Schedule A · Wage FnF (2d):</span>
                    <span className="text-right text-white font-bold pt-1 border-t border-slate-800">
                      ₹{(previewFnf.fnfWageNetPayable ?? 0).toLocaleString('en-IN')}
                    </span>
                    {previewFnf.gratuityPayable > 0 && (
                      <>
                        <span className="text-emerald-300">Schedule B · Gratuity (30d):</span>
                        <span className="text-right text-emerald-300 font-bold">
                          ₹{previewFnf.gratuityPayable.toLocaleString('en-IN')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 space-y-1 mb-4 text-[11px] text-amber-900">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                  <span>60-Second Security &amp; Deadline Invariants:</span>
                </div>
                <p className="text-amber-800">
                  All active magic links will be auto-revoked and devices unbound. A DRAFT FnF record will be saved immediately so Admin can Approve &amp; Process Off-Cycle Payment before the 2-working-day deadline.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setWorkerToExit(null)}
                    disabled={isProcessingExit}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmWorkerExit}
                    disabled={isProcessingExit}
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    {isProcessingExit ? 'Generating Draft FnF...' : 'Confirm Exit & Trigger FnF'}
                  </button>
                </div>
                {onOpenFnfGratuity && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = workerToExit.id;
                      setWorkerToExit(null);
                      onOpenFnfGratuity(targetId);
                    }}
                    className="w-full py-2 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                  >
                    Open Full FnF Deadline &amp; Settlement Workspace →
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* WORKER ACCESS, BOUND DEVICES & DPDP AUDIT MODAL */}
      {workerAccessTarget && (
        <WorkerAccessModal
          worker={workerAccessTarget}
          tenantId={profile?.tenantId || 'demo-tenant-id'}
          managerEmail={profile?.email || 'manager@factory.in'}
          onClose={() => setWorkerAccessTarget(null)}
          onSendMagicLink={(scope) => {
            const target = workerAccessTarget;
            setWorkerAccessTarget(null);
            setMagicLinkWorker({ worker: target, scope });
          }}
        />
      )}

      {/* INLINE WAGE STRUCTURE EDITOR & 50% RULE AUDIT MODAL */}
      <WageStructureEditorModal
        isOpen={Boolean(wageStructureWorker)}
        worker={wageStructureWorker}
        orgSettings={settings}
        onClose={() => setWageStructureWorker(null)}
        onSaved={(updated) => {
          setWorkers(prev => prev.map(w => (w.id === updated.id ? updated : w)));
        }}
      />

    </div>
  );
};