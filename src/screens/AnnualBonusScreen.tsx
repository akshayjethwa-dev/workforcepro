// src/screens/AnnualBonusScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Landmark,
  Printer,
  Save,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import {
  BONUS_CALCULATION_CEILING,
  BONUS_ELIGIBILITY_CEILING,
  MAX_STATUTORY_BONUS_PCT,
  MIN_STATUTORY_BONUS_PCT,
  calculateAnnualBonusRun,
  exportBonusRegistersWorkbook,
  getBonusOffCycleRuns,
  saveBonusOffCycleRun,
  updateBonusRunStatus,
} from '../services/annualBonusService';
import {
  AttendanceRecord,
  BonusAllocableSurplusInput,
  BonusOffCycleRun,
  OrgSettings,
  ScreenName,
  Worker,
} from '../types/index';

interface Props {
  onNavigate?: (screen: ScreenName) => void;
}

const FINANCIAL_YEARS = ['2024-25', '2025-26', '2026-27'];

export const AnnualBonusScreen: React.FC<Props> = ({ onNavigate }) => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const tenantId = profile?.tenantId || 'demo-tenant-id';
  const actorEmail = profile?.email || 'admin@workforcepro.in';

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [savedRuns, setSavedRuns] = useState<BonusOffCycleRun[]>([]);

  // Configuration state
  const [financialYear, setFinancialYear] = useState<string>('2025-26');
  const [payoutDate, setPayoutDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  });
  const [bonusRatePct, setBonusRatePct] = useState<number>(MIN_STATUTORY_BONUS_PCT);
  const [surplusInput, setSurplusInput] = useState<BonusAllocableSurplusInput>({
    financialYear: '2025-26',
    companyType: 'DOMESTIC_60_PCT',
    grossProfit: 1850000,
    depreciation: 320000,
    directTaxes: 380000,
    returnOnCapital: 210000,
    priorSetOnCarriedForward: 0,
    priorSetOffCarriedForward: 0,
    isEmployerLossMaking: false,
    formCExemptionFiledRef: '',
  });

  // Per-worker editable overrides: Ex-Gratia for >₹21k & Working Days override for part-year
  const [exGratiaMap, setExGratiaMap] = useState<Record<string, number>>({});
  const [workedDaysOverrideMap, setWorkedDaysOverrideMap] = useState<Record<string, number>>({});

  // UI state
  const [activeTab, setActiveTab] = useState<'WORKSHEET' | 'REGISTERS' | 'HISTORY'>('WORKSHEET');
  const [activeFormTab, setActiveFormTab] = useState<'FORM_A' | 'FORM_B' | 'FORM_C' | 'FORM_D'>('FORM_C');
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<'ALL' | 'ELIGIBLE' | 'DISQUALIFIED'>('ALL');
  const [savingRun, setSavingRun] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [wList, attList, settings, runs] = await Promise.all([
          dbService.getWorkers(tenantId),
          dbService.getAttendanceHistory(tenantId),
          dbService.getOrgSettings(tenantId),
          getBonusOffCycleRuns(tenantId),
        ]);
        if (!mounted) return;
        setWorkers(wList);
        setAttendance(attList);
        setOrgSettings(settings);
        setSavedRuns(runs);
      } catch (err) {
        console.error('Failed to load annual bonus workspace:', err);
        if (mounted) toast.error('Could not load worker and bonus register data.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  const companyName = profile?.companyName || 'Apex Precision Engineering Pvt Ltd';
  const employerName = profile?.email?.split('@')[0] || 'Managing Director';
  const companyAddress =
    orgSettings?.baseLocation?.address || 'Plot 42, MIDC Industrial Area, Pune, Maharashtra';

  const liveRun = useMemo(() => {
    return calculateAnnualBonusRun({
      tenantId,
      financialYear,
      payoutDate,
      workers,
      bonusRatePct,
      surplusInput: { ...surplusInput, financialYear },
      exGratiaMap,
      workedDaysOverrideMap,
      companyName,
      employerName,
      address: companyAddress,
      orgSettings: orgSettings || undefined,
      attendanceRecords: attendance,
      actorEmail,
    });
  }, [
    tenantId,
    financialYear,
    payoutDate,
    workers,
    bonusRatePct,
    surplusInput,
    exGratiaMap,
    workedDaysOverrideMap,
    companyName,
    employerName,
    companyAddress,
    orgSettings,
    attendance,
    actorEmail,
  ]);

  const filteredItems = useMemo(() => {
    return liveRun.items.filter((item) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.workerName.toLowerCase().includes(q) ||
        item.designation.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q);
      const matchesFilter =
        eligibilityFilter === 'ALL'
          ? true
          : eligibilityFilter === 'ELIGIBLE'
          ? item.isStatutoryEligible
          : !item.isStatutoryEligible;
      return matchesSearch && matchesFilter;
    });
  }, [liveRun.items, searchQuery, eligibilityFilter]);

  const handleSaveRun = async (targetStatus: 'DRAFT' | 'DISBURSED') => {
    if (liveRun.items.length === 0) {
      toast.warning('No employees found to process bonus run.');
      return;
    }
    setSavingRun(true);
    try {
      const nowIso = new Date().toISOString();
      const recordToSave: BonusOffCycleRun = {
        ...liveRun,
        status: targetStatus,
        disbursedAt: targetStatus === 'DISBURSED' ? nowIso : undefined,
      };
      await saveBonusOffCycleRun(recordToSave, actorEmail);
      const refreshed = await getBonusOffCycleRuns(tenantId);
      setSavedRuns(refreshed);
      if (targetStatus === 'DISBURSED') {
        toast.success(
          `Off-cycle bonus disbursed for FY ${financialYear}: ₹${recordToSave.totalNetOffCycleDisbursed.toLocaleString(
            'en-IN'
          )} net (TDS ₹${recordToSave.totalBonusTdsDeducted.toLocaleString('en-IN')}).`
        );
      } else {
        toast.success(`Saved draft off-cycle bonus run for FY ${financialYear}.`);
      }
      setActiveTab('HISTORY');
    } catch (err: any) {
      toast.error(`Failed to save off-cycle bonus run: ${err?.message || 'Unknown error'}`);
    } finally {
      setSavingRun(false);
    }
  };

  const handleStatusChange = async (runId: string, nextStatus: BonusOffCycleRun['status']) => {
    try {
      const updated = await updateBonusRunStatus(tenantId, runId, nextStatus, actorEmail);
      setSavedRuns(updated);
      toast.success(`Off-cycle run status updated to ${nextStatus}.`);
    } catch (err: any) {
      toast.error(`Status update failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleExportWorkbook = (runToExport: BonusOffCycleRun = liveRun) => {
    try {
      const fileName = exportBonusRegistersWorkbook(runToExport);
      toast.success(`Downloaded ${fileName} (Forms A, B, C, D).`);
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message || 'Unable to generate workbook'}`);
    }
  };

  const handlePrintRegister = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const win = liveRun.windowInfo;
  const windowBannerClasses =
    win.windowStatus === 'OVERDUE_PENALTY_RISK'
      ? 'bg-rose-50 border-rose-300 text-rose-950'
      : win.windowStatus === 'URGENT_DUE_SOON'
      ? 'bg-amber-50 border-amber-300 text-amber-950'
      : 'bg-white border-slate-200 text-slate-900';

  return (
    <div className="space-y-5 pb-12">
      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('DASHBOARD')}
              className="mt-0.5 p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Back to Dashboard"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Annual Statutory Bonus Engine
            </h1>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
              <span>Payment of Bonus Act &amp; Code on Wages</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-700">
                Eligibility ≤ ₹{BONUS_ELIGIBILITY_CEILING.toLocaleString('en-IN')}/mo
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-700">
                Wage Cap ₹{BONUS_CALCULATION_CEILING.toLocaleString('en-IN')}/mo
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-700">
                Band {MIN_STATUTORY_BONUS_PCT}%–{MAX_STATUTORY_BONUS_PCT}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-9">
            <Calendar size={14} className="text-slate-500" />
            <select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              aria-label="Financial Year"
              className="text-xs font-mono font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
            >
              {FINANCIAL_YEARS.map((fy) => (
                <option key={fy} value={fy}>
                  FY {fy}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-9">
            <span className="text-[11px] font-medium text-slate-500">Payout:</span>
            <input
              type="date"
              value={payoutDate}
              onChange={(e) => setPayoutDate(e.target.value)}
              aria-label="Off-Cycle Payout Date"
              className="text-xs font-mono font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => handleExportWorkbook(liveRun)}
            className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download size={14} className="text-blue-600" />
            <span>Forms A–D (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveRun('DISBURSED')}
            disabled={savingRun}
            className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Send size={13} />
            <span>Disburse Off-Cycle Bonus</span>
          </button>
        </div>
      </div>

      {/* 8-MONTH STATUTORY WINDOW BANNER */}
      <div className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${windowBannerClasses}`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {win.windowStatus === 'OVERDUE_PENALTY_RISK' ? (
              <ShieldAlert size={18} className="text-rose-600" />
            ) : win.windowStatus === 'URGENT_DUE_SOON' ? (
              <Clock size={18} className="text-amber-600" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-600" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span>8-Month Statutory Payout Window (FY {win.financialYear})</span>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span className="font-mono tabular-nums">
                FY Close: {win.fyEndDate}
              </span>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span className="font-mono tabular-nums">
                Deadline: {win.statutoryDeadlineDate}
              </span>
            </div>
            <p className="text-xs opacity-85 mt-0.5">{win.statusMessage}</p>
          </div>
        </div>
        <div className="text-right shrink-0 font-mono tabular-nums">
          {win.windowStatus === 'OVERDUE_PENALTY_RISK' ? (
            <span className="text-sm font-bold text-rose-700">
              {win.daysOverdue}d Overdue
            </span>
          ) : (
            <span
              className={`text-sm font-bold ${
                win.windowStatus === 'URGENT_DUE_SOON' ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {win.daysRemaining}d Remaining
            </span>
          )}
        </div>
      </div>

      {/* LOSS-MAKING FORM C EXEMPTION BANNER */}
      {liveRun.formCExemptionRequired && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold">
                Employer Loss-Making Mode Active — Statutory Form C Exemption Filing Required
              </div>
              <p className="mt-0.5 text-amber-900">
                Applying 8.33% statutory minimum bonus without positive profit / allocable surplus. Deficiency of{' '}
                <span className="font-mono font-bold tabular-nums">
                  ₹{liveRun.formB[liveRun.formB.length - 1]?.setOffForYear.toLocaleString('en-IN') || 0}
                </span>{' '}
                is carried forward as Set-Off in Form B. File statutory exemption Form C before {win.statutoryDeadlineDate}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder="Form C Exemption Ref #"
              value={surplusInput.formCExemptionFiledRef || ''}
              onChange={(e) =>
                setSurplusInput((prev) => ({ ...prev, formCExemptionFiledRef: e.target.value }))
              }
              className="h-8 px-2.5 bg-white border border-amber-300 rounded-lg text-xs font-mono text-slate-900 outline-none focus:border-amber-600 w-44"
            />
          </div>
        </div>
      )}

      {/* 4-COLUMN KPI SUMMARY STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Statutory Bonus Liability
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            ₹{liveRun.totalStatutoryBonusGross.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Declared Rate: {liveRun.bonusRatePct}% · PF ₹0 · ESI ₹0
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Eligible Headcount (≤ ₹21k)
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {liveRun.eligibleCount} / {liveRun.items.length}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {liveRun.disqualifiedAbove21kCount} Disqualified (&gt; ₹21k/mo)
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Non-Statutory Ex-Gratia Pool
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
            ₹{liveRun.totalExGratiaGross.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Excluded from Form C &amp; D registers
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Off-Cycle Sec 192 TDS &amp; Net
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            ₹{liveRun.totalNetOffCycleDisbursed.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            TDS Withheld: ₹{liveRun.totalBonusTdsDeducted.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* BONUS RATE, ALLOCABLE SURPLUS & LOSS-MAKING CONTROLS */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="bonus-rate-range" className="text-xs font-semibold text-slate-700">
                Declared Statutory Bonus Rate
              </label>
              <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                {liveRun.bonusRatePct.toFixed(2)}%
              </span>
              {surplusInput.isEmployerLossMaking && (
                <span className="text-[11px] font-mono text-amber-700">
                  Locked to 8.33% minimum (Loss-Making)
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="bonus-rate-range"
                type="range"
                min={MIN_STATUTORY_BONUS_PCT}
                max={MAX_STATUTORY_BONUS_PCT}
                step={0.01}
                disabled={surplusInput.isEmployerLossMaking}
                value={surplusInput.isEmployerLossMaking ? MIN_STATUTORY_BONUS_PCT : bonusRatePct}
                onChange={(e) => setBonusRatePct(Number(e.target.value))}
                className="w-56 accent-slate-900 cursor-pointer disabled:opacity-40"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {[8.33, 10, 12, 15, 20].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={surplusInput.isEmployerLossMaking && preset !== 8.33}
                    onClick={() => setBonusRatePct(preset)}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-semibold border cursor-pointer disabled:opacity-40 ${
                      Math.abs(liveRun.bonusRatePct - preset) < 0.01
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset}%{preset === 8.33 ? ' Min' : preset === 20 ? ' Max' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={surplusInput.isEmployerLossMaking}
                onChange={(e) =>
                  setSurplusInput((prev) => ({
                    ...prev,
                    isEmployerLossMaking: e.target.checked,
                  }))
                }
                className="accent-amber-600"
              />
              <span>Employer Loss-Making (8.33% Min + Form C Exemption)</span>
            </label>

            <select
              value={surplusInput.companyType}
              onChange={(e) =>
                setSurplusInput((prev) => ({
                  ...prev,
                  companyType: e.target.value as 'DOMESTIC_60_PCT' | 'NON_DOMESTIC_67_PCT',
                }))
              }
              aria-label="Allocable Surplus Rate"
              className="h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none cursor-pointer"
            >
              <option value="DOMESTIC_60_PCT">Domestic Co. (60% Allocable)</option>
              <option value="NON_DOMESTIC_67_PCT">Non-Domestic (67% Allocable)</option>
            </select>
          </div>
        </div>

        {/* Form A Financial Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Gross Profit (₹)
            </label>
            <input
              type="number"
              min={0}
              value={surplusInput.grossProfit}
              onChange={(e) =>
                setSurplusInput((prev) => ({ ...prev, grossProfit: Number(e.target.value) || 0 }))
              }
              className="w-full h-9 px-2.5 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Depreciation (₹)
            </label>
            <input
              type="number"
              min={0}
              value={surplusInput.depreciation}
              onChange={(e) =>
                setSurplusInput((prev) => ({ ...prev, depreciation: Number(e.target.value) || 0 }))
              }
              className="w-full h-9 px-2.5 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Direct Taxes (₹)
            </label>
            <input
              type="number"
              min={0}
              value={surplusInput.directTaxes}
              onChange={(e) =>
                setSurplusInput((prev) => ({ ...prev, directTaxes: Number(e.target.value) || 0 }))
              }
              className="w-full h-9 px-2.5 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Return on Capital (₹)
            </label>
            <input
              type="number"
              min={0}
              value={surplusInput.returnOnCapital}
              onChange={(e) =>
                setSurplusInput((prev) => ({
                  ...prev,
                  returnOnCapital: Number(e.target.value) || 0,
                }))
              }
              className="w-full h-9 px-2.5 border border-slate-200 rounded-lg text-xs font-mono tabular-nums text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex flex-col justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Form A Allocable Surplus
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
              ₹{liveRun.formA.allocableSurplus.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1">
          {[
            { id: 'WORKSHEET', label: `Eligibility & Off-Cycle Worksheet (${liveRun.items.length})` },
            { id: 'REGISTERS', label: 'Statutory Registers (Forms A, B, C, D)' },
            { id: 'HISTORY', label: `Off-Cycle Bonus Runs (${savedRuns.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'WORKSHEET' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveRun('DRAFT')}
              disabled={savingRun}
              className="h-8 px-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Save size={13} />
              <span>Save Draft Run</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: WORKSHEET */}
      {activeTab === 'WORKSHEET' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search worker, designation, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:bg-white focus:border-slate-400"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { key: 'ALL', label: `All (${liveRun.items.length})` },
                { key: 'ELIGIBLE', label: `Statutory Eligible (${liveRun.eligibleCount})` },
                {
                  key: 'DISQUALIFIED',
                  label: `Disqualified / >₹21k (${
                    liveRun.items.length - liveRun.eligibleCount
                  })`,
                },
              ].map((flt) => (
                <button
                  key={flt.key}
                  type="button"
                  onClick={() => setEligibilityFilter(flt.key as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    eligibilityFilter === flt.key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No workers match the selected filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-3 text-right">Monthly Gross vs ₹21k</th>
                    <th className="py-2.5 px-3 text-right">Basic+DA → Cap ₹7k</th>
                    <th className="py-2.5 px-3 text-right">FY Working Days</th>
                    <th className="py-2.5 px-3 text-right">Statutory Bonus</th>
                    <th className="py-2.5 px-3 text-right">Ex-Gratia (&gt;₹21k)</th>
                    <th className="py-2.5 px-3 text-right">Sec 192 TDS</th>
                    <th className="py-2.5 px-4 text-right">Net Off-Cycle Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredItems.map((item) => {
                    const isOver21k = item.eligibilityStatus === 'DISQUALIFIED_ABOVE_21K';
                    const isBelow30Days = item.eligibilityStatus === 'PART_YEAR_BELOW_30_DAYS';
                    return (
                      <tr key={item.workerId} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 align-top">
                          <div className="font-semibold text-slate-900">{item.workerName}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.designation} · {item.department}
                          </div>
                          <div className="mt-1 font-mono text-[10px]">
                            {item.isStatutoryEligible ? (
                              <span className="text-emerald-700 font-semibold">
                                STATUTORY ELIGIBLE{item.isPartYearProrated ? ' · PRO-RATED' : ''}
                              </span>
                            ) : isOver21k ? (
                              <span className="text-amber-700 font-semibold">
                                DISQUALIFIED (&gt; ₹21,000/mo) · Ex-Gratia Only
                              </span>
                            ) : (
                              <span className="text-rose-700 font-semibold">
                                INELIGIBLE (&lt; 30 Working Days)
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums align-top">
                          <div className={isOver21k ? 'text-amber-700 font-semibold' : 'text-slate-900'}>
                            ₹{item.monthlyGrossEarning.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {isOver21k ? 'Above ₹21,000' : 'Within ₹21,000'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums align-top">
                          <div className="text-slate-900 font-semibold">
                            ₹{item.cappedMonthlyBonusWageBase.toLocaleString('en-IN')}/mo
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Actual ₹{item.monthlyBasicPlusDa.toLocaleString('en-IN')}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums align-top">
                          <div className="inline-flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min={0}
                              max={item.totalCalendarDaysInFy}
                              value={workedDaysOverrideMap[item.workerId] ?? item.workedDaysInFy}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWorkedDaysOverrideMap((prev) => {
                                  if (val === '') {
                                    const copy = { ...prev };
                                    delete copy[item.workerId];
                                    return copy;
                                  }
                                  return { ...prev, [item.workerId]: Number(val) };
                                });
                              }}
                              aria-label={`Worked days in FY for ${item.workerName}`}
                              className="w-14 h-7 px-1.5 text-right border border-slate-200 rounded bg-white text-xs font-mono tabular-nums text-slate-900 outline-none focus:border-slate-500"
                            />
                            <span className="text-slate-400">/{item.totalCalendarDaysInFy}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {(item.prorationRatio * 100).toFixed(1)}% FY
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums align-top">
                          <div className="font-bold text-slate-900">
                            ₹{item.statutoryBonusAmount.toLocaleString('en-IN')}
                          </div>
                          {item.isStatutoryEligible && (
                            <div className="text-[10px] text-slate-400">
                              {item.bonusRatePct}% on ₹{item.annualCappedBonusWageBase.toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums align-top">
                          {isOver21k ? (
                            <div>
                              <input
                                type="number"
                                min={0}
                                step={500}
                                placeholder="0"
                                value={exGratiaMap[item.workerId] || ''}
                                onChange={(e) =>
                                  setExGratiaMap((prev) => ({
                                    ...prev,
                                    [item.workerId]: Math.max(0, Number(e.target.value) || 0),
                                  }))
                                }
                                aria-label={`Ex-Gratia amount for ${item.workerName}`}
                                className="w-24 h-7 px-2 text-right border border-slate-300 rounded bg-white text-xs font-mono tabular-nums text-blue-800 font-semibold outline-none focus:border-blue-600"
                              />
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Not in Form C/D
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums align-top">
                          <div className={item.bonusTdsDeduction > 0 ? 'text-rose-700 font-semibold' : 'text-slate-500'}>
                            ₹{item.bonusTdsDeduction.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.taxRegime} · {item.effectiveTdsRatePct}%
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums align-top">
                          <div className="font-bold text-emerald-700">
                            ₹{item.netOffCyclePayout.toLocaleString('en-IN')}
                          </div>
                          {isBelow30Days && (
                            <div className="text-[10px] text-rose-600">Below 30d</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STATUTORY REGISTERS (FORMS A, B, C, D) */}
      {activeTab === 'REGISTERS' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'FORM_A', label: 'Form A · Allocable Surplus' },
                { id: 'FORM_B', label: 'Form B · Set On & Set Off' },
                { id: 'FORM_C', label: `Form C · Bonus Register (${liveRun.formC.length})` },
                { id: 'FORM_D', label: 'Form D · Annual Return' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFormTab(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    activeFormTab === f.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintRegister}
                className="h-8 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={13} />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportWorkbook(liveRun)}
                className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet size={13} />
                <span>Download All 4 Forms (.xlsx)</span>
              </button>
            </div>
          </div>

          <div className="p-5">
            {activeFormTab === 'FORM_A' && (
              <div className="space-y-3">
                <div className="text-xs text-slate-600">
                  <strong>Form A</strong> — Computation of Available &amp; Allocable Surplus under Section 2(4) / Payment of Bonus Rules for FY {liveRun.formA.financialYear}.
                </div>
                <table className="w-full max-w-2xl border border-slate-200 text-xs">
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-slate-700">Gross Profit (Sec 4)</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        ₹{liveRun.formA.grossProfit.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Less: Depreciation (Sec 6(a))</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700">
                        -₹{liveRun.formA.lessDepreciation.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Less: Direct Taxes (Sec 6(c))</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700">
                        -₹{liveRun.formA.lessDirectTaxes.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Less: Return on Capital &amp; Reserves (Sec 6(d))</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700">
                        -₹{liveRun.formA.lessReturnOnCapital.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-900">Available Surplus (Sec 5)</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        ₹{liveRun.formA.availableSurplus.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr className="bg-slate-900 text-white">
                      <td className="py-3 px-4 font-bold">
                        Allocable Surplus ({liveRun.formA.allocableSurplusPercentage}%)
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                        ₹{liveRun.formA.allocableSurplus.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {activeFormTab === 'FORM_B' && (
              <div className="space-y-3 overflow-x-auto">
                <div className="text-xs text-slate-600">
                  <strong>Form B</strong> — Set-On and Set-Off of Allocable Surplus (Section 15).
                </div>
                <table className="w-full text-left border border-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                      <th className="py-2.5 px-3">Accounting Year</th>
                      <th className="py-2.5 px-3 text-right">Allocable Surplus</th>
                      <th className="py-2.5 px-3 text-right">Bonus Payable</th>
                      <th className="py-2.5 px-3 text-right">Set-On</th>
                      <th className="py-2.5 px-3 text-right">Set-Off</th>
                      <th className="py-2.5 px-3 text-right">Net Set-On C/F</th>
                      <th className="py-2.5 px-3 text-right">Net Set-Off C/F</th>
                      <th className="py-2.5 px-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {liveRun.formB.map((row) => (
                      <tr key={row.accountingYear}>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                          {row.accountingYear}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          ₹{row.amountAllocableAsBonus.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          ₹{row.amountPayableAsBonus.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                          ₹{row.setOnForYear.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700">
                          ₹{row.setOffForYear.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                          ₹{row.netSetOnCarriedForward.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                          ₹{row.netSetOffCarriedForward.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeFormTab === 'FORM_C' && (
              <div className="space-y-3 overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    <strong>Form C</strong> — Register of Bonus Paid to Employees (strictly excludes disqualified &gt;₹21,000/mo ex-gratia payouts).
                  </span>
                  {liveRun.formCExemptionRequired && (
                    <span className="font-mono font-bold text-amber-700">
                      Form C Statutory Exemption Filing Required (Loss-Making)
                    </span>
                  )}
                </div>
                {liveRun.formC.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                    No employees qualified for the Form C statutory bonus register.
                  </div>
                ) : (
                  <table className="w-full text-left border border-slate-200 text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                        <th className="py-2.5 px-3">Sl.</th>
                        <th className="py-2.5 px-3">Name &amp; Father&apos;s Name</th>
                        <th className="py-2.5 px-3">Designation</th>
                        <th className="py-2.5 px-3 text-right">Days Worked</th>
                        <th className="py-2.5 px-3 text-right">Capped Wages</th>
                        <th className="py-2.5 px-3 text-right">Bonus Payable</th>
                        <th className="py-2.5 px-3 text-right">TDS Deducted</th>
                        <th className="py-2.5 px-3 text-right">Net Paid</th>
                        <th className="py-2.5 px-3">Payment Date &amp; Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {liveRun.formC.map((row) => (
                        <tr key={row.workerId}>
                          <td className="py-2.5 px-3 font-mono tabular-nums">{row.slNo}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{row.workerName}</div>
                            <div className="text-[11px] text-slate-500">S/o {row.fatherOrHusbandName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{row.designation}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {row.daysWorkedInYear}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            ₹{row.totalSalaryOrWageInYear.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                            ₹{row.statutoryBonusPayable.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700">
                            ₹{row.tdsIncomeTaxDeducted.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                            ₹{row.actualAmountPaid.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-600">
                            <div className="font-mono">{row.dateOfPayment}</div>
                            <div>{row.remarks}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeFormTab === 'FORM_D' && (
              <div className="space-y-3">
                <div className="text-xs text-slate-600">
                  <strong>Form D</strong> — Unified Annual Return Summary under Payment of Bonus Rules / Code on Wages.
                </div>
                <table className="w-full max-w-3xl border border-slate-200 text-xs">
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Establishment &amp; Employer</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                        {liveRun.formD.establishmentName} ({liveRun.formD.employerName})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Accounting Year Ended On</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {liveRun.formD.accountingYearEndedOn}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Total Statutory Eligible Employees (≤ ₹21,000/mo)</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                        {liveRun.formD.totalEligibleEmployees}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Total Qualifying Wages (Capped at ₹7,000/mo)</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        ₹{liveRun.formD.totalEligibleSalaryOrWage.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Bonus Percentage Declared</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                        {liveRun.formD.bonusPercentageDeclared}%
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-900">Total Statutory Bonus Payable</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        ₹{liveRun.formD.totalStatutoryBonusPayable.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">8-Month Window Deadline &amp; Compliance</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {liveRun.formD.statutoryDeadlineDate} ·{' '}
                        <span className={liveRun.formD.paidWithinEightMonths ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                          {liveRun.formD.paidWithinEightMonths ? 'Within 8-Month Window' : 'Overdue'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-600">Statutory Exemption Form (Form C)</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {liveRun.formD.formCExemptionRequired
                          ? `REQUIRED (${liveRun.formD.formCExemptionFiledRef || 'Pending Filing'})`
                          : 'Not Required'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-slate-500">
                        Separate Non-Statutory Ex-Gratia Memo (&gt;₹21k, Excluded from Statutory Return)
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700">
                        ₹{liveRun.formD.totalExGratiaPaidSeparately.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SAVED OFF-CYCLE RUNS HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {savedRuns.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Landmark size={28} className="mx-auto text-slate-300" />
              <div className="text-sm font-semibold text-slate-800">No Off-Cycle Bonus Runs Saved Yet</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Review worker eligibility and rates on the Off-Cycle Bonus Worksheet, then save a draft or disburse an off-cycle bonus batch.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('WORKSHEET')}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                Open Bonus Worksheet
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {savedRuns.map((run) => (
                <div
                  key={run.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 font-mono">
                        FY {run.financialYear} Off-Cycle Bonus Run
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span
                        className={`font-mono text-xs font-bold ${
                          run.status === 'DISBURSED'
                            ? 'text-emerald-700'
                            : run.status === 'APPROVED'
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {run.status}
                      </span>
                      {run.formCExemptionRequired && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono text-xs text-amber-700 font-semibold">
                            Form C Exemption Flagged
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums flex flex-wrap items-center gap-2">
                      <span>Payout: {run.payoutDate}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span>Rate: {run.bonusRatePct}%</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span>Eligible: {run.eligibleCount}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span>Statutory: ₹{run.totalStatutoryBonusGross.toLocaleString('en-IN')}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span>Ex-Gratia: ₹{run.totalExGratiaGross.toLocaleString('en-IN')}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span>TDS: ₹{run.totalBonusTdsDeducted.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="text-right mr-2 font-mono tabular-nums">
                      <div className="text-[10px] uppercase text-slate-400">Net Disbursed</div>
                      <div className="text-sm font-bold text-emerald-700">
                        ₹{run.totalNetOffCycleDisbursed.toLocaleString('en-IN')}
                      </div>
                    </div>

                    {run.status === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(run.id, 'APPROVED')}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Approve
                      </button>
                    )}
                    {run.status !== 'DISBURSED' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(run.id, 'DISBURSED')}
                        className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        Mark Disbursed
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleExportWorkbook(run)}
                      className="h-8 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <IndianRupee size={12} className="text-slate-500" />
                      <span>Forms A–D</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
