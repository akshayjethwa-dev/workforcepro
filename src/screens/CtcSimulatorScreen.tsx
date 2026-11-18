import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Users,
  MessageSquare,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Lock,
  Copy,
  ExternalLink,
  History,
  RefreshCw,
  Scale,
  CheckSquare,
  Square,
  Send,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  CtcBulkRestructureAuditLog,
  CtcRestructureTemplateId,
  CtcSimulationWorkerPlan,
  EmployeeRestructureConsentRecord,
  INDIAN_STATES,
  OrgSettings,
  ScreenName,
  Worker,
  WorkerSkillCategory,
} from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { ctcSimulatorService } from '../services/ctcSimulatorService';
import {
  getStateMinimumWage,
  validateWorkerWageStructure,
} from '../services/wageStructureValidationService';
import { SalaryRevisionLetterModal } from '../components/SalaryRevisionLetterModal';

interface Props {
  onNavigate?: (screen: ScreenName) => void;
}

const TEMPLATE_PRESETS: { id: CtcRestructureTemplateId; label: string; pct: number; subtitle: string }[] = [
  { id: 'BASIC_50', label: '50% Basic (Statutory Min)', pct: 50, subtitle: 'Exact Code on Wages threshold' },
  { id: 'BASIC_55', label: '55% Basic (Safe Buffer)', pct: 55, subtitle: 'Buffer against allowance drift' },
  { id: 'BASIC_60', label: '60% Basic (Conservative)', pct: 60, subtitle: 'Enterprise compliant standard' },
];

