import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Wand2,
  Info,
  Scale,
} from 'lucide-react';
import { WageStructureAuditResult } from '../types/index';

interface Props {
  audit: WageStructureAuditResult;
  acknowledgedNonCompliant?: boolean;
  onAcknowledgeChange?: (checked: boolean) => void;
  onAutoRebalance?: () => void;
  onMatchMinimumWage?: () => void;
  compact?: boolean;
}

export const WageStructureValidatorCard: React.FC<Props> = ({
  audit,
  acknowledgedNonCompliant = false,
  onAcknowledgeChange,
  onAutoRebalance,
  onMatchMinimumWage,
  compact = false,
}) => {
  const basicPctClamped = Math.min(100, Math.max(0, audit.wageBasePercentage));
  const excludedPctClamped = Math.min(100, Math.max(0, audit.excludedPercentage));

  return (
    <div className="space-y-3">
      {/* LIVE 50% RULE METRICS CARD */}
      <div
        className={`rounded-2xl border p-4 transition-all ${
          audit.isFiftyPercentNonCompliant
            ? 'bg-rose-50/70 border-rose-200'
            : 'bg-emerald-50/60 border-emerald-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {audit.isFiftyPercentNonCompliant ? (
              <ShieldAlert size={18} className="text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            )}
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Code on Wages 50% Rule Audit
              </h4>
              <p className="text-[11px] text-slate-600">
                {audit.wageType === 'DAILY'
                  ? `Daily Wage Monthly Equivalent (Daily Rate × ${audit.dailyMultiplier || 26} days)`
                  : 'Monthly Salary Structure'}
                {audit.effectiveRevisionDate && (
                  <span className="ml-1.5 font-mono text-indigo-700 font-semibold">
                    · Effective {audit.effectiveRevisionDate}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black font-mono uppercase border ${
                audit.isFiftyPercentNonCompliant
                  ? 'bg-rose-600 text-white border-rose-700'
                  : 'bg-emerald-600 text-white border-emerald-700'
              }`}
            >
              {audit.status}
            </span>
            {audit.isMinimumWageViolation && (
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-black font-mono uppercase bg-amber-600 text-white border border-amber-700">
                MINIMUM_WAGE_VIOLATION
              </span>
            )}
          </div>
        </div>

        {/* 50% RATIO VISUAL BAR */}
        <div className="mb-3">
          <div className="flex justify-between text-[11px] font-mono font-bold mb-1">
            <span className="text-slate-700">
              WageBase: {audit.wageBasePercentage}% (Min 50%)
            </span>
            <span
              className={
                audit.isFiftyPercentNonCompliant ? 'text-rose-700' : 'text-slate-600'
              }
            >
              Excluded: {audit.excludedPercentage}% (Max 50%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex relative">
            <div
              className={`h-full transition-all duration-300 ${
                audit.isFiftyPercentNonCompliant ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${basicPctClamped}%` }}
            />
            <div
              className={`h-full transition-all duration-300 ${
                audit.isFiftyPercentNonCompliant ? 'bg-rose-500' : 'bg-slate-400'
              }`}
              style={{ width: `${excludedPctClamped}%` }}
            />
            {/* 50% Midline Marker */}
            <div
              className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-900/70"
              title="50% Statutory Threshold"
            />
          </div>
        </div>

        {/* FORMULA GRID */}
        <div
          className={`grid ${
            compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
          } gap-2.5 text-xs`}
        >
          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">
              WageBase (Basic+DA+Ret)
            </span>
            <span className="font-mono font-extrabold text-sm text-slate-900">
              ₹{audit.wageBase.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">
              Excluded Allowances
            </span>
            <span
              className={`font-mono font-extrabold text-sm ${
                audit.isFiftyPercentNonCompliant ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              ₹{audit.excludedComponents.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">
              50% Threshold
            </span>
            <span className="font-mono font-extrabold text-sm text-slate-900">
              ₹{audit.fiftyPercentThreshold.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">
              Remuneration (Denom.)
            </span>
            <span className="font-mono font-extrabold text-sm text-slate-900">
              ₹{audit.totalRemuneration.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* EMPLOYER CONTRIBUTIONS EXCLUSION NOTICE */}
        <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-600 bg-white/70 px-3 py-2 rounded-xl border border-slate-200/70">
          <span className="flex items-center gap-1.5">
            <Info size={13} className="text-blue-600 shrink-0" />
            <span>
              Employer PF (₹{audit.employerPf.toLocaleString('en-IN')}) + Gratuity (₹
              {audit.employerGratuity.toLocaleString('en-IN')}) are{' '}
              <strong>excluded</strong> from Total Remuneration denominator.
            </span>
          </span>
          {audit.employerContributionsExcluded > 0 && (
            <span className="font-mono font-bold text-slate-800">
              Total Package CTC: ₹{audit.totalCtcWithEmployer.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>

      {/* NON_COMPLIANT WARNING BANNER (EXACT AC WORDING + GAP AMOUNT) */}
      {audit.isFiftyPercentNonCompliant && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs sm:text-sm font-black text-rose-950">
                Your basic pay is less than 50% of CTC. This will increase PF/Gratuity liabilities.
              </h5>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-xl px-3 py-2 border border-rose-200">
                  <span className="text-[10px] font-bold text-rose-700 uppercase block">
                    Compliance Gap Amount
                  </span>
                  <span className="font-mono font-black text-base text-rose-700">
                    ₹{audit.gapAmount.toLocaleString('en-IN')} / mo
                  </span>
                </div>
                <div className="bg-white rounded-xl px-3 py-2 border border-rose-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Est. Extra PF Impact
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    +₹{audit.estimatedAdditionalPfMonthly.toLocaleString('en-IN')} / mo
                  </span>
                </div>
                <div className="bg-white rounded-xl px-3 py-2 border border-rose-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Est. Extra Gratuity
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    +₹{audit.estimatedAdditionalGratuityMonthly.toLocaleString('en-IN')} / mo
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-rose-800 mt-2">
                Excluded components (₹{audit.excludedComponents.toLocaleString('en-IN')}) exceed 50% of Total Remuneration (₹
                {audit.fiftyPercentThreshold.toLocaleString('en-IN')}) by{' '}
                <strong>₹{audit.gapAmount.toLocaleString('en-IN')}</strong>. Shift ₹
                {audit.gapAmount.toLocaleString('en-IN')} into Basic Pay, DA, or Retaining Allowance to become compliant.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rose-200">
            {onAutoRebalance && (
              <button
                type="button"
                onClick={onAutoRebalance}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Wand2 size={14} className="text-amber-300" />
                <span>Auto-Adjust Basic to 50% (+₹{audit.gapAmount.toLocaleString('en-IN')})</span>
              </button>
            )}

            {onAcknowledgeChange && (
              <label className="flex items-center gap-2 text-xs font-bold text-rose-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledgedNonCompliant}
                  onChange={(e) => onAcknowledgeChange(e.target.checked)}
                  className="w-4 h-4 accent-rose-600 rounded"
                />
                <span>Save anyway as NON_COMPLIANT (flagged in payroll)</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* MINIMUM WAGE VIOLATION BLOCKING ERROR */}
      {audit.isMinimumWageViolation ? (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 shadow-xs space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Scale size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h5 className="text-xs sm:text-sm font-black text-rose-950 font-mono">
                    BLOCKING ERROR: MINIMUM_WAGE_VIOLATION
                  </h5>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-rose-800">
                    {audit.state} · {audit.wageZone} · {audit.scheduledEmployment}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-white rounded-xl px-3 py-2 border border-rose-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Statutory Min Floor
                    </span>
                    <span className="font-mono tabular-nums font-black text-sm text-slate-900">
                      ₹{audit.statutoryMinimumWageMonthly.toLocaleString('en-IN')}/mo
                    </span>
                    <span className="block text-[10px] font-mono tabular-nums text-slate-500">
                      ₹{audit.statutoryMinimumWageDaily.toLocaleString('en-IN')}/day · {audit.skillCategory.replace('_', '-')}
                    </span>
                  </div>
                  <div className="bg-white rounded-xl px-3 py-2 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-700 uppercase block">
                      Minimum Wage Gap
                    </span>
                    <span className="font-mono tabular-nums font-black text-sm text-rose-700">
                      ₹{audit.minimumWageGap.toLocaleString('en-IN')}/mo
                    </span>
                    <span className="block text-[10px] font-mono tabular-nums text-slate-500">
                      Basic: ₹{audit.basicPay.toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                  <div className="bg-white rounded-xl px-3 py-2 border border-rose-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      State Notification Date
                    </span>
                    <span className="font-mono tabular-nums font-bold text-sm text-slate-900">
                      {audit.minimumWageNotificationDate}
                    </span>
                    <span className="block text-[10px] text-slate-500 truncate" title={audit.minimumWageNotificationRef}>
                      {audit.minimumWageNotificationRef}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-rose-900 mt-2">
                  Payroll finalization is <strong>blocked</strong> under the Code on Wages until Basic Pay meets the state floor.
                  {audit.wageType === 'DAILY' && (
                    <span className="font-mono tabular-nums"> (Daily Basic × {audit.dailyMultiplier || 26} = ₹{audit.basicPay.toLocaleString('en-IN')}/mo)</span>
                  )}
                </p>

                {audit.midMonthRevisionInfo?.isRevisedInMonth && (
                  <div className="mt-2 bg-white border border-amber-200 rounded-xl px-3 py-2 text-[11px] font-mono tabular-nums text-amber-950">
                    <strong>Mid-Month Revision Pro-Rated (eff. {audit.midMonthRevisionInfo.revisionDate}):</strong>{' '}
                    {audit.midMonthRevisionInfo.daysAtPreviousRate}d @ ₹{audit.midMonthRevisionInfo.previousMonthlyFloor.toLocaleString('en-IN')} +{' '}
                    {audit.midMonthRevisionInfo.daysAtRevisedRate}d @ ₹{audit.midMonthRevisionInfo.revisedMonthlyFloor.toLocaleString('en-IN')} ={' '}
                    <strong>₹{audit.midMonthRevisionInfo.proratedMonthlyFloor.toLocaleString('en-IN')}/mo</strong>
                  </div>
                )}

                {audit.isOnProbation && (
                  <p className="text-[11px] font-semibold text-rose-900 mt-1.5">
                    Probation Notice: Employee is on probation — minimum wage applies without exemption.
                  </p>
                )}
              </div>
            </div>

            {onMatchMinimumWage && (
              <button
                type="button"
                onClick={onMatchMinimumWage}
                className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shrink-0 cursor-pointer transition-all"
              >
                Raise Basic to ₹{audit.statutoryMinimumWageMonthly.toLocaleString('en-IN')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-3 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Scale size={14} className="text-emerald-600 shrink-0" />
            <span className="font-bold text-slate-800">Minimum Wage Cleared</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{audit.state} ({audit.wageZone})</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{audit.scheduledEmployment}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums">
              Floor ₹{audit.statutoryMinimumWageMonthly.toLocaleString('en-IN')}/mo
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-500">
              Notif. {audit.minimumWageNotificationDate}
            </span>
          </div>
          {audit.isOnProbation && (
            <span className="text-[10px] font-semibold text-slate-700">
              Probation active (Min wage enforced)
            </span>
          )}
        </div>
      )}
    </div>
  );
};
