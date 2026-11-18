import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FileWarning,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  AttendanceRecord,
  EcrValidatedWorkerRow,
  EcrValidationReport,
  MonthlyPayroll,
  OrgSettings,
  SupplementaryEcrPendingItem,
  Worker,
} from '../types/index';
import { ecrValidatorService } from '../services/ecrValidatorService';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';

export interface EcrValidatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  month: string;
  workers: Worker[];
  payrolls?: MonthlyPayroll[];
  attendance?: AttendanceRecord[];
  orgSettings?: OrgSettings | null;
  onWorkerUpdated?: (updatedWorker: Worker) => void;
}

type RowFilterTab = 'ALL' | 'FAILED' | 'PASSED' | 'EXCLUDED';

export const EcrValidatorModal: React.FC<EcrValidatorModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  month,
  workers,
  payrolls = [],
  attendance = [],
  orgSettings,
  onWorkerUpdated,
}) => {
  const { toast } = useToast();

  const [localWorkers, setLocalWorkers] = useState<Worker[]>(workers);
  const [mode, setMode] = useState<'PRIMARY' | 'SUPPLEMENTARY'>('PRIMARY');
  const [filterTab, setFilterTab] = useState<RowFilterTab>('ALL');
  const [statutoryCeiling, setStatutoryCeiling] = useState<number>(
    orgSettings?.compliance?.epfNotificationCeiling || 25000
  );
  const [capWageAtCeiling, setCapWageAtCeiling] = useState<boolean>(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [forceCapIds, setForceCapIds] = useState<Set<string>>(new Set());
  const [confirmHigherWageIds, setConfirmHigherWageIds] = useState<Set<string>>(new Set());
  const [supplementaryQueue, setSupplementaryQueue] = useState<SupplementaryEcrPendingItem[]>([]);
  const [legalNameRefDraft, setLegalNameRefDraft] = useState<Record<string, string>>({});
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [lastPrimaryNotice, setLastPrimaryNotice] = useState<string | null>(null);

  useEffect(() => {
    setLocalWorkers(workers);
  }, [workers]);

  useEffect(() => {
    if (isOpen) {
      setStatutoryCeiling(orgSettings?.compliance?.epfNotificationCeiling || 25000);
      setSupplementaryQueue(ecrValidatorService.getSupplementaryQueue(tenantId, month));
      setExcludedIds(new Set());
      setForceCapIds(new Set());
      setConfirmHigherWageIds(new Set());
      setLastPrimaryNotice(null);
      setFilterTab('ALL');
    }
  }, [isOpen, tenantId, month, orgSettings]);

  const supplementaryWorkerIds = useMemo(
    () => supplementaryQueue.map(item => item.workerId),
    [supplementaryQueue]
  );

  const report: EcrValidationReport = useMemo(() => {
    return ecrValidatorService.validateAndGenerateECR(localWorkers, payrolls, attendance, {
      tenantId,
      month,
      mode,
      statutoryEpfCeiling: statutoryCeiling,
      capWageAtCeiling,
      excludeWorkerIds: Array.from(excludedIds),
      includeOnlyWorkerIds: mode === 'SUPPLEMENTARY' ? supplementaryWorkerIds : undefined,
      forceCapWorkerIds: Array.from(forceCapIds),
      confirmHigherWageWorkerIds: Array.from(confirmHigherWageIds),
      orgSettings: orgSettings || undefined,
    });
  }, [
    localWorkers,
    payrolls,
    attendance,
    tenantId,
    month,
    mode,
    statutoryCeiling,
    capWageAtCeiling,
    excludedIds,
    supplementaryWorkerIds,
    forceCapIds,
    confirmHigherWageIds,
    orgSettings,
  ]);

  const displayedRows = useMemo(() => {
    const activeRows = report.rows.filter(
      r => r.status !== 'OPTED_OUT' && r.status !== 'PRIOR_EXITED'
    );
    switch (filterTab) {
      case 'FAILED':
        return activeRows.filter(r => r.hasBlockingError || r.status === 'WARNING_ONLY');
      case 'PASSED':
        return activeRows.filter(r => r.willBeIncludedInFile);
      case 'EXCLUDED':
        return activeRows.filter(r => r.isExcluded);
      default:
        return activeRows;
    }
  }, [report.rows, filterTab]);

  if (!isOpen) return null;

  const persistWorkerUpdate = async (workerId: string, patch: Partial<Worker>, successMsg: string) => {
    try {
      setSavingWorkerId(workerId);
      await dbService.updateWorker(workerId, patch);
      let updatedObj: Worker | null = null;
      setLocalWorkers(prev =>
        prev.map(w => {
          if (w.id !== workerId) return w;
          updatedObj = { ...w, ...patch };
          return updatedObj;
        })
      );
      if (updatedObj && onWorkerUpdated) {
        onWorkerUpdated(updatedObj);
      }
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update employee EPFO record');
    } finally {
      setSavingWorkerId(null);
    }
  };

  const toggleExcludeWorker = (workerId: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(workerId)) {
        next.delete(workerId);
      } else {
        next.add(workerId);
      }
      return next;
    });
  };

  const handleExcludeAllFailed = () => {
    if (report.failedRows.length === 0) return;
    const next = new Set(excludedIds);
    report.failedRows.forEach(r => next.add(r.workerId));
    setExcludedIds(next);
    const updatedQueue = ecrValidatorService.addToSupplementaryQueue(
      tenantId,
      month,
      report.failedRows
    );
    setSupplementaryQueue(updatedQueue);
    toast.warning(
      `${report.failedRows.length} failing employee(s) excluded and queued for Supplementary ECR.`
    );
  };

  const triggerTextDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCleanEcr = () => {
    if (!report.canDownloadEcr || report.includedRows.length === 0) {
      toast.error('No passing non-excluded employees available to include in ECR.');
      return;
    }

    const failedOrExcluded = report.rows.filter(
      r => (r.hasBlockingError || r.isExcluded) && r.status !== 'OPTED_OUT' && r.status !== 'PRIOR_EXITED'
    );

    if (mode === 'PRIMARY' && failedOrExcluded.length > 0) {
      const updatedQueue = ecrValidatorService.addToSupplementaryQueue(
        tenantId,
        month,
        failedOrExcluded
      );
      setSupplementaryQueue(updatedQueue);
      setLastPrimaryNotice(
        `Clean Primary ECR downloaded with ${report.includedRows.length} valid member(s). ${failedOrExcluded.length} failed/excluded member(s) were omitted and saved to Supplementary ECR queue.`
      );
    } else if (mode === 'SUPPLEMENTARY') {
      const filedIds = report.includedRows.map(r => r.workerId);
      const remainingQueue = ecrValidatorService.removeWorkersFromSupplementaryQueue(
        tenantId,
        month,
        filedIds
      );
      setSupplementaryQueue(remainingQueue);
    }

    const suffix = mode === 'SUPPLEMENTARY' ? 'SUPPLEMENTARY_' : '';
    const fileName = `EPFO_ECR_2.0_${suffix}${month.replace('-', '')}.txt`;
    triggerTextDownload(fileName, report.ecrContent);
    toast.success(
      `${mode === 'SUPPLEMENTARY' ? 'Supplementary ' : ''}ECR downloaded (${report.includedRows.length} member${report.includedRows.length === 1 ? '' : 's'}).`
    );
  };

  const handleDownloadErrorReport = () => {
    triggerTextDownload(
      `EPFO_ECR_Validation_Report_${month.replace('-', '')}.txt`,
      report.errorReportText
    );
    toast.success('Human-readable EPFO pre-upload validation report downloaded.');
  };

  const renderStatusLabel = (row: EcrValidatedWorkerRow) => {
    if (row.isExcluded) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <UserX size={13} className="text-slate-500" />
          Excluded (Supplementary)
        </span>
      );
    }
    if (row.hasBlockingError) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
          <ShieldAlert size={13} className="text-rose-600" />
          Blocked
        </span>
      );
    }
    if (row.status === 'WARNING_ONLY') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
          <AlertTriangle size={13} className="text-amber-600" />
          Action Recommended
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 size={13} className="text-emerald-600" />
        EPFO Ready
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Pre-Upload EPFO ECR 2.0 Validator
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  Period {month}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Audits UAN status, Aadhaar &amp; Bank KYC, duplicate UANs, ₹25,000 wage ceiling, DOE exit marks, and UAN name matching prior to #~# generation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switch */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('PRIMARY')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  mode === 'PRIMARY'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Primary ECR
              </button>
              <button
                type="button"
                onClick={() => setMode('SUPPLEMENTARY')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors font-mono tabular-nums ${
                  mode === 'SUPPLEMENTARY'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Supplementary ({supplementaryQueue.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
              aria-label="Close ECR Validator"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-slate-800">
          {/* Notice after partial primary ECR download */}
          {lastPrimaryNotice && (
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <FileWarning size={16} className="text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{lastPrimaryNotice}</p>
                  <p className="text-amber-800 mt-0.5">
                    Fix their KYC/UAN/DOE details in this screen or Worker Statutory Profile, then switch to <strong>Supplementary ({supplementaryQueue.length})</strong> above to generate the supplementary ECR file.
                  </p>
                </div>
              </div>
              {supplementaryQueue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode('SUPPLEMENTARY')}
                  className="px-3 py-1.5 rounded-lg bg-amber-900 text-white font-semibold shrink-0 hover:bg-amber-800 transition-colors"
                >
                  Open Supplementary Queue
                </button>
              )}
            </div>
          )}

          {/* Supplementary Empty Notice */}
          {mode === 'SUPPLEMENTARY' && supplementaryQueue.length === 0 && (
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center space-y-2">
              <CheckCircle2 size={24} className="text-emerald-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">
                No Pending Employees in Supplementary Queue
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Employees excluded during Primary ECR generation appear here so you can fix their KYC, UAN, or DOE issues and file a supplementary ECR later.
              </p>
              <button
                type="button"
                onClick={() => setMode('PRIMARY')}
                className="mt-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Return to Primary ECR
              </button>
            </div>
          )}

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Eligible Evaluated
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {report.summary.eligibleForEcrCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                {report.summary.optedOutOrPriorExitedCount} opted-out/retired
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Clean for Upload
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-900">
                {report.summary.includedInFinalFileCount}
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5 font-mono tabular-nums">
                EE+ER: ₹{(report.summary.totalEeShare + report.summary.totalEpsShare + report.summary.totalErEpfShare).toLocaleString('en-IN')}
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">
                Failed Validation
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-rose-900">
                {report.summary.failedCount}
              </div>
              <div className="text-[11px] text-rose-700 mt-0.5">
                Omitted from clean ECR
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Excluded (Supp.)
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {report.summary.excludedCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Queue: {supplementaryQueue.length} pending
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white col-span-2 sm:col-span-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Challan Estimate
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                ₹{report.summary.totalChallanPayable.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                Incl. ₹{report.summary.totalAdminAndEdliCharges.toLocaleString('en-IN')} admin/EDLI
              </div>
            </div>
          </div>

          {/* Rules Configuration & Pre-Validation Diagnostics Strip */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <span>Statutory EPF Ceiling:</span>
                  <select
                    value={statutoryCeiling}
                    onChange={e => setStatutoryCeiling(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-xs font-semibold text-slate-900"
                  >
                    <option value={25000}>₹25,000 (Updated Notification)</option>
                    <option value={15000}>₹15,000 (Legacy Statutory Cap)</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={capWageAtCeiling}
                    onChange={e => setCapWageAtCeiling(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>Auto-cap EPF wages at ₹{statutoryCeiling.toLocaleString('en-IN')}</span>
                </label>
              </div>

              {report.failedRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleExcludeAllFailed}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-xs font-semibold text-rose-800 transition-colors flex items-center gap-1.5"
                >
                  <UserX size={14} />
                  <span>
                    Exclude {report.failedRows.length} Failed &amp; Queue Supplementary
                  </span>
                </button>
              )}
            </div>

            <div className="pt-2.5 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] font-mono tabular-nums">
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-sans text-slate-600">UAN Active</span>
                <span className={report.summary.missingOrInactiveUanCount > 0 ? 'font-bold text-rose-700' : 'font-semibold text-emerald-700'}>
                  {report.summary.missingOrInactiveUanCount > 0 ? `${report.summary.missingOrInactiveUanCount} fail` : 'OK'}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-sans text-slate-600">KYC Approved</span>
                <span className={report.summary.kycPendingCount > 0 ? 'font-bold text-rose-700' : 'font-semibold text-emerald-700'}>
                  {report.summary.kycPendingCount > 0 ? `${report.summary.kycPendingCount} fail` : 'OK'}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-sans text-slate-600">Duplicate UAN</span>
                <span className={report.summary.duplicateUanCount > 0 ? 'font-bold text-rose-700' : 'font-semibold text-emerald-700'}>
                  {report.summary.duplicateUanCount > 0 ? `${report.summary.duplicateUanCount} fail` : 'OK'}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-sans text-slate-600">Wage Ceiling</span>
                <span className={report.summary.wageCeilingExceededCount > 0 ? 'font-bold text-rose-700' : 'font-semibold text-emerald-700'}>
                  {report.summary.wageCeilingExceededCount > 0 ? `${report.summary.wageCeilingExceededCount} flag` : 'OK'}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-sans text-slate-600">DOE Exit Mark</span>
                <span className={report.summary.exitNotMarkedCount > 0 ? 'font-bold text-amber-700' : 'font-semibold text-emerald-700'}>
                  {report.summary.exitNotMarkedCount > 0 ? `${report.summary.exitNotMarkedCount} flag` : 'OK'}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-sans text-slate-600">Name Match</span>
                <span className="font-semibold text-slate-700">
                  {report.summary.nameMismatchResolvedCount} EPFO
                </span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'ALL', label: `All (${report.summary.eligibleForEcrCount})` },
                  {
                    id: 'FAILED',
                    label: `Issues (${report.summary.failedCount + report.summary.warningOnlyCount})`,
                  },
                  { id: 'PASSED', label: `Clean (${report.summary.includedInFinalFileCount})` },
                  { id: 'EXCLUDED', label: `Excluded (${report.summary.excludedCount})` },
                ] as { id: RowFilterTab; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold font-mono tabular-nums border transition-colors ${
                    filterTab === tab.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDownloadErrorReport}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <FileText size={14} />
              <span>Download Error Report (.txt)</span>
            </button>
          </div>

          {/* Member Rows & Human-Readable Diagnostics */}
          <div className="space-y-3">
            {displayedRows.map(row => {
              const isSaving = savingWorkerId === row.workerId;
              return (
                <div
                  key={row.workerId}
                  className={`p-4 rounded-xl border transition-colors ${
                    row.hasBlockingError && !row.isExcluded
                      ? 'border-rose-300 bg-rose-50/30'
                      : row.isExcluded
                      ? 'border-slate-200 bg-slate-50/80 opacity-85'
                      : row.status === 'WARNING_ONLY'
                      ? 'border-amber-300 bg-amber-50/30'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h4 className="text-sm font-bold text-slate-900">
                          {row.payrollName}
                        </h4>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs font-mono tabular-nums text-slate-700">
                          UAN {row.uan || 'UNSEEDED'} ({row.uanStatus})
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        {renderStatusLabel(row)}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
                        <span>
                          ECR Name: <strong className="text-slate-900">{row.ecrMemberNameUsed}</strong>{' '}
                          <span className="font-sans text-slate-500">
                            ({row.nameSource === 'EPFO_RECORD'
                              ? 'Using EPFO UAN Record'
                              : row.nameSource === 'LEGAL_OVERRIDE'
                              ? 'Legal Name Change Override'
                              : 'Matches EPFO'})
                          </span>
                        </span>
                        <span>Gross ₹{row.numbers.grossWages.toLocaleString('en-IN')}</span>
                        <span>EPF Wage ₹{row.numbers.epfWages.toLocaleString('en-IN')}</span>
                        <span>EE ₹{row.numbers.eeShare.toLocaleString('en-IN')}</span>
                        <span>EPS ₹{row.numbers.epsShare.toLocaleString('en-IN')}</span>
                        <span>ER ₹{row.numbers.erEpfShare.toLocaleString('en-IN')}</span>
                        <span>NCP {row.numbers.ncpDays}d</span>
                      </div>
                    </div>

                    {/* Exclude / Include toggle */}
                    <button
                      type="button"
                      onClick={() => toggleExcludeWorker(row.workerId)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shrink-0 ${
                        row.isExcluded
                          ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {row.isExcluded ? 'Include Back in Batch' : 'Exclude for Supplementary'}
                    </button>
                  </div>

                  {/* Detailed EPFO Issues & Quick Fixes */}
                  {row.issues.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                      {row.issues.map((issue, idx) => (
                        <div
                          key={`${row.workerId}-${issue.code}-${idx}`}
                          className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            issue.severity === 'BLOCK'
                              ? 'border-rose-200 bg-white text-rose-950'
                              : issue.severity === 'WARNING'
                              ? 'border-amber-200 bg-white text-amber-950'
                              : 'border-slate-200 bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {issue.severity === 'BLOCK' ? (
                              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                            ) : issue.severity === 'WARNING' ? (
                              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                            ) : (
                              <Info size={15} className="text-slate-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="font-semibold">
                                <span className="font-mono tabular-nums text-[11px] mr-1.5 text-slate-500">
                                  [{issue.epfoPortalCode}]
                                </span>
                                {issue.title}
                              </div>
                              <p className="text-slate-600 mt-0.5">{issue.message}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Fix: {issue.remediationHint}
                              </p>
                            </div>
                          </div>

                          {/* Remediation Action Controls */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {issue.canVerifyKyc && (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  persistWorkerUpdate(
                                    row.workerId,
                                    {
                                      epfoKyc: {
                                        aadhaarApproved: true,
                                        bankApproved: true,
                                        panApproved: true,
                                        verifiedAt: new Date().toISOString().slice(0, 10),
                                      },
                                    },
                                    `Marked Aadhaar & Bank KYC approved for ${row.payrollName}`
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] flex items-center gap-1 disabled:opacity-50"
                              >
                                <UserCheck size={13} />
                                <span>Mark Aadhaar &amp; Bank KYC Approved</span>
                              </button>
                            )}

                            {issue.code === 'INACTIVE_UAN' && (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  persistWorkerUpdate(
                                    row.workerId,
                                    { epfoUanStatus: 'ACTIVE' },
                                    `Updated UAN status to ACTIVE for ${row.payrollName}`
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] disabled:opacity-50"
                              >
                                Set UAN Active
                              </button>
                            )}

                            {issue.canAutoCapWage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setForceCapIds(prev => new Set(prev).add(row.workerId));
                                    toast.success(
                                      `Capped EPF Wage for ${row.payrollName} at ₹${statutoryCeiling.toLocaleString('en-IN')}`
                                    );
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px]"
                                >
                                  Cap at ₹{statutoryCeiling.toLocaleString('en-IN')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmHigherWageIds(prev => new Set(prev).add(row.workerId));
                                    toast.success(
                                      `Confirmed Para 26(6) higher PF contribution for ${row.payrollName}`
                                    );
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-[11px]"
                                >
                                  Allow Para 26(6) Higher PF
                                </button>
                              </>
                            )}

                            {issue.canMarkDoeDone && (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  persistWorkerUpdate(
                                    row.workerId,
                                    {
                                      epfoExitMarked: true,
                                      epfoExitMarkedDate:
                                        row.dateOfExit || new Date().toISOString().slice(0, 10),
                                    },
                                    `Confirmed EPFO Date of Exit marked for ${row.payrollName}`
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] disabled:opacity-50"
                              >
                                Confirm DOE Marked in EPFO
                              </button>
                            )}

                            {issue.canOverrideName && (
                              <div className="flex items-center gap-1.5">
                                {row.nameSource !== 'LEGAL_OVERRIDE' ? (
                                  <>
                                    <input
                                      type="text"
                                      placeholder="Gazette / Aadhaar ref"
                                      value={legalNameRefDraft[row.workerId] || ''}
                                      onChange={e =>
                                        setLegalNameRefDraft(prev => ({
                                          ...prev,
                                          [row.workerId]: e.target.value,
                                        }))
                                      }
                                      className="w-36 px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px]"
                                    />
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() =>
                                        persistWorkerUpdate(
                                          row.workerId,
                                          {
                                            epfoNameOverrideApproved: true,
                                            epfoNameChangeLegalRef:
                                              legalNameRefDraft[row.workerId] ||
                                              'Legal Name Change Verified',
                                          },
                                          `Approved legal name change override for ${row.payrollName}`
                                        )
                                      }
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-[11px] disabled:opacity-50"
                                    >
                                      Legal Name Override
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() =>
                                      persistWorkerUpdate(
                                        row.workerId,
                                        {
                                          epfoNameOverrideApproved: false,
                                          epfoNameChangeLegalRef: '',
                                        },
                                        `Reverted to exact EPFO UAN name (${row.epfoRegisteredName})`
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-[11px] flex items-center gap-1 disabled:opacity-50"
                                  >
                                    <RefreshCw size={12} />
                                    <span>Use EPFO Name</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Ready: <strong className="text-slate-900">{report.summary.includedInFinalFileCount}</strong>{' '}
            / {report.summary.eligibleForEcrCount} eligible
            {report.summary.failedCount > 0 && (
              <span className="text-rose-700 font-sans ml-2">
                ({report.summary.failedCount} blocked member(s) automatically omitted from download)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!report.canDownloadEcr}
              onClick={handleDownloadCleanEcr}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <Download size={14} />
              <span>
                {mode === 'SUPPLEMENTARY'
                  ? `Download Supplementary ECR (${report.summary.includedInFinalFileCount})`
                  : `Generate Clean ECR .txt (${report.summary.includedInFinalFileCount})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
