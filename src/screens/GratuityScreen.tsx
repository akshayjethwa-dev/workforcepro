// src/screens/GratuityScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  Calculator,
  CheckCircle2,
  FileText,
  History,
  IndianRupee,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { magicLinkService } from '../services/magicLinkService';
import {
  GRATUITY_STATUTORY_CEILING,
  buildFnfSettlementPreview,
  calculateWorkerGratuity,
  getFnfSettlements,
  projectOrganizationGratuityLiability,
  saveFnfSettlement,
  updateFnfSettlementStatus,
} from '../services/gratuityService';
import {
  Advance,
  AttendanceRecord,
  FnfSettlementRecord,
  GratuityExitReason,
  MonthlyPayroll,
  OrgSettings,
  ScreenName,
  Worker,
} from '../types/index';
import { Payslip } from '../components/Payslip';

interface Props {
  onNavigate?: (screen: ScreenName) => void;
}

type GratuityTab = 'LEDGER' | 'CALCULATOR' | 'FNF';
type LedgerFilter = 'ALL' | 'ELIGIBLE' | 'UNVESTED' | 'FIXED_TERM' | 'SUBSIDIARY' | 'EXITED';

const formatInr = (val: number): string =>
  `₹${Math.round(Number.isFinite(val) ? val : 0).toLocaleString('en-IN')}`;

