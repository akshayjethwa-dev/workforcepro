// src/screens/GratuityScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  Calculator,
  CheckCircle2,
  Clock,
  FileText,
  History,
  IndianRupee,
  PauseCircle,
  PlayCircle,
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
  calculateWorkerGratuity,
  getFnfSettlements,
  projectOrganizationGratuityLiability,
} from '../services/gratuityService';
import {
  approveFnfSettlement,
  buildOffCycleFnfPayslip,
  computeFnfSettlementStatement,
  evaluateFnfDeadline,
  getOffCycleFnfPayrolls,
  placeLegalHold,
  processOffCycleFnfPayout,
  releaseLegalHold,
  syncFnfBreachAlerts,
  triggerAutomatedDraftFnf,
} from '../services/fnfService';
import {
  Advance,
  AttendanceRecord,
  FnfLegalHoldCategory,
  FnfSettlementRecord,
  GratuityExitReason,
  MonthlyPayroll,
  OrgSettings,
  ScreenName,
  Worker,
} from '../types/index';
import { Payslip } from '../components/Payslip';
import { FnfDeadlineBadge } from '../components/FnfDeadlineBadge';
import { FnfLegalHoldModal } from '../components/FnfLegalHoldModal';
import { TruncatedText } from '../components/TruncatedText';
import { ResponsiveDataTable } from '../components/ResponsiveDataTable';

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
  const [fnfNoticeRequiredDays, setFnfNoticeRequiredDays] = useState<string>('30');
  const [fnfNoticeServedDays, setFnfNoticeServedDays] = useState<string>('0');
  const [fnfNoticeWaived, setFnfNoticeWaived] = useState<boolean>(false);
  const [fnfNotes, setFnfNotes] = useState<string>('');
  const [isSavingFnf, setIsSavingFnf] = useState<boolean>(false);
  const [fnfPayslipPreview, setFnfPayslipPreview] = useState<MonthlyPayroll | null>(null);
  const [legalHoldTarget, setLegalHoldTarget] = useState<FnfSettlementRecord | null>(null);
  const [offCyclePayrolls, setOffCyclePayrolls] = useState<MonthlyPayroll[]>([]);
  const [includePenaltyOnPay, setIncludePenaltyOnPay] = useState<boolean>(true);
  const [simulatedEvalDate, setSimulatedEvalDate] = useState<string>(todayIso());

  const loadData = async () => {
    setLoading(true);
    try {
      const [wList, settings, att, adv, savedFnf, offCycleList] = await Promise.all([
        dbService.getWorkers(tenantId),
        dbService.getOrgSettings(tenantId),
        dbService.getAttendanceHistory(tenantId),
        dbService.getAdvances(tenantId),
        getFnfSettlements(tenantId),
        getOffCycleFnfPayrolls(tenantId),
      ]);
      const syncedFnf = await syncFnfBreachAlerts(tenantId, actorEmail, settings);
      const effectiveFnf = syncedFnf.length > 0 ? syncedFnf : savedFnf;

      setWorkers(wList);
      setOrgSettings(settings);
      setAttendanceRecords(att);
      setAdvances(adv);
      setFnfHistory(effectiveFnf);
      setOffCyclePayrolls(offCycleList);

      const preselectedId =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('gratuity_fnf_worker_id')
          : null;

      if (preselectedId) {
        sessionStorage.removeItem('gratuity_fnf_worker_id');
        const target = wList.find((w) => w.id === preselectedId);
        if (target) {
          selectWorkerForFnf(target, effectiveFnf, settings);
          setActiveTab('FNF');
        }
      } else if (!fnfWorkerId && wList.length > 0) {
        const preferred =
          wList.find((w) => effectiveFnf.some((r) => r.workerId === w.id && r.status !== 'SETTLED')) ||
          wList.find((w) => w.id === 'worker-6') ||
          wList.find((w) => w.status === 'ACTIVE') ||
          wList[0];
        selectWorkerForFnf(preferred, effectiveFnf, settings);
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

  const selectWorkerForFnf = (
    w: Worker,
    fnfList: FnfSettlementRecord[] = fnfHistory,
    settingsObj: OrgSettings | null = orgSettings
  ) => {
    setFnfWorkerId(w.id);
    const saved = fnfList.find((r) => r.workerId === w.id);
    const reason = saved?.exitReason || w.exitReason || 'RESIGNATION';
    setFnfExitDate(saved?.exitDate || w.dateOfExit || todayIso());
    setFnfExitReason(reason);
    setFnfDeathOverride(Boolean(saved?.deathInService || w.deathInService || reason === 'DEATH_IN_SERVICE'));
    setFnfNomineeName(saved?.nomineeName || w.nomineeName || '');
    setFnfNomineeRelation(saved?.nomineeRelation || w.nomineeRelation || 'Spouse');
    setFnfLeaveDays(String(saved?.leaveEncashmentDays ?? w.leaveBalances?.pl ?? settingsObj?.leavePolicy?.pl ?? 0));
    setFnfNoticeRequiredDays(
      String(
        saved?.noticePeriodRequiredDays ??
          w.noticePeriodDays ??
          (reason === 'RESIGNATION' ? (w.category === 'Permanent' ? 30 : 15) : 0)
      )
    );
    setFnfNoticeServedDays(String(saved?.noticePeriodServedDays ?? 0));
    setFnfNoticeWaived(Boolean(saved?.noticePayWaived));
    setFnfNotes(saved?.notes || '');
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

  const matchedSavedFnf = useMemo(
    () =>
      fnfHistory.find(
        (r) => r.workerId === fnfWorkerId && r.exitDate === fnfExitDate
      ) ||
      fnfHistory.find((r) => r.workerId === fnfWorkerId) ||
      null,
    [fnfHistory, fnfWorkerId, fnfExitDate]
  );

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
    return computeFnfSettlementStatement({
      tenantId,
      worker: workerForFnf,
      exitDate: fnfExitDate,
      exitReason: fnfExitReason,
      deathInService: fnfDeathOverride || fnfExitReason === 'DEATH_IN_SERVICE',
      nomineeName: fnfNomineeName || fnfSelectedWorker.nomineeName,
      nomineeRelation: fnfNomineeRelation || fnfSelectedWorker.nomineeRelation,
      leaveEncashmentDays: Number(fnfLeaveDays || 0),
      noticePeriodRequiredDays: Number(fnfNoticeRequiredDays || 0),
      noticePeriodServedDays: Number(fnfNoticeServedDays || 0),
      noticePayWaived: fnfNoticeWaived,
      monthlyPayrollForExitMonth: fnfExitPayroll,
      attendanceRecords,
      advances,
      orgSettings,
      notes: fnfNotes,
      existingRecord: matchedSavedFnf,
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
    fnfNoticeRequiredDays,
    fnfNoticeServedDays,
    fnfNoticeWaived,
    fnfExitPayroll,
    attendanceRecords,
    advances,
    orgSettings,
    fnfNotes,
    matchedSavedFnf,
  ]);

  const evalDateMs = useMemo(() => {
    if (!simulatedEvalDate || simulatedEvalDate === todayIso()) return Date.now();
    const [y, m, d] = simulatedEvalDate.split('-').map(Number);
    return new Date(y, m - 1, d, 16, 0, 0).getTime();
  }, [simulatedEvalDate]);

  const fnfPreviewEval = useMemo(() => {
    if (!fnfPreview) return null;
    return evaluateFnfDeadline(fnfPreview, evalDateMs, orgSettings);
  }, [fnfPreview, evalDateMs, orgSettings]);

  const refreshFnfWorkspace = async () => {
    const [refreshed, offList] = await Promise.all([
      syncFnfBreachAlerts(tenantId, actorEmail, orgSettings),
      getOffCycleFnfPayrolls(tenantId),
    ]);
    setFnfHistory(refreshed);
    setOffCyclePayrolls(offList);
  };

  const handleSaveOrFinalizeFnf = async (approveImmediately: boolean) => {
    if (!fnfPreview || !fnfSelectedWorker) return;
    setIsSavingFnf(true);
    try {
      const nextStatus: Worker['status'] =
        fnfPreview.exitReason === 'RESIGNATION'
          ? 'RESIGNED'
          : fnfPreview.exitReason === 'TERMINATION'
          ? 'TERMINATED'
          : 'INACTIVE';

      // Always mark separated & revoke tokens if still active
      if (fnfSelectedWorker.status === 'ACTIVE') {
        const exitUpdates: Partial<Worker> = {
          dateOfExit: fnfPreview.exitDate,
          exitReason: fnfPreview.exitReason,
          deathInService: fnfPreview.deathInService,
          nomineeName: fnfPreview.nomineeName,
          nomineeRelation: fnfPreview.nomineeRelation,
          noticePeriodDays: fnfPreview.noticePeriodRequiredDays,
          status: nextStatus,
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

      const savedDraft = await triggerAutomatedDraftFnf({
        tenantId,
        worker: { ...fnfSelectedWorker, status: nextStatus, isActive: false },
        exitDate: fnfPreview.exitDate,
        exitReason: fnfPreview.exitReason,
        actorEmail,
        deathInService: fnfPreview.deathInService,
        nomineeName: fnfPreview.nomineeName,
        nomineeRelation: fnfPreview.nomineeRelation,
        leaveEncashmentDays: fnfPreview.leaveEncashmentDays,
        noticePeriodRequiredDays: fnfPreview.noticePeriodRequiredDays,
        noticePeriodServedDays: fnfPreview.noticePeriodServedDays,
        noticePayWaived: fnfPreview.noticePayWaived,
        attendanceRecords,
        advances,
        orgSettings,
        notes: fnfPreview.notes,
      });

      if (approveImmediately && savedDraft.status === 'DRAFT') {
        await approveFnfSettlement(tenantId, savedDraft.id, actorEmail);
      }

      await refreshFnfWorkspace();
      toast.success(
        approveImmediately
          ? `FnF Approved for ${fnfSelectedWorker.name}. Ready for Off-Cycle Payroll disbursement.`
          : `Draft FnF generated for ${fnfSelectedWorker.name} (Sec 17(2) 2-working-day deadline active).`
      );
    } catch (err: any) {
      console.error('Failed to save FnF settlement:', err);
      toast.error(err?.message || 'Failed to save Full & Final settlement.');
    } finally {
      setIsSavingFnf(false);
    }
  };

  const handlePlaceLegalHold = async (category: FnfLegalHoldCategory, reason: string) => {
    if (!legalHoldTarget) return;
    await placeLegalHold(tenantId, legalHoldTarget.id, category, reason, actorEmail, orgSettings);
    await refreshFnfWorkspace();
    toast.warning(`LEGAL_HOLD placed on ${legalHoldTarget.workerName}'s FnF. 2-day timer paused.`);
  };

  const handleReleaseLegalHold = async (rec: FnfSettlementRecord) => {
    await releaseLegalHold(tenantId, rec.id, actorEmail, 'Property / exit clearance verified');
    await refreshFnfWorkspace();
    toast.success(`LEGAL_HOLD released for ${rec.workerName}. Deadline shifted forward by paused duration.`);
  };

  const handleProcessOffCyclePayout = async (
    rec: FnfSettlementRecord,
    scheduleTarget: 'WAGE_FNF' | 'GRATUITY' | 'BOTH'
  ) => {
    setIsSavingFnf(true);
    try {
      const processedIso =
        simulatedEvalDate && simulatedEvalDate !== todayIso()
          ? new Date(`${simulatedEvalDate}T16:00:00`).toISOString()
          : new Date().toISOString();
      const res = await processOffCycleFnfPayout({
        tenantId,
        fnfId: rec.id,
        scheduleTarget,
        actorEmail,
        workers,
        attendanceRecords,
        advances,
        orgSettings,
        processedAtIso: processedIso,
        includeInterestPenalty: includePenaltyOnPay,
      });
      await refreshFnfWorkspace();
      setFnfPayslipPreview(res.offCyclePayroll);
      toast.success(
        `Off-Cycle FnF Paid for ${rec.workerName} (₹${res.offCyclePayroll.netPayable.toLocaleString('en-IN')}). Separate FnF Payslip generated.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process off-cycle FnF payout.');
    } finally {
      setIsSavingFnf(false);
    }
  };

  const handleOpenFnfPayslip = (
    targetRec?: FnfSettlementRecord,
    scheduleTarget: 'WAGE_FNF' | 'GRATUITY' | 'BOTH' = 'BOTH'
  ) => {
    const rec = targetRec || fnfPreview;
    if (!rec) return;
    const existingOffCycle = offCyclePayrolls.find(
      (p) =>
        p.fnfSummary?.fnfRecordId === rec.id &&
        (scheduleTarget === 'BOTH' ||
          (scheduleTarget === 'WAGE_FNF' && p.offCycleType === 'WAGE_FNF') ||
          (scheduleTarget === 'GRATUITY' && p.offCycleType === 'GRATUITY_SETTLEMENT'))
    );
    if (existingOffCycle) {
      setFnfPayslipPreview(existingOffCycle);
      return;
    }
    const targetWorker = workers.find((w) => w.id === rec.workerId) || fnfSelectedWorker;
    const basePayroll =
      targetWorker && orgSettings
        ? wageService.generateMonthlyPayroll(
            {
              ...targetWorker,
              dateOfExit: rec.exitDate,
              exitReason: rec.exitReason,
              deathInService: rec.deathInService,
              nomineeName: rec.nomineeName,
              nomineeRelation: rec.nomineeRelation,
            },
            rec.exitDate.slice(0, 7),
            attendanceRecords,
            advances,
            orgSettings
          )
        : fnfExitPayroll;

    const previewSlip = buildOffCycleFnfPayslip({
      record: rec,
      scheduleTarget,
      worker: targetWorker,
      monthlyPayrollForExitMonth: basePayroll,
      evaluationTimeMs: evalDateMs,
      orgSettings,
      includeInterestPenalty: includePenaltyOnPay,
      isPaid: rec.status === 'SETTLED',
      paidAtIso: rec.settledAt,
    });
    setFnfPayslipPreview(previewSlip);
  };

  return (
    <div className="space-y-6 pb-12 min-w-0">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-fluid-xl font-bold tracking-tight text-slate-900 break-words">
            Gratuity Accrual &amp; FnF Settlement
          </h1>
          <p className="text-fluid-xs text-slate-500 mt-0.5 break-words">
            Statutory formula <span className="font-mono text-slate-700">(Last Basic + DA) × 15 / 26 × Rounded Years</span> · ₹20,00,000 ceiling · Nov 2025 Fixed-Term 1-Year rule
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto max-w-full">
          <div className="flex items-center flex-wrap gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <span className="text-fluid-2xs font-semibold text-slate-500">Valuation Date</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="text-fluid-xs font-mono font-semibold text-slate-900 outline-none bg-transparent"
            />
          </div>
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shrink-0"
            title="Recalculate liability"
            aria-label="Recalculate liability"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>
      </div>

      {/* KPI PROJECTION STRIP */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fluid-2xs font-semibold uppercase tracking-wider text-slate-500 break-words min-w-0">
              Vested Payable Liability
            </span>
            <IndianRupee size={16} className="text-emerald-600 shrink-0" />
          </div>
          <div className="text-fluid-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2 break-words">
            {formatInr(orgProjection.vestedPayableLiability)}
          </div>
          <div className="text-fluid-2xs text-slate-500 mt-1 font-mono tabular-nums break-words">
            {orgProjection.eligibleEmployeesCount} eligible · capped at ₹20L
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fluid-2xs font-semibold uppercase tracking-wider text-slate-500 break-words min-w-0">
              Total Accrued Provision
            </span>
            <Building2 size={16} className="text-blue-600 shrink-0" />
          </div>
          <div className="text-fluid-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2 break-words">
            {formatInr(orgProjection.totalProvisionalAccruedLiability)}
          </div>
          <div className="text-fluid-2xs text-slate-500 mt-1 font-mono tabular-nums break-words">
            Unvested reserve: {formatInr(orgProjection.unvestedAccruedReserve)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fluid-2xs font-semibold uppercase tracking-wider text-slate-500 break-words min-w-0">
              Eligible Headcount
            </span>
            <UserCheck size={16} className="text-indigo-600 shrink-0" />
          </div>
          <div className="text-fluid-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2 break-words">
            {orgProjection.eligibleEmployeesCount} / {orgProjection.totalWorkersAnalyzed}
          </div>
          <div className="text-fluid-2xs text-slate-500 mt-1 font-mono tabular-nums break-words">
            {orgProjection.standardFiveYearEligibleCount} Std 5Y · {orgProjection.fixedTermOneYearEligibleCount} FTE 1Y
            {orgProjection.deathInServiceCount > 0 ? ` · ${orgProjection.deathInServiceCount} Nominee` : ''}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fluid-2xs font-semibold uppercase tracking-wider text-slate-500 break-words min-w-0">
              Cash-Flow Run-Rate
            </span>
            <Award size={16} className="text-amber-600 shrink-0" />
          </div>
          <div className="text-fluid-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2 break-words">
            {formatInr(orgProjection.monthlyAccrualRunRate)}<span className="text-fluid-xs font-normal text-slate-500">/mo</span>
          </div>
          <div className="text-fluid-2xs text-slate-500 mt-1 font-mono tabular-nums break-words">
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

          <div className="p-3 sm:p-4">
            <ResponsiveDataTable
              data={filteredLedger}
              keyExtractor={(row) => row.workerId}
              stickyHeader={true}
              maxHeightClassName="max-h-[65vh]"
              tableMinWidthClassName="min-w-[960px]"
              paginationMode="pages"
              initialPageSize={20}
              pageSizeOptions={[10, 20, 50, 100]}
              itemLabel="employees"
              ariaLabel="Organization gratuity liability ledger"
              emptyState={{
                icon: <Award size={24} className="text-slate-400" />,
                title: 'No workers match the active filter criteria',
                description: 'Try clearing the search term or switching the eligibility filter above.',
              }}
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  stickyLeft: true,
                  isPrimary: true,
                  mobilePriority: true,
                  minWidth: 'min-w-[190px]',
                  render: (row) => (
                    <div className="min-w-0">
                      <TruncatedText
                        text={row.workerName}
                        modalTitle="Gratuity Liability Profile"
                        subtitle={`${row.designation} · ${row.department}`}
                        details={[
                          { label: 'Tenure', value: `${row.tenure.formattedTenure} (${row.effectiveYearsForFormula} yrs)`, mono: true },
                          { label: 'Last Basic + DA', value: formatInr(row.lastDrawnBasicPlusDa), mono: true },
                          { label: 'Vested Payable', value: formatInr(row.payableGratuityAmount), mono: true },
                        ]}
                        className="font-bold text-slate-900 text-xs"
                      />
                      <div className="text-[11px] text-slate-500 truncate">
                        {row.designation} · {row.department}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {row.employmentType === 'FIXED_TERM' ? 'Fixed-Term (1Y Rule)' : 'Permanent (5Y Rule)'}
                        {row.nomineeName ? ` · Nominee: ${row.nomineeName}` : ''}
                      </div>
                    </div>
                  ),
                  renderPriority: (row) => (
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-xs truncate">{row.workerName}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{row.tenure.formattedTenure}</div>
                    </div>
                  ),
                },
                {
                  key: 'service',
                  header: 'Service & Round-Up',
                  mobileLabel: 'Service',
                  numeric: true,
                  minWidth: 'min-w-[165px]',
                  render: (row) => (
                    <div>
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
                          Aggregated Subsidiary ({row.tenure.subsidiaryName || 'Prior Entity'})
                        </div>
                      )}
                      {row.tenure.breakInServiceDetected && (
                        <div className="text-[10px] text-amber-700 font-sans font-semibold mt-0.5">
                          Transfer break detected
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'basicDa',
                  header: 'Last Basic + DA',
                  align: 'right',
                  numeric: true,
                  minWidth: 'min-w-[130px]',
                  render: (row) => (
                    <div>
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
                    </div>
                  ),
                },
                {
                  key: 'eligibility',
                  header: 'Eligibility Rule',
                  mobileLabel: 'Status',
                  mobilePriority: true,
                  minWidth: 'min-w-[175px]',
                  render: (row) => (
                    <div>
                      {row.eligibilityRule === 'DEATH_IN_SERVICE_OVERRIDE' && (
                        <span className="font-mono font-bold text-[10px] text-rose-700">DEATH_IN_SERVICE</span>
                      )}
                      {row.eligibilityRule === 'ONE_YEAR_FIXED_TERM_NOV_2025' && (
                        <span className="font-semibold text-[11px] text-indigo-700">Fixed-Term 1Y (Nov 2025)</span>
                      )}
                      {row.eligibilityRule === 'FIVE_YEAR_STANDARD' && (
                        <span className="font-semibold text-[11px] text-emerald-700">Vested (5+ Years)</span>
                      )}
                      {row.eligibilityRule === 'NOT_ELIGIBLE' && (
                        <span className="font-semibold text-[11px] text-slate-500">Not Yet Vested</span>
                      )}
                      <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px]">{row.eligibilityNote}</div>
                    </div>
                  ),
                  renderPriority: (row) => (
                    <span
                      className={`text-[11px] font-bold ${
                        row.eligibilityRule === 'DEATH_IN_SERVICE_OVERRIDE'
                          ? 'text-rose-700'
                          : row.eligibilityRule === 'ONE_YEAR_FIXED_TERM_NOV_2025'
                          ? 'text-indigo-700'
                          : row.eligibilityRule === 'FIVE_YEAR_STANDARD'
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {row.eligibilityRule === 'NOT_ELIGIBLE' ? 'Unvested' : 'Vested'}
                    </span>
                  ),
                },
                {
                  key: 'reserve',
                  header: 'Provisional Reserve',
                  mobileLabel: 'Reserve',
                  align: 'right',
                  numeric: true,
                  minWidth: 'min-w-[130px]',
                  render: (row) => (
                    <div className="text-slate-700">
                      <div>{formatInr(row.provisionalAccruedAmount)}</div>
                      <div className="text-[10px] text-slate-400">+{formatInr(row.monthlyAccrualIncrement)}/mo</div>
                    </div>
                  ),
                },
                {
                  key: 'payable',
                  header: 'Vested Payable',
                  mobileLabel: 'Payable',
                  align: 'right',
                  numeric: true,
                  isHeaderMetric: true,
                  mobilePriority: true,
                  minWidth: 'min-w-[130px]',
                  render: (row) => (
                    <div>
                      <div
                        className={`font-extrabold text-sm ${
                          row.payableGratuityAmount > 0 ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {formatInr(row.payableGratuityAmount)}
                      </div>
                      {row.ceilingApplied && (
                        <div className="text-[10px] text-amber-700 font-semibold">
                          Capped ₹20L (-{formatInr(row.cappedExcessAmount)})
                        </div>
                      )}
                    </div>
                  ),
                  renderPriority: (row) => (
                    <span
                      className={`font-extrabold text-xs ${
                        row.payableGratuityAmount > 0 ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {formatInr(row.payableGratuityAmount)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  align: 'right',
                  isAction: true,
                  minWidth: 'min-w-[165px]',
                  render: (row) => {
                    const workerObj = workers.find((w) => w.id === row.workerId);
                    return (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            selectWorkerForCalculator(row.workerId);
                            setActiveTab('CALCULATOR');
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer"
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
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] cursor-pointer"
                          >
                            Trigger FnF
                          </button>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
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

      {/* TAB 3: AUTOMATED FNF TRIGGER, DEADLINE TRACKER & OFF-CYCLE PAYROLL */}
      {activeTab === 'FNF' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT: FNF INPUT & NOTICE RECOVERY FORM */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Automated FnF Trigger &amp; Recovery Parameters</h2>
                <p className="text-[11px] text-slate-500">
                  Sec 17(2) Code on Wages (2 Working Days) · Gratuity Sec 7(3) (30 Days) · 12% p.a. Delay Interest
                </p>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Exiting / Separated Employee
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
                    Separation Reason
                  </label>
                  <select
                    value={fnfExitReason}
                    onChange={(e) => {
                      const val = e.target.value as GratuityExitReason;
                      setFnfExitReason(val);
                      if (val === 'DEATH_IN_SERVICE') setFnfDeathOverride(true);
                      if (val === 'RESIGNATION') {
                        setFnfNoticeRequiredDays(String(fnfSelectedWorker?.noticePeriodDays ?? 30));
                      } else {
                        setFnfNoticeRequiredDays('0');
                        setFnfNoticeServedDays('0');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                  >
                    <option value="RESIGNATION">RESIGNED (Resignation)</option>
                    <option value="TERMINATION">TERMINATED (Termination)</option>
                    <option value="RETIREMENT">Retirement</option>
                    <option value="END_OF_CONTRACT">End of Fixed-Term Contract</option>
                    <option value="DEATH_IN_SERVICE">Death in Service (Nominee Override)</option>
                    <option value="PERMANENT_DISABLEMENT">Permanent Disablement</option>
                  </select>
                </div>
              </div>

              {/* Notice Period & Leave Encashment */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Leave Encashment &amp; Notice Pay Recovery
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Leave Days (PL)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={fnfLeaveDays}
                      onChange={(e) => setFnfLeaveDays(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Notice Req. (Days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={fnfNoticeRequiredDays}
                      onChange={(e) => setFnfNoticeRequiredDays(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Notice Served
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={fnfNoticeServedDays}
                      onChange={(e) => setFnfNoticeServedDays(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>
                {Number(fnfNoticeRequiredDays || 0) > Number(fnfNoticeServedDays || 0) && (
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-800 cursor-pointer pt-1">
                    <span>Waive Notice Pay Recovery ({fnfPreview?.noticeShortfallDays || 0}d shortfall)</span>
                    <input
                      type="checkbox"
                      checked={fnfNoticeWaived}
                      onChange={(e) => setFnfNoticeWaived(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Payment / Eval Date (Test Timeline)
                  </label>
                  <input
                    type="date"
                    value={simulatedEvalDate}
                    onChange={(e) => setSimulatedEvalDate(e.target.value)}
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

            {/* RIGHT: LIVE FNF STATEMENT + SECTION 17(2) DEADLINE + SPLIT SCHEDULES */}
            {fnfPreview && fnfPreviewEval && (
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">
                          Full &amp; Final Statement — {fnfPreview.workerName}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            fnfPreview.status === 'SETTLED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : fnfPreview.status === 'LEGAL_HOLD'
                              ? 'bg-amber-100 text-amber-900'
                              : fnfPreview.status === 'APPROVED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {fnfPreview.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Exit: {fnfPreview.exitDate} · {fnfPreview.separationStatus || fnfPreview.exitReason} · Service:{' '}
                        {fnfPreview.gratuityCalculation.tenure.formattedTenure}
                      </p>
                      <div className="mt-2">
                        <FnfDeadlineBadge record={fnfPreview} orgSettings={orgSettings} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenFnfPayslip(fnfPreview, 'BOTH')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <Printer size={14} />
                      <span>Preview Separate FnF Payslip</span>
                    </button>
                  </div>

                  {/* LEGAL HOLD ACTIVE CALLOUT */}
                  {fnfPreview.legalHold?.active && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="text-amber-950">
                        <div className="font-bold flex items-center gap-1.5">
                          <PauseCircle size={15} className="text-amber-700" />
                          <span>LEGAL_HOLD Active ({fnfPreview.legalHold.category}) — Timer Paused</span>
                        </div>
                        <p className="text-[11px] text-amber-900 mt-0.5">{fnfPreview.legalHold.reason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReleaseLegalHold(fnfPreview)}
                        className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <PlayCircle size={13} />
                        <span>Release Hold</span>
                      </button>
                    </div>
                  )}

                  {/* BREACHED DEADLINE & 12% P.A. INTEREST PENALTY CALLOUT */}
                  {fnfPreviewEval.isBreached && (
                    <div className="mt-3 p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950 space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="font-extrabold text-rose-800 flex items-center gap-1.5">
                          <AlertTriangle size={16} className="text-rose-600" />
                          <span>SECTION 17(2) DEADLINE BREACHED (+{fnfPreviewEval.overdueWholeDays} Day(s) Overdue)</span>
                        </div>
                        <span className="font-mono font-black text-rose-700">
                          Cost of Delay (12% p.a.): ₹{fnfPreviewEval.accruedInterestPenalty.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-[11px] text-rose-900 flex flex-wrap items-center justify-between gap-2 font-mono">
                        <span>Daily Interest Burn: ₹{fnfPreviewEval.dailyInterestCost.toLocaleString('en-IN')}/day on ₹{fnfPreviewEval.principalForPenalty.toLocaleString('en-IN')}</span>
                        <label className="inline-flex items-center gap-1.5 font-sans font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includePenaltyOnPay}
                            onChange={(e) => setIncludePenaltyOnPay(e.target.checked)}
                            className="w-3.5 h-3.5 accent-rose-600"
                          />
                          <span>Include 12% interest in Off-Cycle Payout</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* ITEMIZED STATEMENT */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <div>
                        <span className="text-slate-700 font-medium block">
                          Pending Prorated Salary ({fnfPreview.pendingSalaryDays} days)
                        </span>
                        {fnfPreview.pendingSalaryNote && (
                          <span className="text-[10px] text-slate-400">{fnfPreview.pendingSalaryNote}</span>
                        )}
                      </div>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        +{formatInr(fnfPreview.pendingWagesEarned)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-700">
                        Earned Leave Encashment ({fnfPreview.leaveEncashmentDays} days @ Basic+DA/26)
                      </span>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        +{formatInr(fnfPreview.leaveEncashmentAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                      <div>
                        <span className="font-semibold block">Notice Pay Recovery</span>
                        <span className="text-[10px] text-rose-600 font-mono">
                          {fnfPreview.noticeRecoveryFormula}
                        </span>
                      </div>
                      <span className="font-mono font-bold tabular-nums">
                        -{formatInr(fnfPreview.noticePayRecovery || 0)}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700">
                      <span>Advance / Loan / Kharchi &amp; EWA Recovery</span>
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

                    {/* TWO SEPARATE STATUTORY PAYMENT SCHEDULES */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-blue-300">
                          <span>SCHEDULE A · 2 WORKING DAYS</span>
                          <span>Due {fnfPreviewEval.effectiveDeadlineLabel}</span>
                        </div>
                        <div className="text-xs font-bold text-slate-200">
                          Wage &amp; Leave FnF (Sec 17(2))
                        </div>
                        <div className="text-xl font-black font-mono tabular-nums text-white">
                          {formatInr(
                            (fnfPreview.fnfWageNetPayable ?? 0) +
                              (includePenaltyOnPay ? fnfPreviewEval.accruedInterestPenalty : 0)
                          )}
                        </div>
                        {(fnfPreview.excessRecoveryCarryover || 0) > 0 && (
                          <div className="text-[10px] text-amber-300 font-mono">
                            Notice/Advance excess recoverable: ₹{(fnfPreview.excessRecoveryCarryover || 0).toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-emerald-700">
                          <span>SCHEDULE B · 30 CALENDAR DAYS</span>
                          <span>
                            {fnfPreview.gratuityPayable > 0
                              ? `Due ${fnfPreviewEval.gratuityDeadlineLabel}`
                              : 'Not Applicable'}
                          </span>
                        </div>
                        <div className="text-xs font-bold">
                          Statutory Gratuity (Sec 7(3))
                        </div>
                        <div className="text-xl font-black font-mono tabular-nums text-emerald-800">
                          {formatInr(fnfPreview.gratuityPayable)}
                        </div>
                        <div className="text-[10px] text-emerald-800 font-mono truncate" title={fnfPreview.gratuityCalculation.formulaText}>
                          {fnfPreview.gratuityCalculation.isEligible
                            ? fnfPreview.gratuityCalculation.formulaText
                            : fnfPreview.gratuityCalculation.eligibilityNote}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* WORKFLOW ACTION BUTTONS */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSavingFnf}
                    onClick={() => handleSaveOrFinalizeFnf(false)}
                    className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Save DRAFT FnF
                  </button>

                  {fnfPreview.status !== 'APPROVED' && fnfPreview.status !== 'SETTLED' && fnfPreview.status !== 'LEGAL_HOLD' && (
                    <button
                      type="button"
                      disabled={isSavingFnf}
                      onClick={() => handleSaveOrFinalizeFnf(true)}
                      className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Approve FnF
                    </button>
                  )}

                  {fnfPreview.status !== 'SETTLED' && fnfPreview.status !== 'LEGAL_HOLD' && (
                    <button
                      type="button"
                      onClick={() => setLegalHoldTarget(fnfPreview)}
                      className="py-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <PauseCircle size={14} />
                      <span>Place LEGAL_HOLD</span>
                    </button>
                  )}

                  {matchedSavedFnf && matchedSavedFnf.status === 'APPROVED' && (
                    <>
                      <button
                        type="button"
                        disabled={isSavingFnf}
                        onClick={() => handleProcessOffCyclePayout(matchedSavedFnf, 'WAGE_FNF')}
                        className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <IndianRupee size={14} />
                        <span>Pay Schedule A (Off-Cycle)</span>
                      </button>
                      {matchedSavedFnf.gratuityPayable > 0 &&
                        matchedSavedFnf.paymentSchedules?.gratuity?.status !== 'PAID' && (
                          <button
                            type="button"
                            disabled={isSavingFnf}
                            onClick={() => handleProcessOffCyclePayout(matchedSavedFnf, 'GRATUITY')}
                            className="py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Award size={14} />
                            <span>Pay Gratuity (30d Sched B)</span>
                          </button>
                        )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SAVED FNF SETTLEMENTS & SECTION 17(2) DEADLINE TRACKER LEDGER */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <History size={15} className="text-slate-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Active FnF Settlements &amp; Section 17(2) Deadline Ledger ({fnfHistory.length})
                </h3>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('PAYROLL')}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                >
                  Open Off-Cycle Payrolls →
                </button>
              )}
            </div>

            {fnfHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No Full &amp; Final settlements triggered yet. Mark an employee as RESIGNED / TERMINATED or generate a draft above.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {fnfHistory.map((item) => {
                  const ev = evaluateFnfDeadline(item, evalDateMs, orgSettings);
                  const wagePaid = item.paymentSchedules?.wageFnf?.status === 'PAID' || item.status === 'SETTLED';
                  const gratDue = item.gratuityPayable > 0;
                  const gratPaid = item.paymentSchedules?.gratuity?.status === 'PAID' || item.status === 'SETTLED';
                  return (
                    <div
                      key={item.id}
                      className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs ${
                        ev.isBreached ? 'bg-rose-50/60' : item.status === 'LEGAL_HOLD' ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                          <span>{item.workerName}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                            {item.separationStatus || item.exitReason}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              item.status === 'SETTLED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'LEGAL_HOLD'
                                ? 'bg-amber-100 text-amber-900'
                                : item.status === 'APPROVED'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {item.status}
                          </span>
                          <FnfDeadlineBadge record={item} orgSettings={orgSettings} />
                        </div>

                        <div className="text-[11px] text-slate-600 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>Exit: {item.exitDate}</span>
                          <span>Sched A (2d): <strong>{formatInr(item.fnfWageNetPayable ?? item.netFnfPayable)}</strong> {wagePaid ? '✓ Paid' : ''}</span>
                          {(item.noticePayRecovery || 0) > 0 && (
                            <span className="text-rose-700">Notice Recovery: -{formatInr(item.noticePayRecovery || 0)}</span>
                          )}
                          {gratDue && (
                            <span className="text-emerald-800">
                              Sched B Gratuity (30d · {ev.gratuityDeadlineLabel}): <strong>{formatInr(item.gratuityPayable)}</strong> {gratPaid ? '✓ Paid' : ''}
                            </span>
                          )}
                          {ev.isBreached && (
                            <span className="text-rose-700 font-bold">
                              12% Interest Cost: {formatInr(ev.accruedInterestPenalty)} ({formatInr(ev.dailyInterestCost)}/d)
                            </span>
                          )}
                        </div>
                        {item.legalHold?.active && (
                          <div className="text-[11px] text-amber-900">
                            <strong>LEGAL_HOLD ({item.legalHold.category}):</strong> {item.legalHold.reason}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenFnfPayslip(item, 'BOTH')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Printer size={12} />
                          <span>FnF Payslip</span>
                        </button>

                        {item.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await approveFnfSettlement(tenantId, item.id, actorEmail);
                              await refreshFnfWorkspace();
                              toast.success(`Approved Draft FnF for ${item.workerName}.`);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer"
                          >
                            Approve FnF
                          </button>
                        )}

                        {item.status === 'LEGAL_HOLD' ? (
                          <button
                            type="button"
                            onClick={() => handleReleaseLegalHold(item)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <PlayCircle size={12} />
                            <span>Release Hold</span>
                          </button>
                        ) : item.status !== 'SETTLED' ? (
                          <button
                            type="button"
                            onClick={() => setLegalHoldTarget(item)}
                            className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <PauseCircle size={12} />
                            <span>Hold</span>
                          </button>
                        ) : null}

                        {item.status === 'APPROVED' && !wagePaid && (
                          <button
                            type="button"
                            onClick={() => handleProcessOffCyclePayout(item, 'WAGE_FNF')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 size={12} />
                            <span>Pay Off-Cycle Wage FnF</span>
                          </button>
                        )}

                        {item.status === 'APPROVED' && gratDue && !gratPaid && (
                          <button
                            type="button"
                            onClick={() => handleProcessOffCyclePayout(item, 'GRATUITY')}
                            className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <Award size={12} />
                            <span>Pay Gratuity (30d)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {legalHoldTarget && (
        <FnfLegalHoldModal
          record={legalHoldTarget}
          onClose={() => setLegalHoldTarget(null)}
          onConfirm={handlePlaceLegalHold}
        />
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
