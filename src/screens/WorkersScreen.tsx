import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, AlertTriangle, X, IndianRupee, Save, Lock, 
  UserCheck, Camera, Phone, MapPin, Building, Sparkles, Filter, Upload,
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
import {
  buildFnfSettlementPreview,
  calculateWorkerGratuity,
  saveFnfSettlement,
} from '../services/gratuityService';
import { GratuityExitReason } from '../types/index';

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
        const [workersData, settingsData, attendanceData, advancesData] = await Promise.all([
            dbService.getWorkers(tenantId),
            dbService.getOrgSettings(tenantId),
            dbService.getAttendanceHistory(tenantId),
            dbService.getAdvances(tenantId)
        ]);
        setWorkers(workersData);
        setSettings(settingsData);
        setAttendanceRecords(attendanceData);
        setAdvances(advancesData);
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

  // Worker-Exit Auto-Revocation + FnF Gratuity Settlement:
  // Marking worker inactive auto-revokes all tokens, unbinds devices within 60s, and records FnF Gratuity
  const handleConfirmWorkerExit = async () => {
    if (!workerToExit) return;
    const tenantId = profile?.tenantId || 'demo-tenant-id';
    const managerEmail = profile?.email || 'manager@factory.in';
    setIsProcessingExit(true);

    try {
      const effectiveDeath = exitDeathOverride || exitReasonInput === 'DEATH_IN_SERVICE';
      const nomineeToSave = exitNomineeName.trim() || workerToExit.nomineeName;
      const exitUpdates: Partial<Worker> = {
        status: 'INACTIVE',
        isActive: false,
        dateOfExit: exitDateInput,
        exitReason: exitReasonInput,
        deathInService: effectiveDeath,
        ...(nomineeToSave ? { nomineeName: nomineeToSave } : {}),
      };

      // 1. Update worker record in DB / storage to INACTIVE with exit & nominee fields
      await dbService.updateWorker(workerToExit.id, exitUpdates);

      // 2. Generate & save FnF Gratuity Settlement record for the exit month
      const updatedWorker: Worker = { ...workerToExit, ...exitUpdates };
      const exitMonth = exitDateInput.slice(0, 7);
      const payroll = settings
        ? wageService.generateMonthlyPayroll(updatedWorker, exitMonth, attendanceRecords, advances, settings)
        : undefined;
      const fnfRecord = buildFnfSettlementPreview({
        tenantId,
        worker: updatedWorker,
        exitDate: exitDateInput,
        exitReason: exitReasonInput,
        deathInService: effectiveDeath,
        nomineeName: nomineeToSave,
        nomineeRelation: updatedWorker.nomineeRelation || 'Nominee',
        leaveEncashmentDays: 0,
        monthlyPayrollForExitMonth: payroll,
        attendanceRecords,
        advances,
        orgSettings: settings || undefined,
      });
      fnfRecord.status = 'APPROVED';
      await saveFnfSettlement(fnfRecord, managerEmail);

      // 3. Auto-revoke all active magic tokens and unbind devices within 60 seconds
      const { revokedTokensCount, unboundDevicesCount } = await magicLinkService.revokeAllForWorker(
        workerToExit.id,
        tenantId,
        managerEmail,
        'worker exit'
      );

      // 4. Update local state
      setWorkers(prev => prev.map(w => w.id === workerToExit.id ? { ...w, ...exitUpdates } : w));

      toast.success(
        `${workerToExit.name} exited (${exitDateInput}). FnF Gratuity: ₹${fnfRecord.gratuityPayable.toLocaleString('en-IN')}. Auto-revoked ${revokedTokensCount} link(s) & unbound ${unboundDevicesCount} device(s).`
      );
      setWorkerToExit(null);
      setExitDeathOverride(false);
      setExitNomineeName('');
    } catch (err: any) {
      console.error('Failed to complete worker exit:', err);
      toast.error('Failed to mark worker inactive.');
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

  const filteredWorkers = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.phone.includes(searchTerm) ||
                          (w.designation && w.designation.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesBranch = selectedBranch === 'ALL' || (w.branchId || 'default') === selectedBranch;
    const isInactive = w.status === 'INACTIVE' || w.isActive === false;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Workers Directory</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Manage factory personnel & pay rates</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{filteredWorkers.length} of {workers.length} active</span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button 
            onClick={() => setShowBulkImport(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95"
            title="Import workers in bulk via CSV"
          >
            <Upload size={15} />
            <span>Bulk CSV Import</span>
          </button>
          <button 
            onClick={handleAddWorkerClick}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95 shrink-0"
          >
            <Plus size={16} />
            <span>Add New Worker</span>
          </button>
        </div>
      </div>

      {/* PERSISTENT EMPLOYEE CAP BANNER (SOFT CAP WARNING & HARD CAP PAYWALL) */}
      <EmployeeCapBanner 
        tenantId={profile?.tenantId || 'demo-tenant-id'} 
        onNavigateToBilling={onNavigateToBilling || (() => {})} 
      />

      {/* FILTER & SEARCH ROW */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={17} />
          <input 
            type="text" 
            placeholder="Search by worker name, phone number, or role..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* STATUS FILTER PILLS */}
        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            All ({workers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Active ({workers.filter(w => w.status !== 'INACTIVE' && w.isActive !== false).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'INACTIVE' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Exited ({workers.filter(w => w.status === 'INACTIVE' || w.isActive === false).length})
          </button>
        </div>

        {settings?.branches && settings.branches.length > 1 && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 py-2.5 px-3 rounded-xl shadow-xs outline-none hover:border-slate-300 transition-colors"
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredWorkers.map(worker => {
            const hasFace = Boolean(worker.faceDescriptor);
            const daily = worker.dailyWage ?? (worker.wageConfig?.type === 'DAILY' ? worker.wageConfig?.amount : undefined);
            const monthly = worker.monthlySalary ?? (worker.wageConfig?.type === 'MONTHLY' ? worker.wageConfig?.amount : undefined);
            const rateStr = daily 
              ? `₹${daily.toLocaleString()} / day` 
              : monthly 
              ? `₹${monthly.toLocaleString()} / mo` 
              : 'Rate unassigned';

            const isInactive = worker.status === 'INACTIVE' || worker.isActive === false;
            const workerTokens = magicLinkService.getTokensForWorker(worker.id);
            const activeTokensCount = workerTokens.active.length;
            const wageAudit = !isInactive
              ? validateWorkerWageStructure(worker, { orgSettings: settings || undefined })
              : null;

            return (
              <div 
                key={worker.id} 
                className={`bg-white p-5 rounded-2xl border transition-all flex flex-col justify-between group ${
                  isInactive 
                    ? 'border-rose-200/80 bg-rose-50/10 opacity-90' 
                    : 'border-slate-200/80 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  {/* WORKER HEADER ROW */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden relative shrink-0 flex items-center justify-center">
                        {worker.photoUrl ? (
                          <img 
                            src={worker.photoUrl} 
                            alt={worker.name} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover" 
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-base font-bold text-slate-600 font-mono">
                            {worker.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                            {worker.name}
                          </h3>
                          {isInactive ? (
                            <span className="shrink-0 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                              Exited
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {worker.designation || 'Factory Operator'}
                        </div>
                      </div>
                    </div>

                    {/* ACTIONS: Edit, Exit/Reactivate & Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={() => onEditWorker(worker)}
                        title="Edit profile & wage"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 size={15} />
                      </button>

                      {/* WORKER-EXIT / REACTIVATE BUTTON */}
                      {isInactive ? (
                        <button
                          onClick={() => handleReactivateWorker(worker)}
                          title="Reactivate worker profile"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <RotateCcw size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setExitDateInput(worker.dateOfExit || new Date().toISOString().split('T')[0]);
                            setExitReasonInput(worker.exitReason || 'RESIGNATION');
                            setExitDeathOverride(Boolean(worker.deathInService || worker.exitReason === 'DEATH_IN_SERVICE'));
                            setExitNomineeName(worker.nomineeName || '');
                            setWorkerToExit(worker);
                          }}
                          title="Exit Worker & Calculate FnF Gratuity (Auto-revokes links & unbinds devices)"
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <UserX size={15} />
                        </button>
                      )}
                      
                      {profile?.role === 'FACTORY_OWNER' && (
                        <button 
                          onClick={() => setWorkerToDelete(worker)}
                          title="Remove worker"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* WORKER METADATA STRIP */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Pay Rate</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {rateStr}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Phone</span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {worker.phone || 'No phone recorded'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-400">Biometric Verification</span>
                      <span className={`font-medium flex items-center gap-1 ${hasFace ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {hasFace ? (
                          <>
                            <UserCheck size={12} className="text-emerald-600" />
                            <span>Face Enrolled</span>
                          </>
                        ) : (
                          <>
                            <Camera size={12} className="text-slate-400" />
                            <span>QR Code Only</span>
                          </>
                        )}
                      </span>
                    </div>

                    {wageAudit && wageAudit.hasAnyViolation && (
                      <div className="pt-1.5 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          {wageAudit.isFiftyPercentNonCompliant && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-mono font-bold text-[10px]">
                              NON_COMPLIANT · Gap ₹{wageAudit.gapAmount.toLocaleString('en-IN')}
                            </span>
                          )}
                          {wageAudit.isMinimumWageViolation && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-mono font-bold text-[10px]">
                              MIN_WAGE
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setWageStructureWorker(worker)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          Fix Structure
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTTOM ACTIONS: EWA Accrued Wages + Kharchi / Advance */}
                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setEwaModalWorker(worker)}
                    className="py-2 px-2.5 rounded-xl text-xs font-bold transition-all active:scale-98 flex items-center justify-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs cursor-pointer"
                    title="Real-time Accrued Wage Balance & EWA Withdrawal"
                  >
                    <IndianRupee size={13} className="text-emerald-700" />
                    <span>EWA Access</span>
                  </button>

                  <button 
                    onClick={() => handleOpenAdvance(worker)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold transition-all active:scale-98 flex items-center justify-center gap-1 ${
                      limits?.allowancesAndDeductionsEnabled 
                        ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer' 
                        : 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    <span>Kharchi</span>
                  </button>
                </div>

                {/* ONE-TAP MAGIC LINK ACTIONS (PAYSLIP, SCHEDULE, ATTENDANCE SUMMARY) */}
                <div className="mt-3 pt-2.5 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Sparkles size={11} className="text-amber-500" />
                      <span>One-Tap Magic Links</span>
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold lowercase">WhatsApp • SMS</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      disabled={isInactive}
                      onClick={() => setMagicLinkWorker({ worker, scope: 'PAYSLIP' })}
                      className="py-1.5 px-2 rounded-xl text-[11px] font-semibold bg-blue-50/80 hover:bg-blue-100 disabled:opacity-40 text-blue-700 border border-blue-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                      title={isInactive ? 'Worker is inactive' : 'Send Payslip to Worker via WhatsApp or SMS'}
                    >
                      <IndianRupee size={11} className="text-blue-600" />
                      <span>Payslip</span>
                    </button>
                    <button
                      type="button"
                      disabled={isInactive}
                      onClick={() => setMagicLinkWorker({ worker, scope: 'SCHEDULE' })}
                      className="py-1.5 px-2 rounded-xl text-[11px] font-semibold bg-indigo-50/80 hover:bg-indigo-100 disabled:opacity-40 text-indigo-700 border border-indigo-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                      title={isInactive ? 'Worker is inactive' : 'Send Duty Schedule to Worker via WhatsApp or SMS'}
                    >
                      <Calendar size={11} className="text-indigo-600" />
                      <span>Schedule</span>
                    </button>
                    <button
                      type="button"
                      disabled={isInactive}
                      onClick={() => setMagicLinkWorker({ worker, scope: 'ATTENDANCE_SUMMARY' })}
                      className="py-1.5 px-2 rounded-xl text-[11px] font-semibold bg-emerald-50/80 hover:bg-emerald-100 disabled:opacity-40 text-emerald-700 border border-emerald-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                      title={isInactive ? 'Worker is inactive' : 'Send Attendance Summary to Worker via WhatsApp or SMS'}
                    >
                      <Clock size={11} className="text-emerald-600" />
                      <span>Attendance</span>
                    </button>
                    <button
                      type="button"
                      disabled={isInactive}
                      onClick={() => setMagicLinkWorker({ worker, scope: 'PUNCH' })}
                      className="py-1.5 px-2 rounded-xl text-[11px] font-semibold bg-purple-50/80 hover:bg-purple-100 disabled:opacity-40 text-purple-700 border border-purple-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                      title={isInactive ? 'Worker is inactive' : 'Send One-Tap Mobile Punch Link to Worker via WhatsApp or SMS'}
                    >
                      <Smartphone size={11} className="text-purple-600" />
                      <span>Punch</span>
                    </button>
                  </div>

                  {/* WORKER ACCESS, BOUND DEVICES & DPDP AUDIT BUTTON */}
                  <button
                    type="button"
                    onClick={() => setWorkerAccessTarget(worker)}
                    className="w-full mt-2 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 flex items-center justify-between text-slate-700 transition-all cursor-pointer shadow-2xs"
                    title="Inspect active magic tokens, bound devices, revocation audit log & DPDP subject-access report"
                  >
                    <span className="flex items-center gap-1.5 text-slate-800 font-bold">
                      <Key size={13} className="text-indigo-600" />
                      <span>Worker Access &amp; Audit</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-md">
                      {activeTokensCount} active
                    </span>
                  </button>
                </div>

              </div>
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

      {/* BULK CSV WORKER IMPORT */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        tenantId={profile?.tenantId || 'demo-tenant-id'}
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

      {/* WORKER-EXIT AUTO-REVOCATION & FNF GRATUITY CONFIRMATION MODAL */}
      {workerToExit && (() => {
        const previewGratuity = calculateWorkerGratuity(workerToExit, {
          asOfDate: exitDateInput,
          exitDateOverride: exitDateInput,
          exitReasonOverride: exitReasonInput,
          deathInServiceOverride: exitDeathOverride || exitReasonInput === 'DEATH_IN_SERVICE',
          nomineeNameOverride: exitNomineeName || workerToExit.nomineeName,
          orgSettings: settings || undefined,
        });
        return (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100 max-h-[90dvh] overflow-y-auto">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200">
                <UserX size={24} />
              </div>

              <h2 className="text-base font-bold text-center text-slate-900 mb-1">
                Confirm Worker Exit &amp; FnF Gratuity
              </h2>
              <p className="text-xs text-slate-600 text-center mb-4">
                Marking <strong>{workerToExit.name}</strong> as exited triggers Full &amp; Final gratuity calculation and revokes all access.
              </p>

              <div className="space-y-3 mb-4 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Exit Date</label>
                    <input
                      type="date"
                      value={exitDateInput}
                      onChange={(e) => setExitDateInput(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Exit Reason</label>
                    <select
                      value={exitReasonInput}
                      onChange={(e) => {
                        const r = e.target.value as GratuityExitReason;
                        setExitReasonInput(r);
                        if (r === 'DEATH_IN_SERVICE') setExitDeathOverride(true);
                      }}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-semibold text-xs text-slate-900"
                    >
                      <option value="RESIGNATION">Resignation</option>
                      <option value="RETIREMENT">Retirement</option>
                      <option value="END_OF_CONTRACT">End of Contract</option>
                      <option value="TERMINATION">Termination</option>
                      <option value="DEATH_IN_SERVICE">Death in Service</option>
                      <option value="PERMANENT_DISABLEMENT">Permanent Disablement</option>
                    </select>
                  </div>
                </div>

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

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950">FnF Gratuity Payout</span>
                    <span className="font-mono font-extrabold text-sm text-emerald-800 tabular-nums">
                      ₹{previewGratuity.payableGratuityAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-800 font-mono">
                    {previewGratuity.tenure.formattedTenure} ({previewGratuity.effectiveYearsForFormula} yrs) · Last Basic+DA ₹{previewGratuity.lastDrawnBasicPlusDa.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-emerald-900">{previewGratuity.eligibilityNote}</div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 space-y-1 mb-4 text-[11px] text-amber-900">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                  <span>60-Second Security Invariants:</span>
                </div>
                <p className="text-amber-800">
                  All active magic links will be auto-revoked and bound devices unbound immediately upon confirmation.
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
                    {isProcessingExit ? 'Processing...' : 'Confirm Exit & FnF'}
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
                    Open Full FnF &amp; Leave Encashment Sheet →
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