const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const GratuityScreen: React.FC<Props> = ({ onNavigate }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const tenantId = profile?.tenantId || 'demo-tenant-id';
  const actorEmail = profile?.email || 'admin@workforcepro.in';

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [fnfHistory, setFnfHistory] = useState<FnfSettlementRecord[]>([]);

  const [activeTab, setActiveTab] = useState<GratuityTab>('LEDGER');
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('ALL');

  // Tab 2: Interactive What-If Calculator state
  const [calcWorkerId, setCalcWorkerId] = useState<string>('CUSTOM');
  const [calcName, setCalcName] = useState('Vikram Desai');
  const [calcBasic, setCalcBasic] = useState<string>('18000');
  const [calcDa, setCalcDa] = useState<string>('2800');
  const [calcPreRevBasicDa, setCalcPreRevBasicDa] = useState<string>('13600');
  const [calcJoinDate, setCalcJoinDate] = useState<string>('2019-06-15');
  const [calcExitDate, setCalcExitDate] = useState<string>(todayIso());
  const [calcEmploymentType, setCalcEmploymentType] = useState<'PERMANENT' | 'FIXED_TERM'>('PERMANENT');
  const [calcSubTransfer, setCalcSubTransfer] = useState<boolean>(false);
  const [calcSubName, setCalcSubName] = useState<string>('Apex Precision Components Pvt Ltd');
  const [calcSubJoinDate, setCalcSubJoinDate] = useState<string>('2017-01-10');
  const [calcSubNoBreak, setCalcSubNoBreak] = useState<boolean>(true);
  const [calcDeathInService, setCalcDeathInService] = useState<boolean>(false);
  const [calcNomineeName, setCalcNomineeName] = useState<string>('Meera Desai');
  const [calcNomineeRelation, setCalcNomineeRelation] = useState<string>('Spouse');

  // Tab 3: FnF Settlement Trigger state
  const [fnfWorkerId, setFnfWorkerId] = useState<string>('');
  const [fnfExitDate, setFnfExitDate] = useState<string>(todayIso());
  const [fnfExitReason, setFnfExitReason] = useState<GratuityExitReason>('RESIGNATION');
  const [fnfDeathOverride, setFnfDeathOverride] = useState<boolean>(false);
  const [fnfNomineeName, setFnfNomineeName] = useState<string>('');
  const [fnfNomineeRelation, setFnfNomineeRelation] = useState<string>('Spouse');
  const [fnfLeaveDays, setFnfLeaveDays] = useState<string>('4');
  const [fnfNotes, setFnfNotes] = useState<string>('');
  const [isSavingFnf, setIsSavingFnf] = useState<boolean>(false);
  const [fnfPayslipPreview, setFnfPayslipPreview] = useState<MonthlyPayroll | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wList, settings, att, adv, savedFnf] = await Promise.all([
        dbService.getWorkers(tenantId),
        dbService.getOrgSettings(tenantId),
        dbService.getAttendanceHistory(tenantId),
        dbService.getAdvances(tenantId),
        getFnfSettlements(tenantId),
      ]);
      setWorkers(wList);
      setOrgSettings(settings);
      setAttendanceRecords(att);
      setAdvances(adv);
      setFnfHistory(savedFnf);

      const preselectedId =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('gratuity_fnf_worker_id')
          : null;

      if (preselectedId) {
        sessionStorage.removeItem('gratuity_fnf_worker_id');
        const target = wList.find((w) => w.id === preselectedId);
        if (target) {
          selectWorkerForFnf(target);
          setActiveTab('FNF');
        }
      } else if (!fnfWorkerId && wList.length > 0) {
        const preferred =
          wList.find((w) => w.id === 'worker-6') ||
          wList.find((w) => w.status === 'ACTIVE') ||
          wList[0];
        selectWorkerForFnf(preferred);
      }
    } catch (err) {
      console.error('Failed to load gratuity workspace data:', err);
      toast.error('Failed to load employee gratuity records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const selectWorkerForFnf = (w: Worker) => {
    setFnfWorkerId(w.id);
    setFnfExitDate(w.dateOfExit || todayIso());
    setFnfExitReason(w.exitReason || 'RESIGNATION');
    setFnfDeathOverride(Boolean(w.deathInService || w.exitReason === 'DEATH_IN_SERVICE'));
    setFnfNomineeName(w.nomineeName || '');
    setFnfNomineeRelation(w.nomineeRelation || 'Spouse');
  };

  const selectWorkerForCalculator = (workerId: string) => {
    setCalcWorkerId(workerId);
    if (workerId === 'CUSTOM') return;
    const w = workers.find((item) => item.id === workerId);
    if (!w) return;
    const baseCalc = calculateWorkerGratuity(w, {
      asOfDate: calcExitDate,
      orgSettings: orgSettings || undefined,
    });
    setCalcName(w.name);
    setCalcBasic(String(Math.round(baseCalc.lastDrawnBasic)));
    setCalcDa(String(Math.round(baseCalc.lastDrawnDa)));
    setCalcPreRevBasicDa(
      baseCalc.previousPreRevisionBasicPlusDa
        ? String(Math.round(baseCalc.previousPreRevisionBasicPlusDa))
        : ''
    );
    setCalcJoinDate(baseCalc.tenure.entityStartDate);
    setCalcExitDate(w.dateOfExit || todayIso());
    setCalcEmploymentType(w.employmentType === 'FIXED_TERM' ? 'FIXED_TERM' : 'PERMANENT');
    setCalcSubTransfer(Boolean(w.subsidiaryTransfer?.transferredFromSubsidiary));
    setCalcSubName(w.subsidiaryTransfer?.subsidiaryName || 'Subsidiary Entity Pvt Ltd');
    setCalcSubJoinDate(w.subsidiaryTransfer?.previousJoiningDate || '2020-02-01');
    setCalcSubNoBreak(w.subsidiaryTransfer?.noBreakInService ?? true);
    setCalcDeathInService(Boolean(w.deathInService || w.exitReason === 'DEATH_IN_SERVICE'));
    setCalcNomineeName(w.nomineeName || '');
    setCalcNomineeRelation(w.nomineeRelation || 'Spouse');
  };

  const orgProjection = useMemo(
    () => projectOrganizationGratuityLiability(workers, orgSettings || undefined, asOfDate),
    [workers, orgSettings, asOfDate]
  );

  const filteredLedger = useMemo(() => {
    return orgProjection.breakdowns.filter((b) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.workerName.toLowerCase().includes(q) ||
        b.designation.toLowerCase().includes(q) ||
        b.department.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (ledgerFilter === 'ELIGIBLE') return b.isEligible;
      if (ledgerFilter === 'UNVESTED') return !b.isEligible;
      if (ledgerFilter === 'FIXED_TERM') return b.employmentType === 'FIXED_TERM';
      if (ledgerFilter === 'SUBSIDIARY') return b.tenure.continuousServiceAggregated || b.tenure.breakInServiceDetected;
      if (ledgerFilter === 'EXITED') return Boolean(b.dateOfExit);
      return true;
    });
  }, [orgProjection.breakdowns, searchTerm, ledgerFilter]);

  // Live Tab 2 Calculator Result
  const calcPreview = useMemo(() => {
    const basicNum = Math.max(0, Number(calcBasic) || 0);
    const daNum = Math.max(0, Number(calcDa) || 0);
    const preRevNum = Math.max(0, Number(calcPreRevBasicDa) || 0);

    const syntheticWorker: Worker = {
      id: calcWorkerId === 'CUSTOM' ? 'custom-sim' : calcWorkerId,
      tenantId,
      name: calcName || 'Simulated Employee',
      phone: '9999999999',
      dob: '1990-01-01',
      gender: 'Male',
      category: calcEmploymentType === 'FIXED_TERM' ? 'Contract' : 'Permanent',
      employmentType: calcEmploymentType,
      department: 'Simulation',
      designation: 'Employee',
      joinedDate: calcJoinDate || todayIso(),
      shiftId: 'default',
      status: 'ACTIVE',
      deathInService: calcDeathInService,
      exitReason: calcDeathInService ? 'DEATH_IN_SERVICE' : 'RESIGNATION',
      nomineeName: calcNomineeName,
      nomineeRelation: calcNomineeRelation,
      subsidiaryTransfer: calcSubTransfer
        ? {
            transferredFromSubsidiary: true,
            subsidiaryName: calcSubName,
            previousJoiningDate: calcSubJoinDate,
            transferDate: calcJoinDate,
            noBreakInService: calcSubNoBreak,
          }
        : undefined,
      previousWageConfig:
        preRevNum > 0
          ? {
              type: 'MONTHLY',
              amount: preRevNum * 2,
              monthlyBreakdown: {
                basic: preRevNum,
                da: 0,
                retainingAllowance: 0,
                hra: preRevNum,
                travel: 0,
                medical: 0,
                others: 0,
              },
              overtimeEligible: false,
              allowances: { travel: 0, food: 0, nightShift: 0 },
            }
          : undefined,
      wageConfig: {
        type: 'MONTHLY',
        amount: (basicNum + daNum) * 2,
        monthlyBreakdown: {
          basic: basicNum,
          da: daNum,
          retainingAllowance: 0,
          hra: basicNum + daNum,
          travel: 0,
          medical: 0,
          others: 0,
        },
        overtimeEligible: false,
        allowances: { travel: 0, food: 0, nightShift: 0 },
      },
    };

    return calculateWorkerGratuity(syntheticWorker, {
      asOfDate: calcExitDate || todayIso(),
      exitDateOverride: calcExitDate || todayIso(),
      deathInServiceOverride: calcDeathInService,
      employmentTypeOverride: calcEmploymentType,
      orgSettings: orgSettings || undefined,
    });
  }, [
    calcWorkerId,
    tenantId,
    calcName,
    calcBasic,
    calcDa,
    calcPreRevBasicDa,
    calcJoinDate,
    calcExitDate,
    calcEmploymentType,
    calcSubTransfer,
    calcSubName,
    calcSubJoinDate,
    calcSubNoBreak,
    calcDeathInService,
    calcNomineeName,
    calcNomineeRelation,
    orgSettings,
  ]);

  // Live Tab 3 FnF Settlement Preview
  const fnfSelectedWorker = useMemo(
    () => workers.find((w) => w.id === fnfWorkerId) || null,
    [workers, fnfWorkerId]
  );

  const fnfExitPayroll = useMemo(() => {
    if (!fnfSelectedWorker || !orgSettings || !fnfExitDate) return undefined;
    const exitMonth = fnfExitDate.slice(0, 7);
    const workerForRun: Worker = {
      ...fnfSelectedWorker,
      dateOfExit: fnfExitDate,
      exitReason: fnfExitReason,
      deathInService: fnfDeathOverride || fnfExitReason === 'DEATH_IN_SERVICE',
      nomineeName: fnfNomineeName || fnfSelectedWorker.nomineeName,
      nomineeRelation: fnfNomineeRelation || fnfSelectedWorker.nomineeRelation,
    };
    return wageService.generateMonthlyPayroll(
      workerForRun,
      exitMonth,
      attendanceRecords,
      advances,
      orgSettings
    );
  }, [
    fnfSelectedWorker,
    orgSettings,
    fnfExitDate,
    fnfExitReason,
    fnfDeathOverride,
    fnfNomineeName,
    fnfNomineeRelation,
    attendanceRecords,
    advances,
  ]);

  const fnfPreview = useMemo(() => {
    if (!fnfSelectedWorker || !fnfExitDate) return null;
    const workerForFnf: Worker = {
      ...fnfSelectedWorker,
      dateOfExit: fnfExitDate,
      exitReason: fnfExitReason,
      deathInService: fnfDeathOverride || fnfExitReason === 'DEATH_IN_SERVICE',
      nomineeName: fnfNomineeName || fnfSelectedWorker.nomineeName,
      nomineeRelation: fnfNomineeRelation || fnfSelectedWorker.nomineeRelation,
    };
    return buildFnfSettlementPreview({
      tenantId,
      worker: workerForFnf,
      exitDate: fnfExitDate,
      exitReason: fnfExitReason,
      deathInService: fnfDeathOverride || fnfExitReason === 'DEATH_IN_SERVICE',
      nomineeName: fnfNomineeName || fnfSelectedWorker.nomineeName,
      nomineeRelation: fnfNomineeRelation || fnfSelectedWorker.nomineeRelation,
      leaveEncashmentDays: Number(fnfLeaveDays || 0),
      monthlyPayrollForExitMonth: fnfExitPayroll,
      attendanceRecords,
      advances,
      orgSettings: orgSettings || undefined,
      notes: fnfNotes,
    });
  }, [
    fnfSelectedWorker,
    tenantId,
    fnfExitDate,
    fnfExitReason,
    fnfDeathOverride,
    fnfNomineeName,
    fnfNomineeRelation,
    fnfLeaveDays,
    fnfExitPayroll,
    attendanceRecords,
    advances,
    orgSettings,
    fnfNotes,
  ]);

  const handleSaveOrFinalizeFnf = async (finalizeExit: boolean) => {
    if (!fnfPreview || !fnfSelectedWorker) return;
    setIsSavingFnf(true);
    try {
      const recordToSave: FnfSettlementRecord = {
        ...fnfPreview,
        status: finalizeExit ? 'APPROVED' : 'DRAFT',
      };
      await saveFnfSettlement(recordToSave, actorEmail);

      if (finalizeExit) {
        const exitUpdates: Partial<Worker> = {
          dateOfExit: fnfPreview.exitDate,
          exitReason: fnfPreview.exitReason,
          deathInService: fnfPreview.deathInService,
          nomineeName: fnfPreview.nomineeName,
          nomineeRelation: fnfPreview.nomineeRelation,
          status: 'INACTIVE',
          isActive: false,
        };
        await dbService.updateWorker(fnfSelectedWorker.id, exitUpdates);
        await magicLinkService.revokeAllForWorker(
          fnfSelectedWorker.id,
          tenantId,
          actorEmail,
          'worker exit'
        );
        setWorkers((prev) =>
          prev.map((w) => (w.id === fnfSelectedWorker.id ? { ...w, ...exitUpdates } : w))
        );
      }

      const refreshed = await getFnfSettlements(tenantId);
      setFnfHistory(refreshed);
      toast.success(
        finalizeExit
          ? `FnF Settlement approved for ${fnfSelectedWorker.name} (Gratuity ${formatInr(fnfPreview.gratuityPayable)}). Worker exited & access revoked.`
          : `FnF Settlement draft saved for ${fnfSelectedWorker.name}.`
      );
    } catch (err) {
      console.error('Failed to save FnF settlement:', err);
      toast.error('Failed to save Full & Final settlement.');
    } finally {
      setIsSavingFnf(false);
    }
  };

  const handleOpenFnfPayslip = () => {
    if (!fnfPreview || !fnfSelectedWorker || !orgSettings) return;
    const basePayroll =
      fnfExitPayroll ||
      wageService.generateMonthlyPayroll(
        {
          ...fnfSelectedWorker,
          dateOfExit: fnfPreview.exitDate,
          exitReason: fnfPreview.exitReason,
          deathInService: fnfPreview.deathInService,
          nomineeName: fnfPreview.nomineeName,
          nomineeRelation: fnfPreview.nomineeRelation,
        },
        fnfPreview.exitDate.slice(0, 7),
        attendanceRecords,
        advances,
        orgSettings
      );

    const regularNet = Math.max(0, basePayroll.netPayable - (basePayroll.gratuitySettlement || 0));
    const enrichedPayroll: MonthlyPayroll = {
      ...basePayroll,
      gratuitySettlement: fnfPreview.gratuityPayable,
      netPayable: regularNet + fnfPreview.gratuityPayable + fnfPreview.leaveEncashmentAmount,
      fnfSummary: {
        isFnF: true,
        exitDate: fnfPreview.exitDate,
        exitReason: fnfPreview.exitReason,
        deathInService: fnfPreview.deathInService,
        gratuityPayable: fnfPreview.gratuityPayable,
        roundedYears: fnfPreview.gratuityCalculation.effectiveYearsForFormula,
        lastDrawnBasicPlusDa: fnfPreview.gratuityCalculation.lastDrawnBasicPlusDa,
        nomineeName: fnfPreview.nomineeName,
        nomineeRelation: fnfPreview.nomineeRelation,
        ceilingApplied: fnfPreview.gratuityCalculation.ceilingApplied,
        fnfRecordId: fnfPreview.id,
      },
    };
    setFnfPayslipPreview(enrichedPayroll);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Gratuity Accrual &amp; FnF Settlement
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Statutory formula <span className="font-mono text-slate-700">(Last Basic + DA) × 15 / 26 × Rounded Years</span> · ₹20,00,000 ceiling · Nov 2025 Fixed-Term 1-Year rule
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Valuation Date</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="text-xs font-mono font-semibold text-slate-900 outline-none bg-transparent"
            />
          </div>
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            title="Recalculate liability"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>
      </div>

      {/* KPI PROJECTION STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vested Payable Liability
            </span>
            <IndianRupee size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
            {formatInr(orgProjection.vestedPayableLiability)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {orgProjection.eligibleEmployeesCount} eligible · capped at ₹20L
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Accrued Provision
            </span>
            <Building2 size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
            {formatInr(orgProjection.totalProvisionalAccruedLiability)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Unvested reserve: {formatInr(orgProjection.unvestedAccruedReserve)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Eligible Headcount
            </span>
            <UserCheck size={16} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
            {orgProjection.eligibleEmployeesCount} / {orgProjection.totalWorkersAnalyzed}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {orgProjection.standardFiveYearEligibleCount} Std 5Y · {orgProjection.fixedTermOneYearEligibleCount} FTE 1Y
            {orgProjection.deathInServiceCount > 0 ? ` · ${orgProjection.deathInServiceCount} Nominee` : ''}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Cash-Flow Run-Rate
            </span>
            <Award size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
            {formatInr(orgProjection.monthlyAccrualRunRate)}<span className="text-xs font-normal text-slate-500">/mo</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {formatInr(orgProjection.annualAccrualRunRate)} / year accrued
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('LEDGER')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'LEDGER'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck size={15} />
          <span>Organization Gratuity Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CALCULATOR')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'CALCULATOR'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calculator size={15} />
          <span>Gratuity &amp; What-If Calculator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('FNF')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'FNF'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileText size={15} />
          <span>FnF Settlement Trigger &amp; History ({fnfHistory.length})</span>
        </button>
      </div>

      {/* TAB 1: ORGANIZATION GRATUITY LEDGER */}
      {activeTab === 'LEDGER' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employee, role, department..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-blue-600"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All Staff' },
                  { id: 'ELIGIBLE', label: 'Eligible / Vested' },
                  { id: 'UNVESTED', label: 'Accruing (<5Y)' },
                  { id: 'FIXED_TERM', label: 'Fixed-Term (1Y)' },
                  { id: 'SUBSIDIARY', label: 'Subsidiary Transfer' },
                  { id: 'EXITED', label: 'Exited' },
                ] as { id: LedgerFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLedgerFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    ledgerFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 font-semibold">Employee</th>
                  <th className="py-3 px-4 font-semibold">Service &amp; Round-Up</th>
                  <th className="py-3 px-4 font-semibold text-right">Last Basic + DA</th>
                  <th className="py-3 px-4 font-semibold">Eligibility Rule</th>
                  <th className="py-3 px-4 font-semibold text-right">Provisional Reserve</th>
                  <th className="py-3 px-4 font-semibold text-right">Vested Payable</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLedger.map((row) => {
                  const workerObj = workers.find((w) => w.id === row.workerId);
                  return (
                    <tr key={row.workerId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{row.workerName}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.designation} · {row.department}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {row.employmentType === 'FIXED_TERM' ? 'Fixed-Term (1Y Rule)' : 'Permanent (5Y Rule)'}
                          {row.nomineeName ? ` · Nominee: ${row.nomineeName}` : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">
                          {row.tenure.formattedTenure} →{' '}
                          <span className="text-blue-700">{row.effectiveYearsForFormula} yrs</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Start: {row.tenure.effectiveStartDate}
                          {row.tenure.exceedsSixMonthsInFinalYear && ' · >6m rounded up'}
                        </div>
                        {row.tenure.continuousServiceAggregated && (
                          <div className="text-[10px] text-indigo-700 font-sans font-semibold mt-0.5">
                            Aggregated Subsidiary Tenure ({row.tenure.subsidiaryName || 'Prior Entity'})
                          </div>
                        )}
                        {row.tenure.breakInServiceDetected && (
                          <div className="text-[10px] text-amber-700 font-sans font-semibold mt-0.5">
                            Transfer break detected (prior excluded)
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">{formatInr(row.lastDrawnBasicPlusDa)}</div>
                        <div className="text-[10px] text-slate-500">
                          Basic {formatInr(row.lastDrawnBasic)}
                          {row.lastDrawnDa > 0 ? ` + DA ${formatInr(row.lastDrawnDa)}` : ''}
                        </div>
                        {row.previousPreRevisionBasicPlusDa && (
                          <div className="text-[10px] text-emerald-700">
                            Revised from {formatInr(row.previousPreRevisionBasicPlusDa)}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {row.eligibilityRule === 'DEATH_IN_SERVICE_OVERRIDE' && (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-mono font-bold text-[10px]">
                            DEATH_IN_SERVICE
                          </span>
                        )}
                        {row.eligibilityRule === 'ONE_YEAR_FIXED_TERM_NOV_2025' && (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-semibold text-[10px]">
                            Fixed-Term 1Y (Nov 2025)
                          </span>
                        )}
                        {row.eligibilityRule === 'FIVE_YEAR_STANDARD' && (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                            Vested (5+ Years)
                          </span>
                        )}
                        {row.eligibilityRule === 'NOT_ELIGIBLE' && (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-[10px]">
                            Not Yet Vested
                          </span>
                        )}
                        <div className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
                          {row.eligibilityNote}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatInr(row.provisionalAccruedAmount)}
                        <div className="text-[10px] text-slate-400">
                          +{formatInr(row.monthlyAccrualIncrement)}/mo
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div
                          className={`font-extrabold text-sm ${
                            row.payableGratuityAmount > 0 ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {formatInr(row.payableGratuityAmount)}
                        </div>
                        {row.ceilingApplied && (
                          <div className="text-[10px] text-amber-700 font-semibold">
                            Capped at ₹20L (-{formatInr(row.cappedExcessAmount)})
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              selectWorkerForCalculator(row.workerId);
                              setActiveTab('CALCULATOR');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer"
                          >
                            Simulate
                          </button>
                          {workerObj && (
                            <button
                              type="button"
                              onClick={() => {
                                selectWorkerForFnf(workerObj);
                                setActiveTab('FNF');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] cursor-pointer"
                            >
                              Trigger FnF
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredLedger.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No workers match the active filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE WHAT-IF CALCULATOR */}
      {activeTab === 'CALCULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Gratuity Scenario Inputs</h2>
                <p className="text-[11px] text-slate-500">
                  Load an employee or test custom Basic + DA, fixed-term rules, subsidiary transfers &amp; death-in-service overrides.
                </p>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Load Employee Profile (or Custom Scenario)
              </label>
              <select
                value={calcWorkerId}
                onChange={(e) => selectWorkerForCalculator(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="CUSTOM">Custom What-If Employee</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.designation})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Last Drawn Basic (₹/mo)
                </label>
                <input
                  type="number"
                  value={calcBasic}
                  onChange={(e) => setCalcBasic(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Dearness Allowance — DA (₹/mo)
                </label>
                <input
                  type="number"
                  value={calcDa}
                  onChange={(e) => setCalcDa(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Joining Date (Current Entity)
                </label>
                <input
                  type="date"
                  value={calcJoinDate}
                  onChange={(e) => setCalcJoinDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Exit / Valuation Date
                </label>
                <input
                  type="date"
                  value={calcExitDate}
                  onChange={(e) => setCalcExitDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Employment Contract Type
                </label>
                <select
                  value={calcEmploymentType}
                  onChange={(e) =>
                    setCalcEmploymentType(e.target.value as 'PERMANENT' | 'FIXED_TERM')
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="PERMANENT">Permanent (5-Year Continuous Service)</option>
                  <option value="FIXED_TERM">Fixed-Term Hire (1-Year Nov 2025 Code)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Pre-Revision Basic + DA (Audit Comparison)
                </label>
                <input
                  type="number"
                  value={calcPreRevBasicDa}
                  onChange={(e) => setCalcPreRevBasicDa(e.target.value)}
                  placeholder="Optional prior rate"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Subsidiary Transfer Aggregation */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Transfer from Subsidiary Entity
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Aggregate prior subsidiary tenure when transferred without a break in service.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={calcSubTransfer}
                  onChange={(e) => setCalcSubTransfer(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
              </label>

              {calcSubTransfer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Subsidiary Name
                    </label>
                    <input
                      type="text"
                      value={calcSubName}
                      onChange={(e) => setCalcSubName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Original Subsidiary Joining Date
                    </label>
                    <input
                      type="date"
                      value={calcSubJoinDate}
                      onChange={(e) => setCalcSubJoinDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calcSubNoBreak}
                      onChange={(e) => setCalcSubNoBreak(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span>Continuous transfer without break in service</span>
                  </label>
                </div>
              )}
            </div>

            {/* DEATH_IN_SERVICE Override Flag */}
            <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-rose-950 block">
                    DEATH_IN_SERVICE Statutory Override Flag
                  </span>
                  <span className="text-[11px] text-rose-800">
                    Waives 5-year / 1-year minimum service requirement; payable directly to nominee.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={calcDeathInService}
                  onChange={(e) => setCalcDeathInService(e.target.checked)}
                  className="w-4 h-4 accent-rose-600"
                />
              </label>

              {calcDeathInService && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-rose-200">
                  <div>
                    <label className="text-[10px] font-semibold text-rose-900 block mb-1">
                      Nominee Name
                    </label>
                    <input
                      type="text"
                      value={calcNomineeName}
                      onChange={(e) => setCalcNomineeName(e.target.value)}
                      placeholder="Full name"
                      className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-rose-900 block mb-1">
                      Relationship
                    </label>
                    <input
                      type="text"
                      value={calcNomineeRelation}
                      onChange={(e) => setCalcNomineeRelation(e.target.value)}
                      placeholder="Spouse / Child / Parent"
                      className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT RESULT PANEL */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-slate-900 text-white rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Payable Gratuity (Capped at ₹20,00,000)
                  </div>
                  <div className="text-3xl font-extrabold font-mono tabular-nums mt-1">
                    {formatInr(calcPreview.payableGratuityAmount)}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                    calcPreview.isEligible
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {calcPreview.isEligible ? 'ELIGIBLE FOR PAYOUT' : 'NOT YET ELIGIBLE'}
                </span>
              </div>

              <div className="p-3 bg-slate-800/80 rounded-lg font-mono text-xs text-slate-200">
                {calcPreview.formulaText}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{calcPreview.eligibilityNote}</p>

              {calcPreview.ceilingApplied && (
                <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-400/30 text-xs text-amber-200">
                  Statutory ₹20,00,000 ceiling enforced. Uncapped formula value was{' '}
                  <span className="font-mono font-bold">{formatInr(calcPreview.rawFormulaAmount)}</span> (excess clipped:{' '}
                  <span className="font-mono font-bold">{formatInr(calcPreview.cappedExcessAmount)}</span>).
                </div>
              )}

              {calcPreview.deathInService && (
                <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-xs text-rose-100">
                  Payable to Nominee:{' '}
                  <strong>{calcPreview.nomineeName || 'Designated Nominee'}</strong> (
                  {calcPreview.nomineeRelation || 'Nominee'}) under{' '}
                  <span className="font-mono">DEATH_IN_SERVICE</span> override.
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-bold text-slate-900">Statutory Calculation Breakdown</h3>
              <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-sans">Continuous Service</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {calcPreview.tenure.formattedTenure}
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                    {calcPreview.tenure.exceedsSixMonthsInFinalYear
                      ? `Final year >6m → rounded to ${calcPreview.tenure.roundedServiceYears} yrs`
                      : `Rounded service: ${calcPreview.tenure.roundedServiceYears} yrs`}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-sans">Last Drawn Basic + DA</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {formatInr(calcPreview.lastDrawnBasicPlusDa)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                    Last drawn rate used (not historical average)
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-sans">Pro-Rata Accrued Reserve</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {formatInr(calcPreview.provisionalAccruedAmount)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                    +{formatInr(calcPreview.monthlyAccrualIncrement)}/mo accrual
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-sans">Statutory Ceiling Cap</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {formatInr(GRATUITY_STATUTORY_CEILING)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                    Uncapped: {formatInr(calcPreview.rawFormulaAmount)}
                  </div>
                </div>
              </div>

              {calcPreview.historicalAverageBasicPlusDa && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-950">
                  <strong>Salary Revision Rule Verified:</strong> Using last drawn Basic + DA (
                  <span className="font-mono font-bold">{formatInr(calcPreview.lastDrawnBasicPlusDa)}</span>) rather than historical pre/post average (
                  <span className="font-mono">{formatInr(calcPreview.historicalAverageBasicPlusDa)}</span>).
                </div>
              )}

              {calcPreview.tenure.breakInServiceDetected && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                  {calcPreview.tenure.breakInServiceNote}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FNF SETTLEMENT TRIGGER & HISTORY */}
      {activeTab === 'FNF' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT: FNF INPUT FORM */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Full &amp; Final (FnF) Exit Trigger</h2>
                <p className="text-[11px] text-slate-500">
                  Calculates final month wages, leave encashment, gratuity settlement, and EWA/advance recoveries.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Exiting Employee
                </label>
                <select
                  value={fnfWorkerId}
                  onChange={(e) => {
                    const target = workers.find((w) => w.id === e.target.value);
                    if (target) selectWorkerForFnf(target);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} — {w.designation} ({w.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Last Working / Exit Date
                  </label>
                  <input
                    type="date"
                    value={fnfExitDate}
                    onChange={(e) => setFnfExitDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Exit Reason
                  </label>
                  <select
                    value={fnfExitReason}
                    onChange={(e) => {
                      const val = e.target.value as GratuityExitReason;
                      setFnfExitReason(val);
                      if (val === 'DEATH_IN_SERVICE') setFnfDeathOverride(true);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                  >
                    <option value="RESIGNATION">Resignation</option>
                    <option value="RETIREMENT">Retirement</option>
                    <option value="END_OF_CONTRACT">End of Fixed-Term Contract</option>
                    <option value="TERMINATION">Termination</option>
                    <option value="DEATH_IN_SERVICE">Death in Service (Nominee Override)</option>
                    <option value="PERMANENT_DISABLEMENT">Permanent Disablement</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Leave Encashment (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={fnfLeaveDays}
                    onChange={(e) => setFnfLeaveDays(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex items-end">
                  <label className="w-full flex items-center gap-2 p-2 rounded-lg border border-rose-200 bg-rose-50/70 text-xs font-semibold text-rose-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fnfDeathOverride}
                      onChange={(e) => {
                        setFnfDeathOverride(e.target.checked);
                        if (e.target.checked) setFnfExitReason('DEATH_IN_SERVICE');
                      }}
                      className="w-4 h-4 accent-rose-600"
                    />
                    <span>DEATH_IN_SERVICE Flag</span>
                  </label>
                </div>
              </div>

              {(fnfDeathOverride || fnfExitReason === 'DEATH_IN_SERVICE' || fnfNomineeName) && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Nominee Full Name
                    </label>
                    <input
                      type="text"
                      value={fnfNomineeName}
                      onChange={(e) => setFnfNomineeName(e.target.value)}
                      placeholder="Nominee name"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Relation
                    </label>
                    <input
                      type="text"
                      value={fnfNomineeRelation}
                      onChange={(e) => setFnfNomineeRelation(e.target.value)}
                      placeholder="Spouse / Parent"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Settlement Audit Notes
                </label>
                <input
                  type="text"
                  value={fnfNotes}
                  onChange={(e) => setFnfNotes(e.target.value)}
                  placeholder="Optional clearance / handover note..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* RIGHT: LIVE FNF SETTLEMENT STATEMENT */}
            {fnfPreview && (
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Full &amp; Final Statement — {fnfPreview.workerName}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Exit: {fnfPreview.exitDate} · {fnfPreview.exitReason} · Service:{' '}
                        {fnfPreview.gratuityCalculation.tenure.formattedTenure} (
                        {fnfPreview.gratuityCalculation.effectiveYearsForFormula} yrs)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenFnfPayslip}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <Printer size={14} />
                      <span>Preview FnF Payslip</span>
                    </button>
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">
                        Pending Prorated Salary ({fnfPreview.pendingSalaryDays} payable days)
                      </span>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        {formatInr(fnfPreview.pendingWagesEarned)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">
                        Earned Leave Encashment ({fnfPreview.leaveEncashmentDays} days @ Basic+DA/26)
                      </span>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        {formatInr(fnfPreview.leaveEncashmentAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div>
                        <span className="font-bold text-emerald-950 block">
                          Gratuity Settlement Payout
                        </span>
                        <span className="text-[11px] text-emerald-800 font-mono">
                          {fnfPreview.gratuityCalculation.formulaText}
                        </span>
                        {!fnfPreview.gratuityCalculation.isEligible && (
                          <span className="block text-[11px] text-amber-800 font-sans mt-0.5">
                            {fnfPreview.gratuityCalculation.eligibilityNote}
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-extrabold tabular-nums text-sm text-emerald-900 shrink-0 ml-3">
                        +{formatInr(fnfPreview.gratuityPayable)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                      <span>Advance &amp; EWA Recoveries</span>
                      <span className="font-mono font-bold tabular-nums">
                        -{formatInr(fnfPreview.advanceAndEwaRecovery)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                      <span>Statutory Deductions (EPF / ESI / PT / TDS on Salary)</span>
                      <span className="font-mono font-bold tabular-nums">
                        -{formatInr(fnfPreview.statutoryDeductions)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-xl mt-3">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                          Net Full &amp; Final Payable
                        </span>
                        {fnfPreview.deathInService && fnfPreview.nomineeName && (
                          <span className="text-[11px] text-rose-300">
                            Beneficiary Nominee: {fnfPreview.nomineeName} ({fnfPreview.nomineeRelation || 'Nominee'})
                          </span>
                        )}
                      </div>
                      <span className="text-2xl font-extrabold font-mono tabular-nums">
                        {formatInr(fnfPreview.netFnfPayable)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSavingFnf}
                    onClick={() => handleSaveOrFinalizeFnf(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Save FnF Draft
                  </button>
                  <button
                    type="button"
                    disabled={isSavingFnf}
                    onClick={() => handleSaveOrFinalizeFnf(true)}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserX size={15} />
                    <span>{isSavingFnf ? 'Finalizing...' : 'Finalize Exit & Approve FnF'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SAVED FNF SETTLEMENTS LEDGER */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <History size={15} className="text-slate-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  FnF Settlement Records
                </h3>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('PAYROLL')}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                >
                  View in Monthly Payroll →
                </button>
              )}
            </div>

            {fnfHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No Full &amp; Final settlements saved yet. Trigger an employee exit above to generate an FnF settlement record.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {fnfHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>{item.workerName}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {item.exitReason}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            item.status === 'SETTLED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'APPROVED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Exit: {item.exitDate} · Gratuity: {formatInr(item.gratuityPayable)} · Net FnF:{' '}
                        <strong className="text-slate-900">{formatInr(item.netFnfPayable)}</strong>
                        {item.nomineeName ? ` · Nominee: ${item.nomineeName}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status !== 'SETTLED' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await updateFnfSettlementStatus(tenantId, item.id, 'SETTLED', actorEmail);
                            setFnfHistory(await getFnfSettlements(tenantId));
                            toast.success(`Marked FnF for ${item.workerName} as SETTLED.`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 size={13} />
                          <span>Mark Settled</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {fnfPayslipPreview && (
        <Payslip
          data={fnfPayslipPreview}
          companyName={profile?.companyName || 'WorkForce Pro Factory'}
          siteAddress={orgSettings?.baseLocation?.address}
          onClose={() => setFnfPayslipPreview(null)}
        />
      )}
    </div>
  );
};
