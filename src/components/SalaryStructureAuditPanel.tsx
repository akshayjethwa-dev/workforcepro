import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Play,
  Download,
  Loader2,
  AlertTriangle,
  Edit3,
  Scale,
  Calendar,
  Cloud,
  Cpu,
  Calculator,
} from 'lucide-react';
import {
  OrgSettings,
  SalaryStructureAuditReport,
  WageStructureAuditResult,
  Worker,
} from '../types/index';
import { dbService } from '../services/db';
import { runServerSalaryStructureAudit } from '../services/wageStructureValidationService';
import { WageStructureEditorModal } from './WageStructureEditorModal';
import { useToast } from '../contexts/ToastContext';

interface Props {
  tenantId: string;
  orgSettings?: OrgSettings | null;
  onOpenCtcSimulator?: () => void;
}

export const SalaryStructureAuditPanel: React.FC<Props> = ({ tenantId, orgSettings, onOpenCtcSimulator }) => {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<SalaryStructureAuditReport | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filterMode, setFilterMode] = useState<'NON_COMPLIANT' | 'MIN_WAGE' | 'ALL'>('NON_COMPLIANT');
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  const handleRunAudit = async (overrideWorkers?: Worker[]) => {
    if (!tenantId) return;
    setRunning(true);
    try {
      const fetchedWorkers = overrideWorkers || (await dbService.getWorkers(tenantId));
      setWorkers(fetchedWorkers);
      const auditReport = await runServerSalaryStructureAudit(
        tenantId,
        fetchedWorkers,
        orgSettings || undefined,
        asOfDate
      );
      setReport(auditReport);

      const flaggedCount = auditReport.results.filter((r) => r.hasAnyViolation).length;
      if (flaggedCount === 0) {
        toast.success(`All ${auditReport.totalWorkersAudited} active workers comply with the 50% Rule & Minimum Wage!`);
      } else {
        toast.warning(`Audit found ${auditReport.nonCompliantCount} non-compliant structure(s) and ${auditReport.minimumWageViolationCount} minimum wage violation(s).`);
      }
    } catch (err: any) {
      toast.error(`Audit failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!report) return [];
    if (filterMode === 'NON_COMPLIANT') {
      return report.results.filter((r) => r.hasAnyViolation);
    }
    if (filterMode === 'MIN_WAGE') {
      return report.results.filter((r) => r.isMinimumWageViolation);
    }
    return report.results;
  }, [report, filterMode]);

  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      'Worker Name',
      'Wage Type',
      'State',
      'Wage Zone',
      'Scheduled Employment',
      'Skill Category',
      'Work Location Source',
      'On Probation',
      'Evaluation Date',
      'Basic Pay',
      'DA',
      'Retaining Allowance',
      'WageBase',
      'HRA',
      'Travel',
      'Medical',
      'Other Allowances',
      'ExcludedComponents',
      'Employer PF (Excluded)',
      'Employer Gratuity (Excluded)',
      'Total Remuneration (50% Denom)',
      '50% Threshold',
      'Status',
      'Gap Amount',
      'Notional Add-Back',
      'CompliantWageBase',
      'Additional Gratuity / Mo',
      'Additional Gratuity / Yr',
      'Min Wage Floor',
      'Min Wage Gap',
      'Min Wage Notification Date',
      'Flags',
    ];

    const rows = report.results.map((r) => [
      `"${(r.workerName || '').replace(/"/g, '""')}"`,
      r.wageType === 'DAILY' ? `DAILY_x${r.dailyMultiplier || 26}` : 'MONTHLY',
      `"${r.state}"`,
      `"${r.wageZone || ''}"`,
      `"${r.scheduledEmployment || ''}"`,
      r.skillCategory,
      r.workLocationSource,
      r.isOnProbation ? 'YES' : 'NO',
      r.evaluationDate,
      r.basicPay,
      r.da,
      r.retainingAllowance,
      r.wageBase,
      r.hra,
      r.travelAllowance,
      r.medicalAllowance,
      r.otherAllowances,
      r.excludedComponents,
      r.employerPf,
      r.employerGratuity,
      r.totalRemuneration,
      r.fiftyPercentThreshold,
      r.status,
      r.gapAmount,
      r.deemedWageAddBack,
      r.compliantWageBase ?? (r.wageBase + r.deemedWageAddBack),
      r.estimatedAdditionalGratuityMonthly,
      r.estimatedAdditionalGratuityAnnual ?? Math.round((r.deemedWageAddBack * 15) / 26),
      r.statutoryMinimumWageMonthly,
      r.minimumWageGap,
      r.minimumWageNotificationDate || '',
      `"${r.complianceFlags.join('; ')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Salary_Structure_50Pct_Audit_${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Salary Structure Audit CSV exported.');
  };

  return (
    <div className="space-y-4">
      <div className="px-1 mb-1">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
          3. Wage Structure Validation &amp; 50% Rule Audit (Code on Wages)
        </h3>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
        {/* Header & Run Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Salary Structure Audit Report
              </h4>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xl leading-relaxed">
                Audits every active employee against the 50% Basic Wage Rule (
                <span className="font-mono text-slate-700">
                  WageBase = Basic + DA + Retaining
                </span>{' '}
                vs{' '}
                <span className="font-mono text-slate-700">
                  Excluded = HRA + Travel + Medical + Others
                </span>
                ), excluding Employer PF/Gratuity from the denominator, plus State Minimum Wage floors and Daily Wage monthly equivalents (×26 / ×30).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">As-Of:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="text-xs font-mono font-bold text-slate-800 bg-transparent outline-none"
                title="Evaluation date (applies mid-year salary revisions effective on or before this date)"
              />
            </div>

            <button
              type="button"
              onClick={() => handleRunAudit()}
              disabled={running}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-60"
            >
              {running ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Play size={14} className="text-emerald-400 fill-emerald-400" />
              )}
              <span>{running ? 'Running Audit...' : 'Run Salary Structure Audit'}</span>
            </button>
          </div>
        </div>

        {/* Report Body */}
        {report ? (
          <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in">
            {/* Meta strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                  {report.verificationSource === 'CLOUD_FUNCTION' ? (
                    <>
                      <Cloud size={12} className="text-blue-600" /> Verified via Server Cloud Function
                    </>
                  ) : (
                    <>
                      <Cpu size={12} className="text-indigo-600" /> Audited via Statutory Engine (Effective {report.asOfDate})
                    </>
                  )}
                </span>
                <span className="font-mono">
                  Audited: {new Date(report.auditedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onOpenCtcSimulator && (
                  <button
                    type="button"
                    onClick={onOpenCtcSimulator}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Calculator size={13} className="text-emerald-400" />
                    <span>Fix in CTC Simulator</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} className="text-blue-600" />
                  <span>Export Audit CSV</span>
                </button>
              </div>
            </div>

            {/* KPI Grid */}
            {(() => {
              const totalGratMo = Math.round(
                report.results.reduce((s, r) => s + (r.estimatedAdditionalGratuityMonthly || 0), 0)
              );
              const totalGratYr = Math.round(
                report.results.reduce(
                  (s, r) => s + (r.estimatedAdditionalGratuityAnnual ?? Math.round((r.deemedWageAddBack * 15) / 26)),
                  0
                )
              );
              return (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Workers Audited
                    </span>
                    <span className="text-lg font-extrabold font-mono text-slate-900">
                      {report.totalWorkersAudited}
                    </span>
                  </div>
                  <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">
                      50% Compliant
                    </span>
                    <span className="text-lg font-extrabold font-mono text-emerald-700">
                      {report.compliantCount}
                    </span>
                  </div>
                  <div className="bg-rose-50/80 p-3 rounded-2xl border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-700 uppercase block">
                      NON_COMPLIANT
                    </span>
                    <span className="text-lg font-extrabold font-mono text-rose-700">
                      {report.nonCompliantCount}
                    </span>
                  </div>
                  <div className="bg-amber-50/80 p-3 rounded-2xl border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">
                      Min Wage Violations
                    </span>
                    <span className="text-lg font-extrabold font-mono text-amber-800">
                      {report.minimumWageViolationCount}
                    </span>
                  </div>
                  <div className="bg-slate-900 text-white p-3 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Total Gap / Mo
                    </span>
                    <span className="text-lg font-extrabold font-mono text-rose-400">
                      ₹{report.totalComplianceGapMonthly.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="bg-indigo-950 text-white p-3 rounded-2xl">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase block">
                      Gratuity Impact
                    </span>
                    <span className="text-lg font-extrabold font-mono text-amber-300">
                      +₹{totalGratYr.toLocaleString('en-IN')}/yr
                    </span>
                    <span className="block text-[10px] font-mono text-indigo-200">
                      (+₹{totalGratMo.toLocaleString('en-IN')}/mo accrual)
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterMode('NON_COMPLIANT')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  filterMode === 'NON_COMPLIANT'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Non-Compliant / Flagged ({report.results.filter((r) => r.hasAnyViolation).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('MIN_WAGE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  filterMode === 'MIN_WAGE'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Minimum Wage Violations ({report.minimumWageViolationCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  filterMode === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                All Active Workers ({report.results.length})
              </button>
            </div>

            {/* Results List */}
            {filteredResults.length === 0 ? (
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-6 text-center">
                <CheckCircle2 size={28} className="text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-emerald-950">
                  No violations found in this view
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  All matching workers satisfy the selected compliance criteria as of {report.asOfDate}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredResults.map((res: WageStructureAuditResult) => {
                  const matchedWorker = workers.find((w) => w.id === res.workerId) || null;
                  return (
                    <div
                      key={res.workerId || res.workerName}
                      className={`rounded-2xl border p-4 transition-all ${
                        res.isFiftyPercentNonCompliant
                          ? 'bg-rose-50/40 border-rose-200'
                          : res.isMinimumWageViolation
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-slate-50/60 border-slate-200/80'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">
                              {res.workerName}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-600">
                              {res.wageType === 'DAILY'
                                ? `Daily × ${res.dailyMultiplier || 26}`
                                : 'Monthly'}
                              {' · '}
                              {res.state} ({res.wageZone})
                              {' · '}
                              {res.scheduledEmployment}
                              {' · '}
                              {res.skillCategory.replace('_', '-')}
                            </span>
                            {res.workLocationSource === 'BRANCH_LOCATION' && (
                              <span className="text-[10px] font-semibold text-indigo-700">
                                · Branch Work Location
                              </span>
                            )}
                            {res.isOnProbation && (
                              <span className="text-[10px] font-semibold text-slate-700">
                                · Probation Active (Min Wage Enforced)
                              </span>
                            )}
                            {res.effectiveRevisionDate && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[10px] font-mono font-bold text-indigo-700">
                                Rev. {res.effectiveRevisionDate} ({res.revisionApplied ? 'Active' : 'Pre-Revision'})
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-700">
                            <span>
                              Basic: <strong>₹{res.basicPay.toLocaleString('en-IN')}</strong>
                            </span>
                            <span>
                              Min Floor: <strong>₹{res.statutoryMinimumWageMonthly.toLocaleString('en-IN')}</strong> (Notif. {res.minimumWageNotificationDate})
                            </span>
                            <span>
                              WageBase: <strong>₹{res.wageBase.toLocaleString('en-IN')}</strong> ({res.wageBasePercentage}%)
                            </span>
                            <span>
                              Excluded: <strong className={res.isFiftyPercentNonCompliant ? 'text-rose-700' : ''}>₹{res.excludedComponents.toLocaleString('en-IN')}</strong> ({res.excludedPercentage}%)
                            </span>
                            {res.gapAmount > 0 && (
                              <span className="text-rose-700 font-black">
                                50% Gap: ₹{res.gapAmount.toLocaleString('en-IN')}/mo
                              </span>
                            )}
                            {res.minimumWageGap > 0 && (
                              <span className="text-rose-700 font-black">
                                Min Wage Gap: ₹{res.minimumWageGap.toLocaleString('en-IN')}/mo
                              </span>
                            )}
                          </div>

                          {res.midMonthRevisionInfo?.isRevisedInMonth && (
                            <div className="mt-1.5 text-[11px] font-mono tabular-nums text-amber-900 bg-white/80 px-2.5 py-1 rounded-xl border border-amber-200">
                              Mid-Month Revision Pro-Rated (eff. {res.midMonthRevisionInfo.revisionDate}):{' '}
                              {res.midMonthRevisionInfo.daysAtPreviousRate}d @ ₹{res.midMonthRevisionInfo.previousMonthlyFloor.toLocaleString('en-IN')} +{' '}
                              {res.midMonthRevisionInfo.daysAtRevisedRate}d @ ₹{res.midMonthRevisionInfo.revisedMonthlyFloor.toLocaleString('en-IN')} ={' '}
                              <strong>₹{res.midMonthRevisionInfo.proratedMonthlyFloor.toLocaleString('en-IN')}/mo</strong>
                            </div>
                          )}

                          {res.deemedWageAddBack > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono bg-white/80 px-2.5 py-1.5 rounded-xl border border-rose-200/80 text-slate-800">
                              <span>
                                CompliantWageBase:{' '}
                                <strong className="text-slate-950">
                                  ₹{(res.compliantWageBase ?? (res.wageBase + res.deemedWageAddBack)).toLocaleString('en-IN')}
                                </strong>{' '}
                                <span className="text-amber-700">
                                  (+₹{res.deemedWageAddBack.toLocaleString('en-IN')} Notional Add-Back)
                                </span>
                              </span>
                              <span className="text-rose-700 font-bold">
                                Projected Gratuity Increase: +₹{res.estimatedAdditionalGratuityMonthly.toLocaleString('en-IN')}/mo (+₹{(res.estimatedAdditionalGratuityAnnual ?? Math.round((res.deemedWageAddBack * 15) / 26)).toLocaleString('en-IN')}/yr)
                              </span>
                            </div>
                          )}

                          {res.warningMessage && (
                            <p className="text-[11px] text-rose-800 font-semibold mt-1.5 flex items-center gap-1">
                              <AlertTriangle size={12} className="shrink-0 text-rose-600" />
                              <span>{res.warningMessage}</span>
                            </p>
                          )}
                          {res.minimumWageWarning && (
                            <p className="text-[11px] text-rose-900 font-semibold mt-1 flex items-center gap-1">
                              <Scale size={12} className="shrink-0 text-rose-700" />
                              <span>{res.minimumWageWarning}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black font-mono uppercase border ${
                              res.isFiftyPercentNonCompliant
                                ? 'bg-rose-600 text-white border-rose-700'
                                : 'bg-emerald-600 text-white border-emerald-700'
                            }`}
                          >
                            {res.status}
                          </span>
                          {res.isMinimumWageViolation && (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black font-mono uppercase bg-amber-600 text-white border border-amber-700">
                              MINIMUM_WAGE_VIOLATION
                            </span>
                          )}
                          {matchedWorker && (
                            <button
                              type="button"
                              onClick={() => setEditingWorker(matchedWorker)}
                              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Edit3 size={12} className="text-blue-600" />
                              <span>Fix Structure</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center">
            <p className="text-xs font-semibold text-slate-600">
              Click <strong>Run Salary Structure Audit</strong> to inspect all active workers for 50% Wage Rule &amp; State Minimum Wage compliance.
            </p>
          </div>
        )}
      </div>

      {/* Inline Editor Modal to fix non-compliant structures right from Audit Report */}
      <WageStructureEditorModal
        isOpen={Boolean(editingWorker)}
        worker={editingWorker}
        orgSettings={orgSettings}
        onClose={() => setEditingWorker(null)}
        onSaved={(updated) => {
          const nextWorkers = workers.map((w) => (w.id === updated.id ? updated : w));
          setWorkers(nextWorkers);
          handleRunAudit(nextWorkers);
        }}
      />
    </div>
  );
};