export const CtcSimulatorScreen: React.FC<Props> = ({ onNavigate }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const tenantId = profile?.tenantId || 'demo-tenant-id';
  const companyName = profile?.companyName || 'WorkForce Pro Factory';

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [consentRecords, setConsentRecords] = useState<EmployeeRestructureConsentRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<CtcBulkRestructureAuditLog[]>([]);

  const [activeTab, setActiveTab] = useState<'SIMULATOR' | 'BULK_APPLY' | 'CONSENT_AUDIT'>('SIMULATOR');

  // Standalone What-If Simulator state (defaults showcase classic ₹30k CTC with 33% Basic scenario)
  const [selectedSampleWorkerId, setSelectedSampleWorkerId] = useState<string>('');
  const [simCtc, setSimCtc] = useState<number>(30000);
  const [simBasic, setSimBasic] = useState<number>(10000);
  const [simDa, setSimDa] = useState<number>(0);
  const [simRetaining, setSimRetaining] = useState<number>(0);
  const [simHra, setSimHra] = useState<number>(12000);
  const [simTravel, setSimTravel] = useState<number>(2000);
  const [simMedical, setSimMedical] = useState<number>(1500);
  const [simOthers, setSimOthers] = useState<number>(4500);
  const [simState, setSimState] = useState<string>('Maharashtra');
  const [simSkill, setSimSkill] = useState<WorkerSkillCategory>('UNSKILLED');
  const [simCapPf, setSimCapPf] = useState<boolean>(true);
  const [simEsiEnabled, setSimEsiEnabled] = useState<boolean>(true);

  // Template & Bulk Apply Controls
  const [selectedTemplateId, setSelectedTemplateId] = useState<CtcRestructureTemplateId>('BASIC_50');
  const [targetBasicPct, setTargetBasicPct] = useState<number>(50);
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [bulkFilter, setBulkFilter] = useState<'NON_COMPLIANT' | 'ALL'>('NON_COMPLIANT');
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Unionized CBA Authorization State (Edge Case 1)
  const [cbaOverrideChecked, setCbaOverrideChecked] = useState(false);
  const [cbaSettlementRef, setCbaSettlementRef] = useState('');

  // Revision Letter Modal State
  const [letterModalOpen, setLetterModalOpen] = useState(false);
  const [letterPlans, setLetterPlans] = useState<CtcSimulationWorkerPlan[]>([]);
  const [letterInitialWorkerId, setLetterInitialWorkerId] = useState<string | undefined>(undefined);

  // Consent WhatsApp Dispatch State
  const [sendingConsentId, setSendingConsentId] = useState<string | null>(null);
  const [sendingAllConsents, setSendingAllConsents] = useState(false);

  const loadWorkspaceData = async () => {
    setLoading(true);
    try {
      const [fetchedWorkers, fetchedSettings, fetchedConsents, fetchedAudits] = await Promise.all([
        dbService.getWorkers(tenantId),
        dbService.getOrgSettings(tenantId),
        ctcSimulatorService.getConsentRecords(tenantId),
        ctcSimulatorService.getBulkAuditLogs(tenantId),
      ]);
      const activeWorkers = fetchedWorkers.filter((w) => w.status === 'ACTIVE');
      setWorkers(activeWorkers);
      setOrgSettings(fetchedSettings);
      setConsentRecords(fetchedConsents);
      setAuditLogs(fetchedAudits);
      setSimCapPf(fetchedSettings?.compliance?.capPfDeduction !== false);
      setSimEsiEnabled(fetchedSettings?.compliance?.esiEnabled !== false);
    } catch (err: any) {
      toast.error(`Failed to load CTC Simulator data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, [tenantId]);

  const handleLoadWorkerIntoSimulator = (workerId: string) => {
    setSelectedSampleWorkerId(workerId);
    if (!workerId) return;
    const w = workers.find((item) => item.id === workerId);
    if (!w) return;
    const audit = validateWorkerWageStructure(w, {
      ignoreRevisionCutoff: true,
      orgSettings: orgSettings || undefined,
    });
    setSimCtc(Math.round(audit.totalRemuneration));
    setSimBasic(Math.round(audit.basicPay));
    setSimDa(Math.round(audit.da));
    setSimRetaining(Math.round(audit.retainingAllowance));
    setSimHra(Math.round(audit.hra));
    setSimTravel(Math.round(audit.travelAllowance));
    setSimMedical(Math.round(audit.medicalAllowance));
    setSimOthers(Math.round(audit.otherAllowances));
    setSimState(audit.state);
    setSimSkill(audit.skillCategory);
  };

  // Live What-If Simulation Output
  const singleSim = useMemo(() => {
    return ctcSimulatorService.simulateSingleCtc({
      totalCtcMonthly: simCtc,
      currentBasic: simBasic,
      da: simDa,
      retainingAllowance: simRetaining,
      hra: simHra,
      travel: simTravel,
      medical: simMedical,
      others: simOthers,
      targetBasicPercentage: targetBasicPct,
      state: simState,
      skillCategory: simSkill,
      capPfAt15k: simCapPf,
      esiEnabled: simEsiEnabled,
    });
  }, [
    simCtc,
    simBasic,
    simDa,
    simRetaining,
    simHra,
    simTravel,
    simMedical,
    simOthers,
    targetBasicPct,
    simState,
    simSkill,
    simCapPf,
    simEsiEnabled,
  ]);

  // All Worker Restructure Plans
  const allWorkerPlans = useMemo(() => {
    return workers.map((w) =>
      ctcSimulatorService.simulateWorkerRestructure(w, targetBasicPct, orgSettings)
    );
  }, [workers, targetBasicPct, orgSettings]);

  const nonCompliantPlans = useMemo(
    () => allWorkerPlans.filter((p) => !p.isCurrentlyCompliant),
    [allWorkerPlans]
  );

  const visibleBulkPlans = useMemo(() => {
    return bulkFilter === 'NON_COMPLIANT' ? nonCompliantPlans : allWorkerPlans;
  }, [bulkFilter, nonCompliantPlans, allWorkerPlans]);

  // Auto-select eligible non-compliant workers when plan list loads or filter changes
  useEffect(() => {
    const eligible = new Set(
      visibleBulkPlans
        .filter((p) => !p.isCurrentlyCompliant && p.canApply)
        .map((p) => p.workerId)
    );
    setSelectedWorkerIds(eligible);
  }, [workers.length, bulkFilter, targetBasicPct]);

  const selectedPlans = useMemo(
    () => visibleBulkPlans.filter((p) => selectedWorkerIds.has(p.workerId)),
    [visibleBulkPlans, selectedWorkerIds]
  );

  const bulkSummary = useMemo(() => {
    const eligibleSelected = selectedPlans.filter((p) => p.canApply);
    const blockedInView = visibleBulkPlans.filter((p) => !p.canApply).length;
    const totalShiftedMonthly = eligibleSelected.reduce(
      (sum, p) => sum + Math.max(0, Math.round(p.simulation.shiftAmount)),
      0
    );
    const totalEmployerPfDelta = eligibleSelected.reduce(
      (sum, p) => sum + p.simulation.pfEmployerDeltaMonthly,
      0
    );
    const totalEmployeePfDelta = eligibleSelected.reduce(
      (sum, p) => sum + p.simulation.pfEmployeeDeltaMonthly,
      0
    );
    const totalGratuityAnnualDelta = eligibleSelected.reduce(
      (sum, p) => sum + p.simulation.gratuityAnnualDelta,
      0
    );
    return {
      eligibleCount: eligibleSelected.length,
      blockedInView,
      totalShiftedMonthly,
      totalEmployerPfDelta,
      totalEmployeePfDelta,
      totalGratuityAnnualDelta,
    };
  }, [selectedPlans, visibleBulkPlans]);

  const cbaConfig = orgSettings?.compliance?.unionizedCba;
  const isCbaRestricted = Boolean(cbaConfig?.hasActiveCba && cbaConfig?.prohibitsUnilateralRestructure);
  const isCbaApplyBlocked = isCbaRestricted && (!cbaOverrideChecked || !cbaSettlementRef.trim());

  const handleTemplateSelect = (id: CtcRestructureTemplateId, pct?: number) => {
    setSelectedTemplateId(id);
    if (typeof pct === 'number') {
      setTargetBasicPct(pct);
    }
  };

  const handleToggleWorker = (workerId: string, canApply: boolean) => {
    if (!canApply) return;
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const handleApplyBulk = async () => {
    if (isCbaApplyBlocked) {
      toast.error('Active Collective Bargaining Agreement blocks unilateral bulk restructuring. Enter Union settlement reference & check confirmation.');
      return;
    }
    const eligiblePlans = selectedPlans.filter((p) => p.canApply);
    if (eligiblePlans.length === 0) {
      toast.warning('Select at least one eligible worker above the state minimum wage floor.');
      return;
    }

    setApplyingBulk(true);
    try {
      const templateLabel =
        selectedTemplateId === 'CUSTOM'
          ? `Custom ${targetBasicPct}% Basic`
          : TEMPLATE_PRESETS.find((t) => t.id === selectedTemplateId)?.label || `${targetBasicPct}% Basic`;

      const res = await ctcSimulatorService.applyBulkRestructure({
        tenantId,
        workers,
        plans: eligiblePlans,
        orgSettings,
        effectiveDate,
        templateLabel,
        targetBasicPercentage: targetBasicPct,
        executedBy: profile?.email || 'admin@workforcepro.in',
        cbaCheckAcknowledged: cbaOverrideChecked,
        cbaOverrideRef: cbaSettlementRef.trim() || undefined,
      });

      const updatedMap = new Map(res.updatedWorkers.map((w) => [w.id, w]));
      setWorkers((prev) => prev.map((w) => updatedMap.get(w.id) || w));
      setConsentRecords((prev) => [...res.consentRecords, ...prev]);
      setAuditLogs((prev) => [res.auditLog, ...prev]);

      if (res.skippedWorkers.length > 0) {
        toast.warning(
          `Updated ${res.updatedWorkers.length} workers. Skipped ${res.skippedWorkers.length} due to minimum wage floor.`
        );
      } else {
        toast.success(
          `Restructured ${res.updatedWorkers.length} workers (${templateLabel}) with zero CTC inflation & audit logs saved.`
        );
      }
      setActiveTab('CONSENT_AUDIT');
    } catch (err: any) {
      toast.error(err.message || 'Bulk restructure failed.');
    } finally {
      setApplyingBulk(false);
    }
  };

  const handleSendWhatsAppConsent = async (record: EmployeeRestructureConsentRecord) => {
    const worker = workers.find((w) => w.id === record.workerId);
    if (!worker) {
      toast.error('Worker profile not found.');
      return;
    }
    setSendingConsentId(record.id);
    try {
      const result = await ctcSimulatorService.sendRestructureWhatsAppNotice({
        tenantId,
        worker,
        consentRecord: record,
        issuedBy: profile?.email || 'admin',
      });
      setConsentRecords((prev) =>
        prev.map((r) => (r.id === record.id ? result.consentRecord : r))
      );
      toast.success(`WhatsApp acknowledgement link generated for ${worker.name}.`);
    } catch (err: any) {
      toast.error(`Failed to create WhatsApp link: ${err.message}`);
    } finally {
      setSendingConsentId(null);
    }
  };

  const handleSendAllPendingWhatsApp = async () => {
    const pending = consentRecords.filter((r) => r.status === 'NOT_SENT');
    if (pending.length === 0) return;
    setSendingAllConsents(true);
    try {
      const updatedList: EmployeeRestructureConsentRecord[] = [];
      for (const rec of pending) {
        const w = workers.find((item) => item.id === rec.workerId);
        if (!w) continue;
        const res = await ctcSimulatorService.sendRestructureWhatsAppNotice({
          tenantId,
          worker: w,
          consentRecord: rec,
          issuedBy: profile?.email || 'admin',
        });
        updatedList.push(res.consentRecord);
      }
      const updatedMap = new Map(updatedList.map((r) => [r.id, r]));
      setConsentRecords((prev) => prev.map((r) => updatedMap.get(r.id) || r));
      toast.success(`Prepared ${updatedList.length} WhatsApp acknowledgement link(s).`);
    } finally {
      setSendingAllConsents(false);
    }
  };

  const handleOpenRevisionLetters = (plansToOpen: CtcSimulationWorkerPlan[], initialId?: string) => {
    if (plansToOpen.length === 0) {
      toast.warning('No worker plans selected for revision letter generation.');
      return;
    }
    setLetterPlans(plansToOpen);
    setLetterInitialWorkerId(initialId || plansToOpen[0].workerId);
    setLetterModalOpen(true);
  };

  const handleToggleDemoCba = async () => {
    if (!orgSettings) return;
    const nextActive = !cbaConfig?.hasActiveCba;
    const nextSettings: OrgSettings = {
      ...orgSettings,
      compliance: {
        ...(orgSettings.compliance || {}),
        unionizedCba: {
          hasActiveCba: nextActive,
          unionName: cbaConfig?.unionName || 'Factory Kamgar Union (INTUC)',
          agreementRef: cbaConfig?.agreementRef || 'CBA-2025-MH-04',
          prohibitsUnilateralRestructure: true,
          lastReviewedAt: new Date().toISOString().slice(0, 10),
        },
      },
    };
    await dbService.saveOrgSettings(tenantId, nextSettings);
    setOrgSettings(nextSettings);
    setCbaOverrideChecked(false);
    setCbaSettlementRef('');
    toast.info(
      nextActive
        ? 'Unionized CBA restriction enabled for tenant.'
        : 'Unionized CBA restriction disabled.'
    );
  };

  const templateDisplayLabel =
    selectedTemplateId === 'CUSTOM'
      ? `Custom ${targetBasicPct}% Basic`
      : TEMPLATE_PRESETS.find((t) => t.id === selectedTemplateId)?.label || `${targetBasicPct}% Basic`;

  const stateMinWageInfo = useMemo(
    () => getStateMinimumWage(simState, simSkill),
    [simState, simSkill]
  );

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
        <RefreshCw size={24} className="animate-spin text-blue-600" />
        <p className="text-xs font-semibold">Loading CTC Simulator &amp; Workforce Compliance Matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header & Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Employer CTC Restructuring Simulator
          </h1>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
            <span>Zero-Budget 50% Wage Rule Alignment</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-700 font-semibold">
              {nonCompliantPlans.length} Non-Compliant Workers
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">
              {workers.length} Total Active Staff
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleDemoCba}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              cbaConfig?.hasActiveCba
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Unionized Collective Bargaining Agreement guard"
          >
            <Scale size={14} className={cbaConfig?.hasActiveCba ? 'text-amber-600' : 'text-slate-500'} />
            <span>{cbaConfig?.hasActiveCba ? 'CBA Active (Unionized)' : 'CBA Guard: Off'}</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('SETTINGS')}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <SettingsIcon size={14} className="text-slate-500" />
              <span>Compliance Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Edge Case 1: Unionized Workforce (CBA) Warning Banner */}
      {isCbaRestricted && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-950">
                  Unionized Workforce Alert: Active Collective Bargaining Agreement (CBA)
                </h2>
                <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                  <strong>{cbaConfig?.unionName || 'Recognized Labour Union'}</strong> (Agreement Ref:{' '}
                  <span className="font-mono font-semibold">{cbaConfig?.agreementRef || 'On File'}</span>) prohibits unilateral salary component restructuring. Direct bulk updates are locked until a signed Union Settlement Reference is logged.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono font-bold text-amber-900 shrink-0">
              {cbaOverrideChecked && cbaSettlementRef.trim() ? 'Settlement Verified' : 'Unilateral Apply Locked'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-amber-200/80">
            <input
              type="text"
              value={cbaSettlementRef}
              onChange={(e) => setCbaSettlementRef(e.target.value)}
              placeholder="Enter Union MoU / Settlement Reference (e.g. MOU-2025-11-UNION)"
              className="px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-xs font-mono text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
            />
            <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cbaOverrideChecked}
                onChange={(e) => setCbaOverrideChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-700"
              />
              <span>Confirm written Union consultation &amp; bilateral consent obtained</span>
            </label>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('SIMULATOR')}
          className={`flex-1 min-w-[180px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'SIMULATOR'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Calculator size={15} />
          <span>1. What-If CTC Calculator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('BULK_APPLY')}
          className={`flex-1 min-w-[180px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'BULK_APPLY'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users size={15} />
          <span>
            2. Bulk Restructure ({nonCompliantPlans.length} Non-Compliant)
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CONSENT_AUDIT')}
          className={`flex-1 min-w-[180px] py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'CONSENT_AUDIT'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <MessageSquare size={15} />
          <span>
            3. WhatsApp Consent &amp; Audit ({consentRecords.length})
          </span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: WHAT-IF CTC CALCULATOR                                         */}
      {/* ===================================================================== */}
      {activeTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Inputs & Template Selector */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Current Compensation Input</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter CTC breakup or load an existing employee
                </p>
              </div>
              <select
                value={selectedSampleWorkerId}
                onChange={(e) => handleLoadWorkerIntoSimulator(e.target.value)}
                className="max-w-[175px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 outline-none"
                aria-label="Load existing employee"
              >
                <option value="">Custom Scenario</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Total Monthly CTC / Gross Remuneration (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simCtc}
                  onChange={(e) => {
                    const nextCtc = Math.max(0, Number(e.target.value) || 0);
                    setSimCtc(nextCtc);
                    const currentFixed = simBasic + simDa + simRetaining + simHra + simTravel + simMedical;
                    setSimOthers(Math.max(0, nextCtc - currentFixed));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono tabular-nums text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Current Basic Pay (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simBasic}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setSimBasic(v);
                    setSimCtc(v + simDa + simRetaining + simHra + simTravel + simMedical + simOthers);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono tabular-nums text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  HRA (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simHra}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setSimHra(v);
                    setSimCtc(simBasic + simDa + simRetaining + v + simTravel + simMedical + simOthers);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono tabular-nums text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Travel / Conveyance (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simTravel}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setSimTravel(v);
                    setSimCtc(simBasic + simDa + simRetaining + simHra + v + simMedical + simOthers);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono tabular-nums text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Medical Allowance (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simMedical}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setSimMedical(v);
                    setSimCtc(simBasic + simDa + simRetaining + simHra + simTravel + v + simOthers);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono tabular-nums text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Other Allowances (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simOthers}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setSimOthers(v);
                    setSimCtc(simBasic + simDa + simRetaining + simHra + simTravel + simMedical + v);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono tabular-nums text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  DA + Retaining (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={simDa + simRetaining}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setSimDa(v);
                    setSimRetaining(0);
                    setSimCtc(simBasic + v + simHra + simTravel + simMedical + simOthers);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono tabular-nums text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* State & Minimum Wage Context */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Work State (Min Wage)
                </label>
                <select
                  value={simState}
                  onChange={(e) => setSimState(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white outline-none"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Skill Category
                </label>
                <select
                  value={simSkill}
                  onChange={(e) => setSimSkill(e.target.value as WorkerSkillCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white outline-none"
                >
                  <option value="UNSKILLED">Unskilled</option>
                  <option value="SEMI_SKILLED">Semi-Skilled</option>
                  <option value="SKILLED">Skilled</option>
                  <option value="HIGHLY_SKILLED">Highly Skilled</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
              <span className="text-slate-600">
                {simState} Min Wage Floor:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  ₹{stateMinWageInfo.monthlyFloor.toLocaleString('en-IN')}/mo
                </strong>
              </span>
              <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simCapPf}
                  onChange={(e) => setSimCapPf(e.target.checked)}
                  className="rounded accent-blue-600"
                />
                <span>Cap EPF at ₹15,000</span>
              </label>
            </div>

            {/* Target Template Selection */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Restructuring Template
                </span>
                <span className="font-mono text-xs font-bold text-blue-700 tabular-nums">
                  Target: {targetBasicPct}% Basic
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleTemplateSelect(preset.id, preset.pct)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      selectedTemplateId === preset.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="text-xs font-bold font-mono">{preset.pct}% Basic</div>
                    <div
                      className={`text-[10px] mt-0.5 truncate ${
                        selectedTemplateId === preset.id ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {preset.subtitle}
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Custom Target Basic %</span>
                  <span className="font-mono font-bold text-slate-800">{targetBasicPct}%</span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={80}
                  step={1}
                  value={targetBasicPct}
                  onChange={(e) => {
                    setSelectedTemplateId('CUSTOM');
                    setTargetBasicPct(Number(e.target.value));
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Reallocation Result & Financial Impact */}
          <div className="lg:col-span-7 space-y-4">
            {/* Minimum Wage Blocking Guard (Edge Case 2) */}
            {singleSim.violatesMinimumWage && (
              <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-rose-900">
                      Minimum Wage Floor Guard Triggered
                    </h3>
                    <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                      {singleSim.minimumWageBlockReason}
                    </p>
                  </div>
                </div>
                {!singleSim.requiresCtcTopUp && singleSim.totalRemuneration > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const minPct = Math.min(
                        100,
                        Math.ceil((singleSim.stateMinimumWageMonthly / singleSim.totalRemuneration) * 100)
                      );
                      setSelectedTemplateId('CUSTOM');
                      setTargetBasicPct(Math.max(50, minPct));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Clamp to Min Wage Floor
                  </button>
                )}
              </div>
            )}

            {/* Top Comparison KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Current Basic
                </span>
                <span className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-1 block">
                  ₹{Math.round(singleSim.currentBasic).toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {singleSim.currentBasicPct}% of CTC
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Required 50% Basic
                </span>
                <span className="text-xl font-extrabold font-mono tabular-nums text-blue-700 mt-1 block">
                  ₹{singleSim.required50PctBasic.toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] font-mono text-slate-500">Statutory Floor</span>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Simulated Basic
                </span>
                <span
                  className={`text-xl font-extrabold font-mono tabular-nums mt-1 block ${
                    singleSim.violatesMinimumWage ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  ₹{Math.round(singleSim.targetBasic).toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {singleSim.targetBasicPercentage}% Target
                </span>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Shift Allowances → Basic
                </span>
                <span className="text-xl font-extrabold font-mono tabular-nums text-amber-300 mt-1 block">
                  {singleSim.shiftAmount >= 0 ? '+' : ''}₹{Math.round(singleSim.shiftAmount).toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] font-mono text-slate-300">₹0 CTC Inflation</span>
              </div>
            </div>

            {/* Financial Impact Callout Card (AC3 exact wording) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Financial Liability &amp; Take-Home Impact
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    {singleSim.impactNarrative}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono font-bold shrink-0 ${
                    singleSim.willBeCompliant && !singleSim.violatesMinimumWage
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {singleSim.willBeCompliant && !singleSim.violatesMinimumWage
                    ? 'COMPLIANT'
                    : 'ACTION REQUIRED'}
                </span>
              </div>

              {/* Allocation Bar */}
              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between font-mono text-[11px] text-slate-600 mb-1">
                    <span>Current Split: WageBase {singleSim.currentBasicPct}% vs Allowances {(100 - singleSim.currentBasicPct).toFixed(1)}%</span>
                    <span>₹{Math.round(singleSim.totalRemuneration).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="bg-slate-500 h-full transition-all"
                      style={{ width: `${Math.min(100, singleSim.currentBasicPct)}%` }}
                    />
                    <div
                      className="bg-rose-400 h-full transition-all"
                      style={{ width: `${Math.max(0, 100 - singleSim.currentBasicPct)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-mono text-[11px] text-slate-700 mb-1">
                    <span>Proposed Split: WageBase {singleSim.targetBasicPercentage}% vs Allowances {(100 - singleSim.targetBasicPercentage).toFixed(1)}%</span>
                    <span>₹{Math.round(singleSim.totalRemuneration).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="bg-emerald-600 h-full transition-all"
                      style={{ width: `${Math.min(100, singleSim.targetBasicPercentage)}%` }}
                    />
                    <div
                      className="bg-slate-300 h-full transition-all"
                      style={{ width: `${Math.max(0, 100 - singleSim.targetBasicPercentage)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Financial Impact Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-3.5">Metric (Monthly / Annual)</th>
                      <th className="py-2.5 px-3.5 text-right">Current</th>
                      <th className="py-2.5 px-3.5 text-right">After Restructure</th>
                      <th className="py-2.5 px-3.5 text-right">Delta (Impact)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                    <tr>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-slate-700">
                        Employee EPF Deduction (12%)
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600">
                        ₹{singleSim.employeePfBefore.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900">
                        ₹{singleSim.employeePfAfter.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-slate-800">
                        {singleSim.pfEmployeeDeltaMonthly >= 0 ? '+' : '-'}₹
                        {Math.abs(singleSim.pfEmployeeDeltaMonthly).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-slate-700">
                        Employer PF Liability (12% + EDLI + Admin)
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600">
                        ₹{singleSim.employerPfBefore.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900">
                        ₹{singleSim.employerPfAfter.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-blue-700">
                        {singleSim.pfEmployerDeltaMonthly >= 0 ? '+' : '-'}₹
                        {Math.abs(singleSim.pfEmployerDeltaMonthly).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-slate-700">
                        Gratuity Accrual (15/26 × Wage Base / Yr)
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600">
                        ₹{singleSim.gratuityAnnualBefore.toLocaleString('en-IN')}/yr
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900">
                        ₹{singleSim.gratuityAnnualAfter.toLocaleString('en-IN')}/yr
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-amber-700">
                        +₹{singleSim.gratuityAnnualDelta.toLocaleString('en-IN')}/yr
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-slate-700">
                        Estimated Net Take-Home / Mo
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600">
                        ₹{singleSim.takeHomeBefore.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900">
                        ₹{singleSim.takeHomeAfter.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-slate-700">
                        {singleSim.takeHomeDeltaMonthly >= 0 ? '+' : '-'}₹
                        {Math.abs(singleSim.takeHomeDeltaMonthly).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Exact Component Shift Breakup */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Allowance Trimming Plan (Exact ₹ Reallocation)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                  {[
                    { label: 'HRA', b: singleSim.breakdownBefore.hra, a: singleSim.breakdownAfter.hra },
                    { label: 'Travel', b: singleSim.breakdownBefore.travel, a: singleSim.breakdownAfter.travel },
                    { label: 'Medical', b: singleSim.breakdownBefore.medical, a: singleSim.breakdownAfter.medical },
                    { label: 'Others', b: singleSim.breakdownBefore.others, a: singleSim.breakdownAfter.others },
                  ].map((item) => (
                    <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-2.5">
                      <span className="text-[10px] font-sans font-bold text-slate-500 block">
                        {item.label}
                      </span>
                      <span className="font-bold text-slate-900 block mt-0.5">
                        ₹{Math.round(item.b).toLocaleString('en-IN')} → ₹{Math.round(item.a).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-xs text-slate-500">
                  Ready to standardize across your non-compliant workforce?
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('BULK_APPLY')}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Go to Bulk Apply ({nonCompliantPlans.length} Workers)</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: BULK WORKFORCE RESTRUCTURING & REVISION LETTERS                */}
      {/* ===================================================================== */}
      {activeTab === 'BULK_APPLY' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Bulk Template
                </label>
                <div className="flex items-center gap-1.5">
                  {TEMPLATE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleTemplateSelect(preset.id, preset.pct)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-colors ${
                        selectedTemplateId === preset.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.pct}% Basic
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Effective Date
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-800 bg-slate-50 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Worker Scope
                </label>
                <select
                  value={bulkFilter}
                  onChange={(e) => setBulkFilter(e.target.value as 'NON_COMPLIANT' | 'ALL')}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 outline-none"
                >
                  <option value="NON_COMPLIANT">
                    Non-Compliant Only ({nonCompliantPlans.length})
                  </option>
                  <option value="ALL">All Active Workers ({allWorkerPlans.length})</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenRevisionLetters(selectedPlans)}
                disabled={selectedPlans.length === 0}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText size={14} className="text-blue-600" />
                <span>Revision Letters ({selectedPlans.length})</span>
              </button>

              <button
                type="button"
                onClick={handleApplyBulk}
                disabled={applyingBulk || bulkSummary.eligibleCount === 0 || isCbaApplyBlocked}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {isCbaApplyBlocked ? <Lock size={14} className="text-amber-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
                <span>
                  {applyingBulk
                    ? 'Applying...'
                    : `Apply to All Selected (${bulkSummary.eligibleCount})`}
                </span>
              </button>
            </div>
          </div>

          {/* Batch Financial Impact KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Eligible Selected
              </span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-1 block">
                {bulkSummary.eligibleCount}
              </span>
              <span className="text-[11px] text-slate-500">
                {bulkSummary.blockedInView} blocked by Min Wage floor
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Monthly Allowance Shifted
              </span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-blue-700 mt-1 block">
                ₹{bulkSummary.totalShiftedMonthly.toLocaleString('en-IN')}
              </span>
              <span className="text-[11px] text-slate-500">Zero Gross CTC increase</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Employer PF Delta / Mo
              </span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-1 block">
                {bulkSummary.totalEmployerPfDelta >= 0 ? '+' : '-'}₹
                {Math.abs(bulkSummary.totalEmployerPfDelta).toLocaleString('en-IN')}
              </span>
              <span className="text-[11px] text-slate-500">
                EE Delta: {bulkSummary.totalEmployeePfDelta >= 0 ? '+' : '-'}₹
                {Math.abs(bulkSummary.totalEmployeePfDelta).toLocaleString('en-IN')}/mo
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Gratuity Liability Delta / Yr
              </span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-amber-700 mt-1 block">
                +₹{bulkSummary.totalGratuityAnnualDelta.toLocaleString('en-IN')}
              </span>
              <span className="text-[11px] text-slate-500">Code on Social Security (15/26)</span>
            </div>
          </div>

          {/* Workers Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {visibleBulkPlans.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <CheckCircle2 size={28} className="text-emerald-600 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">
                  All Active Workers Are Compliant with the 50% Rule
                </h3>
                <p className="text-xs text-slate-500">
                  Switch Worker Scope to &ldquo;All Active Workers&rdquo; to simulate increasing Basic % further (e.g., 60% Basic).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 w-10">Select</th>
                      <th className="py-3 px-4">Employee &amp; State</th>
                      <th className="py-3 px-4 text-right">Monthly Eq. CTC</th>
                      <th className="py-3 px-4 text-right">Current Basic</th>
                      <th className="py-3 px-4 text-right">Target Basic ({targetBasicPct}%)</th>
                      <th className="py-3 px-4 text-right">Shift from Allow.</th>
                      <th className="py-3 px-4 text-right">ER PF / Grat Δ</th>
                      <th className="py-3 px-4 text-right">Letter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {visibleBulkPlans.map((plan) => {
                      const s = plan.simulation;
                      const isSelected = selectedWorkerIds.has(plan.workerId);
                      return (
                        <tr
                          key={plan.workerId}
                          className={!plan.canApply ? 'bg-rose-50/40' : isSelected ? 'bg-blue-50/20' : ''}
                        >
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              disabled={!plan.canApply}
                              onClick={() => handleToggleWorker(plan.workerId, plan.canApply)}
                              className="text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                              aria-label={`Select ${plan.workerName}`}
                            >
                              {isSelected && plan.canApply ? (
                                <CheckSquare size={17} className="text-blue-600" />
                              ) : (
                                <Square size={17} />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{plan.workerName}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>{plan.state}</span>
                              <span>·</span>
                              <span>{plan.wageType === 'DAILY' ? `Daily ×${plan.dailyMultiplier}` : 'Monthly'}</span>
                              <span>·</span>
                              <span className="font-mono">Min ₹{s.stateMinimumWageMonthly.toLocaleString('en-IN')}</span>
                            </div>
                            {!plan.canApply && plan.blockedReason && (
                              <div className="text-[11px] text-rose-700 font-semibold mt-1">
                                Blocked: {plan.blockedReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 font-semibold">
                            ₹{Math.round(s.totalRemuneration).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span className="text-slate-900 font-semibold">
                              ₹{Math.round(s.breakdownBefore.basic).toLocaleString('en-IN')}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {s.currentBasicPct}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span
                              className={`font-bold ${
                                plan.canApply ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              ₹{Math.round(s.breakdownAfter.basic).toLocaleString('en-IN')}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {s.targetBasicPercentage}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-blue-700">
                            {s.shiftAmount >= 0 ? '+' : ''}₹{Math.round(s.shiftAmount).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span className="block text-slate-800 font-semibold">
                              PF {s.pfEmployerDeltaMonthly >= 0 ? '+' : '-'}₹
                              {Math.abs(s.pfEmployerDeltaMonthly).toLocaleString('en-IN')}/mo
                            </span>
                            <span className="block text-[10px] text-amber-700">
                              Grat +₹{s.gratuityAnnualDelta.toLocaleString('en-IN')}/yr
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenRevisionLetters([plan], plan.workerId)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileText size={12} className="text-blue-600" />
                              <span>Letter</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: EMPLOYEE CONSENT (WHATSAPP LINKS) & AUDIT LOG HISTORY          */}
      {/* ===================================================================== */}
      {activeTab === 'CONSENT_AUDIT' && (
        <div className="space-y-6">
          {/* Consent Tracking Table (Edge Case 3) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Employee Notification &amp; Consent Tracker (WhatsApp)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Send scoped WhatsApp acknowledgement links and track employee sign-off timestamps.
                </p>
              </div>
              {consentRecords.some((r) => r.status === 'NOT_SENT') && (
                <button
                  type="button"
                  disabled={sendingAllConsents}
                  onClick={handleSendAllPendingWhatsApp}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Send size={13} />
                  <span>
                    {sendingAllConsents
                      ? 'Generating Links...'
                      : `Send Pending WhatsApp Links (${consentRecords.filter((r) => r.status === 'NOT_SENT').length})`}
                  </span>
                </button>
              )}
            </div>

            {consentRecords.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No salary restructuring events recorded yet. Apply a template from the Bulk Restructure tab to start tracking employee acknowledgements.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Template &amp; Effective</th>
                      <th className="py-3 px-4 text-right">Basic Shift</th>
                      <th className="py-3 px-4">Consent Status</th>
                      <th className="py-3 px-4 text-right">WhatsApp Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {consentRecords.map((rec) => (
                      <tr key={rec.id}>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{rec.workerName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {rec.workerPhone || 'No mobile on file'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{rec.templateLabel}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Eff. {rec.effectiveDate}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <span className="text-slate-600">
                            ₹{rec.oldBasic.toLocaleString('en-IN')}
                          </span>{' '}
                          →{' '}
                          <strong className="text-emerald-700">
                            ₹{rec.newBasic.toLocaleString('en-IN')}
                          </strong>
                        </td>
                        <td className="py-3 px-4">
                          {rec.status === 'ACKNOWLEDGED' ? (
                            <div>
                              <span className="text-xs font-bold text-emerald-700">
                                Acknowledged
                              </span>
                              {rec.acknowledgedAt && (
                                <span className="block text-[10px] font-mono text-slate-500">
                                  {new Date(rec.acknowledgedAt).toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          ) : rec.status === 'DISPUTED' ? (
                            <div>
                              <span className="text-xs font-bold text-amber-700">
                                Clarification Requested
                              </span>
                              {rec.workerNote && (
                                <span className="block text-[10px] text-slate-500">
                                  {rec.workerNote}
                                </span>
                              )}
                            </div>
                          ) : rec.status === 'SENT_WHATSAPP' ? (
                            <div>
                              <span className="text-xs font-bold text-blue-700">
                                Sent via WhatsApp
                              </span>
                              {rec.sentAt && (
                                <span className="block text-[10px] font-mono text-slate-500">
                                  {new Date(rec.sentAt).toLocaleTimeString('en-IN')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">
                              Not Sent Yet
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                            {rec.status === 'NOT_SENT' ? (
                              <button
                                type="button"
                                disabled={sendingConsentId === rec.id}
                                onClick={() => handleSendWhatsAppConsent(rec)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <MessageSquare size={12} />
                                <span>Send WhatsApp Link</span>
                              </button>
                            ) : (
                              <>
                                {rec.whatsappUrl && (
                                  <a
                                    href={rec.whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-xs font-bold inline-flex items-center gap-1"
                                  >
                                    <ExternalLink size={12} />
                                    <span>WhatsApp</span>
                                  </a>
                                )}
                                {rec.portalUrl && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(rec.portalUrl!);
                                          toast.success('Acknowledgement link copied.');
                                        } catch {
                                          toast.info(rec.portalUrl!);
                                        }
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Copy size={12} />
                                      <span>Copy Link</span>
                                    </button>
                                    <a
                                      href={rec.portalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1"
                                    >
                                      <span>Open Consent Portal</span>
                                    </a>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bulk Restructure Audit Log History */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-2">
              <History size={16} className="text-slate-600" />
              <h2 className="text-sm font-bold text-slate-900">
                CTC Restructuring Audit Logs
              </h2>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No bulk restructuring batches logged yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {log.templateLabel} · {log.workersUpdatedCount} Worker(s) Restructured
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>Executed by {log.executedBy}</span>
                        <span>·</span>
                        <span className="font-mono">{new Date(log.executedAt).toLocaleString('en-IN')}</span>
                        <span>·</span>
                        <span>Eff. {log.effectiveDate}</span>
                        {log.cbaOverrideRef && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-amber-800 font-semibold">
                              CBA Ref: {log.cbaOverrideRef}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-right">
                      <span className="font-bold text-slate-900 block">
                        Shifted ₹{log.totalShiftedMonthly.toLocaleString('en-IN')}/mo
                      </span>
                      <span className="text-[11px] text-slate-500">
                        PF {log.totalEmployerPfDeltaMonthly >= 0 ? '+' : '-'}₹
                        {Math.abs(log.totalEmployerPfDeltaMonthly).toLocaleString('en-IN')}/mo · Grat +₹
                        {log.totalGratuityDeltaAnnual.toLocaleString('en-IN')}/yr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revision Letter Generator Modal */}
      <SalaryRevisionLetterModal
        isOpen={letterModalOpen}
        onClose={() => setLetterModalOpen(false)}
        companyName={companyName}
        plans={letterPlans}
        initialWorkerId={letterInitialWorkerId}
        effectiveDate={effectiveDate}
        templateLabel={templateDisplayLabel}
        cbaOverrideRef={cbaSettlementRef.trim() || undefined}
      />
    </div>
  );
};
