import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  IndianRupee,
  Calendar,
  Clock,
  Save,
  MapPin,
  Loader2,
  History,
} from 'lucide-react';
import {
  INDIAN_STATES,
  OrgSettings,
  WageConfig,
  Worker,
  WorkerSkillCategory,
} from '../types/index';
import {
  DEFAULT_SCHEDULED_EMPLOYMENT,
  getDefaultZoneForState,
  getStateMinimumWage,
  getZonesForState,
  rebalanceWageConfigTo50Percent,
  resolveWorkerWorkLocation,
  SCHEDULED_EMPLOYMENT_CATEGORIES,
  SKILL_LEVEL_LABELS,
  validateWorkerWageStructure,
} from '../services/wageStructureValidationService';
import { WageStructureValidatorCard } from './WageStructureValidatorCard';
import { KeyboardAwareFormContainer } from './KeyboardAwareFormContainer';
import { ModalDatePicker } from './ModalDatePicker';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  worker: Worker | null;
  orgSettings?: OrgSettings | null;
  onClose: () => void;
  onSaved: (updatedWorker: Worker) => void;
}

export const WageStructureEditorModal: React.FC<Props> = ({
  isOpen,
  worker,
  orgSettings,
  onClose,
  onSaved,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [wageType, setWageType] = useState<'MONTHLY' | 'DAILY'>('MONTHLY');
  const [dailyMultiplier, setDailyMultiplier] = useState<26 | 30>(26);
  const [stateName, setStateName] = useState<string>('Maharashtra');
  const [wageZone, setWageZone] = useState<string>(getDefaultZoneForState('Maharashtra'));
  const [scheduledEmployment, setScheduledEmployment] = useState<string>(DEFAULT_SCHEDULED_EMPLOYMENT);
  const [skillCategory, setSkillCategory] = useState<WorkerSkillCategory>('UNSKILLED');
  const [isOnProbation, setIsOnProbation] = useState<boolean>(false);
  const [revisionDate, setRevisionDate] = useState<string>('');
  const [acknowledgedNonCompliant, setAcknowledgedNonCompliant] = useState<boolean>(false);

  // Component inputs (monthly for MONTHLY, daily rate per day for DAILY)
  const [basic, setBasic] = useState<number>(0);
  const [da, setDa] = useState<number>(0);
  const [retainingAllowance, setRetainingAllowance] = useState<number>(0);
  const [hra, setHra] = useState<number>(0);
  const [travel, setTravel] = useState<number>(0);
  const [medical, setMedical] = useState<number>(0);
  const [others, setOthers] = useState<number>(0);
  const [employerPf, setEmployerPf] = useState<number>(0);
  const [employerGratuity, setEmployerGratuity] = useState<number>(0);

  useEffect(() => {
    if (!worker || !isOpen) return;

    const initialAudit = validateWorkerWageStructure(worker, {
      ignoreRevisionCutoff: true,
      orgSettings: orgSettings || undefined,
    });
    const resolvedLoc = resolveWorkerWorkLocation(worker, orgSettings || undefined);

    const isDaily = initialAudit.wageType === 'DAILY';
    const mult = initialAudit.dailyMultiplier || 26;

    setWageType(initialAudit.wageType);
    setDailyMultiplier(mult);
    setStateName(resolvedLoc.state);
    setWageZone(resolvedLoc.wageZone);
    setScheduledEmployment(resolvedLoc.scheduledEmployment);
    setSkillCategory(worker.skillCategory || 'UNSKILLED');
    setIsOnProbation(Boolean(worker.isOnProbation));
    setRevisionDate(worker.salaryRevisionDate || '');
    setAcknowledgedNonCompliant(Boolean(worker.wageConfig?.acknowledgedNonCompliant));

    if (isDaily) {
      setBasic(Math.round((initialAudit.basicPay / mult) * 100) / 100);
      setDa(Math.round((initialAudit.da / mult) * 100) / 100);
      setRetainingAllowance(Math.round((initialAudit.retainingAllowance / mult) * 100) / 100);
      setHra(Math.round((initialAudit.hra / mult) * 100) / 100);
      setTravel(Math.round((initialAudit.travelAllowance / mult) * 100) / 100);
      setMedical(Math.round((initialAudit.medicalAllowance / mult) * 100) / 100);
      setOthers(Math.round((initialAudit.otherAllowances / mult) * 100) / 100);
      setEmployerPf(Math.round((initialAudit.employerPf / mult) * 100) / 100);
      setEmployerGratuity(Math.round((initialAudit.employerGratuity / mult) * 100) / 100);
    } else {
      setBasic(initialAudit.basicPay);
      setDa(initialAudit.da);
      setRetainingAllowance(initialAudit.retainingAllowance);
      setHra(initialAudit.hra);
      setTravel(initialAudit.travelAllowance);
      setMedical(initialAudit.medicalAllowance);
      setOthers(initialAudit.otherAllowances);
      setEmployerPf(initialAudit.employerPf);
      setEmployerGratuity(initialAudit.employerGratuity);
    }
  }, [worker, isOpen, orgSettings]);

  const draftWageConfig: WageConfig = useMemo(() => {
    const grossPerPeriod =
      basic + da + retainingAllowance + hra + travel + medical + others;
    const wageBasePeriod = basic + da + retainingAllowance;
    const basicPercentage =
      grossPerPeriod > 0 ? Math.round((wageBasePeriod / grossPerPeriod) * 100) : 0;

    if (wageType === 'MONTHLY') {
      return {
        ...(worker?.wageConfig || { overtimeEligible: true, allowances: { travel: 0, food: 0, nightShift: 0 } }),
        type: 'MONTHLY',
        amount: grossPerPeriod,
        basicPercentage,
        monthlyBreakdown: {
          basic,
          da,
          retainingAllowance,
          hra,
          travel,
          medical,
          others,
          employerPf,
          employerGratuity,
        },
        allowances: { travel: 0, food: 0, nightShift: 0 },
        acknowledgedNonCompliant,
      };
    }

    return {
      ...(worker?.wageConfig || { overtimeEligible: true, allowances: { travel: 0, food: 0, nightShift: 0 } }),
      type: 'DAILY',
      amount: grossPerPeriod,
      dailyMultiplier,
      workingDaysPerMonth: dailyMultiplier,
      basicPercentage,
      dailyBreakdown: {
        basic,
        da,
        retainingAllowance,
        hra,
        travel,
        medical,
        others,
        employerPf,
        employerGratuity,
      },
      allowances: { travel: 0, food: 0, nightShift: 0 },
      acknowledgedNonCompliant,
    };
  }, [
    wageType,
    dailyMultiplier,
    basic,
    da,
    retainingAllowance,
    hra,
    travel,
    medical,
    others,
    employerPf,
    employerGratuity,
    acknowledgedNonCompliant,
    worker,
  ]);

  const liveAudit = useMemo(() => {
    return validateWorkerWageStructure(
      {
        ...(worker || {}),
        state: stateName,
        wageZone,
        scheduledEmployment,
        skillCategory,
        isOnProbation,
        salaryRevisionDate: revisionDate || undefined,
        wageConfig: draftWageConfig,
      },
      { ignoreRevisionCutoff: true, orgSettings: orgSettings || undefined }
    );
  }, [
    worker,
    stateName,
    wageZone,
    scheduledEmployment,
    skillCategory,
    isOnProbation,
    revisionDate,
    draftWageConfig,
    orgSettings,
  ]);

  const availableZones = useMemo(() => getZonesForState(stateName), [stateName]);

  const stateMinInfo = useMemo(
    () =>
      getStateMinimumWage(
        stateName,
        skillCategory,
        wageZone,
        scheduledEmployment,
        undefined,
        orgSettings?.compliance?.minimumWageRevisions
      ),
    [stateName, skillCategory, wageZone, scheduledEmployment, orgSettings]
  );

  if (!isOpen || !worker) return null;

  const handleAutoRebalance = () => {
    const balanced = rebalanceWageConfigTo50Percent(
      {
        ...worker,
        state: stateName,
        wageZone,
        scheduledEmployment,
        skillCategory,
        isOnProbation,
        wageConfig: draftWageConfig,
      },
      orgSettings || undefined
    );

    const bd =
      balanced.type === 'MONTHLY' ? balanced.monthlyBreakdown : balanced.dailyBreakdown;
    if (bd) {
      setBasic(bd.basic || 0);
      setDa(bd.da || 0);
      setRetainingAllowance(bd.retainingAllowance || 0);
      setHra(bd.hra || 0);
      setTravel(bd.travel || 0);
      setMedical(bd.medical || 0);
      setOthers(bd.others || 0);
    }
    setAcknowledgedNonCompliant(false);
    toast.success('Rebalanced WageBase to 50% of Total Remuneration.');
  };

  const handleMatchMinimumWage = () => {
    const targetFloor = liveAudit.statutoryMinimumWageMonthly || stateMinInfo.monthlyFloor;
    if (wageType === 'MONTHLY') {
      setBasic(targetFloor);
    } else {
      setBasic(Math.ceil(targetFloor / dailyMultiplier));
    }
    toast.success(`Adjusted Basic Pay to meet ${stateName} (${wageZone}) statutory minimum wage.`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalConfig: WageConfig = {
        ...draftWageConfig,
        complianceStatus: liveAudit.status,
        complianceFlags: liveAudit.complianceFlags,
        wageAuditSummary: liveAudit,
        acknowledgedNonCompliant: liveAudit.isFiftyPercentNonCompliant
          ? acknowledgedNonCompliant || true
          : false,
      };

      const isAmountChanged =
        worker.wageConfig?.amount !== finalConfig.amount ||
        JSON.stringify(worker.wageConfig?.monthlyBreakdown) !==
          JSON.stringify(finalConfig.monthlyBreakdown) ||
        JSON.stringify(worker.wageConfig?.dailyBreakdown) !==
          JSON.stringify(finalConfig.dailyBreakdown);

      const updatePayload: Partial<Worker> = {
        state: stateName,
        wageZone,
        scheduledEmployment,
        skillCategory,
        isOnProbation,
        wageType: finalConfig.type,
        monthlySalary: finalConfig.type === 'MONTHLY' ? finalConfig.amount : undefined,
        dailyWage: finalConfig.type === 'DAILY' ? finalConfig.amount : undefined,
        wageConfig: finalConfig,
      };

      if (revisionDate) {
        updatePayload.salaryRevisionDate = revisionDate;
        if (isAmountChanged && worker.wageConfig) {
          updatePayload.previousWageConfig = worker.wageConfig;
          updatePayload.previousWageAmount = worker.wageConfig.amount;
        }
      }

      // Clean undefined keys before Firestore write
      Object.keys(updatePayload).forEach((k) => {
        if ((updatePayload as any)[k] === undefined) {
          delete (updatePayload as any)[k];
        }
      });

      await dbService.updateWorker(worker.id, updatePayload);
      const merged: Worker = { ...worker, ...updatePayload };
      toast.success(
        liveAudit.isFiftyPercentNonCompliant
          ? `Saved ${worker.name}'s structure as NON_COMPLIANT (flagged in payroll)`
          : `Updated ${worker.name}'s compliant wage structure`
      );
      onSaved(merged);
      onClose();
    } catch (err: any) {
      toast.error(`Failed to update wage structure: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const unitLabel = wageType === 'DAILY' ? '/ day' : '/ month';

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">
              Edit Salary Structure &amp; 50% Rule Audit
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {worker.name} · {worker.designation || 'Worker'} ({worker.department || 'General'})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Keyboard-Aware Scrollable Body + Sticky Footer */}
        <KeyboardAwareFormContainer
          onFinalFieldSubmit={handleSave}
          extraBottomPadding={40}
          className="p-4 sm:p-6 space-y-5 flex-1"
          footerClassName="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200"
          stickyFooter={
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 min-h-[2.75rem] rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || liveAudit.totalRemuneration <= 0}
                className={`px-5 py-2.5 min-h-[2.75rem] rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 ${
                  liveAudit.isFiftyPercentNonCompliant
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>
                  {liveAudit.isFiftyPercentNonCompliant
                    ? 'Save as NON_COMPLIANT'
                    : 'Save Compliant Structure'}
                </span>
              </button>
            </div>
          }
        >
          {/* Wage Type + State + Revision Effective Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Wage Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setWageType('MONTHLY')}
                  className={`py-2 px-2 min-h-11 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 cursor-pointer ${
                    wageType === 'MONTHLY'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <Calendar size={13} /> Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setWageType('DAILY')}
                  className={`py-2 px-2 min-h-11 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 cursor-pointer ${
                    wageType === 'DAILY'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <Clock size={13} /> Daily
                </button>
              </div>
            </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Work State (Location)
                </label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-3.5 text-slate-400" />
                  <select
                    value={stateName}
                    onChange={(e) => {
                      const nextState = e.target.value;
                      setStateName(nextState);
                      setWageZone(getDefaultZoneForState(nextState));
                    }}
                    className="w-full pl-8 pr-3 py-2.5 min-h-11 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-blue-600"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                  <History size={11} /> Mid-Year Revision Date
                </label>
                <ModalDatePicker
                  fieldName="revisionDate"
                  label="Mid-Year Revision Date"
                  placeholder="Select revision date"
                  value={revisionDate}
                  onChange={(iso) => setRevisionDate(iso)}
                />
              </div>
            </div>

            {/* Minimum Wage Classification Row: Zone, Skill Level, Scheduled Employment & Probation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Minimum Wage Zone
                </label>
                <select
                  value={wageZone}
                  onChange={(e) => setWageZone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-blue-600"
                >
                  {availableZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Skill Category
                </label>
                <select
                  value={skillCategory}
                  onChange={(e) => setSkillCategory(e.target.value as WorkerSkillCategory)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-blue-600"
                >
                  {(Object.keys(SKILL_LEVEL_LABELS) as WorkerSkillCategory[]).map((sk) => (
                    <option key={sk} value={sk}>
                      {SKILL_LEVEL_LABELS[sk]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Scheduled Employment
                </label>
                <select
                  value={scheduledEmployment}
                  onChange={(e) => setScheduledEmployment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-blue-600"
                >
                  {SCHEDULED_EMPLOYMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isOnProbation}
                    onChange={(e) => setIsOnProbation(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 rounded"
                  />
                  <span>Employee on Probation Period</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    (Minimum wage strictly applies — no exemption)
                  </span>
                </label>
                <span className="text-[11px] font-mono tabular-nums text-slate-600">
                  Notif. {stateMinInfo.entry.notificationDate}
                </span>
              </div>
            </div>

            {wageType === 'DAILY' && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-blue-950 block">
                    Daily Wage Monthly Equivalent Multiplier
                  </span>
                  <span className="text-[11px] text-blue-700">
                    Daily components × {dailyMultiplier} days are used to audit the 50% Rule &amp; Minimum Wage.
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {([26, 30] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDailyMultiplier(m)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        dailyMultiplier === m
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-blue-800 border-blue-200'
                      }`}
                    >
                      × {m} Days
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* WageBase Components */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  1. WageBase Components (Qualifying Wages {unitLabel})
                </h3>
                <span className="text-[11px] font-mono tabular-nums font-bold text-slate-600">
                  Min Floor: ₹{liveAudit.statutoryMinimumWageMonthly.toLocaleString('en-IN')}/mo (₹
                  {liveAudit.statutoryMinimumWageDaily}/day)
                </span>
              </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Basic Pay ({unitLabel}) *
                </label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="next"
                    min="0"
                    value={basic || ''}
                    onChange={(e) => setBasic(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  DA (Dearness Allow.)
                </label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="next"
                    min="0"
                    value={da || ''}
                    onChange={(e) => setDa(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Retaining Allowance
                </label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="next"
                    min="0"
                    value={retainingAllowance || ''}
                    onChange={(e) => setRetainingAllowance(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Excluded Components */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              2. Excluded Components ({unitLabel})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  HRA
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  min="0"
                  value={hra || ''}
                  onChange={(e) => setHra(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Travel Allow.
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  min="0"
                  value={travel || ''}
                  onChange={(e) => setTravel(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Medical Allow.
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  min="0"
                  value={medical || ''}
                  onChange={(e) => setMedical(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Other Allow.
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  min="0"
                  value={others || ''}
                  onChange={(e) => setOthers(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 min-h-11 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Employer Contributions (Explicitly Excluded) */}
          <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-200/70 space-y-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950">
                3. Employer Contributions (Excluded from 50% Rule Denominator)
              </h3>
              <p className="text-[11px] text-indigo-700 mt-0.5">
                Included in total CTC package display but explicitly excluded from Total Remuneration for the 50% threshold check.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-indigo-900 uppercase block mb-1">
                  Employer PF ({unitLabel})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  min="0"
                  value={employerPf || ''}
                  onChange={(e) => setEmployerPf(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 min-h-11 bg-white border border-indigo-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-indigo-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-indigo-900 uppercase block mb-1">
                  Employer Gratuity ({unitLabel})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min="0"
                  value={employerGratuity || ''}
                  onChange={(e) => setEmployerGratuity(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 min-h-11 bg-white border border-indigo-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Live Validator Output */}
          <WageStructureValidatorCard
            audit={liveAudit}
            acknowledgedNonCompliant={acknowledgedNonCompliant}
            onAcknowledgeChange={setAcknowledgedNonCompliant}
            onAutoRebalance={handleAutoRebalance}
            onMatchMinimumWage={handleMatchMinimumWage}
          />
        </KeyboardAwareFormContainer>
      </div>
    </div>
  );
};
