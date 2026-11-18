import { conflictService } from '../services/conflictService';
import { PunchConflict } from '../types/index';
import { ConflictResolutionModal } from '../components/ConflictResolutionModal';
import { ShieldAlert, GitMerge, AlertCircle, Sparkles, Calculator, Shield, FileCheck, Building2, Archive } from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import { IndianRupee, FileText, Download, CheckCircle, Clock, AlertTriangle, ChevronRight, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { statutoryEngine, StatutoryEngine } from '../services/statutoryEngine';
import { MonthlyPayroll, Worker, AttendanceRecord, Advance, OrgSettings, WageComplianceAudit } from '../types/index';
import { Payslip } from '../components/Payslip';
import { StatutoryTraceModal } from '../components/StatutoryTraceModal';
import { TaxDeclarationModal } from '../components/TaxDeclarationModal';
import { Form16Modal } from '../components/Form16Modal';
import { StatutoryExportModal } from '../components/StatutoryExportModal';
import { EcrValidatorModal } from '../components/EcrValidatorModal';
import { WageStructureEditorModal } from '../components/WageStructureEditorModal';
import { MinimumWageSchedulePanel } from '../components/MinimumWageSchedulePanel';
import { runServerPrePayrollValidation } from '../services/wageStructureValidationService';
import { getBonusOffCycleRuns, evaluateEightMonthWindow } from '../services/annualBonusService';
import { BonusOffCycleRun, MinimumWageRevisionRule, PayrollServerValidationResult, ScreenName, WageStructureAuditResult } from '../types/index';
import { Scale, Edit3, Lock, Loader2, X, Cloud, Cpu, Calendar, History, Landmark, Award, PauseCircle, PlayCircle, CheckCircle2, UserX } from 'lucide-react';
import { getFnfSettlements } from '../services/gratuityService';
import {
  approveFnfSettlement,
  buildOffCycleFnfPayslip,
  evaluateFnfDeadline,
  getOffCycleFnfPayrolls,
  placeLegalHold,
  processOffCycleFnfPayout,
  releaseLegalHold,
  syncFnfBreachAlerts,
} from '../services/fnfService';
import { FnfLegalHoldCategory, FnfSettlementRecord } from '../types/index';
import { FnfDeadlineBadge } from '../components/FnfDeadlineBadge';
import { FnfLegalHoldModal } from '../components/FnfLegalHoldModal';

interface PayrollScreenProps {
  onNavigate?: (screen: ScreenName) => void;
}

export const PayrollScreen: React.FC<PayrollScreenProps> = ({ onNavigate }) => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  
  const [savedPayrolls, setSavedPayrolls] = useState<MonthlyPayroll[]>([]); 
  const [siteAddress, setSiteAddress] = useState<string>(''); 
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [currentMonthStr, setCurrentMonthStr] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [unresolvedConflicts, setUnresolvedConflicts] = useState<PunchConflict[]>([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false); 

  // Statutory Compliance Modals State
  const [tracePayroll, setTracePayroll] = useState<MonthlyPayroll | null>(null);
  const [taxDeclarationWorker, setTaxDeclarationWorker] = useState<Worker | null>(null);
  const [form16Worker, setForm16Worker] = useState<Worker | null>(null);
  const [isExportPackOpen, setIsExportPackOpen] = useState(false);
  const [isEcrValidatorOpen, setIsEcrValidatorOpen] = useState(false);

  // 50% Rule & Minimum Wage Server Pre-Finalization Validation State
  const [serverValidation, setServerValidation] = useState<PayrollServerValidationResult | null>(null);
  const [validatingServer, setValidatingServer] = useState(false);
  const [finalizingPayroll, setFinalizingPayroll] = useState(false);
  const [isFinalizationModalOpen, setIsFinalizationModalOpen] = useState(false);
  const [editingWageWorker, setEditingWageWorker] = useState<Worker | null>(null);
  const [savedAudits, setSavedAudits] = useState<WageComplianceAudit[]>([]);
  const [isAuditHistoryOpen, setIsAuditHistoryOpen] = useState(false);
  const [savingAudits, setSavingAudits] = useState(false);
  const [bonusRuns, setBonusRuns] = useState<BonusOffCycleRun[]>([]);
  const [isMinWageModalOpen, setIsMinWageModalOpen] = useState(false);
  const [savingMinWageRevisions, setSavingMinWageRevisions] = useState(false);
  const [fnfSettlements, setFnfSettlements] = useState<FnfSettlementRecord[]>([]);
  const [offCycleFnfPayrolls, setOffCycleFnfPayrolls] = useState<MonthlyPayroll[]>([]);
  const [legalHoldTarget, setLegalHoldTarget] = useState<FnfSettlementRecord | null>(null);
  const [processingFnfId, setProcessingFnfId] = useState<string | null>(null);

  const isRetrospectivePeriod = currentMonthStr < StatutoryEngine.LABOUR_CODE_EFFECTIVE_MONTH;

  const loadData = async () => {
    const tenantId = profile?.tenantId;
    if (!tenantId) return;
    
    try {
      setFetchError(null);
      const fetchedWorkers = await dbService.getWorkers(tenantId);
      const fetchedAttendance = await dbService.getAttendanceHistory(tenantId);
      const fetchedAdvances = await dbService.getAdvances(tenantId);
      const fetchedSettings = await dbService.getOrgSettings(tenantId);
      
      let fetchedPayrolls: MonthlyPayroll[] = [];
      try {
         fetchedPayrolls = await dbService.getPayrollsByMonth(tenantId, currentMonthStr);
      } catch (payrollErr) {
         console.warn("Could not load saved payrolls.", payrollErr);
      }

      let fetchedAudits: WageComplianceAudit[] = [];
      try {
        fetchedAudits = await dbService.getWageComplianceAudits(tenantId, currentMonthStr);
      } catch (auditErr) {
        console.warn("Could not load wage compliance audits.", auditErr);
      }

      setWorkers(fetchedWorkers);
      setAdvances(fetchedAdvances);
      setSettings(fetchedSettings);
      setSiteAddress(fetchedSettings?.baseLocation?.address || '');
      setSavedPayrolls(fetchedPayrolls);
      setSavedAudits(fetchedAudits);
      setAttendanceHistory(fetchedAttendance);
      const conflicts = await conflictService.getUnresolvedPayrollConflicts(tenantId, currentMonthStr);
      setUnresolvedConflicts(conflicts);

      const validation = await runServerPrePayrollValidation(
        tenantId,
        currentMonthStr,
        fetchedWorkers,
        fetchedSettings
      );
      setServerValidation(validation);

      try {
        const fetchedBonusRuns = await getBonusOffCycleRuns(tenantId);
        setBonusRuns(fetchedBonusRuns);
      } catch {
        // ignore bonus run fetch failure
      }

      try {
        const syncedFnf = await syncFnfBreachAlerts(
          tenantId,
          profile?.email || 'admin@workforcepro.in',
          fetchedSettings
        );
        const allFnf = syncedFnf.length > 0 ? syncedFnf : await getFnfSettlements(tenantId);
        setFnfSettlements(allFnf);
        const fetchedOffCycleFnf = await getOffCycleFnfPayrolls(tenantId);
        setOffCycleFnfPayrolls(fetchedOffCycleFnf);
      } catch {
        // ignore fnf fetch failure
      }
    } catch (err: any) {
      console.error("Failed to load payroll data", err);
      setFetchError(err.message || "Failed to load database records");
      toast.error("Could not load monthly payroll data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile, currentMonthStr]);

  const handleDownloadECR = () => {
    if (payrolls.length === 0) {
      toast.warning('No payroll records found for this period.');
      return;
    }
    setIsEcrValidatorOpen(true);
  };

  // Re-check blocking conflicts when resolution events fire
  useEffect(() => {
    const handleConflictsChanged = () => {
      if (profile?.tenantId) {
        conflictService.getUnresolvedPayrollConflicts(profile.tenantId, currentMonthStr).then(setUnresolvedConflicts);
      }
    };
    window.addEventListener('punchConflictsChanged', handleConflictsChanged);
    return () => window.removeEventListener('punchConflictsChanged', handleConflictsChanged);
  }, [profile?.tenantId, currentMonthStr]);

  const payrolls = useMemo(() => {
    if (!profile?.tenantId || workers.length === 0) return [];
    
    return workers.map(worker => {
      const alreadySaved = savedPayrolls.find(p => p.workerId === worker.id);
      // Only preserve historical snapshots if officially marked PAID or LOCKED with valid wages
      if (alreadySaved && (alreadySaved.status === 'PAID' || alreadySaved.status === 'LOCKED') && alreadySaved.earnings?.gross > 0) {
        return alreadySaved;
      }

      return wageService.calculateMonthlyPayroll(
        worker,
        currentMonthStr,
        attendanceHistory,
        advances,
        settings || { shifts: [], enableBreakTracking: false }
      );
    });
  }, [workers, currentMonthStr, attendanceHistory, advances, settings, savedPayrolls, profile]);

  const handleMarkAsPaid = async (payroll: MonthlyPayroll, e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (!profile?.tenantId) return;

    const workerAudit =
      serverValidation?.allResults.find((r) => r.workerId === payroll.workerId) ||
      payroll.wageStructureAudit;
    if (workerAudit?.isMinimumWageViolation) {
      toast.error(
        `MINIMUM_WAGE_VIOLATION: Payout blocked for ${payroll.workerName}. Shortfall ₹${workerAudit.minimumWageGap.toLocaleString('en-IN')}/mo below ${workerAudit.state} (${workerAudit.wageZone}) floor (Notif. ${workerAudit.minimumWageNotificationDate}).`
      );
      const workerObj = workers.find((w) => w.id === payroll.workerId) || null;
      if (workerObj) setEditingWageWorker(workerObj);
      return;
    }

    const updated = { ...payroll, status: 'PAID' as const, paymentDate: new Date().toISOString() };
    
    setSavedPayrolls(prev => {
      const index = prev.findIndex(p => p.workerId === payroll.workerId);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = updated;
        return copy;
      }
      return [...prev, updated];
    });

    try {
      await dbService.saveMonthlyPayroll(updated);
      const refreshedAudits = await dbService.getWageComplianceAudits(profile.tenantId, currentMonthStr);
      setSavedAudits(refreshedAudits);
      toast.success(`Marked ₹${payroll.netPayable.toLocaleString()} as paid for ${payroll.workerName}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save payout status. Check Firestore permissions.");
    }
  };

  const refreshFnfData = async (tenantId: string) => {
    const syncedFnf = await syncFnfBreachAlerts(
      tenantId,
      profile?.email || 'admin@workforcepro.in',
      settings
    );
    const allFnf = syncedFnf.length > 0 ? syncedFnf : await getFnfSettlements(tenantId);
    setFnfSettlements(allFnf);
    const fetchedOffCycle = await getOffCycleFnfPayrolls(tenantId);
    setOffCycleFnfPayrolls(fetchedOffCycle);
  };

  const handleApproveFnf = async (record: FnfSettlementRecord) => {
    if (!profile?.tenantId) return;
    setProcessingFnfId(record.id);
    try {
      await approveFnfSettlement(profile.tenantId, record.id, profile.email || 'admin@workforcepro.in');
      await refreshFnfData(profile.tenantId);
      toast.success(`Approved Draft FnF for ${record.workerName}. Ready for off-cycle payout.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve FnF');
    } finally {
      setProcessingFnfId(null);
    }
  };

  const handlePlaceFnfHold = async (category: FnfLegalHoldCategory, reason: string) => {
    if (!profile?.tenantId || !legalHoldTarget) return;
    await placeLegalHold(
      profile.tenantId,
      legalHoldTarget.id,
      category,
      reason,
      profile.email || 'admin@workforcepro.in',
      settings
    );
    await refreshFnfData(profile.tenantId);
    toast.warning(`LEGAL_HOLD placed on ${legalHoldTarget.workerName}. 2-day timer & interest accrual paused.`);
  };

  const handleReleaseFnfHold = async (record: FnfSettlementRecord) => {
    if (!profile?.tenantId) return;
    setProcessingFnfId(record.id);
    try {
      await releaseLegalHold(profile.tenantId, record.id, profile.email || 'admin@workforcepro.in');
      await refreshFnfData(profile.tenantId);
      toast.success(`Legal hold released for ${record.workerName}. Timer resumed with paused duration credited.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to release legal hold');
    } finally {
      setProcessingFnfId(null);
    }
  };

  const handleProcessOffCycleFnf = async (
    record: FnfSettlementRecord,
    scheduleTarget: 'WAGE_FNF' | 'GRATUITY' | 'BOTH'
  ) => {
    if (!profile?.tenantId) return;
    setProcessingFnfId(record.id);
    try {
      const result = await processOffCycleFnfPayout({
        tenantId: profile.tenantId,
        fnfId: record.id,
        scheduleTarget,
        actorEmail: profile.email || 'admin@workforcepro.in',
        workers,
        attendanceRecords: attendanceHistory,
        advances,
        orgSettings: settings,
      });
      await loadData();
      setSelectedPayroll(result.offCyclePayroll);
      toast.success(`Processed off-cycle FnF payout & generated separate FnF Payslip for ${record.workerName}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process off-cycle FnF payout');
    } finally {
      setProcessingFnfId(null);
    }
  };

  const handlePreviewFnfPayslip = (
    record: FnfSettlementRecord,
    scheduleTarget: 'WAGE_FNF' | 'GRATUITY' | 'BOTH'
  ) => {
    const existingPaid = offCycleFnfPayrolls.find(
      (p) => p.id === `offcycle_${record.id}_${scheduleTarget}`
    );
    if (existingPaid) {
      setSelectedPayroll(existingPaid);
      return;
    }
    const workerObj = workers.find((w) => w.id === record.workerId) || null;
    const baseMonthPayroll = payrolls.find((p) => p.workerId === record.workerId);
    const preview = buildOffCycleFnfPayslip({
      record,
      scheduleTarget,
      worker: workerObj,
      monthlyPayrollForExitMonth: baseMonthPayroll,
      orgSettings: settings,
      isPaid: false,
    });
    setSelectedPayroll(preview);
  };

  const handleSaveMinWageRevisions = async (revisions: MinimumWageRevisionRule[]) => {
    if (!profile?.tenantId || !settings) return;
    setSavingMinWageRevisions(true);
    try {
      const nextSettings: OrgSettings = {
        ...settings,
        compliance: {
          ...(settings.compliance || {}),
          minimumWageRevisions: revisions,
        },
      };
      await dbService.saveOrgSettings(profile.tenantId, nextSettings);
      setSettings(nextSettings);
      const validation = await runServerPrePayrollValidation(
        profile.tenantId,
        currentMonthStr,
        workers,
        nextSettings
      );
      setServerValidation(validation);
      toast.success('Updated state minimum wage revision rules and re-validated payroll.');
    } catch (err: any) {
      toast.error(`Failed to update minimum wage revisions: ${err.message}`);
    } finally {
      setSavingMinWageRevisions(false);
    }
  };

  const handlePersistAllMonthAudits = async () => {
    if (!profile?.tenantId || payrolls.length === 0) return;
    setSavingAudits(true);
    try {
      for (const p of payrolls) {
        if (p.wageComplianceAudit) {
          await dbService.saveWageComplianceAudit({
            ...p.wageComplianceAudit,
            tenantId: profile.tenantId,
          });
        }
      }
      const refreshedAudits = await dbService.getWageComplianceAudits(profile.tenantId, currentMonthStr);
      setSavedAudits(refreshedAudits);
      toast.success(`Saved ${refreshedAudits.length} WageComplianceAudit record(s) for ${currentMonthStr}.`);
    } catch (err: any) {
      toast.error(`Failed to persist compliance audits: ${err.message}`);
    } finally {
      setSavingAudits(false);
    }
  };

  const handleRunServerPreFinalizationCheck = async () => {
    if (!profile?.tenantId) return;
    setValidatingServer(true);
    try {
      const validation = await runServerPrePayrollValidation(
        profile.tenantId,
        currentMonthStr,
        workers,
        settings || undefined
      );
      setServerValidation(validation);
      setIsFinalizationModalOpen(true);
    } catch (err: any) {
      toast.error(`Server validation failed: ${err.message}`);
    } finally {
      setValidatingServer(false);
    }
  };

  const handleFinalizePayrollRun = async () => {
    if (!profile?.tenantId) return;
    if (unresolvedConflicts.length > 0) {
      toast.error("Resolve all attendance conflicts before finalizing payroll.");
      return;
    }
    setFinalizingPayroll(true);
    try {
      // Re-run authoritative server validation right before finalizing
      const validation = await runServerPrePayrollValidation(
        profile.tenantId,
        currentMonthStr,
        workers,
        settings || undefined
      );
      setServerValidation(validation);

      if (validation.minimumWageViolationCount > 0 || validation.isPayrollBlocked) {
        toast.error(
          `MINIMUM_WAGE_VIOLATION: Payroll blocked for ${validation.minimumWageViolationCount} employee(s) below applicable state minimum wage. Increase Basic Pay and resubmit.`
        );
        setIsFinalizationModalOpen(true);
        return;
      }

      const auditByWorker = new Map<string, WageStructureAuditResult>(
        validation.allResults.map((r) => [r.workerId || '', r])
      );

      const updatedList: MonthlyPayroll[] = [];
      for (const p of payrolls) {
        const nextStatus = p.status === 'PAID' ? 'PAID' : ('LOCKED' as const);
        const enriched: MonthlyPayroll = {
          ...p,
          status: nextStatus,
          wageStructureAudit: auditByWorker.get(p.workerId) || p.wageStructureAudit,
        };
        await dbService.saveMonthlyPayroll(enriched);
        updatedList.push(enriched);
      }
      setSavedPayrolls(updatedList);
      const refreshedAudits = await dbService.getWageComplianceAudits(profile.tenantId, currentMonthStr);
      setSavedAudits(refreshedAudits);
      setIsFinalizationModalOpen(false);

      if (isRetrospectivePeriod) {
        toast.info(
          `Retrospective payroll finalized for ${currentMonthStr} using legacy rules (pre-21 Nov 2025).`
        );
      } else if (validation.hasFlaggedWorkers) {
        toast.warning(
          `Payroll finalized with ${validation.nonCompliantCount} NON_COMPLIANT add-back recalculation(s) and ${validation.minimumWageViolationCount} minimum wage flag(s).`
        );
      } else {
        toast.success(`Payroll finalized for ${currentMonthStr} — all workers compliant!`);
      }
    } catch (err: any) {
      toast.error(`Failed to finalize payroll: ${err.message}`);
    } finally {
      setFinalizingPayroll(false);
    }
  };

  const pendingPayout = payrolls.filter(p => p.status !== 'PAID').reduce((acc, p) => acc + p.netPayable, 0);
  const paidPayout = payrolls.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.netPayable, 0);
  const totalGross = payrolls.reduce((acc, p) => acc + p.earnings.gross, 0);
  const totalEmployerStatutory = payrolls.reduce((acc, p) => acc + (p.statutory?.totalEmployerStatutory || 0), 0);
  const totalCTC = payrolls.reduce((acc, p) => acc + (p.employerCostToCompany || (p.earnings.gross + (p.statutory?.totalEmployerStatutory || 0))), 0);
  const totalStaffCount = workers.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Monthly Payroll & Statutory Compliance</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
            <span>Automated PF (12%), ESI (0.75%), State PT (all 28 states) & TDS</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600 font-semibold">
              {new Date(currentMonthStr + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 h-10 shadow-xs">
            <Calendar size={14} className="text-slate-500" />
            <input
              type="month"
              value={currentMonthStr}
              onChange={(e) => {
                if (e.target.value) setCurrentMonthStr(e.target.value);
              }}
              aria-label="Payroll Month"
              className="text-xs font-mono font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
              title="Switch payroll month (pre-Nov 2025 triggers retrospective legacy rules)"
            />
          </div>

          <button
            onClick={() => setIsMinWageModalOpen(true)}
            className="h-10 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="View state-wise minimum wage database by zone & skill level, and manage mid-month revisions"
          >
            <Scale size={14} className="text-slate-700" />
            <span>State Min Wages</span>
          </button>

          <button
            onClick={() => setIsAuditHistoryOpen(true)}
            className="h-10 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Inspect saved WageComplianceAudit records & Gratuity Liability projections"
          >
            <History size={14} className="text-indigo-600" />
            <span>Compliance Audits ({savedAudits.length})</span>
          </button>

          <button
            onClick={handleRunServerPreFinalizationCheck}
            disabled={validatingServer || payrolls.length === 0}
            className="h-10 px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Run server-side 50% Rule & Minimum Wage validation before finalizing payroll"
          >
            {validatingServer ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} className="text-emerald-400" />}
            <span>Audit &amp; Finalize Payroll</span>
          </button>

          <button
            onClick={() => setIsExportPackOpen(true)}
            className="h-10 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export complete filing pack (.ZIP): EPFO ECR, Form 24Q quarterly return, Form 16 Part A/B certificates"
          >
            <Archive size={15} />
            <span>Export Filing Pack (.ZIP)</span>
          </button>

          <button
            onClick={handleDownloadECR}
            className="h-10 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download official EPFO ECR 2.0 file (#~# delimited format) for unified portal upload"
          >
            <Download size={15} className="text-blue-600" />
            <span>EPFO ECR (.txt)</span>
          </button>
          
          <div className="text-xs text-slate-500 font-mono tabular-nums bg-white border border-slate-200/80 px-3 py-2 rounded-xl shadow-xs">
            Staff Ledger: <strong className="text-slate-900">{totalStaffCount} Operators</strong>
          </div>
        </div>
      </div>

      {/* RETROSPECTIVE PAYROLL WARNING BANNER (PRE-21 NOV 2025) */}
      {isRetrospectivePeriod && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 shadow-xs animate-in fade-in flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-amber-950">
                Retrospective Payroll Period ({currentMonthStr} — Pre-21 Nov 2025)
              </h3>
              <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-950 font-mono font-bold text-[10px]">
                LEGACY EPF/ESIC RULES ACTIVE
              </span>
            </div>
            <p className="text-xs text-amber-900 mt-1 leading-relaxed">
              This period precedes the effective date of the New Labour Codes (<strong>21 November 2025</strong>). Statutory PF and ESI default to legacy rules without automatic 50% Rule excess allowance add-back.{' '}
              <strong>Warning:</strong> New Labour Code excess allowance add-back recalculations automatically apply to all current and future payroll periods (Nov 2025 onwards).
            </p>
          </div>
        </div>
      )}

      {fetchError && (
        <div className="bg-rose-50/70 border border-rose-200 p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h3 className="text-rose-900 font-bold text-xs">Payroll Synchronization Warning</h3>
            <p className="text-rose-700 text-xs mt-0.5">{fetchError}</p>
          </div>
        </div>
      )}

      {/* BLOCKING VALIDATION BANNER FOR PAYROLL FINALISATION CONFLICTS */}
      {unresolvedConflicts.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-5 sm:p-6 shadow-sm animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <ShieldAlert size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-rose-950">
                    Payroll Finalisation Blocked
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-900 font-mono font-black text-xs border border-rose-300 animate-pulse">
                    {unresolvedConflicts.length} Attendance Conflict(s)
                  </span>
                </div>
                <p className="text-xs text-rose-900 mt-1 leading-relaxed max-w-xl">
                  Disbursement is locked for <strong>{new Date(currentMonthStr + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>. Labor regulations prohibit finalising payroll while conflicting offline and server attendance punches remain unreconciled.
                </p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono font-bold text-rose-800 uppercase">Affected Personnel:</span>
                  {unresolvedConflicts.map(c => (
                    <span key={c.id} className="px-2.5 py-1 rounded-xl bg-white border-2 border-rose-200 text-rose-900 text-xs font-bold shadow-xs">
                      {c.workerName}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsConflictModalOpen(true)}
              className="min-h-[56px] px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm border-2 border-rose-400 shadow-md active:scale-95 flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer"
            >
              <GitMerge size={20} />
              <span>Review & Resolve ({unresolvedConflicts.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* HARD BLOCKING BANNER FOR STATE MINIMUM WAGE VIOLATIONS */}
      {serverValidation && serverValidation.minimumWageViolationCount > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-5 shadow-xs space-y-3 animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-700 text-white flex items-center justify-center shrink-0">
                <Scale size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-black text-rose-950 font-mono">
                    Payroll Blocked: MINIMUM_WAGE_VIOLATION
                  </h3>
                  <span className="text-xs font-mono tabular-nums font-bold text-rose-800">
                    {serverValidation.minimumWageViolationCount} Employee(s) Below State Floor
                  </span>
                </div>
                <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                  Payroll finalization and payouts are blocked under the Code on Wages. Increase Basic Pay (or Daily Rate × 26) to match the applicable state, zone, and skill minimum wage floor and resubmit.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsMinWageModalOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-900 font-bold text-xs cursor-pointer"
              >
                Inspect State Floors
              </button>
              <button
                type="button"
                onClick={handleRunServerPreFinalizationCheck}
                className="px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Review Blocked Workers
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-rose-200/80">
            {(
              serverValidation.blockingMinimumWageWorkers ||
              serverValidation.allResults.filter((r) => r.isMinimumWageViolation)
            ).map((mw) => {
              const targetWorker = workers.find((w) => w.id === mw.workerId);
              return (
                <div
                  key={mw.workerId || mw.workerName}
                  className="bg-white border border-rose-200 rounded-2xl p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900">{mw.workerName}</span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-600">
                        {mw.state} · {mw.wageZone} · {mw.skillCategory.replace('_', '-')}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-700">
                      Basic ₹{mw.basicPay.toLocaleString('en-IN')}/mo vs Floor ₹{mw.statutoryMinimumWageMonthly.toLocaleString('en-IN')}/mo ·{' '}
                      <strong className="text-rose-700">
                        Gap ₹{mw.minimumWageGap.toLocaleString('en-IN')}/mo
                      </strong>
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-500">
                      {mw.scheduledEmployment} · Notif. Date: {mw.minimumWageNotificationDate}
                      {mw.workLocationSource === 'BRANCH_LOCATION' && ' · Branch Location'}
                      {mw.isOnProbation && ' · Probation Active (No Exemption)'}
                    </div>
                    {mw.midMonthRevisionInfo?.isRevisedInMonth && (
                      <div className="text-[10px] font-mono tabular-nums text-amber-800">
                        Mid-Month Pro-Rata ({mw.midMonthRevisionInfo.daysAtPreviousRate}d @ ₹{mw.midMonthRevisionInfo.previousMonthlyFloor.toLocaleString('en-IN')} + {mw.midMonthRevisionInfo.daysAtRevisedRate}d @ ₹{mw.midMonthRevisionInfo.revisedMonthlyFloor.toLocaleString('en-IN')})
                      </div>
                    )}
                  </div>
                  {targetWorker && (
                    <button
                      type="button"
                      onClick={() => setEditingWageWorker(targetWorker)}
                      className="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Edit3 size={11} /> Fix Basic
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 50% WAGE RULE AUDIT ALERT BANNER */}
      {serverValidation && serverValidation.nonCompliantCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-xs animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-black text-amber-950">
                    Wage Structure Compliance Alert (50% Rule Audit)
                  </h3>
                  <span className="px-2 py-0.5 rounded-lg bg-rose-600 text-white font-mono font-bold text-[10px]">
                    {serverValidation.nonCompliantCount} NON_COMPLIANT
                  </span>
                </div>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                  Your basic pay is less than 50% of CTC for <strong>{serverValidation.nonCompliantCount}</strong> worker(s). This will increase PF/Gratuity liabilities. Total monthly compliance gap:{' '}
                  <strong className="font-mono tabular-nums text-rose-700">
                    ₹{serverValidation.totalGapAmount.toLocaleString('en-IN')}
                  </strong>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {serverValidation.flaggedWorkers
                    .filter((fw) => fw.isFiftyPercentNonCompliant)
                    .map((fw) => {
                      const targetWorker = workers.find((w) => w.id === fw.workerId);
                      return (
                        <button
                          key={fw.workerId || fw.workerName}
                          type="button"
                          onClick={() => targetWorker && setEditingWageWorker(targetWorker)}
                          className="px-2.5 py-1 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-xs font-bold text-amber-950 flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <span>{fw.workerName}</span>
                          {fw.gapAmount > 0 && (
                            <span className="font-mono tabular-nums text-rose-700">
                              (Gap ₹{fw.gapAmount.toLocaleString('en-IN')})
                            </span>
                          )}
                          <Edit3 size={11} className="text-blue-600" />
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunServerPreFinalizationCheck}
              className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-xs shrink-0 cursor-pointer"
            >
              Review Before Finalizing
            </button>
          </div>
        </div>
      )}

      {!fetchError && (
        <>
          {/* STATUTORY DEPTH PAYROLL KPIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending Net Pay</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-amber-600 mt-1">
                ₹{pendingPayout.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">To disburse to operators</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Settled Net Pay</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-600 mt-1">
                ₹{paidPayout.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Paid via bank transfer</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Wages</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                ₹{totalGross.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Basic + OT + Allowances</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Employer Liabilities</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-blue-600 mt-1">
                +₹{totalEmployerStatutory.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">PF (13%) + ESI (3.25%) + LWF</p>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-xs sm:col-span-2 lg:col-span-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company CTC</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1">
                ₹{totalCTC.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Gross + Employer Stat</p>
            </div>
          </div>

          {/* OFF-CYCLE ANNUAL STATUTORY BONUS BAR */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <Landmark size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-900">
                  <span>Off-Cycle Annual Statutory Bonus (8.33%–20%)</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono tabular-nums text-amber-700">
                    {evaluateEightMonthWindow('2025-26').daysRemaining}d left in 8-month window (Due 2026-11-30)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  {bonusRuns.length > 0
                    ? `${bonusRuns.length} Off-Cycle Bonus Run(s) recorded · Latest FY ${bonusRuns[0].financialYear}: Net ₹${bonusRuns[0].totalNetOffCycleDisbursed.toLocaleString('en-IN')} (${bonusRuns[0].status})`
                    : 'No off-cycle bonus batch disbursed yet · Sec 192 TDS + Forms A, B, C, D'}
                </p>
              </div>
            </div>
            {onNavigate && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('CTC_SIMULATOR')}
                  className="h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Calculator size={14} className="text-slate-600" />
                  <span>CTC Simulator</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('GRATUITY')}
                  className="h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Award size={14} className="text-emerald-700" />
                  <span>Gratuity Projection</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('ANNUAL_BONUS')}
                  className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Open Bonus Engine</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* OFF-CYCLE FNF SETTLEMENTS & SECTION 17(2) 2-WORKING-DAY TRACKER */}
          {(fnfSettlements.length > 0 || offCycleFnfPayrolls.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                    <UserX size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm sm:text-base font-bold text-slate-900">
                        Off-Cycle Full &amp; Final (FnF) Settlements
                      </h2>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[10px] font-bold">
                        Sec 17(2) · 2 Working Days
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Separate off-cycle payout runs for Wage &amp; Leave FnF (2 working days) and Statutory Gratuity (30 calendar days). Delayed Wage FnF accrues 12% p.a. interest.
                    </p>
                  </div>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('GRATUITY')}
                    className="h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <span>Open FnF Workspace</span>
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {fnfSettlements.map((rec) => {
                  const ev = evaluateFnfDeadline(rec, Date.now(), settings);
                  const wagePaid = rec.paymentSchedules?.wageFnf?.status === 'PAID' || rec.status === 'SETTLED';
                  const gratPaid = rec.paymentSchedules?.gratuity?.status === 'PAID' || rec.gratuityPayable <= 0;
                  const isBusy = processingFnfId === rec.id;

                  return (
                    <div
                      key={rec.id}
                      className={`rounded-2xl border p-4 space-y-3 ${
                        ev.isBreached
                          ? 'bg-rose-50/40 border-rose-300'
                          : rec.status === 'LEGAL_HOLD'
                          ? 'bg-amber-50/40 border-amber-300'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{rec.workerName}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px] font-bold">
                              {rec.separationStatus || rec.exitReason}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                                rec.status === 'SETTLED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : rec.status === 'APPROVED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : rec.status === 'LEGAL_HOLD'
                                  ? 'bg-amber-200 text-amber-950'
                                  : 'bg-slate-900 text-white'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            Exit {rec.exitDate} · {rec.designation}
                          </div>
                        </div>

                        <FnfDeadlineBadge record={rec} orgSettings={settings} compact />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                        <div className="bg-white p-2 rounded-xl border border-slate-200">
                          <span className="block text-[10px] font-sans text-slate-500">Sched A (2d Wage)</span>
                          <span className="font-black text-slate-900">
                            ₹{(rec.fnfWageNetPayable ?? rec.netFnfPayable).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-200">
                          <span className="block text-[10px] font-sans text-slate-500">Sched B (30d Grat.)</span>
                          <span className="font-bold text-emerald-700">
                            ₹{(rec.gratuityPayable || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-200">
                          <span className="block text-[10px] font-sans text-slate-500">Notice Recovery</span>
                          <span className="font-bold text-rose-700">
                            -₹{(rec.noticePayRecovery || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-200">
                          <span className="block text-[10px] font-sans text-slate-500">12% p.a. Delay Int.</span>
                          <span className={`font-bold ${ev.accruedInterestPenalty > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                            ₹{ev.accruedInterestPenalty.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {rec.legalHold?.active && (
                        <div className="p-2.5 rounded-xl bg-amber-100/80 border border-amber-300 text-[11px] text-amber-950">
                          <strong>LEGAL_HOLD ({rec.legalHold.category}):</strong> {rec.legalHold.reason}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {rec.status === 'DRAFT' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveFnf(rec)}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve Draft FnF</span>
                          </button>
                        )}

                        {rec.status === 'APPROVED' && !wagePaid && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleProcessOffCycleFnf(rec, 'WAGE_FNF')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <IndianRupee size={13} />
                            <span>Process Off-Cycle Wage FnF</span>
                          </button>
                        )}

                        {rec.status === 'APPROVED' && rec.gratuityPayable > 0 && !gratPaid && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleProcessOffCycleFnf(rec, 'GRATUITY')}
                            className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Award size={13} />
                            <span>Pay Gratuity (30d Sched B)</span>
                          </button>
                        )}

                        {rec.status === 'LEGAL_HOLD' ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReleaseFnfHold(rec)}
                            className="px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <PlayCircle size={13} />
                            <span>Release Hold</span>
                          </button>
                        ) : rec.status !== 'SETTLED' && !wagePaid ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setLegalHoldTarget(rec)}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <PauseCircle size={13} />
                            <span>LEGAL_HOLD</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handlePreviewFnfPayslip(rec, wagePaid && !gratPaid ? 'WAGE_FNF' : rec.gratuityPayable > 0 && gratPaid && !wagePaid ? 'GRATUITY' : 'WAGE_FNF')}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer ml-auto"
                        >
                          <FileText size={13} className="text-slate-600" />
                          <span>Separate FnF Payslip</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {offCycleFnfPayrolls.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Disbursed Off-Cycle FnF Payslips ({offCycleFnfPayrolls.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {offCycleFnfPayrolls.map((op) => (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => setSelectedPayroll(op)}
                        className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2 cursor-pointer"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white font-mono text-[9px] font-bold">
                          OFF-CYCLE FNF PAID
                        </span>
                        <span className="font-bold">{op.workerName}</span>
                        <span className="font-mono text-emerald-800">₹{op.netPayable.toLocaleString('en-IN')}</span>
                        <FileText size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DUAL VIEWPORT PAYROLL ROSTER: 1 column mobile, 2 columns desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payrolls.map(payroll => (
              <div 
                key={payroll.id} 
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
              >
                <div 
                  onClick={() => {
                    if (!limits?.payslipEnabled) {
                      toast.info("Generating Detailed Payslips is available on Pro & Enterprise plans.");
                      return;
                    }
                    setSelectedPayroll(payroll);
                  }}
                  className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors flex-1"
                >
                  {/* WORKER AND NET PAY */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-sm text-slate-700 shrink-0">
                        {payroll.workerName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 truncate">{payroll.workerName}</h3>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono tabular-nums">{payroll.attendanceSummary.payableDays} Payable Days</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums">{payroll.attendanceSummary.totalOvertimeHours}h OT</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-slate-900">
                        ₹{payroll.netPayable.toLocaleString()}
                      </div>
                      <div className="text-[11px] mt-0.5">
                        {payroll.status === 'PAID' ? (
                          <span className="text-emerald-700 font-semibold">· Disbursed</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">· Unpaid</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ATTENDANCE & ADVANCES BREAKDOWN */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
                    <span>{payroll.attendanceSummary.presentDays} Present</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{payroll.attendanceSummary.halfDays} Half</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{payroll.attendanceSummary.absentDays} Absent</span>
                    {payroll.attendanceSummary.paidLeaves > 0 && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-blue-600">{payroll.attendanceSummary.paidLeaves} Leave</span>
                      </>
                    )}
                  </div>

                  {/* EARNINGS VS ADVANCE DEDUCTIONS */}
                  <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-600">
                      Gross: <strong className="text-slate-900 font-bold">₹{payroll.earnings.gross.toLocaleString()}</strong>
                    </span>
                    <span className="text-rose-600">
                      Kharchi: <strong className="font-bold">-₹{payroll.deductions.advances.toLocaleString()}</strong>
                    </span>
                  </div>

                  {payroll.fnfSummary?.isFnF && (
                    <div className="mt-2 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                      <div className="text-emerald-950">
                        <span className="font-bold">FnF Gratuity Settlement</span>
                        <span className="block text-[10px] text-emerald-800">
                          {payroll.fnfSummary.roundedYears} yrs · Exit {payroll.fnfSummary.exitDate}
                          {payroll.fnfSummary.deathInService ? ' · DEATH_IN_SERVICE' : ''}
                          {payroll.fnfSummary.ceilingApplied ? ' · ₹20L Cap' : ''}
                        </span>
                      </div>
                      <span className="font-bold text-emerald-800">
                        +₹{(payroll.gratuitySettlement ?? payroll.fnfSummary.gratuityPayable).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}

                  {/* STATUTORY DEDUCTION PILLS & CTC LIABILITIES */}
                  {payroll.statutory && (
                    <div className="mt-2.5 p-2.5 bg-slate-50/70 rounded-xl border border-slate-200/90 space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-1 text-[11px]">
                        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                          Statutory Deductions (EE)
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            {payroll.statutory.state} PT
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            {payroll.statutory.taxRegime} Regime
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[11px] font-mono tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                          EPF: <strong>₹{payroll.statutory.employeePf}</strong>
                        </span>
                        {payroll.statutory.isEsiApplicable ? (
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                            ESI: <strong>₹{payroll.statutory.employeeEsi}</strong>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-800 font-semibold" title={payroll.statutory.esiDroppedNote}>
                            ESI: Exempt (&gt; ₹21k)
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-md border ${
                            payroll.statutory.isPtExempt
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                          title={payroll.statutory.ptExemptionNote}
                        >
                          PT: <strong>₹{payroll.statutory.professionalTax}</strong>
                          {payroll.statutory.isPtExempt ? ' (PT_EXEMPT)' : ''}
                          {payroll.statutory.ptProratedInfo ? ' (Pro-rated)' : ''}
                          {payroll.statutory.ptFebruaryAdjustmentApplied ? ' (Feb Adj.)' : ''}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md border ${
                            payroll.statutory.isContractorExcludedFromLwf
                              ? 'bg-slate-100 border-slate-300 text-slate-600'
                              : (payroll.statutory.employeeLwf || 0) > 0
                              ? 'bg-cyan-50 border-cyan-200 text-cyan-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-500'
                          }`}
                          title={
                            payroll.statutory.lwfTransferSplit?.splitSummary ||
                            payroll.statutory.lwfSkippedReason ||
                            `${payroll.statutory.state} · ${payroll.statutory.lwfCycleLabel || 'LWF'}`
                          }
                        >
                          LWF ({payroll.statutory.state}): <strong>₹{payroll.statutory.employeeLwf || 0}</strong>
                          {payroll.statutory.isContractorExcludedFromLwf ? ' · Contractor' : ''}
                          {payroll.statutory.lwfTransferSplit ? ' · Split' : ''}
                          {payroll.statutory.lwfSkippedReason === 'WAGE_CEILING_EXCEEDED' ? ' · Ceiling Exempt' : ''}
                          {payroll.statutory.lwfSkippedReason === 'STATE_NO_LWF' ? ' · No LWF' : ''}
                        </span>
                        {payroll.statutory.tds > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-800 font-bold">
                            TDS: ₹{payroll.statutory.tds}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-400">
                            TDS: ₹0
                          </span>
                        )}
                      </div>

                      {(payroll.statutory.notionalWageAddition || 0) > 0 && (
                        <div className="mt-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-mono space-y-0.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap text-amber-950 font-bold">
                            <span>Notional Wage Addition (50% Rule):</span>
                            <span>+₹{payroll.statutory.notionalWageAddition!.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="text-[10px] text-amber-900 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span>
                              PF Base: ₹{(payroll.statutory.originalPfWageBase ?? payroll.earnings.basic).toLocaleString('en-IN')} → <strong>₹{payroll.statutory.pfWageBase.toLocaleString('en-IN')}</strong>
                            </span>
                            {payroll.statutory.isEsiApplicable && (
                              <span>
                                ESI Base: ₹{(payroll.statutory.originalEsiWageBase ?? payroll.earnings.gross).toLocaleString('en-IN')} → <strong>₹{payroll.statutory.esiWageBase.toLocaleString('en-IN')}</strong>
                              </span>
                            )}
                            {(payroll.statutory.gratuityImpact?.annualIncrease || 0) > 0 && (
                              <span className="text-rose-700 font-bold">
                                Gratuity: +₹{payroll.statutory.gratuityImpact!.monthlyIncrease}/mo (+₹{payroll.statutory.gratuityImpact!.annualIncrease}/yr)
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>Employer Stat (PF+ESI+LWF): +₹{payroll.statutory.totalEmployerStatutory.toLocaleString()}</span>
                        <span className="font-bold text-slate-900">CTC: ₹{(payroll.employerCostToCompany || (payroll.earnings.gross + payroll.statutory.totalEmployerStatutory)).toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {/* 50% RULE & MINIMUM WAGE CARD FLAG */}
                  {(() => {
                    const cardAudit =
                      serverValidation?.allResults.find((r) => r.workerId === payroll.workerId) ||
                      payroll.wageStructureAudit;
                    if (!cardAudit || !cardAudit.hasAnyViolation) return null;
                    const workerObj = workers.find((w) => w.id === payroll.workerId) || null;
                    return (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {cardAudit.isFiftyPercentNonCompliant && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-mono tabular-nums font-bold text-[10px]">
                                NON_COMPLIANT · Gap ₹{cardAudit.gapAmount.toLocaleString('en-IN')}
                              </span>
                            )}
                            {cardAudit.isMinimumWageViolation && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-800 text-white font-mono tabular-nums font-bold text-[10px]">
                                MINIMUM_WAGE_VIOLATION · Gap ₹{cardAudit.minimumWageGap.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                          {workerObj && (
                            <button
                              type="button"
                              onClick={() => setEditingWageWorker(workerObj)}
                              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 size={11} /> Fix Structure
                            </button>
                          )}
                        </div>
                        {cardAudit.warningMessage && (
                          <p className="text-[11px] text-rose-800 font-medium">
                            {cardAudit.warningMessage}
                          </p>
                        )}
                        {cardAudit.isMinimumWageViolation && (
                          <p className="text-[11px] text-rose-950 font-mono tabular-nums font-semibold">
                            {cardAudit.state} ({cardAudit.wageZone}) · Floor ₹{cardAudit.statutoryMinimumWageMonthly.toLocaleString('en-IN')}/mo · Notif. {cardAudit.minimumWageNotificationDate}
                            {cardAudit.isOnProbation ? ' · Probation Active (No Exemption)' : ''}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* BOTTOM ACTION BUTTONS */}
                <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        if (!limits?.payslipEnabled) {
                          toast.info("Generating Detailed Payslips is available on Pro & Enterprise plans.");
                          return;
                        }
                        setSelectedPayroll(payroll);
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-200/70 transition-colors"
                      title="View printable payslip"
                    >
                      <FileText size={14} className="text-slate-500" />
                      <span>Payslip</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracePayroll(payroll);
                      }}
                      className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Show audited mathematical calculation derivation"
                    >
                      <Calculator size={13} />
                      <span>Show Calculation</span>
                    </button>

                    {(() => {
                      const workerObj = workers.find(w => w.id === payroll.workerId);
                      return (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaxDeclarationWorker(workerObj || null);
                            }}
                            className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Configure state PT slabs, tax regime (Old vs New) & 80C declarations"
                          >
                            <Shield size={13} />
                            <span>Tax / State</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setForm16Worker(workerObj || null);
                            }}
                            className="text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 border border-slate-300 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Generate official Form 16 Part B Certificate"
                          >
                            <FileCheck size={13} />
                            <span>Form 16</span>
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  <div>
                    {(() => {
                      const workerConflict = unresolvedConflicts.find(c => c.workerId === payroll.workerId);
                      const workerMinWageAudit =
                        serverValidation?.allResults.find(r => r.workerId === payroll.workerId) ||
                        payroll.wageStructureAudit;
                      if (payroll.status === 'PAID') {
                        return (
                          <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 px-2 py-1">
                            <CheckCircle size={13} />
                            <span>Settled</span>
                          </span>
                        );
                      }
                      if (workerConflict) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsConflictModalOpen(true);
                            }}
                            className="min-h-[38px] text-xs font-black text-rose-700 bg-rose-100 hover:bg-rose-200 border-2 border-rose-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                            title="Click to resolve attendance conflict blocking this payroll"
                          >
                            <AlertCircle size={13} />
                            <span>Resolve Conflict</span>
                          </button>
                        );
                      }
                      if (workerMinWageAudit?.isMinimumWageViolation) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsPaid(payroll, e)}
                            className="text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 border border-rose-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                            title="MINIMUM_WAGE_VIOLATION: Payout blocked until Basic Pay meets state minimum wage"
                          >
                            <Lock size={12} />
                            <span>Blocked: Min Wage</span>
                          </button>
                        );
                      }
                      return (
                        <button 
                          onClick={(e) => handleMarkAsPaid(payroll, e)}
                          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                          Mark Paid
                        </button>
                      );
                    })()}
                  </div>
                </div>

              </div>
            ))}

            {payrolls.length === 0 && !loading && (
              <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <IndianRupee className="mx-auto mb-2 text-slate-300" size={24} />
                <p className="text-sm font-semibold text-slate-700">No personnel records found for salary generation</p>
                <p className="text-xs text-slate-400 mt-1">Workers must be registered in the directory to compute payroll.</p>
              </div>
            )}
          </div>
        </>
      )}

      {selectedPayroll && (
        <Payslip 
          data={selectedPayroll} 
          companyName={profile?.companyName || 'Factory Admin'}
          siteAddress={siteAddress}
          onClose={() => setSelectedPayroll(null)} 
        />
      )}

      {/* STATUTORY CALCULATION TRACE MODAL */}
      <StatutoryTraceModal
        isOpen={Boolean(tracePayroll)}
        onClose={() => setTracePayroll(null)}
        payroll={tracePayroll}
      />

      {/* TAX DECLARATION & STATE PT CONFIGURATION MODAL */}
      <TaxDeclarationModal
        isOpen={Boolean(taxDeclarationWorker)}
        onClose={() => setTaxDeclarationWorker(null)}
        worker={taxDeclarationWorker}
        tenantId={profile?.tenantId || ''}
        onUpdated={loadData}
      />

      {/* FORM 16 PART B MODAL */}
      <Form16Modal
        isOpen={Boolean(form16Worker)}
        onClose={() => setForm16Worker(null)}
        worker={form16Worker}
        payrolls={payrolls}
        companyName={profile?.companyName || 'Factory Admin'}
      />

      {/* CONFLICT RESOLUTION MODAL */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        tenantId={profile?.tenantId}
        onResolved={async () => {
          if (profile?.tenantId) {
            const list = await conflictService.getUnresolvedPayrollConflicts(profile.tenantId, currentMonthStr);
            setUnresolvedConflicts(list);
          }
        }}
      />

      {/* STATUTORY FILING EXPORT PACK (ZIP) MODAL */}
      <StatutoryExportModal
        isOpen={isExportPackOpen}
        onClose={() => setIsExportPackOpen(false)}
        workers={workers}
        payrolls={payrolls}
        orgSettings={settings || { shifts: [], enableBreakTracking: false }}
        tenantName={profile?.companyName || 'Factory Admin'}
        currentMonthStr={currentMonthStr}
      />

      {/* INLINE WAGE STRUCTURE FIX MODAL */}
      <WageStructureEditorModal
        isOpen={Boolean(editingWageWorker)}
        worker={editingWageWorker}
        orgSettings={settings}
        onClose={() => setEditingWageWorker(null)}
        onSaved={async () => {
          await loadData();
        }}
      />

      {/* PRE-FINALIZATION SERVER AUDIT & FINALIZE PAYROLL MODAL */}
      {isFinalizationModalOpen && serverValidation && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold">Pre-Finalization Wage Structure Audit</h2>
                <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
                  {serverValidation.verificationSource === 'CLOUD_FUNCTION' ? (
                    <>
                      <Cloud size={12} className="text-blue-400" /> Verified by Cloud Function (`validatePayrollFinalization`)
                    </>
                  ) : (
                    <>
                      <Cpu size={12} className="text-indigo-400" /> Verified by Statutory Validation Engine ({currentMonthStr})
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFinalizationModalOpen(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {isRetrospectivePeriod && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-xs text-amber-950">
                  <strong>Retrospective Payroll ({currentMonthStr} — Pre-21 Nov 2025):</strong> Legacy EPF/ESIC rules apply without 50% Rule excess allowance add-back. Future payroll runs (Nov 2025 onwards) enforce automatic recalculation.
                </div>
              )}

              {serverValidation.hasFlaggedWorkers ? (
                <>
                  {serverValidation.minimumWageViolationCount > 0 && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4">
                      <h3 className="text-sm font-black text-rose-950 font-mono">
                        BLOCKING ERROR: MINIMUM_WAGE_VIOLATION ({serverValidation.minimumWageViolationCount} Employee{serverValidation.minimumWageViolationCount > 1 ? 's' : ''})
                      </h3>
                      <p className="text-xs text-rose-900 mt-1">
                        Payroll cannot be finalized while any employee&apos;s Basic Pay is below the applicable state minimum wage floor. Fix Basic Pay for each highlighted worker below and re-validate.
                      </p>
                    </div>
                  )}

                  {serverValidation.nonCompliantCount > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
                      <h3 className="text-sm font-black text-amber-950">
                        Your basic pay is less than 50% of CTC. This will increase PF/Gratuity liabilities.
                      </h3>
                      <p className="text-xs text-amber-900 mt-1">
                        Found <strong>{serverValidation.nonCompliantCount}</strong> NON_COMPLIANT worker(s) · Total Gap:{' '}
                        <strong className="font-mono tabular-nums">₹{serverValidation.totalGapAmount.toLocaleString('en-IN')}/mo</strong>.
                        {!isRetrospectivePeriod && (
                          <> Automatic 50% Rule excess allowance add-back &amp; WageComplianceAudit persistence will execute on finalization.</>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {serverValidation.flaggedWorkers.map((fw) => {
                      const targetWorker = workers.find((w) => w.id === fw.workerId);
                      const gratYr = fw.estimatedAdditionalGratuityAnnual ?? Math.round((fw.deemedWageAddBack * 15) / 26);
                      return (
                        <div
                          key={fw.workerId || fw.workerName}
                          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            fw.isMinimumWageViolation
                              ? 'border-rose-300 bg-rose-50/40'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900">{fw.workerName}</span>
                              {fw.isFiftyPercentNonCompliant && (
                                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-mono font-bold">
                                  NON_COMPLIANT
                                </span>
                              )}
                              {fw.isMinimumWageViolation && (
                                <span className="px-2 py-0.5 rounded bg-rose-800 text-white text-[10px] font-mono font-bold">
                                  MINIMUM_WAGE_VIOLATION (BLOCKED)
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-mono tabular-nums text-slate-600 mt-1">
                              {fw.state} ({fw.wageZone}) · {fw.scheduledEmployment} · {fw.skillCategory.replace('_', '-')}
                            </div>
                            {fw.isMinimumWageViolation && (
                              <div className="text-xs font-mono tabular-nums text-rose-900 mt-1">
                                Basic: ₹{fw.basicPay.toLocaleString('en-IN')}/mo vs Floor ₹{fw.statutoryMinimumWageMonthly.toLocaleString('en-IN')}/mo ·{' '}
                                <strong>Gap ₹{fw.minimumWageGap.toLocaleString('en-IN')}/mo</strong> · Notif. Date: {fw.minimumWageNotificationDate}
                                {fw.isOnProbation ? ' · Probation Active (No Exemption)' : ''}
                              </div>
                            )}
                            {fw.midMonthRevisionInfo?.isRevisedInMonth && (
                              <div className="text-[11px] font-mono tabular-nums text-amber-900 mt-0.5">
                                Pro-rated mid-month revision eff. {fw.midMonthRevisionInfo.revisionDate}: {fw.midMonthRevisionInfo.daysAtPreviousRate}d @ ₹{fw.midMonthRevisionInfo.previousMonthlyFloor.toLocaleString('en-IN')} + {fw.midMonthRevisionInfo.daysAtRevisedRate}d @ ₹{fw.midMonthRevisionInfo.revisedMonthlyFloor.toLocaleString('en-IN')}
                              </div>
                            )}
                            <div className="text-xs font-mono tabular-nums text-slate-600 mt-1">
                              WageBase: ₹{fw.wageBase.toLocaleString('en-IN')} ({fw.wageBasePercentage}%) · Excluded: ₹{fw.excludedComponents.toLocaleString('en-IN')} ({fw.excludedPercentage}%)
                              {fw.gapAmount > 0 && (
                                <span className="text-rose-700 font-bold ml-2">
                                  50% Gap: ₹{fw.gapAmount.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                            {fw.deemedWageAddBack > 0 && (
                              <div className="text-[11px] font-mono text-amber-900 mt-1">
                                {!isRetrospectivePeriod
                                  ? `Auto Add-Back: +₹${fw.deemedWageAddBack.toLocaleString('en-IN')} → CompliantWageBase: ₹${(fw.compliantWageBase ?? (fw.wageBase + fw.deemedWageAddBack)).toLocaleString('en-IN')}`
                                  : `Deferred Add-Back (Pre-Nov 2025): ₹${fw.deemedWageAddBack.toLocaleString('en-IN')}`}
                                {' · '}
                                <span className="text-rose-700 font-bold">
                                  Gratuity Impact: +₹{fw.estimatedAdditionalGratuityMonthly}/mo (+₹{gratYr.toLocaleString('en-IN')}/yr)
                                </span>
                              </div>
                            )}
                          </div>

                          {targetWorker && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsFinalizationModalOpen(false);
                                setEditingWageWorker(targetWorker);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Edit3 size={12} className="text-blue-600" /> Fix Structure
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                  <CheckCircle size={32} className="text-emerald-600 mx-auto mb-2" />
                  <h3 className="text-sm font-bold text-emerald-950">
                    All {serverValidation.allResults.length} Wage Structures Comply!
                  </h3>
                  <p className="text-xs text-emerald-700 mt-1">
                    Every worker meets the 50% Basic Wage Rule and State Statutory Minimum Wage floor.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsFinalizationModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleFinalizePayrollRun}
                disabled={
                  finalizingPayroll ||
                  unresolvedConflicts.length > 0 ||
                  serverValidation.minimumWageViolationCount > 0
                }
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  serverValidation.minimumWageViolationCount > 0
                    ? 'bg-rose-700'
                    : serverValidation.hasFlaggedWorkers
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {finalizingPayroll ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}
                <span>
                  {serverValidation.minimumWageViolationCount > 0
                    ? 'Payroll Blocked (Fix MINIMUM_WAGE_VIOLATION)'
                    : serverValidation.hasFlaggedWorkers
                    ? 'Acknowledge 50% Add-Back & Finalize Payroll'
                    : 'Finalize & Lock Payroll'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WAGE COMPLIANCE AUDIT RECORDS MODAL */}
      {isAuditHistoryOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <History size={18} className="text-indigo-400" />
                  <span>WageComplianceAudit Ledger ({currentMonthStr})</span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Original vs recalculated wage bases, Notional Wage Additions, and Gratuity liability projections (eff. 21 Nov 2025).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditHistoryOpen(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const displayAudits: WageComplianceAudit[] =
                  savedAudits.length > 0
                    ? savedAudits
                    : payrolls
                        .map((p) => p.wageComplianceAudit)
                        .filter((a): a is WageComplianceAudit => Boolean(a));

                if (displayAudits.length === 0) {
                  return (
                    <div className="text-center py-8 text-xs text-slate-500">
                      No payroll records available to audit for {currentMonthStr}.
                    </div>
                  );
                }

                return (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50 border border-slate-200 rounded-2xl p-3">
                      <span>
                        Status:{' '}
                        {savedAudits.length > 0 ? (
                          <strong className="text-emerald-700">{savedAudits.length} persisted audit record(s) loaded</strong>
                        ) : (
                          <strong className="text-amber-700">Live preview (not yet persisted for {currentMonthStr})</strong>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={handlePersistAllMonthAudits}
                        disabled={savingAudits}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {savingAudits && <Loader2 size={13} className="animate-spin" />}
                        <span>Save Month Audits</span>
                      </button>
                    </div>

                    {displayAudits.map((audit) => (
                      <div
                        key={audit.id}
                        className={`rounded-2xl border p-4 space-y-2 ${
                          audit.addBackApplied
                            ? 'bg-amber-50/50 border-amber-200'
                            : audit.isRetrospectivePeriod
                            ? 'bg-slate-50 border-amber-300'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{audit.workerName}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                audit.complianceStatus === 'NON_COMPLIANT'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {audit.complianceStatus}
                            </span>
                            {audit.addBackApplied && (
                              <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-mono font-bold">
                                ADD-BACK +₹{audit.notionalWageAddition.toLocaleString('en-IN')}
                              </span>
                            )}
                            {audit.isRetrospectivePeriod && (
                              <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-950 text-[10px] font-mono font-bold">
                                RETROSPECTIVE (LEGACY RULES)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">
                            {audit.payrollMonth}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-white p-2.5 rounded-xl border border-slate-200/80">
                          <div>
                            <span className="block text-[10px] font-sans font-bold text-slate-400 uppercase">Original WageBase</span>
                            <span className="font-bold text-slate-900">₹{audit.originalWageBase.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-sans font-bold text-slate-400 uppercase">Recalculated Base</span>
                            <span className="font-black text-slate-900">₹{audit.recalculatedWageBase.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-sans font-bold text-slate-400 uppercase">PF Base (Orig → Rec)</span>
                            <span className="font-bold text-blue-800">
                              ₹{audit.originalPfWageBase.toLocaleString('en-IN')} → ₹{audit.recalculatedPfWageBase.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-sans font-bold text-slate-400 uppercase">ESI Base (Orig → Rec)</span>
                            <span className="font-bold text-teal-800">
                              ₹{audit.originalEsiWageBase.toLocaleString('en-IN')} → ₹{audit.recalculatedEsiWageBase.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono text-slate-600">{audit.formulaText}</span>
                          {audit.gratuityImpact?.annualIncrease > 0 && (
                            <span className="font-mono font-bold text-rose-700">
                              Gratuity Delta: +₹{audit.gratuityImpact.monthlyIncrease}/mo (+₹{audit.gratuityImpact.annualIncrease.toLocaleString('en-IN')}/yr)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsAuditHistoryOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATE MINIMUM WAGE SCHEDULE & MID-MONTH REVISIONS MODAL */}
      {isMinWageModalOpen && settings && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Scale size={18} className="text-emerald-400" />
                  <span>State-Wise Minimum Wage Database &amp; Revisions</span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Categorized by State, Scheduled Employment, Zone, Skill Level, and Notification Date.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMinWageModalOpen(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-slate-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <MinimumWageSchedulePanel
                orgSettings={settings}
                onUpdateRevisions={handleSaveMinWageRevisions}
                saving={savingMinWageRevisions}
              />
            </div>
          </div>
        </div>
      )}

      {/* PRE-UPLOAD EPFO ECR 2.0 VALIDATOR MODAL */}
      <EcrValidatorModal
        isOpen={isEcrValidatorOpen}
        onClose={() => setIsEcrValidatorOpen(false)}
        tenantId={profile?.tenantId || 'demo-tenant-id'}
        month={currentMonthStr}
        workers={workers}
        payrolls={payrolls}
        attendance={attendanceHistory}
        orgSettings={settings}
        onWorkerUpdated={(updated: Worker) => {
          setWorkers(prev => prev.map(w => (w.id === updated.id ? updated : w)));
        }}
      />

      {legalHoldTarget && (
        <FnfLegalHoldModal
          record={legalHoldTarget}
          onClose={() => setLegalHoldTarget(null)}
          onConfirm={handlePlaceFnfHold}
        />
      )}
    </div>
  );
};